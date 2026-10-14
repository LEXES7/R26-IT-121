# DeepSentinel Backend — production image
# Builds from poetry.lock so every deploy resolves to byte-identical dependencies.

FROM python:3.12-slim AS builder

ENV POETRY_VERSION=2.4.1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}"

# Copy only dependency manifests first so this layer caches across code changes
COPY pyproject.toml poetry.lock ./

# --no-root: package-mode=false, we install deps only
RUN poetry install --only main --no-root


FROM python:3.12-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 deepsentinel

# Bring in the resolved virtualenv from the builder stage
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY --chown=deepsentinel:deepsentinel backend/ ./backend/
COPY --chown=deepsentinel:deepsentinel data/ ./data/

# The four feature packages that sit beside backend/ rather than inside it.
# backend.main imports each behind `try: ... except Exception: log and carry
# on`, so leaving them out of the image did not fail the build, fail a health
# probe, or appear in any log a deploy watches — the API simply came up with
# /api/monitor, /api/chat, /api/assistant and /api/enquiry missing, and the
# console answered "Request failed with status code 404" the moment anyone
# signed in. Together they are under a megabyte.
COPY --chown=deepsentinel:deepsentinel monitor/ ./monitor/
COPY --chown=deepsentinel:deepsentinel assistant/ ./assistant/
COPY --chown=deepsentinel:deepsentinel chatbot/ ./chatbot/
COPY --chown=deepsentinel:deepsentinel enquiry/ ./enquiry/

RUN mkdir -p chroma_store models && chown -R deepsentinel:deepsentinel /app

# Run unprivileged — never as root in a bank environment
USER deepsentinel

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

LABEL org.opencontainers.image.title="DeepSentinel Fusion Engine" \
      org.opencontainers.image.description="Multi-modal AI fraud detection platform" \
      org.opencontainers.image.version="1.0.0"
