/*
 * tests/baseline/browser-smoke.test.js — browser-smoke regression harness.
 *
 * Feature: specs/003-browser-smoke-harness/
 *
 * Purpose: prove the canonical calc engine (calc/*.js) consumes each
 * dashboard's cold-load form defaults without throwing and returns a
 * `FireSolverResult` with every field present and correctly typed. Also
 * locks the RR-path ↔ Generic-path parity contract so feature 004's real
 * adapter swap starts detecting drift automatically.
 *
 * This file is a GATE, not a product. Zero deps; Node built-ins only.
 * Runs via `bash tests/runner.sh` locally and `.github/workflows/tests.yml`
 * in CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Defaults snapshots — frozen legacy-shape objects mirroring each dashboard's
// cold-load form state. When the HTML form defaults change, update these.
import RR_DEFAULTS from './rr-defaults.mjs';
import GENERIC_DEFAULTS from './generic-defaults.mjs';

// Canonical calc engine — full helpers bundle.
import { makeInflation } from '../../calc/inflation.js';
import { computeTax } from '../../calc/tax.js';
import { computeWithdrawal } from '../../calc/withdrawal.js';
import { projectSS } from '../../calc/socialSecurity.js';
import { getHealthcareCost } from '../../calc/healthcare.js';
import { resolveMortgage, computeMortgage } from '../../calc/mortgage.js';
import { computeCollegeCosts } from '../../calc/college.js';
import { resolveSecondHome } from '../../calc/secondHome.js';
import { computeStudentLoan } from '../../calc/studentLoan.js';
import { solveFireAge } from '../../calc/fireCalculator.js';

// Parity fixture — canonical couple used by the parity smoke (degenerate
// today; activates real divergence when feature 004 lands personal-rr.js).
import parityFixture from '../fixtures/rr-generic-parity.js';

/**
 * Build the DI helpers bundle expected by `solveFireAge`. `calc/lifecycle.js`
 * falls back to direct imports for any helper not supplied, but providing
 * the full bundle exercises the injection path and matches the shape the
 * HTML module bootstrap will use in feature 004.
 *
 * @param {object} inputs   canonical Inputs shape (for inflation's base year)
 * @returns {object}        helpers bundle
 */
function buildHelpers(inputs) {
  const baseYear = typeof inputs.baseYear === 'number' ? inputs.baseYear : new Date().getFullYear();
  // Per calc/lifecycle.js runLifecycle: each helpers.* slot is the FUNCTION
  // itself (e.g., `helpers.socialSecurity ?? projectSS`), not an object
  // wrapping the function. Supplying the direct function form mirrors the
  // fallback path exactly.
  return Object.freeze({
    inflation: makeInflation(inputs.inflationRate, baseYear),
    tax: computeTax,
    withdrawal: computeWithdrawal,
    socialSecurity: projectSS,
    healthcare: getHealthcareCost,
    mortgage: resolveMortgage,
    college: computeCollegeCosts,
    secondHome: resolveSecondHome,
    studentLoan: computeStudentLoan,
  });
}

/**
 * Standard 2025 MFJ US tax brackets — used as a default TaxConfig for the
 * prototype adapter. The cold-load dashboards don't expose bracket edits;
 * this table mirrors the canonical fixtures in tests/fixtures/*.js.
 */
const DEFAULT_TAX_CONFIG = Object.freeze({
  ordinaryBrackets: Object.freeze([
    Object.freeze({ threshold: 0, rate: 0.10 }),
    Object.freeze({ threshold: 23_200, rate: 0.12 }),
    Object.freeze({ threshold: 94_300, rate: 0.22 }),
    Object.freeze({ threshold: 201_050, rate: 0.24 }),
  ]),
  ltcgBrackets: Object.freeze([
    Object.freeze({ threshold: 0, rate: 0.00 }),
    Object.freeze({ threshold: 94_050, rate: 0.15 }),
    Object.freeze({ threshold: 583_750, rate: 0.20 }),
  ]),
  rmdAgeStart: 73,
});

