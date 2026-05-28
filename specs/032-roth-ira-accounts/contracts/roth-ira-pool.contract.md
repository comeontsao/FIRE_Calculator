# Contract: Roth IRA Pool

**Feature**: 032-roth-ira-accounts
**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-28
**Constitutional basis**: Principle II (Pure Calculation Modules with Declared Contracts)

This document is the canonical interface contract for the new `rothIra` pool. Every calc-module fenced header that touches this pool MUST reference this contract.

## Identity

| Property | Value |
|---|---|
| Pool key | `rothIra` |
| Display name (EN) | Roth IRA |
| Display name (zh-TW) | Roth IRA（個人退休帳戶） |
| Position in `POOL_KEYS` | between `roth` and `trad`: `['cash', 'taxable', 'roth', 'rothIra', 'trad']` |
| Tax treatment | Tax-free withdrawal at all qualified ages (matches `roth` pool) |
| RMD treatment | EXEMPT — no Required Minimum Distribution at any age |
| Lock semantics | Fully locked until age 59.5 (matches `roth` pool; no basis-vs-earnings split in v1 per spec FR-019) |
| Growth rate | `return401k` (real-$ return assumption, shared with Roth 401K) |

## Inputs

| Field | Type | Source | Frame |
|---|---|---|---|
| `rothIraReal` | `number` | `getCanonicalInputs.js` (sum of `rogerRothIra` + `rebeccaRothIra` DOM inputs in RR) | real-$ |
| `rothIraContribReal` | `number` | `getCanonicalInputs.js` (sum of `rogerRothIraContrib` + `rebeccaRothIraContrib` DOM inputs in RR) | real-$/yr |

Generic dashboard supplies `0` for both fields (no UI inputs exist there per FR-018).

## Outputs

### Per-year lifecycle row (`projectFullLifecycle` output rows)

| Field | Type | Frame | Meaning |
|---|---|---|---|
| `pRothIra` | `number` | real-$ | Roth IRA balance at end of year |
| `pRothIraBookValue` | `number` | nominal-$ | Roth IRA balance converted to broker-statement dollars via `toBV(pRothIra, age)` |
| `wRothIra` | `number` | real-$ | Withdrawn from Roth IRA this year |
| `wRothIraBookValue` | `number` | nominal-$ | Withdrawal converted to broker-statement dollars |

### Audit composition snapshot

| Field | Type | Meaning |
|---|---|---|
| `lockedRothIra` | `number` (real-$) | Roth IRA balance at year-0 (audit input snapshot) |

## Consumers

This pool's outputs are consumed by:

- **Lifecycle chart** (`FIRE-Dashboard.html`, near line 8570) — new stacked-area series titled "Roth IRA"
- **Withdrawal Strategy tooltip** (`FIRE-Dashboard.html`, near line 14663) — new `rothIra` line in the pool-by-pool draw breakdown
- **FIRE feasibility gate** — `effBal()` formula at line 9141 MUST sum `pRothIra` (this is the FR-021e critical edit; missing it silently de-syncs the verdict from the chart)
- **Strategy ranker** (feature 008 wiring) — pool-agnostic, no direct changes required, but the underlying lifecycle includes the new pool automatically
- **Audit composition** (`calc/calcAudit.js`) — new `lockedRothIra` field in snapshot
- **Copy-debug snapshot** (`FIRE-Dashboard.html` debug export) — `pRothIra` field in JSON
- **CSV snapshot rows** (`FIRE-Dashboard.html` save-snapshot) — two columns `rogerRothIra` + `rebeccaRothIra` appended at end of SNAPSHOT_COLS
- **History tab table** (`FIRE-Dashboard.html`) — two new columns reading from CSV
- **localStorage** (`FIRE-Dashboard.html`) — four new keys (two balances + two contributions)
- **Audit harness persona stubs** (`calc/calcAudit.js` + audit harness) — DOM stubs serve `rogerRothIra`/`rebeccaRothIra`/`rogerRothIraContrib`/`rebeccaRothIraContrib` per-persona inside `boundFactory` (NOT static)

## Invariants

These properties MUST hold for every simulation of the `rothIra` pool. Each is enforceable as a unit test.

### Invariant I1 — Tax-free withdrawal

For every year `y` where `wRothIra[y] > 0`, the calculated `ordinaryIncome[y]` from the withdrawal step MUST NOT include `wRothIra[y]`. (Same rule as `roth` pool.)

### Invariant I2 — RMD-exempt at all ages

For every year `y` where `age[y] >= rmdAgeStart` (currently 73), the RMD branch MUST NOT draw from `pRothIra`. The `drawn.rothIra` field is incremented only through normal strategy ordering, never through the RMD floor.

### Invariant I3 — Locked until 59.5

For every year `y` where `age[y] < 59.5`, the `accessible` set MUST NOT contain `'rothIra'`. Therefore `wRothIra[y] === 0` for all pre-unlock years.

### Invariant I4 — Pool-growth equation

