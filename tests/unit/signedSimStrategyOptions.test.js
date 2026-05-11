/*
 * Feature 028 — US2 strategy-aware signed simulator.
 *
 * Pins simulateRetirementOnlySigned (inline in both HTMLs) to the contract in
 * specs/028-strategy-aware-fire-age/contracts/signed-sim-options.contract.md:
 *
 *   1. Function signature MUST accept an `options` parameter (8th positional).
 *   2. When options.strategyOverride is set AND not 'bracket-fill-smoothed',
 *      the per-year withdrawal step MUST dispatch through getStrategies()'s
 *      computePerYearMix path (mirroring projectFullLifecycle's dispatch).
 *   3. When options.thetaOverride is set with strategyOverride =
 *      'tax-optimized-search', it MUST flow into the dispatch context.
 *   4. Back-compat: omitting options or passing undefined MUST produce the
 *      identical bracket-fill-default path (no behavioral change).
 *
 * Approach: source-level structural tests. The functions are inline (~1000
 * lines of co-dependencies on DOM/scenario/mortgage helpers) so a full Node
 * sandbox evaluation isn't tractable. Instead, we verify the code IMPLEMENTS
 * the contract pattern via regex on the function body. This is a lighter-
 * touch alternative to full parity assertions, justified because the same
 * dispatch pattern already exists in projectFullLifecycle (see lines
 * 10589-10619 in RR) and has been validated by 27 prior features. The risk
 * we're guarding against is "feature 028 forgets to add the dispatch."
 *
 * The actual end-balance parity is verified by the runtime probe in
 * tests/e2e/strategy-aware-pill.spec.ts (chart vs pill agreement) and by the
 * audit dump's `crossValidationWarnings.endBalance-mismatch` check (Phase 5).
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

function getFunctionSignature(src, fnName) {
  const re = new RegExp('function\\s+' + fnName + '\\s*\\(([^)]*)\\)', 'm');
  const m = src.match(re);
  if (!m) throw new Error(`function ${fnName} signature not found`);
  return m[1].split(',').map(p => p.trim()).filter(Boolean);
}

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: simulateRetirementOnlySigned signature accepts options parameter`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const params = getFunctionSignature(src, 'simulateRetirementOnlySigned');
    // Pre-feature-028 signature was 7 args: (inp, annualSpend, fireAge,
    // p401kTrad0, p401kRoth0, pStocks0, pCash0). Feature 028 adds `options`.
    assert.ok(params.length >= 8,
      `expected ≥8 parameters (post-028), got ${params.length}: [${params.join(', ')}]`);
    assert.ok(params.includes('options'),
      `expected 'options' parameter, got: [${params.join(', ')}]`);
  });

  test(`${name}: simulateRetirementOnlySigned body reads options.strategyOverride`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'simulateRetirementOnlySigned');
    // The function body MUST extract strategyOverride from options. We allow
    // either the destructure pattern or the explicit options.strategyOverride
    // access — both are acceptable per the contract.
    const hasStrategyRead = /options\s*\?\.\s*strategyOverride|options\s*&&\s*options\.strategyOverride|options\.strategyOverride/.test(body);
    assert.ok(hasStrategyRead,
      'simulateRetirementOnlySigned body must read options.strategyOverride');
  });

  test(`${name}: simulateRetirementOnlySigned body reads options.thetaOverride`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'simulateRetirementOnlySigned');
    const hasThetaRead = /options\s*\?\.\s*thetaOverride|options\s*&&\s*[^;]*thetaOverride|options\.thetaOverride/.test(body);
    assert.ok(hasThetaRead,
      'simulateRetirementOnlySigned body must read options.thetaOverride');
  });

  test(`${name}: simulateRetirementOnlySigned dispatches via getStrategies when override set`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'simulateRetirementOnlySigned');
    // The dispatch pattern: when strategyOverride is set, look up the policy
    // via getStrategies() and call its computePerYearMix. This mirrors
    // projectFullLifecycle's dispatch (lines ~10589-10619 in RR pre-028).
    const hasDispatch = /getStrategies\s*\(\s*\)/.test(body)
                     && /computePerYearMix/.test(body);
    assert.ok(hasDispatch,
      'simulateRetirementOnlySigned must dispatch via getStrategies()/.computePerYearMix when override is set');
  });

  test(`${name}: simulateRetirementOnlySigned preserves taxOptimizedWithdrawal default path`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'simulateRetirementOnlySigned');
    // Default path (no override) MUST still call taxOptimizedWithdrawal so
    // pre-028 behavior is byte-identical when options is absent. Constitution
    // Principle IV (gold-standard regression coverage).
    assert.ok(/taxOptimizedWithdrawal\s*\(/.test(body),
      'default path must still call taxOptimizedWithdrawal (back-compat)');
  });

  test(`${name}: signedLifecycleEndBalance signature accepts options parameter`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const params = getFunctionSignature(src, 'signedLifecycleEndBalance');
    assert.ok(params.includes('options'),
      `signedLifecycleEndBalance must accept options for strategy-aware retirement loop, got: [${params.join(', ')}]`);
  });

  test(`${name}: signedLifecycleEndBalance reads options.strategyOverride`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'signedLifecycleEndBalance');
    const hasStrategyRead = /options\s*\?\.\s*strategyOverride|options\s*&&\s*options\.strategyOverride|options\.strategyOverride/.test(body);
    assert.ok(hasStrategyRead,
      'signedLifecycleEndBalance body must read options.strategyOverride (it has its own retirement loop, not a wrapper)');
  });

  test(`${name}: signedLifecycleEndBalance dispatches via getStrategies when override set`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'signedLifecycleEndBalance');
    // signedLifecycleEndBalance is a parallel implementation of the retirement
    // loop (not a wrapper around simulateRetirementOnlySigned). Its per-year
    // step must dispatch via the strategy router same as projectFullLifecycle.
    const hasDispatch = /getStrategies\s*\(\s*\)/.test(body)
                     && /computePerYearMix/.test(body);
    assert.ok(hasDispatch,
      'signedLifecycleEndBalance must dispatch via getStrategies()/.computePerYearMix when override is set');
  });
});
