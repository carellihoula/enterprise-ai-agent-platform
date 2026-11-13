"""LangChain StructuredTool adapters and agent tool-calling loop for builtin and MCP tools."""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import AsyncGenerator
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model
from sqlalchemy.orm import Session

from app.engine.builtin_tools import BUILTIN_TOOLS_REGISTRY, execute_builtin_tool
from app.engine.mcp_client import call_mcp_tool, list_mcp_tool_schemas
from app.models.entities import Agent, McpServer
from app.models.mcp import McpServerPayload
from app.providers.llm.langchain_provider import LangChainModelProvider

logger = logging.getLogger(__name__)

_JSON_TYPE_MAP: dict[str, Any] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "array": list[Any],
    "object": dict[str, Any],
}


def _sanitize_tool_name(raw_name: str) -> str:
    """Normalizes a tool name to satisfy strict provider regex constraints.

    Args:
        raw_name (str): Original tool or server-prefixed identifier.

    Returns:
        str: Sanitized tool name containing only letters, digits, underscores, or hyphens.
    """
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", raw_name)
    return cleaned[:64] or "tool"


def _schema_to_pydantic_model(model_name: str, schema: dict[str, Any]) -> type[BaseModel]:
    """Builds a Pydantic BaseModel dynamically from a JSON Schema object definition.

    Args:
        model_name (str): Name for the generated Pydantic model class.
        schema (dict[str, Any]): JSON Schema dictionary containing `properties` and `required`.

    Returns:
        type[BaseModel]: Dynamically created Pydantic model class.
    """
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required_fields = set(schema.get("required", []) if isinstance(schema, dict) else [])
    field_definitions: dict[str, Any] = {}

    for field_name, prop_def in properties.items():
        if not isinstance(prop_def, dict):
            continue
        json_type = prop_def.get("type")
        py_type: Any = _JSON_TYPE_MAP.get(json_type, Any) if isinstance(json_type, str) else Any
        description = str(prop_def.get("description", ""))
        if field_name in required_fields:
            field_definitions[field_name] = (py_type, Field(..., description=description))
        else:
            default_val = prop_def.get("default", None)
            field_definitions[field_name] = (
                py_type | None,
                Field(default=default_val, description=description),
            )

    return create_model(f"{_sanitize_tool_name(model_name)}Args", **field_definitions)


def build_builtin_structured_tool(tool_name: str) -> StructuredTool | None:
    """Wraps a registered builtin tool as a LangChain StructuredTool.

    Args:
        tool_name (str): Registered name in BUILTIN_TOOLS_REGISTRY.

    Returns:
        StructuredTool | None: LangChain StructuredTool wrapper, or None if unknown.
    """
    tool_def = BUILTIN_TOOLS_REGISTRY.get(tool_name)
    if not tool_def:
        return None

    args_model = _schema_to_pydantic_model(tool_def.name, tool_def.parameters_schema)

    async def _run_builtin(**kwargs: Any) -> str:
        cleaned_args = {k: v for k, v in kwargs.items() if v is not None}
        outcome = await execute_builtin_tool(tool_def.name, cleaned_args)
        return json.dumps(outcome, ensure_ascii=False, default=str)

    return StructuredTool(
        name=tool_def.name,
        description=tool_def.description,
        args_schema=args_model,
        coroutine=_run_builtin,
    )


def _mcp_row_to_payload(row: McpServer) -> McpServerPayload:
    """Converts a persisted McpServer ORM row into an McpServerPayload.

    Args:
        row (McpServer): SQLAlchemy McpServer entity.

    Returns:
        McpServerPayload: Validated MCP server configuration payload.
    """
    return McpServerPayload(
        name=row.name,
        type=row.transport,  # type: ignore[arg-type]
        command=row.command or "",
        args=list(row.args or []),
        env=dict(row.env or {}),
        url=row.url or "",
        headers=dict(row.headers or {}),
        extra=dict(row.extra or {}),
    )


