/*
 * calc/inflation.js — real ↔ nominal dollar conversion.
 *
 * Inputs:
 *   inflationRate: number — decimal annual inflation (e.g., 0.03 for 3%).
 *                           Negative values permitted (deflation).
 *   baseYear:      number — integer calendar year. `year === baseYear`
 *                           means conversion is identity.
 *
 * Outputs: InflationHelpers
 *   toReal(amountNominal, year)   — convert nominal dollars at `year` to
 *                                   real dollars in `baseYear` purchasing power.
 *   toNominal(amountReal, year)   — convert real (baseYear) dollars to
 *                                   nominal dollars at `year`.
 *
 * Consumers:
 *   - tests/unit/inflation.test.js
 *   (Will expand to: calc/lifecycle.js, calc/healthcare.js, calc/mortgage.js,
 *    calc/tax.js, calc/college.js, calc/socialSecurity.js as those modules
 *    land in US2. Per FR-017: this is the ONLY module allowed to convert
 *    between real and nominal dollars.)
 *
 * Invariants:
 *   - toNominal(toReal(x, y), y) === x within 1e-9 for all (x, y).
 *   - year === baseYear implies identity on both directions.
 *   - Behavior is well-defined for negative inflationRate (deflation).
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O.
 */

/**
 * @typedef {import('../tests/fixtures/types.js').Inputs} Inputs
 */

/**
 * Construct a pair of inflation conversion helpers.
 *
 * @param {number} inflationRate  decimal annual inflation rate
 * @param {number} baseYear       integer reference year for real dollars
 * @returns {{
 *   toReal: (amountNominal: number, year: number) => number,
 *   toNominal: (amountReal: number, year: number) => number
 * }}
 */
function makeInflation(inflationRate, baseYear) {
  const factor = (year) => Math.pow(1 + inflationRate, year - baseYear);
  return Object.freeze({
    toReal: (amountNominal, year) => amountNominal / factor(year),
    toNominal: (amountReal, year) => amountReal * factor(year),
  });
}

// ---- UMD-style module exports (Feature 015 follow-up) ----
// Converted from ES module to classic script so it loads under file://.
// (ES module imports require CORS-clean origins; file:// fails CORS.)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeInflation };
}
if (typeof globalThis !== 'undefined') {
  globalThis.makeInflation = makeInflation;
}
