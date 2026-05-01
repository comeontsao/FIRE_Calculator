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

// ---------------------------------------------------------------------------
// Exports — UMD-classic-script pattern (matches calc/accumulateToFire.js).
// CommonJS for Node (tests); globalThis for browser inline-script use case.
// ---------------------------------------------------------------------------
const _taxBracketsApi = {
  BRACKETS_MFJ_2024,
  BRACKETS_SINGLE_2024,
  FICA_SS_RATE,
  FICA_SS_WAGE_BASE_2024,
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
