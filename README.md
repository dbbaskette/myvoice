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

### Extract a pack from URLs

In the sidebar, click **Extract from URLs**. Paste one or more blog URLs (or drag in `.md` / `.txt` / `.docx` drafts), fill in the slug/name/author, pick a provider and model, and click **Analyze**. The LLM reads your corpus and proposes a complete pack: persona, banished words (with frequency counts), permitted exceptions, a style-guide draft, ranked sample excerpts, and pop-culture rules.

Review the proposal inline — every field is editable, each sample has a keep/drop checkbox — then click **Save Pack**. The new pack lands in `~/.myvoice/packs/<slug>/` with the proposal's data merged into the `_template` scaffold, ready to refine on the Manifest tab.

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

## Using myvoice as a library

Other Python apps can consume packs by importing from `myvoice` directly:

```python
from pathlib import Path
from myvoice import PackStore, compose_prompt, lint, validate_pack

# Discover packs from one or more roots
store = PackStore([Path("~/.myvoice/packs").expanduser()])

# List + look up a pack
for slug in store.slugs():
    info = store.get(slug)
    print(slug, info.valid)

dan = store.get("dan")

# Compose a prompt for the LLM
prompt = compose_prompt(
    dan.root_path,
    format="blog-post",
    samples=["01"],
    draft="My rough draft text…",
)

# Lint a draft against the pack
result = validate_pack(dan.root_path)
violations = lint(result.manifest, "Let me delve into this.")
for v in violations:
    print(v.kind, v.match, v.message)
```

The names exported from `myvoice/__init__.py` (`PackStore`, `Manifest`, `compose_prompt`, `lint`, `lint_to_hits`, `detect_positive_hits`, `validate_pack`, `Violation`, `LintHit`, `__version__`) are the public API. Anything else is private and may change without notice.

Install via `pipx install myvoice` (CLI + library) or `pip install myvoice` (library only inside a project venv).

## Design

See `docs/superpowers/specs/2026-05-22-myvoice-design.md` for the full design.
