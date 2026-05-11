/*
 * Feature 029 — US1+US2 simulator grossSpend parity (Bug A fix).
 *
 * Pins _simulateStrategyLifetime's ctx.grossSpend formula to include the
 * overlay terms (hcDelta + collegeCostThisYear) that the user-reported bug
 * (2026-05-11) traced back to missing.
 *
 * Pre-029 bug: `grossSpend: retireSpend` (overlays dropped).
 * Post-029 fix: `grossSpend: _f029_grossSpend_` where
 *   _f029_grossSpend_ = max(0, retireSpend + hcDelta + collegeCostThisYear).
 *
 * Note: h2Carry intentionally NOT included to match computeWithdrawalStrategy's
 * current behavior. Full canonical parity (with h2Carry) tracked as a backlog
 * follow-up.
 *
 * Approach: source-level structural test (mirrors signedSimStrategyOptions.test.js
 * pattern from feature 028). Verifies the function body contains the overlay
 * computation and ctx consumes the composed value instead of retireSpend alone.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATHS = [
  { name: 'RR     ', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard.html') },
  { name: 'Generic', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html') },
];

function extractFunctionBody(src, fnName) {
  const startIdx = src.indexOf('function ' + fnName);
  if (startIdx === -1) throw new Error(`function ${fnName} not found`);
  let i = src.indexOf('{', startIdx);
  if (i === -1) throw new Error('No opening brace for ' + fnName);
  let depth = 1;
  i++;
  const bodyStart = i;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error('Unbalanced braces in ' + fnName);
  return src.slice(bodyStart, i - 1);
}

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: _simulateStrategyLifetime body computes hcDelta from getHealthcareDeltaAnnual`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    assert.match(body, /getHealthcareDeltaAnnual\s*\(/,
      'expected _simulateStrategyLifetime to call getHealthcareDeltaAnnual for per-age healthcare overlay');
  });

  test(`${name}: _simulateStrategyLifetime body computes collegeCostThisYear from getTotalCollegeCostForYear`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    assert.match(body, /getTotalCollegeCostForYear\s*\(/,
      'expected _simulateStrategyLifetime to call getTotalCollegeCostForYear for per-age college overlay');
  });

  test(`${name}: _simulateStrategyLifetime ctx.grossSpend uses overlay-inclusive value (not retireSpend alone)`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    // Find the ctx object literal and verify grossSpend is NOT the bare `retireSpend`.
    // Post-029, the line is `grossSpend: _f029_grossSpend_,` (or equivalent named local).
    assert.doesNotMatch(body, /grossSpend:\s*retireSpend\s*,/,
      'Bug A regression: ctx.grossSpend uses retireSpend directly without overlay composition');
    assert.match(body, /grossSpend:\s*_f029_grossSpend_/,
      'expected ctx.grossSpend to be assigned from the composed Feature 029 local _f029_grossSpend_');
  });

  test(`${name}: _f029_grossSpend_ composition includes retireSpend + hcDelta + college, clamped to 0`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    // The composition line should be: `const _f029_grossSpend_ = Math.max(0, retireSpend + _f029_hcDelta_ + _f029_college_);`
    assert.match(body, /_f029_grossSpend_\s*=\s*Math\.max\(\s*0\s*,\s*retireSpend\s*\+\s*_f029_hcDelta_\s*\+\s*_f029_college_/,
      'expected _f029_grossSpend_ = Math.max(0, retireSpend + _f029_hcDelta_ + _f029_college_) composition');
  });

  test(`${name}: overlay helpers are guarded with typeof checks for sandbox safety`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    // Sandbox tests (Node-vm) don't have selectedScenario / globals in scope.
    // The helpers must short-circuit cleanly to 0.
    assert.match(body, /typeof\s+getHealthcareDeltaAnnual\s*===\s*['"]function['"]/,
      'expected typeof guard on getHealthcareDeltaAnnual for sandbox safety');
    assert.match(body, /typeof\s+selectedScenario\s*!==\s*['"]undefined['"]/,
      'expected typeof guard on selectedScenario for sandbox safety');
    assert.match(body, /typeof\s+getTotalCollegeCostForYear\s*===\s*['"]function['"]/,
      'expected typeof guard on getTotalCollegeCostForYear for sandbox safety');
  });

  test(`${name}: Feature 029 comment block is present and references the contract`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    assert.match(body, /Feature 029/,
      'expected Feature 029 comment block on the overlay-inclusive grossSpend lines');
    assert.match(body, /grossSpend-parity\.contract\.md|FR-001/,
      'expected reference to the parity contract or FR-001');
  });
});
