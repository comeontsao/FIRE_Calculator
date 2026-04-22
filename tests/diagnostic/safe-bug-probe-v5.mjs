// V5 — Scan for scenarios where Safe says feasible BUT chart visibly depletes
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
function getTotalCollegeCostForYear(_i, y) { let t = 0; if (y >= 10 && y < 14) t += 80000; if (y >= 13 && y < 17) t += 80000; return t; }
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
  `${fnCode}\n${overrides}\nreturn {signedLifecycleEndBalance,isFireAgeFeasible,findFireAgeNumerical,projectFullLifecycle,setFireMode:(m)=>{fireMode=m;}};`);
const api = ctx(fireMode,mortgageEnabled,secondHomeEnabled,selectedScenario);

const baseInp = {
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

function run(label, overrides, spend) {
  const inp = { ...baseInp, ...overrides };
  api.setFireMode('safe');
  const sf = api.findFireAgeNumerical(inp, spend, 'safe');
  api.setFireMode('dieWithZero');
  const dwz = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
  api.setFireMode('safe');
  const chart = api.projectFullLifecycle(inp, spend, 42 + sf.years, true);
  const at100 = chart.find(r => r.age === 100);
  let minT = Infinity, minA = 0;
  for (const r of chart) if (r.age >= 42+sf.years && r.total < minT) { minT = r.total; minA = r.age; }
  const zeroAge = chart.find(r => r.age >= 42+sf.years && r.total < 1000)?.age;
  console.log(`${label}: spend=$${spend}, SafeFIRE=${42+sf.years} (feas=${sf.feasible}), DWZ=${42+dwz.years}, SignedEnd=$${Math.round(sf.endBalance).toLocaleString()}, ChartMin=$${Math.round(minT).toLocaleString()}@${minA}, Chart@100=$${Math.round(at100?.total||0).toLocaleString()}, zeroAge=${zeroAge||'never'}`);
}

console.log('\n=== Scan spend x starting portfolio (college on) ===');
for (const spend of [70000, 80000, 90000, 100000]) {
  run(`spend=${spend}`, {}, spend);
}

console.log('\n=== Small-starting scenarios ===');
for (const mult of [0.5, 0.6, 0.7, 0.8, 1.0]) {
  run(`scaled=${mult}`, {
    person1_401kTrad: 100000*mult,
    person1Stocks: 280000*mult,
    person2Stocks: 150000*mult,
    cashSavings: 50000*mult,
  }, 70300);
}

console.log('\n=== Big 401K Trad (drain heavy) ===');
run('bigTrad', { person1_401kTrad: 400000, person1Stocks: 100000, person2Stocks: 50000, cashSavings: 30000 }, 70300);

console.log('\n=== Very tight scenario (should deplete in chart) ===');
run('tight', {
  person1_401kTrad: 50000, person1Stocks: 200000, person2Stocks: 100000,
  cashSavings: 30000, contrib401kTrad: 10000, empMatch: 3000, monthlySavings: 2000,
}, 75000);

console.log('\n=== Buffer 1/1 vs 2/2 vs 5/5 on same tight scenario ===');
for (const buf of [0, 1, 2, 3, 5, 10]) {
  run(`tight+buf${buf}`, {
    person1_401kTrad: 50000, person1Stocks: 200000, person2Stocks: 100000,
    cashSavings: 30000, contrib401kTrad: 10000, empMatch: 3000, monthlySavings: 2000,
    bufferUnlock: buf, bufferSS: buf,
  }, 75000);
}
