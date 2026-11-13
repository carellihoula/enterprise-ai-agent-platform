"""Native builtin tools registry and execution engine for Enterprise AI Agents.

This module implements deterministic, zero-hallucination builtin tools (datetime,
safe math evaluation, SSRF-protected web fetching/search, CSV/XLSX parsing, PDF text
extraction, and JSON querying) callable by agents and testable via the Tools API.
"""

import ast
import base64
import csv
import io
import json
import math
import operator
import re
import time
import xml.etree.ElementTree as ET
import zipfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import httpx

from app.engine.mcp_client import _validate_remote_url_ssrf

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]

_BINARY_OPS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS: dict[type[ast.unaryop], Callable[[float], float]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_SAFE_MATH_FUNCS: dict[str, Callable[..., float]] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "pow": pow,
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "ceil": math.ceil,
    "floor": math.floor,
}

_SAFE_MATH_CONSTS: dict[str, float] = {
    "pi": math.pi,
    "e": math.e,
}


@dataclass(frozen=True)
class BuiltinToolDefinition:
    """Metadata and execution handler for a native builtin tool.

    Attributes:
        name (str): Unique tool identifier.
        description (str): Semantic description presented to LLMs and users.
        category (str): Functional category label.
        parameters_schema (dict[str, Any]): JSON Schema describing input arguments.
        sample_args (dict[str, Any]): Example arguments for interactive testing.
        handler (ToolHandler): Async execution function accepting an arguments dict.
    """

    name: str
    description: str
    category: str
    parameters_schema: dict[str, Any]
    sample_args: dict[str, Any]
    handler: ToolHandler


class _TextExtractorHTMLParser(HTMLParser):
    """Minimal HTML-to-text parser ignoring script, style, and noscript blocks."""

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._in_title = False
        self.title = ""
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lower = tag.lower()
        if lower in ("script", "style", "noscript", "svg"):
            self._skip_depth += 1
        elif lower == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower in ("script", "style", "noscript", "svg") and self._skip_depth > 0:
            self._skip_depth -= 1
        elif lower == "title":
            self._in_title = False
        elif lower in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "tr"):
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        if self._in_title:
            self.title += data
        text = data.strip()
        if text:
            self._chunks.append(text + " ")

    def get_text(self) -> str:
        """Returns normalized whitespace-collapsed extracted text."""
        raw = "".join(self._chunks)
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        return "\n".join(lines)


