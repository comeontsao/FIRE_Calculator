/**
 * E2E coverage for the UI-only fixes added on 2026-04-29 to feature 018:
 *
 *   (A) Q1 fix — `progressPctRounded` is capped at 99 when `yrsToFire > 0`.
 *       Prevents the contradictory "Needs Optimization … 100% there" verdict
 *       when current net worth exceeds the simple FIRE number but the
 *       gate-based search still requires more years of accumulation.
 *
 *   (B) Slider linkage — Plan→Investment "Monthly Investment" and
 *       Plan→PvI "Extra monthly cash to allocate" are bidirectionally synced.
 *       Driving either slider updates the other's value AND label, then
 *       triggers BOTH `recalcAll()` and `recomputePayoffVsInvest()` once.
 *
 *   (C) Hydration sync — when a saved `_payoffVsInvest.extraMonthly` value
 *       is loaded on page reload, the `monthlySavings` slider mirrors it so
 *       the two never display different numbers on cold load.
 *
 * Both dashboards are exercised in lockstep per Constitution Principle I.
 *
 * Sentinel runs over http://127.0.0.1:8766 (the playwright.config.ts webServer)
 * so the calc/*.js modules resolve through ES-module loading.
 */

import { test, expect, type Page } from '@playwright/test';

const HTTP_BASE = 'http://127.0.0.1:8766';
const SETTLE_MS = 500;

const DASHBOARDS = [
  { key: 'rr',      file: 'FIRE-Dashboard.html' },
  { key: 'generic', file: 'FIRE-Dashboard-Generic.html' },
] as const;

