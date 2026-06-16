# Infrastructure Compose

This folder is a separate infrastructure-oriented stack for local development, staging, and production deployments.

It is intentionally split from the application code so you can later add sibling services for:

- Next.js frontend
- FastAPI backend
- Rust services/workers

## Layout

- `compose.dev.yml`: local development with Compose Watch
- `compose.runtime.yml`: hardened runtime stack used by both staging and production
- `env/`: runtime environment files plus versioned templates
- `proxy/`: Caddy reverse-proxy config for runtime deployments

## Current assumptions

- The Next.js app lives at `../app`
- The app Dockerfile supports `dev` and `runner` targets
- Staging and production use the Next.js standalone output
- The FastAPI service lives at `../ai-services`
- The Rust audio worker lives at `../audio-worker`

If you later move this folder into a separate Git repository, update the static build contexts in `compose.dev.yml` and `compose.runtime.yml`.

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
docker compose -f infra/compose.runtime.yml --env-file infra/env/stack.staging.env up --build -d
docker compose -f infra/compose.runtime.yml --env-file infra/env/stack.prod.env up --build -d
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

For staging, apply migrations after the stack is up:

```bash
make staging
make staging-prisma-migrate
```

`make staging-prisma-migrate` builds the Next.js `tooling` Docker stage and runs the local Prisma CLI from that image on the staging Compose network. It does not run `npx prisma` from a blank Node image, so a temporary npm/DNS issue on the VPS does not block migrations after the app image dependencies have been built.

Or directly:

```bash
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma migrate dev
docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env exec nextjs npx prisma studio --hostname 0.0.0.0 --port 5555
```

## Runtime config and secrets

Each environment is started with one ignored runtime env file:

- `env/stack.dev.env`
- `env/stack.staging.env`
- `env/stack.prod.env`

For staging or production on a VPS, copy the matching template, fill all `replace_me` values, then restrict local permissions:

```bash
chmod 600 infra/env/stack.staging.env
chmod 600 infra/env/stack.prod.env
```

The runtime files contain both regular config and secrets, including:

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_UNIVERSE_MONTHLY_PRICE_ID`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Keep `POSTGRES_PASSWORD` aligned with the password embedded in `DATABASE_URL`.

- The Next.js encryption key must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
- The database URL must contain the full Postgres connection string on a single line.
- Secrets are injected through the Compose environment for operational simplicity. This is easier to manage on a single VPS, but the values are visible to Docker metadata for users with Docker access. Treat Docker group access as root-equivalent.

Templates are present for env files, but real runtime values should live only in ignored `*.env` files.

### Migrating existing runtime volumes

The unified runtime stack uses generic Compose volume keys:

- `postgres_data`
- `redis_data`
- `caddy_data`
- `caddy_config`

Compose still prefixes them with `COMPOSE_PROJECT_NAME`, so staging and production remain isolated. For example, staging uses `universe-staging_postgres_data` while production uses `universe-prod_postgres_data`.

If a previous staging or production deployment already used `postgres_staging_data`, `postgres_prod_data`, or similar environment-specific volume keys, the first `make staging` or `make prod` with `compose.runtime.yml` will create new empty volumes. Copy or rename the old Docker volumes before the first runtime deployment if you need to preserve existing data.

## S3-compatible storage

Development, staging, and production can use a RustFS bucket through the S3-compatible API.

- `S3_PUBLIC_ENDPOINT`: S3 endpoint reachable by the browser, Next.js, and the audio worker, for example `https://s3.evanhgs.fr`
- `S3_REGION`: signing region, defaults to `us-east-1`
- `S3_BUCKET_BEATS`: bucket used for beat audio and images
- `S3_FORCE_PATH_STYLE`: keep `true` for RustFS-style URLs such as `/bucket/key`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: read from the protected `stack.*.env` file

The app does not proxy upload bytes through Next.js. It generates a short-lived presigned `PUT` URL at `/api/storage/uploads/presign`, then the browser uploads directly to RustFS. Public beat thumbnails and audio previews are returned as short-lived presigned `GET` URLs in beat payloads.

For local Compose stacks, avoid `http://localhost:9000` unless the S3 server runs inside the same container as the caller. Use a host LAN IP such as `http://192.168.1.23:9000`, or a real local/public DNS name reachable by both the browser and Docker containers.

## Clerk and forwarded headers

The Next.js service now expects these runtime variables from `infra/env/stack.*.env`:

