# Light Redesign — Implementation Plan

> Execute on branch `light-redesign`. Presentational only; keep `vitest`, `biome`, `tsc -b` green after each task and commit per task. Design contract: see `docs/superpowers/specs/2026-06-05-light-redesign-design.md`.

**Order matters:** foundation first (tokens + primitives + shell), then screens inherit the contract.

- [ ] **Task 1 — Foundation:** add `lucide-react`; global.css → light base (`bg-slate-50`, `color-scheme: light`); `src/components/ui/` primitives (`cn`, `Card`, `Button`, `Input`, `Textarea`, `Badge`, `PageHeader`, `icons.ts`). Add a small unit test for `Button` variants + `cn`.
- [ ] **Task 2 — AppShell + PackList:** light sidebar, lucide nav icons, indigo active state + accent bar, refined pack rows with validity dot + count badges, footer actions as `Button`s.
- [ ] **Task 3 — PacksPage landing:** centered `Card` empty state with headline, helper copy, primary "New pack" CTA.
- [ ] **Task 4 — PackDetailPage:** sub-nav rail with lucide icons + count `Badge`s + indigo active; validity pill; tab content in cards with `PageHeader`.
- [ ] **Task 5 — Manifest:** `ManifestForm` + sections (`Persona`, `Banished`, `Rules`, `PopCulture`, `PackMetadata`, `Exceptions`, `Entries`, `TagInput`) → cards + primitives.
- [ ] **Task 6 — MarkdownEditor + FileGroup chrome:** light editor surface, toolbar/header buttons, prose tuned for light; file-list rail restyle.
- [ ] **Task 7 — Compose:** `ComposePage` + `compose/*` (`ControlsBar`, `InputPane`, `OutputPane`, `DiffView`, `Receipt`, `SaveSampleDialog`, `ViewPromptModal`).
- [ ] **Task 8 — Extract:** `ExtractPage` + `extract/*` (steps, `FileDropzone`, `UrlList`, `CostEstimate`, `review/*`).
- [ ] **Task 9 — Settings:** `SettingsPage` + `settings/*` (`Keys`, `Defaults`, `Server`, `PackPaths`, `Theme`).
- [ ] **Task 10 — Dialogs:** `packs/*Dialog`, `manifest/*Dialog` aligned to primitives (`NewPackDialog`, `ImportPackDialog`, `DeletePackDialog`, `NewEntryDialog`, `DeleteEntryDialog`).
- [ ] **Task 11 — lint.css:** retune banished/rule/positive highlight colors for light bg.
- [ ] **Task 12 — Verify:** fix any tests asserting old emoji labels/style classes; `vitest` + `biome` + `tsc -b` green; production build; screenshot Packs / pack detail / Compose / Settings to confirm the look.
