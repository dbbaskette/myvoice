# Shared AI-Tells Layer — Design

**Date:** 2026-06-04
**Status:** Draft for review

## Problem

The current rule system is almost entirely a **per-pack word/phrase blocklist**
(`banished.words`, `banished.phrases`) plus a few boolean `rules` (no em-dash,
no ASCII double-hyphen, no sentence-starters). It catches AI *vocabulary* well —
Dan's pack already bans ~60 single-word tells — but it has two gaps:

1. **No structural-pattern coverage.** Research across six sources (Pangram,
   Wikipedia "Signs of AI writing", Hunting the Muse, Grammarly, Blake Stockton's
   negation guide, Westcliff) agrees that 2025-era AI smell has moved past
   vocabulary into *structure*: the negation/antithesis pattern, copula
   avoidance, participle tack-ons, significance inflation, vague attribution. A
   flat word list structurally cannot detect these.

2. **Universal tells are duplicated per pack.** Every pack re-derives the same
   universal AI bans inline. There is no shared source, so the lists drift and
   each new pack starts from nothing.

## Goal

A **shared, override-able anti-AI-tells layer**: universal banished words,
phrases, and sentence-starters merged into every pack automatically, plus a
shared block of structural-pattern prose. Enforced in the composed prompt for
everything, and additionally in `lint.py` for the subset that regex detects with
high precision.

## Decisions (resolved during brainstorming)

- **Architecture:** shared lists **and** shared structural patterns (the most
  thorough option). Both are shared defaults a pack can override.
- **Enforcement:** prompt-side for everything; plus machine-checkable `lint.py`
  checks where regex is reliable.
- **Soft tells (rule-of-three, generic copulas like `features`/`offers`):**
  prompt-prose only, never linted. They collide with legitimate voices (Dan's
  Golden Command deliberately uses triplets), so flagging them would
  false-positive on good writing.
- **Dan's list:** migrate Dan's universal words/phrases/sentence-starters into
  the shared layer, leaving his pack with only Dan-specific config
  (`permitted_exceptions`, `pop_culture`). Nearly all of Dan's current bans are
  universal, so his `banished.words`, `banished.phrases`, and
  `rules.no_sentence_starters` end up effectively empty.

## Design

### 1. Data — bundled assets

New directory `packages/api/myvoice/assets/ai-tells/` (ships in the wheel via the
existing `packages = ["packages/api/myvoice"]` rule, same as `writing-baseline.md`):

- `words.txt` — one banished word per line.
- `phrases.txt` — one banished phrase per line.
- `sentence-starters.txt` — one forbidden sentence-starter per line.
- `patterns.md` — structural-pattern prose for the prompt (negation/antithesis,
  copula avoidance, rule-of-three overuse, participle tack-ons, puffery /
  significance inflation, vague attribution), each with one before→after.

**File format for the `.txt` files:** UTF-8, one entry per line. Lines that are
blank or begin with `#` (after trimming) are ignored (comments). Entries are
trimmed of surrounding whitespace; internal spaces in phrases are preserved.

### 2. Loader + merge — `packages/api/myvoice/ai_tells.py` (new module)

```python
@dataclass(frozen=True)
class AiTells:
    words: tuple[str, ...]
    phrases: tuple[str, ...]
    sentence_starters: tuple[str, ...]
    patterns: str

@lru_cache(maxsize=1)
def load_ai_tells() -> AiTells: ...   # reads the four assets via importlib.resources

def effective_words(m: Manifest) -> list[str]: ...            # dedup(shared + pack), case-insensitive
def effective_phrases(m: Manifest) -> list[str]: ...
def effective_sentence_starters(m: Manifest) -> list[str]: ...
```

**Merge rule:** `effective_*` returns `dedup_ci(shared_list + pack_list)` — shared
entries first, pack-specific extras after, first-occurrence-wins on a
case-insensitive key. `lru_cache` avoids re-reading assets on every compose/lint.

**Exceptions are NOT removed from the merged list.** `permitted_exceptions`
continue to be applied *at match time* by `lint()` (a case-sensitive exact-match
exemption), exactly as today. This preserves the current semantics where the
lowercase word stays banned but a specific proper-noun casing is exempt (e.g.
"pivotal" banned, "Pivotal" allowed). Compose continues to render the pack's
`permitted_exceptions` block separately.

### 3. Compose changes (`compose.py`)

- `_render_humanizer(m)` → `_render_humanizer(m, pack_root)`. It renders the
  **merged** words / phrases / sentence-starters via `effective_*`, then appends
  a new sub-block:

  ```
  **Avoid these AI sentence patterns:**

  <patterns text>
  ```

- Patterns text resolution mirrors the writing-baseline override: a pack-local
  `<pack_root>/ai-patterns.md` replaces the shared default if present, else
  `load_ai_tells().patterns`. Helper `_load_ai_patterns(pack_root)`.
