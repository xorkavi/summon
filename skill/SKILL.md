---
name: summon
description: "Summon every instance of a UI component across the entire product app. Given a component name (e.g. 'input', 'button', 'toggle', 'dropdown', 'modal', 'table'), discovers all use cases and variants, takes Playwright screenshots organized by context/category, and optionally uploads them to Figma with grouping, titles, descriptions, and auto layout. Use for: '/summon input', '/summon button', '/summon dropdown', 'summon all toggles', 'find every modal', 'visual audit of checkboxes', 'screenshot all card variants', 'catalog component usage for redesign'."
---

# Component Migration Audit

Take annotated screenshots of every usage of an OLD design system component, classify each into its NEW component target, and output a structured Figma table with all migration decisions.

---

## Inputs

### Required

1. **Old component name** — e.g. `Badge`, `Chip`, `IconButton`
2. **Usages file** — text file listing every usage with file path, line, variant, props, and context
3. **Migration mapping image** — shows OLD → NEW component routing rules

### Required (ask if not provided)

4. **New component API** — what variants/props do the NEW components support? If not provided, ASK the user: "What variants and props does [Counter/Chip/etc] support in the new design system? I need this to fill the 'new props' column correctly."

### Optional

5. **Figma link** — page URL for output table
6. **App URL** — dev server (default: `http://localhost:4200`)
7. **Org slug** — URL prefix (default: `devrev`)

---

## Architecture: What Lives Where

```
~/.claude/playwright-auth/
├── auth.json                    # CDP-extracted cookies (per-user, NOT committed)
├── chrome-debug-profile/        # Chrome profile for debug session

tools/shared/
├── screenshot-module.ts         # PERSISTENT screenshot module (repo-level, shared with team)

tools/{COMPONENT}-audit/
├── playwright.config.ts         # Playwright config for this audit
├── take-screenshots.ts          # Test script (generated per component)
├── screenshots/                 # Output screenshots organized by target/domain
│   ├── counter/
│   │   ├── imports/
│   │   └── timeline/
│   ├── chip/
│   │   ├── accounts/
│   │   └── fields/
│   └── needs-review/
└── manifest.json                # Structured data for all usages + classifications

tools/pw-extract-cookies.ts      # Cookie extraction script (created once if missing)
```

**Why this split:** Auth cookies are per-user (contain session tokens, live in `~/.claude/`).
The screenshot module is shared code that resolves `@playwright/test` from the repo's `node_modules/`.

---

## Phase 0: Prerequisites (HARD GATE — do ALL before writing tests)

### 0a. Verify dev server is running

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4200 2>/dev/null
```

If not 200, tell the user:
> Dev server needs to be running. Start it with: `pnpm nx serve product`
> Tell me when it's ready.

**Do NOT proceed until confirmed.**

### 0b. Verify auth exists and is valid

```bash
ls -la ~/.claude/playwright-auth/auth.json 2>/dev/null
```

If missing, run the auth setup flow (see [Auth Setup](#auth-setup) below).

If exists, run a **quick validation** (takes <10 seconds, not the full test suite):

Create a tiny validation script `tools/validate-auth.ts`:

```typescript
import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const AUTH_PATH = path.join(os.homedir(), '.claude', 'playwright-auth', 'auth.json');
const BASE = 'http://localhost:4200';
const ORG = 'devrev';

async function validate() {
  const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  await context.addCookies(auth.cookies);
  const page = await context.newPage();

  await page.goto(`${BASE}/${ORG}/works`, { timeout: 30000 });
  await page.waitForTimeout(8000);

  const url = page.url();
  if (url.includes('/login') || url.includes('/signup')) {
    console.log('AUTH_EXPIRED');
    process.exit(1);
  }

  console.log('AUTH_VALID');
  await browser.close();
}

