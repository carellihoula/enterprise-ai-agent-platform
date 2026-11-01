"""Unit and integration tests for the Agent specification and persistence entity.

This test module validates the Pydantic v2 specification contracts (Issue I2-01) and
the SQLAlchemy ORM database persistence, relationship integrity, and validation constraints (Issue I2-02).
"""

import pytest
from pydantic import ValidationError

from app.core.database import SessionLocal, init_db
from app.models.agent import AgentCreate, KnowledgeSource, ModelSpec, ToolSpec
from app.models.entities import Agent, ConversationSession


def setup_module() -> None:
    """Initializes the database schema before test suite execution."""
    init_db()


def test_agent_specification_validation() -> None:
    """Validates schema validation rules and constraints for Agent specifications (Issue I2-01)."""
    # [Validation] Valid agent specification with all seven core dimensions
    spec = AgentCreate(
        name="Jira Triage Agent",
        description="Analyzes incoming bug reports and assigns Jira tickets.",
        instructions="You are an expert IT triage agent. Follow SOP-104 strictly.",
        model=ModelSpec(
            provider_id="groq",
            model_name="llama-3.3-70b-versatile",
            temperature=0.2,
            max_tokens=2048,
        ),
        tools=[
            ToolSpec(
                name="create_jira_issue",
                description="Creates a new issue in the engineering Jira project.",
                type="api",
                config={"project_key": "ENG", "default_priority": "Medium"},
            ).model_dump()
        ],
        knowledge=[
            KnowledgeSource(
                name="Engineering Runbooks",
                type="documents",
                rag_agent_id="rag-agent-doc-searcher",
                config={"collection": "runbooks_v2", "top_k": 5},
            )
        ],
        policies={
            "require_human_approval_for_p1": True,
            "blocked_topics": ["internal_salary", "credentials"],
        },
        is_default=True,
    )
    assert spec.name == "Jira Triage Agent"
    assert spec.instructions == "You are an expert IT triage agent. Follow SOP-104 strictly."
    assert len(spec.knowledge) == 1
    assert spec.knowledge[0].type == "documents"
    assert isinstance(spec.policies, dict)
    assert spec.policies["require_human_approval_for_p1"] is True

    # [Validation] Empty name must fail validation
    with pytest.raises(ValidationError):
        AgentCreate(
            name="",
            instructions="Sample instructions",
            model=ModelSpec(model_name="gpt-4o"),
        )

    # [Validation] Invalid temperature bounds must fail validation
    with pytest.raises(ValidationError):
        AgentCreate(
            name="Test Agent",
            instructions="Sample instructions",
            model=ModelSpec(model_name="gpt-4o", temperature=2.5),
        )


def test_agent_entity_persistence_and_relationships() -> None:
    """Validates database persistence, CRUD lifecycle, and session foreign keys for Agent (Issue I2-02)."""
    db = SessionLocal()
    agent_id: str | None = None
    session_id: str | None = None

    try:
        # 1. Create and persist an Agent entity
        agent = Agent(
            name="HR Policy Specialist",
            description="Answers employee questions regarding PTO and remote work policies.",
            instructions="You are an enterprise HR assistant. Adhere strictly to the 2026 handbook.",
            avatar="Briefcase",
            provider_id="openai",
            model_name="gpt-4o",
            temperature=0.3,
            is_default=False,
            tools=[{"name": "fetch_pto_balance", "type": "api"}],
            knowledge=[
                {
                    "id": "kb-hr-docs",
                    "name": "HR 2026 Handbook",
                    "type": "documents",
                    "rag_agent_id": "hr-rag-retriever",
                    "config": {"index": "hr_handbook_index"},
                }
            ],
            policies={"dlp_filter_ssn": True, "human_in_the_loop_exceptions": True},
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)
        agent_id = agent.id

        assert agent_id is not None
        assert agent.name == "HR Policy Specialist"
        assert len(agent.knowledge) == 1
        assert agent.knowledge[0]["name"] == "HR 2026 Handbook"
        assert isinstance(agent.policies, dict)
        assert agent.policies["dlp_filter_ssn"] is True

        # 2. Associate Agent with a ConversationSession
        session = ConversationSession(
            title="HR Inquiry Session",
            agent_id=agent.id,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

        assert session.agent_id == agent.id
        assert session.agent is not None
        assert session.agent.name == "HR Policy Specialist"

        # 3. Update Agent specifications
        agent.temperature = 0.5
        agent.description = "Updated HR description."
        db.commit()
        db.refresh(agent)
        assert agent.temperature == 0.5
        assert agent.description == "Updated HR description."

        # 4. Verify cascade nullify on session when agent is deleted
        db.delete(agent)
        db.commit()
        agent_id = None

        db.refresh(session)
        assert session.agent_id is None
        assert session.agent is None

    finally:
        if session_id:
            db.query(ConversationSession).filter(ConversationSession.id == session_id).delete()
        if agent_id:
            db.query(Agent).filter(Agent.id == agent_id).delete()
        db.commit()
        db.close()
