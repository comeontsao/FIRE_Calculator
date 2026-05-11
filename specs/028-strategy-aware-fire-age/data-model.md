# Phase 1 — Data Model

**Feature**: 028-strategy-aware-fire-age
**Date**: 2026-05-08

This feature is a calc-layer fix. No new persisted entities, no new translation strings, no new charts. The two pure-data shape changes are below.

## E-1. `simulateRetirementOnlySigned` — extended signature

### Before (feature 027)

```javascript
function simulateRetirementOnlySigned(
  inp,
  annualSpend,
  fireAge,
  p401kTrad0,
  p401kRoth0,
  pStocks0,
  pCash0,
)
```

Returns `{ endBalance, minPhase1, minPhase2, minPhase3, ... }` evaluated against the bracket-fill default strategy implicitly.

### After (this feature)

```javascript
function simulateRetirementOnlySigned(
  inp,
  annualSpend,
  fireAge,
  p401kTrad0,
  p401kRoth0,
  pStocks0,
  pCash0,
  options /* optional — see below */
)
```

Where `options` is:

```javascript
options: {
  strategyOverride?: string,    // 'bracket-fill-smoothed' | 'aggressive-bracket-fill'
                                //  | 'roth-ladder' | 'trad-last-preserve'
                                //  | 'conventional' | 'tax-optimized-search'
                                //  | 'trad-first' | 'proportional'
                                //  | undefined
  thetaOverride?: number,       // 0..1 — only meaningful when strategyOverride
                                //  === 'tax-optimized-search'; ignored otherwise.
}
```

**Backwards compatibility:**

- `options` MAY be omitted entirely.
- When omitted, behavior is byte-identical to the pre-feature-028 implementation (bracket-fill default).
- All 493 existing unit tests pass without modification.

**Resolution order (when called from the resolver wrapper):**

1. `_previewStrategyId` (during ranking-row hover) — highest priority.
2. `_lastStrategyResults.winnerId` — the winner from the most recent strategy ranking pass.
3. `undefined` — fall through to default bracket-fill behavior.

This mirrors `getActiveChartStrategyOptions()` exactly; the contract is "the resolver evaluates the same strategy the chart is rendering."

**Return shape (unchanged):**

```javascript
{
  endBalance: number,        // signed; can be negative
  minPhase1: number,         // min portfolio total during phase 1 (taxable-only)
  minPhase2: number,         // min during phase 2 (401k unlocked)
  minPhase3: number,         // min during phase 3 (with SS)
  // ... existing fields preserved
}
```

The shape is deliberately unchanged so callers (`isFireAgeFeasible`, the resolver Stage 1 scan) need no signature update; they observe the strategy-aware values transparently.

## E-2. `crossValidationWarnings` entry — extended fields

### Before

```javascript
{
  kind: 'endBalance-mismatch',
  valueA: number,        // signed-sim end balance
  valueB: number,        // chart end balance
  delta: number,
  deltaPct: number,
  expected: boolean,
  reason: string,
  dualBarSeries: { labels: [], data: [] }
}
```

### After

```javascript
{
  kind: 'endBalance-mismatch',
  valueA: number,             // signed-sim end balance (preserved for back-compat)
  valueB: number,             // chart end balance (preserved for back-compat)
  delta: number,
  deltaPct: number,
  expected: boolean,
  reason: string,
  dualBarSeries: { labels: [], data: [] },

  // NEW fields (FR-010):
  activeStrategyId: string,   // e.g. 'aggressive-bracket-fill'
  mode: string,               // 'safe' | 'exact' | 'dieWithZero'
  chartEndBalance: number,    // alias for valueB (semantic clarity)
  signedEndBalance: number,   // alias for valueA (semantic clarity)
}
```

**Why include both `valueA`/`valueB` and `chartEndBalance`/`signedEndBalance`?** Back-compat: existing audit-dump consumers (debug-paste tooling, maybe future Notion sync) read the original fields. The semantic aliases let new consumers self-document. Cost: 8 bytes per warning entry, ~0 perf.

**Post-fix expectation (FR-011):** For the SC-027 reproducer, this entry MUST NOT appear (the two sims agree by construction). For artificial test scenarios that force a mismatch, the entry includes all new fields.

## E-3. State references (already exist, unchanged)

The feature consumes these existing globals — reference for traceability, not a model change:

| Global | Source | Consumer in this feature |
|---|---|---|
| `_lastStrategyResults` | `runStrategyRanker()` | resolver wrapper (read `winnerId`) |
| `_previewStrategyId` | strategy-row hover handler | resolver wrapper (read for preview) |
| `_lastChartLifecycleEndBalance` | `renderLifecycleChart()` | stop-gap pill guard |
| `_lastChartHasShortfall` | `renderLifecycleChart()` | stop-gap pill guard |
| `_lastResolverResult` | resolver wrapper publishes after each call | stop-gap pill guard |

All five exist today (the first four since features 008/014/020; the fifth is a 1-line publish added by this feature).

## E-4. What does NOT change

- `FireAgeResult` shape (return of `findEarliestFeasibleAge`) — `{years, months, totalMonths, feasible, searchMethod}` unchanged.
- `inp` (canonical input record) — no new fields.
- `STRATEGIES` array — still 8 entries; no add/remove.
- `getActiveSortKey({mode, objective})` — unchanged (Principle IX preservation).
- Any Chart.js dataset shape — unchanged.
- Any localStorage key — unchanged.
- Any CSV column — unchanged.
- Any translation string — none added or modified.