validate().catch(() => { console.log('AUTH_ERROR'); process.exit(1); });
```

Run: `npx tsx tools/validate-auth.ts`

If output is `AUTH_EXPIRED` or `AUTH_ERROR`, run auth setup. If `AUTH_VALID`, proceed.

### 0c. Verify screenshot module exists

```bash
ls -la tools/shared/screenshot-module.ts 2>/dev/null
```

If missing, create it at `tools/shared/screenshot-module.ts` (see [Screenshot Module](#screenshot-module) below). This module lives in the repo, resolves `@playwright/test` from the repo's `node_modules/`, and is shared across all audits and team members.

### 0d. Discover the component's DOM selector

**This is critical.** The DS components use `data-drid` attributes set via `createThemeConfig`:
- Badge renders with `data-drid="badge"` (no explicit drid prop → uses theme config name)
- Chip renders with `data-drid="chip"` (explicit default `drid = 'chip'` in source)

For any component, read its source to find:
1. The `drid` prop default (if set)
2. The `createThemeConfig('name', ...)` call — the first arg becomes the default `data-drid` value

Store this selector for annotation. Example:
```
Badge → [data-drid="badge"]
Chip → [data-drid="chip"]
IconButton → [data-drid="icon-button"]
```

**Test the selector** in the validation page to confirm it matches elements.

### 0e. Gather new component API (ASK USER)

Before writing tests or classifications, you MUST know what the new components support.

Ask:
> "I need the new component API to fill the migration table correctly. For each target component ([Counter], [Chip], etc.):
> - What variants are available?
> - What props are available?
> - Any props removed vs the old component?
> - Any size/shape options?"

**Do NOT guess or assume the new components mirror the old ones.** Wait for the user's answer.

---

## Auth Setup

Only runs if auth is missing or expired. One-time setup.

Tell the user:
> I need to set up authentication for screenshots. Please:
> 1. Run this in a terminal:
>    ```
>    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9333 --user-data-dir="$HOME/.claude/playwright-auth/chrome-debug-profile"
>    ```
> 2. Log in to http://localhost:4200 in that Chrome window
> 3. Tell me when you're logged in

Once confirmed, create `tools/pw-extract-cookies.ts` if it doesn't exist:

```typescript
import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const AUTH_DIR = path.join(os.homedir(), '.claude', 'playwright-auth');
const AUTH_PATH = path.join(AUTH_DIR, 'auth.json');

async function extractAuth() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const cdpSession = await page.context().newCDPSession(page);
  const { cookies: allCookies } = await cdpSession.send('Network.getAllCookies');
  console.log(`CDP extracted ${allCookies.length} total cookies`);

  const playwrightCookies = allCookies.map((c: any) => ({
    name: c.name, value: c.value, domain: c.domain, path: c.path,
    expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
    sameSite: c.sameSite === 'None' ? 'None' as const : c.sameSite === 'Lax' ? 'Lax' as const : 'Strict' as const,
  }));

  const storageState = await context.storageState();
  fs.writeFileSync(AUTH_PATH, JSON.stringify({ cookies: playwrightCookies, origins: storageState.origins }, null, 2));
  console.log(`Saved ${playwrightCookies.length} cookies to ${AUTH_PATH}`);
  browser.close().catch(() => {});
}

extractAuth().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx tools/pw-extract-cookies.ts`

Then validate with `tools/validate-auth.ts`. If valid, proceed. Auth persists until session expires (days/weeks).

---

## Screenshot Module

File: `tools/shared/screenshot-module.ts`

This is the **persistent, battle-tested** screenshot module. Lives in the repo so it resolves `@playwright/test` correctly and is shared with the team. Written ONCE, improved over time — never regenerated per-component.

```typescript
import { Page, BrowserContext } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const AUTH_PATH = path.join(os.homedir(), '.claude', 'playwright-auth', 'auth.json');

// ─── BROWSER MANAGEMENT ───

export async function createAuthenticatedContext(): Promise<{ browser: any; context: BrowserContext; page: Page }> {
  if (!fs.existsSync(AUTH_PATH)) {
    throw new Error(`Auth not found at ${AUTH_PATH}. Run cookie extraction first.`);
  }
  const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await context.addCookies(auth.cookies);
  const page = await context.newPage();
  return { browser, context, page };
}

// ─── ERROR OVERLAY DISMISSAL ───

export async function dismissErrorOverlay(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[class*="RuntimeError"], [class*="runtime-error"]').forEach(el => el.remove());
      document.querySelectorAll('body > div').forEach(el => {
        if (el.textContent?.includes('Uncaught runtime errors')) el.remove();
      });
    });
  } catch {}
}

// ─── PAGE READINESS ───
// Two-stage: (1) page content loaded, (2) no spinners/skeletons visible.
// Returns true ONLY when page is genuinely ready for screenshot.
// Does NOT consider the page ready if only the sidebar loaded but main is empty.

