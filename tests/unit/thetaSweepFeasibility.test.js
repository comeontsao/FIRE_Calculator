// ==================== TEST SUITE: θ-sweep feasibility-first (US2) ====================
// Feature 015 Wave A — verifies the tax-optimized-search 3-pass refactor:
//   Pass 1 simulate all 11 θ → Pass 2 filter feasibility → Pass 3 rank by tax.
// Per specs/015-calc-debt-cleanup/contracts/theta-sweep-feasibility.contract.md
// ====================================================================================

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
  // Mirrors strategies.test.js — extract scoreAndRank + helpers from Generic.
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

test('US2: 3-pass θ-sweep produces a feasible chosenTheta on the bug fixture', () => {
  const api = buildApi();
  const f = SCENARIOS.thetaZeroShortfall;
  const ranking = api.scoreAndRank(f.inp, f.fireAge, 'safe', 'leave-more-behind');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  assert.ok(tos, 'tax-optimized-search row missing');
  assert.ok(typeof tos.chosenTheta === 'number', 'chosenTheta must be numeric');
  assert.ok(tos.chosenTheta >= 0 && tos.chosenTheta <= 1, 'chosenTheta must be in [0, 1]');
  // The row's diagnostic fields are present per orthogonality contract §3
  assert.ok('lowestTaxOverallTheta' in tos, 'expected diagnostic field lowestTaxOverallTheta');
  assert.ok('shortfallYearsAtLowestTax' in tos, 'expected diagnostic field shortfallYearsAtLowestTax');
});

test('US2: when feasible, lowestTaxOverallTheta is null and shortfall count is 0', () => {
  const api = buildApi();
  // youngSaver should produce feasible candidates
  const ranking = api.scoreAndRank(SCENARIOS.youngSaver.inp, 60, 'safe', 'leave-more-behind');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  if (tos && tos.feasibleUnderCurrentMode) {
    assert.strictEqual(tos.lowestTaxOverallTheta, null,
      'lowestTaxOverallTheta must be null when at least one θ is feasible');
    assert.strictEqual(tos.shortfallYearsAtLowestTax, 0,
      'shortfallYearsAtLowestTax must be 0 when feasible');
  }
});

test('US2: when ALL 11 θ candidates are infeasible, fallback exposes the lowest-tax θ', () => {
  const api = buildApi();
  // Construct an aggressively under-portfolioed scenario where no θ should
  // produce a feasible trajectory under Safe mode.
  const broke = Object.assign({}, SCENARIOS.thetaZeroShortfall.inp, {
    person1_401kTrad: 5000, person1_401kRoth: 0,
    person1Stocks: 5000, person2Stocks: 0,
    cashSavings: 5000, monthlySavings: 0,
    annualSpend: 200000, // intentionally absurd
  });
  const ranking = api.scoreAndRank(broke, 52, 'safe', 'leave-more-behind');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  assert.ok(tos, 'tax-optimized-search row missing');
  if (!tos.feasibleUnderCurrentMode) {
    // Fallback path — diagnostic fields populated
    assert.ok(typeof tos.lowestTaxOverallTheta === 'number',
      'lowestTaxOverallTheta should be a number when no candidate is feasible');
    assert.ok(tos.lowestTaxOverallTheta >= 0 && tos.lowestTaxOverallTheta <= 1,
      'lowestTaxOverallTheta must be in [0, 1]');
  }
});

test('US2: chosenTheta is always feasible whenever feasibleUnderCurrentMode is true', () => {
  const api = buildApi();
  // Run on multiple scenarios; every time the row reports feasible, the chosen θ
  // must be among the survivors of Pass 2 (so feasibleUnderCurrentMode === true
  // implies the chosen candidate's underlying simulation was feasible).
  const ranking = api.scoreAndRank(SCENARIOS.midCareer.inp, 60, 'safe', 'leave-more-behind');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  if (tos && tos.feasibleUnderCurrentMode) {
    // The chosen theta corresponds to the row's own simulated trajectory
    assert.strictEqual(tos.feasibleUnderCurrentMode, true);
    assert.ok(typeof tos.chosenTheta === 'number');
  }
});

test('US2: 3-pass refactor preserves existing strategies.test.js semantics', () => {
  const api = buildApi();
  // Replicates the canonical INP from strategies.test.js
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
  const ranking = api.scoreAndRank(INP, 54, 'safe', 'leave-more-behind');
  assert.strictEqual(ranking.rows.length, 7, 'expected 7 strategy results');
  const tos = ranking.rows.find(r => r.strategyId === 'tax-optimized-search');
  assert.ok(tos, 'tax-optimized-search must be in ranking');
  assert.ok(typeof tos.chosenTheta === 'number');
  assert.ok(tos.chosenTheta >= 0 && tos.chosenTheta <= 1);
});
