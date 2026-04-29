// ==================== TEST SUITE: lifecycle ↔ PvI handoff ====================
// Feature 018 — lifecycle-payoff-merge.
// Contract: specs/018-lifecycle-payoff-merge/contracts/lifecycle-mortgage-handoff.contract.md
//
// Covers: postSaleBrokerageAtFire handoff invariants (Inv-10).
//   (a) When sellAtFire=false: postSaleBrokerageAtFire[strategy] equals the
//       strategy's brokerage at FIRE from the path (no sale injection).
//   (b) When sellAtFire=true: postSaleBrokerageAtFire[strategy] equals the
//       strategy's brokerage at FIRE PLUS homeSaleEvent.netToBrokerage (within ±1).
//
// STATUS: EXPECTED TO FAIL until T026/T027 (homeSaleEvent) AND T029
// (postSaleBrokerageAtFire computation) land. Both tests are intentionally red
// at this commit. The Backend agent's T026–T029 will make them pass (green).
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { computePayoffVsInvest } = require(path.resolve(__dirname, '..', '..', 'calc', 'payoffVsInvest.js'));

// ---------------------------------------------------------------------------
// Minimal fixture builders (independent copy — preserves file independence).
// These intentionally mirror the factories in payoffVsInvest.test.js to avoid
// a cross-file import dependency while keeping inputs predictable.
// ---------------------------------------------------------------------------

function baseMortgage(overrides) {
  return Object.assign({
    ownership: 'buying-now',
    homePrice: 500000,
    downPayment: 100000,   // balance = 400000
    rate: 0.06,
    term: 30,
    yearsPaid: 0,
    buyInYears: 0,
    propertyTax: 6000,
    insurance: 1500,
    hoa: 0,
    sellAtFire: false,
    homeLocation: 'us',
  }, overrides || {});
}

