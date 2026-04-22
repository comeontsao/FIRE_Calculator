// V7 — Reproduce user's chart shape:
//   FIRE 54, portfolio depletes to $0 at age 86, stays $0 through age 100.
//   Goal: verify the trajectory fix rejects this FIRE age and pushes later.
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

// Search for a scenario whose chart at FIRE 54 goes to $0 around age 86
// and where signed sim + trajectory check disagree (bug) or agree (fix works).
const targets = [
  // Starting portfolio ~580K, different asset mixes
  { t401kTrad: 80000, stocks1: 300000, stocks2: 100000, cash: 100000, spend: 70300, label: 'mix-A' },
  { t401kTrad: 150000, stocks1: 250000, stocks2: 100000, cash: 80000, spend: 70300, label: 'mix-B' },
  { t401kTrad: 200000, stocks1: 200000, stocks2: 100000, cash: 80000, spend: 70300, label: 'mix-C' },
  // Higher spend
  { t401kTrad: 150000, stocks1: 250000, stocks2: 100000, cash: 80000, spend: 85000, label: 'mix-D hi-spend' },
  { t401kTrad: 150000, stocks1: 250000, stocks2: 100000, cash: 80000, spend: 95000, label: 'mix-E hi-spend' },
  // Tighter — less monthly savings
  { t401kTrad: 100000, stocks1: 250000, stocks2: 100000, cash: 130000, spend: 75000, save: 2000, label: 'mix-F low-save' },
];

for (const t of targets) {
  const inp = {
    agePerson1:42, agePerson2:42,
    person1_401kTrad: t.t401kTrad, person1_401kRoth: 0,
    person1Stocks: t.stocks1, person2Stocks: t.stocks2,
    cashSavings: t.cash, otherAssets: 0,
    annualIncome:200000, raiseRate:0.03,
    returnRate:0.07, return401k:0.07, inflationRate:0.03,
    swr:0.04, monthlySavings: t.save || 3000,
    contrib401kTrad:15000, contrib401kRoth:0, empMatch:5000,
    taxTrad:0.15, stockGainPct:0.6,
    bufferUnlock:1, bufferSS:1,
    endAge:100, ssClaimAge:70,
    safetyMargin:0.03, rule55:{enabled:false, separationAge:54}, irmaaThreshold:212000,
  };
  api.setFireMode('safe');
  const sf = api.findFireAgeNumerical(inp, t.spend, 'safe');
  const chart = api.projectFullLifecycle(inp, t.spend, 42+sf.years, true);
  const at42 = chart.find(r => r.age === 42);
  const at54 = chart.find(r => r.age === 54);
  const at86 = chart.find(r => r.age === 86);
  const at100 = chart.find(r => r.age === 100);

  // Also try FIRE 54 explicitly (force the signed sim, without override)
  const sim54 = api.signedLifecycleEndBalance(inp, t.spend, 54);
  const feas54 = api.isFireAgeFeasible(sim54, inp, t.spend, 'safe');

  console.log(`${t.label}: startPort=$${(t.t401kTrad+t.stocks1+t.stocks2+t.cash).toLocaleString()}, spend=$${t.spend}`);
  console.log(`  SafeFIRE=${42+sf.years}, feas=${sf.feasible}`);
  console.log(`  chart@42=$${Math.round(at42?.total||0).toLocaleString()}, @54=$${Math.round(at54?.total||0).toLocaleString()}, @86=$${Math.round(at86?.total||0).toLocaleString()}, @100=$${Math.round(at100?.total||0).toLocaleString()}`);
  console.log(`  sim@54: endBal=$${Math.round(sim54.endBalance).toLocaleString()}, minP1=$${Math.round(sim54.minBalancePhase1 === Infinity ? -1 : sim54.minBalancePhase1).toLocaleString()}, minP2=$${Math.round(sim54.minBalancePhase2 === Infinity ? -1 : sim54.minBalancePhase2).toLocaleString()}, minP3=$${Math.round(sim54.minBalancePhase3 === Infinity ? -1 : sim54.minBalancePhase3).toLocaleString()}`);
  console.log(`  @FIRE 54 SafeFeasible=${feas54}`);
}
