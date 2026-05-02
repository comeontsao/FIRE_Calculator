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
// Feature 022 — User Story 5 (T071–T073) — Strategy Ranker Quantize-to-Monthly
// Spec: specs/022-nominal-dollar-display/spec.md § US5 + FR-021
// Research: specs/022-nominal-dollar-display/research.md § R5
//
// Adds three new cases that exercise the simulator-discreteness fix in
// `_simulateStrategyLifetime` (in both HTMLs). Quantizing currentAge and
// fireAge to monthly precision before the accumulation loop iterates absorbs
// the audit's ±0.01yr perturbations within the same integer-month bucket,
// so score deltas drop below the 0.05yr hysteresis threshold from
// feature 021 FR-018.
//
//   ranker-quantize-01: ±0.01yr currentAge perturbation produces stable
//                       end-pool results (proves quantization absorbs noise).
//   ranker-quantize-02: backwards-compat for integer-year inputs
//                       (currentAge=42.0, fireAge=55.0 ⇒ 13 accumulation years).
//   ranker-quantize-03: fractional-month input preserved
//                       (currentAge=42.0, fireAge=55.5 ⇒ 13.5 accumulation years
//                        from feature 020 month-precision).
//
// CommonJS (Constitution Principle V).
// =============================================================================

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');
const fs       = require('fs');

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

// =============================================================================
// Feature 022 — User Story 5 (T071–T073) — Strategy Ranker Quantize-to-Monthly
//
// These tests exercise `_simulateStrategyLifetime` (inline in both HTMLs) by
// driving `scoreAndRank` from the validation-audit harness sandbox. They
// assert that the quantize-to-monthly fix in the inner simulator absorbs
// ±0.01yr currentAge perturbations: per-strategy `endOfPlanNetWorthReal` no
// longer drifts catastrophically (multi-x) when currentAge crosses an
// integer-year boundary downward (the worst-case in research R5).
//
// Pre-fix: `accumulateToFire`'s `for (age=currentAge; age<fireAge; age++)`
// loop ran one EXTRA full accumulation year when currentAge crossed an
// integer-year boundary downward (e.g. 42.0 → 41.99 ⇒ 13 → 14 iterations) —
// flipping the ranker winner across ~17 personas in the feature 020/021
// audit's E3 LOW invariant.
//
// Post-fix: ages floor to integer-month buckets; the simulator pins
// `_qCurrentAgeForAccum = _qFireAge − floor(monthsToFire/12)` so the
// accumulation loop runs exactly that integer iteration count regardless
// of sub-month perturbation. The retirement-phase loop continues to use
// the user-meaningful quantized fireAge.
// =============================================================================

// ---- Lazy sandbox builder for the quantize tests ----
//
// Constructed via the validation-audit harness `buildHarnessContext` against
// the canonical RR-baseline persona. We then override agePerson1/agePerson2
// per test by passing a synthetic `inp` to `scoreAndRank()`. Lazy build
// avoids the harness initialization cost when only the hysteresis-04 tests
// above are running.

let _quantizeApiCache = null;
function _getQuantizeApi() {
  if (_quantizeApiCache) return _quantizeApiCache;
  const HARNESS_PATH  = path.resolve(__dirname, 'validation-audit', 'harness.js');
  const PERSONAS_PATH = path.resolve(__dirname, 'validation-audit', 'personas.js');
  const { buildHarnessContext } = require(HARNESS_PATH);
  const { personas } = require(PERSONAS_PATH);
  // Reuse the canonical RR-baseline persona — it's the same shape the audit
  // E3 invariant exercises, so we know the harness sandbox can run it
  // end-to-end. We then override agePerson1/agePerson2/fireAge per test.
  const baseline = personas.find(p => p.id === 'RR-baseline');
  if (!baseline) {
    throw new Error('[ranker-quantize] RR-baseline persona not found in personas.js');
  }
  const ctx = buildHarnessContext(baseline);
  if (!ctx || !ctx._api || typeof ctx._api.scoreAndRank !== 'function') {
    throw new Error('[ranker-quantize] harness sandbox did not expose scoreAndRank');
  }
  _quantizeApiCache = { api: ctx._api, baselineInp: baseline.inp };
  return _quantizeApiCache;
}