```
pRothIra[y] = (pRothIra[y-1] + wRothIra_negation[y-1]) * (1 + return401k) + rothIraContrib_thisYear
            // where wRothIra_negation[y-1] = -wRothIra[y-1] (draw reduces balance)
```

For accumulation phase years (before FIRE age), `wRothIra` is 0 and `rothIraContrib_thisYear` is the user-set contribution. For retirement phase years, `rothIraContrib_thisYear` is 0 and `wRothIra` may be non-zero.

### Invariant I5 — Spending-floor pass parity (Principle VIII)

When the strategy simulator reaches the spending-floor pass, the `rothIra` pool MUST participate equivalently to `roth`. If both pools have non-zero balance and the active strategy ordering places `rothIra` after `roth`, the floor pass first exhausts `roth`, then exhausts `rothIra` (subject to the 59.5 lock), then falls through to `trad` if still under-funded.

### Invariant I6 — Strategy ordering immutability

The position of `rothIra` in every `STRATEGY_ORDERS` entry MUST be immediately after `roth`. (FR-021a)

### Invariant I7 — Effective-balance formula completeness (FR-021e — CRITICAL)

The `effBal()` formula in `FIRE-Dashboard.html:9141` MUST sum `pRothIra` alongside `pTrad`, `pRoth`, `pStocks`, `pCash`:

```javascript
const effBal = () => pTrad * (1 - taxTrad) + pRoth + pRothIra + pStocks + pCash;
//                                              ^^^^^^^^^^^^^
```

Missing this term silently de-syncs the FIRE-feasibility verdict from the chart. Enforced by `tests/unit/verdictStrategyParity.test.js` with non-zero `pRothIra` fixtures.

### Invariant I8 — Audit composition completeness

`calc/calcAudit.js` composition output MUST contain `lockedRothIra` whenever any persona has non-zero Roth IRA balance.

## State transitions

### Year 0 (init)

`pRothIra` = `inp.rogerRothIra + inp.rebeccaRothIra` (canonical: `rothIraReal`).

### Accumulation phase (year y, before FIRE age)

`pRothIra` *= `(1 + return401k)` then `pRothIra` += `rothIraContrib_thisYear`.

`wRothIra` = `0` (no draws during accumulation).

### Retirement phase, age < 59.5 (pre-unlock)

`pRothIra` *= `(1 + return401k)` (still locked, but still grows).

`wRothIra` = `0` (locked).

### Retirement phase, age >= 59.5 (unlocked)

`pRothIra` *= `(1 + return401k)`.

`wRothIra` is determined by strategy ordering. Strategy first attempts to draw from `roth`; once `roth` is exhausted (or strategy doesn't reach it before satisfying the year's spending), the strategy draws from `rothIra`.

The RMD branch does NOT draw from `rothIra` at any age.

## Implementation notes

### Lockstep at calc layer

Per the plan's Constitution Check resolution: changes to inline calc code (strategy simulator at lines 11471–11473) MUST land in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`. The Generic dashboard's `inp.person1RothIra` / `inp.person2RothIra` default to 0 since no UI inputs feed them (FR-018), but the calc plumbing must still accept the field so that Generic's calc engine remains structurally identical to RR's.

### `rothIraReal` rename

This contract assumes the canonical-input field `rothIraReal` has been renamed to `roth401kReal`, and a NEW `rothIraReal` field now exists representing the actual Roth IRA pool. The rename ships in the same commits as this contract per research.md Q1.

### Color theming

The Lifecycle chart's color palette gains `--chart-rothIra` (default `#a890ff`, a lighter shade of `--chart-roth`'s `#846cff`). Chart-module `Consumers:` list (Principle VI) updated in `calc/withdrawal.js` and `calc/accumulateToFire.js` header comments to include the new chart series.

## Test surface

Every invariant above maps to at least one test:

| Invariant | Primary test file | Test name |
|---|---|---|
| I1 (tax-free) | `tests/unit/withdrawal.test.js` | `'rothIra draws contribute zero ordinary income'` |
| I2 (RMD-exempt) | `tests/unit/withdrawal.test.js` | `'RMD branch never draws from rothIra at any age'` |
| I3 (pre-59.5 lock) | `tests/unit/withdrawal.test.js` | `'rothIra inaccessible pre-unlock; wRothIra is zero'` |
| I4 (growth eq.) | `tests/unit/accumulateToFire.test.js` | `'pRothIra grows by contribution + return year-over-year'` |
| I5 (spending floor) | `tests/unit/strategyMatrix.test.js` | new row `'starvation-locus-with-rothIra'` |
| I6 (ordering) | `tests/unit/withdrawal.test.js` | `'rothIra appears immediately after roth in every STRATEGY_ORDERS entry'` |
| I7 (effBal) | `tests/unit/verdictStrategyParity.test.js` | `'verdict gate sums pRothIra alongside other pools'` |
| I8 (audit comp.) | `tests/unit/calcAudit.test.js` | `'composition snapshot includes lockedRothIra'` |
