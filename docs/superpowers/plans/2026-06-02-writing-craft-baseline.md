# Writing-Craft Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a shared, author-agnostic writing-craft baseline into every composed prompt (with an optional per-pack override) and make the TASK header's tone pack-driven instead of hardcoded.

**Architecture:** A default baseline markdown file ships inside the `myvoice` package (`assets/writing-baseline.md`) and is loaded via `importlib.resources`. `compose()` injects it as a new section between the Humanizer and the author's `style-guide.md`; if a pack contains its own `writing-baseline.md`, that replaces the default for that pack. The hardcoded tone string in `_render_header` is replaced by an optional `persona.tone` manifest field with a neutral fallback.

**Tech Stack:** Python 3.11, Pydantic v2 (strict models), pytest, hatchling (wheel packaging).

---

## File Structure

- **Modify** `packages/api/myvoice/packs/manifest.py` — add optional `tone` to `Persona`.
- **Modify** `packages/api/myvoice/compose.py` — pack-driven header tone; new `_load_default_baseline()` and `_render_writing_craft()`; inject the section.
- **Create** `packages/api/myvoice/assets/writing-baseline.md` — the shared default craft rules (bundled in the wheel automatically, since the wheel packages the whole `myvoice` dir).
- **Modify** `packs/dan/stylepack.yaml` — set `persona.tone`.
- **Modify** `packages/api/tests/test_compose.py` — tests for header tone, default injection, ordering, and per-pack override.

---

## Task 1: Pack-driven TASK header tone

**Files:**
- Modify: `packages/api/myvoice/packs/manifest.py` (Persona class, ~line 25)
- Modify: `packages/api/myvoice/compose.py` (`_render_header`, ~line 60)
- Modify: `packs/dan/stylepack.yaml` (persona section)
- Test: `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_compose.py`:

```python
from myvoice.compose import _render_header
from myvoice.packs.manifest import Manifest


def _manifest(tone: str | None) -> Manifest:
    persona: dict[str, str] = {"identity": "The Tester", "one_line": "Writes tests."}
    if tone is not None:
        persona["tone"] = tone
    return Manifest.model_validate(
        {
            "spec_version": "1.0",
            "pack": {"slug": "t", "name": "T", "version": "1.0"},
            "persona": persona,
        }
    )


def test_header_uses_persona_tone_when_set() -> None:
    out = _render_header(_manifest("calm, precise, and warm"))
    assert "The output must be calm, precise, and warm." in out
    # The old hardcoded Dan tone must be gone from the generic path
    assert "energetic, definitive, and transparent" not in out


def test_header_falls_back_when_tone_absent() -> None:
    out = _render_header(_manifest(None))
    assert "The output must be authentic to the author's voice." in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest packages/api/tests/test_compose.py::test_header_uses_persona_tone_when_set packages/api/tests/test_compose.py::test_header_falls_back_when_tone_absent -v`
Expected: FAIL — `persona` rejects unknown key `tone` (strict model) and/or header still contains the hardcoded string.

- [ ] **Step 3: Add the optional field to Persona**

In `packages/api/myvoice/packs/manifest.py`, change the `Persona` model:

```python
class Persona(_StrictModel):
    identity: str = Field(min_length=1)
    one_line: str = Field(min_length=1)
    tone: str | None = None
```

- [ ] **Step 4: Make the header use it**

In `packages/api/myvoice/compose.py`, replace `_render_header`:

```python
def _render_header(m: Manifest) -> str:
    tone = m.persona.tone or "authentic to the author's voice"
    return (
        f"ROLE: You are {m.persona.identity}. {m.persona.one_line}\n\n"
        "TASK: Rewrite the input text to be 100% authentic to the style guide "
        f"below. The output must be {tone}."
    )
```

(The previous `Never robotic.` clause is intentionally dropped here — it moves into the shared baseline in Task 2.)

- [ ] **Step 5: Set Dan's tone**

In `packs/dan/stylepack.yaml`, add `tone` under `persona:` so it reads:

