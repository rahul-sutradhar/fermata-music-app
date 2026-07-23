FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1
WORKDIR /app

# Install build deps for compiling wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# Build wheels in a separate dir to avoid re-installing at runtime
RUN python -m pip install --upgrade pip wheel setuptools \
    && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Minimal runtime deps (libpq for Postgres client libs)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels from builder and install
COPY --from=builder /wheels /wheels
RUN pip install --no-cache /wheels/*.whl

# Copy application code
COPY . .

# Use a non-root user for improved security
RUN groupadd --system app && useradd --system --gid app --create-home app \
    && chown -R app:app /app
USER app

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
