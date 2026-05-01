/*
 * =============================================================================
 * MODULE: calc/displayConverter.js  (NEW — feature 022)
 *
 * Feature: 022-nominal-dollar-display
 * Spec:    specs/022-nominal-dollar-display/spec.md (FR-002, FR-008d)
 * Contract: specs/022-nominal-dollar-display/contracts/displayConverter.contract.md
 *
 * Purpose:
 *   Pure helper module exposing inflation-conversion functions. Single source
 *   of truth for the real-$ → nominal-$ (Book Value) transformation used by
 *   recalcAll() to produce snapshot-companion fields.
 *
 * Inputs:
 *   - toBookValue(realValue, age, currentAge, inflationRate) → number
 *   - toBookValueAtYearsFromNow(realValue, yearsFromNow, inflationRate) → number
 *   - invertToReal(bookValue, age, currentAge, inflationRate) → number
 *
 * Outputs: nominal-$ scalar (or real-$ for invertToReal).
 *
 * Consumers:
 *   - recalcAll() in FIRE-Dashboard.html (extends snapshot with bookValue companions)
 *   - recalcAll() in FIRE-Dashboard-Generic.html (lockstep mirror)
 *   - tests/unit/displayConverter.test.js (IRS-style inflation table parity)
 *
 * Policy:
 *   - PURE. NO DOM. NO Chart.js. NO globals beyond the UMD wrapper.
 *   - Deterministic; no side effects.
 *   - Math.pow only; no recursion.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: conversion (real-$ input → nominal-$ output)
 *   Frame-conversion sites: every public function in this module IS a conversion.
 *     - toBookValue body: real → nominal at year (age - currentAge)
 *     - toBookValueAtYearsFromNow body: real → nominal at year yearsFromNow
 *     - invertToReal body: nominal → real (inverse, used by tests + diagnostic)
 *
 * Constitution Principles:
 *   II  — pure module, contract-documented.
 *   V   — UMD-classic-script (CommonJS for Node tests; globalThis for browser).
 *   VI  — Consumers list above is canonical.
 * =============================================================================
 */

/**
 * Convert a real-$ (today's purchasing power) value to its nominal-$ Book Value
 * at the year corresponding to `age`.
 *
 * Formula: realValue × (1 + inflationRate)^(age − currentAge)
 *
 * Edge cases:
 *   - inflationRate === 0          → returns realValue unchanged
 *   - age === currentAge (yfn = 0) → returns realValue unchanged
 *   - age < currentAge (historical)→ returns realValue / (1 + i)^(currentAge − age)
 *                                    (Math.pow handles negative exponent natively)
 *   - !Number.isFinite(realValue)  → returns 0 (NaN guard per Edge Cases)
 *   - !Number.isFinite(inflationRate) → throws TypeError
 *   - typeof age !== 'number'      → throws TypeError
 *   - typeof currentAge !== 'number' → throws TypeError
 *
 * @param {number} realValue
 * @param {number} age
 * @param {number} currentAge
 * @param {number} inflationRate
 * @returns {number}
 */
// FRAME: conversion (signature site — body bridges real-$ → nominal-$)
function toBookValue(realValue, age, currentAge, inflationRate) {
  // FRAME: pure-data — input validation; no $ math yet
  if (typeof age !== 'number') {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning toBookValue identifier
      `displayConverter.toBookValue: age must be a number, got ${typeof age}`,
    );
  }
  // FRAME: pure-data — input validation continues
  if (typeof currentAge !== 'number') {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning toBookValue identifier
      `displayConverter.toBookValue: currentAge must be a number, got ${typeof currentAge}`,
    );
  }
  // FRAME: pure-data — input validation; inflationRate finiteness check
  if (!Number.isFinite(inflationRate)) {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning toBookValue + inflationRate
      `displayConverter.toBookValue: inflationRate must be finite, got ${inflationRate}`,
    );
  }

  // FRAME: real-$ — NaN guard (input is already real-$; non-finite collapses to 0)
  if (!Number.isFinite(realValue)) {
    return 0;
  }

  // FRAME: pure-data — short-circuit for trivial cases (no Math.pow needed)
  if (inflationRate === 0) {
    return realValue;
  }
  const yearsFromNow = age - currentAge;
  if (yearsFromNow === 0) {
    return realValue;
  }

  // FRAME: conversion (real → nominal at year (age - currentAge))
  return realValue * Math.pow(1 + inflationRate, yearsFromNow);
}

