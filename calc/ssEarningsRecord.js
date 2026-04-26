/*
 * calc/ssEarningsRecord.js — SSEarningsHistory builder + validator.
 *
 * Inputs:
 *   - history: SSEarningsHistory (possibly empty)
 *     where SSEarningsRow = { year: integer, earnings: non-negative finite number, credits: integer in [0,4] }
 *   - target: integer (setEarliestYear only)
 *   - Optional options object:
 *       { floor?: number = EARLIEST_ALLOWED_YEAR,
 *         currentYear?: number = new Date().getFullYear() }
 *
 * Outputs:
 *   - { history: SSEarningsHistory, reason: ReasonCode | null }
 *     ReasonCode = 'floorReached' | 'noopAlreadyCovered' | 'clampedToFloor'
 *                | 'invalidTarget' | 'duplicateYear' | null
 *
 * Consumers:
 *   - FIRE-Dashboard-Generic.html → addSSPriorYear() and setEarliestYear() UI handlers
 *   - tests/unit/ssEarningsRecord.test.js
 *
 * Invariants:
 *   - History is strictly ascending by year with unique integer year values (I1, I2).
 *   - history[0].year >= floor (default 1960) (I3).
 *   - earnings is a non-negative finite number; NaN / ±Infinity are rejected (I4).
 *   - credits is an integer in [0, 4] (I4).
 *   - Helpers are pure: inputs are never mutated; mutating outputs are always a new array (I5).
 *     No-op outputs return the same array reference so callers can detect no-change cheaply.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 *
 * Contract reference:
 *   specs/012-ssa-earnings-pre-2020/contracts/ss-earnings-record.contract.md
 */

/** Soft UI floor for the earliest allowed earnings year. */
export const EARLIEST_ALLOWED_YEAR = 1960;

/** Default credits assigned to a prepended/bulk-filled blank year. */
const DEFAULT_CREDITS = 4;

/** Maximum credits per year (SSA rule). */
const MAX_CREDITS = 4;

/**
 * Validate a single earnings row.
 *
 * A well-shaped row is an object with:
 *   - year: finite integer
 *   - earnings: finite non-negative number (rejects NaN / ±Infinity)
 *   - credits: integer in [0, MAX_CREDITS]
 *
 * Pure. No mutation. No side effects.
 *
 * @param {unknown} row
 * @returns {boolean}
 */
export function isValidRow(row) {
  if (row === null || typeof row !== 'object') return false;
  const { year, earnings, credits } = /** @type {Record<string, unknown>} */ (row);
  if (!Number.isInteger(year)) return false;
  if (typeof earnings !== 'number' || !Number.isFinite(earnings) || earnings < 0) return false;
  if (!Number.isInteger(credits)) return false;
  if (credits < 0 || credits > MAX_CREDITS) return false;
  return true;
}

/**
 * Return a new array that is the input sorted strictly ascending by year with
 * duplicate years removed (last-write-wins — a later row with the same year
 * replaces an earlier one).
 *
 * Does NOT validate row shape — it sorts/dedupes whatever is handed in. Pair
 * with `isValidRow` upstream if validation is required. Invalid rows
 * pass through to the output unchanged.
 *
 * Pure. The input array and its rows are never mutated.
 *
 * @param {ReadonlyArray<{year: number}>} history
 * @returns {Array<{year: number}>}
 */
export function sortedAscendingUnique(history) {
  if (!Array.isArray(history)) {
    throw new TypeError('sortedAscendingUnique: history must be an array');
  }
  // Last-write-wins: a later occurrence of the same year overwrites earlier.
  const byYear = new Map();
  for (const row of history) {
    if (row && typeof row === 'object' && 'year' in row) {
      byYear.set(row.year, row);
    } else {
      // Preserve non-row entries so the caller notices malformed input rather
      // than having it silently disappear. They'll still be sorted by
      // Number(year) == NaN → placed last by the comparator.
      byYear.set(Symbol(), row);
    }
  }
  const out = Array.from(byYear.values());
  out.sort((a, b) => {
    const ay = a && typeof a === 'object' ? a.year : NaN;
    const by = b && typeof b === 'object' ? b.year : NaN;
    return ay - by;
  });
  return out;
}

