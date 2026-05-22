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
