FROM python:3.11-slim

WORKDIR /app

# [Dependencies] Copy requirements and install dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# [Source Code] Copy packages and backend source code
COPY packages/engine /app/packages/engine
COPY backend /app/backend

# [Environment] Configure PYTHONPATH to resolve backend and package imports
ENV PYTHONPATH=/app/backend:/app/packages/engine

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
