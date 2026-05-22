.PHONY: dev build test test-api test-web lint lint-api lint-web fmt fmt-api fmt-web clean

# Run both dev servers concurrently (requires honcho or two terminals).
dev:
	@echo "Run in two terminals:"
	@echo "  1) uv run myvoice serve --dev"
	@echo "  2) (cd packages/web && pnpm dev)"

# Production build: build frontend, copy assets into API package.
build:
	(cd packages/web && pnpm install && pnpm build)
	rm -rf packages/api/myvoice/static
	mkdir -p packages/api/myvoice/static
	cp -R packages/web/dist/. packages/api/myvoice/static/
	uv build

# Tests
test: test-api test-web

test-api:
	uv run pytest packages/api -v

test-web:
	(cd packages/web && pnpm test)

# Lint
lint: lint-api lint-web

lint-api:
	uv run ruff check packages/api
	uv run mypy packages/api

lint-web:
	(cd packages/web && pnpm lint && pnpm tsc -b)

# Format
fmt: fmt-api fmt-web

fmt-api:
	uv run ruff format packages/api
	uv run ruff check --fix packages/api

fmt-web:
	(cd packages/web && pnpm fmt)

clean:
	rm -rf dist build packages/web/dist packages/web/node_modules .venv
	rm -rf packages/api/myvoice/static
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
