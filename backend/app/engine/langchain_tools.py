"""LangChain StructuredTool adapters and agent tool-calling loop for builtin and MCP tools."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncGenerator
from typing import Any, Literal, cast

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, ValidationError, create_model
from sqlalchemy.orm import Session

from app.engine.builtin_tools import BUILTIN_TOOLS_REGISTRY, execute_builtin_tool
from app.engine.mcp_client import call_mcp_tool, list_mcp_tool_schemas
from app.engine.short_term_memory import compact_old_tool_observations, compress_tool_output
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


def _resolve_json_schema_type(prop_def: dict[str, Any]) -> Any:
    """Resolves a JSON Schema property definition into a typed Python/Pydantic annotation.

    Preserves `enum` values via `Literal`, typed `array` element schemas via `list[T]`,
    and nullable/union `type` or `anyOf` declarations.

    Args:
        prop_def (dict[str, Any]): JSON Schema property definition dictionary.

    Returns:
        Any: Resolved Python typing annotation suitable for `pydantic.create_model`.
    """
    enum_vals = prop_def.get("enum")
    if isinstance(enum_vals, list) and enum_vals:
        hashable = tuple(
            v for v in enum_vals if isinstance(v, str | int | float | bool) or v is None
        )
        if hashable:
            return cast(Any, Literal)[hashable]

    json_type = prop_def.get("type")
    if isinstance(json_type, list):
        non_null = [t for t in json_type if t != "null"]
        if len(non_null) == 1 and isinstance(non_null[0], str):
            base = _resolve_json_schema_type({**prop_def, "type": non_null[0]})
            return base | None if "null" in json_type else base
        return Any

    if json_type == "array":
        items = prop_def.get("items")
        if isinstance(items, dict):
            item_type = _resolve_json_schema_type(items)
            return list[item_type]  # type: ignore[valid-type]
        return list[Any]

    if isinstance(json_type, str):
        return _JSON_TYPE_MAP.get(json_type, Any)

    any_of = prop_def.get("anyOf")
    if isinstance(any_of, list):
        non_null_opts = [
            opt for opt in any_of if isinstance(opt, dict) and opt.get("type") != "null"
        ]
        if len(non_null_opts) == 1:
            base = _resolve_json_schema_type(non_null_opts[0])
            has_null = any(isinstance(opt, dict) and opt.get("type") == "null" for opt in any_of)
            return base | None if has_null else base

    return Any


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
        py_type: Any = _resolve_json_schema_type(prop_def)
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


_MAX_TOOL_OUTPUT_CHARS = 12000


def _truncate_tool_output(text: str, limit: int = _MAX_TOOL_OUTPUT_CHARS) -> str:
    """Bounds oversized tool outputs so large snapshots or payloads do not crowd out context.

    Args:
        text (str): Raw string output returned by a tool.
        limit (int, optional): Maximum character budget for the ToolMessage. Defaults to 12000.

    Returns:
        str: Original text if within limit, or head+tail excerpt with a truncation notice.
    """
    return compress_tool_output(text, max_chars=limit)


def _describe_expected_parameters(tool: StructuredTool) -> dict[str, dict[str, Any]]:
    """Extracts expected parameter names, types, and required flags from a tool's schema.

    Args:
        tool (StructuredTool): LangChain StructuredTool instance.

    Returns:
        dict[str, dict[str, Any]]: Mapping of parameter name to type and required metadata.
    """
    schema_cls = getattr(tool, "args_schema", None)
    fields = getattr(schema_cls, "model_fields", None)
    if not isinstance(fields, dict):
        return {}
    return {
        fname: {
            "required": bool(finfo.is_required()),
            "type": str(getattr(finfo, "annotation", "Any")),
        }
        for fname, finfo in fields.items()
    }


def _extract_tool_error(output_str: str) -> str | None:
    """Detects structured error payloads returned as JSON strings by MCP or builtin tools.

    Args:
        output_str (str): Raw string output returned by a tool invocation.

    Returns:
        str | None: Normalized error summary if an error payload is detected, else None.
    """
    stripped = output_str.lstrip()
    if not stripped.startswith("{"):
        return None
    try:
        parsed = json.loads(stripped)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    err = parsed.get("error")
    if err:
        return (
            json.dumps(err, sort_keys=True, default=str)[:200]
            if isinstance(err, dict)
            else str(err)[:200]
        )
    if parsed.get("isError") is True:
        return stripped[:200]
    return None


def _build_tool_error_payload(tool: StructuredTool, error_msg: str) -> str:
    """Builds a self-correcting JSON error payload including expected tool parameters.

    Args:
        tool (StructuredTool): The tool that failed validation or execution.
        error_msg (str): Error description to surface to the model.

    Returns:
        str: JSON-serialized error object with corrective instructions and schema hints.
    """
    payload: dict[str, Any] = {
        "error": error_msg,
        "instruction": (
            "This tool call FAILED. Check `expected_parameters` below and retry with "
            "corrected arguments or switch to an alternative/discovery tool; NEVER fabricate results."
        ),
    }
    expected_params = _describe_expected_parameters(tool)
    if expected_params:
        payload["expected_parameters"] = expected_params
    return json.dumps(payload)


async def _execute_single_tool(
    tool_map: dict[str, StructuredTool],
    tool_call: dict[str, Any],
) -> tuple[str, bool, int]:
    """Executes one tool call requested by an LLM with local validation, timing, and error isolation.

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
        return (
            json.dumps(
                {
                    "error": f"Tool '{name}' is not available.",
                    "available_tools": sorted(tool_map.keys()),
                }
            ),
            False,
            0,
        )

    # [Action Loop] Pre-validate arguments locally to fail fast before remote/MCP round-trips
    schema = getattr(tool, "args_schema", None)
    if isinstance(schema, type) and issubclass(schema, BaseModel):
        try:
            schema.model_validate(args)
        except ValidationError as exc:
            logger.warning(f"[Tool Loop] Local schema validation failed for '{name}': {exc}")
            return _build_tool_error_payload(tool, f"Invalid arguments: {exc}"), False, 0

    start = time.perf_counter()
    try:
        output = await tool.ainvoke(args)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        output_str = str(output)
        detected_err = _extract_tool_error(output_str)
        if detected_err is not None:
            logger.warning(
                f"[Tool Loop] Tool '{name}' returned error payload ({elapsed_ms}ms) args={args}: {detected_err}"
            )
            return _build_tool_error_payload(tool, output_str), False, elapsed_ms
        logger.info(
            f"[Tool Loop] Executed '{name}' ok=True ({elapsed_ms}ms) args={args} "
            f"preview={output_str[:200]!r}"
        )
        return output_str, True, elapsed_ms
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.warning(f"[Tool Loop] Tool '{name}' failed ({elapsed_ms}ms) args={args}: {exc}")
        return _build_tool_error_payload(tool, str(exc)), False, elapsed_ms


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


