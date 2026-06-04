# Shared AI-Tells Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, override-able anti-AI-tells layer — universal banished words/phrases/sentence-starters merged into every pack, plus structural-pattern prose — enforced in the composed prompt and (for high-precision cases) in lint; and migrate Dan's universal bans into the shared assets.

**Architecture:** Four bundled assets under `myvoice/assets/ai-tells/` are read by a new `myvoice.ai_tells` module that exposes `load_ai_tells()` and `effective_words/phrases/sentence_starters(manifest)` (deduped union of shared + per-pack). `compose.py` and `lint.py` both consume the merged lists; compose also injects a patterns sub-block (override via `<pack>/ai-patterns.md`); lint adds a high-precision `detect_ai_patterns(text)` detector wired into the two API lint call sites.

**Tech Stack:** Python 3.11, Pydantic v2, pytest + FastAPI TestClient, importlib.resources, hatchling.

---

## File Structure

- **Create** `packages/api/myvoice/assets/ai-tells/words.txt` — universal banished words.
- **Create** `packages/api/myvoice/assets/ai-tells/phrases.txt` — universal banished phrases.
- **Create** `packages/api/myvoice/assets/ai-tells/sentence-starters.txt` — forbidden openers.
- **Create** `packages/api/myvoice/assets/ai-tells/patterns.md` — structural-pattern prose.
- **Create** `packages/api/myvoice/ai_tells.py` — loader + merge helpers.
- **Modify** `packages/api/myvoice/lint.py` — use merged lists; add `detect_ai_patterns`.
- **Modify** `packages/api/myvoice/__init__.py` — export `detect_ai_patterns`.
- **Modify** `packages/api/myvoice/compose.py` — merged lists + patterns block + `ai-patterns.md` override.
- **Modify** `packages/api/myvoice/api/compose.py` + `api/rewrite.py` — append `detect_ai_patterns`.
- **Modify** `packs/dan/stylepack.yaml` — empty the migrated lists.
- **Tests:** new `test_ai_tells.py`, new `test_lint_ai_patterns.py`, extend `test_lint.py`, `test_compose.py`, `api/test_compose_route.py`.

Run python via `PYTHONPATH=packages/api .venv/bin/pytest …` (no network for `uv run`). Lint via `.venv/bin/ruff check packages/api/myvoice` and `.venv/bin/mypy packages/api/myvoice`.

---

## Task 1: `ai_tells` module + bundled assets

**Files:**
- Create: the four `packages/api/myvoice/assets/ai-tells/*` files
- Create: `packages/api/myvoice/ai_tells.py`
- Test: `packages/api/tests/test_ai_tells.py`

- [ ] **Step 1: Create `words.txt`**

Create `packages/api/myvoice/assets/ai-tells/words.txt`:

```
# Universal AI-tell vocabulary. One word per line. Lines starting with # are comments.
# Single words only — multi-word stock phrases go in phrases.txt.
delve
leverage
tapestry
orchestrate
paramount
underscore
realm
navigate
landscape
testament
arguably
foster
dynamic
utilize
robust
seamless
seamlessly
comprehensive
innovative
revolutionize
revolutionary
transformative
groundbreaking
embark
holistic
synergy
synergistic
paradigm
facilitate
pivotal
crucial
myriad
multifaceted
beacon
bespoke
empower
unleash
journey
harness
illuminate
bolster
garner
boasts
nestled
renowned
vibrant
meticulous
profound
streamline
differentiate
showcase
elevate
intricate
interplay
vital
cultivate
transcend
unravel
versatile
vivid
evoke
embody
nuance
poignant
reimagine
resonate
unlock
unlocks
powerhouse
game-changer
```

- [ ] **Step 2: Create `phrases.txt`**

Create `packages/api/myvoice/assets/ai-tells/phrases.txt`:

```
# Universal AI-tell phrases. One per line. Matched case-insensitively as substrings.
It's important to note that
It's worth noting that
In today's digital age
In an ever-evolving world
Embark on a journey
Let's dive in
Dive into
At its core
In essence
When it comes to
Designed to enhance
Stands as a testament to
In conclusion
In summary
a testament to
plays a vital role
in the heart of
leaves an indelible mark
shed light on
valuable insights
results-driven
actionable insights
innovative solutions
drive efficiency
solid foundation
strong collaborator
complex challenges
track record
in today's fast-paced
in the dynamic world of
as the world continues to evolve
```

