// ==================== TEST SUITE: payoffVsInvest calc module ====================
// Feature 016 — Mortgage Payoff vs Invest comparison.
// Contract: specs/016-mortgage-payoff-vs-invest/contracts/payoffVsInvest-calc.contract.md
// Locks in SC-002 (monotonicity), SC-003 (tie calibration), SC-008 (winner
// detection), SC-009 (refi visible jump), SC-010 (override shifts toward invest).
//
// Feature 017 addendum (T003): Inv-1 regression lock.
// lumpSumPayoff: false is now EXPLICIT on every existing fixture call so future
// readers can see the v1-parity contract at a glance. The assertV1ParityWhenSwitchOff
// helper + parity test block at the bottom enforce that no v2 change drifts the
// output when lumpSumPayoff is false and ownership !== 'buying-in'.
//
// Feature 018 addendum (T003): V3 backward-compat update.
// mortgageStrategy: 'invest-keep-paying' is now EXPLICIT on the shared baseInputs()
// factory so every existing test documents the v3 default it exercises.
// The parity helper is renamed assertV2ParityForBackCompat and now compares only
// the V2_PARITY_KEYS whitelist, so future v3 additive output keys do not break it.
// ==================================================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const _payoffVsInvestApi = require(path.resolve(__dirname, '..', '..', 'calc', 'payoffVsInvest.js'));
const { computePayoffVsInvest, _normalizeStrategy } = _payoffVsInvestApi;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function baseMortgage(overrides) {
  return Object.assign({
    ownership: 'buying-now',
    homePrice: 500000,
    downPayment: 100000,   // → balance = 400000
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
  // lumpSumPayoff: false is explicit here to document the v2-parity contract.
  // Inv-1 (feature 017): when lumpSumPayoff===false AND ownership!=='buying-in',
  // every v2 output field must be byte-for-byte identical to this v2 baseline.
  //
  // mortgageStrategy: 'invest-keep-paying' is explicit here to document the v3
  // default. Feature 018 T003: when mortgageStrategy==='invest-keep-paying' AND
  // ownership!=='buying-in' AND sellAtFire===false, every v2 output field must
  // be byte-for-byte identical to the captured v2 ground-truth snapshots.
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
// Inv-1 regression helpers (feature 017 / T003; updated feature 018 / T003)
// ---------------------------------------------------------------------------

/**
 * Load the v2 snapshot fixtures captured before any v3 changes were made.
 * The JSON file is the ground truth that v3 must reproduce when the switch
 * is off (mortgageStrategy: 'invest-keep-paying', ownership !== 'buying-in',
 * sellAtFire === false).
 */
const V1_SNAPSHOTS = require(path.resolve(__dirname, 'fixtures', 'payoffVsInvest_v1Snapshots.json'));

/**
 * Whitelist of v2 output key names compared by the parity helper.
 *
 * These are the top-level fields present in payoffVsInvest_v1Snapshots.json.
 * Future v3 (and later) additive keys — homeSaleEvent, postSaleBrokerageAtFire,
 * mortgageActivePayoffAge — are intentionally excluded here so they do not
 * break the backwards-compat diff when the Backend agent adds them.
 *
 * subSteps is excluded: per feature 017's existing approach, subSteps are
 * observability-only and are not captured in the snapshot output payloads.
 */
const V2_PARITY_KEYS = [
  'prepayPath',
  'investPath',
  'amortizationSplit',
  'verdict',
  'factors',
  'crossover',
  'refiAnnotation',
  'refiClampedNote',
  'mortgageFreedom',
  'mortgageNaturalPayoff',
  'lumpSumEvent',
  'stageBoundaries',
];

/**
 * Assert that computing `inputs` with the CURRENT module produces output
 * identical to `capturedV2Output` for every key in V2_PARITY_KEYS.
 *
 * Using a whitelist (not iterating all keys in the snapshot) means that
 * future additive v3/v4 output keys never cause spurious failures here —
 * only the locked v2 surface is compared. A blacklist approach would require
 * updating this helper every time a new key is added, which is error-prone.
 *
 * Reports specific field paths on mismatch so diffs are easy to diagnose.
 *
 * @param {string} label               human-readable name for the fixture
 * @param {object} inputs              inputs to run through computePayoffVsInvest
 * @param {object} capturedV2Output    the v2 ground-truth output from the snapshot
 */
function assertV2ParityForBackCompat(label, inputs, capturedV2Output) {
  const current = computePayoffVsInvest(inputs);

  // Compare only the whitelisted v2 keys, not every key in the snapshot.
  for (const key of V2_PARITY_KEYS) {
    // Skip keys not present in the captured snapshot (e.g. lumpSumEvent /
    // stageBoundaries were added in v2 and may be absent from older fixtures).
    if (!(key in capturedV2Output)) continue;

    const snapVal = capturedV2Output[key];
    const curVal = current[key];
    const snapJson = JSON.stringify(snapVal);
    const curJson = JSON.stringify(curVal);
    if (snapJson !== curJson) {
      // Produce a precise diff for array fields: find first diverging index.
      if (Array.isArray(snapVal) && Array.isArray(curVal)) {
        for (let i = 0; i < Math.max(snapVal.length, curVal.length); i++) {
          const snapItem = JSON.stringify(snapVal[i]);
          const curItem = JSON.stringify(curVal[i]);
          if (snapItem !== curItem) {
            // Dig into object fields for the first row mismatch.
            if (snapVal[i] && curVal[i] && typeof snapVal[i] === 'object') {
              for (const field of Object.keys(snapVal[i])) {
                if (snapVal[i][field] !== curVal[i][field]) {
                  assert.fail(
                    `[Inv-1 parity] "${label}" — ${key}[${i}].${field} mismatch: ` +
                    `snapshot=${snapVal[i][field]} vs current=${curVal[i] ? curVal[i][field] : 'MISSING'}`
                  );
                }
              }
            }
            assert.fail(
              `[Inv-1 parity] "${label}" — ${key}[${i}] mismatch:\n  snapshot=${snapItem}\n  cur=${curItem}`
            );
          }
        }
      }
      // For objects, find first diverging property.
      if (snapVal && curVal && typeof snapVal === 'object' && !Array.isArray(snapVal)) {
        for (const field of Object.keys(snapVal)) {
          if (JSON.stringify(snapVal[field]) !== JSON.stringify(curVal[field])) {
            assert.fail(
              `[Inv-1 parity] "${label}" — ${key}.${field} mismatch: ` +
              `snapshot=${JSON.stringify(snapVal[field])} vs current=${JSON.stringify(curVal[field])}`
            );
          }
        }
      }
      // Scalar or anything else.
      assert.fail(
        `[Inv-1 parity] "${label}" — top-level field "${key}" mismatch:\n  snapshot=${snapJson}\n  cur=${curJson}`
      );
    }
  }
}

// Backwards-compat alias — existing call sites using the v017 name still work.
const assertV1ParityWhenSwitchOff = assertV2ParityForBackCompat;

// ---------------------------------------------------------------------------
// SC-008 — winner detection in clear cases
// ---------------------------------------------------------------------------

test('Prepay clearly wins when mortgage rate >> stocks return', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.08 }),
    stocksReturn: 0.04,
  });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.disabledReason, undefined, 'should not be disabled');
  assert.strictEqual(out.verdict.winnerAtFire, 'prepay',
    `expected prepay to win at FIRE; got ${out.verdict.winnerAtFire} ` +
    `(prepay total=${out.prepayPath.find(r=>r.age===inputs.fireAge).totalNetWorth}, ` +
    `invest total=${out.investPath.find(r=>r.age===inputs.fireAge).totalNetWorth})`);
  assert.strictEqual(out.verdict.winnerAtEnd, 'prepay');
});

test('Invest clearly wins when stocks return >> mortgage rate', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.03 }),
    stocksReturn: 0.08,
  });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.disabledReason, undefined);
  assert.strictEqual(out.verdict.winnerAtFire, 'invest');
  assert.strictEqual(out.verdict.winnerAtEnd, 'invest');
});

// ---------------------------------------------------------------------------
// SC-003 — tie calibration when real spread is ~0
// ---------------------------------------------------------------------------

test('Tie calibration: when after-tax-real-stocks ≈ real-mortgage, margin is small', () => {
  // Nominal stocks 6.0%, infl 3.0%, LTCG 15%, stockGainPct 60%
  //   real stocks = 3.0%, after-tax-drag = 1 - 0.09 = 0.91
  //   after-tax-real-stocks = 2.73%
  // We want mortgage real rate to match: 2.73% real = 5.73% nominal.
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.0573 }),
    stocksReturn: 0.06,
    inflation: 0.03,
    ltcgRate: 0.15,
    stockGainPct: 0.6,
  });
  const out = computePayoffVsInvest(inputs);
  const fireP = out.prepayPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  const fireI = out.investPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  const margin = Math.abs(fireP - fireI);
  const max = Math.max(fireP, fireI);
  // 5% tolerance — we're claiming "near-tie", not bit-perfect tie.
  assert.ok(margin / max < 0.05,
    `expected near-tie (margin/max < 5%); got margin=${margin}, max=${max}, ratio=${margin/max}`);
});

// ---------------------------------------------------------------------------
// SC-009 — refi mid-window produces visible interest jump and shifts verdict
// ---------------------------------------------------------------------------

test('SC-009: refi mid-window — interest curve has a visible jump at refi-year', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.07 }),
    stocksReturn: 0.07,
    plannedRefi: { refiYear: 5, newRate: 0.04, newTerm: 30 },
  });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.refiAnnotation, 'refiAnnotation should be present when plannedRefi is set');
  assert.strictEqual(out.refiAnnotation.refiAge, inputs.currentAge + 5);

  // The Invest path's interest schedule resets at year 5 — interest paid in
  // year 5 should NOT be much lower than year 4 (because the new amortization
  // is also interest-heavy at month 1). It MAY be slightly lower since the
  // rate dropped from 7% to 4%, but the year-5 interest is meaningfully
  // different from what year-5 would have been WITHOUT the refi (where
  // amortization continues normally).
  const investAmort = out.amortizationSplit.invest;
  const year4i = investAmort.find((r) => r.year === 4).interestPaidThisYear;
  const year5i = investAmort.find((r) => r.year === 5).interestPaidThisYear;
  // year5 should be lower than year4 (rate dropped) but the curve continues.
  // Just assert non-zero and that the schedule is computing sensibly.
  assert.ok(year5i > 0, 'interest still paid in year after refi');
  assert.ok(year5i < year4i, 'rate dropped from 7% to 4%, so year-5 interest should be lower');

  // Verdict: refi to lower rate should shift verdict toward invest vs no-refi
  const noRefi = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ rate: 0.07 }),
    stocksReturn: 0.07,
  }));
  const fireP_ref = out.prepayPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  const fireI_ref = out.investPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  const fireP_no  = noRefi.prepayPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  const fireI_no  = noRefi.investPath.find((r) => r.age === inputs.fireAge).totalNetWorth;
  // Spread (invest − prepay) should be MORE positive (or less negative) with refi
  const spreadRef = fireI_ref - fireP_ref;
  const spreadNo  = fireI_no  - fireP_no;
  assert.ok(spreadRef >= spreadNo - 1,
    `refi should shift verdict toward invest. spread_with_refi=${spreadRef}, spread_no_refi=${spreadNo}`);
});

// ---------------------------------------------------------------------------
// SC-010 — effective-rate override shifts verdict toward Invest
// ---------------------------------------------------------------------------

