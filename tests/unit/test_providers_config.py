"""Unit tests for provider configuration persistence and credential encryption.

This module validates the symmetric encryption, masking, and REST endpoints for
dynamically managing provider models, sampling parameters, and API keys.
"""

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.core.security import decrypt_api_key, encrypt_api_key, mask_api_key
from app.main import app
from app.models.entities import ProviderConfig


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


def test_save_and_get_provider_config() -> None:
    """Validates saving provider configuration with empty initial models and encrypted key."""
    init_db()
    client = TestClient(app)
    db = SessionLocal()
    try:
        # [Cleanup] Remove any existing test provider record
        db.query(ProviderConfig).filter(ProviderConfig.provider_id == "test_provider").delete()
        db.commit()

        # 1. Fetch initial unconfigured provider
        resp_initial = client.get("/api/v1/providers/config/test_provider")
        assert resp_initial.status_code == 200
        data_initial = resp_initial.json()
        assert data_initial["provider_id"] == "test_provider"
        assert data_initial["models"] == []
        assert data_initial["has_api_key"] is False

        # 2. Save user-defined configuration with models and plaintext key
        payload = {
            "models": ["gpt-4o-custom", "gpt-4o-mini-custom"],
            "active_model": "gpt-4o-custom",
            "temperature": 0.4,
            "system_prompt": "You are a test enterprise assistant.",
            "api_key": "sk-secret-user-key-12345",
            "base_url": None,
        }
        resp_save = client.put("/api/v1/providers/config/test_provider", json=payload)
        assert resp_save.status_code == 200
        saved_data = resp_save.json()
        assert saved_data["provider_id"] == "test_provider"
        assert saved_data["models"] == ["gpt-4o-custom", "gpt-4o-mini-custom"]
        assert saved_data["active_model"] == "gpt-4o-custom"
        assert saved_data["temperature"] == 0.4
        assert saved_data["system_prompt"] == "You are a test enterprise assistant."
        assert saved_data["has_api_key"] is True
        assert saved_data["masked_api_key"] is not None
        assert "sk-secret-user-key-12345" not in saved_data["masked_api_key"]

        # 3. Verify encrypted key stored in database
        db_record = (
            db.query(ProviderConfig).filter(ProviderConfig.provider_id == "test_provider").first()
        )
        assert db_record is not None
        assert db_record.api_key_encrypted is not None
        assert db_record.api_key_encrypted != "sk-secret-user-key-12345"
        assert decrypt_api_key(db_record.api_key_encrypted) == "sk-secret-user-key-12345"
    finally:
        db.query(ProviderConfig).filter(ProviderConfig.provider_id == "test_provider").delete()
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
        api_key="gsk_mock_groq_key",
    )
    groq_provider = ProviderAdapterRegistry.get_provider(groq_cfg)
    assert groq_provider is not None
    assert groq_provider.get_model_info().provider_name == "groq"

    # [OpenRouter Integration] Test OpenRouter gateway adapter instantiation
    openrouter_cfg = ModelConfig(
        provider_id="openrouter",
        model_name="meta-llama/llama-3-8b-instruct:free",
        api_key="sk-or-v1-mock-key",
    )
    openrouter_provider = ProviderAdapterRegistry.get_provider(openrouter_cfg)
    assert openrouter_provider is not None
    assert openrouter_provider.get_model_info().provider_name == "openrouter"
