# Contract — `calc/displayConverter.js`

**Module**: `calc/displayConverter.js` (NEW in feature 022)
**Constitution**: Principle II (purity), Principle V (UMD-classic-script)

## Purpose

Pure helper module exposing inflation-conversion functions. Single source of truth for the real-$ → nominal-$ (Book Value) transformation used by `recalcAll()` to produce snapshot-companion fields.

## Function signatures

```js
toBookValue(realValue, age, currentAge, inflationRate) → number

  Converts a real-$ value (today's purchasing power) to its nominal-$ Book
  Value at the year corresponding to `age` (yearsFromNow = age - currentAge).

  Formula: realValue × (1 + inflationRate)^(age - currentAge)

  Edge cases:
    - inflationRate === 0           → returns realValue unchanged
    - age === currentAge (yfn=0)     → returns realValue unchanged
    - age < currentAge (historical)  → returns realValue / (1 + i)^(currentAge - age)
    - !Number.isFinite(realValue)    → returns 0 (NaN guard per Edge Cases)
    - !Number.isFinite(inflationRate) → throws TypeError
    - typeof age !== 'number'        → throws TypeError

toBookValueAtYearsFromNow(realValue, yearsFromNow, inflationRate) → number

  Convenience overload when caller already has yearsFromNow computed.

  Formula: realValue × (1 + inflationRate)^yearsFromNow

  Edge cases: same as toBookValue.

invertToReal(bookValue, age, currentAge, inflationRate) → number

  Reverse conversion. Used by tests + diagnostic only; NOT consumed by any
  chart or live calc.

  Formula: bookValue / (1 + inflationRate)^(age - currentAge)
```

## Module header

```
/*
 * calc/displayConverter.js — Real-$ to Book Value (nominal-$) conversion.
 *
 * Feature: 022-nominal-dollar-display
 * Spec:    specs/022-nominal-dollar-display/spec.md (FR-002, FR-008d)
 *
 * Inputs:
 *   - toBookValue(realValue, age, currentAge, inflationRate) → number
 *   - toBookValueAtYearsFromNow(realValue, yearsFromNow, inflationRate) → number
 *   - invertToReal(bookValue, age, currentAge, inflationRate) → number
 *
 * Outputs: nominal-$ scalar.
 *
 * Consumers:
 *   - recalcAll() in FIRE-Dashboard.html (extends snapshot with bookValue companions)
 *   - recalcAll() in FIRE-Dashboard-Generic.html (lockstep)
 *   - tests/unit/displayConverter.test.js (IRS-style inflation table parity)
 *
 * Policy: NO DOM. NO Chart.js. NO globals beyond the UMD wrapper. Pure
 *         math; deterministic; no side effects.
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: conversion module — bridges real-$ (input) to nominal-$ (output).
 *   Frame-conversion sites:
 *     - Line N: toBookValue body (real → nominal)
 *     - Line M: invertToReal body (nominal → real, inverse)
 */
```

## UMD wrapper

```js
const _displayConverterApi = {
  toBookValue,
  toBookValueAtYearsFromNow,
  invertToReal,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _displayConverterApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.displayConverter = _displayConverterApi;
}
```

## Tests (`tests/unit/displayConverter.test.js`)

Required cases (≥6):

1. **Identity at yearsFromNow=0**: `toBookValue(1000, 42, 42, 0.03) === 1000`.
2. **Standard conversion**: `toBookValue(445000, 53, 42, 0.03) ≈ $445,000 × 1.03^11 ≈ $616,008` (within $1).
3. **Zero inflation**: `toBookValue(1000, 53, 42, 0) === 1000`.
4. **Inverse round-trip**: `invertToReal(toBookValue(1000, 53, 42, 0.03), 53, 42, 0.03) ≈ 1000` (within floating-point precision).
5. **Historical age (age < currentAge)**: `toBookValue(1000, 30, 42, 0.03) === 1000 / 1.03^12 ≈ $701` (deflation case; not used by feature 022 but defined behavior).
6. **NaN guard**: `toBookValue(NaN, 53, 42, 0.03) === 0`.
7. **Throws on bad inflationRate**: `toBookValue(1000, 53, 42, NaN)` throws TypeError.
8. **toBookValueAtYearsFromNow parity**: `toBookValueAtYearsFromNow(1000, 11, 0.03) === toBookValue(1000, 53, 42, 0.03)`.

Performance microbenchmark (informational): 100,000 calls complete in <50ms on a mid-range laptop. The conversion is just one `Math.pow`, well within the FR-008b budget.
