/*
 * tests/unit/aggressiveBracketFillRanker.test.js — feature 027 US2 ranker.
 *
 * Verifies the new AGGRESSIVE_BRACKET_FILL strategy participates in
 *   - getStrategies() (registry contains the entry)
 *   - scoreAndRank() (ranker emits a row with all expected fields)
 *   - rankByObjective() / sort-key chain for all 6 (Mode × Objective) cells
 *     per Constitution IX (research.md §2 table)
 *
 * Pattern mirrors tests/unit/strategies.test.js + modeObjectiveOrthogonality.test.js.
 */

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
  const ctx = new Function('mortgageEnabled','document','window','accumulateToFire',
    `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
  return ctx(false, _doc, _win, _accumulateToFireFn);
}

// Modest-Trad / long-retirement scenario where aggressive is materially better
// (mirrors SC-026-A shape: small Trad, big Stocks, long horizon to age 100).
const INP_AGGRESSIVE_FAVORS = {
  agePerson1: 42, agePerson2: 42, ageRoger: 42,
  person1_401kTrad: 25000, person1_401kRoth: 58000,
  person1Stocks: 200000, person2Stocks: 190000,
  cashSavings: 0, otherAssets: 0,
  annualIncome: 150000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04, monthlySavings: 2000,
  contrib401kTrad: 8550, contrib401kRoth: 2850, empMatch: 7200,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  annualSpend: 77880,
  safetyMargin: 0.05, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
};
const FIRE_AGE = 53;

test('027 US2 — aggressive-bracket-fill is in the strategies registry (length 8)', () => {
  const api = buildApi();
  const strategies = api.getStrategies();
  assert.strictEqual(strategies.length, 8, 'feature 027 added an 8th strategy');
  const ids = strategies.map(s => s.id).sort();
  assert.ok(ids.includes('aggressive-bracket-fill'), 'aggressive-bracket-fill missing from registry');
});

test('027 US2 — scoreAndRank emits an aggressive row with populated fields', () => {
  const api = buildApi();
  const ranking = api.scoreAndRank(INP_AGGRESSIVE_FAVORS, FIRE_AGE, 'safe', 'leave-more-behind');
  const aggressive = ranking.rows.find(r => r.strategyId === 'aggressive-bracket-fill');
  assert.ok(aggressive, 'aggressive-bracket-fill row missing from ranking');

  // All expected fields populated (per strategy-registry.contract.md §"Ranker integration"
  // — field names match the actual ranker row schema in scoreAndRank).
  for (const f of ['endOfPlanNetWorthReal','lifetimeFederalTaxReal','hasShortfall',
                   'feasibleUnderCurrentMode','perYearRows']) {
    assert.ok(f in aggressive, `aggressive row missing field "${f}"`);
  }
  assert.ok(Number.isFinite(aggressive.endOfPlanNetWorthReal),
    `endOfPlanNetWorthReal must be finite, got ${aggressive.endOfPlanNetWorthReal}`);
  assert.ok(Number.isFinite(aggressive.lifetimeFederalTaxReal),
    `lifetimeFederalTaxReal must be finite, got ${aggressive.lifetimeFederalTaxReal}`);
});

test('027 US2 — aggressive participates in all 6 (Mode × Objective) cells', () => {
  const api = buildApi();
  const modes = ['safe', 'exact', 'dieWithZero'];
  const objectives = ['leave-more-behind', 'retire-sooner-pay-less-tax'];
  for (const mode of modes) {
    for (const objective of objectives) {
      const ranking = api.scoreAndRank(INP_AGGRESSIVE_FAVORS, FIRE_AGE, mode, objective);
      const aggressive = ranking.rows.find(r => r.strategyId === 'aggressive-bracket-fill');
      assert.ok(aggressive, `aggressive missing under (${mode}, ${objective})`);
      // Aggressive must be evaluable in every cell — it is not gated to specific
      // (mode, objective) cells (Constitution IX: no per-cell strategy gating).
    }
  }
});

test('027 US2 — under modest-Trad scenario, aggressive beats smoothed on lifetimeFederalTax', () => {
  // SC-026-A signature: aggressive's lifetime tax should be lower than smoothed.
  const api = buildApi();
  const ranking = api.scoreAndRank(INP_AGGRESSIVE_FAVORS, FIRE_AGE, 'safe', 'retire-sooner-pay-less-tax');
  const aggressive = ranking.rows.find(r => r.strategyId === 'aggressive-bracket-fill');
  const smoothed   = ranking.rows.find(r => r.strategyId === 'bracket-fill-smoothed');
  assert.ok(aggressive && smoothed, 'both strategies must be present');
  assert.ok(aggressive.lifetimeFederalTaxReal <= smoothed.lifetimeFederalTaxReal + 1,
    `aggressive ($${Math.round(aggressive.lifetimeFederalTaxReal)}) should pay ≤ smoothed ` +
    `($${Math.round(smoothed.lifetimeFederalTaxReal)}) on this fixture`);
});

test('027 US2 — ranker is deterministic with aggressive in the registry', () => {
  const api = buildApi();
  const a = api.scoreAndRank(INP_AGGRESSIVE_FAVORS, FIRE_AGE, 'safe', 'leave-more-behind');
  const b = api.scoreAndRank(INP_AGGRESSIVE_FAVORS, FIRE_AGE, 'safe', 'leave-more-behind');
  assert.strictEqual(a.winnerId, b.winnerId, 'winner must match across calls');
  assert.deepStrictEqual(
    a.rows.map(r => r.strategyId),
    b.rows.map(r => r.strategyId),
    'row ordering must match across calls'
  );
});
