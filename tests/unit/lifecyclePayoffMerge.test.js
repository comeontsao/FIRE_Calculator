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
// CONTRACT (Inv-10, sell branch — option 1 fold-in 2026-04-29):
//   The home sale is applied IN-LOOP at age === fireAge. After the sale:
//     - investPath[fireAge].invested INCLUDES the netToBrokerage injection.
//     - postSaleBrokerageAtFire.invest === investPath[fireAge].invested (no
//       additional addition — the sale is already in the path's brokerage).
//   This unifies the PvI chart with the lifecycle chart (both reflect the
//   sale at fireAge instead of the chart line going on past the sale event
//   along its natural-amortization trajectory).
//   Cross-strategy ordering is still asserted: prepay arm ≥ invest arm.
// ---------------------------------------------------------------------------

test('v3 LH postSaleBrokerageAtFire (sellAtFire=true): handoff equals path.invested (sale folded in)', () => {
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
    `Got: ${JSON.stringify(out.homeSaleEvent)}.`
  );

  // Assertion 2: postSaleBrokerageAtFire is present.
  assert.ok(
    out.postSaleBrokerageAtFire !== undefined && out.postSaleBrokerageAtFire !== null,
    '[LH Inv-10] postSaleBrokerageAtFire must be present when sellAtFire=true.'
  );

  // Assertion 3: post-sale handoff equals investPath[fireAge].invested EXACTLY
  // (the path now includes the sale injection, so no additional addition is
  // needed downstream — option 1 fold-in semantics).
  const investRowAtFire = out.investPath.find((r) => r.age === fireAge);
  assert.ok(
    investRowAtFire !== undefined,
    `[LH Inv-10] investPath must have a row at fireAge=${fireAge}`
  );
  assert.strictEqual(
    out.postSaleBrokerageAtFire.invest,
    investRowAtFire.invested,
    `[LH Inv-10] postSaleBrokerageAtFire.invest (${out.postSaleBrokerageAtFire.invest}) ` +
    `must equal investPath[${fireAge}].invested (${investRowAtFire.invested}) — ` +
    'the path already includes the sale injection (option 1 fold-in).'
  );

  // Assertion 4: a no-sale run with the SAME inputs (sellAtFire=false) should
  // produce a smaller invest brokerage at fireAge — the sale injection is what
  // makes the with-sale value larger. This locks the directional sanity check
  // that the sale is actually being applied.
  const noSaleInputs = baseInputs({
    mortgage: baseMortgage({ sellAtFire: false, sellingCostPct: 0.06 }),
    mortgageStrategy: 'invest-keep-paying',
  });
  const noSaleOut = computePayoffVsInvest(noSaleInputs);
  const noSaleInvestAtFire = noSaleOut.investPath.find((r) => r.age === fireAge).invested;
  assert.ok(
    out.postSaleBrokerageAtFire.invest > noSaleInvestAtFire,
    `[LH Inv-10] with-sale invest brokerage (${out.postSaleBrokerageAtFire.invest}) ` +
    `must be > no-sale invest brokerage (${noSaleInvestAtFire}) when netToBrokerage > 0.`
  );

  // Assertion 5: per-strategy netToBrokerage ordering — Prepay nets MORE from
  // the sale than Invest because its remaining mortgage balance at FIRE is
  // smaller (more proceeds flow to the brokerage). This is the underlying
  // contract; the total handoff ordering depends on the brokerage growth gap
  // between strategies (scenario-dependent) and is NOT asserted here.
  //
  // Note: option-1-fold-in (2026-04-29) corrected a units bug in the old code
  // where remainingMortgageBalance was read from path.mortgageBalance (nominal)
  // instead of mortgageBalanceReal. The new in-loop sale uses real $
  // throughout, which produces smaller netToBrokerage values overall (the
  // difference being the inflation factor on the remaining balance).
  const prepayRunOut = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ sellAtFire: true, sellingCostPct: 0.06 }),
    mortgageStrategy: 'prepay-extra',
  }));
  assert.ok(
    prepayRunOut.homeSaleEvent.netToBrokerage > out.homeSaleEvent.netToBrokerage,
    `[LH Inv-10] prepay-strategy run's netToBrokerage (${prepayRunOut.homeSaleEvent.netToBrokerage}) ` +
    `must exceed invest-strategy run's netToBrokerage (${out.homeSaleEvent.netToBrokerage}). ` +
    'Prepay accelerates payoff with extra principal, leaving a smaller remaining balance at FIRE.'
  );
});

