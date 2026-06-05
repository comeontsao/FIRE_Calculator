// ==================== TEST SUITE: Mode/Objective Orthogonality (US4) ====================
// Feature 015 Wave B — verifies the silent DWZ override is removed and that
// (Mode, Objective) pairs compose orthogonally per the resolution table in
// specs/015-calc-debt-cleanup/contracts/mode-objective-orthogonality.contract.md
// =========================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const { SCENARIOS } = require(path.resolve(REPO_ROOT, 'tests', 'fixtures', 'feature-015', 'scenarios.js'));

// T019 (feature 019): load the canonical accumulation helper so test sandboxes
// that call scoreAndRank → _simulateStrategyLifetime can resolve the dependency.
const { accumulateToFire: _accumulateToFireFn } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found`);
  let i = HTML.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < HTML.length) {
    const ch = HTML[i];
    if (ch === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); if (i < 0) break; i++; continue; }
    if (ch === '/' && HTML[i + 1] === '*') { i = HTML.indexOf('*/', i); if (i < 0) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++; else if (ch === '}') depth--;
    i++;
  }
  return HTML.slice(m.index, i);
}

function extractBlock(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  if (s < 0) throw new Error(`start marker not found: ${startMarker}`);
  const e = HTML.indexOf(endMarker, s);
  if (e < 0) throw new Error(`end marker not found: ${endMarker}`);
  return HTML.slice(s, e);
}

function buildApi() {
  const strategiesBlock = extractBlock(
    '// ==================== Feature 008 — Strategy Policies ====================',
    '// Feature 007 — each strategy.push row includes'
  );
  const fns = [
    'taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax',
    'getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement',
    'getHealthcareDeltaAnnual','getTotalCollegeCostForYear',
    'calcMortgagePayment','detectMFJ','getMortgageInputs',
  ];
  const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
  const overrides = `
function getSSAnnual() { return 48000; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function detectMFJ() { return true; }
// T019 (feature 019): stub resolveAccumulationOptions for test sandbox (no mortgage/college/home2).
function resolveAccumulationOptions(inp, fireAge) {
  return { mortgageEnabled: false, secondHomeEnabled: false, mortgageStrategyOverride: 'invest-keep-paying' };
}
`;
  const _doc = { getElementById: (id) => {
    const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
      rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
      safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
      twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
    return d[id] || null;
  }};
  const _win = {};
  // T019 (feature 019): inject accumulateToFire so _simulateStrategyLifetime can resolve it.
  const ctx = new Function('mortgageEnabled','document','window','accumulateToFire',
    `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
  return ctx(false, _doc, _win, _accumulateToFireFn);
}

const FIRE_AGE = 54;
const INP = {
  agePerson1: 42, agePerson2: 42, ageRoger: 42,
  person1_401kTrad: 150000, person1_401kRoth: 0,
  person1Stocks: 250000, person2Stocks: 100000,
  cashSavings: 80000, otherAssets: 0,
  annualIncome: 200000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04, monthlySavings: 3000,
  contrib401kTrad: 15000, contrib401kRoth: 0, empMatch: 5000,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  annualSpend: 72000,
  safetyMargin: 0.03, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
};

test('US4 FR-013: every strategy row carries residualAreaReal and cumulativeFederalTaxReal', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  for (const r of ranking.rows) {
    assert.strictEqual(typeof r.residualAreaReal, 'number',
      `${r.strategyId}: residualAreaReal must be numeric (got ${typeof r.residualAreaReal})`);
    assert.ok(r.residualAreaReal >= 0, `${r.strategyId}: residualAreaReal must be ≥ 0`);
    assert.strictEqual(typeof r.cumulativeFederalTaxReal, 'number',
      `${r.strategyId}: cumulativeFederalTaxReal must be numeric`);
    assert.ok(r.cumulativeFederalTaxReal >= 0,
      `${r.strategyId}: cumulativeFederalTaxReal must be ≥ 0`);
  }
});