export async function waitForPageReady(page: Page, opts?: { timeout?: number }): Promise<boolean> {
  const timeout = opts?.timeout ?? 45_000;

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});

  let loaded = false;
  try {
    await page.waitForFunction(() => {
      // Stage 1: No visible loading indicators
      const loadingSelectors = [
        '[class*="animate-spin"]', '[class*="spinner"]', '[class*="Spinner"]',
        '[class*="loader"]', '[class*="Loader"]', '[class*="loading-indicator"]',
        '[class*="Skeleton"]', '[class*="skeleton"]',
        '[data-testid*="loading"]', '[data-testid*="skeleton"]'
      ];
      const spinners = document.querySelectorAll(loadingSelectors.join(', '));
      const visibleSpinner = Array.from(spinners).some(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        // Only count spinners in the MAIN content area (not tiny icons in tabs/nav)
        return rect.width > 20 && rect.height > 20;
      });
      if (visibleSpinner) return false;

      // Stage 2: Main content has substance
      const main = document.querySelector('main')
        || document.querySelector('[class*="main-content"]')
        || document.querySelector('[data-testid="main-content"]')
        || document.querySelector('#root');
      if (main) {
        const mainText = (main as HTMLElement).innerText || '';
        if (mainText.length < 100) return false;
      }

      // 404 pages are "ready" (we'll detect and skip them separately)
      if (document.body.innerText?.includes('URL not found')) return true;
      return (document.body.innerText || '').length > 200;
    }, { timeout, polling: 1000 });
    loaded = true;
  } catch {
    loaded = false;
  }

  // Extra settle time for React renders to complete
  await page.waitForTimeout(3000);
  await dismissErrorOverlay(page);
  return loaded;
}

// ─── COMPONENT WAIT ───
// Waits for a specific component to appear in the DOM.
// This is the KEY difference from the old approach — we don't just wait for
// the page, we wait for OUR COMPONENT to actually render.

export async function waitForComponent(page: Page, dridSelector: string, opts?: { timeout?: number; scope?: string }): Promise<boolean> {
  const timeout = opts?.timeout ?? 10_000;
  const scope = opts?.scope ?? 'body';

  try {
    await page.waitForSelector(`${scope} ${dridSelector}`, { timeout, state: 'visible' });
    return true;
  } catch {
    return false;
  }
}

// ─── COMPONENT ANNOTATION ───
// Highlights the target component with a red outline.
// Uses data-drid attribute (the STABLE selector for DS components).
// Returns true if annotation was applied.

export async function annotateComponent(
  page: Page,
  dridSelector: string,
  opts?: { nth?: number; scope?: string }
): Promise<boolean> {
  const nth = opts?.nth ?? 0;
  const scope = opts?.scope ?? 'body';

  try {
    const found = await page.evaluate(({ selector, index, scopeSel }) => {
      const root = scopeSel !== 'body' ? document.querySelector(scopeSel) : document.body;
      if (!root) return false;

      const elements = root.querySelectorAll(selector);
      if (elements.length === 0) return false;

      const target = elements[Math.min(index, elements.length - 1)] as HTMLElement;
      target.style.outline = '3px solid red';
      target.style.outlineOffset = '4px';
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      return true;
    }, { selector: dridSelector, index: nth, scopeSel: scope });

    if (found) await page.waitForTimeout(300);
    return found;
  } catch { return false; }
}

// ─── SAFE SCREENSHOT ───
// The ONLY way to take screenshots. REFUSES to save if:
// - Page shows login/signup redirect
// - Page shows 404
// - Visible spinners in main content area (>20px)
// - Main content is empty (<50 chars)
// Returns file path if saved, null if refused.

