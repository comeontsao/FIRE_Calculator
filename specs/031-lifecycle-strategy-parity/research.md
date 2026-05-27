# Research: Lifecycle Chart Strategy Staleness (Feature 031)

**Date**: 2026-05-27
**Status**: Phase 0 complete — root cause CONFIRMED. Open decisions captured for `/speckit-clarify`.
**Method**: Read-only code investigation across `FIRE-Dashboard.html` (RR), `FIRE-Dashboard-Generic.html` (Generic), `calc/*.js`. RR line numbers cited; Generic mirrors with ~+388-line offset (no logic divergence).

> **Correction notice**: An earlier draft of this document concluded the discrepancy was a benign "balance rises because the smoothed draw is smaller than growth." That was WRONG — it assumed the default bracket-fill path. The live scenario (Exact + "Leave more behind") runs a non-default winning strategy, and the real cause is a render-ordering race that makes the Lifecycle chart draw a *different strategy* than every other surface. The user's hypothesis (drag/recalc not feeding the withdrawal strategy back into the lifecycle chart) is correct.

## Root cause (one sentence)

The Lifecycle chart renders via the `chartState.onChange` listener fired inside `_setCalculatedFire` (RR `:13067`) **before** `scoreAndRank` populates `_lastStrategyResults` (RR `:13081`), and — unlike the Withdrawal Strategy chart, which gets a post-rank re-render (RR `:13122`) — it receives **no post-rank re-render**, so it silently draws the **default bracket-fill** trajectory while the Withdrawal Strategy chart splices in the **winner's** per-year rows. Two different strategies on screen at once. The FIRE-marker drag path (RR `:14919`) compounds this by never re-running the ranker for the preview age.

## Evidence (file:line)

### Defect 1 — strategy staleness / render-ordering race (PRIMARY)
- `recalcAll` (RR `:13013`; Generic ~`:13397`):
  - RR `:13027` — `_lastStrategyResults = null;` (wiped each recalc).
  - RR `:13067` — `_setCalculatedFire(...)` synchronously fires `chartState.onChange` → `onFireChange_growthChart` (RR `:19324`) → `renderGrowthChart` (Lifecycle). **`_lastStrategyResults` is still `null` here.**
  - RR `:13081` — `_lastStrategyResults = scoreAndRank(...)` runs AFTER the lifecycle chart already drew.
  - RR `:13122` — `renderRothLadder` (Withdrawal Strategy chart) is force re-rendered post-rank, picking up the winner. **No equivalent second `renderGrowthChart`.**
  - Code comment at RR `:13116-13121` documents the early-listener problem for the withdrawal chart but never adds the lifecycle re-render.
- Lifecycle strategy resolution: `renderGrowthChart` builds `_chartOpts.strategyOverride` from `_lastStrategyResults.winnerId` at RR `:16294-16314` (Generic `:16687-16707`); when `null`, `projectFullLifecycle` (RR `:16315`) runs default bracket-fill.
- Withdrawal chart winner splice: RR `:14248-14264` (Generic `:14640-14660`) reads `_lastStrategyResults.rows.find(winnerId).perYearRows` from `_simulateStrategyLifetime` (RR `:11812`).
- Objective-toggle handler (RR `:8228-8246`) DOES re-render both charts after `rankByObjective` — which is why toggling an objective momentarily "fixes" the lifecycle chart (separate refresh path = the tell).

### Defect 2 — drag path staleness
- Drag: `mousemove` RR `:14890`, preview render RR `:14911-14922` (sets `_previewFireAge`, calls `renderGrowthChart` directly at `:14919`); commit `mouseup` RR `:14933`. **`scoreAndRank` is not re-run for the preview age**, so the lifecycle chart threads a winner computed at a different FIRE age, or bracket-fill. Commit triggers `recalcAll` → same ordering race as Defect 1.

