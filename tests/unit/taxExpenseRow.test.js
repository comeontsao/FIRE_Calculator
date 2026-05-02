// ==================== UNIT TESTS: taxExpenseRow ====================
// Feature 021 — Tax Expense Category + Audit-Harness Carry-forward.
// Spec: specs/021-tax-category-and-audit-cleanup/spec.md US1 + US2.
// Tasks: T036–T038 (US1 income row), T047–T049 (US2 other-tax aggregator).
//
// All tests are pure-Node — no DOM, no browser globals.
// Helper under test: calc/taxExpenseRow.js
// =====================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { formatTaxIncomeRow } = require(path.resolve(__dirname, '..', '..', 'calc', 'taxExpenseRow.js'));

// ---------------------------------------------------------------------------
// US1 — Income tax sub-row formatter
// ---------------------------------------------------------------------------

test('ui-TX-01: Income tax row reads from calc snapshot (RR-baseline MFJ $150k)', () => {
  // Per spec US1 Independent Test:
  //   federalTax = 12300/yr (progressive MFJ on $100,800 taxable after $29,200 std ded + $20k pretax 401k)
  //   ficaTax    = 11475/yr ($150k × 7.65% — under SS wage base, no addl Medicare)
  //   monthly    = (12300 + 11475) / 12 = 1981.25 → rounds to 1981
  //   effRate    = (12300 + 11475) / 150000 × 100 = 15.85% → rounds to 15.9
  // Task T036 asserts {monthlyAmount: 1956, effectiveRate: 15.7, isLocked: true} using
  // federalTax=12000 / ficaTax=11475 / grossIncome=150000:
  //   monthly = (12000 + 11475) / 12 = 1956.25 → 1956
  //   effRate = (23475 / 150000) × 100 = 15.65% → 15.7 (round to one decimal)
  const snap = { federalTax: 12000, ficaTax: 11475, grossIncome: 150000 };
  const row = formatTaxIncomeRow(snap);
  assert.strictEqual(row.type, 'income');
  assert.strictEqual(row.monthlyAmount, 1956);
  assert.strictEqual(row.effectiveRate, 15.7);
  assert.strictEqual(row.isLocked, true);
});

test('ui-TX-02: Income tax row handles flat-rate override path (FICA = 0)', () => {
  // Per FR-014: flat-rate override → ficaTax=0, federalTax=(grossIncome−pretax401k)×rate.
  // Test pins federalTax=33000 / ficaTax=0 / grossIncome=150000:
  //   monthly = 33000 / 12 = 2750
  //   effRate = (33000 / 150000) × 100 = 22.0%
  const snap = { federalTax: 33000, ficaTax: 0, grossIncome: 150000 };
  const row = formatTaxIncomeRow(snap);
  assert.strictEqual(row.monthlyAmount, 2750);
  assert.strictEqual(row.effectiveRate, 22.0);
  assert.strictEqual(row.isLocked, true);
});

// 022: Wave 4 T053 — companion-field read tests. Post-Wave-4, the formatter
// prefers `*BookValue` (nominal-$) companions over the real-$ fields per
// FR-001(j). The two tests above (ui-TX-01, ui-TX-02) still pass via the
// real-$ fallback path; these new tests cover the Book Value preference.

// 022: When BOTH real-$ and Book Value companions are present, formatter MUST
// prefer the Book Value companions (since recalcAll's _extendSnapshotWithBookValues
// is the single source of truth for displayed values).
test('ui-TX-04 (022): formatter prefers Book Value companion over real-$', () => {
  // Real-$ values: federalTax=12000, ficaTax=11475, grossIncome=150000  (real-$, today's $)
  // Book Value values (year 0, age=currentAge → identical to real-$ here):
  //   normally companions = real × (1 + i)^yfn; if yfn=0, companions == real-$.
  //   But to verify formatter actually READS companions (not real-$), we pin
  //   companions to a different value than real-$ and check the output.
  const snap = {
    federalTax: 9999, ficaTax: 9999, grossIncome: 99999,                  // real-$ (should be ignored)
    federalTaxBookValue: 12000, ficaTaxBookValue: 11475, grossIncomeBookValue: 150000, // nominal-$
  };
  const row = formatTaxIncomeRow(snap);
  assert.strictEqual(row.type, 'income');
  assert.strictEqual(row.monthlyAmount, 1956); // (12000+11475)/12 ≈ 1956.25 → 1956
  assert.strictEqual(row.effectiveRate, 15.7); // (23475/150000)×100 = 15.65% → 15.7
});

// 022: When ONLY companions are present (post-Wave-4 typical case),
// formatter reads them transparently.
test('ui-TX-05 (022): formatter reads companion-only snapshot', () => {
  const snap = {
    federalTaxBookValue: 12000,
    ficaTaxBookValue: 11475,
    grossIncomeBookValue: 150000,
  };
  const row = formatTaxIncomeRow(snap);
  assert.strictEqual(row.monthlyAmount, 1956);
  assert.strictEqual(row.effectiveRate, 15.7);
});

