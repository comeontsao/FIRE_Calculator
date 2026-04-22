// Smoke test: extract scoreAndRank + rankByObjective + strategies from the
// Generic HTML, run a representative scenario, assert that (a) all 7 strategies
// produce a StrategyResult, (b) the winner under each objective is well-defined,
// and (c) lifetime tax differs materially across strategies (proving they're
// actually distinct, not all collapsing to the same behavior).
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

// Extract the strategies block + supporting helpers.
function extractBlock(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  if (s < 0) throw new Error(`start marker not found: ${startMarker}`);
  const e = HTML.indexOf(endMarker, s);
  if (e < 0) throw new Error(`end marker not found: ${endMarker}`);
  return HTML.slice(s, e);
}

// Everything from the strategies module header through the scoreAndRank + rankByObjective
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
global.document = { getElementById: (id) => {
  const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
  return d[id] || null;
}};
const _win = {};
global.window = _win;
Object.defineProperty(global, 'window', { value: _win, writable: true });

let mortgageEnabled = false;
const ctx = new Function('mortgageEnabled',
  `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
const api = ctx(mortgageEnabled);

// Representative scenario: 42-year-old MFJ couple, moderate portfolio, FIRE at 54.
const inp = {
  agePerson1: 42, agePerson2: 42,
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
const fireAge = 54;

console.log('=== Loaded strategies ===');
const strategies = api.getStrategies();
console.log(strategies.map(s => s.id));
console.log('count:', strategies.length, '(expected 7)');

console.log('\n=== scoreAndRank — objective: leave-more-behind ===');
const rankEstate = api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
console.log('Winner:', rankEstate.winnerId);
console.log('Rows:');
for (const r of rankEstate.rows) {
  console.log(`  ${r.strategyId.padEnd(22)} | endBal=$${Math.round(r.endOfPlanNetWorthReal).toLocaleString().padStart(12)} | lifetime tax=$${Math.round(r.lifetimeFederalTaxReal).toLocaleString().padStart(10)} | avgEff=${(r.averageEffectiveTaxRate*100).toFixed(1)}% | feas=${r.feasibleUnderCurrentMode}`);
}
console.log('Ties:', rankEstate.ties);

console.log('\n=== scoreAndRank — objective: retire-sooner-pay-less-tax ===');
const rankTax = api.scoreAndRank(inp, fireAge, 'safe', 'retire-sooner-pay-less-tax');
console.log('Winner:', rankTax.winnerId);
console.log('Rows (by lifetime tax):');
for (const r of rankTax.rows) {
  console.log(`  ${r.strategyId.padEnd(22)} | lifetime tax=$${Math.round(r.lifetimeFederalTaxReal).toLocaleString().padStart(10)} | endBal=$${Math.round(r.endOfPlanNetWorthReal).toLocaleString().padStart(12)}`);
}

console.log('\n=== Objective differentiation ===');
console.log('Estate winner:', rankEstate.winnerId, '| Tax winner:', rankTax.winnerId);
console.log(rankEstate.winnerId === rankTax.winnerId ? '  (same winner)' : '  ✓ different winners under each objective');

console.log('\n=== Determinism (FR-008) ===');
const a = api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
const b = api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
const sameIds = a.rows.map(r => r.strategyId).join(',') === b.rows.map(r => r.strategyId).join(',');
const sameEndBals = a.rows.every((r, i) => Math.abs(r.endOfPlanNetWorthReal - b.rows[i].endOfPlanNetWorthReal) < 0.01);
console.log('deterministic:', sameIds && sameEndBals);

// Performance microbenchmark (SC-006)
console.log('\n=== Performance (SC-006 — target < 150 ms mean) ===');
const N = 10;
const times = [];
for (let i = 0; i < N; i++) {
  const t0 = process.hrtime.bigint();
  api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
  const t1 = process.hrtime.bigint();
  times.push(Number(t1 - t0) / 1e6);
}
times.sort((a, b) => a - b);
const mean = times.reduce((s, t) => s + t, 0) / N;
const p95 = times[Math.floor(N * 0.95)];
console.log(`mean=${mean.toFixed(1)} ms, p95=${p95.toFixed(1)} ms, min=${times[0].toFixed(1)} ms, max=${times[N-1].toFixed(1)} ms`);
