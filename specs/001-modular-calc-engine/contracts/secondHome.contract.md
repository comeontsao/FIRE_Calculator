# Contract: `calc/secondHome.js`

**Role**: Additive overlay for a second property — upfront outflow at purchase,
annual carry cost (net of rental income), sale proceeds at FIRE, or legacy
value at end-of-plan. Unlike `calc/mortgage.js` (which provides housing in
place of rent), Home #2 stacks costs on top of the primary housing arrangement.

New module introduced by US2b. Prior to US2b, Home #2 lived only in inline HTML
helpers (`getSecondHomeInputs`, `getSecondHomeAnnualCarryAtYear`,
`getSecondHomeSaleAtFire`, `getSecondHomeLegacyAtEnd`). This contract is the
extraction target.

## Inputs

```js
resolveSecondHome({
  secondHome: SecondHome,      // see data-model.md §1c
  currentAgePrimary: number,
  endAge: number,
  fireAge: number,
}) => SecondHomeLifecycleBundle
```

## Outputs

```js
{
  perYear: [{
    year,                      // absolute calendar year
    age,                       // primary person's age that year
    carryReal,                 // annual carry: P&I + propertyTax + otherCarry - rentalIncome
                               //   may be negative if rentalIncome > carrying costs (net income)
    oneTimeOutflowReal,        // downPayment + closingCost IF this is purchaseYear, else 0
    saleProceedsReal,          // net proceeds IF this is fireAge AND destiny==='sell', else 0
    owned,                     // boolean — is Home #2 on the books this year?
  }],
  legacyValueAtEndReal: number,  // appreciated value at endAge IF destiny === 'inherit', else 0
}
```

`perYear` spans the full lifecycle (`currentAgePrimary` → `endAge`). Years
before `purchaseAge` have `owned: false`, `carryReal: 0`, `oneTimeOutflowReal: 0`.
Years after sale (when `destiny === 'sell'` AND `age > fireAge`) have the same
zero-overlay shape.

## Consumers

- `lifecycle.js` — applies `oneTimeOutflowReal` to cash/stocks at purchaseAge;
  adds `carryReal` to the year's withdrawal target (retirement) or subtracts
  from savings (accumulation); adds `saleProceedsReal` to taxable stocks at
  fireAge.
- `secondHomeImpact` HTML panel — displays `legacyValueAtEndReal`,
  `saleProceedsReal`, cumulative carry, and the net-of-sale picture.

## Invariants

- `perYear.length === endAge − currentAgePrimary + 1`.
- Exactly one year in `perYear` has `oneTimeOutflowReal > 0` — the year
  `agePrimary === secondHome.purchaseAge`. (0 if `purchaseAge > endAge` — the
  household plans a purchase they'll never reach; module emits all-zero.)
- Exactly zero or one years in `perYear` have `saleProceedsReal > 0`. At most
  one, when `destiny === 'sell'` AND `purchaseAge <= fireAge <= endAge`.
- Sale proceeds calculation:
  ```
  homeValue = homePriceReal × (1 + appreciationReal) ^ (fireAge − purchaseAge)
  sellingCostPct = per-country lookup (US 7%, TW 4%, JP 6%, etc.)
  remainingLoan = closed-form amortized balance at (fireAge − purchaseAge) months-equivalent
  saleProceedsReal = max(0, homeValue × (1 − sellingCostPct) − remainingLoan)
  ```
- Carry formula (per year while owned):
  ```
  carryReal = annualPI + propertyTaxReal + otherCarryReal − rentalIncomeReal
  annualPI  = 0 if rate === 0 OR yearsIntoMortgage >= termYears
            = calcMortgagePayment(loanAmt, annualRateReal, termYears) × 12 otherwise
  ```
- All values real dollars.
- Purity: no DOM, no Chart.js, no globals, no I/O.

## Fixtures

- Cash-only Home #2 (rate 0) — expected `carryReal` each year = propertyTax + otherCarry − rentalIncome; no amortization.
- Mortgaged Home #2, `destiny: 'sell'`, purchased at `currentAge + 3`, sold at `fireAge` — expected `oneTimeOutflowReal` at year 3; positive `saleProceedsReal` at fireAge; zero carry thereafter.
- Rented-out Home #2 with `rentalIncomeReal > annual carry` — expected negative `carryReal` (net income).
- `destiny: 'inherit'` — expected `legacyValueAtEndReal > 0` at endAge; carry persists to end-of-plan.
