# Feature Specification: Strategy-Aware FIRE-Age Resolver + Verdict-Pill Stop-Gap

**Feature Branch**: `028-strategy-aware-fire-age`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "When the active withdrawal strategy is not bracket-fill default (e.g. aggressive-bracket-fill from feature 027), the FIRE-age resolver and the verdict pill must evaluate the SAME strategy that the chart renders. Currently they evaluate bracket-fill default via signedLifecycleEndBalance, which can produce a green 'On Track' verdict while the chart shows a red infeasibility zone with floor violations."

## Background

**The bug.** When the strategy ranker picks a non-default winner (most commonly the new `aggressive-bracket-fill` from feature 027), the FIRE-age resolver evaluates feasibility against a *different* simulator than the chart renders. The chart calls `projectFullLifecycle` threaded with `_lastStrategyResults.winnerId`; the resolver and verdict pill call `signedLifecycleEndBalance`, which is hard-coded to the bracket-fill default. The two simulators can disagree at the same fire age and mode, producing a misleading user-facing state where:

- Header pill says "On Track — FIRE in 11 years 6 months (age 53)" (green).
- Chart shows depletion to $0 by age 93, red-shaded "Short by $229,755" zone, "This retirement age is not sustainable under your current plan."

**Reproducer (from user-supplied debug dump 2026-05-08).** Mode = DWZ, Objective = "Leave more behind", winner = `aggressive-bracket-fill`. Resolver returns `feasible: true, age: 53` because bracket-fill default passes DWZ at age 53. Chart renders the actually-displayed strategy and visibly fails. The dump's `crossValidationWarnings` block already flags the divergence with `kind: "endBalance-mismatch", reason: "signedLifecycleEndBalance is bracket-fill-only — active strategy is aggressive-bracket-fill."`

**Why this is a known class.** CLAUDE.md "Process Lessons / FIRE-mode gates MUST evaluate the displayed strategy" documents the rule and the prior incident (feature 014). Feature 027 added `aggressive-bracket-fill` as the 8th strategy and registered it in the ranker but did not extend `signedLifecycleEndBalance` / `isFireAgeFeasible` to be strategy-aware, re-opening the same class of bug.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Verdict pill cannot ship a false "On Track" (Priority: P1)

The user changes Mode (Safe / Exact / DWZ) or toggles Withdraw Strategy objective (Leave more behind / Pay less lifetime tax). The header verdict pill MUST agree with what the chart visibly shows. If the chart paints a red infeasibility zone or "Short by $X" warning, the pill MUST NOT show "On Track".

**Why this priority**: User trust hinges on the pill matching the chart. A false "On Track" while the chart shows depletion is a credibility-breaking state — the user cannot tell which signal to believe and may make a real retirement decision on a wrong verdict.

**Independent Test**: Load the SC-027 reproducer (DWZ + aggressive-bracket-fill winner). Confirm the pill renders "Behind" / "Long timeline" / "Short by $X" rather than "On Track".

**Acceptance Scenarios**:

1. **Given** Mode = DWZ, Objective = Leave more behind, winner = `aggressive-bracket-fill` at age 53 with end-balance shortfall, **When** the dashboard renders, **Then** the verdict pill shows an infeasible state (not "On Track").
2. **Given** Mode = Exact, winner = `aggressive-bracket-fill` at any age where the chart visibly fails the buffer floor, **When** the dashboard renders, **Then** the verdict pill shows an infeasible state.
3. **Given** any scenario where the chart's `projectFullLifecycle` end-balance under the active mode is feasible, **When** the dashboard renders, **Then** the verdict pill shows "On Track" — the stop-gap MUST NOT introduce false negatives that block a valid plan.

---

### User Story 2 — FIRE-age search evaluates the strategy the user is looking at (Priority: P1)

The displayed FIRE age (header "FIRE in N years M months") MUST be computed by simulating the SAME withdrawal strategy the chart renders. Today the resolver always uses bracket-fill default; with this feature, when the active winner is `aggressive-bracket-fill` (or any future non-default strategy), the resolver simulates that strategy.

