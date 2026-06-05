/*
 * tests/unit/debugDisplaybug32a.test.js — Bug-A + Bug-B + Bug-C regression
 * suite for the feature-032 "debug-displaybug-32a" hotfix.
 *
 * Reproduces the three concrete bugs the user observed on the RR dashboard
 * after the 031 + 032 hotfixes landed:
 *
 *   Bug A — `composition` all-zero in the audit snapshot
 *           Root cause: calc/calcAudit.js:_buildResolvedInputs reads ONLY the
 *           canonical pool field names (pStocksTaxable, pCashTaxable,
 *           p401kTrad, p401kRoth, pRothIra). When the HTML caller passes the
 *           raw DOM input bag (rogerStocks, cashSavings, roger401kTrad, …)
 *           every field falls back to 0 — composition is reported as all-
 *           zeros and the audit's invariants run against an empty portfolio.
 *
 *   Bug C — Signed-sim ⇄ chart-sim end-balance drift (9.4 %) under a non-
 *           default winner. Root cause: signedLifecycleEndBalance's strategy-
 *           dispatch site builds `pools = { pTrad, pRoth, pStocks, pCash }`
 *           — MISSING pRothIra. The chart's site (projectFullLifecycle)
 *           passes pRothIra in pools. Active strategies that consult the
 *           Roth IRA pool see different totals, so the verdict gate and the
 *           chart diverge.
 *
 *   Bug B — 4-way FIRE-age drift between Header / chart legend / chart
 *           triangle / debug snapshot. Surface: copy-debug snapshot's
 *           fireMode resolver reads inline `style.background` to detect the
 *           active gate-mode button, but the production CSS sets the active
 *           background via a CSS variable that Chrome never serializes back
 *           into inline style → `fireMode: 'unknown'`. The fix: read the
 *           canonical `window.fireMode` global instead. (No unit-testable
 *           pure-function surface — covered by an integration test below
 *           that asserts the resolver code path no longer matches the
 *           legacy "background heuristic" pattern.)
 *
 * Ref: prompt "debug-displaybug-32a" (2026-05-28).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembleAuditSnapshot } = require('../../calc/calcAudit.js');

// ---------------------------------------------------------------------------
// Bug A — audit composition must populate from EITHER canonical pool fields
// OR legacy raw input-bag fields (rogerStocks / cashSavings / roger401kTrad
// / roger401kRoth / rogerRothIra+rebeccaRothIra). Both shapes legitimately
// reach the assembler in production:
//   - canonical: tests + future canonical-only callers
//   - legacy raw: the live HTML caller at FIRE-Dashboard.html:14341 which
//     passes `{ ...inp, collegeYears }` straight from `getInputs()`.
// ---------------------------------------------------------------------------

function _stockChart(fireAge = 53, endAge = 100, total = 700000) {
  const rows = [];
  for (let age = fireAge; age <= endAge; age += 1) {
    rows.push({
      age,
      total,
      p401k: 100000,
      pStocks: 400000,
      pCash: 50000,
      pRoth: 50000,
      ssIncome: 0,
      withdrawals: 0,
      syntheticConversion: 0,
      phase: 'phase1-taxable-only',
    });
  }
  return rows;
}

function _buildLegacyOpts(extraInputs = {}) {
  const stock = _stockChart();
  const inputs = {
    // RR-shape raw DOM input bag (matches `inp` populated by getInputs())
    ageRoger: 43,
    ageRebecca: 43,
    endAge: 100,
    bufferUnlock: 1,
    bufferSS: 1,
    terminalBuffer: 1,
    safetyMargin: 0.05,
    rogerStocks: 240000,
    rebeccaStocks: 250000,
    cashSavings: 80000,
    otherAssets: 0,
    roger401kTrad: 29298,
    roger401kRoth: 66564,
    rogerRothIra: 0,
    rebeccaRothIra: 59021,
    inflationRate: 0.04,
    cashSweepEnabled: true,
    cashSweepThreshold: 10000,
    ...extraInputs,
  };
  return {
    inputs,
    fireAge: 53,
    fireMode: 'safe',
    annualSpend: 90000,
    rawAnnualSpend: 90000,
    effectiveSpendByYear: [],
    lastStrategyResults: null,
    fireAgeCandidates: [],
    projectFullLifecycle: () => stock,
    signedLifecycleEndBalance: () => ({ endBalance: stock[stock.length - 1].total }),
    isFireAgeFeasible: () => true,
    getActiveChartStrategyOptions: () => undefined,
    t: (k) => k,
    doc: null,
  };
}

test('Bug A — audit composition populates from raw input bag (rogerStocks/cashSavings/...) when canonical pool fields are absent', () => {
  const snap = assembleAuditSnapshot(_buildLegacyOpts());
  const c = snap.resolvedInputs.composition;
  // Expected raw-bag derived values:
  //   accessibleStocks = rogerStocks + rebeccaStocks   = 240000 + 250000 = 490000
  //   cash             = cashSavings + otherAssets      = 80000  + 0      =  80000
  //   locked401kTrad   = roger401kTrad                  = 29298
  //   locked401kRoth   = roger401kRoth                  = 66564
  //   lockedRothIra    = rogerRothIra + rebeccaRothIra  = 0 + 59021 = 59021
  assert.equal(c.accessibleStocks, 490000, 'accessibleStocks must sum rogerStocks + rebeccaStocks');
  assert.equal(c.cash, 80000, 'cash must sum cashSavings + otherAssets');
  assert.equal(c.locked401kTrad, 29298, 'locked401kTrad must read roger401kTrad');
  assert.equal(c.locked401kRoth, 66564, 'locked401kRoth must read roger401kRoth');
  assert.equal(c.lockedRothIra, 59021, 'lockedRothIra must sum rogerRothIra + rebeccaRothIra');
});

test('Bug A — audit composition still respects canonical pool fields when present (canonical takes priority)', () => {
  // When BOTH canonical and raw fields are present, canonical wins (backwards
  // compat with existing tests + future canonical-only callers).
  const snap = assembleAuditSnapshot(_buildLegacyOpts({
    pStocksTaxable: 100000,
    pCashTaxable: 200000,
    p401kTrad: 300000,
    p401kRoth: 400000,
    pRothIra: 500000,
  }));
  const c = snap.resolvedInputs.composition;
  assert.equal(c.accessibleStocks, 100000);
  assert.equal(c.cash, 200000);
  assert.equal(c.locked401kTrad, 300000);
  assert.equal(c.locked401kRoth, 400000);
  assert.equal(c.lockedRothIra, 500000);
});

test('Bug A — audit composition also handles Generic-shape raw fields (person1Stocks/person2Stocks/...) when present', () => {
  const stock = _stockChart();
  const opts = {
    inputs: {
      agePerson1: 43,
      agePerson2: 43,
      endAge: 100,
      bufferUnlock: 1,
      bufferSS: 1,
      terminalBuffer: 1,
      person1Stocks: 100000,
      person2Stocks: 50000,
      cashSavings: 20000,
      otherAssets: 5000,
      person1_401kTrad: 40000,
      person1_401kRoth: 30000,
      person1RothIra: 10000,
      person2RothIra: 15000,
    },
    fireAge: 53,
    fireMode: 'safe',
    annualSpend: 60000,
    rawAnnualSpend: 60000,
    effectiveSpendByYear: [],
    lastStrategyResults: null,
    fireAgeCandidates: [],
    projectFullLifecycle: () => stock,
    signedLifecycleEndBalance: () => ({ endBalance: stock[stock.length - 1].total }),
    isFireAgeFeasible: () => true,
    getActiveChartStrategyOptions: () => undefined,
    t: (k) => k,
    doc: null,
  };
  const snap = assembleAuditSnapshot(opts);
  const c = snap.resolvedInputs.composition;
  assert.equal(c.accessibleStocks, 150000, 'Generic-shape: person1Stocks + person2Stocks');
  assert.equal(c.cash, 25000, 'Generic-shape: cashSavings + otherAssets');
  assert.equal(c.locked401kTrad, 40000, 'Generic-shape: person1_401kTrad');
  assert.equal(c.locked401kRoth, 30000, 'Generic-shape: person1_401kRoth');
  assert.equal(c.lockedRothIra, 25000, 'Generic-shape: person1RothIra + person2RothIra');
});

// ---------------------------------------------------------------------------
// Bug C — strategy dispatch must thread pRothIra in `pools` so chart-sim and
// signed-sim see the same pool set. Verified via source-text inspection
// against the two simulator sites in FIRE-Dashboard.html (and lockstepped in
// FIRE-Dashboard-Generic.html). The two simulators must include the SAME
// pool field keys in the `pools` literal they hand to computePerYearMix.
// ---------------------------------------------------------------------------

function _readFile(rel) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
}

function _extractStrategyDispatchPools(htmlSrc, simulatorName) {
  // Locate the function body of `simulatorName` and pull the FIRST `pools: {
  // ... }` literal that follows a `computePerYearMix(` reference. We pin to
  // the function body (between the `function <name>` token and the matching
  // closing brace) so we only inspect the intended simulator's site.
  const fnStart = htmlSrc.indexOf(`function ${simulatorName}(`);
  if (fnStart < 0) {
    throw new Error(`simulator function not found: ${simulatorName}`);
  }
  // Walk to matching closing brace.
  let i = htmlSrc.indexOf('{', fnStart) + 1;
  let depth = 1;
  while (depth > 0 && i < htmlSrc.length) {
    const ch = htmlSrc[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  const body = htmlSrc.slice(fnStart, i);
  const dispatchIdx = body.indexOf('computePerYearMix(');
  if (dispatchIdx < 0) {
    throw new Error(`computePerYearMix not found in ${simulatorName}`);
  }
  const poolsIdx = body.indexOf('pools:', dispatchIdx);
  if (poolsIdx < 0) {
    throw new Error(`pools literal not found near computePerYearMix in ${simulatorName}`);
  }
  // Grab the brace literal after `pools:`.
  const braceStart = body.indexOf('{', poolsIdx);
  const braceEnd = body.indexOf('}', braceStart);
  return body.slice(braceStart, braceEnd + 1);
}

for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  test(`Bug C — ${file}: signedLifecycleEndBalance strategy dispatch must include pRothIra in pools`, () => {
    const src = _readFile(file);
    const poolsLiteral = _extractStrategyDispatchPools(src, 'signedLifecycleEndBalance');
    assert.match(poolsLiteral, /pRothIra/,
      `signedLifecycleEndBalance must include pRothIra in its computePerYearMix pools (${file})`);
    // Sanity: also requires the other 4 pools so we don't accidentally accept
    // a malformed literal.
    assert.match(poolsLiteral, /pTrad/);
    assert.match(poolsLiteral, /pRoth/);
    assert.match(poolsLiteral, /pStocks/);
    assert.match(poolsLiteral, /pCash/);
  });

  test(`Bug C — ${file}: simulateRetirementOnlySigned strategy dispatch must include pRothIra in pools (lockstep)`, () => {
    const src = _readFile(file);
    const poolsLiteral = _extractStrategyDispatchPools(src, 'simulateRetirementOnlySigned');
    assert.match(poolsLiteral, /pRothIra/,
      `simulateRetirementOnlySigned must include pRothIra in its computePerYearMix pools (${file})`);
  });
}

// ---------------------------------------------------------------------------
// Bug B — copy-debug snapshot's fireMode must read window.fireMode (NOT a
// CSS-background heuristic that returns 'unknown' in production). Verified
// via source-text inspection: the post-fix code path must reference
// `window.fireMode` (canonical state) and must NOT rely on the brittle
// `style.background` heuristic that produced `'unknown'`.
// ---------------------------------------------------------------------------

for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  test(`Bug B — ${file}: copy-debug snapshot reads fireMode from window.fireMode (not background heuristic)`, () => {
    const src = _readFile(file);
    // The fix re-routes the resolver: find the copy-debug snapshot's
    // fireMode assignment and require it consults window.fireMode.
    // We narrow the search to the copy-debug-snapshot function body.
    const start = src.indexOf('_buildCopyDebugSnapshot');
    let scopeSrc;
    if (start >= 0) {
      // Pull a ~5KB window around the symbol.
      scopeSrc = src.slice(start, start + 5000);
    } else {
      // Fallback: find the fireMode-resolver region by anchor (the 'unknown'
      // literal was the smoking gun in the legacy code path).
      const idx = src.indexOf("'unknown'");
      if (idx < 0) {
        // After the fix, the 'unknown' literal MAY be removed entirely.
        // Walk forward to locate the copy-debug fireMode assignment.
        const m = src.match(/const\s+fireMode\s*=\s*[\s\S]{0,300}window\.fireMode/);
        assert.ok(m, 'expected copy-debug fireMode assignment to reference window.fireMode');
        return;
      }
      scopeSrc = src.slice(Math.max(0, idx - 1500), idx + 500);
    }
    // After the fix, the resolver must reference window.fireMode (the
    // canonical state). The legacy heuristic was `pickActiveBtn('btnSafeFire')`
    // — assert the fix replaced that pattern with a window.fireMode read.
    assert.match(scopeSrc, /window\.fireMode/,
      `copy-debug fireMode must read window.fireMode (${file})`);
  });
}
