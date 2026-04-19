/*
 * tests/unit/fireCalculator.test.js — locks the calc/fireCalculator.js contract (T039).
 *
 * Covers the four fixture classes from
 *   specs/001-modular-calc-engine/contracts/fireCalculator.contract.md §Fixtures:
 *     1. Canonical single-person — three-phase-retirement fixture.
 *     2. Couple sensitivity — doubling portfolioSecondary.taxableStocksReal
 *        MUST shift yearsToFire by ≥ 1 year relative to the single-person
 *        baseline. **Locks SC-005** (Generic solver accounts for secondary
 *        person; today's broken behavior: zero change).
 *     3. Coast-FIRE — already feasible; yearsToFire === 0, fireAge ===
 *        currentAgePrimary.
 *     4. Mode-switch matrix — same inputs under 'safe'|'exact'|'dieWithZero'
 *        MUST satisfy fireAge_safe >= fireAge_exact >= fireAge_dieWithZero.
 *
 * RED phase: calc/fireCalculator.js does not yet exist. The import below
 * will fail with ERR_MODULE_NOT_FOUND — expected until T047.
 *
 * Contract invariants (fireCalculator.contract.md §Invariants):
 *   - fireAge is integer; currentAgePrimary + yearsToFire === fireAge.
 *   - feasible:false ⇒ fireAge === endAge.
 *   - endBalanceReal === lifecycle[last].totalReal exactly.
 *   - solverMode respected per contract (safe adds buffers; dieWithZero
 *     drives endBalanceReal≈0).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFireAge } from '../../calc/fireCalculator.js';
import threePhase from '../fixtures/three-phase-retirement.js';
import parity from '../fixtures/rr-generic-parity.js';
import coastFire from '../fixtures/coast-fire.js';
import modeSwitchMatrix from '../fixtures/mode-switch-matrix.js';

test('fireCalculator: canonical single-person (three-phase-retirement) solves with correct structure', () => {
  const { inputs, expected } = threePhase;
  const result = solveFireAge({ inputs, helpers: {} });

  // Structural invariants — hold regardless of fixture lock-in state.
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.yearsToFire, 'number');
  assert.equal(typeof result.fireAge, 'number');
  assert.equal(typeof result.feasible, 'boolean');
  assert.equal(typeof result.endBalanceReal, 'number');
  assert.equal(typeof result.balanceAtUnlockReal, 'number');
  assert.equal(typeof result.balanceAtSSReal, 'number');
  assert.ok(Array.isArray(result.lifecycle), 'lifecycle array present');

  // Integer-age invariant: currentAgePrimary + yearsToFire === fireAge.
  assert.equal(
    inputs.currentAgePrimary + result.yearsToFire,
    result.fireAge,
    `currentAge + yearsToFire must === fireAge (got ${inputs.currentAgePrimary} + ${result.yearsToFire} vs ${result.fireAge})`,
  );

  // endBalanceReal === last lifecycle record's totalReal (exact).
  const last = result.lifecycle[result.lifecycle.length - 1];
  assert.ok(
    Math.abs(result.endBalanceReal - last.totalReal) < 1e-6,
    `endBalanceReal (${result.endBalanceReal}) must === lifecycle[last].totalReal (${last.totalReal})`,
  );

  // Fixture lock-in: if expected values are real numbers, assert equality;
  // otherwise only sane-range assertion until T047 GREEN pins values.
  if (typeof expected.yearsToFire === 'number') {
    assert.equal(result.yearsToFire, expected.yearsToFire, 'yearsToFire matches locked fixture');
    assert.equal(result.fireAge, expected.fireAge, 'fireAge matches locked fixture');
    assert.equal(result.feasible, expected.feasible, 'feasible matches locked fixture');
  } else {
    assert.ok(
      result.yearsToFire >= 0 && result.yearsToFire <= 100,
      `yearsToFire in sane range; got ${result.yearsToFire}`,
    );
    assert.ok(
      result.fireAge >= inputs.currentAgePrimary && result.fireAge <= inputs.endAge,
      `fireAge in sane range; got ${result.fireAge}`,
    );
  }
});

test('fireCalculator: couple sensitivity — doubling secondary portfolio changes yearsToFire ≥ 1yr (SC-005)', () => {
  // Baseline: strip secondary person entirely (single-person version of parity fixture).
  const parityInputs = parity.inputs;
  const {
    currentAgeSecondary: _dropAge,
    portfolioSecondary: _dropPortfolio,
    ssStartAgeSecondary: _dropSsAge,
    ...singlePersonInputs
  } = parityInputs;
  // Silence unused-var linters.
  void _dropAge; void _dropPortfolio; void _dropSsAge;

  const single = solveFireAge({ inputs: singlePersonInputs, helpers: {} });

  // Doubled-secondary: full couple with portfolioSecondary.taxableStocksReal × 2.
  const doubledSecondary = {
    ...parityInputs,
    portfolioSecondary: {
      ...parityInputs.portfolioSecondary,
      taxableStocksReal: parityInputs.portfolioSecondary.taxableStocksReal * 2,
    },
  };
  const doubled = solveFireAge({ inputs: doubledSecondary, helpers: {} });

  // Sanity: both results are well-formed.
  assert.equal(typeof single.yearsToFire, 'number');
  assert.equal(typeof doubled.yearsToFire, 'number');

  // SC-005: the secondary-person portfolio MUST materially affect the answer.
  // Today's broken behavior: doubling secondary produces zero change. A passing
  // calculator produces |delta| >= 1 year.
  const delta = Math.abs(doubled.yearsToFire - single.yearsToFire);
  assert.ok(
    delta >= 1,
    `doubling secondary.taxableStocksReal must change yearsToFire by ≥ 1yr (SC-005); got single=${single.yearsToFire}, doubled=${doubled.yearsToFire}, delta=${delta}`,
  );
});

test('fireCalculator: coast-FIRE case ⇒ yearsToFire === 0, fireAge === currentAge, feasible', () => {
  const { inputs, expected } = coastFire;
  const result = solveFireAge({ inputs, helpers: {} });

  assert.equal(
    result.yearsToFire,
    expected.yearsToFire, // locked as 0 in the fixture
    `coast-FIRE ⇒ yearsToFire === 0`,
  );
  assert.equal(result.fireAge, expected.fireAge, `fireAge === currentAge for coast case`);
  assert.equal(result.feasible, expected.feasible, 'coast case is feasible');
  assert.equal(
    inputs.currentAgePrimary + result.yearsToFire,
    result.fireAge,
    'integer-age identity holds',
  );
});

test('fireCalculator: mode-switch matrix — fireAge_safe >= fireAge_exact >= fireAge_dieWithZero', () => {
  const variants = modeSwitchMatrix.expected.variants;
  const safeInputs = variants.safe.inputs;
  const exactInputs = variants.exact.inputs;
  const dwzInputs = variants.dieWithZero.inputs;

  const safeResult = solveFireAge({ inputs: safeInputs, helpers: {} });
  const exactResult = solveFireAge({ inputs: exactInputs, helpers: {} });
  const dwzResult = solveFireAge({ inputs: dwzInputs, helpers: {} });

  // Structural assertions.
  assert.equal(typeof safeResult.fireAge, 'number');
  assert.equal(typeof exactResult.fireAge, 'number');
  assert.equal(typeof dwzResult.fireAge, 'number');

  // The monotonic invariant — load-bearing across all three modes.
  assert.ok(
    safeResult.fireAge >= exactResult.fireAge,
    `fireAge_safe (${safeResult.fireAge}) must be >= fireAge_exact (${exactResult.fireAge})`,
  );
  assert.ok(
    exactResult.fireAge >= dwzResult.fireAge,
    `fireAge_exact (${exactResult.fireAge}) must be >= fireAge_dieWithZero (${dwzResult.fireAge})`,
  );

  // Fixture-placeholder-aware per-mode assertions.
  for (const [mode, variant, actual] of [
    ['safe', variants.safe, safeResult],
    ['exact', variants.exact, exactResult],
    ['dieWithZero', variants.dieWithZero, dwzResult],
  ]) {
    if (typeof variant.fireAge === 'number') {
      assert.equal(actual.fireAge, variant.fireAge, `${mode}: fireAge matches locked fixture`);
    }
    if (typeof variant.feasible === 'boolean') {
      assert.equal(actual.feasible, variant.feasible, `${mode}: feasible matches locked fixture`);
    }
  }
});
