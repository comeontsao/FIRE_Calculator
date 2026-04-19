# Contract: `calc/withdrawal.js`

**Role**: Tax-aware withdrawal strategy for a single retirement year. Fixes the
audit-flagged silent-shortfall absorption.

## Inputs
```js
computeWithdrawal({
  annualSpendReal: number,
  pools: { trad401kReal, rothIraReal, taxableStocksReal, cashReal },
  phase: Phase,            // 'preUnlock' | 'unlocked' | 'ssActive'
  ssIncomeReal: number,    // 0 unless phase === 'ssActive'
  age: number,
  tax: TaxConfig,
  strategy: 'roth-ladder' | 'trad-first' | 'tax-optimized' | ...
}) => WithdrawalResult for this year (flattened to one-year form; see below)
```

## Outputs
For a single year (lifecycle calls this in a loop):
```js
{
  feasible: boolean,
  fromTradReal, fromRothReal, fromTaxableReal, fromCashReal, fromSSReal,
  taxOwedReal, netSpendReal,
  deficitReal?                // present iff !feasible
}
```

## Consumers
- `lifecycle.js` — invoked once per retirement-phase year.
- `rothLadderChart` renderer — shows the withdrawal split.

## Invariants
- When `feasible === true`, `netSpendReal === annualSpendReal`.
- When `feasible === false`, `deficitReal === annualSpendReal - netSpendReal` (positive).
- The sum of `fromTradReal + fromRothReal + fromTaxableReal + fromCashReal + fromSSReal`
  equals `annualSpendReal + taxOwedReal` when feasible.
- RMD is enforced when `age >= tax.rmdAgeStart` and `trad401kReal > 0`: the minimum
  required distribution is withdrawn from Trad even if strategy would prefer other pools.
- Never silently pushes a negative balance into any pool. If pools cannot cover spend +
  tax, the year is infeasible.

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Three-phase canonical — pre-unlock, post-unlock-pre-SS, SS-active. Locks pool-draw
  splits per year.
- RMD-active case — age 73 with $500k in Trad; RMD must be drawn regardless of strategy.
- Infeasibility case — tiny pools, large spend; returns `feasible: false` with correct
  `deficitReal`. **Locks FR-013**.
