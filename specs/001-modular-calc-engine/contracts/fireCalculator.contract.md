# Contract: `calc/fireCalculator.js`

**Role**: Binary-search solver for the earliest feasible FIRE age.

## Inputs
```js
solveFireAge({
  inputs: Inputs,
  helpers: { /* same DI bundle as lifecycle.js */ }
}) => FireSolverResult
```

## Outputs
`FireSolverResult` (data-model.md §4):
```js
{ yearsToFire, fireAge, feasible, endBalanceReal,
  balanceAtUnlockReal, balanceAtSSReal, lifecycle }
```

## Consumers
- `chartState.js` — receives via `setCalculated(fireAge, feasible)`.
- KPI cards — read `yearsToFire`, `fireAge`, `balanceAtUnlockReal`.
- `growthChart` renderer — reads `lifecycle` for drawing and `fireAge` for the marker.
- Scenario-card FIRE delta — reads `yearsToFire`.

## Invariants
- `fireAge` is integer years, `currentAgePrimary + yearsToFire === fireAge`.
- When `feasible === true`, the returned `lifecycle` has no `feasible:false` records.
- When `feasible === false`, `fireAge === inputs.endAge` and a warning flag is surfaced.
- `endBalanceReal === lifecycle[lifecycle.length-1].totalReal` (exact).
- Respects `inputs.solverMode`:
  - `'safe'` — requires `buffers.bufferUnlockMultiple × annualSpendReal` at 401(k) unlock and `buffers.bufferSSMultiple × annualSpendReal` at SS start.
  - `'exact'` — requires only `endBalanceReal >= 0`.
  - `'dieWithZero'` — optimizes so `endBalanceReal ≈ 0` (within a tolerance).

## Purity
No DOM, no Chart.js, no globals.

## Fixtures
- Canonical single-person case. Locks `yearsToFire`.
- Canonical couple case. Locks that secondary person's portfolio/earnings **measurably
  change** the answer (SC-005).
- Coast-FIRE case — expected `yearsToFire === 0` when future value of current portfolio
  already covers endAge spending.
- Mode-switch matrix — same inputs across Safe/Exact/Die-with-Zero should produce
  `fireAge_safe >= fireAge_exact >= fireAge_dwz`.