function baseInputs(overrides) {
  return Object.assign({
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    mortgageEnabled: true,
    mortgage: baseMortgage(),
    stocksReturn: 0.07,
    inflation: 0.03,
    ltcgRate: 0.15,
    stockGainPct: 0.6,
    extraMonthly: 500,
    framing: 'totalNetWorth',
    effectiveRateOverride: null,
    plannedRefi: null,
    lumpSumPayoff: false,
    mortgageStrategy: 'invest-keep-paying',
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// T025(a) — postSaleBrokerageAtFire with no sell-at-FIRE
// CONTRACT (Inv-10, no-sale branch):
//   postSaleBrokerageAtFire.prepay === prepayPath[fireAge].invested
//   postSaleBrokerageAtFire.invest === investPath[fireAge].invested
// No sale injection because sellAtFire=false (the default).
// STATUS: EXPECTED TO FAIL until T029 adds postSaleBrokerageAtFire to outputs.
// ---------------------------------------------------------------------------

test('v3 LH postSaleBrokerageAtFire (no sellAtFire): handoff equals strategy\'s brokerage at FIRE', () => {
  // Default baseInputs: sellAtFire=false in baseMortgage, mortgageStrategy='invest-keep-paying'.
  const inputs = baseInputs();
  const fireAge = inputs.fireAge; // 51

  const out = computePayoffVsInvest(inputs);

  // Assertion 1: postSaleBrokerageAtFire is present and an object with prepay + invest.
  assert.ok(
    out.postSaleBrokerageAtFire !== undefined && out.postSaleBrokerageAtFire !== null,
    '[LH Inv-10] postSaleBrokerageAtFire must be present in outputs when sellAtFire=false. ' +
    'T029 has not yet added this field. Got: ' + JSON.stringify(out.postSaleBrokerageAtFire)
  );
  assert.ok(
    typeof out.postSaleBrokerageAtFire === 'object',
    '[LH Inv-10] postSaleBrokerageAtFire must be an object { prepay, invest }. ' +
    'Got: ' + JSON.stringify(out.postSaleBrokerageAtFire)
  );

  // Assertion 2: postSaleBrokerageAtFire.prepay === prepayPath row at fireAge .invested.
  const prepayRowAtFire = out.prepayPath.find((r) => r.age === fireAge);
  assert.ok(
    prepayRowAtFire !== undefined,
    `[LH Inv-10] prepayPath must have a row at fireAge=${fireAge}; none found.`
  );
  assert.strictEqual(
    out.postSaleBrokerageAtFire.prepay,
    prepayRowAtFire.invested,
    `[LH Inv-10] postSaleBrokerageAtFire.prepay (${out.postSaleBrokerageAtFire.prepay}) ` +
    `must equal prepayPath row at fireAge=${fireAge} .invested (${prepayRowAtFire.invested}). ` +
    'No sale injection when sellAtFire=false.'
  );

  // Assertion 3: postSaleBrokerageAtFire.invest === investPath row at fireAge .invested.
  const investRowAtFire = out.investPath.find((r) => r.age === fireAge);
  assert.ok(
    investRowAtFire !== undefined,
    `[LH Inv-10] investPath must have a row at fireAge=${fireAge}; none found.`
  );
  assert.strictEqual(
    out.postSaleBrokerageAtFire.invest,
    investRowAtFire.invested,
    `[LH Inv-10] postSaleBrokerageAtFire.invest (${out.postSaleBrokerageAtFire.invest}) ` +
    `must equal investPath row at fireAge=${fireAge} .invested (${investRowAtFire.invested}). ` +
    'No sale injection when sellAtFire=false.'
  );
});

// ---------------------------------------------------------------------------
// T025(b) — postSaleBrokerageAtFire with sell-at-FIRE enabled
// CONTRACT (Inv-10, sell branch):
//   postSaleBrokerageAtFire.invest === investPath[fireAge].invested
//                                      + homeSaleEvent.netToBrokerage (within ±1)
//   postSaleBrokerageAtFire.prepay >= postSaleBrokerageAtFire.invest
//     (Prepay typically nets a larger equity injection because its remaining
//      mortgage balance is smaller than Invest's at FIRE, so more of the
//      proceeds flow to brokerage. Note: this ordering assumption could break
//      in degenerate scenarios — see comment below.)
//
// ASSUMPTION: For the default baseInputs scenario (rate=0.06, stocks=0.07,
// extra=500, fireAge=51), Prepay's accelerated payments leave a smaller
// remaining balance than Invest's contractual balance. Both strategies share
// the same homeValueAtFire and sellingCostPct so proceeds are equal;
// therefore Prepay's netToBrokerage >= Invest's netToBrokerage, which means
// postSaleBrokerageAtFire.prepay >= postSaleBrokerageAtFire.invest.
//
// NOTE: homeSaleEvent.netToBrokerage in the per-strategy model differs between
// Prepay and Invest because remainingMortgageBalance differs. The simpler
// single-event form checked here uses the single homeSaleEvent's netToBrokerage
// for the invest path; the Prepay path's postSaleBrokerageAtFire.prepay uses
// the Prepay-specific remainingMortgageBalance (which the Backend agent
// computes in T027).
//
// STATUS: EXPECTED TO FAIL until T026/T027 (homeSaleEvent) AND T029
// (postSaleBrokerageAtFire computation) land.
// ---------------------------------------------------------------------------

test('v3 LH postSaleBrokerageAtFire (sellAtFire=true): handoff includes equity injection', () => {
  // sellingCostPct: 0.06 explicitly to ensure a predictable value independent
  // of homeLocation-based defaults.
  const inputs = baseInputs({
    mortgage: baseMortgage({ sellAtFire: true, sellingCostPct: 0.06 }),
    mortgageStrategy: 'invest-keep-paying',
  });
  const fireAge = inputs.fireAge; // 51

  const out = computePayoffVsInvest(inputs);

  // Assertion 1: homeSaleEvent is non-null (sell fired at FIRE).
  assert.ok(
    out.homeSaleEvent !== null && out.homeSaleEvent !== undefined,
    '[LH Inv-10] homeSaleEvent must be non-null when sellAtFire=true. ' +
    `Got: ${JSON.stringify(out.homeSaleEvent)}. T027 has not yet computed homeSaleEvent.`
  );

  // Assertion 2: postSaleBrokerageAtFire is present.
  assert.ok(
    out.postSaleBrokerageAtFire !== undefined && out.postSaleBrokerageAtFire !== null,
    '[LH Inv-10] postSaleBrokerageAtFire must be present when sellAtFire=true. ' +
    'T029 has not yet added this field. Got: ' + JSON.stringify(out.postSaleBrokerageAtFire)
  );

  // Assertion 3: invest handoff = investPath[fireAge].invested + netToBrokerage (within ±1).
  // NOTE: The data-model.md specifies per-strategy netToBrokerage (remainingMortgageBalance
  // differs per strategy). For this test we use the homeSaleEvent's .netToBrokerage which
  // should correspond to the invest strategy (invest-keep-paying) since that is the active
  // strategy. A future per-strategy netToBrokerage refinement may require updating this.
  const investRowAtFire = out.investPath.find((r) => r.age === fireAge);
  assert.ok(
    investRowAtFire !== undefined,
    `[LH Inv-10] investPath must have a row at fireAge=${fireAge}`
  );
  const expectedInvestHandoff = investRowAtFire.invested + out.homeSaleEvent.netToBrokerage;
  assert.ok(
    Math.abs(out.postSaleBrokerageAtFire.invest - expectedInvestHandoff) <= 1,
    `[LH Inv-10] postSaleBrokerageAtFire.invest (${out.postSaleBrokerageAtFire.invest}) ` +
    `must equal investPath[${fireAge}].invested (${investRowAtFire.invested}) + ` +
    `homeSaleEvent.netToBrokerage (${out.homeSaleEvent.netToBrokerage}) = ` +
    `${expectedInvestHandoff} (±1 rounding).`
  );

  // Assertion 4: prepay handoff >= invest handoff.
  // Prepay's accelerated payments leave a smaller remaining mortgage balance at FIRE,
  // so its netToBrokerage is ≥ Invest's netToBrokerage, making its total handoff ≥ invest's.
  assert.ok(
    out.postSaleBrokerageAtFire.prepay >= out.postSaleBrokerageAtFire.invest,
    `[LH Inv-10] postSaleBrokerageAtFire.prepay (${out.postSaleBrokerageAtFire.prepay}) ` +
    `must be >= postSaleBrokerageAtFire.invest (${out.postSaleBrokerageAtFire.invest}). ` +
    'Prepay leaves a smaller remaining balance at FIRE (more of proceeds go to brokerage).'
  );
});