/**
 * Prepend `firstYear - 1` to the history as a fresh zero-earnings row, unless
 * the floor has been reached.
 *
 * Empty history: seed with a single row at `currentYear - 1`.
 * Floor reached: return the same array reference + reason 'floorReached'.
 *
 * @param {ReadonlyArray<{year:number,earnings:number,credits:number}>} history
 * @param {{floor?: number, currentYear?: number}} [options]
 * @returns {{history: Array<{year:number,earnings:number,credits:number}>, reason: string | null}}
 */
export function prependPriorYear(history, options) {
  if (!Array.isArray(history)) {
    throw new TypeError('prependPriorYear: history must be an array');
  }
  const floor = options && Number.isInteger(options.floor)
    ? options.floor
    : EARLIEST_ALLOWED_YEAR;
  const currentYear = options && Number.isInteger(options.currentYear)
    ? options.currentYear
    : new Date().getFullYear();

  if (history.length === 0) {
    const seededYear = currentYear - 1;
    return {
      history: [{ year: seededYear, earnings: 0, credits: DEFAULT_CREDITS }],
      reason: null,
    };
  }

  const firstYear = history[0].year;
  if (firstYear <= floor) {
    // Already at or below floor — nothing to prepend.
    return { history, reason: 'floorReached' };
  }

  const newYear = firstYear - 1;
  const prepended = { year: newYear, earnings: 0, credits: DEFAULT_CREDITS };
  // Shallow-copy the array; row references are preserved (input rows unchanged).
  return {
    history: [prepended, ...history],
    reason: null,
  };
}

/**
 * Set the earliest year of the history by bulk-prepending every year from
 * `target` through `firstYear - 1` (inclusive), each with earnings 0 and
 * default credits.
 *
 * Behaviour matrix (contract §setEarliestYear):
 *   - !Number.isInteger(target) or target < 0 → sameRef, 'invalidTarget'
 *   - history empty, target valid          → single-row [target]
 *   - history non-empty, target >= firstYear → sameRef, 'noopAlreadyCovered'
 *   - target < floor                        → bulk prepend from floor..firstYear-1,
 *                                             'clampedToFloor'
 *   - otherwise                              → bulk prepend target..firstYear-1
 *
 * @param {ReadonlyArray<{year:number,earnings:number,credits:number}>} history
 * @param {number} target
 * @param {{floor?: number, currentYear?: number}} [options]
 * @returns {{history: Array<{year:number,earnings:number,credits:number}>, reason: string | null}}
 */
export function setEarliestYear(history, target, options) {
  if (!Array.isArray(history)) {
    throw new TypeError('setEarliestYear: history must be an array');
  }
  const floor = options && Number.isInteger(options.floor)
    ? options.floor
    : EARLIEST_ALLOWED_YEAR;

  // Invalid target → no change. Rejects non-integers (NaN, Infinity, fractions,
  // strings) and negative years.
  if (!Number.isInteger(target) || target < 0) {
    return { history, reason: 'invalidTarget' };
  }

  // Empty history: contract §empty-history note — one row at target,
  // regardless of currentYear. UI fills intermediate years lazily.
  if (history.length === 0) {
    const clamped = target < floor ? floor : target;
    const reason = target < floor ? 'clampedToFloor' : null;
    return {
      history: [{ year: clamped, earnings: 0, credits: DEFAULT_CREDITS }],
      reason,
    };
  }

  const firstYear = history[0].year;
  // Already covered — target is >= current earliest year, nothing to do.
  if (target >= firstYear) {
    return { history, reason: 'noopAlreadyCovered' };
  }

  // Clamp target up to the floor and mark reason accordingly.
  const effectiveTarget = target < floor ? floor : target;
  const clamped = target < floor;

  // If the clamped target is still not earlier than the first year, no-op.
  if (effectiveTarget >= firstYear) {
    return { history, reason: clamped ? 'clampedToFloor' : 'noopAlreadyCovered' };
  }

  const newRows = [];
  for (let y = effectiveTarget; y < firstYear; y += 1) {
    newRows.push({ year: y, earnings: 0, credits: DEFAULT_CREDITS });
  }
  return {
    history: [...newRows, ...history],
    reason: clamped ? 'clampedToFloor' : null,
  };
}
