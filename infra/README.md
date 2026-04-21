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
- `env/`: runtime environment files plus versioned templates
- `secrets/`: example secret files and placeholders
- `proxy/`: Caddy reverse-proxy configs for staging and production

## Current assumptions

- The Next.js app lives at `../app`
- The app Dockerfile supports `dev` and `runner` targets
- Staging and production use the Next.js standalone output
- The FastAPI service lives at `../ai-services`

If you later move this folder into a separate Git repository, update the `NEXTJS_*` and `AI_SERVICES_*` build-path variables in the runtime env files or your shell environment.

## Quick start

Development:

```bash
make dev
```

Staging:

```bash
make staging
```

Production:

```bash
make prod
```

Equivalent raw commands remain:

```bash
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env up --build --watch
docker compose -f infra/compose.staging.yml --env-file infra/env/stack.staging.env up --build -d
docker compose -f infra/compose.prod.yml --env-file infra/env/stack.prod.env up --build -d
```

Versioned `*.example` files are templates only. Copy them to the matching `*.env` file before using the stack.

## Prisma workflow

The application env source of truth lives in `infra/env`.

That means Prisma commands should be run inside the `nextjs` container, not from the host shell, so they use the same `DATABASE_URL` and stack env as the app itself.

From the repository root:

```bash
make prisma-generate
make prisma-migrate
make prisma-studio
```

Or directly:

```bash
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma generate
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma migrate dev
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma studio --hostname 0.0.0.0 --port 5555
```

## Recommended secret setup

Create a real secret file before using staging or production:

- `secrets/staging/next_server_actions_encryption_key.txt`
- `secrets/staging/database_url.txt`
- `secrets/prod/next_server_actions_encryption_key.txt`
- `secrets/prod/database_url.txt`

- The Next.js encryption key file must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
- The database URL file must contain the full Postgres connection string on a single line.

Templates are present for env files and secret filenames, but real runtime values should live only in ignored `*.env` and `secrets/**/*.txt` files.

## Why the stack is structured this way

- Development uses one Compose file and one env file for both services.
- Compose Watch avoids large bind mounts for `node_modules`, and Python development keeps `.venv` inside the image instead of syncing a host virtualenv.
- Staging and production place a reverse proxy in front of Next.js, which aligns with Next.js self-hosting guidance.
- The staging and production stacks now boot both Next.js and FastAPI together with one Compose file per environment.
- The FastAPI service still uses Caddy in front of Uvicorn and runs a single Uvicorn process per container.
- Each environment now uses one ignored runtime `stack.*.env` file, with a versioned `stack.*.env.example` template kept alongside it.
- Hardened stacks use a non-root runtime image, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, `tmpfs`, health checks, and a graceful shutdown window.
- Runtime config is injected at container start, and sensitive values can be mounted as secrets instead of remaining visible in Compose environment blocks.

## Notes for future FastAPI and Rust services

Keep the same pattern per service:

- `dev` target in each service Dockerfile
- runtime target for staging/production
- internal-only service networking
- proxy publishes ports, app containers do not
- secrets mounted as files when possible
- health checks on every dependency, then `depends_on.condition: service_healthy`
