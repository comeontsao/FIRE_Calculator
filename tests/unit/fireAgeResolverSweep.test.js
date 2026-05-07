// ==================== UNIT TESTS: fireAgeResolver sweep (feature 026 US1) ====================
// Feature: 026-withdrawal-tax-and-ui-fixes — User Story 1 regression guard.
// Spec:    specs/026-withdrawal-tax-and-ui-fixes/spec.md FR-002, SC-001, SC-002.
// Contract: specs/026-withdrawal-tax-and-ui-fixes/contracts/verdict-pill.contract.md
//
// Pre-feature-026, the resolver's Stage 2 used a 12-probe scan and returned
// the EARLIEST feasible m. Because the simulator pro-rate is step-function
// shaped (m=1 already drops 8.3% of FIRE-year spend, enough to flip
// feasibility for almost any marginal scenario), the result was m=1 for
// nearly every input — making the verdict-pill "X years 1 months" copy
// effectively constant.
//
// This sweep test confirms the post-feature-026 behavior: across a continuous
// sweep of slack-crossover positions, the resolver returns continuously
// varying month values via linear interpolation.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { findEarliestFeasibleAge } = require(
  path.resolve(__dirname, '..', '..', 'calc', 'fireAgeResolver.js')
);

// ---------------------------------------------------------------------------
// Mock helpers — slack-aware. The simulator returns endBalance varying linearly
// with fireAge, crossing zero at `boundaryAge`. The feasibility predicate
// (used by Stage 1's integer-year scan) flips at integer year boundary Y.
// Stage 2 reads `sim.endBalance` directly for slack interpolation, so the
// feas predicate doesn't need fractional-age awareness.
// ---------------------------------------------------------------------------
function makeSlackSim(boundaryAge, slope) {
  return function simMock(_inp, _annualSpend, fireAge /*, ...pools */) {
    return { fireAge, endBalance: (fireAge - boundaryAge) * (slope || 100) };
  };
}
function makeBoundaryFeas(yBoundary) {
  return function feasMock(sim /*, inp, annualSpend, mode, fireAge */) {
    return sim.fireAge >= yBoundary;
  };
}
function makeFracSim() {
  // Compatibility shim for older test bodies — same as makeSlackSim with
  // a default boundary at integer Y. Where the test only needs Stage 1
  // behavior; Stage 2 uses the slack signal which won't be informative.
  return function (_inp, _annualSpend, fireAge) {
    return { fireAge, endBalance: 0 };
  };
}

function baseInp(overrides) {
  return Object.assign({ ageRoger: 40, endAge: 95 }, overrides || {});
}
function basePools() { return { pTrad: 0, pRoth: 0, pStocks: 0, pCash: 0 }; }

// ---------------------------------------------------------------------------
// SWEEP-1 — DWZ mode: sweep boundary across [Y-1.0833, Y-0.0833] in 25 steps.
// Each step shifts the slack-crossing fractional age. The resolver should
// return a months value that tracks the fractional position. Expect:
//   - ≥ 4 distinct months across the sweep (the SC-001 anti-stuck assertion).
//   - No single bucket > 80% concentration.
// ---------------------------------------------------------------------------
test('SWEEP-1 (DWZ) — months value varies continuously across a 25-step boundary sweep', () => {
  const Y = 53;
  const steps = 25;
  const monthsBuckets = new Array(13).fill(0);  // 0..12 (12 only briefly during clamp test)
  const distinctMonths = new Set();

  for (let i = 0; i < steps; i++) {
    // boundaryAge ranges from Y-1 + 1/12 to Y-1 + 11/12 — roughly the
    // entire fractional year. f ∈ (1/12, 11/12) → months ∈ {1..11}.
    const f = 1 / 12 + (i / (steps - 1)) * (10 / 12);
    const boundaryAge = (Y - 1) + f;
    const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
      annualSpend: 50000,
      simulateRetirementOnlySigned: makeSlackSim(boundaryAge, 100),
      isFireAgeFeasible: makeBoundaryFeas(Y),
      pools: basePools(),
    });
    assert.ok(result.feasible, `step ${i}: should be feasible`);
    monthsBuckets[result.months]++;
    distinctMonths.add(result.months);
  }

  assert.ok(
    distinctMonths.size >= 4,
    `expected ≥ 4 distinct months across sweep; got ${distinctMonths.size}: ${[...distinctMonths].sort()}`
  );
  const maxBucket = Math.max.apply(null, monthsBuckets);
  assert.ok(
    maxBucket / steps <= 0.80,
    `expected no single months bucket > 80% of sweep; got ${maxBucket}/${steps} = ${(maxBucket / steps * 100).toFixed(1)}%`
  );
});

