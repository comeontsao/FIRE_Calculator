/*
 * Feature 030 — Cash-sweep simulator-integration structural pins (T006).
 *
 * Mirrors the pattern from tests/unit/signedSimStrategyOptions.test.js:
 * regex-based extraction of inline function bodies to verify that each
 * simulator invokes `_applyCashSweep(` immediately after its existing
 * `pCash *= 1.005` (or `pCash *= (1 + 0.005 * scale)`) cash-interest
 * compounding line. This is the canonical "year-end" point per
 * specs/030-cash-sweep-stocks/contracts/cash-sweep.contract.md § "Simulator
 * Integration Sites".
 *
 * Why structural (regex) tests instead of full numerical sandboxing?
 *   The inline simulators in the HTML files (~1000 LOC each, with
 *   co-dependencies on DOM/scenario/mortgage/strategy helpers) cannot be
 *   trivially evaluated in a Node sandbox. The structural pin is light-touch
 *   but sufficient: it catches the regression "feature 030 forgets to wire
 *   _applyCashSweep into simulator X." Actual numerical correctness is
 *   covered by:
 *     - tests/unit/cashSweepHelper.test.js (helper purity)
 *     - tests/unit/cashSweepRrFixture.test.js (end-to-end numerical pin via
 *       calc/accumulateToFire.js + calc/cashSweep.js)
 *     - tests/unit/cashSweepAuditInvariant.test.js (runtime parity check)
 *     - tests/e2e/cash-sweep-toggle.spec.ts (browser-level UX matrix)
 *
 * EXPECTED FAILURE STATE AT WRITE-TIME:
 *   These tests are written BEFORE Backend Engineer threads `_applyCashSweep`
 *   into the 5 inline simulators in both HTMLs. Until that integration ships,
 *   the simulator-body assertions WILL FAIL. The catalog-presence + helper-
 *   module tests pass immediately because `calc/cashSweep.js` is already
 *   landed and the data-i18n attributes are in the HTML.
 *
 * Test scope (target ~10–15 cases):
 *   Per HTML (RR + Generic):
 *     - signedLifecycleEndBalance body contains ≥2 _applyCashSweep calls
 *       (accumulation phase + retirement phase) — 2 HTMLs × 1 fn = 2 cases
 *     - simulateRetirementOnlySigned body contains _applyCashSweep — 2 cases
 *     - _simulateStrategyLifetime body contains _applyCashSweep — 2 cases
 *     - computeWithdrawalStrategy body contains _applyCashSweep — 2 cases
 *     - Catalog presence: plan.cashSweepToggle / plan.cashSweepThreshold /
 *       plan.cashSweepTooltip / plan.cashSweepThresholdHelp keys exist in
 *       BOTH the EN and zh-TW translation objects — 2 cases
 *   calc/accumulateToFire.js body contains _applyCashSweep after the
 *     `pCash *= 1.005;` line — 1 case
 *
 * Total: 11 cases.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATHS = [
  { name: 'RR     ', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard.html') },
  { name: 'Generic', file: path.join(__dirname, '..', '..', 'FIRE-Dashboard-Generic.html') },
];

const ACCUMULATE_TO_FIRE_PATH = path.join(__dirname, '..', '..', 'calc', 'accumulateToFire.js');

/**
 * Extract a function body by name. Walks brace depth from the function's
 * opening `{` to the matching `}`. Returns the substring BETWEEN the braces
 * (exclusive).
 */
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

/**
 * Verify body invokes _applyCashSweep at least minCount times AND each call
 * follows (textually) a cash-compounding line within ~600 characters. The
 * 600-char window matches the canonical integration block size in
 * contracts/cash-sweep.contract.md (an `if/let` block + trace push).
 *
 * 033(US1): the compounding form changed from hardcoded `1.005` /
 * `(1 + 0.005 * scale)` to the named constant `(1 + CASH_REAL_RETURN)` /
 * `(1 + CASH_REAL_RETURN * scale)` (calc module uses the `_CASH_REAL_RETURN`
 * local alias) — regexes updated to the new canonical patterns.
 */
