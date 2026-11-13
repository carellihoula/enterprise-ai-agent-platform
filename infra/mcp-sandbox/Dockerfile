# Disposable, isolated MCP sandbox runtime for testing stdio MCP servers.
# Uses Debian slim (glibc) for broad compatibility with Node.js, Python, and native binaries.
# Contains NO application code, NO database credentials, and NO backend secrets.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages uv \
    && mkdir -p /tmp/mcp-home \
    && chmod 1777 /tmp/mcp-home

ENV HOME=/tmp/mcp-home
ENV NPM_CONFIG_CACHE=/tmp/mcp-home/.npm
ENV UV_CACHE_DIR=/tmp/mcp-home/.cache/uv

USER nobody
WORKDIR /tmp