export async function takeScreenshot(
  page: Page,
  screenshotsDir: string,
  category: string,
  name: string
): Promise<string | null> {
  await dismissErrorOverlay(page);

  // Check 1: Login redirect
  if (page.url().includes('/login') || page.url().includes('/signup')) {
    console.log(`  ✗ REFUSE ${name}: redirected to login`);
    return null;
  }

  // Check 2: 404
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  if (bodyText.includes('URL not found') || bodyText.includes('Page not found')) {
    console.log(`  ✗ REFUSE ${name}: 404 page`);
    return null;
  }

  // Check 3: Visible spinners (only large ones — small icons in tabs are OK)
  const loadingIssue = await page.evaluate(() => {
    const loadingSelectors = [
      '[class*="animate-spin"]', '[class*="spinner"]', '[class*="Spinner"]',
      '[class*="loader"]', '[class*="Loader"]', '[class*="Skeleton"]', '[class*="skeleton"]'
    ];
    const spinners = document.querySelectorAll(loadingSelectors.join(', '));
    const hasLargeSpinner = Array.from(spinners).some(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
    if (hasLargeSpinner) return 'large-spinner-visible';

    const main = document.querySelector('main')
      || document.querySelector('[class*="main-content"]')
      || document.querySelector('#root');
    if (main && (main as HTMLElement).innerText.length < 50) return 'empty-main';

    return null;
  });

  if (loadingIssue) {
    console.log(`  ✗ REFUSE ${name}: ${loadingIssue}`);
    return null;
  }

  // All checks passed — save
  const dir = path.join(screenshotsDir, category);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✓ SAVED ${name}`);
  return filePath;
}

// ─── INTERACTION HELPERS ───

export async function waitForSidepanel(page: Page, timeout = 10_000): Promise<boolean> {
  try {
    await page.waitForSelector(
      '[class*="sidepanel"], [class*="SidePanel"], [class*="side-panel"], [class*="detail-panel"], [data-testid*="sidepanel"]',
      { timeout, state: 'visible' }
    );
    await page.waitForTimeout(2000);
    return true;
  } catch { return false; }
}

export async function clickFirstDataRow(page: Page): Promise<boolean> {
  const selectors = [
    'main [role="row"]:nth-child(2)',
    'main [role="row"]:not(:first-child)',
    'main table tbody tr:first-child',
    'main [class*="list-item"]:first-of-type',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        return true;
      }
    } catch { continue; }
  }
  return false;
}

export async function waitForModal(page: Page, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForSelector('[role="dialog"], [class*="modal"], [class*="Modal"]', { timeout, state: 'visible' });
    await page.waitForTimeout(1000);
    return true;
  } catch { return false; }
}

export async function safeClick(page: Page, selector: string, opts?: { force?: boolean; timeout?: number }): Promise<boolean> {
  try {
    await page.click(selector, { timeout: opts?.timeout ?? 5000, force: opts?.force });
    await page.waitForTimeout(500);
    return true;
  } catch { return false; }
}

export async function clickText(page: Page, text: string, opts?: { exact?: boolean }): Promise<boolean> {
  try {
    await page.getByText(text, { exact: opts?.exact ?? false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    return true;
  } catch { return false; }
}

export async function clickSidebarItem(page: Page, text: string): Promise<boolean> {
  try {
    const sidebar = page.locator('[class*="sidebar"], nav, [role="navigation"]');
    await sidebar.getByText(text, { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    return true;
  } catch { return false; }
}
```

---

## Phase 1: Parse Inputs & Classify

### 1a. Verify usages still exist

Before anything, grep the codebase to confirm each usage is still present:

```bash
grep -n "Badge\|<Badge" libs/path/to/file.tsx | head -5
```

If a usage no longer exists in the codebase, mark it as `"status": "REMOVED"` in the manifest and skip it. The usages file may be stale.

### 1b. Parse usages file

Read the file. Each entry has:
- Number, file path + line, props/variant, domain group, context description

### 1c. Analyze mapping image

Read the migration mapping image. Extract the routing rules:
- What determines which NEW component a usage maps to?
- What dimensions matter? (content type, interactivity, size, shape, color?)
- What about edge cases the image doesn't explicitly show?
- Are there any usages that remain the same component (just new variant)?

**When edge cases arise** (patterns not clearly covered by the mapping image), collect them and ask the user ONE question covering all ambiguous patterns. Example:
> "The mapping shows X → A and Y → B, but I found 5 usages that are [describe pattern]. Should these map to A or B?"

Do NOT invent classification rules — let the mapping image + user answers be the source of truth.

### 1d. Read source code for each usage — DEEP ANALYSIS

For each usage, read **30+ lines** around the line number. Extract ALL of the following:

1. **What `children` renders** — trace the variable. If it's `{count}`, what is `count`? A number? A formatted string? Dynamic?
2. **Conditional render** — what condition gates this component? (e.g., `count > 0`, `isActive`, `data.length`)
3. **Parent component chain** — what wraps this? A tab label? A table cell? A modal body? A tooltip?
4. **Interaction trigger** — how does the user reach this component? What needs to be clicked/opened?
5. **Annotation scope** — what parent element uniquely contains this specific instance? (e.g., "inside the tab with text 'Linked Items'", "inside the modal with title 'Export Audit Logs'")

The annotation scope is critical for Phase 2 — it's how we'll find THIS specific component among all same-type components on the page.

### 1e. Classify into new components

Based on mapping rules + source analysis:
- Assign each usage to a new component target
- Determine new variant and props using the **user-provided new component API** (Phase 0e)
- Mark ambiguous cases as "Needs Review"

**If the user provided screenshots of the new component's properties panel**, those satisfy Phase 0e. But if any mapping is unclear (e.g., does `variant=accent` map to a specific new variant?), ASK rather than guess.

### 1f. Route resolution — TRACE THE IMPORT CHAIN

Do NOT guess routes from file paths. Instead, **trace the component's import chain up to a route**:

1. Find what imports the file containing the usage:
   ```bash
   grep -r "from.*use-list-tabs" --include="*.tsx" --include="*.ts" libs/ apps/ | head -10
   ```

2. Follow the chain until you reach a component that's mapped to a route in the app's router config.

3. **Read `libs/shared/ui-utils/src/router-paths.ts`** AND the app's route definitions to confirm the URL.

4. **For each usage, determine the full interaction sequence:**
   - **Direct**: Component visible on page load → just navigate
   - **Tab**: Component inside a tab → navigate + `openTab('Tab Name')`
   - **Sidepanel**: Component in detail view → navigate + `clickFirstDataRow()` + `waitForSidepanel()`
   - **Sidepanel tab**: → above + `openTab('Tab Name')` inside panel
   - **Modal**: Component in dialog → navigate + click trigger button + `waitForModal()`
   - **Conditional/data-dependent**: Component only renders with data → mark as `"maySkip": true`
   - **Nested interaction**: Multiple steps → document each step in order

5. **VERIFY at least a sample of routes** by navigating in the running app before writing all 84 tests. Spot-check 3-4 routes manually.

### 1g. Write manifest

**Every usage in the file gets ONE entry. No grouping. No "representative" entries.**

Save `tools/{COMPONENT}-audit/manifest.json`:
```json
[
  {
    "id": 1,
    "file": "libs/accounts/feature/.../use-list-tabs.tsx",
    "line": 86,
    "domain": "Accounts",
    "status": "active",
    "oldVariant": "neutral",
    "oldProps": "variant=neutral",
    "context": "Account sidepanel linked items tab count",
    "childrenType": "number",
    "childrenValue": "linkedItems.length",
    "conditionalRender": "count > 0",
    "newComponent": "Counter",
    "newVariant": "neutral",
    "newProps": "variant=neutral, size=sm",
    "route": "/accounts",
    "interactionSteps": [
      "clickFirstDataRow(page)",
      "waitForSidepanel(page)",
      "openTab(page, 'Linked Items')"
    ],
    "annotationScope": "[data-testid='sidepanel'] [role='tab'][aria-selected='true']",
    "maySkip": false,
    "screenshotCategory": "counter/accounts"
  }
]
```

Key additions vs the old manifest:
- `status` — "active", "REMOVED" (no longer in codebase), "STALE"
- `childrenType` / `childrenValue` — what the component renders
- `conditionalRender` — when it appears
- `interactionSteps` — ordered list of function calls to reach it
- `annotationScope` — parent selector to scope the annotation to THIS instance
- `maySkip` — true if data-dependent and might not render

---

## Phase 2: Write Tests

### NON-NEGOTIABLE: One test per usage

**Every row in the manifest MUST have its own test and its own screenshot. No grouping. No "representative" tests. If the manifest has 84 entries, the script has 84 tests.**

Even if two usages are on the same page, they get separate tests — because they need different annotation scopes and produce different screenshots.

### Test script architecture

**Critical design decisions:**

1. **Each test is FULLY INDEPENDENT** — navigates from scratch, no shared page state
2. **Fresh page per test** — `const page = await context.newPage()` + `finally { page.close() }`
3. **Auth is validated ONCE in beforeAll** — if expired, ALL tests abort immediately (fast-fail)
4. **Component-aware wait** — after page ready, explicitly wait for `[data-drid="component"]`
5. **Scoped annotation** — use `annotationScope` from manifest to target the SPECIFIC instance
6. **Skip diagnostics** — every skip writes reason + URL to a diagnostics log file

### Config: `tools/{COMPONENT}-audit/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'take-screenshots.ts',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4200',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results.json' }]],
});
```

### Test script pattern: `tools/{COMPONENT}-audit/take-screenshots.ts`

```typescript
import { test, Page, BrowserContext } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Import the persistent screenshot module from repo's tools/shared/
import {
  createAuthenticatedContext,
  waitForPageReady,
  waitForComponent,
  annotateComponent,
  takeScreenshot,
  dismissErrorOverlay,
  waitForSidepanel,
  clickFirstDataRow,
  waitForModal,
  safeClick,
  clickText,
  clickSidebarItem,
  openTab,
} from '../shared/screenshot-module';

