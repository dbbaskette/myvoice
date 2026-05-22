# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the myvoice monorepo with a working Python backend (FastAPI) and React frontend (Vite + TS + Tailwind) that talk to each other, plus dev tooling and CI. End-state: `myvoice serve` boots the backend, `pnpm dev` serves the frontend with a Vite proxy, and a "Hello" page calls a real `/api/health` endpoint.

**Architecture:** Single repo (`myvoice/`) with `packages/api/` (Python, FastAPI, uv) and `packages/web/` (React, Vite, TypeScript, Tailwind, Biome, pnpm). Root-level `pyproject.toml` declares the `myvoice` CLI entry that wraps `uvicorn` to start the FastAPI app. Dev mode runs both servers; production mode bundles built React assets into the Python wheel.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, hatchling, uv, pytest, ruff, mypy, httpx, watchfiles, PyYAML · TypeScript, React 18, Vite, Tailwind CSS, Biome, Vitest, pnpm · GitHub Actions for CI.

---

## File Structure

This phase creates the following files. Later phases add content under these directories; nothing here gets restructured in subsequent phases.

**Repo root:**
- `.gitignore` — extend with Python, Node, build artifacts
- `.python-version` — pin Python 3.11
- `pyproject.toml` — Python project, deps, CLI entry, tool configs
- `Makefile` — dev/build/test/lint/fmt commands
- `README.md` — install + first-run snippet
- `biome.json` — shared Biome config (referenced from frontend)

**Python backend (`packages/api/`):**
- `packages/api/myvoice/__init__.py` — package marker, exports `__version__`
- `packages/api/myvoice/cli.py` — Click-based CLI with `serve` and `version` commands
- `packages/api/myvoice/server.py` — FastAPI app factory, `/api/health` route, static-file mounting
- `packages/api/tests/__init__.py`
- `packages/api/tests/conftest.py` — pytest fixtures (FastAPI TestClient)
- `packages/api/tests/test_cli.py`
- `packages/api/tests/test_server.py`

**React frontend (`packages/web/`):**
- `packages/web/package.json` — pnpm project, deps, scripts
- `packages/web/tsconfig.json`, `packages/web/tsconfig.node.json`
- `packages/web/vite.config.ts` — Vite + React plugin + Tailwind + dev proxy
- `packages/web/tailwind.config.ts`, `packages/web/postcss.config.js`
- `packages/web/index.html`
- `packages/web/src/main.tsx`
- `packages/web/src/App.tsx`
- `packages/web/src/api/client.ts` — fetch wrapper
- `packages/web/src/api/health.ts` — typed `/api/health` call
- `packages/web/src/styles/global.css` — Tailwind directives
- `packages/web/tests/setup.ts` — Vitest + Testing Library setup
- `packages/web/tests/App.test.tsx`
- `packages/web/tests/api/health.test.ts`

**CI:**
- `.github/workflows/api-tests.yml`
- `.github/workflows/web-tests.yml`

---

## Task 1: Initialize Python project metadata

**Files:**
- Modify: `.gitignore`
- Create: `.python-version`
- Create: `pyproject.toml`

- [ ] **Step 1: Extend `.gitignore`**

The repo already has `.gitignore` containing `.superpowers/`. Append Python and Node patterns.

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice
cat >> .gitignore <<'EOF'

# Python
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
dist/
build/
*.egg-info/

# Node
node_modules/
packages/web/dist/

# Backend-served frontend assets (built at release time)
packages/api/myvoice/static/

# OS
.DS_Store
EOF
```

- [ ] **Step 2: Pin Python version**

Run:
```bash
echo "3.11" > /Users/dbbaskette/Projects/myvoice/.python-version
```

- [ ] **Step 3: Create root `pyproject.toml`**

Write file `/Users/dbbaskette/Projects/myvoice/pyproject.toml` with:

```toml
[project]
name = "myvoice"
version = "0.1.0"
description = "Local-first style-pack editor for AI-assisted writing"
readme = "README.md"
requires-python = ">=3.11"
license = { text = "MIT" }
authors = [{ name = "Dan Baskette" }]
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "click>=8.1",
    "pyyaml>=6.0",
    "watchfiles>=0.24",
    "httpx>=0.27",
]