**Why this priority**: Without this, switching Mode = Exact ↔ DWZ produces the same FIRE age (per the user's reproducer) because both modes search through the same bracket-fill simulator. The differentiation users expect from changing modes is absent. This is the root-cause fix; User Story 1 is its safety net.

**Independent Test**: With the SC-027 reproducer, the resolver MUST return `feasible: false` (i.e., no age in [currentAge, endAge] passes DWZ under aggressive-bracket-fill). Switching Mode to Exact MUST produce a different FIRE age (or also `feasible: false`) because the buffer thresholds differ.

**Acceptance Scenarios**:

1. **Given** active winner = `aggressive-bracket-fill` and Mode = DWZ for the SC-027 reproducer, **When** the resolver runs, **Then** it returns `feasible: false, years: -1, searchMethod: 'none'` AND the header pill reflects that.
2. **Given** active winner = `bracket-fill-smoothed` (default), **When** the resolver runs, **Then** behavior is unchanged from feature 027 (no regression).
3. **Given** Mode = Exact vs DWZ at the same input set under the same strategy, **When** the resolver runs, **Then** the resolved FIRE age MAY differ between modes (whereas before it always matched). This is the desired symptom — gate selectivity restored.

---

### User Story 3 — Cross-validation panel surfaces strategy-mismatch warnings (Priority: P2)

When the resolver's verdict and the chart's `projectFullLifecycle` end-balance disagree under the same mode, the audit panel MUST surface the divergence as a `crossValidationWarnings` entry. This is already partly implemented (feature 020); after this feature lands, the entry MUST include the active strategy ID, the mode under evaluation, and both end-balance values so a future audit can verify post-fix that no divergence remains in scope.

**Why this priority**: Operator-facing observability. The user already saw this exact warning in the debug dump that prompted this feature; ensuring it stays in place protects against feature 029+ reintroducing the bug.

**Independent Test**: Inspect the audit dump's `crossValidationWarnings` array. After the fix, divergent rows MUST be empty for the SC-027 reproducer (since both simulators now agree). For an artificial test scenario where they disagree, the warning MUST emit with all three new fields.

**Acceptance Scenarios**:

1. **Given** the SC-027 reproducer post-fix, **When** the audit dump is generated, **Then** `crossValidationWarnings` for end-balance is empty.
2. **Given** an artificial test where the chart sim and the signed sim are forced to disagree, **When** the audit dump is generated, **Then** the warning entry includes `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance`, and `delta`.

---

### Edge Cases

- **What happens when winner = `tax-optimized-search` with `chosenTheta`?** The resolver MUST thread both `strategyOverride: 'tax-optimized-search'` AND `thetaOverride: <theta>` through, mirroring `getActiveChartStrategyOptions()`. A non-zero theta with no override would cause the resolver to evaluate at θ = 0.
- **What happens during `_previewStrategyId` hover?** While the user hovers a strategy in the ranking panel, the chart preview-renders that strategy. The resolver MUST follow the same source-of-truth resolution order: `_previewStrategyId` first, then `_lastStrategyResults.winnerId`, then `undefined` (use default).
- **What happens when the winner changes mid-render?** The strategy resolver and verdict pill must consult the SAME snapshot. If the strategy ranker reruns between the resolver call and the pill render, both must read from the new snapshot or both from the old. No interleaving.
- **What happens for currentAge > endAge or other edge cases already handled by `fireAgeResolver.js`?** Behavior unchanged — those return paths predate this feature and already short-circuit before any strategy is selected.
- **What happens if `simulateRetirementOnlySigned` is called from a unit test with no strategy injection?** It MUST default to bracket-fill (current behavior) — back-compat preserved for the existing test corpus.
- **What happens for existing E2E and unit tests that pin specific FIRE ages?** Tests under feature 027's bracket-fill scenarios MUST continue passing unchanged; new tests cover the strategy-aware path.

## Requirements *(mandatory)*

### Functional Requirements

#### A — Strategy-aware signed simulator

- **FR-001**: `simulateRetirementOnlySigned` (both HTMLs) MUST accept `options.strategyOverride: string | undefined` and `options.thetaOverride: number | undefined`. When both are absent, behavior is identical to current (bracket-fill default).
- **FR-002**: When `strategyOverride` is set, the per-year retirement loop inside `simulateRetirementOnlySigned` MUST route the withdrawal step through the same strategy router that `projectFullLifecycle` uses.
- **FR-003**: `signedLifecycleEndBalance` MUST plumb the same options through to its inner `simulateRetirementOnlySigned` call.

#### B — Strategy-aware resolver wiring

- **FR-004**: Both HTMLs' wrappers around `findEarliestFeasibleAge` MUST read the active strategy via `getActiveChartStrategyOptions()` (or the equivalent existing helper) and thread `strategyOverride` + `thetaOverride` into the resolver options.
- **FR-005**: `isFireAgeFeasible` (the gate function injected into the resolver) MUST also consume the same strategy options when computing per-mode feasibility, so the resolver's Stage 1 linear scan and the gate verdict agree.
- **FR-006**: The strategy resolution order MUST be: `_previewStrategyId` → `_lastStrategyResults.winnerId` → `undefined` (default).

#### C — Verdict-pill stop-gap (lands BEFORE the full fix in the same branch)

- **FR-007**: When (a) the active winner is non-default AND (b) the resolver's verdict (computed against bracket-fill default per current code) disagrees with the chart's `projectFullLifecycle` end-balance under the same mode, the FIRE status pill MUST render an infeasible state ("Behind" / "Long timeline" / "Short by $X") instead of "On Track".
- **FR-008**: The stop-gap MUST be removable (or no-op) once FR-001 through FR-006 land, because at that point the two simulators agree by construction. The feature MUST keep both layers landed in the same branch so the misleading verdict is closed in a single user-visible release.
- **FR-009**: The stop-gap MUST NOT introduce false negatives — for any scenario where the chart end-balance is feasible under the active mode, the pill MUST continue to show "On Track".

#### D — Audit visibility

- **FR-010**: The `crossValidationWarnings` entry for end-balance mismatch MUST include `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance`, and `delta` fields (extending the current `kind`, `valueA`, `valueB`, `delta`, `reason` shape).
- **FR-011**: Post-fix, the audit dump for the SC-027 reproducer MUST emit zero `endBalance-mismatch` warnings for the active strategy (the chart and signed sims agree).

#### E — Lockstep + tests

- **FR-012**: All HTML changes MUST ship to BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.
- **FR-013**: New unit tests MUST cover `simulateRetirementOnlySigned` with each non-default strategy and assert the end-balance equals the same strategy's end-balance from `projectFullLifecycle` within rounding tolerance (≤ $1).
- **FR-014**: New unit tests MUST cover the resolver's strategy-aware path: SC-027 reproducer (DWZ + aggressive-bracket-fill at age 53) MUST resolve as `feasible: false`.
- **FR-015**: Existing 493 unit tests MUST continue to pass.
- **FR-016**: A regression E2E test MUST drive the SC-027 reproducer in both HTMLs and assert the pill text matches the chart state (NOT "On Track" when the chart shows infeasibility).

### Key Entities

- **Strategy resolution context**: The `{ strategyOverride, thetaOverride }` pair the chart consumes via `getActiveChartStrategyOptions()`. After this feature, the resolver and the gate function consume the same pair.
- **`crossValidationWarnings` entry**: An audit-panel record that compares chart-sim and signed-sim end-balance. Extended in this feature with active strategy and mode.
- **FireAgeResult (existing, unchanged shape)**: `{ years, months, totalMonths, feasible, searchMethod }` — the resolver's return type. After this feature, the values it returns will reflect the active strategy, not bracket-fill default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-028-A**: For the user's SC-027 reproducer (DWZ + aggressive-bracket-fill winner at age 53), the verdict pill changes from "On Track — FIRE in 11Y 6M (age 53)" to an infeasible state. Post-fix, this is verifiable by running the dashboard with the documented input set and visually confirming the pill text.
- **SC-028-B**: The `crossValidationWarnings` array in the audit dump for SC-027 reproducer is empty for `endBalance-mismatch` rows.
- **SC-028-C**: At least one Mode×Strategy combination exists where switching Mode = Exact ↔ DWZ now produces a different FIRE age (whereas before this feature it always matched). This is the visible signal that mode selectivity is restored.
- **SC-028-D**: Test coverage: 100% of registered withdrawal strategies (currently 8) have at least one resolver test pinning their per-mode feasibility verdict.
- **SC-028-E**: Zero regressions in the existing 493 unit tests; all continue to pass.
- **SC-028-F**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` ship the fix in lockstep — a diff between the two on this code path is empty (modulo their other documented divergences such as RR-only inputs).

## Assumptions

- The existing strategy router (`taxOptimizedWithdrawal` + the per-strategy dispatchers added in feature 008 and extended in feature 027) already accepts `strategyOverride` and `thetaOverride` in `projectFullLifecycle`. This feature reuses that router from inside `simulateRetirementOnlySigned`; no new strategy-router work is required.
- `getActiveChartStrategyOptions()` already exists in both HTMLs (added by feature 008 / 014's strategy-threading work) and is the canonical source of truth for "which strategy is the chart rendering right now". This feature does not invent a new helper.
- The stop-gap (FR-007 to FR-009) is acceptable for one release because the user explicitly requested it as a band-aid alongside the spec-driven full fix. Once the full fix lands in the same branch, the stop-gap becomes inert; we keep the code in place rather than ripping it out so future strategies that someone adds without threading don't reintroduce the bug.
- `signedLifecycleEndBalance` is a Node-importable pure function in `calc/`; injecting strategy options does not change its purity contract (Constitution Principle II).
- No new translation strings are required — the verdict pill text reuses existing `i18n` keys (`fire.behind.long-timeline`, `fire.behind.short-by-X`, etc.).
- Constitution Principles I-VI apply unchanged; expect a `Constitution Check: PASS` in `plan.md`. No `Complexity Tracking` entries anticipated.

## Out of Scope

- Modifying the FIRE Number formula (`terminalBuffer × annualSpend`) — that formula is already mode-aware and works correctly. Different FIRE Numbers across Exact / DWZ modes are intended behavior, not a bug.
- Visual chart rendering — already strategy-aware via feature 008/014/027 work. No chart code changes.
- Adding new withdrawal strategies. Strategy registry stays at 8.
- Refactoring the strategy router itself. We thread, we don't rewrite.
- Changes to `accumulateToFire` (pre-FIRE accumulation phase). Strategy selection only affects the post-FIRE retirement loop.
- Changes to `findFireAgeNumerical` legacy path beyond what's needed for parity with the resolver — the resolver is the canonical search; the legacy is a fallback.

## Predecessor & Class-of-Bug Reference

- **Predecessor**: feature 027 (aggressive-bracket-fill), merged to main 2026-05-07 via merge commit `a316ed1`. Introduced the new strategy without extending the signed simulator.
- **Class-of-bug doc**: CLAUDE.md "Process Lessons / FIRE-mode gates MUST evaluate the displayed strategy" — the rule was earned through feature 014's incident and is being re-applied here. This feature's tests should be added to the regression set so the rule is enforced for any future strategy additions.