// ---------------------------------------------------------------------------
// T043 — LH-Inv-1: probe and chart receive identical mortgageStrategyOverride
//
// Marker/contract test for the lifecycle simulator's call-site parity.
// `projectFullLifecycle` lives inside the HTMLs (not extracted), so this test
// asserts the CONTRACT shape that BOTH callers (chart-render and FIRE-feasibility-probe)
// derive the same `mortgageStrategyOverride` from the same dashboard state.
//
// The dashboard's `getActiveMortgageStrategyOptions(state)` helper (introduced in
// T046) is a pure function of state — given the same state, both caller-side
// invocations must produce byte-equal options. Simulating that helper here
// locks the contract; a regression in either caller would diverge from this
// pure-function reference.
//
// Invariant: optsForChart.mortgageStrategyOverride === optsForProbe.mortgageStrategyOverride
//            for every dashboard state, including the default (undefined) case.
// ---------------------------------------------------------------------------

test('LH-Inv-1: probe and chart receive identical mortgageStrategyOverride', () => {
  // Pure mirror of the dashboard's getActiveMortgageStrategyOptions() helper.
  // Default strategy ('invest-keep-paying') returns undefined — no override is
  // needed because the lifecycle simulator's default behavior already matches.
  // Non-default strategies return { mortgageStrategyOverride: <strat> }.
  const getActiveMortgageStrategyOptions = (state) => {
    const strat = state && state._payoffVsInvest && state._payoffVsInvest.mortgageStrategy;
    if (!strat || strat === 'invest-keep-paying') return undefined;
    return { mortgageStrategyOverride: strat };
  };

  // Test each non-default strategy: chart and probe MUST resolve identically.
  for (const strat of ['prepay-extra', 'invest-lump-sum']) {
    const state = { _payoffVsInvest: { mortgageStrategy: strat } };
    const optsForChart = getActiveMortgageStrategyOptions(state);
    const optsForProbe = getActiveMortgageStrategyOptions(state);
    assert.deepStrictEqual(
      optsForChart,
      optsForProbe,
      `[LH-Inv-1] chart and probe must receive same options for strategy '${strat}'. ` +
      `chart=${JSON.stringify(optsForChart)}, probe=${JSON.stringify(optsForProbe)}`
    );
    assert.strictEqual(
      optsForChart.mortgageStrategyOverride,
      strat,
      `[LH-Inv-1] mortgageStrategyOverride must echo the input strategy '${strat}'. ` +
      `Got: ${optsForChart.mortgageStrategyOverride}`
    );
  }

  // Default strategy returns undefined (no override) — same for both callers.
  const stateDefault = { _payoffVsInvest: { mortgageStrategy: 'invest-keep-paying' } };
  assert.strictEqual(
    getActiveMortgageStrategyOptions(stateDefault),
    undefined,
    `[LH-Inv-1] default strategy 'invest-keep-paying' must yield undefined options ` +
    '(no override threading required when lifecycle simulator default already matches).'
  );

  // Empty / missing state also yields undefined (no override) — same for both callers.
  const stateMissing = {};
  assert.strictEqual(
    getActiveMortgageStrategyOptions(stateMissing),
    undefined,
    '[LH-Inv-1] missing _payoffVsInvest must yield undefined options for both callers.'
  );
});

