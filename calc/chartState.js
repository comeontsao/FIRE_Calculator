/*
 * calc/chartState.js — single source of truth for interactive FIRE-age state.
 *
 * Inputs:
 *   None directly from consumers. Receives events from:
 *     - calc/fireCalculator.js  via setCalculated(age, feasible)
 *     - HTML user-gesture glue  via setOverride(age) / clearOverride()
 *     - solver-mode-switch glue via revalidateFeasibilityAt(age, feasible)
 *
 * Outputs: EffectiveFireAgeState
 *   {
 *     calculatedFireAge: number | null,    // last solver result, null pre-hydration
 *     overrideFireAge:   number | null,    // null when no override active
 *     effectiveFireAge:  number | null,    // overrideFireAge ?? calculatedFireAge
 *     source:            'calculated' | 'override',
 *     feasible:          boolean,          // feasibility at effectiveFireAge
 *   }
 *   Plus a subscription API: onChange(listener) -> unsubscribe.
 *
 * Consumers:
 *   FIRE-Dashboard.html and FIRE-Dashboard-Generic.html (identical set):
 *     - Full Portfolio Lifecycle chart
 *     - Roth Ladder / Lifetime Withdrawal chart
 *     - Portfolio Drawdown With-vs-Without SS chart
 *     - Timeline chart
 *     - Net Worth doughnut
 *     - Expense doughnut
 *     - Country bar chart
 *     - KPI cards: Years to FIRE, FIRE Net Worth, Progress %
 *     - Scenario card
 *     - Healthcare delta card
 *     - Coast FIRE indicator
 *     - Mortgage verdict card
 *     - Override banner
 *     - Reset control (visibility)
 *     - Confirm overlay (visibility)
 *     - Infeasibility banner
 *   tests/unit/chartState.test.js
 *
 * Invariants:
 *   - state.effectiveFireAge === state.overrideFireAge ?? state.calculatedFireAge.
 *   - state.source === (state.overrideFireAge !== null ? 'override' : 'calculated').
 *   - setCalculated atomically wipes overrideFireAge BEFORE listeners fire (FR-014).
 *   - revalidateFeasibilityAt mutates ONLY `feasible`. calculatedFireAge,
 *     overrideFireAge, effectiveFireAge, and source are unchanged (FR-015).
 *   - Each mutation method fires listeners exactly once, synchronously,
 *     in registration order, with a fully consistent state snapshot
 *     (no intermediate partial state observable — SC-009).
 *   - The `state` getter returns a frozen snapshot. Consumers cannot
 *     mutate it to corrupt internal state.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: pure-data (only stores integer ages + boolean feasible
 *     flags; no $-valued state lives in this module).
 *   Frame-conversion sites: NONE.
 */

/**
 * Internal mutable record. Never leaked directly — always wrapped in a
 * frozen snapshot via buildSnapshot() before crossing the module boundary.
 *
 * @type {{
 *   calculatedFireAge: number | null,
 *   overrideFireAge:   number | null,
 *   feasible:          boolean,
 * }}
 */
const internal = {
  calculatedFireAge: null,
  overrideFireAge: null,
  feasible: true,
};

/** @type {Array<(state: object) => void>} */
const listeners = [];

/**
 * Build a frozen, fully-derived snapshot of the public state shape.
 * Callers cannot mutate the returned object to corrupt `internal`.
 */
function buildSnapshot() {
  const effective = internal.overrideFireAge !== null
    ? internal.overrideFireAge
    : internal.calculatedFireAge;
  const source = internal.overrideFireAge !== null ? 'override' : 'calculated';
  return Object.freeze({
    calculatedFireAge: internal.calculatedFireAge,
    overrideFireAge: internal.overrideFireAge,
    effectiveFireAge: effective,
    source,
    feasible: internal.feasible,
  });
}

/**
 * Notify all current subscribers exactly once with a single, consistent
 * snapshot. Iterating a copy of the listener array means an unsubscribe
 * called by a listener does not skip a peer.
 */
function notify() {
  const snapshot = buildSnapshot();
  const targets = listeners.slice();
  for (const listener of targets) {
    listener(snapshot);
  }
}

const chartState = Object.freeze({
  /**
   * Read-only view of the current state. Returns a fresh frozen snapshot
   * each access — safe to destructure, impossible to mutate internals.
   */
  get state() {
    return buildSnapshot();
  },

  /**
   * Solver hook. Sets the calculated FIRE age, records feasibility,
   * and atomically wipes any active override before notifying.
   * Implements FR-014.
   *
   * @param {number} age
   * @param {boolean} feasible
   */
  setCalculated(age, feasible) {
    internal.calculatedFireAge = age;
    internal.overrideFireAge = null;
    internal.feasible = feasible;
    notify();
  },

  /**
   * User-gesture hook (confirm click). Marks the override and notifies.
   *
   * @param {number} age
   */
  setOverride(age) {
    internal.overrideFireAge = age;
    notify();
  },

  /**
   * User-gesture hook (reset click). Clears any active override and
   * returns to the calculated FIRE age.
   */
  clearOverride() {
    internal.overrideFireAge = null;
    notify();
  },

  /**
   * Solver-mode-switch hook. Updates ONLY the feasibility flag while
   * preserving the effective age and its source. Implements FR-015.
   *
   * The `age` argument documents which age was reevaluated — it is
   * intentionally not assigned anywhere because the contract forbids
   * touching effectiveFireAge / overrideFireAge / calculatedFireAge here.
   *
   * @param {number} _age      effective age that was reevaluated (informational)
   * @param {boolean} feasible feasibility under the newly-selected solver mode
   */
  // eslint-disable-next-line no-unused-vars
  revalidateFeasibilityAt(_age, feasible) {
    internal.feasible = feasible;
    notify();
  },

  /**
   * Subscribe to state changes. Listener fires synchronously in
   * registration order on every successful mutation, exactly once per
   * mutation. Returns an idempotent unsubscribe function.
   *
   * @param {(state: object) => void} listener
   * @returns {() => void}
   */
  onChange(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },
});

// ---- UMD-style module exports (Feature 015 follow-up) ----
// Converted from ES module to classic script so it loads under file:// (ES
// module imports require CORS-clean origins which file:// doesn't provide).
//
// CommonJS export for Node tests (tests/unit/chartState.test.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chartState };
}
// Browser global registration so classic <script src="calc/chartState.js">
// loads register chartState on window for the dashboard glue to consume.
if (typeof globalThis !== 'undefined') {
  globalThis.chartState = chartState;
}
