# Contract — `calc/taxBrackets.js`

**Module**: `calc/taxBrackets.js` (NEW in feature 021)
**Constitution**: Principle II (purity), Principle V (UMD-classic-script)

## Purpose

Pure data module exposing IRS 2024 federal income tax brackets + standard deduction + SSA 2024 FICA rates and thresholds. Single source of truth for tax constants used by `calc/accumulateToFire.js` v3.

## Exports

```js
const BRACKETS_MFJ_2024 = Object.freeze({
  filingStatus: 'mfj',
  standardDeduction: 29200,
  brackets: Object.freeze([
    Object.freeze({ rate: 0.10, upperBound: 23200 }),
    Object.freeze({ rate: 0.12, upperBound: 94300 }),
    Object.freeze({ rate: 0.22, upperBound: 201050 }),
    Object.freeze({ rate: 0.24, upperBound: 383900 }),
    Object.freeze({ rate: 0.32, upperBound: 487450 }),
    Object.freeze({ rate: 0.35, upperBound: 731200 }),
    Object.freeze({ rate: 0.37, upperBound: Infinity }),
  ]),
});

const BRACKETS_SINGLE_2024 = Object.freeze({
  filingStatus: 'single',
  standardDeduction: 14600,
  brackets: Object.freeze([
    Object.freeze({ rate: 0.10, upperBound: 11600 }),
    Object.freeze({ rate: 0.12, upperBound: 47150 }),
    Object.freeze({ rate: 0.22, upperBound: 100525 }),
    Object.freeze({ rate: 0.24, upperBound: 191950 }),
    Object.freeze({ rate: 0.32, upperBound: 243725 }),
    Object.freeze({ rate: 0.35, upperBound: 609350 }),
    Object.freeze({ rate: 0.37, upperBound: Infinity }),
  ]),
});

const FICA_SS_RATE = 0.062;
const FICA_SS_WAGE_BASE_2024 = 168600;
const FICA_MEDICARE_RATE = 0.0145;
const FICA_ADDITIONAL_MEDICARE_RATE = 0.009;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000;
const FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ = 250000;
```

## UMD wrapper

Per Constitution Principle V (file:// compatibility), the module ships with a UMD-classic-script wrapper:

```js
// At end of calc/taxBrackets.js:
const _taxBracketsApi = {
  BRACKETS_MFJ_2024, BRACKETS_SINGLE_2024,
  FICA_SS_RATE, FICA_SS_WAGE_BASE_2024,
  FICA_MEDICARE_RATE,
  FICA_ADDITIONAL_MEDICARE_RATE,
  FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE,
  FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ,
};

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _taxBracketsApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.taxBrackets = _taxBracketsApi;
}
```

## Header

```
/*
 * calc/taxBrackets.js — IRS 2024 federal income tax brackets + SSA 2024 FICA constants.
 *
 * Feature: 021-tax-category-and-audit-cleanup
 * Sources: IRS Rev. Proc. 2023-34; IRS Pub 17 (2024); SSA Press Release Oct 2023.
 *
 * Inputs: none (pure-data module).
 * Outputs: BRACKETS_MFJ_2024, BRACKETS_SINGLE_2024, FICA_SS_RATE,
 *          FICA_SS_WAGE_BASE_2024, FICA_MEDICARE_RATE, FICA_ADDITIONAL_MEDICARE_RATE,
 *          FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE,
 *          FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ.
 * Consumers:
 *   - calc/accumulateToFire.js (v3+) — federalTax + ficaTax computation per accumulation year.
 *   - tests/unit/taxBrackets.test.js — IRS-table parity test.
 *
 * Policy: NO logic; just frozen constants. Constitution Principle II (pure data).
 *         When 2025+ brackets need to ship, create taxBrackets.js with versioned
 *         exports (e.g., BRACKETS_MFJ_2025) and update consumers.
 */
```

## Tests (`tests/unit/taxBrackets.test.js`)

Required cases (≥6):

1. **MFJ structure**: `BRACKETS_MFJ_2024.standardDeduction === 29200`. Bracket count === 7. First bracket rate === 0.10. Last bracket rate === 0.37 with `upperBound === Infinity`.
2. **Single structure**: same shape checks for `BRACKETS_SINGLE_2024` with `standardDeduction === 14600`.
3. **Frozen invariant**: attempting `BRACKETS_MFJ_2024.standardDeduction = 99999` throws in strict mode (or has no effect in sloppy mode); structure remains unchanged.
4. **FICA constants**: `FICA_SS_RATE === 0.062`, `FICA_SS_WAGE_BASE_2024 === 168600`, `FICA_MEDICARE_RATE === 0.0145`, `FICA_ADDITIONAL_MEDICARE_RATE === 0.009`, MFJ threshold === 250000, single threshold === 200000.
5. **Bracket monotonicity**: for each table, `brackets[i].upperBound < brackets[i+1].upperBound` and `brackets[i].rate < brackets[i+1].rate`.
6. **Sample tax computation parity** (against IRS published 2024 tables):
   - MFJ taxable income $100,000: tax = $11,932.50 — verify summing per-bracket gives this within $1.
   - Single taxable income $50,000: tax = $5,853.50 — verify within $1.
   - MFJ taxable income $200,000: tax = $35,012.50 — verify within $1.
   - Single taxable income $200,000: tax = $40,030.50 — verify within $1.
