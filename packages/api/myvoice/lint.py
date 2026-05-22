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

    # Forbidden sentence starters: at start-of-line OR after ". ", "! ", "? ".
    if manifest.rules.no_sentence_starters:
        starter_alt = "|".join(re.escape(s) for s in manifest.rules.no_sentence_starters)
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
