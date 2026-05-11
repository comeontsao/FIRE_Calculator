# Phase 0 — Research

**Feature**: 028-strategy-aware-fire-age
**Date**: 2026-05-08

## R-1. Reuse vs duplicate strategy router

**Question**: Should `simulateRetirementOnlySigned` get its own copy of the strategy router logic, or dispatch into the same router that `projectFullLifecycle` uses?

**Decision**: Dispatch into the existing router. From inside the per-year retirement loop, when `options.strategyOverride` is set, call the same `taxOptimizedWithdrawal(..., { strategyOverride, thetaOverride })` (or its strategy-router equivalent) that `projectFullLifecycle` calls. When unset, retain the existing inline `_drawByPoolOrder`-style code path so the bracket-fill default behavior is byte-identical.

**Rationale**:

- Principle II — Pure modules with declared contracts. Two divergent strategy implementations would mean two places to update for any future strategy change.
- Principle VIII — Spending Funded First. The router already houses the spending-floor pass. Threading dispatch preserves the floor by construction; duplicating would introduce a second floor-pass code path that could regress independently (the exact failure mode that triggered Feature 015's amendment to add Strategy Matrix coverage).
- The cost is one extra function call per retirement-year iteration. The inline path already runs ~50 such iterations per chart render; the resolver runs ~60 candidates × ~50 iterations = ~3,000 iterations per recalc. Profiling of feature 027's chart render shows each retirement-year dispatch at ~0.05 ms in V8; total budget ≤ 150 ms even on slow hardware. Acceptable.

**Alternatives considered**:

- **Inline a strategy-aware copy in `simulateRetirementOnlySigned`** — rejected; doubles the surface area for Principle IV regression coverage and creates a new place where Spending Funded First can drift.
- **Move the strategy router to a separate Node-importable module first, then have both sims consume it** — rejected for this branch's scope. The router lives inline in both HTMLs today and depends on other inline helpers; extracting it is a separate refactor (potential feature 029) and is out of scope per the spec's "Out of scope" section.

## R-2. Performance budget

**Question**: Is the strategy-aware resolver fast enough to ship without caching?

**Decision**: Yes — ship without caching first. Profile-budget target: total recalc ≤ 200 ms on a mid-range laptop with the SC-027 reproducer (Mode = DWZ, Aggressive winner). If the budget is exceeded once measured, add a single-entry cache keyed by `(strategyId, theta, fireAge, mode)` inside the resolver wrapper.

**Rationale**:

- The chart already runs `projectFullLifecycle` once per recalc (~50 iterations × ~0.5 ms = 25 ms in measured feature 027 runs). The resolver Stage 1 linear scan adds ~60 candidates × similar cost = ~30 ms additional in the worst case.
- Compared to the existing strategy ranker (which runs 8 strategies × full lifecycle = 8 × 25 ms = 200 ms — already shipping), the resolver's added cost is incremental.
- Premature caching adds invalidation risk (Principle III — Single Source of Truth for Interactive State); the cache key would need to include every input that affects the sim, which is essentially the full `inp` record.

**Alternatives considered**:

- **Cache by `(strategyId, theta, fireAge)` only** — rejected; ignores Mode dimension, which changes the gate verdict but not the trajectory. Hit rate would be high but invalidation correctness would fall to Mode resolution boundaries.
- **Memoize per-recalc** — kept as a stretch optimization; only adopt if profiling shows the un-cached path exceeds 200 ms.

## R-3. Stop-gap detection signal

**Question**: How does the verdict pill detect that the chart says infeasible while the resolver said feasible?

**Decision**: Read two existing signals already published by the dashboard's render path:

1. `_lastChartLifecycleEndBalance` — already updated by the lifecycle chart render (`renderLifecycleChart()`). Captures the actual end-balance under the active strategy at plan age.
2. `_lastResolverResult.feasible` — published by the resolver wrapper (introduced in feature 020 / 026 era). Captures the resolver's verdict.

The stop-gap fires when:

```javascript
const winnerIsNonDefault = _lastStrategyResults?.winnerId
  && _lastStrategyResults.winnerId !== 'bracket-fill-smoothed';
const chartSaysInfeasible = _lastChartLifecycleEndBalance < 0
  || _lastChartHasShortfall === true;
const resolverSaysFeasible = _lastResolverResult?.feasible === true;
const shouldOverride = winnerIsNonDefault && chartSaysInfeasible && resolverSaysFeasible;
```

When `shouldOverride === true`, the pill renders the existing `fire-status behind` class with the existing `dyn.statusBehindLongTimeline` (or equivalent shortfall) i18n key.

**Rationale**:

- No new state — both signals already exist.
- No false negatives — when the chart end-balance is positive (feasible), the override never fires, so a valid plan with a non-default winner still shows "On Track".
- No false positives — bracket-fill default winners (most common case) skip the override entirely.

**Alternatives considered**:

- **Run a parallel signed-sim with the active strategy and compare** — rejected; that's the root-cause fix (FR-001 to FR-006), not the stop-gap. The stop-gap exists precisely to ship before the root-cause.
- **Always override when winner is non-default** — rejected; would produce false negatives (block valid plans where the active strategy is feasible) and undermine user trust in the pill.

## Open Risks

None blocking. One observation:

- **R-A**: The `_previewStrategyId` hover signal currently fires preview renders only for the chart, not the resolver. After FR-006 lands, the resolver also re-runs on hover, which means brief CPU spikes during strategy-row hover in the audit panel. Profile target: hover re-render ≤ 50 ms. If it exceeds, debounce hover at 16 ms (one frame) and re-run only the resolver, not the full strategy ranker.

This risk is documented but not a gate; profiling happens at QA time post-implement.
