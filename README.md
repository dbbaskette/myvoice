# myvoice

Local-first style-pack editor for AI-assisted writing. Create, edit, and use portable writing-style packs that capture an author's voice (banished vocabulary, principles, samples, format add-ons, bios).

> **Status:** Phase 2 (Style Pack Format & Core Tools). Pack format spec + Python compose/lint/validate + reference packs landed. Pack editing UI, AI extraction, and compose/test land in subsequent phases.

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
│   ├── api/        Python backend (FastAPI + pack tools)
│   │   └── myvoice/
│   └── web/        React + Vite + TS + Tailwind frontend
├── packs/          Style packs shipped with the install
│   ├── dan/        Reference pack (Dan Baskette voice)
│   └── _template/  Scaffold for new packs
└── docs/           Design and implementation plans
```

## Style packs

A **style pack** is a portable directory that captures a writer's voice. It conforms to [SPEC.md](./SPEC.md) v1.0. Each pack contains:

- `stylepack.yaml` — manifest (banished words, rules, formats list, bios list)
- `style-guide.md` — prose writing principles
- `formats/` — format add-ons (blog post, LinkedIn, tweet thread, …)
- `samples/` — voice exemplars (real passages the LLM uses for tone-matching)
- `bios/` — standing bio content (Twitter, LinkedIn, conference, book jacket)

The repo ships two packs:

- `packs/dan/` — Dan Baskette's voice, the reference pack (v3.0 from Dan-AI)
- `packs/_template/` — empty scaffold; copy to start your own

### CLI

```bash
# List discovered packs
myvoice pack list --root packs

# Validate a pack against SPEC v1.0
myvoice pack validate packs/dan

# Compose a prompt from a pack
myvoice pack compose packs/dan --format blog-post --samples 01,04 --draft draft.md > prompt.md

# Lint a draft against a pack's banished vocabulary + rules
myvoice pack lint packs/dan draft.md

# Emit a bio body (no prompt assembly)
myvoice pack compose packs/dan --bio linkedin-about
```

## Design

See `docs/superpowers/specs/2026-05-22-myvoice-design.md` for the full design.
