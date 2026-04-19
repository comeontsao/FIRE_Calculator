# Contract: `calc/lifecycle.js`

**Role**: Year-by-year portfolio simulator. The workhorse. Every calc downstream
ultimately calls this or consumes its output.

## Inputs
```js
runLifecycle({
  inputs: Inputs,          // see data-model.md §1
  fireAge: number,         // integer age to simulate retirement at
  helpers: {               // DI — pass the other modules so lifecycle stays pure
    inflation, tax, socialSecurity, healthcare, mortgage, college, withdrawal
  }
}) => LifecycleRecord[]
```

## Outputs
`LifecycleRecord[]` (see data-model.md §3) — one record per year from
`inputs.currentAgePrimary` through `inputs.endAge` inclusive.

## Consumers
- `growthChart` renderer — reads `totalReal`, `trad401kReal`, `taxableStocksReal`, `ssIncomeReal`, `phase`, `feasible`.
- `ssChart` renderer — reads `totalReal`, `ssIncomeReal`, `phase`.
- `rothLadderChart` renderer — reads `withdrawalReal`, pool balances by year.
- `timelineChart` renderer (if present) — reads `phase`, `age`, `year`, college/mortgage overlays.
- `fireCalculator.js` — for solver feasibility checks.

## Invariants
- Output length = `endAge - currentAgePrimary + 1`.
- Years are strictly monotonic.
- All money in real dollars. Nominal conversion happens only via `inflation.js`.
- `totalReal` equals the sum of the four pool fields for every year.
- If any pool goes negative, the offending year's `feasible` is false and `deficitReal` is set.

## Purity
No DOM, no Chart.js, no globals. Deterministic — same inputs always yield byte-identical output.

## Fixtures that lock this module
- `accumulation-only` — 30-year-old, $100k portfolio, $2k/month spend. Expected: portfolio grows monotonically; `feasible: true` every year.
- `three-phase-retirement` — 45-year-old, $1.2M, FIRE at 53. Expected: balance checkpoints at 55 ($X), 62 ($Y), 85 ($Z).
- `infeasible` — $500k portfolio, $80k spend, retire at 50. Expected: `deficitReal > 0` starting at some year.
- `real-nominal-check` — healthcare delta supplied as nominal; lifecycle must convert to real via `inflation.js` before adding. Fixture asserts an expected real-dollar number, not a nominal one.
