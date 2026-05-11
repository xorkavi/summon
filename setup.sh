#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────
# /summon skill setup
# Run once after cloning: ./setup.sh [target-repo-path]
# ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$SCRIPT_DIR/skill"
TOOLS_DIR="$SCRIPT_DIR/tools"
CLAUDE_SKILLS="$HOME/.claude/skills"

echo "Setting up /summon skill..."
echo ""

# ─── Step 1: Symlink skill to Claude Code ───

mkdir -p "$CLAUDE_SKILLS"

if [ -L "$CLAUDE_SKILLS/summon" ]; then
  existing=$(readlink "$CLAUDE_SKILLS/summon")
  if [ "$existing" = "$SKILL_DIR" ]; then
    echo "✓ Skill already linked at ~/.claude/skills/summon"
  else
    echo "⚠ Existing symlink points to: $existing"
    read -p "  Replace with this repo? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rm "$CLAUDE_SKILLS/summon"
      ln -s "$SKILL_DIR" "$CLAUDE_SKILLS/summon"
      echo "✓ Symlink updated"
    else
      echo "  Skipped."
    fi
  fi
elif [ -d "$CLAUDE_SKILLS/summon" ]; then
  echo "⚠ ~/.claude/skills/summon exists as a directory (not a symlink)"
  read -p "  Replace with symlink to this repo? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$CLAUDE_SKILLS/summon"
    ln -s "$SKILL_DIR" "$CLAUDE_SKILLS/summon"
    echo "✓ Replaced with symlink"
  else
    echo "  Skipped."
  fi
else
  ln -s "$SKILL_DIR" "$CLAUDE_SKILLS/summon"
  echo "✓ Linked skill → ~/.claude/skills/summon"
fi

# ─── Step 2: Copy screenshot module to target repo (optional) ───

TARGET_REPO="${1:-}"

if [ -n "$TARGET_REPO" ]; then
  TARGET_REPO="$(cd "$TARGET_REPO" 2>/dev/null && pwd || echo "$TARGET_REPO")"

  if [ ! -d "$TARGET_REPO" ]; then
    echo "✗ Target repo not found: $TARGET_REPO"
    exit 1
  fi

  SHARED_DIR="$TARGET_REPO/tools/shared"
  mkdir -p "$SHARED_DIR"

  if [ -f "$SHARED_DIR/screenshot-module.ts" ]; then
    echo "✓ Screenshot module already exists at $SHARED_DIR/screenshot-module.ts"
    read -p "  Overwrite with latest? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      cp "$TOOLS_DIR/screenshot-module.ts" "$SHARED_DIR/screenshot-module.ts"
      echo "✓ Updated screenshot module"
    fi
  else
    cp "$TOOLS_DIR/screenshot-module.ts" "$SHARED_DIR/screenshot-module.ts"
    echo "✓ Copied screenshot module → $SHARED_DIR/screenshot-module.ts"
  fi

  # Copy figma layout script
  if [ ! -f "$SHARED_DIR/figma-table-layout.js" ]; then
    cp "$TOOLS_DIR/figma-table-layout.js" "$SHARED_DIR/figma-table-layout.js"
    echo "✓ Copied Figma layout script → $SHARED_DIR/figma-table-layout.js"
  fi

  # Copy DevRev fetcher
  if [ ! -f "$SHARED_DIR/fetch-devrev-issue.ts" ]; then
    cp "$TOOLS_DIR/fetch-devrev-issue.ts" "$SHARED_DIR/fetch-devrev-issue.ts"
    echo "✓ Copied DevRev fetcher → $SHARED_DIR/fetch-devrev-issue.ts"
  fi
else
  echo ""
  echo "  Tip: pass your repo path to also copy the tools:"
  echo "  ./setup.sh /path/to/your-repo"
fi

# ─── Step 3: Check prerequisites ───

echo ""
echo "Checking prerequisites..."

# Auth directory
AUTH_DIR="$HOME/.claude/playwright-auth"
if [ -f "$AUTH_DIR/auth.json" ]; then
  echo "✓ Auth cookies exist (may be expired — skill validates at runtime)"
else
  mkdir -p "$AUTH_DIR"
  echo "○ No auth cookies yet — skill will walk you through setup on first run"
fi

# DevRev token
if [ -n "${DEVREV_APP_PAT:-}" ] || [ -n "${DEVREV_PAT:-}" ]; then
  echo "✓ DevRev token found"
else
  echo "○ No DEVREV_APP_PAT set — DevRev issue integration won't work until configured"
fi

# Playwright (check in target repo if provided)
if [ -n "$TARGET_REPO" ]; then
  if [ -f "$TARGET_REPO/node_modules/.bin/playwright" ] || [ -f "$TARGET_REPO/node_modules/@playwright/test/package.json" ]; then
    echo "✓ Playwright installed in target repo"
  else
    echo "○ Playwright not found in target repo — install with: pnpm add -D @playwright/test"
  fi
fi

echo ""
echo "Done! Use '/summon ComponentName' in Claude Code."