/**
 * Convenience overload when the caller already has yearsFromNow computed.
 *
 * Formula: realValue × (1 + inflationRate)^yearsFromNow
 *
 * Edge cases: identical to toBookValue (delegates internally).
 *
 * @param {number} realValue
 * @param {number} yearsFromNow
 * @param {number} inflationRate
 * @returns {number}
 */
// FRAME: conversion (signature site — body bridges real-$ → nominal-$)
function toBookValueAtYearsFromNow(realValue, yearsFromNow, inflationRate) {
  // FRAME: pure-data — input validation
  if (typeof yearsFromNow !== 'number') {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning toBookValueAtYearsFromNow
      `displayConverter.toBookValueAtYearsFromNow: yearsFromNow must be a number, got ${typeof yearsFromNow}`,
    );
  }
  // FRAME: pure-data — input validation; inflationRate finiteness check
  if (!Number.isFinite(inflationRate)) {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning inflationRate
      `displayConverter.toBookValueAtYearsFromNow: inflationRate must be finite, got ${inflationRate}`,
    );
  }

  // FRAME: real-$ — NaN guard
  if (!Number.isFinite(realValue)) {
    return 0;
  }

  // FRAME: pure-data — short-circuits
  if (inflationRate === 0) {
    return realValue;
  }
  if (yearsFromNow === 0) {
    return realValue;
  }

  // FRAME: conversion (real → nominal at year yearsFromNow)
  return realValue * Math.pow(1 + inflationRate, yearsFromNow);
}

/**
 * Reverse conversion. Used by tests + diagnostic only; NOT consumed by any
 * chart or live calc.
 *
 * Formula: bookValue / (1 + inflationRate)^(age − currentAge)
 *
 * Edge cases: identical to toBookValue.
 *
 * @param {number} bookValue
 * @param {number} age
 * @param {number} currentAge
 * @param {number} inflationRate
 * @returns {number}
 */
// FRAME: conversion (signature site — body bridges nominal-$ → real-$, inverse)
function invertToReal(bookValue, age, currentAge, inflationRate) {
  // FRAME: pure-data — input validation
  if (typeof age !== 'number') {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning invertToReal
      `displayConverter.invertToReal: age must be a number, got ${typeof age}`,
    );
  }
  // FRAME: pure-data — input validation continues
  if (typeof currentAge !== 'number') {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning invertToReal
      `displayConverter.invertToReal: currentAge must be a number, got ${typeof currentAge}`,
    );
  }
  // FRAME: pure-data — input validation; inflationRate finiteness check
  if (!Number.isFinite(inflationRate)) {
    throw new TypeError(
      // FRAME: pure-data — diagnostic string mentioning inflationRate
      `displayConverter.invertToReal: inflationRate must be finite, got ${inflationRate}`,
    );
  }

  // FRAME: nominal-$ — NaN guard (input is already nominal-$)
  if (!Number.isFinite(bookValue)) {
    return 0;
  }

  // FRAME: pure-data — short-circuits
  if (inflationRate === 0) {
    return bookValue;
  }
  const yearsFromNow = age - currentAge;
  if (yearsFromNow === 0) {
    return bookValue;
  }

  // FRAME: conversion (nominal → real, inverse)
  return bookValue / Math.pow(1 + inflationRate, yearsFromNow);
}

// ---------------------------------------------------------------------------
// Exports — UMD-classic-script pattern (matches calc/accumulateToFire.js,
// calc/taxBrackets.js). CommonJS for Node (tests); globalThis for browser
// inline-script consumption by recalcAll() in both HTMLs.
// ---------------------------------------------------------------------------
// FRAME: pure-data — UMD-export object listing the three conversion entry points
const _displayConverterApi = {
  // FRAME: conversion — see toBookValue body above
  toBookValue,
  // FRAME: conversion — see toBookValueAtYearsFromNow body above
  toBookValueAtYearsFromNow,
  // FRAME: conversion — see invertToReal body above
  invertToReal,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _displayConverterApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.displayConverter = _displayConverterApi;
}
