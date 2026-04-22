// V2 — Tune the scenario to reproduce user's symptom: portfolio depletes before plan age.
// Key observations from user's screenshots:
//   - Peak $1.35M at FIRE 54 → tooltip $181K at age 71 → chart total ≈ $0 at age 86+
//   - That implies total drain of $1.35M−$181K = $1.17M over 17 years = ~$69K/yr
//     net drain BEFORE SS. With SS at $56K then net withdrawal after SS is $14K.
//   - Implies target spend $70K/yr WITHOUT college/healthcare deltas. But the
//     actual drain suggests additional costs during phase 1/2.
// Simplest way to reproduce: bump the annualSpend so Safe is pushed to age 54.

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
  'taxOptimizedWithdrawal', 'signedLifecycleEndBalance', 'isFireAgeFeasible',
  'findFireAgeNumerical', 'projectFullLifecycle', 'getRMDDivisor', 'calcOrdinaryTax',
  'calcLTCGTax', 'getSSAnnual', 'getTaxBrackets', 'getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual', 'getTotalCollegeCostForYear', 'getSecondHomeAnnualCarryAtYear',
  'getSecondHomeSaleAtFire', 'calcMortgagePayment', 'getSelectedRelocationCost',
  'detectMFJ', 'getMortgageInputs', 'getSecondHomeInputs',
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
    signedLifecycleEndBalance, isFireAgeFeasible, findFireAgeNumerical,
    projectFullLifecycle, taxOptimizedWithdrawal, getTaxBrackets,
    setFireMode: (m) => { fireMode = m; },
  };`
);

const api = ctx(fireMode, mortgageEnabled, secondHomeEnabled, selectedScenario, yearsToFIREcache);

// Tighter scenario — smaller starting, higher spend so Safe is forced to age ~54
const inp = {
  agePerson1: 42, agePerson2: 42,
  person1_401kTrad: 80000, person1_401kRoth: 0,
  person1Stocks: 250000, person2Stocks: 150000,
  cashSavings: 100000, otherAssets: 0,
  annualIncome: 200000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04,
  monthlySavings: 3000,
  contrib401kTrad: 15000, contrib401kRoth: 0, empMatch: 5000,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  safetyMargin: 0.03,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
};

// Try multiple spend levels until Safe is forced to age 54ish and chart depletes
console.log('=== SCAN: spend vs Safe FIRE age vs chart-at-100 ===');
for (const spend of [60000, 70000, 80000, 90000, 100000, 110000, 120000]) {
  api.setFireMode('safe');
  const safe = api.findFireAgeNumerical(inp, spend, 'safe');
  api.setFireMode('dieWithZero');
  const dwz = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
  api.setFireMode('safe');
  const chart = api.projectFullLifecycle(inp, spend, 42 + safe.years, true);
  const at100 = chart.find(r => r.age === 100);
  const firstZero = chart.find(r => r.age >= 42 + safe.years + 1 && r.total < 10000);
  console.log(`  spend=$${spend}: Safe fireAge=${42 + safe.years} (feasible=${safe.feasible}), DWZ fireAge=${42 + dwz.years}, chart@100=$${Math.round(at100?.total || 0).toLocaleString()}, firstZero@age=${firstZero ? firstZero.age : 'never'}`);
}

// Pick the spend where chart depletes but Safe says feasible
const spend = 100000;
console.log(`\n=== DETAILED TRACE: spend=$${spend} ===`);
api.setFireMode('safe');
const safe = api.findFireAgeNumerical(inp, spend, 'safe');
console.log(`Safe: fireAge=${42+safe.years}, feasible=${safe.feasible}, endBal(signed)=$${Math.round(safe.endBalance).toLocaleString()}`);
const signed = api.signedLifecycleEndBalance(inp, spend, 42 + safe.years);
console.log(`Signed @ FIRE ${42+safe.years}: endBal=$${Math.round(signed.endBalance).toLocaleString()}, balAtUnlock=$${Math.round(signed.balanceAtUnlock).toLocaleString()}, balAtSS=$${Math.round(signed.balanceAtSS).toLocaleString()}`);

const chart = api.projectFullLifecycle(inp, spend, 42 + safe.years, true);
const byAge = Object.fromEntries(chart.map(r => [r.age, r]));
console.log('Chart trace:');
for (const age of [42 + safe.years, 55, 59, 60, 65, 69, 70, 75, 80, 85, 86, 87, 90, 95, 100]) {
  const r = byAge[age];
  if (!r) continue;
  console.log(`  age ${age}: total=$${Math.round(r.total).toLocaleString()}, 401k=$${Math.round(r.p401k).toLocaleString()}, stocks=$${Math.round(r.pStocks).toLocaleString()}, withdraw=$${Math.round(r.withdrawal).toLocaleString()}, ss=$${Math.round(r.ssIncome).toLocaleString()}, phase=${r.phase}`);
}

console.log('\n=== BUFFER SENSITIVITY @ spend=$100K ===');
for (const buf of [0, 1, 2, 3, 5, 10]) {
  api.setFireMode('safe');
  const r = api.findFireAgeNumerical({ ...inp, bufferUnlock: buf, bufferSS: buf }, spend, 'safe');
  const atUnlock = r.sim?.balanceAtUnlock || 0;
  const atSS = r.sim?.balanceAtSS || 0;
  console.log(`  buf=${buf}/${buf}: fireAge=${42+r.years}, feasible=${r.feasible}, atUnlock=$${Math.round(atUnlock).toLocaleString()}, atSS=$${Math.round(atSS).toLocaleString()}, need=$${(buf*spend).toLocaleString()}`);
}
