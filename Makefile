# NightCap — one-command setup, make check. See CLAUDE.md for the running-alongside-NightOut rules.
SHELL := /bin/bash
.DEFAULT_GOAL := help
API_PORT ?= 8788
METRO_PORT ?= 8091

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## deps, .env (dev secrets), demo photos, git hooks
	npm install --no-audit --no-fund
	cd apps/mobile && npm install --no-audit --no-fund
	node scripts/setup-env.mjs
	node scripts/gen-photos.mjs --count 48
	git config core.hooksPath .githooks
	@echo "✓ setup done. Try: make check, make api, make demo"

typecheck: ## tsc everywhere
	npm run typecheck
	cd apps/mobile && npx tsc --noEmit

lint: ## eslint + prettier check
	npx eslint .
	npx prettier --check . --log-level warn

test: ## all test suites (core, db/RLS, api, scripts, mobile)
	npx vitest run
	cd apps/mobile && npx jest --silent

check: typecheck lint test ideas-check doctor ## everything; run before every commit

ideas: ## regenerate docs/IDEAS.md
	node scripts/ideas.mjs render

ideas-check:
	node scripts/ideas.mjs check

ideas-next: ## top open ideas
	node scripts/ideas.mjs next 10

doctor: ## self-healing checks (report only)
	node scripts/doctor.mjs

heal: ## doctor + safe automatic repairs
	node scripts/doctor.mjs --heal

api: ## API on :8788 (mock mode, seeded), foreground
	cd apps/api && npx tsx src/index.ts

metro: ## Expo/Metro on :8091, foreground
	cd apps/mobile && npx expo start --port $(METRO_PORT)

demo: ## API + Metro in the background, boot our sim, open the app
	scripts/demo.sh start

stop: ## stop only what `make demo` started
	scripts/demo.sh stop

sim-shot: ## screenshot our simulator → docs/media/$(NAME).png
	scripts/sim.sh shot $(NAME)

maestro: ## wait for quiet, then run Maestro flows on our simulator
	scripts/wait-for-quiet.sh && scripts/maestro.sh

reseed: ## wipe + reseed the demo world (API must be running)
	curl -s -X POST http://127.0.0.1:$(API_PORT)/dev/reseed | head -c 200; echo

.PHONY: help setup typecheck lint test check ideas ideas-check ideas-next doctor heal api metro demo stop sim-shot maestro reseed
