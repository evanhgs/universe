DEV_ENV_FILE ?= infra/env/stack.dev.env
STAGING_ENV_FILE ?= infra/env/stack.staging.env
PROD_ENV_FILE ?= infra/env/stack.prod.env
APP_DIR ?= app
DEV_DB_HOST ?= localhost
DEV_DB_PORT ?= 5432
PRISMA_STUDIO_PORT ?= 5555

DEV_COMPOSE := docker compose -f infra/compose.dev.yml --env-file $(DEV_ENV_FILE)
STAGING_COMPOSE := docker compose -f infra/compose.staging.yml --env-file $(STAGING_ENV_FILE)
PROD_COMPOSE := docker compose -f infra/compose.prod.yml --env-file $(PROD_ENV_FILE)

SEED_ENV_ARGS :=
ifneq ($(strip $(SEED_BEAT_COUNT)),)
SEED_ENV_ARGS += -e SEED_BEAT_COUNT=$(SEED_BEAT_COUNT)
endif
ifneq ($(strip $(SEED_SELLER_COUNT)),)
SEED_ENV_ARGS += -e SEED_SELLER_COUNT=$(SEED_SELLER_COUNT)
endif
ifneq ($(strip $(SEED_ANALYTICS_EVENTS)),)
SEED_ENV_ARGS += -e SEED_ANALYTICS_EVENTS=$(SEED_ANALYTICS_EVENTS)
endif
ifneq ($(strip $(SEED_BUYER_COUNT)),)
SEED_ENV_ARGS += -e SEED_BUYER_COUNT=$(SEED_BUYER_COUNT)
endif
ifneq ($(strip $(SEED_RANDOM_SEED)),)
SEED_ENV_ARGS += -e SEED_RANDOM_SEED=$(SEED_RANDOM_SEED)
endif
ifneq ($(strip $(SEED_AUDIO_BUCKET)),)
SEED_ENV_ARGS += -e SEED_AUDIO_BUCKET=$(SEED_AUDIO_BUCKET)
endif
ifneq ($(strip $(SEED_AUDIO_OBJECT_KEY)),)
SEED_ENV_ARGS += -e SEED_AUDIO_OBJECT_KEY=$(SEED_AUDIO_OBJECT_KEY)
endif

.PHONY: \
	dev dev-down dev-logs dev-ps \
	dev-next-sh dev-prisma-generate dev-prisma-migrate dev-prisma-migrate-container \
	dev-prisma-push dev-prisma-push-container dev-prisma-studio dev-prisma-studio-container \
	dev-db-seed-benchmark \
	dev-test dev-test-next dev-test-rust dev-test-python \
	staging staging-down staging-logs staging-ps staging-prisma-migrate staging-prisma-push \
	prod prod-down prod-logs prod-ps \
	db-seed-benchmark next-sh prisma-generate prisma-migrate prisma-push prisma-studio test

define require_env_file
	@test -f $(1) || (echo "Missing $(1). Copy $(1).example to $(1) before running this target." >&2; exit 1)
endef

define run_prisma_tooling
	project_name=$$(awk -F= '/^COMPOSE_PROJECT_NAME=/{print $$2}' $(1)); \
	project_name=$${project_name:-$(2)}; \
	docker build --target tooling -t "$${project_name}-nextjs-prisma" $(APP_DIR); \
	docker run --rm \
		--network "$${project_name}_internal" \
		--env-file $(1) \
		-e HOME=/tmp \
		-e NPM_CONFIG_CACHE=/tmp/.npm \
		"$${project_name}-nextjs-prisma" \
		$(3)
endef

define run_dev_prisma_host
	set -a; . $(DEV_ENV_FILE); set +a; \
	DATABASE_URL="postgresql://$${POSTGRES_USER:-universe}:$${POSTGRES_PASSWORD:-universe_dev_password}@$(DEV_DB_HOST):$(DEV_DB_PORT)/$${POSTGRES_DB:-universe_dev}?schema=public"; \
	cd $(APP_DIR) && DATABASE_URL="$$DATABASE_URL" $(1)
endef

# -----------------------------------------------------------------------------
# Dev
# -----------------------------------------------------------------------------

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

dev-next-sh:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs sh

dev-prisma-generate:
	cd $(APP_DIR) && npx prisma generate

dev-prisma-migrate:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(call run_dev_prisma_host,npx prisma migrate dev $(if $(NAME),--name $(NAME),))

dev-prisma-migrate-container:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma migrate dev

dev-prisma-push:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(call run_dev_prisma_host,npx prisma db push)

dev-prisma-push-container:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma db push

dev-prisma-studio:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(call run_dev_prisma_host,npx prisma studio --port $(PRISMA_STUDIO_PORT) --url "$$DATABASE_URL")

dev-prisma-studio-container:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec nextjs npx prisma studio --port 5555

dev-db-seed-benchmark:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec -T $(SEED_ENV_ARGS) nextjs npm run db:seed:benchmark

# -----------------------------------------------------------------------------
# Dev tests (run inside the dev compose containers — `make dev` must be up).
# Each granular target executes the canonical test runner of its stack ; the
# aggregate `dev-test` (or alias `test`) runs them sequentially and stops on
# the first failure.
# -----------------------------------------------------------------------------

dev-test-next:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec -T nextjs npm run test:ci

dev-test-rust:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec -T audio-worker cargo test

dev-test-python:
	$(call require_env_file,$(DEV_ENV_FILE))
	$(DEV_COMPOSE) exec -T ai-services sh -c 'if [ -d tests ]; then uv run pytest -q; else echo "No pytest tests found yet."; fi'

dev-test: dev-test-next dev-test-rust dev-test-python
	@echo "All dev test suites passed."

# Backward-compatible dev aliases.
next-sh: dev-next-sh
prisma-generate: dev-prisma-generate
prisma-migrate: dev-prisma-migrate
prisma-push: dev-prisma-push
prisma-studio: dev-prisma-studio
db-seed-benchmark: dev-db-seed-benchmark
test: dev-test

# -----------------------------------------------------------------------------
# Staging
# -----------------------------------------------------------------------------

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

staging-prisma-migrate:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(STAGING_COMPOSE) up -d --wait postgres
	$(call run_prisma_tooling,$(STAGING_ENV_FILE),universe-staging,./node_modules/.bin/prisma migrate deploy)

staging-prisma-push:
	$(call require_env_file,$(STAGING_ENV_FILE))
	$(call run_prisma_tooling,$(STAGING_ENV_FILE),universe-staging,./node_modules/.bin/prisma db push)

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------

prod:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) up --build -d

prod-down:
	$(call require_env_file,$(PROD_ENV_FILE))
	@printf "About to bring DOWN the production stack. Type 'yes-i-am-sure' to confirm: "; \
		read confirm; \
		[ "$$confirm" = "yes-i-am-sure" ] || { echo "Aborted." >&2; exit 1; }
	$(PROD_COMPOSE) down

prod-logs:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) logs -f

prod-ps:
	$(call require_env_file,$(PROD_ENV_FILE))
	$(PROD_COMPOSE) ps
