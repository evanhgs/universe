# Infrastructure Compose

This folder is a separate infrastructure-oriented stack for local development, staging, and production deployments.

It is intentionally split from the application code so you can later add sibling services for:

- Next.js frontend
- FastAPI backend
- Rust services/workers

## Layout

- `compose.dev.yml`: local development with Compose Watch
- `compose.staging.yml`: hardened pre-production stack for Next.js + FastAPI
- `compose.prod.yml`: hardened production stack for Next.js + FastAPI
- `env/`: example runtime environment files
- `secrets/`: example secret files and placeholders
- `proxy/`: Caddy reverse-proxy configs for staging and production

## Current assumptions

- The Next.js app lives at `../app`
- The app Dockerfile supports `dev` and `runner` targets
- Staging and production use the Next.js standalone output
- The FastAPI service lives at `../ai-services`

If you later move this folder into a separate Git repository, update the `NEXTJS_*` and `AI_SERVICES_*` build-path variables in the `.env` files or your shell environment.

## Quick start

Development:

```bash
docker compose -f infrastructure-compose/compose.dev.yml --env-file infrastructure-compose/env/stack.dev.env.example up --build --watch
```

Staging:

```bash
docker compose -f infrastructure-compose/compose.staging.yml --env-file infrastructure-compose/env/stack.staging.env.example up --build -d
```

Production:

```bash
docker compose -f infrastructure-compose/compose.prod.yml --env-file infrastructure-compose/env/stack.prod.env.example up --build -d
```

## Recommended secret setup

Create a real secret file before using staging or production:

- `secrets/staging/next_server_actions_encryption_key.txt`
- `secrets/prod/next_server_actions_encryption_key.txt`

The file content must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
Placeholder files are present so Compose can start locally, but they must be replaced before any real staging or production deployment.

## Why the stack is structured this way

- Development uses one Compose file and one env file for both services.
- Compose Watch avoids large bind mounts for `node_modules`, and Python development keeps `.venv` inside the image instead of syncing a host virtualenv.
- Staging and production place a reverse proxy in front of Next.js, which aligns with Next.js self-hosting guidance.
- The staging and production stacks now boot both Next.js and FastAPI together with one Compose file per environment.
- The FastAPI service still uses Caddy in front of Uvicorn and runs a single Uvicorn process per container.
- Each environment now uses a single `stack.env.example` file that contains both Compose variables and the runtime values injected into the services.
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
