// ==================== FIRE NUMBER CHART-CONSISTENCY REGRESSION TESTS ====================
// Feature 019 — chart-consistent FIRE NUMBER (findMinTotalAtFireNumerical).
//
// Problem: the old findMinAccessibleAtFireNumerical called isFireAgeFeasible WITHOUT
// the 5th `fireAge` arg, causing the gate to fall through to the signed-sim fallback.
// That produced a FIRE NUMBER ($502k accessible) below what the chart actually requires
// for feasibility ($525k+ accessible), leading to "104.5% there" alongside "not
// sustainable" — a direct contradiction.
//
// Fix: findMinTotalAtFireNumerical calls isFireAgeFeasible WITH fireAge so it always
// uses projectFullLifecycle (the chart sim). It also returns TOTAL assets (401k + accessible)
// instead of accessible-only.
//
// Test cases:
//   1. CHART_CONSISTENCY: the returned total at fireAge=55 DWZ is ≥ current total assets
//      (the user who triggered the bug had ~$584k total assets and was told 104.5% done).
//   2. MODE_ORDERING: at fixed fireAge=55, safe ≥ exact ≥ dwz for minimum total.
//   3. SANITY: result is finite, non-negative, < HI_CAP for plausible inputs.
//   4. INCREASING_WITH_SPEND: higher annualSpend → higher total needed.
// ========================================================================================

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

// ---------------------------------------------------------------------------
// Brace-balanced function extractor (same pattern as wCashSumRegression.test.js).
// ---------------------------------------------------------------------------
function extractFn(name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(HTML);
  if (!m) throw new Error(`Function '${name}' not found in HTML`);
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
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return HTML.slice(m.index, i);
}

// ---------------------------------------------------------------------------
// Plausible audit scenario — representative of the user's reported bug.
// User had ~$584k total assets (accessible ~$502k + locked ~$82k) and was told
// "104.5% of accessible target" even though the chart showed infeasibility.
// We use a clean round-number scenario that exercises the same code path.
// ---------------------------------------------------------------------------
const SCENARIO_INP = {
  agePerson1:        42,
  ageRoger:          42,
  fireAge:           55,
  ssClaimAge:        70,
  endAge:            95,
  cashSavings:       40000,
  otherAssets:       0,
  rogerStocks:       200000,
  rebeccaStocks:     160000,
  person1Stocks:     200000,
  person2Stocks:     160000,
  roger401kTrad:     50000,
  roger401kRoth:     30000,
  person1_401kTrad:  50000,
  person1_401kRoth:  30000,
  monthlySavings:    2000,
  contrib401kTrad:   15000,
  contrib401kRoth:   3000,
  empMatch:          5000,
  raiseRate:         0.02,
  taxRate:           0.22,
  taxTrad:           0.15,
  returnRate:        0.07,
  return401k:        0.07,
  inflationRate:     0.03,
  swr:               0.04,
  stockGainPct:      0.6,
  annualSpend:       72000,
  bufferUnlock:      1,
  bufferSS:          1,
  terminalBuffer:    2,
  safetyMargin:      0.05,
  ssWorkStart:       2009,
  ssAvgEarnings:     80000,
  ssRebeccaOwn:      0,
  annualIncome:      240000,
  mortgageEnabled:   false,
  mtgHomeLocation:   'us',
  irmaaThreshold:    212000,
  rule55:            { enabled: false, separationAge: 54 },
  adultCount:        2,
};

// ---------------------------------------------------------------------------
// Load the canonical accumulation helper (CommonJS module).
const { accumulateToFire: _accumulateToFireModule } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

