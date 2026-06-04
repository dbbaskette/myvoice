# Shared Writing-Craft Baseline — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Problem

A composed prompt today is assembled in [compose.py](../../../packages/api/myvoice/compose.py) as:

```
ROLE/TASK header → Section 1: Humanizer (banished words/phrases/rules) → style-guide.md → format → samples → draft
```

Everything author-specific lives in the pack's `style-guide.md` and the banished
lists. Two gaps follow from this:

1. **No general writing-craft layer.** There is nothing that encodes
   author-agnostic craft fundamentals — the universal stuff that makes any
   rewrite better regardless of whose voice it is (concrete over abstract,
   vary rhythm, earn every sentence, strong verbs). Every pack has to
   re-derive this in its own `style-guide.md`, or go without.

2. **The TASK header leaks Dan's voice into every pack.** `_render_header`
   hardcodes *"The output must be energetic, definitive, and transparent.
   Never robotic."* ([compose.py:60-66](../../../packages/api/myvoice/compose.py#L60)).
   That tone is specific to the Dan pack but is applied to all packs.

## Goal

Add a **shared, author-agnostic writing-craft baseline** that is injected into
every composed prompt automatically, with an **optional per-pack override**, and
fix the hardcoded TASK leak so tone is pack-driven.

## Decisions (resolved during brainstorming)

- **Scope:** a single shared baseline that applies to every pack automatically
  (not a per-pack-authored slot).
- **Conflict model — Approach C:** ship one global default; every pack uses it
  unless the pack contains its own override file, which then *replaces* it.
  Unedited packs always track the latest shared default (no drift); a pack only
  diverges when its author deliberately writes an override.
- **Content:** drafted as part of this work (author-agnostic craft floor), to be
  trimmed in review.

## Design

### 1. Two files, one resolution rule

- **Global default:** `packages/api/myvoice/assets/writing-baseline.md`.
  Committed under the `myvoice` package, so the existing
  `[tool.hatch.build.targets.wheel] packages = ["packages/api/myvoice"]` config
  bundles it into the wheel with no `pyproject.toml` change. This is the single
  shared source; improving it improves every non-overriding pack on the next
  release.
- **Per-pack override:** `<pack_root>/writing-baseline.md`. Optional. If present,
  it *replaces* the global default for that pack only.
- The `_template` and `dan` packs ship **without** an override, so they ride the
  shared default. (`_template` shipping without one also documents that the file
  is optional.)

### 2. Resolution + injection (`compose.py`)

New helper:

```python
def _render_writing_craft(pack_root: Path) -> str:
    override = pack_root / "writing-baseline.md"
    body = (
        override.read_text(encoding="utf-8")
        if override.is_file()
        else _load_default_baseline()  # importlib.resources from myvoice/assets/
    )
    return (
        "## Section 2: General Writing Craft\n\n"
        "These are general craft defaults. Where the author's style guide "
        "below conflicts, the style guide wins.\n\n"
        f"{body}"
    )
```

`_load_default_baseline()` reads `assets/writing-baseline.md` via
`importlib.resources.files("myvoice")` so it works from an installed wheel as
well as the source tree.

Injection order in `compose()` (prompt mode only; bio mode unaffected):

```
header → Humanizer (Section 1) → General Writing Craft (Section 2) → style-guide.md → format → samples → draft
```

Placing craft *after* the anti-robot Humanizer and *before* the author's
`style-guide.md` means the model reads general craft first, then the specific
voice last and strongest. This realizes the "pack always wins" precedence even
when a pack has no override file, because the author's style guide is always the
final positive instruction and the section header states the rule explicitly.

### 3. Fix the hardcoded TASK leak

Split the hardcoded header string:

- *"Never robotic"* is universal → folded into the craft baseline content,
  removed from the header.
- The tone adjectives are pack-specific → sourced from a new **optional**
  `persona.tone: str | None` field in the manifest (`Manifest` /
  `stylepack.yaml`).

`_render_header` becomes:

```python
tone = m.persona.tone or "authentic to the author's voice"
# TASK: ... The output must be {tone}.
```

- Dan's pack sets `persona.tone: "energetic, definitive, and transparent"`.
- Packs without the field (e.g. `_template`) get the neutral fallback.
- The field is optional with a default of `None`, so existing packs validate and
  compose unchanged.

### 4. Scope boundaries (YAGNI)

**In scope:**
- `packages/api/myvoice/assets/writing-baseline.md` (drafted default).
- `_render_writing_craft` + `_load_default_baseline` + injection in `compose()`.
- Optional `persona.tone` manifest field; Dan pack sets it.
- Tests (see §6).

**Out of scope (future follow-on):**
- Editing the per-pack override or the global default through the web UI. The
  override is just a file a pack may contain; that is sufficient for v1.
- Lint/validate rules for the override file (it is freeform markdown).

### 5. Baseline content (draft, to be trimmed in review)

Author-agnostic craft floor, ~8–12 rules. Initial draft direction:

- Concrete over abstract — name the thing, show the example.
- Earn every sentence; cut what does not carry weight.
- Vary sentence length for rhythm; avoid uniform cadence.
- Strong verbs over adjective/adverb stacks.
- Specifics (numbers, examples, names) over vague claims.
- One idea per sentence.
- Prefer active voice.
- Read it aloud — would a person actually say this? Never robotic.

The exact wording is reviewed and trimmed before merge. Nothing here is
Dan-specific.

### 6. Tests

In `packages/api/tests` alongside existing compose tests:

- Default baseline is injected when the pack has no override file.
- A per-pack `writing-baseline.md` *replaces* the default (default text absent,
  override text present).
- Ordering: the craft section appears after the Humanizer section and before
  the `style-guide.md` body.
- TASK header uses `persona.tone` when set; falls back to the neutral phrasing
  when the field is absent.

## Out-of-scope / non-goals

- No change to bio mode composition.
- No change to format/sample/draft rendering.
- No UI surface for editing baselines in this iteration.
