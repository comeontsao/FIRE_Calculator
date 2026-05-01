// ==================== UNIT TESTS: taxBrackets =========================
// Feature 021 — Tax Expense Category + Audit Cleanup.
// Spec: specs/021-tax-category-and-audit-cleanup/contracts/taxBrackets-2024.contract.md
//
// All tests are pure-Node — no DOM, no browser globals.
// Module under test: calc/taxBrackets.js
// =======================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const taxBrackets = require(path.resolve(__dirname, '..', '..', 'calc', 'taxBrackets.js'));

const {
  BRACKETS_MFJ_2024,
  BRACKETS_SINGLE_2024,
  FICA_SS_RATE,
  FICA_SS_WAGE_BASE_2024,
  FICA_MEDICARE_RATE,
  FICA_ADDITIONAL_MEDICARE_RATE,
  FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE,
  FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ,
} = taxBrackets;

// Reference progressive-tax computer used by case 6 (mirrors accumulateToFire v3).
function computeProgressiveTax(taxableIncome, bracketTable) {
  let tax = 0;
  let prevBound = 0;
  for (const b of bracketTable.brackets) {
    if (taxableIncome <= prevBound) break;
    const inThisBracket = Math.min(taxableIncome, b.upperBound) - prevBound;
    if (inThisBracket > 0) tax += inThisBracket * b.rate;
    prevBound = b.upperBound;
  }
  return tax;
}

// Case 1: MFJ structure
test('taxBrackets-01: MFJ structure — standardDeduction $29,200, 7 brackets, 10%..37%', () => {
  assert.strictEqual(BRACKETS_MFJ_2024.standardDeduction, 29200);
  assert.strictEqual(BRACKETS_MFJ_2024.filingStatus, 'mfj');
  assert.strictEqual(BRACKETS_MFJ_2024.brackets.length, 7);
  assert.strictEqual(BRACKETS_MFJ_2024.brackets[0].rate, 0.10);
  assert.strictEqual(BRACKETS_MFJ_2024.brackets[6].rate, 0.37);
  assert.strictEqual(BRACKETS_MFJ_2024.brackets[6].upperBound, Infinity);
});

// Case 2: Single structure
test('taxBrackets-02: single structure — standardDeduction $14,600, 7 brackets, 10%..37%', () => {
  assert.strictEqual(BRACKETS_SINGLE_2024.standardDeduction, 14600);
  assert.strictEqual(BRACKETS_SINGLE_2024.filingStatus, 'single');
  assert.strictEqual(BRACKETS_SINGLE_2024.brackets.length, 7);
  assert.strictEqual(BRACKETS_SINGLE_2024.brackets[0].rate, 0.10);
  assert.strictEqual(BRACKETS_SINGLE_2024.brackets[6].rate, 0.37);
  assert.strictEqual(BRACKETS_SINGLE_2024.brackets[6].upperBound, Infinity);
});

// Case 3: Frozen invariant
test('taxBrackets-03: frozen invariant — Object.freeze applied (mutations no-op or throw)', () => {
  assert.strictEqual(Object.isFrozen(BRACKETS_MFJ_2024), true);
  assert.strictEqual(Object.isFrozen(BRACKETS_MFJ_2024.brackets), true);
  assert.strictEqual(Object.isFrozen(BRACKETS_MFJ_2024.brackets[0]), true);
  assert.strictEqual(Object.isFrozen(BRACKETS_SINGLE_2024), true);

  // In sloppy mode, assignment is silently ignored. In strict mode it throws.
  // We verify the structure is unchanged regardless of which mode runs the test.
  try { BRACKETS_MFJ_2024.standardDeduction = 99999; } catch (e) { /* strict mode throws */ }
  assert.strictEqual(BRACKETS_MFJ_2024.standardDeduction, 29200);

  try { BRACKETS_MFJ_2024.brackets[0].rate = 0.99; } catch (e) { /* strict mode throws */ }
  assert.strictEqual(BRACKETS_MFJ_2024.brackets[0].rate, 0.10);
});

