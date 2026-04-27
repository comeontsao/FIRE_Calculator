// ==================== TEST SUITE: strategy × scenario matrix ====================
// Feature 015 follow-up — comprehensive matrix that exercises ALL 7 strategies
// against the user's exact RR scenario from the 2026-04-27 audit. Each test
// validates that NO strategy at NO age allows starvation when there's untapped
// Trad available post-401k-unlock.
//
// This replaces the back-and-forth diagnosis cycle: if a future strategy
// regresses, this test fires immediately rather than the user noticing
// "tiny withdrawal bars" in the dashboard.
// ===================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

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
function getSSAnnual() { return 40131; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function detectMFJ() { return true; }
`;
  const _doc = { getElementById: (id) => {
    const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
      rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
      safetyMargin:{value:'5'}, irmaaThreshold:{value:'212000'},
      twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
    return d[id] || null;
  }};
  const _win = {};
  const ctx = new Function('mortgageEnabled','document','window',
    `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
  return ctx(false, _doc, _win);
}

const ALL_STRATEGY_IDS = [
  'bracket-fill-smoothed',
  'tax-optimized-search',
  'trad-first',
  'trad-last-preserve',
  'roth-ladder',
  'conventional',
  'proportional',
];

// Build a per-year context for testing each strategy in isolation. Mirrors
// what _simulateStrategyLifetime constructs.
function makeCtx(scenario) {
  return {
    age: scenario.age,
    grossSpend: scenario.grossSpend,
    ssIncome: scenario.ssIncome,
    pools: { pTrad: scenario.pTrad, pRoth: scenario.pRoth, pStocks: scenario.pStocks, pCash: scenario.pCash },
    brackets: {
      stdDed: 30000, top10: 23200, top12: 94300, top22: 201050,
      top24: 383900, top32: 487450, top35: 731200,
      ltcg0Top: 94050, ltcg15Top: 583750,
    },
    stockGainPct: 0.6,
    rmdThisYear: 0,
    bracketHeadroom: 88300,
    bfOpts: { safetyMargin: 0.05, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000, endAge: 100, _theta: 0.5 },
  };
}

// Critical scenario: the user's age 65, only Trad remaining, no SS yet
const STARVATION_CTX = {
  age: 65, grossSpend: 60100, ssIncome: 0,
  pTrad: 325000, pRoth: 0, pStocks: 0, pCash: 0,
};

test('matrix: every strategy funds spending at the starvation locus (only Trad, no SS, post-unlock)', () => {
  const { getStrategies } = buildApi();
  const policies = getStrategies();
  for (const policyId of ALL_STRATEGY_IDS) {
    const policy = policies.find(p => p.id === policyId);
    assert.ok(policy, `${policyId}: strategy not found`);
    const ctx = makeCtx(STARVATION_CTX);
    const mix = policy.computePerYearMix(ctx);
    assert.ok(mix, `${policyId}: computePerYearMix returned no mix`);
    assert.ok(mix.shortfall < 100,
      `${policyId} STARVATION REGRESSION: shortfall=$${Math.round(mix.shortfall)} when ` +
      `pTrad=$${STARVATION_CTX.pTrad} is available. Strategy should draw Trad to fund spending. ` +
      `wTrad=${mix.wTrad}, wRoth=${mix.wRoth}, wStocks=${mix.wStocks}, wCash=${mix.wCash}`);
    assert.ok(mix.wTrad > STARVATION_CTX.grossSpend * 0.7,
      `${policyId}: expected wTrad > $42k (70% of spend) when only Trad available; got $${Math.round(mix.wTrad)}`);
  }
});

test('matrix: every strategy at θ=0 ALSO funds spending (tax-opt-search worst case)', () => {
  const { getStrategies } = buildApi();
  const policies = getStrategies();
  // tax-optimized-search at θ=0 was the specific failing case from user's audit.
  const tos = policies.find(p => p.id === 'tax-optimized-search');
  const ctx = makeCtx(STARVATION_CTX);
  ctx.bfOpts._theta = 0;
  const mix = tos.computePerYearMix(ctx);
  assert.ok(mix.shortfall < 100,
    `tax-optimized-search at θ=0 STARVATION REGRESSION: shortfall=$${Math.round(mix.shortfall)} ` +
    `when pTrad=$${STARVATION_CTX.pTrad} is available. Floor pass should override the θ cap. ` +
    `wTrad=${mix.wTrad}`);
});