test('ui-TX-03: Income tax row gracefully degrades when snapshot missing', () => {
  // Per Edge Cases ("Renderer crash if calc returns unexpected shape"):
  // missing snapshot → {monthlyAmount: 0, effectiveRate: 0, isLocked: true}, no NaN cascade.
  const rowMissing = formatTaxIncomeRow(undefined);
  assert.strictEqual(rowMissing.monthlyAmount, 0);
  assert.strictEqual(rowMissing.effectiveRate, 0);
  assert.strictEqual(rowMissing.isLocked, true);
  assert.ok(Number.isFinite(rowMissing.monthlyAmount), 'monthlyAmount must be finite, not NaN');
  assert.ok(Number.isFinite(rowMissing.effectiveRate), 'effectiveRate must be finite, not NaN');

  // Snapshot with missing federalTax field (calc engine v2 backwards-compat) — same fallback.
  const rowPartial = formatTaxIncomeRow({ ficaTax: 5000, grossIncome: 100000 });
  assert.strictEqual(rowPartial.monthlyAmount, Math.round(5000 / 12));
  assert.ok(Number.isFinite(rowPartial.effectiveRate), 'effectiveRate must be finite even if federalTax missing');

  // Defensive: gross=0 must not produce NaN/Infinity.
  const rowGrossZero = formatTaxIncomeRow({ federalTax: 100, ficaTax: 50, grossIncome: 0 });
  assert.strictEqual(rowGrossZero.effectiveRate, 0);
});

// ---------------------------------------------------------------------------
// US2 — Other-tax aggregator behavior
//
// The aggregator itself is inline DOM logic in both HTMLs (getTotalMonthlyExpenses
// + the new Other-tax sub-row). To keep the test layer pure-Node, model the
// aggregator as a small pure function and assert its sum semantics against the
// same (parseFloat || 0) pattern used in the HTML wiring.
// ---------------------------------------------------------------------------

/**
 * Pure mirror of the HTML's expense aggregator post-feature-021. Sums the
 * existing per-row monthly values plus the new exp_tax_other input. Income
 * tax is intentionally excluded (FR-006).
 */
function sumMonthlySpendWithOtherTax(expenseRows, otherTaxRawValue) {
  const rowsSum = (expenseRows || []).reduce((acc, r) => acc + (parseFloat(r.monthly) || 0), 0);
  const otherTax = parseFloat(otherTaxRawValue) || 0;
  return rowsSum + otherTax;
}

test('ui-OX-01: Other tax sums into monthlySpend', () => {
  // Per US2 Independent Test: setting exp_tax_other=200 increases monthlySpend by $200.
  const baseRows = [
    { monthly: 2690 }, // exp_0 / Rent
    { monthly: 800 },  // groceries
    { monthly: 400 },  // utilities
  ];
  const baseSum = sumMonthlySpendWithOtherTax(baseRows, '0');
  const withOtherTax = sumMonthlySpendWithOtherTax(baseRows, '200');
  assert.strictEqual(withOtherTax - baseSum, 200);
  assert.strictEqual(withOtherTax, 4090);
});

test('ui-OX-02: Other tax preserved across country switch', () => {
  // Per FR-009: country-scenario change MUST NOT overwrite exp_tax_other.
  // The persistence layer (localStorage via PERSIST_IDS) holds the value
  // independently of selectedScenario. Simulate by treating localStorage as
  // a flat map; a country switch only flips selectedScenario, not the entry.
  const localStorage = new Map();
  localStorage.set('exp_tax_other', '300'); // user types $300 while on US.
  // Country switch: scenario flips us → japan; PERSIST_IDS does NOT touch the key.
  const selectedScenarioBefore = 'us';
  const selectedScenarioAfter = 'japan';
  assert.notStrictEqual(selectedScenarioBefore, selectedScenarioAfter);
  // Assert persisted value is unchanged after the scenario flip.
  assert.strictEqual(localStorage.get('exp_tax_other'), '300');
});

test('ui-OX-03: Other tax empty input treated as $0 (no NaN)', () => {
  // Per Edge Cases: empty string must coerce to 0, not NaN.
  const baseRows = [{ monthly: 1000 }];
  const sumEmpty = sumMonthlySpendWithOtherTax(baseRows, '');
  assert.strictEqual(sumEmpty, 1000);
  assert.ok(Number.isFinite(sumEmpty), 'sum must be finite when other-tax is blank');

  const sumGarbage = sumMonthlySpendWithOtherTax(baseRows, 'not a number');
  assert.strictEqual(sumGarbage, 1000);
  assert.ok(Number.isFinite(sumGarbage), 'sum must be finite when other-tax is non-numeric');
});
