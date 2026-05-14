# Convenience targets for the local Docker stack.
# All targets assume docker compose v2 (the modern `docker compose ...` plugin).

SHELL := /bin/sh

COMPOSE       ?= docker compose
ENV_FILE      ?= .env
ENV_EXAMPLE   ?= .env.example

.PHONY: help init up down logs migrate psql backup restart rebuild ps build pull

help:
	@echo "smsvxod — local Docker stack"
	@echo ""
	@echo "Targets:"
	@echo "  make init      Create .env from .env.example and generate secrets"
	@echo "  make up        Start the stack in background"
	@echo "  make down      Stop the stack"
	@echo "  make restart   down + up"
	@echo "  make rebuild   Rebuild images from scratch and start"
	@echo "  make logs      Follow logs from all services"
	@echo "  make migrate   Run drizzle-kit migrate via the tools profile"
	@echo "  make psql      Open a psql shell in the postgres container"
	@echo "  make backup    Trigger a one-off DB backup now"
	@echo "  make ps        Show running services"

init:
	@if [ -f "$(ENV_FILE)" ]; then \
		echo "$(ENV_FILE) already exists — leaving it alone."; \
	else \
		cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
		echo "Created $(ENV_FILE) from $(ENV_EXAMPLE)."; \
	fi
	@echo "Filling in missing secrets..."
	@for key in JWT_SECRET GATEWAY_TOKEN ALTCHA_HMAC_KEY; do \
		current=$$(grep -E "^$$key=" "$(ENV_FILE)" | sed -e "s/^$$key=//"); \
		if [ -z "$$current" ]; then \
			value=$$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"); \
			if grep -qE "^$$key=" "$(ENV_FILE)"; then \
				tmp=$$(mktemp); \
				awk -v k="$$key" -v v="$$value" 'BEGIN{FS=OFS="="} $$1==k{print k"="v; next} {print}' "$(ENV_FILE)" > "$$tmp" && mv "$$tmp" "$(ENV_FILE)"; \
			else \
				printf "%s=%s\n" "$$key" "$$value" >> "$(ENV_FILE)"; \
			fi; \
			echo "  generated $$key"; \
		else \
			echo "  $$key already set, leaving it alone"; \
		fi; \
	done
	@echo "Done. Edit $(ENV_FILE) if you want to override anything else."

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) down
	$(COMPOSE) up -d

rebuild:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

migrate:
	$(COMPOSE) --profile tools run --rm db-migrate

psql:
	$(COMPOSE) exec postgres psql -U smsvxod -d smsvxod

backup:
	$(COMPOSE) exec db-backup /backup.sh

build:
	$(COMPOSE) build

pull:
	$(COMPOSE) pull
