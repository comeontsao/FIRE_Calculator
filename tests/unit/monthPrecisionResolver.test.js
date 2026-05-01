// ==================== UNIT TESTS: month-precision FIRE-age resolver ====================
// Feature 020-validation-audit — User Story 4c (T040).
// Spec: specs/020-validation-audit/spec.md US4c
// Contract: specs/020-validation-audit/contracts/month-precision-resolver.contract.md
//
// Test cases per contract §Testing requirements (≥6):
//   1. Boundary detection — month-precision picks specific month within Y-1.
//   2. Monotonic-stability fallback — multi-flip → warn + integer-year.
//   3. Already-feasible-at-currentAge edge case.
//   4. Infeasible-everywhere edge case.
//   5. Single-person + couple parity (shape consistency).
//   6. Year-boundary equality (months=0) — Y-1 entirely infeasible.
//
// All tests pure-Node — uses dependency injection so no inline-HTML helpers
// are required. Mocks simulate feasibility patterns by year/fractionalAge.
// =========================================================================

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
// Mock helpers
// ---------------------------------------------------------------------------

/** Minimal valid inp record. */
function baseInp(overrides) {
  return Object.assign(
    {
      ageRoger: 40,
      endAge: 95,
    },
    overrides || {}
  );
}

/** Minimal pools record. */
function basePools() {
  return { pTrad: 0, pRoth: 0, pStocks: 0, pCash: 0 };
}

/** Sim mock: identity passthrough — sim object just carries fireAge for the
 * feasibility mock to inspect. */
function makeSimMock() {
  return function simMock(_inp, _annualSpend, fireAge /*, ...pools */) {
    return { fireAge };
  };
}

/** Build a feasibility mock from a predicate on fireAge.
 * predicate(fireAge) → boolean. */
function makeFeasMock(predicate) {
  return function feasMock(sim /*, inp, annualSpend, mode, fireAge */) {
    return !!predicate(sim.fireAge);
  };
}

// ---------------------------------------------------------------------------
// Case 1 — boundary detection
// Earliest feasible YEAR is 53 (currentAge=40, so Stage 1 stops at y=53).
// Within Y-1 = 52, month 7 is the boundary: m=0..6 infeasible, m=7..11 feasible.
// Expected: {years: 52, months: 7, totalMonths: 52*12+7 = 631, feasible:true,
//            searchMethod: 'month-precision'}.
// ---------------------------------------------------------------------------
test('Case 1 — boundary detection: month-precision picks month 7 within year 52', () => {
  const inp = baseInp({ ageRoger: 40, endAge: 95 });
  const pools = basePools();

  // Year-level: integer ages < 53 are infeasible; >= 53 feasible.
  // Month-level: fractional ages in [52, 52 + 7/12) are infeasible;
  //              [52 + 7/12, 53) are feasible.
  const feasPredicate = (fireAge) => {
    if (Number.isInteger(fireAge)) return fireAge >= 53;
    // fireAge = 52 + m/12 (m in 0..11)
    const fractional = fireAge - Math.floor(fireAge);
    const m = Math.round(fractional * 12);
    if (Math.floor(fireAge) === 52) return m >= 7;
    // Other fractional ages — fall back to year-level rule (m treated as if
    // floor(fireAge) >= 53 means feasible).
    return Math.floor(fireAge) >= 53;
  };

  const result = findEarliestFeasibleAge(inp, 'safe', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  });

  assert.strictEqual(result.feasible, true, 'should be feasible');
  assert.strictEqual(result.years, 52, 'years should be 52');
  assert.strictEqual(result.months, 7, 'months should be 7');
  assert.strictEqual(result.totalMonths, 52 * 12 + 7, 'totalMonths = 52*12 + 7 = 631');
  assert.strictEqual(result.searchMethod, 'month-precision', 'searchMethod month-precision');
});

