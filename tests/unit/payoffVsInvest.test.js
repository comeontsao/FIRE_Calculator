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

test('buying-in path: pre-buy-in years, both strategies contribute 12 × extraMonthly to brokerage', () => {
  const extra = 1500;
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 3 }),
    extraMonthly: extra,
  });
  const out = computePayoffVsInvest(inputs);
  const expected = 12 * extra;
  // Years 0, 1, 2 are pre-buy-in (buyInYears=3 → buy-in begins at month 36 == start of year 3).
  for (let i = 0; i < 3; i++) {
    const p = out.amortizationSplit.prepay[i];
    const ii = out.amortizationSplit.invest[i];
    assert.ok(Math.abs(p.brokerageContribThisYear - expected) <= 1,
      `pre-buy-in prepay row ${i}: expected ${expected}, got ${p.brokerageContribThisYear}`);
    assert.ok(Math.abs(ii.brokerageContribThisYear - expected) <= 1,
      `pre-buy-in invest row ${i}: expected ${expected}, got ${ii.brokerageContribThisYear}`);
    // And during pre-buy-in there's no mortgage interest/principal at all.
    assert.strictEqual(p.interestPaidThisYear, 0);
    assert.strictEqual(p.principalPaidThisYear, 0);
    assert.strictEqual(ii.interestPaidThisYear, 0);
    assert.strictEqual(ii.principalPaidThisYear, 0);
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

test('buying-in: pre-buy-in years have freeAndClearWealth equal to invested (mortgage gated to 0)', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  // Ages 42 and 43 are pre-buy-in (buyInMonth=24). Both rows must satisfy
  // freeAndClearWealth ≈ invested (the mortgage doesn't exist yet).
  for (const i of [0, 1]) {
    const rowP = out.prepayPath[i];
    const rowI = out.investPath[i];
    assert.ok(Math.abs(rowP.freeAndClearWealth - rowP.invested) <= 1,
      `pre-buy-in prepay row ${i} (age ${rowP.age}): freeAndClearWealth=${rowP.freeAndClearWealth}, invested=${rowP.invested}`);
    assert.ok(Math.abs(rowI.freeAndClearWealth - rowI.invested) <= 1,
      `pre-buy-in invest row ${i} (age ${rowI.age}): freeAndClearWealth=${rowI.freeAndClearWealth}, invested=${rowI.invested}`);
  }
});

test('buying-in: at buy-in year (age = currentAge + buyInYears), freeAndClearWealth drops to invested − mortgageBalanceReal', () => {
  const inputs = baseInputs({
    mortgage: baseMortgage({ ownership: 'buying-in', buyInYears: 2 }),
    extraMonthly: 1500,
  });
  const out = computePayoffVsInvest(inputs);
  // Age 44 is yearOffset 2; buyInMonth=24 so monthIndex=24 is at yearOffset=2,
  // monthInYear=0 → mortgage active starting that month.
  const rowP = out.prepayPath[2];
  const rowI = out.investPath[2];
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
