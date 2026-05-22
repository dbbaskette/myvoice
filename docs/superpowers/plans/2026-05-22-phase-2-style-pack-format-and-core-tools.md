# Phase 2: Style Pack Format & Core Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the SPEC.md v1.0 contract, the pure-Python implementations of `compose` / `lint` / `validate`, in-memory pack discovery + `PackStore`, the `packs/dan/` reference pack (converted from `/Users/dbbaskette/Projects/Dan-ai/`), and `packs/_template/`. After this phase, the backend can load, validate, compose, and lint packs — with `myvoice pack ...` CLI subcommands proving it end-to-end. No UI work yet (that's Phase 3).

**Architecture:** Spec lives at the repo root (`SPEC.md`). Pack code lives under `packages/api/myvoice/`, organized as `packs/` (manifest model, discovery, store) plus three top-level modules `compose.py` / `lint.py` / `validate.py`. The data shape for manifests is a Pydantic model so we get parse + validate + type hints for free across every consumer. CLI subcommands sit alongside `version` and `serve`. All three reference packs (`dan`, `_template`) live in-repo and CI runs the validator against each on every PR.

**Tech Stack:** Python 3.11+, Pydantic v2 (new dep), PyYAML (already declared), Click (already), pytest (already). No new frontend or LLM dependencies.

---

## File Structure

This phase creates the following files:

**Repo root:**
- `SPEC.md` — the v1.0 spec for the Style Pack format, extracted from Part 1 of the design doc

**Reference packs:**
- `packs/dan/stylepack.yaml` — manifest, populated from Dan-AI's content
- `packs/dan/style-guide.md` — prose-only (Sections 2–5 of original; data sections moved to YAML)
- `packs/dan/formats/*.md` (8 files) — copied verbatim from Dan-AI
- `packs/dan/samples/*.md` (5 files) — copied verbatim from Dan-AI (drop the samples README)
- `packs/dan/bios/twitter.md`, `conference-speaker.md`, `linkedin-about.md`, `book-jacket.md` — split from `Dan-ai/BIOS.md`
- `packs/_template/stylepack.yaml` — placeholder manifest with TODO comments
- `packs/_template/style-guide.md` — placeholder prose
- `packs/_template/bios/twitter.md`, `conference-speaker.md`, `linkedin-about.md`, `book-jacket.md` — empty bios with TODO notes
- `packs/_template/formats/.gitkeep`, `packs/_template/samples/.gitkeep`

**Python backend (`packages/api/myvoice/`):**
- `packs/__init__.py` — subpackage marker; re-exports `Manifest`, `PackInfo`, `PackStore`
- `packs/manifest.py` — Pydantic models: `Manifest`, `Pack`, `Persona`, `Banished`, `PermittedException`, `Rules`, `PopCulture`, `Format`, `Sample`, `Bio`
- `packs/discovery.py` — `discover_packs(roots: list[Path]) -> list[PackInfo]`
- `packs/store.py` — `PackStore` (in-memory index keyed by slug)
- `compose.py` — `compose(pack, format=None, samples=None, draft=None, bio=None) -> str`
- `lint.py` — `lint(pack, text) -> list[Violation]`, NDJSON output helper
- `validate.py` — `validate_pack(pack_root: Path) -> ValidationResult` plus `class ValidationError`
- Modify: `cli.py` — add `pack` command group with `list`, `validate`, `compose`, `lint` subcommands

**Tests:**
- `tests/packs/__init__.py`
- `tests/packs/test_manifest.py`
- `tests/packs/test_discovery.py`
- `tests/packs/test_store.py`
- `tests/test_validate.py`
- `tests/test_compose.py`
- `tests/test_compose_dan_parity.py` — golden test against `Dan-ai/scripts/compose.sh` output (whitelisted differences)
- `tests/test_lint.py`
- `tests/test_cli_pack.py` — tests for `myvoice pack ...` subcommands
- `tests/fixtures/packs/valid-minimal/` — minimal valid pack fixture
- `tests/fixtures/packs/missing-style-guide/` — invalid fixture
- `tests/fixtures/packs/slug-mismatches-dir/`, `unknown-rule-key/`, `non-blockquote-sample/` — more invalid fixtures

**CI:**
- `.github/workflows/validate-packs.yml` — runs the validator against every `packs/*/` on PR

**README:**
- Modify: `README.md` — add pack-related sections

---

## Task 1: Extract SPEC.md v1.0 from the design doc

**Files:**
- Create: `SPEC.md` at the repo root

- [ ] **Step 1: Author `SPEC.md`**

Write `/Users/dbbaskette/Projects/myvoice/SPEC.md`. This is the v1.0 contract — extracted from Part 1 of `docs/superpowers/specs/2026-05-22-myvoice-design.md`. It must include sections 1.1–1.4 of that doc (pack layout, manifest schema, pack contents, validation rules) reformatted as a standalone document. Drop the "1.5 Dan-AI → packs/dan/ conversion" section — that's implementation, not spec.

Required structure:

```markdown
# Style Pack Format Specification (v1.0)

> This document defines the **portable Style Pack format** consumed by myvoice
> and any other tool that wants to read or write style packs. The format is
> versioned. This is v1.0.

## 1. Pack layout
[Directory structure: stylepack.yaml + style-guide.md + formats/ + samples/ + bios/]

## 2. Manifest schema (`stylepack.yaml`)
[YAML schema with all fields described, copied from design doc 1.2 verbatim
 — including the example pack manifest]

## 3. Pack contents
[style-guide.md, formats/*.md, samples/*.md, bios/*.md descriptions and rules]

## 4. Validation rules
[The 10-point validation checklist from design doc 1.4]

## 5. Versioning
[Brief note: spec_version follows semver-major; bumping the version requires
 a new SPEC vN.0.md document and a migration note. v1.0 is the initial release.]
```

Use the exact YAML example from the design doc. Use the exact validation rules (numbered 1–10). For prose sections (1, 3, 5), write tight, contract-style language — this is a spec, not a tutorial.

- [ ] **Step 2: Verify the file exists and is well-formed Markdown**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && wc -l SPEC.md
```

Expected: file exists, ~150–250 lines.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add SPEC.md && git commit -m "docs: add SPEC.md v1.0 for the Style Pack Format"
```

---

## Task 2: Add Pydantic v2 as a runtime dependency

**Files:**
- Modify: `pyproject.toml`
- Modify: `uv.lock` (regenerated)

- [ ] **Step 1: Add `pydantic>=2.9` to `[project] dependencies`**

Edit `/Users/dbbaskette/Projects/myvoice/pyproject.toml`. In the `[project] dependencies` array, add `"pydantic>=2.9"` as a new line. Keep alphabetical order if any exists; otherwise place it after `httpx>=0.27`.

- [ ] **Step 2: Regenerate the lockfile and verify install works**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv lock && uv sync 2>&1 | tail -3
```

Expected: completes without errors, pydantic appears in the install output.

- [ ] **Step 3: Confirm import works**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run python -c "import pydantic; print('pydantic', pydantic.VERSION)"
```

Expected: prints `pydantic 2.x.y`.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add pyproject.toml uv.lock && git commit -m "chore: add pydantic v2 runtime dependency for pack manifest models"
```

---

## Task 3: Pack manifest Pydantic models (TDD)

**Files:**
- Create: `packages/api/myvoice/packs/__init__.py`
- Create: `packages/api/myvoice/packs/manifest.py`
- Create: `packages/api/tests/packs/__init__.py`
- Create: `packages/api/tests/packs/test_manifest.py`

- [ ] **Step 1: Create the `packs` subpackage marker**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/api/myvoice/packs
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/api/tests/packs
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/packs/__init__.py`:

```python
"""Style pack data model, discovery, and in-memory store."""

from myvoice.packs.manifest import (
    Banished,
    Bio,
    Format,
    Manifest,
    Pack,
    PermittedException,
    Persona,
    PopCulture,
    Rules,
    Sample,
)

__all__ = [
    "Banished",
    "Bio",
    "Format",
    "Manifest",
    "Pack",
    "PermittedException",
    "Persona",
    "PopCulture",
    "Rules",
    "Sample",
]
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/packs/__init__.py` as an empty file (single newline).

- [ ] **Step 2: Write the failing test**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/packs/test_manifest.py`:

```python
"""Tests for the style pack Pydantic manifest models."""

import pytest
from pydantic import ValidationError

from myvoice.packs.manifest import Manifest


def _minimal_manifest_dict() -> dict:
    return {
        "spec_version": "1.0",
        "pack": {
            "slug": "test",
            "name": "Test Pack",
            "version": "0.1.0",
            "author": "Test Author",
        },
        "persona": {
            "identity": "The Tester",
            "one_line": "Writes tests, ships nothing.",
        },
    }


def test_minimal_manifest_parses() -> None:
    m = Manifest.model_validate(_minimal_manifest_dict())
    assert m.spec_version == "1.0"
    assert m.pack.slug == "test"
    assert m.persona.identity == "The Tester"
    # Optional sections default to empty.
    assert m.banished.words == []
    assert m.banished.phrases == []
    assert m.banished.permitted_exceptions == []
    assert m.formats == []
    assert m.samples == []
    assert m.bios == []
    assert m.rules.no_em_dashes is True  # spec default
    assert m.rules.no_ascii_double_hyphen_between_letters is True
    assert m.rules.no_sentence_starters == []
    assert m.pop_culture.allowed == []
    assert m.pop_culture.banned == []