[project.scripts]
myvoice = "myvoice.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["packages/api/myvoice"]

[tool.uv]
dev-dependencies = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "ruff>=0.7",
    "mypy>=1.13",
    "types-pyyaml>=6.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "RUF"]

[tool.mypy]
strict = true
python_version = "3.11"
mypy_path = "packages/api"
explicit_package_bases = true

[tool.pytest.ini_options]
testpaths = ["packages/api/tests"]
asyncio_mode = "auto"
```

- [ ] **Step 4: Install with uv to verify the project resolves**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv sync
```

Expected: creates `.venv/`, installs all deps, no errors. If `uv` is not installed, install with `brew install uv` first.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add .gitignore .python-version pyproject.toml && git commit -m "chore: initialize Python project (uv + hatchling + FastAPI)"
```

---

## Task 2: Create the Python package skeleton

**Files:**
- Create: `packages/api/myvoice/__init__.py`
- Create: `packages/api/tests/__init__.py`

- [ ] **Step 1: Create the package directory and `__init__.py`**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/api/myvoice
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/api/tests
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/__init__.py`:

```python
"""myvoice — local-first style-pack editor for AI-assisted writing."""

__version__ = "0.1.0"
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/__init__.py`:

```python
```

(empty file — just a package marker)

- [ ] **Step 2: Verify the package imports**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run python -c "import myvoice; print(myvoice.__version__)"
```

Expected output: `0.1.0`

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add myvoice package skeleton"
```

---

## Task 3: Add `myvoice version` CLI command (TDD)

**Files:**
- Create: `packages/api/tests/test_cli.py`
- Create: `packages/api/myvoice/cli.py`

- [ ] **Step 1: Write the failing test**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_cli.py`:

```python
"""Tests for the myvoice CLI."""

from click.testing import CliRunner

from myvoice import __version__
from myvoice.cli import main


def test_version_prints_package_version() -> None:
    runner = CliRunner()
    result = runner.invoke(main, ["version"])
    assert result.exit_code == 0
    assert __version__ in result.output
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'myvoice.cli'`

- [ ] **Step 3: Implement the CLI**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/cli.py`:

```python
"""myvoice CLI entry point."""

import click

from myvoice import __version__


@click.group()
def main() -> None:
    """myvoice — local-first style-pack editor."""


@main.command()
def version() -> None:
    """Print the installed myvoice version."""
    click.echo(f"myvoice {__version__}")
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli.py -v
```

Expected: PASS (1 test).

- [ ] **Step 5: Verify the CLI is invokable**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run myvoice version
```

Expected output: `myvoice 0.1.0`

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add 'myvoice version' command"
```

---

## Task 4: Create FastAPI server with /api/health (TDD)

**Files:**
- Create: `packages/api/tests/conftest.py`
- Create: `packages/api/tests/test_server.py`
- Create: `packages/api/myvoice/server.py`