- `APP_URL`: public origin of the Next.js app
- `AI_SERVICES_URL`: optional browser-facing backend origin. Leave empty when the Python service is internal-only.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated origin allowlist used by Clerk middleware
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key exposed to the browser
- `CLERK_SECRET_KEY`: Clerk server secret
- `CLERK_WEBHOOK_SIGNING_SECRET`: Clerk webhook secret

Stripe marketplace payments and Universe subscription billing read `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_UNIVERSE_MONTHLY_PRICE_ID`, `UNIVERSE_PRICING_MONTHLY_LABEL`, and `STRIPE_AUTOMATIC_TAX_ENABLED` from `infra/env/stack.*.env`.

The Stripe webhook endpoint is `/api/webhooks/stripe`. In local development, use Stripe CLI forwarding and copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

The reverse proxy is configured to preserve the full `Host`, including a local port such as `localhost:3050`, plus `X-Forwarded-Host` and `X-Forwarded-Proto` so Clerk and Next.js can reconstruct the original request origin correctly behind Caddy.

Clerk CSP is enforced in Next.js middleware instead of a static `next.config.ts` header. This keeps Clerk's required domains and per-request nonce generation aligned with the App Router.

In practice, this means `app/.env.local` is no longer required for Clerk when the app is started through Compose. Keep the real keys in ignored runtime files such as `infra/env/stack.dev.env`, not in the versioned `*.example` files.

## Sentry

The Next.js app uses a minimal Sentry setup:

- `NEXT_PUBLIC_SENTRY_DSN`: browser DSN, compiled into the client bundle
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: browser environment label
- `SENTRY_DSN`: optional server DSN; leave empty to reuse `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ENVIRONMENT`: server environment label
- `SENTRY_RELEASE`: optional release identifier, usually the git SHA
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG=universe-a4`, `SENTRY_PROJECT=universe-nextjs`: only needed during image builds when uploading source maps

`NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` must be full DSN URLs from Sentry project settings, for example `https://public-key@o123.ingest.sentry.io/456`. A bare public key is not enough. `SENTRY_AUTH_TOKEN` does not enable event capture at runtime; it is only for build-time source map uploads.

Development and CI can leave all DSNs and Sentry upload variables empty. The SDK is initialized only when a DSN is present, and the Sentry build plugin only runs when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all set.

For staging and production Docker builds, Compose passes the public Sentry variables and upload credentials as build args so Next.js can compile browser config and upload source maps during `next build`. The same runtime env file also injects server-side Sentry variables when the container starts.

The chat unread reminder cron route is instrumented with a Sentry Cron Monitor:

- monitor slug: `universe-nextjs-chat-unread-reminders`
- route: `/api/cron/email/chat-unread-reminders`
- schedule: `0 * * * *` in UTC
- first authorized run upserts the monitor in Sentry when a DSN is configured

## Why the stack is structured this way

- Development uses one Compose file and one env file for both services.
- Compose Watch avoids large bind mounts for `node_modules`, and Python development keeps `.venv` inside the image instead of syncing a host virtualenv.
- Staging and production use the same hardened runtime stack, with different protected env files.
- The runtime stack boots Next.js, internal FastAPI, Postgres, Redis, Caddy, and the Rust audio worker together.
- Caddy is exposed only in front of Next.js; FastAPI is reachable only on the internal Docker network.
- Runtime volumes use generic names inside Compose and are isolated by `COMPOSE_PROJECT_NAME`.
- Each environment uses one ignored runtime `stack.*.env` file, with a compact versioned `stack.*.env.example` template kept alongside it.
- Hardened stacks use a non-root runtime image, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, `tmpfs`, health checks, and a graceful shutdown window.
- Runtime config is injected at container start. Staging is production-mode runtime with explicit diagnostic flags such as `ANALYTICS_TEST_ENABLED=true`; production keeps those flags disabled by default.

## Notes for future FastAPI and Rust services

Keep the same pattern per service:

- `dev` target in each service Dockerfile
- runtime target for staging/production
- internal-only service networking
- proxy publishes ports, app containers do not
- secrets kept in one protected env file for simple VPS operations
- health checks on every dependency, then `depends_on.condition: service_healthy`

## Start the staging server (fr)

### Starting setup

Premierement il faut configurer une nouvelle l'app Clerk (dans les prochaines versions ils sortiront un environnement Staging spécialement)