- The Humanizer stays "Section 1"; the patterns block is a subsection within it
  (it is anti-robot scrubbing, which is the Humanizer's job). The writing-craft
  baseline ("Section 2") and the rest of the prompt are unchanged.

### 4. Lint changes (`lint.py`)

- `lint(manifest, text)` uses `effective_words/phrases/sentence_starters(manifest)`
  in place of the direct `manifest.banished.*` / `manifest.rules.no_sentence_starters`
  reads. Exception handling at match time is unchanged. Result: the shared lists
  are linted for every pack automatically.
- **New** `detect_ai_patterns(text) -> list[LintHit]`, parallel to the existing
  `detect_positive_hits`. High-precision regexes only:
  - **Negation/antithesis** (`rule_id="ai_pattern:negation"`):
    `it'?s not just`, `(isn'?t|aren'?t|wasn'?t|weren'?t) just`,
    `not only\b[^.?!]*\bbut`, `more than just`, `goes beyond just`.
  - **Significance inflation / copula** (`rule_id="ai_pattern:inflation"`):
    `serves as`, `stands as`, `a testament to`, `leaves? an indelible mark`,
    `plays? a (vital|crucial|pivotal|key|central) role`.
  - Each hit is `LintHit(kind="rule", rule_id=..., message=...)`. **Reusing the
    existing `"rule"` kind means no frontend change** — these render with the same
    styling as other rule violations; the `rule_id` distinguishes them. (A
    dedicated `"ai_pattern"` kind is a possible future enhancement but is out of
    scope.)
- Soft tells (rule-of-three, generic copulas) are deliberately **absent** from
  `detect_ai_patterns` — they live only in `patterns.md`.

### 5. API wiring

Both lint call sites append the structural detector to the negative violations:

- `api/compose.py:60` and `api/rewrite.py:103`:
  `violations = lint_to_hits(manifest, text) + detect_ai_patterns(text)`
- `detect_ai_patterns` is exported from `myvoice/__init__.py` alongside
  `detect_positive_hits`.

### 6. Dan pack migration (`packs/dan/stylepack.yaml`)

- Move every universal entry from `banished.words`, `banished.phrases`, and
  `rules.no_sentence_starters` into the shared assets. Dan's curated universal
  bans become the seed of `words.txt` / `phrases.txt` / `sentence-starters.txt`,
  combined with the net-new tells from the research.
- Dan's pack retains: `persona` (incl. `tone`), `banished.permitted_exceptions`
  (now carving against the shared list), `pop_culture`, `rules.no_em_dashes`,
  `rules.no_ascii_double_hyphen_between_letters`, and all `formats` / `samples` /
  `bios`. `banished.words`, `banished.phrases`, and `rules.no_sentence_starters`
  end up empty (or omitted).
- Terms Dan exempts (`Pivotal`, `unlock(s)`, `powerhouse`, `tipping point`,
  `game-changer`, `changes the game`) must exist in the shared lists for the
  exemptions to remain meaningful; include them in the shared assets.

**Equivalence requirement:** Dan's *effective* banned set after migration must be
a superset of his pre-migration inline set. A test asserts representative words
(`delve`, `utilize`, `seamless`, …) and phrases still appear in Dan's composed
Humanizer, and that his exemptions still take effect.

### 7. Scope boundaries (YAGNI)

**In scope:** the four assets, the `ai_tells` loader + merge, compose merge +
patterns block + `ai-patterns.md` override, lint merge + `detect_ai_patterns`,
API wiring, Dan migration, tests.

**Out of scope:**
- A UI for editing the shared lists or patterns (they are files; power users edit
  them directly — same posture as `writing-baseline.md`).
- A dedicated `"ai_pattern"` LintHit kind / frontend styling (reuse `"rule"`).
- Formatting tells (emoji, title-case headings, excessive bold). These collide
  hardest with legitimate voices (Dan *mandates* bold bullet leads), so at most a
  line in `patterns.md`; no enforcement.
- Linting rule-of-three / generic copulas (prompt-prose only, per decision).

## Tests

- `ai_tells` loader: parses lines, skips blanks/comments, returns expected tuples;
  `patterns` is non-empty.
- Merge: `effective_words` is the deduped union (shared first); a pack word that
  duplicates a shared word appears once; pack-specific extras appear.
- Compose: a shared word (e.g. `delve`) appears in Dan's Humanizer even though
  Dan's inline `banished.words` is now empty; the "Avoid these AI sentence
  patterns" block and a phrase from `patterns.md` appear; a pack `ai-patterns.md`
  override replaces the default.
- Lint: `detect_ai_patterns` flags "it's not just X, it's Y", "not only A but B",
  "a testament to", "serves as"; it does **not** flag a plain triplet
  ("Build. Bind. Deploy.") or the word "features".
- Lint merge: a shared banished word is reported as a violation for a pack whose
  inline list does not contain it.
- Dan equivalence: representative pre-migration words/phrases still appear in
  Dan's composed output; Dan's `permitted_exceptions` still exempt their terms.

## Out-of-scope / non-goals

- No change to bio mode, formats, samples, or the writing-craft baseline section.
- No new manifest fields (the shared layer is asset-driven, not manifest-driven;
  per-pack additions keep using existing `banished.*` / `rules.*`).