test('US4 FR-014: Preserve estate sort uses endBalance desc with residualArea tie-breaker (Safe)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  const feasible = ranking.rows.filter(r => r.feasibleUnderCurrentMode);
  if (feasible.length >= 2) {
    // Adjacent feasible rows must satisfy: previous.endBalance >= next.endBalance
    // (within tolerance) — primary sort is endBalance desc.
    const a = feasible[0], b = feasible[1];
    const TOL = 1000;
    assert.ok(a.endOfPlanNetWorthReal + TOL >= b.endOfPlanNetWorthReal,
      `Preserve sort under Safe should put higher endBalance first; got ${a.strategyId}=${a.endOfPlanNetWorthReal} before ${b.strategyId}=${b.endOfPlanNetWorthReal}`);
  }
});

test('US4 FR-015: Minimize tax sort uses cumulativeFederalTax asc (Safe)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'retire-sooner-pay-less-tax');
  const feasible = ranking.rows.filter(r => r.feasibleUnderCurrentMode);
  if (feasible.length >= 2) {
    const a = feasible[0], b = feasible[1];
    const TOL = 100;
    assert.ok(a.lifetimeFederalTaxReal <= b.lifetimeFederalTaxReal + TOL,
      `Minimize-tax sort under Safe should put lower tax first; got ${a.strategyId}=${a.lifetimeFederalTaxReal} before ${b.strategyId}=${b.lifetimeFederalTaxReal}`);
  }
});

test('US4: DWZ + Preserve no longer applies the silent "smallest end balance" override', () => {
  const api = buildApi();
  // Same inputs, two objectives under DWZ. Per US4, the WINNERS should differ
  // on at least one of (residualArea | strategy id) — proving DWZ honors the
  // user's objective rather than always picking smallest end balance.
  //
  // Note: this test is robust to scenarios where the candidate set is too
  // small to produce different winners — it asserts only that the row order
  // is consistent with the new sort-key logic, not that the winner differs.
  const dwzPreserve = api.scoreAndRank(INP, FIRE_AGE, 'dieWithZero', 'leave-more-behind');
  const dwzTax = api.scoreAndRank(INP, FIRE_AGE, 'dieWithZero', 'retire-sooner-pay-less-tax');

  // The DWZ + Preserve sort must respect: feasible rows ordered by residualArea desc.
  const dwzPFeas = dwzPreserve.rows.filter(r => r.feasibleUnderCurrentMode);
  if (dwzPFeas.length >= 2) {
    const TOL = 1000;
    const a = dwzPFeas[0], b = dwzPFeas[1];
    assert.ok(a.residualAreaReal + TOL >= b.residualAreaReal,
      `DWZ + Preserve: feasible rows must be ordered by residualArea desc; got ${a.strategyId}=${a.residualAreaReal} before ${b.strategyId}=${b.residualAreaReal}`);
  }

  // The DWZ + Tax sort must respect: feasible rows ordered by cumulativeFederalTax asc.
  const dwzTFeas = dwzTax.rows.filter(r => r.feasibleUnderCurrentMode);
  if (dwzTFeas.length >= 2) {
    const TOL = 100;
    const a = dwzTFeas[0], b = dwzTFeas[1];
    assert.ok(a.lifetimeFederalTaxReal <= b.lifetimeFederalTaxReal + TOL,
      `DWZ + Tax: feasible rows must be ordered by cumulativeFederalTax asc; got ${a.strategyId}=${a.lifetimeFederalTaxReal} before ${b.strategyId}=${b.lifetimeFederalTaxReal}`);
  }
});