// ---------------------------------------------------------------------------
// SWEEP-2 (Exact) — same shape with non-zero terminalBuffer. Slack crossing
// is offset by terminalBuffer × annualSpend.
// ---------------------------------------------------------------------------
test('SWEEP-2 (Exact) — months varies with terminalBuffer applied', () => {
  const Y = 53;
  const steps = 25;
  const distinctMonths = new Set();
  const buckets = new Array(13).fill(0);

  for (let i = 0; i < steps; i++) {
    const f = 1 / 12 + (i / (steps - 1)) * (10 / 12);
    const boundaryAge = (Y - 1) + f;
    // terminalBuffer = 0 keeps Exact effectively == DWZ for this slack shape;
    // a small positive value shifts the crossover but should still produce
    // varying months.
    const result = findEarliestFeasibleAge(
      baseInp({ terminalBuffer: 0 }),
      'exact',
      {
        annualSpend: 50000,
        simulateRetirementOnlySigned: makeSlackSim(boundaryAge, 100),
        isFireAgeFeasible: makeBoundaryFeas(Y),
        pools: basePools(),
      }
    );
    assert.ok(result.feasible);
    distinctMonths.add(result.months);
    buckets[result.months]++;
  }

  assert.ok(distinctMonths.size >= 4, `Exact: expected ≥ 4 distinct months; got ${distinctMonths.size}`);
  const maxBucket = Math.max.apply(null, buckets);
  assert.ok(maxBucket / steps <= 0.80, `Exact: max bucket > 80% (${maxBucket}/${steps})`);
});

// ---------------------------------------------------------------------------
// SWEEP-3 (Safe) — Safe mode falls back to endBalance when no per-phase slack
// fields are surfaced on the sim. The resolver MUST still produce varying
// months (approximate but better than always-1).
// ---------------------------------------------------------------------------
test('SWEEP-3 (Safe) — months varies in approximate-fallback mode', () => {
  const Y = 53;
  const steps = 25;
  const distinctMonths = new Set();

  for (let i = 0; i < steps; i++) {
    const f = 1 / 12 + (i / (steps - 1)) * (10 / 12);
    const boundaryAge = (Y - 1) + f;
    const result = findEarliestFeasibleAge(baseInp(), 'safe', {
      annualSpend: 50000,
      simulateRetirementOnlySigned: makeSlackSim(boundaryAge, 100),
      isFireAgeFeasible: makeBoundaryFeas(Y),
      pools: basePools(),
    });
    assert.ok(result.feasible);
    distinctMonths.add(result.months);
  }

  assert.ok(distinctMonths.size >= 4, `Safe: expected ≥ 4 distinct months; got ${distinctMonths.size}`);
});

// ---------------------------------------------------------------------------
// EDGE-1 — boundary at exactly Y (integer year): rounded months = 0,
// resolver returns searchMethod: 'integer-year', months: 0.
// ---------------------------------------------------------------------------
test('EDGE-1 — boundary at integer Y clamps to months=11 in month-precision (always-show-months policy)', () => {
  const Y = 53;
  // Slack signal crosses zero exactly at integer Y → f = 1.0 → months would
  // round to 12; resolver clamps to 11 to preserve continuous month-precision
  // UX (no integer-year fallback when feasible). The verdict pill shows
  // "FIRE in N years 11 months at Y-1" rather than year-only at Y.
  const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSlackSim(Y, 100),
    isFireAgeFeasible: makeBoundaryFeas(Y),
    pools: basePools(),
  });
  assert.ok(result.feasible);
  assert.strictEqual(result.searchMethod, 'month-precision');
  assert.strictEqual(result.months, 11);
  assert.strictEqual(result.years, Y - 1);
});

