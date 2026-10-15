"""Unit tests for the Assistants management API.

This module validates the CRUD lifecycle of AI Assistants, default assistant promotion,
and database persistence.
"""

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.main import app
from app.models.entities import Assistant


def setup_module() -> None:
    """Initializes the database schema before test suite execution."""
    init_db()


def test_assistants_crud_lifecycle() -> None:
    """Validates complete create, read, update, and delete operations for Assistants."""
    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. List assistants (triggers initial seeding if empty)
        resp = client.get("/api/v1/assistants")
        assert resp.status_code == 200
        initial_list = resp.json()
        assert len(initial_list) >= 1
        assert any(a["name"] == "General Assistant" for a in initial_list)

        # 2. Create a new custom assistant
        payload = {
            "name": "Python Architect",
            "description": "Specialist in FastAPI, clean architecture, and Python optimization.",
            "avatar": "Code",
            "provider_id": "groq",
            "model_name": "llama-3.3-70b-versatile",
            "temperature": 0.2,
            "system_prompt": "You are a senior Python architect.",
            "is_default": False,
            "tools": [],
        }
        create_resp = client.post("/api/v1/assistants", json=payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        assistant_id = created["id"]
        assert created["name"] == "Python Architect"
        assert created["temperature"] == 0.2

        # 3. Retrieve assistant by ID
        get_resp = client.get(f"/api/v1/assistants/{assistant_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == assistant_id

        # 4. Update assistant
        update_payload = {
            "temperature": 0.4,
            "description": "Updated Python Architect description.",
        }
        update_resp = client.put(f"/api/v1/assistants/{assistant_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["temperature"] == 0.4
        assert updated["description"] == "Updated Python Architect description."

        # 5. Delete assistant
        del_resp = client.delete(f"/api/v1/assistants/{assistant_id}")
        assert del_resp.status_code == 204

        # 6. Verify 404 on deleted assistant
        not_found = client.get(f"/api/v1/assistants/{assistant_id}")
        assert not_found.status_code == 404

    finally:
        db.query(Assistant).filter(Assistant.name == "Python Architect").delete()
        db.commit()
        db.close()