test('SC-010: effective-rate override below nominal shifts verdict toward Invest', () => {
  const baseline = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ rate: 0.06 }),
    stocksReturn: 0.07,
    effectiveRateOverride: null,
  }));
  const overridden = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ rate: 0.06 }),
    stocksReturn: 0.07,
    effectiveRateOverride: 0.04, // user's economic mortgage cost is 4%, not 6%
  }));
  // The override should appear in the factors list
  const overrideFactor = overridden.factors.find((f) => f.key === 'effective-mortgage-rate');
  assert.ok(overrideFactor, 'effective-mortgage-rate factor row must appear when override is active');
  assert.strictEqual(overrideFactor.favoredStrategy, 'invest',
    'override below nominal should favor invest in the factor breakdown');

  // The verdict's real-spread factor magnitude should also reflect the shift.
  // We don't assert verdict winner directly because the override is verdict-
  // narrative-only (per research.md R4): the schedule still uses 6% nominal,
  // so the simulated trajectory is the same. The factor row + spread is what
  // exposes the shift to the user.
  const baselineSpread = baseline.factors.find((f) => f.key === 'real-spread').rawValue;
  const overriddenSpread = overridden.factors.find((f) => f.key === 'real-spread').rawValue;
  assert.ok(overriddenSpread > baselineSpread,
    `override should INCREASE the real-spread (favor invest): baseline=${baselineSpread}, with override=${overriddenSpread}`);
});

// ---------------------------------------------------------------------------
// Disabled paths
// ---------------------------------------------------------------------------

test('disabled: mortgageEnabled=false → disabledReason="no-mortgage"', () => {
  const out = computePayoffVsInvest(baseInputs({ mortgageEnabled: false, mortgage: null }));
  assert.strictEqual(out.disabledReason, 'no-mortgage');
  assert.strictEqual(out.prepayPath.length, 0);
  assert.strictEqual(out.investPath.length, 0);
});

test('disabled: already-paid-off → disabledReason="already-paid-off"', () => {
  const out = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ ownership: 'already-own', yearsPaid: 30, term: 30 }),
  }));
  assert.strictEqual(out.disabledReason, 'already-paid-off');
});

test('disabled: invalid ages (fireAge >= endAge) → disabledReason="invalid-ages"', () => {
  const out = computePayoffVsInvest(baseInputs({ fireAge: 99, endAge: 99 }));
  assert.strictEqual(out.disabledReason, 'invalid-ages');
});

// ---------------------------------------------------------------------------
// Refi clamping
// ---------------------------------------------------------------------------

test('Refi clamped to buy-in year when refi-year is before buy-in', () => {
  const out = computePayoffVsInvest(baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 5 }),
    plannedRefi: { refiYear: 3, newRate: 0.04, newTerm: 30 },
  }));
  assert.ok(out.refiAnnotation, 'refi annotation present');
  // Effective refi-age = currentAge (42) + clampedRefiYear (5) = 47
  assert.strictEqual(out.refiAnnotation.refiAge, 47);
  assert.ok(out.refiClampedNote, 'should expose a clamp note for the renderer');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('Determinism: same inputs called twice produce byte-identical output', () => {
  const inputs = baseInputs();
  const out1 = computePayoffVsInvest(inputs);
  const out2 = computePayoffVsInvest(inputs);
  assert.strictEqual(JSON.stringify(out1), JSON.stringify(out2));
});

// ---------------------------------------------------------------------------
// SC-002 — monotonicity in extraMonthly (with invest-winning inputs)
// ---------------------------------------------------------------------------

test('SC-002: with invest-winning inputs, larger extraMonthly produces larger margin (monotone)', () => {
  const mkInp = (extra) => baseInputs({
    mortgage: baseMortgage({ rate: 0.03 }),
    stocksReturn: 0.08,
    extraMonthly: extra,
  });
  const m0    = computePayoffVsInvest(mkInp(0));
  const m1000 = computePayoffVsInvest(mkInp(1000));
  const m2000 = computePayoffVsInvest(mkInp(2000));
  assert.ok(m1000.verdict.marginAtFire >= m0.verdict.marginAtFire - 1,
    `1000>=0 monotone: ${m1000.verdict.marginAtFire} vs ${m0.verdict.marginAtFire}`);
  assert.ok(m2000.verdict.marginAtFire >= m1000.verdict.marginAtFire - 1,
    `2000>=1000 monotone: ${m2000.verdict.marginAtFire} vs ${m1000.verdict.marginAtFire}`);
});

// ---------------------------------------------------------------------------
// Output shape sanity
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Brokerage contribution field — apples-to-apples cash-outlay invariant.
// Added 2026-04-28 to fix the "Where each dollar goes" chart fairness:
// during mortgage years the Invest path's extra-to-brokerage was invisible.
// ---------------------------------------------------------------------------

test('brokerage contrib field is present and non-negative on every row of both paths', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  const allRows = [].concat(out.amortizationSplit.prepay, out.amortizationSplit.invest);
  for (const r of allRows) {
    assert.ok(Number.isFinite(r.brokerageContribThisYear),
      `brokerageContribThisYear must be finite, got ${r.brokerageContribThisYear} at age ${r.age}`);
    assert.ok(r.brokerageContribThisYear >= 0,
      `brokerageContribThisYear must be >= 0, got ${r.brokerageContribThisYear} at age ${r.age}`);
  }
});

test('apples-to-apples invariant: same total annual cash outlay both strategies', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  const P = out.amortizationSplit.prepay;
  const I = out.amortizationSplit.invest;
  assert.strictEqual(P.length, I.length);
  for (let i = 0; i < P.length; i++) {
    const totalP = P[i].interestPaidThisYear + P[i].principalPaidThisYear + P[i].brokerageContribThisYear;
    const totalI = I[i].interestPaidThisYear + I[i].principalPaidThisYear + I[i].brokerageContribThisYear;
    assert.ok(Math.abs(totalP - totalI) <= 1,
      `apples-to-apples violated at index ${i} (age ${P[i].age}): prepay=${totalP}, invest=${totalI}, diff=${totalP - totalI}`);
  }
});

test('prepay brokerage contrib is 0 during mortgage years, then jumps to freed cash flow + extra post-payoff', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  const prepayPath = out.prepayPath;
  const amortPrepay = out.amortizationSplit.prepay;
  // Locate the first index where Prepay's mortgage balance is fully paid.
  let firstPaidOff = -1;
  for (let i = 0; i < prepayPath.length; i++) {
    if (prepayPath[i].mortgageBalance <= 0) { firstPaidOff = i; break; }
  }
  assert.ok(firstPaidOff > 0, 'Prepay should pay off mortgage before end of horizon');

  // Before payoff: brokerage contrib should be 0 every year.
  for (let i = 0; i < firstPaidOff; i++) {
    assert.strictEqual(amortPrepay[i].brokerageContribThisYear, 0,
      `prepay row ${i} (age ${amortPrepay[i].age}) should have $0 brokerage contrib while mortgage active; got ${amortPrepay[i].brokerageContribThisYear}`);
  }

  // After payoff: brokerage contrib = 12 × (contractualMonthlyPI + extraMonthly).
  // We can derive contractualMonthlyPI from the standard amortization:
  // Balance = 400000, rate = 0.06, term = 30y → monthlyPI ~= 2398.20.
  // But we don't need to re-derive — we can sample a strictly post-payoff row
  // and assert that its contrib equals 12 × (contractualPI + extraMonthly)
  // by checking it matches the Invest path's mortgage-active extra (which we
  // know to be 12 × extraMonthly) PLUS 12 × contractualPI.
  // Simpler: assert the prepay post-payoff row equals the invest post-payoff
  // row's contrib (both redirect freed cash flow, identical contract).
  const amortInvest = out.amortizationSplit.invest;
  // Find an index where BOTH paths are post-payoff.
  let bothPostPayoff = -1;
  for (let i = firstPaidOff; i < prepayPath.length; i++) {
    if (out.investPath[i].mortgageBalance <= 0) { bothPostPayoff = i; break; }
  }
  if (bothPostPayoff !== -1) {
    assert.ok(amortPrepay[bothPostPayoff].brokerageContribThisYear > 12 * 1500,
      `post-payoff prepay contrib should exceed 12 × extraMonthly (${12 * 1500}); got ${amortPrepay[bothPostPayoff].brokerageContribThisYear}`);
  }
});

test('invest brokerage contrib equals 12 × extraMonthly during mortgage-active years', () => {
  const extra = 1500;
  const inputs = baseInputs({ extraMonthly: extra });
  const out = computePayoffVsInvest(inputs);
  const amortInvest = out.amortizationSplit.invest;
  const investPath = out.investPath;
  for (let i = 0; i < investPath.length; i++) {
    if (investPath[i].mortgageBalance > 0) {
      const expected = 12 * extra;
      const actual = amortInvest[i].brokerageContribThisYear;
      assert.ok(Math.abs(actual - expected) <= 1,
        `invest row ${i} (age ${amortInvest[i].age}) during mortgage-active year: expected ${expected}, got ${actual}`);
    }
  }
});

test('buying-in path: no pre-buy-in rows — path starts at windowStartAge = currentAge + buyInYears', () => {
  // v2 (T008): pre-buy-in rows are excluded entirely. The comparison window
  // starts at the buy-in age. This test was updated from its v1 form (which
  // checked that pre-buy-in rows had 12×extra brokerage contrib) to verify the
  // absence of those rows and the correct window start.
  const extra = 1500;
  const buyInYears = 3;
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears }),
    extraMonthly: extra,
  });
  const out = computePayoffVsInvest(inputs);
  const expectedStartAge = inputs.currentAge + buyInYears; // 45
  // Path starts at windowStartAge — no pre-buy-in rows.
  assert.strictEqual(out.prepayPath[0].age, expectedStartAge,
    `prepayPath[0].age should be ${expectedStartAge}, got ${out.prepayPath[0].age}`);
  assert.strictEqual(out.investPath[0].age, expectedStartAge,
    `investPath[0].age should be ${expectedStartAge}, got ${out.investPath[0].age}`);
  assert.strictEqual(out.amortizationSplit.prepay[0].age, expectedStartAge,
    `amortizationSplit.prepay[0].age should be ${expectedStartAge}`);
  assert.strictEqual(out.amortizationSplit.invest[0].age, expectedStartAge,
    `amortizationSplit.invest[0].age should be ${expectedStartAge}`);
  // Invest path: brokerage contrib equals 12 × extra during mortgage-active years.
  const amortInvest = out.amortizationSplit.invest;
  for (let i = 0; i < out.investPath.length; i++) {
    if (out.investPath[i].mortgageBalance > 0) {
      assert.ok(Math.abs(amortInvest[i].brokerageContribThisYear - 12 * extra) <= 1,
        `invest row ${i} (age ${amortInvest[i].age}) during mortgage-active year: expected ${12 * extra}, got ${amortInvest[i].brokerageContribThisYear}`);
    }
  }
});

// ---------------------------------------------------------------------------
// freeAndClearWealth + mortgageFreedom — added 2026-04-28.
// The Payoff-vs-Invest pill now plots `freeAndClearWealth = invested -
// mortgageBalanceReal` instead of totalNetWorth. The age where this metric
// first crosses ≥ 0 is the strategy's "mortgage freedom" age.
// ---------------------------------------------------------------------------