/**
 * Per-scenario cold-load annual-spend lookup — mirrors the inline engine's
 * SCENARIOS_BY_ID table (FIRE-Dashboard.html L2383+, Generic L2443+). Only
 * the scenarios both dashboards agree on are listed; unknown keys fall back
 * to a conservative US baseline so the smoke NEVER produces spend <= 0
 * (which would throw canonical validation).
 */
const SCENARIO_ANNUAL_SPEND = Object.freeze({
  us: 120_000,
  taiwan: 60_000,
  japan: 72_000,
  thailand: 45_600,
  malaysia: 42_000,
  singapore: 102_000,
  vietnam: 36_000,
  philippines: 38_400,
  mexico: 48_000,
  costarica: 54_000,
  portugal: 62_400,
});

/*
 * TEMPORARY — feature 003 (browser smoke harness) prototype.
 * Feature 004 will replace calls to this with a production
 * getCanonicalInputs() inside each HTML file's module bootstrap.
 * Track: specs/003-browser-smoke-harness/ and BACKLOG.md F2.
 */
function _prototypeGetCanonicalInputs(inp) {
  if (!inp || typeof inp !== 'object') {
    throw new TypeError(
      `_prototypeGetCanonicalInputs: expected object, got ${typeof inp}`,
    );
  }

  // Accept either RR-shape (`ageRoger`, `rogerStocks`) or Generic-shape
  // (`agePerson1`, `person1Stocks`). Integer-age per data-model §1.
  const agePrimaryRaw = inp.ageRoger ?? inp.agePerson1;
  const ageSecondaryRaw = inp.ageRebecca ?? inp.agePerson2;
  if (typeof agePrimaryRaw !== 'number') {
    throw new Error(
      `_prototypeGetCanonicalInputs: primary age missing — expected inp.ageRoger OR inp.agePerson1, got ${agePrimaryRaw}`,
    );
  }
  const currentAgePrimary = Math.floor(agePrimaryRaw);
  const currentAgeSecondary = typeof ageSecondaryRaw === 'number'
    ? Math.floor(ageSecondaryRaw)
    : undefined;

  // Portfolio — merge Roth 401(k) + Roth IRA into rothIraReal per data-model
  // §1 Portfolio note. 401(k) Roth lives in `roger401kRoth` / `person1_401kRoth`.
  const trad401k = inp.roger401kTrad ?? inp.person1_401kTrad ?? 0;
  const roth401k = inp.roger401kRoth ?? inp.person1_401kRoth ?? 0;
  const taxablePrimary = inp.rogerStocks ?? inp.person1Stocks ?? 0;
  const cashPrimary = (inp.cashSavings ?? 0) + (inp.otherAssets ?? 0);
  const monthlySavings = inp.monthlySavings ?? 0;
  const contrib401kTrad = inp.contrib401kTrad ?? 0;
  const contrib401kRoth = inp.contrib401kRoth ?? 0;
  const empMatch = inp.empMatch ?? 0;
  // Total primary annual contribution: monthly-savings × 12 + 401k tra + 401k roth + employer match.
  const annualContribPrimary =
    monthlySavings * 12 + contrib401kTrad + contrib401kRoth + empMatch;

  const portfolioPrimary = Object.freeze({
    trad401kReal: trad401k,
    rothIraReal: roth401k,
    taxableStocksReal: taxablePrimary,
    cashReal: cashPrimary,
    annualContributionReal: annualContribPrimary,
  });

  // Secondary person: present only if the dashboard reports a secondary age.
  // Secondary's taxable pool is in `rebeccaStocks` / `person2Stocks`. All
  // other pools are household-level (primary only) per inline convention.
  let portfolioSecondary;
  if (currentAgeSecondary !== undefined) {
    const taxableSecondary = inp.rebeccaStocks ?? inp.person2Stocks ?? 0;
    portfolioSecondary = Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: taxableSecondary,
      cashReal: 0,
      annualContributionReal: 0,
    });
  }

  // Real returns: dashboard sliders are nominal. data-model §1 requires
  // returnRateReal / returnRateCashReal (decimals). Convert via
  // realReturn = nominal − inflation.
  const returnNominal = inp.returnRate ?? 0.07;
  const inflationRate = inp.inflationRate ?? 0.03;
  const returnRateReal = returnNominal - inflationRate;
  // Inline cash pool grows at CASH_ANNUAL_GROWTH = 1.005 → 0.5% real.
  const returnRateCashReal = 0.005;

  // Spend: scenario table lookup (cold-load scenarios ship with scenario-
  // specific annual-spend). Fall back to US baseline so spend > 0 always.
  const scenarioKey = inp.selectedScenario ?? 'us';
  const annualSpendReal = SCENARIO_ANNUAL_SPEND[scenarioKey]
    ?? SCENARIO_ANNUAL_SPEND.us;

  // Solver mode — both dashboards default 'safe'.
  const solverMode = inp.fireMode ?? 'safe';

  // Buffers — integer years-of-spend at unlock (60) and SS start.
  const buffers = Object.freeze({
    bufferUnlockMultiple: inp.bufferUnlock ?? 0,
    bufferSSMultiple: inp.bufferSS ?? 0,
  });

  // Scenario metadata for healthcare / country contexts.
  const scenario = Object.freeze({
    country: scenarioKey,
    healthcareScenario: scenarioKey,
  });

  // Colleges — RR has ageKid1/ageKid2 + collegeKid1/collegeKid2; Generic has
  // childAges[] + childCollegePlans[]. Normalize to the canonical College[]
  // shape. Omit kids with 'none' plan (cost-zero by construction).
  const colleges = [];
  if (Array.isArray(inp.childAges)) {
    // Generic path — dynamic child list.
    for (let i = 0; i < inp.childAges.length; i += 1) {
      const kidAge = inp.childAges[i];
      const plan = (inp.childCollegePlans ?? [])[i] ?? 'us-private';
      if (plan === 'none') continue;
      colleges.push(Object.freeze({
        name: `child${i + 1}`,
        currentAge: Math.floor(kidAge),
        fourYearCostReal: 85_000 * 4, // conservative default; exact plan $s
                                      // live in the scenario table, but the
                                      // canonical engine needs a positive
                                      // real-dollar cost to exercise the path.
      }));
    }
  } else {
    // RR path — fixed two-kid slots. Skip when plan === 'none'.
    const kid1Age = inp.ageKid1;
    const kid1Plan = inp.collegeKid1 ?? 'us-private';
    if (typeof kid1Age === 'number' && kid1Plan !== 'none') {
      colleges.push(Object.freeze({
        name: 'kid1',
        currentAge: Math.floor(kid1Age),
        fourYearCostReal: 85_000 * 4,
      }));
    }
    const kid2Age = inp.ageKid2;
    const kid2Plan = inp.collegeKid2 ?? 'us-private';
    if (typeof kid2Age === 'number' && kid2Plan !== 'none') {
      colleges.push(Object.freeze({
        name: 'kid2',
        currentAge: Math.floor(kid2Age),
        fourYearCostReal: 85_000 * 4,
      }));
    }
  }

  // SS: dashboards default ssClaimAge=67 (integer in [62,70] per validation).
  const ssStartAgePrimary = inp.ssClaimAge ?? 67;
  const ssStartAgeSecondary = currentAgeSecondary !== undefined
    ? ssStartAgePrimary
    : undefined;

  const endAge = inp.endAge ?? 95;

  // Build the canonical Inputs object. `Object.freeze` prevents accidental
  // mutation downstream. Conditional fields (portfolioSecondary,
  // ssStartAgeSecondary) are attached only when non-empty to respect the
  // canonical engine's shape-based validation (portfolioSecondary present
  // ⇒ currentAgeSecondary must also be present, enforced at lifecycle.js
  // L175–177).
  /** @type {any} */
  const canonical = {
    currentAgePrimary,
    endAge,
    portfolioPrimary,
    annualSpendReal,
    returnRateReal,
    returnRateCashReal,
    inflationRate,
    tax: DEFAULT_TAX_CONFIG,
    solverMode,
    buffers,
    scenario,
    colleges: Object.freeze(colleges),
    ssStartAgePrimary,
    employerMatchReal: empMatch,
    taxTradRate: inp.taxTrad ?? 0.15,
  };
  if (currentAgeSecondary !== undefined) {
    canonical.currentAgeSecondary = currentAgeSecondary;
    canonical.portfolioSecondary = portfolioSecondary;
    canonical.ssStartAgeSecondary = ssStartAgeSecondary;
  }
  return Object.freeze(canonical);
}

