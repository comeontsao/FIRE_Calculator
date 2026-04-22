// V8 — Force low-minP3 scenarios where user would see depletion,
// and verify my fix rejects them.
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

// Try progressively tighter: low returns, small starting, high spend.
const scenarios = [
  { label: 'low-ret', returnRate: 0.05, return401k: 0.05 },
  { label: 'low-ret+small', returnRate: 0.05, return401k: 0.05,
    person1_401kTrad: 50000, person1Stocks: 150000, person2Stocks: 80000, cashSavings: 30000 },
  { label: 'small-only', person1_401kTrad: 50000, person1Stocks: 150000, person2Stocks: 80000, cashSavings: 30000 },
  { label: 'hi-spend-tight', spend: 120000, person1_401kTrad: 50000, person1Stocks: 150000, person2Stocks: 80000, cashSavings: 30000 },
  { label: 'low-save', monthlySavings: 1000 },
  { label: 'low-save+low-ret', monthlySavings: 1000, returnRate: 0.05, return401k: 0.05 },
];

const baseInp = {
  agePerson1:42, agePerson2:42,
  person1_401kTrad:150000, person1_401kRoth:0,
  person1Stocks:250000, person2Stocks:100000,
  cashSavings:80000, otherAssets:0,
  annualIncome:200000, raiseRate:0.03,
  returnRate:0.07, return401k:0.07, inflationRate:0.03,
  swr:0.04, monthlySavings:3000,
  contrib401kTrad:15000, contrib401kRoth:0, empMatch:5000,
  taxTrad:0.15, stockGainPct:0.6,
  bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70,
  safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
};

for (const s of scenarios) {
  const inp = { ...baseInp, ...s };
  const spend = s.spend || 70300;
  api.setFireMode('safe');
  const sf = api.findFireAgeNumerical(inp, spend, 'safe');
  api.setFireMode('dieWithZero');
  const dwz = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
  api.setFireMode('safe');
  const chart = api.projectFullLifecycle(inp, spend, 42+sf.years, true);
  const at86 = chart.find(r => r.age === 86);
  const at100 = chart.find(r => r.age === 100);
  let minT = Infinity; for (const r of chart) if (r.age >= 42+sf.years && r.total < minT) minT = r.total;
  const zA = chart.find(r => r.age >= 42+sf.years && r.total < 5000)?.age;

  // Also test: at Safe's chosen age, what are the per-phase minimums?
  const sim = api.signedLifecycleEndBalance(inp, spend, 42+sf.years);
  const fmt = (v) => v === Infinity ? '∞' : '$' + Math.round(v).toLocaleString();

  console.log(`${s.label}: spend=$${spend}, SafeFIRE=${42+sf.years}, DWZ=${42+dwz.years}, Safe-DWZ=${sf.years-dwz.years}`);
  console.log(`  chart@86=$${Math.round(at86?.total||0).toLocaleString()}, @100=$${Math.round(at100?.total||0).toLocaleString()}, min=$${Math.round(minT).toLocaleString()}, zeroAge=${zA||'never'}`);
  console.log(`  sim minP1=${fmt(sim.minBalancePhase1)}, minP2=${fmt(sim.minBalancePhase2)}, minP3=${fmt(sim.minBalancePhase3)}`);
}
