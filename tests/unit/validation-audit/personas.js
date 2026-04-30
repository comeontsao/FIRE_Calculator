'use strict';
// =============================================================================
// tests/unit/validation-audit/personas.js
//
// Feature 020 — Validation Audit Harness (T010)
// Spec: specs/020-validation-audit/tasks.md T010
// Contract: specs/020-validation-audit/contracts/validation-audit-harness.contract.md
// Data model: specs/020-validation-audit/data-model.md
//
// Exports: { personas: Persona[] }
//
// Persona = { id: string, dashboard: 'RR' | 'Generic', inp: InputState, notes: string }
//
// Strategy: single-axis sweep from RR-baseline (~35 cells) + Generic single/couple
// sweep (~25 cells) + country sweep (~12 cells) + mortgage strategy sweep (~6 cells)
// + edge cases (~5 cells) + pair-wise sweep (~20 cells). Total target: ~100 cells.
// Hard cap: 200 (SC-001 budget).
//
// Cell zero: RR-baseline mirrors the user's actual audit scenario from the
// wCashSumRegression.test.js SCENARIO_INP (same field values).
// =============================================================================

/**
 * The RR-baseline input state — Roger & Rebecca's actual scenario.
 * All other personas are built by spreading this and overriding one dimension.
 * Field names match getInputs() shape from FIRE-Dashboard.html and
 * accumulateToFire.js Inputs contract.
 */
const RR_BASELINE = {
  // --- Identity ---
  ageRoger:            42,
  ageRebecca:          42,
  agePerson1:          42,
  agePerson2:          42,
  adultCount:          2,

  // --- Pools ---
  roger401kTrad:       26454,
  person1_401kTrad:    26454,
  roger401kRoth:       58000,
  person1_401kRoth:    58000,
  rogerStocks:         215000,
  rebeccaStocks:       230000,
  person1Stocks:       215000,
  person2Stocks:       230000,
  cashSavings:         80000,
  otherAssets:         0,

  // --- Returns ---
  returnRate:          0.07,
  return401k:          0.07,
  inflationRate:       0.03,

  // --- Income / contributions ---
  annualIncome:        130000,
  raiseRate:           0.02,
  taxRate:             0.28,
  monthlySavings:      1000,
  contrib401kTrad:     16500,
  contrib401kRoth:     2900,
  empMatch:            7200,

  // --- Tax / planning ---
  taxTrad:             0.15,
  stockGainPct:        0.6,
  bufferUnlock:        1.0,
  bufferSS:            1.0,
  terminalBuffer:      2.0,
  safetyMargin:        0.05,
  swr:                 0.04,

  // --- Social Security ---
  ssClaimAge:          70,
  ssWorkStart:         2019,
  ssAvgEarnings:       100000,
  ssRebeccaOwn:        0,
  ssSpouseOwn:         0,

  // --- Mortgage (primary) ---
  mortgageEnabled:     true,
  mtgHomeLocation:     'us',
  mtgYearsPaid:        1,
  mtgBuyInYears:       2,
  mtgHomePrice:        600000,
  mtgDownPayment:      120000,
  mtgClosingCosts:     17000,
  mtgRate:             0.06,
  mtgTerm:             30,
  mtgPropertyTax:      8000,
  mtgInsurance:        2400,
  mtgHOA:              200,
  mtgApprec:           0.02,
  mtgSellAtFire:       'yes',

  // --- Home #2 ---
  secondHomeEnabled:   false,
  mtg2Destiny:         'no',
  mtg2BuyInYears:      5,
  mtg2HomePrice:       400000,
  mtg2DownPayment:     80000,
  mtg2ClosingCosts:    10000,
  mtg2Rate:            0.065,
  mtg2Term:            30,
  mtg2PropertyTax:     4000,
  mtg2Insurance:       1200,
  mtg2HOA:             0,
  mtg2Apprec:          0.02,

  // --- Mortgage strategy ---
  pviStrategyPrepay:         false,
  pviStrategyInvestKeep:     true,
  pviStrategyInvestLumpSum:  false,
  pviExtraMonthly:           0,
  pviRefiEnabled:            false,
  pviCashflowOverrideEnabled: false,
  pviCashflowOverride:        0,

  // --- Country / scenario ---
  selectedScenario:    'us',

  // --- Expense library (monthly buckets) ---
  exp_0: 2690,  // housing/rent
  exp_1: 800,
  exp_2: 600,
  exp_3: 400,
  exp_4: 300,
  exp_5: 200,
  exp_6: 150,
  exp_7: 100,
  exp_8: 100,
  exp_9: 50,

  // --- Annual spend derived from expense library ---
  annualSpend:         72700,

  // --- Plan parameters ---
  endAge:              100,
  rule55Enabled:       false,
  rule55:              { enabled: false, separationAge: 54 },
  rule55SeparationAge: 54,
  irmaaThreshold:      212000,
};

