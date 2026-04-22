// V6 — Target user's exact scenario: at age 71 in the chart, total ≈ $181K
// User's chart: peak $1.35M at FIRE 54, $181K at age 71. That's $1.17M drain
// over 17 years = ~$69K/yr net. With SS kicking in at 70 (partial), phase-1+2
// average drain is significant. Let me find a config that makes chart actually
// deplete with Safe saying feasible.
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

// "Just barely feasible" — Safe will land at higher FIRE age.
// Constants: agePerson1=42, endAge=100, bufferUnlock=bufferSS=1, ssClaimAge=70
// Adjust inputs to land where chart@71 ≈ $181K.
const tries = [
  { label: 'try1', person1_401kTrad: 100000, person1Stocks: 180000, person2Stocks: 100000, cashSavings: 30000, monthlySavings: 2500, contrib401kTrad: 10000, empMatch: 3000, spend: 70300 },
  { label: 'try2', person1_401kTrad: 100000, person1Stocks: 200000, person2Stocks: 100000, cashSavings: 30000, monthlySavings: 3000, contrib401kTrad: 12000, empMatch: 4000, spend: 80000 },
  { label: 'try3', person1_401kTrad: 100000, person1Stocks: 150000, person2Stocks: 100000, cashSavings: 30000, monthlySavings: 3000, contrib401kTrad: 15000, empMatch: 5000, spend: 75000 },
  { label: 'try4', person1_401kTrad: 80000, person1Stocks: 180000, person2Stocks: 80000, cashSavings: 40000, monthlySavings: 2500, contrib401kTrad: 12000, empMatch: 4000, spend: 72000 },
];

for (const t of tries) {
  const inp = {
    agePerson1:42, agePerson2:42,
    person1_401kTrad: t.person1_401kTrad, person1_401kRoth: 0,
    person1Stocks: t.person1Stocks, person2Stocks: t.person2Stocks,
    cashSavings: t.cashSavings, otherAssets: 0,
    annualIncome:200000, raiseRate:0.03,
    returnRate:0.07, return401k:0.07, inflationRate:0.03,
    swr:0.04, monthlySavings: t.monthlySavings,
    contrib401kTrad: t.contrib401kTrad, contrib401kRoth:0, empMatch: t.empMatch,
    taxTrad:0.15, stockGainPct:0.6,
    bufferUnlock:1, bufferSS:1,
    endAge:100, ssClaimAge:70,
    safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
  };
  api.setFireMode('safe');
  const sf = api.findFireAgeNumerical(inp, t.spend, 'safe');
  const chart = api.projectFullLifecycle(inp, t.spend, 42+sf.years, true);
  const at54 = chart.find(r => r.age === 54);
  const at71 = chart.find(r => r.age === 71);
  const at100 = chart.find(r => r.age === 100);
  let minT = Infinity, minA = 0;
  for (const r of chart) if (r.age >= 42+sf.years && r.total < minT) { minT = r.total; minA = r.age; }
  console.log(`${t.label}: spend=$${t.spend}, SafeFIRE=${42+sf.years}, feas=${sf.feasible}`);
  console.log(`  @54=$${Math.round(at54?.total||0).toLocaleString()}, @71=$${Math.round(at71?.total||0).toLocaleString()}, @100=$${Math.round(at100?.total||0).toLocaleString()}, min=$${Math.round(minT).toLocaleString()}@${minA}`);
}

// Now the FAILING scenario — force FIRE 54 manually (override) even when infeasible
// This shows what happens when user has insufficient resources. Force spend so high
// Safe solver fails and returns max years but UI might clamp to override
console.log('\n=== FORCING FIRE 54 via override (chart should show depletion) ===');
const baseInp = {
  agePerson1:42, agePerson2:42,
  person1_401kTrad:100000, person1_401kRoth:0,
  person1Stocks:180000, person2Stocks:80000,
  cashSavings:30000, otherAssets:0,
  annualIncome:200000, raiseRate:0.03,
  returnRate:0.07, return401k:0.07, inflationRate:0.03,
  swr:0.04, monthlySavings:2500,
  contrib401kTrad:10000, contrib401kRoth:0, empMatch:3000,
  taxTrad:0.15, stockGainPct:0.6,
  bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70,
  safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
};
api.setFireMode('safe');
const sig54 = api.signedLifecycleEndBalance(baseInp, 80000, 54);
console.log(`signed@54 spend=$80K: endBal=$${Math.round(sig54.endBalance).toLocaleString()}, atUnlock=$${Math.round(sig54.balanceAtUnlock).toLocaleString()}, atSS=$${Math.round(sig54.balanceAtSS).toLocaleString()}`);
const chart54 = api.projectFullLifecycle(baseInp, 80000, 54, true);
const c71 = chart54.find(r => r.age === 71);
console.log(`chart@71=$${Math.round(c71?.total||0).toLocaleString()}, withdraw=$${Math.round(c71?.withdrawal||0)}, ss=$${Math.round(c71?.ssIncome||0)}`);
let mT=Infinity,mA=0;
for (const r of chart54) if (r.age>=54 && r.total<mT) { mT=r.total; mA=r.age; }
console.log(`chart min after FIRE: $${Math.round(mT).toLocaleString()} at age ${mA}`);
const zA = chart54.find(r => r.age >= 54 && r.total < 5000)?.age;
console.log(`chart reaches <$5K at age: ${zA || 'never'}`);
