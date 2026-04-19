# Contract: `calc/studentLoan.js`

**Role**: Amortization schedule for standalone adult-debt loans the household
services directly (not tied to a kid's college). Common shapes: the household's
own remaining student debt, a professional-school loan, a consolidated loan.

Kid-college loans live inside `calc/college.js` (the loan shares tuition's
already-scheduled window). This module is for household-level liabilities.

New module introduced by US2b. May collapse to a thin wrapper around
`computeMortgage` if the math reduces exactly — the US2b implementation task
explicitly documents the decision. For contract purposes, the module is named
separately so consumers can import a semantically distinct function and tests
can fixture it independently.

## Inputs

```js
computeStudentLoan({
  principalReal: number,     // real dollars outstanding TODAY
  annualRateReal: number,    // decimal real rate (nominal − inflation)
  termYears: number,         // remaining years
  startAge: number,          // age payments begin (usually === currentAgePrimary for existing debt)
  extraPaymentReal?: number, // annual extra principal; default 0
}) => StudentLoanSchedule
```

## Outputs

```js
{
  perYear: [{
    year,                      // 0-indexed year from startAge
    age,                       // startAge + year
    paymentReal,               // scheduled + extra principal applied this year
    balanceRemainingReal,
    interestReal,
    principalReal,             // the principal-portion amount (naming shadowed — see note)
  }],
  payoffYear: number,          // 0-based index when balance hits 0
  totalInterestPaidReal: number,
}
```

(Note: `principalReal` inside a perYear entry names the PRINCIPAL PAID during
that year — not the outstanding balance. This matches `MortgageSchedule` for
symmetry.)

## Consumers

- `lifecycle.js` — sums `paymentReal` across all `studentLoans[*]` each year
  and subtracts from withdrawable income. Terminal: each loan's schedule ends
  at its own `payoffYear`, at which point its contribution to the lifecycle's
  per-year payment drops to 0.

## Invariants

- `perYear.length === payoffYear − 0 + 1`.
- `balanceRemainingReal` monotonically non-increasing.
- Final year's `balanceRemainingReal` is within 1e-6 of zero.
- `paymentReal` in each year equals `interestReal + principalReal` (year-internal invariant).
- All values real dollars.
- Purity: no DOM, no Chart.js, no globals, no I/O.

## Fixtures

- 10-year term, $50k principal, 3% real rate. Expected payoff year = 9 (0-indexed); expected closed-form total interest.
- Extra-payment case — $2k/yr extra reduces payoff by known amount.
- Short term (1 year) — expected one `perYear` entry where `paymentReal ≈ principalReal + yearOneInterest`, balance 0.
- Zero-rate loan — `paymentReal === principalReal / termYears`, `interestReal === 0` every year.
