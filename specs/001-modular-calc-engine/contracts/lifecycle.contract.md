# Contract: `calc/lifecycle.js`

**Role**: Year-by-year portfolio simulator. The workhorse. Every calc downstream
ultimately calls this or consumes its output.

## Inputs
```js
runLifecycle({
  inputs: Inputs,          // see data-model.md §1 (extended for US2b — mortgage
                           // ownership modes, secondHome, studentLoans,
                           // contributionSplit, employerMatchReal, scenarioSpendReal,
                           // relocationCostReal, homeSaleAtFireReal, rentAlternativeReal)
  fireAge: number,         // integer age to simulate retirement at
  helpers: {               // DI — pass the other modules so lifecycle stays pure.
                           // US2b adds two new helper slots (secondHome, studentLoan)
                           // OR keeps them inline at lifecycle's discretion (see
                           // tasks-us2b.md phase U2B-3 for the scope decision).
    inflation, tax, socialSecurity, healthcare, mortgage, college, withdrawal,
    secondHome?, studentLoan?
  }
}) => LifecycleRecord[]
```

## Outputs
`LifecycleRecord[]` (see data-model.md §3) — one record per year from
`inputs.currentAgePrimary` through `inputs.endAge` inclusive.

Post-US2b the record includes the derived booleans `accessible` and
`is401kUnlocked` as well as optional overlay fields (`mortgagePaymentReal`,
`secondHomeCarryReal`, `collegeCostReal`, `studentLoanPaymentReal`,
`oneTimeOutflowReal`) — see `data-model.md §3` typedef.

## Consumers
- `growthChart` renderer — reads `totalReal`, `trad401kReal`, `rothIraReal`, `taxableStocksReal`, `cashReal`, `ssIncomeReal`, `phase`, `feasible`, `accessible`.
- `ssChart` renderer — reads `totalReal`, `ssIncomeReal`, `phase`, `is401kUnlocked`.
- `rothLadderChart` renderer — reads `withdrawalReal`, pool balances, `trad401kReal` / `rothIraReal` split by year.
- `timelineChart` renderer (if present) — reads `phase`, `age`, `year`, `collegeCostReal`, `mortgagePaymentReal`, `secondHomeCarryReal`, `oneTimeOutflowReal`.
- `fireCalculator.js` — for solver feasibility checks.
- `mortgageVerdict` panel — reads `mortgagePaymentReal` per year.
- `secondHomeImpact` panel — reads `secondHomeCarryReal` + `oneTimeOutflowReal`.

## Invariants
- Output length = `endAge - currentAgePrimary + 1`.
- Years are strictly monotonic.
- All money in real dollars. Nominal conversion happens only via `inflation.js`.
- `totalReal` equals the sum of the four pool fields for every year.
- If any pool goes negative, the offending year's `feasible` is false and `deficitReal` is set.
- `accessible === (phase !== 'accumulation' && phase !== 'preUnlock')` in every record.
- `is401kUnlocked === (agePrimary >= 60)` in every record.
- When `inputs.mortgage.ownership === 'buying-now'`, record at `agePrimary === currentAgePrimary`
  has `oneTimeOutflowReal >= downPaymentReal + closingCostReal`.
- When `inputs.mortgage.ownership === 'buying-in'`, the same invariant holds at
  `agePrimary === inputs.mortgage.purchaseAge`.
- When `inputs.mortgage.ownership === 'already-own'`, `oneTimeOutflowReal`
  contribution from the primary mortgage is 0 in every year (the down-payment
  outflow happened before `currentAgePrimary`).
- When `inputs.secondHome` present with `purchaseAge`, the record at that age
  carries `oneTimeOutflowReal >= secondHome.downPaymentReal + secondHome.closingCostReal`.
- When `inputs.secondHome.destiny === 'sell'`, the record at `fireAge` has
  `oneTimeOutflowReal` reduced by the sale's net proceeds (i.e., proceeds are
  added to taxable stocks, reducing the net outflow; may be negative in that year's
  visible outflow field — documentation MUST make this sign convention explicit).
- When `inputs.relocationCostReal > 0`, the record at `fireAge` has an
  `oneTimeOutflowReal` contribution of `relocationCostReal`.
- When `inputs.homeSaleAtFireReal > 0`, the record at `fireAge` has
  `taxableStocksReal` increased by `homeSaleAtFireReal` relative to the no-sale baseline.
- `contributionReal` in accumulation years follows the split declared by
  `inputs.contributionSplit` (default `{trad:0.60, roth:0.20, taxable:0.20}`).
  `employerMatchReal` (when > 0) is added to `trad401kReal` each accumulation year
  on top of the split.

## Purity
No DOM, no Chart.js, no globals. Deterministic — same inputs always yield byte-identical output.

## Fixtures that lock this module
- `accumulation-only` — 30-year-old, $100k portfolio, $2k/month spend. Expected: portfolio grows monotonically; `feasible: true` every year.
- `three-phase-retirement` — 45-year-old, $1.2M, FIRE at 53. Expected: balance checkpoints at 55 ($X), 62 ($Y), 85 ($Z).
- `infeasible` — $500k portfolio, $80k spend, retire at 50. Expected: `deficitReal > 0` starting at some year.
- `real-nominal-check` — healthcare delta supplied as nominal; lifecycle must convert to real via `inflation.js` before adding. Fixture asserts an expected real-dollar number, not a nominal one.
