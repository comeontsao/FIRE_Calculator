/*
 * Feature 029 — US4 simulator-grossSpend-parity audit invariant (Bug C).
 *
 * Pins the new _invariantE in calc/calcAudit.js, exposed as
 * _invariantE_test_only_ for direct unit testing. Verifies:
 *
 *   1. Empty / undefined simulatorTraces → no warnings (graceful no-op).
 *   2. All simulator entries agree (diff ≤ $1) → no warnings.
 *   3. One outlier (diff > $1) → warning fires with structured fields.
 *   4. Multiple ages, only some violating → warning per offending age only.
 *
 * Contract: specs/029-withdrawal-spend-parity/contracts/grossSpend-parity.contract.md
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const calcAudit = require(path.join(__dirname, '..', '..', 'calc', 'calcAudit.js'));
const _invariantE = calcAudit._invariantE_test_only_;

test('Invariant E: empty simulatorTraces → zero warnings (graceful no-op)', () => {
  const out = _invariantE({}, { simulatorTraces: [] });
  assert.deepEqual(out, []);
});

test('Invariant E: undefined simulatorTraces → zero warnings (graceful no-op)', () => {
  const out = _invariantE({}, {});
  assert.deepEqual(out, []);
});

test('Invariant E: all simulators agree → zero warnings', () => {
  const traces = [
    { age: 57, simulatorId: 'computeWithdrawalStrategy', grossSpend: 102155 },
    { age: 57, simulatorId: '_simulateStrategyLifetime', grossSpend: 102155 },
    { age: 57, simulatorId: 'signedLifecycleEndBalance', grossSpend: 102155 },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.deepEqual(out, []);
});

test('Invariant E: outlier simulator at age 57 → one warning with structured fields', () => {
  const traces = [
    { age: 57, simulatorId: 'computeWithdrawalStrategy', grossSpend: 102155 },
    { age: 57, simulatorId: '_simulateStrategyLifetime', grossSpend: 73400 },  // BUG-A symptom: dropped overlays
    { age: 57, simulatorId: 'signedLifecycleEndBalance', grossSpend: 102155 },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.equal(out.length, 1, 'expected exactly one parity warning');
  const warn = out[0];
  assert.equal(warn.kind, 'simulator-grossSpend-parity');
  assert.equal(warn.age, 57);
  assert.equal(warn.expected, false);
  assert.equal(Math.round(warn.delta), 28755);  // 102155 - 73400
  assert.ok(warn.simulators, 'expected simulators map');
  assert.equal(warn.simulators['_simulateStrategyLifetime'], 73400);
  assert.equal(warn.simulators['computeWithdrawalStrategy'], 102155);
  assert.match(warn.reason, /grossSpend at age 57/);
  assert.ok(warn.dualBarSeries, 'expected dualBarSeries for audit panel rendering');
});

test('Invariant E: within $1 tolerance → no warning (floating-point noise filter)', () => {
  const traces = [
    { age: 57, simulatorId: 'computeWithdrawalStrategy', grossSpend: 102155.00 },
    { age: 57, simulatorId: '_simulateStrategyLifetime', grossSpend: 102155.50 },  // 0.5 diff
    { age: 57, simulatorId: 'signedLifecycleEndBalance', grossSpend: 102155.00 },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.deepEqual(out, [], 'sub-$1 diffs are floating-point noise and must not warn');
});

test('Invariant E: multiple ages, only one violating → exactly one warning at the offending age', () => {
  const traces = [
    { age: 55, simulatorId: 'A', grossSpend: 73400 },
    { age: 55, simulatorId: 'B', grossSpend: 73400 },
    { age: 57, simulatorId: 'A', grossSpend: 102155 },
    { age: 57, simulatorId: 'B', grossSpend: 73400 },   // violation here
    { age: 60, simulatorId: 'A', grossSpend: 102155 },
    { age: 60, simulatorId: 'B', grossSpend: 102155 },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.equal(out.length, 1, 'expected exactly one warning at age 57');
  assert.equal(out[0].age, 57);
});

test('Invariant E: single-simulator entry per age → no warning (need ≥2 to compare)', () => {
  const traces = [
    { age: 57, simulatorId: 'A', grossSpend: 102155 },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.deepEqual(out, [], 'cannot compare with only one entry; must wait for traces from all simulators');
});

test('Invariant E: malformed rows skipped silently', () => {
  const traces = [
    { age: 57, simulatorId: 'A', grossSpend: 102155 },
    { age: 57, simulatorId: 'B', grossSpend: 102155 },
    null,
    { age: 'not-a-number', simulatorId: 'C', grossSpend: 102155 },
    { age: 57, simulatorId: 'D', grossSpend: 'not-a-number' },
  ];
  const out = _invariantE({}, { simulatorTraces: traces });
  assert.deepEqual(out, [], 'malformed rows should not crash and should not produce false-positive warnings');
});
