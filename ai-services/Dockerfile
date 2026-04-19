ARG PYTHON_VERSION=3.14-slim
ARG UV_VERSION=0.8.22

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uvbin

FROM python:${PYTHON_VERSION} AS base
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_PYTHON_DOWNLOADS=0
ENV UV_PROJECT_ENVIRONMENT=/app/.venv
ENV PATH=/app/.venv/bin:/usr/local/bin:/bin:$PATH
WORKDIR /app
COPY --from=uvbin /uv /uvx /bin/

FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

FROM base AS dev
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --dev --no-install-project
COPY . .
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS runner
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid 1001 app
COPY --from=deps /app/.venv /app/.venv
COPY --chown=app:app . .
USER app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
