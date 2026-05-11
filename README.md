# /summon — Component Migration Audit Skill

A Claude Code skill for auditing UI component usage across a product, taking annotated screenshots of every instance, classifying each into its new design system target, and outputting a structured Figma migration table.

## What it does

Given an old design system component (e.g. `Badge`, `Chip`, `IconButton`):

1. Discovers or parses all usages across the codebase
2. Reads source code to understand what each usage renders
3. Classifies each into a new component target based on a migration mapping
4. Takes annotated Playwright screenshots (red border around the specific component)
5. Outputs a structured Figma table with all migration decisions

## Installation

### Quick setup (recommended)

```bash
git clone https://github.com/xorkavi/summon.git ~/.claude/skills/summon-repo
cd ~/.claude/skills/summon-repo
./setup.sh /path/to/your-repo
```

The setup script:
- Symlinks the skill to `~/.claude/skills/summon` (Claude Code picks it up automatically)
- Copies the screenshot module + Figma layout + DevRev fetcher to your repo's `tools/shared/`
- Checks prerequisites (auth, tokens, Playwright)
- Handles existing installations gracefully (asks before overwriting)

### Without a target repo

If you just want the skill available globally (no repo tools):

```bash
git clone https://github.com/xorkavi/summon.git ~/.claude/skills/summon-repo
cd ~/.claude/skills/summon-repo
./setup.sh
```

### Update to latest

```bash
cd ~/.claude/skills/summon-repo && git pull
./setup.sh /path/to/your-repo  # re-copies tools if updated
```

---

## Usage

### Scenario 1: Full inputs (typical migration audit)

You have the usages file, mapping image, and know the new component API.

```
/summon Chip
```

Then attach:
- **Usages file** (e.g. `Chip.txt`) — file paths + line numbers + context
- **Mapping image** — designer's OLD→NEW routing diagram
- **New component API** — screenshots of Figma properties panel, or text description
- **Figma link** (optional) — where to output the table

### Scenario 2: Discovery mode (no usages file, no mapping)

You just have the component name. You want to understand what exists before making mapping decisions.

```
/summon Toggle
```

The skill will:
1. Grep the codebase for all `<Toggle>` usages
2. Read source around each to understand children, variants, interactivity
3. Cluster into patterns (e.g. "34 numeric counts", "22 status labels", "12 removable chips")
4. Present a discovery report with suggested mapping questions for the designer

Use this **before** the designer creates the mapping — gives them data to inform decisions.

### Scenario 3: Have usages but no mapping

You know where the component is used, but haven't decided the migration yet.

```
/summon Badge
```

Attach only the usages file. The skill will read all usages, cluster them by pattern, and give you enough context to decide the mapping. Then you can provide the mapping and it continues with the full audit.

### Scenario 4: Pull context from a DevRev issue

The issue contains discrepancies, usages, or mapping decisions in its description/comments.

```
/summon Badge ISS-12345
```

The skill fetches the issue via DevRev API (needs `DEVREV_APP_PAT` env var) and extracts:
- Usages mentioned in the issue (supplements or replaces the usages file)
- Mapping overrides ("Badge on settings page should map to Chip not Counter")
- Scope narrowing ("only audit imports module")

### Scenario 5: Screenshots only (no Figma table)

```
/summon Chip — screenshots only
```

Skips Phase 4 (Figma output). Screenshots land in `tools/chip-audit/screenshots/`.

### Scenario 6: Figma table only (from existing manifest)

You already have screenshots and a manifest from a previous run.

```
/summon Chip — figma only from tools/chip-audit/manifest.json
```

### Scenario 7: Resume from previous run

```
/summon Badge — resume
```

The skill checks `tools/badge-audit/` for existing manifest, screenshots, and diagnostics, then picks up where it left off.

---

## What the skill asks for (if you don't provide it)

| Input | If missing, skill will... |
|-------|--------------------------|
| Component name | **Can't proceed** — must be provided |
| Usages file | Grep the codebase to discover all usages |
| Mapping image | Run **discovery mode** — cluster usages and present patterns for decision-making |
| New component API | Ask: "What variants/props does [X] support?" (skipped in discovery mode) |
| Figma link | Skip Figma output, screenshots only |
| DevRev issue | Skip — no issue fetch |
| App URL | Default to `http://localhost:4200` |
| Org slug | Default to `devrev` |

---

## Prerequisites

Before the skill runs any tests:

1. **Dev server running** — `http://localhost:4200` must be accessible
2. **Auth cookies** — one-time setup via Chrome debug port (the skill walks you through it)
3. **Playwright** — must be installed in the target repo
4. **Figma Console MCP** — only needed if outputting to Figma

The skill validates ALL prerequisites before writing tests. If anything is missing, it tells you exactly what to do.

---

## File Structure

```
skill/
├── SKILL.md                        # Skill definition (Claude Code reads this)
└── references/
    └── repo-context.md             # Pre-computed repo context (route maps, DS selectors)

tools/
├── screenshot-module.ts            # Persistent Playwright helpers
├── figma-table-layout.js           # Standardized Figma table layout script
└── fetch-devrev-issue.ts           # DevRev API issue fetcher
```

## Outputs (per component audit)

```
tools/{component}-audit/
├── manifest.json                   # All usages + classifications + routes
├── diagnostics.json                # Skip reasons for failed tests
├── playwright.config.ts            # Playwright config
├── take-screenshots.ts             # Generated test script
└── screenshots/
    ├── {new-component}/
    │   ├── {domain}/
    │   │   ├── 01-description.png
    │   │   └── 02-description.png
    │   └── ...
    └── needs-review/
```

---

## Customization

- **`skill/references/repo-context.md`** — Update the route map and selector patterns for your repo
- **`tools/screenshot-module.ts`** — Improves over time as you encounter new edge cases. Never regenerated per-component.
- **`tools/figma-table-layout.js`** — Standardized table layout. Same structure every run.

---

## DevRev Integration

Requires `DEVREV_APP_PAT` env var (or `DEVREV_PAT`, `DEVREV_TOKEN`, `DEVREV_SVC_ACC_TOKEN`).

```bash
# Test it standalone
npx tsx tools/fetch-devrev-issue.ts ISS-12345
```

Returns `{ title, description, comments[], combinedText }`.

---

## How it works (phases)

| Phase | What happens | Can skip? |
|-------|-------------|-----------|
| 0 | Prerequisites — dev server, auth, screenshot module, DOM selector, new API | No |
| 1 | Parse inputs — verify usages, analyze mapping, read source, classify, resolve routes | No |
| 2 | Write & run Playwright tests — one test per usage, annotated screenshots | No |
| 3 | Review & fix — check screenshot quality, fix failures, re-run | No |
| 4 | Figma table output — standardized layout script | Yes (screenshots-only mode) |