// ---------------------------------------------------------------------------
// Case 2 — monotonic stability fallback
// Earliest feasible YEAR is 53; within Y-1=52 feasibility flips multiple times:
//   m=0..3 false, m=4..6 true, m=7..9 false, m=10..11 true.
// The resolver must detect the multi-flip, log a warning, and fall back to
// year-precision (integer-year).
// Expected: {years: 53, months: 0, totalMonths: 636, feasible:true,
//            searchMethod: 'integer-year'}.
// ---------------------------------------------------------------------------
test('Case 2 — monotonic stability fallback: multi-flip falls back to integer-year + warn', () => {
  const inp = baseInp({ ageRoger: 40, endAge: 95 });
  const pools = basePools();

  const feasPredicate = (fireAge) => {
    if (Number.isInteger(fireAge)) return fireAge >= 53;
    const fractional = fireAge - Math.floor(fireAge);
    const m = Math.round(fractional * 12);
    if (Math.floor(fireAge) === 52) {
      // Multi-flip pattern: F F F F T T T F F F T T
      return (m >= 4 && m <= 6) || m >= 10;
    }
    return Math.floor(fireAge) >= 53;
  };

  // Capture console.warn calls.
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);

  let result;
  try {
    result = findEarliestFeasibleAge(inp, 'safe', {
      annualSpend: 50000,
      simulateRetirementOnlySigned: makeSimMock(),
      isFireAgeFeasible: makeFeasMock(feasPredicate),
      pools,
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.strictEqual(result.feasible, true, 'should be feasible at year-precision');
  assert.strictEqual(result.years, 53, 'years falls back to Y=53');
  assert.strictEqual(result.months, 0, 'months=0 on fallback');
  assert.strictEqual(result.totalMonths, 53 * 12, 'totalMonths = 53*12');
  assert.strictEqual(result.searchMethod, 'integer-year', 'searchMethod = integer-year');

  // Verify warning was logged with expected prefix.
  assert.ok(warnCalls.length >= 1, 'at least one console.warn call expected');
  const firstWarn = warnCalls[0].join(' ');
  assert.ok(
    firstWarn.includes('[fireAgeResolver]'),
    'warn message must include [fireAgeResolver] prefix; got: ' + firstWarn
  );
  assert.ok(
    firstWarn.includes('non-monotonic'),
    'warn message must mention non-monotonic; got: ' + firstWarn
  );
});

// ---------------------------------------------------------------------------
// Case 3 — already-feasible-at-currentAge
// currentAge=40 is feasible at year 0 (= currentAge). Per contract Edge case
// item 2, return {years: currentAge, months: 0}.
// Expected: {years: 40, months: 0, totalMonths: 480, feasible:true,
//            searchMethod: 'integer-year'}.
// ---------------------------------------------------------------------------
test('Case 3 — already-feasible-at-currentAge: returns {years: currentAge, months: 0}', () => {
  const inp = baseInp({ ageRoger: 40, endAge: 95 });
  const pools = basePools();

  // Everything is feasible from currentAge onward.
  const feasPredicate = () => true;

  const result = findEarliestFeasibleAge(inp, 'safe', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  });

  assert.strictEqual(result.feasible, true, 'should be feasible');
  assert.strictEqual(result.years, 40, 'years should be currentAge (40)');
  assert.strictEqual(result.months, 0, 'months should be 0');
  assert.strictEqual(result.totalMonths, 40 * 12, 'totalMonths = 40*12 = 480');
  assert.strictEqual(result.searchMethod, 'integer-year', 'searchMethod = integer-year');
});

// ---------------------------------------------------------------------------
// Case 4 — infeasible everywhere
// No year in [currentAge, endAge) is feasible.
// Expected: {years: -1, months: 0, totalMonths: -1, feasible: false,
//            searchMethod: 'none'}.
// ---------------------------------------------------------------------------
test('Case 4 — infeasible everywhere: returns {feasible: false, years: -1}', () => {
  const inp = baseInp({ ageRoger: 40, endAge: 95 });
  const pools = basePools();

  const feasPredicate = () => false;

  const result = findEarliestFeasibleAge(inp, 'safe', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  });

  assert.strictEqual(result.feasible, false, 'should be infeasible');
  assert.strictEqual(result.years, -1, 'years = -1');
  assert.strictEqual(result.months, 0, 'months = 0');
  assert.strictEqual(result.totalMonths, -1, 'totalMonths = -1');
  assert.strictEqual(result.searchMethod, 'none', 'searchMethod = none');
});

