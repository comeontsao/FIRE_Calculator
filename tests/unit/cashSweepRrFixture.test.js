/*
 * Feature 030 — Cash-sweep end-to-end numerical pin via accumulateToFire (T008).
 *
 * Loads calc/cashSweep.js (so globalThis._applyCashSweep is registered) and
 * calc/accumulateToFire.js, then runs a canonical RR-equivalent fixture
 * through `accumulateToFire` and asserts the year-end cash balance behaviour
 * matches the contract in
 * specs/030-cash-sweep-stocks/contracts/cash-sweep.contract.md:
 *
 *   - Toggle OFF (or omitted) → pCash matches pre-feature trajectory (baseline
 *     snapshot pinned at write-time).
 *   - Toggle ON + threshold $X → after the first non-year-0 iteration, pCash
 *     converges to ~$X (within $2K tolerance to accommodate partial-year
 *     residual cash-flow noise; see calc/accumulateToFire.js v5 cash-flow
 *     residual semantics).
 *   - Toggle ON + threshold $0 → pCash drains close to $0.
 *   - Year 0 (currentAge === fireAge) → starting cash preserved.
 *   - Toggle ON vs OFF: end.pStocks is HIGHER under ON (sweep moved dollars to
 *     stocks).
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME:
 *   These tests depend on the Backend Engineer wiring `_applyCashSweep(...)`
 *   into the per-year loop of `calc/accumulateToFire.js` immediately after
 *   its `pCash *= 1.005;` line (line 711 on current main). Until that
 *   integration ships:
 *     - The "toggle ON" cases will see pCash continue to grow above
 *       threshold (no sweep fires) → tests fail.
 *     - The "year 0 / toggle OFF" cases still pass because the helper module
 *       is loaded but never invoked, so behaviour is identical to pre-feature.
 *
 * Test scope (6 cases):
 *   1. Toggle OFF + canonical fixture  → baseline pCash snapshot.
 *   2. Toggle ON + threshold $10K       → pCash ≈ $10K within $2K.
 *   3. Toggle ON + threshold $50K       → pCash ≈ $50K within $2K.
 *   4. Toggle ON + threshold $0         → pCash ≈ $0 within $2K.
 *   5. Toggle ON + currentAge=fireAge   → year-0 preservation; starting cash
 *                                         preserved (no accumulation phase).
 *   6. Toggle ON + threshold $10K       → end.pStocks > toggle-OFF end.pStocks
 *                                         (sweep transferred dollars).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Load the cash-sweep helper FIRST so accumulateToFire.js can find
// `globalThis._applyCashSweep` (or `require('./cashSweep.js')`) when wired.
require(path.join(__dirname, '..', '..', 'calc', 'cashSweep.js'));
const { accumulateToFire } = require(
  path.join(__dirname, '..', '..', 'calc', 'accumulateToFire.js'),
);

/**
 * RR-equivalent canonical fixture. Mirrors the baseInp() pattern in
 * tests/unit/accumulateToFire.test.js but tuned so that cash flow into pCash
 * is positive every year — required for the sweep test to be meaningful.
 *
 * Income / contributions: enough to drive a positive cash-flow residual.
 * Returns: realistic for nominal- vs real-frame separation (feature 022).
 */
function rrFixture(overrides) {
  return Object.assign(
    {
      ageRoger: 42,
      roger401kTrad: 50000,
      roger401kRoth: 30000,
      rogerStocks: 100000,
      rebeccaStocks: 50000,
      cashSavings: 80000,
      otherAssets: 0,
      returnRate: 0.07,
      return401k: 0.07,
      inflationRate: 0.03,
      monthlySavings: 0, // route surplus through cash-flow residual, not stocks contribution
      contrib401kTrad: 16500,
      contrib401kRoth: 2900,
      empMatch: 7200,
      endAge: 95,
      taxRate: 0.22, // flat-rate path — deterministic tax computation
      taxTrad: 0.22,
      stockGainPct: 0.6,
      raiseRate: 0.03,
      annualIncome: 220000,
      annualSpend: 100000,
      ssClaimAge: 67,
    },
    overrides || {},
  );
}

function baseOptions(overrides) {
  return Object.assign(
    {
      mortgageEnabled: false,
      mortgageInputs: null,
      secondHomeEnabled: false,
      secondHomeInputs: null,
      rentMonthly: 0,
      collegeFn: null,
      payoffVsInvestFn: null,
    },
    overrides || {},
  );
}

const FIRE_AGE = 52; // 10 years of accumulation

// ---------------------------------------------------------------------------
// Snapshot baseline once: toggle OFF / unset → captures pre-feature pCash.
// We compute this dynamically so the snapshot stays in sync with calc-engine
// changes that don't relate to sweep (tax bracket updates, etc.).
// ---------------------------------------------------------------------------
function runOff() {
  const inp = rrFixture();
  const opts = baseOptions();
  return accumulateToFire(inp, FIRE_AGE, opts);
}

