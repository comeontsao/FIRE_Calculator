# Contract: `calc/mortgage.js`

**Role**: Mortgage schedule, cost-to-net-worth adjustment, and — post US2b —
ownership-mode-aware integration helper for primary residences.

## Inputs

### Low-level amortization (pure, unchanged for US2b)

```js
computeMortgage({
  principalReal: number,
  annualRateReal: number,        // mortgage rate minus inflation
  termYears: number,
  startAge: number,
  extraPaymentReal: number
}) => MortgageSchedule
```

### High-level ownership-aware helper (new in US2b)

Lifecycle calls a thin helper that resolves the `Mortgage` input (see
`data-model.md §1b`) into a year-indexed record of outflows + carry + sale
proceeds regardless of ownership mode. Proposed signature:

```js
resolveMortgage({
  mortgage: Mortgage,            // see data-model.md §1b
  currentAgePrimary: number,     // anchor for year offsets
  endAge: number,                // so the schedule covers the full lifecycle
  fireAge: number,               // for destiny-based sale-at-FIRE
  rentAlternativeReal?: number,  // monthly rent baseline for buy-vs-rent delta; default 0
  homeLocation?: string,         // drives per-country selling-cost percent; default 'us'
}) => {
  perYear: [{
    year,                        // absolute calendar year
    age,                         // primary person's age that year
    paymentReal,                 // scheduled P&I this year
    propertyTaxReal,             // property tax this year (0 if post-sale)
    insuranceReal,               // insurance this year (0 if post-sale)
    hoaAnnualReal,               // HOA × 12 this year (0 if post-sale)
    balanceRemainingReal,        // end-of-year balance
    interestReal,
    principalReal,
    buyVsRentDeltaReal,          // annual housing cost MINUS rentAlternativeReal*12
    oneTimeOutflowReal,          // downPayment + closingCost IF this is purchaseYear, else 0
    saleProceedsReal,            // net proceeds (positive) IF this is fireAge AND destiny==='sell', else 0
  }],
  payoffYear: number,
  totalInterestPaidReal: number,
  legacyValueAtEndReal: number,  // for destiny === 'inherit' — market value at endAge; 0 otherwise
}
```

## Outputs
- `MortgageSchedule` (raw amortization — unchanged for US2b).
- `MortgageLifecycleBundle` (the `resolveMortgage` return — new, see above).

## Consumers
- `lifecycle.js` — subtracts `paymentReal + propertyTaxReal + insuranceReal + hoaAnnualReal`
  from withdrawable income each year until `payoffYear`; applies `oneTimeOutflowReal`
  at purchase; adds `saleProceedsReal` to taxable stocks at `fireAge` when relevant.
- `mortgageVerdict` panel — compares FIRE age with vs without mortgage accelerated payoff.

## Ownership-mode behavior

| `mortgage.ownership` | `purchaseAge` origin | Down-payment outflow | First P&I year |
|---|---|---|---|
| `'buying-now'` | defaults to `currentAgePrimary` | year at `currentAgePrimary` | same year as purchase |
| `'already-own'` | virtual — `currentAgePrimary − yearsPaid` (in the past) | **NONE** (already paid before today) | continues at `currentAgePrimary` with `yearsPaid` years already amortized |
| `'buying-in'` | `mortgage.purchaseAge` (must be > `currentAgePrimary`) | year the primary person turns `purchaseAge` | same year as purchase |

Ownership + `destiny === 'sell'` at FIRE: the year `agePrimary === fireAge`
receives `saleProceedsReal = max(0, homeValue * (1 − sellingCostPct) − remainingBalance)`
where `homeValue = homePriceReal × (1 + appreciationReal)^yearsOfAppreciation`.

Ownership + `destiny === 'live-in'`: no sale proceeds; P&I + carry continues
until `payoffYear`, then only property tax / insurance / HOA continue.

Ownership + `destiny === 'inherit'`: same as `'live-in'` for the retirement
phase, plus `legacyValueAtEndReal = homePriceReal × (1 + appreciationReal)^(endAge − purchaseAge)`.
Lifecycle emits this as a non-liquid legacy value, outside `totalReal`.

## Invariants
- Standard amortization math. `balanceRemainingReal` monotonically non-increasing.
- `perYear.length === endAge − currentAgePrimary + 1` (full lifecycle coverage,
  zero-padding years before purchase for `buying-in` and after payoff for any mode).
- All values real dollars.
- Down-payment outflow appears exactly once — the year matching `purchaseAge`
  (or never for `'already-own'`).
- Sale proceeds appear exactly once — the year `agePrimary === fireAge` — and
  only when `destiny === 'sell'` AND `fireAge >= purchaseAge`.
- `paymentReal === 0` for years before `purchaseAge` and years after `payoffYear`.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- 30-year fixed, $500k principal, 3% real rate. Expected payoff year and total interest.
- Extra-payment case — $500/mo extra reduces payoffYear by expected amount.
- Ownership mode `'buying-now'` — down-payment outflow at `currentAgePrimary`; expected year-1 payment includes P&I + tax + insurance + HOA.
- Ownership mode `'already-own'`, `yearsPaid: 10` — no down-payment outflow; expected remaining balance at `currentAgePrimary` equals analytical (closed-form) amortized balance.
- Ownership mode `'buying-in'`, `purchaseAge = currentAge + 5` — zero housing outflow for years 0..4; outflow at year 5.
- `destiny === 'sell'` at FIRE — expected `saleProceedsReal > 0` in the fireAge year; carry drops to 0 thereafter.
