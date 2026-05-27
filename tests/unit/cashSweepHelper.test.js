/*
 * Feature 030 — Cash-sweep helper pure-function tests.
 *
 * Pins the contract in specs/030-cash-sweep-stocks/contracts/cash-sweep.contract.md
 * for the _applyCashSweep helper.
 *
 * Decision table (canonical):
 *   - enabled === false → no-op
 *   - enabled && age <= currentAge (year 0) → no-op (preservation rule)
 *   - enabled && age > currentAge && pCash <= threshold → no-op
 *   - enabled && age > currentAge && pCash > threshold → sweep excess
 *   - NaN / Infinity inputs → defensive no-op
 *   - threshold < 0 → clamped to 0
 *   - age-agnostic threshold (real-$ frame, never multiplied by inflation)
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { _applyCashSweep } = require(path.join(__dirname, '..', '..', 'calc', 'cashSweep.js'));

const CURRENT_AGE = 42;

test('toggle OFF → no-op, swept = 0', () => {
  const out = _applyCashSweep(80000, 465000, 10000, 43, CURRENT_AGE, false);
  assert.deepEqual(out, { pCash: 80000, pStocks: 465000, swept: 0 });
});

test('year 0 (age === currentAge) → no-op even if pCash > threshold (year-0 preservation)', () => {
  const out = _applyCashSweep(80000, 465000, 10000, 42, CURRENT_AGE, true);
  assert.deepEqual(out, { pCash: 80000, pStocks: 465000, swept: 0 });
});

test('year 1 + pCash > threshold → sweep fires', () => {
  const out = _applyCashSweep(80000, 465000, 10000, 43, CURRENT_AGE, true);
  assert.equal(out.pCash, 10000);
  assert.equal(out.pStocks, 465000 + 70000); // = 535000
  assert.equal(out.swept, 70000);
});

test('year 1 + pCash <= threshold → no-op', () => {
  const out = _applyCashSweep(5000, 465000, 10000, 43, CURRENT_AGE, true);
  assert.deepEqual(out, { pCash: 5000, pStocks: 465000, swept: 0 });
});

test('year 1 + pCash exactly equal to threshold → no-op (strict greater-than)', () => {
  const out = _applyCashSweep(10000, 465000, 10000, 43, CURRENT_AGE, true);
  assert.deepEqual(out, { pCash: 10000, pStocks: 465000, swept: 0 });
});

test('threshold = 0 → sweep everything to stocks (year 1+)', () => {
  const out = _applyCashSweep(80000, 465000, 0, 43, CURRENT_AGE, true);
  assert.equal(out.pCash, 0);
  assert.equal(out.pStocks, 465000 + 80000);
  assert.equal(out.swept, 80000);
});

test('threshold = $10M (very large) → effectively never sweeps', () => {
  const out = _applyCashSweep(80000, 465000, 10000000, 43, CURRENT_AGE, true);
  assert.deepEqual(out, { pCash: 80000, pStocks: 465000, swept: 0 });
});

test('threshold < 0 → clamped to 0 internally', () => {
  const out = _applyCashSweep(80000, 465000, -1000, 43, CURRENT_AGE, true);
  assert.equal(out.pCash, 0);
  assert.equal(out.pStocks, 465000 + 80000);
  assert.equal(out.swept, 80000);
});

test('pCash = 0 + threshold > 0 → no-op (nothing to sweep)', () => {
  const out = _applyCashSweep(0, 465000, 10000, 43, CURRENT_AGE, true);
  assert.deepEqual(out, { pCash: 0, pStocks: 465000, swept: 0 });
});

test('NaN pCash → defensive no-op (preserves whatever was passed in)', () => {
  const out = _applyCashSweep(NaN, 465000, 10000, 43, CURRENT_AGE, true);
  assert.ok(Number.isNaN(out.pCash));
  assert.equal(out.pStocks, 465000);
  assert.equal(out.swept, 0);
});

test('Infinity pStocks → defensive no-op', () => {
  const out = _applyCashSweep(80000, Infinity, 10000, 43, CURRENT_AGE, true);
  assert.equal(out.pCash, 80000);
  assert.ok(!Number.isFinite(out.pStocks));
  assert.equal(out.swept, 0);
});

test('age-agnostic threshold: same $10K threshold at age 50, 70, 100 all sweep to same pCash', () => {
  // Real-$ frame: threshold is NEVER multiplied by inflation. The helper sees
  // a constant threshold value regardless of the simulated age. This pins
  // FR-003 (real-$ frame consistency).
  const out50 = _applyCashSweep(50000, 100000, 10000, 50, CURRENT_AGE, true);
  const out70 = _applyCashSweep(50000, 100000, 10000, 70, CURRENT_AGE, true);
  const out100 = _applyCashSweep(50000, 100000, 10000, 100, CURRENT_AGE, true);
  assert.equal(out50.pCash, 10000);
  assert.equal(out70.pCash, 10000);
  assert.equal(out100.pCash, 10000);
  assert.equal(out50.swept, 40000);
  assert.equal(out70.swept, 40000);
  assert.equal(out100.swept, 40000);
});

test('partial-FIRE-year (fractional age) is treated as a normal year-1+ age', () => {
  // age = 42.5, currentAge = 42 → age > currentAge → sweep fires.
  const out = _applyCashSweep(80000, 465000, 10000, 42.5, CURRENT_AGE, true);
  assert.equal(out.pCash, 10000);
  assert.equal(out.swept, 70000);
});

test('one-shot event year (post-event pCash) sweeps correctly', () => {
  // Simulates a year where a home sale dumped cash above threshold.
  // The simulator would have applied the one-shot before calling the helper.
  const out = _applyCashSweep(250000, 465000, 10000, 55, CURRENT_AGE, true);
  assert.equal(out.pCash, 10000);
  assert.equal(out.pStocks, 465000 + 240000);
  assert.equal(out.swept, 240000);
});
