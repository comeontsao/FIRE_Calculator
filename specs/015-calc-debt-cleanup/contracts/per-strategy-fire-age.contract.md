# Contract: Per-Strategy FIRE Age (US3, Option B)

**Wave:** B (P2) | **FRs:** FR-008..FR-012 | **Spec section:** [User Story 3](../spec.md)

This contract pins the per-strategy FIRE-age finder, the drag-skip guard, and the budget-measurement protocol that decides Option B vs the Option A fallback.

---

## 1. Public API

```js
function findPerStrategyFireAge(strategyId, scenarioInputs, mode, overlays) {
  // Returns: { strategyId, perStrategyFireAge: number, perStrategyTrajectory: PerYearRow[] }
}
```

The function is a thin wrapper around the existing `findFireAgeNumerical` bisection that threads `strategyOverride: strategyId` (and `thetaOverride` for `tax-optimized-search`) through every simulator call inside the bisection.

### Recalc orchestration

```js
function recalcAll() {
  // ...existing input collection...

  let perStrategyResults;
  if (window._userDraggedFireAge) {
    // Drag-skip path: skip per-strategy finder, use user-set age for all strategies
    perStrategyResults = STRATEGY_REGISTRY.map(strategyId => {
      const sim = simulateLifecycle({ scenarioInputs, fireAge: userDraggedAge, planAge, strategyOverride: strategyId, thetaOverride: undefined, overlays, noiseModel: null });
      return buildPerStrategyResult(strategyId, userDraggedAge, sim);
    });
  } else {
    // Normal path: per-strategy finder
    perStrategyResults = STRATEGY_REGISTRY.map(strategyId =>
      findPerStrategyFireAge(strategyId, scenarioInputs, mode, overlays)
    );
  }

  const sortKey = getActiveSortKey({ mode, objective });
  const ranked = scoreAndRank(perStrategyResults, sortKey);

  _lastStrategyResults = { perStrategyResults: ranked, sortKey };
  // ...render charts, KPI cards, etc...
}
```

---

## 2. `_userDraggedFireAge` flag

### Lifecycle

```
Initial state: false
On user drag-start:        flag := true; userDraggedAge := chart.scales.x.getValueForPixel(eventX)
On user drag-move:         userDraggedAge := <updated>
On user drag-end:          schedule clearOnIdle in 500ms
On any input change:       flag := false; userDraggedAge := undefined; clearOnIdle cancelled
On clearOnIdle (500ms idle): flag := false; userDraggedAge := undefined
```

### Storage

`window._userDraggedFireAge: boolean` and `window._userDraggedFireAgeValue: number | undefined` — both `window`-scoped to be reachable from any function in either HTML file. NOT persisted to localStorage (transient).

### Why two flags

The boolean is the cheap recalc-time check. The numeric value is read by the recalc orchestrator only when the boolean is `true`, so we can reuse the same recalc function for both paths without an extra parameter.

---

## 3. Budget measurement protocol

### Procedure

A Playwright fixture in `tests/e2e/recalc-convergence.spec.ts`:

1. Cold-load the dashboard with the user's default scenario.
2. Wait 2 seconds for boot to settle.
3. Run `recalcAll()` 10 times in sequence; capture `perStrategyFinderMs` from each (instrumented via `performance.now()` markers).
4. Compute p50 (median) and p95 of the 10 samples.
5. Decision rule:
   - `p50 < 200 && p95 < 250` → adopt Option B; record `metadata.fireAgeFinderMode: 'per-strategy'`.
   - else → fall back to Option A; record `metadata.fireAgeFinderMode: 'iterate-to-convergence'`.

### Fallback (Option A) algorithm

If the budget check fails, the finder switches to:

```js
function findFireAgeIterateToConvergence(scenarioInputs, mode, overlays, maxCycles = 3) {
  let strategyOverride = 'bracket-fill-smoothed'; // initial: default strategy
  let prevPair = null;

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const fireAge = findFireAgeNumericalWithStrategy(scenarioInputs, mode, overlays, strategyOverride);
    const ranked = rankStrategiesAtAge(scenarioInputs, fireAge, mode, overlays);
    const winnerStrategyId = ranked[0].strategyId;
    const pair = `${fireAge}|${winnerStrategyId}`;

    if (pair === prevPair) {
      // Stable: 2 consecutive cycles agree
      return { fireAge, perStrategyResults: ranked, cyclesUsed: cycle + 1 };
    }
    prevPair = pair;
    strategyOverride = winnerStrategyId;
  }

  // After 3 cycles, return whatever we have (still better than today's no-iteration)
  return { fireAge: lastFireAge, perStrategyResults: ranked, cyclesUsed: maxCycles };
}
```

### Audit visibility

`auditSnapshot.metadata.fireAgeFinderMode` is rendered in the audit's flow-diagram header so the user can see which mode is active. Bilingual labels:

| Key | EN | zh-TW |
|-----|-----|-----|
| `audit.metadata.finderMode.perStrategy` | `Per-strategy FIRE age (Option B)` | `各策略獨立 FIRE 年齡（選項 B）` |
| `audit.metadata.finderMode.iterateToConvergence` | `Iterate to convergence (Option A — budget fallback)` | `迭代收斂（選項 A — 預算備援）` |

---

## 4. PerStrategyResult enrichment

Per the data-model, every entry in `_lastStrategyResults.perStrategyResults[]` gains:

```js
{
  strategyId,
  perStrategyFireAge,            // NEW — earliest feasible age for this strategy
  perStrategyTrajectory,          // NEW — full per-year sim from perStrategyFireAge
  endBalance,
  hasShortfall,
  shortfallYearAges,
  floorViolations,
  cumulativeFederalTax,           // R8 — rounded to nearest dollar
  residualArea,                   // R8 — rounded to nearest dollar
  feasibleUnderCurrentMode,
  rankIndex,                      // set by ranker after sort
}
```

---

## 5. Cross-validation invariant update (for audit)

Feature 014's audit cross-validation invariant C is updated:

- **Before 015**: `displayed FIRE age === _lastStrategyResults.fireAge` (single global FIRE age).
- **After 015**: `displayed FIRE age === _lastStrategyResults.perStrategyResults[winnerRankIndex].perStrategyFireAge`.

The audit's invariant code is updated in the same Wave B commit that rolls out per-strategy FIRE age. FR-011 prohibits false positives in stable state — verified by the convergence Playwright fixture.

---

## 6. Acceptance criteria

| Criterion | Verifiable by |
|-----------|---------------|
| FR-008 unchanged-input recalc stable | Playwright: 2 consecutive recalcs produce byte-identical Copy Debug `audit` block (excluding `generatedAt`) |
| FR-009 ranker uses per-strategy ages | Unit test asserts `auditSnapshot.strategyRanking.perStrategyResults[*].perStrategyFireAge` is non-null and per-strategy varies |
| FR-010 drag-skip short-circuits finder | Playwright: drag the marker, assert `metadata.finderTimeMs < 30ms` (no per-strategy finder ran) |
| FR-011 cross-validation invariant C stable | Playwright on 3 consecutive recalcs: `crossValidationWarnings` byte-identical |
| FR-012 budget kept ≤ 250ms | Playwright budget fixture; if it fails, audit displays `'iterate-to-convergence'` finder mode |
