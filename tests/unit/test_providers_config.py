"""Unit tests for credential encryption and provider model adapters.

This module validates the symmetric encryption, masking, and adapter integrations
for frontier model providers (Mistral, Groq, OpenRouter).
"""

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.core.security import decrypt_api_key, encrypt_api_key, mask_api_key
from app.main import app
from app.models.entities import Assistant


def test_encryption_and_decryption_cycle() -> None:
    """Validates that plaintext keys are correctly encrypted and decrypted via Fernet cipher."""
    test_key = "sk-proj-test1234567890abcdef"
    encrypted = encrypt_api_key(test_key)
    assert encrypted != test_key
    assert len(encrypted) > 20

    decrypted = decrypt_api_key(encrypted)
    assert decrypted == test_key


def test_mask_api_key_formats() -> None:
    """Validates that sensitive API keys are visually masked while preserving identification cues."""
    assert mask_api_key(None) is None
    assert mask_api_key("") is None
    assert mask_api_key("12345") == "••••••••"
    masked = mask_api_key("sk-proj-123456789abcdef9999")
    assert masked is not None
    assert masked.startswith("sk-pro...")
    assert masked.endswith("9999")


def test_assistant_credentials_encryption() -> None:
    """Validates saving assistant configuration with encrypted credentials and masked keys."""
    init_db()
    client = TestClient(app)
    db = SessionLocal()
    assistant_id = None
    try:
        payload = {
            "name": "Secured Assistant",
            "description": "Assistant with encrypted credentials",
            "avatar": "Bot",
            "provider_id": "groq",
            "model_name": "llama-3.3-70b-versatile",
            "temperature": 0.5,
            "system_prompt": "You are a secure enterprise assistant.",
            "api_key": "sk-secret-user-key-12345",
            "base_url": "https://api.groq.com/openai/v1",
            "is_default": False,
            "tools": [],
        }
        resp = client.post("/api/v1/assistants", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assistant_id = data["id"]
        assert data["name"] == "Secured Assistant"
        assert data["has_api_key"] is True
        assert data["masked_api_key"] is not None
        assert "sk-secret-user-key-12345" not in data["masked_api_key"]
        assert data["base_url"] == "https://api.groq.com/openai/v1"

        # Verify encrypted key in database
        db_record = db.query(Assistant).filter(Assistant.id == assistant_id).first()
        assert db_record is not None
        assert db_record.api_key_encrypted is not None
        assert db_record.api_key_encrypted != "sk-secret-user-key-12345"
        assert decrypt_api_key(db_record.api_key_encrypted) == "sk-secret-user-key-12345"
    finally:
        if assistant_id:
            db.query(Assistant).filter(Assistant.id == assistant_id).delete()
            db.commit()
        db.close()


def test_mistral_groq_openrouter_adapters() -> None:
    """Validates that Mistral, Groq, and OpenRouter model adapters initialize properly."""
    from app.providers.llm.base import ModelConfig
    from app.providers.llm.langchain_provider import ProviderAdapterRegistry

    # [Mistral Integration] Test langchain-mistralai adapter instantiation
    mistral_cfg = ModelConfig(
        provider_id="mistral",
        model_name="mistral-small-latest",
        api_key="mock-mistral-key",
    )
    mistral_provider = ProviderAdapterRegistry.get_provider(mistral_cfg)
    assert mistral_provider is not None
    assert mistral_provider.get_model_info().provider_name == "mistral"

    # [Groq Integration] Test langchain-groq adapter instantiation
    groq_cfg = ModelConfig(
        provider_id="groq",
        model_name="llama-3.3-70b-versatile",
        api_key="mock-groq-key",
    )
    groq_provider = ProviderAdapterRegistry.get_provider(groq_cfg)
    assert groq_provider is not None
    assert groq_provider.get_model_info().provider_name == "groq"

    # [OpenRouter Integration] Test langchain OpenRouter adapter instantiation
    openrouter_cfg = ModelConfig(
        provider_id="openrouter",
        model_name="anthropic/claude-3.5-sonnet",
        api_key="mock-openrouter-key",
        base_url="https://openrouter.ai/api/v1",
    )
    openrouter_provider = ProviderAdapterRegistry.get_provider(openrouter_cfg)
    assert openrouter_provider is not None
    assert openrouter_provider.get_model_info().provider_name == "openrouter"