// Helper: run scoreAndRank with an inp override and return rows keyed by strategyId.
function _rankRowsById(api, inp, fireAge) {
  const ranking = api.scoreAndRank(inp, fireAge, 'safe', 'leave-more-behind');
  if (!ranking || !Array.isArray(ranking.rows)) return null;
  const byId = {};
  for (const r of ranking.rows) {
    byId[r.strategyId] = r;
  }
  return byId;
}

// ---------------------------------------------------------------------------
// ranker-quantize-01: ±0.01yr currentAge perturbation absorbed by monthly
// quantization.
//
// Perturbs currentAge from 42.0 → 41.99 (the −0.01yr direction that, pre-fix,
// crossed an integer-year boundary downward and produced the catastrophic
// 14-year accumulation loop instead of the expected 13). Post-fix, both
// ages produce IDENTICAL accumulation iteration counts because the
// `_qCurrentAgeForAccum = _qFireAge − floor(monthsToFire/12)` pin returns
// the same integer-year delta for both.
//
// We assert: per-strategy `endOfPlanNetWorthReal` matches within $0.01
// across the perturbation. Pre-fix the relative delta is tens of percent
// (multi-x for some pools); post-fix it should be exactly zero.
// ---------------------------------------------------------------------------

test('ranker-quantize-01: ±0.01yr currentAge perturbation absorbed by monthly quantization', () => {
  const { api, baselineInp } = _getQuantizeApi();
  const fireAge = 55.0;

  const inpA = Object.assign({}, baselineInp, {
    agePerson1: 42.0,  agePerson2: 42.0,
    ageRoger:   42.0,  ageRebecca: 42.0,
  });
  // -0.01yr perturbation: pre-fix triggered the catastrophic 14-iteration
  // accumulation loop. Post-fix the iteration count is pinned at 13.
  const inpB = Object.assign({}, baselineInp, {
    agePerson1: 41.99, agePerson2: 41.99,
    ageRoger:   41.99, ageRebecca: 41.99,
  });

  const rowsA = _rankRowsById(api, inpA, fireAge);
  const rowsB = _rankRowsById(api, inpB, fireAge);

  assert.ok(rowsA && rowsB, 'scoreAndRank must produce rows for both ages');

  const strategyIds = Object.keys(rowsA);
  assert.ok(strategyIds.length >= 5, 'expected at least 5 strategies in ranking');
  for (const sid of strategyIds) {
    const a = rowsA[sid].endOfPlanNetWorthReal;
    const b = rowsB[sid].endOfPlanNetWorthReal;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    assert.ok(
      Math.abs(a - b) < 0.01,
      `[${sid}] endOfPlanNetWorthReal must be byte-stable across ±0.01yr ` +
      `currentAge perturbation: 42.0 → ${a}; 41.99 → ${b}; delta=${b - a}. ` +
      `Pre-fix this delta was multi-x (catastrophic discreteness — full extra ` +
      `accumulation year at integer-year boundaries).`
    );
  }
});

// ---------------------------------------------------------------------------
// ranker-quantize-02: backwards-compat for integer-year inputs.
//
// At currentAge=42.0, fireAge=55.0 the post-fix simulator must produce
// identical iteration semantics as the pre-fix code: 13 accumulation years.
// We verify by checking that the per-strategy endOfPlanNetWorthReal is
// finite, non-negative, and the retirement perYearRows length matches the
// expected `endAge - fireAge + 1` (46 retirement rows for endAge=100).
// ---------------------------------------------------------------------------

