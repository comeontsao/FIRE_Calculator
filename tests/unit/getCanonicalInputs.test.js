/*
 * tests/unit/getCanonicalInputs.test.js — locks the canonical-input adapter
 * contract for feature 032 (Roth IRA Accounts).
 *
 * Verifies that the adapter exposes BOTH `roth401kReal` (Roth 401K, renamed
 * from the misleading `rothIraReal` per research.md Q1) AND `rothIraReal`
 * (the new actual Roth IRA pool) as DISTINCT fields on the canonical
 * Inputs.portfolioPrimary object.
 *
 * Contract reference: specs/032-roth-ira-accounts/contracts/roth-ira-pool.contract.md
 * Research:           specs/032-roth-ira-accounts/research.md §Q1
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';

/**
 * Minimal valid RR-shaped legacy input for the adapter. Only the fields the
 * tests actually inspect are non-zero; everything else is set to a sane
 * default so the adapter passes its required-field guards.
 */
function makeRrInput(overrides = {}) {
  return {
    ageRoger: 40,
    ageRebecca: 40,
    roger401kTrad: 100_000,
    roger401kRoth: 50_000,
    rogerStocks: 25_000,
    rebeccaStocks: 25_000,
    cashSavings: 10_000,
    otherAssets: 0,
    monthlySavings: 500,
    contrib401kTrad: 3_000,
    contrib401kRoth: 1_500,
    empMatch: 1_500,
    returnRate: 0.07,
    inflationRate: 0.03,
    selectedScenario: 'us',
    fireMode: 'safe',
    bufferUnlock: 2,
    bufferSS: 3,
    ssClaimAge: 67,
    endAge: 95,
    ageKid1: 5,
    collegeKid1: 'none',
    ageKid2: 3,
    collegeKid2: 'none',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Feature 032 — T004 — Canonical-input shape exposes BOTH roth401kReal AND
// rothIraReal as distinct fields with separate values.
// ---------------------------------------------------------------------------

test('getCanonicalInputs: portfolioPrimary exposes both roth401kReal and rothIraReal as distinct fields — feature 032 T004', () => {
  const inp = makeRrInput({
    roger401kRoth: 50_000,   // Roth 401K → roth401kReal = 50_000
    rogerRothIra: 30_000,    // Roth IRA  → rothIraReal  = 30_000 + 20_000 = 50_000 (coincidence to ensure not aliased)
    rebeccaRothIra: 20_000,
  });
  const canonical = getCanonicalInputs(inp);

  assert.ok(canonical.portfolioPrimary, 'portfolioPrimary must be present');
  // The renamed field — Roth 401K balance.
  assert.equal(
    canonical.portfolioPrimary.roth401kReal,
    50_000,
    `roth401kReal must equal Roth 401K balance (50_000); got ${canonical.portfolioPrimary.roth401kReal}`,
  );
  // The NEW field — actual Roth IRA pool, sum of roger + rebecca inputs.
  assert.equal(
    canonical.portfolioPrimary.rothIraReal,
    50_000,
    `rothIraReal must equal sum of rogerRothIra + rebeccaRothIra (30_000 + 20_000 = 50_000); got ${canonical.portfolioPrimary.rothIraReal}`,
  );
  // Verify they are independent — change one without the other.
  const inp2 = makeRrInput({
    roger401kRoth: 99_999,
    rogerRothIra: 0,
    rebeccaRothIra: 0,
  });
  const canonical2 = getCanonicalInputs(inp2);
  assert.equal(canonical2.portfolioPrimary.roth401kReal, 99_999, 'roth401kReal reflects Roth 401K only');
  assert.equal(canonical2.portfolioPrimary.rothIraReal, 0, 'rothIraReal is 0 when Roth IRA inputs are 0');
});

test('getCanonicalInputs: rothIraReal defaults to 0 when rogerRothIra/rebeccaRothIra missing — feature 032 T004', () => {
  const inp = makeRrInput(); // no Roth IRA fields supplied
  const canonical = getCanonicalInputs(inp);
  assert.equal(
    canonical.portfolioPrimary.rothIraReal,
    0,
    `rothIraReal must default to 0 when source DOM fields are missing; got ${canonical.portfolioPrimary.rothIraReal}`,
  );
});

// ---------------------------------------------------------------------------
// Feature 032 — T009 (US1) — Realistic RR defaults: Roger Roth IRA = 0,
// Rebecca Roth IRA = 59_021 sums into rothIraReal = 59_021. This mirrors the
// values the DOM exposes on first load (`value="0"` and `value="59021"`).
// ---------------------------------------------------------------------------
test('getCanonicalInputs: RR realistic defaults — rogerRothIra=0 + rebeccaRothIra=59021 → rothIraReal=59021 — feature 032 T009', () => {
  const inp = makeRrInput({
    rogerRothIra: 0,
    rebeccaRothIra: 59_021,
  });
  const canonical = getCanonicalInputs(inp);
  assert.equal(
    canonical.portfolioPrimary.rothIraReal,
    59_021,
    `rothIraReal must equal rogerRothIra (0) + rebeccaRothIra (59021) = 59021; got ${canonical.portfolioPrimary.rothIraReal}`,
  );
});

test('getCanonicalInputs: Generic shape — rothIraReal defaults to 0 when person1RothIra/person2RothIra missing — feature 032 T004', () => {
  const inp = {
    agePerson1: 36,
    agePerson2: 36,
    person1_401kTrad: 0,
    person1_401kRoth: 0,
    person1Stocks: 0,
    person2Stocks: 0,
    monthlySavings: 500,
    contrib401kTrad: 3_000,
    contrib401kRoth: 0,
    empMatch: 1_500,
    returnRate: 0.07,
    inflationRate: 0.03,
    selectedScenario: 'us',
    fireMode: 'safe',
    bufferUnlock: 2,
    bufferSS: 3,
    ssClaimAge: 67,
    endAge: 95,
  };
  const canonical = getCanonicalInputs(inp);
  assert.equal(
    canonical.portfolioPrimary.rothIraReal,
    0,
    `Generic adapter: rothIraReal defaults to 0; got ${canonical.portfolioPrimary.rothIraReal}`,
  );
  assert.equal(
    canonical.portfolioPrimary.roth401kReal,
    0,
    `Generic adapter: roth401kReal reflects person1_401kRoth (0); got ${canonical.portfolioPrimary.roth401kReal}`,
  );
});