def test_unsupported_spec_version_rejected() -> None:
    data = _minimal_manifest_dict()
    data["spec_version"] = "2.0"
    with pytest.raises(ValidationError):
        Manifest.model_validate(data)


def test_pack_slug_required() -> None:
    data = _minimal_manifest_dict()
    del data["pack"]["slug"]
    with pytest.raises(ValidationError):
        Manifest.model_validate(data)


def test_unknown_rule_key_is_extra_field_error() -> None:
    data = _minimal_manifest_dict()
    data["rules"] = {"no_em_dash": True}  # typo: should be no_em_dashes
    with pytest.raises(ValidationError):
        Manifest.model_validate(data)


def test_permitted_exception_requires_term_and_reason() -> None:
    data = _minimal_manifest_dict()
    data["banished"] = {"permitted_exceptions": [{"term": "Pivotal"}]}
    with pytest.raises(ValidationError):
        Manifest.model_validate(data)


def test_format_entry_shape() -> None:
    data = _minimal_manifest_dict()
    data["formats"] = [{"name": "blog-post", "file": "formats/blog-post.md"}]
    m = Manifest.model_validate(data)
    assert m.formats[0].name == "blog-post"
    assert m.formats[0].file == "formats/blog-post.md"
    assert m.formats[0].description is None


def test_bio_max_chars_and_target_words_are_optional() -> None:
    data = _minimal_manifest_dict()
    data["bios"] = [
        {"name": "twitter", "file": "bios/twitter.md", "max_chars": 160},
        {"name": "book-jacket", "file": "bios/book-jacket.md",
         "target_words": 150, "third_person": True},
    ]
    m = Manifest.model_validate(data)
    assert m.bios[0].max_chars == 160
    assert m.bios[0].target_words is None
    assert m.bios[1].third_person is True
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_manifest.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'myvoice.packs.manifest'`.

- [ ] **Step 4: Implement the Pydantic models**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/packs/manifest.py`:

```python
"""Pydantic models for a Style Pack manifest (`stylepack.yaml`).

Models match SPEC.md v1.0. Unknown fields are rejected (model_config
forbids extra). This catches typos like `no_em_dash` vs `no_em_dashes`.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Pack(_StrictModel):
    slug: str = Field(min_length=1)
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    author: str = Field(min_length=1)
    description: str | None = None
    homepage: str | None = None


class Persona(_StrictModel):
    identity: str = Field(min_length=1)
    one_line: str = Field(min_length=1)


class PermittedException(_StrictModel):
    term: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class Banished(_StrictModel):
    words: list[str] = Field(default_factory=list)
    phrases: list[str] = Field(default_factory=list)
    permitted_exceptions: list[PermittedException] = Field(default_factory=list)


class Rules(_StrictModel):
    no_em_dashes: bool = True
    no_ascii_double_hyphen_between_letters: bool = True
    no_sentence_starters: list[str] = Field(default_factory=list)


class PopCulture(_StrictModel):
    allowed: list[str] = Field(default_factory=list)
    banned: list[str] = Field(default_factory=list)


class Format(_StrictModel):
    name: str = Field(min_length=1)
    file: str = Field(min_length=1)
    description: str | None = None


class Sample(_StrictModel):
    id: str = Field(min_length=1)
    file: str = Field(min_length=1)
    description: str | None = None


class Bio(_StrictModel):
    name: str = Field(min_length=1)
    file: str = Field(min_length=1)
    max_chars: int | None = Field(default=None, gt=0)
    target_words: int | None = Field(default=None, gt=0)
    third_person: bool = False
    description: str | None = None


class Manifest(_StrictModel):
    spec_version: Literal["1.0"]
    pack: Pack
    persona: Persona
    banished: Banished = Field(default_factory=Banished)
    rules: Rules = Field(default_factory=Rules)
    pop_culture: PopCulture = Field(default_factory=PopCulture)
    formats: list[Format] = Field(default_factory=list)
    samples: list[Sample] = Field(default_factory=list)
    bios: list[Bio] = Field(default_factory=list)
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_manifest.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 6: Verify mypy + ruff stay clean**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run ruff check packages/api && uv run mypy packages/api
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add pydantic v2 manifest model for style packs"
```

---

## Task 4: `validate.py` — pack validator (TDD)

**Files:**
- Create: `packages/api/myvoice/validate.py`
- Create: `packages/api/tests/test_validate.py`
- Create: `packages/api/tests/fixtures/packs/valid-minimal/stylepack.yaml`
- Create: `packages/api/tests/fixtures/packs/valid-minimal/style-guide.md`

- [ ] **Step 1: Create the valid-minimal fixture pack**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packages/api/tests/fixtures/packs/valid-minimal
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/fixtures/packs/valid-minimal/stylepack.yaml`:

```yaml
spec_version: "1.0"
pack:
  slug: valid-minimal
  name: "Minimal Valid Pack"
  version: "0.1.0"
  author: "Test"
persona:
  identity: "The Tester"
  one_line: "Tests the minimum viable pack."
```

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/fixtures/packs/valid-minimal/style-guide.md`:

```markdown
# Style Guide

Minimal placeholder style guide for testing.
```

- [ ] **Step 2: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_validate.py`:

```python
"""Tests for the pack validator."""

from pathlib import Path

import pytest

from myvoice.validate import ValidationError, validate_pack

FIXTURES = Path(__file__).parent / "fixtures" / "packs"


def test_validates_minimal_valid_pack() -> None:
    result = validate_pack(FIXTURES / "valid-minimal")
    assert result.valid is True
    assert result.errors == []


def test_missing_stylepack_yaml_fails(tmp_path: Path) -> None:
    (tmp_path / "style-guide.md").write_text("placeholder")
    result = validate_pack(tmp_path)
    assert result.valid is False
    assert any("stylepack.yaml" in e.message for e in result.errors)


def test_missing_style_guide_md_fails(tmp_path: Path) -> None:
    (tmp_path / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: 0.1\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
    )
    (tmp_path / "stylepack.yaml").rename(tmp_path / "stylepack.yaml")  # noop, kept for clarity
    result = validate_pack(tmp_path)
    assert result.valid is False
    assert any("style-guide.md" in e.message for e in result.errors)


def test_slug_must_match_directory_name(tmp_path: Path) -> None:
    pack_dir = tmp_path / "actual-dir-name"
    pack_dir.mkdir()
    (pack_dir / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: different-slug\n  name: X\n  version: 0.1\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
    )
    (pack_dir / "style-guide.md").write_text("body")
    result = validate_pack(pack_dir)
    assert result.valid is False
    assert any("slug" in e.message and "dir" in e.message for e in result.errors)


def test_unknown_rule_key_fails(tmp_path: Path) -> None:
    (tmp_path / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: 0.1\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "rules:\n  no_em_dash: true\n"  # typo
    )
    (tmp_path / "style-guide.md").write_text("body")
    pack_dir = tmp_path
    # validator needs the dir name to match slug for this test path
    real = tmp_path.rename(tmp_path.parent / "x")
    result = validate_pack(real)
    assert result.valid is False
    assert any("no_em_dash" in e.message or "extra" in e.message.lower() for e in result.errors)


def test_sample_file_missing_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: 0.1\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "samples:\n  - id: '01'\n    file: samples/missing.md\n"
    )
    (pack / "style-guide.md").write_text("body")
    result = validate_pack(pack)
    assert result.valid is False
    assert any("samples/missing.md" in e.message for e in result.errors)


def test_sample_without_blockquote_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: 0.1\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "samples:\n  - id: '01'\n    file: samples/01.md\n"
    )
    (pack / "style-guide.md").write_text("body")
    (pack / "samples").mkdir()
    (pack / "samples" / "01.md").write_text("# A sample\n\nNo blockquote here.\n")
    result = validate_pack(pack)
    assert result.valid is False
    assert any("blockquote" in e.message.lower() for e in result.errors)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_validate.py -v
```

Expected: all tests FAIL with `ModuleNotFoundError: No module named 'myvoice.validate'`.

- [ ] **Step 4: Implement `validate.py`**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/validate.py`:

