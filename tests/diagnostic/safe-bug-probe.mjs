// Diagnostic probe — reproduces the user-reported Safe bug:
//   "Safe with buffer=1/1, plan age 100 → portfolio depletes around age 86"
// Extracts the Generic dashboard's solver + chart simulators and compares
// their endAge-100 view of the same retirement plan.
//
// Run: node tests/diagnostic/safe-bug-probe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pattern.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found`);
  let i = HTML.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < HTML.length) {
    const ch = HTML[i];
    if (ch === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); if (i === -1) break; i++; continue; }
    if (ch === '/' && HTML[i + 1] === '*') { i = HTML.indexOf('*/', i); if (i === -1) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return HTML.slice(m.index, i);
}

const fns = [
  'taxOptimizedWithdrawal',
  'signedLifecycleEndBalance',
  'isFireAgeFeasible',
  'findFireAgeNumerical',
  'projectFullLifecycle',
  'getRMDDivisor',
  'calcOrdinaryTax',
  'calcLTCGTax',
  'getSSAnnual',
  'getTaxBrackets',
  'getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual',
  'getTotalCollegeCostForYear',
  'getSecondHomeAnnualCarryAtYear',
  'getSecondHomeSaleAtFire',
  'calcMortgagePayment',
  'getSelectedRelocationCost',
  'detectMFJ',
  'getMortgageInputs',
  'getSecondHomeInputs',
];

const fnCode = fns.map(n => { try { return extractFn(n); } catch (e) { return `// MISSING: ${n}`; } }).join('\n\n');

const overrides = `
function getSSAnnual(inp, claimAge, fireAge) { return 56292; }
function getHealthcareDeltaAnnual(_s, _a) { return 0; }
function getTotalCollegeCostForYear(_i, _y) { return 0; }
function getSecondHomeAnnualCarryAtYear(_h, _y, _yr) { return 0; }
function getSecondHomeSaleAtFire(_h, _yr) { return 0; }
function getSelectedRelocationCost() { return 0; }
function getMortgageAdjustedRetirement(spend, _yr) { return { annualSpend: spend, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function getSecondHomeInputs() { return null; }
function detectMFJ(_i) { return true; }
`;

global.document = {
  getElementById: (id) => {
    const defaults = {
      terminalBuffer: { value: '0' },
      exp_0: { value: '2690' },
      endAge: { value: '100' },
      rule55Enabled: { checked: false },
      rule55SeparationAge: { value: '54' },
      safetyMargin: { value: '3' },
      irmaaThreshold: { value: '212000' },
      twStdDed: { value: '30000' },
      twTop12: { value: '94300' },
      twTop22: { value: '201050' },
    };
    return defaults[id] || null;
  },
};
global.window = {};

let fireMode = 'safe';
let mortgageEnabled = false;
let secondHomeEnabled = false;
let selectedScenario = 'us';
let yearsToFIREcache = 12;

const ctx = new Function(
  'fireMode', 'mortgageEnabled', 'secondHomeEnabled', 'selectedScenario', 'yearsToFIREcache',
  `${fnCode}\n${overrides}\n
  return {
    signedLifecycleEndBalance,
    isFireAgeFeasible,
    findFireAgeNumerical,
    projectFullLifecycle,
    taxOptimizedWithdrawal,
    getTaxBrackets,
    setFireMode: (m) => { fireMode = m; },
  };`
);

const api = ctx(fireMode, mortgageEnabled, secondHomeEnabled, selectedScenario, yearsToFIREcache);

// Scenario reconstructed from screenshots:
// - Person1 age 42, total portfolio ~$580K now, peak ~$1.35M at FIRE 54
// - FIRE age shows 54, SS claim 70, plan age 100
// - Buffers 1/1 years
// - At age 71 tooltip: withdrawal $14,008/yr, SS $56,292/yr (total spend ~$70,300)
// Working backward: annual spend ≈ $70,300, stockGainPct ~0.6.
// Initial portfolio (2026 at $580K): say 150K trad + 350K stocks + 80K cash.
const inp = {
  agePerson1: 42,
  agePerson2: 42,
  person1_401kTrad: 150000,
  person1_401kRoth: 0,
  person1Stocks: 250000,
  person2Stocks: 100000,
  cashSavings: 80000,
  otherAssets: 0,
  annualIncome: 200000,
  raiseRate: 0.03,
  returnRate: 0.07,
  return401k: 0.07,
  inflationRate: 0.03,
  swr: 0.04,
  monthlySavings: 3000,
  contrib401kTrad: 15000,
  contrib401kRoth: 0,
  empMatch: 5000,
  taxTrad: 0.15,
  stockGainPct: 0.6,
  bufferUnlock: 1,
  bufferSS: 1,
  endAge: 100,
  ssClaimAge: 70,
  safetyMargin: 0.03,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
};