test('freeAndClearWealth field is present and equals invested − mortgageBalanceReal for every row', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  for (const row of out.prepayPath) {
    assert.ok(Number.isFinite(row.freeAndClearWealth),
      `prepayPath freeAndClearWealth must be finite at age ${row.age}, got ${row.freeAndClearWealth}`);
    const expected = row.invested - row.mortgageBalanceReal;
    assert.ok(Math.abs(row.freeAndClearWealth - expected) <= 1,
      `prepayPath age ${row.age}: freeAndClearWealth=${row.freeAndClearWealth}, expected ~${expected} (invested=${row.invested}, mortgageBalanceReal=${row.mortgageBalanceReal})`);
  }
  for (const row of out.investPath) {
    assert.ok(Number.isFinite(row.freeAndClearWealth),
      `investPath freeAndClearWealth must be finite at age ${row.age}, got ${row.freeAndClearWealth}`);
    const expected = row.invested - row.mortgageBalanceReal;
    assert.ok(Math.abs(row.freeAndClearWealth - expected) <= 1,
      `investPath age ${row.age}: freeAndClearWealth=${row.freeAndClearWealth}, expected ~${expected} (invested=${row.invested}, mortgageBalanceReal=${row.mortgageBalanceReal})`);
  }
});

test("Prepay's mortgageFreedomAge equals its natural mortgage payoff age", () => {
  const inputs = baseInputs({ extraMonthly: 500 });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageFreedom, 'mortgageFreedom must be present in output');
  // Find the natural payoff age in prepayPath: first index where mortgageBalance <= 0.
  let naturalPayoffAge = null;
  for (let i = 0; i < out.prepayPath.length; i++) {
    if (out.prepayPath[i].mortgageBalance <= 0) {
      naturalPayoffAge = out.prepayPath[i].age;
      break;
    }
  }
  assert.ok(naturalPayoffAge !== null,
    'Prepay must pay off mortgage within horizon for this assertion to be meaningful');
  assert.strictEqual(out.mortgageFreedom.prepayAge, naturalPayoffAge,
    `prepay freedom age should match natural payoff age; got ${out.mortgageFreedom.prepayAge}, expected ${naturalPayoffAge}`);
});

test('High-stocks-spread scenario: Invest reaches freedom strictly before Prepay', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.03 }),
    stocksReturn: 0.10,
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageFreedom, 'mortgageFreedom must be present');
  assert.ok(out.mortgageFreedom.investAge !== null && out.mortgageFreedom.prepayAge !== null,
    `both freedom ages should be reached in this scenario; got prepay=${out.mortgageFreedom.prepayAge}, invest=${out.mortgageFreedom.investAge}`);
  assert.ok(out.mortgageFreedom.investAge < out.mortgageFreedom.prepayAge,
    `Invest should reach freedom before Prepay in high-spread scenario; got prepay=${out.mortgageFreedom.prepayAge}, invest=${out.mortgageFreedom.investAge}`);
  assert.strictEqual(out.mortgageFreedom.winner, 'invest');
});

test('High-mortgage-rate scenario: Prepay reaches freedom strictly before Invest', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.09 }),
    stocksReturn: 0.04,
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageFreedom, 'mortgageFreedom must be present');
  assert.ok(out.mortgageFreedom.prepayAge !== null && out.mortgageFreedom.investAge !== null,
    `both freedom ages should be reached; got prepay=${out.mortgageFreedom.prepayAge}, invest=${out.mortgageFreedom.investAge}`);
  assert.ok(out.mortgageFreedom.prepayAge < out.mortgageFreedom.investAge,
    `Prepay should reach freedom before Invest in high-rate scenario; got prepay=${out.mortgageFreedom.prepayAge}, invest=${out.mortgageFreedom.investAge}`);
  assert.strictEqual(out.mortgageFreedom.winner, 'prepay');
});

test('marginYears equals the absolute age difference', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ rate: 0.09 }),
    stocksReturn: 0.04,
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageFreedom.prepayAge !== null && out.mortgageFreedom.investAge !== null);
  const expected = Math.abs(out.mortgageFreedom.prepayAge - out.mortgageFreedom.investAge);
  assert.strictEqual(out.mortgageFreedom.marginYears, expected,
    `marginYears should equal absolute age difference; got ${out.mortgageFreedom.marginYears}, expected ${expected}`);
});

test('Both freedom ages fall within [currentAge, endAge]', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  if (out.mortgageFreedom.prepayAge !== null) {
    assert.ok(out.mortgageFreedom.prepayAge >= inputs.currentAge,
      `prepay freedom age ${out.mortgageFreedom.prepayAge} must be >= currentAge ${inputs.currentAge}`);
    assert.ok(out.mortgageFreedom.prepayAge <= inputs.endAge,
      `prepay freedom age ${out.mortgageFreedom.prepayAge} must be <= endAge ${inputs.endAge}`);
  }
  if (out.mortgageFreedom.investAge !== null) {
    assert.ok(out.mortgageFreedom.investAge >= inputs.currentAge,
      `invest freedom age ${out.mortgageFreedom.investAge} must be >= currentAge ${inputs.currentAge}`);
    assert.ok(out.mortgageFreedom.investAge <= inputs.endAge,
      `invest freedom age ${out.mortgageFreedom.investAge} must be <= endAge ${inputs.endAge}`);
  }
});

// ---------------------------------------------------------------------------
// buying-in: pre-buy-in years must NOT subtract a not-yet-existent mortgage
// from freeAndClearWealth, and mortgageFreedomAge must NOT report the
// pre-buy-in start as the freedom age. Added 2026-04-28 to fix the visible
// "lines start at −$467K" bug under ownership='buying-in', buyInYears>0.
// ---------------------------------------------------------------------------

test('buying-in: no pre-buy-in rows; all path rows start at or after windowStartAge', () => {
  // v2 (T008): pre-buy-in rows are excluded. The test was updated from its v1
  // form (which checked freeAndClearWealth ≈ invested for rows before buy-in)
  // to verify that no rows exist before windowStartAge = currentAge + buyInYears.
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  const windowStartAge = inputs.currentAge + inputs.mortgage.buyInYears; // 44
  // Every row in both paths must be at or after windowStartAge.
  for (const row of out.prepayPath) {
    assert.ok(row.age >= windowStartAge,
      `prepayPath row age ${row.age} is before windowStartAge ${windowStartAge}`);
  }
  for (const row of out.investPath) {
    assert.ok(row.age >= windowStartAge,
      `investPath row age ${row.age} is before windowStartAge ${windowStartAge}`);
  }
});

test('buying-in: at buy-in year (age = currentAge + buyInYears), freeAndClearWealth drops to invested − mortgageBalanceReal', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  // v2 (T008): with the window starting at buy-in age (44), the first row is
  // index 0 (age 44), not index 2 (which would now be age 46).
  // buyInMonth=24 so monthIndex=24 is at yearOffset=2, monthInYear=0 → mortgage
  // active starting that month. freeAndClearWealth = invested − mortgageBalanceReal.
  const rowP = out.prepayPath[0];
  const rowI = out.investPath[0];
  assert.strictEqual(rowP.age, inputs.currentAge + inputs.mortgage.buyInYears);
  const expectedP = rowP.invested - rowP.mortgageBalanceReal;
  const expectedI = rowI.invested - rowI.mortgageBalanceReal;
  assert.ok(Math.abs(rowP.freeAndClearWealth - expectedP) <= 1,
    `buy-in year prepay: freeAndClearWealth=${rowP.freeAndClearWealth}, expected ~${expectedP}`);
  assert.ok(Math.abs(rowI.freeAndClearWealth - expectedI) <= 1,
    `buy-in year invest: freeAndClearWealth=${rowI.freeAndClearWealth}, expected ~${expectedI}`);
});

test('buying-in: mortgageFreedomAge skips pre-buy-in years', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  const minLegalAge = inputs.currentAge + inputs.mortgage.buyInYears; // 44
  if (out.mortgageFreedom.prepayAge !== null) {
    assert.ok(out.mortgageFreedom.prepayAge >= minLegalAge,
      `prepay freedom age ${out.mortgageFreedom.prepayAge} must be ≥ buy-in age ${minLegalAge}`);
  }
  if (out.mortgageFreedom.investAge !== null) {
    assert.ok(out.mortgageFreedom.investAge >= minLegalAge,
      `invest freedom age ${out.mortgageFreedom.investAge} must be ≥ buy-in age ${minLegalAge}`);
  }
});

test('buyInAge is exposed on output for buying-in ownership', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
  });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.mortgageFreedom.buyInAge,
    inputs.currentAge + inputs.mortgage.buyInYears,
    `buyInAge should be currentAge + buyInYears = ${inputs.currentAge + inputs.mortgage.buyInYears}`);
});

test('buyInAge is null for buying-now ownership', () => {
  const inputs = baseInputs({ mortgage: baseMortgage({ ownership: 'buying-now' }) });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.mortgageFreedom.buyInAge, null);
});

test('buyInAge is null for already-own ownership', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'already-own', yearsPaid: 5 }),
  });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.mortgageFreedom.buyInAge, null);
});

test('buying-now regression: freeAndClearWealth = invested − mortgageBalanceReal (gating is no-op)', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-now' }),
    extraMonthly: 500,
  });
  const out = computePayoffVsInvest(inputs);
  // Sample age 45 (yearOffset 3) — well into mortgage-active years for buying-now.
  const rowP = out.prepayPath[3];
  const expectedP = rowP.invested - rowP.mortgageBalanceReal;
  assert.ok(Math.abs(rowP.freeAndClearWealth - expectedP) <= 1,
    `buying-now prepay row: freeAndClearWealth=${rowP.freeAndClearWealth}, expected ~${expectedP}`);
});

// ---------------------------------------------------------------------------
// mortgageNaturalPayoff — top-level natural mortgage payoff ages per strategy.
// Added 2026-04-28 for the brokerage-only chart direction change. The renderer
// needs to mark "house fully paid off" events without recomputing.
// ---------------------------------------------------------------------------

test('mortgageNaturalPayoff is exposed at top level for buying-now', () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageNaturalPayoff,
    'mortgageNaturalPayoff must be present at top level of output');
  const { prepayAge, investAge } = out.mortgageNaturalPayoff;
  assert.ok(typeof prepayAge === 'number',
    `prepayAge must be a number; got ${prepayAge} (type ${typeof prepayAge})`);
  assert.ok(typeof investAge === 'number',
    `investAge must be a number; got ${investAge} (type ${typeof investAge})`);
  assert.ok(prepayAge >= inputs.currentAge,
    `prepayAge ${prepayAge} must be >= currentAge ${inputs.currentAge}`);
  assert.ok(prepayAge <= inputs.endAge,
    `prepayAge ${prepayAge} must be <= endAge ${inputs.endAge}`);
  assert.ok(investAge >= inputs.currentAge,
    `investAge ${investAge} must be >= currentAge ${inputs.currentAge}`);
  assert.ok(investAge <= inputs.endAge,
    `investAge ${investAge} must be <= endAge ${inputs.endAge}`);
});

test("Prepay's natural payoff age is strictly earlier than Invest's when extra > 0", () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  assert.ok(out.mortgageNaturalPayoff.prepayAge < out.mortgageNaturalPayoff.investAge,
    `Prepay accelerates payoff; expected prepayAge < investAge, got prepay=${out.mortgageNaturalPayoff.prepayAge}, invest=${out.mortgageNaturalPayoff.investAge}`);
});

test("Prepay's natural payoff age equals existing factor logic ('cash-flow-head-start')", () => {
  const inputs = baseInputs({ extraMonthly: 1500 });
  const out = computePayoffVsInvest(inputs);
  const factor = out.factors.find((f) => f.key === 'cash-flow-head-start');
  assert.ok(factor, "'cash-flow-head-start' factor must be present for this fixture");
  // valueDisplay format: "+N yrs (Prepay finishes at age X vs Invest Y)"
  const match = /Prepay finishes at age (\d+)/.exec(factor.valueDisplay);
  assert.ok(match, `factor.valueDisplay must contain "Prepay finishes at age N"; got "${factor.valueDisplay}"`);
  const factorPrepayAge = Number(match[1]);
  assert.strictEqual(out.mortgageNaturalPayoff.prepayAge, factorPrepayAge,
    `mortgageNaturalPayoff.prepayAge (${out.mortgageNaturalPayoff.prepayAge}) must match factor's reported "Prepay finishes at age" (${factorPrepayAge})`);
});

