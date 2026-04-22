// ==================== TEST SUITE: strategies module ====================
// Feature 008 — Multi-Strategy Withdrawal Optimizer
// See: specs/008-multi-strategy-withdrawal-optimizer/contracts/strategy-module.contract.md
//      specs/008-multi-strategy-withdrawal-optimizer/contracts/strategy-comparison.contract.md
//
// Harness extracts scoreAndRank / rankByObjective / strategies from the Generic
// HTML using the brace-balanced extractor pattern from tests/diagnostic/*.mjs.
// ========================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

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
`;
  const _doc = { getElementById: (id) => {
    const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
      rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
      safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
      twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
    return d[id] || null;
  }};
  const _win = {};
  const ctx = new Function('mortgageEnabled','document','window',
    `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
  return ctx(false, _doc, _win);
}

const INP = {
  agePerson1: 42, agePerson2: 42,
  ageRoger: 42,
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
const FIRE_AGE = 54;

test('strategies module is present in Generic HTML', () => {
  assert.ok(HTML.includes('MODULE: strategies'), 'strategies module header missing');
  assert.ok(HTML.includes('const STRATEGIES = Object.freeze('), 'STRATEGIES frozen array missing');
});

test('scoreAndRank yields 7 results with per-year pool snapshots', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  assert.strictEqual(ranking.rows.length, 7, 'expected 7 strategy results');

  for (const r of ranking.rows) {
    assert.ok(Array.isArray(r.perYearRows) && r.perYearRows.length > 0,
      `${r.strategyId}: perYearRows should be a non-empty array`);
    for (const row of r.perYearRows) {
      assert.ok(Number.isFinite(row.pTradEnd),   `${r.strategyId} age ${row.age}: pTradEnd not finite`);
      assert.ok(Number.isFinite(row.pRothEnd),   `${r.strategyId} age ${row.age}: pRothEnd not finite`);
      assert.ok(Number.isFinite(row.pStocksEnd), `${r.strategyId} age ${row.age}: pStocksEnd not finite`);
      assert.ok(Number.isFinite(row.pCashEnd),   `${r.strategyId} age ${row.age}: pCashEnd not finite`);
      assert.ok(Number.isFinite(row.totalEnd),   `${r.strategyId} age ${row.age}: totalEnd not finite`);
      assert.ok(row.pTradEnd >= 0 && row.pRothEnd >= 0 && row.pStocksEnd >= 0 && row.pCashEnd >= 0,
        `${r.strategyId} age ${row.age}: pool snapshots must be non-negative`);
    }
  }
});

test('tax-optimized-search carries chosenTheta after θ-sweep', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  assert.ok(tos, 'tax-optimized-search result missing from ranking');
  assert.ok(typeof tos.chosenTheta === 'number', 'chosenTheta must be a number');
  assert.ok(tos.chosenTheta >= 0 && tos.chosenTheta <= 1, 'chosenTheta must be in [0, 1]');
});

test('strategies produce distinct trajectories (not all collapsed to bracket-fill)', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  const endTotals = ranking.rows.map(r => Math.round(r.endOfPlanNetWorthReal));
  const unique = new Set(endTotals);
  assert.ok(unique.size >= 3, `expected at least 3 distinct end balances, got ${unique.size}: ${[...unique].join(', ')}`);
});

test('Safe mode marks drain-to-zero strategies infeasible even when SS covers late spend', () => {
  const api = buildApi();
  // Force a scenario where the portfolio is small relative to bridge-years
  // spend so aggressive θ values push pools below Safe-mode buffers.
  const aggr = Object.assign({}, INP, {
    person1_401kTrad: 100000, person1Stocks: 150000, person2Stocks: 50000, cashSavings: 20000,
    monthlySavings: 1500, annualSpend: 80000,
    bufferUnlock: 1, bufferSS: 1,
  });
  const safe = api.scoreAndRank(aggr, 52, 'safe', 'retire-sooner-pay-less-tax');
  const dwz  = api.scoreAndRank(aggr, 52, 'dieWithZero', 'retire-sooner-pay-less-tax');
  const safeFeas = safe.rows.filter(r => r.feasibleUnderCurrentMode).length;
  const dwzFeas  = dwz.rows.filter(r => r.feasibleUnderCurrentMode).length;
  assert.ok(safeFeas <= dwzFeas,
    `Safe mode should mark at least as many strategies infeasible as DWZ (safe:${safeFeas} vs dwz:${dwzFeas})`);
  // Any feasible winner under Safe must have positive end balance at least equal to 1 yr of spend
  // (bufferSS=1 × 80K) in its post-unlock trajectory.
  const safeWinner = safe.rows[0];
  if (safeWinner.feasibleUnderCurrentMode) {
    assert.ok(safeWinner.minTotalPostUnlock >= 80000 - 1,
      `Safe-mode winner violates post-unlock buffer floor: minTotalPostUnlock=${safeWinner.minTotalPostUnlock}`);
  }
});

test('scoreAndRank is deterministic across calls', () => {
  const api = buildApi();
  const a = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  const b = api.scoreAndRank(INP, FIRE_AGE, 'safe', 'leave-more-behind');
  assert.strictEqual(a.winnerId, b.winnerId, 'winner must match across calls');
  assert.deepStrictEqual(
    a.rows.map(r => Math.round(r.endOfPlanNetWorthReal)),
    b.rows.map(r => Math.round(r.endOfPlanNetWorthReal)),
  );
});
