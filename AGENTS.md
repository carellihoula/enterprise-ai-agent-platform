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