test('buying-in: natural payoff ages account for the buy-in delay', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  // Mortgage doesn't activate until age 44 (currentAge=42 + buyInYears=2). The
  // first row whose mortgageBalance can possibly hit 0 from active payments is
  // strictly after activation, so payoff age must be >= 44 (and realistically
  // much later, but at minimum strictly after buy-in).
  const minPayoffAge = inputs.currentAge + inputs.mortgage.buyInYears + 1; // 45
  assert.ok(out.mortgageNaturalPayoff.prepayAge >= minPayoffAge,
    `prepayAge ${out.mortgageNaturalPayoff.prepayAge} must be >= ${minPayoffAge} (mortgage starts at age ${inputs.currentAge + inputs.mortgage.buyInYears})`);
  assert.ok(out.mortgageNaturalPayoff.investAge >= minPayoffAge,
    `investAge ${out.mortgageNaturalPayoff.investAge} must be >= ${minPayoffAge} (mortgage starts at age ${inputs.currentAge + inputs.mortgage.buyInYears})`);
});

test('zero-extra-monthly: prepay and invest natural payoffs match', () => {
  const inputs = baseInputs({ extraMonthly: 0 });
  const out = computePayoffVsInvest(inputs);
  assert.strictEqual(out.mortgageNaturalPayoff.prepayAge, out.mortgageNaturalPayoff.investAge,
    `with extraMonthly=0, both strategies follow standard amortization; expected equal payoff ages, got prepay=${out.mortgageNaturalPayoff.prepayAge}, invest=${out.mortgageNaturalPayoff.investAge}`);
});

test('Output shape: all required fields present and aligned', () => {
  const inputs = baseInputs();
  const out = computePayoffVsInvest(inputs);
  assert.ok(Array.isArray(out.prepayPath));
  assert.ok(Array.isArray(out.investPath));
  assert.strictEqual(out.prepayPath.length, out.investPath.length);
  assert.strictEqual(out.prepayPath.length, inputs.endAge - inputs.currentAge + 1);
  // First row at currentAge, last at endAge
  assert.strictEqual(out.prepayPath[0].age, inputs.currentAge);
  assert.strictEqual(out.prepayPath[out.prepayPath.length - 1].age, inputs.endAge);
  // Amortization arrays parallel
  assert.strictEqual(out.amortizationSplit.prepay.length, out.prepayPath.length);
  assert.strictEqual(out.amortizationSplit.invest.length, out.investPath.length);
  // Factors include all required keys
  const keys = out.factors.map((f) => f.key);
  // v1.2 renamed: 'expected-stocks-return-after-tax' → 'expected-stocks-return'
  // (after the buy-and-hold fix; no annual tax drag), and 'ltcg-tax-drag' →
  // 'terminal-ltcg-if-sold' (LTCG only applies on sale, not during accumulation).
  for (const required of ['real-spread', 'nominal-mortgage-rate', 'expected-stocks-return',
                          'time-horizon-years', 'mortgage-years-remaining', 'terminal-ltcg-if-sold',
                          'mortgage-payoff-before-fire', 'cash-flow-head-start']) {
    assert.ok(keys.includes(required), `factor "${required}" should be present; got ${keys.join(',')}`);
  }
  // subSteps populated
  assert.ok(Array.isArray(out.subSteps));
  assert.ok(out.subSteps.length >= 5);
});

// ---------------------------------------------------------------------------
// Inv-1 regression lock (feature 017 / T003)
// "v1 parity: lumpSumPayoff=false produces byte-identical output to v1"
//
// CONTRACT: when lumpSumPayoff===false AND ownership!=='buying-in', every
// top-level output field in v2 must be identical to the v1 ground-truth
// snapshots captured below (tests/unit/fixtures/payoffVsInvest_v1Snapshots.json).
//
// If this test block fails after a v2 change, the v2 implementation has
// drifted from its backward-compatibility commitment. Either:
//   (a) Fix the regression so the switch-off path is truly unchanged, OR
//   (b) If the change is intentional, re-capture the snapshots by running the
//       snapshot generator script (node scripts/capture-pvi-v1-snapshots.js)
//       and committing the updated fixture file with a clear explanation.
// ---------------------------------------------------------------------------

test('v1 parity regression — switch=false produces v1 output (5 fixtures)', () => {
  for (const snapshot of V1_SNAPSHOTS) {
    assertV1ParityWhenSwitchOff(snapshot.label, snapshot.inputs, snapshot.output);
  }
});

// ---------------------------------------------------------------------------
// T006 (feature 017): Inv-2 — Window start for buying-in
// CONTRACT: when ownership='buying-in' with buyInYears>0, both paths and both
// amortization arrays must start at (currentAge + buyInYears), not at
// currentAge. Path length = endAge - (currentAge + buyInYears) + 1.
//
// STATUS: EXPECTED TO FAIL until T008/T009 implements the v2 window-start fix.
// ---------------------------------------------------------------------------

test('Inv-2 window start: buying-in paths start at buy-in age with $0 brokerage', () => {
  const buyInYears = 2;
  const currentAge = 42;
  const fireAge = 51;
  const endAge = 99;
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears }),
    currentAge,
    fireAge,
    endAge,
  });
  const out = computePayoffVsInvest(inputs);
  const expectedStartAge = currentAge + buyInYears; // 44
  const expectedLength = endAge - expectedStartAge + 1; // 56

  // Inv-2, condition 1: prepayPath[0].age === currentAge + buyInYears
  assert.strictEqual(
    out.prepayPath[0].age,
    expectedStartAge,
    `[Inv-2] prepayPath[0].age should be ${expectedStartAge} (currentAge + buyInYears), ` +
    `but got ${out.prepayPath[0].age}. ` +
    `Full prepayPath[0]: ${JSON.stringify(out.prepayPath[0])}`
  );

  // Inv-2, condition 2: investPath[0].age === currentAge + buyInYears
  assert.strictEqual(
    out.investPath[0].age,
    expectedStartAge,
    `[Inv-2] investPath[0].age should be ${expectedStartAge}, but got ${out.investPath[0].age}. ` +
    `Full investPath[0]: ${JSON.stringify(out.investPath[0])}`
  );

  // Inv-2, condition 3: prepayPath[0].invested === 0
  assert.strictEqual(
    out.prepayPath[0].invested,
    0,
    `[Inv-2] prepayPath[0].invested should be 0 at window start (age ${expectedStartAge}), ` +
    `but got ${out.prepayPath[0].invested}. ` +
    `Full prepayPath[0]: ${JSON.stringify(out.prepayPath[0])}`
  );

  // Inv-2, condition 4: investPath[0].invested === 0
  assert.strictEqual(
    out.investPath[0].invested,
    0,
    `[Inv-2] investPath[0].invested should be 0 at window start (age ${expectedStartAge}), ` +
    `but got ${out.investPath[0].invested}. ` +
    `Full investPath[0]: ${JSON.stringify(out.investPath[0])}`
  );

  // Inv-2, condition 5: amortizationSplit.prepay[0].age === currentAge + buyInYears
  assert.strictEqual(
    out.amortizationSplit.prepay[0].age,
    expectedStartAge,
    `[Inv-2] amortizationSplit.prepay[0].age should be ${expectedStartAge}, ` +
    `but got ${out.amortizationSplit.prepay[0].age}`
  );

  // Inv-2, condition 6: amortizationSplit.invest[0].age === currentAge + buyInYears
  assert.strictEqual(
    out.amortizationSplit.invest[0].age,
    expectedStartAge,
    `[Inv-2] amortizationSplit.invest[0].age should be ${expectedStartAge}, ` +
    `but got ${out.amortizationSplit.invest[0].age}`
  );

  // Path lengths must span from buy-in age to endAge (not from currentAge).
  assert.strictEqual(
    out.prepayPath.length,
    expectedLength,
    `[Inv-2] prepayPath.length should be ${expectedLength} (endAge ${endAge} − startAge ${expectedStartAge} + 1), ` +
    `but got ${out.prepayPath.length}`
  );
  assert.strictEqual(
    out.investPath.length,
    expectedLength,
    `[Inv-2] investPath.length should be ${expectedLength}, but got ${out.investPath.length}`
  );
});

// ---------------------------------------------------------------------------
// T007 (feature 017): backwards-compat regression lock for ownership='already-own'
// CONTRACT (Inv-1): when lumpSumPayoff===false AND ownership==='already-own',
// v2 output must be byte-identical to the captured v1 snapshot.
//
// STATUS: EXPECTED TO PASS now (calc is still v1; already-own never triggers
// any v2 code path). Locks no-regression intent for this ownership branch.
// ---------------------------------------------------------------------------

test('Inv-1 backwards compat: already-own yearsPaid=5 with switch=false produces v1 output', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'already-own', yearsPaid: 5 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
  });
  const snapshot = V1_SNAPSHOTS.find((s) => s.label === 'already-own-5yrs');
  assert.ok(
    snapshot,
    'already-own-5yrs snapshot must exist in payoffVsInvest_v1Snapshots.json'
  );
  assertV1ParityWhenSwitchOff('already-own-5yrs (T007)', inputs, snapshot.output);
});

// ---------------------------------------------------------------------------
// T014 (feature 017): Inv-5 — Stage boundaries consistency
// CONTRACT (Inv-5): stageBoundaries must be present; firstPayoffAge <
// secondPayoffAge when both exist; firstPayoffWinner matches the strategy
// whose path has a zero-balance row at firstPayoffAge.
//
// STATUS: EXPECTED TO FAIL until Backend agent adds _findStageBoundaries
// and wires stageBoundaries into outputs (T015+).
// ---------------------------------------------------------------------------