// ---------------------------------------------------------------------------
// EDGE-2 — slack crossing very close to Y (boundary = Y - 0.5/12):
// f ≈ 11.5/12 → rounds to 12 → clamped to 11.
// ---------------------------------------------------------------------------
test('EDGE-2 — boundary very close to Y clamps to months=11 (always-show-months)', () => {
  const Y = 53;
  const boundaryAge = Y - 0.5 / 12;
  const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSlackSim(boundaryAge, 100),
    isFireAgeFeasible: makeBoundaryFeas(Y),
    pools: basePools(),
  });
  assert.ok(result.feasible);
  assert.strictEqual(result.searchMethod, 'month-precision');
  assert.strictEqual(result.months, 11);
  assert.strictEqual(result.years, Y - 1);
});

// ---------------------------------------------------------------------------
// EDGE-3 — slack crossing very close to Y-1 (boundary = Y-1 + 0.4/12):
// f ≈ 0.4/12 → rounds to 0 → returns integer-year at Y.
// ---------------------------------------------------------------------------
test('EDGE-3 — boundary near Y-1 clamps to months=1 (always-show-months)', () => {
  const Y = 53;
  const boundaryAge = (Y - 1) + 0.4 / 12;
  const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSlackSim(boundaryAge, 100),
    isFireAgeFeasible: makeBoundaryFeas(Y),
    pools: basePools(),
  });
  assert.ok(result.feasible);
  assert.strictEqual(result.searchMethod, 'month-precision');
  assert.strictEqual(result.months, 1);
  assert.strictEqual(result.years, Y - 1);
});

// ---------------------------------------------------------------------------
// REGIME-B — signed-sim disagrees with gate at Y-1 (both slacks positive).
// The resolver MUST still produce a month-precision value that varies with
// the slackLo magnitude — the verdict pill is the user's primary live feedback
// and integer-year fallback would be silently stuck.
// ---------------------------------------------------------------------------
test('REGIME-B — signed-sim disagrees with gate (both slacks positive) returns month-precision', () => {
  const Y = 53;
  // Stage 1 found Y feasible at integer level. Signed sim says Y-1 also feasible
  // (positive slack), but the gate rejected it for a constraint the signed sim
  // doesn't track. Resolver must approximate boundary via slackLo/slackHi ratio.
  const slackPositiveBothEnds = function (_inp, _annualSpend, fireAge) {
    if (fireAge >= Y) return { fireAge, endBalance: 700 };
    return { fireAge, endBalance: 350 };
  };
  const integerOnlyFeas = (sim) => sim.fireAge >= Y;

  const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: slackPositiveBothEnds,
    isFireAgeFeasible: integerOnlyFeas,
    pools: basePools(),
  });
  assert.ok(result.feasible);
  // f = slackLo / slackHi = 350/700 = 0.5 → months = 6.
  assert.strictEqual(result.searchMethod, 'month-precision');
  assert.strictEqual(result.years, Y - 1);
  assert.strictEqual(result.months, 6,
    `expected months=6 (slackLo/slackHi = 0.5 → 6/12); got ${result.months}`);
});

// ---------------------------------------------------------------------------
// EDGE-4 — non-monotone slack falls back to integer-year defensively.
// ---------------------------------------------------------------------------
test('EDGE-4 — non-monotone slack falls back to integer-year', () => {
  const Y = 53;
  // Both Y-1 and Y produce slack=0 → not monotone → integer-year fallback.
  const flatSim = function (_inp, _annualSpend, fireAge) {
    return { fireAge, endBalance: 0 };
  };
  const result = findEarliestFeasibleAge(baseInp(), 'dieWithZero', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: flatSim,
    isFireAgeFeasible: makeBoundaryFeas(Y),
    pools: basePools(),
  });
  assert.ok(result.feasible);
  assert.strictEqual(result.searchMethod, 'integer-year');
  assert.strictEqual(result.years, Y);
  assert.strictEqual(result.months, 0);
});
