// ==================== TEST SUITE: shortfall visibility (US1) ====================
// Feature 015 Wave A — Per-row hasShortfall field on projectFullLifecycle output.
// See: specs/015-calc-debt-cleanup/contracts/shortfall-visualization.contract.md §1
//      specs/015-calc-debt-cleanup/spec.md US1 acceptance scenarios
//
// Harness extracts projectFullLifecycle (and supporting helpers) from the
// Generic HTML using the brace-balanced extractor pattern from strategies.test.js.
// =================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const { SCENARIOS } = require(path.resolve(REPO_ROOT, 'tests', 'fixtures', 'feature-015', 'scenarios.js'));

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

function buildSimulator() {
  // Pull projectFullLifecycle and every helper it directly calls.
  const fns = [
    'projectFullLifecycle',
    'taxOptimizedWithdrawal','getRMDDivisor','calcOrdinaryTax','calcLTCGTax',
    'getSSAnnual','getTaxBrackets','getMortgageAdjustedRetirement',
    'getHealthcareDeltaAnnual','getTotalCollegeCostForYear',
    'calcMortgagePayment','detectMFJ','getMortgageInputs',
    'getSecondHomeInputs','getSecondHomeAnnualCarryAtYear','getSecondHomeSaleAtFire',
    'getSelectedRelocationCost',
  ];
  const fnCode = fns.map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');
  // Stubs that replace DOM-dependent helpers with deterministic noops.
  const overrides = `
    function getSSAnnual() { return 48000; }
    function getHealthcareDeltaAnnual() { return 0; }
    function getTotalCollegeCostForYear() { return 0; }
    function getMortgageAdjustedRetirement(s) { return { annualSpend: s, saleProceeds: 0 }; }
    function getMortgageInputs() { return null; }
    function getSecondHomeInputs() { return null; }
    function getSecondHomeAnnualCarryAtYear() { return 0; }
    function getSecondHomeSaleAtFire() { return 0; }
    function getSelectedRelocationCost() { return 0; }
    function detectMFJ() { return true; }
    function getStrategies() { return []; }
    function calcPerChildAllowance() { return 0; }
    function calcRealisticSSA() { return 48000; }
  `;
  const _doc = { getElementById: (id) => {
    const d = { terminalBuffer:{value:'0'}, exp_0:{value:'2690'}, endAge:{value:'100'},
      rule55Enabled:{checked:false}, rule55SeparationAge:{value:'54'},
      safetyMargin:{value:'3'}, irmaaThreshold:{value:'212000'},
      twStdDed:{value:'30000'}, twTop12:{value:'94300'}, twTop22:{value:'201050'}};
    return d[id] || null;
  }};
  const _win = {};
  const ctx = new Function(
    'mortgageEnabled','secondHomeEnabled','document','window','selectedScenario','yearsToFIREcache','perChildAllowanceThisYear','childrenList','collegeRules',
    `${fnCode}\n${overrides}\nreturn { projectFullLifecycle };`
  );
  return ctx(false, false, _doc, _win, 'us', 0, 0, [], { fourYearCost: 0 });
}

// Realistic per-scenario FIRE ages chosen so retirement is feasible. The
// `yearsToFIREcache` global isn't usable in this isolated test context, so we
// pass overrideFireAge explicitly. These ages were verified by hand to leave
// the portfolio above zero through endAge for each scenario.
const FEASIBLE_FIRE_AGES = {
  youngSaver: 60,     // 28 years to grow $150K + $4k/mo savings
  midCareer: 60,      // 15 years to grow $750K + $4.5k/mo
  preRetirement: 65,  // 7 years to grow $1.4M
};

test('US1: every per-year row has hasShortfall: boolean field', () => {
  const sim = buildSimulator();
  const data = sim.projectFullLifecycle(
    SCENARIOS.youngSaver.inp, SCENARIOS.youngSaver.inp.annualSpend,
    FEASIBLE_FIRE_AGES.youngSaver, true);
  assert.ok(Array.isArray(data) && data.length > 0, 'simulator returned no rows');
  for (const row of data) {
    assert.strictEqual(typeof row.hasShortfall, 'boolean',
      `age ${row.age}: hasShortfall must be boolean, got ${typeof row.hasShortfall} (${row.hasShortfall})`);
  }
});

test('US1: feasible scenario produces zero shortfall years (false-positive guard FR-005)', () => {
  const sim = buildSimulator();
  for (const s of [SCENARIOS.youngSaver, SCENARIOS.midCareer, SCENARIOS.preRetirement]) {
    const fa = FEASIBLE_FIRE_AGES[s.name];
    const data = sim.projectFullLifecycle(s.inp, s.inp.annualSpend, fa, true);
    const shortfallYears = data.filter(r => r.hasShortfall);
    assert.strictEqual(shortfallYears.length, 0,
      `${s.name} (FIRE ${fa}): feasible scenario must produce zero shortfall years; got ${shortfallYears.length} ` +
      `(ages: ${shortfallYears.map(r => r.age).join(', ')})`);
  }
});

test('US1: thetaZeroShortfall scenario fires hasShortfall on at least 1 retirement year', () => {
  const sim = buildSimulator();
  const f = SCENARIOS.thetaZeroShortfall;
  // Force immediate FIRE so the simulator enters retirement on year 0 with the
  // tight portfolio. This matches the user's audit case.
  const data = sim.projectFullLifecycle(f.inp, f.inp.annualSpend, f.fireAge, true);
  const shortfallYears = data.filter(r => r.hasShortfall);
  assert.ok(shortfallYears.length >= f.expected.minShortfallYearCount,
    `${f.name}: expected at least ${f.expected.minShortfallYearCount} shortfall year(s); got ${shortfallYears.length}`);
});

test('US1: accumulation-phase rows always have hasShortfall === false', () => {
  const sim = buildSimulator();
  const data = sim.projectFullLifecycle(
    SCENARIOS.youngSaver.inp, SCENARIOS.youngSaver.inp.annualSpend,
    FEASIBLE_FIRE_AGES.youngSaver, true);
  const accumRows = data.filter(r => r.phase === 'accumulation');
  assert.ok(accumRows.length > 0, 'expected at least 1 accumulation row');
  for (const row of accumRows) {
    assert.strictEqual(row.hasShortfall, false,
      `age ${row.age} (accumulation): hasShortfall must be false`);
  }
});

test('US1: hasShortfall serializes through JSON.stringify for Copy Debug payload (FR-004)', () => {
  const sim = buildSimulator();
  const data = sim.projectFullLifecycle(SCENARIOS.thetaZeroShortfall.inp,
    SCENARIOS.thetaZeroShortfall.inp.annualSpend, SCENARIOS.thetaZeroShortfall.fireAge, true);
  // Round-trip through JSON to mimic Copy Debug serialization
  const round = JSON.parse(JSON.stringify(data));
  for (let i = 0; i < data.length; i++) {
    assert.strictEqual(round[i].hasShortfall, data[i].hasShortfall,
      `JSON round-trip lost hasShortfall on row ${i}`);
  }
});
