FROM ghcr.io/astral-sh/uv:latest AS uv
FROM python:3.11-slim

WORKDIR /app

# Copy uv binary from official image for ultra-fast installs
COPY --from=uv /uv /uvx /bin/

# [Dependencies] Copy project metadata, lockfile, and README.md
COPY pyproject.toml uv.lock README.md ./

# [Install] Sync dependencies using uv
RUN uv sync --frozen --no-dev

# [Source Code] Copy packages and backend source code
COPY packages /app/packages
COPY backend /app/backend

# [Environment] Activate uv virtualenv & set PYTHONPATH
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app/backend:/app/packages/engine

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
