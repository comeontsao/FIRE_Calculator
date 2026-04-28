# Contract: `calc/payoffVsInvest.js` — Pure Calc Module

**Feature**: 016-mortgage-payoff-vs-invest
**Module file**: `calc/payoffVsInvest.js` (NEW)
**Type**: Pure JavaScript module (no DOM, no Chart.js, no globals beyond UMD attach)
**Constitution Principles enforced**: II (purity + audit-observability), V (UMD classic-script load), VI (Consumers list)

---

## Module header (mandatory comment block)

```text
// =============================================================================
// MODULE: calc/payoffVsInvest.js
// Inputs : PrepayInvestComparisonInputs (see data-model.md). Pure record;
//          assembled by the renderer from existing dashboard state.
// Outputs: PrepayInvestComparisonOutputs — { prepayPath, investPath,
//          amortizationSplit, verdict, factors, crossover, refiAnnotation,
//          subSteps, disabledReason? }.
// Consumers:
//   - FIRE-Dashboard.html → renderPayoffVsInvestWealthChart
//   - FIRE-Dashboard.html → renderPayoffVsInvestAmortizationChart
//   - FIRE-Dashboard.html → renderPayoffVsInvestVerdictBanner
//   - FIRE-Dashboard.html → renderPayoffVsInvestFactorBreakdown
//   - FIRE-Dashboard-Generic.html → same four renderers (lockstep)
//   - tests/unit/payoffVsInvest.test.js → fixture-locked unit tests
// Policy : NO DOM access. NO Chart.js. NO localStorage. NO global mutable
//          state. The renderer assembles inputs and consumes outputs; this
//          module is one stateless transform.
// =============================================================================
```

---

## Public API surface

The module exposes ONE primary function plus a small set of helpers used by the unit test:

```text
computePayoffVsInvest(inputs: PrepayInvestComparisonInputs)
  → PrepayInvestComparisonOutputs

// Internal helpers exposed for unit testing (NOT for renderer consumption):
_amortize(balance, annualRate, termYears, monthsToSimulate, extraPrincipalPerMonth)
  → { schedule: PaymentMonth[], balanceAfter, totalInterestPaid }

_pmt(principal, monthlyRate, totalMonths)  // standard mortgage payment formula
  → number   // dollars per month

_compoundInvested(startingBalance, monthlyContribution, monthlyRealReturn, months)
  → number   // ending balance, real dollars

_evaluateFactors(inputs, prepayPath, investPath)
  → Factor[]
```

---

## Core algorithm (high-level, year-stepped)

```text
function computePayoffVsInvest(inputs):
  validate(inputs)  // returns disabledReason early if mortgage off / paid off

  // Pre-compute month-by-month for both strategies, then aggregate to annual rows.
  state_prepay = initialMortgageState(inputs)
  state_invest = initialMortgageState(inputs)

  invested_prepay = 0
  invested_invest = 0

  prepayPath = []
  investPath = []
  amortPrepay = []
  amortInvest = []

  realReturnMonthly = (1 + (inputs.stocksReturn − inputs.inflation)
                          × (1 − inputs.ltcgRate × inputs.stockGainPct)) ^ (1/12) − 1

  for age in [currentAge .. endAge]:
    yearInterestPrepay = 0
    yearInterestInvest = 0
    yearPrincipalPrepay = 0
    yearPrincipalInvest = 0

    for month in [1 .. 12]:
      // Refi event handling — at the START of refiYear's first month
      if plannedRefi != null AND age == currentAge + plannedRefi.refiYear AND month == 1:
        applyRefi(state_prepay, plannedRefi)   // both strategies refi
        applyRefi(state_invest, plannedRefi)

      // Prepay strategy: pay P&I + extraMonthly toward principal
      if state_prepay.balance > 0:
        i = state_prepay.balance × state_prepay.rate / 12
        p = min(state_prepay.PI − i + extraMonthly, state_prepay.balance)
        state_prepay.balance −= p
        yearInterestPrepay += i
        yearPrincipalPrepay += p
        // After payoff, redirect (PI + extraMonthly) into investments
      else:
        invested_prepay = invested_prepay × (1 + realReturnMonthly) + (state_prepay.PI_prePayoff + extraMonthly)
        // already-paid: contribute the freed cash flow

      // Invest strategy: pay only P&I; deposit extraMonthly into investments
      if state_invest.balance > 0:
        i = state_invest.balance × state_invest.rate / 12
        p = min(state_invest.PI − i, state_invest.balance)
        state_invest.balance −= p
        yearInterestInvest += i
        yearPrincipalInvest += p
        invested_invest = invested_invest × (1 + realReturnMonthly) + extraMonthly
      else:
        invested_invest = invested_invest × (1 + realReturnMonthly) + (state_invest.PI_prePayoff + extraMonthly)

      // Compound the prepay path's invested balance (active even pre-payoff if any sat there)
      if invested_prepay > 0 AND state_prepay.balance > 0:
        invested_prepay = invested_prepay × (1 + realReturnMonthly)

    // End of year — record the snapshot row
    homeValue = computeHomeValueReal(inputs, age)   // real-dollar home value
    prepayPath.push({ age, year, mortgageBalance: state_prepay.balance, ... })
    investPath.push(... same shape ...)
    amortPrepay.push({ age, year, interestPaidThisYear: yearInterestPrepay, ... })
    amortInvest.push(... same shape ...)

  // Verdict + factors + crossover
  verdict = computeVerdict(prepayPath, investPath, inputs.fireAge, inputs.endAge)
  factors = _evaluateFactors(inputs, prepayPath, investPath)
  crossover = detectCrossover(prepayPath, investPath, inputs)

  return { prepayPath, investPath, amortizationSplit: { prepay: amortPrepay, invest: amortInvest },
           verdict, factors, crossover, refiAnnotation, subSteps }
```

