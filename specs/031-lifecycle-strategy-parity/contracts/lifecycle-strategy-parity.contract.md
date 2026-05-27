# Contract: Lifecycle Strategy Parity & Verdict Alignment (Feature 031)

This contract governs how strategy-dependent retirement surfaces consume the active winning strategy.
It is a render-pipeline + gate contract (no new public calc function). All clauses apply identically to
`FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic).

## C1 — One winner, all surfaces (FR-001, FR-002; Constitution III)
- After `scoreAndRank` resolves `_lastStrategyResults.winnerId`, the recalc pipeline MUST (re-)render the
  Lifecycle chart and its sidebar so they consume that winner — mirroring the existing post-rank
  `renderRothLadder` render.
- The Lifecycle chart MUST NOT use the default bracket-fill strategy when a different strategy has won.
  Default bracket-fill is permitted ONLY when it is the resolved winner.
- **Guarantee**: for any (Mode, Objective, effective FIRE age), the Lifecycle chart, the Withdrawal
  Strategy chart, and the verdict reference the same `winnerId`.

## C2 — Drag preview consistency (FR-003)
- While `_previewFireAge` is active, the Lifecycle chart MUST reflect a strategy consistent with the
  Withdrawal Strategy chart for that previewed age (resolve the winner for the preview age, OR consistently
  preview one strategy across all three surfaces).
- On commit (mouseup → recalc), C1 applies (Lifecycle re-rendered post-rank).
- **Prohibited**: rendering a preview-age balance trajectory using a winner ranked at a different age.

## C3 — Verdict evaluates the displayed strategy (FR-004; CLAUDE.md gate rule)
- `findFireAgeNumerical` / `isFireAgeFeasible` and the Safe/Exact/DWZ gate MUST evaluate the displayed
  winner via `getActiveChartStrategyOptions()` (+ `getActiveMortgageStrategyOptions()`), not a pinned
  bracket-fill.
- Mode semantics unchanged: Safe = trajectory floor + endBalance ≥ 0; Exact = endBalance ≥ terminalBuffer;
  DWZ = floor + endBalance ≥ 0 with drain preference. Objective remains the sort key (Constitution IX).
- `calc/calcAudit.js` `_invariantA` MUST NOT mark a lifecycle-vs-signed end-balance divergence as
  `expected` once both consume the winner; genuine agreement MUST pass, genuine divergence MUST flag.

## C4 — Tooltip single-frame (FR-005; Constitution VII)
- Within one Withdrawal Strategy tooltip, the per-pool draw lines and the "total drawn" line MUST share one
  frame (all Book-Value or all real-$) and reconcile within rounding.
- A purchasing-power figure MAY appear but MUST be labeled as a today's-spending comparison (bilingual
  EN + zh-TW; Translation Catalog updated), never presented as the sum of the displayed bars.

## C5 — Cash-sweep parity (FR-006; feature 030)
- `projectFullLifecycle`'s retirement loop MUST call `_applyCashSweep` after all flows, identical to the
  other five simulator sites. Default OFF ⇒ no behavior change. Output MUST keep `_invariantF`
  (`simulator-cash-sweep-parity`) green.

## C6 — Preserved invariants (FR-008, FR-009, FR-010)
- RMDs (age 73+) honored; no negative pool balances displayed.
- When bracket-fill is the winner, output is unchanged vs. pre-feature behavior (regression guard).
- No regression to feature 022 Book-Value frame, Constitution VIII spending floor, or IX orthogonality.

## Verification hooks
- **Unit**: lifecycle-vs-withdrawal strategy-agreement parity test (assert both reference the same
  `winnerId` / produce matching per-year Trad for a non-default-winner fixture); fixture updates for any
  intended FIRE-age shift; regression runs of `strategyMatrix`, `spendingFloorPass`,
  `modeObjectiveOrthogonality`, `cashSweep*`, `calcAudit`.
- **E2E**: with a non-default winner, assert the Lifecycle Trad series declines from the winner's draw age
  without a manual objective toggle; drag the marker and assert all three surfaces stay consistent.
- **Manual** (quickstart.md): browser smoke per the project's "browser smoke before done" gate.
