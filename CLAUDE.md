# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Antigravity Kit** (`ui-ux-pro-max-skill`) is an AI-powered design intelligence toolkit providing searchable databases of UI styles, color palettes, font pairings, chart types, UX guidelines, and stack-specific guidelines. It ships as:

- A **skill** for Claude Code (`.claude/skills/ui-ux-pro-max/`)
- Skills for other AI assistants via platform-specific configs
- An **npm CLI** (`uipro-cli`) that installs the skill into any project
- A **Claude Marketplace plugin** (`.claude-plugin/`)

## Search Commands

### Domain Search

```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain> [-n <max_results>]
```

Available domains:

| Domain | File | Description |
|--------|------|-------------|
| `style` | `styles.csv` | UI styles (glassmorphism, brutalism, etc.) + AI prompts, CSS keywords |
| `color` | `colors.csv` | Color palettes by product type (16-token system) |
| `chart` | `charts.csv` | Chart types and library recommendations |
| `landing` | `landing.csv` | Page structure and CTA strategies |
| `product` | `products.csv` | Product type recommendations (SaaS, e-commerce, etc.) |
| `ux` | `ux-guidelines.csv` | Best practices and anti-patterns |
| `typography` | `typography.csv` | Font pairings with Google Fonts imports |
| `icons` | `icons.csv` | Icon recommendations by category |
| `react` | `react-performance.csv` | React-specific performance guidelines |
| `web` | `app-interface.csv` | Web app interface patterns |
| `google-fonts` | `google-fonts.csv` | Full Google Fonts catalog search |

### Stack Search

```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack>
```

Available stacks: `html-tailwind` (default), `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

### Design System Generation

```bash
# Generate inline design system recommendation
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --design-system [-p "Project Name"]

# Persist to file (Master + Overrides pattern)
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist [-p "Project Name"] [--page "dashboard"]
```

Persisted files go to `design-system/<project-slug>/MASTER.md` and optionally `design-system/<project-slug>/pages/<page>.md`.

## Architecture

```
src/ui-ux-pro-max/                # Source of Truth for data, scripts, templates
├── data/                         # Canonical CSV databases
│   ├── styles.csv                # 50+ UI styles with AI prompts and CSS keywords
│   ├── colors.csv                # 161 color palettes (16-token per palette)
│   ├── typography.csv            # 57 font pairings with Google Fonts imports
│   ├── products.csv              # 161 product types with style recommendations
│   ├── charts.csv                # 25 chart types with library recommendations
│   ├── landing.csv               # Landing page patterns and CTA strategies
│   ├── ux-guidelines.csv         # 99 UX best practices and anti-patterns
│   ├── icons.csv                 # Icon recommendations by category
│   ├── react-performance.csv     # React-specific performance guidelines
│   ├── app-interface.csv         # Web app interface patterns
│   ├── google-fonts.csv          # Full Google Fonts catalog (~700KB)
│   ├── ui-reasoning.csv          # UI decision reasoning database
│   ├── design.csv                # Extended design reference
│   ├── draft.csv                 # Work-in-progress design entries
│   ├── _sync_all.py              # Script to sync/derive colors and ui-reasoning from products.csv
│   └── stacks/
│       └── react-native.csv      # React Native stack guidelines (only stack in src/)
├── scripts/
│   ├── search.py                 # CLI entry point (argparse, output formatting)
│   ├── core.py                   # BM25 + regex hybrid search engine (no external deps)
│   └── design_system.py          # Design system generation and persistence
└── templates/
    ├── base/
    │   ├── skill-content.md      # Common SKILL.md content (shared across platforms)
    │   └── quick-reference.md    # Quick reference section (Claude only)
    └── platforms/                # Per-platform JSON configs (17 platforms)
        ├── claude.json, cursor.json, windsurf.json, copilot.json
        ├── kiro.json, roocode.json, codex.json, qoder.json
        ├── gemini.json, trae.json, opencode.json, continue.json
        ├── codebuddy.json, droid.json, agent.json
        └── ...

cli/                              # npm package: uipro-cli (v2.2.3)
├── src/
│   ├── index.ts                  # CLI entry point (commander): init, versions, update
│   ├── commands/
│   │   ├── init.ts               # Install command (GitHub release or bundled assets)
│   │   ├── update.ts             # Update command
│   │   └── versions.ts           # List available versions
│   ├── utils/
│   │   ├── template.ts           # Platform config loader + SKILL.md generator
│   │   ├── detect.ts             # Auto-detect AI assistant type
│   │   ├── extract.ts            # ZIP extraction and file copying
│   │   ├── github.ts             # GitHub release API integration
│   │   └── logger.ts             # CLI output helpers
│   └── types/index.ts            # AIType, PlatformConfig, etc.
└── assets/                       # Bundled assets (~564KB, synced from src/)
    ├── data/                     # Copy of src/ui-ux-pro-max/data/ (all CSVs)
    │   └── stacks/               # All 13 stack CSVs (full set lives here)
    ├── scripts/                  # Copy of src/ui-ux-pro-max/scripts/
    └── templates/                # Copy of src/ui-ux-pro-max/templates/