def _eval_math_node(node: ast.AST) -> float:
    """Safely evaluates an AST arithmetic node without calling Python eval().

    Args:
        node (ast.AST): Parsed Python AST expression node.

    Returns:
        float: Evaluated numeric result.

    Raises:
        ValueError: If an unsupported syntax node, function, or large exponent is encountered.
    """
    if isinstance(node, ast.Expression):
        return _eval_math_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id in _SAFE_MATH_CONSTS:
            return _SAFE_MATH_CONSTS[node.id]
        raise ValueError(f"Unknown identifier '{node.id}'.")
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval_math_node(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPS:
        left = _eval_math_node(node.left)
        right = _eval_math_node(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 1000:
            raise ValueError("Exponent too large.")
        return _BINARY_OPS[type(node.op)](left, right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        func_name = node.func.id
        if func_name not in _SAFE_MATH_FUNCS:
            raise ValueError(f"Function '{func_name}' is not allowed.")
        args = [_eval_math_node(arg) for arg in node.args]
        return float(_SAFE_MATH_FUNCS[func_name](*args))
    raise ValueError("Unsupported mathematical expression.")


async def _tool_get_current_datetime(args: dict[str, Any]) -> dict[str, Any]:
    """Returns the current date, time, weekday, and ISO timestamp for a given IANA timezone."""
    tz_name = str(args.get("timezone_name") or "UTC").strip()
    try:
        tz = ZoneInfo(tz_name)
    except Exception as exc:
        raise ValueError(f"Invalid IANA timezone '{tz_name}'.") from exc

    now = datetime.now(tz)
    return {
        "timezone": tz_name,
        "iso": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": now.strftime("%A"),
        "unix_timestamp": int(now.timestamp()),
    }


async def _tool_calculator(args: dict[str, Any]) -> dict[str, Any]:
    """Safely evaluates a mathematical expression using an AST whitelist."""
    expr = str(args.get("expression") or "").strip()
    if not expr:
        raise ValueError("Parameter 'expression' is required.")
    try:
        parsed = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid math syntax: {exc.msg}") from exc

    result = _eval_math_node(parsed)
    formatted: int | float = int(result) if result.is_integer() else round(result, 10)
    return {"expression": expr, "result": formatted}


async def _tool_fetch_webpage(args: dict[str, Any]) -> dict[str, Any]:
    """Fetches a public webpage with SSRF validation and extracts clean readable text."""
    url = str(args.get("url") or "").strip()
    max_chars = int(args.get("max_chars") or 8000)
    if not url.startswith(("http://", "https://")):
        raise ValueError("URL must start with http:// or https://.")

    # [SSRF Defense] Block localhost and private/internal network addresses
    _validate_remote_url_ssrf(url)

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
        response = await client.get(
            url,
            headers={"User-Agent": "EnterpriseAIAgentPlatform/1.0"},
        )
        response.raise_for_status()

    parser = _TextExtractorHTMLParser()
    parser.feed(response.text)
    extracted = parser.get_text()
    truncated = len(extracted) > max_chars
    return {
        "url": url,
        "status_code": response.status_code,
        "title": parser.title.strip(),
        "content": extracted[:max_chars],
        "truncated": truncated,
    }


def _read_xlsx_bytes(raw_bytes: bytes, sheet_name: str | None, max_rows: int) -> dict[str, Any]:
    """Parses an XLSX spreadsheet using Python standard library zipfile and ElementTree."""
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    text_parts = [
                        t.text or "" for t in si.iter() if t.tag.endswith("}t") or t.tag == "t"
                    ]
                    shared_strings.append("".join(text_parts))

        sheet_files = sorted(
            name
            for name in zf.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        )
        if not sheet_files:
            raise ValueError("No worksheets found in XLSX file.")

        target_sheet = sheet_files[0]
        if sheet_name:
            matched = [s for s in sheet_files if sheet_name.lower() in s.lower()]
            if matched:
                target_sheet = matched[0]

        root = ET.fromstring(zf.read(target_sheet))
        rows: list[list[str]] = []
        for row_el in root.iter():
            if not (row_el.tag.endswith("}row") or row_el.tag == "row"):
                continue
            row_vals: list[str] = []
            for cell in row_el:
                cell_type = cell.attrib.get("t", "")
                val_text = ""
                for child in cell:
                    if child.tag.endswith("}v") or child.tag == "v":
                        val_text = child.text or ""
                    elif child.tag.endswith("}is") or child.tag == "is":
                        val_text = "".join(t.text or "" for t in child.iter() if t.text)
                if cell_type == "s" and val_text.isdigit():
                    idx = int(val_text)
                    val_text = shared_strings[idx] if idx < len(shared_strings) else val_text
                row_vals.append(val_text)
            rows.append(row_vals)
            if len(rows) > max_rows:
                break

    headers = rows[0] if rows else []
    data_rows = rows[1:] if len(rows) > 1 else []
    return {
        "format": "xlsx",
        "sheet": target_sheet,
        "headers": headers,
        "rows": data_rows,
        "row_count": len(data_rows),
    }


async def _tool_parse_csv_excel(args: dict[str, Any]) -> dict[str, Any]:
    """Parses CSV text or base64/file-path CSV/XLSX data into structured headers and rows."""
    csv_text = args.get("csv_text")
    content_b64 = args.get("content_base64")
    file_path = args.get("file_path")
    sheet_name = args.get("sheet_name")
    max_rows = int(args.get("max_rows") or 100)

    if csv_text is not None and str(csv_text).strip():
        reader = csv.reader(io.StringIO(str(csv_text)))
        all_rows = [row for _, row in zip(range(max_rows + 1), reader, strict=False)]
        headers = all_rows[0] if all_rows else []
        data_rows = all_rows[1:] if len(all_rows) > 1 else []
        return {
            "format": "csv",
            "headers": headers,
            "rows": data_rows,
            "row_count": len(data_rows),
        }

    raw_bytes: bytes | None = None
    is_xlsx = False
    if content_b64:
        raw_bytes = base64.b64decode(str(content_b64))
        is_xlsx = raw_bytes[:2] == b"PK"
    elif file_path:
        path = Path(str(file_path))
        if not path.is_file():
            raise ValueError(f"File not found: {file_path}")
        raw_bytes = path.read_bytes()
        is_xlsx = path.suffix.lower() == ".xlsx" or raw_bytes[:2] == b"PK"

    if raw_bytes is None:
        raise ValueError("Provide 'csv_text', 'content_base64', or 'file_path'.")

    if is_xlsx:
        return _read_xlsx_bytes(raw_bytes, sheet_name, max_rows)

    decoded = raw_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(decoded))
    all_rows = [row for _, row in zip(range(max_rows + 1), reader, strict=False)]
    headers = all_rows[0] if all_rows else []
    data_rows = all_rows[1:] if len(all_rows) > 1 else []
    return {
        "format": "csv",
        "headers": headers,
        "rows": data_rows,
        "row_count": len(data_rows),
    }


def _extract_pdf_bytes_pure_python(raw_bytes: bytes) -> str:
    """Extracts readable text operators from PDF content streams using stdlib zlib/regex."""
    import zlib

    text_chunks: list[str] = []
    # [Stream Parsing] Inspect compressed FlateDecode streams as well as uncompressed text objects
    stream_pattern = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    literal_pattern = re.compile(r"\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj")
    array_pattern = re.compile(r"\[(.*?)\]\s*TJ", re.DOTALL)

    candidates: list[bytes] = [raw_bytes]
    for match in stream_pattern.finditer(raw_bytes):
        stream_data = match.group(1)
        try:
            candidates.append(zlib.decompress(stream_data))
        except Exception:
            candidates.append(stream_data)

    for chunk in candidates:
        decoded = chunk.decode("latin-1", errors="ignore")
        for m in literal_pattern.finditer(decoded):
            text_chunks.append(m.group(1).replace("\\(", "(").replace("\\)", ")"))
        for arr in array_pattern.finditer(decoded):
            parts = re.findall(r"\(([^()\\]*(?:\\.[^()\\]*)*)\)", arr.group(1))
            if parts:
                text_chunks.append("".join(parts).replace("\\(", "(").replace("\\)", ")"))

    return "\n".join(part.strip() for part in text_chunks if part.strip())


async def _tool_extract_pdf_text(args: dict[str, Any]) -> dict[str, Any]:
    """Extracts text from a PDF supplied as base64 bytes or a local file path."""
    content_b64 = args.get("content_base64")
    file_path = args.get("file_path")
    max_pages = int(args.get("max_pages") or 20)

    raw_bytes: bytes | None = None
    if content_b64:
        raw_bytes = base64.b64decode(str(content_b64))
    elif file_path:
        path = Path(str(file_path))
        if not path.is_file():
            raise ValueError(f"PDF file not found: {file_path}")
        raw_bytes = path.read_bytes()

    if raw_bytes is None:
        raise ValueError("Provide either 'content_base64' or 'file_path'.")
    if not raw_bytes.startswith(b"%PDF"):
        raise ValueError("Invalid PDF header.")

    try:
        import pypdf  # type: ignore[import-not-found]

        reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
        pages = [page.extract_text() or "" for page in reader.pages[:max_pages]]
        return {
            "page_count": len(reader.pages),
            "extracted_pages": len(pages),
            "text": "\n\n".join(pages).strip(),
        }
    except ImportError:
        extracted = _extract_pdf_bytes_pure_python(raw_bytes)
        return {
            "page_count": None,
            "extracted_pages": None,
            "text": extracted,
        }


def _resolve_json_path(current: Any, tokens: list[str]) -> Any:
    """Recursively evaluates dot/bracket JSONPath tokens against a parsed JSON structure."""
    if not tokens:
        return current
    token = tokens[0]
    rest = tokens[1:]

    if token == "*":
        if isinstance(current, list):
            return [_resolve_json_path(item, rest) for item in current]
        if isinstance(current, dict):
            return [_resolve_json_path(val, rest) for val in current.values()]
        return None

    if token.lstrip("-").isdigit() and isinstance(current, list):
        idx = int(token)
        if -len(current) <= idx < len(current):
            return _resolve_json_path(current[idx], rest)
        return None

    if isinstance(current, dict) and token in current:
        return _resolve_json_path(current[token], rest)
    return None


async def _tool_json_query(args: dict[str, Any]) -> dict[str, Any]:
    """Queries a JSON object or array using dot/bracket path expressions (e.g. '$.items[*].name')."""
    raw_data = args.get("data")
    path = str(args.get("path") or "$").strip()
    if raw_data is None:
        raise ValueError("Parameter 'data' is required.")

    parsed = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
    normalized = path.lstrip("$").lstrip(".")
    if not normalized:
        return {"path": path, "result": parsed}

    tokens = [t for t in re.split(r"\.|\[|\]", normalized) if t != ""]
    result = _resolve_json_path(parsed, tokens)
    return {"path": path, "result": result}


async def _tool_web_search(args: dict[str, Any]) -> dict[str, Any]:
    """Performs a live web search via DuckDuckGo Instant Answer API."""
    query = str(args.get("query") or "").strip()
    max_results = min(int(args.get("max_results") or 5), 10)
    if not query:
        raise ValueError("Parameter 'query' is required.")

    api_url = (
        f"https://api.duckduckgo.com/?q={quote_plus(query)}&format=json&no_html=1&skip_disambig=1"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(api_url)
        response.raise_for_status()
        payload = response.json()

    results: list[dict[str, str]] = []
    if payload.get("AbstractText"):
        results.append(
            {
                "title": payload.get("Heading") or query,
                "url": payload.get("AbstractURL") or "",
                "snippet": payload["AbstractText"],
            }
        )

    for topic in payload.get("RelatedTopics", []):
        if len(results) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text"):
            results.append(
                {
                    "title": topic.get("Text", "").split(" - ")[0][:80],
                    "url": topic.get("FirstURL") or "",
                    "snippet": topic.get("Text", ""),
                }
            )

    return {
        "query": query,
        "results_count": len(results),
        "results": results[:max_results],
    }


BUILTIN_TOOLS_REGISTRY: dict[str, BuiltinToolDefinition] = {
    "get_current_datetime": BuiltinToolDefinition(
        name="get_current_datetime",
        description="Returns the exact current date, time, weekday, and ISO timestamp in a given IANA timezone.",
        category="Time & Calendar",
        parameters_schema={
            "type": "object",
            "properties": {
                "timezone_name": {
                    "type": "string",
                    "description": "IANA timezone name (e.g. 'UTC', 'Europe/Paris', 'America/New_York').",
                    "default": "UTC",
                }
            },
        },
        sample_args={"timezone_name": "Europe/Paris"},
        handler=_tool_get_current_datetime,
    ),
    "calculator": BuiltinToolDefinition(
        name="calculator",
        description="Safely evaluates mathematical expressions, percentages, and scientific functions without hallucination.",
        category="Math & Logic",
        parameters_schema={
            "type": "object",
            "required": ["expression"],
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Arithmetic expression (e.g. '(1250 * 1.2) + sqrt(144)').",
                }
            },
        },
        sample_args={"expression": "(1250 * 1.20) + sqrt(144)"},
        handler=_tool_calculator,
    ),
    "fetch_webpage": BuiltinToolDefinition(
        name="fetch_webpage",
        description="Fetches a public webpage (SSRF-protected) and extracts its clean readable text and title.",
        category="Web & Network",
        parameters_schema={
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {"type": "string", "description": "Public HTTP or HTTPS URL."},
                "max_chars": {"type": "integer", "default": 8000},
            },
        },
        sample_args={"url": "https://example.com", "max_chars": 2000},
        handler=_tool_fetch_webpage,
    ),
    "parse_csv_excel": BuiltinToolDefinition(
        name="parse_csv_excel",
        description="Parses CSV text or XLSX spreadsheets into structured headers and rows.",
        category="Data & Files",
        parameters_schema={
            "type": "object",
            "properties": {
                "csv_text": {"type": "string", "description": "Raw CSV text content."},
                "content_base64": {
                    "type": "string",
                    "description": "Base64-encoded CSV or XLSX file.",
                },
                "file_path": {"type": "string", "description": "Path to local CSV/XLSX file."},
                "max_rows": {"type": "integer", "default": 100},
            },
        },
        sample_args={"csv_text": "name,role,status\nAlice,Admin,Active\nBob,Viewer,Pending"},
        handler=_tool_parse_csv_excel,
    ),
    "extract_pdf_text": BuiltinToolDefinition(
        name="extract_pdf_text",
        description="Extracts readable text content from a PDF document provided as base64 or file path.",
        category="Data & Files",
        parameters_schema={
            "type": "object",
            "properties": {
                "content_base64": {"type": "string", "description": "Base64-encoded PDF bytes."},
                "file_path": {"type": "string", "description": "Path to a local PDF file."},
                "max_pages": {"type": "integer", "default": 20},
            },
        },
        sample_args={"content_base64": ""},
        handler=_tool_extract_pdf_text,
    ),
    "json_query": BuiltinToolDefinition(
        name="json_query",
        description="Extracts nested values or arrays from JSON payloads using dot/bracket path expressions.",
        category="Data & Files",
        parameters_schema={
            "type": "object",
            "required": ["data", "path"],
            "properties": {
                "data": {"description": "JSON string, object, or array."},
                "path": {
                    "type": "string",
                    "description": "Path expression (e.g. '$.users[*].email').",
                },
            },
        },
        sample_args={
            "data": {
                "users": [{"name": "Alice", "role": "admin"}, {"name": "Bob", "role": "user"}]
            },
            "path": "$.users[*].name",
        },
        handler=_tool_json_query,
    ),
    "web_search": BuiltinToolDefinition(
        name="web_search",
        description="Searches public web knowledge for up-to-date summaries and reference links.",
        category="Web & Network",
        parameters_schema={
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query keywords."},
                "max_results": {"type": "integer", "default": 5},
            },
        },
        sample_args={"query": "Model Context Protocol", "max_results": 3},
        handler=_tool_web_search,
    ),
}


