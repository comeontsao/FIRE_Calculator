# Data Model: Lifecycle Strategy Parity (Feature 031)

No persisted schema changes (no new `localStorage` keys, no `FIRE-snapshots.csv` columns). This feature
is about *interactive state flow* — ensuring one resolved entity is consumed by every retirement surface.
The "entities" below are in-memory state objects and the per-year row shape already produced by the
simulators.

## Entities

### ActiveWinningStrategy (resolved per recalc)
- **Source of truth**: `_lastStrategyResults` (set by `scoreAndRank`) → `winnerId`, and the per-strategy
  `rows[].perYearRows` from `_simulateStrategyLifetime`.
- **Resolver**: `getActiveChartStrategyOptions()` → `{ strategyOverride, thetaOverride }` (plus
  `getActiveMortgageStrategyOptions()`), and `_previewStrategyId` during hover.
- **Lifecycle rule**: MUST be populated (non-null `winnerId`) before any strategy-dependent surface
  renders. Consumers: Lifecycle chart (`renderGrowthChart`), Lifecycle sidebar, Withdrawal Strategy chart
  (`renderRothLadder`), FIRE-age verdict (`findFireAgeNumerical`/`isFireAgeFeasible`), audit recompute.
- **Invariant**: at the end of a recalc, all consumers reference the SAME `winnerId` for the SAME
  effective/previewed FIRE age. Default bracket-fill is used only when it is genuinely the winner.

### PerYearRow (existing shape, unchanged fields)
- Balance fields (Lifecycle chart): `p401kTrad`, `p401kRoth`, `pStocks`, `pCash`, `total`, plus
  `*BookValue` siblings (feature 022) and `hasShortfall`.
- Draw fields (Withdrawal Strategy chart): `wTrad`, `wRoth`, `wStocks`, `wCash`, `rmd`, `ordIncome`,
  `taxOwed`, `ltcgTax`, and `*BookValue` siblings.
- **Frame rule (FR-005)**: a given tooltip section MUST read one frame consistently — either all
  Book-Value (`w*BookValue`) or all real-$ (`w*`); the purchasing-power line is a labeled comparison.

### FireMarkerPreviewState
- `_previewFireAge` (during drag), committed via `chartState.setOverride` on mouseup.
- **Rule (FR-003)**: while previewing, the winner consumed by the Lifecycle chart MUST correspond to the
  previewed age (or all three surfaces consistently preview one strategy); no mixing a winner ranked at a
  different age with a preview-age balance trajectory.

### VerdictGateInput
- Mode (`safe`/`exact`/`dieWithZero`), Objective, and the strategy options the gate evaluates.
- **Rule (FR-004)**: the gate's strategy options MUST equal the displayed winner's options
  (`getActiveChartStrategyOptions()`), not a pinned bracket-fill. Mode remains the end-state constraint;
  Objective remains the sort key (Constitution IX unchanged).

### CashSweepState (feature 030, reused)
- `_applyCashSweep(pools, threshold, enabled)` — pure, one-way cash→stocks, after all flows.
- **Rule (FR-006)**: `projectFullLifecycle`'s retirement loop applies it identically to the other five
  simulator sites; default OFF preserves current behavior.

## State transitions (recalc ordering — the fix)

```
recalcAll:
  _lastStrategyResults = null
  ... yearsToFIRE (gate) ...            # FR-004: evaluate displayed winner, not pinned bracket-fill
  _setCalculatedFire(...)              # fires chartState.onChange -> Lifecycle render (currently here, winner=null)
  _lastStrategyResults = scoreAndRank(...)   # winner resolved
  renderRothLadder(...)               # existing post-rank render (winner)
  renderGrowthChart(...) + sidebar    # FR-002: NEW post-rank render so Lifecycle uses the winner
```

After the fix, the Lifecycle chart's final render in every recalc reads the resolved winner; the
transient onChange render (winner=null) is superseded.
