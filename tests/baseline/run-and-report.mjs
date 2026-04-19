/**
 * tests/baseline/run-and-report.mjs — Node-runnable baseline harness driver.
 *
 * Runs the inline-harness against both canonical input sets (RR + Generic)
 * under all three solver modes and prints a baseline report to stdout.
 *
 * Usage:
 *   node tests/baseline/run-and-report.mjs
 *
 * Output shape:
 *   RR Canonical (mode=safe):
 *     fireAge:              <n>
 *     yearsToFire:          <n>
 *     feasible:             <bool>
 *     balanceAtUnlockReal:  $<n>
 *     balanceAtSSReal:      $<n>
 *     endBalanceReal:       $<n>
 *
 *   (same for Generic, and each of the three modes for each)
 *
 * The test at tests/baseline/inline-harness.test.js locks the exact values
 * this script produces — so if the inline HTML engine ever changes, this
 * script regenerates the numbers and the test will fail until the expected
 * constants inside inline-harness.test.js are re-locked.
 */

import { runInlineLifecycle } from './inline-harness.mjs';
import rrBundle from './inputs-rr.mjs';
import genericBundle from './inputs-generic.mjs';

const MODES = ['safe', 'exact', 'dieWithZero'];

function fmt$(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
}

function runAndPrint(label, bundle) {
  console.log(`${label}:`);
  for (const mode of MODES) {
    const r = runInlineLifecycle({ ...bundle, mode });
    console.log(`  mode=${mode}`);
    console.log(`    fireAge:              ${r.fireAge}`);
    console.log(`    yearsToFire:          ${r.yearsToFire}`);
    console.log(`    feasible:             ${r.feasible}`);
    console.log(`    annualSpend (input):  ${fmt$(r.annualSpend)}`);
    console.log(`    balanceAtUnlockReal:  ${fmt$(r.balanceAtUnlockReal)}`);
    console.log(`    balanceAtSSReal:      ${fmt$(r.balanceAtSSReal)}`);
    console.log(`    endBalanceReal:       ${fmt$(r.endBalanceReal)}`);
    console.log('');
  }
}

runAndPrint('RR Canonical (baseline-rr-inline.md §A)', rrBundle);
runAndPrint('Generic Canonical (baseline-rr-inline.md §B)', genericBundle);
