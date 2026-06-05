# Light Redesign — Design Spec

**Date:** 2026-06-05
**Status:** Approved — implementing

## Problem

The web UI looks stark and dated ("old terminal / 1990s HTML"): a uniform dark
slate palette applied as raw Tailwind utilities, emoji icons, flat 1px borders,
no cards/elevation, and accent color used only on buttons. Tailwind's theme is
empty (no design tokens), so there's no system — every component re-states the
same dark utilities.

## Goal

A tasteful, modern, **light** redesign across the whole app: a soft neutral
canvas with white cards, an **indigo** accent, clean **lucide** icons, consistent
controls, and real empty states — driven by a small design system so the look is
consistent and future-proof. **Presentational only** — no behavior/logic changes.

## Decisions (from brainstorming)

- **Theme:** light & airy (light mode only this pass; tokens structured so a dark
  theme could be layered later).
- **Accent:** indigo / violet.
- **Boldness:** tasteful & refined (cards, soft shadows, restrained color).
- **Scope:** whole app in one pass.
- **Icons:** add `lucide-react`, replace all emoji.

## Design System

### Tokens / class conventions (the contract every screen follows)

| Role | Classes |
|---|---|
| App canvas | `bg-slate-50 text-slate-900` |
| Card / surface | `bg-white border border-slate-200 rounded-xl shadow-sm` (hover: `hover:shadow-md`) |
| Sidebar / rail | `bg-white border-r border-slate-200` |
| Heading text | `text-slate-900` |
| Body text | `text-slate-600` |
| Muted text | `text-slate-400` |
| Hairline / divider | `border-slate-200` |
| Hover surface | `hover:bg-slate-100` |
| Active nav | `bg-indigo-50 text-indigo-700` + 2px left accent (`border-l-2 border-indigo-600`) |
| Focus ring | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` |
| Primary button | `bg-indigo-600 text-white hover:bg-indigo-500` |
| Secondary button | `bg-white border border-slate-300 text-slate-700 hover:bg-slate-50` |
| Ghost button | `text-slate-600 hover:bg-slate-100` |
| Danger button | `bg-rose-600 text-white hover:bg-rose-500` |
| Input / textarea | `bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder:text-slate-400` + focus ring + `focus:border-indigo-500` |
| Semantic — valid | emerald: dot `bg-emerald-500`, pill `bg-emerald-50 text-emerald-700` |
| Semantic — error/invalid | rose: dot `bg-rose-500`, pill `bg-rose-50 text-rose-700` |
| Semantic — warning/lint | amber: `bg-amber-50 text-amber-700` |
| Badge / count pill | `bg-slate-100 text-slate-600 rounded-full text-xs px-2 py-0.5` |
| Radii | cards `rounded-xl`, controls `rounded-lg`, pills `rounded-full` |
| Shadow | cards `shadow-sm`, hover `shadow-md`, dialogs `shadow-xl` |

Font: keep the system stack (SF Pro on macOS). Tighten heading tracking
(`tracking-tight`). No web-font dependency.

### Primitives — new `src/components/ui/`

Small, composable, typed. Everything else builds on these so the look is
centralized.

- `cn(...classes)` — tiny truthy-join helper (`src/components/ui/cn.ts`), no dep.
- `Card` — `{ className?, children }` → the card surface above. Optional
  `as`/padding left to consumers via className.
- `Button` — `{ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md', ...buttonProps }`.
  Includes the focus ring and `disabled:opacity-50` automatically.
- `Input`, `Textarea` — styled `<input>`/`<textarea>` passthroughs.
- `Badge` — `{ variant?: 'neutral'|'success'|'danger'|'warning'|'accent', children }`.
- `PageHeader` — `{ title, description?, actions? }` → consistent page top (h1 +
  muted subtitle + right-aligned actions slot).
- `icons.ts` — re-export the chosen lucide icons in one place so usage is
  consistent and swappable.

### Icons (lucide-react)

| Use | Icon |
|---|---|
| Packs (nav) | `Library` |
| Extract (nav) | `Sparkles` |
| Compose (nav) | `Wand2` |
| Settings (nav) | `Settings` |
| Overview tab | `LayoutDashboard` |
| Manifest tab | `SlidersHorizontal` |
| Style guide tab | `FileText` |
| Formats tab | `Files` |
| Samples tab | `MessageSquareQuote` |
| Bios tab | `UserRound` |
| New / add | `Plus` |
| Delete | `Trash2` |
| Valid / invalid | `CircleCheck` / `CircleAlert` (or colored dots) |

## Screen-by-screen treatment

- **AppShell** (`components/AppShell.tsx`): light sidebar (`bg-white border-r`),
  brand wordmark, nav rows with lucide icons + indigo active state + left accent
  bar; canvas `bg-slate-50`. Main pane scrolls.
- **PackList** (`components/PackList.tsx`): refined rows — name, validity dot,
  hover/active states; footer actions (New pack / Import) as `Button` ghost/secondary.
- **PacksPage** (`routes/PacksPage.tsx`): real empty/landing state — centered
  `Card`, headline + helper copy, prominent primary "New pack" button. (The
  dialog open state lives in PackList; landing CTA can navigate/scroll to it or
  trigger it — keep simple: friendly card guiding to the sidebar + a primary
  button that opens the New pack dialog if wired, else points to the sidebar.)
- **PackDetailPage** (`routes/PackDetailPage.tsx`): the sub-nav rail gets lucide
  icons + count `Badge`s + indigo active state; validity shown as a semantic
  pill. Tab content sits in `Card`s with page padding via `PageHeader`.
- **Manifest** (`components/manifest/*`): each section (Persona, Banished,
  Rules, PopCulture, Metadata, Exceptions, Entries) becomes a `Card` with a
  section header; all inputs use `Input`/`Textarea`/`TagInput` restyled; tables
  get light borders + zebra-free clean rows.
- **MarkdownEditor** (`components/MarkdownEditor.tsx`): light editor chrome —
  white surface, toolbar/header with `Button`s, prose styling via the typography
  plugin tuned for light.
- **Compose** (`routes/ComposePage.tsx` + `components/compose/*`): panes as
  cards; `ControlsBar`, `InputPane`, `OutputPane`, `DiffView`, `Receipt`,
  dialogs restyled with primitives.
- **Extract** (`routes/ExtractPage.tsx` + `components/extract/*`): wizard steps,
  dropzone, URL list, review cards all restyled; step indicator gets indigo.
- **Settings** (`routes/SettingsPage.tsx` + `components/settings/*`): each
  section a `Card`; inputs/toggles restyled.
- **Dialogs** (`packs/*Dialog`, `manifest/*Dialog`, `compose/*`): white card,
  `shadow-xl`, primitives for buttons/inputs (NewPackDialog already close —
  align to primitives).
- **lint.css** (`styles/lint.css`): retune highlight colors for a light
  background (banished/rule/positive markers as soft underlines/backgrounds that
  read on white).

## Scope boundaries (YAGNI)

- **In:** `lucide-react` dep; `theme.extend` only if a token genuinely needs it
  (otherwise indigo/slate utilities directly); `src/components/ui/` primitives;
  restyle every screen/component above; retune `lint.css`.
- **Out:** dark-mode toggle (light only; `ThemeSection` stays but is cosmetic
  this pass); any behavior/data/route change; new features; renaming the
  `*Stub` tab components (separate cleanup).

## Testing

- No logic changes, so existing `vitest` suites (which assert text/roles, not
  styles) stay green. Update only tests that assert specific style classes or the
  removed emoji label text (e.g. nav/tab labels that included an emoji) — match
  to the new accessible names.
- `biome` + `tsc -b` clean; `vitest` green; production build succeeds.
- Final **visual verification**: run the app and screenshot the key screens
  (Packs, pack detail, Compose, Settings) to confirm the look.

## Implementation note

Establish the design system (tokens + `ui/` primitives + AppShell) **first** so
every subsequent screen is a mechanical application of the same contract; this
keeps the reskin visually consistent across ~50 components.
