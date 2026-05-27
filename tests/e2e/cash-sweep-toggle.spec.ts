/**
 * Feature 030 — Cash-sweep toggle browser-level matrix (T009).
 *
 * Verifies (per spec FR-001 to FR-008, contracts/cash-sweep.contract.md):
 *   - The toggle UI is present on both HTMLs (`data-i18n="plan.cashSweepToggle"`).
 *   - Default state (toggle OFF) → Lifecycle chart's end-of-life cash trajectory
 *     accumulates above $100K Book Value (matches pre-feature behavior).
 *   - Toggling ON → end-of-life cash drops below $20K Book Value at age 100
 *     (sweep transferred excess cash to stocks every year).
 *
 * Matrix: 2 HTMLs × 2 toggle states = 4 cases.
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME:
 *   The toggle UI is already wired into both HTMLs by the Frontend Engineer.
 *   The numerical "ON → cash < $20K" assertion depends on Backend Engineer
 *   threading `_applyCashSweep` into the simulators that feed the Lifecycle
 *   chart (`projectFullLifecycle` retirement loop + `calc/accumulateToFire.js`
 *   accumulation loop). Until that integration ships, the toggle-ON cases
 *   will see the same cash trajectory as toggle-OFF and FAIL.
 *
 * Constitution I — runs against BOTH dashboards.
 *
 * Loads over HTTP to match the rest of the e2e suite (playwright.config.ts
 * webServer block starts python -m http.server 8766).
 */

import { test, expect, type Page } from '@playwright/test';

interface DashboardFixture {
  readonly key: 'rr' | 'generic';
  readonly fileName: 'FIRE-Dashboard.html' | 'FIRE-Dashboard-Generic.html';
}

const DASHBOARDS: readonly DashboardFixture[] = [
  { key: 'rr',      fileName: 'FIRE-Dashboard.html' },
  { key: 'generic', fileName: 'FIRE-Dashboard-Generic.html' },
];

const HTTP_BASE = 'http://127.0.0.1:8766';

async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 10_000 },
  );
}

/**
 * Extract the end-of-life cash pool value (Book Value / nominal-$) from the
 * dashboard's exposed simulator. We avoid hover-tooltip reads (timing-flaky
 * across browsers) and instead call `signedLifecycleEndBalance` directly via
 * `page.evaluate` — this is the same simulator the Lifecycle chart uses for
 * its terminal trajectory. The pCash field on its return shape is what the
 * chart's cash series rests at.
 *
 * Returns NaN if the function isn't reachable.
 */
async function readEndOfLifeCash(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const getInputs = w.getInputs as (() => Record<string, number>) | undefined;
    const sim = w.signedLifecycleEndBalance as
      | ((
          inp: Record<string, number>,
          spend: number,
          fireAge: number,
          opts?: object,
        ) => { endBalance: number; pCash?: number; pStocks?: number })
      | undefined;
    if (typeof getInputs !== 'function' || typeof sim !== 'function') {
      return Number.NaN;
    }
    const inp = getInputs();
    const fireAge = typeof inp.fireAge === 'number' ? inp.fireAge : 53;
    const spend = typeof inp.annualSpend === 'number' && inp.annualSpend > 0
      ? inp.annualSpend
      : 73400;
    const out = sim(inp, spend, fireAge);
    // pCash may be on the return object directly OR nested; tolerate both.
    if (out && typeof out.pCash === 'number') return out.pCash;
    return Number.NaN;
  });
}

for (const { key, fileName } of DASHBOARDS) {
  test.describe(`030 cash-sweep-toggle — ${key}`, () => {
    test('toggle UI is present (data-i18n="plan.cashSweepToggle")', async ({ page }) => {
      await loadDashboard(page, fileName);
      const toggle = page.locator('[data-i18n="plan.cashSweepToggle"]');
      await expect(toggle, 'cash-sweep toggle label must be in the DOM').toBeVisible();
      // The toggle's underlying checkbox is #cashSweepEnabled per the
      // contract's UI block (`R-5: UI placement`).
      const checkbox = page.locator('#cashSweepEnabled');
      await expect(checkbox, 'cash-sweep checkbox must exist').toHaveCount(1);
    });

    test('toggle OFF (default) → end-of-life cash above $100K (pre-feature trajectory)', async ({ page }) => {
      await loadDashboard(page, fileName);
      // Default state: checkbox is unchecked. Verify, then read end cash.
      const checkbox = page.locator('#cashSweepEnabled');
      const isChecked = await checkbox.isChecked().catch(() => false);
      expect(isChecked, 'default state must be OFF').toBe(false);

      const endCash = await readEndOfLifeCash(page);
      expect(Number.isFinite(endCash), 'end-of-life cash must be a finite number').toBe(true);
      expect(
        endCash,
        `expected end-of-life cash > $100K under default toggle-OFF; got $${Math.round(endCash)}`,
      ).toBeGreaterThan(100_000);
    });

    test('toggle ON → end-of-life cash below $20K (sweep transferred excess to stocks)', async ({ page }) => {
      await loadDashboard(page, fileName);

      // Click the checkbox to enable sweep.
      const checkbox = page.locator('#cashSweepEnabled');
      await checkbox.check();
      // recalcAll() triggers on the checkbox's onchange. Allow a tick for
      // the calc engine to finish.
      await page.waitForTimeout(500);

      // Sanity: the threshold input becomes visible when toggle is ON.
      const thresholdInput = page.locator('#cashSweepThreshold');
      await expect(thresholdInput, 'threshold input must be visible when ON').toBeVisible();

      const endCash = await readEndOfLifeCash(page);
      expect(Number.isFinite(endCash), 'end-of-life cash must be a finite number').toBe(true);
      // Threshold defaults to $10K (real-$). Allow some headroom for
      // partial-year residual / nominal-vs-real frame display. End-of-life
      // cash should be drastically lower than the toggle-OFF case.
      expect(
        endCash,
        `expected end-of-life cash < $20K under toggle-ON + default $10K threshold; got $${Math.round(endCash)}`,
      ).toBeLessThan(20_000);
    });
  });
}
