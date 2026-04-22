// Diagnostic probe — extracts signedLifecycleEndBalance + isFireAgeFeasible +
// findFireAgeNumerical from FIRE-Dashboard.html and runs them with
// Roger-like defaults. Varies endAge and buffer inputs to confirm they
// actually reach the solver output.
//
// Run: node tests/diagnostic/feature-007-solver-probe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(REPO_ROOT, 'FIRE-Dashboard.html'), 'utf8');

// Extract a function from the HTML by name. Uses brace-balanced scan.
function extractFn(name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pattern.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found`);
  let start = m.index;
  // Walk forward to find the opening '{'.
  let i = HTML.indexOf('{', start);
  let depth = 1;
  i++;
  while (depth > 0 && i < HTML.length) {
    const ch = HTML[i];
    if (ch === '/' && HTML[i + 1] === '/') {
      i = HTML.indexOf('\n', i); if (i === -1) break; i++; continue;
    }
    if (ch === '/' && HTML[i + 1] === '*') {
      i = HTML.indexOf('*/', i); if (i === -1) break; i += 2; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch; i++;
      while (i < HTML.length && HTML[i] !== quote) {
        if (HTML[i] === '\\') i++;
        i++;
      }
      i++; continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return HTML.slice(start, i);
}

// Extract the functions we need.
const fns = [
  'taxOptimizedWithdrawal',
  'signedLifecycleEndBalance',
  'isFireAgeFeasible',
  'findFireAgeNumerical',
  'getRMDDivisor',
  'calcOrdinaryTax',
  'calcLTCGTax',
  'getSSAnnual',
  'getTaxBrackets',
  'getMortgageAdjustedRetirement',
  'getHealthcareDeltaAnnual',
  'getTotalCollegeCostForYear',
  'getSecondHomeAnnualCarryAtYear',
  'getSecondHomeSaleAtFire',
  'calcMortgagePayment',
  'getSelectedRelocationCost',
  'detectMFJ',
  'getMortgageInputs',
  'getSecondHomeInputs',
];

const fnCode = fns.map(n => { try { return extractFn(n); } catch (e) { return `// MISSING: ${n}`; } }).join('\n\n');

// Stub out the helpers we don't care about (healthcare / college / second
// home / SS / mortgage) so we can isolate endAge + buffer + safetyMargin
// propagation through signedLifecycleEndBalance.
const overrides = `
// --- stubs (override previously-extracted implementations) ---
function getSSAnnual(inp, claimAge, fireAge) {
  // Deterministic $40K/yr from claim age onward — does not vary with fireAge.
  return fireAge >= claimAge ? 40000 : 40000;
}
function getHealthcareDeltaAnnual(_scenario, _age) { return 0; }
function getTotalCollegeCostForYear(_inp, _yearsFromNow) { return 0; }
function getSecondHomeAnnualCarryAtYear(_h2, _y, _yrs) { return 0; }
function getSecondHomeSaleAtFire(_h2, _yrs) { return 0; }
function getSelectedRelocationCost() { return 0; }
function getMortgageAdjustedRetirement(spend, _yrs) { return { annualSpend: spend, saleProceeds: 0 }; }
function getMortgageInputs() { return null; }
function getSecondHomeInputs() { return null; }
function detectMFJ(_inp) { return true; }
`;

// Minimal DOM shim for any document.getElementById calls inside the extracted
// functions. Returns stub elements with neutral values.
global.document = {
  getElementById: (id) => {
    // Defaults for things the solver might read during retirement loop
    const defaults = {
      terminalBuffer: { value: '0' },
      exp_0: { value: '2690' },
      endAge: { value: '95' },
      rule55Enabled: { checked: false },
      rule55SeparationAge: { value: '54' },
      safetyMargin: { value: '5' },
      irmaaThreshold: { value: '212000' },
    };
    return defaults[id] || null;
  },
};
global.window = {};

// Module-scope globals the extracted code references
let fireMode = 'safe';
let mortgageEnabled = false;
let secondHomeEnabled = false;
let selectedScenario = 'us';
let ssClaimAge = 67;
let fireAgeOverride = null;
let calculatedFireAge = null;

// Eval the extracted code.
const ctx = new Function(
  'fireMode', 'mortgageEnabled', 'secondHomeEnabled', 'selectedScenario',
  'ssClaimAge', 'fireAgeOverride', 'calculatedFireAge',
  'calcRealisticSSA', 'SCENARIOS', 'scenarios',
  `
  ${fnCode}
  ${overrides}
  return {
    taxOptimizedWithdrawal: typeof taxOptimizedWithdrawal !== 'undefined' ? taxOptimizedWithdrawal : null,
    signedLifecycleEndBalance: typeof signedLifecycleEndBalance !== 'undefined' ? signedLifecycleEndBalance : null,
    isFireAgeFeasible: typeof isFireAgeFeasible !== 'undefined' ? isFireAgeFeasible : null,
    findFireAgeNumerical: typeof findFireAgeNumerical !== 'undefined' ? findFireAgeNumerical : null,
    setFireMode: (m) => { fireMode = m; },
  };
  `
);

// Stubs for transitive deps we don't care about in this probe.
function calcRealisticSSA(inp, fireAge) {
  // Deterministic SS estimate — $40K/yr from claim age onward. Don't vary
  // with fireAge so SS doesn't confound our endAge/buffer experiments.
  return { monthly: 3333, annual: 40000, pia: 40000, earnings35: [] };
}
const SCENARIOS = [{ id: 'us', name: 'US Stay', flag: '🇺🇸', relocationCost: 0 }];
const scenarios = SCENARIOS;

let api;
try {
  api = ctx(fireMode, mortgageEnabled, secondHomeEnabled, selectedScenario,
           ssClaimAge, fireAgeOverride, calculatedFireAge,
           calcRealisticSSA, SCENARIOS, scenarios);
} catch (e) {
  console.error('FAILED to load functions:', e.message);
  console.error(e.stack.slice(0, 2000));
  process.exit(1);
}

console.log('Functions loaded:',
  Object.fromEntries(Object.entries(api).map(([k, v]) => [k, typeof v])));

// Roger-like defaults — tight scenario matching user's ~FIRE-at-54 result.
// Smaller portfolio so the solver has to grind.
const baseInp = {
  ageRoger: 42,
  ageRebecca: 42,
  ageKid1: 8,
  ageKid2: 5,
  collegeKid1: 'us-private',
  collegeKid2: 'us-private',
  loanPctKid1: 0, loanPctKid2: 0, loanParentPctKid1: 100, loanParentPctKid2: 100,
  loanRate: 6.53, loanTerm: 10,
  stockGainPct: 0.6,
  annualIncome: 200000,
  raiseRate: 0.03,
  taxRate: 0.25,
  roger401kTrad: 200000, roger401kRoth: 0,
  roger401k: 200000,
  rogerStocks: 150000, rebeccaStocks: 100000,
  cashSavings: 50000, otherAssets: 0,
  returnRate: 0.05, return401k: 0.05, inflationRate: 0.03,
  swr: 0.04,
  monthlySavings: 3000,
  contrib401kTrad: 15000, contrib401kRoth: 0, contrib401k: 15000,
  taxTrad: 0.15,
  empMatch: 5000,
  ssWorkStart: 2005, ssAvgEarnings: 100000, ssRebeccaOwn: 80000,
  bufferUnlock: 2, bufferSS: 3,
  endAge: 95,
  ssClaimAge: 67,
  safetyMargin: 0.05,
  rule55: { enabled: false, separationAge: 54 },
  irmaaThreshold: 212000,
};

function run(label, overrides) {
  const inp = { ...baseInp, ...overrides };
  if (!api.findFireAgeNumerical) {
    console.log(`${label}: findFireAgeNumerical missing`);
    return;
  }
  const annualSpend = 72000;
  // Sample signedLifecycleEndBalance at fixed FIRE age 54
  let sim;
  try {
    sim = api.signedLifecycleEndBalance(inp, annualSpend, 54);
  } catch (e) {
    console.log(`${label}: signedLifecycleEndBalance THREW:`, e.message);
    return;
  }
  // Run solver
  let solver;
  try {
    solver = api.findFireAgeNumerical(inp, annualSpend, 'safe');
  } catch (e) {
    console.log(`${label}: findFireAgeNumerical THREW:`, e.message);
    return;
  }
  console.log(`${label}:`);
  console.log(`  sim@54: endBalance=${Math.round(sim.endBalance).toLocaleString()}, balanceAtUnlock=${Math.round(sim.balanceAtUnlock).toLocaleString()}, balanceAtSS=${Math.round(sim.balanceAtSS).toLocaleString()}`);
  console.log(`  solver safe: years=${solver.years}, endBalance=${Math.round(solver.endBalance).toLocaleString()}, feasible=${solver.feasible}`);
  api.setFireMode('dieWithZero');
  const solverDWZ = api.findFireAgeNumerical(inp, annualSpend, 'dieWithZero');
  console.log(`  solver DWZ:  years=${solverDWZ.years}, endBalance=${Math.round(solverDWZ.endBalance).toLocaleString()}, feasible=${solverDWZ.feasible}`);
  api.setFireMode('safe');
}

console.log('\n=== Baseline (endAge=95, buf=2/3) ===');
run('base', {});
console.log('\n=== endAge=100 (5 more retirement years) ===');
run('endAge=100', { endAge: 100 });
console.log('\n=== endAge=85 (10 fewer retirement years) ===');
run('endAge=85', { endAge: 85 });
console.log('\n=== buffer 0/0 (no Safe cushion) ===');
run('buf=0/0', { bufferUnlock: 0, bufferSS: 0 });
console.log('\n=== buffer 5/5 (max Safe cushion) ===');
run('buf=5/5', { bufferUnlock: 5, bufferSS: 5 });
console.log('\n=== buffer 10/10 (very aggressive) ===');
run('buf=10/10', { bufferUnlock: 10, bufferSS: 10 });
console.log('\n=== Rule of 55 enabled ===');
run('rule55', { rule55: { enabled: true, separationAge: 55 } });
console.log('\n=== Bigger Trad + tighter (endAge=100, spend=$90K) ===');
{
  const inp = { ...baseInp, endAge: 100, roger401kTrad: 500000 };
  const spend = 90000;
  const sim = api.signedLifecycleEndBalance(inp, spend, 55);
  const safeS = api.findFireAgeNumerical(inp, spend, 'safe');
  api.setFireMode('dieWithZero');
  const dwzS = api.findFireAgeNumerical(inp, spend, 'dieWithZero');
  api.setFireMode('safe');
  console.log('big-trad:');
  console.log(`  sim@55 endBalance=${Math.round(sim.endBalance).toLocaleString()}, atUnlock=${Math.round(sim.balanceAtUnlock).toLocaleString()}, atSS=${Math.round(sim.balanceAtSS).toLocaleString()}`);
  console.log(`  solver safe: years=${safeS.years}, endBalance=${Math.round(safeS.endBalance).toLocaleString()}`);
  console.log(`  solver DWZ:  years=${dwzS.years}, endBalance=${Math.round(dwzS.endBalance).toLocaleString()}`);

  // Now same, with buf 10/10
  const inp2 = { ...inp, bufferUnlock: 10, bufferSS: 10 };
  const safeS2 = api.findFireAgeNumerical(inp2, spend, 'safe');
  console.log(`  solver safe (buf 10/10): years=${safeS2.years}, endBalance=${Math.round(safeS2.endBalance).toLocaleString()}`);
}
