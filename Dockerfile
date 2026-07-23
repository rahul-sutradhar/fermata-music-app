FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip wheel setuptools \
    && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Added ca-certificates (needed for yt-dlp's EJS remote-component HTTPS fetch)
# and pinned nodejs explicitly so it's not left to whatever apt resolves
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       libpq5 ffmpeg nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /wheels /wheels
RUN pip install --no-cache /wheels/*.whl

# Force yt-dlp to latest at build time, independent of requirements.txt cache state
RUN pip install --no-cache --upgrade "yt-dlp>=2026.7.1"

COPY . .

RUN groupadd --system app && useradd --system --gid app --create-home app \
    && chown -R app:app /app
USER app

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]