test('US4: tie-breaker chain ends in strategyId alphabetical (deterministic)', () => {
  const api = buildApi();
  // Two consecutive runs MUST produce identical row order (no flicker from
  // floating-point or map iteration). Verifies the deterministic terminal
  // tie-breaker prevents per-run drift.
  const a = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  const b = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  assert.deepStrictEqual(
    a.rows.map(r => r.strategyId),
    b.rows.map(r => r.strategyId),
    'rankByObjective must be deterministic across calls (terminal strategyId tie-breaker)'
  );
  // Same for DWZ + Preserve, the new orthogonal path
  const c = api.scoreAndRank(INP, FIRE_AGE, 'dieWithZero', 'leave-more-behind');
  const d = api.scoreAndRank(INP, FIRE_AGE, 'dieWithZero', 'leave-more-behind');
  assert.deepStrictEqual(
    c.rows.map(r => r.strategyId),
    d.rows.map(r => r.strategyId),
    'DWZ + Preserve must be deterministic across calls'
  );
});

test('US4: residualAreaReal monotone with end-balance preservation (semantic check)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  // For the same scenario, a strategy with materially HIGHER end balance
  // typically also has higher residualArea (because it preserved more along
  // the way). This is not strictly guaranteed (back-loading could win on
  // residualArea while losing on endBalance), but the correlation should be
  // POSITIVE across the strategy set under Safe + Preserve.
  const feasible = ranking.rows.filter(r => r.feasibleUnderCurrentMode);
  if (feasible.length >= 3) {
    const sortedByEnd = [...feasible].sort((a, b) => b.endOfPlanNetWorthReal - a.endOfPlanNetWorthReal);
    const sortedByRes = [...feasible].sort((a, b) => b.residualAreaReal - a.residualAreaReal);
    // Top of each list should overlap (not be inverted).
    assert.notStrictEqual(sortedByEnd[0].strategyId, sortedByRes[sortedByRes.length - 1].strategyId,
      'highest endBalance and lowest residualArea should NOT be the same strategy under Preserve');
  }
});

// ============================================================================
// T051a (feature 032) — Roth IRA orthogonality: pool data MUST NOT couple
// into the sort-key resolution logic. Per Constitution Principle IX, the
// (Mode, Objective) → sort-key mapping is a pure 6-row table; introducing a
// new pool ($pRothIra$) cannot change which scalar field the ranker sorts on
// for any of the 6 cells.
//
// Two-pronged assertion:
//   (a) `_resolvePrimarySortKey(mode, objective)` returns BYTE-IDENTICAL
//       `{key, dir}` for every (mode, objective) combination — proven by
//       calling the resolver directly (it takes no pool data, so this also
//       documents the contract).
//   (b) The row-ordering FIELD chosen by `scoreAndRank` for each cell stays
//       identical between the zero-rothIra baseline and a fixture variant
//       that adds rogerRothIra=$50K + rebeccaRothIra=$75K. The ordering
//       VALUES change (more wealth → different scalar values) but the SORT
//       SEMANTIC (which field is primary, and its direction) does not.
// ============================================================================

const REPO_ROOT_T051A = path.resolve(__dirname, '..', '..');
const { _resolvePrimarySortKey: _resolveSortKey } = require(
  path.resolve(REPO_ROOT_T051A, 'calc', 'strategyRanker.js'),
);

const ALL_MODE_OBJECTIVE_COMBOS = Object.freeze([
  { mode: 'safe',        objective: 'leave-more-behind' },
  { mode: 'safe',        objective: 'retire-sooner-pay-less-tax' },
  { mode: 'exact',       objective: 'leave-more-behind' },
  { mode: 'exact',       objective: 'retire-sooner-pay-less-tax' },
  { mode: 'dieWithZero', objective: 'leave-more-behind' },
  { mode: 'dieWithZero', objective: 'retire-sooner-pay-less-tax' },
]);

