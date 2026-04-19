# Contract: `calc/tax.js`

**Role**: Bracket-aware tax calculation.

## Inputs
```js
computeTax({
  ordinaryIncomeReal: number,     // Trad withdrawals + SS taxable portion + other
  ltcgIncomeReal: number,         // realized LTCG from taxable-stock sales
  age: number,                    // for senior standard deductions etc.
  tax: TaxConfig                  // brackets + thresholds from Inputs
}) => TaxResult
```

## Outputs
```js
{
  ordinaryOwedReal: number,
  ltcgOwedReal: number,
  totalOwedReal: number,
  effectiveRate: number           // totalOwedReal / (ordinaryIncomeReal + ltcgIncomeReal)
}
```

## Consumers
- `withdrawal.js` — to size Trad draws correctly (account for tax drag).
- `rothLadderChart` renderer — shows `effectiveRate`.

## Invariants
- Uses marginal brackets correctly (not a single effective rate).
- All thresholds and outputs in real dollars.
- `totalOwedReal === ordinaryOwedReal + ltcgOwedReal`.
- When both income fields are 0, returns all zeros with `effectiveRate: 0`.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Bracket-boundary case: income exactly at a bracket threshold produces the expected
  combined marginal amount.
- LTCG-0%-bracket case: LTCG within the 0% bracket produces zero LTCG tax.
- Empty case: all zeros.
