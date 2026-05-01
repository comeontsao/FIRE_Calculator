/*
 * =============================================================================
 * MODULE: calc/fireAgeResolver.js
 *
 * Feature: 020-validation-audit (User Story 4c — month-precision header)
 * Spec: specs/020-validation-audit/spec.md US4c
 * Contract: specs/020-validation-audit/contracts/month-precision-resolver.contract.md
 *
 * Purpose:
 *   Wraps existing year-precision FIRE-age feasibility into a year-then-month
 *   two-stage resolver. Returns {years, months, totalMonths, feasible,
 *   searchMethod} so the dashboard header can render "X Years Y Months"
 *   instead of just "X yrs".
 *
 * Edge Case 4 mitigation (per contract): default to UI-display refinement
 * (option c — feasibility check stays at year level; month-precision is a
 * UI-display refinement using the existing simulator without modification).
 * The simulator is called with non-integer fireAge values and we accept
 * whatever integer-rounded behavior it produces.
 *
 * Inputs:
 *   inp     — canonical input record (same fields consumed by isFireAgeFeasible
 *             and simulateRetirementOnlySigned). Must include `ageRoger` (or
 *             `agePerson1` for Generic) and `endAge`.
 *   mode    — 'safe' | 'exact' | 'dieWithZero'
 *   options — {
 *     annualSpend: number,                          REQUIRED
 *     // Injected helpers (REQUIRED — both inline in HTML, not Node-importable
 *     // as modules; the browser-side wrapper passes the inline functions,
 *     // tests pass mocks):
 *     simulateRetirementOnlySigned: (inp, annualSpend, fireAge,
 *                                    p401kTrad0, p401kRoth0, pStocks0, pCash0)
 *                                    => sim,
 *     isFireAgeFeasible: (sim, inp, annualSpend, mode, fireAge) => boolean,
 *
 *     // Starting pools at fireAge — caller's responsibility to compute via
 *     // accumulateToFire (or equivalent). For mocks, these are passed through.
 *     pools: { pTrad, pRoth, pStocks, pCash }       REQUIRED
 *   }
 *
 * Outputs: FireAgeResult {
 *   years:        number,    // integer age in years
 *   months:       number,    // integer 0..11
 *   totalMonths:  number,    // years * 12 + months (or -1 if infeasible)
 *   feasible:     boolean,   // false if no age in [currentAge, endAge] is feasible
 *   searchMethod: 'integer-year' | 'month-precision' | 'none',
 * }
 *
 * Consumers:
 *   1. KPI card "Years to FIRE" — renders "X Years Y Months".
 *   2. Verdict pill — renders "FIRE in X years Y months".
 *   3. Audit dump's `fireAgeResolution` block — extends with months.
 *
 * Policy:
 *   - PURE. No DOM, no window/document/localStorage, no global mutable state.
 *   - Node-importable via CommonJS module.exports.
 *   - Browser exposure via globalThis.findEarliestFeasibleAge.
 *   - All input helpers are injected (never imported) — keeps purity intact
 *     across the inline-HTML/Node boundary.
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented.
 *   V   — UMD-classic-script (CommonJS + globalThis assign).
 *   VI  — Consumers list above is canonical.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: pure-data (operates on age scalars + integer year/month
 *     counters; no $-valued state lives in this module).
 *   Frame-conversion sites: NONE.
 * =============================================================================
 */

/**
 * Year-then-month two-stage FIRE-age resolver.
 *
 * Stage 1: Linear scan currentAge..endAge-1 using injected helpers.
 *   For each candidate year `y`:
 *     - sim = simulateRetirementOnlySigned(inp, annualSpend, y, pools...)
 *     - if isFireAgeFeasible(sim, inp, annualSpend, mode, y): break
 *
 * Stage 2: Month refinement within year (Y - 1).
 *   For each m in {0, 1, ..., 11}:
 *     - fractionalAge = (Y - 1) + m/12
 *     - check feasibility at fractionalAge
 *     - return earliest feasible month
 *   If no month in (Y - 1) is feasible, return {years: Y, months: 0,
 *   searchMethod: 'integer-year'} — the year boundary IS the answer.
 *
 * Monotonic-flip stability: if feasibility flips more than once across
 *   m = 0..11 (e.g., infeasible → feasible → infeasible), log a warning
 *   and fall back to the year-precision result.
 *
 * @param {object} inp     dashboard state record
 * @param {string} mode    'safe' | 'exact' | 'dieWithZero'
 * @param {object} options { annualSpend, simulateRetirementOnlySigned,
 *                           isFireAgeFeasible, pools }
 * @returns {{years:number, months:number, totalMonths:number,
 *            feasible:boolean, searchMethod:string}}
 */