// ---------------------------------------------------------------------------
// Case 5 — single-person + couple parity (shape consistency)
// Same persona run once with adultCount=1 and once with adultCount=2.
// Mocks return identical feasibility shape — assert the resolver produces
// the same result shape (all five keys) and same values across both runs.
// (The actual pool computation differences live in accumulateToFire, NOT
// here. The resolver is agnostic to single-vs-couple; this test pins that.)
// ---------------------------------------------------------------------------
test('Case 5 — single-person + couple parity: shape and value consistency', () => {
  const inpCouple = baseInp({ ageRoger: 45, endAge: 95, adultCount: 2 });
  const inpSingle = baseInp({ ageRoger: 45, endAge: 95, adultCount: 1 });
  const pools = basePools();

  // Year 50 is the earliest feasible; within year 49, month 6 is the boundary.
  const feasPredicate = (fireAge) => {
    if (Number.isInteger(fireAge)) return fireAge >= 50;
    const m = Math.round((fireAge - Math.floor(fireAge)) * 12);
    if (Math.floor(fireAge) === 49) return m >= 6;
    return Math.floor(fireAge) >= 50;
  };

  const opts = {
    annualSpend: 60000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  };

  const resultCouple = findEarliestFeasibleAge(inpCouple, 'exact', opts);
  const resultSingle = findEarliestFeasibleAge(inpSingle, 'exact', opts);

  // Shape parity — both must have the same five keys.
  const expectedKeys = ['years', 'months', 'totalMonths', 'feasible', 'searchMethod'];
  for (const key of expectedKeys) {
    assert.ok(key in resultCouple, `couple result missing key: ${key}`);
    assert.ok(key in resultSingle, `single result missing key: ${key}`);
  }

  // Value parity — same mocks → same result.
  assert.deepStrictEqual(
    resultCouple,
    resultSingle,
    'single-person and couple results must agree given identical mocks'
  );

  // And the resolver picked the expected month boundary.
  assert.strictEqual(resultCouple.years, 49, 'years = 49');
  assert.strictEqual(resultCouple.months, 6, 'months = 6');
  assert.strictEqual(resultCouple.searchMethod, 'month-precision');
});

// ---------------------------------------------------------------------------
// Case 6 — year-boundary equality (months = 0)
// Earliest feasible YEAR is 53; within Y-1 = 52 ALL months are infeasible.
// The boundary IS year 53 at month 0 (the Y - 1 refinement found nothing).
// Expected: {years: 53, months: 0, totalMonths: 636, feasible:true,
//            searchMethod: 'integer-year'}.
// ---------------------------------------------------------------------------
test('Case 6 — year-boundary equality: Y-1 entirely infeasible → integer-year', () => {
  const inp = baseInp({ ageRoger: 40, endAge: 95 });
  const pools = basePools();

  const feasPredicate = (fireAge) => {
    // Strictly: feasible iff fireAge >= 53 (no fractional age below 53 passes).
    return fireAge >= 53;
  };

  const result = findEarliestFeasibleAge(inp, 'safe', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  });

  assert.strictEqual(result.feasible, true, 'should be feasible at year 53');
  assert.strictEqual(result.years, 53, 'years = 53');
  assert.strictEqual(result.months, 0, 'months = 0 (boundary at year)');
  assert.strictEqual(result.totalMonths, 53 * 12, 'totalMonths = 53*12 = 636');
  assert.strictEqual(result.searchMethod, 'integer-year', 'searchMethod = integer-year');
});

// ---------------------------------------------------------------------------
// Bonus — Edge case 1: already past plan age
// currentAge >= endAge → {years:0, months:0, totalMonths:0, feasible:false,
//                         searchMethod:'none'}.
// ---------------------------------------------------------------------------
test('Bonus — already past plan age: returns infeasible none', () => {
  const inp = baseInp({ ageRoger: 100, endAge: 95 });
  const pools = basePools();

  const result = findEarliestFeasibleAge(inp, 'safe', {
    annualSpend: 50000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(() => true), // even feasible mock — should not be called.
    pools,
  });

  assert.strictEqual(result.feasible, false);
  assert.strictEqual(result.years, 0);
  assert.strictEqual(result.months, 0);
  assert.strictEqual(result.totalMonths, 0);
  assert.strictEqual(result.searchMethod, 'none');
});

// ---------------------------------------------------------------------------
// Bonus — Generic-dashboard agePerson1 fallback works.
// (Resolver must read agePerson1 when present, falling back to ageRoger.)
// ---------------------------------------------------------------------------
test('Bonus — agePerson1 fallback works for Generic dashboard inputs', () => {
  const inp = { agePerson1: 35, endAge: 95 }; // no ageRoger field
  const pools = basePools();

  const feasPredicate = (fireAge) => fireAge >= 50;

  const result = findEarliestFeasibleAge(inp, 'exact', {
    annualSpend: 40000,
    simulateRetirementOnlySigned: makeSimMock(),
    isFireAgeFeasible: makeFeasMock(feasPredicate),
    pools,
  });

  assert.strictEqual(result.feasible, true);
  assert.strictEqual(result.years, 50);
  assert.strictEqual(result.months, 0);
  assert.strictEqual(result.searchMethod, 'integer-year');
});