def _classify_model_retry(exc: Exception) -> str | None:
    """Classifies transient or recoverable LLM provider errors for turn-level retry.

    Args:
        exc (Exception): Exception raised by the model provider during streaming/invoke.

    Returns:
        str | None: `'transient'` for 429/503 rate/availability errors, `'tool_validation'`
            for malformed tool call errors, or None when non-recoverable.
    """
    err_lower = str(exc).lower()
    if any(tok in err_lower for tok in ("503", "unavailable", "429", "rate limit", "overloaded")):
        return "transient"
    if any(
        tok in err_lower
        for tok in ("tool call validation failed", "<|channel|>", "not in request.tools")
    ):
        return "tool_validation"
    return None


async def _stream_model_turn(
    model: Any,
    messages: list[BaseMessage],
) -> AsyncGenerator[tuple[str, Any], None]:
    """Streams one model turn token-by-token when supported, falling back to ainvoke.

    Includes pre-emission retry handling for transient provider errors (429/503) and
    malformed provider tool-call validation errors.

    Args:
        model (Any): Bound LangChain chat model or runnable.
        messages (list[BaseMessage]): Conversation messages for this turn.

    Yields:
        tuple[str, Any]: Event tuples `("think_delta", str)`, `("token", str)`, or
            the final `("message", AIMessage)` once the turn completes.
    """
    attempt_messages = list(messages)
    max_attempts = 3

    for attempt in range(max_attempts):
        emitted_any = False
        try:
            stream_fn = getattr(model, "astream", None)
            if callable(stream_fn):
                stream_iter = stream_fn(attempt_messages)
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
                            LangChainModelProvider.split_think_tags_step(
                                tag_buf, in_think, raw_text
                            )
                        )
                        combined_reasoning = struct_reasoning + tag_reasoning
                        if combined_reasoning:
                            emitted_any = True
                            yield ("think_delta", combined_reasoning)
                        if answer_delta:
                            emitted_any = True
                            yield ("token", answer_delta)

                    if tag_buf:
                        emitted_any = True
                        if in_think:
                            yield ("think_delta", tag_buf)
                        else:
                            yield ("token", tag_buf)

                    if agg_chunk is not None:
                        emitted_any = True
                        yield ("message", agg_chunk)
                        return

            ai_message = await model.ainvoke(attempt_messages)
            if isinstance(ai_message, AIMessage):
                reasoning_text, cleaned_text = _extract_reasoning_and_clean_text(ai_message)
                if reasoning_text:
                    emitted_any = True
                    yield ("think_delta", reasoning_text)
                if not (getattr(ai_message, "tool_calls", None) or []) and cleaned_text:
                    emitted_any = True
                    yield ("token", cleaned_text)
            else:
                text = LangChainModelProvider._extract_text_content(
                    getattr(ai_message, "content", "")
                )
                if text:
                    emitted_any = True
                    yield ("token", text)
            yield ("message", ai_message)
            return
        except Exception as exc:
            retry_kind = _classify_model_retry(exc) if not emitted_any else None
            if retry_kind is None or attempt >= max_attempts - 1:
                raise
            logger.warning(
                f"[Tool Loop] Recoverable model error ({retry_kind}) on attempt {attempt + 1}: {exc}"
            )
            if retry_kind == "transient":
                # [Resilience] Brief linear backoff before retrying transient 429/503 errors
                await asyncio.sleep(1.0 * (attempt + 1))
            elif retry_kind == "tool_validation":
                attempt_messages.append(
                    HumanMessage(
                        content=(
                            "Your previous tool call was rejected because of an invalid tool name "
                            "or formatting tag. Use ONLY the exact declared tool names and valid JSON arguments."
                        )
                    )
                )


