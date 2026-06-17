/**
 * E2E coverage for feature 034 — Year Tax Estimator (task T021).
 *
 * The estimator is a single-year federal-tax "what-if" lens at the bottom of
 * the Withdrawal Strategy pill (Retirement tab) in the RR dashboard ONLY
 * (`FIRE-Dashboard.html`). The pure module `calc/taxEstimator.js` loads in
 * BOTH dashboards, but only RR carries the UI block (`#teCard`). Generic
 * regression (module loads, no UI, no console errors) is asserted separately.
 *
 * This spec asserts (per spec.md US1–US3 + SC-004):
 *   1. The `#teCard` block renders on the Withdrawal Strategy pill with
 *      non-empty / non-NaN input values.
 *   2. Changing `#teYear` repopulates the editable input fields.
 *   3. Edit-then-Reset round-trips an input back to its auto-pulled value.
 *   4. CRITICAL (SC-004 / FR-002) — after a sequence of estimator edits, the
 *      plan/Lifecycle figures are UNCHANGED (no write-back to the plan).
 *
 * Conventions follow `tests/e2e/strategy-aware-pill.spec.ts` and
 * `tests/e2e/tab-navigation.spec.ts`:
 *   - Loads over HTTP (`http://127.0.0.1:8766`) so `calc/*.js` modules resolve
 *     (Chromium blocks ES-module + classic-script resolution on file://).
 *   - Clean localStorage + reload, then wait until `#fireStatus` has computed
 *     (no "Calculating…") before any assertion.
 *   - Chromium-only via `playwright.config.ts`.
 *
 * Calc-engine numbers are NOT asserted here — only DOM state, repopulation,
 * round-trip identity, and the no-write-back invariant. The estimator's own
 * arithmetic is covered by `tests/unit/taxEstimator.test.js`.
 *
 * RR-only: per FR-001 the Generic dashboard has no `#teCard`, so the
 * interactive tests run only against `FIRE-Dashboard.html`. A small Generic
 * guard test asserts the block is absent there.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches `playwright.config.ts > webServer` (python -m http.server 8766). */
const HTTP_BASE = 'http://127.0.0.1:8766';

const RR_FILE = 'FIRE-Dashboard.html';
const GENERIC_FILE = 'FIRE-Dashboard-Generic.html';

/** Let recalc / chart paint / estimator repaint settle after an interaction. */
const SETTLE_MS = 400;