def list_builtin_tools() -> list[dict[str, Any]]:
    """Returns metadata schemas for all registered native builtin tools.

    Returns:
        list[dict[str, Any]]: Serialized list of builtin tool descriptors.
    """
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "category": tool.category,
            "parameters_schema": tool.parameters_schema,
            "sample_args": tool.sample_args,
        }
        for tool in BUILTIN_TOOLS_REGISTRY.values()
    ]


async def execute_builtin_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Executes a registered builtin tool by name with timing and error isolation.

    Args:
        name (str): Registered builtin tool identifier.
        arguments (dict[str, Any]): Input arguments dictionary matching parameters_schema.

    Returns:
        dict[str, Any]: Execution envelope containing `ok`, `result`, `error`, and `latency_ms`.
    """
    tool = BUILTIN_TOOLS_REGISTRY.get(name)
    if not tool:
        return {
            "ok": False,
            "result": None,
            "error": f"Unknown builtin tool '{name}'.",
            "latency_ms": 0,
        }

    start_time = time.perf_counter()
    try:
        output = await tool.handler(arguments)
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": True,
            "result": output,
            "error": None,
            "latency_ms": elapsed_ms,
        }
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "ok": False,
            "result": None,
            "error": str(exc),
            "latency_ms": elapsed_ms,
        }