_REACT_SYSTEM_GUIDANCE = (
    "Execution Protocol (Plan-and-Solve / ReAct):\n"
    "1. Plan & Inspect First: Break down multi-step tasks and use available discovery or "
    "inspection tools to gather context before executing actions.\n"
    "2. Verify Before Acting: Rely strictly on tool schemas and observed outputs rather than "
    "guessing resource names, structures, or parameters.\n"
    "3. Observe & Adapt: Evaluate each tool result; if an action fails, inspect the error, "
    "change strategy or pivot to an alternative/discovery tool instead of repeating the same failure.\n"
    "4. Grounded Final Answer: Base your final response strictly on verified observations."
)


def _with_react_guidance(messages: list[BaseMessage]) -> list[BaseMessage]:
    """Prepends or merges ReAct/Plan-and-Solve guidance into the leading SystemMessage.

    Args:
        messages (list[BaseMessage]): Original formatted conversation messages.

    Returns:
        list[BaseMessage]: New message list with a single leading SystemMessage including guidance.
    """
    updated = list(messages)
    if updated and isinstance(updated[0], SystemMessage):
        existing = LangChainModelProvider._extract_text_content(updated[0].content).strip()
        merged = f"{existing}\n\n{_REACT_SYSTEM_GUIDANCE}" if existing else _REACT_SYSTEM_GUIDANCE
        updated[0] = SystemMessage(content=merged)
        return updated
    return [SystemMessage(content=_REACT_SYSTEM_GUIDANCE), *updated]


