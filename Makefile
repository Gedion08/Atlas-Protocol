.PHONY: help install dev dev-frontend dev-backend build test typecheck lint programs programs-test db-migrate docker-build docker-up docker-down docker-logs clean format

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	pnpm install

dev: ## Run frontend and backend in watch mode
	pnpm dev:frontend & pnpm dev:backend

dev-frontend: ## Run the Next.js frontend in watch mode
	pnpm dev:frontend

dev-backend: ## Run the Fastify backend in watch mode
	pnpm dev:backend

build: ## Build all workspace packages
	pnpm build

test: ## Run all tests (vitest + cargo)
	pnpm test
	cargo test --workspace --manifest-path programs/Cargo.toml

typecheck: ## Type-check all TypeScript workspaces
	pnpm typecheck

lint: ## Lint frontend and backend
	pnpm --filter atlas-frontend lint
	pnpm --filter atlas-backend lint

programs: ## Compile Solana programs (requires cargo)
	cargo build --workspace --manifest-path programs/Cargo.toml

programs-test: ## Run program unit tests (requires cargo)
	cargo test --workspace --manifest-path programs/Cargo.toml

db-migrate: ## Apply database migrations
	pnpm db:migrate

docker-build: ## Build backend and frontend Docker images
	docker compose build

docker-up: ## Start the full stack (postgres, backend, frontend)
	docker compose up -d

docker-down: ## Stop the full stack
	docker compose down

docker-logs: ## Tail logs of all services
	docker compose logs -f

format: ## Format code (prettier)
	pnpm exec prettier --write .

clean: ## Remove build artifacts
	rm -rf apps/backend/dist apps/frontend/.next coverage .coverage