- [ ] **Step 1: Write the test fixture**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/conftest.py`:

```python
"""Shared pytest fixtures."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A FastAPI TestClient bound to a fresh app instance."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
```

- [ ] **Step 2: Write the failing test**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_server.py`:

```python
"""Tests for the FastAPI server."""

from fastapi.testclient import TestClient

from myvoice import __version__


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_server.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'myvoice.server'`

- [ ] **Step 4: Implement the server**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/server.py`:

```python
"""FastAPI application factory."""

from fastapi import FastAPI

from myvoice import __version__


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return app
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_server.py -v
```

Expected: PASS (1 test).

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add FastAPI app with /api/health endpoint"
```

---

## Task 5: Implement `myvoice serve` command

**Files:**
- Modify: `packages/api/tests/test_cli.py`
- Modify: `packages/api/myvoice/cli.py`

- [ ] **Step 1: Add a failing test for `serve --help`**

Append to `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_cli.py`:

```python


def test_serve_command_exists_and_shows_help() -> None:
    runner = CliRunner()
    result = runner.invoke(main, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--port" in result.output
    assert "--host" in result.output
    assert "--no-browser" in result.output
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli.py::test_serve_command_exists_and_shows_help -v
```

Expected: FAIL — `serve` command not registered.

- [ ] **Step 3: Implement the `serve` command**

Replace the contents of `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/cli.py` with:

```python
"""myvoice CLI entry point."""

import click
import uvicorn

from myvoice import __version__


@click.group()
def main() -> None:
    """myvoice — local-first style-pack editor."""


@main.command()
def version() -> None:
    """Print the installed myvoice version."""
    click.echo(f"myvoice {__version__}")


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind host.")
@click.option("--port", default=7878, show_default=True, type=int, help="Bind port.")
@click.option("--no-browser", is_flag=True, help="Do not auto-open the browser.")
@click.option("--dev", is_flag=True, help="Dev mode: skip frontend static mount.")
def serve(host: str, port: int, no_browser: bool, dev: bool) -> None:
    """Start the myvoice server."""
    click.echo(f"[myvoice] starting on http://{host}:{port}")
    if dev:
        click.echo("[myvoice] dev mode: not serving frontend (expect Vite on :5173)")
    if not no_browser and not dev:
        # Browser auto-open is added in a later phase when there's a frontend to open.
        pass
    uvicorn.run(
        "myvoice.server:create_app",
        host=host,
        port=port,
        factory=True,
        log_level="info",
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Manually verify the server boots**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && timeout 3 uv run myvoice serve --dev --no-browser
```

Expected: Logs `[myvoice] starting on http://127.0.0.1:7878`, Uvicorn startup messages appear, process exits after 3s without errors. (Timeout-induced exit is expected; we just want to confirm no crash.)

In a separate shell while it's running (or rerun with longer timeout):
```bash
curl -s http://127.0.0.1:7878/api/health
```
Expected: `{"status":"ok","version":"0.1.0"}`

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add 'myvoice serve' command (uvicorn-backed)"
```

---

## Task 6: Initialize React + Vite + TypeScript frontend

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.node.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`

- [ ] **Step 1: Create the frontend directory**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/web/src
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/web/tests
```

- [ ] **Step 2: Write `package.json`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/package.json`:

```json
{
  "name": "@myvoice/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "fmt": "biome format --write ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7878",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 6: Write `index.html`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>myvoice</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `main.tsx`**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/src/main.tsx`:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("No #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Write a minimal `App.tsx` placeholder**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/src/App.tsx`:

```typescript
export function App(): JSX.Element {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-semibold">myvoice</h1>
    </main>
  );
}
```

- [ ] **Step 9: Install JS dependencies**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm install
```

Expected: completes without errors, `node_modules/` populated. If `pnpm` is not installed, install with `brew install pnpm` first.

- [ ] **Step 10: Verify type-check passes (build will fail on missing global.css — fixed in next task)**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm tsc -b --dry
```

Expected: no type errors. (The missing `./styles/global.css` import is OK at this point — the build step will fail until Task 7 adds it. We're just verifying TS configuration is right.)

- [ ] **Step 11: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/web && git commit -m "feat: scaffold React + Vite + TypeScript frontend"
```

---

## Task 7: Add Tailwind CSS

**Files:**
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/src/styles/global.css`

- [ ] **Step 1: Write Tailwind config**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Write PostCSS config**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Write global CSS with Tailwind directives**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/web/src/styles
```

Write `/Users/dbbaskette/Projects/myvoice/packages/web/src/styles/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark light;
}

html, body, #root {
  height: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

- [ ] **Step 4: Verify the build succeeds**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm build
```

Expected: `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css` produced without errors. The CSS file should contain Tailwind base styles (verify with `head packages/web/dist/assets/*.css | head -20` — should contain CSS reset rules).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/web && git commit -m "feat: add Tailwind CSS to frontend"
```

---

## Task 8: Add Biome for TS/JS lint + format

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Write the Biome config at the repo root**

Write `/Users/dbbaskette/Projects/myvoice/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["packages/web/dist", "**/node_modules", "**/.venv"]
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "useImportType": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

- [ ] **Step 2: Run Biome to verify it parses**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm lint
```

Expected: scans all `.ts`/`.tsx` files, reports zero errors (with possibly some warnings about formatting that we'll address).

- [ ] **Step 3: Apply Biome's auto-formatting to baseline existing files**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm fmt
```

Expected: rewrites files in place to match Biome's formatting. Re-running `pnpm lint` afterward should report zero issues.

- [ ] **Step 4: Verify lint passes cleanly after format**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm lint
```

Expected: zero errors, zero warnings.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add biome.json packages/web && git commit -m "chore: add Biome for TS lint + format"
```

---

## Task 9: Add the typed API client and `/api/health` call (TDD)

**Files:**
- Create: `packages/web/tests/setup.ts`
- Create: `packages/web/tests/api/health.test.ts`
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/api/health.ts`

- [ ] **Step 1: Write the Vitest setup file**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tests/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write the failing test**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/web/tests/api
```

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tests/api/health.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "../../src/api/health";

describe("getHealth", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the health payload", async () => {
    const health = await getHealth();
    expect(health).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    await expect(getHealth()).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm test
```

Expected: FAIL with "Cannot find module '../../src/api/health'".

- [ ] **Step 4: Implement the API client**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/web/src/api
```

Write `/Users/dbbaskette/Projects/myvoice/packages/web/src/api/client.ts`:

```typescript
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP ${response.status} on ${path}`);
  }

  return (await response.json()) as T;
}
```

- [ ] **Step 5: Implement the health endpoint client**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/src/api/health.ts`:

```typescript
import { apiFetch } from "./client";

export interface Health {
  status: "ok";
  version: string;
}

export async function getHealth(): Promise<Health> {
  return apiFetch<Health>("/api/health");
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm test
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/web && git commit -m "feat: add typed API client + getHealth"
```

---

## Task 10: Wire the App to display backend health (TDD)

**Files:**
- Create: `packages/web/tests/App.test.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Write the failing component test**

Write `/Users/dbbaskette/Projects/myvoice/packages/web/tests/App.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /myvoice/i })).toBeInTheDocument();
  });

  it("loads and displays backend version", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/backend v0\.1\.0/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm test
```

Expected: the second test FAILs (backend version not displayed yet).

- [ ] **Step 3: Update App.tsx to fetch and display health**

Replace `/Users/dbbaskette/Projects/myvoice/packages/web/src/App.tsx` with:

```typescript
import { useEffect, useState } from "react";

import { getHealth } from "./api/health";

export function App(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => setVersion(h.version))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">myvoice</h1>
      {version && <p className="text-sm text-gray-500">backend v{version}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm test
```

Expected: 4 tests PASS (2 in App.test.tsx + 2 in health.test.ts).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/web && git commit -m "feat: App fetches and displays backend health"
```

---

## Task 11: Mount built frontend in FastAPI (production mode)

**Files:**
- Modify: `packages/api/myvoice/server.py`
- Modify: `packages/api/tests/test_server.py`

- [ ] **Step 1: Write the failing test for static-file behavior**

Append to `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_server.py`:

```python


def test_root_serves_index_when_static_present(tmp_path, monkeypatch) -> None:
    """When static dir exists, GET / returns the index.html."""
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html><body>built ui</body></html>")

    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(static_dir))
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "built ui" in response.text


def test_root_returns_dev_message_when_static_missing(tmp_path, monkeypatch) -> None:
    """When static dir is absent, GET / returns a dev-mode message."""
    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(tmp_path / "does-not-exist"))
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "dev mode" in response.text.lower()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_server.py -v
```

Expected: 2 new tests FAIL (root route not implemented).

- [ ] **Step 3: Update server.py to mount static or serve dev message**

Replace `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/server.py` with:

```python
"""FastAPI application factory."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from myvoice import __version__