async def build_mcp_structured_tools(server_row: McpServer) -> list[StructuredTool]:
    """Discovers tools from an enabled MCP server and wraps them as StructuredTools.

    Args:
        server_row (McpServer): Persisted MCP server configuration.

    Returns:
        list[StructuredTool]: List of LangChain StructuredTools exposed by the MCP server.
    """
    payload = _mcp_row_to_payload(server_row)
    try:
        schemas = await list_mcp_tool_schemas(payload)
    except Exception as exc:
        logger.warning(f"[MCP Tools] Could not discover tools from '{server_row.name}': {exc}")
        return []

    wrapped: list[StructuredTool] = []
    for item in schemas:
        remote_name = str(item["name"])
        exposed_name = _sanitize_tool_name(f"{server_row.name}__{remote_name}")
        description = str(
            item.get("description") or f"MCP tool '{remote_name}' on '{server_row.name}'"
        )
        input_schema = item.get("inputSchema") or {"type": "object", "properties": {}}
        args_model = _schema_to_pydantic_model(exposed_name, input_schema)

        async def _run_mcp(
            _payload: McpServerPayload = payload,
            _tool_name: str = remote_name,
            **kwargs: Any,
        ) -> str:
            cleaned_args = {k: v for k, v in kwargs.items() if v is not None}
            return await call_mcp_tool(_payload, _tool_name, cleaned_args)

        wrapped.append(
            StructuredTool(
                name=exposed_name,
                description=description,
                args_schema=args_model,
                coroutine=_run_mcp,
            )
        )
    return wrapped


async def build_langchain_tools_for_agent(
    agent: Agent | None,
    db: Session,
) -> list[StructuredTool]:
    """Resolves all enabled builtin and MCP tools attached to an agent.

    Args:
        agent (Agent | None): Target Agent ORM record, or None if no agent is selected.
        db (Session): Active SQLAlchemy database session.

    Returns:
        list[StructuredTool]: Combined list of ready-to-bind LangChain tools.
    """
    if not agent or not agent.tools:
        return []

    resolved_tools: list[StructuredTool] = []
    seen_names: set[str] = set()

    for entry in agent.tools:
        if not isinstance(entry, dict):
            continue
        tool_type = str(entry.get("type", "")).lower().strip()
        tool_name = str(entry.get("name", "")).strip()
        if not tool_name:
            continue

        if tool_type == "builtin":
            st = build_builtin_structured_tool(tool_name)
            if st and st.name not in seen_names:
                resolved_tools.append(st)
                seen_names.add(st.name)
        elif tool_type == "mcp":
            server_row = db.query(McpServer).filter(McpServer.name == tool_name).first()
            if not server_row:
                continue
            mcp_tools = await build_mcp_structured_tools(server_row)
            for mt in mcp_tools:
                if mt.name not in seen_names:
                    resolved_tools.append(mt)
                    seen_names.add(mt.name)

    return resolved_tools


async def _execute_single_tool(
    tool_map: dict[str, StructuredTool],
    tool_call: dict[str, Any],
) -> tuple[str, bool, int]:
    """Executes one tool call requested by an LLM with timing and error isolation.

    Args:
        tool_map (dict[str, StructuredTool]): Lookup table of available StructuredTools.
        tool_call (dict[str, Any]): LangChain tool call dict (`name`, `args`, `id`).

    Returns:
        tuple[str, bool, int]: Tuple of (output_text, ok_flag, latency_ms).
    """
    name = str(tool_call.get("name", ""))
    raw_args = tool_call.get("args") or {}
    args = raw_args if isinstance(raw_args, dict) else {}
    tool = tool_map.get(name)
    if not tool:
        return json.dumps({"error": f"Tool '{name}' is not available."}), False, 0

    start = time.perf_counter()
    try:
        output = await tool.ainvoke(args)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        output_str = str(output)
        logger.info(
            f"[Tool Loop] Executed '{name}' ok=True ({elapsed_ms}ms) args={args} "
            f"preview={output_str[:200]!r}"
        )
        return output_str, True, elapsed_ms
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.warning(f"[Tool Loop] Tool '{name}' failed ({elapsed_ms}ms) args={args}: {exc}")
        return (
            json.dumps(
                {
                    "error": str(exc),
                    "instruction": (
                        "This tool call FAILED. Report the exact error to the user and NEVER "
                        "fabricate results or claim that information came from this tool."
                    ),
                }
            ),
            False,
            elapsed_ms,
        )


