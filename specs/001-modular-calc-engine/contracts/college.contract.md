# Contract: `calc/college.js`

**Role**: Merge per-child college cost windows into a year-indexed cost curve.

## Inputs
```js
computeCollegeCosts({
  kids: [{
    name:             string,
    currentAge:       number,
    fourYearCostReal: number,    // total real-dollar cost across all 4 years
    startAge?:        number,    // default 18

    // US2b extension — loan-financing overlay.
    // Models Federal Direct Subsidized (no in-school interest). The in-school
    // window (kidAge ∈ [startAge, startAge+3]) carries (1 − pctFinanced) ×
    // annualCost; the post-graduation repayment window (kidAge ∈
    // [startAge+4, startAge+4+loanTermYears]) carries amortized payments
    // multiplied by parentPayPct.
    pctFinanced?:     number,    // 0..1, default 0
    parentPayPct?:    number,    // 0..1, default 1
    loanRateReal?:    number,    // decimal real rate, default 0.0353
    loanTermYears?:   number,    // integer, default 10
  }],
  currentYear: number
}) => CollegeSchedule
```

## Outputs
```js
{
  perYear: [{
    year,
    age,                 // representative attending kid's age that year
    costReal,            // merged in-school + loan-repayment cost across all kids this year
    kidNames: [...],     // kids whose costs contributed this year
    inSchoolShareReal?,  // (optional) the portion of costReal from in-school tuition
    loanShareReal?,      // (optional) the portion from loan amortization
  }]
}
```

## Consumers
- `lifecycle.js` — subtracts `costReal` from withdrawable income in the relevant years.
  Operates during BOTH accumulation and retirement phases (see "Accumulation-year coverage" below).
- `timelineChart` renderer — displays per-kid college windows.
- `collegeLoanImpact` summary panel — reads `loanShareReal` to show how much of the
  cost curve is post-graduation loan repayment vs in-school tuition.

## Invariants
- Default `startAge = 18` if not provided.
- Base four-year window: tuition cost applies to years `[startAge, startAge+3]` inclusive.
- Loan window: when `pctFinanced > 0`, the repayment window is `[startAge+4, startAge+4+loanTermYears−1]` inclusive.
- Per-year tuition cost (in-school) = `fourYearCostReal / 4 × (1 − pctFinanced)`.
- Per-year loan payment (post-graduation) = `amortized(principal, loanRateReal, loanTermYears) × parentPayPct`
  where `principal = fourYearCostReal × pctFinanced` (no in-school interest accrual per
  Federal Direct Subsidized rules).
- Overlapping windows (two kids simultaneously, or one kid's loan repayment overlapping another's
  in-school years) sum correctly in `costReal`.
- Empty `kids` array → empty `perYear`.
- `pctFinanced === 0` (default) ⇒ output shape matches today's module output exactly
  (regression safety for the existing unit tests).

## Accumulation-year coverage

College costs occur whenever kid attendance falls in a year — which may be
DURING the accumulation phase (the household is still earning) or DURING the
retirement phase (the household is withdrawing from portfolio).

`lifecycle.js` handles both cases uniformly: in each year, `costReal` is
subtracted from the year's withdrawable income. In accumulation years this
reduces `effectiveAnnualSavings` (exactly as the inline engine models today). In
retirement years it increases `adjustedSpend` (the target withdrawal).

Therefore: `computeCollegeCosts` MUST emit entries for in-school and loan-
repayment years regardless of whether those years straddle the FIRE boundary.
The module has no knowledge of `fireAge` — it is a pure function of inputs.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Two kids 5 years apart (like Janet/Ian) — expected non-overlapping windows.
- Two kids 2 years apart — expected overlap in two years with doubled cost.
- No kids — empty schedule.
- One kid with `pctFinanced: 0.5, parentPayPct: 1.0, loanTermYears: 10` —
  expected in-school window has half the tuition per year; expected 10-year
  repayment window following graduation with positive `loanShareReal`.
- One kid with `pctFinanced: 1.0, parentPayPct: 0` — expected `costReal === 0`
  every year (kid assumes full loan, no parent burden).

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Two kids 5 years apart (like Janet/Ian) — expected non-overlapping windows.
- Two kids 2 years apart — expected overlap in two years with doubled cost.
- No kids — empty schedule.