test('T051a (feature 032): _resolvePrimarySortKey is pure (mode, objective) — pool data cannot leak in', () => {
  // The resolver is by definition pure on its 2 args, but we lock the EXACT
  // (key, dir) for each of the 6 cells so any future change to add a third
  // axis (e.g., "if pRothIra > 0 then …") would fail this test immediately.
  const EXPECTED = {
    'safe|leave-more-behind':                      { key: 'endBalance',           dir: 'desc' },
    'safe|retire-sooner-pay-less-tax':             { key: 'cumulativeFederalTax', dir: 'asc'  },
    'exact|leave-more-behind':                     { key: 'endBalance',           dir: 'desc' },
    'exact|retire-sooner-pay-less-tax':            { key: 'cumulativeFederalTax', dir: 'asc'  },
    'dieWithZero|leave-more-behind':               { key: 'residualArea',         dir: 'desc' },
    'dieWithZero|retire-sooner-pay-less-tax':      { key: 'cumulativeFederalTax', dir: 'asc'  },
  };
  for (const { mode, objective } of ALL_MODE_OBJECTIVE_COMBOS) {
    const got = _resolveSortKey(mode, objective);
    const expected = EXPECTED[`${mode}|${objective}`];
    assert.deepStrictEqual(
      got, expected,
      `_resolvePrimarySortKey('${mode}', '${objective}') must return ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
    );
  }
});

test('T051a (feature 032): scoreAndRank sort semantic unchanged by introducing Roth IRA pool', () => {
  const api = buildApi();
  // Fixture variant adds Roth IRA balances to the baseline INP. The variant
  // appears in BOTH the canonical Generic field shape (person1RothIra /
  // person2RothIra) AND the canonical rothIraReal sum — both for safety
  // since the calc engine reads whichever is present.
  const INP_WITH_ROTH_IRA = Object.assign({}, INP, {
    rogerRothIra: 50000,
    rebeccaRothIra: 75000,
    person1RothIra: 50000,
    person2RothIra: 75000,
    rothIraReal: 125000,
  });

  // For each of the 6 (mode, objective) cells, the sort-direction semantic
  // (asc vs desc on a primary field) must match between the baseline and
  // the Roth-IRA variant. We assert this by checking that adjacent feasible
  // rows respect the SAME inequality direction in both rankings.
  //
  // The exact strategy ORDER may legitimately differ (scalar values move
  // when a new pool of capital enters the simulation), but if the SORT KEY
  // semantics leaked pool data the inequality direction would invert on the
  // primary field. That's the regression we're guarding against.
  for (const { mode, objective } of ALL_MODE_OBJECTIVE_COMBOS) {
    const sortKey = _resolveSortKey(mode, objective);
    const fieldByKey = {
      endBalance: 'endOfPlanNetWorthReal',
      cumulativeFederalTax: 'lifetimeFederalTaxReal',
      residualArea: 'residualAreaReal',
    };
    const field = fieldByKey[sortKey.key];

    for (const inpVariant of [INP, INP_WITH_ROTH_IRA]) {
      const ranking = api.scoreAndRank(inpVariant, FIRE_AGE, mode, objective);
      const feasible = ranking.rows.filter(r => r.feasibleUnderCurrentMode);
      if (feasible.length < 2) continue; // too few rows to test ordering
      for (let i = 0; i + 1 < feasible.length; i++) {
        const a = feasible[i][field];
        const b = feasible[i + 1][field];
        if (sortKey.dir === 'desc') {
          // Generous tolerance ($1) absorbs intra-strategy rounding noise.
          assert.ok(
            a + 1 >= b,
            `${mode}+${objective} (${inpVariant === INP ? 'baseline' : 'rothIra-variant'}) ` +
              `must sort ${field} desc; got ${feasible[i].strategyId}=${a} before ${feasible[i + 1].strategyId}=${b}`,
          );
        } else {
          assert.ok(
            a <= b + 1,
            `${mode}+${objective} (${inpVariant === INP ? 'baseline' : 'rothIra-variant'}) ` +
              `must sort ${field} asc; got ${feasible[i].strategyId}=${a} before ${feasible[i + 1].strategyId}=${b}`,
          );
        }
      }
    }
  }
});
