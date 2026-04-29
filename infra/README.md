# Infrastructure Compose

This folder is a separate infrastructure-oriented stack for local development, staging, and production deployments.

It is intentionally split from the application code so you can later add sibling services for:

- Next.js frontend
- FastAPI backend
- Rust services/workers

## Layout

- `compose.dev.yml`: local development with Compose Watch
- `compose.staging.yml`: hardened pre-production stack for Next.js + FastAPI + Rust audio worker
- `compose.prod.yml`: hardened production stack for Next.js + FastAPI
- `env/`: runtime environment files plus versioned templates
- `secrets/`: production secret examples and placeholders
- `proxy/`: Caddy reverse-proxy configs for staging and production

## Current assumptions

- The Next.js app lives at `../app`
- The app Dockerfile supports `dev` and `runner` targets
- Staging and production use the Next.js standalone output
- The FastAPI service lives at `../ai-services`
- The Rust audio worker lives at `../audio-worker`

If you later move this folder into a separate Git repository, update the `NEXTJS_*`, `AI_SERVICES_*`, and `AUDIO_WORKER_*` build-path variables in the runtime env files or your shell environment.

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

## Runtime config and secrets

Each environment is started with one ignored runtime env file:

- `env/stack.dev.env`
- `env/stack.staging.env`
- `env/stack.prod.env`

For staging on a VPS, copy `env/stack.staging.env.example` to `env/stack.staging.env`, fill all `replace_me` values, then restrict local permissions:

```bash
chmod 600 infra/env/stack.staging.env
```

The staging file contains both regular config and secrets, including:

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Keep `POSTGRES_PASSWORD` aligned with the password embedded in `DATABASE_URL`.

Production still supports Docker secret files:

- `secrets/prod/next_server_actions_encryption_key.txt`
- `secrets/prod/database_url.txt`
- `secrets/prod/clerk_secret_key.txt`
- `secrets/prod/clerk_webhook_signing_secret.txt`
- `secrets/prod/stripe_secret_key.txt`
- `secrets/prod/stripe_webhook_secret.txt`

- The Next.js encryption key must be a base64-encoded AES key as documented by Next.js for multi-instance deployments.
- The database URL must contain the full Postgres connection string on a single line.
- In staging, secrets are injected through the Compose environment for operational simplicity. This is easier to manage on a single VPS, but the values are visible to Docker metadata for users with Docker access. Treat Docker group access as root-equivalent.

Templates are present for env files and production secret filenames, but real runtime values should live only in ignored `*.env` and `secrets/**/*.txt` files.

## S3-compatible storage

Development and staging can use a RustFS bucket through the S3-compatible API.

- `S3_PUBLIC_ENDPOINT`: S3 endpoint reachable by the browser, Next.js, and the audio worker, for example `https://s3.evanhgs.fr`
- `S3_REGION`: signing region, defaults to `us-east-1`
- `S3_BUCKET_BEATS`: bucket used for beat audio and images
- `S3_FORCE_PATH_STYLE`: keep `true` for RustFS-style URLs such as `/bucket/key`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: development and staging read these from `stack.*.env`; production can keep using Docker secrets

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

Stripe marketplace payments use the same environment split:

- Development and staging read `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_AUTOMATIC_TAX_ENABLED` from `infra/env/stack.*.env`.
- Production reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Docker secrets:
  - `infra/secrets/prod/stripe_secret_key.txt`
  - `infra/secrets/prod/stripe_webhook_secret.txt`
- `STRIPE_AUTOMATIC_TAX_ENABLED` stays in `stack.*.env` because it is configuration, not a secret.

The Stripe webhook endpoint is `/api/webhooks/stripe`. In local development, use Stripe CLI forwarding and copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

The reverse proxy is configured to preserve the full `Host`, including a local port such as `localhost:3050`, plus `X-Forwarded-Host` and `X-Forwarded-Proto` so Clerk and Next.js can reconstruct the original request origin correctly behind Caddy.

Clerk CSP is enforced in Next.js middleware instead of a static `next.config.ts` header. This keeps Clerk's required domains and per-request nonce generation aligned with the App Router.

In practice, this means `app/.env.local` is no longer required for Clerk when the app is started through Compose. Keep the real keys in ignored runtime files such as `infra/env/stack.dev.env`, not in the versioned `*.example` files.

## Why the stack is structured this way

- Development uses one Compose file and one env file for both services.
- Compose Watch avoids large bind mounts for `node_modules`, and Python development keeps `.venv` inside the image instead of syncing a host virtualenv.
- Staging and production place a reverse proxy in front of Next.js, which aligns with Next.js self-hosting guidance.
- The staging stack boots Next.js, internal FastAPI, Postgres, Caddy, and the Rust audio worker together.
- The production stack boots Next.js, FastAPI, and Caddy together.
- In staging, Caddy is exposed only in front of Next.js; FastAPI is reachable only on the internal Docker network.
- Each environment now uses one ignored runtime `stack.*.env` file, with a versioned `stack.*.env.example` template kept alongside it.
- Hardened stacks use a non-root runtime image, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, `tmpfs`, health checks, and a graceful shutdown window.
- Runtime config is injected at container start. Staging favors one protected env file for simple VPS operations; production can mount sensitive values as Docker secrets.

## Notes for future FastAPI and Rust services

Keep the same pattern per service:

- `dev` target in each service Dockerfile
- runtime target for staging/production
- internal-only service networking
- proxy publishes ports, app containers do not
- secrets mounted as files for production, or kept in one protected env file for simpler staging VPS operations
- health checks on every dependency, then `depends_on.condition: service_healthy`

## Start the staging server (fr)

### Starting setup

Premierement il faut configurer une nouvelle l'app Clerk (dans les prochaines versions ils sortiront un environnement Staging spécialement)

La je vais partir du principe qu'on teste en local avant de déployer sur un serveur pour s'assurer du bon fonctionnement du staging.

Il nous faudra un environnemenet Clerk, un environnement Stripe, Ngrok et Stripe CLI pour les redirection de webhook en local, un S3 en local ou ailleurs le seul changement est l'endpoint. La bdd et les services rust et python sont gérés dans le compose aussi.

La premiere étape est de copier le fichier staging.env.example choisir ses mdp et changer les valeurs par défaut dans les variables et normalement il restera plus que les variables des webhooks

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
