DEV_COMPOSE := docker compose -f infra/compose.dev.yml --env-file infra/env/stack.dev.env.example
STAGING_COMPOSE := docker compose -f infra/compose.staging.yml --env-file infra/env/stack.staging.env.example
PROD_COMPOSE := docker compose -f infra/compose.prod.yml --env-file infra/env/stack.prod.env.example

.PHONY: dev dev-down dev-logs dev-ps \
	staging staging-down staging-logs staging-ps \
	prod prod-down prod-logs prod-ps \
	next-sh prisma-generate prisma-migrate prisma-studio

dev:
	$(DEV_COMPOSE) up --build --watch

dev-down:
	$(DEV_COMPOSE) down

dev-logs:
	$(DEV_COMPOSE) logs -f

dev-ps:
	$(DEV_COMPOSE) ps

staging:
	$(STAGING_COMPOSE) up --build -d

staging-down:
	$(STAGING_COMPOSE) down

staging-logs:
	$(STAGING_COMPOSE) logs -f

staging-ps:
	$(STAGING_COMPOSE) ps

prod:
	$(PROD_COMPOSE) up --build -d

prod-down:
	$(PROD_COMPOSE) down

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-ps:
	$(PROD_COMPOSE) ps

next-sh:
	$(DEV_COMPOSE) exec nextjs sh

prisma-generate:
	$(DEV_COMPOSE) exec nextjs npx prisma generate

prisma-migrate:
	$(DEV_COMPOSE) exec nextjs npx prisma migrate dev

prisma-studio:
	$(DEV_COMPOSE) exec nextjs npx prisma studio --hostname 0.0.0.0 --port 5555
