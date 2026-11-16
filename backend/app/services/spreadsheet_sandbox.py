"""Isolated Python/Pandas execution sandbox for analyzing uploaded XLSX and CSV attachments."""

from __future__ import annotations

import ast
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.core.database import SessionLocal
from app.models.entities import ChatAttachment
from app.services.storage_service import get_storage_backend

_EXECUTION_TIMEOUT_SECONDS = 15
_MAX_OUTPUT_CHARS = 12_000

_FORBIDDEN_IMPORTS: frozenset[str] = frozenset(
    {
        "os",
        "sys",
        "subprocess",
        "socket",
        "shutil",
        "pathlib",
        "importlib",
        "builtins",
        "ctypes",
        "multiprocessing",
        "threading",
        "http",
        "urllib",
        "requests",
        "httpx",
        "boto3",
        "sqlalchemy",
    }
)

_FORBIDDEN_CALLS: frozenset[str] = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "__import__",
        "open",
        "input",
        "breakpoint",
        "getattr",
        "setattr",
        "delattr",
        "globals",
        "locals",
        "vars",
    }
)


def validate_pandas_ast(code: str) -> None:
    """Validates LLM-generated Pandas analysis code against an AST safety policy.

    Args:
        code (str): Python/Pandas source code snippet.

    Raises:
        ValueError: If syntax is invalid or forbidden imports/builtins/dunders are detected.
    """
    if not code or not code.strip():
        raise ValueError("Analysis 'code' must be a non-empty Python/Pandas snippet.")

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f"Python syntax error in analysis code: {exc}") from exc

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_pkg = alias.name.split(".")[0]
                if root_pkg in _FORBIDDEN_IMPORTS:
                    raise ValueError(
                        f"Import '{root_pkg}' is not permitted in spreadsheet sandbox."
                    )
        elif isinstance(node, ast.ImportFrom):
            root_pkg = (node.module or "").split(".")[0]
            if root_pkg in _FORBIDDEN_IMPORTS:
                raise ValueError(f"Import '{root_pkg}' is not permitted in spreadsheet sandbox.")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in _FORBIDDEN_CALLS:
                raise ValueError(
                    f"Call to '{node.func.id}' is not permitted in spreadsheet sandbox."
                )
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError(
                f"Access to dunder attribute '{node.attr}' is not permitted in spreadsheet sandbox."
            )


def _build_runner_script(data_filename: str, is_xlsx: bool, sheet_name: str | None) -> str:
    """Generates the isolated runner script executed inside the temporary sandbox directory.

    Args:
        data_filename (str): Local filename inside the temp directory (`data.xlsx` or `data.csv`).
        is_xlsx (bool): Whether the dataset is an Excel workbook.
        sheet_name (str | None): Optional Excel sheet name to load as `df`.

    Returns:
        str: Self-contained Python script source.
    """
    sheet_literal = repr(sheet_name)
    file_literal = repr(data_filename)
    return f"""import io
import json
import sys
from contextlib import redirect_stdout
import numpy as np
import pandas as pd

pd.set_option("display.max_columns", 30)
pd.set_option("display.max_rows", 100)
pd.set_option("display.width", 200)

DATA_FILE = {file_literal}
IS_XLSX = {is_xlsx!r}
TARGET_SHEET = {sheet_literal}

if IS_XLSX:
    excel_file = pd.ExcelFile(DATA_FILE, engine="openpyxl")
    sheet_names = list(excel_file.sheet_names)
    selected_sheet = TARGET_SHEET if TARGET_SHEET in sheet_names else sheet_names[0]
    df = excel_file.parse(selected_sheet)
else:
    sheet_names = ["default"]
    selected_sheet = "default"
    df = pd.read_csv(DATA_FILE)

with open("_analysis.py", "r", encoding="utf-8") as fh:
    user_code = fh.read()

namespace = {{
    "pd": pd,
    "np": np,
    "df": df,
    "sheet_names": sheet_names,
    "selected_sheet": selected_sheet,
    "load_sheet": (
        (lambda name: excel_file.parse(name)) if IS_XLSX else (lambda _name=None: df)
    ),
}}

buf = io.StringIO()
with redirect_stdout(buf):
    exec(compile(user_code, "<spreadsheet_analysis>", "exec"), namespace)

stdout_text = buf.getvalue().strip()
if not stdout_text and "result" in namespace and namespace["result"] is not None:
    res = namespace["result"]
    if isinstance(res, pd.DataFrame):
        stdout_text = res.to_markdown(index=False) if hasattr(res, "to_markdown") else res.to_string()
    elif isinstance(res, pd.Series):
        stdout_text = res.to_string()
    else:
        stdout_text = str(res)

print(stdout_text)
"""