### Defect 3 — tooltip frame mixing (independent display bug)
- In `renderRothLadder` tooltip: per-bar labels print Book-Value (nominal) series — `tradData = r.wTradBookValue` (RR `:14429`), `rothData = r.wRothBookValue` (RR `:14434`). `afterBody` (RR `:14537-14551`) computes "Total drawn" and "≈ purchasing power" from raw real-$ fields `(r.wTrad+r.wRoth+...)/1000` (RR `:14542`, `:14548`) and "Ordinary income" from `r.ordIncome` (real-$, RR `:14550`).
- Result: bars (nominal) and totals (real-$) are different frames → "$101.7K + $100.3K ≠ $103.7K" and "ordinary income $52.2K < Trad bar $101.7K". The large gross `wTrad+wRoth` also reflects `_drawByPoolOrder`'s gross-vs-net draw (RR `:11398/:11429-11456`), surfaced as raw gross while the labeled total is net real-$.

## Safe / Exact / DWZ gate exposure (user's explicit concern)
- FIRE-age search is deliberately pinned to bracket-fill: `_lastStrategyResults` nulled at RR `:13027` before `yearsToFIRE` runs at RR `:13029`; gate via `isFireAgeFeasible`/`findFireAgeNumerical` (RR `:12053-12146`) and `signedLifecycleEndBalance` (RR `:9018`). Audit gates in `calc/calcAudit.js:262` call `projectFullLifecycle` with `getActiveChartStrategyOptions()`.
- **Consequence:** the verdict is currently judged on bracket-fill while the Withdrawal Strategy chart shows the winner — the exact "gates MUST evaluate the displayed strategy" hazard from CLAUDE.md. `_invariantA` (`calcAudit.js:665`, esp. `:711-714`) currently marks this divergence `expected = true` when a non-bracket-fill winner is active, suppressing it rather than flagging it.

## Recommended fix shape
1. **Single source of truth (Constitution III):** compute the winner once; render all strategy-dependent surfaces from it. Add a post-rank `renderGrowthChart(...)` (+ sidebar) after RR `:13128`, mirroring the existing post-rank `renderRothLadder` at RR `:13122`. Mirror to Generic.
2. **Drag path:** on preview, thread the resolved winner for the preview age (or pin BOTH charts to bracket-fill during preview) so lifecycle and withdrawal never diverge mid-drag; ensure commit-recalc re-renders the lifecycle chart post-rank.
3. **Gate alignment (DECISION NEEDED):** decide whether the FIRE-age gate evaluates the displayed winner (per CLAUDE.md lesson) or stays pinned to bracket-fill; if pinned, surface the mismatch instead of suppressing `_invariantA`.
4. **Tooltip frame fix (DECISION: include in 031?):** make `afterBody` totals use the same frame as the bars (or convert bars to real-$) and label purchasing power explicitly. Both files (RR `:14537-14551`).
5. **Cash-sweep gap (DECISION: Option D?):** `projectFullLifecycle`'s retirement loop lacks the `_applyCashSweep` the other five sweep sites have; closing it keeps `_invariantF` green as 031 exercises these pools more.

## Blast radius (consumers of the lifecycle balance series)
- FIRE-age verdict gate (`findFireAgeNumerical`/`isFireAgeFeasible`, RR `:12053-12146`); Safe/Exact/DWZ gates (`calcAudit.js` `_buildGate`/`_scanFloorViolations`); audit invariants A–F (`_invariantA` `:665` and `_invariantF` `:904` most at risk; `_invariantE` grossSpend parity not order-sensitive); asset table (RR `:16217`); sidebar mirror (RR `:8533`); Milestones; cash-sweep (feature 030); Book-Value conversion `_extendRowsWithBookValues` (RR `:16320`, pure scaling). Once the lifecycle chart uses the winner, its Trad line will fall from ~60 to match the Withdrawal chart — the intended user outcome — but any end-balance/total change propagates to the gates, so re-validate against gold-standard fixtures + all three modes.

## RR/Generic divergence
None in logic. All cited code mirrored (`computeWithdrawalStrategy` RR `:12359` / Generic `:12743`; winner splice RR `:14248` / Generic `:14640`; lifecycle resolution RR `:16294` / Generic `:16687`).
