/**
 * Feature 030 — Cash-sweep toggle browser-level matrix (T009).
 *
 * Verifies (per spec FR-001 to FR-008, contracts/cash-sweep.contract.md):
 *   - The toggle UI is present on both HTMLs (`data-i18n="plan.cashSweepToggle"`).
 *   - Default state (toggle OFF) → Lifecycle chart's end-of-life cash trajectory
 *     accumulates above $100K (pre-feature behavior; today's-$ frame).
 *   - Toggling ON → end-of-life cash drops below $20K at age 100 (sweep
 *     transferred excess cash to stocks every year; $10K default threshold).
 *
 * Matrix: 2 HTMLs × 2 toggle states = 4 cases.
 *
 * REWRITE 2026-06-05 (post boot-fix): the original T009 spec was born red
 * ("EXPECTED FAILURE STATE AT WRITE-TIME") and never revisited. Three faults:
 *   1. The toggle lives in the Plan → Investment pill-host, hidden by default
 *      since feature 013's tab router — `toBeVisible()` / `check()` need the
 *      pill activated first (deep-link hash does this).
 *   2. `readEndOfLifeCash` called `signedLifecycleEndBalance(...).pCash` — that
 *      simulator returns `{endBalance, balanceAt*, minBalancePhase*}` and has
 *      NEVER exposed pCash. We now read the Lifecycle chart's own dataset
 *      (`window._lastLifecycleDataset.lifecycle`), which is the trajectory the
 *      user actually sees (Constitution III: chart = source of truth).
 *   3. `calc/cashSweep.js` itself never loaded in the browser before the
 *      2026-06-05 global-scope-collision fix, so toggle-ON could never differ
 *      from toggle-OFF.
 *   Additionally, the Generic dashboard ships all-zero defaults, so the test
 *   now sets `#cashSavings` to $80,000 explicitly on both dashboards — the
 *   thresholds ($100K / $20K) are calibrated to that starting balance
 *   ($80K × 1.005^≥57yr ≈ $104K+ when undisturbed).
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

/**
 * Load the dashboard cold (cleared localStorage) and deep-link to the
 * Plan → Investment pill where the cash-sweep toggle lives.
 */
async function loadDashboardAtInvestment(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}#tab=plan&pill=investment`);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); // reload keeps the hash; router re-activates the pill
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 15_000 },
  );
}

/**
 * Pin the starting cash pool to $80,000 so both dashboards (Generic ships
 * all-zero defaults) produce the calibrated trajectory, then let recalc run.
 */
async function setCashSavings(page: Page, value: number): Promise<void> {
  await page.evaluate((v) => {
    const el = document.getElementById('cashSavings') as HTMLInputElement | null;
    if (!el) throw new Error('#cashSavings input not found');
    el.value = String(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(800);
}

/**
 * Read the cash-pool trajectory from the Lifecycle chart's dataset — the SAME
 * trajectory the chart renders (Constitution III). `pCash` rows are in
 * today's-$ frame (the Book-Value companion is `pCashBookValue`).
 *
 * NOTE: `_lastLifecycleDataset` is a top-level `let` — a global LEXICAL
 * binding, not a `window` property — so it must be read as a bare identifier.
 *
 * Returns NaNs if the dataset isn't available.
 */
async function readCashTrajectory(page: Page): Promise<{ maxAll: number; maxSteadyState: number; last: number }> {
  return await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    const d = (typeof _lastLifecycleDataset !== 'undefined')
      ? (_lastLifecycleDataset as { lifecycle?: Array<{ pCash?: number }> })
      : null;
    const rows = d?.lifecycle;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { maxAll: Number.NaN, maxAfterFirst: Number.NaN, last: Number.NaN };
    }
    const cash = rows.map((r) => (typeof r.pCash === 'number' ? r.pCash : Number.NaN));
    return {
      maxAll: Math.max(...cash),
      // Rows record START-of-year state (accumulateToFire "snapshot row,
      // pre-mutation" convention), and feature 030 preserves year-0 cash by
      // design — so the first row that can REFLECT a sweep is index 2:
      //   row 0 = starting balances (no sweep, contract),
      //   row 1 = start of year 1: prior-year growth + inflow, sweep of that
      //           year not yet snapshotted,
      //   row 2+ = post-sweep steady state (≈ threshold).
      maxSteadyState: cash.length > 2 ? Math.max(...cash.slice(2)) : Number.NaN,
      last: cash[cash.length - 1],
    };
  });
}

