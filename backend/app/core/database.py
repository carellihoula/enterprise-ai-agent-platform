"""Database core module configuring SQLAlchemy ORM session factory and base class.

This module sets up the relational database connection engine, declarative model base,
and session generator for managing persistent platform data (e.g. conversation sessions and messages).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

# [Initialization] Retrieve global application settings
settings = get_settings()

# [Database Engine] Create synchronous SQLAlchemy engine with thread safety for SQLite/PostgreSQL
engine = create_engine(
    settings.database_url.get_secret_value(),
    connect_args={"check_same_thread": False}
    if "sqlite" in settings.database_url.get_secret_value()
    else {},
    echo=settings.debug,
)

# [Session Factory] Create thread-local session factory for database operations
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base class for all SQLAlchemy ORM entity models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency generator providing a transactional database session per request.

    Yields:
        Session: Active SQLAlchemy database session.
    """
    db = SessionLocal()
    try:
        # [Transaction] Yield active session to request context
        yield db
    finally:
        # [Cleanup] Close session upon request completion
        db.close()


def init_db() -> None:
    """Initializes database tables defined in ORM metadata."""
    # [DDL] Create all declared tables if they do not already exist
    Base.metadata.create_all(bind=engine)
