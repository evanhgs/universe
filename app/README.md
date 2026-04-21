## Environment

The app does not own its own `.env` file.

The source of truth is `../infra/env`, and the intended workflow is to run the app through Docker Compose so the `nextjs` service receives `DATABASE_URL`, `APP_ENV`, `NODE_ENV`, and the rest of the stack configuration from `infra`.

Use the ignored runtime files such as `infra/env/stack.dev.env`, not the versioned `*.example` templates.

`prisma.config.ts` is intentionally minimal:

- `prisma generate` must work during Docker image builds even before runtime env injection
- database commands such as `migrate`, `db pull`, and `studio` must be executed in an environment where `DATABASE_URL` is already injected

## Validation

Useful local checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

`npm run typecheck` uses `tsconfig.typecheck.json` so the standalone TypeScript pass stays deterministic even when Next.js updates `tsconfig.json` with dev-time route types during builds.

## Local workflow

From the repository root:

```bash
make dev
```

Useful commands:

```bash
make dev-down
make dev-logs
make dev-ps
make next-sh
make prisma-generate
make prisma-migrate
make prisma-studio
```

Once the stack is up, the app is available on [http://localhost:3000](http://localhost:3000).

## Prisma

Prisma is expected to run inside the `nextjs` container in development. That keeps one single source of truth for environment variables and avoids a second local `.env` layer inside `app`.

Import `getPrisma()` from `src/lib/prisma.ts` inside server-only code paths. The module now uses `server-only` and lazy initialization so build-time imports do not crash when `DATABASE_URL` is absent.

Examples:

```bash
make prisma-generate
make prisma-migrate
make prisma-studio
```
