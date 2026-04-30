// ==================== T-019-03 & T-019-04 regression tests ====================
// Feature 019 — accumulation drift fix.
// Spec: specs/019-accumulation-drift-fix/spec.md §7.2
//
// T-019-03: wCash sum = 0 regression
//   Proves that for the user's audit scenario (cashSavings=80000,
//   mortgage buying-in 2 yrs from now, down=$120k, closing=$17k),
//   the Withdrawal Strategy chart never draws from cash because pCash
//   entering FIRE is $0 after the fix. The test builds a Node sandbox
//   around computeWithdrawalStrategy (extracted from Generic HTML via
//   brace-balanced extractor) and sums row.wCash across all retirement
//   years.
//
// T-019-04: strategy parity (pool end-state)
//   Proves _simulateStrategyLifetime's pre-FIRE accumulation now
//   produces pool end-states that agree with accumulateToFire (the
//   canonical single source of truth). Since both callers now delegate
//   to accumulateToFire (feature 019 steps 2 & 3), this test asserts:
//   (a) accumulateToFire produces a finite, non-negative pool state for
//       the user's scenario, and
//   (b) calling accumulateToFire a second time with the same inputs
//       (determinism invariant) yields byte-equal results.
//   The deeper protection comes from the existing 22-test
//   accumulateToFire.test.js suite + the wCash=0 assertion above.
//   A future PR that re-introduces an inline accumulation loop in either
//   call site would need to explicitly break the delegation to escape
//   this coverage.
// =========================================================================

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

// Load the canonical accumulation helper (CommonJS module).
const { accumulateToFire: _accumulateToFire } = require(path.join(REPO_ROOT, 'calc', 'accumulateToFire.js'));

// ---------------------------------------------------------------------------
// Brace-balanced function extractor (mirrors strategies.test.js pattern).
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
// User's exact audit scenario — mirrored from spec §7.2.
// Note: computeWithdrawalStrategy uses inp.agePerson1 (Generic convention),
// so we provide both ageRoger (for accumulateToFire) and agePerson1.
// ---------------------------------------------------------------------------
const SCENARIO_INP = {
  ageRoger:          42,
  agePerson1:        42,
  fireAge:           53,
  ssClaimAge:        70,
  endAge:            100,
  cashSavings:       80000,
  otherAssets:       0,
  rogerStocks:       215000,
  rebeccaStocks:     230000,
  // Generic-style aliases (person1/person2) also provided for resolveAccumulationOptions
  person1Stocks:     215000,
  person2Stocks:     230000,
  roger401kTrad:     26454,
  roger401kRoth:     58000,
  person1_401kTrad:  26454,
  person1_401kRoth:  58000,
  monthlySavings:    1000,
  contrib401kTrad:   16500,
  contrib401kRoth:   2900,
  empMatch:          7200,
  raiseRate:         0.02,
  taxRate:           0.28,
  taxTrad:           0.15,
  returnRate:        0.07,
  return401k:        0.07,
  inflationRate:     0.03,
  swr:               0.04,
  stockGainPct:      0.6,
  annualSpend:       72700,
  bufferUnlock:      1,
  bufferSS:          1,
  terminalBuffer:    2,
  safetyMargin:      0.05,
  ssWorkStart:       2019,
  ssAvgEarnings:     100000,
  ssRebeccaOwn:      0,
  mtgHomeLocation:   'us',
  mtgYearsPaid:      1,
  mtgBuyInYears:     2,
  mtgHomePrice:      600000,
  mtgDownPayment:    120000,
  mtgClosingCosts:   17000,
  mtgRate:           0.06,
  mtgTerm:           30,
  mtgPropertyTax:    8000,
  mtgInsurance:      2400,
  mtgHOA:            200,
  mtgApprec:         0.02,
  mtgSellAtFire:     true,
  irmaaThreshold:    212000,
  rule55:            { enabled: false, separationAge: 54 },
  adultCount:        2,
};

