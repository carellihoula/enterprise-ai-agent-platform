# Disposable, isolated MCP sandbox runtime for testing and executing stdio MCP servers.
# Uses Debian slim (glibc) for broad compatibility with Node.js, Python, Chromium, and native binaries.
# Contains NO application code, NO database credentials, and NO backend secrets.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    chromium \
    && mkdir -p /opt/google/chrome \
    && printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox "$@"\n' > /opt/google/chrome/chrome \
    && chmod +x /opt/google/chrome/chrome \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages uv \
    && mkdir -p /tmp/mcp-home \
    && chmod 1777 /tmp/mcp-home

ENV HOME=/tmp/mcp-home
ENV NPM_CONFIG_CACHE=/tmp/mcp-home/.npm
ENV UV_CACHE_DIR=/tmp/mcp-home/.cache/uv
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

USER nobody
WORKDIR /tmp