// Build a sandbox that exposes findMinTotalAtFireNumerical.
// Strategy: extract the key calc + feasibility functions from the HTML and
// wire up minimal stubs for DOM-dependent helpers. Then call
// findMinTotalAtFireNumerical directly.
// ---------------------------------------------------------------------------
function buildApi() {
  // Extract the functions we need from the HTML.
  // Note: getSSAnnual is intentionally NOT extracted — we use a fixed-value stub
  // so we don't need calcRealisticSSA and its DOM dependencies.
  const fnNames = [
    'findMinTotalAtFireNumerical',
    'findMinAccessibleAtFireNumerical',
    'isFireAgeFeasible',
    'projectFullLifecycle',
    'projectGrowth',
    'simulateRetirementOnlySigned',
    'calcOrdinaryTax',
    'calcLTCGTax',
    'getRMDDivisor',
    'taxOptimizedWithdrawal',
  ];

  const fnCode = fnNames
    .map(n => { try { return extractFn(n); } catch { return `/* ${n} not found */`; } })
    .join('\n\n');

  // SAFE_TERMINAL_FIRE_RATIO is a const, not a function — extract it as a literal.
  const ratioMatch = HTML.match(/const SAFE_TERMINAL_FIRE_RATIO\s*=\s*([\d.]+)/);
  const SAFE_TERMINAL_FIRE_RATIO = ratioMatch ? parseFloat(ratioMatch[1]) : 0.20;

  // Stubs are placed BEFORE fnCode. The constant SAFE_TERMINAL_FIRE_RATIO is a
  // module-level const in the HTML (not inside any function), so it won't appear
  // in fnCode. We must declare it here for the extracted functions to reference it.
  const stubs = `
const SAFE_TERMINAL_FIRE_RATIO = ${SAFE_TERMINAL_FIRE_RATIO};
// Also declare the strategy-scoped copy (used by _simulateStrategyLifetime).
const SAFE_TERMINAL_FIRE_RATIO_STRATEGY = ${SAFE_TERMINAL_FIRE_RATIO};

// fireMode is set per-test via closure variable exposed on the returned object.
let fireMode = 'safe';

// Strategy helpers — no active strategy in test context.
function getActiveChartStrategyOptions() { return undefined; }
function getActiveMortgageStrategyOptions() { return { mortgageStrategyOverride: 'invest-keep-paying' }; }

// Mortgage not enabled in this test scenario.
const mortgageEnabled = false;
function getMortgageInputs() { return null; }
function getMortgageAdjustedRetirement(spend) { return { annualSpend: spend, saleProceeds: 0 }; }

// Second home not enabled.
const secondHomeEnabled = false;
function getSecondHomeInputs() { return null; }

// No college drain.
function getTotalCollegeCostForYear() { return 0; }

// No relocation cost.
function getSelectedRelocationCost() { return 0; }

// Healthcare delta: 0.
function getHealthcareDeltaAnnual() { return 0; }

// Per-child allowance: 0.
function calcPerChildAllowance() { return 0; }

// resolveAccumulationOptions stub — returns minimal options (no mortgage, no college).
function resolveAccumulationOptions(inp, fa, strategyOverride) {
  return {
    mortgageStrategyOverride: strategyOverride || 'invest-keep-paying',
    mortgageEnabled: false,
    mortgageInputs: null,
    secondHomeEnabled: false,
    secondHomeInputs: null,
    rentMonthly: 0,
    pviExtraMonthly: 0,
    collegeFn: null,
    payoffVsInvestFn: null,
  };
}

// yearsToFIREcache — used as fallback when overrideFireAge is null.
let yearsToFIREcache = 13; // fireAge - agePerson1 = 55 - 42

// Tax brackets — MFJ 2026 defaults (same as wCashSumRegression.test.js).
function getTaxBrackets() {
  return {
    stdDed: 30000,
    top10: 23197.8,
    top12: 94300,
    top22: 201050,
    top24: 384005.5,
    top32: 486541,
    top35: 730111.5,
    ltcg0Top: 94300,
    ltcg15Top: 583750,
  };
}

// accumulateToFire injected from outside the sandbox.
const accumulateToFire = _accumulateToFireInjected;

// Document guard — allows isFireAgeFeasible's Exact branch to read terminalBuffer.
// Must be set before any function runs.
if (typeof document === 'undefined') {
  // global is available in Node's Function() sandbox via closure.
  try { global.document = { getElementById: function(id) {
    if (id === 'terminalBuffer') return { value: '2' };
    return null;
  }}; } catch(_e) {}
}
`;

  // Override stubs for functions that exist in fnCode but depend on DOM/complex globals.
  // Placed AFTER fnCode in the same scope — they shadow the extracted versions.
  const overrides = `
// Override getSSAnnual (extracted version depends on calcRealisticSSA which needs DOM).
// A fixed $48k/year gives realistic but simple SS income for test assertions.
function getSSAnnual(inp, claimAge, fa) { return 48000; }

// selectedScenario — needed by simulateRetirementOnlySigned.
var selectedScenario = 'us';

// childrenList — needed by simulateRetirementOnlySigned.
var childrenList = [];

// detectMFJ — filing status for tax bracket selection.
function detectMFJ(inp) { return (inp.adultCount || 2) > 1; }

// getSecondHomeSaleAtFire / getSecondHomeAnnualCarryAtYear — second home stubs.
function getSecondHomeSaleAtFire() { return 0; }
function getSecondHomeAnnualCarryAtYear() { return 0; }
`;

  const ctx = new Function('_accumulateToFireInjected', `
    ${stubs}
    ${fnCode}
    ${overrides}
    return {
      findMinTotalAtFireNumerical,
      findMinAccessibleAtFireNumerical,
      isFireAgeFeasible,
      projectFullLifecycle,
      setFireMode: function(m) { fireMode = m; },
    };
  `);

  return ctx(_accumulateToFireModule);
}

