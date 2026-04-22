# Contract: Strategy Comparison Harness

**Status**: Phase 1 design
**Owner (Engineer)**: Backend + QA
**Principle alignment**: II, III, IV, VI

---

## Purpose

Define how the seven `StrategyResult`s are produced, scored, ranked, and tied, so the UI layer has a deterministic view of "who won and by how much".

## Harness signature

```
Ranking scoreAndRank(inp, effectiveFireAge, mode, objective)
```

Caller: `recalcAll()` (both HTML files).

## Execution order per recalc

```
1. Outer FIRE-age solver runs (UNCHANGED from today).
   → effectiveFireAge resolved via Safe/Exact/DWZ + chartState.
2. scoreAndRank(inp, effectiveFireAge, mode, objective) is called ONCE.
   Internally:
   a. Build SHARED per-year YearContext stream once (ages fireAge..endAge).
      Building once and passing to each strategy saves re-computing RMD,
      bracketHeadroom, taxableSS across 7 strategies.
   b. For each strategy in STRATEGIES:
      - Run full lifecycle with this strategy's computePerYearMix.
      - Clamp pools to ≥ 0 before compounding (chart-display invariant).
      - Aggregate: endOfPlanNetWorthReal, lifetimeFederalTaxReal,
        averageEffectiveTaxRate, caveatFlagsObservedInRun.
   c. Collect StrategyResult[] (length 7).
3. rankByObjective(results, objective) sorts and identifies ties.
4. Module-scope _lastStrategyResults (mirrors _lastKpiSnapshot pattern)
   caches the Ranking so subsequent objective-toggle can call
   rankByObjective(cached, newObjective) without re-simulating.
```

## Scoring semantics (restating research.md §4)

**Objective `leave-more-behind`**:
1. Sort descending by `endOfPlanNetWorthReal`.
2. Within $1,000 tolerance, tiebreak by ascending `lifetimeFederalTaxReal`.
3. Within $100 tolerance on tiebreaker, final tiebreak by `strategyId` alphabetical.

**Objective `retire-sooner-pay-less-tax`**:
1. Sort ascending by `lifetimeFederalTaxReal`.
2. Within $100 tolerance, tiebreak by descending `endOfPlanNetWorthReal`.
3. Within $1,000 tolerance on tiebreaker, final tiebreak by `strategyId` alphabetical.

**Tie detection**: when two consecutive rows (after full sort) are within tolerance on rule 1 AND rule 2, they share a rank in `ties[]`. The UI shows `= 2nd` badge.

**Infeasibility**: `StrategyResult`s with `feasibleUnderCurrentMode=false` are sorted to the BOTTOM regardless of their numeric scores (they shouldn't win just because they paid no tax by failing to fund the plan). Infeasible rows display a grayed-out style with a "⚠ infeasible at this FIRE age" tooltip.

## Determinism tests

`tests/unit/strategies.test.js` MUST include a "call twice, same result" assertion:

```
const a = scoreAndRank(fixture.inp, fixture.fireAge, 'safe', 'leave-more-behind');
const b = scoreAndRank(fixture.inp, fixture.fireAge, 'safe', 'leave-more-behind');
assert.deepStrictEqual(a, b);  // FR-008
```

Plus fixture-based checks: for each of the three canonical scenarios, assert the WINNER under each objective matches the fixture's expected winner.

## Tie-detection tests

One fixture MUST be engineered to produce a tie (e.g., two strategies within $500 end-balance). The test asserts `ties[].length === 1` and both strategy IDs appear in the tie's `strategyIds` array.

## Performance tests

A microbenchmark in `tests/unit/strategies.test.js` MUST measure `scoreAndRank` wall-clock over 10 runs, asserting mean < 150 ms and p95 < 200 ms on a reference scenario.

## Caching semantics

- Re-running `scoreAndRank` with identical (inp, fireAge, mode) MUST short-circuit via `_lastStrategyResults` when the inp object passes deep-equality. Implementation detail, but specified here because `objective` toggle is a frequent user action.
- Any input change invalidates the cache (the wrapper `recalcAll` replaces `_lastStrategyResults` wholesale).
- Objective toggle does NOT invalidate — only calls `rankByObjective(cached, newObjective)` which is a sort, not a simulation.
