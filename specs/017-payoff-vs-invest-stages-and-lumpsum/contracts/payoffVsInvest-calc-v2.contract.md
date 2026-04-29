# Contract — `calc/payoffVsInvest.js` v2 (extends 016 contract)

**Module:** `calc/payoffVsInvest.js`
**Version:** v2 (this feature) — supersedes v1 from `specs/016-mortgage-payoff-vs-invest/contracts/payoffVsInvest-calc.contract.md`.
**Compatibility:** v2 is a strict superset of v1. v1 callers that pass no `lumpSumPayoff` get the v1 behavior (`lumpSumPayoff` defaults to `false` inside the module).

---

## Inputs (extension)

```ts
PrepayInvestComparisonInputs {
  // ...all v1 fields unchanged (currentAge, fireAge, endAge, mortgage, stocksReturn,
  //     inflation, ltcgRate, stockGainPct, extraMonthly, framing,
  //     effectiveRateOverride, plannedRefi, mortgageEnabled)

  // NEW in v2:
  lumpSumPayoff?: boolean   // default: false. If true, Invest fires a lump-sum
                            // payoff the first month its real-dollar brokerage
                            // equals the remaining real-dollar mortgage balance.
}
```

---

## Outputs (extension)

```ts
PrepayInvestComparisonOutputs {
  // ...all v1 fields unchanged (prepayPath, investPath, amortizationSplit,
  //     verdict, factors, crossover, refiAnnotation, refiClampedNote,
  //     mortgageFreedom, mortgageNaturalPayoff, subSteps, disabledReason?)

  // NEW in v2:
  lumpSumEvent: LumpSumEvent | null,
  stageBoundaries: StageBoundaries,

  // MUTATED in v2:
  // mortgageNaturalPayoff.investAge — when lumpSumPayoff===true AND a
  //   lumpSumEvent fired, this field reflects the lump-sum age. Otherwise
  //   unchanged from v1 (bank's amortization-end age).
}

LumpSumEvent {
  age: number
  monthInYear: number              // 0..11
  brokerageBefore: number          // real $, rounded
  paidOff: number                  // real $, rounded
  brokerageAfter: number           // real $, rounded; >= 0 by construction
}

StageBoundaries {
  windowStartAge: number
  firstPayoffAge: number
  firstPayoffWinner: 'prepay' | 'invest'
  secondPayoffAge: number | null
}
```

See `specs/017-payoff-vs-invest-stages-and-lumpsum/data-model.md` for full field semantics.

---

## Consumers (Principle VI two-way link)

| Consumer | What it reads | File |
|---|---|---|
| `renderPayoffVsInvestBrokerageChart` | `prepayPath[].liquidNetWorth`, `investPath[].liquidNetWorth`, `mortgageNaturalPayoff`, `mortgageFreedom.buyInAge`, `refiAnnotation`, **`stageBoundaries`** (NEW — for shaded bands), **`lumpSumEvent`** (NEW — for blue down-arrow marker) | `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` |
| `renderPayoffVsInvestAmortizationChart` | `amortizationSplit.{prepay,invest}[]` | `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` |
| `renderPayoffVsInvestVerdictBanner` | `mortgageNaturalPayoff`, `prepayPath[*].liquidNetWorth`, `investPath[*].liquidNetWorth`, **`lumpSumEvent`** (NEW — for banner Line 3) | `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` |
| `renderPayoffVsInvestFactorBreakdown` | `factors[]` | `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` |
| `tests/unit/payoffVsInvest.test.js` | full output for fixture lock | (project root) |

---

## Behavioral Invariants

### Inv-1: Backwards compatibility (regression lock)

For every input record where `lumpSumPayoff === false` AND `ownership !== 'buying-in'`:

```
v2(inputs).<every output field> === v1(inputs).<every output field>
```

Verified by `tests/unit/payoffVsInvest.test.js` — all existing v1 fixture cases must continue to pass byte-identically when the new `lumpSumPayoff: false` is added explicitly.

### Inv-2: Window start

For `ownership === 'buying-in'` with `buyInYears > 0`:

```
prepayPath[0].age === currentAge + buyInYears
investPath[0].age === currentAge + buyInYears
prepayPath[0].invested === 0
investPath[0].invested === 0
amortizationSplit.prepay[0].age === currentAge + buyInYears
amortizationSplit.invest[0].age === currentAge + buyInYears
```

### Inv-3: Lump-sum fires at most once

`lumpSumEvent` is either `null` or a single record. Once recorded, the simulator does not re-evaluate the trigger condition (Invest's mortgage balance is 0 from that point onward).

### Inv-4: Lump-sum reduces brokerage by exactly the remaining real balance

```
lumpSumEvent.brokerageAfter
  === lumpSumEvent.brokerageBefore - lumpSumEvent.paidOff   // ± $1 rounding
```

### Inv-5: Stage ordering

```
stageBoundaries.windowStartAge <= stageBoundaries.firstPayoffAge
stageBoundaries.firstPayoffAge < stageBoundaries.secondPayoffAge   // when both exist
stageBoundaries.firstPayoffWinner === 'prepay' iff prepayPath's first zero-balance row.age <= investPath's first zero-balance row.age
```

### Inv-6: Interest invariant

For any non-degenerate scenario:

```
sum(amortizationSplit.prepay[*].interestPaidThisYear)
  < sum(amortizationSplit.invest[*].interestPaidThisYear)        // when lumpSumPayoff=false
  < sum(amortizationSplit.invest[*].interestPaidThisYear, v1)    // when lumpSumPayoff=true
```

(Lump-sum saves Invest some late-stage interest by killing the loan early.)

### Inv-7: Pure-module invariants (Principle II)

Unchanged from v1: no DOM access, no Chart.js calls, no `localStorage` reads, no global mutable state. v2's new code paths obey the same constraints.

### Inv-8: UMD-classic-script (Principle V)

Unchanged from v1: module exports via `globalThis.computePayoffVsInvest = ...` and `module.exports = { ... }` only. No top-level `export` keyword. New helper functions (e.g., `_findStageBoundaries`) follow the existing `_helperName` private-prefix convention and are added to the `_payoffVsInvestApi` object for testability.

---

## Audit `subSteps` (Principle II observability)

When `lumpSumPayoff === true`, the returned `subSteps` array gains:

```text
'check lump-sum payoff trigger each month for Invest'
'lump-sum fires at age {X}: brokerage drops from {Y} to {Z}'   // only if fired
'compute stageBoundaries from path inflection points'
```

When `ownership === 'buying-in'` with `buyInYears > 0`:

```text
'window starts at buy-in age (year offset {N})'
```

---

## Test Plan Reference

Concrete test cases enumerated in `specs/017-payoff-vs-invest-stages-and-lumpsum/spec.md` §8. Coverage requirement: 80%+ overall (project standard); every new branch in v2 hit by ≥ 1 test.
