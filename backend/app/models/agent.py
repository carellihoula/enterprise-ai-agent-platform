"""Pydantic v2 schemas and validation contracts for Agent specifications.

This module defines the canonical domain models representing an Enterprise AI Agent specification,
including model hyper-parameters, tool bindings, knowledge base connectors, and governance policies.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class ModelSpec(BaseModel):
    """Specification configuration for an agent's underlying foundational model.

    Attributes:
        provider_id (str): Unique provider identifier (e.g., 'openai', 'groq', 'anthropic').
        model_name (str): Identifier of the specific model version (e.g., 'llama-3.3-70b-versatile').
        temperature (float): Sampling temperature between 0.0 and 1.0. Defaults to 0.7.
        max_tokens (int | None): Optional ceiling on generation tokens. Defaults to None.
        base_url (str | None): Optional custom API endpoint base URL.
        api_key (str | None): Optional plaintext API key (encrypted at persistence boundary).
    """

    model_config = ConfigDict(extra="ignore")

    provider_id: str = Field(default="groq", description="Foundational LLM provider identifier")
    model_name: str = Field(..., min_length=1, description="Target foundational model name")
    temperature: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Sampling temperature parameter"
    )
    max_tokens: int | None = Field(
        default=None, gt=0, description="Maximum tokens allowed for model generation"
    )
    base_url: str | None = Field(
        default=None, max_length=255, description="Custom base URL endpoint for provider"
    )
    api_key: str | None = Field(
        default=None, description="Plaintext provider API key to encrypt at rest"
    )


class KnowledgeSource(BaseModel):
    """Configuration for an attached knowledge base or external data source.

    Attributes:
        id (str): Unique identifier for this knowledge source binding.
        name (str): Human-readable title of the knowledge base.
        type (Literal["documents", "database", "external_rag", "custom"]): Category of data source.
        rag_agent_id (str | None): Optional ID of a dedicated RAG agent used to query this knowledge.
        config (dict[str, Any]): Connection and indexing parameters (collection, paths, top_k, etc.).
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid4()), description="Knowledge binding UUID")
    name: str = Field(
        ..., min_length=1, max_length=100, description="Display title of the knowledge base"
    )
    type: Literal["documents", "database", "external_rag", "custom"] = Field(
        default="documents", description="Underlying knowledge base modality"
    )
    rag_agent_id: str | None = Field(
        default=None, description="Dedicated RAG agent ID delegated to retrieve knowledge context"
    )
    config: dict[str, Any] = Field(
        default_factory=dict, description="Custom parameters, index names, or database credentials"
    )


class ToolSpec(BaseModel):
    """Specification for an external tool, function, or MCP server bound to an agent.

    Attributes:
        name (str): Unique identifier or function name of the tool.
        description (str | None): Semantic description of the tool used for LLM tool selection.
        type (Literal["builtin", "mcp", "api", "custom"]): Modality of the tool integration.
        config (dict[str, Any]): Execution metadata, server URLs, or parameter schemas.
    """

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=100, description="Identifier name of the tool")
    description: str | None = Field(
        default=None, max_length=255, description="Tool description explaining when to call it"
    )
    type: Literal["builtin", "mcp", "api", "custom"] = Field(
        default="builtin", description="Tool execution modality"
    )
    config: dict[str, Any] = Field(
        default_factory=dict, description="Tool configuration dictionary"
    )


class AgentCreate(BaseModel):
    """Payload schema for registering a new Enterprise AI Agent.

    Attributes:
        name (str): Display title of the agent.
        description (str | None): Summary of the agent's specialization and responsibilities.
        instructions (str): Core behavioral instructions and prompt persona.
        model (ModelSpec): LLM provider and generation hyper-parameters.
        tools (list[dict[str, Any]]): Extensible array of tool specifications or MCP bindings.
        knowledge (list[KnowledgeSource]): Knowledge bases accessible by retrieval agents.
        policies (dict[str, Any] | list[dict[str, Any]]): Governance and safety guardrail policies.
        avatar (str | None): UI avatar identifier.
        is_default (bool): Whether this agent serves as the default for new sessions.
    """

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=100, description="Display name of the agent")
    description: str | None = Field(
        default=None, max_length=255, description="Summary of the agent's specialty"
    )
    instructions: str = Field(
        ..., min_length=1, description="Primary prompt instructions and behavioral persona"
    )
    model: ModelSpec = Field(..., description="Foundational model configuration and credentials")
    tools: list[dict[str, Any]] = Field(
        default_factory=list, description="Array of executable tools or MCP server configurations"
    )
    knowledge: list[KnowledgeSource] = Field(
        default_factory=list, description="Bound knowledge bases queried by RAG agents"
    )
    policies: dict[str, Any] | list[dict[str, Any]] = Field(
        default_factory=dict, description="Flexible governance, DLP, and safety policies"
    )
    avatar: str | None = Field(
        default="Bot", max_length=50, description="Avatar icon key for frontend UI display"
    )
    is_default: bool = Field(
        default=False, description="Flag indicating if this agent is the workspace default"
    )


class AgentUpdate(BaseModel):
    """Payload schema for partially updating an existing Enterprise AI Agent.

    Attributes:
        name (str | None): Updated agent title.
        description (str | None): Updated summary.
        instructions (str | None): Updated behavioral instructions.
        model (ModelSpec | None): Updated model configuration.
        tools (list[dict[str, Any]] | None): Updated tools list.
        knowledge (list[KnowledgeSource] | None): Updated knowledge bases.
        policies (dict[str, Any] | list[dict[str, Any]] | None): Updated safety policies.
        avatar (str | None): Updated avatar key.
        is_default (bool | None): Updated default status flag.
    """

    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    instructions: str | None = Field(default=None, min_length=1)
    model: ModelSpec | None = None
    tools: list[dict[str, Any]] | None = None
    knowledge: list[KnowledgeSource] | None = None
    policies: dict[str, Any] | list[dict[str, Any]] | None = None
    avatar: str | None = Field(default=None, max_length=50)
    is_default: bool | None = None


class AgentResponse(BaseModel):
    """Public schema representing a persisted Enterprise AI Agent with masked credentials.

    Attributes:
        id (str): Primary key UUID string identifier.
        name (str): Agent display title.
        description (str | None): Specialty summary.
        instructions (str): Persona instructions.
        model (ModelSpec): Model configuration with masked API key.
        tools (list[dict[str, Any]]): Bound tools and MCP integrations.
        knowledge (list[KnowledgeSource]): Connected knowledge bases.
        policies (dict[str, Any] | list[dict[str, Any]]): Governance guardrails.
        avatar (str | None): UI avatar icon.
        is_default (bool): Default agent indicator.
        has_api_key (bool): Boolean indicator denoting if an encrypted API key is stored.
        created_at (datetime): Entity creation timestamp.
        updated_at (datetime): Entity last modification timestamp.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    instructions: str
    model: ModelSpec
    tools: list[dict[str, Any]] = Field(default_factory=list)
    knowledge: list[KnowledgeSource] = Field(default_factory=list)
    policies: dict[str, Any] | list[dict[str, Any]] = Field(default_factory=dict)
    avatar: str | None
    is_default: bool
    has_api_key: bool
    created_at: datetime
    updated_at: datetime
