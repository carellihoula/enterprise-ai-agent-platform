# Code Quality, Documentation & Language Directives (Mandatory)

All code modifications, new files, docstrings, and inline comments in this repository **MUST STRICTLY** adhere to the following documentation, language, and comment standards.

---

## 1. Primary Language Requirement
- **English Only**: All source code, docstrings, inline comments, variable names, function names, commit messages, and documentation files must be written **EXCLUSIVELY in English**.

---

## 2. Mandatory Docstrings (Google Format)
- **Required Coverage**: Every module, class, method, and function must have a multi-line docstring adhering to the **Google Python Docstring Style**.
- **Required Sections**:
  - **Summary**: Concise explanation of the component's primary responsibility.
  - **Args:**: List of all parameters, including types and explicit descriptions.
  - **Returns:**: Return type and description of the returned value (if applicable).
  - **Raises:**: List of exceptions thrown and the conditions under which they occur (if applicable).

### Python Example:
```python
def compile_agent_spec(spec_yaml: str, validate_schema: bool = True) -> dict:
    """Compiles a raw YAML agent specification into an executable agent runtime configuration.

    Args:
        spec_yaml (str): The raw YAML input string defining the agent.
        validate_schema (bool, optional): Whether to validate the compiled output
            against the canonical JSON schema. Defaults to True.

    Returns:
        dict: The structured executable configuration dictionary for the Agent Engine.

    Raises:
        ValueError: If the YAML input is malformed or schema validation fails.
    """
    pass
```

---

## 3. Uniform Inline Comment Style
- **Single Style Standard**: Use the `# [Context/Reason] Explanation` format for all inline comments.
- **"Why, not What" Principle**: Explain the technical rationale or design decision behind the code, never restate what the line of code self-evidently does.
- **No Noise / Trivial Comments**: Trivial comments (e.g., `# import json` or `# increment counter`) are strictly forbidden.

### Inline Comment Example:
```python
# [Performance] Check in-memory cache first to avoid redundant API latency during evaluation loops
if request_hash in self._response_cache:
    return self._response_cache[request_hash]
```

---

## 4. Preservation & Integrity
- Always preserve existing comments and docstrings during refactoring unless the underlying technical contract has changed.

---

## 5. Frontend UI Component & Icon Standards
- **shadcn/ui & Tailwind CSS**: Always use **shadcn/ui** primitives and Tailwind CSS for frontend components instead of building UI components from scratch.
- **Lucide React Icons**: Use `lucide-react` icons for UI elements and visual indicators.
- **No Emojis**: Do NOT use raw emojis in UI code, buttons, or layouts; replace them with proper `lucide-react` SVG icon components.

---

## 6. Database Migration Standards (Alembic)
- **Alembic Command Generation**: NEVER create, edit, or write database migration files manually. Always use Alembic CLI commands to inspect models and generate migration revisions.
  - To generate a new migration revision: `uv run alembic revision --autogenerate -m "<descriptive_message>"`
  - To apply migrations: `uv run alembic upgrade head`
- **ORM Model Single Source of Truth**: Update SQLAlchemy ORM entity models in `backend/app/models/` first, then run Alembic autogenerate to capture the DDL changes cleanly.

---

## 7. React Component Architecture & Modularization Standards (Mandatory)
- **Strict Prohibition of Monolithic Files**: NEVER write or maintain monolithic component files exceeding 250–300 lines of code. Monster files (500–1000+ lines) are strictly prohibited.
- **Component Decomposition & Single Responsibility**:
  - Every component must have a single, clearly defined responsibility.
  - Break complex screens and views into small, focused sub-components organized in dedicated feature subdirectories (e.g., `components/<feature_name>/` or `components/assistant-config/`).
  - Use `index.ts` barrel files to group and cleanly re-export related sub-components.
- **Separation of Concerns**:
  - **Containers / Orchestrators**: Manage state, effects, API integration, and business logic.
  - **Presentational Sub-Components**: Accept typed props, remain purely presentational, and emit events via callbacks.
  - **Custom Hooks**: Extract complex lifecycle logic, local storage synchronization, or data streaming into reusable custom hooks (e.g., `hooks/useChatSession.ts`, `hooks/useModelConfig.ts`).
- **Composition over Large JSX Trees**:
  - Assemble UIs through component composition (slots, `children`, composable cards, sections, and items) rather than deeply nested inline JSX blocks.
  - Sub-views (e.g., headers, credential panels, model list selectors, slider controls) must reside in separate files and be assembled at the parent view level.
- **Targeted Performance & Memoization**:
  - Small, isolated components localize re-renders, preventing expensive full-tree recalculations during real-time LLM token streaming and rapid user input events.
