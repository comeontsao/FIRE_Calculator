/*
 * =============================================================================
 * MODULE: calc/coastFire.js  (NEW — feature 038)
 *
 * Feature: 038-per-country-coast-milestones
 *
 * Purpose:
 *   Coast FIRE answers one question: "if I stop contributing TODAY, does what I
 *   already own grow to the target by the target age?" The dashboards already
 *   answer it once, for a HARDCODED age 60, inside coastFIRECheck() — that is
 *   the Savings-card badge and it is deliberately left alone.
 *
 *   This module reuses that growth model to answer a DIFFERENT, reachable
 *   question per shortlisted country: "if I stop contributing today, when could
 *   I retire there?" See findCoastFireAge for why the seemingly-obvious framing
 *   ("when do I earn the right to coast to my FIRE age") is unanswerable.
 *
 *   It also owns the sanitiser for the persisted country shortlist (the ⭐ pins),
 *   because "what did the user pin" is pure data-shaping and belongs in a module
 *   a Node test can reach.
 *
 * Inputs:
 *   - coastFundedTotal({ accessibleReal, lockedReal, yearsOfGrowth,
 *                        realReturnAccessible, realReturn401k,
 *                        saleProceedsReal }) → number
 *   - findCoastFireAge({ accessibleReal, lockedReal, currentAge, maxAge, minAge,
 *                        realReturnAccessible, realReturn401k,
 *                        saleProceedsFor, targetTotalFor }) → number | null
 *   - resolveShortlist(rawList, validIds, fallbackIds) → string[]
 *
 * Outputs: real-$ scalars / an age / an id array. No DOM, no I/O.
 *
 * Consumers:
 *   - renderTimeline() in FIRE-Dashboard.html (per-country Coast markers)
 *   - renderTimeline() in FIRE-Dashboard-Generic.html (lockstep mirror)
 *   - the ⭐ pin handlers + shortlist boot in both HTMLs (resolveShortlist)
 *   - tests/unit/coastFire.test.js
 *
 * Policy:
 *   - PURE. NO DOM. NO globals beyond the UMD wrapper. Deterministic.
 *   - Mortgage sale proceeds are DOM-derived in the dashboards
 *     (getMortgageAdjustedRetirement reads inputs), so they arrive here through
 *     a caller-supplied pure callback rather than being computed in-module.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real (today's purchasing power) throughout. Every balance in
 *   and out is real-$; growth uses REAL returns, so no inflation term appears.
 *   Frame-conversion sites: NONE. Callers that display these numbers in Book
 *   Value convert at the display boundary (see displayConverter).
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented.
 *   V   — UMD-classic-script (CommonJS for Node tests; globalThis for browser).
 *   VI  — Consumers list above is canonical.
 * =============================================================================
 */

'use strict';

/** Coerce a possibly-absent balance to a finite number. Junk → 0, never NaN. */
function _finiteOrZero(v) {
  return Number.isFinite(v) ? v : 0;
}

/** Rates are load-bearing: a bad one must be loud, not silently 0. */
function _assertRate(v, name) {
  if (!Number.isFinite(v)) {
    throw new TypeError(`coastFire: ${name} must be a finite number, got ${String(v)}`);
  }
}

/**
 * Total real-$ at the target age assuming ZERO further contributions.
 *
 * Mirrors coastFIRECheck()'s model exactly: the accessible pool (taxable stocks
 * + cash) and the locked pool (401k/Roth) compound at their OWN real rates, and
 * mortgage sale proceeds land as a lump at the target age (they are proceeds
 * from a sale that happens THEN, so they are not compounded).
 *
 * Edge cases:
 *   - yearsOfGrowth < 0        → clamped to 0. Coasting to an age already past
 *                                is not "discount backwards", it is a no-op.
 *   - non-finite balances      → treated as 0 (guards a half-built inputs object)
 *   - non-finite rates         → TypeError
 *
 * @returns {number} real-$ total at the target age
 */
function coastFundedTotal(args) {
  const a = args || {};
  // FRAME: real-$ — both rates are REAL returns (Fisher-deflated by the caller via
  // realRate()); nothing in this module ever sees a nominal rate.
  const realReturnAccessible = a.realReturnAccessible;
  // FRAME: real-$ — locked-pool real return, kept distinct from the accessible one
  const realReturn401k = a.realReturn401k;
  // FRAME: real-$ — validation only, no frame change
  _assertRate(realReturnAccessible, 'realReturnAccessible');
  // FRAME: real-$ — validation only, no frame change
  _assertRate(realReturn401k, 'realReturn401k');

  const years = Math.max(0, _finiteOrZero(a.yearsOfGrowth));
  const accessible = _finiteOrZero(a.accessibleReal);
  const locked = _finiteOrZero(a.lockedReal);
  const proceeds = _finiteOrZero(a.saleProceedsReal);

  // FRAME: real-$ — real balances × real growth stay real. No inflation term.
  return accessible * Math.pow(1 + realReturnAccessible, years)
       // FRAME: real-$ — real balance compounded at a real rate stays real
       + locked * Math.pow(1 + realReturn401k, years)
       + proceeds;
}