- [ ] **Step 3: Create `sentence-starters.txt`**

Create `packages/api/myvoice/assets/ai-tells/sentence-starters.txt`:

```
# Forbidden sentence openers (classic AI connectors).
Absolutely
Certainly
Moreover
Furthermore
Additionally
```

- [ ] **Step 4: Create `patterns.md`**

Create `packages/api/myvoice/assets/ai-tells/patterns.md`:

```markdown
- **Negation / antithesis.** Do not set up a contrast just to knock it down. Avoid "It's not just X, it's Y", "not only A but also B", "X isn't just about Y", "X is more than just Y". State the affirmative directly. Before: "This isn't a tool, it's a movement." After: "This tool cuts deploy time from an hour to a minute."
- **Don't dodge plain verbs.** Use "is" and "has". Avoid inflating them into "serves as", "stands as", "boasts", "represents a", "plays a vital role", "leaves an indelible mark". Before: "The API serves as a gateway that boasts low latency." After: "The API is the gateway. It adds 5ms."
- **Don't force the rule of three.** AI pads with triplets ("fast, simple, and reliable"). Use a triplet only when all three earn their place; otherwise one strong term wins.
- **No participle tack-ons.** Don't append fake significance with "-ing" clauses: "..., highlighting its importance", "..., creating a seamless experience", "..., reflecting a broader trend." End the sentence.
- **No puffery.** Drop travel-brochure and press-release adjectives: "nestled in the heart of", "rich tapestry", "vibrant community", "breathtaking". Name the specific thing instead.
- **No vague attribution.** Don't cite "experts", "studies show", "industry reports", or "observers note" without a real source. Name it or cut it.
```

- [ ] **Step 5: Write the failing test**

Create `packages/api/tests/test_ai_tells.py`:

```python
"""Tests for the shared AI-tells loader and merge helpers."""

from myvoice.ai_tells import (
    effective_phrases,
    effective_sentence_starters,
    effective_words,
    load_ai_tells,
)
from myvoice.packs.manifest import Manifest


def _manifest(words=None, phrases=None, starters=None) -> Manifest:
    return Manifest.model_validate(
        {
            "spec_version": "1.0",
            "pack": {"slug": "t", "name": "T", "version": "1.0", "author": "T"},
            "persona": {"identity": "T", "one_line": "T"},
            "banished": {"words": words or [], "phrases": phrases or []},
            "rules": {"no_sentence_starters": starters or []},
        }
    )


def test_load_skips_comments_and_blanks() -> None:
    tells = load_ai_tells()
    assert "delve" in tells.words
    assert not any(w.startswith("#") for w in tells.words)
    assert "" not in tells.words
    assert "a testament to" in tells.phrases
    assert "Moreover" in tells.sentence_starters
    assert tells.patterns.strip()  # non-empty


def test_effective_words_is_deduped_union() -> None:
    # "delve" is shared; "frobnicate" is pack-only; "DELVE" duplicates shared.
    m = _manifest(words=["frobnicate", "DELVE"])
    eff = effective_words(m)
    assert "delve" in eff
    assert "frobnicate" in eff
    # case-insensitive dedup: only one of delve/DELVE survives
    assert sum(1 for w in eff if w.lower() == "delve") == 1
    # shared entries come before pack-only extras
    assert eff.index("delve") < eff.index("frobnicate")


def test_effective_phrases_and_starters_merge() -> None:
    m = _manifest(phrases=["pack phrase"], starters=["Frankly"])
    assert "a testament to" in effective_phrases(m)
    assert "pack phrase" in effective_phrases(m)
    assert "Moreover" in effective_sentence_starters(m)
    assert "Frankly" in effective_sentence_starters(m)
```