```yaml
persona:
  identity: "The Builder Who Gets It"
  one_line: "Bridges high-level strategy and technical reality; maker who advocates for the developer."
  tone: "energetic, definitive, and transparent"
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest packages/api/tests/test_compose.py -v`
Expected: PASS — the two new tests pass and all existing compose tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/myvoice/packs/manifest.py packages/api/myvoice/compose.py packs/dan/stylepack.yaml packages/api/tests/test_compose.py
git commit -m "feat(compose): pack-driven TASK tone via optional persona.tone"
```

---

## Task 2: Shared default baseline asset

**Files:**
- Create: `packages/api/myvoice/assets/writing-baseline.md`

- [ ] **Step 1: Create the asset file**

Create `packages/api/myvoice/assets/writing-baseline.md` with exactly this content:

```markdown
- **Concrete over abstract.** Name the thing. Show the example. Replace "improves performance" with the actual number.
- **Earn every sentence.** If a sentence does not carry weight, cut it. Shorter is usually stronger.
- **Vary sentence length.** Mix short and long for rhythm. Uniform cadence reads like a machine.
- **Strong verbs.** Prefer one precise verb over an adjective-adverb stack. "Slashed" beats "significantly reduced."
- **Specifics over claims.** Numbers, names, and examples beat vague praise.
- **One idea per sentence.** Split any sentence trying to do two jobs.
- **Active voice by default.** Name who does what. Use passive voice only when the actor genuinely does not matter.
- **Cut hedging and filler.** Drop "very," "really," "quite," "in order to," and throat-clearing intros.
- **Read it aloud.** If a person would not say it that way, rewrite it. Never robotic.
```

(No top-level heading — the renderer in Task 3 supplies the section header and the precedence note. The list-only body is also what an author would write in a per-pack override.)

- [ ] **Step 2: Commit**

```bash
git add packages/api/myvoice/assets/writing-baseline.md
git commit -m "feat(compose): add shared writing-craft baseline asset"
```

---

## Task 3: Inject the writing-craft section into compose

**Files:**
- Modify: `packages/api/myvoice/compose.py` (imports, `compose()` body ~line 43, new helpers)
- Test: `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the failing tests**

Add to `packages/api/tests/test_compose.py`:

```python
def test_compose_injects_default_writing_craft() -> None:
    """With no per-pack override, the shared baseline default is injected."""
    out = compose(_load_dan())
    assert "## Section 2: General Writing Craft" in out
    assert "Where the author's style guide below conflicts" in out
    assert "Never robotic" in out  # moved here from the old header
    assert "Concrete over abstract" in out


def test_compose_writing_craft_ordering() -> None:
    """Craft section sits after the Humanizer and before the style-guide prose."""
    out = compose(_load_dan())
    humanizer = out.index("Section 1: The Humanizer")
    craft = out.index("## Section 2: General Writing Craft")
    style_guide = out.index("## Writing Principles")  # from style-guide.md
    assert humanizer < craft < style_guide
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest packages/api/tests/test_compose.py::test_compose_injects_default_writing_craft packages/api/tests/test_compose.py::test_compose_writing_craft_ordering -v`
Expected: FAIL — `## Section 2: General Writing Craft` is not present in the output yet.

- [ ] **Step 3: Add the helpers**

In `packages/api/myvoice/compose.py`, add the import near the top (after `from pathlib import Path`):

```python
from importlib import resources
```

Then add these two functions (place them above `_render_header`):

```python
def _load_default_baseline() -> str:
    """Read the shared writing-craft baseline bundled in the package."""
    return (
        resources.files("myvoice")
        .joinpath("assets/writing-baseline.md")
        .read_text(encoding="utf-8")
    )


def _render_writing_craft(pack_root: Path) -> str:
    override = pack_root / "writing-baseline.md"
    body = (
        override.read_text(encoding="utf-8")
        if override.is_file()
        else _load_default_baseline()
    )
    return (
        "## Section 2: General Writing Craft\n\n"
        "These are general craft defaults. Where the author's style guide "
        "below conflicts, the style guide wins.\n\n"
        f"{body}"
    )
```

- [ ] **Step 4: Inject the section into `compose()`**

In `compose()`, the prompt-mode assembly currently reads:

