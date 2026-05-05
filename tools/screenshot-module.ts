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
// Two-stage: (1) page content loaded, (2) no large spinners/skeletons visible.
// Returns true ONLY when page is genuinely ready.
// Spinner threshold: 20x20px — small loading icons in tabs/nav don't block.

export async function waitForPageReady(page: Page, opts?: { timeout?: number }): Promise<boolean> {
  const timeout = opts?.timeout ?? 45_000;

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});

  let loaded = false;
  try {
    await page.waitForFunction(() => {
      const loadingSelectors = [
        '[class*="animate-spin"]', '[class*="spinner"]', '[class*="Spinner"]',
        '[class*="loader"]', '[class*="Loader"]', '[class*="loading-indicator"]',
        '[class*="Skeleton"]', '[class*="skeleton"]',
        '[data-testid*="loading"]', '[data-testid*="skeleton"]'
      ];
      const spinners = document.querySelectorAll(loadingSelectors.join(', '));
      const visibleSpinner = Array.from(spinners).some(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width > 20 && rect.height > 20;
      });
      if (visibleSpinner) return false;

      const main = document.querySelector('main')
        || document.querySelector('[class*="main-content"]')
        || document.querySelector('[data-testid="main-content"]')
        || document.querySelector('#root');
      if (main) {
        const mainText = (main as HTMLElement).innerText || '';
        if (mainText.length < 100) return false;
      }

      if (document.body.innerText?.includes('URL not found')) return true;
      return (document.body.innerText || '').length > 200;
    }, { timeout, polling: 1000 });
    loaded = true;
  } catch {
    loaded = false;
  }

  await page.waitForTimeout(3000);
  await dismissErrorOverlay(page);
  return loaded;
}

// ─── COMPONENT WAIT ───
// Waits for a specific component to appear in the DOM via its data-drid selector.
// Separate from page readiness — page can be "ready" but the component might
// not have rendered yet (data-dependent, needs interaction).

export async function waitForComponent(page: Page, dridSelector: string, opts?: { timeout?: number; scope?: string }): Promise<boolean> {
  const timeout = opts?.timeout ?? 10_000;
  const scope = opts?.scope ?? 'body';

  try {
    const fullSelector = scope === 'body' ? dridSelector : `${scope} ${dridSelector}`;
    await page.waitForSelector(fullSelector, { timeout, state: 'visible' });
    return true;
  } catch {
    return false;
  }
}

// ─── COMPONENT ANNOTATION ───
// Highlights the target component with a red outline (3px solid, 4px offset).
// Uses data-drid attribute — the STABLE selector for DS components.
// `nth` param selects which instance when multiple exist on the page.

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

// Annotate ALL instances of a component on the page
export async function annotateAllComponents(
  page: Page,
  dridSelector: string,
  opts?: { scope?: string }
): Promise<number> {
  const scope = opts?.scope ?? 'body';

  try {
    const count = await page.evaluate(({ selector, scopeSel }) => {
      const root = scopeSel !== 'body' ? document.querySelector(scopeSel) : document.body;
      if (!root) return 0;

      const elements = root.querySelectorAll(selector);
      elements.forEach(el => {
        (el as HTMLElement).style.outline = '3px solid red';
        (el as HTMLElement).style.outlineOffset = '4px';
      });
      return elements.length;
    }, { selector: dridSelector, scopeSel: scope });

    if (count > 0) await page.waitForTimeout(300);
    return count;
  } catch { return 0; }
}

// ─── SAFE SCREENSHOT ───
// The ONLY way to take screenshots. REFUSES to save if:
// - Login/signup redirect detected
// - 404 page detected
// - Large spinners visible (>20px)
// - Main content empty (<50 chars)
// Returns file path if saved, null if refused.

export async function takeScreenshot(
  page: Page,
  screenshotsDir: string,
  category: string,
  name: string
): Promise<string | null> {
  await dismissErrorOverlay(page);

  if (page.url().includes('/login') || page.url().includes('/signup')) {
    console.log(`  ✗ REFUSE ${name}: redirected to login`);
    return null;
  }

  const bodyText = await page.evaluate(() => document.body.innerText || '');
  if (bodyText.includes('URL not found') || bodyText.includes('Page not found')) {
    console.log(`  ✗ REFUSE ${name}: 404 page`);
    return null;
  }

  const issue = await page.evaluate(() => {
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

  if (issue) {
    console.log(`  ✗ REFUSE ${name}: ${issue}`);
    return null;
  }

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

export async function openTab(page: Page, tabText: string): Promise<boolean> {
  try {
    await page.getByRole('tab', { name: tabText }).click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return clickText(page, tabText);
  }
}