.claude/skills/                   # Claude Code skills (installed in this repo)
├── ui-ux-pro-max/SKILL.md        # Main design intelligence skill
├── banner-design/                # Banner design skill
├── brand/                        # Brand identity skill
├── design/                       # Unified design skill (logos, CIP, slides, icons)
├── design-system/                # Design token and slide generation skill
├── slides/                       # Presentation slides skill
└── ui-styling/                   # shadcn/ui + Tailwind styling skill

.claude-plugin/                   # Claude Marketplace publishing
├── plugin.json                   # Plugin manifest
└── marketplace.json              # Marketplace metadata (v2.2.1)

docs/                             # Internal documentation
cat-feeding-app/                  # Example app (HTML demo)
preview/                          # Preview HTML files
screenshots/                      # Repository screenshots
```

The search engine uses BM25 ranking combined with regex matching. Domain auto-detection is available when `--domain` is omitted.

## Supported AI Platforms

The CLI (`uipro init --ai <type>`) supports 16 AI assistant types:

| Type | Folder(s) installed |
|------|---------------------|
| `claude` | `.claude/` |
| `cursor` | `.cursor/`, `.shared/` |
| `windsurf` | `.windsurf/`, `.shared/` |
| `antigravity` | `.agent/`, `.shared/` |
| `copilot` | `.github/`, `.shared/` |
| `kiro` | `.kiro/`, `.shared/` |
| `roocode` | `.roo/`, `.shared/` |
| `codex` | `.codex/` |
| `qoder` | `.qoder/`, `.shared/` |
| `gemini` | `.gemini/`, `.shared/` |
| `trae` | `.trae/`, `.shared/` |
| `opencode` | `.opencode/`, `.shared/` |
| `continue` | `.continue/` |
| `codebuddy` | `.codebuddy/` |
| `droid` | `.factory/` |
| `all` | All of the above |

## Sync Rules

**Source of Truth:** `src/ui-ux-pro-max/`

### 1. Data & Scripts — edit in `src/ui-ux-pro-max/`

- `data/*.csv` and `data/stacks/*.csv`
- `scripts/*.py`

> **Note:** `src/ui-ux-pro-max/data/stacks/` only contains `react-native.csv`. The full set of 13 stack CSVs lives in `cli/assets/data/stacks/`. When adding a new stack, add it there.

### 2. Templates — edit in `src/ui-ux-pro-max/templates/`

- `base/skill-content.md` — common SKILL.md content
- `base/quick-reference.md` — quick reference section (Claude only)
- `platforms/*.json` — platform-specific configs

### 3. CLI Assets — sync manually before publishing

```bash
cp -r src/ui-ux-pro-max/data/* cli/assets/data/
cp -r src/ui-ux-pro-max/scripts/* cli/assets/scripts/
cp -r src/ui-ux-pro-max/templates/* cli/assets/templates/
```

### 4. Derived Data — use `_sync_all.py`

When `products.csv` changes (add/rename/delete product types), run:

```bash
python3 src/ui-ux-pro-max/data/_sync_all.py
```

This script keeps `colors.csv` and `ui-reasoning.csv` aligned 1:1 with `products.csv`, deriving color tokens and reasoning entries automatically.

### 5. Reference Folders in User Projects

No manual sync needed. The CLI generates these from templates during `uipro init`.

## CLI Development

The CLI is built with Bun and TypeScript:

```bash
cd cli
bun run dev          # Run from source
bun run build        # Build to dist/ (required before publish)
bun run prepublishOnly  # Runs build automatically
```

**Install flow:**
1. CLI tries to fetch the latest GitHub release ZIP
2. Falls back to bundled `cli/assets/` on network failure or rate limit
3. Generates platform-specific SKILL.md files from templates
4. Copies data and scripts to the target project

## Prerequisites

- Python 3.x (no external dependencies — search engine uses stdlib only)
- Bun (for CLI development and building)

## Git Workflow

Never push directly to `main`. Always:

1. Create a new branch: `git checkout -b feat/...` or `fix/...`
2. Commit changes with clear messages
3. Push branch: `git push -u origin <branch>`
4. Create PR: `gh pr create`

## Key Conventions

- **No Python dependencies** — `core.py` implements BM25 from scratch using stdlib (`csv`, `re`, `math`, `collections`)
- **CSV as database** — all design data lives in CSV files for easy editing and diffing
- **Token-optimized output** — search results are truncated at 300 chars per field to stay within AI context limits
- **Platform configs in JSON** — adding a new AI platform only requires a new `platforms/<name>.json` and entry in `AI_TO_PLATFORM` in `template.ts`
- **Stacks are additive** — each stack CSV contains independent guidelines; search falls back to `html-tailwind` defaults when a stack CSV is missing