```python
"""Validate a style pack directory against SPEC.md v1.0."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError as PydanticValidationError

from myvoice.packs.manifest import Manifest


@dataclass(frozen=True)
class ValidationError:
    """One spec violation. `path` is a hint like 'pack.slug' or 'samples[0].file'."""

    message: str
    path: str = ""


@dataclass
class ValidationResult:
    valid: bool
    manifest: Manifest | None = None
    errors: list[ValidationError] = field(default_factory=list)


def validate_pack(pack_root: Path) -> ValidationResult:
    """Validate the pack rooted at `pack_root`.

    Returns a ValidationResult with `valid=True` only if every spec rule
    holds. Otherwise returns `valid=False` with the full list of errors;
    we report all errors we can, not just the first.
    """
    errors: list[ValidationError] = []
    manifest: Manifest | None = None

    manifest_path = pack_root / "stylepack.yaml"
    if not manifest_path.is_file():
        errors.append(ValidationError(
            f"missing required file: stylepack.yaml in {pack_root}",
            "stylepack.yaml",
        ))
        return ValidationResult(valid=False, errors=errors)

    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        errors.append(ValidationError(f"stylepack.yaml: invalid YAML — {exc}"))
        return ValidationResult(valid=False, errors=errors)

    try:
        manifest = Manifest.model_validate(raw)
    except PydanticValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            errors.append(ValidationError(f"{loc}: {err['msg']}", loc))
        return ValidationResult(valid=False, errors=errors)

    # slug must match directory name
    if manifest.pack.slug != pack_root.name:
        errors.append(ValidationError(
            f"pack.slug '{manifest.pack.slug}' does not match dir name '{pack_root.name}'",
            "pack.slug",
        ))

    # style-guide.md must exist and be non-empty
    sg = pack_root / "style-guide.md"
    if not sg.is_file():
        errors.append(ValidationError("missing required file: style-guide.md", "style-guide.md"))
    elif sg.stat().st_size == 0:
        errors.append(ValidationError("style-guide.md is empty", "style-guide.md"))

    # formats, samples, bios: declared files must exist and be non-empty
    for i, fmt in enumerate(manifest.formats):
        p = pack_root / fmt.file
        if not p.is_file() or p.stat().st_size == 0:
            errors.append(ValidationError(
                f"formats[{i}].file not found or empty: {fmt.file}", f"formats[{i}].file"
            ))

    for i, sample in enumerate(manifest.samples):
        p = pack_root / sample.file
        if not p.is_file() or p.stat().st_size == 0:
            errors.append(ValidationError(
                f"samples[{i}].file not found or empty: {sample.file}", f"samples[{i}].file"
            ))
            continue
        # sample must contain at least one blockquote line
        body = p.read_text(encoding="utf-8")
        if not any(line.startswith("> ") for line in body.splitlines()):
            errors.append(ValidationError(
                f"samples[{i}] ({sample.file}) contains no blockquote (lines starting with '> ')",
                f"samples[{i}].file",
            ))

    for i, bio in enumerate(manifest.bios):
        p = pack_root / bio.file
        if not p.is_file() or p.stat().st_size == 0:
            errors.append(ValidationError(
                f"bios[{i}].file not found or empty: {bio.file}", f"bios[{i}].file"
            ))
            continue
        if bio.max_chars is not None:
            body = _strip_author_notes(p.read_text(encoding="utf-8"))
            if len(body) > bio.max_chars:
                errors.append(ValidationError(
                    f"bios[{i}] ({bio.name}) body is {len(body)} chars, exceeds max_chars={bio.max_chars}",
                    f"bios[{i}].max_chars",
                ))

    return ValidationResult(valid=(not errors), manifest=manifest, errors=errors)


def _strip_author_notes(text: str) -> str:
    """Drop italic-only meta lines (e.g. '*155 characters.*')."""
    lines = [
        line for line in text.splitlines()
        if not (line.strip().startswith("*") and line.strip().endswith("*"))
    ]
    return "\n".join(lines).strip()
```

- [ ] **Step 5: Run tests to verify all pass**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_validate.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 6: Run full lint**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run ruff check packages/api && uv run mypy packages/api
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add validate.py with pack-validation rules from SPEC v1.0"
```

---

## Task 5: Convert Dan-AI — write `packs/dan/stylepack.yaml`

**Files:**
- Create: `packs/dan/stylepack.yaml`

- [ ] **Step 1: Inspect Dan-AI source**

Read `/Users/dbbaskette/Projects/Dan-ai/DB Style Guide 3.0.md` and `/Users/dbbaskette/Projects/Dan-ai/BIOS.md` end-to-end. Extract:

- All "banished words" from Rule 2 (Original 13 + High-frequency AI tells + Vague corporate filler).
- All "banished phrases" from Rule 3 (plus "In conclusion" and "In summary" from Rule 6).
- All permitted exceptions from the callout (Pivotal, unlock(s), powerhouse, tipping point, game-changer/changes the game).
- Forbidden sentence starters (Rule 4 + Rule 7: Absolutely, Certainly, Moreover, Furthermore, Additionally).
- Pop culture: allowed = [Marvel], banned = [Star Wars, Star Trek, Lord of the Rings].
- Persona: identity = "The Builder Who Gets It", one_line = inferred from Section 2.1 of the guide.

- [ ] **Step 2: Write `packs/dan/stylepack.yaml`**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packs/dan
```

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/stylepack.yaml` following the schema in SPEC.md. The full content (this is the deliverable):

```yaml
spec_version: "1.0"

pack:
  slug: dan
  name: "Dan Baskette"
  version: "3.0"
  author: "Dan Baskette"
  description: "The Builder Who Gets It. Energetic, definitive, transparent."
  homepage: "https://github.com/dbbaskette/dan-ai"

persona:
  identity: "The Builder Who Gets It"
  one_line: "Bridges high-level strategy and technical reality; maker who advocates for the developer."

banished:
  words:
    # Original 13 (legacy ban)
    - delve
    - leverage
    - tapestry
    - orchestrate
    - paramount
    - underscore
    - realm
    - navigate
    - landscape
    - testament
    - arguably
    - foster
    - dynamic
    # High-frequency AI tells
    - utilize
    - robust
    - seamless
    - seamlessly
    - comprehensive
    - innovative
    - revolutionize
    - revolutionary
    - transformative
    - groundbreaking
    - embark
    - holistic
    - synergy
    - synergistic
    - paradigm
    - facilitate
    - pivotal
    - crucial
    - myriad
    - multifaceted
    - beacon
    - bespoke
    - empower
    - unleash
    - journey
    # Vague corporate filler
    - "results-driven"
    - "actionable insights"
    - "innovative solutions"
    - "drive efficiency"
    - "solid foundation"
    - "strong collaborator"
    - "complex challenges"
    - "track record"
  phrases:
    - "It's important to note that"
    - "It's worth noting that"
    - "In today's digital age"
    - "In an ever-evolving world"
    - "Embark on a journey"
    - "Let's dive in"
    - "Dive into"
    - "At its core"
    - "In essence"
    - "When it comes to"
    - "Designed to enhance"
    - "Stands as a testament to"
    - "In conclusion"
    - "In summary"
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

rules:
  no_em_dashes: true
  no_ascii_double_hyphen_between_letters: true
  no_sentence_starters:
    - Absolutely
    - Certainly
    - Moreover
    - Furthermore
    - Additionally

pop_culture:
  allowed:
    - Marvel
  banned:
    - "Star Wars"
    - "Star Trek"
    - "Lord of the Rings"

formats:
  - name: blog-post
    file: formats/blog-post.md
    description: "Long-form blog with Conflict & Resolution opener"
  - name: linkedin-post
    file: formats/linkedin-post.md
    description: "Punchy LinkedIn post with hook + payoff"
  - name: tweet-thread
    file: formats/tweet-thread.md
    description: "Tweet thread"
  - name: conference-abstract
    file: formats/conference-abstract.md
    description: "CFP abstract"
  - name: demo-script
    file: formats/demo-script.md
    description: "Live demo narration"
  - name: internal-slack
    file: formats/internal-slack.md
    description: "Internal Slack message"
  - name: keynote-opener
    file: formats/keynote-opener.md
    description: "Keynote opener"
  - name: video-script
    file: formats/video-script.md
    description: "Video script"

samples:
  - id: "01"
    file: samples/01-database-ai-tool-opener.md
    description: "Database AI tool opener"
  - id: "02"
    file: samples/02-build-command-opener.md
    description: "Build command opener"
  - id: "03"
    file: samples/03-tanzu-ai-platform-opener.md
    description: "Tanzu AI platform opener"
  - id: "04"
    file: samples/04-mcp-enterprise-opener.md
    description: "MCP enterprise opener"

bios:
  - name: twitter
    file: bios/twitter.md
    max_chars: 160
    description: "Twitter/X profile bio"
  - name: conference-speaker
    file: bios/conference-speaker.md
    target_words: 75
    description: "CFP submissions and event programs"
  - name: linkedin-about
    file: bios/linkedin-about.md
    max_chars: 1700
    description: "LinkedIn About section"
  - name: book-jacket
    file: bios/book-jacket.md
    target_words: 150
    third_person: true
    description: "Book endorsements and foreword credits"
```

- [ ] **Step 3: Verify YAML parses**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run python -c "from myvoice.packs.manifest import Manifest; import yaml; print(Manifest.model_validate(yaml.safe_load(open('packs/dan/stylepack.yaml'))).pack.slug)"
```

Expected: prints `dan`.

- [ ] **Step 4: Commit (intermediate, before pack contents)**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packs/dan/stylepack.yaml && git commit -m "feat(pack): add packs/dan/stylepack.yaml (extracted from Dan-AI v3.0)"
```

---

## Task 6: Convert Dan-AI — write `packs/dan/style-guide.md` (prose only)

**Files:**
- Create: `packs/dan/style-guide.md`

- [ ] **Step 1: Author the prose-only style guide**

Source: `/Users/dbbaskette/Projects/Dan-ai/DB Style Guide 3.0.md`. Keep Sections 2 ("The Dan Baskette Style Guide"), 3 ("Self-Check Before Output"). Drop the Part 1 ROLE/TASK header, drop Section 1 (Humanizer — moved to YAML data), drop the "INPUT TEXT TO REWRITE" placeholder.

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/style-guide.md`:

