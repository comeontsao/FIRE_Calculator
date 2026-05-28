// tests/diagnostic/probe-displaybug-32a.mjs
//
// Confirms the post-fix state for the three displaybug-32a bugs:
//   Bug A  — audit composition populates from raw RR/Generic input bag
//   Bug B  — copy-debug fireMode reads window.fireMode (not heuristic)
//   Bug C  — signedLifecycleEndBalance threads pRothIra in strategy dispatch
//
// Pure source-text + module-level probes; no DOM harness needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const { assembleAuditSnapshot } = require(path.join(REPO_ROOT, 'calc', 'calcAudit.js'));

const stockChart = (() => {
  const rows = [];
  for (let age = 53; age <= 100; age += 1) {
    rows.push({ age, total: 700000, p401k: 1, pStocks: 1, pCash: 1, pRoth: 1, ssIncome: 0, withdrawals: 0, syntheticConversion: 0, phase: 'phase1-taxable-only' });
  }
  return rows;
})();

const baseOpts = {
  fireAge: 53,
  fireMode: 'safe',
  annualSpend: 90000,
  rawAnnualSpend: 90000,
  effectiveSpendByYear: [],
  lastStrategyResults: null,
  fireAgeCandidates: [],
  projectFullLifecycle: () => stockChart,
  signedLifecycleEndBalance: () => ({ endBalance: 700000 }),
  isFireAgeFeasible: () => true,
  getActiveChartStrategyOptions: () => undefined,
  t: (k) => k,
  doc: null,
};

// Bug A — RR-shape raw bag (matches the user's actual fixture).
const userInputs = {
  ageRoger: 43, ageRebecca: 43, endAge: 100,
  bufferUnlock: 1, bufferSS: 1, terminalBuffer: 1,
  safetyMargin: 0.05, inflationRate: 0.04,
  rogerStocks: 240000, rebeccaStocks: 250000,
  cashSavings: 80000, otherAssets: 0,
  roger401kTrad: 29298, roger401kRoth: 66564,
  rogerRothIra: 0, rebeccaRothIra: 59021,
  cashSweepEnabled: true, cashSweepThreshold: 10000,
};

const snap = assembleAuditSnapshot({ ...baseOpts, inputs: userInputs });
const c = snap.resolvedInputs.composition;
console.log('Bug A — audit composition (user inputs, RR raw bag):');
console.log(`  accessibleStocks: ${c.accessibleStocks}  (expected 490000 = 240000 + 250000)`);
console.log(`  cash:             ${c.cash}            (expected 80000)`);
console.log(`  locked401kTrad:   ${c.locked401kTrad}   (expected 29298)`);
console.log(`  locked401kRoth:   ${c.locked401kRoth}   (expected 66564)`);
console.log(`  lockedRothIra:    ${c.lockedRothIra}    (expected 59021)`);

// Bug C — confirm pRothIra appears in BOTH signedLifecycleEndBalance dispatch
// sites across BOTH HTML files.
console.log('\nBug C — pRothIra threading in signedLifecycleEndBalance strategy dispatch:');
for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
  const fnStart = src.indexOf('function signedLifecycleEndBalance(');
  let i = src.indexOf('{', fnStart) + 1;
  let depth = 1;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  const body = src.slice(fnStart, i);
  const idx = body.indexOf('computePerYearMix(');
  const poolsIdx = body.indexOf('pools:', idx);
  const lit = body.slice(body.indexOf('{', poolsIdx), body.indexOf('}', poolsIdx) + 1);
  console.log(`  ${file}: pools = ${lit}  → pRothIra ${lit.includes('pRothIra') ? 'PRESENT' : 'MISSING'}`);
}

// Bug B — confirm copy-debug snapshot fireMode reads window.fireMode.
console.log('\nBug B — copy-debug fireMode resolver:');
for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
  const cpyIdx = src.indexOf('function copyDebugInfo');
  const tail = src.slice(cpyIdx, cpyIdx + 3000);
  const usesWindow = /fireMode\s*=[\s\S]{0,200}window\.fireMode/.test(tail);
  const usesHeuristic = /pickActiveBtn\s*\(/.test(tail);
  console.log(`  ${file}: window.fireMode=${usesWindow ? 'YES' : 'NO'}  legacy-heuristic=${usesHeuristic ? 'YES' : 'NO'}`);
}
