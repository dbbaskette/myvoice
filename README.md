# myvoice

Local-first style-pack editor for AI-assisted writing. Create, edit, and use portable writing-style packs that capture an author's voice (banished vocabulary, principles, samples, format add-ons, bios).

> **Status:** Phase 1 (Foundation) — backend + frontend scaffolding only. Pack editing, AI extraction, and compose/test land in subsequent phases.

## Install

### From source (current path — pre-PyPI)

Builds the wheel and installs it into an isolated venv at `./local-venv/`:

```bash
./scripts/install-local.sh    # builds the wheel + creates ./local-venv/ + installs
./scripts/run-local.sh        # starts the server (forwards args to `myvoice`)
```

Open `http://localhost:7878`.

`run-local.sh` forwards any arguments to the installed CLI:

```bash
./scripts/run-local.sh version              # same as `myvoice version`
./scripts/run-local.sh serve --no-browser
```

Requires `uv` and `pnpm` (`brew install uv pnpm`).

### From PyPI (once published)

```bash
brew install pipx
pipx ensurepath
pipx install myvoice
myvoice serve
```

## Development

One-command workflow:

```bash
./scripts/dev.sh
```

Starts the backend (FastAPI on `:7878`) and frontend (Vite on `:7879`) concurrently, with interleaved `[api]` / `[web]` log prefixes. Ctrl-C stops both. Open `http://localhost:7879` — Vite proxies `/api/*` to `:7878`.

If you'd rather run them yourself in two terminals:

```bash
# Terminal 1 — backend with hot reload
uv run myvoice serve --dev

# Terminal 2 — frontend with Vite HMR
cd packages/web && pnpm dev
```

Common commands (from repo root):

| Command | Purpose |
|---|---|
| `./scripts/install-local.sh` | Build wheel + install into `./local-venv/` |
| `./scripts/run-local.sh` | Run `myvoice serve` from `./local-venv/` |
| `./scripts/dev.sh` | Start backend + Vite dev server concurrently |
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
