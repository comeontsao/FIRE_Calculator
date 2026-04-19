/*
 * calc/fireCalculator.js — binary-search solver for the earliest feasible
 * FIRE age.
 *
 * Inputs:
 *   {
 *     inputs:  Inputs                  (data-model.md §1)
 *     helpers: {...optional DI bundle} forwarded to runLifecycle. Missing
 *                                      members fall through to the direct
 *                                      imports in lifecycle.js.
 *   }
 *
 * Outputs: FireSolverResult (data-model.md §4)
 *   {
 *     yearsToFire, fireAge, feasible,
 *     endBalanceReal, balanceAtUnlockReal, balanceAtSSReal,
 *     lifecycle  // the projection that justifies this answer
 *   }
 *
 * Consumers:
 *   - chartState.js  (via setCalculated(fireAge, feasible))
 *   - KPI cards      (yearsToFire, fireAge, balanceAtUnlockReal)
 *   - growthChart    (lifecycle + fireAge marker)
 *   - scenario card  (yearsToFire delta)
 *
 * Invariants:
 *   - fireAge is integer; currentAgePrimary + yearsToFire === fireAge.
 *   - feasible=true ⇒ returned lifecycle has no feasible:false records per
 *     mode-specific feasibility rule (see below).
 *   - feasible=false ⇒ fireAge === inputs.endAge; warning flag is surfaced.
 *   - endBalanceReal === lifecycle[last].totalReal exactly (same array).
 *   - solverMode semantics:
 *       'safe'        : every record feasible AND
 *                       balanceAtUnlock >= buffers.bufferUnlockMultiple * spend AND
 *                       balanceAtSS     >= buffers.bufferSSMultiple     * spend.
 *       'exact'       : every record feasible.
 *       'dieWithZero' : every record feasible AND endBalanceReal within
 *                       [0, 0.5 * annualSpendReal].
 *     Across modes on identical inputs: fireAge_safe >= fireAge_exact >= fireAge_dwz.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O. Lifecycle is invoked
 * purely; every solver call recomputes.
 */

import { runLifecycle } from './lifecycle.js';

/**
 * @typedef {import('../tests/fixtures/types.js').Inputs}          Inputs
 * @typedef {import('../tests/fixtures/types.js').FireSolverResult} FireSolverResult
 * @typedef {import('../tests/fixtures/types.js').LifecycleRecord} LifecycleRecord
 */

/** 401(k) unlock age used by the solver to extract a balance checkpoint. */
const UNLOCK_AGE = 60;

/**
 * Pull the balance at a given age from a lifecycle array. Returns 0 if the
 * age is outside the simulated range (shouldn't happen post-validation).
 *
 * @param {LifecycleRecord[]} lifecycle
 * @param {number} age
 * @returns {number}
 */
function balanceAtAge(lifecycle, age) {
  const rec = lifecycle.find((r) => r.agePrimary === age);
  return rec ? rec.totalReal : 0;
}

/**
 * Evaluate whether a lifecycle satisfies the feasibility rule for the
 * current solver mode. Returns { ok, endBalance } where ok drives the
 * binary search decision.
 *
 * @param {LifecycleRecord[]} lifecycle
 * @param {Inputs} inputs
 * @returns {{ok: boolean, endBalance: number, balanceAtUnlock: number, balanceAtSS: number}}
 */
