'use strict';
// =============================================================================
// tests/unit/strategyRankerHysteresis.test.js
//
// Feature 021 — User Story 4 (T060–T062) — Strategy Ranker Hysteresis
// Spec: specs/021-tax-category-and-audit-cleanup/spec.md § US4 + FR-018
// Research: specs/021-tax-category-and-audit-cleanup/research.md § R5
//
// Verifies the ±0.05 years' equivalent score-margin hysteresis added to
// calc/strategyRanker.js. The helper `_newWinnerBeats(prev, contender,
// mode, objective, annualSpend, planYears)` is the gate: a contender must
// beat the prior winner by more than HYSTERESIS_YEARS to flip the winner.
//
// Three cases:
//   ranker-hysteresis-01: tiny margin (0.01yr equivalent) → block flip.
//   ranker-hysteresis-02: real margin (1.0yr equivalent) → allow flip.
//   ranker-hysteresis-03: first-call (no prevWinner) → no hysteresis.
//
// CommonJS (Constitution Principle V).
// =============================================================================

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');

const RANKER_PATH = path.resolve(__dirname, '..', '..', 'calc', 'strategyRanker.js');
const ranker = require(RANKER_PATH);

const { _newWinnerBeats, HYSTERESIS_YEARS } = ranker;

// ---------------------------------------------------------------------------
// Sanity: module exports the helper and constant.
// ---------------------------------------------------------------------------

test('strategyRanker exposes _newWinnerBeats helper and HYSTERESIS_YEARS constant', () => {
  assert.strictEqual(typeof _newWinnerBeats, 'function',
    '_newWinnerBeats must be exported from calc/strategyRanker.js');
  assert.strictEqual(typeof HYSTERESIS_YEARS, 'number',
    'HYSTERESIS_YEARS must be exported');
  assert.strictEqual(HYSTERESIS_YEARS, 0.05,
    'Per FR-018 + research R5, HYSTERESIS_YEARS = 0.05');
});

// ---------------------------------------------------------------------------
// ranker-hysteresis-01: tiny perturbation does not flip winner.
//
// Synthetic state: prevWinner has endBalance=$1,000,000.
// New contender has endBalance=$1,000,800 → +$800 → 0.01yr at $80k spend.
// 0.01 < HYSTERESIS_YEARS (0.05) → flip blocked → _newWinnerBeats returns false.
// ---------------------------------------------------------------------------

test('ranker-hysteresis-01: tiny endBalance perturbation (0.01yr equivalent) does not flip winner', () => {
  const annualSpend = 80000;
  const prevWinner = {
    strategyId:               'trad-first',
    endOfPlanNetWorthReal:    1000000,
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40), // planYears proxy
  };
  const newContender = {
    strategyId:               'bracket-fill-smoothed',
    endOfPlanNetWorthReal:    1000800,    // +$800 ≈ 0.01yr × $80k
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  const beats = _newWinnerBeats(
    prevWinner, newContender,
    'safe', 'leave-more-behind',
    annualSpend
  );
  assert.strictEqual(beats, false,
    'Hysteresis must block a contender that beats by only 0.01yr equivalent (< 0.05yr threshold).');
});

// ---------------------------------------------------------------------------
// ranker-hysteresis-02: real winner change passes hysteresis.
//
// New contender beats by $80,000 → 1.0yr at $80k spend → 1.0 > 0.05 → flip allowed.
// ---------------------------------------------------------------------------

test('ranker-hysteresis-02: real margin (1.0yr equivalent) passes hysteresis and flips winner', () => {
  const annualSpend = 80000;
  const prevWinner = {
    strategyId:               'trad-first',
    endOfPlanNetWorthReal:    1000000,
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  const newContender = {
    strategyId:               'bracket-fill-smoothed',
    endOfPlanNetWorthReal:    1080000,    // +$80,000 = 1.0yr × $80k
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  const beats = _newWinnerBeats(
    prevWinner, newContender,
    'safe', 'leave-more-behind',
    annualSpend
  );
  assert.strictEqual(beats, true,
    'Hysteresis must allow a contender that beats by 1.0yr equivalent (well above 0.05yr threshold).');
});

// ---------------------------------------------------------------------------
// ranker-hysteresis-03: first-call no hysteresis.
//
// When prevWinner is null/undefined (first ranking call), hysteresis is
// skipped entirely — the contender always "beats" a non-existent prior winner.
// ---------------------------------------------------------------------------

test('ranker-hysteresis-03: first-call (no prevWinner) skips hysteresis and accepts contender', () => {
  const annualSpend = 80000;
  const newContender = {
    strategyId:               'bracket-fill-smoothed',
    endOfPlanNetWorthReal:    1000050,
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  // null prevWinner
  const beatsNull = _newWinnerBeats(
    null, newContender,
    'safe', 'leave-more-behind',
    annualSpend
  );
  assert.strictEqual(beatsNull, true,
    'First call (prevWinner=null) must always return true — no hysteresis applied.');

  // undefined prevWinner
  const beatsUndef = _newWinnerBeats(
    undefined, newContender,
    'safe', 'leave-more-behind',
    annualSpend
  );
  assert.strictEqual(beatsUndef, true,
    'First call (prevWinner=undefined) must always return true.');
});

// ---------------------------------------------------------------------------
// Bonus: tax-objective sort key uses cumulativeFederalTax asc — verify
// hysteresis converts tax delta to years via avg-annual-tax normalization.
// ---------------------------------------------------------------------------

test('ranker-hysteresis-04: tax-objective tax-delta below threshold blocks flip', () => {
  const annualSpend = 80000;
  // 40-year plan, $250k cumulative tax → avg $6,250/yr.
  // 0.01yr equivalent = $62.50; 0.05yr = $312.50.
  const prevWinner = {
    strategyId:               'trad-first',
    endOfPlanNetWorthReal:    1000000,
    cumulativeFederalTaxReal: 250000,
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  const newContender = {
    strategyId:               'bracket-fill-smoothed',
    endOfPlanNetWorthReal:    1000000,
    cumulativeFederalTaxReal: 249938,    // saves only $62 ≈ 0.01yr of tax
    residualAreaReal:         30000000,
    perYearRows:              new Array(40),
  };
  const beats = _newWinnerBeats(
    prevWinner, newContender,
    'safe', 'retire-sooner-pay-less-tax',
    annualSpend
  );
  assert.strictEqual(beats, false,
    'Hysteresis must block a $62 tax saving (~0.01yr) when threshold is 0.05yr.');
});