/** The six editable estimator inputs, in DOM order. */
const TE_INPUT_IDS = [
  'teOtherOrdinary',
  'teTradWithdrawal',
  'teRothConversion',
  'teLtcg',
  'teStdDed',
  'teLtcg0Ceiling',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a dashboard with clean localStorage, reload from defaults, and
 * wait until the plan has finished its first compute (`#fireStatus` no longer
 * reads "Calculating…"). Mirrors the load+wait pattern in the other E2E specs.
 */
async function loadDashboard(page: Page, fileName: string): Promise<void> {
  await page.goto(`${HTTP_BASE}/${fileName}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('fireStatus');
      return el != null && el.textContent != null && !el.textContent.includes('Calculating');
    },
    { timeout: 15_000 },
  );
}

/**
 * Activate Retirement → Year Tax Estimator so the `#teCard` block lays out.
 * Uses the same tab-bar / pill-bar selectors as `tab-navigation.spec.ts`.
 * The estimator now lives in its own `data-pill="year-tax"` sub-section
 * (between Withdrawal Strategy and Drawdown), so it is rendered once that
 * pill is active.
 */
async function openWithdrawalPill(page: Page): Promise<void> {
  await page.click('#tabBar .tab[data-tab="retirement"]');
  await page.waitForTimeout(SETTLE_MS / 2);
  await page.click('.pill[data-tab="retirement"][data-pill="year-tax"]');
  await page.waitForTimeout(SETTLE_MS);
  // The estimator paints on the recalc/tab-render path; wait until the year
  // picker has at least one option (proves renderYearTaxEstimator ran).
  await page.waitForFunction(
    () => {
      const sel = document.getElementById('teYear') as HTMLSelectElement | null;
      return sel != null && sel.options.length > 0;
    },
    { timeout: 10_000 },
  );
}

/** Read the numeric value of an estimator input by id. */
async function readInput(page: Page, id: string): Promise<number> {
  const raw = await page.locator(`#${id}`).inputValue();
  return Number(raw);
}

/** Read the trimmed text of an element (or null if absent). */
async function readText(page: Page, selector: string): Promise<string | null> {
  const loc = page.locator(selector);
  if ((await loc.count()) === 0) return null;
  return (await loc.first().innerText()).trim();
}

// ---------------------------------------------------------------------------
// US-foundational / US3 — block renders with populated inputs
// ---------------------------------------------------------------------------

test.describe('034 year-tax-estimator — RR render & inputs', () => {
  test('block renders on Withdrawal Strategy pill with non-empty, non-NaN inputs', async ({ page }) => {
    await loadDashboard(page, RR_FILE);
    await openWithdrawalPill(page);

    // The block exists and is visible.
    const card = page.locator('#teCard');
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();

    // Persistent no-sync caption is present (FR-003).
    await expect(page.locator('#teCaption')).toBeVisible();

    // Year picker has options (retirement years).
    const yearOptionCount = await page.locator('#teYear option').count();
    expect(yearOptionCount, 'year picker must offer at least one retirement year').toBeGreaterThan(0);

    // Every editable input holds a finite number (not blank, not NaN). The
    // auto-pull seeds these from the projection on cold load.
    for (const id of TE_INPUT_IDS) {
      const raw = await page.locator(`#${id}`).inputValue();
      expect(raw, `#${id} must not be blank`).not.toBe('');
      const num = Number(raw);
      expect(Number.isFinite(num), `#${id} value "${raw}" must be a finite number`).toBe(true);
    }
  });

  test('changing the year repopulates the input fields', async ({ page }) => {
    await loadDashboard(page, RR_FILE);
    await openWithdrawalPill(page);

    const yearSelect = page.locator('#teYear');
    const optionValues = await yearSelect.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value),
    );
    expect(optionValues.length, 'year picker must offer at least one retirement year').toBeGreaterThan(0);

    const firstYear = await yearSelect.inputValue();

    if (optionValues.length >= 2) {
      // MULTI-YEAR CASE — selecting a different year must re-seed at least one
      // auto-pulled input (income/gains differ across the retirement horizon;
      // the inflation-indexed settings also re-inflate per year).
      const before: Record<string, number> = {};
      for (const id of TE_INPUT_IDS) before[id] = await readInput(page, id);

      // Pick the option furthest from the first so projected figures differ
      // the most.
      const otherYear = optionValues[optionValues.length - 1] !== firstYear
        ? optionValues[optionValues.length - 1]
        : optionValues.find((v) => v !== firstYear)!;
      await yearSelect.selectOption(otherYear);
      await page.waitForTimeout(SETTLE_MS);

      expect(await yearSelect.inputValue()).toBe(otherYear);

      const after: Record<string, number> = {};
      for (const id of TE_INPUT_IDS) after[id] = await readInput(page, id);

      const changed = TE_INPUT_IDS.some((id) => after[id] !== before[id]);
      expect(
        changed,
        `expected at least one input to repopulate when year changed ` +
          `${firstYear}→${otherYear}; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      ).toBe(true);

      // Repopulated values stay finite (FR-023 — no NaN/blank).
      for (const id of TE_INPUT_IDS) {
        expect(Number.isFinite(after[id]), `#${id} must stay finite after year change`).toBe(true);
      }
      return;
    }

    // SINGLE-YEAR CASE — on default RR inputs FIRE age == plan age yields one
    // retirement year, so there is no second year to compare against. We still
    // exercise the repopulation/auto-pull code path: edit an input, re-select
    // the SAME year, and confirm the picker drives a re-seed (the edit is
    // discarded back to the auto-pulled value) with finite values throughout.
    const seeded = await readInput(page, 'teTradWithdrawal');
    const probe = page.locator('#teTradWithdrawal');
    await probe.fill(String(seeded + 12_345));
    await probe.dispatchEvent('input');
    await page.waitForTimeout(SETTLE_MS / 2);

    // Re-select the (only) year — fires the picker's change handler, which
    // re-pulls + re-seeds for the selected year.
    await yearSelect.selectOption(firstYear);
    await page.waitForTimeout(SETTLE_MS);

    expect(
      await readInput(page, 'teTradWithdrawal'),
      're-selecting the year must re-seed the input to its auto-pulled value',
    ).toBe(seeded);
    for (const id of TE_INPUT_IDS) {
      expect(Number.isFinite(await readInput(page, id)), `#${id} must stay finite`).toBe(true);
    }
  });

  test('edit-then-Reset round-trips an input back to its auto-pulled value', async ({ page }) => {
    await loadDashboard(page, RR_FILE);
    await openWithdrawalPill(page);

    const target = page.locator('#teTradWithdrawal');
    const original = await readInput(page, 'teTradWithdrawal');

    // Edit to a clearly different value.
    const edited = original + 25_000;
    await target.fill(String(edited));
    await target.dispatchEvent('input');
    await page.waitForTimeout(SETTLE_MS / 2);
    expect(await readInput(page, 'teTradWithdrawal')).toBe(edited);

    // Reset must restore the auto-pulled value for the selected year (FR-006).
    await page.locator('#teReset').click();
    await page.waitForTimeout(SETTLE_MS);

    expect(
      await readInput(page, 'teTradWithdrawal'),
      'Reset must restore the auto-pulled value',
    ).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// SC-004 / FR-002 — estimator edits MUST NOT write back to the plan
// ---------------------------------------------------------------------------

test.describe('034 year-tax-estimator — no write-back (SC-004)', () => {
  test('a sequence of estimator edits leaves plan/Lifecycle figures unchanged', async ({ page }) => {
    await loadDashboard(page, RR_FILE);

    // Capture stable plan figures BEFORE touching the estimator. These are
    // header KPIs + the plan verdict, all derived from the plan/recalc path —
    // if the estimator wrongly called recalcAll() or wrote shared/plan state,
    // at least one of these would change. We capture three independent
    // anchors so a single coincidental match cannot hide a regression:
    //   - #fireStatus  — the plan verdict ("On Track — FIRE at N", etc.)
    //   - #ikpiFIRENum — the FIRE Number KPI (plan-derived)
    //   - #ikpiNetWorth — the Current Net Worth KPI (plan-derived)
    // We also snapshot a serialized copy of the plan inputs via getInputs()
    // (the source of truth the chart renders from) for a byte-for-byte check.
    const beforeStatus = await readText(page, '#fireStatus');
    const beforeFireNum = await readText(page, '#ikpiFIRENum');
    const beforeNetWorth = await readText(page, '#ikpiNetWorth');
    const beforeInputs = await page.evaluate(() => {
      const w = window as unknown as { getInputs?: () => unknown };
      return typeof w.getInputs === 'function' ? JSON.stringify(w.getInputs()) : null;
    });
    expect(beforeStatus, '#fireStatus must have computed before edits').not.toBeNull();
    expect(beforeInputs, 'getInputs() must be available to snapshot plan state').not.toBeNull();

    // Now open the estimator and perform a sequence of edits: raise the
    // Traditional withdrawal and the realized LTCG, then change the year.
    await openWithdrawalPill(page);

    const trad = page.locator('#teTradWithdrawal');
    const ltcg = page.locator('#teLtcg');

    const tradOrig = await readInput(page, 'teTradWithdrawal');
    const ltcgOrig = await readInput(page, 'teLtcg');

    await trad.fill(String(tradOrig + 50_000));
    await trad.dispatchEvent('input');
    await page.waitForTimeout(SETTLE_MS / 2);

    await ltcg.fill(String(ltcgOrig + 80_000));
    await ltcg.dispatchEvent('input');
    await page.waitForTimeout(SETTLE_MS / 2);

    // Also exercise the year picker (another estimator-local mutation).
    const optionValues = await page.locator('#teYear option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value),
    );
    if (optionValues.length > 1) {
      await page.locator('#teYear').selectOption(optionValues[optionValues.length - 1]);
      await page.waitForTimeout(SETTLE_MS);
    }

    // Re-read the plan figures. Per SC-004 they must be byte-for-byte
    // unchanged. Read directly (no tab switch needed — header KPIs are
    // persistent chrome visible on every tab).
    const afterStatus = await readText(page, '#fireStatus');
    const afterFireNum = await readText(page, '#ikpiFIRENum');
    const afterNetWorth = await readText(page, '#ikpiNetWorth');
    const afterInputs = await page.evaluate(() => {
      const w = window as unknown as { getInputs?: () => unknown };
      return typeof w.getInputs === 'function' ? JSON.stringify(w.getInputs()) : null;
    });

    expect(afterStatus, 'plan verdict (#fireStatus) must be unchanged by estimator edits').toBe(beforeStatus);
    expect(afterFireNum, 'FIRE Number KPI must be unchanged by estimator edits').toBe(beforeFireNum);
    expect(afterNetWorth, 'Net Worth KPI must be unchanged by estimator edits').toBe(beforeNetWorth);
    expect(afterInputs, 'plan inputs (getInputs) must be byte-for-byte unchanged by estimator edits').toBe(
      beforeInputs,
    );
  });
});

// ---------------------------------------------------------------------------
// FR-001 — RR-only: the estimator block must NOT exist in Generic
// ---------------------------------------------------------------------------

test.describe('034 year-tax-estimator — Generic has no UI block (FR-001)', () => {
  test('Generic dashboard exposes no #teCard estimator block', async ({ page }) => {
    await loadDashboard(page, GENERIC_FILE);
    // Navigate to the same pill where RR shows the block.
    await page.click('#tabBar .tab[data-tab="retirement"]');
    await page.waitForTimeout(SETTLE_MS / 2);
    await page.click('.pill[data-tab="retirement"][data-pill="withdrawal"]');
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator('#teCard')).toHaveCount(0);
  });
});