async def run_agent_tool_loop(
    chat_model: BaseChatModel,
    messages: list[BaseMessage],
    tools: list[StructuredTool],
    max_iterations: int = 20,
) -> AsyncGenerator[dict[str, Any], None]:
    """Runs the LangChain bind_tools loop, yielding token-by-token reasoning, tool events, and tokens.

    Args:
        chat_model (BaseChatModel): Initialized LangChain chat model instance.
        messages (list[BaseMessage]): Full formatted LangChain conversation messages.
        tools (list[StructuredTool]): Bound tools available to the agent.
        max_iterations (int, optional): Safety cap on tool-calling rounds. Defaults to 20.

    Yields:
        dict[str, Any]: Event dictionaries of type `think_delta`, `tool_start`, `tool_end`, or `token`.
    """
    tool_map = {t.name: t for t in tools}
    bound_model = chat_model.bind_tools(tools)
    # [ReAct / Plan-and-Solve] Guide the model to discover schemas/resources before acting
    working_messages = _with_react_guidance(messages)
    seen_calls: set[str] = set()
    consecutive_failures: dict[str, int] = {}
    error_counts: dict[tuple[str, str], int] = {}
    disabled_tools: set[str] = set()

    for _ in range(max_iterations):
        ai_message: Any = None
        buffered_tokens: list[str] = []

        # [Working Memory] Compact bulky ToolMessages from older rounds before each turn
        turn_messages = compact_old_tool_observations(working_messages)
        async for kind, payload in _stream_model_turn(bound_model, turn_messages):
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
        steering_notes: list[str] = []
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

            if tc_name in disabled_tools:
                remaining_names = [t.name for t in tools if t.name not in disabled_tools]
                result_str = json.dumps(
                    {
                        "error": f"Tool '{tc_name}' is disabled after repeated failures.",
                        "alternative_tools": remaining_names,
                        "instruction": (
                            "Do NOT call this tool again. Switch to an alternative tool from "
                            "`alternative_tools` or answer using verified observations."
                        ),
                    }
                )
                ok, latency_ms = False, 0
            elif call_sig in seen_calls:
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
            working_messages.append(
                ToolMessage(content=_truncate_tool_output(result_str), tool_call_id=tc_id)
            )

            if ok:
                consecutive_failures[tc_name] = 0
            else:
                consecutive_failures[tc_name] = consecutive_failures.get(tc_name, 0) + 1
                err_sig = result_str[:160]
                error_counts[(tc_name, err_sig)] = error_counts.get((tc_name, err_sig), 0) + 1
                fail_count = consecutive_failures[tc_name]
                repeat_count = error_counts[(tc_name, err_sig)]

                if fail_count >= 3 and tc_name not in disabled_tools:
                    # [Circuit Breaker] Disable repeatedly failing tool and rebind remaining tools
                    disabled_tools.add(tc_name)
                    remaining_tools = [t for t in tools if t.name not in disabled_tools]
                    if remaining_tools:
                        bound_model = chat_model.bind_tools(remaining_tools)
                        alt_list = ", ".join(t.name for t in remaining_tools)
                        steering_notes.append(
                            f"Tool '{tc_name}' failed {fail_count} consecutive times and is now disabled. "
                            f"Switch to an alternative tool ({alt_list}) or answer from verified facts."
                        )
                    else:
                        steering_notes.append(
                            f"Tool '{tc_name}' failed {fail_count} consecutive times and no alternative "
                            "tools remain. Stop calling tools and report the verified error clearly."
                        )
                elif fail_count >= 2 or repeat_count >= 2:
                    alt_names = [
                        t.name for t in tools if t.name != tc_name and t.name not in disabled_tools
                    ]
                    alt_hint = (
                        f" Consider switching to one of: {', '.join(alt_names)}."
                        if alt_names
                        else ""
                    )
                    steering_notes.append(
                        f"Tool '{tc_name}' has failed {fail_count} times. Stop repeating the same "
                        f"failing approach; change parameters/strategy based on `expected_parameters`{alt_hint}"
                    )

        if steering_notes:
            working_messages.append(HumanMessage(content="\n".join(steering_notes)))

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