test('Inv-5 stage boundaries: firstPayoffAge < secondPayoffAge; firstPayoffWinner matches first zero-balance row', () => {
  // Typical buying-now: rate=0.06, stocks=0.07, extra=$1000 → Prepay finishes
  // its accelerated payoff well before Invest's natural amortization end.
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.06 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    stocksReturn: 0.07,
    extraMonthly: 1000,
    lumpSumPayoff: false,
  });
  const out = computePayoffVsInvest(inputs);

  // Inv-5, condition 1: stageBoundaries exists with the four expected fields.
  assert.ok(
    out.stageBoundaries !== undefined && out.stageBoundaries !== null,
    '[Inv-5] stageBoundaries must be present in outputs; got undefined/null. ' +
    'Backend has not yet added _findStageBoundaries() (T015+).'
  );
  const sb = out.stageBoundaries;
  assert.ok(
    typeof sb.windowStartAge === 'number',
    `[Inv-5] stageBoundaries.windowStartAge must be a number; got ${JSON.stringify(sb.windowStartAge)}`
  );
  assert.ok(
    typeof sb.firstPayoffAge === 'number',
    `[Inv-5] stageBoundaries.firstPayoffAge must be a number; got ${JSON.stringify(sb.firstPayoffAge)}`
  );
  assert.ok(
    'firstPayoffWinner' in sb,
    `[Inv-5] stageBoundaries.firstPayoffWinner must be present; got ${JSON.stringify(sb)}`
  );
  assert.ok(
    'secondPayoffAge' in sb,
    `[Inv-5] stageBoundaries.secondPayoffAge field must be present (may be null); got ${JSON.stringify(sb)}`
  );

  // Inv-5, condition 2: windowStartAge === currentAge (buying-now has no delay).
  assert.strictEqual(
    sb.windowStartAge,
    42,
    `[Inv-5] windowStartAge should be 42 (currentAge) for buying-now; got ${sb.windowStartAge}`
  );

  // Inv-5, condition 3: firstPayoffAge < secondPayoffAge (when secondPayoffAge is not null).
  if (sb.secondPayoffAge !== null) {
    assert.ok(
      sb.firstPayoffAge < sb.secondPayoffAge,
      `[Inv-5] firstPayoffAge (${sb.firstPayoffAge}) must be < secondPayoffAge (${sb.secondPayoffAge}). ` +
      'Scenario: buying-now, rate=0.06, stocks=0.07, extra=$1000.'
    );
  }

  // Inv-5, condition 4: firstPayoffWinner === 'prepay' for this scenario.
  // At rate=0.06 vs stocks=0.07 with extra=$1000 applied to principal, Prepay's
  // accelerated payoff finishes well before Invest's natural amortization end.
  assert.strictEqual(
    sb.firstPayoffWinner,
    'prepay',
    `[Inv-5] firstPayoffWinner should be 'prepay' for rate=0.06/stocks=0.07/extra=$1000; ` +
    `got '${sb.firstPayoffWinner}'. ` +
    `stageBoundaries: ${JSON.stringify(sb)}`
  );

  // Inv-5, condition 5: the prepayPath row at firstPayoffAge has mortgageBalance === 0.
  // (firstPayoffWinner='prepay', so verify Prepay's zero-balance row matches.)
  const winnerPath = sb.firstPayoffWinner === 'prepay' ? out.prepayPath : out.investPath;
  const winnerRow = winnerPath.find((r) => r.age === sb.firstPayoffAge);
  assert.ok(
    winnerRow !== undefined,
    `[Inv-5] No row found in ${sb.firstPayoffWinner}Path at age ${sb.firstPayoffAge}. ` +
    `Path ages: ${winnerPath.map((r) => r.age).join(',')}`
  );
  assert.strictEqual(
    winnerRow.mortgageBalance,
    0,
    `[Inv-5] ${sb.firstPayoffWinner}Path row at firstPayoffAge (${sb.firstPayoffAge}) ` +
    `must have mortgageBalance === 0; got ${winnerRow.mortgageBalance}`
  );
});

// ---------------------------------------------------------------------------
// T025, T026, T027 — Lump-sum payoff cluster (Inv-3, Inv-4, Inv-6)
// These tests verify behavior when lumpSumPayoff=true is enabled.
// STATUS: ALL EXPECTED TO FAIL until Backend agent lands the lump-sum
// trigger in T028+ (calc module does not yet implement lumpSumEvent).
// ---------------------------------------------------------------------------

// T025: Lump-sum fires after Prepay payoff (typical case)
// Inv-3: lumpSumEvent fires at most once.
// Inv-4: brokerageAfter === brokerageBefore − paidOff (within $2 rounding).

test('Inv-3/Inv-4 lump-sum after Prepay payoff: Prepay-first stage ordering, brokerage drops by realMortgageBalance', () => {
  // High-rate scenario: rate=0.09, stocks=0.07, extra=$1000, switch ON.
  // With a 9% mortgage rate, Prepay's accelerated payoff is fast (high interest
  // means extra payments save a lot). Invest's brokerage catches the real balance
  // ONE YEAR after Prepay has already reached zero — giving Prepay-first ordering.
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.09 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    stocksReturn: 0.07,
    extraMonthly: 1000,
    lumpSumPayoff: true, mortgageStrategy: 'invest-lump-sum',
  });
  const out = computePayoffVsInvest(inputs);

  // Assertion 1: lumpSumEvent is non-null and has the expected shape.
  assert.ok(
    out.lumpSumEvent !== null && out.lumpSumEvent !== undefined,
    '[Inv-3] lumpSumEvent must be non-null for rate=0.09/stocks=0.07/extra=$1000/lumpSumPayoff=true. ' +
    'The Invest brokerage should grow to exceed the real mortgage balance within the 99-year horizon. ' +
    `Got: ${JSON.stringify(out.lumpSumEvent)}`
  );
  const ev = out.lumpSumEvent;
  assert.ok(
    typeof ev.age === 'number',
    `[Inv-3] lumpSumEvent.age must be a number; got ${JSON.stringify(ev.age)}`
  );
  assert.ok(
    typeof ev.monthInYear === 'number' && ev.monthInYear >= 0 && ev.monthInYear <= 11,
    `[Inv-3] lumpSumEvent.monthInYear must be 0..11; got ${ev.monthInYear}`
  );
  assert.ok(
    typeof ev.brokerageBefore === 'number' && ev.brokerageBefore > 0,
    `[Inv-3] lumpSumEvent.brokerageBefore must be a positive number; got ${ev.brokerageBefore}`
  );
  assert.ok(
    typeof ev.paidOff === 'number' && ev.paidOff > 0,
    `[Inv-3] lumpSumEvent.paidOff must be a positive number; got ${ev.paidOff}`
  );
  assert.ok(
    typeof ev.brokerageAfter === 'number' && ev.brokerageAfter >= 0,
    `[Inv-3] lumpSumEvent.brokerageAfter must be >= 0; got ${ev.brokerageAfter}`
  );

  // Assertion 2: lumpSumEvent.age is between Prepay's natural payoff age and the
  // 30-year upper bound (currentAge + 30 = 72). The trigger fires after Prepay has
  // already paid off (Prepay-first ordering in this typical scenario).
  const prepayNaturalPayoffAge = out.mortgageNaturalPayoff.prepayAge;
  assert.ok(
    ev.age > prepayNaturalPayoffAge,
    `[Inv-3] lumpSumEvent.age (${ev.age}) must be > Prepay's natural payoff age (${prepayNaturalPayoffAge}) ` +
    'for this rate=0.09/stocks=0.07 scenario (Prepay finishes first due to high mortgage rate).'
  );
  assert.ok(
    ev.age < inputs.currentAge + 30,
    `[Inv-3] lumpSumEvent.age (${ev.age}) must be < ${inputs.currentAge + 30} (30-year mortgage upper bound). ` +
    'A 9% mortgage with extra=$1000 should be paid off well within 30 years.'
  );

  // Assertion 3: Inv-4 — brokerageAfter === brokerageBefore − actualDrawdown within $2 rounding.
  // v3 (feature 018, FR-011 / Option B): `paidOff` retains v2 semantics (what the bank
  // receives = realBalance); `actualDrawdown` is the true brokerage drop including
  // LTCG gross-up. The brokerage delta uses actualDrawdown, not paidOff.
  const diff = Math.abs(ev.brokerageAfter - (ev.brokerageBefore - ev.actualDrawdown));
  assert.ok(
    diff <= 2,
    `[Inv-4] lumpSumEvent rounding: brokerageAfter (${ev.brokerageAfter}) should equal ` +
    `brokerageBefore (${ev.brokerageBefore}) − actualDrawdown (${ev.actualDrawdown}) ± $2. ` +
    `Got difference of $${diff}.`
  );

  // Assertion 4: stageBoundaries.firstPayoffWinner === 'prepay' for this typical scenario.
  assert.ok(
    out.stageBoundaries !== null && out.stageBoundaries !== undefined,
    '[Inv-5] stageBoundaries must be present when lumpSumPayoff=true'
  );
  assert.strictEqual(
    out.stageBoundaries.firstPayoffWinner,
    'prepay',
    `[Inv-3/Inv-5] stageBoundaries.firstPayoffWinner should be 'prepay' for rate=0.09/stocks=0.07/extra=$1000; ` +
    `got '${out.stageBoundaries.firstPayoffWinner}'. ` +
    "High mortgage rate (9%) means Prepay finishes accelerated payoff before Invest's lump-sum trigger fires."
  );
});

// T026: Lump-sum fires before Prepay payoff (high-return, Invest-first case)
// Inv-3: lumpSumEvent fires before Prepay's natural payoff.
// Inv-5: firstPayoffWinner === 'invest' when returns are high.

test("Inv-3 lump-sum before Prepay payoff: Invest-first stage ordering when returns are high", () => {
  // High-return scenario: stocks=0.12, extra=$3000. The brokerage grows rapidly
  // and crosses the real mortgage balance before Prepay finishes its accelerated
  // payoff. This flips the stage ordering: firstPayoffWinner = 'invest'.
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.06 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    stocksReturn: 0.12,
    extraMonthly: 3000,
    lumpSumPayoff: true, mortgageStrategy: 'invest-lump-sum',
  });
  const out = computePayoffVsInvest(inputs);

  // Assertion 1: lumpSumEvent is non-null.
  assert.ok(
    out.lumpSumEvent !== null && out.lumpSumEvent !== undefined,
    '[Inv-3] lumpSumEvent must be non-null for stocks=0.12/extra=$3000/lumpSumPayoff=true. ' +
    'The Invest brokerage compounds rapidly and should meet the real mortgage balance well ' +
    `before the mortgage is naturally paid off. Got: ${JSON.stringify(out.lumpSumEvent)}`
  );

  // Assertion 2: firstPayoffWinner === 'invest' (high returns flip the order).
  assert.ok(
    out.stageBoundaries !== null && out.stageBoundaries !== undefined,
    '[Inv-5] stageBoundaries must be present when lumpSumPayoff=true'
  );
  assert.strictEqual(
    out.stageBoundaries.firstPayoffWinner,
    'invest',
    `[Inv-3/Inv-5] stageBoundaries.firstPayoffWinner should be 'invest' for stocks=0.12/extra=$3000; ` +
    `got '${out.stageBoundaries.firstPayoffWinner}'. ` +
    "High-return scenario: Invest's compounding brokerage crosses real mortgage balance before Prepay's accelerated payoff."
  );

  // Assertion 3: lumpSumEvent.age < Prepay's natural payoff age.
  const prepayNaturalPayoffAge = out.mortgageNaturalPayoff.prepayAge;
  assert.ok(
    out.lumpSumEvent.age < prepayNaturalPayoffAge,
    `[Inv-3] lumpSumEvent.age (${out.lumpSumEvent.age}) must be < Prepay's natural payoff age ` +
    `(${prepayNaturalPayoffAge}) for stocks=0.12/extra=$3000. ` +
    "Invest's lump-sum trigger fires BEFORE Prepay finishes accelerated payoff in this high-return scenario."
  );

  // Assertion 4: stageBoundaries.firstPayoffAge === lumpSumEvent.age
  // (Invest's lump-sum is the first payoff event, so firstPayoffAge should match).
  assert.strictEqual(
    out.stageBoundaries.firstPayoffAge,
    out.lumpSumEvent.age,
    `[Inv-3/Inv-5] stageBoundaries.firstPayoffAge (${out.stageBoundaries.firstPayoffAge}) ` +
    `should equal lumpSumEvent.age (${out.lumpSumEvent.age}) when Invest fires first. ` +
    'The stage boundary is defined by whichever strategy becomes debt-free first.'
  );
});

// T027(a): Lump-sum never fires (low-return horizon)
// T027(b): Inv-6 interest invariant — prepay < invest_lumpSum < invest_keepPaying

