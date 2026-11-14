"""Short-term memory management for conversation history, working state, and tool outputs."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.providers.llm.base import ChatMessage, MessageRole
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)

_DEFAULT_PROMPT_BUDGET_TOKENS = 32000
_DEFAULT_MAX_HISTORY_TOKENS = 24000
_MIN_HISTORY_TOKENS = 4000
_CHARS_PER_TOKEN_ESTIMATE = 4
_DEFAULT_MIN_RECENT_MESSAGES = 6
_DEFAULT_KEEP_RECENT = 6
_DEFAULT_MAX_TOOL_OUTPUT_CHARS = 12000

_HTML_NOISE_RE = re.compile(r"<(script|style|svg)\b[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")

_SUMMARY_SYSTEM_PROMPT = (
    "You are a concise conversation memory compressor. Merge the previous summary "
    "(if any) with the newly aged messages into a compact, factual summary. "
    "Preserve user goals, constraints, decisions, discovered identifiers/table names, "
    "and unresolved questions. Omit small talk and verbose tool dumps. "
    "Write in plain bullet points under 1200 characters."
)


def estimate_message_tokens(text: str | None) -> int:
    """Estimates token count for a message using a fast character heuristic (~4 chars/token).

    Args:
        text (str | None): Message text content.

    Returns:
        int: Estimated token count including per-message framing overhead.
    """
    return (len(text or "") // _CHARS_PER_TOKEN_ESTIMATE) + 4


def estimate_messages_tokens(messages: list[ChatMessage], chat_model: Any | None = None) -> int:
    """Estimates total tokens for ChatMessages, using LangChain's tokenizer when available.

    Args:
        messages (list[ChatMessage]): Conversation messages to measure.
        chat_model (Any | None, optional): Optional LangChain `BaseChatModel` exposing
            `get_num_tokens_from_messages`. Defaults to None.

    Returns:
        int: Estimated total token count across all messages.
    """
    if not messages:
        return 0
    if chat_model is not None and hasattr(chat_model, "get_num_tokens_from_messages"):
        try:
            lc_msgs: list[BaseMessage] = []
            for m in messages:
                if m.role == MessageRole.SYSTEM:
                    lc_msgs.append(SystemMessage(content=m.content))
                elif m.role == MessageRole.ASSISTANT:
                    lc_msgs.append(AIMessage(content=m.content))
                else:
                    lc_msgs.append(HumanMessage(content=m.content))
            count = int(chat_model.get_num_tokens_from_messages(lc_msgs))
            if count > 0:
                return count
        except Exception:
            pass
    return sum(estimate_message_tokens(m.content) for m in messages)


def estimate_tools_tokens(tools: list[Any] | None) -> int:
    """Estimates the prompt token overhead of bound tool names, descriptions, and JSON schemas.

    Args:
        tools (list[Any] | None): Bound StructuredTool or tool definition objects.

    Returns:
        int: Estimated token count consumed by tool declarations.
    """
    if not tools:
        return 0
    total_chars = 0
    for tool in tools:
        total_chars += len(str(getattr(tool, "name", "")))
        total_chars += len(str(getattr(tool, "description", "")))
        schema = getattr(tool, "args_schema", None)
        if isinstance(schema, type) and issubclass(schema, BaseModel):
            total_chars += len(json.dumps(schema.model_json_schema(), separators=(",", ":")))
    return (total_chars // _CHARS_PER_TOKEN_ESTIMATE) + (len(tools) * 12)


def resolve_history_token_budget(
    model_name: str | None = None,
    system_prompt: str | None = None,
    tools: list[Any] | None = None,
    request_messages: list[ChatMessage] | None = None,
    working_state: dict[str, Any] | None = None,
    max_output_tokens: int | None = None,
    prompt_budget_tokens: int = _DEFAULT_PROMPT_BUDGET_TOKENS,
) -> int:
    """Computes the short-term history token budget after reserving fixed prompt overhead.

    Args:
        model_name (str | None, optional): Unused placeholder kept for call-site compatibility.
        system_prompt (str | None, optional): Sanctuarized base system instructions.
        tools (list[Any] | None, optional): Bound tools whose schemas consume prompt tokens.
        request_messages (list[ChatMessage] | None, optional): Incoming turn messages.
        working_state (dict[str, Any] | None, optional): Structured session working state.
        max_output_tokens (int | None, optional): Requested max completion tokens.
        prompt_budget_tokens (int, optional): Fixed total input token budget before compression.
            Defaults to 32000.

    Returns:
        int: Token budget available for historical messages before triggering compression.
    """
    _ = model_name
    fixed_tokens = estimate_message_tokens(system_prompt)
    fixed_tokens += estimate_tools_tokens(tools)
    fixed_tokens += sum(estimate_message_tokens(m.content) for m in (request_messages or []))
    if working_state:
        fixed_tokens += estimate_message_tokens(
            json.dumps(working_state, separators=(",", ":"), ensure_ascii=False)
        )
    reserve_output = min(max_output_tokens or 4096, 8192)
    available = prompt_budget_tokens - fixed_tokens - reserve_output
    return max(_MIN_HISTORY_TOKENS, available)


def _to_compact_tabular_json(rows: list[dict[str, Any]], max_chars: int) -> str | None:
    """Converts a list of JSON objects into a compact column/row structure without key repetition.

    Args:
        rows (list[dict[str, Any]]): Parsed JSON list of dictionary records.
        max_chars (int): Maximum allowed output character length.

    Returns:
        str | None: Compact tabular JSON string if applicable, else None.
    """
    if len(rows) < 2 or not all(isinstance(r, dict) for r in rows):
        return None

    columns: list[str] = []
    seen_cols: set[str] = set()
    for row in rows:
        for key in row:
            key_str = str(key)
            if key_str not in seen_cols:
                seen_cols.add(key_str)
                columns.append(key_str)

    if not columns:
        return None

    compact_rows: list[list[Any]] = []
    truncated = False
    for row in rows:
        candidate_row = [row.get(col) for col in columns]
        compact_rows.append(candidate_row)
        payload = {
            "columns": columns,
            "total_rows": len(rows),
            "rows": compact_rows,
        }
        if truncated:
            payload["truncated_rows"] = True
        serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=str)
        if len(serialized) > max_chars:
            compact_rows.pop()
            truncated = True
            break

    final_payload: dict[str, Any] = {
        "columns": columns,
        "total_rows": len(rows),
        "rows": compact_rows,
    }
    if truncated:
        final_payload["truncated_rows"] = True
        final_payload["note"] = (
            f"Showing {len(compact_rows)} of {len(rows)} rows; use more specific query/filter."
        )
    return json.dumps(final_payload, separators=(",", ":"), ensure_ascii=False, default=str)


def compress_tool_output(
    raw_output: str,
    max_chars: int = _DEFAULT_MAX_TOOL_OUTPUT_CHARS,
) -> str:
    """Structurally compresses a tool output to preserve essential facts within `max_chars`.

    Converts lists of JSON objects into compact column/row tables, minifies JSON objects,
    strips noisy HTML tags/whitespace, and enforces the `max_chars` ceiling.

    Args:
        raw_output (str): Raw string returned by a builtin or MCP tool.
        max_chars (int, optional): Maximum characters retained. Defaults to 12000.

    Returns:
        str: Structurally compressed tool output within `max_chars`.
    """
    stripped = raw_output.strip()
    if stripped.startswith(("{", "[")):
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                tabular = _to_compact_tabular_json(parsed, max_chars=max_chars)
                if tabular is not None:
                    stripped = tabular
                else:
                    stripped = json.dumps(
                        parsed, separators=(",", ":"), ensure_ascii=False, default=str
                    )
            elif isinstance(parsed, dict):
                stripped = json.dumps(
                    parsed, separators=(",", ":"), ensure_ascii=False, default=str
                )
        except Exception:
            pass
    else:
        # [Compression] Strip noisy script/style/svg blocks and collapse redundant whitespace
        stripped = _HTML_NOISE_RE.sub("", stripped)
        stripped = _MULTI_SPACE_RE.sub(" ", stripped)
        stripped = _MULTI_NEWLINE_RE.sub("\n\n", stripped).strip()

    if len(stripped) <= max_chars:
        return stripped
    omitted = len(stripped) - max_chars
    return (
        f"{stripped[:max_chars]}\n"
        f"... [truncated {omitted} chars; use a more specific query, filter, or range]"
    )


def build_short_term_context(
    historical_messages: list[ChatMessage],
    request_messages: list[ChatMessage],
    rolling_summary: str | None = None,
    summary_message_count: int = 0,
    working_state: dict[str, Any] | None = None,
    max_history_tokens: int = _DEFAULT_MAX_HISTORY_TOKENS,
    min_recent_messages: int = _DEFAULT_MIN_RECENT_MESSAGES,
) -> list[ChatMessage]:
    """Assembles a bounded short-term conversation context from summary, state, and recent turns.

    Args:
        historical_messages (list[ChatMessage]): All persisted messages in the session.
        request_messages (list[ChatMessage]): Incoming messages from the current request.
        rolling_summary (str | None, optional): Persisted summary of older messages.
        summary_message_count (int, optional): Number of earliest historical messages already
            covered by `rolling_summary`. Defaults to 0.
        working_state (dict[str, Any] | None, optional): Isolated structured session state
            injected verbatim outside narrative summaries.
        max_history_tokens (int, optional): Token budget allocated to unsummarized history.
            Defaults to 24000.
        min_recent_messages (int, optional): Minimum number of latest historical messages to
            retain verbatim when available. Defaults to 6.

    Returns:
        list[ChatMessage]: Ordered context list combining optional rolling summary, working
            state, bounded recent history, and incoming request messages.
    """
    covered = max(0, min(summary_message_count, len(historical_messages)))
    unsummarized = historical_messages[covered:]

    # [Sliding Window] Select recent unsummarized messages from newest backward within token budget
    selected_reversed: list[ChatMessage] = []
    used_tokens = 0
    for msg in reversed(unsummarized):
        msg_tokens = estimate_message_tokens(msg.content)
        within_budget = used_tokens + msg_tokens <= max_history_tokens
        must_keep_recent = len(selected_reversed) < min_recent_messages
        if not within_budget and not must_keep_recent:
            break
        selected_reversed.append(msg)
        used_tokens += msg_tokens

    selected_history = list(reversed(selected_reversed))
    context: list[ChatMessage] = []

    if rolling_summary and rolling_summary.strip():
        context.append(
            ChatMessage(
                role=MessageRole.SYSTEM,
                content=(
                    f"<conversation_summary>\n{rolling_summary.strip()}\n</conversation_summary>"
                ),
            )
        )

    if working_state:
        serialized_state = json.dumps(working_state, separators=(",", ":"), ensure_ascii=False)
        context.append(
            ChatMessage(
                role=MessageRole.SYSTEM,
                content=f"<working_state>\n{serialized_state}\n</working_state>",
            )
        )

    context.extend(selected_history)
    context.extend(request_messages)
    return context


def extract_working_state_updates(
    recorded_steps: list[dict[str, Any]],
    existing_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deterministically updates structured session state from verified tool execution traces.

    Args:
        recorded_steps (list[dict[str, Any]]): Trace events emitted during the current turn.
        existing_state (dict[str, Any] | None, optional): Existing persisted working state.

    Returns:
        dict[str, Any]: Updated bounded working state dictionary.
    """
    state: dict[str, Any] = dict(existing_state or {})
    verified_tools = list(state.get("verified_tools") or [])
    recent_errors = list(state.get("recent_tool_errors") or [])
    last_outputs = dict(state.get("last_tool_outputs") or {})

    changed = False
    for step in recorded_steps:
        if step.get("type") != "tool_end":
            continue
        changed = True
        tool_name = str(step.get("tool_name") or "")
        ok = bool(step.get("ok"))
        output_preview = str(step.get("output") or "").strip()[:160]
        if ok and tool_name:
            if tool_name not in verified_tools:
                verified_tools.append(tool_name)
            if output_preview:
                last_outputs[tool_name] = output_preview
        elif tool_name and output_preview:
            err_entry = f"{tool_name}: {output_preview}"
            if err_entry not in recent_errors:
                recent_errors.append(err_entry)

    if not changed:
        return state

    # [Bounds] Keep structured state compact so it never bloats the prompt
    state["verified_tools"] = verified_tools[-15:]
    state["recent_tool_errors"] = recent_errors[-5:]
    if len(last_outputs) > 8:
        trimmed_keys = list(last_outputs.keys())[-8:]
        last_outputs = {k: last_outputs[k] for k in trimmed_keys}
    state["last_tool_outputs"] = last_outputs
    return state