async function loadFresh(page: Page, file: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${file}`);
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

async function setSliderValue(page: Page, id: string, value: number): Promise<void> {
  await page.evaluate(({ id, v }) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) throw new Error(`slider ${id} not found`);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, v: value });
  await page.waitForTimeout(SETTLE_MS);
}

async function setRadio(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) throw new Error(`radio ${id} not found`);
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
  await page.waitForTimeout(SETTLE_MS);
}

async function readSliderState(page: Page) {
  return page.evaluate(() => ({
    msVal:    (document.getElementById('monthlySavings') as HTMLInputElement)?.value,
    pviVal:   (document.getElementById('pviExtraMonthly') as HTMLInputElement)?.value,
    msLabel:  document.getElementById('monthSaveVal')?.textContent,
    pviLabel: document.getElementById('pviExtraMonthlyVal')?.textContent,
  }));
}

// ---------------------------------------------------------------------------
// (A) Q1 — progressPct cap
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test(`Q1: verdict caps at ≤99% when yrsToFire > 0 (${dash.key})`, async ({ page }) => {
    await loadFresh(page, dash.file);

    const fireStatus = await page.evaluate(() => document.getElementById('fireStatus')?.textContent || '');

    // Two ways the verdict surfaces % — the "FIRE in N years" path includes
    // the percentage when yrsToFire <= 12, "Needs Optimization" includes it
    // when 13–18, "Behind Schedule" when > 18. Whichever variant fires, the
    // displayed % MUST NOT be "100" (or "100.0") unless yrsToFire <= 0 — that
    // was the contradictory user-reported bug.
    const yrs = await page.evaluate(() => {
      const w = window as any;
      return Number.isFinite(w.calculatedFireAge) && Number.isFinite(w.fireAge)
        ? Math.max(0, w.fireAge - (w.getInputs ? w.getInputs().ageRoger || w.getInputs().agePerson1 : 0))
        : null;
    });

    // Capture the literal verdict label and the numeric percentage embedded in it.
    const match = fireStatus.match(/(\d+(?:\.\d+)?)%/);
    if (match) {
      const pct = parseFloat(match[1]);
      // Whenever the verdict text is "Needs Optimization" or "Behind Schedule",
      // pct must be <= 99. The only way to legitimately show 100% is when the
      // user is FIRE-feasible today (yrsToFire <= 0).
      if (/Optimization|Behind/i.test(fireStatus) || /優化|落後/.test(fireStatus)) {
        expect(pct,
          `[Q1] verdict text "${fireStatus}" shows ${pct}% — must be capped at 99 when yrsToFire > 0.`)
          .toBeLessThanOrEqual(99);
      }
    }

    // Drive a corner case: aggressively push monthlySavings up so the simple
    // FIRE-number ratio crosses 100% while the gate-based search still wants
    // more years. The cap should still hold.
    await setSliderValue(page, 'monthlySavings', 6000);
    const fireStatusAfter = await page.evaluate(() => document.getElementById('fireStatus')?.textContent || '');
    const matchAfter = fireStatusAfter.match(/(\d+(?:\.\d+)?)%/);
    if (matchAfter && (/Optimization|Behind/i.test(fireStatusAfter) || /優化|落後/.test(fireStatusAfter))) {
      const pct = parseFloat(matchAfter[1]);
      expect(pct,
        `[Q1] after high savings, verdict text "${fireStatusAfter}" shows ${pct}% — must still be capped at 99.`)
        .toBeLessThanOrEqual(99);
    }
  });
}

// ---------------------------------------------------------------------------
// (B) Slider linkage matrix — both directions × both dashboards × multiple values
// ---------------------------------------------------------------------------

const LINKAGE_VALUES = [0, 500, 2000, 3500, 6000];
const LINKAGE_DIRECTIONS = [
  { source: 'monthlySavings',  target: 'pviExtraMonthly',  label: 'monthlySavings → pviExtraMonthly' },
  { source: 'pviExtraMonthly', target: 'monthlySavings',   label: 'pviExtraMonthly → monthlySavings' },
] as const;

for (const dash of DASHBOARDS) {
  for (const dir of LINKAGE_DIRECTIONS) {
    test(`linkage: ${dir.label} (${dash.key})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      await loadFresh(page, dash.file);

      for (const v of LINKAGE_VALUES) {
        await setSliderValue(page, dir.source, v);
        const state = await readSliderState(page);
        const fmt = '$' + v.toLocaleString();
        expect(state.msVal,    `[${dir.label}] $${v}: monthlySavings.value`).toBe(String(v));
        expect(state.pviVal,   `[${dir.label}] $${v}: pviExtraMonthly.value`).toBe(String(v));
        expect(state.msLabel,  `[${dir.label}] $${v}: monthSaveVal.textContent`).toBe(fmt);
        expect(state.pviLabel, `[${dir.label}] $${v}: pviExtraMonthlyVal.textContent`).toBe(fmt);
      }
      expect(errors, `[${dir.label}] console errors: ${errors.join(' | ')}`).toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------
// (C) Hydration sync — saved extraMonthly should populate BOTH sliders on reload
// ---------------------------------------------------------------------------

for (const dash of DASHBOARDS) {
  test(`hydration: saved pvi.extraMonthly populates BOTH sliders on reload (${dash.key})`, async ({ page }) => {
    // Cold load.
    await loadFresh(page, dash.file);

    // Set monthlySavings to a distinctive value via the linked slider — this
    // also writes through to localStorage on the natural saveState path.
    await setSliderValue(page, 'pviExtraMonthly', 4500);

    // Persist whatever shape the dashboard normally writes. On many dashboards
    // saveState fires from the change handlers; we trigger an explicit save via
    // the shared helper if available.
    await page.evaluate(() => {
      const w = window as any;
      if (typeof w._pviSaveState === 'function') w._pviSaveState();
      if (typeof w.saveState === 'function') w.saveState();
    });
    await page.waitForTimeout(SETTLE_MS);

    // Reload — DON'T clear localStorage this time.
    await page.reload();
    await page.waitForFunction(() => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    }, { timeout: 10_000 });

    const after = await readSliderState(page);
    // Both sliders MUST display the persisted value (4500). The hydration
    // path was extended on 2026-04-29 to set monthlySavings whenever pvi.extraMonthly
    // is loaded, so cold-load consistency holds.
    expect(after.pviVal, '[hydration] pviExtraMonthly slider should restore saved value').toBe('4500');
    expect(after.msVal,  '[hydration] monthlySavings slider should mirror saved pvi value').toBe('4500');
    expect(after.pviLabel).toBe('$4,500');
    expect(after.msLabel).toBe('$4,500');
  });
}

// ---------------------------------------------------------------------------
// (D) End-to-end interaction matrix — strategy × slider value, no console errors
// ---------------------------------------------------------------------------

const STRATEGIES = ['pviStrategyPrepay', 'pviStrategyInvestKeep', 'pviStrategyInvestLumpSum'] as const;

for (const dash of DASHBOARDS) {
  test(`matrix: strategy × slider value sweep, no errors (${dash.key})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await loadFresh(page, dash.file);

    for (const strat of STRATEGIES) {
      await setRadio(page, strat);
      for (const value of [500, 2500, 5000]) {
        await setSliderValue(page, 'monthlySavings', value);
        const state = await readSliderState(page);
        // Linkage holds for every cell.
        expect(state.msVal, `cell ${strat} × $${value}: linkage`).toBe(String(value));
        expect(state.pviVal, `cell ${strat} × $${value}: linkage`).toBe(String(value));
        // FireStatus never gets stuck on "Calculating" or NaN.
        const status = await page.evaluate(() => document.getElementById('fireStatus')?.textContent || '');
        expect(status, `cell ${strat} × $${value}: status`).not.toContain('NaN');
        expect(status).not.toContain('Calculating');
      }
    }
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
}