test('Lump-sum never fires (low-return horizon): trigger never met', () => {
  // Zero-extra scenario: stocks=0.04, extra=$0.
  // Invest directs no extra cash to brokerage during the mortgage period;
  // the brokerage stays at $0 throughout the mortgage life, so the trigger
  // condition (brokerage >= realMortgageBalance) is never met.
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.06 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    stocksReturn: 0.04,
    extraMonthly: 0,
    lumpSumPayoff: true, mortgageStrategy: 'invest-lump-sum',
  });
  const out = computePayoffVsInvest(inputs);

  // Assert: lumpSumEvent === null (trigger never met).
  assert.strictEqual(
    out.lumpSumEvent,
    null,
    `[Inv-3] lumpSumEvent should be null for stocks=0.04/extra=$0/lumpSumPayoff=true. ` +
    'Invest brokerage stays at $0 throughout the mortgage period (no extra contributions), so trigger never fires. ' +
    `Got: ${JSON.stringify(out.lumpSumEvent)}`
  );

  // Assert: calc completes normally — no disabledReason, no thrown error.
  assert.strictEqual(
    out.disabledReason,
    undefined,
    `[Inv-3] calc should complete with no disabledReason when lumpSumPayoff=true and extra=$0; ` +
    `got disabledReason='${out.disabledReason}'`
  );
});

test('Inv-6 interest invariant: prepay < invest_lumpSum < invest_keepPaying', () => {
  // Run the same scenario three ways to verify the interest ordering.
  // Scenario: buying-now, rate=0.06, stocks=0.07, extra=$1000 — the "typical" case
  // where the lump-sum trigger fires for Invest but after Prepay.
  const baseScenario = {
    mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.06 }),
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    stocksReturn: 0.07,
    extraMonthly: 1000,
  };

  // Run 1: lumpSumPayoff=false (Invest keeps paying on schedule → most interest).
  const outKeepPaying = computePayoffVsInvest(baseInputs({ ...baseScenario, lumpSumPayoff: false }));

  // Run 2: lumpSumPayoff=true (Invest fires lump-sum → saves late-stage interest).
  const outLumpSum = computePayoffVsInvest(baseInputs({ ...baseScenario, lumpSumPayoff: true, mortgageStrategy: 'invest-lump-sum' }));

  // Helper: sum all interestPaidThisYear values in an amortization array.
  function totalInterest(amortRows) {
    return amortRows.reduce((sum, r) => sum + r.interestPaidThisYear, 0);
  }

  const prepayInterest = totalInterest(outKeepPaying.amortizationSplit.prepay);
  const investKeepPayingInterest = totalInterest(outKeepPaying.amortizationSplit.invest);
  const investLumpSumInterest = totalInterest(outLumpSum.amortizationSplit.invest);

  // Inv-6, sub-assertion A: Prepay's cumulative interest is unaffected by lumpSumPayoff.
  // (Prepay's behavior is purely determined by its accelerated principal payments;
  //  the lumpSumPayoff flag only affects the Invest strategy.)
  const prepayInterestLumpSumRun = totalInterest(outLumpSum.amortizationSplit.prepay);
  assert.ok(
    Math.abs(prepayInterest - prepayInterestLumpSumRun) <= 1,
    `[Inv-6] Prepay's cumulative interest must be unaffected by lumpSumPayoff flag. ` +
    `keepPaying run: ${prepayInterest.toFixed(2)}, lumpSum run: ${prepayInterestLumpSumRun.toFixed(2)}, ` +
    `diff: ${Math.abs(prepayInterest - prepayInterestLumpSumRun).toFixed(2)} (must be ≤ $1 rounding).`
  );

  // Inv-6, sub-assertion B: prepay < invest_lumpSum (Prepay still pays least interest overall).
  assert.ok(
    prepayInterest < investLumpSumInterest,
    `[Inv-6] Prepay cumulative interest (${prepayInterest.toFixed(2)}) must be < ` +
    `Invest-with-lumpSum cumulative interest (${investLumpSumInterest.toFixed(2)}). ` +
    'Prepay always pays less total interest because extra cash goes straight to principal.'
  );

  // Inv-6, sub-assertion C: invest_lumpSum < invest_keepPaying (lump-sum saves interest).
  // When lumpSumPayoff fires, Invest kills the remaining loan balance early, eliminating
  // all future interest payments that would have accrued on the natural amortization schedule.
  assert.ok(
    investLumpSumInterest < investKeepPayingInterest,
    `[Inv-6] Invest-with-lumpSum cumulative interest (${investLumpSumInterest.toFixed(2)}) must be < ` +
    `Invest-keepPaying cumulative interest (${investKeepPayingInterest.toFixed(2)}). ` +
    'Lump-sum payoff eliminates future interest by killing the mortgage balance early. ' +
    'If equal, the lump-sum trigger may not have fired (check outLumpSum.lumpSumEvent).'
  );
});

// ---------------------------------------------------------------------------
// T007 (feature 018): v3 strategy normalization (Inv-12)
// CONTRACT: _normalizeStrategy resolves to the canonical strategy enum value
// according to the priority rules: explicit valid mortgageStrategy wins over
// lumpSumPayoff; unknown values fall through to lumpSumPayoff; missing
// mortgageStrategy or falsy lumpSumPayoff → 'invest-keep-paying' default.
//
// STATUS: EXPECTED TO PASS immediately — _normalizeStrategy is already
// implemented in T006.
// ---------------------------------------------------------------------------

test('v3 strategy normalization: explicit mortgageStrategy wins over lumpSumPayoff (Inv-12)', () => {
  // Case 1: mortgageStrategy wins even when it equals the default value,
  // per Inv-12 strict — the presence of a valid mortgageStrategy key is
  // authoritative regardless of lumpSumPayoff.
  assert.strictEqual(
    _normalizeStrategy({ mortgageStrategy: 'invest-keep-paying', lumpSumPayoff: true }),
    'invest-keep-paying',
    "[Inv-12] mortgageStrategy='invest-keep-paying' must win over lumpSumPayoff=true"
  );

  // Case 2: explicit 'invest-lump-sum' strategy — no ambiguity.
  assert.strictEqual(
    _normalizeStrategy({ mortgageStrategy: 'invest-lump-sum' }),
    'invest-lump-sum',
    "[Inv-12] mortgageStrategy='invest-lump-sum' must resolve directly"
  );

  // Case 3: explicit 'prepay-extra' strategy.
  assert.strictEqual(
    _normalizeStrategy({ mortgageStrategy: 'prepay-extra' }),
    'prepay-extra',
    "[Inv-12] mortgageStrategy='prepay-extra' must resolve directly"
  );

  // Case 4: no mortgageStrategy, lumpSumPayoff=true → v2 fallback path.
  assert.strictEqual(
    _normalizeStrategy({ lumpSumPayoff: true }),
    'invest-lump-sum',
    '[Inv-12] absent mortgageStrategy + lumpSumPayoff=true must fall back to invest-lump-sum'
  );

  // Case 5: no mortgageStrategy, lumpSumPayoff=false → default.
  assert.strictEqual(
    _normalizeStrategy({ lumpSumPayoff: false }),
    'invest-keep-paying',
    '[Inv-12] absent mortgageStrategy + lumpSumPayoff=false must fall back to invest-keep-paying'
  );

  // Case 6: empty object → default.
  assert.strictEqual(
    _normalizeStrategy({}),
    'invest-keep-paying',
    '[Inv-12] empty inputs must resolve to invest-keep-paying default'
  );

  // Case 7: unknown mortgageStrategy value falls through to lumpSumPayoff fallback.
  assert.strictEqual(
    _normalizeStrategy({ mortgageStrategy: 'unknown-value', lumpSumPayoff: true }),
    'invest-lump-sum',
    "[Inv-12] unknown mortgageStrategy must fall through to lumpSumPayoff=true fallback → invest-lump-sum"
  );

  // Case 8: defensive — undefined inputs.
  assert.strictEqual(
    _normalizeStrategy(undefined),
    'invest-keep-paying',
    '[Inv-12] _normalizeStrategy(undefined) must return invest-keep-paying default'
  );

  // Case 9: defensive — null inputs.
  assert.strictEqual(
    _normalizeStrategy(null),
    'invest-keep-paying',
    '[Inv-12] _normalizeStrategy(null) must return invest-keep-paying default'
  );
});

// ---------------------------------------------------------------------------
// T008 (feature 018): v3 Inv-11 — mortgageActivePayoffAge per strategy
// CONTRACT (Inv-11): outputs must contain mortgageActivePayoffAge = { prepay,
// invest } where each value is the age at which that strategy's mortgage
// balance first reaches 0 in the simulated paths. Under prepay-extra with
// extraMonthly > 0, prepay payoff finishes strictly before invest's natural
// amortization end.
//
// STATUS: EXPECTED TO FAIL until T010 lands mortgageActivePayoffAge in outputs.
// ---------------------------------------------------------------------------

test('v3 Inv-11 mortgageActivePayoffAge: prepay\'s accelerated end < invest\'s natural end', () => {
  // Scenario: 6% mortgage vs 7% stocks, extra=$1000/month, no sale at FIRE.
  // With extraMonthly=1000 and rate=0.06, Prepay's accelerated payments retire
  // the balance years before Invest's natural 30-year amortization end.
  const sharedOverrides = {
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    mortgage: baseMortgage({ rate: 0.06 }),
    stocksReturn: 0.07,
    extraMonthly: 1000,
    sellAtFire: false,
  };

  const outPrepay = computePayoffVsInvest(baseInputs({
    ...sharedOverrides,
    mortgageStrategy: 'prepay-extra',
  }));

  const outInvest = computePayoffVsInvest(baseInputs({
    ...sharedOverrides,
    mortgageStrategy: 'invest-keep-paying',
  }));

  // Assertion 1: both runs expose mortgageActivePayoffAge as a non-undefined object
  // with numeric 'prepay' and 'invest' fields.
  assert.ok(
    outPrepay.mortgageActivePayoffAge !== undefined && outPrepay.mortgageActivePayoffAge !== null,
    '[Inv-11] mortgageActivePayoffAge must be present in outputs for mortgageStrategy=prepay-extra. ' +
    `Got: ${JSON.stringify(outPrepay.mortgageActivePayoffAge)}. ` +
    'T010 has not yet added this field to computePayoffVsInvest outputs.'
  );
  assert.ok(
    outInvest.mortgageActivePayoffAge !== undefined && outInvest.mortgageActivePayoffAge !== null,
    '[Inv-11] mortgageActivePayoffAge must be present in outputs for mortgageStrategy=invest-keep-paying. ' +
    `Got: ${JSON.stringify(outInvest.mortgageActivePayoffAge)}. ` +
    'T010 has not yet added this field to computePayoffVsInvest outputs.'
  );

  const prepayPayoffAge = outPrepay.mortgageActivePayoffAge.prepay;
  const investPayoffAge = outInvest.mortgageActivePayoffAge.invest;

  assert.ok(
    typeof prepayPayoffAge === 'number',
    `[Inv-11] mortgageActivePayoffAge.prepay must be a number; got ${JSON.stringify(prepayPayoffAge)}`
  );
  assert.ok(
    typeof investPayoffAge === 'number',
    `[Inv-11] mortgageActivePayoffAge.invest must be a number; got ${JSON.stringify(investPayoffAge)}`
  );

  // Assertion 2: Inv-11 core — prepay's accelerated payoff age < invest's natural payoff age.
  assert.ok(
    prepayPayoffAge < investPayoffAge,
    `[Inv-11] mortgageActivePayoffAge.prepay (${prepayPayoffAge}) must be < ` +
    `mortgageActivePayoffAge.invest (${investPayoffAge}). ` +
    'Prepay-extra with extraMonthly=$1000 retires the 6% mortgage faster than Invest\'s natural amortization.'
  );

  // Assertion 3: mortgageActivePayoffAge.prepay equals the row in prepayPath where
  // mortgageBalance first reaches 0.
  const firstZeroPrepay = outPrepay.prepayPath.find((r) => r.mortgageBalance <= 0);
  assert.ok(
    firstZeroPrepay !== undefined,
    '[Inv-11] prepayPath must contain a row with mortgageBalance <= 0 for this scenario'
  );
  assert.strictEqual(
    prepayPayoffAge,
    firstZeroPrepay.age,
    `[Inv-11] mortgageActivePayoffAge.prepay (${prepayPayoffAge}) must equal the age of the ` +
    `first prepayPath row where mortgageBalance=0 (age ${firstZeroPrepay.age})`
  );

  // Assertion 4: mortgageActivePayoffAge.invest equals the row in investPath where
  // mortgageBalance first reaches 0.
  const firstZeroInvest = outInvest.investPath.find((r) => r.mortgageBalance <= 0);
  assert.ok(
    firstZeroInvest !== undefined,
    '[Inv-11] investPath must contain a row with mortgageBalance <= 0 for this scenario'
  );
  assert.strictEqual(
    investPayoffAge,
    firstZeroInvest.age,
    `[Inv-11] mortgageActivePayoffAge.invest (${investPayoffAge}) must equal the age of the ` +
    `first investPath row where mortgageBalance=0 (age ${firstZeroInvest.age})`
  );
});

