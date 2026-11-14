"""Long-term memory formatting and incremental turn consolidation across sessions."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.models.entities import AgentMemory
from app.providers.llm.base import ChatMessage, MessageRole
from app.services.memory_service import MemoryService

logger = logging.getLogger(__name__)

_DEFAULT_MEMORY_BLOCK_MAX_CHARS = 2400
_MIN_USER_CHARS_FOR_EXTRACTION = 20

_CONSOLIDATION_SYSTEM_PROMPT = (
    "You manage persistent long-term memory for an AI assistant. "
    "Analyze the latest turn and existing memories, then return ONLY a JSON array of memory "
    "operations for genuinely durable facts, user preferences, session outcomes, or tool lessons. "
    "Skip ephemeral small talk or one-off answers. "
    'Each item must follow: {"op":"ADD"|"UPDATE"|"DELETE"|"NOOP", '
    '"id":"<existing_id_if_update_or_delete>", '
    '"type":"semantic"|"episodic"|"procedural", '
    '"content":"<concise 1-sentence fact>", '
    '"tags":["keyword1","keyword2"], "importance":0.1_to_1.0}. '
    "Return [] if nothing durable should be stored."
)

_JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)
_DURABLE_SIGNAL_RE = re.compile(
    r"\b(toujours|jamais|préfère|prefere|retiens|souviens|mon nom|notre projet|"
    r"always|never|prefer|remember|my name|our project|schema|database|table)\b",
    re.IGNORECASE,
)


def format_long_term_memory_block(
    memories: list[AgentMemory],
    max_chars: int = _DEFAULT_MEMORY_BLOCK_MAX_CHARS,
) -> str | None:
    """Formats retrieved long-term memories into a bounded prompt block.

    Args:
        memories (list[AgentMemory]): Ranked memories retrieved for the active turn.
        max_chars (int, optional): Maximum character budget for the injected block.
            Defaults to 2400.

    Returns:
        str | None: Delimited `<long_term_memory>` prompt block, or None when empty.
    """
    if not memories:
        return None

    header = (
        "<long_term_memory>\n"
        "Historical cross-session memory hints (verify mutable live state with tools if needed):\n"
    )
    footer = "\n</long_term_memory>"
    budget = max_chars - len(header) - len(footer)
    if budget <= 0:
        return None

    lines: list[str] = []
    used = 0
    for mem in memories:
        line = f"- [{mem.memory_type}] {mem.content.strip()}"
        if used + len(line) + 1 > budget:
            break
        lines.append(line)
        used += len(line) + 1

    if not lines:
        return None
    return header + "\n".join(lines) + footer


def _extract_response_text(response: Any) -> str:
    """Extracts plain text from a LangChain AIMessage or provider GenerationResult.

    Args:
        response (Any): Raw model response object.

    Returns:
        str: Plain-text response string.
    """
    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            str(block.get("text", ""))
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "".join(parts).strip()
    return str(response or "").strip()


def _parse_operations(raw_text: str) -> list[dict[str, Any]]:
    """Parses JSON memory consolidation operations from model output safely.

    Args:
        raw_text (str): Raw text returned by the consolidation LLM call.

    Returns:
        list[dict[str, Any]]: Parsed operation dictionaries, or empty list on failure.
    """
    match = _JSON_ARRAY_RE.search(raw_text or "")
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
        return (
            [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
        )
    except Exception:
        return []


def should_run_llm_consolidation(
    user_text: str,
    tool_events: list[dict[str, Any]],
    message_count: int = 0,
    batch_cadence: int = 4,
) -> bool:
    """Determines whether a turn warrants an LLM memory consolidation call.

    Args:
        user_text (str): Latest user message text.
        tool_events (list[dict[str, Any]]): Tool completion events from the turn.
        message_count (int, optional): Total persisted messages in the session. Defaults to 0.
        batch_cadence (int, optional): Periodic turn cadence for batch consolidation. Defaults to 4.

    Returns:
        bool: True when durable signals, tool executions, or batch cadence warrant consolidation.
    """
    stripped = user_text.strip()
    if len(stripped) < _MIN_USER_CHARS_FOR_EXTRACTION and not tool_events:
        return False
    if tool_events or _DURABLE_SIGNAL_RE.search(stripped):
        return True
    if message_count > 0 and (message_count // 2) % max(1, batch_cadence) == 0:
        return True
    return False


def _promote_deterministic_procedural_memories(
    service: MemoryService,
    agent_id: str | None,
    session_id: str,
    tool_events: list[dict[str, Any]],
    existing: list[AgentMemory],
) -> int:
    """Promotes verified tool recovery lessons deterministically with zero LLM cost.

    Args:
        service (MemoryService): Active memory persistence service.
        agent_id (str | None): Active Agent UUID.
        session_id (str): Current conversation session UUID.
        tool_events (list[dict[str, Any]]): `tool_end` trace events from the turn.
        existing (list[AgentMemory]): Candidate existing memories for deduplication.

    Returns:
        int: Number of deterministic procedural memories created.
    """
    failed_tools: set[str] = set()
    recovered_tools: list[str] = []
    for evt in tool_events:
        t_name = str(evt.get("tool_name") or "").strip()
        if not t_name:
            continue
        if evt.get("ok"):
            if t_name in failed_tools and t_name not in recovered_tools:
                recovered_tools.append(t_name)
        else:
            failed_tools.add(t_name)

    existing_contents = {m.content.lower() for m in existing}
    created = 0
    for t_name in recovered_tools[:2]:
        lesson = (
            f"Tool '{t_name}' requires strict schema adherence; validate parameters "
            "before calling after initial failure."
        )
        if lesson.lower() not in existing_contents:
            service.create_memory(
                content=lesson,
                memory_type="procedural",
                agent_id=agent_id,
                source_session_id=session_id,
                tags=[t_name.lower(), "tool", "recovery"],
                importance=0.65,
            )
            created += 1
    return created


async def consolidate_turn_memories(
    session_id: str,
    agent_id: str | None,
    user_text: str,
    assistant_text: str,
    recorded_steps: list[dict[str, Any]] | None,
    db: Session,
    provider: Any,
    message_count: int = 0,
) -> int:
    """Extracts and consolidates durable long-term memories (`ADD`/`UPDATE`/`DELETE`) after a turn.

    Args:
        session_id (str): Current conversation session UUID.
        agent_id (str | None): Active Agent UUID scoping the memories.
        user_text (str): Latest user message text.
        assistant_text (str): Final assistant response text.
        recorded_steps (list[dict[str, Any]] | None): Tool execution trace events from the turn.
        db (Session): Active SQLAlchemy database session.
        provider (Any): Configured LLM provider instance.
        message_count (int, optional): Total persisted messages in the session for batch cadence.

    Returns:
        int: Number of memory write operations (`ADD`, `UPDATE`, `DELETE`) applied.
    """
    tool_events = [s for s in (recorded_steps or []) if s.get("type") == "tool_end"]
    if not should_run_llm_consolidation(user_text, tool_events, message_count=message_count):
        return 0

    service = MemoryService(db)
    query_context = (
        f"{user_text.strip()[:400]} {' '.join(str(s.get('tool_name') or '') for s in tool_events)}"
    )
    existing = service.find_candidate_memories_for_update(
        agent_id=agent_id, query_text=query_context, limit=10
    )
    applied = _promote_deterministic_procedural_memories(
        service=service,
        agent_id=agent_id,
        session_id=session_id,
        tool_events=tool_events,
        existing=existing,
    )
    existing_json = json.dumps(
        [{"id": m.id, "type": m.memory_type, "content": m.content} for m in existing],
        ensure_ascii=False,
    )
    tool_summary = "\n".join(
        f"- {s.get('tool_name')} ok={s.get('ok')} output={str(s.get('output') or '')[:200]}"
        for s in tool_events[:8]
    )
    user_prompt = (
        f"Existing memories:\n{existing_json}\n\n"
        f"Latest turn:\n[user]: {user_text.strip()[:1500]}\n"
        f"[assistant]: {assistant_text.strip()[:1500]}\n"
        + (f"Tool traces:\n{tool_summary}" if tool_summary else "")
    )

    try:
        chat_model = getattr(provider, "chat_model", None)
        if chat_model is not None and hasattr(chat_model, "ainvoke"):
            raw_resp = await chat_model.ainvoke(
                [
                    SystemMessage(content=_CONSOLIDATION_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ]
            )
            raw_text = _extract_response_text(raw_resp)
        elif hasattr(provider, "generate"):
            gen_resp = await provider.generate(
                messages=[ChatMessage(role=MessageRole.USER, content=user_prompt)],
                system_instruction=_CONSOLIDATION_SYSTEM_PROMPT,
                temperature=0.1,
                max_tokens=500,
            )
            raw_text = _extract_response_text(gen_resp)
        else:
            return applied
    except Exception as exc:
        logger.warning(f"[LongTermMemory] Consolidation failed: {exc}")
        return applied

    ops = _parse_operations(raw_text)
    existing_ids = {m.id for m in existing}
    valid_types = {"semantic", "episodic", "procedural"}

    for item in ops[:5]:
        op = str(item.get("op") or "").upper()
        if op == "NOOP":
            continue
        mem_type = str(item.get("type") or "semantic").lower()
        if mem_type not in valid_types:
            mem_type = "semantic"
        content = str(item.get("content") or "").strip()
        raw_tags = item.get("tags")
        tags: list[str] = [str(t) for t in raw_tags] if isinstance(raw_tags, list) else []
        raw_imp = item.get("importance", 0.5)
        importance = float(raw_imp) if isinstance(raw_imp, (int, float)) else 0.5

        if op == "ADD" and content:
            service.create_memory(
                content=content,
                memory_type=mem_type,
                agent_id=agent_id,
                source_session_id=session_id,
                tags=tags,
                importance=importance,
            )
            applied += 1
        elif op == "UPDATE" and content:
            target_id = str(item.get("id") or "")
            if target_id in existing_ids:
                service.update_memory(
                    memory_id=target_id,
                    content=content,
                    memory_type=mem_type,
                    tags=tags,
                    importance=importance,
                )
                applied += 1
        elif op == "DELETE":
            target_id = str(item.get("id") or "")
            if target_id in existing_ids:
                service.delete_memory(target_id)
                existing_ids.discard(target_id)
                applied += 1

    if applied:
        logger.info(
            f"[LongTermMemory] Applied {applied} memory operation(s) for agent_id='{agent_id}'"
        )
    return applied