const COMPONENT = '{COMPONENT}';
const DRID_SELECTOR = '[data-drid="{drid}"]';
const ORG = 'devrev';
const BASE = 'http://localhost:4200';
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');

function url(route: string): string {
  return `${BASE}/${ORG}${route.startsWith('/') ? route : '/' + route}`;
}

// ─── SHARED CONTEXT (auth validated once) ───
let browser: any;
let context: BrowserContext;

test.beforeAll(async () => {
  const result = await createAuthenticatedContext();
  browser = result.browser;
  context = result.context;

  // FAST-FAIL auth validation
  const page = await context.newPage();
  await page.goto(url('/works'), { timeout: 30000 });
  await page.waitForTimeout(8000);
  const currentUrl = page.url();
  await page.close();

  if (currentUrl.includes('/login') || currentUrl.includes('/signup')) {
    await browser.close();
    throw new Error(
      'AUTH_EXPIRED: Session cookies are stale.\n' +
      'Fix: Open Chrome debug (port 9333), log in, re-run pw-extract-cookies.ts'
    );
  }
});

test.afterAll(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
});

// ─── TESTS ───
// Each test gets a FRESH PAGE from the shared context.
// This prevents cascading failures — one test's navigation state never
// pollutes another test.

test.describe(`${COMPONENT} audit`, () => {

  // ─── SKIP DIAGNOSTICS ───
  // Every skip writes to a diagnostics file so we know WHY tests didn't produce screenshots.
  const DIAG_PATH = path.resolve(__dirname, 'diagnostics.json');
  const diagnostics: Array<{ id: number; reason: string; url: string }> = [];

  function logSkip(id: number, reason: string, pageUrl: string) {
    diagnostics.push({ id, reason, url: pageUrl });
    fs.writeFileSync(DIAG_PATH, JSON.stringify(diagnostics, null, 2));
    console.log(`  ⊘ SKIP #${id}: ${reason}`);
  }

  // ─── TEST PER USAGE — NO GROUPING ───
  // Each manifest entry gets its own test. Annotation uses the scoped selector
  // from manifest.annotationScope to find THIS specific instance.

  test('01 — [Domain] [Description]', async () => {
    const page = await context.newPage();
    try {
      // 1. Navigate
      await page.goto(url('/route'), { timeout: 30000 });
      const ready = await waitForPageReady(page);
      if (!ready) { logSkip(1, 'page-not-ready', page.url()); test.skip(); return; }

      // 2. Interaction steps (from manifest.interactionSteps, in order)
      // Each step is verified — if it fails, skip with diagnostic.
      const rowClicked = await clickFirstDataRow(page);
      if (!rowClicked) { logSkip(1, 'clickFirstDataRow-failed', page.url()); test.skip(); return; }
      const panelOpen = await waitForSidepanel(page);
      if (!panelOpen) { logSkip(1, 'waitForSidepanel-failed', page.url()); test.skip(); return; }
      // const tabOpen = await openTab(page, 'Linked Items');
      // if (!tabOpen) { logSkip(1, 'openTab-failed', page.url()); test.skip(); return; }

      // 3. Wait for component within SCOPED parent (not just any instance on page)
      // ANNOTATION_SCOPE narrows to the specific area containing THIS instance.
      const ANNOTATION_SCOPE = '[data-testid="sidepanel"]'; // from manifest.annotationScope
      const componentVisible = await waitForComponent(page, DRID_SELECTOR, { scope: ANNOTATION_SCOPE });

      // 4. Annotate — scoped to the parent, targets nth instance WITHIN that scope
      if (componentVisible) {
        await annotateComponent(page, DRID_SELECTOR, { nth: 0, scope: ANNOTATION_SCOPE });
      }

      // 5. Screenshot (refuses to save garbage)
      const saved = await takeScreenshot(page, SCREENSHOTS_DIR, '{target}/{domain}', '01-description');
      if (!saved) { logSkip(1, 'screenshot-refused', page.url()); }
    } finally {
      await page.close();
    }
  });

  // ... 83 more tests, one per manifest entry, each with its own:
  //   - route from manifest[i].route
  //   - interaction steps from manifest[i].interactionSteps
  //   - annotation scope from manifest[i].annotationScope
  //   - screenshot category from manifest[i].screenshotCategory
});
```

**Key differences from old approach:**
- `const page = await context.newPage()` + `finally { await page.close() }` — FRESH PAGE per test
- `waitForComponent(page, DRID_SELECTOR)` — waits for the actual component, not just page load
- `annotateComponent` uses `[data-drid="..."]` — the stable DS selector, not class name guessing
- Auth validated in `beforeAll` — fast-fail if expired, saves 7+ minutes
- No shared `persistentPage` — eliminates cascading state poisoning

### Running

```bash
npx playwright test --config tools/{COMPONENT}-audit/playwright.config.ts 2>&1 | tail -50
```

---

## Phase 3: Review & Fix

After running, review screenshots:

```bash
ls tools/{COMPONENT}-audit/screenshots/**/*.png | wc -l  # total saved
find tools/{COMPONENT}-audit/screenshots -name "*.png" | head -20  # spot check
```

Read a sample of screenshots to verify quality. Classify:
- **PASS**: Component visible with red annotation
- **PARTIAL**: Right page, annotation missed (component rendered differently)
- **FAIL**: Wrong page, login, loading, 404

For FAILs:
| Issue | Fix |
|-------|-----|
| Login redirect | Auth expired. Re-extract cookies |
| 404 | Wrong route. Grep `router-paths.ts` for correct path |
| Loading/spinner | Add explicit wait for a specific element on the page: `page.waitForSelector('text=Expected Text', { timeout: 15000 })` |
| Component not visible | Needs interaction. Read source to find trigger (button, tab, dropdown) |
| Annotation missed | Component exists but `data-drid` was overridden. Check the source for custom `drid` prop value |
| Empty data (no badge renders) | Data-dependent — mark as SKIP, acceptable |

**Target: 80%+ PASS.** Data-dependent and login-gated components are acceptable SKIPs.

---

## Phase 4: Figma Table Output

Use `figma-console` MCP tools.

### Table layout

```
Page: "{Component} Migration Audit"
└── Section: "{Component} Migration Table"
     └── Frame: "Table Container" (auto layout vertical, gap=0)
           ├── Header Row Frame (auto layout horizontal, padding=12, bg=#F5F5F5)
           │     ├── Text "Component Screenshot" (w=320)
           │     ├── Text "Usage in File and Line" (w=220)
           │     ├── Text "Variant + props (old)" (w=200)
           │     ├── Text "Usage Context" (w=280)
           │     ├── Text "Remapped to component" (w=160)
           │     └── Text "Variant + props (new)" (w=220)
           │
           ├── Domain Header Frame: "[Domain] (N usages)" (full width, bg=#EAEAEA, padding=8)
           │
           ├── Row Frame (auto layout horizontal, gap=12, padding=12, border-bottom)
           │     ├── Image Frame (320x200, image fill with screenshot)
           │     ├── Text "libs/path/file.tsx:42" (font=mono, size=12)
           │     ├── Text "variant=neutral, isRounded, className=px-2"
           │     ├── Text "Bulk test columns, test result status label"
           │     ├── Text "Chip" (font=bold)
           │     └── Text "variant=neutral, size=sm"
           │
           ├── Row Frame ...
           └── ...
```

### Image upload strategy

`figma_set_image_fill` always returns "applied to 0 nodes" in practice. **Skip the direct approach entirely** — always use the two-step hash workaround as the primary path:

```javascript
// Step A: Upload to get hash (use a temp node)
const tempRect = figma.createRectangle();
tempRect.resize(320, 200);
// Apply via figma_set_image_fill to this tempRect...

// Step B: Read the hash and apply to target
const hash = tempRect.fills[0]?.imageHash;
if (hash) {
  const target = await figma.getNodeByIdAsync("TARGET_ID");
  target.fills = [{ type: "IMAGE", scaleMode: "FIT", imageHash: hash }];
}
tempRect.remove();
```

### Auto-layout sizing

**IMPORTANT**: Set `counterAxisSizingMode = "AUTO"` AFTER calling `resize()`, not before. The `resize()` call resets sizing modes.

```javascript
frame.resize(1768, 1); // Set width, minimal height
frame.layoutMode = 'VERTICAL';
frame.counterAxisSizingMode = 'FIXED'; // width fixed
frame.primaryAxisSizingMode = 'AUTO'; // height auto (grows with content)
```

### Batch creation

Create rows in batches of 10-15 via `figma_execute`. Each batch:
1. Gets the parent table frame by ID
2. Creates N row frames with all text nodes
3. Returns the IDs of image rectangles (for filling later)

Then fill images separately (since image upload is async/unreliable).

---

## Hard Rules

### Coverage

1. **ONE test per usage, NO exceptions.** If the manifest has 84 entries, the script has 84 tests. Never "group" or "represent."
2. **Stale usages must be verified** — grep before including. Mark removed usages as REMOVED, don't test them.
3. **New component API is a REQUIRED INPUT** — ask the user or accept attached screenshots. Never guess variants.

### Architecture

4. **Screenshot module is PERSISTENT** — `tools/shared/screenshot-module.ts` is written once and improved over time. Never rewrite it per-component.
5. **Each test is INDEPENDENT** — fresh `page = await context.newPage()`. No shared page state.
6. **Auth is a HARD GATE** — validate before any test writing. Fast-fail in `beforeAll`.
7. **Component selector comes from source** — read `data-drid` or `createThemeConfig` name. Never guess class names.

### Annotation

8. **Annotation MUST be scoped** — use `annotationScope` from manifest. `[data-drid="badge"]` alone matches ALL badges on the page. Scope it to the parent area: sidepanel, modal, tab content, table cell.
9. **Accept approximate annotation** — when the exact instance can't be uniquely targeted, annotate the first instance within the scoped area. Better than no annotation.
10. **Annotate BEFORE screenshot** — red border must be in the saved image.

### Screenshot Quality

11. **NEVER use `page.screenshot()` directly** — always `takeScreenshot()` which refuses garbage.
12. **Two-stage wait**: `waitForPageReady()` → `waitForComponent(page, dridSelector, { scope })`.
13. **Spinner threshold is 20x20px** — small loading icons in tabs don't block screenshots.
14. **Fresh page per test** eliminates cascading state issues.

### Route Resolution

15. **NEVER guess routes from file paths** — trace the import chain up to a route definition. Grep for the component's importers.
16. **Spot-check 3-4 routes manually** before writing all tests — verify they actually show the expected content.
17. **Document full interaction sequence** per usage — route alone is insufficient. Include tab clicks, row clicks, modal triggers.
18. **Data-dependent = acceptable SKIP** — but log the reason to `diagnostics.json`.

### Skip Diagnostics

19. **Every `test.skip()` MUST log** — write `{ id, reason, url }` to `diagnostics.json`. Never skip silently.
20. **After the run, report skip summary** — "X passed, Y skipped (Z data-dependent, W route-failed, V interaction-failed)".

### Figma Output

21. **Set sizing mode AFTER resize** — `resize()` resets modes.
22. **Use `getNodeByIdAsync`** (not `getNodeById`) — async is required.
23. **Batch rows in groups of 10-15** — too many in one execute = timeout.
24. **Image upload: always two-step hash** — `figma_set_image_fill` never works directly. Use hash workaround as primary path.

### Classification Ambiguity

25. **Never guess a mapping** — if the mapping image doesn't clearly cover a usage pattern, mark it "Needs Review" and move on.
26. **Ask the user about edge cases** — if 3+ usages share an ambiguous pattern (e.g., numbers with suffix characters, empty indicator dots, mixed content), ask once for a ruling rather than guessing 3 times.
27. **The mapping image is the source of truth** — don't invent rules that aren't shown in it. If a variant isn't mentioned, it's either 1:1 or needs clarification.

### Repo Context

28. **Read `references/repo-context.md`** at the start of every audit — it contains pre-computed route mappings, DS selector patterns, and interaction recipes for this repo.
29. **DS components use `data-drid` attributes** — always read the component source to find the selector. Pattern: `createThemeConfig('{name}', ...)` → `[data-drid="{name}"]`.

---

## Workflow Summary

```
/summon Badge
   │
   ├─ Phase 0: HARD GATES (all must pass)
   │   ├─ Dev server running? → ask user if not
   │   ├─ Auth valid? → extract cookies if not
   │   ├─ Screenshot module exists? → create if not
   │   ├─ Component DOM selector? → read DS source
   │   └─ New component API? → ASK USER
   │
   ├─ Phase 1: Parse & Classify
   │   ├─ Parse usages file
   │   ├─ Analyze mapping image
   │   ├─ Read source for each usage
   │   ├─ Classify → new component targets
   │   ├─ Resolve routes + interactions
   │   └─ Write manifest.json
   │
   ├─ Phase 2: Write & Run Tests
   │   ├─ Generate take-screenshots.ts
   │   ├─ Run Playwright
   │   └─ Fast-fail if auth expired
   │
   ├─ Phase 3: Review & Fix
   │   ├─ Check screenshot quality
   │   ├─ Fix failed routes/interactions
   │   └─ Re-run until 80%+ pass
   │
   └─ Phase 4: Figma Table
       ├─ Create table structure
       ├─ Fill screenshots (batch + hash workaround)
       └─ Verify layout
```