/**
 * "If I stop contributing TODAY, when could I retire?"
 *
 * Scans ages from `currentAge` to `maxAge` and returns the FIRST age at which
 * the money already owned — frozen, no further contributions, compounding at the
 * per-pool real rates — meets the target required AT THAT AGE.
 *
 * WHY THIS SHAPE, and not "the year I earn the right to coast to my FIRE age":
 * that question has no answer. A FIRE age is by construction the first year the
 * target is met WHILE STILL CONTRIBUTING. Contributions are non-negative, so the
 * frozen-savings path is never ahead of the contributing path, and the crossing
 * can never land before the FIRE age. Asking it always yields null. This
 * function asks the version that is actually reachable, and its answer sits
 * naturally LATER than the FIRE age — the gap is the price of stopping.
 *
 * `targetTotalFor(age)` supplies the required total at a given age. The
 * dashboards pass findMinTotalAtFireNumerical, which is mode-aware, so the
 * marker stays consistent with whatever Safe/Exact/DWZ gate is active.
 * `saleProceedsFor(yearsFromNow)` is optional; both callbacks must be pure.
 *
 * Errors from `targetTotalFor` are NOT swallowed — a solver blowing up is a real
 * failure and the caller decides how loud it should be. Callers on a render path
 * are expected to wrap this in try/catch and log with a `[coastFire]` prefix.
 *
 * Linear scan, not bisection: `targetTotalFor` is not guaranteed monotonic (the
 * mode-aware target flattens to a floor across wide spend ranges, and can even
 * rise with age), and a bisection over a non-monotonic predicate can return a
 * later crossing than the first.
 *
 * `minAge` is an optional floor for where the scan STARTS — the growth origin
 * stays `currentAge` either way, so the money is always frozen as of today. It
 * exists because `targetTotalFor` is typically an expensive solver, and callers
 * often know an age below which no crossing is possible. The dashboards pass the
 * country's FIRE age, which is provably safe: for any age below it the
 * still-contributing balance is short of the target, and the frozen balance is
 * never above the contributing one, so no crossing can hide down there.
 *
 * @returns {number|null} the age, or null if the target is never met by maxAge
 */
function findCoastFireAge(args) {
  const a = args || {};
  // FRAME: real-$ — validation only, no frame change
  _assertRate(a.realReturnAccessible, 'realReturnAccessible');
  // FRAME: real-$ — validation only, no frame change
  _assertRate(a.realReturn401k, 'realReturn401k');

  if (typeof a.targetTotalFor !== 'function') {
    throw new TypeError('coastFire.findCoastFireAge: targetTotalFor callback is required');
  }

  const currentAge = a.currentAge;
  const maxAge = a.maxAge;
  if (!Number.isFinite(currentAge) || !Number.isFinite(maxAge)) return null;
  if (maxAge < currentAge) return null;

  // Scan floor. Never below currentAge — you cannot retire in the past.
  const startAge = Number.isFinite(a.minAge) ? Math.max(currentAge, a.minAge) : currentAge;

  const proceedsFor = typeof a.saleProceedsFor === 'function' ? a.saleProceedsFor : null;

  for (let age = startAge; age <= maxAge; age++) {
    const yearsFromNow = age - currentAge;
    const funded = coastFundedTotal({
      accessibleReal: a.accessibleReal,
      lockedReal: a.lockedReal,
      yearsOfGrowth: yearsFromNow,
      realReturnAccessible: a.realReturnAccessible,
      // FRAME: real-$ — pass-through of the real locked-pool rate
      realReturn401k: a.realReturn401k,
      saleProceedsReal: proceedsFor ? proceedsFor(yearsFromNow) : 0,
    });
    const needed = a.targetTotalFor(age);
    if (Number.isFinite(needed) && funded >= needed) return age;
  }
  return null;
}

/**
 * Sanitise a persisted ⭐ shortlist into a list of real scenario ids.
 *
 * Deliberate asymmetry, and the reason this is a tested function rather than a
 * one-liner at the call site:
 *   - a MALFORMED store (missing key, wrong type, all-unknown ids) → fallback,
 *     because that is corruption and the user never asked for it;
 *   - an EXPLICITLY EMPTY list → honoured, because "I unpinned everything" is a
 *     real choice that must survive a reload. What empty MEANS downstream (the
 *     dashboards show all countries) is the caller's decision, not this
 *     module's.
 *
 * Order is the user's pin order, not `validIds` order. Duplicates collapse to
 * their first occurrence. The result is always a fresh array, so a caller
 * mutating it cannot corrupt the shared fallback constant.
 *
 * @returns {string[]}
 */
function resolveShortlist(rawList, validIds, fallbackIds) {
  const fallback = Array.isArray(fallbackIds) ? fallbackIds.slice() : [];
  if (!Array.isArray(rawList)) return fallback;

  const valid = new Set(Array.isArray(validIds) ? validIds : []);
  const seen = new Set();
  const out = [];
  for (const id of rawList) {
    if (typeof id !== 'string') continue;
    if (!valid.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  // Junk in, fallback out — but an intentionally empty list stays empty.
  if (out.length === 0 && rawList.length > 0) return fallback;
  return out;
}

// ---------------------------------------------------------------------------
// Exports — UMD-classic-script pattern. The export const name is unique per
// module BY LAW (see tests/unit/globalScopeCollision.test.js): classic scripts
// share one global lexical scope, and a duplicate top-level const silently
// kills the whole second script in a real browser.
// ---------------------------------------------------------------------------
// FRAME: pure-data — UMD-export object
const _coastFireApi = {
  // FRAME: real-$ — see coastFundedTotal body
  coastFundedTotal,
  // FRAME: real-$ — see findCoastFireAge body
  findCoastFireAge,
  // FRAME: pure-data — id list shaping, no money involved
  resolveShortlist,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _coastFireApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.coastFire = _coastFireApi;
}
