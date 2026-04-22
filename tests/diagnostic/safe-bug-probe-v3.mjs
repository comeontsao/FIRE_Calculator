// V3 — Add college costs during retirement to trigger realistic depletion.
// This more closely matches user's scenario where phase-2 drain is ~$85K/yr.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`'${name}' not found`);
  let i = HTML.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < HTML.length) {
    const ch = HTML[i];
    if (ch === '/' && HTML[i+1] === '/') { i = HTML.indexOf('\n', i); if (i < 0) break; i++; continue; }
    if (ch === '/' && HTML[i+1] === '*') { i = HTML.indexOf('*/', i); if (i < 0) break; i += 2; continue; }
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
const fns = [
  'taxOptimizedWithdrawal','signedLifecycleEndBalance','isFireAgeFeasible',
  'findFireAgeNumerical','projectFullLifecycle','getRMDDivisor','calcOrdinaryTax',
  'calcLTCGTax','getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual','getTotalCollegeCostForYear','getSecondHomeAnnualCarryAtYear',
  'getSecondHomeSaleAtFire','calcMortgagePayment','getSelectedRelocationCost',
  'detectMFJ','getMortgageInputs','getSecondHomeInputs',
];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return `// MISSING: ${n}`; }}).join('\n\n');
const overrides = `
function getSSAnnual() { return 56292; }
function getHealthcareDeltaAnnual() { return 0; }
// College: kid1 starts at age 18 (yearsFromNow=10) for 4 years, $70K/yr.
// kid2 starts at age 18 (yearsFromNow=13) for 4 years, $70K/yr.
function getTotalCollegeCostForYear(_inp, y) {
  let total = 0;
  if (y >= 10 && y < 14) total += 70000;
  if (y >= 13 && y < 17) total += 70000;
  return total;
}
function getSecondHomeAnnualCarryAtYear() { return 0; }
function getSecondHomeSaleAtFire() { return 0; }
function getSelectedRelocationCost() { return 0; }
function getMortgageAdjustedRetirement(spend) { return { annualSpend: spend, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function getSecondHomeInputs() { return null; }
function detectMFJ() { return true; }
`;
global.document = { getElementById: (id) => {
  const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
  return d[id] || null;
}};
global.window = {};
let fireMode = 'safe', mortgageEnabled = false, secondHomeEnabled = false, selectedScenario = 'us';
const ctx = new Function('fireMode','mortgageEnabled','secondHomeEnabled','selectedScenario',
  `${fnCode}\n${overrides}\nreturn {signedLifecycleEndBalance,isFireAgeFeasible,findFireAgeNumerical,projectFullLifecycle,taxOptimizedWithdrawal,setFireMode:(m)=>{fireMode=m;}};`);
const api = ctx(fireMode, mortgageEnabled, secondHomeEnabled, selectedScenario);

const inp = {
  agePerson1:42, agePerson2:42,
  person1_401kTrad:100000, person1_401kRoth:0,
  person1Stocks:280000, person2Stocks:150000,
  cashSavings:50000, otherAssets:0,
  annualIncome:200000, raiseRate:0.03,
  returnRate:0.07, return401k:0.07, inflationRate:0.03,
  swr:0.04, monthlySavings:3000,
  contrib401kTrad:15000, contrib401kRoth:0, empMatch:5000,
  taxTrad:0.15, stockGainPct:0.6,
  bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70,
  safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
};
const spend = 70300;

api.setFireMode('safe');
const safe = api.findFireAgeNumerical(inp, spend, 'safe');
console.log(`Safe: fireAge=${42+safe.years}, feasible=${safe.feasible}, endBal(signed)=$${Math.round(safe.endBalance).toLocaleString()}`);
console.log(`  balAtUnlock=$${Math.round(safe.sim?.balanceAtUnlock||0).toLocaleString()}, balAtSS=$${Math.round(safe.sim?.balanceAtSS||0).toLocaleString()}`);

api.setFireMode('dieWithZero');
const dwz = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
console.log(`DWZ:  fireAge=${42+dwz.years}, feasible=${dwz.feasible}, endBal=$${Math.round(dwz.endBalance).toLocaleString()}`);
api.setFireMode('safe');

// Full chart trace
const chart = api.projectFullLifecycle(inp, spend, 42+safe.years, true);
console.log(`\nChart @ FIRE ${42+safe.years}:`);
for (const r of chart) {
  if (r.age % 5 === 0 || r.age === 42+safe.years || r.age === 71 || r.age === 86 || r.age === 100) {
    console.log(`  age ${r.age}: total=$${Math.round(r.total).toLocaleString()}, 401k=$${Math.round(r.p401k).toLocaleString()}, stocks=$${Math.round(r.pStocks).toLocaleString()}, cash=$${Math.round(r.pCash).toLocaleString()}, W=$${Math.round(r.withdrawal).toLocaleString()}, SS=$${Math.round(r.ssIncome).toLocaleString()}, phase=${r.phase}`);
  }
}

// Buffer sensitivity
console.log(`\nBuffer sensitivity (spend=$${spend}):`);
for (const buf of [0, 1, 2, 3, 5, 10]) {
  api.setFireMode('safe');
  const r = api.findFireAgeNumerical({...inp, bufferUnlock:buf, bufferSS:buf}, spend, 'safe');
  const au = r.sim?.balanceAtUnlock || 0;
  const as = r.sim?.balanceAtSS || 0;
  console.log(`  buf=${buf}: fireAge=${42+r.years}, atUnlock=$${Math.round(au).toLocaleString()}, atSS=$${Math.round(as).toLocaleString()}, need=$${(buf*spend).toLocaleString()}, feasible=${r.feasible}`);
}

// Check: does signed sim see depletion too?
console.log('\nSigned-sim end balance at various FIRE ages (spend=$70.3K):');
for (const fa of [50, 52, 54, 56, 58]) {
  const s = api.signedLifecycleEndBalance(inp, spend, fa);
  console.log(`  FIRE ${fa}: endBalance=$${Math.round(s.endBalance).toLocaleString()}, balAtUnlock=$${Math.round(s.balanceAtUnlock).toLocaleString()}, balAtSS=$${Math.round(s.balanceAtSS).toLocaleString()}`);
}