```python
    parts: list[str] = []
    parts.append(_render_header(manifest))
    parts.append(_render_humanizer(manifest))
    parts.append((pack_root / "style-guide.md").read_text(encoding="utf-8"))
```

Change it to insert the craft section between the humanizer and the style guide:

```python
    parts: list[str] = []
    parts.append(_render_header(manifest))
    parts.append(_render_humanizer(manifest))
    parts.append(_render_writing_craft(pack_root))
    parts.append((pack_root / "style-guide.md").read_text(encoding="utf-8"))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest packages/api/tests/test_compose.py -v`
Expected: PASS — both new tests pass; all existing compose tests still pass (bio mode is untouched).

- [ ] **Step 6: Commit**

```bash
git add packages/api/myvoice/compose.py packages/api/tests/test_compose.py
git commit -m "feat(compose): inject writing-craft section with default + override"
```

---

## Task 4: Per-pack override replaces the default

**Files:**
- Test: `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the failing test**

Add to `packages/api/tests/test_compose.py`:

```python
def test_compose_pack_override_replaces_default(tmp_path: Path) -> None:
    """A pack-local writing-baseline.md replaces the shared default."""
    (tmp_path / "stylepack.yaml").write_text(
        "spec_version: '1.0'\n"
        "pack:\n  slug: ov\n  name: Override\n  version: '1.0'\n"
        "persona:\n  identity: The Overrider\n  one_line: Replaces the baseline.\n",
        encoding="utf-8",
    )
    (tmp_path / "style-guide.md").write_text("# Style Guide\n\nVoice prose.\n", encoding="utf-8")
    (tmp_path / "writing-baseline.md").write_text(
        "- **Pack-specific craft rule.** Only this pack uses it.\n", encoding="utf-8"
    )

    out = compose(tmp_path)
    assert "Pack-specific craft rule." in out
    # Default baseline content must NOT appear when an override is present
    assert "Concrete over abstract" not in out
    # The section wrapper (header + precedence note) is still applied
    assert "## Section 2: General Writing Craft" in out
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `uv run pytest packages/api/tests/test_compose.py::test_compose_pack_override_replaces_default -v`
Expected: PASS — the override logic was implemented in Task 3, so this test validates it. (If it fails, the override branch in `_render_writing_craft` is wrong — fix before committing.)

- [ ] **Step 3: Commit**

```bash
git add packages/api/tests/test_compose.py
git commit -m "test(compose): per-pack writing-baseline override replaces default"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `make test`
Expected: PASS — all Python and TS tests green.

- [ ] **Step 2: Run lint/type checks**

Run: `make lint`
Expected: PASS — ruff, mypy, biome, tsc all clean. (Watch for: unused import if `resources` was added but a branch removed; mypy strictness on the new `tone` field.)

- [ ] **Step 3: Confirm the asset ships in the wheel**

Run: `make build && python -c "import zipfile, glob; z=zipfile.ZipFile(sorted(glob.glob('dist/*.whl'))[-1]); print([n for n in z.namelist() if 'writing-baseline' in n])"`
Expected: prints a path containing `myvoice/assets/writing-baseline.md` — confirming the bundled default is present in the installed artifact.

- [ ] **Step 4: Sanity-check a real compose end-to-end**

Run: `uv run myvoice compose --root packs --pack dan 2>/dev/null | grep -n "Section 2: General Writing Craft"`
(Adjust flags to match the actual `myvoice compose` CLI signature in `cli.py:102` if needed.)
Expected: the craft section appears in the rendered prompt for the Dan pack.

---

## Self-Review

- **Spec coverage:** §1 default file → Task 2; §1 per-pack override → Tasks 3–4; §2 resolution/injection/ordering → Task 3; §3 TASK leak + `persona.tone` → Task 1; §5 baseline content → Task 2; §6 tests (default, override, ordering, tone) → Tasks 1/3/4; packaging note → Task 5 Step 3. All covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** `persona.tone: str | None` defined in Task 1 and consumed in Task 1's `_render_header`; `_render_writing_craft`/`_load_default_baseline` defined in Task 3 and used in `compose()` the same task; section marker string `## Section 2: General Writing Craft` is identical across asset renderer (Task 3) and all assertions (Tasks 3–4).