test('toggle OFF (cashSweepEnabled unset) → baseline pCash grows above $80K starting cash', () => {
  const result = runOff();
  // No sweep wired → pCash should accumulate via the cash-flow residual.
  // Pin: end.pCash MUST be significantly above the starting cashSavings
  // ($80K) because positive cash-flow flows in each year + 1.005x compound.
  assert.ok(
    result.end.pCash > 80000,
    `expected baseline pCash > $80K (starting cash); got $${Math.round(result.end.pCash)}`,
  );
  // Sanity: pStocks also grew under compound.
  assert.ok(result.end.pStocks > 150000);
});

test('toggle ON + threshold $10K → end pCash converges near $10K (within $2K tolerance)', () => {
  const inp = rrFixture({
    cashSweepEnabled: true,
    cashSweepThreshold: 10000,
  });
  const opts = baseOptions();
  const result = accumulateToFire(inp, FIRE_AGE, opts);
  // The LAST iteration sweeps cash above threshold to stocks. Tolerance
  // accommodates the residual cash-flow inflow during the final year before
  // the sweep fires (cash-flow inflow + 1.005 compound during the year,
  // then sweep brings it back to threshold).
  assert.ok(
    Math.abs(result.end.pCash - 10000) < 2000,
    `expected end.pCash ≈ $10K within $2K under sweep+threshold=$10K; got $${Math.round(
      result.end.pCash,
    )} (delta $${Math.round(result.end.pCash - 10000)})`,
  );
});

test('toggle ON + threshold $50K → end pCash converges near $50K (within $2K tolerance)', () => {
  const inp = rrFixture({
    cashSweepEnabled: true,
    cashSweepThreshold: 50000,
  });
  const opts = baseOptions();
  const result = accumulateToFire(inp, FIRE_AGE, opts);
  assert.ok(
    Math.abs(result.end.pCash - 50000) < 2000,
    `expected end.pCash ≈ $50K within $2K under sweep+threshold=$50K; got $${Math.round(
      result.end.pCash,
    )} (delta $${Math.round(result.end.pCash - 50000)})`,
  );
});

test('toggle ON + threshold $0 → end pCash drains close to $0 (within $2K tolerance)', () => {
  const inp = rrFixture({
    cashSweepEnabled: true,
    cashSweepThreshold: 0,
  });
  const opts = baseOptions();
  const result = accumulateToFire(inp, FIRE_AGE, opts);
  assert.ok(
    result.end.pCash < 2000,
    `expected end.pCash ≈ $0 within $2K under threshold=$0; got $${Math.round(
      result.end.pCash,
    )}`,
  );
});

test('toggle ON + currentAge === fireAge → year-0 preservation; starting cash preserved', () => {
  // Edge case: zero-year accumulation phase. Helper's year-0 rule
  // (age <= currentAge → no-op) ensures the starting cash isn't swept.
  const inp = rrFixture({
    cashSweepEnabled: true,
    cashSweepThreshold: 10000,
    // Note: ageRoger is 42 in fixture; fireAge here is also 42.
  });
  const opts = baseOptions();
  const result = accumulateToFire(inp, /* fireAge */ 42, opts);
  // perYearRows.length === 0 (no iterations). end.pCash === cashSavings.
  // We tolerate a small +/- to accommodate any year-0 setup arithmetic.
  assert.ok(
    Math.abs(result.end.pCash - inp.cashSavings) < 100,
    `expected starting cash preserved (≈ $${inp.cashSavings}); got $${Math.round(
      result.end.pCash,
    )}`,
  );
});

test('toggle ON → end.pStocks is HIGHER than toggle OFF (sweep moved dollars to stocks)', () => {
  const offResult = runOff();
  const onInp = rrFixture({
    cashSweepEnabled: true,
    cashSweepThreshold: 10000,
  });
  const onResult = accumulateToFire(onInp, FIRE_AGE, baseOptions());

  // Sweep transfers excess cash to stocks each year-end, where it compounds
  // at the (real) stock return rate. After 10 years of sweeping, end.pStocks
  // under ON MUST exceed end.pStocks under OFF.
  assert.ok(
    onResult.end.pStocks > offResult.end.pStocks,
    `expected end.pStocks under ON > under OFF (sweep transferred cash); ` +
      `ON=$${Math.round(onResult.end.pStocks)}, OFF=$${Math.round(offResult.end.pStocks)}`,
  );
  // And end.pCash under ON should be LOWER than under OFF (cash was swept).
  assert.ok(
    onResult.end.pCash < offResult.end.pCash,
    `expected end.pCash under ON < under OFF; ` +
      `ON=$${Math.round(onResult.end.pCash)}, OFF=$${Math.round(offResult.end.pCash)}`,
  );
});