def _default_static_dir() -> Path:
    """Return the bundled static dir, alongside this module."""
    return Path(__file__).parent / "static"


def _resolve_static_dir() -> Path:
    """Honor MYVOICE_STATIC_DIR if set, otherwise use the bundled dir."""
    env = os.environ.get("MYVOICE_STATIC_DIR")
    return Path(env) if env else _default_static_dir()


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    static_dir = _resolve_static_dir()
    index = static_dir / "index.html"

    if index.is_file():
        # Production mode: serve the built React app.
        @app.get("/", response_class=FileResponse)
        def root() -> FileResponse:
            return FileResponse(index)

        # Mount everything else under /assets, /favicon.ico, etc.
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    else:
        # Dev mode: no built frontend bundled.
        @app.get("/", response_class=HTMLResponse)
        def root_dev() -> str:
            return (
                "<!doctype html><html><body>"
                "<h1>myvoice — dev mode</h1>"
                "<p>No built frontend found. Run <code>pnpm dev</code> "
                "in <code>packages/web/</code> and visit "
                "<a href='http://localhost:5173'>http://localhost:5173</a>.</p>"
                "</body></html>"
            )

    return app
```

- [ ] **Step 4: Run the test suite**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api -v
```

Expected: ALL tests PASS (cli + server, including new static tests).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: FastAPI serves built frontend in prod, dev message otherwise"
```

---

## Task 12: Add the Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Write the Makefile**

Write `/Users/dbbaskette/Projects/myvoice/Makefile`:

```makefile
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
	(cd packages/web && pnpm lint && pnpm tsc -b --dry)

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
```

- [ ] **Step 2: Verify each target works**

Run each in sequence and verify exit code 0:

```bash
cd /Users/dbbaskette/Projects/myvoice && make test
cd /Users/dbbaskette/Projects/myvoice && make lint
cd /Users/dbbaskette/Projects/myvoice && make fmt
cd /Users/dbbaskette/Projects/myvoice && make test  # re-run after fmt to confirm nothing broke
```

Expected: all four commands complete with exit code 0. Some `make lint` warnings are acceptable on the first run — fix any errors before continuing.

- [ ] **Step 3: Verify the full build target**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make build
```