---

## Determinism contract

- Same `inputs` record → byte-identical outputs every call.
- No `Math.random()`, no `Date.now()`, no clock reads.
- No iteration over `Object.keys()` of caller-supplied objects in a way that would expose insertion-order non-determinism.

---

## subSteps emission (Constitution Principle II audit-observability)

The output `subSteps: string[]` MUST list, in execution order:

1. `"validate inputs (mortgage state, ages, ranges)"`
2. `"initialize mortgage amortization for both strategies"`
3. `"month-by-month: amortize Prepay path with extra principal"`
4. `"month-by-month: amortize Invest path; deposit extra to brokerage"`
5. `"month-by-month: compound brokerage at after-tax real return"`
6. `"apply planned refi at year N (if configured)"` — only emitted when refi is active
7. `"aggregate monthly accruals into annual WealthPath rows"`
8. `"detect crossover via linear interpolation (R6)"`
9. `"score factors and assign favoredStrategy / magnitude"`
10. `"compute verdict at fireAge + endAge"`

The Audit tab is not extended in v1, but the `subSteps` field is preserved for a future audit-pill expansion.

---

## Error / disabled paths

The function NEVER throws on user-driven invalid inputs. It returns:

```text
{
  prepayPath: [], investPath: [], amortizationSplit: { prepay: [], invest: [] },
  verdict: null, factors: [], crossover: null, refiAnnotation: null,
  subSteps: ['validation failed'],
  disabledReason: 'no-mortgage' | 'already-paid-off' | 'invalid-ages',
  disabledNote?: string   // optional human-readable reason in EN
}
```

The renderer reads `disabledReason` and shows the appropriate explainer card (FR-011, FR-012). i18n resolution is the renderer's job.

---

## UMD wrapper (Constitution Principle V)

The file's bottom MUST contain:

```js
const _payoffVsInvestApi = {
  computePayoffVsInvest,
  _amortize, _pmt, _compoundInvested, _evaluateFactors,
};
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _payoffVsInvestApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.computePayoffVsInvest = computePayoffVsInvest;
  globalThis.payoffVsInvestModule = _payoffVsInvestApi;
}
```

NO `export` keyword anywhere in the file. Confirmed via the existing meta-test pattern (Constitution Principle V's file-protocol rule).

---

## Test contract — what `tests/unit/payoffVsInvest.test.js` MUST cover

Per SC-008 / SC-009 / SC-010 plus Constitution Principle IV:

| Fixture case | Inputs | Expected verdict |
|--------------|--------|------------------|
| **Prepay clearly wins** | mortgage 8 %, stocks 4 %, infl 3 %, LTCG 15 %, stockGain 60 %, 30y term, 0 refi, $500/mo extra, age 42→99 | `winnerAtFire === 'prepay'`, `winnerAtEnd === 'prepay'` |
| **Invest clearly wins** | mortgage 3 %, stocks 8 %, infl 3 %, LTCG 15 %, stockGain 60 %, 30y term, 0 refi, $500/mo extra, age 42→99 | `winnerAtFire === 'invest'`, `winnerAtEnd === 'invest'` |
| **Tie calibration** | mortgage rate equal to stocks-after-tax-real, $500/mo extra | `marginAtFire / max(totalNetWorth) < 0.01` (within 1 %) |
| **Refi mid-window** | starting 7 %, refi at year 5 → 4 % at 30y term | interest-paid array shows visible jump down at year 5 (then back up because new amortization is interest-heavy); verdict shifts toward Invest vs the no-refi case |
| **Override shifts toward Invest** | nominal 6 %, override 4 %, otherwise tie inputs | `winnerAtFire === 'invest'` (or stays 'invest' if already there); `factors` includes `effective-mortgage-rate` row |
| **Mortgage off** | `mortgageEnabled: false` | `disabledReason === 'no-mortgage'`, all paths empty |
| **Already paid off** | `ownership: 'already-own'`, `yearsPaid: 30`, `term: 30` | `disabledReason === 'already-paid-off'` |
| **Refi-clamped to buy-in year** | `ownership: 'buying-in'`, `buyInYears: 5`, `refiYear: 3` | refi effectively starts at year 5; `refiAnnotation.refiAge === currentAge + 5` |
| **Determinism** | Same inputs called twice | `JSON.stringify(out1) === JSON.stringify(out2)` |
| **Monotonicity (SC-002)** | extraMonthly = 0 → 1000 → 2000 with otherwise-Invest-winning inputs | `marginAtFire(2000) ≥ marginAtFire(1000) ≥ marginAtFire(0)` |
