/**
 * Shared Playwright test helpers for feature 011-responsive-header-fixes.
 *
 * All helpers target `FIRE-Dashboard-Generic.html` loaded via the local
 * file:// protocol. Pure helpers (`rectsIntersect`, `parseRgb`) are synchronous.
 * Page-bound helpers (`loadDashboard`, `setLanguage`, `setSidebarState`,
 * `sampleBackgroundAt`) are async and take a Playwright `Page`.
 *
 * Named exports only. No default export. No test cases in this file.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Language = 'en' | 'zh';
export type SidebarState = 'closed' | 'open';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Absolute file:// URL for the Generic dashboard, resolved at module load.
 * `pathToFileURL` yields a cross-platform URL (handles Windows drive letters
 * and escapes spaces correctly).
 */
const DASHBOARD_URL: string = pathToFileURL(
  path.resolve(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html'),
).href;

/** Time to let CSS transitions and ResizeObserver callbacks settle. */
const SETTLE_MS = 300;

// ---------------------------------------------------------------------------
// Page-bound helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Generic dashboard, clear any persisted state, and reload so
 * the app boots from known-good defaults.
 */
export async function loadDashboard(page: Page): Promise<void> {
  await page.goto(DASHBOARD_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/**
 * Toggle the dashboard language by clicking the visible language button,
 * then wait for layout to settle.
 */
export async function setLanguage(page: Page, language: Language): Promise<void> {
  const selector = language === 'en' ? '#langEN' : '#langZH';
  await page.click(selector);
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Ensure the sidebar is in the requested state. Only clicks `#sidebarToggle`
 * if the current state differs from the target, so repeated calls are
 * idempotent.
 */
export async function setSidebarState(page: Page, state: SidebarState): Promise<void> {
  const isOpen = await page.locator('.sidebar.sidebar--open').count() > 0;
  const shouldBeOpen = state === 'open';

  if (isOpen !== shouldBeOpen) {
    await page.click('#sidebarToggle');
    await page.waitForTimeout(SETTLE_MS);
  }
}

/**
 * Return the computed `background-color` string of whatever element is at the
 * viewport coordinates `(x, y)`, or `null` if no element is hit.
 */
export async function sampleBackgroundAt(
  page: Page,
  x: number,
  y: number,
): Promise<string | null> {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? getComputedStyle(el).backgroundColor : null;
    },
    { x, y },
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Axis-aligned DOMRect intersection test. Returns true iff the two rectangles
 * share at least one interior point. Edge-touching rectangles do NOT count as
 * intersecting (strict inequalities on the non-overlap cases).
 */
export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Parse an `rgb(r, g, b)` or `rgba(r, g, b, a)` CSS color string into a
 * `[r, g, b]` number triple. Alpha is discarded. Returns `[0, 0, 0]` for
 * any string that doesn't match the expected shape.
 */
export function parseRgb(colorString: string): [number, number, number] {
  const match = colorString.match(/rgba?\(([^)]+)\)/);
  if (!match) return [0, 0, 0];

  const parts = match[1]
    .split(',')
    .map((v) => parseFloat(v.trim()))
    .slice(0, 3);

  const [r = 0, g = 0, b = 0] = parts;
  return [r, g, b];
}
