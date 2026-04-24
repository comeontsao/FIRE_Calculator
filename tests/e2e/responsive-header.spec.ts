/**
 * Responsive header layout matrix for feature 011-responsive-header-fixes.
 *
 * Runs a 3 (viewport) x 2 (sidebar) x 2 (language) = 12-cell matrix plus a
 * standalone `compact-sticky preserved across breakpoints` test against the
 * Generic dashboard. Each cell asserts the five header invariants defined in
 * `specs/011-responsive-header-fixes/contracts/playwright-matrix.contract.md`:
 *
 *   A1. Title bounding rectangle <= 2 visual lines.
 *   A2. No word appears isolated on its own line (EN only; zh is skipped per
 *       contract since Chinese text has no space-based word separation).
 *   A3. Title and status pill DOMRects do not intersect.
 *   A4. Header background colour is continuous across the full width.
 *   A5. All four header controls + the Reset button are visible.
 *
 * The spec is chromium-only per `playwright.config.ts`. All helpers are
 * imported from `./helpers`; no page-bound logic is duplicated here.
 */

import { test, expect, type Page } from '@playwright/test';

import {
  loadDashboard,
  parseRgb,
  rectsIntersect,
  sampleBackgroundAt,
  setLanguage,
  setSidebarState,
  type Language,
  type SidebarState,
} from './helpers';

// ---------------------------------------------------------------------------
// Matrix constants
// ---------------------------------------------------------------------------

interface Viewport {
  readonly name: 'phone' | 'tablet' | 'desktop';
  readonly width: number;
  readonly height: number;
}

const viewports: readonly Viewport[] = [
  { name: 'phone', width: 400, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const sidebarStates: readonly SidebarState[] = ['closed', 'open'];
const languages: readonly Language[] = ['en', 'zh'];

/** Time to let layout settle after sequential viewport/state changes. */
const CELL_SETTLE_MS = 300;

/** Max allowed RGB delta per channel when comparing left vs right edge. */
const MAX_RGB_DELTA = 2;

/**
 * Title line-height tolerance epsilon. Caps at 2 visual text lines but allows
 * headroom for font metrics (ascender + descender leading) when the title
 * spans two lines in a serif display face. Anything above ~2.7 would be a
 * genuine third-line wrap.
 */
const MAX_VISUAL_LINES = 2.6;

// ---------------------------------------------------------------------------
// Cell setup
// ---------------------------------------------------------------------------

async function setupCell(
  page: Page,
  viewport: Viewport,
  sidebarState: SidebarState,
  language: Language,
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await loadDashboard(page);
  await setLanguage(page, language);
  await setSidebarState(page, sidebarState);
  // Allow CSS transitions + ResizeObserver callbacks to flush before asserting.
  await page.waitForTimeout(CELL_SETTLE_MS);
}

// ---------------------------------------------------------------------------
// 12-cell matrix
// ---------------------------------------------------------------------------

test.describe('responsive header matrix', () => {
  for (const viewport of viewports) {
    for (const sidebarState of sidebarStates) {
      for (const language of languages) {
        const cellName = `${viewport.name}-sidebar-${sidebarState}-${language}`;

        test(cellName, async ({ page }) => {
          await setupCell(page, viewport, sidebarState, language);

          const titleLocator = page.locator('.header h1');
          const pillLocator = page.locator('#fireStatus');
          const headerLocator = page.locator('#siteHeader');

          // --- A1: title <= 2 visual lines ---------------------------------
          const titleBox = await titleLocator.boundingBox();
          expect(titleBox, 'title bounding box should exist').not.toBeNull();
          if (!titleBox) return;

          const lineHeightPx = await titleLocator.evaluate((el) => {
            const cs = getComputedStyle(el);
            const lh = parseFloat(cs.lineHeight);
            if (Number.isFinite(lh) && lh > 0) return lh;
            const fs = parseFloat(cs.fontSize);
            return 1.2 * (Number.isFinite(fs) ? fs : 16);
          });

          const visualLinesExact = titleBox.height / lineHeightPx;
          expect(visualLinesExact).toBeLessThanOrEqual(MAX_VISUAL_LINES);

          // --- A2: no word-per-line stack (EN only) ------------------------
          if (language !== 'zh') {
            const titleText = await titleLocator.textContent();
            const safeText = (titleText ?? '').trim();
            const wordCount = safeText.length === 0
              ? 0
              : safeText.split(/\s+/).length;
            const visualLines = Math.round(titleBox.height / lineHeightPx);
            expect(wordCount).toBeGreaterThan(visualLines);
          }

          // --- A3: title rect and pill rect do not intersect ---------------
          const pillBox = await pillLocator.boundingBox();
          expect(pillBox, 'pill bounding box should exist').not.toBeNull();
          if (!pillBox) return;
          expect(rectsIntersect(titleBox, pillBox)).toBe(false);

          // --- A4: header background continuous across full width ----------
          const headerBox = await headerLocator.boundingBox();
          expect(headerBox, 'header bounding box should exist').not.toBeNull();
          if (!headerBox) return;

          const yBottom = Math.floor(headerBox.y + headerBox.height - 1);
          const leftColor = await sampleBackgroundAt(page, 1, yBottom);
          const rightColor = await sampleBackgroundAt(
            page,
            viewport.width - 1,
            yBottom,
          );

          expect(leftColor, 'left edge colour should be sampled').not.toBeNull();
          expect(rightColor, 'right edge colour should be sampled').not.toBeNull();

          const [lr, lg, lb] = parseRgb(leftColor ?? '');
          const [rr, rg, rb] = parseRgb(rightColor ?? '');

          expect(Math.abs(lr - rr)).toBeLessThanOrEqual(MAX_RGB_DELTA);
          expect(Math.abs(lg - rg)).toBeLessThanOrEqual(MAX_RGB_DELTA);
          expect(Math.abs(lb - rb)).toBeLessThanOrEqual(MAX_RGB_DELTA);

          // --- A5: all controls visible ------------------------------------
          for (const sel of ['#langEN', '#langZH', '#themeToggle', '#sidebarToggle']) {
            await expect(page.locator(sel)).toBeVisible();
          }
          await expect(
            page.locator('button[data-i18n="btn.resetDefaults"]'),
          ).toBeVisible();
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Compact-sticky preservation
// ---------------------------------------------------------------------------

test('compact-sticky preserved across breakpoints', async ({ page }) => {
  const stickyViewport: Viewport = { name: 'desktop', width: 1440, height: 900 };

  await page.setViewportSize({
    width: stickyViewport.width,
    height: stickyViewport.height,
  });
  await loadDashboard(page);
  await setLanguage(page, 'en');
  await setSidebarState(page, 'closed');
  await page.waitForTimeout(CELL_SETTLE_MS);

  // Scroll past the header sentinel so the compact class flips on.
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(CELL_SETTLE_MS);

  await expect(page.locator('.header.header--compact')).toBeVisible();

  for (const sel of ['#langEN', '#langZH', '#themeToggle', '#sidebarToggle']) {
    await expect(page.locator(sel)).toBeVisible();
  }
  await expect(
    page
      .locator('button')
      .filter({ hasText: /Reset to Defaults|重設為預設值/ }),
  ).toBeVisible();
});
