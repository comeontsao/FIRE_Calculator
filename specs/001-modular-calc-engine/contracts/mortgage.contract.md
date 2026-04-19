# Contract: `calc/mortgage.js`

**Role**: Mortgage schedule and cost-to-net-worth adjustment.

## Inputs
```js
computeMortgage({
  principalReal: number,
  annualRateReal: number,        // mortgage rate minus inflation
  termYears: number,
  startAge: number,
  extraPaymentReal: number
}) => MortgageSchedule
```

## Outputs
```js
{
  perYear: [{ year, age, paymentReal, balanceRemainingReal, interestReal, principalReal }],
  payoffYear: number,
  totalInterestPaidReal: number
}
```

## Consumers
- `lifecycle.js` — subtracts `paymentReal` from withdrawable income each year until
  `payoffYear`.
- `mortgageVerdict` panel — compares FIRE age with vs without mortgage accelerated payoff.

## Invariants
- Standard amortization math. Balance monotonically decreases.
- `perYear.length === payoffYear - startYear + 1`.
- All values real.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- 30-year fixed, $500k principal, 3% real rate. Expected payoff year and total interest.
- Extra-payment case — $500/mo extra reduces payoffYear by expected amount.
