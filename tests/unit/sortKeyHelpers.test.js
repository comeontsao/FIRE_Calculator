// ==================== TEST SUITE: sortKey helpers ====================
// Feature 015 Wave B foundational — pure-helper regression tests for
// computeCumulativeFederalTax + computeResidualArea per:
//   specs/015-calc-debt-cleanup/contracts/mode-objective-orthogonality.contract.md §4
//   specs/015-calc-debt-cleanup/research.md R8 (precision rules)
// =====================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ranker = require(path.resolve(__dirname, '..', '..', 'calc', 'strategyRanker.js'));
const { computeCumulativeFederalTax, computeResidualArea } = ranker;

test('sortKey: computeCumulativeFederalTax — empty / null / undefined returns 0', () => {
  assert.strictEqual(computeCumulativeFederalTax([]), 0);
  assert.strictEqual(computeCumulativeFederalTax(null), 0);
  assert.strictEqual(computeCumulativeFederalTax(undefined), 0);
  assert.strictEqual(computeCumulativeFederalTax('not an array'), 0);
});

test('sortKey: computeCumulativeFederalTax — sums federalTax field', () => {
  const rows = [
    { age: 50, federalTax: 1234.50 },
    { age: 51, federalTax: 2345.49 },
    { age: 52, federalTax: 3456.01 },
  ];
  // 1234.50 + 2345.49 + 3456.01 = 7036.00 → rounds to 7036
  assert.strictEqual(computeCumulativeFederalTax(rows), 7036);
});

test('sortKey: computeCumulativeFederalTax — legacy fallback to taxOrdinary + taxLTCG', () => {
  const rows = [
    { age: 50, taxOrdinary: 1000, taxLTCG: 200 },
    { age: 51, taxOrdinary: 500, taxLTCG: 100 },
  ];
  // 1200 + 600 = 1800
  assert.strictEqual(computeCumulativeFederalTax(rows), 1800);
});

test('sortKey: computeCumulativeFederalTax — rounds to nearest dollar (R8 precision)', () => {
  const rows = [
    { age: 50, federalTax: 0.4 },  // rounds individually would lose precision
    { age: 51, federalTax: 0.4 },
    { age: 52, federalTax: 0.4 },
  ];
  // sum = 1.2 → rounds to 1
  assert.strictEqual(computeCumulativeFederalTax(rows), 1);
});

test('sortKey: computeCumulativeFederalTax — ignores rows without tax fields', () => {
  const rows = [
    { age: 50, total: 100000 },           // no tax fields
    { age: 51, federalTax: 500 },
    { age: 52 },                          // empty
  ];
  assert.strictEqual(computeCumulativeFederalTax(rows), 500);
});

test('sortKey: computeCumulativeFederalTax — guards against NaN', () => {
  const rows = [
    { age: 50, federalTax: NaN },
    { age: 51, federalTax: 1000 },
    { age: 52, federalTax: Infinity },
  ];
  assert.strictEqual(computeCumulativeFederalTax(rows), 1000);
});

test('sortKey: computeResidualArea — empty / null returns 0', () => {
  assert.strictEqual(computeResidualArea([]), 0);
  assert.strictEqual(computeResidualArea(null), 0);
  assert.strictEqual(computeResidualArea(undefined), 0);
});

test('sortKey: computeResidualArea — sums total field', () => {
  const rows = [
    { age: 50, total: 1_000_000 },
    { age: 51, total: 950_000 },
    { age: 52, total: 900_000 },
  ];
  assert.strictEqual(computeResidualArea(rows), 2_850_000);
});

test('sortKey: computeResidualArea — rounds to nearest dollar (R8)', () => {
  const rows = [
    { age: 50, total: 100.5 },
    { age: 51, total: 100.4 },
  ];
  // 200.9 → 201
  assert.strictEqual(computeResidualArea(rows), 201);
});

test('sortKey: computeResidualArea — Preserve > Drain (semantic check)', () => {
  // Two strategies, both end at $0 at age 95 (DWZ); preserve back-loads, drain front-loads
  const preserve = [
    { age: 50, total: 1_000_000 },
    { age: 51, total: 950_000 },
    { age: 52, total: 900_000 },
    { age: 53, total: 0 },
  ];
  const drain = [
    { age: 50, total: 700_000 },
    { age: 51, total: 400_000 },
    { age: 52, total: 100_000 },
    { age: 53, total: 0 },
  ];
  const preserveArea = computeResidualArea(preserve);
  const drainArea = computeResidualArea(drain);
  assert.strictEqual(preserveArea, 2_850_000);
  assert.strictEqual(drainArea, 1_200_000);
  assert.ok(preserveArea > drainArea, 'preserve should yield higher residualArea');
});

test('sortKey: helpers tie-break — equal residualArea must be deterministic', () => {
  // Two strategies with identical sums but different per-year shapes
  const a = [
    { age: 50, total: 500_000 },
    { age: 51, total: 500_000 },
  ];
  const b = [
    { age: 50, total: 700_000 },
    { age: 51, total: 300_000 },
  ];
  assert.strictEqual(computeResidualArea(a), computeResidualArea(b));
  // (Tie-breaker logic lives in the ranker, not the helper — this test pins
  // the expectation that helpers can produce ties and downstream sort needs
  // a deterministic tiebreaker chain per orthogonality contract §1.)
});