function assertSweepFollowsCompounding(body, fnLabel, minCount) {
  const sweepCount = (body.match(/_applyCashSweep\s*\(/g) || []).length;
  assert.ok(
    sweepCount >= minCount,
    `${fnLabel}: expected ≥${minCount} _applyCashSweep call(s), found ${sweepCount}`,
  );
  // For each `pCash *=` compounding line, ensure a sweep call appears within
  // a reasonable window AFTER it. We require at least minCount of these
  // pCash-compounding+sweep pairs.
  const compoundRe = /pCash\s*\*=\s*\(1\s*\+\s*_?CASH_REAL_RETURN(?:\s*\*\s*scale)?\)/g;
  let pairs = 0;
  let m;
  while ((m = compoundRe.exec(body)) !== null) {
    const after = body.slice(m.index, m.index + 800);
    if (/_applyCashSweep\s*\(/.test(after)) pairs++;
  }
  assert.ok(
    pairs >= minCount,
    `${fnLabel}: expected ≥${minCount} (pCash*=(1+CASH_REAL_RETURN) … _applyCashSweep) pairs, found ${pairs}`,
  );
}

HTML_PATHS.forEach(({ name, file }) => {
  test(`${name}: signedLifecycleEndBalance has ≥2 _applyCashSweep calls after pCash compounding (acc + retire)`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'signedLifecycleEndBalance');
    // Per contract: this simulator has TWO `pCash *= 1.005` lines — one for
    // the accumulation phase (line ~9273 RR) and one for the retirement phase
    // (line ~9196 RR). Both MUST be followed by a sweep call.
    assertSweepFollowsCompounding(body, `${name} signedLifecycleEndBalance`, 2);
  });

  test(`${name}: simulateRetirementOnlySigned has _applyCashSweep after pCash compounding`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'simulateRetirementOnlySigned');
    // This simulator uses scale-aware compounding `pCash *= (1 + 0.005 * scale)`
    // for partial-FIRE-year support (feature 022).
    assertSweepFollowsCompounding(body, `${name} simulateRetirementOnlySigned`, 1);
  });

  test(`${name}: _simulateStrategyLifetime has _applyCashSweep after pCash compounding`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, '_simulateStrategyLifetime');
    assertSweepFollowsCompounding(body, `${name} _simulateStrategyLifetime`, 1);
  });

  test(`${name}: computeWithdrawalStrategy has _applyCashSweep after pCash compounding`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'computeWithdrawalStrategy');
    assertSweepFollowsCompounding(body, `${name} computeWithdrawalStrategy`, 1);
  });

  // Feature 031 US5 (T023): projectFullLifecycle's RETIREMENT loop must call
  // _applyCashSweep after all flows — the SIXTH simulator sweep site, closing
  // the gap noted in specs/031-lifecycle-strategy-parity/research.md (clause
  // C5 / FR-006). Unlike the other five inline simulators, projectFullLifecycle
  // compounds cash via `portfolioCash = Math.max(0, portfolioCash) * (1 + CASH_REAL_RETURN)`
  // (NOT `pCash *=`), so the generic pCash-compounding regex does not
  // apply here. We assert (a) the body contains an _applyCashSweep call, and
  // (b) that call follows the retirement-phase `portfolioCash …` cash-interest
  // compounding line (the canonical year-end point). [033(US1): pattern updated]
  test(`${name}: projectFullLifecycle retirement loop has _applyCashSweep after portfolioCash compounding`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const body = extractFunctionBody(src, 'projectFullLifecycle');
    const sweepCount = (body.match(/_applyCashSweep\s*\(/g) || []).length;
    assert.ok(
      sweepCount >= 1,
      `${name} projectFullLifecycle: expected ≥1 _applyCashSweep call, found ${sweepCount}`,
    );
    // The retirement cash-interest line:
    // `portfolioCash = Math.max(0, portfolioCash) * (1 + CASH_REAL_RETURN);` [033(US1)]
    const compoundRe = /portfolioCash\s*=\s*Math\.max\(\s*0\s*,\s*portfolioCash\s*\)\s*\*\s*\(1\s*\+\s*CASH_REAL_RETURN\)/g;
    let pairs = 0;
    let m;
    while ((m = compoundRe.exec(body)) !== null) {
      const after = body.slice(m.index, m.index + 800);
      if (/_applyCashSweep\s*\(/.test(after)) pairs++;
    }
    assert.ok(
      pairs >= 1,
      `${name} projectFullLifecycle: expected ≥1 (portfolioCash*(1+CASH_REAL_RETURN) … _applyCashSweep) pair, found ${pairs}`,
    );
  });

  test(`${name}: i18n catalog contains all 4 plan.cashSweep* keys in EN and zh-TW`, () => {
    const src = fs.readFileSync(file, 'utf8');
    const requiredKeys = [
      'plan.cashSweepToggle',
      'plan.cashSweepThreshold',
      'plan.cashSweepTooltip',
      'plan.cashSweepThresholdHelp',
    ];
    // Each key must appear at least TWICE as a quoted dict key — once in the
    // EN catalog block, once in the zh-TW catalog block. The existing
    // `plan.cashflowOverrideToggle` pattern (RR :5417 EN, :6528 zh-TW) is the
    // reference layout.
    for (const key of requiredKeys) {
      // Match `'plan.cashSweepToggle':` or `"plan.cashSweepToggle":`.
      const re = new RegExp(
        '[\'"]' + key.replace(/\./g, '\\.') + '[\'"]\\s*:',
        'g',
      );
      const matches = (src.match(re) || []).length;
      assert.ok(
        matches >= 2,
        `${name}: expected catalog key '${key}' to appear ≥2 times (EN + zh-TW), found ${matches}`,
      );
    }
  });
});

test('calc/accumulateToFire.js body has _applyCashSweep after pCash compounding', () => {
  const src = fs.readFileSync(ACCUMULATE_TO_FIRE_PATH, 'utf8');
  // accumulateToFire is the canonical accumulation-phase helper. Per the
  // contract (`Simulator Integration Sites` row 6), it must invoke
  // _applyCashSweep after the cash-compounding line
  // `pCash *= (1 + _CASH_REAL_RETURN);` [033(US1): was hardcoded 1.005].
  assertSweepFollowsCompounding(src, 'accumulateToFire (module body)', 1);
});