// ---------------------------------------------------------------------------
// T009 (feature 018): v3 SC-004 backwards-compat — saved-state without
// mortgageStrategy defaults to invest-keep-paying
// CONTRACT: v017-era saved states lack mortgageStrategy entirely. The calc
// module must resolve such inputs exactly as if mortgageStrategy were absent,
// falling back to lumpSumPayoff for strategy selection. The v2 parity
// snapshot comparison confirms no v2 behavior drift.
//
// STATUS: EXPECTED TO PASS — _normalizeStrategy fallback (T006) plus the
// existing v2 parity snapshot cover this contract.
// ---------------------------------------------------------------------------

test('v3 SC-004 backwards-compat: saved-state without mortgageStrategy defaults to invest-keep-paying', () => {
  // Simulate a v017-era saved state: mortgageStrategy key is truly absent
  // (not just undefined). Use destructuring + delete to guarantee absence.

  // Run 1: lumpSumPayoff=false, no mortgageStrategy → should behave as
  // invest-keep-paying (no lump-sum event).
  const run1Inputs = { ...baseInputs(), lumpSumPayoff: false };
  delete run1Inputs.mortgageStrategy;
  assert.ok(
    !('mortgageStrategy' in run1Inputs),
    'run1Inputs must not contain mortgageStrategy key (simulating v017 saved state)'
  );

  const out1 = computePayoffVsInvest(run1Inputs);

  assert.strictEqual(
    out1.lumpSumEvent,
    null,
    '[SC-004] Run 1 (lumpSumPayoff=false, no mortgageStrategy): lumpSumEvent must be null ' +
    '— strategy normalizes to invest-keep-paying so no lump-sum trigger fires. ' +
    `Got: ${JSON.stringify(out1.lumpSumEvent)}`
  );

  // Run 2: lumpSumPayoff=true, no mortgageStrategy → should fall back to
  // invest-lump-sum via lumpSumPayoff, so lumpSumEvent fires.
  // Use a scenario where the lump-sum trigger is actually reachable:
  // rate=0.09, stocks=0.07, extra=$1000 (same as T025 — Prepay-first scenario).
  const run2Inputs = {
    ...baseInputs({
      mortgage: baseMortgage({ ownership: 'buying-now', rate: 0.09 }),
      stocksReturn: 0.07,
      extraMonthly: 1000,
    }),
    lumpSumPayoff: true,
  };
  delete run2Inputs.mortgageStrategy;
  assert.ok(
    !('mortgageStrategy' in run2Inputs),
    'run2Inputs must not contain mortgageStrategy key (simulating v017 saved state)'
  );

  const out2 = computePayoffVsInvest(run2Inputs);

  assert.ok(
    out2.lumpSumEvent !== null && out2.lumpSumEvent !== undefined,
    '[SC-004] Run 2 (lumpSumPayoff=true, no mortgageStrategy): lumpSumEvent must be non-null ' +
    '— strategy normalizes to invest-lump-sum via lumpSumPayoff fallback. ' +
    `Got: ${JSON.stringify(out2.lumpSumEvent)}`
  );

  // V2 parity check: Run 1 (invest-keep-paying, no sale) must produce output
  // identical to the v2 snapshot for the "typical-buying-now" fixture.
  // This confirms the fallback path produces no drift from the v2 ground truth.
  const typicalSnapshot = V1_SNAPSHOTS.find((s) => s.label === 'typical-buying-now');
  assert.ok(
    typicalSnapshot,
    '[SC-004] typical-buying-now snapshot must exist in payoffVsInvest_v1Snapshots.json'
  );
  // Re-build Run 1 with the exact snapshot inputs to ensure apples-to-apples.
  const run1SnapshotInputs = { ...typicalSnapshot.inputs };
  delete run1SnapshotInputs.mortgageStrategy;
  assertV2ParityForBackCompat('SC-004 v2-parity (no mortgageStrategy, lumpSumPayoff=false)', run1SnapshotInputs, typicalSnapshot.output);
});

// ---------------------------------------------------------------------------
// T021–T024 (feature 018): User Story 4 — sell-at-FIRE × mortgage-strategy
// composition. Tests written FIRST (red) per TDD workflow. Implementation
// tasks T026–T029 will make these pass (green).
//
// T021 — Inv-9 HomeSaleEvent invariants
// T022 — SC-010 Section 121 exclusion boundary cases
// T023 — Inv-3 lump-sum inhibited post-FIRE when sellAtFire=true
// T024 — Inv-4 lump-sum LTCG gross-up on brokerage drawdown
//
// CONTRACT: specs/018-lifecycle-payoff-merge/contracts/payoffVsInvest-calc-v3.contract.md
// STATUS: EXPECTED TO FAIL until T026–T029 land. All four tests are
// intentionally red at this commit.
// ---------------------------------------------------------------------------

// T021 — Inv-9 HomeSaleEvent invariants
// CONTRACT: When sellAtFire===true && mortgageEnabled===true, homeSaleEvent must
// be a non-null object with all fields internally consistent:
//   proceeds === homeValueAtFire * (1 - sellingCostPct)                 (±1 rounding)
//   taxableGain === max(0, nominalGain - section121Exclusion)
//   netToBrokerage === proceeds - capGainsTax - remainingMortgageBalance (±1 rounding)
//   section121Exclusion === 500000 for mfjStatus='mfj'
// STATUS: EXPECTED TO FAIL until T027 adds homeSaleEvent computation.

test('v3 Inv-9 HomeSaleEvent: present when sellAtFire && mortgageEnabled, internally consistent', () => {
  // Use sellingCostPct: 0.06 in the mortgage override (homeLocation='us' would
  // yield 0.07 via the calc module's country table, but we override it here for
  // a predictable test value).
  const sellingCostPct = 0.06;
  const inputs = baseInputs({
    mortgage: baseMortgage({ sellAtFire: true, sellingCostPct }),
    mortgageStrategy: 'invest-keep-paying',
  });

  const out = computePayoffVsInvest(inputs);

  // Assertion 1: homeSaleEvent is a non-null object.
  assert.ok(
    out.homeSaleEvent !== null && typeof out.homeSaleEvent === 'object',
    '[Inv-9] homeSaleEvent must be a non-null object when sellAtFire=true and mortgageEnabled=true. ' +
    `Got: ${JSON.stringify(out.homeSaleEvent)}. T027 has not yet added homeSaleEvent computation.`
  );

  const ev = out.homeSaleEvent;

  // Assertion 2: sale fires at inputs.fireAge (51 by default from baseInputs).
  assert.strictEqual(
    ev.age,
    inputs.fireAge,
    `[Inv-9] homeSaleEvent.age (${ev.age}) must equal inputs.fireAge (${inputs.fireAge})`
  );

  // Assertion 3: proceeds === homeValueAtFire * (1 - sellingCostPct) within ±1.
  const expectedProceeds = Math.round(ev.homeValueAtFire * (1 - sellingCostPct));
  assert.ok(
    Math.abs(ev.proceeds - expectedProceeds) <= 1,
    `[Inv-9] proceeds (${ev.proceeds}) must equal homeValueAtFire × (1 - sellingCostPct) = ` +
    `${ev.homeValueAtFire} × ${1 - sellingCostPct} = ${expectedProceeds} (±1 rounding).`
  );

  // Assertion 4: taxableGain === max(0, nominalGain - section121Exclusion).
  const expectedTaxableGain = Math.max(0, ev.nominalGain - ev.section121Exclusion);
  assert.strictEqual(
    ev.taxableGain,
    expectedTaxableGain,
    `[Inv-9] taxableGain (${ev.taxableGain}) must equal max(0, nominalGain - section121Exclusion) = ` +
    `max(0, ${ev.nominalGain} - ${ev.section121Exclusion}) = ${expectedTaxableGain}`
  );

  // Assertion 5: netToBrokerage === proceeds - capGainsTax - remainingMortgageBalance within ±1.
  const expectedNet = Math.round(ev.proceeds - ev.capGainsTax - ev.remainingMortgageBalance);
  assert.ok(
    Math.abs(ev.netToBrokerage - expectedNet) <= 1,
    `[Inv-9] netToBrokerage (${ev.netToBrokerage}) must equal proceeds - capGainsTax - remainingMortgageBalance = ` +
    `${ev.proceeds} - ${ev.capGainsTax} - ${ev.remainingMortgageBalance} = ${expectedNet} (±1 rounding).`
  );

  // Assertion 6: section121Exclusion === 500000 for default mfjStatus='mfj'.
  assert.strictEqual(
    ev.section121Exclusion,
    500000,
    `[Inv-9] section121Exclusion must be 500000 for mfjStatus='mfj' (default); got ${ev.section121Exclusion}`
  );
});

// T022 — SC-010 Section 121 exclusion boundary cases
// CONTRACT: The private helper _section121Tax(homeValueAtFire, originalPurchasePrice,
// mfjStatus, ltcgRate) returns { section121Exclusion, nominalGain, taxableGain, capGainsTax }
// covering: (a) full exclusion (no tax); (b) partial taxation above MFJ cap;
// (c) single-filer partial taxation; (d) sale at a loss (no negative tax).
//
// NOTE: _section121Tax is not yet exported. This test will fail with
// "_section121Tax is not a function" until T026 adds and exports the helper.
// STATUS: EXPECTED TO FAIL until T026 lands _section121Tax in _payoffVsInvestApi.