// Case 4: FICA constants
test('taxBrackets-04: FICA constants match SSA 2024 published values', () => {
  assert.strictEqual(FICA_SS_RATE, 0.062);
  assert.strictEqual(FICA_SS_WAGE_BASE_2024, 168600);
  assert.strictEqual(FICA_MEDICARE_RATE, 0.0145);
  assert.strictEqual(FICA_ADDITIONAL_MEDICARE_RATE, 0.009);
  assert.strictEqual(FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ, 250000);
  assert.strictEqual(FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE, 200000);
});

// Case 5: Bracket monotonicity
test('taxBrackets-05: brackets are monotone in both rate and upperBound', () => {
  for (const table of [BRACKETS_MFJ_2024, BRACKETS_SINGLE_2024]) {
    for (let i = 0; i < table.brackets.length - 1; i++) {
      const a = table.brackets[i];
      const b = table.brackets[i + 1];
      assert.ok(a.rate < b.rate, `${table.filingStatus} bracket ${i} rate ${a.rate} < ${b.rate}`);
      assert.ok(a.upperBound < b.upperBound, `${table.filingStatus} bracket ${i} upperBound ${a.upperBound} < ${b.upperBound}`);
    }
  }
});

// Case 6: IRS-table parity (4 sub-cases)
// Note (021): Reference values computed from the canonical 2024 IRS brackets
// (Rev. Proc. 2023-34). The contract draft cited slightly different figures
// (e.g., $11,932.50 for MFJ $100k) which would correspond to a different
// bracket structure; they do not match Rev. Proc. 2023-34 published rates.
// We assert the formula-derived values from the bracket table — which IS the
// IRS 2024 source-of-truth — within $1.
test('taxBrackets-06a: MFJ taxable income $100,000 → tax $12,106.00 (within $1)', () => {
  // 10%×23,200 + 12%×71,100 + 22%×5,700 = 2,320 + 8,532 + 1,254 = 12,106
  const tax = computeProgressiveTax(100000, BRACKETS_MFJ_2024);
  assert.ok(Math.abs(tax - 12106) <= 1, `expected ~$12,106, got $${tax.toFixed(2)}`);
});

test('taxBrackets-06b: single taxable income $50,000 → tax $6,053.00 (within $1)', () => {
  // 10%×11,600 + 12%×35,550 + 22%×2,850 = 1,160 + 4,266 + 627 = 6,053
  const tax = computeProgressiveTax(50000, BRACKETS_SINGLE_2024);
  assert.ok(Math.abs(tax - 6053) <= 1, `expected ~$6,053, got $${tax.toFixed(2)}`);
});

test('taxBrackets-06c: MFJ taxable income $200,000 → tax $34,106.00 (within $1)', () => {
  // 10%×23,200 + 12%×71,100 + 22%×105,700 = 2,320 + 8,532 + 23,254 = 34,106
  const tax = computeProgressiveTax(200000, BRACKETS_MFJ_2024);
  assert.ok(Math.abs(tax - 34106) <= 1, `expected ~$34,106, got $${tax.toFixed(2)}`);
});

test('taxBrackets-06d: single taxable income $200,000 → tax $41,687.00 (within $1)', () => {
  // 10%×11,600 + 12%×35,550 + 22%×53,375 + 24%×8,050 + 32%×0 = 1,160 + 4,266 + 11,742.50 + 1,932 + 24%×8,050
  // = single $200k: 10%×11,600 + 12%×(47,150-11,600) + 22%×(100,525-47,150) + 24%×(191,950-100,525) + 32%×(200,000-191,950)
  // = 1,160 + 4,266 + 11,742.50 + 21,942 + 2,576 = 41,686.50
  const tax = computeProgressiveTax(200000, BRACKETS_SINGLE_2024);
  assert.ok(Math.abs(tax - 41686.5) <= 1, `expected ~$41,686.50, got $${tax.toFixed(2)}`);
});
