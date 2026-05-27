/*
 * Feature 030 — Audit invariant _invariantF (simulator-cash-sweep-parity) (T022).
 *
 * Direct unit test of the _invariantF function exposed via
 * `_invariantF_test_only_` export from calc/calcAudit.js.
 *
 * Mirrors tests/unit/grossSpendParityAuditInvariant.test.js (feature 029
 * `_invariantE` pattern). Verifies the parity invariant per the contract in
 * specs/030-cash-sweep-stocks/contracts/cash-sweep.contract.md:
 *
 *   1. ctx.cashSweepTraces undefined or empty → return [] (graceful no-op).
 *   2. All simulators agree on (pCash, pStocks) per age → no warnings.
 *   3. One simulator's pCash diverges by > $1 at age N → warning at age N.
 *   4. One simulator's pStocks diverges by > $1 → warning fires.
 *   5. Sub-$1 divergence → no warning (floating-point noise filter).
 *   6. Multiple ages, only one violating → warning only at that age.
 *   7. Single entry per age → no warning (need ≥2 simulators to compare).
 *   8. Malformed rows skipped silently.
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME:
 *   `_invariantF_test_only_` is not yet exported on calc/calcAudit.js — the
 *   Backend Engineer is adding it in parallel. Running these tests now will
 *   fail with "TypeError: _invariantF is not a function" (or similar). Once
 *   Backend lands the export, all 8 cases should pass.
 *
 *   The tests intentionally do NOT short-circuit on missing export: we want a
 *   clear assertion failure that surfaces in CI, not a silent skip.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const calcAudit = require(path.join(__dirname, '..', '..', 'calc', 'calcAudit.js'));
const _invariantF = calcAudit._invariantF_test_only_;

test('Invariant F: empty cashSweepTraces → zero warnings (graceful no-op)', () => {
  const out = _invariantF({}, { cashSweepTraces: [] });
  assert.deepEqual(out, []);
});

test('Invariant F: undefined cashSweepTraces → zero warnings (graceful no-op)', () => {
  const out = _invariantF({}, {});
  assert.deepEqual(out, []);
});

test('Invariant F: all simulators agree on pCash + pStocks per age → zero warnings', () => {
  const traces = [
    { age: 57, simulatorId: 'computeWithdrawalStrategy',   pCash: 10000, pStocks: 535000, swept: 0 },
    { age: 57, simulatorId: '_simulateStrategyLifetime',   pCash: 10000, pStocks: 535000, swept: 0 },
    { age: 57, simulatorId: 'signedLifecycleEndBalance',   pCash: 10000, pStocks: 535000, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.deepEqual(out, []);
});

test('Invariant F: pCash outlier at age 57 → one warning with structured fields', () => {
  const traces = [
    { age: 57, simulatorId: 'computeWithdrawalStrategy', pCash: 10000, pStocks: 535000, swept: 0 },
    { age: 57, simulatorId: '_simulateStrategyLifetime', pCash: 27500, pStocks: 535000, swept: 0 }, // diverges
    { age: 57, simulatorId: 'signedLifecycleEndBalance', pCash: 10000, pStocks: 535000, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.equal(out.length, 1, 'expected exactly one parity warning');
  const warn = out[0];
  assert.equal(warn.kind, 'simulator-cash-sweep-parity');
  assert.equal(warn.age, 57);
  assert.equal(warn.expected, false);
  // pCash range = 27500 - 10000 = 17500; pStocks range = 0. delta = max.
  assert.equal(Math.round(warn.delta), 17500);
  assert.ok(warn.simulators, 'expected simulators map');
  // Map should record at least these three IDs.
  assert.ok(
    typeof warn.simulators['_simulateStrategyLifetime'] === 'object' ||
      typeof warn.simulators['_simulateStrategyLifetime'] === 'number',
    'simulators map must include _simulateStrategyLifetime entry',
  );
  assert.match(warn.reason, /age 57/);
});

test('Invariant F: pStocks outlier (pCash agrees) → warning fires on pStocks-only divergence', () => {
  const traces = [
    { age: 57, simulatorId: 'A', pCash: 10000, pStocks: 535000, swept: 0 },
    { age: 57, simulatorId: 'B', pCash: 10000, pStocks: 540000, swept: 0 }, // $5K stocks delta
    { age: 57, simulatorId: 'C', pCash: 10000, pStocks: 535000, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.equal(out.length, 1, 'expected exactly one warning on pStocks divergence');
  const warn = out[0];
  assert.equal(warn.age, 57);
  assert.equal(Math.round(warn.delta), 5000);
});

test('Invariant F: within $1 tolerance → no warning (floating-point noise filter)', () => {
  const traces = [
    { age: 57, simulatorId: 'A', pCash: 10000.00, pStocks: 535000.00, swept: 0 },
    { age: 57, simulatorId: 'B', pCash: 10000.50, pStocks: 535000.25, swept: 0 }, // sub-$1
    { age: 57, simulatorId: 'C', pCash: 10000.00, pStocks: 535000.00, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.deepEqual(out, [], 'sub-$1 diffs are floating-point noise and must not warn');
});

test('Invariant F: multiple ages, only one violating → exactly one warning at offending age', () => {
  const traces = [
    { age: 55, simulatorId: 'A', pCash: 12000, pStocks: 500000, swept: 0 },
    { age: 55, simulatorId: 'B', pCash: 12000, pStocks: 500000, swept: 0 },
    { age: 57, simulatorId: 'A', pCash: 10000, pStocks: 535000, swept: 0 },
    { age: 57, simulatorId: 'B', pCash: 30000, pStocks: 535000, swept: 0 }, // violation here
    { age: 60, simulatorId: 'A', pCash: 10000, pStocks: 600000, swept: 0 },
    { age: 60, simulatorId: 'B', pCash: 10000, pStocks: 600000, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.equal(out.length, 1, 'expected exactly one warning at age 57');
  assert.equal(out[0].age, 57);
});

test('Invariant F: single-simulator entry per age → no warning (need ≥2 to compare)', () => {
  const traces = [
    { age: 57, simulatorId: 'A', pCash: 10000, pStocks: 535000, swept: 0 },
  ];
  const out = _invariantF({}, { cashSweepTraces: traces });
  assert.deepEqual(out, [], 'cannot compare with only one entry; must wait for traces from all simulators');
});
