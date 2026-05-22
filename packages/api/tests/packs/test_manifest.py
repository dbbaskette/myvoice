"""Tests for the style pack Pydantic manifest models."""

from typing import Any

import pytest
from pydantic import ValidationError

from myvoice.packs.manifest import Manifest


def _minimal_manifest_dict() -> dict[str, Any]:
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
