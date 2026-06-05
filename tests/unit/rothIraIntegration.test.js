/*
 * tests/unit/rothIraIntegration.test.js — feature 032 T051.
 *
 * Integration test: exercises the full RR flow through `accumulateToFire`
 * with the locked default Roth IRA values (Roger=0 / Rebecca=$59,021) plus
 * the standard contribution defaults ($7,000/yr each = $14,000/yr combined),
 * runs accumulation 10 years to FIRE age, and locks the end-of-accumulation
 * Roth IRA pool balance as a regression-net fixture (Constitution Principle IV).
 *
 * What this test catches that the per-US unit tests don't:
 *   - End-to-end coupling between (rothIraReal seed) + (rothIraContribReal
 *     annual stream) over a realistic multi-year horizon.
 *   - Drift if either the seed read path or the contribution flow changes
 *     independently.
 *   - The exact composition of end-of-accumulation pRothIra that the
 *     downstream lifecycle simulator and verdict gates consume.
 *
 * Fixture rationale: Roger=$0 + Rebecca=$59,021 is the canonical RR baseline
 * shipped to production; $7K each in contributions is the default UI value
 * (matches the 2026 IRS limit). 10-year horizon (age 40 → 50) is short enough
 * to compute the expected value by closed-form annuity FV but long enough to
 * exercise compounding interaction.
 *
 * Closed-form expected balance at age 50 with return401k = 0.05, inflation = 0
 * (so realReturn401k = 0.05):
 *   seedFV    = 59021 * 1.05^10                  = 96,143.34
 *   annuityFV = 14000 * ((1.05^10 - 1) / 0.05)   = 176,067.39
 *   total                                         = 272,210.73
 *
 * Tolerance: $1 absorbs intra-year rounding.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { accumulateToFire } = require(
  path.resolve(__dirname, '..', '..', 'calc', 'accumulateToFire.js'),
);

/**
 * Minimal inp that mirrors the per-US fixture in `accumulateToFire.test.js`
 * but uses the RR-locked Roth IRA defaults (Roger=0 / Rebecca=59,021) and
 * the canonical $7K/$7K = $14K contribution stream the UI defaults to.
 *
 * All other pools are zeroed so the Roth IRA arithmetic stays isolated and
 * the closed-form fixture is exact.
 */
function buildInp(overrides) {
  return Object.assign({
    ageRoger: 40,
    // Zero every other pool / contribution so this test exclusively exercises
    // the Roth IRA path (FIRE-engine couplings into other pools would
    // confound the closed-form fixture and turn this into a noisy oracle).
    roger401kTrad: 0,
    roger401kRoth: 0,
    rogerStocks: 0,
    rebeccaStocks: 0,
    cashSavings: 0,
    otherAssets: 0,
    monthlySavings: 0,
    contrib401kTrad: 0,
    contrib401kRoth: 0,
    empMatch: 0,
    annualIncome: 0,
    taxRate: 0,
    raiseRate: 0,
    returnRate: 0.05,
    return401k: 0.05,
    inflationRate: 0,
    // Roth IRA — locked RR-baseline defaults via canonical inp fields.
    rothIraReal: 59021,            // 0 (Roger) + 59021 (Rebecca)
    rothIraContribReal: 14000,     // 7000 (Roger) + 7000 (Rebecca)
    endAge: 95,
    taxTrad: 0.22,
    stockGainPct: 0.6,
    ssClaimAge: 67,
  }, overrides || {});
}

function buildOptions(overrides) {
  return Object.assign({
    mortgageEnabled: false,
    mortgageInputs: null,
    secondHomeEnabled: false,
    secondHomeInputs: null,
    rentMonthly: 0,
    collegeFn: null,
    payoffVsInvestFn: null,
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// T051 — RR baseline Roth IRA integration
// ---------------------------------------------------------------------------
test('T051: full RR-baseline accumulation locks end-of-accumulation pRothIra to closed-form fixture', () => {
  const inp = buildInp();
  const fireAge = 50; // 10 years from age 40
  const result = accumulateToFire(inp, fireAge, buildOptions());

  // Closed-form expected at age 50 (real-$ frame, returns annualized):
  //   seedFV    = 59021 * 1.05^10                = 96143.342...
  //   annuityFV = 14000 * ((1.05^10 - 1)/0.05)   = 176067.396...
  //   total                                       = 272210.738...
  const seedFV = 59021 * Math.pow(1.05, 10);
  const annuityFV = 14000 * ((Math.pow(1.05, 10) - 1) / 0.05);
  const expected = seedFV + annuityFV;

  assert.ok(
    typeof result.end.pRothIra === 'number' && Number.isFinite(result.end.pRothIra),
    `end.pRothIra must be a finite number, got ${result.end.pRothIra}`,
  );
  assert.ok(
    result.end.pRothIra > 0,
    `end.pRothIra must be > 0 after 10y of $14K/yr contributions plus $59K seed, got ${result.end.pRothIra}`,
  );
  assert.ok(
    Math.abs(result.end.pRothIra - expected) < 1,
    `end.pRothIra must match closed-form fixture ≈ ${expected.toFixed(2)}, got ${result.end.pRothIra.toFixed(2)}`,
  );
});

test('T051: per-year pRothIra trajectory is monotonically increasing across the accumulation horizon', () => {
  // With non-negative contributions and positive returns, pRothIra must
  // never shrink during accumulation. This catches drift if the accumulation
  // loop accidentally subtracts from the Roth IRA pool (e.g., wired into a
  // withdrawal path).
  const inp = buildInp();
  const fireAge = 50;
  const result = accumulateToFire(inp, fireAge, buildOptions());
  const rows = result.perYearRows;

  assert.ok(rows.length >= 10, `expected ≥10 accumulation rows, got ${rows.length}`);

  let prev = -Infinity;
  for (const row of rows) {
    assert.ok(
      typeof row.pRothIra === 'number' && Number.isFinite(row.pRothIra),
      `row at age ${row.age} must expose finite pRothIra (got ${row.pRothIra})`,
    );
    assert.ok(
      row.pRothIra >= prev - 1e-6,
      `pRothIra must be monotonically non-decreasing during accumulation; ` +
        `row age ${row.age}: ${row.pRothIra} < prev ${prev}`,
    );
    prev = row.pRothIra;
  }

  // Year-0 row must reflect the canonical seed (proves the read path lands).
  assert.strictEqual(
    rows[0].pRothIra,
    59021,
    `row 0 pRothIra must equal canonical seed 59021, got ${rows[0].pRothIra}`,
  );
});

test('T051: zero-Roth-IRA baseline does NOT spuriously create a Roth IRA balance', () => {
  // Regression net: if `accumulateToFire` ever silently injects a contribution
  // or seeds the pool from a wrong field, this test catches it. With seed=0
  // and contrib=0, end.pRothIra MUST be exactly 0 (no rounding noise — the
  // arithmetic is 0 + 0 + 0·(1+r)).
  const inp = buildInp({ rothIraReal: 0, rothIraContribReal: 0 });
  const fireAge = 50;
  const result = accumulateToFire(inp, fireAge, buildOptions());

  assert.strictEqual(
    result.end.pRothIra,
    0,
    `with zero seed + zero contribution, end.pRothIra must be exactly 0, got ${result.end.pRothIra}`,
  );
  for (const row of result.perYearRows) {
    assert.strictEqual(
      row.pRothIra,
      0,
      `with zero seed + zero contribution, every row.pRothIra must be exactly 0; ` +
        `row age ${row.age} got ${row.pRothIra}`,
    );
  }
});
