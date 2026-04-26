/**
 * file:// loading regression coverage.
 *
 * Constitution Principle V (Zero-Build, Zero-Dependency Delivery, NON-NEGO-
 * TIABLE) requires the dashboards to remain runnable by double-clicking the
 * HTML file directly in a browser — i.e., served from `file://`, not http.
 *
 * This was almost-broken in feature 013 because the initial wiring used
 * `<script type="module">` to load `calc/tabRouter.js`. Chromium silently
 * blocks ESM imports under `file://` CORS, so `window.tabRouter` was never
 * defined and every tab/pill click was a no-op — but the http-based
 * `tab-navigation.spec.ts` (which uses the dev server) was green, hiding it.
 *
 * The fix in `calc/tabRouter.js` switched to a UMD-style classic script that
 * attaches to `window`, plus the HTML uses `<script src="calc/tabRouter.js">`
 * (no `type="module"`). This file locks in the invariant: tabs, pills, and
 * the Next button MUST work when the dashboard is opened via `file://`.
 *
 * If you ever change `calc/tabRouter.js` back to ES modules or move boot to
 * an `import` call, this suite catches it.
 */

import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr',      fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

const SETTLE_MS = 600;

/** Build a `file://` URL for a dashboard, anchored at the repo root. */
function fileUrl(fileName: DashboardFixture['fileName']): string {
  return pathToFileURL(resolve(process.cwd(), fileName)).href;
}

/** Wait for tabRouter init to complete (state set + canonical hash present). */
async function waitForRouterInit(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as any;
      if (!w.tabRouter || typeof w.tabRouter.getState !== 'function') return false;
      const s = w.tabRouter.getState();
      if (!s || !s.tab || !s.pill) return false;
      return /^#tab=(plan|geography|retirement|history|audit)&pill=[a-z][a-z0-9-]*$/.test(
        window.location.hash,
      );
    },
    null,
    { timeout: 10_000 },
  );
}

for (const dash of DASHBOARDS) {
  test.describe(`file:// — ${dash.key} dashboard tabs and pills work without a server`, () => {
    test(`window.tabRouter exists and routing works on file:// (${dash.fileName})`, async ({ page }) => {
      // Surface any silent script-load error so the test fails LOUD.
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => pageErrors.push(e.message));

      await page.goto(fileUrl(dash.fileName));
      await waitForRouterInit(page);
      await page.waitForTimeout(SETTLE_MS);

      // 1. tabRouter is present and initialized.
      const init = await page.evaluate(() => {
        const w = window as any;
        return {
          hasFactory: typeof w.createTabRouter === 'function',
          hasTabs: Array.isArray(w.TABS) && w.TABS.length === 5,
          hasRouter: !!w.tabRouter,
          state: w.tabRouter ? w.tabRouter.getState() : null,
        };
      });
      expect(init.hasFactory, 'window.createTabRouter must be defined on file://').toBe(true);
      expect(init.hasTabs, 'window.TABS must be exposed on file://').toBe(true);
      expect(init.hasRouter, 'window.tabRouter must be created during boot').toBe(true);
      expect(init.state).toEqual({ tab: 'plan', pill: 'profile' });

      // 2. Tab click switches the active tab. This was the user-reported bug.
      await page.click('#tabBar .tab[data-tab="geography"]');
      await page.waitForTimeout(SETTLE_MS);
      const afterTabClick = await page.evaluate(() =>
        (window as any).tabRouter.getState(),
      );
      expect(afterTabClick).toEqual({ tab: 'geography', pill: 'scenarios' });

      // 3. Pill click within the active tab switches the active pill.
      await page.click('.pill[data-tab="geography"][data-pill="healthcare"]');
      await page.waitForTimeout(SETTLE_MS);
      const afterPillClick = await page.evaluate(() =>
        (window as any).tabRouter.getState(),
      );
      expect(afterPillClick).toEqual({ tab: 'geography', pill: 'healthcare' });

      // 4. Next → button click advances exactly one pill.
      await page.click('button.tab[data-tab="plan"]');
      await page.waitForTimeout(SETTLE_MS);
      // The visible Next button is inside the active pill-host (Plan/Profile).
      const nextBtn = page.locator(
        '.pill-host[data-tab="plan"][data-pill="profile"] [data-action="next-pill"]:not([disabled])',
      );
      await expect(nextBtn).toHaveCount(1);
      await nextBtn.click();
      await page.waitForTimeout(SETTLE_MS);
      const afterNextClick = await page.evaluate(() =>
        (window as any).tabRouter.getState(),
      );
      expect(afterNextClick).toEqual({ tab: 'plan', pill: 'assets' });

      // 5. Layout sanity: the Next button must NOT be a stretched grid cell.
      // Regression for the "huge red rectangle" rendering bug. A normal
      // pill-button is well under 400 px wide and well under 80 px tall.
      // Check the (now-active) Plan/Assets pill's Next button.
      const nextBtnAssets = page.locator(
        '.pill-host[data-tab="plan"][data-pill="assets"] [data-action="next-pill"]',
      );
      const box = await nextBtnAssets.boundingBox();
      expect(box, 'Plan/Assets Next button must be in DOM').not.toBeNull();
      expect(
        box!.width,
        `Next button width should be < 400px (got ${Math.round(box!.width)}). ` +
        `Stretching to fill a grid cell means .pill-host's grid is auto-placing it.`,
      ).toBeLessThan(400);
      expect(
        box!.height,
        `Next button height should be < 80px (got ${Math.round(box!.height)}). ` +
        `Stretched height suggests align-self override is missing.`,
      ).toBeLessThan(80);

      // 6. Zero feature-013-specific script errors. Pre-existing calc modules
      // loaded via dynamic `import()` (chartState, inflation, lifecycle, etc.)
      // hit file:// CORS blocks in Chromium — that's a separate concern from
      // this feature, tracked independently. Filter those out and assert no
      // tabRouter-related errors slipped through.
      const allErrors = [...consoleErrors, ...pageErrors];
      const featureErrors = allErrors.filter((e) => {
        // Pre-existing: ignore CORS errors on any other calc/*.js module.
        if (/Access to script at .*\/calc\/(?!tabRouter\b)[^/]+\.js/i.test(e)) return false;
        // Pre-existing: ignore "Failed to load resource" follow-up messages.
        if (/Failed to load resource/i.test(e)) return false;
        return true;
      });
      expect(
        featureErrors,
        `feature-013 script errors on file://: ${featureErrors.join(' | ')}`,
      ).toEqual([]);
    });
  });
}