test('v3 SC-010 Section 121 exclusion boundary cases', () => {
  // _section121Tax is added by T026 and exported via _payoffVsInvestApi.
  // At this point the export is missing, so we grab from the module export.
  const mod = require(path.resolve(__dirname, '..', '..', 'calc', 'payoffVsInvest.js'));
  const _section121Tax = mod._section121Tax;

  assert.ok(
    typeof _section121Tax === 'function',
    '[SC-010] _section121Tax must be exported from _payoffVsInvestApi. ' +
    'T026 has not yet added this helper. Got type: ' + typeof _section121Tax
  );

  // (a) Full exclusion applies — MFJ with $400K gain (gain ≤ $500K exclusion → no tax).
  // homeValueAtFire=900000, originalPurchasePrice=500000, mfjStatus='mfj', ltcgRate=0.15
  // nominalGain = 900000 - 500000 = 400000; taxableGain = max(0, 400000 - 500000) = 0
  const resA = _section121Tax(900000, 500000, 'mfj', 0.15);
  assert.strictEqual(resA.section121Exclusion, 500000,
    `[SC-010a] MFJ exclusion must be $500,000; got ${resA.section121Exclusion}`);
  assert.strictEqual(resA.nominalGain, 400000,
    `[SC-010a] nominalGain must be 400000 (900000 - 500000); got ${resA.nominalGain}`);
  assert.strictEqual(resA.taxableGain, 0,
    `[SC-010a] taxableGain must be 0 when gain (${resA.nominalGain}) ≤ exclusion (${resA.section121Exclusion}); got ${resA.taxableGain}`);
  assert.strictEqual(resA.capGainsTax, 0,
    `[SC-010a] capGainsTax must be 0 when taxableGain=0; got ${resA.capGainsTax}`);

  // (b) Partial taxation — MFJ, $700K nominal gain ($200K above $500K cap).
  // homeValueAtFire=1200000, originalPurchasePrice=500000, mfjStatus='mfj', ltcgRate=0.15
  // nominalGain=700000; taxableGain=max(0, 700000-500000)=200000; capGainsTax=200000*0.15=30000
  const resB = _section121Tax(1200000, 500000, 'mfj', 0.15);
  assert.strictEqual(resB.section121Exclusion, 500000,
    `[SC-010b] MFJ exclusion must be $500,000; got ${resB.section121Exclusion}`);
  assert.strictEqual(resB.nominalGain, 700000,
    `[SC-010b] nominalGain must be 700000 (1200000 - 500000); got ${resB.nominalGain}`);
  assert.strictEqual(resB.taxableGain, 200000,
    `[SC-010b] taxableGain must be 200000 (700000 - 500000); got ${resB.taxableGain}`);
  assert.strictEqual(resB.capGainsTax, 30000,
    `[SC-010b] capGainsTax must be 30000 (200000 × 0.15); got ${resB.capGainsTax}`);

  // (c) Single filer — $300K nominal gain, single exclusion cap $250K.
  // homeValueAtFire=800000, originalPurchasePrice=500000, mfjStatus='single', ltcgRate=0.15
  // nominalGain=300000; section121Exclusion=250000; taxableGain=50000; capGainsTax=7500
  const resC = _section121Tax(800000, 500000, 'single', 0.15);
  assert.strictEqual(resC.section121Exclusion, 250000,
    `[SC-010c] Single exclusion must be $250,000; got ${resC.section121Exclusion}`);
  assert.strictEqual(resC.nominalGain, 300000,
    `[SC-010c] nominalGain must be 300000 (800000 - 500000); got ${resC.nominalGain}`);
  assert.strictEqual(resC.taxableGain, 50000,
    `[SC-010c] taxableGain must be 50000 (300000 - 250000); got ${resC.taxableGain}`);
  assert.strictEqual(resC.capGainsTax, 7500,
    `[SC-010c] capGainsTax must be 7500 (50000 × 0.15); got ${resC.capGainsTax}`);

  // (d) Home sold at a loss — no negative tax credit allowed.
  // homeValueAtFire=450000, originalPurchasePrice=500000, mfjStatus='mfj', ltcgRate=0.15
  // nominalGain=450000-500000=-50000 (loss); taxableGain=max(0,-50000-500000)→max(0,-550000)=0
  const resD = _section121Tax(450000, 500000, 'mfj', 0.15);
  assert.strictEqual(resD.section121Exclusion, 500000,
    `[SC-010d] MFJ exclusion must be $500,000; got ${resD.section121Exclusion}`);
  assert.strictEqual(resD.nominalGain, -50000,
    `[SC-010d] nominalGain must be -50000 (450000 - 500000, a loss); got ${resD.nominalGain}`);
  assert.strictEqual(resD.taxableGain, 0,
    `[SC-010d] taxableGain must be 0 for a loss (no negative tax credit); got ${resD.taxableGain}`);
  assert.strictEqual(resD.capGainsTax, 0,
    `[SC-010d] capGainsTax must be 0 for a loss; got ${resD.capGainsTax}`);
});

// T023 — Inv-3 lump-sum inhibited post-FIRE when sellAtFire=true
// CONTRACT (Inv-3 v3 extension): When sellAtFire===true, the invest-lump-sum
// trigger is evaluated ONLY for months where age < fireAge. If FIRE arrives
// before the trigger condition is met, lumpSumEvent===null — sell-at-FIRE
// retires the mortgage instead.
// STATUS: EXPECTED TO FAIL until T026/T027 (homeSaleEvent) AND T028 (lump-sum
// inhibition gate) land.

test('v3 Inv-3 lump-sum trigger inhibited when sale-at-FIRE arrives first', () => {
  // Low-extra, low-return scenario: the lump-sum trigger condition (brokerage >=
  // real mortgage balance) cannot be met pre-FIRE with these parameters. With
  // stocksReturn=0.04, extraMonthly=200, fireAge=51 (9 years from currentAge=42),
  // the Invest brokerage is far too small to equal the ~$400K remaining balance.
  // sellAtFire=true means the home sale at FIRE retires the mortgage instead.
  const inputs = baseInputs({
    mortgage: baseMortgage({ sellAtFire: true }),
    mortgageStrategy: 'invest-lump-sum',
    stocksReturn: 0.04,
    extraMonthly: 200,
    fireAge: 51,
    endAge: 99,
  });

  const out = computePayoffVsInvest(inputs);

  // Assertion 1: lumpSumEvent === null — trigger never fired pre-FIRE.
  assert.strictEqual(
    out.lumpSumEvent,
    null,
    '[Inv-3] lumpSumEvent must be null when sellAtFire=true and lump-sum trigger cannot be met pre-FIRE. ' +
    `Got: ${JSON.stringify(out.lumpSumEvent)}. T028 has not yet added the pre-FIRE gate.`
  );

  // Assertion 2: homeSaleEvent !== null — sell-at-FIRE fires at FIRE age instead.
  assert.ok(
    out.homeSaleEvent !== null && out.homeSaleEvent !== undefined,
    '[Inv-3] homeSaleEvent must be non-null when sellAtFire=true and mortgageEnabled=true. ' +
    `Got: ${JSON.stringify(out.homeSaleEvent)}. T026/T027 has not yet added homeSaleEvent computation.`
  );
});

// T024 — Inv-4 lump-sum LTCG gross-up on brokerage drawdown
// CONTRACT (Inv-4 v3 extension, FR-011 Q2=B):
//   brokerageDrawdown = realBalance × (1 + ltcgRate × stockGainPct)
//   brokerageAfter = brokerageBefore - brokerageDrawdown
//
// The gross-up accounts for the LTCG tax owed on selling enough shares to raise
// realBalance. The actual cash withdrawn equals realBalance (to pay the mortgage),
// but the pre-tax shares liquidated = realBalance / (1 - ltcgRate × stockGainPct).
// The brokerage must show the gross-up (pre-tax liquidation) not just realBalance.
//
// STATUS: EXPECTED TO FAIL until T028 adds the LTCG gross-up logic.
// NOTE: If T028's implementation does not include the gross-up, this test will
// continue failing — the implementer must add it (see task brief).

test('v3 Inv-4 lump-sum LTCG gross-up: brokerage drops by realBalance × (1 + ltcgRate × stockGainPct)', () => {
  // High-extra scenario (extraMonthly=1500) with no sellAtFire — the lump-sum
  // trigger fires normally before endAge. Inputs from baseInputs give:
  //   ltcgRate: 0.15, stockGainPct: 0.6 (defined in baseInputs factory)
  //   grossUpFactor = 1 + (0.15 × 0.6) = 1.09
  const inputs = baseInputs({
    mortgageStrategy: 'invest-lump-sum',
    stocksReturn: 0.07,
    extraMonthly: 1500,
  });

  const out = computePayoffVsInvest(inputs);

  // Assertion 1: lumpSumEvent fired.
  assert.ok(
    out.lumpSumEvent !== null && out.lumpSumEvent !== undefined,
    '[Inv-4] lumpSumEvent must be non-null for stocksReturn=0.07/extraMonthly=1500/invest-lump-sum. ' +
    `Got: ${JSON.stringify(out.lumpSumEvent)}.`
  );

  const ev = out.lumpSumEvent;

  // Assertion 2: brokerage drawdown equals paidOff × (1 + ltcgRate × stockGainPct), within $2.
  // Per FR-011 Q2=B: grossedUpDrawdown = realBalance × (1 + ltcgRate × stockGainPct).
  // paidOff == realBalance (remaining mortgage at trigger), per existing LumpSumEvent typedef.
  // ltcgRate=0.15, stockGainPct=0.6 → grossUpFactor=1.09.
  const ltcgRate = inputs.ltcgRate;        // 0.15 from baseInputs
  const stockGainPct = inputs.stockGainPct; // 0.6 from baseInputs
  const expectedDrawdown = ev.paidOff * (1 + ltcgRate * stockGainPct);
  const actualDrawdown = ev.brokerageBefore - ev.brokerageAfter;

  assert.ok(
    Math.abs(actualDrawdown - expectedDrawdown) <= 2,
    `[Inv-4] LTCG gross-up: actualDrawdown (${actualDrawdown.toFixed(2)}) must equal ` +
    `paidOff × (1 + ltcgRate × stockGainPct) = ${ev.paidOff} × 1.09 = ${expectedDrawdown.toFixed(2)} (±$2). ` +
    `Diff = ${Math.abs(actualDrawdown - expectedDrawdown).toFixed(2)}. ` +
    'T028 must add the LTCG gross-up (FR-011 Q2=B). Without it, actualDrawdown === paidOff (no gross-up).'
  );
});

// T036 — v3 US2 sidebar formatter: produces expected display-template descriptor
// CONTRACT (T037 helper):
//   _formatSidebarMortgageIndicator(strategy, activePayoffAge) →
//     { key: 'sidebar.mortgageStatus.template', args: [strategyLabelKey, activePayoffAge] }
//   strategy → strategyLabelKey mapping:
//     'prepay-extra'        → 'pvi.strategy.prepay'
//     'invest-keep-paying'  → 'pvi.strategy.investKeep'
//     'invest-lump-sum'     → 'pvi.strategy.investLumpSum'
//     unknown               → 'pvi.strategy.investKeep' (safe fallback)
// Pure function — no DOM, no globals.
test('v3 US2 sidebar formatter: produces expected display string', () => {
  // prepay-extra → pvi.strategy.prepay
  assert.deepStrictEqual(
    _payoffVsInvestApi._formatSidebarMortgageIndicator('prepay-extra', 58),
    { key: 'sidebar.mortgageStatus.template', args: ['pvi.strategy.prepay', 58] },
    '[US2] strategy="prepay-extra", activePayoffAge=58 must yield prepay label key + age 58.'
  );

  // invest-keep-paying → pvi.strategy.investKeep
  assert.deepStrictEqual(
    _payoffVsInvestApi._formatSidebarMortgageIndicator('invest-keep-paying', 60),
    { key: 'sidebar.mortgageStatus.template', args: ['pvi.strategy.investKeep', 60] },
    '[US2] strategy="invest-keep-paying", activePayoffAge=60 must yield investKeep label key + age 60.'
  );

  // invest-lump-sum → pvi.strategy.investLumpSum
  assert.deepStrictEqual(
    _payoffVsInvestApi._formatSidebarMortgageIndicator('invest-lump-sum', 55),
    { key: 'sidebar.mortgageStatus.template', args: ['pvi.strategy.investLumpSum', 55] },
    '[US2] strategy="invest-lump-sum", activePayoffAge=55 must yield investLumpSum label key + age 55.'
  );
});