La je vais partir du principe qu'on teste en local avant de déployer sur un serveur pour s'assurer du bon fonctionnement du staging.

Il nous faudra un environnemenet Clerk, un environnement Stripe, Ngrok et Stripe CLI pour les redirection de webhook en local, un S3 en local ou ailleurs le seul changement est l'endpoint. La bdd et les services rust et python sont gérés dans le compose aussi.

La premiere étape est de copier `infra/env/stack.staging.env.example` vers `infra/env/stack.staging.env`, choisir ses mots de passe, remplir les valeurs `replace_me`, puis lancer `chmod 600 infra/env/stack.staging.env`.

Pour le premier webhook de stripe, hyper simple il suffit de lancer `stripe listen --forward-to localhost:3050/api/webhooks/stripe` et le programme nous retourne un signing secret.
Une version optimisée pour l'essentiel

```bash
stripe listen --events checkout.session.completed checkout.session.async_payment_succeeded checkout.session.async_payment_failed checkout.session.expired --forward-to localhost:3050/api/webhooks/stripe
```

Ensuite pour clerk un peu plus relou car il faut installer ngrok est ouvrir le port 3050 (qui est mon port de test staging) `ngrok http 3050` Ensuite dans clerk il faut configurer l'endpoint du webhook et ajouter le nom de domaine généré par ngrok + le path par ex : `https://festive-climate-pope.ngrok-free.dev/api/webhooks/clerk` et ajouter l'écoute des events u`ser.created user.updated user.deleted`

Oui car le port 3050 est le port de caddy le reverse proxy qui manage les connexions entrantes vers nextjs

## Gestion S3 avec création bucket

Les buckets utilises par l'application sont declares dans les fichiers `infra/env/stack.*.env`:

- dev: `S3_BUCKET_BEATS=universe-dev-beats`
- staging: `S3_BUCKET_BEATS=universe-staging-beats`

Les commandes ci-dessous utilisent AWS CLI contre un endpoint S3-compatible comme RustFS, MinIO, R2 ou AWS S3. Pour RustFS/MinIO, garder `S3_FORCE_PATH_STYLE=true`.

Prerequis:

```bash
aws --version
```

### Dev

Depuis la racine du repo:

```bash
set -a
. infra/env/stack.dev.env
set +a

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
export S3_ADMIN_ENDPOINT="${S3_PUBLIC_ENDPOINT}"

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api create-bucket \
  --bucket "$S3_BUCKET_BEATS" \
  --region "$AWS_DEFAULT_REGION"

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api head-bucket \
  --bucket "$S3_BUCKET_BEATS"
```

Si le bucket existe deja, `create-bucket` peut retourner une erreur `BucketAlreadyOwnedByYou` ou equivalente. Dans ce cas, `head-bucket` suffit pour verifier qu'il est accessible.

Appliquer le CORS necessaire aux uploads directs depuis le navigateur:

```bash
cat >/tmp/universe-s3-cors-dev.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["${APP_URL:-http://localhost:3000}"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api put-bucket-cors \
  --bucket "$S3_BUCKET_BEATS" \
  --cors-configuration file:///tmp/universe-s3-cors-dev.json
```

### Staging

Depuis la racine du repo:

```bash
set -a
. infra/env/stack.staging.env
set +a

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
export S3_ADMIN_ENDPOINT="${S3_PUBLIC_ENDPOINT}"

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api create-bucket \
  --bucket "$S3_BUCKET_BEATS" \
  --region "$AWS_DEFAULT_REGION"

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api head-bucket \
  --bucket "$S3_BUCKET_BEATS"
```

Appliquer le CORS staging. En local staging, `APP_URL` vaut souvent `http://localhost:3050`; sur VPS, il doit valoir l'origine publique, par exemple `https://universe.evanhgs.fr`.

```bash
cat >/tmp/universe-s3-cors-staging.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["$APP_URL"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api put-bucket-cors \
  --bucket "$S3_BUCKET_BEATS" \
  --cors-configuration file:///tmp/universe-s3-cors-staging.json
```

### Commandes utiles

Lister les buckets:

```bash
aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3api list-buckets
```

Lister les objets du bucket configure:

```bash
aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3 ls "s3://$S3_BUCKET_BEATS" --recursive
```

Supprimer un objet de test:

```bash
aws --endpoint-url "$S3_ADMIN_ENDPOINT" s3 rm "s3://$S3_BUCKET_BEATS/path/to/object"
```
