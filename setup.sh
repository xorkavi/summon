#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────
# /summon skill setup
# Run once after cloning: ./setup.sh
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

# ─── Step 2: Find the devrev-web repo ───

TARGET_REPO=""

# If user passed a path explicitly, use that
if [ -n "${1:-}" ]; then
  TARGET_REPO="$(cd "$1" 2>/dev/null && pwd || echo "$1")"
  if [ ! -d "$TARGET_REPO" ]; then
    echo "✗ Path not found: $1"
    exit 1
  fi
else
  echo ""
  echo "Looking for devrev-web repo..."

  # Search common locations
  CANDIDATES=()
  SEARCH_DIRS=(
    "$HOME/arcade"
    "$HOME/code"
    "$HOME/repos"
    "$HOME/projects"
    "$HOME/dev"
    "$HOME/work"
    "$HOME/src"
    "$HOME"
  )

  for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      # Find directories named devrev-web that have a package.json with nx
      while IFS= read -r candidate; do
        if [ -f "$candidate/nx.json" ] && [ -d "$candidate/libs/design-system" ]; then
          CANDIDATES+=("$candidate")
        fi
      done < <(find "$dir" -maxdepth 3 -type d -name "devrev-web" 2>/dev/null)
    fi
  done

  # Deduplicate (in case nested search paths overlap)
  UNIQUE_CANDIDATES=()
  declare -A seen
  for c in "${CANDIDATES[@]}"; do
    if [ -z "${seen[$c]:-}" ]; then
      seen[$c]=1
      UNIQUE_CANDIDATES+=("$c")
    fi
  done

  if [ ${#UNIQUE_CANDIDATES[@]} -eq 0 ]; then
    echo "  Could not auto-detect devrev-web repo."
    read -p "  Enter the path to your devrev-web repo: " user_path
    if [ -n "$user_path" ]; then
      TARGET_REPO="$(cd "$user_path" 2>/dev/null && pwd || echo "$user_path")"
      if [ ! -d "$TARGET_REPO" ]; then
        echo "✗ Path not found: $user_path"
        exit 1
      fi
    fi
  elif [ ${#UNIQUE_CANDIDATES[@]} -eq 1 ]; then
    echo "  Found: ${UNIQUE_CANDIDATES[0]}"
    read -p "  Is this your devrev-web repo? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      TARGET_REPO="${UNIQUE_CANDIDATES[0]}"
    else
      read -p "  Enter the correct path: " user_path
      if [ -n "$user_path" ]; then
        TARGET_REPO="$(cd "$user_path" 2>/dev/null && pwd || echo "$user_path")"
      fi
    fi
  else
    echo "  Found multiple devrev-web repos:"
    for i in "${!UNIQUE_CANDIDATES[@]}"; do
      echo "    $((i+1))) ${UNIQUE_CANDIDATES[$i]}"
    done
    echo "    0) Enter a different path"
    read -p "  Which one? [1-${#UNIQUE_CANDIDATES[@]}] " choice
    if [ "$choice" = "0" ]; then
      read -p "  Enter the path: " user_path
      TARGET_REPO="$(cd "$user_path" 2>/dev/null && pwd || echo "$user_path")"
    elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#UNIQUE_CANDIDATES[@]} ]; then
      TARGET_REPO="${UNIQUE_CANDIDATES[$((choice-1))]}"
    else
      echo "✗ Invalid choice"
      exit 1
    fi
  fi
fi

# ─── Step 3: Copy tools to target repo ───

if [ -n "$TARGET_REPO" ] && [ -d "$TARGET_REPO" ]; then
  echo ""
  echo "Target repo: $TARGET_REPO"

  SHARED_DIR="$TARGET_REPO/tools/shared"
  mkdir -p "$SHARED_DIR"

  # Screenshot module
  if [ -f "$SHARED_DIR/screenshot-module.ts" ]; then
    echo "✓ Screenshot module already exists"
    read -p "  Overwrite with latest? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      cp "$TOOLS_DIR/screenshot-module.ts" "$SHARED_DIR/screenshot-module.ts"
      echo "✓ Updated screenshot module"
    fi
  else
    cp "$TOOLS_DIR/screenshot-module.ts" "$SHARED_DIR/screenshot-module.ts"
    echo "✓ Copied screenshot module → tools/shared/"
  fi

  # Figma layout script
  if [ ! -f "$SHARED_DIR/figma-table-layout.js" ]; then
    cp "$TOOLS_DIR/figma-table-layout.js" "$SHARED_DIR/figma-table-layout.js"
    echo "✓ Copied Figma layout script → tools/shared/"
  else
    echo "✓ Figma layout script already exists"
  fi

  # DevRev fetcher
  if [ ! -f "$SHARED_DIR/fetch-devrev-issue.ts" ]; then
    cp "$TOOLS_DIR/fetch-devrev-issue.ts" "$SHARED_DIR/fetch-devrev-issue.ts"
    echo "✓ Copied DevRev fetcher → tools/shared/"
  else
    echo "✓ DevRev fetcher already exists"
  fi
else
  echo ""
  echo "⚠ No target repo selected — skipping tool copy."
  echo "  You can re-run later: ./setup.sh /path/to/devrev-web"
fi

# ─── Step 4: Install dependencies ───

if [ -n "$TARGET_REPO" ] && [ -d "$TARGET_REPO" ]; then
  echo ""
  echo "Checking dependencies..."

  # Detect package manager
  if [ -f "$TARGET_REPO/pnpm-lock.yaml" ]; then
    PKG_MGR="pnpm"
  elif [ -f "$TARGET_REPO/yarn.lock" ]; then
    PKG_MGR="yarn"
  else
    PKG_MGR="npm"
  fi

  MISSING_DEPS=()

  # Check Playwright
  if [ ! -f "$TARGET_REPO/node_modules/@playwright/test/package.json" ]; then
    MISSING_DEPS+=("@playwright/test")
  else
    echo "✓ @playwright/test installed"
  fi

  # Check tsx (for running .ts scripts directly)
  if ! command -v tsx &>/dev/null && [ ! -f "$TARGET_REPO/node_modules/.bin/tsx" ]; then
    MISSING_DEPS+=("tsx")
  else
    echo "✓ tsx available"
  fi

  if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo ""
    echo "  Missing dependencies: ${MISSING_DEPS[*]}"
    read -p "  Install with $PKG_MGR? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      cd "$TARGET_REPO"
      if [ "$PKG_MGR" = "pnpm" ]; then
        pnpm add -D "${MISSING_DEPS[@]}"
      elif [ "$PKG_MGR" = "yarn" ]; then
        yarn add -D "${MISSING_DEPS[@]}"
      else
        npm install -D "${MISSING_DEPS[@]}"
      fi
      echo "✓ Dependencies installed"

      # Install Playwright browsers if Playwright was just added
      if [[ " ${MISSING_DEPS[*]} " =~ " @playwright/test " ]]; then
        echo "  Installing Playwright browsers (chromium)..."
        npx playwright install chromium
        echo "✓ Chromium installed"
      fi
    else
      echo "  Skipped. Install manually:"
      echo "  cd $TARGET_REPO && $PKG_MGR add -D ${MISSING_DEPS[*]}"
    fi
  fi
fi

# ─── Step 5: Check remaining prerequisites ───

echo ""
echo "Checking environment..."

# Auth directory
AUTH_DIR="$HOME/.claude/playwright-auth"
if [ -f "$AUTH_DIR/auth.json" ]; then
  echo "✓ Auth cookies exist (validated at runtime)"
else
  mkdir -p "$AUTH_DIR"
  echo "○ No auth cookies — skill will walk you through login on first run"
fi

# DevRev token
if [ -n "${DEVREV_APP_PAT:-}" ] || [ -n "${DEVREV_PAT:-}" ]; then
  echo "✓ DevRev token found"
else
  echo "○ No DEVREV_APP_PAT — DevRev issue integration won't work"
  echo "  Add to your shell: export DEVREV_APP_PAT=\"your-token\""
fi

# Figma MCP
if command -v figma_get_status &>/dev/null 2>&1; then
  echo "✓ Figma MCP available"
else
  echo "○ Figma Console MCP not detected — Figma output requires it"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete! Use '/summon ComponentName' in Claude Code."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
