"""API endpoints for inspecting and testing native builtin tools.

This module exposes FastAPI routes for listing registered builtin tools and
executing interactive test runs against them.
"""

from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.engine.builtin_tools import execute_builtin_tool, list_builtin_tools

router = APIRouter(prefix="/tools", tags=["Tools"])


class BuiltinToolSchemaResponse(BaseModel):
    """Public descriptor schema for a native builtin tool.

    Attributes:
        name (str): Unique tool identifier.
        description (str): Human-readable description.
        category (str): Functional category label.
        parameters_schema (dict[str, Any]): JSON Schema of accepted arguments.
        sample_args (dict[str, Any]): Pre-filled example arguments for testing.
    """

    name: str
    description: str
    category: str
    parameters_schema: dict[str, Any]
    sample_args: dict[str, Any]


class BuiltinToolExecuteRequest(BaseModel):
    """Payload schema for executing a native builtin tool test run.

    Attributes:
        name (str): Target builtin tool identifier.
        arguments (dict[str, Any]): Input arguments dictionary.
    """

    name: str = Field(..., min_length=1, description="Builtin tool name")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Tool input arguments")


class BuiltinToolExecuteResponse(BaseModel):
    """Response schema reporting the outcome of a builtin tool execution.

    Attributes:
        ok (bool): True if the tool succeeded without raising an error.
        result (dict[str, Any] | None): Structured JSON output returned by the tool.
        error (str | None): Error message if execution failed.
        latency_ms (int): Execution duration in milliseconds.
    """

    ok: bool
    result: dict[str, Any] | None = None
    error: str | None = None
    latency_ms: int = 0


@router.get(
    "/builtin",
    response_model=list[BuiltinToolSchemaResponse],
    status_code=status.HTTP_200_OK,
)
def get_builtin_tools() -> list[BuiltinToolSchemaResponse]:
    """Lists all available native builtin tools and their JSON parameter schemas.

    Returns:
        list[BuiltinToolSchemaResponse]: Array of registered builtin tool descriptors.
    """
    return [BuiltinToolSchemaResponse(**item) for item in list_builtin_tools()]


@router.post(
    "/builtin/test",
    response_model=BuiltinToolExecuteResponse,
    status_code=status.HTTP_200_OK,
)
async def run_builtin_tool_test(
    payload: BuiltinToolExecuteRequest,
) -> BuiltinToolExecuteResponse:
    """Executes a native builtin tool with the provided arguments for live testing.

    Args:
        payload (BuiltinToolExecuteRequest): Target tool name and JSON arguments.

    Returns:
        BuiltinToolExecuteResponse: Structured execution result and timing.
    """
    outcome = await execute_builtin_tool(payload.name, payload.arguments)
    return BuiltinToolExecuteResponse(**outcome)