async def execute_spreadsheet_analysis(
    attachment_id: str,
    code: str,
    sheet_name: str | None = None,
) -> dict[str, Any]:
    """Loads an uploaded CSV/XLSX attachment from storage and runs Pandas code in a subprocess.

    Args:
        attachment_id (str): UUID of the persisted `ChatAttachment` record.
        code (str): Python/Pandas snippet operating on `df` (and `load_sheet` / `sheet_names`).
        sheet_name (str | None, optional): Optional XLSX sheet name to pre-load as `df`.
            Defaults to None (loads first sheet).

    Returns:
        dict[str, Any]: Structured result containing `success`, `filename`, `output`, and `error`.

    Raises:
        ValueError: If the attachment is missing, unsupported, or fails AST validation.
    """
    validate_pandas_ast(code)

    db = SessionLocal()
    try:
        record = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()
    finally:
        db.close()

    if not record:
        raise ValueError(f"Attachment '{attachment_id}' not found.")

    lower_name = record.filename.lower()
    is_xlsx = lower_name.endswith(".xlsx")
    is_csv = lower_name.endswith(".csv")
    if not (is_xlsx or is_csv):
        raise ValueError(
            f"Attachment '{record.filename}' is not a supported spreadsheet (.xlsx or .csv)."
        )

    raw_bytes: bytes | None = None
    if record.storage_path:
        raw_bytes = get_storage_backend().get_bytes(record.storage_path)
    elif is_csv and record.extracted_text:
        raw_bytes = record.extracted_text.encode("utf-8")

    if raw_bytes is None:
        raise ValueError(
            f"Binary content for attachment '{record.filename}' is missing in storage."
        )

    data_filename = "data.xlsx" if is_xlsx else "data.csv"

    with tempfile.TemporaryDirectory(prefix="sheet_sandbox_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        (tmp_path / data_filename).write_bytes(raw_bytes)
        (tmp_path / "_analysis.py").write_text(code, encoding="utf-8")
        (tmp_path / "_runner.py").write_text(
            _build_runner_script(data_filename, is_xlsx, sheet_name),
            encoding="utf-8",
        )

        # [Isolation] Strip all backend secrets/env vars and disable user site-packages (-s)
        sanitized_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "PYTHONNOUSERSITE": "1",
            "OMP_NUM_THREADS": "1",
        }
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-s",
            "_runner.py",
            cwd=tmp_dir,
            env=sanitized_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=_EXECUTION_TIMEOUT_SECONDS
            )
        except TimeoutError:
            proc.kill()
            await proc.wait()
            return {
                "success": False,
                "attachment_id": attachment_id,
                "filename": record.filename,
                "error": f"Spreadsheet analysis timed out after {_EXECUTION_TIMEOUT_SECONDS}s.",
            }

        stdout_str = stdout_b.decode("utf-8", errors="replace").strip()
        stderr_str = stderr_b.decode("utf-8", errors="replace").strip()
        if len(stdout_str) > _MAX_OUTPUT_CHARS:
            stdout_str = (
                stdout_str[:_MAX_OUTPUT_CHARS]
                + f"\n\n[Truncated: showing first {_MAX_OUTPUT_CHARS} characters]"
            )

        if proc.returncode != 0:
            return {
                "success": False,
                "attachment_id": attachment_id,
                "filename": record.filename,
                "output": stdout_str,
                "error": stderr_str or f"Process exited with code {proc.returncode}",
            }

        return {
            "success": True,
            "attachment_id": attachment_id,
            "filename": record.filename,
            "output": stdout_str
            or "[Script completed with no output; assign 'result' or print().]",
        }