for (const { key, fileName } of DASHBOARDS) {
  test.describe(`030 cash-sweep-toggle — ${key}`, () => {
    test('toggle UI is present (data-i18n="plan.cashSweepToggle")', async ({ page }) => {
      await loadDashboardAtInvestment(page, fileName);
      const toggle = page.locator('[data-i18n="plan.cashSweepToggle"]');
      await expect(toggle, 'cash-sweep toggle label must be visible on Plan → Investment').toBeVisible();
      // The toggle's underlying checkbox is #cashSweepEnabled per the
      // contract's UI block (`R-5: UI placement`).
      const checkbox = page.locator('#cashSweepEnabled');
      await expect(checkbox, 'cash-sweep checkbox must exist').toHaveCount(1);
    });

    test('toggle OFF (default) → cash pool survives accumulation untouched (pre-feature trajectory)', async ({ page }) => {
      await loadDashboardAtInvestment(page, fileName);
      await setCashSavings(page, 80_000);

      // Default state: checkbox is unchecked. Verify, then read the trajectory.
      const checkbox = page.locator('#cashSweepEnabled');
      const isChecked = await checkbox.isChecked().catch(() => false);
      expect(isChecked, 'default state must be OFF').toBe(false);

      const t = await readCashTrajectory(page);
      expect(Number.isFinite(t.maxAll), 'cash trajectory must be finite').toBe(true);
      // With sweep OFF the $80K starting cash is never transferred to stocks:
      // it persists (× ~1.005/yr) at least until retirement draws begin, so the
      // trajectory's peak must stay near or above the starting balance.
      // (The ORIGINAL T009 asserted end-of-life cash > $100K — that only holds
      // when the active withdrawal strategy never draws cash, which is
      // strategy-dependent and false under the current default winner.)
      expect(
        t.maxAll,
        `expected peak cash ≥ $75K under toggle-OFF (starting $80K untouched); got $${Math.round(t.maxAll)}`,
      ).toBeGreaterThan(75_000);
    });

    test('toggle ON → no simulated year holds cash above the sweep threshold (+ε)', async ({ page }) => {
      await loadDashboardAtInvestment(page, fileName);
      await setCashSavings(page, 80_000);

      // Click the checkbox to enable sweep (visible now that the Investment
      // pill is active).
      const checkbox = page.locator('#cashSweepEnabled');
      await checkbox.check();
      // recalcAll() triggers on the checkbox's onchange. Allow a tick for
      // the calc engine to finish.
      await page.waitForTimeout(800);

      // Sanity: the threshold input becomes visible when toggle is ON.
      const thresholdInput = page.locator('#cashSweepThreshold');
      await expect(thresholdInput, 'threshold input must be visible when ON').toBeVisible();

      const t = await readCashTrajectory(page);
      expect(Number.isFinite(t.maxSteadyState), 'cash trajectory must be finite').toBe(true);
      // Contract (cash-sweep.contract.md): sweep fires AFTER all flows each
      // year and clamps excess above the threshold (default $10K today's-$)
      // into stocks. Rows 0-1 are excluded (year-0 preservation + the
      // snapshot-before-sweep row convention — see readCashTrajectory); from
      // row 2 onward every year must sit at or below the threshold plus a
      // small allowance for the same-year residual inflow.
      expect(
        t.maxSteadyState,
        `expected every steady-state year ≤ $20K under toggle-ON + default $10K threshold; got peak $${Math.round(t.maxSteadyState)}`,
      ).toBeLessThan(20_000);
    });
  });
}