def compact_old_tool_observations(
    messages: list[BaseMessage],
    keep_recent_tool_rounds: int = 1,
    max_stale_chars: int = 250,
) -> list[BaseMessage]:
    """Compacts ToolMessages from earlier tool rounds to keep working memory sharp.

    Args:
        messages (list[BaseMessage]): Active LangChain message list in `run_agent_tool_loop`.
        keep_recent_tool_rounds (int, optional): Number of most recent tool-calling assistant
            rounds whose ToolMessages remain verbatim. Defaults to 1.
        max_stale_chars (int, optional): Maximum characters kept for older ToolMessages.
            Defaults to 250.

    Returns:
        list[BaseMessage]: New message list with stale bulky tool outputs compacted.
    """
    if keep_recent_tool_rounds <= 0:
        cutoff_idx = len(messages)
    else:
        tool_round_indices = [
            idx
            for idx, msg in enumerate(messages)
            if isinstance(msg, AIMessage) and bool(getattr(msg, "tool_calls", None))
        ]
        if len(tool_round_indices) <= keep_recent_tool_rounds:
            return list(messages)
        cutoff_idx = tool_round_indices[-keep_recent_tool_rounds]

    compacted: list[BaseMessage] = []
    for idx, msg in enumerate(messages):
        if (
            idx < cutoff_idx
            and isinstance(msg, ToolMessage)
            and isinstance(msg.content, str)
            and len(msg.content) > max_stale_chars
        ):
            # [Working Memory] Retain compact preview of stale tool outputs after turn processing
            trimmed = (
                f"{msg.content[:max_stale_chars]}\n"
                "...[older tool observation compacted to preserve working memory]"
            )
            compacted.append(
                ToolMessage(
                    content=trimmed,
                    tool_call_id=msg.tool_call_id,
                    name=getattr(msg, "name", None),
                )
            )
        else:
            compacted.append(msg)
    return compacted


