# Contract: `calc/inflation.js`

**Role**: The **only** module allowed to convert between real and nominal dollars
(FR-017). Enforces the discipline that every `*Nominal` value crossing a module
boundary has a documented conversion point.

## Inputs
```js
makeInflation(inflationRate: number, baseYear: number) => InflationHelpers
```

## Outputs
```js
{
  toReal(amountNominal: number, year: number): number,
  toNominal(amountReal: number, year: number): number
}
```

## Consumers
- Every module that receives a nominal input and needs to integrate it with a real-
  dollar pipeline (most commonly `lifecycle.js` pulling nominal healthcare, tax
  thresholds, etc.).

## Invariants
- `toNominal(toReal(x, year), year) === x` within floating-point tolerance.
- Base year is `baseYear`; `year === baseYear` means conversion is identity.
- `inflationRate` can be negative (deflation); behavior is well-defined.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Round-trip test for 5 random year/amount pairs.
- Identity at base year.
- 3% inflation, 10-year horizon — known real/nominal dollar relationship.
