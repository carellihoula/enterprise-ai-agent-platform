"""Unit tests for the Agents management API.

This module validates the CRUD lifecycle of Enterprise AI Agents,
dynamic model and knowledge configuration, and database persistence.
"""

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.main import app
from app.models.entities import Agent


def setup_module() -> None:
    """Initializes the database schema before test suite execution."""
    init_db()


def test_agents_crud_lifecycle() -> None:
    """Validates complete create, read, update, and delete operations for Agents."""
    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. List agents (should NOT seed default agents)
        resp = client.get("/api/v1/agents")
        assert resp.status_code == 200
        initial_list = resp.json()
        assert isinstance(initial_list, list)

        # 2. Create a new custom agent
        payload = {
            "name": "Python Architect Agent",
            "description": "Specialist in FastAPI, clean architecture, and Python optimization.",
            "avatar": "Code",
            "instructions": "You are a senior Python architect.",
            "model": {
                "provider_id": "groq",
                "model_name": "llama-3.3-70b-versatile",
                "temperature": 0.2,
                "max_tokens": 2048,
            },
            "is_default": False,
            "tools": [{"name": "run_linter", "type": "builtin"}],
            "knowledge": [
                {
                    "name": "Architecture Docs",
                    "type": "documents",
                    "rag_agent_id": "rag-searcher",
                    "config": {"path": "/docs"},
                }
            ],
            "policies": {"allow_code_exec": False},
        }
        create_resp = client.post("/api/v1/agents", json=payload)
        assert create_resp.status_code == 201
        created = create_resp.json()
        agent_id = created["id"]
        assert created["name"] == "Python Architect Agent"
        assert created["instructions"] == "You are a senior Python architect."
        assert created["model"]["temperature"] == 0.2
        assert len(created["knowledge"]) == 1

        # 3. Retrieve agent by ID
        get_resp = client.get(f"/api/v1/agents/{agent_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == agent_id

        # 4. Update agent
        update_payload = {
            "description": "Updated Python Architect description.",
            "model": {
                "provider_id": "groq",
                "model_name": "llama-3.3-70b-versatile",
                "temperature": 0.4,
            },
        }
        update_resp = client.put(f"/api/v1/agents/{agent_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["model"]["temperature"] == 0.4
        assert updated["description"] == "Updated Python Architect description."

        # 5. Delete agent
        del_resp = client.delete(f"/api/v1/agents/{agent_id}")
        assert del_resp.status_code == 204

        # 6. Verify 404 on deleted agent
        not_found = client.get(f"/api/v1/agents/{agent_id}")
        assert not_found.status_code == 404

    finally:
        db.query(Agent).filter(Agent.name == "Python Architect Agent").delete()
        db.commit()
        db.close()
