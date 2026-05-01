/*
 * Meta-test: every chart-consumed snapshot field has its `bookValue` companion.
 *
 * Feature: 022-nominal-dollar-display
 * Spec:    specs/022-nominal-dollar-display/spec.md FR-001 a-n, FR-008e
 * Contract: specs/022-nominal-dollar-display/contracts/recalcAll-snapshot-extension.contract.md
 *
 * Strategy: static-grep approach (no full recalcAll run; recalcAll requires
 * a browser context). Enumerates the expected companion field names from
 * data-model.md §per-year accumulation row + KPI scalars + side-chart-specific.
 * Greps both HTML files (FIRE-Dashboard.html + FIRE-Dashboard-Generic.html)
 * for matching `*BookValue` token assignments.
 *
 * NOTE (Wave 1): This test will INITIALLY FAIL because the
 * `_extendSnapshotWithBookValues` helper does not exist yet. The failure is
 * by design — US1 (Phase 5) closes the gap. Until then, the test runs and
 * emits a useful diagnostic listing the missing companions per file so US1
 * work can target them precisely.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

/** Both HTMLs must define identical companion fields per Lockstep rule. */
const HTML_FILES = Object.freeze([
  join(repoRoot, 'FIRE-Dashboard.html'),
  join(repoRoot, 'FIRE-Dashboard-Generic.html'),
]);

/**
 * Expected companion fields (per `data-model.md` § per-year accumulation row +
 * KPI scalars + side-chart-specific) — drawn from the FR-001 a-n inventory.
 *
 * Each entry is a `*BookValue` identifier we expect to appear in an assignment
 * inside `_extendSnapshotWithBookValues` (or equivalent helper) in BOTH HTMLs.
 *
 * Source: contracts/recalcAll-snapshot-extension.contract.md (reference impl).
 */
const EXPECTED_COMPANION_FIELDS = Object.freeze([
  // === lifecycleProjection.rows[i] (per-year accumulation row) ===
  'totalBookValue',
  'p401kBookValue',
  'pStocksBookValue',
  'pCashBookValue',
  'pRothBookValue',
  'ssIncomeBookValue',
  'withdrawalsBookValue',
  'grossIncomeBookValue',
  'federalTaxBookValue',
  'ficaTaxBookValue',
  'annualSpendingBookValue',
  'pretax401kEmployeeBookValue',
  'empMatchToTradBookValue',
  'stockContributionBookValue',
  'cashFlowToCashBookValue',
  'syntheticConversionBookValue',

  // === KPI scalars ===
  'fireNumberBookValue',
  'totalAtFireBookValue',

  // === Withdrawal Strategy chart ===
  'wTradBookValue',
  'wRothBookValue',
  'wStocksBookValue',
  'wCashBookValue',

  // === Drawdown chart ===
  'drawAmountBookValue',
  'runningTotalBookValue',

  // === Roth Ladder chart ===
  'convertAmountBookValue',
  'balanceAfterBookValue',

  // === Healthcare delta chart ===
  'premiumBookValue',
  'subsidyDeltaBookValue',

  // === Mortgage payoff bar chart ===
  // (totalBookValue covered above; principal + interest are mortgage-specific)
  'principalBookValue',
  'interestBookValue',

  // === Country budget tier comparison ===
  'annualSpendBookValue',
  'comfortableSpendBookValue',
  'normalSpendBookValue',
]);

/**
 * Assignment pattern we expect for each companion. `_extendSnapshotWithBookValues`
 * sets fields like:
 *   row.totalBookValue = toBV(row.total, row.age);
 *   snap.fireNumberBookValue = ...
 *   point.totalBookValue = ...
 *   scenario.annualSpendBookValue = ...
 *
 * We loosen to a regex that catches ANY assignment to `<id>BookValue` within
 * the file — the contract requires byte-identical helper bodies between the
 * two HTMLs, so absence in either file is a Lockstep violation.
 */
function assignmentRegex(fieldName) {
  // Match: `.<fieldName>` (property access on left) followed (eventually) by `=`
  // on the same line, NOT inside a comment.
  // Examples:
  //   row.totalBookValue = toBV(...)
  //   snap.fireNumberBookValue = ...
  // The `(?<!\/\/.*)` lookbehind for `//` comments is variable-width (not
  // supported in JS regex), so we filter comment-only lines manually below.
  return new RegExp(`\\b${fieldName}\\b\\s*=`);
}

test('snapshot-frame-coverage: every chart-consumed snapshot field has bookValue companion in both HTMLs', async () => {
  /** @type {Array<{file: string, missing: string[]}>} */
  const fileReports = [];

  for (const file of HTML_FILES) {
    const src = await readFile(file, 'utf8');
    const lines = src.split(/\r?\n/);

    // Build a quick set of "active" lines (not pure-comment lines). For the
    // grep target, we only need lines that contain code. Comment lines that
    // mention a field name don't count as an assignment.
    const codeLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return false;
      if (trimmed.startsWith('//')) return false;
      if (trimmed.startsWith('*')) return false;
      if (trimmed.startsWith('/*')) return false;
      return true;
    });
    const codeBlob = codeLines.join('\n');

    /** @type {string[]} */
    const missing = [];
    for (const field of EXPECTED_COMPANION_FIELDS) {
      if (!assignmentRegex(field).test(codeBlob)) {
        missing.push(field);
      }
    }
    fileReports.push({ file, missing });
  }

  // Lockstep: BOTH files must have ALL companions. Any file with a non-empty
  // missing list is a violation.
  const violators = fileReports.filter((r) => r.missing.length > 0);

  if (violators.length > 0) {
    const lines = [
      'Snapshot frame-coverage violation — chart-consumed fields missing bookValue companion:',
      `  expected ${EXPECTED_COMPANION_FIELDS.length} companion fields per file`,
      '',
    ];
    for (const r of violators) {
      lines.push(`File: ${r.file}`);
      lines.push(`  missing (${r.missing.length}):`);
      for (const field of r.missing) {
        lines.push(`    - ${field}`);
      }
      lines.push('');
    }
    lines.push(
      'See specs/022-nominal-dollar-display/contracts/recalcAll-snapshot-extension.contract.md',
    );
    lines.push('for the reference _extendSnapshotWithBookValues impl.');
    assert.fail(lines.join('\n'));
  }
});
