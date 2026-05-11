/*
 * Feature 028 — US1 stop-gap pill guard.
 *
 * Tests the pure decision function `_shouldOverrideStatusToInfeasible(...)`
 * extracted from the renderFireStatus inline pill block. The function returns
 * true iff the verdict pill should be forced to an infeasible state because:
 *   (a) the active strategy is non-default (i.e. `_lastStrategyResults.winnerId
 *       !== 'bracket-fill-smoothed'`), AND
 *   (b) the chart projection under that active strategy shows infeasibility
 *       (negative end balance, or any retirement-year buffer-floor violation),
 *       AND
 *   (c) the resolver would otherwise have rendered an "on track" verdict.
 *
 * Both HTMLs (RR + Generic) export the same helper on `window`/`globalThis`.
 * Tests load only the helper definition extracted from the HTML — no DOM, no
 * Chart.js, no whole-HTML eval.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', '..', 'FIRE-Dashboard.html');
const HTML_PATH_GENERIC = path.join(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html');

function extractHelper(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  // Helper is defined as `function _shouldOverrideStatusToInfeasible(...) { ... }`
  // The function is intentionally short (<40 lines). Match a balanced-brace body.
  const startIdx = src.indexOf('function _shouldOverrideStatusToInfeasible');
  if (startIdx === -1) {
    throw new Error(`_shouldOverrideStatusToInfeasible not found in ${filePath}`);
  }
  // Find the closing brace by counting nesting from the first '{'.
  let i = src.indexOf('{', startIdx);
  if (i === -1) throw new Error('No opening brace');
  let depth = 1;
  i++;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error('Unbalanced braces');
  const body = src.slice(startIdx, i);
  // Eval into a fresh scope and return the function reference.
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn _shouldOverrideStatusToInfeasible;`)();
}

function runSuite(name, helper) {
  test(`${name}: non-default winner + infeasible chart + on-track verdict → override`, () => {
    const result = helper({
      winnerId: 'aggressive-bracket-fill',
      chartEndBalance: -229755,
      chartHasViolation: true,
      currentVerdictIsOnTrack: true,
    });
    assert.strictEqual(result, true,
      'expected override=true when winner=aggressive AND chart fails AND verdict says on-track');
  });

  test(`${name}: non-default winner + violation only (positive endBalance) → override`, () => {
    // Buffer-floor violation can occur even with positive end balance —
    // depletion mid-retirement before recovery via SS isn't impossible.
    const result = helper({
      winnerId: 'aggressive-bracket-fill',
      chartEndBalance: 50000,
      chartHasViolation: true,
      currentVerdictIsOnTrack: true,
    });
    assert.strictEqual(result, true,
      'expected override=true when chart has any violation, even with positive endBalance');
  });

  test(`${name}: default winner (bracket-fill-smoothed) → no override`, () => {
    const result = helper({
      winnerId: 'bracket-fill-smoothed',
      chartEndBalance: -229755,
      chartHasViolation: true,
      currentVerdictIsOnTrack: true,
    });
    assert.strictEqual(result, false,
      'expected override=false when winner is the default — resolver+chart use same sim by definition');
  });

  test(`${name}: non-default winner + feasible chart → no override (no false negatives)`, () => {
    const result = helper({
      winnerId: 'aggressive-bracket-fill',
      chartEndBalance: 410121,
      chartHasViolation: false,
      currentVerdictIsOnTrack: true,
    });
    assert.strictEqual(result, false,
      'expected override=false when chart is feasible — must not block valid plans');
  });

  test(`${name}: verdict already infeasible → no override (idempotent)`, () => {
    const result = helper({
      winnerId: 'aggressive-bracket-fill',
      chartEndBalance: -229755,
      chartHasViolation: true,
      currentVerdictIsOnTrack: false,
    });
    assert.strictEqual(result, false,
      'expected override=false when current verdict is already infeasible — nothing to override');
  });

  test(`${name}: null winnerId → no override (cold-boot safety)`, () => {
    const result = helper({
      winnerId: null,
      chartEndBalance: -229755,
      chartHasViolation: true,
      currentVerdictIsOnTrack: true,
    });
    assert.strictEqual(result, false,
      'expected override=false when winnerId is null — cold-boot before strategy ranker');
  });
}

runSuite('RR  ', extractHelper(HTML_PATH));
runSuite('Gen ', extractHelper(HTML_PATH_GENERIC));