- [ ] **Step 6: Run to verify it fails**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_ai_tells.py -v`
Expected: FAIL — `myvoice.ai_tells` does not exist.

- [ ] **Step 7: Create the module**

Create `packages/api/myvoice/ai_tells.py`:

```python
"""Shared, bundled AI-writing tells.

Universal banished words/phrases/sentence-starters plus structural-pattern
prose, merged with a pack's own manifest rules. The lists are deduped unions
(shared first, then per-pack extras) keyed case-insensitively.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from importlib import resources

from myvoice.packs.manifest import Manifest


@dataclass(frozen=True)
class AiTells:
    words: tuple[str, ...]
    phrases: tuple[str, ...]
    sentence_starters: tuple[str, ...]
    patterns: str


def _read_lines(name: str) -> tuple[str, ...]:
    raw = (
        resources.files("myvoice")
        .joinpath(f"assets/ai-tells/{name}")
        .read_text(encoding="utf-8")
    )
    out: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            out.append(stripped)
    return tuple(out)


@lru_cache(maxsize=1)
def load_ai_tells() -> AiTells:
    return AiTells(
        words=_read_lines("words.txt"),
        phrases=_read_lines("phrases.txt"),
        sentence_starters=_read_lines("sentence-starters.txt"),
        patterns=(
            resources.files("myvoice")
            .joinpath("assets/ai-tells/patterns.md")
            .read_text(encoding="utf-8")
        ),
    )


def _dedup_ci(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        key = it.lower()
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def effective_words(m: Manifest) -> list[str]:
    return _dedup_ci([*load_ai_tells().words, *m.banished.words])


def effective_phrases(m: Manifest) -> list[str]:
    return _dedup_ci([*load_ai_tells().phrases, *m.banished.phrases])


def effective_sentence_starters(m: Manifest) -> list[str]:
    return _dedup_ci([*load_ai_tells().sentence_starters, *m.rules.no_sentence_starters])
```

- [ ] **Step 8: Run to verify it passes**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_ai_tells.py -v` → PASS.
Then: `.venv/bin/mypy packages/api/myvoice` → clean.

- [ ] **Step 9: Commit**

```bash
git add packages/api/myvoice/assets/ai-tells packages/api/myvoice/ai_tells.py packages/api/tests/test_ai_tells.py
git commit -m "feat(ai-tells): shared banished lists + structural patterns assets and loader"
```

---

## Task 2: Lint uses merged lists + structural-pattern detector

**Files:**
- Modify: `packages/api/myvoice/lint.py`
- Modify: `packages/api/myvoice/__init__.py`
- Test: extend `packages/api/tests/test_lint.py`; create `packages/api/tests/test_lint_ai_patterns.py`

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/tests/test_lint.py` (it already imports `lint` and builds manifests — match its existing manifest-construction helper; if it uses a fixture/loader, reuse that):

```python
def test_lint_flags_shared_word_absent_from_pack() -> None:
    """A pack with an empty banished list still flags a shared AI word."""
    from myvoice.lint import lint
    from myvoice.packs.manifest import Manifest

    m = Manifest.model_validate(
        {
            "spec_version": "1.0",
            "pack": {"slug": "t", "name": "T", "version": "1.0", "author": "T"},
            "persona": {"identity": "T", "one_line": "T"},
        }
    )
    vs = lint(m, "Let me delve into this.")
    assert any(v.match.lower() == "delve" for v in vs)
```

Create `packages/api/tests/test_lint_ai_patterns.py`:

```python
"""Tests for the universal structural AI-pattern detector."""

from myvoice.lint import detect_ai_patterns


def test_flags_negation_it_is_not_just() -> None:
    hits = detect_ai_patterns("It's not just a tool, it's a movement.")
    assert any(h.rule_id == "ai_pattern:negation" for h in hits)


def test_flags_not_only_but() -> None:
    hits = detect_ai_patterns("It is not only fast but also cheap.")
    assert any(h.rule_id == "ai_pattern:negation" for h in hits)


def test_flags_inflation_serves_as_and_testament() -> None:
    hits = detect_ai_patterns("It serves as a testament to good design.")
    assert any(h.rule_id == "ai_pattern:inflation" for h in hits)


def test_does_not_flag_plain_triplet_or_features() -> None:
    hits = detect_ai_patterns("Build. Bind. Deploy. The app features a cache.")
    assert hits == []


def test_hits_use_rule_kind() -> None:
    hits = detect_ai_patterns("This isn't just code.")
    assert hits and all(h.kind == "rule" for h in hits)
```

- [ ] **Step 2: Run to verify failure**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_lint_ai_patterns.py packages/api/tests/test_lint.py::test_lint_flags_shared_word_absent_from_pack -v`
Expected: FAIL — `detect_ai_patterns` undefined; shared word not yet merged into `lint`.

- [ ] **Step 3: Make `lint()` use the merged lists**

In `packages/api/myvoice/lint.py`, add the import near the top (after `from myvoice.packs.manifest import Manifest`):

```python
from myvoice.ai_tells import (
    effective_phrases,
    effective_sentence_starters,
    effective_words,
)
```

Then in `lint()`, change the three iteration sources:

- `for word in manifest.banished.words:` → `for word in effective_words(manifest):`
- `for phrase in manifest.banished.phrases:` → `for phrase in effective_phrases(manifest):`
- The sentence-starter block guard and source:

```python
    starters = effective_sentence_starters(manifest)
    if starters:
        starter_alt = "|".join(re.escape(s) for s in starters)
        pattern = re.compile(rf"(?:^|(?<=[.!?]\s))({starter_alt})\b")
        for ln_no, line in enumerate(lines, start=1):
            for m in pattern.finditer(line):
                violations.append(Violation(
                    kind="rule",
                    message=f'sentence starts with "{m.group(1)}"',
                    match=m.group(1),
                    line=ln_no,
                    column=m.start(1),
                ))
```

(The exemption logic in the words loop — `if m.group(1) in exemptions: continue` — stays exactly as is. Exceptions still apply at match time over the merged list.)

- [ ] **Step 4: Add `detect_ai_patterns`**

In `packages/api/myvoice/lint.py`, add these module-level regexes near the other compiled patterns (after `_GOLDEN`):

```python
_AI_NEGATION = re.compile(
    r"\b(?:it'?s not just|(?:isn'?t|aren'?t|wasn'?t|weren'?t) just"
    r"|more than just|goes beyond just)\b",
    re.IGNORECASE,
)
_AI_NOT_ONLY = re.compile(r"\bnot only\b[^.?!]*\bbut\b", re.IGNORECASE)
_AI_INFLATION = re.compile(
    r"\b(?:serves as|stands as|a testament to|leaves? an indelible mark"
    r"|plays? a (?:vital|crucial|pivotal|key|central) role)\b",
    re.IGNORECASE,
)
```

Add the function (place it next to `detect_positive_hits`):

```python
def detect_ai_patterns(text: str) -> list[LintHit]:
    """Detect high-precision structural AI-writing tells (negation, inflation)."""
    hits: list[LintHit] = []
    specs = (
        (_AI_NEGATION, "ai_pattern:negation", "AI negation/antithesis pattern."),
        (_AI_NOT_ONLY, "ai_pattern:negation", "AI 'not only... but' pattern."),
        (_AI_INFLATION, "ai_pattern:inflation", "AI significance-inflation phrasing."),
    )
    for pattern, rule_id, message in specs:
        for m in pattern.finditer(text):
            hits.append(LintHit(
                start=_utf16_offset(text, m.start()),
                end=_utf16_offset(text, m.end()),
                kind="rule",
                rule_id=rule_id,
                message=message,
            ))
    return hits
```

- [ ] **Step 5: Export it**

In `packages/api/myvoice/__init__.py`, add `detect_ai_patterns` to both the `from myvoice.lint import (...)` block and `__all__` (keep alphabetical ordering already present):

```python
from myvoice.lint import (
    LintHit,
    Violation,
    detect_ai_patterns,
    detect_positive_hits,
    lint,
    lint_to_hits,
)
```
and in `__all__` add `"detect_ai_patterns",` before `"detect_positive_hits",`.

- [ ] **Step 6: Run to verify pass**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_lint_ai_patterns.py packages/api/tests/test_lint.py packages/api/tests/test_public_api.py -v` → PASS.
Then: `.venv/bin/mypy packages/api/myvoice` and `.venv/bin/ruff check packages/api/myvoice` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/api/myvoice/lint.py packages/api/myvoice/__init__.py packages/api/tests/test_lint.py packages/api/tests/test_lint_ai_patterns.py
git commit -m "feat(lint): merge shared AI-tell lists + add structural-pattern detector"
```

---

## Task 3: Compose merges lists + injects patterns block

**Files:**
- Modify: `packages/api/myvoice/compose.py`
- Test: extend `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/tests/test_compose.py`:

```python
def test_humanizer_includes_shared_word() -> None:
    """A shared AI word appears in Dan's Humanizer (even once Dan's list empties)."""
    out = compose(_load_dan())
    assert "delve" in out


def test_humanizer_includes_ai_patterns_block() -> None:
    out = compose(_load_dan())
    assert "Avoid these AI sentence patterns" in out
    assert "Negation / antithesis" in out  # from patterns.md


def test_pack_ai_patterns_override(tmp_path: Path) -> None:
    (tmp_path / "stylepack.yaml").write_text(
        "spec_version: '1.0'\n"
        "pack:\n  slug: ov\n  name: O\n  version: '1.0'\n  author: T\n"
        "persona:\n  identity: O\n  one_line: o\n",
        encoding="utf-8",
    )
    (tmp_path / "style-guide.md").write_text("# Style Guide\n\nprose\n", encoding="utf-8")
    (tmp_path / "ai-patterns.md").write_text("- **Custom AI rule.** Only here.\n", encoding="utf-8")
    out = compose(tmp_path)
    assert "Custom AI rule." in out
    assert "Negation / antithesis" not in out  # default replaced
    assert "Avoid these AI sentence patterns" in out  # wrapper still present
```

- [ ] **Step 2: Run to verify failure**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_compose.py::test_humanizer_includes_ai_patterns_block packages/api/tests/test_compose.py::test_pack_ai_patterns_override -v`
Expected: FAIL — patterns block not rendered yet. (`test_humanizer_includes_shared_word` may already pass because Dan's inline list still has "delve" until Task 5 — that's fine; it must stay passing through Task 5.)

- [ ] **Step 3: Import the merge helpers**

In `packages/api/myvoice/compose.py`, add after the existing imports:

```python
from myvoice.ai_tells import (
    effective_phrases,
    effective_sentence_starters,
    effective_words,
    load_ai_tells,
)
```

- [ ] **Step 4: Change `_render_humanizer` to take `pack_root` and use merged lists + patterns**

Replace the `_render_humanizer` signature and the three list sources, and append the patterns block. The new function:

```python
def _render_humanizer(m: Manifest, pack_root: Path) -> str:
    lines: list[str] = ["## Section 1: The Humanizer (Strict Anti-Robot Constraints)\n"]
    lines.append("Before applying style, you must scrub the text of LLM-isms:\n")

    words = effective_words(m)
    if words:
        lines.append("**Banished Vocabulary** (do NOT use):")
        lines.append(", ".join(words))
        lines.append("")

    phrases = effective_phrases(m)
    if phrases:
        lines.append("**Banished Phrases** (strike on sight):")
        for ph in phrases:
            lines.append(f'- "{ph}"')
        lines.append("")

    if m.banished.permitted_exceptions:
        lines.append("**Permitted exceptions** (on-brand overlaps with AI tells):")
        for ex in m.banished.permitted_exceptions:
            lines.append(f"- *{ex.term}*: {ex.reason}")
        lines.append("")

    rules: list[str] = []
    if m.rules.no_em_dashes:
        rules.append("No em dashes.")
    if m.rules.no_ascii_double_hyphen_between_letters:
        rules.append("No ASCII double-hyphen (`--`) between letters.")
    starters = effective_sentence_starters(m)
    if starters:
        joined = ", ".join(f'"{s}"' for s in starters)
        rules.append(f"No sentence starts with: {joined}.")
    if rules:
        lines.append("**Rules:**")
        for r in rules:
            lines.append(f"- {r}")
        lines.append("")

    if m.pop_culture.allowed or m.pop_culture.banned:
        lines.append("**Pop culture:**")
        if m.pop_culture.allowed:
            lines.append(f"- Allowed franchises: {', '.join(m.pop_culture.allowed)}")
        if m.pop_culture.banned:
            lines.append(f"- Banned franchises: {', '.join(m.pop_culture.banned)}")
        lines.append("")

    lines.append("**Avoid these AI sentence patterns:**\n")
    lines.append(_load_ai_patterns(pack_root))

    return "\n".join(lines)
```

(Note: the only structural changes vs. the current function are the three `effective_*` sources and the trailing patterns block plus a blank line after the pop-culture block. Everything else is unchanged.)

- [ ] **Step 5: Add the patterns loader and update the call site**

Add this helper to `compose.py` (next to `_load_default_baseline`):

```python
def _load_ai_patterns(pack_root: Path) -> str:
    override = pack_root / "ai-patterns.md"
    if override.is_file():
        return override.read_text(encoding="utf-8")
    return load_ai_tells().patterns
```

In `compose()`, update the humanizer call to pass `pack_root`:

```python
    parts.append(_render_humanizer(manifest, pack_root))
```

- [ ] **Step 6: Run to verify pass**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_compose.py -v` → all PASS.
Then: `.venv/bin/mypy packages/api/myvoice` and `.venv/bin/ruff check packages/api/myvoice` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/api/myvoice/compose.py packages/api/tests/test_compose.py
git commit -m "feat(compose): merge shared AI-tell lists + inject patterns block with override"
```

---

## Task 4: Wire the structural detector into the API lint endpoints

**Files:**
- Modify: `packages/api/myvoice/api/compose.py`
- Modify: `packages/api/myvoice/api/rewrite.py`
- Test: extend `packages/api/tests/api/test_compose_route.py`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/tests/api/test_compose_route.py`:

```python
def test_lint_endpoint_flags_ai_pattern(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post(
        "/api/lint",
        json={"pack": "dan", "text": "It's not just a tool, it's a movement."},
    )
    assert r.status_code == 200
    rule_ids = [v["rule_id"] for v in r.json()["violations"]]
    assert any(rid == "ai_pattern:negation" for rid in rule_ids)
```

- [ ] **Step 2: Run to verify failure**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/api/test_compose_route.py::test_lint_endpoint_flags_ai_pattern -v`
Expected: FAIL — the negation hit is not in the response (`detect_ai_patterns` not wired in).

- [ ] **Step 3: Wire `api/compose.py`**

In `packages/api/myvoice/api/compose.py`, change the import:

```python
from myvoice.lint import detect_ai_patterns, detect_positive_hits, lint_to_hits
```

and the lint line in `lint_endpoint`:

```python
    violations = lint_to_hits(manifest, req.text) + detect_ai_patterns(req.text)
```

- [ ] **Step 4: Wire `api/rewrite.py`**

In `packages/api/myvoice/api/rewrite.py`, change the import:

```python
from myvoice.lint import detect_ai_patterns, detect_positive_hits, lint_to_hits
```

and the lint line (~103):

```python
        violations = lint_to_hits(manifest, full_output) + detect_ai_patterns(full_output)
```

- [ ] **Step 5: Run to verify pass**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/api/test_compose_route.py packages/api/tests/api/test_rewrite_route.py -v` → PASS.
Then: `.venv/bin/ruff check packages/api/myvoice` and `.venv/bin/mypy packages/api/myvoice` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/myvoice/api/compose.py packages/api/myvoice/api/rewrite.py packages/api/tests/api/test_compose_route.py
git commit -m "feat(api): include structural AI-pattern hits in lint responses"
```

---

## Task 5: Migrate Dan's universal bans into the shared layer

**Files:**
- Modify: `packs/dan/stylepack.yaml`
- Test: extend `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the equivalence test**

Append to `packages/api/tests/test_compose.py`:

```python
def test_dan_effective_bans_survive_migration() -> None:
    """After emptying Dan's inline lists, representative bans still appear via the
    shared layer, and Dan's permitted exceptions are still rendered."""
    out = compose(_load_dan())
    for word in ("delve", "utilize", "seamless", "embark"):
        assert word in out, f"{word} missing from Dan's composed output"
    for phrase in ("In conclusion", "At its core"):
        assert phrase in out
    # Dan-specific config retained:
    assert "Pivotal" in out  # permitted exception term
    assert "Marvel" in out   # pop culture allowed