const annualSpend = 70300;

console.log('=== INPUTS ===');
console.log(JSON.stringify({
  annualSpend, endAge: inp.endAge, bufferUnlock: inp.bufferUnlock, bufferSS: inp.bufferSS,
  startPortfolio: inp.person1_401kTrad + inp.person1_401kRoth + inp.person1Stocks + inp.person2Stocks + inp.cashSavings
}, null, 2));

console.log('\n=== SAFE SOLVER ===');
api.setFireMode('safe');
const safeSolve = api.findFireAgeNumerical(inp, annualSpend, 'safe');
console.log(`Safe: years=${safeSolve.years}, fireAge=${42 + safeSolve.years}, feasible=${safeSolve.feasible}`);
console.log(`  endBalance(signed)=${Math.round(safeSolve.endBalance).toLocaleString()}`);
console.log(`  balanceAtUnlock=${Math.round(safeSolve.sim?.balanceAtUnlock || 0).toLocaleString()}`);
console.log(`  balanceAtSS=${Math.round(safeSolve.sim?.balanceAtSS || 0).toLocaleString()}`);
console.log(`  required bufferUnlock=${(inp.bufferUnlock * annualSpend).toLocaleString()}, bufferSS=${(inp.bufferSS * annualSpend).toLocaleString()}`);

console.log('\n=== SIGNED SIM @ FIRE 54 ===');
const signed54 = api.signedLifecycleEndBalance(inp, annualSpend, 54);
console.log(`endBalance(signed)=${Math.round(signed54.endBalance).toLocaleString()}`);
console.log(`balanceAtUnlock=${Math.round(signed54.balanceAtUnlock).toLocaleString()}`);
console.log(`balanceAtSS=${Math.round(signed54.balanceAtSS).toLocaleString()}`);

console.log('\n=== DIE-WITH-ZERO SOLVER ===');
api.setFireMode('dieWithZero');
const dwzSolve = api.findFireAgeNumerical(inp, annualSpend, 'dieWithZero');
console.log(`DWZ: years=${dwzSolve.years}, fireAge=${42 + dwzSolve.years}, feasible=${dwzSolve.feasible}`);
console.log(`  endBalance(signed)=${Math.round(dwzSolve.endBalance).toLocaleString()}`);

console.log('\n=== BUFFER SENSITIVITY (Safe mode) ===');
api.setFireMode('safe');
for (const buf of [0, 1, 2, 3, 5, 10]) {
  const r = api.findFireAgeNumerical({ ...inp, bufferUnlock: buf, bufferSS: buf }, annualSpend, 'safe');
  console.log(`  buffer=${buf}/${buf}: years=${r.years}, fireAge=${42+r.years}, feasible=${r.feasible}, endBal=${Math.round(r.endBalance).toLocaleString()}`);
}

console.log('\n=== CHART (projectFullLifecycle) @ FIRE 54 ===');
const chart = api.projectFullLifecycle(inp, annualSpend, 54, true);
const byAge = Object.fromEntries(chart.map(r => [r.age, r]));
for (const age of [54, 60, 65, 70, 71, 75, 80, 85, 86, 87, 90, 95, 100]) {
  const r = byAge[age];
  if (!r) continue;
  console.log(`  age ${age}: total=$${Math.round(r.total).toLocaleString()}, 401k=$${Math.round(r.p401k).toLocaleString()}, stocks=$${Math.round(r.pStocks).toLocaleString()}, cash=$${Math.round(r.pCash).toLocaleString()}, withdraw=$${Math.round(r.withdrawal).toLocaleString()}, ss=$${Math.round(r.ssIncome).toLocaleString()}, phase=${r.phase}`);
}

console.log('\n=== SUMMARY COMPARISON ===');
const chartEnd = chart.find(r => r.age === 100);
console.log(`  signed sim endBalance @ plan age 100 = $${Math.round(signed54.endBalance).toLocaleString()}`);
console.log(`  chart total          @ plan age 100 = $${Math.round(chartEnd?.total || 0).toLocaleString()}`);
console.log(`  → Divergence = $${Math.round((signed54.endBalance) - (chartEnd?.total || 0)).toLocaleString()}`);

// Find age at which chart reaches zero
const zeroAge = chart.find(r => r.age >= 54 && r.total < 1000)?.age;
console.log(`  chart portfolio reaches ~$0 at age ${zeroAge}`);
