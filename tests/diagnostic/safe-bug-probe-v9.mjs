// V9 — Force FIRE 54 on a too-tight scenario, confirm trajectory fix rejects it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(name);
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
const fns = ['taxOptimizedWithdrawal','signedLifecycleEndBalance','isFireAgeFeasible','findFireAgeNumerical','projectFullLifecycle','getRMDDivisor','calcOrdinaryTax','calcLTCGTax','getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement','getHealthcareDeltaAnnual','getTotalCollegeCostForYear','getSecondHomeAnnualCarryAtYear','getSecondHomeSaleAtFire','calcMortgagePayment','getSelectedRelocationCost','detectMFJ','getMortgageInputs','getSecondHomeInputs'];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
const overrides = `
function getSSAnnual() { return 56292; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getSecondHomeAnnualCarryAtYear() { return 0; }
function getSecondHomeSaleAtFire() { return 0; }
function getSelectedRelocationCost() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
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
let fireMode='safe', mortgageEnabled=false, secondHomeEnabled=false, selectedScenario='us';
const ctx = new Function('fireMode','mortgageEnabled','secondHomeEnabled','selectedScenario',
  `${fnCode}\n${overrides}\nreturn {findFireAgeNumerical, projectFullLifecycle, signedLifecycleEndBalance, isFireAgeFeasible, setFireMode:(m)=>{fireMode=m;}};`);
const api = ctx(fireMode,mortgageEnabled,secondHomeEnabled,selectedScenario);

// Very tight to force near-depletion
const inp = {
  agePerson1:42, agePerson2:42,
  person1_401kTrad:30000, person1_401kRoth:0,
  person1Stocks:100000, person2Stocks:50000,
  cashSavings:20000, otherAssets:0,
  annualIncome:200000, raiseRate:0.03,
  returnRate:0.05, return401k:0.05, inflationRate:0.03,
  swr:0.04, monthlySavings:500,
  contrib401kTrad:5000, contrib401kRoth:0, empMatch:2000,
  taxTrad:0.15, stockGainPct:0.6,
  bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70,
  safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
};
const spend = 70300;

// SCAN: at every FIRE age, is it Safe-feasible?
console.log('FIRE age | endBal     | minP1      | minP2      | minP3      | SafeFeas');
for (let fa = 50; fa <= 65; fa++) {
  const sim = api.signedLifecycleEndBalance(inp, spend, fa);
  const feas = api.isFireAgeFeasible(sim, inp, spend, 'safe');
  const fmt = (v) => v === Infinity ? '∞         ' : ('$' + Math.round(v).toLocaleString()).padStart(12);
  console.log(`   ${fa}    | ${fmt(sim.endBalance)} |${fmt(sim.minBalancePhase1)} |${fmt(sim.minBalancePhase2)} |${fmt(sim.minBalancePhase3)} | ${feas}`);
}

api.setFireMode('safe');
const sf = api.findFireAgeNumerical(inp, spend, 'safe');
api.setFireMode('dieWithZero');
const dwz = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
console.log(`\nSafe: FIRE age ${42+sf.years} (feasible=${sf.feasible})`);
console.log(`DWZ:  FIRE age ${42+dwz.years} (feasible=${dwz.feasible})`);
console.log(`Safe leaves ${42+sf.years - (42+dwz.years)} year cushion over DWZ.`);

// Show the chart
api.setFireMode('safe');
const chart = api.projectFullLifecycle(inp, spend, 42+sf.years, true);
console.log(`\nChart @ Safe FIRE ${42+sf.years}:`);
for (const age of [42+sf.years, 60, 70, 75, 80, 85, 90, 95, 100]) {
  const r = chart.find(r => r.age === age);
  if (!r) continue;
  console.log(`  age ${age}: total=$${Math.round(r.total).toLocaleString()}`);
}

// Also: at DWZ FIRE age (what the fix rejects), show chart depletion
api.setFireMode('dieWithZero');
const chartDWZ = api.projectFullLifecycle(inp, spend, 42+dwz.years, true);
console.log(`\nChart @ DWZ FIRE ${42+dwz.years} (what Safe correctly rejects):`);
for (const age of [42+dwz.years, 60, 70, 75, 80, 85, 90, 95, 100]) {
  const r = chartDWZ.find(r => r.age === age);
  if (!r) continue;
  console.log(`  age ${age}: total=$${Math.round(r.total).toLocaleString()}`);
}