_THINK_TAG_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)


def _extract_reasoning_and_clean_text(ai_message: AIMessage) -> tuple[str, str]:
    """Extracts model reasoning/thinking text and returns cleaned answer text.

    Supports provider-specific kwargs (`reasoning_content`, `thinking`), structured
    thinking/reasoning content blocks (Anthropic, Gemini, OpenAI summary), and inline
    `<think>...</think>` tags (DeepSeek, Qwen, Groq, Ollama).

    Args:
        ai_message (AIMessage): LangChain assistant message returned by a model.

    Returns:
        tuple[str, str]: Tuple of `(reasoning_text, cleaned_answer_text)`.
    """
    reasoning_parts: list[str] = []
    extra = getattr(ai_message, "additional_kwargs", None) or {}
    for key in ("reasoning_content", "thinking", "reasoning"):
        val = extra.get(key)
        if isinstance(val, str) and val.strip():
            reasoning_parts.append(val.strip())

    content = getattr(ai_message, "content", None)
    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in ("thinking", "reasoning"):
                txt = block.get("thinking") or block.get("text") or block.get("reasoning")
                if isinstance(txt, str) and txt.strip():
                    reasoning_parts.append(txt.strip())
                summary = block.get("summary")
                if isinstance(summary, list):
                    for s_item in summary:
                        if isinstance(s_item, dict) and isinstance(s_item.get("text"), str):
                            reasoning_parts.append(s_item["text"].strip())

    raw_text = LangChainModelProvider._extract_text_content(content)
    tag_matches = _THINK_TAG_RE.findall(raw_text)
    for m in tag_matches:
        if m.strip():
            reasoning_parts.append(m.strip())

    cleaned_text = _THINK_TAG_RE.sub("", raw_text).strip() if tag_matches else raw_text
    return "\n\n".join(reasoning_parts).strip(), cleaned_text


async def _stream_model_turn(
    model: Any,
    messages: list[BaseMessage],
) -> AsyncGenerator[tuple[str, Any], None]:
    """Streams one model turn token-by-token when supported, falling back to ainvoke.

    Args:
        model (Any): Bound LangChain chat model or runnable.
        messages (list[BaseMessage]): Conversation messages for this turn.

    Yields:
        tuple[str, Any]: Event tuples `("think_delta", str)`, `("token", str)`, or
            the final `("message", AIMessage)` once the turn completes.
    """
    stream_fn = getattr(model, "astream", None)
    if callable(stream_fn):
        stream_iter = stream_fn(messages)
        if hasattr(stream_iter, "__aiter__"):
            agg_chunk: Any = None
            tag_buf = ""
            in_think = False
            async for chunk in stream_iter:
                agg_chunk = chunk if agg_chunk is None else agg_chunk + chunk
                raw_text = LangChainModelProvider._extract_text_content(
                    getattr(chunk, "content", "")
                )
                struct_reasoning = LangChainModelProvider.extract_chunk_reasoning(chunk)
                answer_delta, tag_reasoning, tag_buf, in_think = (
                    LangChainModelProvider.split_think_tags_step(tag_buf, in_think, raw_text)
                )
                combined_reasoning = struct_reasoning + tag_reasoning
                if combined_reasoning:
                    yield ("think_delta", combined_reasoning)
                if answer_delta:
                    yield ("token", answer_delta)

            if tag_buf:
                if in_think:
                    yield ("think_delta", tag_buf)
                else:
                    yield ("token", tag_buf)

            if agg_chunk is not None:
                yield ("message", agg_chunk)
                return

    ai_message = await model.ainvoke(messages)
    if isinstance(ai_message, AIMessage):
        reasoning_text, cleaned_text = _extract_reasoning_and_clean_text(ai_message)
        if reasoning_text:
            yield ("think_delta", reasoning_text)
        if not (getattr(ai_message, "tool_calls", None) or []) and cleaned_text:
            yield ("token", cleaned_text)
    else:
        text = LangChainModelProvider._extract_text_content(getattr(ai_message, "content", ""))
        if text:
            yield ("token", text)
    yield ("message", ai_message)