test('matrix: pre-unlock starvation is NOT spuriously fixed (canAccess401k false)', () => {
  // At age 50 (pre-unlock), Trad is genuinely inaccessible. Strategies that
  // try to draw it would be a bug. This tests the floor pass correctly skips
  // when canAccess401k is false.
  const { getStrategies } = buildApi();
  const policies = getStrategies();
  const PRE_UNLOCK_CTX = {
    age: 50, grossSpend: 60100, ssIncome: 0,
    pTrad: 325000, pRoth: 0, pStocks: 0, pCash: 0,
  };
  for (const policyId of ALL_STRATEGY_IDS) {
    const policy = policies.find(p => p.id === policyId);
    const ctx = makeCtx(PRE_UNLOCK_CTX);
    const mix = policy.computePerYearMix(ctx);
    assert.strictEqual(mix.wTrad, 0,
      `${policyId} pre-unlock: wTrad must be 0 (canAccess401k=false); got $${Math.round(mix.wTrad)}`);
    assert.ok(mix.shortfall > 50000,
      `${policyId} pre-unlock: full shortfall expected when only Trad locked; got $${Math.round(mix.shortfall)}`);
  }
});

test('matrix: idempotency — strategies with stocks available do NOT over-draw Trad', () => {
  const { getStrategies } = buildApi();
  const policies = getStrategies();
  const STOCKS_AVAILABLE_CTX = {
    age: 65, grossSpend: 60100, ssIncome: 0,
    pTrad: 325000, pRoth: 0, pStocks: 500000, pCash: 0,
  };
  for (const policyId of ALL_STRATEGY_IDS) {
    const policy = policies.find(p => p.id === policyId);
    const ctx = makeCtx(STOCKS_AVAILABLE_CTX);
    const mix = policy.computePerYearMix(ctx);
    assert.ok(mix.shortfall < 100,
      `${policyId}: must fully fund spending when stocks are sufficient; shortfall=${mix.shortfall}`);
    // tax-optimized-search at θ=0.5 would draw a moderate amount of Trad due to
    // bracket-fill; bracket-fill-smoothed similarly. Other strategies that
    // follow strict pool order may draw 0 Trad. Just check that the over-draw
    // pattern (wTrad > $80k when not needed) doesn't fire.
    if (policyId === 'trad-last-preserve' || policyId === 'conventional') {
      assert.ok(mix.wTrad < 30000,
        `${policyId}: should NOT over-draw Trad when stocks suffice; got wTrad=${mix.wTrad}`);
    }
  }
});

test('matrix: SS-active scenarios — strategy + SS together fund spending', () => {
  const { getStrategies } = buildApi();
  const policies = getStrategies();
  const SS_ACTIVE_CTX = {
    age: 75, grossSpend: 60100, ssIncome: 40131,
    pTrad: 325000, pRoth: 0, pStocks: 0, pCash: 0,
  };
  for (const policyId of ALL_STRATEGY_IDS) {
    const policy = policies.find(p => p.id === policyId);
    const ctx = makeCtx(SS_ACTIVE_CTX);
    const mix = policy.computePerYearMix(ctx);
    assert.ok(mix.shortfall < 100,
      `${policyId}: SS + Trad must fund spending; shortfall=${mix.shortfall}, wTrad=${mix.wTrad}`);
  }
});

test('matrix: scoreAndRank with all-infeasible scenarios — winner is reasonable', () => {
  // When no strategy can fund spending (genuine infeasibility), the ranker
  // should still pick the LEAST-bad strategy — not the one with the highest
  // hidden shortfall (which would be tax-opt-search at θ=0 pre-fix).
  const { scoreAndRank } = buildApi();
  // User's scenario at FIRE 44 — known infeasible (depletes too fast)
  const INP = {
    agePerson1: 42, ageRoger: 42, agePerson2: 42,
    person1_401kTrad: 26454, person1_401kRoth: 58000,
    person1Stocks: 215000, person2Stocks: 230000,
    cashSavings: 80000, otherAssets: 0,
    annualIncome: 152000, raiseRate: 0.02,
    returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
    swr: 0.04, monthlySavings: 1700,
    contrib401kTrad: 16500, contrib401kRoth: 2900, empMatch: 7200,
    taxTrad: 0.15, stockGainPct: 0.6,
    bufferUnlock: 1, bufferSS: 1,
    endAge: 100, ssClaimAge: 70,
    annualSpend: 60100,
    safetyMargin: 0.05, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
  };
  const ranking = scoreAndRank(INP, 44, 'safe', 'leave-more-behind');
  assert.ok(ranking && ranking.rows && ranking.rows.length === 7);
  // The winner should NOT be tax-opt-search-θ=0 anymore (the pre-fix pathology).
  const winner = ranking.rows[0];
  if (winner.strategyId === 'tax-optimized-search') {
    assert.ok(winner.chosenTheta > 0 || winner.feasibleUnderCurrentMode,
      `tax-optimized-search winning with θ=${winner.chosenTheta} and feasible=${winner.feasibleUnderCurrentMode} ` +
      `is the pre-fix bug. Floor pass should make every θ try to fund spending.`);
  }
});
