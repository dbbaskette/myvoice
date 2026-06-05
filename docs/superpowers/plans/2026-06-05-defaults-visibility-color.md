# Default-Rules Visibility + Color — Plan

> Branch `defaults-visibility-color`. Keep `pytest`, `vitest`, `biome`, `tsc -b` green; commit per task. Contract: `docs/superpowers/specs/2026-06-05-defaults-visibility-color-design.md`.

- [ ] **Task 1 — Backend `/api/ai-tells`:** new `api/ai_tells.py` router returning `{words,phrases,sentence_starters,patterns}` from `load_ai_tells()`; register in `server.py`; api test (TestClient) asserts content. `ruff`+`mypy` clean.
- [ ] **Task 2 — Frontend data:** `src/api/aiTells.ts` (`AiTells` type + `getAiTells()`); `src/hooks/useAiTells.ts` (module-promise singleton cache).
- [ ] **Task 3 — UI primitives:** add lucide re-exports (`Ban, Scale, Clapperboard, Tag, ShieldCheck, Layers, Info, ChevronDown, Globe`) to `ui/icons.tsx`; new `ui/SectionHeader.tsx` (colored icon chip + title + subtitle, `AccentColor` class map); export from barrel; small test.
- [ ] **Task 4 — Inherited panels:** `BanishedSection` read-only `<details>` panel (shared words chips + phrases list, "Global" badge, count in summary); `RulesSection` inherited panel (sentence-starters chips + `patterns.md` rendered via `marked` in a prose container). Add a `BanishedSection` test for the inherited header (mock `getAiTells`).
- [ ] **Task 5 — Colored sections:** apply `SectionHeader` with per-section accents (Persona=indigo, Banished=rose, Rules=amber, PopCulture=violet, Metadata=sky, Exceptions=emerald, Entries=teal) across manifest sections.
- [ ] **Task 6 — PackOverview color + inherited counts:** colored tinted stat cards; surface `+ N shared` via `useAiTells()`.
- [ ] **Task 7 — Verify:** `pytest` (backend) + `vitest` + `biome` + `tsc -b` green; `vite build`; live screenshot of Manifest (inherited panels + colored sections) and PackOverview.
