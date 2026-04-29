DEV_ENV_FILE ?= infra/env/stack.dev.env
STAGING_ENV_FILE ?= infra/env/stack.staging.env
PROD_ENV_FILE ?= infra/env/stack.prod.env
APP_DIR ?= app

DEV_COMPOSE := docker compose -f infra/compose.dev.yml --env-file $(DEV_ENV_FILE)
STAGING_COMPOSE := docker compose -f infra/compose.staging.yml --env-file $(STAGING_ENV_FILE)
PROD_COMPOSE := docker compose -f infra/compose.prod.yml --env-file $(PROD_ENV_FILE)

.PHONY: dev dev-down dev-logs dev-ps \
	staging staging-down staging-logs staging-ps staging-prisma-push \
	prod prod-down prod-logs prod-ps \
	next-sh prisma-generate prisma-migrate prisma-studio

define require_env_file
	@test -f $(1) || (echo "Missing $(1). Copy $(1).example to $(1) before running this target." >&2; exit 1)
endef

dev:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) up --build --watch

dev-down:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) down

dev-logs:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) logs -f

dev-ps:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) ps

staging:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(STAGING_COMPOSE) up --build -d

staging-down:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(STAGING_COMPOSE) down

staging-logs:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(STAGING_COMPOSE) logs -f

staging-ps:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(STAGING_COMPOSE) ps

staging-prisma-push:
	$(call require_env_file,$(STAGING_ENV_FILE))
	project_name=$$(awk -F= '/^COMPOSE_PROJECT_NAME=/{print $$2}' $(STAGING_ENV_FILE)); \
	project_name=$${project_name:-universe-staging}; \
	docker run --rm \
		--network "$${project_name}_internal" \
		--env-file $(STAGING_ENV_FILE) \
		-e HOME=/tmp \
		-e NPM_CONFIG_CACHE=/tmp/.npm \
		-v "$(CURDIR)/$(APP_DIR):/workspace:ro" \
		-w /workspace \
		node:24.12.0 \
		sh -lc 'npx prisma db push'

prod:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) up --build -d

prod-down:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) down

prod-logs:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) logs -f

prod-ps:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) ps

next-sh:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs sh

prisma-generate:
	cd $(APP_DIR) && npx prisma generate

prisma-migrate:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma migrate dev

prisma-push:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma db push

prisma-studio:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma studio --hostname 0.0.0.0 --port 5555