Expected: `dist/myvoice-0.1.0-py3-none-any.whl` produced, `packages/api/myvoice/static/index.html` exists, `packages/api/myvoice/static/assets/*.js` exists.

- [ ] **Step 4: Verify the built wheel runs end-to-end**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && timeout 3 uv run --with dist/myvoice-0.1.0-py3-none-any.whl myvoice serve --no-browser
```

In a second shell while it runs:
```bash
curl -s http://127.0.0.1:7878/api/health
curl -s http://127.0.0.1:7878/ | head -5
```

Expected: health returns JSON with version, root returns built HTML (not the dev message).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add Makefile && git commit -m "chore: add Makefile (dev, build, test, lint, fmt, clean)"
```

---

## Task 13: Add GitHub Actions for backend tests

**Files:**
- Create: `.github/workflows/api-tests.yml`

- [ ] **Step 1: Create the workflows directory and file**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/.github/workflows
```

Write `/Users/dbbaskette/Projects/myvoice/.github/workflows/api-tests.yml`:

```yaml
name: api-tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "latest"

      - name: Set up Python
        run: uv python install 3.11

      - name: Install deps
        run: uv sync --frozen

      - name: Ruff (lint)
        run: uv run ruff check packages/api

      - name: Mypy (types)
        run: uv run mypy packages/api

      - name: Pytest
        run: uv run pytest packages/api -v
```

- [ ] **Step 2: Generate the lockfile so CI's `uv sync --frozen` works**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv lock
```

Expected: creates `uv.lock` at the repo root.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add .github uv.lock && git commit -m "ci: add api-tests workflow (ruff + mypy + pytest)"
```

---

## Task 14: Add GitHub Actions for frontend tests

**Files:**
- Create: `.github/workflows/web-tests.yml`

- [ ] **Step 1: Write the workflow**

Write `/Users/dbbaskette/Projects/myvoice/.github/workflows/web-tests.yml`:

```yaml
name: web-tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/web
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: packages/web/pnpm-lock.yaml

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Biome (lint)
        run: pnpm lint

      - name: TypeScript (types)
        run: pnpm tsc -b --dry

      - name: Vitest
        run: pnpm test
```

- [ ] **Step 2: Generate the pnpm lockfile**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm install --lockfile-only
```

Expected: creates `packages/web/pnpm-lock.yaml`.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add .github packages/web/pnpm-lock.yaml && git commit -m "ci: add web-tests workflow (biome + tsc + vitest)"
```

---

## Task 15: Write the README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Write `/Users/dbbaskette/Projects/myvoice/README.md`:

```markdown
# myvoice

Local-first style-pack editor for AI-assisted writing. Create, edit, and use portable writing-style packs that capture an author's voice (banished vocabulary, principles, samples, format add-ons, bios).