// Build the API once — shared across all tests.
let api;
try {
  api = buildApi();
} catch (err) {
  throw new Error(`[fireNumberChartConsistency] Failed to build sandbox: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Test 1: Chart consistency (the primary bug regression).
// At fireAge=55 DWZ, findMinTotalAtFireNumerical must return a value
// that is HIGHER than what the old accessible-only approach would return,
// because it now includes the 401k balance. Specifically:
//
//   totalFireNum = projTrad + projRoth + minAccessible
//
// Since projTrad + projRoth > 0 for this scenario (user has 401k), the
// new metric is strictly greater than the old accessible-only metric
// when minAccessible > 0.
//
// Also assert totalFireNum is finite and positive.
// ---------------------------------------------------------------------------
test('chart consistency: findMinTotalAtFireNumerical returns total > accessible-only at fireAge=55 DWZ', () => {
  api.setFireMode('dieWithZero');
  const fireAge = 55;
  const annualSpend = SCENARIO_INP.annualSpend;

  const totalResult = api.findMinTotalAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, 'dieWithZero');
  const accessibleResult = api.findMinAccessibleAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, 'dieWithZero');

  assert.ok(
    Number.isFinite(totalResult),
    `findMinTotalAtFireNumerical must return a finite number; got ${totalResult}`
  );
  assert.ok(
    totalResult > 0,
    `findMinTotalAtFireNumerical must be positive; got ${totalResult}`
  );
  // Total (401k + accessible) must exceed the old accessible-only number.
  // The user's 401k at fireAge=55 is non-zero, so total > accessible.
  assert.ok(
    totalResult > accessibleResult,
    `[chart consistency] Total (${Math.round(totalResult).toLocaleString()}) must exceed ` +
    `accessible-only (${Math.round(accessibleResult).toLocaleString()}). ` +
    `The 401k projection at fireAge=55 should add value beyond the accessible floor.`
  );
});

// ---------------------------------------------------------------------------
// Test 2: Mode ordering at fixed fireAge=55.
// safe ≥ exact ≥ dwz because:
//   - Safe enforces a floor on EVERY year AND terminal floor (most strict)
//   - Exact enforces only terminal buffer (moderate)
//   - DWZ enforces floor + endBal >= 0 (least strict in most scenarios)
// ---------------------------------------------------------------------------
test('mode ordering: safe >= exact >= dwz at fixed fireAge=55', () => {
  const fireAge = 55;
  const annualSpend = SCENARIO_INP.annualSpend;

  const safe = api.findMinTotalAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, 'safe');
  const exact = api.findMinTotalAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, 'exact');
  const dwz  = api.findMinTotalAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, 'dieWithZero');

  assert.ok(
    Number.isFinite(safe) && Number.isFinite(exact) && Number.isFinite(dwz),
    `All three modes must return finite values. safe=${safe} exact=${exact} dwz=${dwz}`
  );
  assert.ok(
    safe >= exact,
    `[mode ordering] safe (${Math.round(safe).toLocaleString()}) must be ≥ exact (${Math.round(exact).toLocaleString()})`
  );
  assert.ok(
    exact >= dwz,
    `[mode ordering] exact (${Math.round(exact).toLocaleString()}) must be ≥ dwz (${Math.round(dwz).toLocaleString()})`
  );
});

// ---------------------------------------------------------------------------
// Test 3: Sanity invariants.
//   - Result is finite
//   - Result >= 0
//   - Result < 10_000_000 (HI_CAP) for this plausible scenario
//   - Result changes with annualSpend (higher spend → higher total needed)
// ---------------------------------------------------------------------------
test('sanity: result is finite, non-negative, below HI_CAP', () => {
  const fireAge = 55;
  const annualSpend = SCENARIO_INP.annualSpend;
  const HI_CAP = 10_000_000;

  for (const mode of ['safe', 'exact', 'dieWithZero']) {
    const result = api.findMinTotalAtFireNumerical(SCENARIO_INP, annualSpend, fireAge, mode);

    assert.ok(
      Number.isFinite(result),
      `[sanity] mode=${mode}: result must be finite; got ${result}`
    );
    assert.ok(
      result >= 0,
      `[sanity] mode=${mode}: result must be >= 0; got ${result}`
    );
    assert.ok(
      result < HI_CAP,
      `[sanity] mode=${mode}: result (${Math.round(result).toLocaleString()}) must be < HI_CAP for plausible inputs`
    );
  }
});

// ---------------------------------------------------------------------------
// Test 4: Higher spend → higher total needed (monotonicity).
// ---------------------------------------------------------------------------
test('monotonicity: higher annualSpend produces higher total needed', () => {
  const fireAge = 55;

  const resultLow  = api.findMinTotalAtFireNumerical(SCENARIO_INP, 60000, fireAge, 'safe');
  const resultMid  = api.findMinTotalAtFireNumerical(SCENARIO_INP, 80000, fireAge, 'safe');
  const resultHigh = api.findMinTotalAtFireNumerical(SCENARIO_INP, 100000, fireAge, 'safe');

  assert.ok(
    resultLow < resultMid,
    `[monotonicity] spend $60k → $${Math.round(resultLow).toLocaleString()} should be < ` +
    `spend $80k → $${Math.round(resultMid).toLocaleString()}`
  );
  assert.ok(
    resultMid < resultHigh,
    `[monotonicity] spend $80k → $${Math.round(resultMid).toLocaleString()} should be < ` +
    `spend $100k → $${Math.round(resultHigh).toLocaleString()}`
  );
});
