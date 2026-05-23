# myvoice

Local-first style-pack editor for AI-assisted writing. Create, edit, and use portable writing-style packs that capture an author's voice (banished vocabulary, principles, samples, format add-ons, bios).

> **Status:** Phases 1–5 shipped: pack format spec, CLI, browsable+editable pack UI, multi-provider compose & test, and pack create/manage flows. AI-assisted pack extraction from URLs and file uploads is the remaining v1 feature.

## Install

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

## Compose & test

The **Compose & test** page lets you paste a draft, stream a rewrite in the pack author's voice, and optionally save the output as a new voice sample.

### Quick start

1. **Add an API key.** Go to **Settings** (⚙ in the sidebar) and paste your key under API keys. Three providers are supported:
   - **Anthropic** — Claude Opus, Sonnet, Haiku
   - **OpenAI** — GPT-5, GPT-5 Mini
   - **Google** — Gemini 2.5 Pro, Gemini 2.5 Flash

2. **Open Compose & test** (🔁 in the sidebar).

3. **Select a pack, provider, and model** using the controls bar at the top.

4. **Paste your draft** into the left pane.

5. Click **Rewrite**. The right pane streams the rewritten text in real time. Lint highlights appear on both sides once the rewrite is complete — green for positive voice hits, orange/pink/purple for banished vocabulary and rule violations.

6. Click **Save as sample** to append the output directly to the pack's `samples/` directory as a new voice exemplar.

Other controls:
- **View prompt** — inspect the assembled system prompt before sending.
- **Diff** — toggle a side-by-side diff of the original vs. the rewrite.
- **Copy** — copy the output to the clipboard.

### Supported providers

| Provider | Env var | Notes |
|---|---|---|
| Anthropic | API key in Settings | Claude 3 and Claude 4 families |
| OpenAI | API key in Settings | GPT-5 and later |
| Google | API key in Settings | Gemini 2.5 Pro / Flash |

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

### Create from the UI

Click **+ New pack** in the sidebar, fill in slug, name, author, and persona. The new pack is created from the bundled `_template/` and you land on its detail page ready to edit. Use the **Manifest** tab to edit banished words, rules, and persona; the **Danger zone** at the bottom soft-deletes the pack to `~/.myvoice/trash/`.

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
