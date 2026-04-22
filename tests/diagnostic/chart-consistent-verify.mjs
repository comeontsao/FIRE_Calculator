// Verify: Safe's feasibility check now uses projectFullLifecycle directly.
// Construct a case where chart depletes but signed sim's phase minimums were OK.
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

// Tight scenario — chart depletes if FIRE too early
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

console.log('At each candidate FIRE age, does chart-based Safe accept?');
console.log('fireAge | chart-min | chartDepletes? | SafeFeas(chart-based) | SafeFeas(no-chart fallback)');
for (let fa = 60; fa <= 70; fa++) {
  const chart = api.projectFullLifecycle(inp, spend, fa, true);
  let chartMin = Infinity;
  for (const r of chart) if (r.age >= fa && r.total < chartMin) chartMin = r.total;
  const depletes = chartMin < (inp.bufferSS * spend);
  const sim = api.signedLifecycleEndBalance(inp, spend, fa);
  const feasWithChart = api.isFireAgeFeasible(sim, inp, spend, 'safe', fa);  // chart-based
  const feasNoChart = api.isFireAgeFeasible(sim, inp, spend, 'safe');          // no fireAge → fallback
  console.log(`   ${fa}   | $${Math.round(chartMin).toLocaleString().padStart(8)} | ${String(depletes).padStart(5)}           | ${String(feasWithChart).padStart(5)}                 | ${String(feasNoChart)}`);
}
api.setFireMode('safe');
const sf = api.findFireAgeNumerical(inp, spend, 'safe');
console.log(`\nSolver's Safe pick: FIRE ${42+sf.years}, feasible=${sf.feasible}`);