function findEarliestFeasibleAge(inp, mode, options) {
  const opts = options || {};

  // --- Validate required injected helpers ---
  if (typeof opts.simulateRetirementOnlySigned !== 'function') {
    throw new Error('[fireAgeResolver] options.simulateRetirementOnlySigned is required');
  }
  if (typeof opts.isFireAgeFeasible !== 'function') {
    throw new Error('[fireAgeResolver] options.isFireAgeFeasible is required');
  }
  if (typeof opts.annualSpend !== 'number') {
    throw new Error('[fireAgeResolver] options.annualSpend is required (number)');
  }
  if (!opts.pools || typeof opts.pools !== 'object') {
    throw new Error('[fireAgeResolver] options.pools is required ({pTrad, pRoth, pStocks, pCash})');
  }

  const sim = opts.simulateRetirementOnlySigned;
  const feas = opts.isFireAgeFeasible;
  const annualSpend = opts.annualSpend;
  const pools = opts.pools;
  const pTrad0 = pools.pTrad || 0;
  const pRoth0 = pools.pRoth || 0;
  const pStocks0 = pools.pStocks || 0;
  const pCash0 = pools.pCash || 0;

  // --- Age resolution (RR uses ageRoger; Generic uses agePerson1) ---
  const currentAge = (inp.agePerson1 != null) ? inp.agePerson1 : inp.ageRoger;
  const endAge = inp.endAge || 95;

  // --- Edge case 1: already past plan age ---
  if (currentAge == null || currentAge >= endAge) {
    return {
      years: 0,
      months: 0,
      totalMonths: 0,
      feasible: false,
      searchMethod: 'none',
    };
  }

  // ---------------------------------------------------------------------------
  // Stage 1 — Year precision linear scan
  // ---------------------------------------------------------------------------
  let earliestFeasibleYear = -1;

  for (let y = currentAge; y < endAge; y++) {
    const simResult = sim(inp, annualSpend, y, pTrad0, pRoth0, pStocks0, pCash0);
    if (feas(simResult, inp, annualSpend, mode, y)) {
      earliestFeasibleYear = y;
      break;
    }
  }

  // --- Edge case 3: infeasible everywhere ---
  if (earliestFeasibleYear === -1) {
    return {
      years: -1,
      months: 0,
      totalMonths: -1,
      feasible: false,
      searchMethod: 'none',
    };
  }

  // --- Edge case 2: feasible at currentAge ---
  // Per contract §Edge cases item 2: "if month 0 is feasible, return
  // {years: currentAge, months: 0}". There is no "Y - 1" prior year to refine
  // within when Y === currentAge, so we return the year-boundary directly.
  if (earliestFeasibleYear === currentAge) {
    return {
      years: currentAge,
      months: 0,
      totalMonths: currentAge * 12,
      feasible: true,
      searchMethod: 'integer-year',
    };
  }

  // ---------------------------------------------------------------------------
  // Stage 2 — Month refinement within year (Y - 1)
  // ---------------------------------------------------------------------------
  const Y = earliestFeasibleYear;
  const refineYear = Y - 1;

  // Probe all 12 months — collect feasibility vector to check monotonicity.
  const feasVec = new Array(12);
  for (let m = 0; m < 12; m++) {
    const fractionalAge = refineYear + m / 12;
    const simResult = sim(inp, annualSpend, fractionalAge, pTrad0, pRoth0, pStocks0, pCash0);
    feasVec[m] = !!feas(simResult, inp, annualSpend, mode, fractionalAge);
  }

  // --- Monotonic-flip stability check ---
  // Expected pattern: false* then true* (one flip from F→T at boundary m*).
  // Anything else (multi-flip, or all true with a false in middle) is
  // numerical instability — fall back to year-precision result.
  let flipCount = 0;
  for (let m = 1; m < 12; m++) {
    if (feasVec[m] !== feasVec[m - 1]) flipCount++;
  }
  // Additional shape check: if any flip is T→F (not F→T), that's also a violation.
  let hasInvalidFlip = false;
  for (let m = 1; m < 12; m++) {
    if (feasVec[m - 1] === true && feasVec[m] === false) {
      hasInvalidFlip = true;
      break;
    }
  }

  if (flipCount > 1 || hasInvalidFlip) {
    // eslint-disable-next-line no-console
    console.warn(
      '[fireAgeResolver] non-monotonic feasibility at year %d, falling back to year-precision',
      refineYear
    );
    return {
      years: Y,
      months: 0,
      totalMonths: Y * 12,
      feasible: true,
      searchMethod: 'integer-year',
    };
  }

  // --- Find earliest feasible month within (Y - 1) ---
  let earliestFeasibleMonth = -1;
  for (let m = 0; m < 12; m++) {
    if (feasVec[m]) {
      earliestFeasibleMonth = m;
      break;
    }
  }

  if (earliestFeasibleMonth === -1) {
    // No month in (Y - 1) is feasible — the boundary IS year Y at month 0.
    return {
      years: Y,
      months: 0,
      totalMonths: Y * 12,
      feasible: true,
      searchMethod: 'integer-year',
    };
  }

  // Earliest feasible month found within (Y - 1) — month-precision answer.
  return {
    years: refineYear,
    months: earliestFeasibleMonth,
    totalMonths: refineYear * 12 + earliestFeasibleMonth,
    feasible: true,
    searchMethod: 'month-precision',
  };
}

// ---------------------------------------------------------------------------
// Exports — UMD-classic-script pattern (matches calc/accumulateToFire.js).
// CommonJS for Node (tests, future module callers); globalThis for browser
// inline-script use case.
// ---------------------------------------------------------------------------
const _fireAgeResolverApi = { findEarliestFeasibleAge };

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _fireAgeResolverApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.findEarliestFeasibleAge = findEarliestFeasibleAge;
  globalThis.fireAgeResolverModule = _fireAgeResolverApi;
}