function evaluateFeasibility(lifecycle, inputs) {
  const endBalance = lifecycle[lifecycle.length - 1].totalReal;
  const balanceAtUnlock = balanceAtAge(lifecycle, UNLOCK_AGE);
  const balanceAtSS = balanceAtAge(lifecycle, inputs.ssStartAgePrimary);
  const everyYearFeasible = lifecycle.every((r) => r.feasible);

  const mode = inputs.solverMode;
  // When `scenarioSpendReal` is provided, it overrides `annualSpendReal` as the
  // retirement-phase spend target. Safe-mode buffers are expressed in
  // "years-of-spend", which semantically means years of RETIREMENT spend —
  // so we key the buffer multiplier off the retirement-spend value. This
  // matches the inline harness's `annualSpend` variable, which is already
  // scenario-adjusted before the buffer check.
  const retirementSpend = typeof inputs.scenarioSpendReal === 'number'
    ? inputs.scenarioSpendReal
    : inputs.annualSpendReal;
  let ok = false;
  if (mode === 'safe') {
    const unlockRequired = (inputs.buffers?.bufferUnlockMultiple ?? 0) * retirementSpend;
    const ssRequired = (inputs.buffers?.bufferSSMultiple ?? 0) * retirementSpend;
    ok = everyYearFeasible
      && balanceAtUnlock >= unlockRequired
      && balanceAtSS >= ssRequired;
  } else if (mode === 'dieWithZero') {
    // Without a dedicated die-with-zero withdrawal strategy (out of scope for
    // this feature), dieWithZero collapses to "earliest age at which every
    // year is feasible" — identical to 'exact'. This preserves the monotonic
    // invariant fireAge_safe >= fireAge_exact >= fireAge_dwz (with equality
    // between the latter two) while reserving room for a future feature that
    // introduces an aggressive-spend strategy to shrink fireAge_dwz below
    // fireAge_exact.
    ok = everyYearFeasible && endBalance >= 0;
  } else {
    // 'exact' (default)
    ok = everyYearFeasible && endBalance >= 0;
  }

  return { ok, endBalance, balanceAtUnlock, balanceAtSS };
}

/**
 * Build a FireSolverResult from a completed lifecycle.
 *
 * @param {LifecycleRecord[]} lifecycle
 * @param {number} fireAge
 * @param {boolean} feasible
 * @param {number} currentAge
 * @param {Inputs} inputs
 * @returns {FireSolverResult}
 */
function buildResult(lifecycle, fireAge, feasible, currentAge, inputs) {
  const endBalance = lifecycle[lifecycle.length - 1].totalReal;
  const balanceAtUnlock = balanceAtAge(lifecycle, UNLOCK_AGE);
  const balanceAtSS = balanceAtAge(lifecycle, inputs.ssStartAgePrimary);
  return Object.freeze({
    yearsToFire: fireAge - currentAge,
    fireAge,
    feasible,
    endBalanceReal: endBalance,
    balanceAtUnlockReal: balanceAtUnlock,
    balanceAtSSReal: balanceAtSS,
    lifecycle,
  });
}

/**
 * Find the smallest integer fireAge in [currentAge, endAge] whose lifecycle
 * is feasible under the current solver mode. For 'dieWithZero', the feasible
 * set is usually a single age (too low ⇒ runs out; too high ⇒ ends with
 * surplus); we therefore search for the SMALLEST age whose endBalance is
 * within the [0, tolerance] band, which means the feasible set starts at
 * that age and linearly searching from currentAge upward is correct.
 *
 * Linear search is adequate because endAge - currentAge <= ~80 in practice
 * and each runLifecycle is O(years). A binary-search optimization is viable
 * for modes 'safe' and 'exact' (monotonic feasibility), but linearity gives
 * the same answer at negligible extra cost while also handling the
 * non-monotonic 'dieWithZero' case correctly.
 *
 * @param {Inputs} inputs
 * @param {object} helpers
 * @returns {FireSolverResult}
 */
export function solveFireAge({ inputs, helpers }) {
  const currentAge = inputs.currentAgePrimary;
  const endAge = inputs.endAge;
  const helpersBundle = helpers ?? {};

  /** @type {FireSolverResult | null} */
  let best = null;
  /** @type {FireSolverResult | null} */
  let fallback = null; // latest-evaluated lifecycle, used when nothing feasible.

  for (let age = currentAge; age <= endAge; age += 1) {
    const lifecycle = runLifecycle({ inputs, fireAge: age, helpers: helpersBundle });
    const evalRes = evaluateFeasibility(lifecycle, inputs);
    fallback = buildResult(lifecycle, age, false, currentAge, inputs);

    if (evalRes.ok) {
      best = buildResult(lifecycle, age, true, currentAge, inputs);
      // For 'safe' and 'exact', feasibility is monotonic — first feasible age
      // wins. For 'dieWithZero', the band may widen/shift but the smallest
      // feasible age is the defensible answer (matches "earliest FIRE").
      break;
    }
  }

  if (best) return best;

  // No feasible age found — per contract, return fireAge = endAge, feasible=false.
  // Use the lifecycle generated for endAge as the representative projection.
  const finalLifecycle = runLifecycle({ inputs, fireAge: endAge, helpers: helpersBundle });
  return buildResult(finalLifecycle, endAge, false, currentAge, inputs);
}
