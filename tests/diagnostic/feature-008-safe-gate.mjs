// Probe: under Safe vs DWZ mode, which strategies are feasible and who wins
// the 'retire-sooner-pay-less-tax' objective? Shows the Safe-mode gate rejects
// drain-to-zero strategies.
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
    if (ch === '/' && HTML[i+1] === '/') { i = HTML.indexOf('\n', i); if (i<0) break; i++; continue; }
    if (ch === '/' && HTML[i+1] === '*') { i = HTML.indexOf('*/', i); if (i<0) break; i += 2; continue; }
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
function extractBlock(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  const e = HTML.indexOf(endMarker, s);
  return HTML.slice(s, e);
}

const strategiesBlock = extractBlock(
  '// ==================== Feature 008 — Strategy Policies ====================',
  '// Feature 007 — each strategy.push row includes'
);
const projectBlock = extractFn('projectFullLifecycle');
const fns = ['taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax','getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement','getHealthcareDeltaAnnual','getTotalCollegeCostForYear','calcMortgagePayment','detectMFJ','getMortgageInputs','getSecondHomeInputs','getSelectedRelocationCost','getScenarioEffectiveSpend'];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
const overrides = `
function getSSAnnual() { return 48000; }
function getHealthcareDeltaAnnual(_scenario, age) { return age < 65 ? 12000 : 0; }
function getTotalCollegeCostForYear(_inp, yearsFromNow) { return (yearsFromNow >= 10 && yearsFromNow < 18) ? 40000 : 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function getSecondHomeInputs() { return null; }
function getSelectedRelocationCost() { return 0; }
function detectMFJ() { return true; }
`;
const doc = { getElementById: (id) => {
  const d = { terminalBuffer:{value:'2'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
  return d[id] || null;
}};
const ctx = new Function('mortgageEnabled','secondHomeEnabled','scenarios','selectedScenario','yearsToFIREcache','document','window',
  `${fnCode}\n${overrides}\n${strategiesBlock}\n${projectBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies, projectFullLifecycle };`);
const api = ctx(false, false, [{id:'base'}], 'base', 12, doc, {});

// RR-ish scenario from the screenshot: age 42, FIRE 54, ~$1.5M assets at FIRE.
const inp = {
  agePerson1: 42, ageRoger: 42,
  person1_401kTrad: 150000, person1_401kRoth: 0,
  person1Stocks: 250000, person2Stocks: 100000,
  cashSavings: 80000, otherAssets: 0,
  annualIncome: 200000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  monthlySavings: 3000,
  contrib401kTrad: 15000, contrib401kRoth: 0, empMatch: 5000,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70, annualSpend: 72000,
  safetyMargin: 0.03, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
};

for (const mode of ['safe', 'dieWithZero']) {
  const r = api.scoreAndRank(inp, 54, mode, 'retire-sooner-pay-less-tax');
  console.log(`\n=== mode=${mode} objective=tax ===`);
  console.log('Winner:', r.winnerId, `(feasible=${r.rows[0].feasibleUnderCurrentMode})`);
  for (const row of r.rows) {
    console.log(`  ${row.strategyId.padEnd(22)} feas=${String(row.feasibleUnderCurrentMode).padEnd(5)} endBal=$${Math.round(row.endOfPlanNetWorthReal).toLocaleString().padStart(12)} tax=$${Math.round(row.lifetimeFederalTaxReal).toLocaleString().padStart(8)} minPostUnlock=$${Math.round(row.minTotalPostUnlock || 0).toLocaleString().padStart(10)}`);
  }
}
