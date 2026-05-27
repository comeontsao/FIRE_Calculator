# Data Model: Cash-Sweep to Stocks

**Feature**: 030-cash-sweep-stocks
**Phase**: 1 (Design & Contracts)

## Entities

### CashSweepConfig (runtime configuration)

User-controlled configuration consumed by every simulator that maintains `pCash` + `pStocks`.

| Field | Type | Default | Validation | Persistence |
|---|---|---|---|---|
| `cashSweepEnabled` | `boolean` | `false` | Boolean only | `localStorage['cashSweepEnabled']` (added to `_PERSISTED_INPUT_KEYS`) |
| `cashSweepThreshold` | `number` (real-$) | `10000` | `>= 0` (negative inputs clamped to 0 or rejected by UI `min` attribute) | `localStorage['cashSweepThreshold']` |

**Frame**: `cashSweepThreshold` is in real-$ (today's purchasing power), consistent with every other Plan-tab dollar input (`retireSpend`, `monthlySavings`, `cashSavings`, etc.).

**Flow into simulators**:
```
DOM checkbox + number input
  → getInputs() reads both
  → inp.cashSweepEnabled, inp.cashSweepThreshold
  → each simulator reads inp.* on entry
  → simulator passes (enabled, threshold) to _applyCashSweep helper per-year
```

### CashSweepResult (helper return shape)

The pure function `_applyCashSweep` returns this shape:

| Field | Type | Notes |
|---|---|---|
| `pCash` | `number` | Updated cash balance (post-sweep). Equals threshold when sweep fired; equals input pCash otherwise. |
| `pStocks` | `number` | Updated stocks balance (post-sweep). Equals input pStocks + swept dollars; equals input pStocks when sweep didn't fire. |
| `swept` | `number` | The dollar amount transferred from cash to stocks. Zero when sweep didn't fire (toggle off, year 0, pCash ≤ threshold). |

The `swept` field is the audit-observability surface — surfaced via the per-year row's new `cashSweepDelta` field for the audit panel and the new `_invariantF` invariant.

### CashSweepTrace (audit observability, opt-in)

Per-year record pushed by simulators when `options.cashSweepTraces` array is provided by the audit pipeline.

| Field | Type | Notes |
|---|---|---|
| `age` | `number` | Simulated age the row corresponds to. |
| `simulatorId` | `string` | One of: `'computeWithdrawalStrategy'`, `'_simulateStrategyLifetime'`, `'signedLifecycleEndBalance'`, `'simulateRetirementOnlySigned'`, `'accumulateToFire'`, `'projectFullLifecycle'`. |
| `pCash` | `number` | Post-sweep cash balance. |
| `pStocks` | `number` | Post-sweep stocks balance. |
| `swept` | `number` | Sweep delta this year. |

Default: array NOT allocated (zero overhead in normal recalc paths). Allocated only when the audit pipeline opts in. Consumed by `_invariantF` (`simulator-cash-sweep-parity`).

### Lifecycle Projection Row Extension

The audit's per-year `lifecycleProjection.rows[i]` shape gains one optional field:

| Field | Type | Notes |
|---|---|---|
| `cashSweepDelta` | `number?` | Sweep delta this year. Zero when sweep didn't fire. Field omitted entirely when toggle is OFF (no allocation overhead in the OFF state). |

Existing audit consumers ignore unknown fields, so this is additive and safe. The Audit panel renderer MAY display `cashSweepDelta > 0` as a visual annotation in a future polish iteration, but spec defers this; data is captured now, display is later.

### CrossValidationWarning Extension (new kind)

Existing entity from feature 014/029. New `kind` value: `'simulator-cash-sweep-parity'`.

| Field | Type | Notes |
|---|---|---|
| `kind` | `string` | `'simulator-cash-sweep-parity'` |
| `age` | `number` | Age at which the disagreement was detected |
| `simulators` | `{ [simulatorId]: { pCash, pStocks } }` | Per-simulator post-sweep pool values at that age |
| `delta` | `number` | Max divergence dollars across simulator pairs |
| `expected` | `boolean` | Always `false` (any parity violation is unexpected) |
| `reason` | `string` | Bilingual-translation-ready description |
| All existing CrossValidationWarning fields | inherited from contract | Unchanged |

## State Transitions

No state machines. The sweep is a stateless per-year transformation applied at the end of each iteration. The CashSweepConfig fields are read-only configuration set by the user via UI; they don't transition during a simulation.

## Validation Rules

| FR | Validation | Test fixture(s) |
|---|---|---|
| FR-001 | DOM checkbox `cashSweepEnabled` exists, defaults to unchecked. | `cash-sweep-toggle.spec.ts` E2E |
| FR-002 | DOM number input `cashSweepThreshold` exists, defaults to 10000, rejects negative values via `min="0"`. | `cash-sweep-toggle.spec.ts` E2E |
| FR-003 | Threshold value flows through every simulator in real-$ frame (no inflation multiplication anywhere). | `cashSweepHelper.test.js` unit |
| FR-004 | Year-0 (age === currentAge) is preserved: helper returns `swept = 0` regardless of `pCash` and `threshold`. Year-1+ applies the rule. | `cashSweepHelper.test.js` unit (year-0 case explicit) |
| FR-005 | All 6 simulators contain a call to `_applyCashSweep(...)` immediately after their `pCash *= 1.005` line. | `cashSweepSimulatorIntegration.test.js` structural pins |
| FR-006 | Toggle OFF → helper returns input pools unchanged. Verifiable by snapshot diff against pre-feature commit. | `cashSweepRrFixture.test.js` numerical pin |
| FR-007 | `cashSweepEnabled` + `cashSweepThreshold` added to `_PERSISTED_INPUT_KEYS`. | Manual code-grep + E2E reload check |
| FR-008 | New `_invariantF` exists and fires on artificially planted divergence; silent under correct operation. | `cashSweepAuditInvariant.test.js` unit |
| FR-009 | 4 translation keys exist in both EN and zh-TW catalogs of both HTMLs. | Grep test (verifies 16 catalog entries present) |
| FR-010 | `FIRE-snapshots.csv` schema is unchanged. Verify by `diff` on canonical snapshot rows pre/post feature. | Manual diff |
| FR-011 | One-shot events (home sale, lump-sum payoff) trigger same-year sweep when post-event pCash > threshold. | `cashSweepHelper.test.js` simulation-style fixture |
| FR-012 | Partial-FIRE-year scaling (`mFraction`) is correctly handled — sweep operates on the post-scale pCash, NOT on a separately-scaled threshold. | `cashSweepHelper.test.js` edge case |
| FR-013 | Residual cash (≤ threshold) compounds at the existing 0.5% real rate. Verified by inserting a partial-year fixture into the helper test. | `cashSweepHelper.test.js` unit |
