/*
 * tests/baseline/browser-smoke.test.js — browser-smoke regression harness.
 *
 * Feature: specs/003-browser-smoke-harness/
 *
 * Purpose: prove the canonical calc engine (calc/*.js) consumes each
 * dashboard's cold-load form defaults without throwing and returns a
 * `FireSolverResult` with every field present and correctly typed. Also
 * locks the RR-path ↔ Generic-path parity contract so feature 004's real
 * adapter swap starts detecting drift automatically.
 *
 * This file is a GATE, not a product. Zero deps; Node built-ins only.
 * Runs via `bash tests/runner.sh` locally and `.github/workflows/tests.yml`
 * in CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Defaults snapshots — frozen legacy-shape objects mirroring each dashboard's
// cold-load form state. When the HTML form defaults change, update these.
import RR_DEFAULTS from './rr-defaults.mjs';
import GENERIC_DEFAULTS from './generic-defaults.mjs';

// Canonical calc engine — full helpers bundle.
import { makeInflation } from '../../calc/inflation.js';
import { computeTax } from '../../calc/tax.js';
import { computeWithdrawal } from '../../calc/withdrawal.js';
import { projectSS } from '../../calc/socialSecurity.js';
import { getHealthcareCost } from '../../calc/healthcare.js';
import { resolveMortgage, computeMortgage } from '../../calc/mortgage.js';
import { computeCollegeCosts } from '../../calc/college.js';
import { resolveSecondHome } from '../../calc/secondHome.js';
import { computeStudentLoan } from '../../calc/studentLoan.js';
import { solveFireAge } from '../../calc/fireCalculator.js';

// Production adapter — feature 005 replaces the inline prototype that lived
// here for feature 003. See specs/005-canonical-public-launch/contracts/adapter.contract.md.
import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';

// Parity fixture — canonical couple used by the parity smoke (degenerate
// today; activates real divergence when feature 004 lands personal-rr.js).
import parityFixture from '../fixtures/rr-generic-parity.js';

/**
 * Build the DI helpers bundle expected by `solveFireAge`. `calc/lifecycle.js`
 * falls back to direct imports for any helper not supplied, but providing
 * the full bundle exercises the injection path and matches the shape the
 * HTML module bootstrap will use in feature 004.
 *
 * @param {object} inputs   canonical Inputs shape (for inflation's base year)
 * @returns {object}        helpers bundle
 */
function buildHelpers(inputs) {
  const baseYear = typeof inputs.baseYear === 'number' ? inputs.baseYear : new Date().getFullYear();
  // Per calc/lifecycle.js runLifecycle: each helpers.* slot is the FUNCTION
  // itself (e.g., `helpers.socialSecurity ?? projectSS`), not an object
  // wrapping the function. Supplying the direct function form mirrors the
  // fallback path exactly.
  return Object.freeze({
    inflation: makeInflation(inputs.inflationRate, baseYear),
    tax: computeTax,
    withdrawal: computeWithdrawal,
    socialSecurity: projectSS,
    healthcare: getHealthcareCost,
    mortgage: resolveMortgage,
    college: computeCollegeCosts,
    secondHome: resolveSecondHome,
    studentLoan: computeStudentLoan,
  });
}

// ============================================================================
// Test 1 — RR cold-load smoke
// ============================================================================

test('RR cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on RR defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = getCanonicalInputs(RR_DEFAULTS); },
    'RR smoke: getCanonicalInputs threw on RR_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/rr-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical RR inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'RR smoke: solveFireAge threw on canonical RR inputs. '
      + 'Check that getCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `RR smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `RR smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `RR smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `RR smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `RR smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `RR smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `RR smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `RR smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `RR smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 2 — Generic cold-load smoke
// ============================================================================

test('Generic cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on Generic defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = getCanonicalInputs(GENERIC_DEFAULTS); },
    'Generic smoke: getCanonicalInputs threw on GENERIC_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/generic-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical Generic inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'Generic smoke: solveFireAge threw on canonical Generic inputs. '
      + 'Check that getCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `Generic smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `Generic smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `Generic smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `Generic smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `Generic smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `Generic smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `Generic smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `Generic smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `Generic smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 3 — Parity smoke (RR-path vs Generic-path)
// ============================================================================

/**
 * Fields to compare between the RR-path and Generic-path outputs. Excludes
 * `lifecycle` (per smoke-harness.contract.md §Test 3 — too large for byte-
 * identity; feature 004 may add per-record parity).
 */
const PARITY_FIELDS = Object.freeze([
  'yearsToFire',
  'fireAge',
  'feasible',
  'endBalanceReal',
  'balanceAtUnlockReal',
  'balanceAtSSReal',
]);

test('Parity smoke: RR-path and Generic-path outputs match on non-divergent fields', () => {
  // The parity fixture already holds a CANONICAL Inputs object (not the
  // legacy inp shape). Feature 004's personal-rr.js will enrich canonical
  // inputs directly, so the adapter-path exercise happens through the two
  // cold-load smokes above (which DO drive `getCanonicalInputs` end-to-end).
  // TODAY: we feed the canonical inputs directly to solveFireAge on both
  // paths — the adapter is a no-op on already-canonical data, and both paths
  // compute identically (degenerate-today semantics; research.md §R3).

  // rrPath — feature 004 will extend this with a personal-rr.js adapter call.
  const rrInputs = parityFixture.inputs; // canonical; RR-path is passthrough today
  // genericPath — direct canonical, no adapter.
  const genericInputs = parityFixture.inputs;

  const helpers = buildHelpers(rrInputs);
  const rrResult = solveFireAge({ inputs: rrInputs, helpers });
  const genericResult = solveFireAge({ inputs: genericInputs, helpers });

  // Apply the fixture's `divergent[]` allowlist. A field listed in
  // `divergent` is legitimately expected to differ (e.g., SS projections
  // when RR uses actual earnings vs Generic's curve). Fields not in the
  // allowlist MUST be byte-identical between the two paths.
  const divergent = new Set(parityFixture.divergent ?? []);

  for (const field of PARITY_FIELDS) {
    if (divergent.has(field)) continue;
    assert.deepStrictEqual(
      rrResult[field],
      genericResult[field],
      `Parity smoke: field '${field}' drifted between RR-path and Generic-path.\n`
        + `  rrPath:      ${JSON.stringify(rrResult[field])}\n`
        + `  genericPath: ${JSON.stringify(genericResult[field])}\n`
        + `Either (1) update the RR-path adapter to align, OR (2) add '${field}' to `
        + `tests/fixtures/rr-generic-parity.js divergent[] with a comment explaining `
        + `the legitimate divergence.`,
    );
  }
});
