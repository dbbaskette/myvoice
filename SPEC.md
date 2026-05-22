# Style Pack Format Specification (v1.0)

> This document defines the **portable Style Pack format** consumed by myvoice
> and any other tool that wants to read or write style packs. The format is
> versioned. This is v1.0.

## 1. Pack layout

A pack is a directory. Required and optional files:

```
packs/<slug>/
├── stylepack.yaml          # Required — manifest
├── style-guide.md          # Required — prose only (principles, examples, brand)
├── formats/                # Optional — format add-ons
│   ├── blog-post.md
│   ├── linkedin-post.md
│   └── ...
├── samples/                # Optional — voice exemplars
│   ├── 01-<slug>.md
│   └── ...
└── bios/                   # Optional — standing bio content
    ├── twitter.md
    ├── conference-speaker.md
    ├── linkedin-about.md
    └── book-jacket.md
```

A minimal valid pack: `stylepack.yaml` + a one-paragraph `style-guide.md`. Everything else is optional.

## 2. Manifest schema (`stylepack.yaml`)

YAML chosen because the manifest is human-curated, list-heavy, and the lingua franca for adjacent content tools (Hugo, Jekyll, GitHub Actions).

```yaml
spec_version: "1.0"

pack:
  slug: dan                       # filesystem-safe id; must match directory name
  name: "Dan Baskette"
  version: "3.0"                  # pack content version (independent of spec_version)
  author: "Dan Baskette"
  description: "The Builder Who Gets It. Energetic, definitive, transparent."
  homepage: "https://github.com/dbbaskette/dan-ai"   # optional

persona:
  identity: "The Builder Who Gets It"
  one_line: "Bridges high-level strategy and technical reality; maker who advocates for the developer."

banished:
  words:
    - delve
    - leverage
    # ... full list extracted from the current style guide's Section 1
  phrases:
    - "It's important to note that"
    - "In today's digital age"
    # ...
  permitted_exceptions:
    - term: "Pivotal"
      reason: "Proper noun (Pivotal Software, Pivotal Cloud Foundry)"
    - term: "unlock"
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
  allowed: [Marvel]
  banned: [Star Wars, Star Trek, "Lord of the Rings"]

formats:
  - name: blog-post
    file: formats/blog-post.md
    description: "Long-form blog with Conflict & Resolution opener"
  - name: linkedin-post
    file: formats/linkedin-post.md
    description: "Punchy LinkedIn post with hook + payoff"

samples:
  - id: "01"
    file: samples/01-database-ai-tool-opener.md
    description: "Database AI tooling opener — 1388 chars"

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

**Key design points:**

- `spec_version` and `pack.version` are deliberately separate. A pack can bump its content version (3.0 → 3.1) without changing spec.
- `persona.one_line` is the smallest thing a composer needs to render a `ROLE:` line. Fuller narrative lives in `style-guide.md`.
- `rules.*` is a fixed, finite set in v1.0. Adding a new rule key requires bumping `spec_version`. Catches typos via the validator.
- `permitted_exceptions[].reason` keeps the *why* attached to each exception so future readers (and linter messages) have context.
- `formats[]`, `samples[]`, `bios[]` are explicit lists, not auto-discovered. The pack declares what it offers; tools resolve names to file paths.

## 3. Pack contents

### `style-guide.md`

Prose only. After data extraction to the manifest, this file contains the parts of the original Dan-AI guide that aren't derivable from YAML:

- Writing Principles (Conflict & Resolution, Speed to Value, Better Together, Golden Command, Not a Science Project) with examples.
- Formatting & Visuals guidance.
- Video & Presentation Style.
- Personal Brand Signatures (Maker mindset, Marvel-only pop culture).
- Self-Check Before Output checklist.

No YAML frontmatter required. The composer treats this file as opaque prose to append after the data-generated header.

### `formats/*.md`

Free-form markdown describing how the format differs from the base voice (length, structure, opener style, etc.). One file per `formats[].name` in the manifest.

### `samples/*.md`

Markdown with at least one blockquote. The blockquote contains the verbatim excerpt; anything outside is author-facing meta (source, why this sample is good) and is stripped before the sample reaches the LLM.

### `bios/*.md`

Standing bio content the writer authored. Markdown body is the bio text; optional italic note at the top documents usage. The composer extracts the body when `--bio <name>` is requested.

## 4. Validation rules

A pack is valid if:

1. `stylepack.yaml` exists and parses as valid YAML.
2. `spec_version` is a supported version (currently `"1.0"`).
3. Required fields present: `pack.slug`, `pack.name`, `pack.version`, `persona.identity`, `persona.one_line`.
4. `pack.slug` matches the directory name.
5. `style-guide.md` exists and is non-empty.
6. Every file listed in `formats[]`, `samples[]`, `bios[]` exists and is non-empty.
7. Every `samples[*].file` contains at least one blockquote.
8. Every `bios[*]` with `max_chars` set: the body (after stripping author notes) fits.
9. `rules.*` keys are all known to spec v1.0.
10. `banished.words` and `banished.phrases` are arrays of non-empty strings.

## 5. Versioning

`spec_version` follows semantic versioning (major only). A spec v1.0 document defines all supported `spec_version` values at that major release.

Bumping the major version (1.0 → 2.0) requires:
- A new `SPEC-2.0.md` document at the repo root.
- A migration guide explaining breaking changes and porting steps.
- New validator logic to enforce the v2.0 rules.

Packs pin `spec_version` in their manifest; tools validate against the spec they support. v1.0 is the initial release.
