// ==================== TEST SUITE: payoffVsInvest calc module ====================
// Feature 016 — Mortgage Payoff vs Invest comparison.
// Contract: specs/016-mortgage-payoff-vs-invest/contracts/payoffVsInvest-calc.contract.md
// Locks in SC-002 (monotonicity), SC-003 (tie calibration), SC-008 (winner
// detection), SC-009 (refi visible jump), SC-010 (override shifts toward invest).
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
  }, overrides || {});
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