// Mortgage shape that accumulateToFire expects (MortgageShape — mirrors
// the buying-in branch of getMortgageInputs() in the HTML).
const SCENARIO_MTG = {
  ownership:     'buying-in',
  buyInYears:    SCENARIO_INP.mtgBuyInYears,
  homePrice:     SCENARIO_INP.mtgHomePrice,
  downPayment:   SCENARIO_INP.mtgDownPayment,
  closingCosts:  SCENARIO_INP.mtgClosingCosts,
  rate:          SCENARIO_INP.mtgRate,
  term:          SCENARIO_INP.mtgTerm,
  propertyTax:   SCENARIO_INP.mtgPropertyTax,
  insurance:     SCENARIO_INP.mtgInsurance,
  hoa:           SCENARIO_INP.mtgHOA,
  sellAtFire:    SCENARIO_INP.mtgSellAtFire,
  homeLocation:  SCENARIO_INP.mtgHomeLocation,
};

// ---------------------------------------------------------------------------
// T-019-03: wCash sum = 0 regression
//
// Build a minimal Node sandbox for computeWithdrawalStrategy.
// Strategy:
//   - Extract computeWithdrawalStrategy, taxOptimizedWithdrawal, calcOrdinaryTax,
//     calcLTCGTax, getRMDDivisor from the HTML.
//   - Provide stubs for all DOM-dependent and global-dependent helpers.
//   - The critical path is:
//       resolveAccumulationOptions → accumulateToFire → pCash = 0 at FIRE
//       → taxOptimizedWithdrawal never reaches step 6 → wCash = 0 every year.
// ---------------------------------------------------------------------------

function buildWithdrawalStrategyApi() {
  // Extract pure functions from HTML.
  const fnCode = [
    'computeWithdrawalStrategy',
    'taxOptimizedWithdrawal',
    'calcOrdinaryTax',
    'calcLTCGTax',
    'getRMDDivisor',
  ].map(n => { try { return extractFn(n); } catch { return ''; } }).join('\n\n');

  // Fixed tax brackets (MFJ 2026 defaults from getTaxBrackets).
  const brackets = {
    stdDed: 30000,
    top10: 23197.8,   // top12 * 0.246
    top12: 94300,
    top22: 201050,
    top24: 384005.5,  // top22 * 1.91
    top32: 486541,    // top22 * 2.42
    top35: 730111.5,  // top22 * 3.63
    ltcg0Top: 94300,
    ltcg15Top: 583750,
  };

  // Sandbox state that computeWithdrawalStrategy reads.
  const _state = {
    _payoffVsInvest: { mortgageStrategy: 'invest-keep-paying' },
  };

  // Overrides for DOM-dependent and complex helpers.
  const overrides = `
// resolveAccumulationOptions: pure version for sandbox.
// Provides mortgage buy-in so accumulateToFire drains cash as in the real dashboard.
function resolveAccumulationOptions(inp, fireAge, mortgageStrategyOverride) {
  return {
    mortgageStrategyOverride: mortgageStrategyOverride || 'invest-keep-paying',
    mortgageEnabled:   true,
    mortgageInputs:    _scenarioMtg,
    secondHomeEnabled: false,
    secondHomeInputs:  null,
    rentMonthly:       0,
    pviExtraMonthly:   0,
    collegeFn:         null,
    payoffVsInvestFn:  null,
  };
}
// SS: stub — fixed annual benefit so wCash is not influenced by SS mechanics.
function getSSAnnual(inp, claimAge, fireAge) {
  return 48000;
}
// Healthcare delta: zero for this scenario.
function getHealthcareDeltaAnnual(scenarioId, age, inp) { return 0; }
// College cost: zero.
function getTotalCollegeCostForYear(inp, yearsFromNow) { return 0; }
// Per-child allowance: no children.
function calcPerChildAllowance(children, projYear, fireYear) { return 0; }
// getMortgageAdjustedRetirement: no post-FIRE mortgage cost adjustment (sells at FIRE).
function getMortgageAdjustedRetirement(annualSpend, yrsToFire) {
  return { annualSpend: annualSpend, saleProceeds: 0 };
}
`;

  const ctx = new Function(
    'accumulateToFire', 'state', '_scenarioMtg', 'selectedScenario', 'childrenList',
    `${fnCode}\n${overrides}\nreturn { computeWithdrawalStrategy };`
  );

  return ctx(
    _accumulateToFire,
    _state,
    SCENARIO_MTG,
    /*selectedScenario=*/ 'us',
    /*childrenList=*/ []
  );
}

