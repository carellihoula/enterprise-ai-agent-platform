"""FastAPI application entry point for the Enterprise AI Agent Platform API.

This module initializes the core FastAPI web application, registers route routers,
configures exception handlers, and defines baseline system health endpoints.
"""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.chat import router as chat_router
from app.api.v1.sessions import router as sessions_router
from app.core.config import get_settings
from app.core.database import init_db
from app.core.errors import register_exception_handlers

# [Initialization] Load global settings singleton
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    """Lifespan event handler managing application startup and shutdown operations.

    Args:
        app (FastAPI): The FastAPI application instance.
    """
    # [Database] Initialize database schema and tables on startup
    init_db()
    yield


# [Application] Instantiate primary FastAPI app instance
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# [CORS] Configure Cross-Origin Resource Sharing for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [Security] Register domain exception handlers for uniform error formatting
register_exception_handlers(app)

# [Routing] Include API v1 routers
app.include_router(chat_router, prefix=settings.api_v1_prefix)
app.include_router(sessions_router, prefix=settings.api_v1_prefix)


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> dict[str, Any]:
    """Health check endpoint to verify system status and environment configuration.

    Returns:
        dict[str, Any]: Dictionary containing service status, app name, and environment.
    """
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "environment": settings.environment.value,
    }