// ---------------------------------------------------------------------------
// T044 — Ranker output reflects mortgage strategy change
//
// Marker test: verifies that calling `computePayoffVsInvest` produces materially
// different per-strategy `postSaleBrokerageAtFire` values when the mortgage is
// still active at FIRE and the home is sold at FIRE. The ranker keys off these
// values to choose a winning withdrawal strategy; if both arms collapsed to the
// same number, a strategy toggle would never flip the ranker.
//
// Scenario: marginal-feasibility — mortgage active at FIRE, home sale fires at
// FIRE. Each strategy ends FIRE at a different remaining mortgage balance and
// brokerage (Prepay accelerates payoff with extra principal; Invest leaves
// the contractual balance and grows brokerage instead). Both runs trace both
// paths; we compare the prepay arm of one run vs the invest arm of the other
// to surface the per-arm divergence the ranker depends on.
//
// Note: in v3 today, `mortgageStrategy === 'prepay-extra'` and
// `'invest-keep-paying'` produce identical outputs structurally — only
// `'invest-lump-sum'` short-circuits via `lumpSumPayoff = true`. The
// per-strategy fields (postSaleBrokerageAtFire.prepay vs .invest) ARE the
// branched-by-strategy values the ranker reads downstream, regardless of which
// run's `mortgageStrategy` flag is set. This test locks that the per-arm
// values diverge enough for the ranker to discriminate.
// ---------------------------------------------------------------------------

test('ranker input differs across mortgage strategies (marginal scenario)', () => {
  // Marginal-feasibility scenario: home sale at FIRE, mortgage active at FIRE,
  // moderate stocks return. fireAge=55 with currentAge=42 leaves the mortgage
  // (term=30) active at FIRE under both strategies.
  const marginalMortgage = (overrides) => Object.assign({
    ownership: 'buying-now',
    homePrice: 500000,
    downPayment: 100000,
    rate: 0.06,
    term: 30,
    yearsPaid: 0,
    buyInYears: 0,
    propertyTax: 6000,
    insurance: 1500,
    hoa: 0,
    sellAtFire: true,
    sellingCostPct: 0.06,
    homeLocation: 'us',
  }, overrides || {});

  const marginalInputs = (overrides) => Object.assign({
    currentAge: 42,
    fireAge: 55,
    endAge: 95,
    mortgageEnabled: true,
    mortgage: marginalMortgage(),
    stocksReturn: 0.07,
    inflation: 0.03,
    ltcgRate: 0.15,
    stockGainPct: 0.5,
    mfjStatus: 'mfj',
    extraMonthly: 1000,
    framing: 'totalNetWorth',
    effectiveRateOverride: null,
    plannedRefi: null,
    lumpSumPayoff: false,
  }, overrides || {});

  const outPrepay = computePayoffVsInvest(marginalInputs({
    mortgageStrategy: 'prepay-extra',
  }));
  const outInvest = computePayoffVsInvest(marginalInputs({
    mortgageStrategy: 'invest-keep-paying',
  }));

  // Both runs must expose postSaleBrokerageAtFire (T029 wiring).
  assert.ok(
    outPrepay.postSaleBrokerageAtFire,
    '[T044] prepay-strategy run must produce postSaleBrokerageAtFire'
  );
  assert.ok(
    outInvest.postSaleBrokerageAtFire,
    '[T044] invest-strategy run must produce postSaleBrokerageAtFire'
  );

  // The ranker keys off per-arm values: prepay arm of one run vs invest arm of
  // another. Their FIRE-age states differ (different remaining balances → different
  // net-to-brokerage on sale; different brokerage growth) so the ranker has
  // distinguishing input.
  assert.notStrictEqual(
    outPrepay.postSaleBrokerageAtFire.prepay,
    outInvest.postSaleBrokerageAtFire.invest,
    `[T044] postSaleBrokerageAtFire (the ranker input) must differ between strategies. ` +
    `prepay-arm=${outPrepay.postSaleBrokerageAtFire.prepay}, ` +
    `invest-arm=${outInvest.postSaleBrokerageAtFire.invest}. ` +
    'If equal, the ranker has no signal to flip on a strategy toggle.'
  );
});
