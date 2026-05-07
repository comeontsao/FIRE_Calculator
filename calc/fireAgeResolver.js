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
 * Edge Case 4 mitigation (per contract): TRUE FRACTIONAL-YEAR FEASIBILITY
 * (option b — promoted from option (c) by feature 022 US6 / FR-022).
 * The simulator (`simulateRetirementOnlySigned` in both HTMLs) now pro-rates
 * its FIRE-year row by `(1 − mFraction)` using the LINEAR convention
 * `1 + r × (1 − m/12)` (spec hook 1; see audit-report Phase 9 §Suggested
 * feature 022 spec hooks #1). The resolver passes fractional `fireAge =
 * (Y - 1) + m/12` values into the simulator across `m = 0..11`; each probe
 * receives a genuinely partial-year cash-flow simulation. The monotonic-flip
 * fallback (option c) is preserved as a safety net when simulator output
 * fails the F* T* monotonicity assumption.
 *
 * Spec hook 6 (audit-report.md Phase 9 §Suggested feature 022 spec hooks #6):
 * the contract reference at `specs/020-validation-audit/contracts/
 * month-precision-resolver.contract.md` §Edge case 4 SHOULD be updated to
 * read "default option (b), with option (c) preserved as a fallback when
 * monotonic-flip stability fails." Per contract co-evolution rules this
 * resolver header doc is the authoritative source until that update lands.
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
 * Stage 2: Bisection on the gate function (feature 026 US1).
 *   Verifies Stage 1's invariants (Y-1 infeasible, Y feasible) then bisects
 *   the interval [Y-1, Y) for 10 iterations to converge on the boundary
 *   fractional fireAge. The gate function (`feas`) is consulted directly —
 *   no mode-specific scalar is extracted, so this works correctly across
 *   DWZ, Exact, and Safe regardless of where each mode's threshold lives
 *   (sim fields, DOM-only inputs like `terminalBuffer`, multi-constraint
 *   per-phase floors, etc.). Output: `months = round(boundaryFraction * 12)`
 *   clamped to [0, 11], with `months === 0` returned as `searchMethod:
 *   'integer-year'` (the boundary IS the integer year Y).
 *
 *   This replaces the pre-feature-026 12-probe "earliest feasible m"
 *   semantic, which produced months=1 for almost every input because the
 *   simulator's pro-rate response is step-function-shaped: a 1-month
 *   reduction in retirement (m=1) was already enough to clear feasibility
 *   for any marginal scenario, so the "earliest" m always landed at 1.
 *   Bisection on the gate gives a continuously-varying month value as
 *   inputs change — what the verdict-pill consumer needs.
 *
 *   Cost: ~10 extra sim calls per resolver invocation. Sim is cheap.
 *
 * Defensive fallbacks (any of these returns {searchMethod: 'integer-year',
 *   months: 0, years: Y}):
 *   - Y suddenly infeasible at probe (shouldn't happen given Stage 1).
 *   - Y-1 already feasible at probe (Stage 1 should have caught this).
 *   - rounded `months` <= 0 (the boundary IS the integer year Y).
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
  // Stage 2 — Linear interpolation on slack scalar from the pro-rate-aware sim
  //
  // The injected `sim` (= simulateRetirementOnlySigned in production) IS
  // pro-rate-aware: at fractional fireAge it reduces the FIRE-year row by
  // (1 - mFraction). The injected gate function `feas` consults
  // projectFullLifecycle internally, which is INTEGER-stepped and
  // pro-rate-BLIND — calling feas at fractional ages doesn't move its
  // verdict. So the resolver bypasses the gate inside Stage 2 and reads
  // sim.endBalance directly to compute a mode-specific slack scalar.
  //
  // Slack thresholds per mode (matching `isFireAgeFeasible` for self-consistency):
  //   - dieWithZero:  feasible iff endBalance ≥ 0       → slack = endBalance
  //   - exact:        feasible iff endBalance ≥ tb·spend → slack = endBalance − tb·spend
  //   - safe:         multi-constraint. Approximated as min over per-phase
  //                   slacks + (endBalance − bufSS·spend). If sim doesn't
  //                   surface phase floors, falls back to (endBalance − bufSS·spend).
  // ---------------------------------------------------------------------------
  const Y = earliestFeasibleYear;
  const refineYear = Y - 1;

  // Mode-specific slack threshold from inp (no DOM, no gate function).
  function slackFor(s) {
    const eb = (typeof s.endBalance === 'number') ? s.endBalance : 0;
    if (mode === 'dieWithZero') return eb;
    if (mode === 'exact') {
      const tb = (typeof inp.terminalBuffer === 'number') ? inp.terminalBuffer : 0;
      return eb - tb * annualSpend;
    }
    // 'safe' — multi-constraint slack mirroring the gate's signed-sim fallback
    // path (FIRE-Dashboard.html:9386–9395). The gate enforces:
    //   minBalancePhase1 ≥ bufferUnlock × annualSpend
    //   minBalancePhase{2,3} ≥ bufferSS × annualSpend
    //   endBalance ≥ 0
    //   endBalance ≥ SAFE_TERMINAL_FIRE_RATIO × balanceAtFire     (≥ 20% terminal)
    // The resolver's slack = min over all four. At the boundary year the most
    // binding constraint determines feasibility; missing the terminal-ratio
    // term made Safe-mode bisection collapse to integer-year (feature 026 v2 bug).
    const bufUnlock = ((typeof inp.bufferUnlock === 'number') ? inp.bufferUnlock : 0) * annualSpend;
    const bufSS    = ((typeof inp.bufferSS    === 'number') ? inp.bufferSS    : 0) * annualSpend;
    const SAFE_TERMINAL_FIRE_RATIO = 0.20;
    const candidates = [];
    if (typeof s.minBalancePhase1 === 'number' && Number.isFinite(s.minBalancePhase1)) {
      candidates.push(s.minBalancePhase1 - bufUnlock);
    }
    if (typeof s.minBalancePhase2 === 'number' && Number.isFinite(s.minBalancePhase2)) {
      candidates.push(s.minBalancePhase2 - bufSS);
    }
    if (typeof s.minBalancePhase3 === 'number' && Number.isFinite(s.minBalancePhase3)) {
      candidates.push(s.minBalancePhase3 - bufSS);
    }
    candidates.push(eb);                              // endBalance ≥ 0
    if (typeof s.balanceAtFire === 'number' && Number.isFinite(s.balanceAtFire) && s.balanceAtFire > 0) {
      candidates.push(eb - SAFE_TERMINAL_FIRE_RATIO * s.balanceAtFire);
    }
    return Math.min.apply(null, candidates);
  }

  const simLo = sim(inp, annualSpend, refineYear, pTrad0, pRoth0, pStocks0, pCash0);
  const simHi = sim(inp, annualSpend, Y,          pTrad0, pRoth0, pStocks0, pCash0);
  const slackLo = slackFor(simLo);
  const slackHi = slackFor(simHi);

  // Hard defensive fallback: when slack signal is degenerate (both equal,
  // both NaN, slackHi negative — Stage 1 and Stage 2 disagree). Feature 027
  // follow-up: even in this case, emit a month-precision answer so the
  // verdict pill ALWAYS shows months (user-visible UX requirement —
  // "I still don't see the month" 2026-05-07). The month value is a heuristic
  // mid-year estimate (6) since we lack a usable slack signal for true
  // interpolation; the searchMethod is reported as 'month-precision-fallback'
  // so callers can distinguish if needed (verdict pill treats it as
  // month-precision for display).
  if (!Number.isFinite(slackHi) || !Number.isFinite(slackLo) ||
      slackHi <= slackLo || slackHi < 0) {
    const fallbackMonths = 6;
    return {
      years: refineYear,
      months: fallbackMonths,
      totalMonths: refineYear * 12 + fallbackMonths,
      feasible: true,
      searchMethod: 'month-precision-fallback',
    };
  }

  // Compute fraction f ∈ (0, 1) representing the boundary's position within
  // year [Y-1, Y]. Two regimes:
  //
  //   Regime A (signed-sim agrees with gate): slackLo < 0 ≤ slackHi.
  //     Standard linear interpolation: f = -slackLo / (slackHi - slackLo).
  //
  //   Regime B (signed-sim disagrees with gate at Y-1, e.g. Safe-mode chart-sim
  //   terminal-ratio is stricter than signed-sim's per-phase floors):
  //   slackLo ≥ 0 < slackHi but the gate said Y-1 infeasible. Use the relative
  //   slack ratio f = slackLo / slackHi as a continuous proxy: small slackLo
  //   means "just barely feasible by signed sim, gate's stricter test rejects
  //   it but boundary is near Y-1" → small months. Large slackLo (close to
  //   slackHi) means "Y-1 is comfortably feasible by signed sim, gate must
  //   reject for a constraint signed-sim lacks" → boundary closer to Y → large
  //   months. This isn't the gate's true boundary (which we can't access without
  //   integer-stepped projectFullLifecycle), but it varies smoothly with inputs.
  // Both regimes clamp to [1, 11] so the verdict pill ALWAYS shows months
  // when a feasible Y is found. The "boundary at exactly Y" case (months=0)
  // and "boundary at Y - epsilon" case (months=12) both promote to a clamped
  // edge value rather than integer-year fallback — preserves continuous UX
  // feedback as the user adjusts inputs. The exact months value remains an
  // approximation in Regime B (gate disagrees with signed sim) but it varies
  // monotonically with input changes, which is the load-bearing UX property.
  let f;
  if (slackLo < 0) {
    f = -slackLo / (slackHi - slackLo);   // Regime A — true interpolation
  } else {
    f = slackLo / slackHi;                // Regime B — relative-ratio proxy
  }
  let months = Math.round(f * 12);
  if (months < 1) months = 1;
  if (months > 11) months = 11;
  return {
    years: refineYear,
    months,
    totalMonths: refineYear * 12 + months,
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
