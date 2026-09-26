"""Unit tests for conversation session service and API endpoints.

This module validates session CRUD operations, message persistence, history retrieval,
and HTTP error handling for non-existent session lookups.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.core.errors import DomainError
from app.services.session_service import SessionService


@pytest.fixture(autouse=True)
def setup_database() -> None:
    """Fixture to ensure clean database tables for each test execution."""
    init_db()


def test_session_service_crud() -> None:
    """Tests core CRUD operations in SessionService directly."""
    db = SessionLocal()
    try:
        service = SessionService(db)

        # 1. Create Session
        session = service.create_session(title="Test Session")
        assert session.id is not None
        assert session.title == "Test Session"
        session_id = session.id

        # 2. Add Messages
        msg1 = service.add_message(session_id, "user", "Hello AI")
        assert msg1.id is not None
        assert msg1.role == "user"
        assert msg1.content == "Hello AI"

        msg2 = service.add_message(session_id, "assistant", "Hello human")
        assert msg2.role == "assistant"
        assert msg2.content == "Hello human"

        # 3. Retrieve Session
        retrieved = service.get_session(session_id)
        assert len(retrieved.messages) == 2
        assert retrieved.messages[0].content == "Hello AI"
        assert retrieved.messages[1].content == "Hello human"

        # 4. List Sessions
        sessions = service.list_sessions()
        assert len(sessions) >= 1
        assert any(s.id == session_id for s in sessions)

        # 5. Delete Session
        deleted = service.delete_session(session_id)
        assert deleted is True

        # 6. Verify NotFound
        with pytest.raises(DomainError) as exc_info:
            service.get_session(session_id)
        assert exc_info.value.error_code == "SESSION_NOT_FOUND"
    finally:
        db.close()


def test_sessions_api_endpoints(api_client: TestClient) -> None:
    """Tests /api/v1/sessions API endpoints (create, list, get, delete)."""
    # 1. Create Session via POST /api/v1/sessions
    create_res = api_client.post("/api/v1/sessions", json={"title": "API Test Session"})
    assert create_res.status_code == status.HTTP_201_CREATED
    data = create_res.json()
    assert data["title"] == "API Test Session"
    session_id = data["id"]

    # 2. List Sessions via GET /api/v1/sessions
    list_res = api_client.get("/api/v1/sessions")
    assert list_res.status_code == status.HTTP_200_OK
    sessions = list_res.json()
    assert any(s["id"] == session_id for s in sessions)

    # 3. Get Session Details via GET /api/v1/sessions/{session_id}
    get_res = api_client.get(f"/api/v1/sessions/{session_id}")
    assert get_res.status_code == status.HTTP_200_OK
    detail = get_res.json()
    assert detail["id"] == session_id
    assert detail["messages"] == []

    # 4. Delete Session via DELETE /api/v1/sessions/{session_id}
    del_res = api_client.delete(f"/api/v1/sessions/{session_id}")
    assert del_res.status_code == status.HTTP_204_NO_CONTENT

    # 5. Confirm 404 for deleted session
    get_404_res = api_client.get(f"/api/v1/sessions/{session_id}")
    assert get_404_res.status_code == status.HTTP_404_NOT_FOUND


def test_chat_with_session_persistence(api_client: TestClient) -> None:
    """Tests /api/v1/chat integration with session history loading and persistence."""
    # 1. Create session
    create_res = api_client.post("/api/v1/sessions", json={"title": "Chat Persistence Session"})
    session_id = create_res.json()["id"]

    # 2. Mock OpenAIProvider.generate to return deterministic response
    with patch("app.api.v1.chat.OpenAIProvider") as mock_provider_cls:
        mock_instance = AsyncMock()
        mock_instance.generate.return_value = AsyncMock(
            content="I am an AI assistant.",
            model_name="gpt-4o",
            usage=AsyncMock(prompt_tokens=10, completion_tokens=5, total_tokens=15),
            finish_reason="stop",
        )
        mock_provider_cls.return_value = mock_instance

        # Send chat request attached to session_id
        chat_res = api_client.post(
            "/api/v1/chat",
            json={
                "session_id": session_id,
                "provider_name": "mock",
                "model_name": "gpt-4o",
                "messages": [{"role": "user", "content": "Who are you?"}],
            },
        )
        assert chat_res.status_code == status.HTTP_200_OK
        assert chat_res.json()["session_id"] == session_id

    # 3. Check session history now contains user question and assistant answer
    get_res = api_client.get(f"/api/v1/sessions/{session_id}")
    assert get_res.status_code == status.HTTP_200_OK
    messages = get_res.json()["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Who are you?"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "I am an AI assistant."
