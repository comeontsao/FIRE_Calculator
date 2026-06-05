// Quick diagnostic: report age-100 totals across all 3 modes × 2 objectives
// after the feature-032 hotfix lands. Verifies the user's exact fixture.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'), 'utf8');
const { accumulateToFire } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`not found: ${name}`);
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

const strategiesBlock = HTML.slice(
  HTML.indexOf('// ==================== Feature 008 — Strategy Policies ===================='),
  HTML.indexOf('// Feature 007 — each strategy.push row includes')
);
const fns = ['taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax','getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement','getHealthcareDeltaAnnual','getTotalCollegeCostForYear','calcMortgagePayment','detectMFJ','getMortgageInputs'];
const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
const overrides = `
function getSSAnnual() { return 0; }
function getHealthcareDeltaAnnual() { return 0; }
function getTotalCollegeCostForYear() { return 0; }
function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function detectMFJ() { return true; }
function resolveAccumulationOptions(inp, fireAge) { return { mortgageEnabled: false, secondHomeEnabled: false, mortgageStrategyOverride: 'invest-keep-paying' }; }
`;
const _doc = { getElementById: (id) => { const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'}, rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'}, safetyMargin:{value:'5'}, irmaaThreshold:{value:'212000'}, twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'} }; return d[id] || null; }};
const ctx = new Function('mortgageEnabled','document','window','accumulateToFire', `${fnCode}\n${overrides}\n${strategiesBlock}\nreturn { scoreAndRank, rankByObjective, getStrategies };`);
const api = ctx(false, _doc, {}, accumulateToFire);

const INP = {
  agePerson1:43, agePerson2:43, ageRoger:43,
  person1_401kTrad:200000, person1_401kRoth:50000, person2_401kTrad:100000, person2_401kRoth:30000,
  person1Stocks:300000, person2Stocks:100000,
  cashSavings:60000, otherAssets:0,
  annualIncome:250000, raiseRate:0.03, returnRate:0.07, return401k:0.07, inflationRate:0.03,
  swr:0.04, monthlySavings:3000,
  contrib401kTrad:20000, contrib401kRoth:5000, empMatch:6000,
  taxTrad:0.15, stockGainPct:0.6, bufferUnlock:1, bufferSS:1,
  endAge:100, ssClaimAge:70, annualSpend:90000,
  safetyMargin:0.05, rule55:{enabled:false,separationAge:54}, irmaaThreshold:212000,
  rogerRothIra:0, rebeccaRothIra:59021, rogerRothIraContrib:7000, rebeccaRothIraContrib:7000,
  rothIraReal:59021, rothIraContribReal:14000,
};

for (const mode of ['safe','exact','dieWithZero']) {
  for (const obj of ['retire-sooner-pay-less-tax','leave-more-behind']) {
    const r = api.scoreAndRank(INP, 55, mode, obj);
    const w = r.rows.find(x => x.strategyId === r.winnerId);
    const final = w.perYearRows[w.perYearRows.length-1];
    console.log(
      String(mode).padEnd(12),
      String(obj).padEnd(30),
      'winner=', String(r.winnerId).padEnd(28),
      'totalEnd=$' + Math.round(final.totalEnd).toLocaleString().padStart(10),
      ' pRothIraEnd=$' + Math.round(final.pRothIraEnd).toLocaleString().padStart(10)
    );
  }
}