```markdown
# Style Guide

## Writing Principles

### A. The "Conflict & Resolution" Opening

- *Rule:* Do not start with the solution. Start with the tension. Validate the pain point first.
- *The Pattern:* "For years, we've struggled with [Old Way]. It creates [Problem]. But now, [New Way] changes the game."
- *Concept:* Highlight the "Tug-of-War" between Operations (stability) and Developers (speed).
- *Before:* "Spring AI provides a unified abstraction for working with LLMs in Java applications."
- *After:* "For years, calling an LLM from a Java app meant rolling your own HTTP client, your own retry loop, your own JSON parser. Spring AI ends that. One dependency. Every major model. Production-ready out of the box."

### B. "Speed to Value" Vocabulary

- *Rule:* Prioritize outcomes over features. Use active, forceful language that implies movement and solidity.
- *Keywords:* Unlocks, Powerhouse, Tipping point, Operational simplicity, Finally!
- *Timing:* If you describe a feature, immediately follow it with the specific time or effort it saves.
- *Before:* "The new caching feature improves performance."
- *After:* "The new caching layer is a tipping point. It cuts cold-start latency from 4 seconds to 200ms. That's the difference between a user waiting and a user staying."

### C. The "Better Together" Motif

- *Rule:* Focus on integration. Avoid listing tools in isolation; always explain how they work as a paired ecosystem (e.g., "1 + 1 = 3").
- *Before:* "We use Spring Boot. We also use Cloud Foundry."
- *After:* "Spring Boot gives you the app. Cloud Foundry gives you the platform. Together, you go from `git push` to a running, scaled, observable service in under five minutes. 1 + 1 = 3."

### D. The "Golden Command" Structure

- *Rule:* Boil complex workflows down to 3-4 distinct, capitalized verbs to make them feel manageable.
- *Example:* "Build. Bind. Deploy. Scale."

### E. The "Not a Science Project" Rule

- *Rule:* Aggressively dismiss DIY infrastructure. If a task requires custom glue code or a PhD in Kubernetes, call it out as a failure.
- *Key Phrase:* "Getting this deployed should be straightforward, not a separate engineering project."
- *Before:* "To deploy this, configure your Kubernetes manifests, set up the ingress controller, and write a Helm chart with the right values."
- *After:* "Getting this deployed should be straightforward, not a separate engineering project. One command. Done. If your platform makes you write YAML to ship a service, your platform is the problem."

## Formatting & Visuals

- **Bullet Points are Mandatory:** Avoid walls of text. Break benefits down into bulleted lists.
- **Bold Leads:** Use bolding at the start of bullets for skimmability (e.g., **Velocity:** [Description]).
- **Quotation Style (American):** Periods and commas go *inside* the closing quotation mark. Example: `"changes the game."` not `"changes the game".` Colons and semicolons go *outside*. Question marks and exclamation marks follow logic: inside if part of the quoted material, outside if not.
- **The "Takeaway" Bio:** If a bio is needed, include:
  - *Tenure:* 25+ years (Sun Microsystems, EMC, Pivotal, VMware).
  - *Role:* Head of Technical Marketing / Strategy.
  - *Personal Hook:* Maker, outdoor enthusiast (hiking/Smokies), Marvel collector.

## Video & Presentation Style ("No Tricks")

- **Transparency:** Emphasize that demos are real ("live code," "no smoke and mirrors").
- **The Full Arc:** Never demo a feature in a vacuum. Always anchor it in the end-to-end journey (e.g., "Here is how we go from code on a laptop to a running app with data insights").
- **High-Energy Advocacy:** Be opinionated. Don't suggest; insist on better experiences.
  - *Bad:* "You might want to try this."
  - *Good:* "Developers shouldn't have to deal with this friction."

## Personal Brand Signatures

- **The "Maker" Mindset:** Use construction metaphors (Foundations, Paved Roads, Tooling, Blueprints).
- **Pop Culture (Marvel Only):** It is on-brand to use Marvel analogies to explain technical concepts (e.g., "Endgame," "Assemble," "Avengers-level threat," "With great power comes great responsibility"). Do not mix in Star Wars, Star Trek, LOTR, or other franchises. Keep it natural, not forced.

## Self-Check Before Output

Run this checklist on your draft before producing the final response. If any answer is "no," revise.

- [ ] Opening starts with **tension** (the pain point), not the solution?
- [ ] No words from the **Banished Vocabulary** list?
- [ ] No phrases from the **Banished Phrases** list?
- [ ] Zero em dashes?
- [ ] No sentence starts with "Absolutely," "Certainly," "Moreover," "Furthermore," or "Additionally"?
- [ ] Every feature mention is paired with the **specific time or effort it saves** (Principle B)?
- [ ] Active voice throughout?
- [ ] Any multi-step workflow is reduced to **3-4 capitalized verbs** (Principle D)?
- [ ] Pop-culture references are **Marvel only** (no Star Wars, Star Trek, LOTR)?
- [ ] Does NOT end with "In conclusion" or "In summary"?
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packs/dan/style-guide.md && git commit -m "feat(pack): add packs/dan/style-guide.md (prose only, data moved to manifest)"
```

---

## Task 7: Convert Dan-AI — copy `formats/` and `samples/` verbatim

**Files:**
- Create: `packs/dan/formats/*.md` (8 files)
- Create: `packs/dan/samples/*.md` (5 files: 01-04 plus anti-examples)

- [ ] **Step 1: Copy formats verbatim**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packs/dan/formats
cp "/Users/dbbaskette/Projects/Dan-ai/formats/"*.md /Users/dbbaskette/Projects/myvoice/packs/dan/formats/
# Drop the formats README (it's repo-meta, not a format)
rm -f /Users/dbbaskette/Projects/myvoice/packs/dan/formats/README.md
ls /Users/dbbaskette/Projects/myvoice/packs/dan/formats/
```

Expected: 8 files (blog-post.md, conference-abstract.md, demo-script.md, internal-slack.md, keynote-opener.md, linkedin-post.md, tweet-thread.md, video-script.md).

- [ ] **Step 2: Copy samples verbatim (excluding README and anti-examples)**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packs/dan/samples
cp "/Users/dbbaskette/Projects/Dan-ai/samples/0"*.md /Users/dbbaskette/Projects/myvoice/packs/dan/samples/
ls /Users/dbbaskette/Projects/myvoice/packs/dan/samples/
```

Expected: 4 files (01-database-ai-tool-opener.md, 02-build-command-opener.md, 03-tanzu-ai-platform-opener.md, 04-mcp-enterprise-opener.md). The samples README and anti-examples.md are intentionally left behind — they're author-facing meta, not pack content.

