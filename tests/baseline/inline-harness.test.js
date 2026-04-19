/**
 * tests/baseline/inline-harness.test.js — self-regression for the inline-engine port.
 *
 * This test locks the harness's output against a frozen set of baseline
 * constants captured at extraction time. If the harness drifts — either
 * because of an accidental edit to inline-harness.mjs, or a mutation to the
 * canonical input fixtures — this test fails and the maintainer must either
 * (a) confirm the drift is intentional and update the locked values, or
 * (b) fix the drift.
 *
 * This is NOT yet the canonical-vs-inline parity test (that's a US2b TB21
 * deliverable). It only asserts that:
 *   (1) the harness runs without throwing on both canonical input sets;
 *   (2) it produces the values documented in baseline-rr-inline.md §A.observed
 *       and §B.observed.
 *
 * When US2b's canonical engine reaches parity, a second test file will
 * diff `calc/fireCalculator.js` output against the constants below (or a
 * ±tolerance variant) to detect regression.
 *
 * Runner: node --test (zero-dependency, per constitution Principle V).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runInlineLifecycle } from './inline-harness.mjs';
import rrBundle from './inputs-rr.mjs';
import genericBundle from './inputs-generic.mjs';

// ============================================================================
// LOCKED BASELINE VALUES
// ============================================================================
// Captured via `node tests/baseline/run-and-report.mjs` at extraction time.
// These numbers are authoritative — they supersede the §A.observed /
// §B.observed markdown tables (if those ever drift, the test catches it).
//
// Format: one block per (dashboard × mode). Balances are real dollars.

const EXPECTED_RR_SAFE = Object.freeze({
  fireAge: 54,
  yearsToFire: 11,
  feasible: true,
  balanceAtUnlockReal: 704_027.3485328711,
  balanceAtSSReal: 344_907.56295162806,
  endBalanceReal: 618_741.269361183,
});

const EXPECTED_RR_EXACT = Object.freeze({
  fireAge: 54,
  yearsToFire: 11,
  feasible: true,
  balanceAtUnlockReal: 704_027.3485328711,
  balanceAtSSReal: 344_907.56295162806,
  endBalanceReal: 618_741.269361183,
});

const EXPECTED_RR_DWZ = Object.freeze({
  // DWZ does month-precise interpolation; fireAge is the integer-year
  // "chart rounds up" value. yearsToFire is the interpolated year count.
  fireAge: 53,   // 43 + 10
  yearsToFire: 10,
  feasible: true,
  // sim fields represent the feasible-side iteration (y=11 / age 54).
  balanceAtUnlockReal: 704_027.3485328711,
  balanceAtSSReal: 344_907.56295162806,
  endBalanceReal: 618_741.269361183,
});

const EXPECTED_GENERIC_SAFE = Object.freeze({
  fireAge: 65,
  yearsToFire: 29,
  feasible: true,
  balanceAtUnlockReal: 520_393.7628851099,
  balanceAtSSReal: 389_735.3339365349,
  endBalanceReal: 164_650.18542454194,
});

const EXPECTED_GENERIC_EXACT = Object.freeze({
  fireAge: 65,
  yearsToFire: 29,
  feasible: true,
  balanceAtUnlockReal: 520_393.7628851099,
  balanceAtSSReal: 389_735.3339365349,
  endBalanceReal: 164_650.18542454194,
});

const EXPECTED_GENERIC_DWZ = Object.freeze({
  fireAge: 64,  // 36 + 28
  yearsToFire: 28,
  feasible: true,
  balanceAtUnlockReal: 520_393.7628851099,
  balanceAtSSReal: 389_735.3339365349,
  endBalanceReal: 164_650.18542454194,
});

// Exact equality tolerance — balances are computed with pure floating-point
// arithmetic, so we compare to full precision. If a future JS engine changes
// FP ordering and introduces sub-$1 drift, bump this to 1e-6.
const EPS = 1e-9;

function assertBaseline(label, actual, expected) {
  assert.equal(actual.fireAge, expected.fireAge, `${label}: fireAge`);
  assert.equal(actual.yearsToFire, expected.yearsToFire, `${label}: yearsToFire`);
  assert.equal(actual.feasible, expected.feasible, `${label}: feasible`);
  assert.ok(
    Math.abs(actual.balanceAtUnlockReal - expected.balanceAtUnlockReal) < EPS,
    `${label}: balanceAtUnlockReal expected ${expected.balanceAtUnlockReal} got ${actual.balanceAtUnlockReal}`,
  );
  assert.ok(
    Math.abs(actual.balanceAtSSReal - expected.balanceAtSSReal) < EPS,
    `${label}: balanceAtSSReal expected ${expected.balanceAtSSReal} got ${actual.balanceAtSSReal}`,
  );
  assert.ok(
    Math.abs(actual.endBalanceReal - expected.endBalanceReal) < EPS,
    `${label}: endBalanceReal expected ${expected.endBalanceReal} got ${actual.endBalanceReal}`,
  );
}

// ============================================================================
// TESTS
// ============================================================================

test('inline-harness: runs without error on RR canonical', () => {
  const r = runInlineLifecycle({ ...rrBundle, mode: 'safe' });
  assert.equal(typeof r, 'object');
  assert.equal(typeof r.fireAge, 'number');
  assert.equal(typeof r.yearsToFire, 'number');
  assert.equal(typeof r.feasible, 'boolean');
});

test('inline-harness: runs without error on Generic canonical', () => {
  const r = runInlineLifecycle({ ...genericBundle, mode: 'safe' });
  assert.equal(typeof r, 'object');
  assert.equal(typeof r.fireAge, 'number');
});

test('inline-harness: RR canonical locks §A.observed (safe mode)', () => {
  const r = runInlineLifecycle({ ...rrBundle, mode: 'safe' });
  assertBaseline('RR/safe', r, EXPECTED_RR_SAFE);
});

test('inline-harness: RR canonical locks §A.observed (exact mode, terminalBuffer=0)', () => {
  const r = runInlineLifecycle({ ...rrBundle, mode: 'exact', terminalBufferYears: 0 });
  assertBaseline('RR/exact', r, EXPECTED_RR_EXACT);
});

test('inline-harness: RR canonical locks §A.observed (dieWithZero mode)', () => {
  const r = runInlineLifecycle({ ...rrBundle, mode: 'dieWithZero' });
  assertBaseline('RR/DWZ', r, EXPECTED_RR_DWZ);
});

test('inline-harness: Generic canonical locks §B.observed (safe mode)', () => {
  const r = runInlineLifecycle({ ...genericBundle, mode: 'safe' });
  assertBaseline('Generic/safe', r, EXPECTED_GENERIC_SAFE);
});

test('inline-harness: Generic canonical locks §B.observed (exact mode, terminalBuffer=0)', () => {
  const r = runInlineLifecycle({ ...genericBundle, mode: 'exact', terminalBufferYears: 0 });
  assertBaseline('Generic/exact', r, EXPECTED_GENERIC_EXACT);
});

test('inline-harness: Generic canonical locks §B.observed (dieWithZero mode)', () => {
  const r = runInlineLifecycle({ ...genericBundle, mode: 'dieWithZero' });
  assertBaseline('Generic/DWZ', r, EXPECTED_GENERIC_DWZ);
});

test('inline-harness: Safe-mode RR buffers are honored (fireAge >= buffer threshold)', () => {
  // Meta-check: the Safe-mode answer must satisfy the inline engine's
  // Safe-mode gate by construction. If solver ever drifts, this catches it
  // independently of the locked constants above.
  const r = runInlineLifecycle({ ...rrBundle, mode: 'safe' });
  const annualSpend = r.annualSpend;
  const bufUnlock = rrBundle.inputs.bufferUnlock * annualSpend;
  const bufSS = rrBundle.inputs.bufferSS * annualSpend;
  assert.ok(r.balanceAtUnlockReal >= bufUnlock,
    `balanceAtUnlock ${r.balanceAtUnlockReal} < bufUnlock ${bufUnlock}`);
  assert.ok(r.balanceAtSSReal >= bufSS,
    `balanceAtSS ${r.balanceAtSSReal} < bufSS ${bufSS}`);
  assert.ok(r.endBalanceReal >= 0, `endBalance ${r.endBalanceReal} < 0`);
});

test('inline-harness: canonical inputs are frozen (immutability guard)', () => {
  // Principle from common/coding-style.md: never mutate inputs. The fixture
  // modules Object.freeze everything; confirm that contract holds.
  assert.ok(Object.isFrozen(rrBundle), 'rrBundle must be frozen');
  assert.ok(Object.isFrozen(rrBundle.inputs), 'rrBundle.inputs must be frozen');
  assert.ok(Object.isFrozen(rrBundle.env), 'rrBundle.env must be frozen');
  assert.ok(Object.isFrozen(genericBundle), 'genericBundle must be frozen');
  assert.ok(Object.isFrozen(genericBundle.inputs), 'genericBundle.inputs must be frozen');
  assert.ok(Object.isFrozen(genericBundle.env), 'genericBundle.env must be frozen');
});

test('inline-harness: mode ordering holds (Safe >= Exact >= DWZ fireAge)', () => {
  // Cross-mode invariant from the spec/contract: Safe is strictest (latest),
  // DWZ is loosest (earliest). On these canonical inputs, Safe and Exact
  // happen to coincide, and DWZ is 1 year earlier. Future spec changes that
  // break this ordering would be caught here.
  const safe = runInlineLifecycle({ ...rrBundle, mode: 'safe' });
  const exact = runInlineLifecycle({ ...rrBundle, mode: 'exact', terminalBufferYears: 0 });
  const dwz = runInlineLifecycle({ ...rrBundle, mode: 'dieWithZero' });
  assert.ok(safe.fireAge >= exact.fireAge,
    `Safe ${safe.fireAge} < Exact ${exact.fireAge}`);
  assert.ok(exact.fireAge >= dwz.fireAge,
    `Exact ${exact.fireAge} < DWZ ${dwz.fireAge}`);
});
