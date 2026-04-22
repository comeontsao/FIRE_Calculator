# Contract: Chart ↔ Module Annotation Deltas

**Status**: Phase 1 design
**Owner (Engineer)**: Backend + Frontend
**Principle alignment**: VI (Explicit Chart ↔ Module contracts)

---

## Purpose

This feature ADDS one upstream module (`strategies`) that is consumed by FIVE existing chart/KPI renderers. Per Principle VI, each renderer's inline comment header MUST be updated to declare the new dependency, and the `strategies` module's `Consumers:` list MUST name each renderer in return.

---

## Renderers requiring updated headers

### 1. `renderRothLadder` (Lifetime Withdrawal Strategy chart)

**Location**: same function as today (around line 7785 in RR, equivalent in Generic).

**Header change**:

```
// ==================== RENDERER: renderRothLadder ====================
// Inputs:
//   - CanonicalInputs
// Upstreams:
//   - withdrawal (existing)
//   - strategies (NEW — feature 008)                        ← add this line
//   - chartState.previewStrategyId (NEW — feature 008)       ← add this line
// Reads:
//   - strategies.STRATEGIES, strategies.scoreStrategies     ← add
//   - _lastStrategyResults (module cache)                   ← add
// Output:
//   - Updates #rothLadderChart + narrative banner + caveat captions
//     for the DISPLAYED strategy (= previewStrategyId ?? winner.strategyId)
// =====================================================================
```

### 2. `renderGrowthChart` (Full Portfolio Lifecycle chart)

**Location**: same function as today (around line 5180 in RR, equivalent in Generic).

**Header change**: add to existing Upstreams list:

```
// Upstreams:
//   - lifecycle (via projectFullLifecycle)
//   - strategies (NEW — feature 008; consulted ONLY when chartState.previewStrategyId is set)
// Reads:
//   - chartState.previewStrategyId                           ← add
```

**Behavior note**: when `previewStrategyId !== null`, the growth chart re-renders using the previewed strategy's `perYearRows` pool-balance sequence rather than `projectFullLifecycle`'s output — but both MUST agree for the winner strategy (byte-identical output when `previewStrategyId === null`). This is enforced by a fixture test (`tests/fixtures/strategies/winner-parity.json`).

### 3. `renderLifecycleSidebarChart` (pinnable sidebar mirror)

**Location**: `renderLifecycleSidebarChart` function.

**Header change**: same one-line addition to Upstreams as renderGrowthChart. Principle III (single-source-of-truth) guarantees sidebar tracks the main chart.

### 4. `renderKpiCards` (four KPI cards — top row)

**Location**: `renderKpiCards` function.

**Header change**: add a note:

```
// Note (feature 008): KPI values displayed do NOT change on preview because
// the fixed-FIRE-age architecture means FIRE age and FIRE number are
// strategy-invariant. KPI renderer still registers as a preview listener so
// the "Progress %" calculation uses the DISPLAYED strategy's end-balance
// for its subtitle (if we surface "Estate at plan age" there in v2).
```

### 5. `renderCompactHeaderStats` / `#fireStatus` pill

**Location**: `renderCompactHeaderStats` (currently a no-op stub) + inline status-pill update in `recalcAll`.

**Header change**: update the status-pill comment:

```
// Status pill — single source of truth for years-to-FIRE + progress %.
// (No per-strategy change — FIRE age is strategy-invariant under Architecture B.)
```

### 6. `renderStrategyComparePanel` (NEW renderer introduced by this feature)

**Location**: new function, placed adjacent to `renderRothLadder`.

**Full header**:

```
// ==================== RENDERER: renderStrategyComparePanel ====================
// Inputs:
//   - Ranking (from _lastStrategyResults, re-sorted per current objective)
// Upstreams:
//   - strategies (exclusive consumer of Ranking.rows)
//   - chartState.previewStrategyId (for active-preview row highlighting)
// Reads:
//   - _lastStrategyResults (module cache)
// Output:
//   - Populates #strategyCompareTableBody with 6 rows
//   - Highlights tied rows (ties[].strategyIds)
//   - Highlights active-preview row (chartState.previewStrategyId)
// ==============================================================================
```

---

## `strategies` module `Consumers:` list (the reciprocal update)

The `strategies` module's header (declared in `strategy-module.contract.md`) MUST name all five existing renderers + the one new renderer:

```
// Consumers:
//   - renderRothLadder
//   - renderGrowthChart                (preview only)
//   - renderLifecycleSidebarChart      (preview only)
//   - renderKpiCards                   (listener registered; no value transition in v1)
//   - renderCompactHeaderStats         (listener registered; no value transition)
//   - renderStrategyComparePanel       (new, exclusive consumer of Ranking.rows)
//   - recalcAll                        (entry point, invokes scoreAndRank)
```

---

## Two-way-link verification

Before merge, a manual Principle-VI audit MUST confirm:

1. Every renderer listed as a Consumer in `strategies` has the reciprocal `strategies` reference in its own header.
2. No other renderer silently reads `_lastStrategyResults` or `chartState.previewStrategyId` without declaring the dependency. (Grep for `_lastStrategyResults` and `previewStrategyId` in each HTML — every hit outside the scope of the listed renderers is a violation.)
3. The grep-based automated check added to `tests/baseline/browser-smoke.test.js`:

```js
test('Principle VI — strategies module consumer/upstream symmetry', () => {
  for (const [label, src] of [['RR', rrSrc], ['Generic', genericSrc]]) {
    for (const consumer of [
      'renderRothLadder', 'renderGrowthChart', 'renderLifecycleSidebarChart',
      'renderKpiCards', 'renderCompactHeaderStats', 'renderStrategyComparePanel',
    ]) {
      assert.match(src, new RegExp(`${consumer}[\\s\\S]{0,800}strategies`), `${label}: ${consumer} missing strategies upstream`);
    }
    assert.match(src, /function strategies[\\s\\S]*Consumers:[\\s\\S]*renderRothLadder/, `${label}: strategies missing renderRothLadder consumer`);
  }
});
```

This test prevents silent drift — if someone later adds a new chart that reads `_lastStrategyResults` without updating headers, the test fails.
