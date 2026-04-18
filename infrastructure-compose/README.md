# Infrastructure Compose

This folder is a separate infrastructure-oriented stack for local development, staging, and production deployments.

It is intentionally split from the application code so you can later add sibling services for:

- Next.js frontend
- FastAPI backend
- Rust services/workers

## Layout

- `compose.dev.yml`: local development with Compose Watch
- `compose.staging.yml`: hardened pre-production stack
- `compose.prod.yml`: hardened production stack
- `compose.ai-services.dev.yml`: local FastAPI development
- `compose.ai-services.staging.yml`: hardened FastAPI staging stack
- `compose.ai-services.prod.yml`: hardened FastAPI production stack
- `env/`: example runtime environment files
- `secrets/`: example secret files and placeholders
- `proxy/`: Caddy reverse-proxy configs for staging and production

## Current assumptions

- The Next.js app lives at `../app`
- The app Dockerfile supports `dev` and `runner` targets
- Staging and production use the Next.js standalone output
- The FastAPI service lives at `../ai-services`

If you later move this folder into a separate Git repository, update `NEXTJS_CONTEXT` and `NEXTJS_DOCKERFILE` in the `.env` files or your shell environment.

## Quick start

Development:

```bash
docker compose -f infrastructure-compose/compose.dev.yml --env-file infrastructure-compose/env/dev/stack.env.example up --build --watch
```

Staging:

```bash
docker compose -f infrastructure-compose/compose.staging.yml --env-file infrastructure-compose/env/staging/stack.env.example up --build -d
```

Production:

```bash
docker compose -f infrastructure-compose/compose.prod.yml --env-file infrastructure-compose/env/prod/stack.env.example up --build -d
```

AI services development:

```bash
docker compose -f infrastructure-compose/compose.ai-services.dev.yml --env-file infrastructure-compose/env/dev/ai-services-stack.env.example up --build --watch
```

AI services staging:

```bash
docker compose -f infrastructure-compose/compose.ai-services.staging.yml --env-file infrastructure-compose/env/staging/ai-services-stack.env.example up --build -d
```

AI services production:

```bash
docker compose -f infrastructure-compose/compose.ai-services.prod.yml --env-file infrastructure-compose/env/prod/ai-services-stack.env.example up --build -d
```

## Recommended secret setup

Create real secret files before using staging or production:

- `secrets/staging/next_server_actions_encryption_key.txt`
- `secrets/prod/next_server_actions_encryption_key.txt`

The file content must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
Placeholder files are present so Compose can start locally, but they must be replaced before any real staging or production deployment.

## Why the stack is structured this way

- Development uses Compose Watch instead of large bind mounts for `node_modules`, following Docker's current recommendation for containerized dev workflows.
- Python development follows the same idea with Compose Watch and a dedicated `dev` target, while keeping `.venv` inside the image instead of syncing a host virtualenv.
- Staging and production place a reverse proxy in front of Next.js, which aligns with Next.js self-hosting guidance.
- The FastAPI stacks also place Caddy in front of Uvicorn, and use a single Uvicorn process per container.
- Hardened stacks use a non-root runtime image, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, `tmpfs`, health checks, and a graceful shutdown window.
- Runtime config is injected at container start, so the same image can be promoted across environments when variables are server-side and resolved dynamically.

## Notes for future FastAPI and Rust services

Keep the same pattern per service:

- `dev` target in each service Dockerfile
- runtime target for staging/production
- internal-only service networking
- proxy publishes ports, app containers do not
- secrets mounted as files when possible
- health checks on every dependency, then `depends_on.condition: service_healthy`