- [ ] **Step 3: Verify each sample has at least one blockquote (per SPEC rule 7)**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && for f in packs/dan/samples/*.md; do
  if ! grep -q "^> " "$f"; then echo "MISSING blockquote: $f"; exit 1; fi
done
echo "all samples have blockquotes"
```

Expected: "all samples have blockquotes".

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packs/dan/formats packs/dan/samples && git commit -m "feat(pack): copy Dan-AI formats and samples into packs/dan/"
```

---

## Task 8: Convert Dan-AI — split `BIOS.md` into `bios/*.md`

**Files:**
- Create: `packs/dan/bios/twitter.md`
- Create: `packs/dan/bios/conference-speaker.md`
- Create: `packs/dan/bios/linkedin-about.md`
- Create: `packs/dan/bios/book-jacket.md`

- [ ] **Step 1: Read `Dan-ai/BIOS.md`**

Read `/Users/dbbaskette/Projects/Dan-ai/BIOS.md`. It contains four sections, each with a heading, a blockquoted bio body, and a trailing italic note. Split each section into its own file with the body unchanged.

- [ ] **Step 2: Write `packs/dan/bios/twitter.md`**

```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packs/dan/bios
```

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/bios/twitter.md` (extract section 1 from BIOS.md):

```markdown
# Twitter / X bio

> Head of Technical Marketing @ Tanzu. 25+ years making platforms that don't need a PhD to deploy. Maker, Smokies hiker, Marvel collector. Opinions are mine.

*155 characters.*
```

- [ ] **Step 3: Write `packs/dan/bios/conference-speaker.md`**

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/bios/conference-speaker.md` (extract section 2):

```markdown
# Conference speaker bio

> Dan Baskette is Head of Technical Marketing at VMware Tanzu. With 25+ years across Sun Microsystems, EMC, Pivotal, and VMware, he sits at the seam between platform engineering and developer experience. He builds the open-source prototypes he writes about, including the Greenplum MCP server. Every demo runs live. No smoke, no mirrors. Outside work, he hikes the Great Smoky Mountains and collects Marvel comics and Funko Pops.

*~70 words. Use as-is for CFP submissions and event programs.*
```

- [ ] **Step 4: Write `packs/dan/bios/linkedin-about.md`**

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/bios/linkedin-about.md` (extract section 3 from BIOS.md, full body):

```markdown
# LinkedIn About

> For 25 years, I've worked the seam between operations and development. Sun Microsystems, EMC, Pivotal, VMware. Different decades, same problem. The platform team wants stability. The developer team wants speed. The tug-of-war never stops, and most companies pick a side.
>
> I picked both. As Head of Technical Marketing at VMware Tanzu, my job is to make sure the platforms we ship don't make our customers choose. Build. Bind. Deploy. Scale. Four verbs that cover the entire path from a developer's laptop to a production cluster. Each one should feel obvious, not heroic.
>
> I write about what we build. Recent posts cover Spring AI, the Greenplum MCP server, agentic AI in regulated databases, and why getting an app deployed should never feel like a separate engineering project. The pieces live on the Tanzu blog and on Typeshare. The opinions are mine.
>
> What you can expect from working with me: live demos, open prototypes, and direct answers about what works and what doesn't. If a feature requires a PhD in YAML to use, I'll say so. If a platform finally makes a hard problem easy, I'll show you the timing.
>
> Outside the day job: I build things in the workshop, hike the Smokies, and collect Marvel comics and Funko Pops. The maker mindset shows up in everything else.
>
> Reach out if you want to talk platform engineering, AI in production, or the right way to demo a product live.

*~1500 characters. First-person, six paragraphs. Drop the last paragraph if your About already has a CTA elsewhere on the profile.*
```

- [ ] **Step 5: Write `packs/dan/bios/book-jacket.md`**

Write `/Users/dbbaskette/Projects/myvoice/packs/dan/bios/book-jacket.md` (extract section 4):

```markdown
# Book / jacket bio

> Dan Baskette is Head of Technical Marketing at VMware Tanzu, where he leads the team that translates platform engineering into stories developers and executives can both follow. His 25-year career has tracked the through-line from server-room hardware at Sun Microsystems and EMC to the application platform work he does today, with stops at Pivotal and across VMware along the way. He writes and speaks about the gap between what platforms claim to deliver and what they actually make easy, with a focus on AI systems that have to survive contact with production. His open-source prototypes, including the Greenplum MCP server, exist to make the patterns concrete. Every demo he gives runs live. Outside work, he hikes the Great Smoky Mountains and collects Marvel comics and Funko Pops.

*~135 words. Third-person, present tense. Use for book endorsements, foreword credits, and longer event programs.*
```

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packs/dan/bios && git commit -m "feat(pack): split Dan-AI BIOS.md into packs/dan/bios/*.md"
```

---

## Task 9: Verify `packs/dan/` validates

**Files:** None (verification only)

- [ ] **Step 1: Run the validator against packs/dan/**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run python -c "
from pathlib import Path
from myvoice.validate import validate_pack
r = validate_pack(Path('packs/dan'))
print('valid:', r.valid)
for e in r.errors:
    print(' -', e.path, ':', e.message)
"
```

Expected: `valid: True` with zero errors. If any errors, fix the pack contents (not the validator) until clean.

- [ ] **Step 2: Add packs/dan as a fixture in a real test**

Append to `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_validate.py`:

```python


def test_packs_dan_is_valid() -> None:
    """The reference Dan pack must always validate cleanly."""
    repo_root = Path(__file__).resolve().parents[3]
    result = validate_pack(repo_root / "packs" / "dan")
    assert result.valid is True, "\n".join(f"{e.path}: {e.message}" for e in result.errors)
```

- [ ] **Step 3: Run the test**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_validate.py -v
```

Expected: all tests pass including the new `test_packs_dan_is_valid`.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api/tests/test_validate.py && git commit -m "test: assert packs/dan/ validates against SPEC v1.0"
```

---

## Task 10: Create `packs/_template/` scaffold

**Files:**
- Create: `packs/_template/stylepack.yaml`
- Create: `packs/_template/style-guide.md`
- Create: `packs/_template/bios/twitter.md`
- Create: `packs/_template/bios/conference-speaker.md`
- Create: `packs/_template/bios/linkedin-about.md`
- Create: `packs/_template/bios/book-jacket.md`
- Create: `packs/_template/formats/.gitkeep`
- Create: `packs/_template/samples/.gitkeep`

- [ ] **Step 1: Scaffold the directory**

Run:
```bash
mkdir -p /Users/dbbaskette/Projects/myvoice/packs/_template/{formats,samples,bios}
touch /Users/dbbaskette/Projects/myvoice/packs/_template/formats/.gitkeep
touch /Users/dbbaskette/Projects/myvoice/packs/_template/samples/.gitkeep
```

- [ ] **Step 2: Write `packs/_template/stylepack.yaml`**

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/stylepack.yaml`:

```yaml
# TEMPLATE STYLE PACK
# Copy this directory to packs/<your-slug>/, then fill in every TODO.
spec_version: "1.0"

pack:
  slug: _template   # MUST match the directory name. Change after copy.
  name: "TODO: Your Pack Name"
  version: "0.1.0"
  author: "TODO: Your Name"
  description: "TODO: One sentence describing your voice."

persona:
  identity: "TODO: A short tagline for who this voice is (e.g., 'The Builder Who Gets It')."
  one_line: "TODO: One sentence of the persona's stance and what they advocate for."

# Words this voice avoids. Linters flag any occurrence (case-insensitive).
banished:
  words: []
  phrases: []
  # Words from `words` that this voice actually uses in specific contexts.
  # Each exception needs a reason.
  permitted_exceptions: []

# Enforceable rules. Most packs accept the defaults.
rules:
  no_em_dashes: true
  no_ascii_double_hyphen_between_letters: true
  no_sentence_starters: []

# Pop-culture franchises this voice does or doesn't reference.
pop_culture:
  allowed: []
  banned: []

# Format add-ons (instructions for rewriting drafts in a specific shape).
# Add entries here as you create files under formats/.
formats: []

# Voice exemplars (real passages this voice has written; the LLM uses them
# for tone-matching). Add entries here as you create files under samples/.
samples: []

# Standing bios. The four below are recommended starting points; delete
# any you don't need.
bios:
  - name: twitter
    file: bios/twitter.md
    max_chars: 160
    description: "Twitter/X profile bio"
  - name: conference-speaker
    file: bios/conference-speaker.md
    target_words: 75
    description: "CFP submissions and event programs"
  - name: linkedin-about
    file: bios/linkedin-about.md
    max_chars: 1700
    description: "LinkedIn About section"
  - name: book-jacket
    file: bios/book-jacket.md
    target_words: 150
    third_person: true
    description: "Book endorsements and foreword credits"
```

- [ ] **Step 3: Write the placeholder style guide**

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/style-guide.md`:

```markdown
# Style Guide

TODO: Replace this section with the prose part of your style guide.

## Writing Principles

TODO: Describe the principles that define your voice. Examples help.

## Formatting & Visuals

TODO: How does your voice handle bullets, bolding, quotations, etc.?

## Personal Brand Signatures

TODO: Recurring metaphors, motifs, references that mark your work.

## Self-Check Before Output

- [ ] TODO: List the checks your voice runs before publishing.
```

- [ ] **Step 4: Write placeholder bios**

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/bios/twitter.md`:

```markdown
# Twitter / X bio

> TODO: Your 160-char bio here.

*TODO: char count notes.*
```

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/bios/conference-speaker.md`:

```markdown
# Conference speaker bio

> TODO: Your ~75-word speaker bio here.

*TODO: word count + usage note.*
```

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/bios/linkedin-about.md`:

```markdown
# LinkedIn About

> TODO: Your LinkedIn About section here (up to 1700 chars).

*TODO: char count + usage note.*
```

Write `/Users/dbbaskette/Projects/myvoice/packs/_template/bios/book-jacket.md`:

```markdown
# Book / jacket bio

> TODO: Your ~150-word third-person bio here.

*TODO: word count + usage note.*
```

- [ ] **Step 5: Validate the template (special case — slug "_template" matches dir, others are minimal)**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run python -c "
from pathlib import Path
from myvoice.validate import validate_pack
r = validate_pack(Path('packs/_template'))
print('valid:', r.valid)
for e in r.errors:
    print(' -', e.path, ':', e.message)
"
```

Expected: `valid: True`.

- [ ] **Step 6: Add test for template validity**

Append to `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_validate.py`:

```python


def test_packs_template_is_valid() -> None:
    """The _template pack must always validate cleanly — it's the scaffold."""
    repo_root = Path(__file__).resolve().parents[3]
    result = validate_pack(repo_root / "packs" / "_template")
    assert result.valid is True, "\n".join(f"{e.path}: {e.message}" for e in result.errors)
```

- [ ] **Step 7: Run all validator tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_validate.py -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packs/_template packages/api/tests/test_validate.py && git commit -m "feat(pack): add packs/_template scaffold for new pack authors"
```

---

## Task 11: `compose.py` — pack composer (TDD)

**Files:**
- Create: `packages/api/myvoice/compose.py`
- Create: `packages/api/tests/test_compose.py`

- [ ] **Step 1: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_compose.py`:

```python
"""Tests for the pack composer."""

from pathlib import Path

import pytest

from myvoice.compose import ComposeError, compose
from myvoice.validate import validate_pack

REPO_ROOT = Path(__file__).resolve().parents[3]
PACKS_DIR = REPO_ROOT / "packs"


def _load_dan() -> Path:
    return PACKS_DIR / "dan"


def test_compose_minimal_returns_header_plus_style_guide() -> None:
    """With no format/samples/draft, compose returns header (ROLE/TASK +
    Humanizer rendered from manifest) followed by the style-guide prose."""
    out = compose(_load_dan())
    assert "ROLE:" in out
    assert "The Builder Who Gets It" in out
    assert "## Writing Principles" in out  # from style-guide.md prose
    # Humanizer renders banished words from manifest
    assert "delve" in out
    assert "utilize" in out
    # Permitted exceptions are emitted with their reason
    assert "Pivotal" in out
    # The draft trailer is NOT present when no draft was passed
    assert "INPUT TEXT TO REWRITE" not in out


def test_compose_with_format_appends_format_section() -> None:
    out = compose(_load_dan(), format="blog-post")
    assert "Additional format-specific instructions" in out
    # blog-post format file content should be inlined; pick a stable token
    # from Dan-AI's blog-post.md once it's in the pack:
    # the format files contain prose, so just check we appended SOMETHING
    # after the format header
    idx = out.index("Additional format-specific instructions")
    assert len(out[idx:]) > 50


def test_compose_with_samples_appends_blockquote_lines_only() -> None:
    out = compose(_load_dan(), samples=["01", "04"])
    assert "Voice exemplars" in out
    # The samples markdown contains both blockquote lines and meta paragraphs
    # outside blockquotes. Only the blockquote bodies should appear.
    # Pick a token we expect to find in sample 01's blockquote.
    # We don't hardcode the exact line — just assert *some* sample content
    # got inlined and that no meta-headers like "**Source:**" leaked.
    idx = out.index("Voice exemplars")
    body = out[idx:]
    assert "**Source:**" not in body


def test_compose_with_draft_appends_input_trailer() -> None:
    out = compose(_load_dan(), draft="This is my draft text.")
    assert "INPUT TEXT TO REWRITE" in out
    assert "This is my draft text." in out


def test_compose_bio_only_emits_bio_body_without_assembly() -> None:
    """`bio=...` is a separate output mode — just the bio body, no prompt."""
    out = compose(_load_dan(), bio="twitter")
    # Body present
    assert "Head of Technical Marketing" in out
    # No prompt assembly: should NOT contain the ROLE header
    assert "ROLE:" not in out
    # The italic char-count note SHOULD be stripped
    assert "155 characters" not in out


def test_compose_unknown_format_raises() -> None:
    with pytest.raises(ComposeError, match="format 'no-such-format' not found"):
        compose(_load_dan(), format="no-such-format")


def test_compose_unknown_sample_id_raises() -> None:
    with pytest.raises(ComposeError, match="sample 'xx' not found"):
        compose(_load_dan(), samples=["xx"])


def test_compose_unknown_bio_raises() -> None:
    with pytest.raises(ComposeError, match="bio 'no-such-bio' not found"):
        compose(_load_dan(), bio="no-such-bio")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_compose.py -v
```

Expected: all tests FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `compose.py`**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/compose.py`:

```python
"""Compose a complete LLM prompt from a style pack.

Mirrors `Dan-ai/scripts/compose.sh` semantically but operates on any
SPEC v1.0 pack via its manifest.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from myvoice.packs.manifest import Manifest


class ComposeError(Exception):
    """Raised when composition cannot complete (e.g., unknown format)."""


def compose(
    pack_root: Path,
    *,
    format: str | None = None,
    samples: list[str] | None = None,
    draft: str | None = None,
    bio: str | None = None,
) -> str:
    """Assemble the prompt text for a pack.

    Modes:
    - Prompt mode (default): emit ROLE + Humanizer + style guide + optional
      format add-on + optional voice exemplars + optional draft trailer.
    - Bio mode (`bio=` set): emit just the bio body. Other args ignored.
    """
    manifest_path = pack_root / "stylepack.yaml"
    manifest = Manifest.model_validate(
        yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    )

    if bio is not None:
        return _render_bio(pack_root, manifest, bio)

    parts: list[str] = []
    parts.append(_render_header(manifest))
    parts.append(_render_humanizer(manifest))
    parts.append((pack_root / "style-guide.md").read_text(encoding="utf-8"))

    if format is not None:
        parts.append(_render_format(pack_root, manifest, format))

    if samples:
        parts.append(_render_samples(pack_root, manifest, samples))

    if draft is not None:
        parts.append(_render_draft(draft))

    return "\n\n".join(p.rstrip() for p in parts) + "\n"


def _render_header(m: Manifest) -> str:
    return (
        f"ROLE: You are {m.persona.identity}. {m.persona.one_line}\n\n"
        "TASK: Rewrite the input text to be 100% authentic to the style guide "
        "below. The output must be energetic, definitive, and transparent. "
        "Never robotic."
    )


def _render_humanizer(m: Manifest) -> str:
    lines: list[str] = ["## Section 1: The Humanizer (Strict Anti-Robot Constraints)\n"]
    lines.append("Before applying style, you must scrub the text of LLM-isms:\n")

    if m.banished.words:
        lines.append("**Banished Vocabulary** (do NOT use):")
        lines.append(", ".join(m.banished.words))
        lines.append("")

    if m.banished.phrases:
        lines.append("**Banished Phrases** (strike on sight):")
        for ph in m.banished.phrases:
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
    if m.rules.no_sentence_starters:
        joined = ", ".join(f'"{s}"' for s in m.rules.no_sentence_starters)
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

    return "\n".join(lines)


def _render_format(pack_root: Path, m: Manifest, name: str) -> str:
    fmt = next((f for f in m.formats if f.name == name), None)
    if fmt is None:
        raise ComposeError(f"format '{name}' not found in pack manifest")
    body = (pack_root / fmt.file).read_text(encoding="utf-8")
    return f"---\n\n## Additional format-specific instructions\n\n{body}"


def _render_samples(pack_root: Path, m: Manifest, ids: list[str]) -> str:
    out: list[str] = ["---\n\n## Voice exemplars (match the tone and rhythm of these)\n"]
    for sid in ids:
        sample = next((s for s in m.samples if s.id == sid), None)
        if sample is None:
            raise ComposeError(f"sample '{sid}' not found in pack manifest")
        body = (pack_root / sample.file).read_text(encoding="utf-8")
        out.append(f"### From: {Path(sample.file).stem}\n")
        for line in body.splitlines():
            if line.startswith("> "):
                out.append(line[2:])
            elif line.strip() == ">":
                out.append("")
        out.append("")
    return "\n".join(out)


def _render_draft(draft: str) -> str:
    return f"---\n\n**INPUT TEXT TO REWRITE:**\n\n{draft}"


def _render_bio(pack_root: Path, m: Manifest, name: str) -> str:
    bio = next((b for b in m.bios if b.name == name), None)
    if bio is None:
        raise ComposeError(f"bio '{name}' not found in pack manifest")
    body = (pack_root / bio.file).read_text(encoding="utf-8")
    # Strip author notes: italic-only lines like "*155 characters.*"
    kept = [
        line for line in body.splitlines()
        if not (line.strip().startswith("*") and line.strip().endswith("*"))
    ]
    # Extract blockquote body; strip "> " prefix
    out: list[str] = []
    for line in kept:
        if line.startswith("> "):
            out.append(line[2:])
        elif line.strip() == ">":
            out.append("")
    return "\n".join(out).strip() + "\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_compose.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 5: Lint clean**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run ruff check packages/api && uv run mypy packages/api
```

Expected: both pass.

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add compose.py for assembling LLM prompts from style packs"
```

---

## Task 12: `lint.py` — pack linter (TDD)

**Files:**
- Create: `packages/api/myvoice/lint.py`
- Create: `packages/api/tests/test_lint.py`

- [ ] **Step 1: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_lint.py`:

```python
"""Tests for the pack linter."""

from pathlib import Path

from myvoice.lint import Violation, lint
from myvoice.packs.manifest import Manifest

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_dan_manifest() -> Manifest:
    return Manifest.model_validate(
        yaml.safe_load((REPO_ROOT / "packs" / "dan" / "stylepack.yaml").read_text())
    )


def test_clean_draft_has_no_violations() -> None:
    m = _load_dan_manifest()
    text = "Build. Bind. Deploy. Scale.\n"
    assert lint(m, text) == []


def test_banished_word_flagged() -> None:
    m = _load_dan_manifest()
    text = "We will delve into the architecture."
    violations = lint(m, text)
    assert any(v.kind == "word" and v.match == "delve" for v in violations)


def test_banished_word_case_insensitive() -> None:
    m = _load_dan_manifest()
    text = "We will Delve into the architecture."
    violations = lint(m, text)
    assert any(v.kind == "word" and v.match.lower() == "delve" for v in violations)


def test_permitted_exception_case_sensitive() -> None:
    """`Pivotal` (capitalized proper noun) is exempt, but `pivotal` (adjective)
    is still flagged."""
    m = _load_dan_manifest()
    # 'Pivotal' the proper noun — exempt
    assert lint(m, "We worked at Pivotal in 2015.") == []
    # 'pivotal' the adjective — still flagged
    violations = lint(m, "It was a pivotal moment.")
    assert any(v.kind == "word" and v.match == "pivotal" for v in violations)


def test_banished_phrase_flagged() -> None:
    m = _load_dan_manifest()
    text = "It's important to note that this matters."
    violations = lint(m, text)
    assert any(v.kind == "phrase" and "important to note" in v.match.lower() for v in violations)


def test_em_dash_flagged() -> None:
    m = _load_dan_manifest()
    text = "Spring Boot is great — it makes deploying easy."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "em dash" in v.message.lower() for v in violations)


def test_ascii_double_hyphen_between_letters_flagged() -> None:
    m = _load_dan_manifest()
    text = "Spring Boot is great--it makes deploying easy."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "double" in v.message.lower() for v in violations)


def test_forbidden_sentence_starter_flagged() -> None:
    m = _load_dan_manifest()
    text = "Furthermore, this is great."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "Furthermore" in v.message for v in violations)


def test_violation_has_line_and_column() -> None:
    m = _load_dan_manifest()
    text = "Good first line.\nWe will delve here.\n"
    violations = lint(m, text)
    found = next(v for v in violations if v.match == "delve")
    assert found.line == 2
    assert found.column == 9  # 0-indexed position of 'd' on line 2
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_lint.py -v
```

Expected: all FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `lint.py`**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/lint.py`:

```python
"""Lint draft text against a style pack's manifest rules."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from myvoice.packs.manifest import Manifest

Kind = Literal["word", "phrase", "rule"]


@dataclass(frozen=True)
class Violation:
    kind: Kind
    message: str
    match: str
    line: int  # 1-indexed
    column: int  # 0-indexed byte offset on that line


def lint(manifest: Manifest, text: str) -> list[Violation]:
    """Return all violations of `manifest` rules in `text`."""
    violations: list[Violation] = []

    # Build the case-sensitive exception set (term must match exactly, including case).
    exemptions = {ex.term for ex in manifest.banished.permitted_exceptions}

    lines = text.splitlines()

    # Banished words: case-insensitive whole-word match, but exempt exact-case matches.
    for word in manifest.banished.words:
        pattern = re.compile(rf"(?<![\w-])({re.escape(word)})(?![\w-])", re.IGNORECASE)
        for ln_no, line in enumerate(lines, start=1):
            for m in pattern.finditer(line):
                if m.group(1) in exemptions:
                    continue
                violations.append(Violation(
                    kind="word",
                    message=f'banished word: "{m.group(1)}"',
                    match=m.group(1),
                    line=ln_no,
                    column=m.start(1),
                ))

    # Banished phrases: case-insensitive substring match.
    for phrase in manifest.banished.phrases:
        pattern = re.compile(re.escape(phrase), re.IGNORECASE)
        for ln_no, line in enumerate(lines, start=1):
            for m in pattern.finditer(line):
                violations.append(Violation(
                    kind="phrase",
                    message=f'banished phrase: "{m.group(0)}"',
                    match=m.group(0),
                    line=ln_no,
                    column=m.start(0),
                ))

    # Em dash rule.
    if manifest.rules.no_em_dashes:
        for ln_no, line in enumerate(lines, start=1):
            for m in re.finditer("—", line):
                violations.append(Violation(
                    kind="rule",
                    message="em dash not allowed",
                    match="—",
                    line=ln_no,
                    column=m.start(),
                ))

    # ASCII double-hyphen between letters.
    if manifest.rules.no_ascii_double_hyphen_between_letters:
        pattern = re.compile(r"[A-Za-z]--[A-Za-z]")
        for ln_no, line in enumerate(lines, start=1):
            for m in pattern.finditer(line):
                violations.append(Violation(
                    kind="rule",
                    message="ASCII double-hyphen between letters not allowed",
                    match=m.group(),
                    line=ln_no,
                    column=m.start(),
                ))

    # Forbidden sentence starters: match at the start of any "sentence",
    # where a sentence start is a line beginning or follows ". ", "! ", "? ".
    if manifest.rules.no_sentence_starters:
        starter_alt = "|".join(re.escape(s) for s in manifest.rules.no_sentence_starters)
        # (?:^|(?<=[.!?]\s))STARTER\b — start-of-line OR after a sentence boundary.
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

    return violations
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_lint.py -v
```

Expected: 9 tests PASS.

- [ ] **Step 5: Lint clean**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run ruff check packages/api && uv run mypy packages/api
```

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat: add lint.py with banished-word/phrase/rule violations"
```

---

## Task 13: Pack discovery (TDD)

**Files:**
- Create: `packages/api/myvoice/packs/discovery.py`
- Create: `packages/api/tests/packs/test_discovery.py`

- [ ] **Step 1: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/packs/test_discovery.py`:

```python
"""Tests for pack discovery."""

from pathlib import Path

from myvoice.packs.discovery import PackInfo, discover_packs


def _write_minimal_pack(root: Path, slug: str) -> Path:
    pack = root / slug
    pack.mkdir(parents=True)
    (pack / "stylepack.yaml").write_text(
        f'spec_version: "1.0"\n'
        f"pack:\n  slug: {slug}\n  name: {slug}\n  version: 0.1\n  author: t\n"
        "persona:\n  identity: a\n  one_line: b\n"
    )
    (pack / "style-guide.md").write_text("body")
    return pack


def test_discover_empty_dir_returns_empty(tmp_path: Path) -> None:
    assert discover_packs([tmp_path]) == []


def test_discover_finds_one_pack(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    packs = discover_packs([tmp_path])
    assert len(packs) == 1
    assert packs[0].slug == "alpha"
    assert packs[0].valid is True


def test_discover_finds_multiple_packs(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    _write_minimal_pack(tmp_path, "beta")
    slugs = {p.slug for p in discover_packs([tmp_path])}
    assert slugs == {"alpha", "beta"}


def test_discover_ignores_dirs_without_manifest(tmp_path: Path) -> None:
    (tmp_path / "not-a-pack").mkdir()
    (tmp_path / "not-a-pack" / "readme.md").write_text("not a pack")
    assert discover_packs([tmp_path]) == []


def test_discover_surfaces_invalid_packs_with_errors(tmp_path: Path) -> None:
    pack = tmp_path / "broken"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text("not valid yaml: ][")
    info = discover_packs([tmp_path])
    assert len(info) == 1
    assert info[0].slug == "broken"
    assert info[0].valid is False
    assert info[0].errors


def test_discover_multiple_roots_in_priority_order(tmp_path: Path) -> None:
    """First root listed wins on slug conflicts (recorded as such)."""
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    packs = discover_packs([high, low])
    # Both are returned but the one from `high` is first.
    shared = [p for p in packs if p.slug == "shared"]
    assert len(shared) == 2
    assert shared[0].root_path.parent == high
    assert shared[1].root_path.parent == low
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_discovery.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement discovery**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/packs/discovery.py`:

```python
"""Discover style packs by walking directories one level deep."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from myvoice.validate import ValidationError, validate_pack


@dataclass(frozen=True)
class PackInfo:
    slug: str
    name: str
    version: str
    root_path: Path
    valid: bool
    errors: list[ValidationError] = field(default_factory=list)


def discover_packs(roots: list[Path]) -> list[PackInfo]:
    """Walk each root one level deep, return all discovered packs.

    A pack is any subdirectory that contains a `stylepack.yaml`. The pack's
    slug is taken from its parsed manifest if possible, otherwise from its
    directory name (so we can still surface invalid packs to the UI).

    Results are returned in `roots` order. Slug conflicts across roots are
    preserved (both entries returned) so the caller can warn.
    """
    found: list[PackInfo] = []
    for root in roots:
        if not root.is_dir():
            continue
        for entry in sorted(root.iterdir()):
            if not entry.is_dir():
                continue
            manifest = entry / "stylepack.yaml"
            if not manifest.is_file():
                continue
            result = validate_pack(entry)
            if result.manifest is not None:
                slug = result.manifest.pack.slug
                name = result.manifest.pack.name
                version = result.manifest.pack.version
            else:
                slug = entry.name
                name = entry.name
                version = "?"
            found.append(PackInfo(
                slug=slug,
                name=name,
                version=version,
                root_path=entry,
                valid=result.valid,
                errors=list(result.errors),
            ))
    return found
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_discovery.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat(packs): add discovery layer (scan dirs for stylepack.yaml)"
```

---

## Task 14: `PackStore` (TDD)

**Files:**
- Create: `packages/api/myvoice/packs/store.py`
- Create: `packages/api/tests/packs/test_store.py`

- [ ] **Step 1: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/packs/test_store.py`:

```python
"""Tests for PackStore."""

from pathlib import Path

import pytest

from myvoice.packs.store import PackStore


def _write_minimal_pack(root: Path, slug: str) -> Path:
    pack = root / slug
    pack.mkdir(parents=True)
    (pack / "stylepack.yaml").write_text(
        f'spec_version: "1.0"\n'
        f"pack:\n  slug: {slug}\n  name: {slug}\n  version: 0.1\n  author: t\n"
        "persona:\n  identity: a\n  one_line: b\n"
    )
    (pack / "style-guide.md").write_text("body")
    return pack


def test_store_indexes_packs_on_init(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    _write_minimal_pack(tmp_path, "beta")
    store = PackStore([tmp_path])
    assert sorted(store.slugs()) == ["alpha", "beta"]


def test_store_get_returns_pack_info(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    store = PackStore([tmp_path])
    info = store.get("alpha")
    assert info is not None
    assert info.slug == "alpha"


def test_store_get_unknown_returns_none(tmp_path: Path) -> None:
    store = PackStore([tmp_path])
    assert store.get("ghost") is None


def test_store_reload_picks_up_new_pack(tmp_path: Path) -> None:
    store = PackStore([tmp_path])
    assert store.slugs() == []
    _write_minimal_pack(tmp_path, "alpha")
    store.reload()
    assert store.slugs() == ["alpha"]


def test_store_first_root_wins_on_slug_conflict(tmp_path: Path) -> None:
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    store = PackStore([high, low])
    info = store.get("shared")
    assert info is not None
    assert info.root_path.parent == high


def test_store_conflicts_lists_both_paths(tmp_path: Path) -> None:
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    store = PackStore([high, low])
    conflicts = store.conflicts()
    assert "shared" in conflicts
    assert len(conflicts["shared"]) == 2
```

- [ ] **Step 2: Run failing tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_store.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement `PackStore`**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/packs/store.py`:

```python
"""In-memory index of discovered style packs."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from myvoice.packs.discovery import PackInfo, discover_packs


class PackStore:
    """Holds a dict of slug -> PackInfo, plus a record of slug conflicts."""

    def __init__(self, roots: list[Path]):
        self._roots = roots
        self._by_slug: dict[str, PackInfo] = {}
        self._conflicts: dict[str, list[Path]] = {}
        self.reload()

    def reload(self) -> None:
        """Re-scan all configured roots."""
        self._by_slug = {}
        seen: dict[str, list[Path]] = defaultdict(list)
        for info in discover_packs(self._roots):
            seen[info.slug].append(info.root_path)
            if info.slug not in self._by_slug:
                self._by_slug[info.slug] = info
        self._conflicts = {slug: paths for slug, paths in seen.items() if len(paths) > 1}

    def slugs(self) -> list[str]:
        return sorted(self._by_slug.keys())

    def get(self, slug: str) -> PackInfo | None:
        return self._by_slug.get(slug)

    def conflicts(self) -> dict[str, list[Path]]:
        return dict(self._conflicts)
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/packs/test_store.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat(packs): add PackStore (in-memory pack index keyed by slug)"
```

---

## Task 15: CLI `pack` command group (TDD)

**Files:**
- Modify: `packages/api/myvoice/cli.py` — add `pack` group with `list`, `validate`, `compose`, `lint` subcommands
- Create: `packages/api/tests/test_cli_pack.py`

- [ ] **Step 1: Write the failing tests**

Write `/Users/dbbaskette/Projects/myvoice/packages/api/tests/test_cli_pack.py`:

```python
"""Tests for `myvoice pack ...` CLI subcommands."""

from pathlib import Path

from click.testing import CliRunner

from myvoice.cli import main

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_pack_list_shows_dan_and_template() -> None:
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "list", "--root", str(REPO_ROOT / "packs")]
    )
    assert result.exit_code == 0
    assert "dan" in result.output
    assert "_template" in result.output


def test_pack_validate_dan_succeeds() -> None:
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "validate", str(REPO_ROOT / "packs" / "dan")]
    )
    assert result.exit_code == 0
    assert "valid" in result.output.lower()


def test_pack_validate_broken_fails(tmp_path: Path) -> None:
    (tmp_path / "stylepack.yaml").write_text("not yaml: ][")
    runner = CliRunner()
    result = runner.invoke(main, ["pack", "validate", str(tmp_path)])
    assert result.exit_code != 0


def test_pack_compose_emits_prompt() -> None:
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "compose", str(REPO_ROOT / "packs" / "dan"),
               "--format", "blog-post"]
    )
    assert result.exit_code == 0
    assert "ROLE:" in result.output
    assert "Additional format-specific instructions" in result.output


def test_pack_lint_flags_banished_word(tmp_path: Path) -> None:
    draft = tmp_path / "draft.md"
    draft.write_text("We will delve into the architecture.")
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "lint", str(REPO_ROOT / "packs" / "dan"), str(draft)]
    )
    assert result.exit_code != 0  # non-zero on any violation
    assert "delve" in result.output.lower()
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli_pack.py -v
```

Expected: FAIL because `pack` group doesn't exist yet.

- [ ] **Step 3: Extend `cli.py` with the `pack` group**

Modify `/Users/dbbaskette/Projects/myvoice/packages/api/myvoice/cli.py`. Append the following AFTER the existing `serve` command:

```python


@main.group()
def pack() -> None:
    """Style-pack commands: list, validate, compose, lint."""


@pack.command(name="list")
@click.option(
    "--root",
    "roots",
    multiple=True,
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    help="Directory to scan for packs. May be repeated.",
)
def pack_list(roots: tuple[Path, ...]) -> None:
    """List packs discovered under one or more roots."""
    from myvoice.packs.store import PackStore

    if not roots:
        click.echo("error: at least one --root is required (try --root packs/)", err=True)
        raise SystemExit(2)
    store = PackStore(list(roots))
    for slug in store.slugs():
        info = store.get(slug)
        assert info is not None
        marker = "✓" if info.valid else "✗"
        click.echo(f"{marker} {info.slug} ({info.name}) v{info.version}  {info.root_path}")
    for slug, paths in store.conflicts().items():
        click.echo(f"warning: slug '{slug}' conflicts across {len(paths)} roots", err=True)


@pack.command(name="validate")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
def pack_validate(pack_root: Path) -> None:
    """Validate a single pack directory against SPEC v1.0."""
    from myvoice.validate import validate_pack

    result = validate_pack(pack_root)
    if result.valid:
        click.echo(f"{pack_root}: valid")
        return
    click.echo(f"{pack_root}: INVALID ({len(result.errors)} error(s))", err=True)
    for err in result.errors:
        click.echo(f"  {err.path}: {err.message}", err=True)
    raise SystemExit(1)


@pack.command(name="compose")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--format", "format_name", help="Format add-on (e.g., blog-post).")
@click.option("--samples", help="Comma-separated sample IDs (e.g., 01,04).")
@click.option("--draft", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="File containing the draft to rewrite.")
@click.option("--bio", "bio_name", help="Emit just a bio body (no prompt assembly).")
def pack_compose(
    pack_root: Path,
    format_name: str | None,
    samples: str | None,
    draft: Path | None,
    bio_name: str | None,
) -> None:
    """Compose a prompt (or bio body) from a pack."""
    from myvoice.compose import compose

    sample_ids = [s.strip() for s in samples.split(",")] if samples else None
    draft_text = draft.read_text(encoding="utf-8") if draft else None
    out = compose(
        pack_root,
        format=format_name,
        samples=sample_ids,
        draft=draft_text,
        bio=bio_name,
    )
    click.echo(out, nl=False)


@pack.command(name="lint")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.argument("draft", type=click.Path(exists=True, dir_okay=False, path_type=Path))
def pack_lint(pack_root: Path, draft: Path) -> None:
    """Lint a draft against a pack's manifest rules."""
    import yaml

    from myvoice.lint import lint
    from myvoice.packs.manifest import Manifest

    manifest = Manifest.model_validate(
        yaml.safe_load((pack_root / "stylepack.yaml").read_text(encoding="utf-8"))
    )
    violations = lint(manifest, draft.read_text(encoding="utf-8"))
    if not violations:
        click.echo(f"{draft}: clean")
        return
    click.echo(f"{draft}: {len(violations)} violation(s)", err=True)
    for v in violations:
        click.echo(f"  L{v.line}:{v.column}  [{v.kind}] {v.message}", err=True)
    raise SystemExit(1)
```

Also add the `Path` import at the top of `cli.py`:

```python
from pathlib import Path
```

(after the existing `import os` line).

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run pytest packages/api/tests/test_cli_pack.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 5: Verify the full suite still passes**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make test
```

Expected: all Python tests pass; web tests still pass.

- [ ] **Step 6: Manual smoke**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run myvoice pack list --root packs
```

Expected: lists `dan` and `_template` with green checks.

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add packages/api && git commit -m "feat(cli): add 'myvoice pack' group (list, validate, compose, lint)"
```

---

## Task 16: GitHub Actions — validate-packs workflow

**Files:**
- Create: `.github/workflows/validate-packs.yml`

- [ ] **Step 1: Write the workflow**

Write `/Users/dbbaskette/Projects/myvoice/.github/workflows/validate-packs.yml`:

```yaml
name: validate-packs

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "latest"

      - name: Set up Python
        run: uv python install 3.11

      - name: Install deps
        run: uv sync --frozen

      - name: Validate every pack in packs/
        run: |
          set -e
          for pack in packs/*/; do
            echo "==> $pack"
            uv run myvoice pack validate "$pack"
          done
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add .github/workflows/validate-packs.yml && git commit -m "ci: add validate-packs workflow"
```

---

## Task 17: README updates for Phase 2

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Packs section**

Read `/Users/dbbaskette/Projects/myvoice/README.md`. Append the following section after the existing "Repo layout" section:

```markdown
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
```

Also update the "Repo layout" section's tree to mention `packs/`:

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

(Replace the old line that says "added in Phase 2".)

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && git add README.md && git commit -m "docs: README — add Packs section + CLI usage"
```

