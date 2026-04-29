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
  // lumpSumPayoff: false is explicit here to document the v1-parity contract.
  // Inv-1 (feature 017): when lumpSumPayoff===false AND ownership!=='buying-in',
  // every v2 output field must be byte-for-byte identical to this v1 baseline.
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
  }, overrides || {});
}

// ---------------------------------------------------------------------------
// Inv-1 regression helpers (feature 017 / T003)
// ---------------------------------------------------------------------------

/**
 * Load the v1 snapshot fixtures captured before any v2 changes were made.
 * The JSON file is the ground truth that v2 must reproduce when the switch
 * is off (lumpSumPayoff: false, ownership !== 'buying-in').
 */
const V1_SNAPSHOTS = require(path.resolve(__dirname, 'fixtures', 'payoffVsInvest_v1Snapshots.json'));

/**
 * Assert that computing `inputs` with the CURRENT module produces output
 * byte-for-byte identical to `capturedV1Output` (every top-level field).
 * Reports specific field paths on mismatch so diffs are easy to diagnose.
 *
 * @param {string} label              human-readable name for the fixture
 * @param {object} inputs             inputs to run through computePayoffVsInvest
 * @param {object} capturedV1Output   the v1 ground-truth output
 */
function assertV1ParityWhenSwitchOff(label, inputs, capturedV1Output) {
  const current = computePayoffVsInvest(inputs);

  // Compare every top-level key present in the captured snapshot.
  const topKeys = Object.keys(capturedV1Output);
  for (const key of topKeys) {
    const v1Val = capturedV1Output[key];
    const curVal = current[key];
    const v1Json = JSON.stringify(v1Val);
    const curJson = JSON.stringify(curVal);
    if (v1Json !== curJson) {
      // Produce a precise diff for array fields: find first diverging index.
      if (Array.isArray(v1Val) && Array.isArray(curVal)) {
        for (let i = 0; i < Math.max(v1Val.length, curVal.length); i++) {
          const v1Item = JSON.stringify(v1Val[i]);
          const curItem = JSON.stringify(curVal[i]);
          if (v1Item !== curItem) {
            // Dig into object fields for the first row mismatch.
            if (v1Val[i] && curVal[i] && typeof v1Val[i] === 'object') {
              for (const field of Object.keys(v1Val[i])) {
                if (v1Val[i][field] !== curVal[i][field]) {
                  assert.fail(
                    `[Inv-1 parity] "${label}" — ${key}[${i}].${field} mismatch: ` +
                    `v1=${v1Val[i][field]} vs current=${curVal[i] ? curVal[i][field] : 'MISSING'}`
                  );
                }
              }
            }
            assert.fail(
              `[Inv-1 parity] "${label}" — ${key}[${i}] mismatch:\n  v1=${v1Item}\n  cur=${curItem}`
            );
          }
        }
      }
      // For objects, find first diverging property.
      if (v1Val && curVal && typeof v1Val === 'object' && !Array.isArray(v1Val)) {
        for (const field of Object.keys(v1Val)) {
          if (JSON.stringify(v1Val[field]) !== JSON.stringify(curVal[field])) {
            assert.fail(
              `[Inv-1 parity] "${label}" — ${key}.${field} mismatch: ` +
              `v1=${JSON.stringify(v1Val[field])} vs current=${JSON.stringify(curVal[field])}`
            );
          }
        }
      }
      // Scalar or anything else.
      assert.fail(
        `[Inv-1 parity] "${label}" — top-level field "${key}" mismatch:\n  v1=${v1Json}\n  cur=${curJson}`
      );
    }
  }
}

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
    lumpSumPayoff: true,
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

  // Assertion 3: Inv-4 — brokerageAfter === brokerageBefore − paidOff within $2 rounding.
  const diff = Math.abs(ev.brokerageAfter - (ev.brokerageBefore - ev.paidOff));
  assert.ok(
    diff <= 2,
    `[Inv-4] lumpSumEvent rounding: brokerageAfter (${ev.brokerageAfter}) should equal ` +
    `brokerageBefore (${ev.brokerageBefore}) − paidOff (${ev.paidOff}) ± $2. ` +
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
    lumpSumPayoff: true,
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
    lumpSumPayoff: true,
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
  const outLumpSum = computePayoffVsInvest(baseInputs({ ...baseScenario, lumpSumPayoff: true }));

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
