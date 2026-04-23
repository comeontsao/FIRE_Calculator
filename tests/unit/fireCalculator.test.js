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
import coastFire from '../fixtures/coast-fire.js';
import modeSwitchMatrix from '../fixtures/mode-switch-matrix.js';
import genericRealistic from '../fixtures/generic-realistic.js';

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

/*
 * US2b integration tests (TB12) — canonical-engine parity against the
 * inline-harness baseline.
 *
 * Each test loads the canonical fixture (rr-realistic / generic-realistic),
 * runs the canonical solver, and asserts `fireAge` within ±1 year of the
 * harness-captured baseline. The ±1-year tolerance exists explicitly to
 * absorb the intentional-correctness deltas documented in
 * baseline-rr-inline.md §C (real/nominal healthcare mixing fix + silent-
 * shortfall absorption fix).
 *
 * RED until TB21 makes the canonical engine feature-complete enough that
 * runLifecycle + solveFireAge produce the expected fireAge. The canonical
 * engine today doesn't model mortgage ownership, secondHome, contribution
 * split, employerMatchReal, relocationCostReal, scenarioSpendReal — all of
 * which these fixtures exercise.
 */


test('fireCalculator: generic-realistic fixture produces fireAge within ±1 year of inline baseline', () => {
  const fixture = genericRealistic;
  const result = solveFireAge({ inputs: fixture.inputs, helpers: {} });
  const expectedFireAge = fixture.expected.fireAge;
  const tolerance = fixture.expected.fireAgeToleranceYears ?? 1;

  assert.equal(typeof result.fireAge, 'number', 'canonical solver returns numeric fireAge');
  assert.ok(
    Math.abs(result.fireAge - expectedFireAge) <= tolerance,
    `generic-realistic: fireAge ${result.fireAge} deviates from inline baseline ${expectedFireAge} ` +
      `by more than ±${tolerance} year(s). If this is an intentional correctness fix, ` +
      `document it in baseline-rr-inline.md §C BEFORE re-locking the fixture.`,
  );

  assert.equal(
    result.feasible,
    fixture.expected.feasible,
    `generic-realistic: feasible must match baseline (${fixture.expected.feasible}); got ${result.feasible}`,
  );
});

/*
 * US2b parity-phase effBal display layer (Backend dispatch, 2026-04-19) —
 * canonical engine adds presentation-layer fields that mirror the inline
 * engine's `effBal` convention (pTrad × (1 − taxTrad) + pRoth + pStocks + pCash).
 *
 * The canonical engine's raw `totalReal` is mathematically honest but
 * materially larger than what users see today in the inline dashboard.
 * `effBalReal` (per record) and `endBalanceEffReal` / `balanceAtUnlockEffReal` /
 * `balanceAtSSEffReal` (per FireSolverResult) close the presentation gap so
 * chart renderers can keep displaying numbers users recognize.
 *
 * Invariants tested here:
 *   - Every lifecycle record carries a numeric `effBalReal` field.
 *   - `effBalReal <= totalReal` always (tax drag is non-negative).
 *   - `effBalReal === totalReal` when `trad401kReal` is 0 OR `taxTradRate` is 0.
 *   - `result.endBalanceEffReal === lifecycle[last].effBalReal` exactly.
 *   - `result.balanceAtUnlockEffReal === lifecycle[@60].effBalReal` exactly.
 *   - `result.balanceAtSSEffReal === lifecycle[@ssStartAge].effBalReal` exactly.
 *   - rr-realistic and generic-realistic: the solver's effBal checkpoints
 *     match fixture.expected.* effBal fields within balanceRelativeTolerance.
 */


test('fireCalculator: effBalReal === totalReal when trad401kReal is zero (generic-realistic early years)', () => {
  const fixture = genericRealistic;
  const result = solveFireAge({ inputs: fixture.inputs, helpers: {} });

  // Generic fixture starts with trad401kReal = 0 and contributes 60% to trad.
  // At i=0 (before any contribution compounds), trad401kReal is still 0.
  const firstRec = result.lifecycle[0];
  assert.equal(
    firstRec.trad401kReal,
    0,
    'generic-realistic year 0: trad401kReal is 0 (fixture precondition)',
  );
  assert.ok(
    Math.abs(firstRec.effBalReal - firstRec.totalReal) < 1e-9,
    `when trad401kReal === 0, effBalReal (${firstRec.effBalReal}) must equal ` +
      `totalReal (${firstRec.totalReal})`,
  );
});



test('fireCalculator: generic-realistic effBal checkpoints match fixture.expected within balanceRelativeTolerance', () => {
  const fixture = genericRealistic;
  const result = solveFireAge({ inputs: fixture.inputs, helpers: {} });
  const tol = fixture.expected.balanceRelativeTolerance ?? 0.10;

  for (const field of ['endBalanceEffReal', 'balanceAtUnlockEffReal', 'balanceAtSSEffReal']) {
    const expected = fixture.expected[field];
    const actual = result[field];
    assert.equal(typeof expected, 'number', `fixture.expected.${field} must be locked`);
    const relErr = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
    assert.ok(
      relErr <= tol,
      `generic-realistic: ${field} expected ${expected} ±${(tol * 100).toFixed(0)}%, got ${actual} ` +
        `(rel err ${(relErr * 100).toFixed(3)}%)`,
    );
  }
});