> **Status:** Phase 1 (Foundation) — backend + frontend scaffolding only. Pack editing, AI extraction, and compose/test land in subsequent phases.

## Install

```bash
brew install pipx
pipx ensurepath
pipx install myvoice
myvoice serve
```

This starts the local server on `http://localhost:7878` and opens your browser.

## Development

Two-process workflow:

```bash
# Terminal 1 — backend with hot reload
uv run myvoice serve --dev

# Terminal 2 — frontend with Vite HMR
cd packages/web && pnpm dev
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the FastAPI server on `:7878`.

Common commands (from repo root):

| Command | Purpose |
|---|---|
| `make test` | Run all tests (Python + TS) |
| `make lint` | Lint (ruff + mypy + biome + tsc) |
| `make fmt` | Auto-format Python and TS |
| `make build` | Produce a Python wheel with built frontend bundled |
| `make clean` | Remove all build artifacts and caches |

## Repo layout

```
myvoice/
├── packages/
│   ├── api/        Python backend (FastAPI)
│   │   └── myvoice/
│   └── web/        React + Vite + TS + Tailwind frontend
├── packs/          Style packs shipped with the install (added in Phase 2)
└── docs/           Design and implementation plans
```

## Design

See `docs/superpowers/specs/2026-05-22-myvoice-design.md` for the full design.
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add README.md && git commit -m "docs: add Phase 1 README"
```

---

## Task 16: End-to-end smoke test

**Files:** None (pure verification task)

- [ ] **Step 1: Verify the full test suite passes locally**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make test
```

Expected: backend pytest reports all tests passing (6 tests: 2 cli + 4 server), frontend vitest reports 4 tests passing.

- [ ] **Step 2: Verify the full lint suite passes locally**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make lint
```

Expected: zero errors across ruff, mypy, biome, and tsc.

- [ ] **Step 3: Verify dev mode end-to-end**

Start the backend in one shell:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run myvoice serve --dev --no-browser
```

In a second shell, start the frontend:
```bash
cd /Users/dbbaskette/Projects/myvoice/packages/web && pnpm dev
```

Open `http://localhost:5173` in a browser. Expected: the page shows "myvoice" as the heading and "backend v0.1.0" below it. Check the browser network tab: `/api/health` returns `{"status":"ok","version":"0.1.0"}`.

Stop both servers (Ctrl-C).

- [ ] **Step 4: Verify production mode end-to-end**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make build
cd /Users/dbbaskette/Projects/myvoice && uv run myvoice serve --no-browser
```

In a second shell:
```bash
curl -s http://127.0.0.1:7878/api/health
curl -sI http://127.0.0.1:7878/ | head -3
```

Expected:
- Health returns `{"status":"ok","version":"0.1.0"}`.
- Root returns `HTTP/1.1 200 OK` with `content-type: text/html` (the built React app, NOT the dev-mode placeholder).

Open `http://127.0.0.1:7878/` in a browser. Expected: same page as dev mode — "myvoice" heading, "backend v0.1.0" subtitle.

Stop the server.

- [ ] **Step 5: Final commit (if any changes from formatting during smoke test)**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git status
```

If clean, nothing to do. If there are any incidental changes:
```bash
git add -A && git commit -m "chore: phase 1 smoke-test fixups"
```

---

## Phase 1 done-state checklist

When all of the following are true, Phase 1 is complete and ready for Phase 2:

- [ ] `make test` exits 0 (10 tests total: 6 Python + 4 TypeScript).
- [ ] `make lint` exits 0 (ruff, mypy, biome, tsc all clean).
- [ ] `make build` produces `dist/myvoice-0.1.0-py3-none-any.whl`.
- [ ] `myvoice serve --dev` + `pnpm dev` workflow displays a page showing "backend v0.1.0".
- [ ] `myvoice serve` (production mode, after `make build`) serves the built frontend at `/`.
- [ ] Both GitHub Actions workflows defined and ready to run on the next push.
- [ ] README documents install, dev workflow, and common Make commands.

Next: Phase 2 — Style Pack Format & Core Tools. Implements `SPEC.md` v1.0, the pure-Python `compose.py`/`lint.py`/`validate.py`, pack discovery, `PackStore`, the `packs/dan/` conversion from Dan-AI, and `packs/_template/`.