/**
 * Helper: build a persona by overriding specific fields of the baseline.
 * Always produces a fresh object (immutability — no mutation of RR_BASELINE).
 *
 * @param {string} id  Stable persona ID string
 * @param {'RR'|'Generic'} dashboard  Which HTML this persona targets
 * @param {object} overrides  Fields to override from RR_BASELINE
 * @param {string} notes  Prose describing what dimension is being stressed
 * @returns {object} Persona
 */
function persona(id, dashboard, overrides, notes) {
  return {
    id,
    dashboard,
    inp: Object.assign({}, RR_BASELINE, overrides),
    notes,
  };
}

// =============================================================================
// CELL ZERO: RR-baseline
// =============================================================================

const personas = [

  // ---------------------------------------------------------------------------
  // Group A: RR-baseline (cell zero)
  // ---------------------------------------------------------------------------
  persona(
    'RR-baseline',
    'RR',
    {},
    'Roger & Rebecca\'s actual scenario from the audit dump. Age 42, spend $72.7k, mortgage buying-in 2yr, monthlySavings $1k, contrib401kTrad $16.5k.'
  ),

  // ---------------------------------------------------------------------------
  // Group B: Single-axis sweep from RR-baseline (~35 cells)
  // ---------------------------------------------------------------------------

  // B1: Spend sweep
  persona(
    'RR-spend-frugal',
    'RR',
    { annualSpend: 50000 },
    'RR baseline with frugal annual spend of $50k.'
  ),
  persona(
    'RR-spend-fat',
    'RR',
    { annualSpend: 120000 },
    'RR baseline with fat-FIRE annual spend of $120k.'
  ),
  persona(
    'RR-spend-lean',
    'RR',
    { annualSpend: 35000 },
    'RR baseline with lean annual spend of $35k — below baseline by half.'
  ),

  // B2: Income sweep
  persona(
    'RR-income-low',
    'RR',
    { annualIncome: 80000 },
    'RR baseline with lower household income of $80k.'
  ),
  persona(
    'RR-income-high',
    'RR',
    { annualIncome: 250000 },
    'RR baseline with high household income of $250k.'
  ),

  // B3: Age sweep
  persona(
    'RR-age-young',
    'RR',
    {
      ageRoger:  28, ageRebecca:  28,
      agePerson1: 28, agePerson2: 28,
      roger401kTrad: 5000, person1_401kTrad: 5000,
      roger401kRoth: 10000, person1_401kRoth: 10000,
      rogerStocks: 30000, rebeccaStocks: 20000,
      person1Stocks: 30000, person2Stocks: 20000,
      cashSavings: 15000,
    },
    'RR baseline at current age 28 with smaller pools.'
  ),
  persona(
    'RR-age-late',
    'RR',
    {
      ageRoger:  52, ageRebecca:  52,
      agePerson1: 52, agePerson2: 52,
      roger401kTrad: 350000, person1_401kTrad: 350000,
      roger401kRoth: 150000, person1_401kRoth: 150000,
      rogerStocks: 600000, rebeccaStocks: 500000,
      person1Stocks: 600000, person2Stocks: 500000,
      cashSavings: 120000,
    },
    'RR baseline at current age 52 with larger pools — late-starter scenario.'
  ),

  // B4: Mortgage state sweep
  persona(
    'RR-no-mortgage',
    'RR',
    { mortgageEnabled: false },
    'RR baseline with mortgage disabled — renting only.'
  ),
  persona(
    'RR-mortgage-already-own',
    'RR',
    {
      mortgageEnabled: true,
      mtgBuyInYears:   0,
      mtgYearsPaid:    5,
    },
    'RR baseline already owning home (5 years paid, no buy-in).'
  ),
  persona(
    'RR-mortgage-buying-now',
    'RR',
    {
      mortgageEnabled: true,
      mtgBuyInYears:   0,
      mtgYearsPaid:    0,
    },
    'RR baseline buying home now (buying-now semantics, buyInYears=0).'
  ),
  persona(
    'RR-mortgage-keep',
    'RR',
    { mtgSellAtFire: 'no' },
    'RR baseline with sell-at-FIRE disabled — keeps the home in retirement.'
  ),

  // B5: Mortgage strategy sweep
  persona(
    'RR-strategy-prepay',
    'RR',
    {
      pviStrategyPrepay:        true,
      pviStrategyInvestKeep:    false,
      pviStrategyInvestLumpSum: false,
      pviExtraMonthly:          500,
    },
    'RR baseline using prepay-extra mortgage strategy with $500/mo extra.'
  ),
  persona(
    'RR-strategy-invest-lump-sum',
    'RR',
    {
      pviStrategyPrepay:        false,
      pviStrategyInvestKeep:    false,
      pviStrategyInvestLumpSum: true,
    },
    'RR baseline using invest-lump-sum mortgage strategy.'
  ),
  persona(
    'RR-strategy-invest-keep',
    'RR',
    {
      pviStrategyPrepay:        false,
      pviStrategyInvestKeep:    true,
      pviStrategyInvestLumpSum: false,
    },
    'RR baseline using invest-keep-paying mortgage strategy (default).'
  ),

  // B6: Return rate sweep
  persona(
    'RR-returns-pessimistic',
    'RR',
    { returnRate: 0.05, return401k: 0.05 },
    'RR baseline with pessimistic 5% nominal stock return.'
  ),
  persona(
    'RR-returns-optimistic',
    'RR',
    { returnRate: 0.09, return401k: 0.09 },
    'RR baseline with optimistic 9% nominal stock return.'
  ),

  // B7: Inflation sweep
  persona(
    'RR-inflation-low',
    'RR',
    { inflationRate: 0.02 },
    'RR baseline with low 2% inflation.'
  ),
  persona(
    'RR-inflation-high',
    'RR',
    { inflationRate: 0.05 },
    'RR baseline with high 5% inflation (stress scenario).'
  ),

  // B8: SS claim age sweep
  persona(
    'RR-ss-early',
    'RR',
    { ssClaimAge: 62 },
    'RR baseline claiming SS early at 62.'
  ),
  persona(
    'RR-ss-fra',
    'RR',
    { ssClaimAge: 67 },
    'RR baseline claiming SS at full retirement age 67.'
  ),

  // B9: endAge sweep
  persona(
    'RR-endage-90',
    'RR',
    { endAge: 90 },
    'RR baseline with plan ending at age 90 (shorter horizon).'
  ),
  persona(
    'RR-endage-110',
    'RR',
    { endAge: 110 },
    'RR baseline with plan ending at age 110 (extreme longevity).'
  ),

  // B10: Rule of 55
  persona(
    'RR-rule55-enabled',
    'RR',
    {
      rule55Enabled: true,
      rule55: { enabled: true, separationAge: 54 },
      rule55SeparationAge: 54,
    },
    'RR baseline with Rule of 55 enabled — early 401k access at 55.'
  ),

  // B11: monthlySavings (stock contribution) sweep
  persona(
    'RR-savings-zero',
    'RR',
    { monthlySavings: 0 },
    'RR baseline with zero monthly stock contribution — relying on 401k + growth only.'
  ),
  persona(
    'RR-savings-high',
    'RR',
    { monthlySavings: 5000 },
    'RR baseline with high monthly stock contribution of $5,000.'
  ),

  // B12: Buffer sweep
  persona(
    'RR-buffer-aggressive',
    'RR',
    { bufferUnlock: 1.5, bufferSS: 1.5, terminalBuffer: 3.0 },
    'RR baseline with aggressive buffers (1.5x pre-SS, 3.0x terminal).'
  ),
  persona(
    'RR-buffer-lean',
    'RR',
    { bufferUnlock: 1.0, bufferSS: 1.0, terminalBuffer: 1.0 },
    'RR baseline with lean buffer floor of 1.0x across all phases.'
  ),

  // B13: taxTrad sweep
  persona(
    'RR-tax-trad-low',
    'RR',
    { taxTrad: 0.10 },
    'RR baseline with low 10% marginal rate at withdrawal.'
  ),
  persona(
    'RR-tax-trad-high',
    'RR',
    { taxTrad: 0.25 },
    'RR baseline with high 25% marginal rate at withdrawal.'
  ),

  // ---------------------------------------------------------------------------
  // Group C: Generic single-person personas (~10 cells)
  // ---------------------------------------------------------------------------

  persona(
    'Generic-single-fresh',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,       // no stale person2 data
      ageRebecca:       undefined,
      agePerson2:       undefined,
      rebeccaStocks:    undefined,
      ssRebeccaOwn:     0,
    },
    'Generic single-person scenario with no person2 data (fresh state). Tests INV-09 is non-issue.'
  ),
  persona(
    'Generic-single-stale',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    50000,   // stale data from prior couple mode — regression for INV-09
      ageRebecca:       undefined,
      agePerson2:       undefined,
      rebeccaStocks:    undefined,
      ssRebeccaOwn:     0,
    },
    'Generic single-person but person2Stocks=$50k preserved from prior couple mode. Regression for feature 019 INV-09.'
  ),
  persona(
    'Generic-single-frugal',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      annualSpend:      40000,
      annualIncome:     80000,
    },
    'Generic single-person frugal scenario — $40k spend, $80k income.'
  ),
  persona(
    'Generic-single-high-income',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      annualSpend:      60000,
      annualIncome:     200000,
    },
    'Generic single-person high income ($200k) scenario.'
  ),
  persona(
    'Generic-single-no-mortgage',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      mortgageEnabled:  false,
      annualSpend:      45000,
    },
    'Generic single-person, renting, no mortgage.'
  ),
  persona(
    'Generic-single-already-own',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      mortgageEnabled:  true,
      mtgBuyInYears:    0,
      mtgYearsPaid:     10,
    },
    'Generic single-person, already owns home 10 years in.'
  ),

  // ---------------------------------------------------------------------------
  // Group D: Generic couple personas (~15 cells)
  // ---------------------------------------------------------------------------

  persona(
    'Generic-couple-us-baseline',
    'Generic',
    {},
    'Generic couple in US — mirrors RR-baseline with Generic field names.'
  ),
  persona(
    'Generic-couple-frugal',
    'Generic',
    { annualSpend: 50000 },
    'Generic couple frugal — $50k spend.'
  ),
  persona(
    'Generic-couple-fat',
    'Generic',
    { annualSpend: 120000 },
    'Generic couple fat-FIRE — $120k spend.'
  ),
  persona(
    'Generic-couple-young',
    'Generic',
    {
      agePerson1:       28, agePerson2: 28,
      ageRoger:         28, ageRebecca: 28,
      person1_401kTrad: 5000, person1_401kRoth: 10000,
      person1Stocks:    30000, person2Stocks: 20000,
      roger401kTrad:    5000, roger401kRoth: 10000,
      rogerStocks:      30000, rebeccaStocks: 20000,
      cashSavings:      15000,
    },
    'Generic couple at age 28, smaller starting pools.'
  ),
  persona(
    'Generic-couple-late',
    'Generic',
    {
      agePerson1:       52, agePerson2: 52,
      ageRoger:         52, ageRebecca: 52,
      person1_401kTrad: 350000, person1_401kRoth: 150000,
      person1Stocks:    600000, person2Stocks: 500000,
      roger401kTrad:    350000, roger401kRoth: 150000,
      rogerStocks:      600000, rebeccaStocks: 500000,
      cashSavings:      120000,
    },
    'Generic couple at age 52, larger pools.'
  ),
  persona(
    'Generic-couple-no-mortgage',
    'Generic',
    { mortgageEnabled: false },
    'Generic couple renting, no mortgage.'
  ),
  persona(
    'Generic-couple-prepay',
    'Generic',
    {
      pviStrategyPrepay:        true,
      pviStrategyInvestKeep:    false,
      pviStrategyInvestLumpSum: false,
      pviExtraMonthly:          500,
    },
    'Generic couple using prepay-extra mortgage strategy.'
  ),
  persona(
    'Generic-couple-ss-early',
    'Generic',
    { ssClaimAge: 62 },
    'Generic couple claiming SS early at 62.'
  ),
  persona(
    'Generic-couple-rule55',
    'Generic',
    {
      rule55Enabled:       true,
      rule55:              { enabled: true, separationAge: 54 },
      rule55SeparationAge: 54,
    },
    'Generic couple with Rule of 55 enabled.'
  ),
  persona(
    'Generic-couple-high-income',
    'Generic',
    { annualIncome: 250000 },
    'Generic couple with high household income $250k.'
  ),

  // ---------------------------------------------------------------------------
  // Group E: Country sweep (~12 cells)
  // Japan and Taiwan with representative spend levels
  // ---------------------------------------------------------------------------

  persona(
    'Generic-couple-japan-base',
    'Generic',
    { selectedScenario: 'japan', annualSpend: 50000 },
    'Generic couple in Japan, base spend ~$50k (lower cost of living).'
  ),
  persona(
    'Generic-couple-japan-frugal',
    'Generic',
    { selectedScenario: 'japan', annualSpend: 35000 },
    'Generic couple in Japan, frugal spend ~$35k.'
  ),
  persona(
    'Generic-couple-japan-fat',
    'Generic',
    { selectedScenario: 'japan', annualSpend: 80000 },
    'Generic couple in Japan, higher spend ~$80k.'
  ),
  persona(
    'Generic-single-japan',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      selectedScenario: 'japan',
      annualSpend:      30000,
    },
    'Generic single-person in Japan, ~$30k spend.'
  ),
  persona(
    'Generic-couple-taiwan-base',
    'Generic',
    { selectedScenario: 'taiwan', annualSpend: 40000 },
    'Generic couple in Taiwan, base spend ~$40k.'
  ),
  persona(
    'Generic-couple-taiwan-frugal',
    'Generic',
    { selectedScenario: 'taiwan', annualSpend: 28000 },
    'Generic couple in Taiwan, frugal spend ~$28k.'
  ),
  persona(
    'Generic-couple-taiwan-fat',
    'Generic',
    { selectedScenario: 'taiwan', annualSpend: 65000 },
    'Generic couple in Taiwan, higher spend ~$65k.'
  ),
  persona(
    'Generic-single-taiwan',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      selectedScenario: 'taiwan',
      annualSpend:      25000,
    },
    'Generic single-person in Taiwan, ~$25k spend.'
  ),
  persona(
    'Generic-couple-us-frugal',
    'Generic',
    { selectedScenario: 'us', annualSpend: 50000 },
    'Generic couple in US, frugal spend ~$50k.'
  ),
  persona(
    'Generic-couple-us-fat',
    'Generic',
    { selectedScenario: 'us', annualSpend: 120000 },
    'Generic couple in US, fat-FIRE spend ~$120k.'
  ),
  persona(
    'Generic-single-us-fresh',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      selectedScenario: 'us',
      annualSpend:      50000,
    },
    'Generic single-person in US, $50k spend (control for country sweep).'
  ),
  persona(
    'Generic-single-us-high-income',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      selectedScenario: 'us',
      annualSpend:      60000,
      annualIncome:     200000,
    },
    'Generic single-person US high-income ($200k), $60k spend.'
  ),

  // ---------------------------------------------------------------------------
  // Group F: Mortgage strategy sweep (~6 cells)
  // buying-in vs already-own × invest-keep / prepay / invest-lump-sum
  // ---------------------------------------------------------------------------

  persona(
    'RR-mtg-buying-in-invest-keep',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             2,
      pviStrategyInvestKeep:     true,
      pviStrategyPrepay:         false,
      pviStrategyInvestLumpSum:  false,
    },
    'RR buying-in-2yr + invest-keep-paying strategy (baseline).'
  ),
  persona(
    'RR-mtg-buying-in-prepay',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             2,
      pviStrategyInvestKeep:     false,
      pviStrategyPrepay:         true,
      pviStrategyInvestLumpSum:  false,
      pviExtraMonthly:           500,
    },
    'RR buying-in-2yr + prepay-extra strategy.'
  ),
  persona(
    'RR-mtg-buying-in-lump-sum',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             2,
      pviStrategyInvestKeep:     false,
      pviStrategyPrepay:         false,
      pviStrategyInvestLumpSum:  true,
    },
    'RR buying-in-2yr + invest-lump-sum strategy.'
  ),
  persona(
    'RR-mtg-already-own-invest-keep',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             0,
      mtgYearsPaid:              5,
      pviStrategyInvestKeep:     true,
      pviStrategyPrepay:         false,
      pviStrategyInvestLumpSum:  false,
    },
    'RR already-own (5yr paid) + invest-keep-paying.'
  ),
  persona(
    'RR-mtg-already-own-prepay',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             0,
      mtgYearsPaid:              5,
      pviStrategyInvestKeep:     false,
      pviStrategyPrepay:         true,
      pviStrategyInvestLumpSum:  false,
      pviExtraMonthly:           500,
    },
    'RR already-own (5yr paid) + prepay-extra.'
  ),
  persona(
    'RR-mtg-already-own-lump-sum',
    'RR',
    {
      mortgageEnabled:           true,
      mtgBuyInYears:             0,
      mtgYearsPaid:              5,
      pviStrategyInvestKeep:     false,
      pviStrategyPrepay:         false,
      pviStrategyInvestLumpSum:  true,
    },
    'RR already-own (5yr paid) + invest-lump-sum.'
  ),

  // ---------------------------------------------------------------------------
  // Group G: Edge-case personas (~8 cells)
  // ---------------------------------------------------------------------------

  persona(
    'RR-edge-zero-income',
    'RR',
    {
      annualIncome:    0,
      monthlySavings:  0,
      contrib401kTrad: 0,
      contrib401kRoth: 0,
      empMatch:        0,
      raiseRate:       0,
    },
    'Edge case: zero income — no contributions, living off pools. Tests retirement-only path.'
  ),
  persona(
    'RR-edge-already-retired',
    'RR',
    {
      ageRoger:  65, ageRebecca: 65,
      agePerson1: 65, agePerson2: 65,
      roger401kTrad: 800000, person1_401kTrad: 800000,
      roger401kRoth: 200000, person1_401kRoth: 200000,
      rogerStocks: 500000, rebeccaStocks: 400000,
      person1Stocks: 500000, person2Stocks: 400000,
      cashSavings: 80000,
      endAge: 100,
      // fireAge would equal or precede currentAge — degenerate accumulation
    },
    'Edge case: already retired (currentAge=65). Accumulation loop produces zero rows.'
  ),
  persona(
    'RR-edge-fire-at-endage',
    'RR',
    {
      ageRoger:  62, ageRebecca: 62,
      agePerson1: 62, agePerson2: 62,
      annualSpend: 200000,    // very high spend to push FIRE age to endAge
      endAge: 70,
    },
    'Edge case: FIRE age pushed to endAge boundary by extreme spend vs income.'
  ),
  persona(
    'RR-edge-rule55-fire-before-unlock',
    'RR',
    {
      rule55Enabled:       true,
      rule55:              { enabled: true, separationAge: 54 },
      rule55SeparationAge: 54,
      ageRoger:  45, ageRebecca: 45,
      agePerson1: 45, agePerson2: 45,
    },
    'Edge case: Rule of 55 enabled, FIRE happens before unlock age 59.5 — tests phase boundary.'
  ),
  persona(
    'RR-edge-no-pools',
    'RR',
    {
      roger401kTrad:    0, person1_401kTrad: 0,
      roger401kRoth:    0, person1_401kRoth: 0,
      rogerStocks:      0, rebeccaStocks: 0,
      person1Stocks:    0, person2Stocks: 0,
      cashSavings:      0,
      otherAssets:      0,
    },
    'Edge case: all pools start at zero — pure accumulation from income only.'
  ),
  persona(
    'Generic-edge-single-zero-person2',
    'Generic',
    {
      adultCount:    1,
      person2Stocks: 0,
      annualSpend:   35000,
      annualIncome:  60000,
      endAge:        95,
    },
    'Edge case: Generic single-person with minimal income ($60k) and spend ($35k).'
  ),
  persona(
    'RR-edge-high-mortgage-rate',
    'RR',
    {
      mtgRate: 0.085,
      mtgHomePrice: 800000,
      mtgDownPayment: 160000,
    },
    'Edge case: high mortgage rate 8.5% on $800k home — stress test for mortgage P&I drain.'
  ),
  persona(
    'RR-edge-cashflow-override',
    'RR',
    {
      pviCashflowOverrideEnabled: true,
      pviCashflowOverride:        5000,
    },
    'Edge case: feature 020 cash-flow override enabled at $5k/yr.'
  ),

  // ---------------------------------------------------------------------------
  // Group H: Pair-wise combinations (~20 cells)
  // Representative coverage of axis cross-products
  // ---------------------------------------------------------------------------

  // country × adultCount
  persona(
    'Generic-japan-single',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      selectedScenario: 'japan',
      annualSpend:      30000,
    },
    'Pair-wise: Japan × single-person.'
  ),
  persona(
    'Generic-taiwan-couple',
    'Generic',
    {
      adultCount:       2,
      selectedScenario: 'taiwan',
      annualSpend:      40000,
    },
    'Pair-wise: Taiwan × couple.'
  ),

  // mortgage × spend
  persona(
    'RR-mortgage-fat-spend',
    'RR',
    {
      mortgageEnabled: true,
      annualSpend:     120000,
    },
    'Pair-wise: mortgage (buying-in) × fat-FIRE spend $120k.'
  ),
  persona(
    'RR-no-mortgage-frugal',
    'RR',
    {
      mortgageEnabled: false,
      annualSpend:     50000,
    },
    'Pair-wise: no mortgage × frugal spend $50k.'
  ),

  // age × income
  persona(
    'RR-young-high-income',
    'RR',
    {
      ageRoger:    28, ageRebecca: 28,
      agePerson1:  28, agePerson2: 28,
      annualIncome: 200000,
      roger401kTrad: 10000, person1_401kTrad: 10000,
      roger401kRoth: 20000, person1_401kRoth: 20000,
      rogerStocks:  50000, rebeccaStocks: 40000,
      person1Stocks: 50000, person2Stocks: 40000,
    },
    'Pair-wise: young age 28 × high income $200k.'
  ),
  persona(
    'RR-late-low-income',
    'RR',
    {
      ageRoger:    52, ageRebecca: 52,
      agePerson1:  52, agePerson2: 52,
      annualIncome: 80000,
      roger401kTrad: 120000, person1_401kTrad: 120000,
      roger401kRoth: 40000,  person1_401kRoth: 40000,
      rogerStocks:  150000,  rebeccaStocks: 100000,
      person1Stocks: 150000, person2Stocks: 100000,
    },
    'Pair-wise: late age 52 × low income $80k — retirement funding stress.'
  ),

  // country × mortgage
  persona(
    'Generic-japan-no-mortgage',
    'Generic',
    {
      selectedScenario: 'japan',
      mortgageEnabled:  false,
      annualSpend:      45000,
    },
    'Pair-wise: Japan × no mortgage.'
  ),
  persona(
    'Generic-taiwan-mortgage',
    'Generic',
    {
      selectedScenario: 'taiwan',
      mortgageEnabled:  true,
      mtgBuyInYears:    2,
      annualSpend:      45000,
    },
    'Pair-wise: Taiwan × mortgage buying-in 2yr.'
  ),

  // SS claim age × spend
  persona(
    'RR-ss-early-fat',
    'RR',
    {
      ssClaimAge:  62,
      annualSpend: 100000,
    },
    'Pair-wise: SS early at 62 × fat spend $100k — conservative SS combined with high spend.'
  ),
  persona(
    'RR-ss-late-frugal',
    'RR',
    {
      ssClaimAge:  70,
      annualSpend: 50000,
    },
    'Pair-wise: SS delayed to 70 × frugal spend $50k.'
  ),

  // rule55 × age
  persona(
    'RR-rule55-late',
    'RR',
    {
      rule55Enabled:       true,
      rule55:              { enabled: true, separationAge: 54 },
      rule55SeparationAge: 54,
      ageRoger:  50, ageRebecca: 50,
      agePerson1: 50, agePerson2: 50,
    },
    'Pair-wise: Rule of 55 × late start age 50 — unlock at 55 close to current age.'
  ),

  // mortgage strategy × country
  persona(
    'Generic-japan-prepay',
    'Generic',
    {
      selectedScenario:          'japan',
      pviStrategyPrepay:         true,
      pviStrategyInvestKeep:     false,
      pviStrategyInvestLumpSum:  false,
      pviExtraMonthly:           300,
      annualSpend:               45000,
    },
    'Pair-wise: Japan × prepay-extra strategy.'
  ),
  persona(
    'Generic-us-lump-sum',
    'Generic',
    {
      selectedScenario:          'us',
      pviStrategyPrepay:         false,
      pviStrategyInvestKeep:     false,
      pviStrategyInvestLumpSum:  true,
    },
    'Pair-wise: US × invest-lump-sum strategy.'
  ),

  // high returns × high spend
  persona(
    'RR-optimistic-fat',
    'RR',
    {
      returnRate:  0.09,
      return401k:  0.09,
      annualSpend: 120000,
    },
    'Pair-wise: optimistic returns 9% × fat-FIRE spend $120k.'
  ),

  // pessimistic returns × frugal
  persona(
    'RR-pessimistic-frugal',
    'RR',
    {
      returnRate:  0.05,
      return401k:  0.05,
      annualSpend: 50000,
    },
    'Pair-wise: pessimistic returns 5% × frugal spend $50k.'
  ),

  // high inflation × high spend
  persona(
    'RR-inflation-fat',
    'RR',
    {
      inflationRate: 0.05,
      annualSpend:   120000,
    },
    'Pair-wise: high inflation 5% × fat-FIRE spend $120k — double stress test.'
  ),

  // no-mortgage × high savings
  persona(
    'RR-no-mtg-high-savings',
    'RR',
    {
      mortgageEnabled: false,
      monthlySavings:  5000,
      annualSpend:     60000,
    },
    'Pair-wise: no mortgage × high monthly savings $5k — maximize stock accumulation.'
  ),

  // country × ss claim
  persona(
    'Generic-japan-ss-early',
    'Generic',
    {
      selectedScenario: 'japan',
      ssClaimAge:       62,
      annualSpend:      40000,
    },
    'Pair-wise: Japan × SS early at 62.'
  ),

  // adultCount=1 × low spend × late age
  persona(
    'Generic-single-late-frugal',
    'Generic',
    {
      adultCount:       1,
      person2Stocks:    0,
      agePerson1:       52, agePerson2: 52,
      ageRoger:         52, ageRebecca: 52,
      person1_401kTrad: 250000, person1_401kRoth: 80000,
      person1Stocks:    300000, person2Stocks: 0,
      roger401kTrad:    250000, roger401kRoth: 80000,
      rogerStocks:      300000, rebeccaStocks: 0,
      cashSavings:      60000,
      annualSpend:      40000,
    },
    'Triple: Generic single × late age 52 × frugal $40k spend.'
  ),

  // prepay × late age
  persona(
    'RR-late-prepay',
    'RR',
    {
      ageRoger:    52, ageRebecca: 52,
      agePerson1:  52, agePerson2: 52,
      roger401kTrad: 350000, person1_401kTrad: 350000,
      roger401kRoth: 150000, person1_401kRoth: 150000,
      rogerStocks:  600000, rebeccaStocks: 500000,
      person1Stocks: 600000, person2Stocks: 500000,
      cashSavings:  120000,
      pviStrategyPrepay:        true,
      pviStrategyInvestKeep:    false,
      pviStrategyInvestLumpSum: false,
      pviExtraMonthly:          500,
    },
    'Pair-wise: late age 52 × prepay-extra strategy.'
  ),

];

// Validation at load time: assert no duplicate IDs and within budget.
(function validateMatrix() {
  const ids = new Set();
  for (const p of personas) {
    if (ids.has(p.id)) {
      throw new Error('[personas.js] Duplicate persona ID: ' + p.id);
    }
    ids.add(p.id);
  }
  if (personas.length > 200) {
    throw new Error('[personas.js] Persona matrix exceeds 200-cell SC-001 budget: ' + personas.length + ' cells.');
  }
})();

module.exports = { personas };