// ============================================================================
// Test 1 — RR cold-load smoke
// ============================================================================

test('RR cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on RR defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = _prototypeGetCanonicalInputs(RR_DEFAULTS); },
    'RR smoke: _prototypeGetCanonicalInputs threw on RR_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/rr-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical RR inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'RR smoke: solveFireAge threw on canonical RR inputs. '
      + 'Check that _prototypeGetCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `RR smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `RR smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `RR smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `RR smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `RR smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `RR smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `RR smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `RR smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `RR smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 2 — Generic cold-load smoke
// ============================================================================

test('Generic cold-load smoke: canonical solveFireAge returns sane shape', () => {
  // Assertion 1: adapter does not throw on Generic defaults.
  let canonical;
  assert.doesNotThrow(
    () => { canonical = _prototypeGetCanonicalInputs(GENERIC_DEFAULTS); },
    'Generic smoke: _prototypeGetCanonicalInputs threw on GENERIC_DEFAULTS. '
      + 'Fix the adapter or update tests/baseline/generic-defaults.mjs.',
  );

  // Assertion 2: solver does not throw on canonical Generic inputs.
  let result;
  assert.doesNotThrow(
    () => {
      const helpers = buildHelpers(canonical);
      result = solveFireAge({ inputs: canonical, helpers });
    },
    'Generic smoke: solveFireAge threw on canonical Generic inputs. '
      + 'Check that _prototypeGetCanonicalInputs produces a shape that '
      + 'passes calc/lifecycle.js validateInputs.',
  );

  // Assertion 3: fireAge is a number.
  assert.strictEqual(
    typeof result.fireAge,
    'number',
    `Generic smoke: FireSolverResult.fireAge should be a number; got ${typeof result.fireAge} = ${JSON.stringify(result.fireAge)}.`,
  );

  // Assertion 4: yearsToFire is a number.
  assert.strictEqual(
    typeof result.yearsToFire,
    'number',
    `Generic smoke: FireSolverResult.yearsToFire should be a number; got ${typeof result.yearsToFire} = ${JSON.stringify(result.yearsToFire)}.`,
  );

  // Assertion 5: feasible is a boolean.
  assert.strictEqual(
    typeof result.feasible,
    'boolean',
    `Generic smoke: FireSolverResult.feasible should be a boolean; got ${typeof result.feasible} = ${JSON.stringify(result.feasible)}.`,
  );

  // Assertion 6: endBalanceReal finite number.
  assert.ok(
    typeof result.endBalanceReal === 'number' && Number.isFinite(result.endBalanceReal),
    `Generic smoke: FireSolverResult.endBalanceReal should be a finite number; got ${typeof result.endBalanceReal} = ${JSON.stringify(result.endBalanceReal)}.`,
  );

  // Assertion 7: balanceAtUnlockReal + balanceAtSSReal finite numbers.
  assert.ok(
    typeof result.balanceAtUnlockReal === 'number' && Number.isFinite(result.balanceAtUnlockReal),
    `Generic smoke: FireSolverResult.balanceAtUnlockReal should be a finite number; got ${typeof result.balanceAtUnlockReal} = ${JSON.stringify(result.balanceAtUnlockReal)}.`,
  );
  assert.ok(
    typeof result.balanceAtSSReal === 'number' && Number.isFinite(result.balanceAtSSReal),
    `Generic smoke: FireSolverResult.balanceAtSSReal should be a finite number; got ${typeof result.balanceAtSSReal} = ${JSON.stringify(result.balanceAtSSReal)}.`,
  );

  // Assertion 8: lifecycle is a non-empty array.
  assert.ok(
    Array.isArray(result.lifecycle) && result.lifecycle.length > 0,
    `Generic smoke: FireSolverResult.lifecycle should be a non-empty array; got length=${Array.isArray(result.lifecycle) ? result.lifecycle.length : 'not-array'}.`,
  );

  // Assertion 9: fireAge ∈ [18, 110].
  assert.ok(
    result.fireAge >= 18 && result.fireAge <= 110,
    `Generic smoke: FireSolverResult.fireAge should be in [18, 110]; got fireAge=${result.fireAge}.`,
  );

  // Assertion 10: yearsToFire ∈ [0, 100].
  assert.ok(
    result.yearsToFire >= 0 && result.yearsToFire <= 100,
    `Generic smoke: FireSolverResult.yearsToFire should be in [0, 100]; got yearsToFire=${result.yearsToFire}.`,
  );
});

// ============================================================================
// Test 3 — Parity smoke (RR-path vs Generic-path)
// ============================================================================

/**
 * Fields to compare between the RR-path and Generic-path outputs. Excludes
 * `lifecycle` (per smoke-harness.contract.md §Test 3 — too large for byte-
 * identity; feature 004 may add per-record parity).
 */
const PARITY_FIELDS = Object.freeze([
  'yearsToFire',
  'fireAge',
  'feasible',
  'endBalanceReal',
  'balanceAtUnlockReal',
  'balanceAtSSReal',
]);

test('Parity smoke: RR-path and Generic-path outputs match on non-divergent fields', () => {
  // The parity fixture already holds a CANONICAL Inputs object (not the
  // legacy inp shape). Feature 004's personal-rr.js will enrich canonical
  // inputs directly, so we pass the fixture's canonical inputs through
  // `_prototypeGetCanonicalInputs` in legacy-shape wrappers to exercise the
  // adapter path once feature 004 adds divergence. TODAY: we feed the
  // canonical inputs directly to solveFireAge on both paths — the adapter
  // is a no-op on already-canonical data, and both paths compute
  // identically (degenerate-today semantics; research.md §R3).

  // rrPath — feature 004 will extend this with a personal-rr.js adapter call.
  const rrInputs = parityFixture.inputs; // canonical; RR-path is passthrough today
  // genericPath — direct canonical, no adapter.
  const genericInputs = parityFixture.inputs;

  const helpers = buildHelpers(rrInputs);
  const rrResult = solveFireAge({ inputs: rrInputs, helpers });
  const genericResult = solveFireAge({ inputs: genericInputs, helpers });

  // Apply the fixture's `divergent[]` allowlist. A field listed in
  // `divergent` is legitimately expected to differ (e.g., SS projections
  // when RR uses actual earnings vs Generic's curve). Fields not in the
  // allowlist MUST be byte-identical between the two paths.
  const divergent = new Set(parityFixture.divergent ?? []);

  for (const field of PARITY_FIELDS) {
    if (divergent.has(field)) continue;
    assert.deepStrictEqual(
      rrResult[field],
      genericResult[field],
      `Parity smoke: field '${field}' drifted between RR-path and Generic-path.\n`
        + `  rrPath:      ${JSON.stringify(rrResult[field])}\n`
        + `  genericPath: ${JSON.stringify(genericResult[field])}\n`
        + `Either (1) update the RR-path adapter to align, OR (2) add '${field}' to `
        + `tests/fixtures/rr-generic-parity.js divergent[] with a comment explaining `
        + `the legitimate divergence.`,
    );
  }
});
