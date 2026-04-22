// Smoke-test scoreAndRank against the RR HTML (not Generic) to catch any
// RR-specific breakage like the detectMFJ ReferenceError.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'), 'utf8');

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found`);
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

function extractBlock(startMarker, endMarker) {
  const s = HTML.indexOf(startMarker);
  if (s < 0) throw new Error(`start marker not found: ${startMarker}`);
  const e = HTML.indexOf(endMarker, s);
  if (e < 0) throw new Error(`end marker not found: ${endMarker}`);
  return HTML.slice(s, e);
}

const strategiesBlock = extractBlock(
  '// ==================== Feature 008 — Strategy Policies ====================',
  '// Feature 007 — each strategy.push row includes'
);

const fns = [
  'taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax',
  'getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual','getTotalCollegeCostForYear',
  'calcMortgagePayment','getMortgageInputs',
];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');

// Mirror the RR environment: NO detectMFJ function.
const overrides = `
function getSSAnnual() { return 48000; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
// NOTE: detectMFJ INTENTIONALLY NOT DEFINED — RR doesn't have it.
`;
global.document = { getElementById: (id) => {
  const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
    rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
    safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
    twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
  return d[id] || null;
}};
const _win = {};
global.window = _win;

let mortgageEnabled = false;
const ctx = new Function('mortgageEnabled',
  `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
const api = ctx(mortgageEnabled);

// RR-flavored inp: uses ageRoger / ageRebecca / rogerStocks etc.
const inp = {
  ageRoger: 42, ageRebecca: 42,
  roger401kTrad: 150000, roger401kRoth: 0,
  rogerStocks: 250000, rebeccaStocks: 100000,
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

try {
  const r = api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
  console.log('✓ scoreAndRank succeeded on RR inp');
  console.log('  winner:', r.winnerId);
  console.log('  rows:', r.rows.length);
} catch (e) {
  console.error('✗ scoreAndRank threw on RR inp:', e.message);
  console.error(e.stack.slice(0, 1500));
  process.exit(1);
}