---

## Task 18: End-to-end smoke test

**Files:** None (pure verification)

- [ ] **Step 1: Full test suite green**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make test
```

Expected: all Python + TS tests pass.

- [ ] **Step 2: Full lint green**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && make lint
```

Expected: ruff, mypy, biome, tsc all clean.

- [ ] **Step 3: Validate every pack**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && for p in packs/*/; do uv run myvoice pack validate "$p"; done
```

Expected: each pack reports "valid".

- [ ] **Step 4: Compose against Dan-AI**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && uv run myvoice pack compose packs/dan --format blog-post --samples 01,04 | head -30
```

Expected: a coherent prompt starting with `ROLE:` and including the Humanizer section.

- [ ] **Step 5: Lint a known-bad draft**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && echo "We will delve into the dynamic landscape." > /tmp/bad.md && uv run myvoice pack lint packs/dan /tmp/bad.md; echo "exit: $?"; rm /tmp/bad.md
```

Expected: reports `delve`, `dynamic`, `landscape` as violations; non-zero exit.

- [ ] **Step 6: Lint a clean draft**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && echo "Build. Bind. Deploy. Scale." > /tmp/good.md && uv run myvoice pack lint packs/dan /tmp/good.md; echo "exit: $?"; rm /tmp/good.md
```

Expected: reports "clean"; zero exit.

- [ ] **Step 7: Reinstall the local wheel to refresh ./local-venv/**

Run:
```bash
cd /Users/dbbaskette/Projects/myvoice && ./scripts/install-local.sh 2>&1 | tail -5
```

Expected: wheel rebuilt, `local-venv` refreshed, `myvoice version` prints `0.1.0`.

---

## Phase 2 done-state checklist

- [ ] `SPEC.md` v1.0 committed at repo root.
- [ ] `pydantic>=2.9` added; `uv.lock` updated.
- [ ] `packs/dan/` exists, populated, validates green.
- [ ] `packs/_template/` exists, validates green, contains TODO placeholders.
- [ ] `myvoice/packs/manifest.py`, `compose.py`, `lint.py`, `validate.py`, `packs/discovery.py`, `packs/store.py` all implemented with tests.
- [ ] `myvoice pack list / validate / compose / lint` all work end-to-end.
- [ ] `validate-packs.yml` workflow added to CI.
- [ ] README documents packs + CLI.
- [ ] `make test` and `make lint` green.

Next: Phase 3 — Pack Browsing & Editing UI. Sidebar + pack viewer + manifest form editor + WYSIWYG markdown editor + file watching via SSE.
