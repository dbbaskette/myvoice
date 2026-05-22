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

    def rescan(self, new_roots: list[str] | list[Path]) -> None:
        """Update pack roots and re-walk discovery. Accepts str or Path entries."""
        self._roots = [Path(r) for r in new_roots]
        self.reload()

    def slugs(self) -> list[str]:
        return sorted(self._by_slug.keys())

    def get(self, slug: str) -> PackInfo | None:
        return self._by_slug.get(slug)

    def conflicts(self) -> dict[str, list[Path]]:
        return dict(self._conflicts)
