"""Domain error hierarchy and exception handling strategy for the platform.

This module defines standard platform exceptions (domain, provider, tool, validation,
timeout, retryable, and non-retryable) and provides FastAPI exception handlers to format
structured error responses.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class PlatformError(Exception):
    """Base exception class for all platform domain errors.

    Attributes:
        message (str): Human-readable error message.
        error_code (str): Machine-readable error identifier code.
        status_code (int): Corresponding HTTP status code.
        details (dict[str, Any] | None): Additional contextual metadata.
        retryable (bool): Flag indicating if the operation can be retried.
    """

    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        self.retryable = retryable


class DomainError(PlatformError):
    """Exception thrown when a domain logic constraint is violated."""

    def __init__(
        self,
        message: str,
        error_code: str = "DOMAIN_ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details,
            retryable=False,
        )


class ProviderError(PlatformError):
    """Exception thrown when an external provider (LLM, Vector Store, Storage) fails."""

    def __init__(
        self,
        message: str,
        provider_name: str,
        error_code: str = "PROVIDER_ERROR",
        status_code: int = status.HTTP_502_BAD_GATEWAY,
        details: dict[str, Any] | None = None,
        retryable: bool = True,
    ) -> None:
        merged_details = details or {}
        merged_details["provider_name"] = provider_name
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=merged_details,
            retryable=retryable,
        )


class ToolError(PlatformError):
    """Exception thrown when a tool execution fails."""

    def __init__(
        self,
        message: str,
        tool_name: str,
        error_code: str = "TOOL_EXECUTION_ERROR",
        status_code: int = status.HTTP_422_UNPROCESSABLE_CONTENT,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        merged_details = details or {}
        merged_details["tool_name"] = tool_name
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=merged_details,
            retryable=retryable,
        )


class ValidationError(PlatformError):
    """Exception thrown when specification or input validation fails."""

    def __init__(
        self,
        message: str,
        error_code: str = "VALIDATION_ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details,
            retryable=False,
        )


class TimeoutError(PlatformError):
    """Exception thrown when an operation or execution exceeds its configured timeout."""

    def __init__(
        self,
        message: str,
        timeout_seconds: float,
        error_code: str = "EXECUTION_TIMEOUT",
        status_code: int = status.HTTP_504_GATEWAY_TIMEOUT,
        details: dict[str, Any] | None = None,
    ) -> None:
        merged_details = details or {}
        merged_details["timeout_seconds"] = timeout_seconds
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=merged_details,
            retryable=True,
        )


class RetryableError(PlatformError):
    """Explicit wrapper exception for operations that failed transiently and should be retried."""

    def __init__(
        self,
        message: str,
        error_code: str = "RETRYABLE_ERROR",
        status_code: int = status.HTTP_503_SERVICE_UNAVAILABLE,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details,
            retryable=True,
        )


class NonRetryableError(PlatformError):
    """Explicit exception for fatal errors that must not be retried under any policy."""

    def __init__(
        self,
        message: str,
        error_code: str = "FATAL_NON_RETRYABLE_ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=status_code,
            details=details,
            retryable=False,
        )


def register_exception_handlers(app: FastAPI) -> None:
    """Registers custom exception handlers on a FastAPI application instance.

    Args:
        app (FastAPI): Target FastAPI application instance.
    """

    # [Handler] Intercept all domain PlatformError instances and map to standard JSON
    @app.exception_handler(PlatformError)
    async def platform_exception_handler(request: Request, exc: PlatformError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                    "retryable": exc.retryable,
                    "details": exc.details,
                    "path": str(request.url.path),
                }
            },
        )
