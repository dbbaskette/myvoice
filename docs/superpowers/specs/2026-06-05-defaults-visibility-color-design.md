# Default-Rules Visibility + Color Pass — Design

**Date:** 2026-06-05
**Status:** Approved — implementing

## Problem

Two issues raised after the light redesign:

1. **The default rules are invisible.** The shared AI-tells layer (≈70 banished
   words, ~31 phrases, 5 sentence-starters, structural patterns) is merged into
   every pack at compose/lint time, but it is **not exposed by any API**.
   `GET /api/packs/{slug}/manifest` returns only the pack's own
   `stylepack.yaml`. Since Dan's bans were migrated into the shared layer, his
   own `banished.words`/`phrases` are now empty — so the Manifest screen shows
   nothing, and the count stats read `0`, even though all those rules are in
   force. The user can't see what's actually being applied.

2. **The UI is visually flat.** The light reskin reads as a wall of white cards;
   the user wants more color and a more card-driven feel.

## Goal

- Surface the shared/inherited rules read-only in the Manifest so users can see
  the defaults that apply to every pack.
- Add tasteful color: per-section accent colors, colored section headers, and
  colored stat cards.

Presentational + one read-only API; **no change to compose/lint behavior**.

## Decisions (from brainstorming)

- **Surface defaults via:** read-only "Inherited from shared defaults"
  collapsible panels inside the Banished and Rules sections.
- **Color level:** vibrant accents + colored sections (each section a distinct
  accent), still tasteful.

## Design

### 1. Backend — expose the shared AI-tells

New router `packages/api/myvoice/api/ai_tells.py`:

```python
@router.get("/api/ai-tells")
def get_ai_tells() -> dict[str, object]:
    t = load_ai_tells()
    return {
        "words": list(t.words),
        "phrases": list(t.phrases),
        "sentence_starters": list(t.sentence_starters),
        "patterns": t.patterns,
    }
```

Registered in `server.py` `create_app()`. Global, read-only, same for every pack
(the shared layer; per-pack `ai-patterns.md` overrides are out of scope for this
view). Test: `GET /api/ai-tells` returns the expected words/phrases/starters and
non-empty patterns.

### 2. Frontend — inherited panels

- `src/api/aiTells.ts`: `interface AiTells { words: string[]; phrases: string[];
  sentence_starters: string[]; patterns: string }` + `getAiTells()`.
- `src/hooks/useAiTells.ts`: fetches once and caches via a module-level promise
  singleton (the data is global/static, so all callers share one fetch).
- **`BanishedSection`**: below the editable words/phrases/exceptions, a read-only
  collapsible (native `<details>`) titled **"Inherited from shared defaults · N
  words · N phrases"** showing the shared words as muted chips and phrases as a
  list, with the note *"These apply to every pack automatically."* and a
  "Global" `Badge`.
- **`RulesSection`**: an inherited collapsible showing the shared
  sentence-starters (as chips) and the **AI sentence patterns** — the
  `patterns.md` markdown rendered to HTML via the existing `marked` dep inside a
  `prose prose-slate` container (bundled content, not user input → safe).
- Visual treatment marks them clearly as non-editable: tinted panel
  (`bg-slate-50`), a "Global" badge, a `ChevronDown` affordance, no inputs.

### 3. Visual — vibrant accents + colored sections

- **New primitive `SectionHeader`** (`src/components/ui/SectionHeader.tsx`):
  `{ icon: LucideIcon, color: AccentColor, title, description? }`. Renders a
  colored rounded icon chip (`bg-{c}-50 text-{c}-600`) + title + muted subtitle.
  `AccentColor` is a small union with a class map (full Tailwind strings, no
  dynamic concatenation so purge keeps them).
- **Accent per section:** Persona = indigo, Banished = rose, Rules = amber,
  Pop culture = violet, Metadata = sky, Exceptions = emerald, Entries = teal.
  Apply `SectionHeader` across the manifest section cards (and reuse for Settings
  section cards where natural).
- **PackOverview stat cards:** colored tinted stat cards (each metric a
  `bg-{c}-50` card with a colored figure/icon). Surface inherited totals so they
  aren't misleadingly `0` — e.g. "Banished words: {pack} **+ {shared} shared**"
  via `useAiTells()`.
- **Icons:** add to `ui/icons.tsx` the lucide re-exports needed: `Ban`, `Scale`,
  `Clapperboard`, `Tag`, `ShieldCheck`, `Layers`, `Info`, `ChevronDown`, `Globe`.

### Component boundaries

- `SectionHeader` is presentational, reused everywhere a card needs a titled,
  colored header.
- `useAiTells` is the single data source for inherited rules; `BanishedSection`,
  `RulesSection`, and `PackOverview` consume it.
- The `/api/ai-tells` endpoint is self-contained and stateless.

## Scope / non-goals

- **Read-only** display of shared tells. Editing the *global* defaults (the
  bundled `assets/ai-tells/*`) through the UI is a separate future feature.
- No change to compose/lint/merge behavior or to how packs are stored.
- Light mode only (unchanged). Dark theme remains a future follow-up.

## Testing

- Backend: `GET /api/ai-tells` returns expected content (TestClient).
- Frontend: existing `vitest` suites stay green (text/role-based). Add a small
  test that `BanishedSection` renders the inherited panel header when ai-tells
  are present (mock `getAiTells`), and that `SectionHeader` renders its title.
- `biome` + `tsc -b` clean; production `vite build` succeeds.
- Visual check of the running app (Manifest with inherited panels; colored
  sections; PackOverview stat cards).
