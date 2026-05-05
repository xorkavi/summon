# /summon — Component Migration Audit Skill

A Claude Code skill for auditing UI component usage across a product, taking annotated screenshots of every instance, classifying each into its new design system target, and outputting a structured Figma migration table.

## What it does

Given an old design system component (e.g. `Badge`, `Chip`, `IconButton`):

1. Parses a usages file listing every occurrence in the codebase
2. Reads the source code to understand what each usage renders
3. Classifies each into a new component target based on a designer-provided mapping
4. Takes annotated Playwright screenshots (red border around the specific component)
5. Outputs a structured Figma table with all migration decisions

## Installation

### In a repo (recommended for teams)

Copy the skill directory into your repo's `.claude/skills/`:

```bash
cp -r skill/ your-repo/.claude/skills/summon/
cp tools/screenshot-module.ts your-repo/tools/shared/screenshot-module.ts
```

### Per-user

Symlink or copy to your user skills:

```bash
ln -s /path/to/this/repo/skill ~/.claude/skills/summon
```

## Usage

```
/summon Badge
```

Then provide:
1. **Usages file** — text file listing every usage with file path, line, variant, and context
2. **Migration mapping image** — designer-created image showing old → new component routing
3. **New component API** — variants/props the new components support (or screenshots)
4. **Figma link** (optional) — where to output the table

## File Structure

```
skill/
├── SKILL.md                    # The skill definition (Claude Code reads this)
└── references/
    └── repo-context.md         # Pre-computed repo context (route maps, selectors)

tools/
└── screenshot-module.ts        # Persistent Playwright helpers (lives in your repo)
```

## Customization

- **`skill/references/repo-context.md`** — Update the route map and selector patterns for your repo
- **`tools/screenshot-module.ts`** — The screenshot module improves over time as you encounter new edge cases

## Requirements

- Claude Code with skill support
- Playwright installed in the target repo
- Chrome for authentication (one-time CDP cookie extraction)
- Figma Console MCP (for Figma table output)
- A running dev server for the target app
