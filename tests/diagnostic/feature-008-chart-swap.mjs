// Verify the projectFullLifecycle strategy-override wiring produces distinct
// per-year portfolio trajectories for different strategies. Proves the main
// FIRE growth chart will visibly change when the optimization goal toggles.
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

const fns = [
  'taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax',
  'getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual','getTotalCollegeCostForYear',
  'calcMortgagePayment','detectMFJ','getMortgageInputs','getSecondHomeInputs',
  'getSelectedRelocationCost','getScenarioEffectiveSpend',
];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');

const overrides = `
function getSSAnnual() { return 48000; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function detectMFJ() { return true; }
function getSelectedRelocationCost() { return 0; }
function getSecondHomeInputs() { return null; }
`;

const doc = { getElementById: (id) => {
  const d = {
    terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}
  };
  return d[id] || null;
}};
const win = {};

const ctx = new Function('document','window','mortgageEnabled','secondHomeEnabled','scenarios','selectedScenario','yearsToFIREcache',
  `${fnCode}\n${overrides}\n${strategiesBlock}\n${projectBlock}\nreturn { projectFullLifecycle, scoreAndRank, getStrategies };`);
const api = ctx(doc, win, false, false, [{id:'base'}], 'base', 12);

const inp = {
  agePerson1: 42, agePerson2: 42, ageRoger: 42,
  person1_401kTrad: 150000, person1_401kRoth: 0,
  person1Stocks: 250000, person2Stocks: 100000,
  rogerStocks: 250000, rebeccaStocks: 100000,
  roger401kTrad: 150000, roger401kRoth: 0,
  cashSavings: 80000, otherAssets: 0,
  annualIncome: 200000, raiseRate: 0.03,
  returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
  swr: 0.04, monthlySavings: 3000,
  contrib401kTrad: 15000, contrib401kRoth: 0, empMatch: 5000,
  taxTrad: 0.15, stockGainPct: 0.6,
  bufferUnlock: 1, bufferSS: 1,
  endAge: 100, ssClaimAge: 70,
  annualSpend: 72000,
  safetyMargin: 0.03, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
};
const fireAge = 54;

const baseline = api.projectFullLifecycle(inp, 72000, fireAge);
const tradFirst = api.projectFullLifecycle(inp, 72000, fireAge, true, { strategyOverride: 'trad-first' });
const tradLast  = api.projectFullLifecycle(inp, 72000, fireAge, true, { strategyOverride: 'trad-last-preserve' });
const rothLad   = api.projectFullLifecycle(inp, 72000, fireAge, true, { strategyOverride: 'roth-ladder' });

function endTotal(traj) { return Math.round(traj[traj.length-1].total); }
function atAge(traj, age) { const r = traj.find(d => d.age === age); return r ? Math.round(r.total) : null; }

console.log('=== End-of-plan total portfolio by strategy ===');
console.log('  bracket-fill-smoothed (baseline):', endTotal(baseline).toLocaleString());
console.log('  trad-first               :', endTotal(tradFirst).toLocaleString());
console.log('  trad-last-preserve       :', endTotal(tradLast).toLocaleString());
console.log('  roth-ladder              :', endTotal(rothLad).toLocaleString());

console.log('\n=== Portfolio at age 70 (mid-retirement) ===');
for (const [name, traj] of [['baseline', baseline], ['trad-first', tradFirst], ['trad-last', tradLast], ['roth-ladder', rothLad]]) {
  console.log('  ' + name.padEnd(25), atAge(traj, 70));
}

const distinct = new Set([endTotal(baseline), endTotal(tradFirst), endTotal(tradLast), endTotal(rothLad)]);
console.log('\nDistinct end-totals:', distinct.size, '(should be >= 3 for a meaningful swap)');
if (distinct.size < 3) {
  console.error('FAIL: strategies collapse to nearly the same trajectory');
  process.exit(1);
}
console.log('PASS: projectFullLifecycle strategy override produces distinct trajectories');
