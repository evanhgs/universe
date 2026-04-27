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

That means database-aware Prisma commands should be run inside the `nextjs` container, so they use the same `DATABASE_URL` and stack env as the app itself.

From the repository root:

```bash
make prisma-generate
make prisma-migrate
make prisma-studio
```

`make prisma-generate` is the exception: it runs from `app/` on the host so the generated client is written back into the repository at `app/generated/prisma`.

Or directly:

```bash
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma migrate dev
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma studio --hostname 0.0.0.0 --port 5555
```

## Recommended secret setup

Create a real secret file before using staging or production:

- `secrets/staging/next_server_actions_encryption_key.txt`
- `secrets/staging/database_url.txt`
- `secrets/staging/postgres_password.txt`
- `secrets/staging/clerk_secret_key.txt`
- `secrets/staging/clerk_webhook_signing_secret.txt`
- `secrets/staging/stripe_secret_key.txt`
- `secrets/staging/stripe_webhook_secret.txt`
- `secrets/staging/s3_access_key_id.txt`
- `secrets/staging/s3_secret_access_key.txt`
- `secrets/prod/next_server_actions_encryption_key.txt`
- `secrets/prod/database_url.txt`
- `secrets/prod/clerk_secret_key.txt`
- `secrets/prod/clerk_webhook_signing_secret.txt`
- `secrets/prod/stripe_secret_key.txt`
- `secrets/prod/stripe_webhook_secret.txt`

- The Next.js encryption key file must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
- The database URL file must contain the full Postgres connection string on a single line.
- Staging Postgres reads `POSTGRES_PASSWORD_FILE` from `secrets/staging/postgres_password.txt`. Keep this value aligned with the password embedded in `secrets/staging/database_url.txt`.
- Secret file values are injected by the container entrypoint and are not listed in the Compose `environment` block.

Templates are present for env files and secret filenames, but real runtime values should live only in ignored `*.env` and `secrets/**/*.txt` files.

## S3-compatible storage

Development and staging can use a RustFS bucket through the S3-compatible API.

- `S3_PUBLIC_ENDPOINT`: browser-reachable S3 endpoint, for example `https://s3.evanhgs.fr`
- `S3_REGION`: signing region, defaults to `us-east-1`
- `S3_BUCKET_BEATS`: bucket used for beat audio and images
- `S3_FORCE_PATH_STYLE`: keep `true` for RustFS-style URLs such as `/bucket/key`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: development can read these from `stack.dev.env`; staging reads them from Docker secrets

The app does not proxy upload bytes through Next.js. It generates a short-lived presigned `PUT` URL at `/api/storage/uploads/presign`, then the browser uploads directly to RustFS. Public beat thumbnails and audio previews are returned as short-lived presigned `GET` URLs in beat payloads.

## Clerk and forwarded headers

The Next.js service now expects these runtime variables from `infra/env/stack.*.env`:

- `APP_URL`: public origin of the Next.js app
- `AI_SERVICES_URL`: public origin of the backend API when browser calls are cross-origin
- `CLERK_AUTHORIZED_PARTIES`: comma-separated origin allowlist used by Clerk middleware
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key exposed to the browser
- `CLERK_SECRET_KEY`: Clerk server secret read from Docker secrets in staging and production
- `CLERK_WEBHOOK_SIGNING_SECRET`: Clerk webhook secret read from Docker secrets in staging and production

Stripe marketplace payments use the same environment split:

- Development reads `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_AUTOMATIC_TAX_ENABLED` from `infra/env/stack.dev.env`.
- Staging and production read `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Docker secrets:
  - `infra/secrets/staging/stripe_secret_key.txt`
  - `infra/secrets/staging/stripe_webhook_secret.txt`
  - `infra/secrets/prod/stripe_secret_key.txt`
  - `infra/secrets/prod/stripe_webhook_secret.txt`
- `STRIPE_AUTOMATIC_TAX_ENABLED` stays in `stack.*.env` because it is configuration, not a secret.

The Stripe webhook endpoint is `/api/webhooks/stripe`. In local development, use Stripe CLI forwarding and copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

The reverse proxy is configured to preserve `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-Port` so Clerk and Next.js can reconstruct the original request origin correctly behind Caddy.

Clerk CSP is enforced in Next.js middleware instead of a static `next.config.ts` header. This keeps Clerk's required domains and per-request nonce generation aligned with the App Router.

In practice, this means `app/.env.local` is no longer required for Clerk when the app is started through Compose. Keep the real keys in ignored runtime files such as `infra/env/stack.dev.env`, not in the versioned `*.example` files.

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