def _extract_summary_text(response: Any) -> str:
    """Normalizes plain text from either a LangChain AIMessage or provider GenerationResult.

    Args:
        response (Any): Model response returned by `ainvoke` or `generate`.

    Returns:
        str: Extracted plain-text summary string.
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


async def maybe_update_rolling_summary(
    session_id: str,
    db: Session,
    provider: Any,
    max_history_tokens: int = _DEFAULT_MAX_HISTORY_TOKENS,
    keep_recent: int = _DEFAULT_KEEP_RECENT,
) -> str | None:
    """Incrementally compresses aged session messages once the short-term window budget is exceeded.

    Args:
        session_id (str): Target conversation session UUID string.
        db (Session): Active SQLAlchemy database session.
        provider (Any): Configured LLM provider instance used to generate the summary.
        max_history_tokens (int, optional): Token window budget matching
            `build_short_term_context`; summarization triggers only when unsummarized
            messages exceed this budget. Defaults to 24000.
        keep_recent (int, optional): Number of newest messages left verbatim outside the
            summary. Defaults to 6.

    Returns:
        str | None: Updated rolling summary text if compression ran, else None.
    """
    service = SessionService(db)
    session = service.get_session(session_id)
    messages = list(session.messages)
    total = len(messages)
    covered = max(0, min(session.summary_message_count or 0, total))
    unsummarized = messages[covered:]

    unsummarized_tokens = sum(estimate_message_tokens(m.content) for m in unsummarized)
    if unsummarized_tokens <= max_history_tokens:
        return None

    new_covered = total - keep_recent
    if new_covered <= covered:
        return None

    to_fold = messages[covered:new_covered]
    transcript_lines = [
        f"[{m.role}]: {(m.content or '').strip()[:1500]}"
        for m in to_fold
        if (m.content or "").strip()
    ]
    if not transcript_lines:
        return None

    existing_block = (
        f"Previous summary:\n{session.rolling_summary.strip()}\n\n"
        if session.rolling_summary and session.rolling_summary.strip()
        else ""
    )
    user_prompt = f"{existing_block}New messages to fold into the summary:\n" + "\n".join(
        transcript_lines
    )

    try:
        chat_model = getattr(provider, "chat_model", None)
        if chat_model is not None and hasattr(chat_model, "ainvoke"):
            raw_resp = await chat_model.ainvoke(
                [SystemMessage(content=_SUMMARY_SYSTEM_PROMPT), HumanMessage(content=user_prompt)]
            )
            summary_text = _extract_summary_text(raw_resp)
        elif hasattr(provider, "generate"):
            gen_resp = await provider.generate(
                messages=[ChatMessage(role=MessageRole.USER, content=user_prompt)],
                system_instruction=_SUMMARY_SYSTEM_PROMPT,
                temperature=0.2,
                max_tokens=400,
            )
            summary_text = _extract_summary_text(gen_resp)
        else:
            return None
    except Exception as exc:
        logger.warning(f"[ShortTermMemory] Rolling summary generation failed: {exc}")
        return None

    if not summary_text:
        return None

    service.update_rolling_summary(session_id, summary_text, new_covered)
    logger.info(
        f"[ShortTermMemory] Updated rolling summary for session_id='{session_id}' "
        f"(covered {covered} -> {new_covered} of {total} messages)"
    )
    return summary_text