```

- [ ] **Step 2: Run to verify it passes BEFORE the edit (baseline)**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_compose.py::test_dan_effective_bans_survive_migration -v`
Expected: PASS already (the words come from Dan's inline list today). This test is the safety net for the edit in Step 3 — it must still pass after.

- [ ] **Step 3: Empty Dan's migrated lists**

Edit `packs/dan/stylepack.yaml`. In the `banished:` block, replace the entire `words:` list and `phrases:` list with empty lists, keeping `permitted_exceptions` intact. The `banished:` block becomes:

```yaml
banished:
  words: []
  phrases: []
  permitted_exceptions:
    - term: "Pivotal"
      reason: "Proper noun (Pivotal Software, Pivotal Cloud Foundry)"
    - term: "unlock"
      reason: "Part of Speed-to-Value vocabulary"
    - term: "unlocks"
      reason: "Part of Speed-to-Value vocabulary"
    - term: "powerhouse"
      reason: "Part of Speed-to-Value vocabulary"
    - term: "tipping point"
      reason: "Part of Speed-to-Value vocabulary"
    - term: "game-changer"
      reason: "Part of Speed-to-Value vocabulary"
    - term: "changes the game"
      reason: "Part of Speed-to-Value vocabulary"
```

In the `rules:` block, set `no_sentence_starters` to empty (Absolutely/Certainly/Moreover/Furthermore/Additionally are now shared):

```yaml
rules:
  no_em_dashes: true
  no_ascii_double_hyphen_between_letters: true
  no_sentence_starters: []
```

Leave `persona`, `pop_culture`, `formats`, `samples`, and `bios` unchanged.

- [ ] **Step 4: Run the equivalence test + the existing endpoint guard**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests/test_compose.py::test_dan_effective_bans_survive_migration packages/api/tests/api/test_compose_route.py::test_lint_endpoint_flags_banished_word -v`
Expected: PASS — `delve` still flagged for Dan (now via the shared layer); representative bans still in composed output.

- [ ] **Step 5: Validate the pack still parses**

Run: `PYTHONPATH=packages/api .venv/bin/python -c "import yaml; from myvoice.packs.manifest import Manifest; Manifest.model_validate(yaml.safe_load(open('packs/dan/stylepack.yaml'))); print('dan manifest OK')"`
Expected: prints `dan manifest OK`.

- [ ] **Step 6: Commit**

```bash
git add packs/dan/stylepack.yaml packages/api/tests/test_compose.py
git commit -m "refactor(dan): migrate universal bans to the shared AI-tells layer"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full Python suite**

Run: `PYTHONPATH=packages/api .venv/bin/pytest packages/api/tests -q`
Expected: all pass (≥ 210 + the new tests).

- [ ] **Step 2: Lint + types**

Run: `.venv/bin/ruff check packages/api/myvoice && .venv/bin/mypy packages/api/myvoice`
Expected: clean.

- [ ] **Step 3: End-to-end compose sanity (Dan)**

Run:
```bash
PYTHONPATH=packages/api .venv/bin/python -c "
from pathlib import Path
from myvoice.compose import compose
out = compose(Path('packs/dan'))
for marker in ['Banished Vocabulary', 'delve', 'Avoid these AI sentence patterns', 'Negation / antithesis', 'Pivotal', '## Section 2: General Writing Craft']:
    print(('OK  ' if marker in out else 'MISS')+' '+repr(marker))
"
```
Expected: every marker prints `OK`.

- [ ] **Step 4: Confirm assets are git-tracked (wheel bundling)**

Run: `git ls-files packages/api/myvoice/assets/ai-tells/`
Expected: lists all four files (they bundle via hatchling's default-include, like `writing-baseline.md`; an actual `make build` confirmation requires PyPI access and can be run later).

---

## Self-Review

- **Spec coverage:** §1 assets → Task 1 (Steps 1-4); §2 loader/merge → Task 1 (Steps 5-9); §3 compose merge+patterns+override → Task 3; §4 lint merge + `detect_ai_patterns` (high-precision, `kind="rule"`) → Task 2; §5 API wiring + export → Task 2 (export) + Task 4 (call sites); §6 Dan migration + equivalence → Task 5; §7 scope (no UI, no new kind, prose-only soft tells) honored — no tasks add those. Tests in §"Tests" map to Tasks 1-5. All covered.
- **Placeholder scan:** none — every code step shows complete content.
- **Type consistency:** `AiTells` fields and `effective_words/phrases/sentence_starters(Manifest) -> list[str]` defined in Task 1 are consumed unchanged in Tasks 2-3; `detect_ai_patterns(text) -> list[LintHit]` defined in Task 2 used identically in Task 4; `_render_humanizer(m, pack_root)` new signature defined and its sole call site updated in Task 3; `rule_id` values `ai_pattern:negation` / `ai_pattern:inflation` identical across Task 2 impl and Task 2/4 test assertions; `LintHit(kind="rule", ...)` matches the existing `Literal` type.
