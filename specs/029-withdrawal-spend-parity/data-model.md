# Data Model: Withdrawal-Simulator Spend Parity

**Feature**: 029-withdrawal-spend-parity
**Phase**: 1 (Design & Contracts)

## Entities

### GrossSpend (per retirement-year)

The composed annual outflow target that the withdrawal pipeline must fund.

| Field | Type | Source | Notes |
|---|---|---|---|
| `retireSpend` | `number` (real-$/year) | `getMortgageAdjustedRetirement(scenarioSpend, yrsToFire).annualSpend` | Mortgage-adjusted base spend. Already accounts for housing P&I + tax + insurance + HOA delta vs current rent. |
| `hcDelta` | `number` (real-$/year) | `getHealthcareDeltaAnnual(selectedScenario, age)` | Per-age, per-scenario healthcare premium delta. Can be negative (post-65 Medicare cheaper than pre-65 ACA in some scenarios). |
| `collegeCostThisYear` | `number` (real-$/year) | `getTotalCollegeCostForYear(inp, yearsFromNow)` | Per-age kid tuition + parent-portion loan repayments. Zero outside kids' college and loan-repayment windows. |
| `h2Carry` | `number` (real-$/year) | `getSecondHomeAnnualCarryAtYear(h2, yearsFromNow, yrsToFire)` when `h2 && h2Purchased`; otherwise 0 | Home #2 annual carry (P&I + tax + other − rental). Zero when feature disabled or Home #2 not yet purchased. |
| `grossSpend` (derived) | `number` (real-$/year) | `Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry)` | Final composed value consumed by every simulator's withdrawal call. |

**Invariant:** All three production simulators (`computeWithdrawalStrategy`, `_simulateStrategyLifetime`, `projectFullLifecycle` / via `signedLifecycleEndBalance`) MUST compute the SAME `grossSpend` for the SAME `age + inp + scenario` triple. The new `_invariantE` audit invariant checks this.

**Scaling:** During the partial-FIRE-year (when `fireAge` is non-integer per feature 022), each component is multiplied by `scale = (1 - mFraction)` before composition. See FR-001 acceptance for invariance under scaling.

### Simulator (calc-pipeline entity)

A function that, given pool balances + inputs + age, produces per-year withdrawal mix + updated pool balances + (optionally) per-year trace rows.

| Simulator | Location | Role | grossSpend formula post-fix |
|---|---|---|---|
| `computeWithdrawalStrategy` | RR `:12221` / Generic `:12594` | Default-strategy chart driver (consumed by `renderRothLadder` when `bracket-fill-smoothed` is the winner). | `retireSpend + hcDelta + collegeCostThisYear + h2Carry` |
| `_simulateStrategyLifetime` | RR `:11698` / Generic `:12071` | Per-strategy ranker + non-default chart driver. Called once per strategy during ranking. | `retireSpend + hcDelta + collegeCostThisYear + h2Carry` (FIXED — was `retireSpend` only) |
| `signedLifecycleEndBalance` | RR `:8982` / Generic `:9355` | Verdict-pill stop-gap probe + FIRE-age resolver's feasibility check. | `retireSpend + hcDelta + collegeCostThisYear + h2Carry` (already correct) |
| `simulateRetirementOnlySigned` | RR `:9693` / Generic `:10066` | Used by `findMinAccessibleAtFireNumerical` binary search. | `retireSpend + hcDelta + collegeCostThisYear + h2Carry` (already correct) |
| `projectFullLifecycle` | RR `:10212` / Generic `:10585` | Lifecycle chart renderer. Canonical reference. | `retireSpend + hcDelta + collegeCostThisYear + h2Carry` (already correct, reference) |

### SimulatorTrace (new — audit observability)

A per-age record emitted by a simulator when `options.captureTrace` is set. Consumed by the new `_invariantE` audit invariant.

| Field | Type | Notes |
|---|---|---|
| `age` | `number` (year, integer or fractional for partial-FIRE-year) | Retirement age the row corresponds to. |
| `simulatorId` | `string` | One of `'computeWithdrawalStrategy'`, `'_simulateStrategyLifetime'`, `'signedLifecycleEndBalance'`. |
| `grossSpend` | `number` | Composed value the simulator passed to its withdrawal call. |
| `components` (optional) | `{ retireSpend, hcDelta, collegeCostThisYear, h2Carry }` | Component breakdown. Used by the audit panel to display "which simulator dropped which overlay" when the invariant fires. |

Trace array lives on `options.simulatorTraces` (caller-owned), threaded through the simulator's `options` parameter. Default empty (no allocation in normal recalc paths).

### CrossValidationWarning (extended)

Existing entity from feature 028. Two new kinds added by this feature.

| Field | Type | Notes |
|---|---|---|
| `kind` | `string` | Existing values: `'endBalance-mismatch'`. New values: `'simulator-grossSpend-parity'`. |
| `age` (new for parity kind) | `number` | Retirement age at which the disagreement was detected. |
| `simulators` (new for parity kind) | `{ [simulatorId]: number }` | Map of simulator id → its `grossSpend` for that age. |
| `diff` (new for parity kind) | `number` | Max diff across simulators for that age. |
| `expected` | `boolean` | `false` for parity kind (any parity violation is unexpected). |
| `reason` | `string` | Plain-English summary, bilingual-translation-ready. |
| All existing fields | _(see feature 028 contract)_ | Unchanged. |

## State transitions

No state transitions; this feature is a stateless calc-correctness fix. The only "state" that changes is which simulator a chart pulls from (already-existing behavior via `_lastStrategyResults.winnerId` → `renderRothLadder` swap). That dispatch is untouched.

## Validation rules

Derived from spec FRs:

| FR | Validation | Test fixture(s) |
|---|---|---|
| FR-001 | `_simulateStrategyLifetime` composes `grossSpend = retireSpend + hcDelta + collegeCostThisYear + h2Carry`. | `tests/unit/simulatorGrossSpendParity.test.js` |
| FR-002 | `signedLifecycleEndBalance` and `simulateRetirementOnlySigned` use same formula. (Already correct; this is a regression-pin only.) | `tests/unit/simulatorGrossSpendParity.test.js` |
| FR-003 | All 3 modes × 2 objectives × 8 strategies × 2 HTMLs × ≥1 fixture per col/hc-overlay window pass parity. | `tests/unit/perStrategyEndBalanceMatchesChart.test.js` |
| FR-004 | Withdrawal Strategy chart bar at college age sums to overlay-inclusive total. | `tests/e2e/withdrawal-bar-college-years.spec.ts` |
| FR-005 | `_invariantE` fires on artificially induced parity violation; silent under correct operation. | `tests/unit/grossSpendParityAuditInvariant.test.js` |
| FR-006 | Post-fix audit shows zero `endBalance-mismatch` warnings on canonical repro fixture set. | `tests/unit/grossSpendParityAuditInvariant.test.js` (suppression branch) |
| FR-007 | Both HTMLs in lockstep ±1 personal-content line. | Manager mechanical diff audit during T-final. |
| FR-008 | Existing 528 unit + 8 E2E tests pass. | `npm run test:unit && npm run test:e2e` |
| FR-009 | New tests pin the three behaviors. | New test files above. |
| FR-010 | New E2E covers both HTMLs × both locales. | Matrix-driven spec. |
| FR-011 | Input formulas (`retireSpend`, `hcDelta`, `collegeCostThisYear`) unchanged. | Grep diff: zero changes to `getMortgageAdjustedRetirement`, `getHealthcareDeltaAnnual`, `getTotalCollegeCostForYear`. |