async def run_agent_tool_loop(
    chat_model: BaseChatModel,
    messages: list[BaseMessage],
    tools: list[StructuredTool],
    max_iterations: int = 10,
) -> AsyncGenerator[dict[str, Any], None]:
    """Runs the LangChain bind_tools loop, yielding token-by-token reasoning, tool events, and tokens.

    Args:
        chat_model (BaseChatModel): Initialized LangChain chat model instance.
        messages (list[BaseMessage]): Full formatted LangChain conversation messages.
        tools (list[StructuredTool]): Bound tools available to the agent.
        max_iterations (int, optional): Safety cap on tool-calling rounds. Defaults to 10.

    Yields:
        dict[str, Any]: Event dictionaries of type `think_delta`, `tool_start`, `tool_end`, or `token`.
    """
    tool_map = {t.name: t for t in tools}
    bound_model = chat_model.bind_tools(tools)
    working_messages = list(messages)
    seen_calls: set[str] = set()

    for _ in range(max_iterations):
        ai_message: Any = None
        buffered_tokens: list[str] = []

        async for kind, payload in _stream_model_turn(bound_model, working_messages):
            if kind == "think_delta":
                yield {"type": "think_delta", "delta": str(payload)}
            elif kind == "token":
                # [Stream UX] Emit tokens immediately; if tool_calls appear we keep text only if no tools
                buffered_tokens.append(str(payload))
                yield {"type": "token", "delta_content": str(payload)}
            elif kind == "message":
                ai_message = payload

        tool_calls = getattr(ai_message, "tool_calls", None) or []
        if not tool_calls:
            return

        working_messages.append(ai_message)
        for tc in tool_calls:
            tc_name = str(tc.get("name", ""))
            tc_args = tc.get("args") or {}
            tc_id = str(tc.get("id") or tc_name)
            call_sig = f"{tc_name}:{json.dumps(tc_args, sort_keys=True, default=str)}"

            yield {
                "type": "tool_start",
                "tool_name": tc_name,
                "arguments": tc_args,
            }

            if call_sig in seen_calls:
                result_str = json.dumps(
                    {
                        "error": (
                            f"Duplicate call to '{tc_name}' with identical arguments skipped. "
                            "Use the previous result or answer the user directly."
                        )
                    }
                )
                ok, latency_ms = False, 0
            else:
                seen_calls.add(call_sig)
                result_str, ok, latency_ms = await _execute_single_tool(tool_map, tc)

            yield {
                "type": "tool_end",
                "tool_name": tc_name,
                "ok": ok,
                "latency_ms": latency_ms,
                "output": result_str[:4000],
            }
            working_messages.append(ToolMessage(content=result_str, tool_call_id=tc_id))

    # [Safety Cap] Instruct model to synthesize a final response from gathered tool results
    working_messages.append(
        HumanMessage(
            content=(
                "Tool call limit reached. Do not call any more tools. "
                "Report ONLY facts, names, and values explicitly present in the tool outputs above. "
                "NEVER invent, guess, or provide placeholder/example names. "
                "If a tool failed or did not return the requested list, state that limitation clearly."
            )
        )
    )
    final_msg = await bound_model.ainvoke(working_messages)
    if isinstance(final_msg, AIMessage):
        final_reasoning, final_text = _extract_reasoning_and_clean_text(final_msg)
        if final_reasoning:
            yield {"type": "think", "text": final_reasoning}
    else:
        final_text = LangChainModelProvider._extract_text_content(getattr(final_msg, "content", ""))
    if not final_text:
        final_text = (
            "Reached the maximum number of tool calls without a final summary. "
            "Check the tool badges or backend logs for details."
        )
    yield {"type": "token", "delta_content": final_text}