test('ranker-quantize-02: backwards-compat for integer-year inputs (currentAge=42.0, fireAge=55.0)', () => {
  const { api, baselineInp } = _getQuantizeApi();
  const inp = Object.assign({}, baselineInp, {
    agePerson1: 42.0, agePerson2: 42.0,
    ageRoger:   42.0, ageRebecca: 42.0,
  });
  const fireAge = 55.0;

  const rows = _rankRowsById(api, inp, fireAge);
  assert.ok(rows, 'scoreAndRank must produce rows under integer-year inputs');

  const strategyIds = Object.keys(rows);
  assert.ok(strategyIds.length >= 5, 'expected at least 5 strategies in ranking');
  for (const sid of strategyIds) {
    const eb = rows[sid].endOfPlanNetWorthReal;
    assert.ok(Number.isFinite(eb), `[${sid}] endOfPlanNetWorthReal must be finite`);
    assert.ok(eb >= 0, `[${sid}] endOfPlanNetWorthReal must be >= 0; got ${eb}`);
    // Retirement-phase row count: `for (let age = _qFireAge; age <= endAge; age++)`
    // ⇒ endAge - _qFireAge + 1 rows. With fireAge=55 and endAge=100 ⇒ 46 rows.
    const expectedRows = (baselineInp.endAge || 100) - fireAge + 1;
    assert.ok(Array.isArray(rows[sid].perYearRows) && rows[sid].perYearRows.length === expectedRows,
      `[${sid}] perYearRows length must equal ${expectedRows}; got ` +
      (rows[sid].perYearRows ? rows[sid].perYearRows.length : 'null'));
  }
});

// ---------------------------------------------------------------------------
// ranker-quantize-03: fractional-month input preserved.
//
// At currentAge=42.0, fireAge=55.5 the post-fix simulator must NOT collapse
// the fractional-month component to the integer-fireAge value. The output
// must be DIFFERENT from the fireAge=55.0 case for at least one strategy,
// proving the month-precision input from feature 020 is preserved through
// the ranking pipeline.
//
// (Per US5's narrowly-scoped fix, we don't assert exact magnitude — only
// that the fractional input is not silently discarded. The full fractional
// FIRE-year semantics ship in US6 via simulateRetirementOnlySigned's
// pro-rate logic; the simulator's retirement loop in US5 still uses
// integer age stepping starting at _qFireAge.)
// ---------------------------------------------------------------------------

test('ranker-quantize-03: fractional-month input preserved (fireAge=55.5)', () => {
  const { api, baselineInp } = _getQuantizeApi();
  const inp = Object.assign({}, baselineInp, {
    agePerson1: 42.0, agePerson2: 42.0,
    ageRoger:   42.0, ageRebecca: 42.0,
  });

  const rowsInt  = _rankRowsById(api, inp, 55.0);
  const rowsHalf = _rankRowsById(api, inp, 55.5);

  assert.ok(rowsInt && rowsHalf, 'scoreAndRank must produce rows for both fireAge inputs');

  const strategyIds = Object.keys(rowsHalf);
  for (const sid of strategyIds) {
    const eb = rowsHalf[sid].endOfPlanNetWorthReal;
    assert.ok(Number.isFinite(eb),
      `[${sid}] endOfPlanNetWorthReal must be finite under fireAge=55.5; got ${eb}`);
  }

  // Quantization preserves fractional-month input: at least one strategy
  // must produce a different endBalance for fireAge=55.5 vs 55.0 (the
  // differing values come from the different retirement loop start age
  // and the resulting compound trajectory).
  let anyDiffer = false;
  for (const sid of strategyIds) {
    const intEB  = rowsInt[sid]  ? rowsInt[sid].endOfPlanNetWorthReal  : null;
    const halfEB = rowsHalf[sid] ? rowsHalf[sid].endOfPlanNetWorthReal : null;
    if (intEB == null || halfEB == null) continue;
    if (Math.abs(intEB - halfEB) > 1) { anyDiffer = true; break; }
  }
  assert.ok(
    anyDiffer,
    'fireAge=55.5 must produce DIFFERENT endOfPlanNetWorthReal from fireAge=55.0 ' +
    'for at least one strategy (proves fractional-month component is not silently collapsed)'
  );
});
