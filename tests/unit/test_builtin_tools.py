"""Unit tests for native built-in tools engine and FastAPI endpoints."""

from __future__ import annotations

import base64
import io
import zipfile
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.engine.builtin_tools import execute_builtin_tool, list_builtin_tools
from app.main import app


def _build_minimal_xlsx_b64() -> str:
    """Builds a minimal valid XLSX workbook in memory and returns it as base64.

    Returns:
        str: Base64-encoded XLSX archive containing one sheet with two rows.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheets><sheet name="Users" sheetId="1" r:id="rId1" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>'
            "</workbook>",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/sharedStrings.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">'
            "<si><t>name</t></si><si><t>role</t></si>"
            "<si><t>Alice</t></si><si><t>Admin</t></si>"
            "</sst>",
        )
        zf.writestr(
            "xl/worksheets/sheet1.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            "<sheetData>"
            '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
            '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>'
            "</sheetData>"
            "</worksheet>",
        )
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _build_minimal_pdf_b64(text: str) -> str:
    """Builds a minimal uncompressed PDF document containing a single text stream.

    Args:
        text (str): ASCII text to embed inside the PDF content stream.

    Returns:
        str: Base64-encoded PDF bytes.
    """
    stream_body = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("latin-1")
    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length "
        + str(len(stream_body)).encode("ascii")
        + b" >>\nstream\n"
        + stream_body
        + b"\nendstream\nendobj\n%%EOF\n"
    )
    return base64.b64encode(pdf_bytes).decode("ascii")


@pytest.mark.asyncio
async def test_get_current_datetime_returns_timezone_info() -> None:
    """Verifies get_current_datetime returns ISO timestamp and timezone metadata."""
    env = await execute_builtin_tool("get_current_datetime", {"timezone_name": "Europe/Paris"})
    assert env["ok"] is True
    res = env["result"]
    assert res is not None
    assert res["timezone"] == "Europe/Paris"
    assert "iso" in res
    assert "date" in res
    assert "time" in res


@pytest.mark.asyncio
async def test_calculator_evaluates_math_and_blocks_unsafe_ast() -> None:
    """Verifies calculator evaluates valid math and rejects unsafe expressions."""
    env = await execute_builtin_tool("calculator", {"expression": "(1250 * 1.2) + sqrt(144)"})
    assert env["ok"] is True
    assert env["result"] is not None
    assert env["result"]["result"] == 1512

    bad_env = await execute_builtin_tool(
        "calculator", {"expression": "__import__('os').system('ls')"}
    )
    assert bad_env["ok"] is False
    assert bad_env["error"] is not None


@pytest.mark.asyncio
async def test_json_query_extracts_nested_values() -> None:
    """Verifies json_query extracts nested object and array fields."""
    payload = {"users": [{"name": "Alice", "role": "Admin"}, {"name": "Bob", "role": "User"}]}
    env = await execute_builtin_tool("json_query", {"data": payload, "path": "users[1].name"})
    assert env["ok"] is True
    assert env["result"] is not None
    assert env["result"]["result"] == "Bob"


@pytest.mark.asyncio
async def test_parse_csv_excel_handles_csv_and_xlsx() -> None:
    """Verifies parse_csv_excel parses both raw CSV text and base64 XLSX workbooks."""
    csv_env = await execute_builtin_tool(
        "parse_csv_excel",
        {"csv_text": "name,role\nAlice,Admin\nBob,Viewer"},
    )
    assert csv_env["ok"] is True
    csv_res = csv_env["result"]
    assert csv_res is not None
    assert csv_res["headers"] == ["name", "role"]
    assert csv_res["row_count"] == 2
    assert csv_res["rows"][0] == ["Alice", "Admin"]

    xlsx_env = await execute_builtin_tool(
        "parse_csv_excel",
        {"content_base64": _build_minimal_xlsx_b64()},
    )
    assert xlsx_env["ok"] is True
    xlsx_res = xlsx_env["result"]
    assert xlsx_res is not None
    assert xlsx_res["headers"] == ["name", "role"]
    assert xlsx_res["rows"][0] == ["Alice", "Admin"]


@pytest.mark.asyncio
async def test_extract_pdf_text_reads_base64_pdf() -> None:
    """Verifies extract_pdf_text extracts text from a base64-encoded PDF."""
    pdf_b64 = _build_minimal_pdf_b64("Hello Enterprise AI")
    env = await execute_builtin_tool("extract_pdf_text", {"content_base64": pdf_b64})
    assert env["ok"] is True
    assert env["result"] is not None
    assert "Hello Enterprise AI" in env["result"]["text"]


@pytest.mark.asyncio
async def test_fetch_webpage_blocks_private_ssrf_targets() -> None:
    """Verifies fetch_webpage rejects loopback/private URLs via SSRF protection."""
    env = await execute_builtin_tool("fetch_webpage", {"url": "http://127.0.0.1:8000/health"})
    assert env["ok"] is False
    assert env["error"] is not None


@pytest.mark.asyncio
async def test_web_search_returns_structured_results() -> None:
    """Verifies web_search parses DuckDuckGo JSON payload into structured results."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "Heading": "FastAPI",
        "AbstractText": "FastAPI is a modern Python web framework.",
        "AbstractURL": "https://fastapi.tiangolo.com/",
        "RelatedTopics": [
            {
                "Text": "FastAPI Docs - Official documentation",
                "FirstURL": "https://fastapi.tiangolo.com/",
            }
        ],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.get.return_value = mock_response

    with patch("app.engine.builtin_tools.httpx.AsyncClient", return_value=mock_client):
        env = await execute_builtin_tool("web_search", {"query": "FastAPI", "max_results": 3})

    assert env["ok"] is True
    res = env["result"]
    assert res is not None
    assert res["query"] == "FastAPI"
    assert res["results_count"] >= 1
    assert res["results"][0]["url"] == "https://fastapi.tiangolo.com/"


def test_builtin_tools_api_endpoints() -> None:
    """Verifies GET /api/v1/tools/builtin and POST /api/v1/tools/builtin/test endpoints."""
    client = TestClient(app)

    list_resp = client.get("/api/v1/tools/builtin")
    assert list_resp.status_code == 200
    items: list[dict[str, Any]] = list_resp.json()
    names = {item["name"] for item in items}
    assert len(list_builtin_tools()) == 7
    assert names == {
        "get_current_datetime",
        "calculator",
        "fetch_webpage",
        "parse_csv_excel",
        "extract_pdf_text",
        "json_query",
        "web_search",
    }

    test_resp = client.post(
        "/api/v1/tools/builtin/test",
        json={"name": "calculator", "arguments": {"expression": "2 + 3 * 4"}},
    )
    assert test_resp.status_code == 200
    body = test_resp.json()
    assert body["ok"] is True
    assert body["result"]["result"] == 14
    assert isinstance(body["latency_ms"], (int, float))