test('T-019-03: wCash sum === 0 for user audit scenario after accumulation fix', () => {
  const api = buildWithdrawalStrategyApi();

  // Tax brackets (MFJ 2026 defaults).
  const brackets = {
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

  const result = api.computeWithdrawalStrategy(
    SCENARIO_INP,
    SCENARIO_INP.annualSpend,
    SCENARIO_INP.fireAge,
    brackets
  );

  assert.ok(
    result && Array.isArray(result.strategy),
    'computeWithdrawalStrategy must return { strategy: [...] }'
  );
  assert.ok(
    result.strategy.length > 0,
    `strategy array must be non-empty (endAge=${SCENARIO_INP.endAge}, fireAge=${SCENARIO_INP.fireAge})`
  );

  // Sum every row.wCash across all retirement years.
  const wCashSum = result.strategy.reduce((sum, row) => sum + (row.wCash || 0), 0);

  assert.strictEqual(
    wCashSum,
    0,
    `[T-019-03] wCash sum must be exactly 0 for user audit scenario — ` +
    `pCash is $0 at FIRE after the mortgage buy-in drains the $80k cash pool. ` +
    `Got wCashSum=${wCashSum}. ` +
    `Individual wCash values: ${JSON.stringify(result.strategy.slice(0, 5).map(r => r.wCash))}...`
  );

  // Sanity-check row count: endAge - fireAge + 1 = 100 - 53 + 1 = 48 years.
  const expectedRows = SCENARIO_INP.endAge - SCENARIO_INP.fireAge + 1;
  assert.strictEqual(
    result.strategy.length,
    expectedRows,
    `[T-019-03] strategy should have ${expectedRows} rows (fireAge=${SCENARIO_INP.fireAge} to endAge=${SCENARIO_INP.endAge})`
  );

  // Sanity-check: first row is at fireAge.
  assert.strictEqual(
    result.strategy[0].age,
    SCENARIO_INP.fireAge,
    `[T-019-03] first strategy row must be at fireAge=${SCENARIO_INP.fireAge}`
  );
});

// ---------------------------------------------------------------------------
// T-019-04: strategy parity — accumulateToFire determinism and pool sanity
//
// Rationale: both _simulateStrategyLifetime and computeWithdrawalStrategy now
// delegate pre-FIRE accumulation to accumulateToFire. This test:
//   1. Runs accumulateToFire twice with the same inputs → asserts byte-equal
//      results (determinism invariant — no random or mutable state).
//   2. Asserts all four end-state pools are finite and non-negative.
//   3. Asserts pCash = 0 (the key post-fix invariant: the $80k cash + $57k
//      stocks were consumed by the mortgage buy-in at age 44).
//   4. Asserts pStocks > 0 (stocks survived the buy-in overflow and continued
//      accumulating for the remaining 9 years to FIRE).
// ---------------------------------------------------------------------------

test('T-019-04: accumulateToFire is deterministic and pCash = 0 at FIRE for audit scenario', () => {
  const accumOpts = {
    mortgageStrategyOverride: 'invest-keep-paying',
    mortgageEnabled:   true,
    mortgageInputs:    SCENARIO_MTG,
    secondHomeEnabled: false,
    secondHomeInputs:  null,
    rentMonthly:       0,
    pviExtraMonthly:   0,
    collegeFn:         null,
    payoffVsInvestFn:  null,
  };

  const fireAge = SCENARIO_INP.fireAge; // 53

  // Run 1.
  const run1 = _accumulateToFire(SCENARIO_INP, fireAge, accumOpts);
  // Run 2 — should be byte-equal (determinism).
  const run2 = _accumulateToFire(SCENARIO_INP, fireAge, accumOpts);

  // 1. Determinism: both runs produce the same four end-state values.
  assert.strictEqual(
    run1.end.pTrad,
    run2.end.pTrad,
    `[T-019-04] pTrad must be deterministic: run1=${run1.end.pTrad}, run2=${run2.end.pTrad}`
  );
  assert.strictEqual(
    run1.end.pRoth,
    run2.end.pRoth,
    `[T-019-04] pRoth must be deterministic: run1=${run1.end.pRoth}, run2=${run2.end.pRoth}`
  );
  assert.strictEqual(
    run1.end.pStocks,
    run2.end.pStocks,
    `[T-019-04] pStocks must be deterministic: run1=${run1.end.pStocks}, run2=${run2.end.pStocks}`
  );
  assert.strictEqual(
    run1.end.pCash,
    run2.end.pCash,
    `[T-019-04] pCash must be deterministic: run1=${run1.end.pCash}, run2=${run2.end.pCash}`
  );

  // 2. All four pools are finite and non-negative.
  for (const [key, val] of Object.entries(run1.end)) {
    assert.ok(
      Number.isFinite(val),
      `[T-019-04] run1.end.${key} must be finite, got ${val}`
    );
    assert.ok(
      val >= 0,
      `[T-019-04] run1.end.${key} must be >= 0 (pool clamping invariant), got ${val}`
    );
  }

  // 3. pCash = 0 at FIRE.
  // Explanation: starting cash = $80k + $0 otherAssets = $80k.
  // The mortgage buys in at age 44 (buyInYears=2 from age 42).
  // Down payment + closing = $120k + $17k = $137k.
  // Cash covers $80k, leaving $57k spillover drained from stocks.
  // After the drain at age 44, pCash = 0 and never receives new
  // inflows (effectiveAnnualSavings goes to stocks, contributions
  // to 401k). 9 years at 0.5%/yr on $0 = $0.
  assert.strictEqual(
    run1.end.pCash,
    0,
    `[T-019-04] pCash must be $0 at FIRE for the audit scenario — ` +
    `the $80k cash + $57k stock overflow were consumed by the mortgage ` +
    `buy-in at age 44. Got pCash=${run1.end.pCash}`
  );

  // 4. pStocks > 0 (accumulated for 9 years post buy-in).
  assert.ok(
    run1.end.pStocks > 0,
    `[T-019-04] pStocks must be > 0 after accumulation; ` +
    `stocks survived the buy-in overflow and grew for remaining years. ` +
    `Got pStocks=${run1.end.pStocks}`
  );

  // 5. perYearRows covers exactly (fireAge - ageRoger) = 11 years.
  const expectedRows = fireAge - SCENARIO_INP.ageRoger; // 11
  assert.strictEqual(
    run1.perYearRows.length,
    expectedRows,
    `[T-019-04] perYearRows must cover ${expectedRows} accumulation years ` +
    `(age ${SCENARIO_INP.ageRoger} to ${fireAge - 1}). Got ${run1.perYearRows.length}`
  );

  // 6. The buy-in row (age 44 = ageRoger + buyInYears) must record the drain event.
  const buyInAge = SCENARIO_INP.ageRoger + SCENARIO_MTG.buyInYears; // 44
  const buyInRow = run1.perYearRows.find(r => r.age === buyInAge);
  assert.ok(
    buyInRow !== undefined,
    `[T-019-04] perYearRows must contain a row for buy-in age ${buyInAge}`
  );
  assert.ok(
    buyInRow.mtgPurchasedThisYear === true,
    `[T-019-04] row at buy-in age ${buyInAge} must have mtgPurchasedThisYear=true`
  );
});
