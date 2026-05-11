# Implementation Plan: Strategy-Aware FIRE-Age Resolver + Verdict-Pill Stop-Gap

**Branch**: `028-strategy-aware-fire-age` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-strategy-aware-fire-age/spec.md`

## Summary

The verdict pill ("On Track — FIRE in N years M months") and the FIRE-age resolver currently evaluate `signedLifecycleEndBalance`, which is hard-coded to the bracket-fill default strategy. The chart, however, renders `projectFullLifecycle` with the active winner from `_lastStrategyResults` (or the hovered preview). When feature 027 (`aggressive-bracket-fill`) becomes the winner, the two simulators disagree at the same fire age and mode, producing a misleading green "On Track" pill while the chart shows depletion.

Two-layer fix in this branch (in this order):

1. **Stop-gap (US1, FR-007 to FR-009).** A small guard in `renderFireStatus()` (and equivalent in Generic) compares the chart's actual end-balance against the resolver verdict. When the active winner is non-default AND chart says infeasible while resolver says feasible, the pill is forced to the infeasible state. Keeps the user out of the misleading state immediately.
2. **Root-cause fix (US2, FR-001 to FR-006).** Extend `simulateRetirementOnlySigned` (and its caller `signedLifecycleEndBalance`) to accept `options.strategyOverride` and `options.thetaOverride`. Both HTMLs' wrappers around `findEarliestFeasibleAge` thread the active strategy via `getActiveChartStrategyOptions()`. After this lands, the two simulators agree by construction and the stop-gap becomes inert (kept in place as a safety net).

US3 (audit visibility) is a small extension to the existing `crossValidationWarnings` shape; lands alongside the root-cause fix.

## Technical Context

**Language/Version**: JavaScript ES2020 (browser-side via `<script>` tags + Node ≥18 for unit tests).
**Primary Dependencies**: Chart.js v4 (CDN; not touched). No new dependencies.
**Storage**: N/A. No persisted state changes; this is calc-layer + a CSS-class swap on the pill.
**Testing**: Node `--test` runner (existing `tests/unit/*.test.js`). Playwright (existing `tests/e2e/*.spec.ts`).
**Target Platform**: Modern browsers (Chrome 110+, Firefox 110+, Safari 16+) opened via HTTP **and** `file://` per Constitution Principle V.
**Project Type**: Single-file HTML application (two parallel files in lockstep per Principle I).
**Performance Goals**: No regression. The resolver currently runs Stage 1 linear scan (`O(endAge − currentAge)` ≈ 60 iterations); strategy-aware simulation per iteration is `O(endAge − fireAge)` ≈ 50 iterations of the same withdrawal step the chart already runs once. Net: roughly 50× more withdrawal-step calls per recalc, all in JavaScript-bound time, all run on input change. Profile target: total recalc ≤ 200 ms on a mid-range laptop (no observable lag added).
**Constraints**:
- Calc modules MUST remain UMD-classic-script loadable (Principle V).
- Both HTMLs MUST land in lockstep (Principle I).
- No new translation strings — existing pill keys reused (Principle VII).
- Spending-Funded-First (Principle VIII) MUST stay intact: the strategy-aware sim ALREADY honors the spending floor inside `taxOptimizedWithdrawal` / strategy router, so threading the strategy through preserves the floor pass automatically.
**Scale/Scope**: ~50–80 LoC of inline-HTML calc changes per file × 2 files + `fireAgeResolver.js` Stage 1/2 docs touch-up + 2-3 new unit test files (~150 LoC) + 1 new E2E spec (~80 LoC).

## Constitution Check

*Gate: must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.2.0 has 9 principles. Each evaluated below.

- **I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)** — PASS. FR-012 mandates both files. Both `simulateRetirementOnlySigned` definitions (RR `FIRE-Dashboard.html:9606`, Generic equivalent) updated identically. Both pill-render paths receive the same stop-gap guard. Translation Catalog untouched (no new strings).
- **II. Pure Calculation Modules with Declared Contracts** — PASS. The added `options.strategyOverride` and `options.thetaOverride` parameters are documented in the function header and in the contract file under `contracts/signed-sim-options.contract.md`. The signed sim remains pure (no DOM, no globals). The audit's flow diagram already lists "Lifecycle Projection → taxOptimizedWithdrawal → strategy router"; no flow-diagram change needed.
- **III. Single Source of Truth for Interactive State** — PASS. The strategy resolution is centralized in the existing `getActiveChartStrategyOptions()` helper. After this feature, the chart, the resolver, and the verdict pill all consume from that single source.
- **IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)** — PASS. New tests:
  - `tests/unit/signedSimStrategyOptions.test.js` — pin signed-sim end balance == projectFullLifecycle end balance for each of 8 strategies × 3 modes.
  - `tests/unit/fireAgeResolverStrategyAware.test.js` — pin SC-027 reproducer to `feasible: false` under DWZ + aggressive-bracket-fill.
  - Strategy Matrix coverage already exists per Principle IV's v1.2.0 amendment; this feature adds resolver-layer tests, complementing strategy-layer ones.
- **V. Zero-Build, Zero-Dependency Delivery** — PASS. No new dependency. No build step. The new options in `simulateRetirementOnlySigned` are plain function parameters; the strategy router it dispatches into is already inline in both HTMLs and works under `file://`.
- **VI. Explicit Chart ↔ Module Contracts** — PASS. The new contract file `contracts/signed-sim-options.contract.md` documents inputs, outputs, and consumers. Verdict pill and resolver added to the consumers list.
- **VII. Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE)** — PASS. No new user-visible strings. The infeasible pill states (`fire.behind.long-timeline`, `fire.behind.short-by-X`, etc.) are already bilingual.
- **VIII. Spending Funded First (NON-NEGOTIABLE)** — PASS. The strategy-aware sim dispatches into the SAME `taxOptimizedWithdrawal` / strategy-router path the chart uses, which already enforces the spending-floor pass. Threading the strategy preserves the floor by construction; no separate work needed.
- **IX. Mode and Objective are Orthogonal** — PASS. This feature does not touch `getActiveSortKey`, `rankByObjective`, or `scoreAndRank`. Mode (Safe/Exact/DWZ) continues to filter in the resolver; Objective (Preserve / Min Tax) continues to sort in the ranker. The fix preserves orthogonality and actually restores Mode's selectivity, which had collapsed because every mode was evaluated against the same bracket-fill sim.

**Verdict: PASS. No `Complexity Tracking` entries required.** All nine principles either unaffected or directly satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/028-strategy-aware-fire-age/
├── plan.md                                # This file
├── research.md                            # Phase 0 — strategy-router reuse decision + perf budget
├── data-model.md                          # Phase 1 — sim options shape + crossValidationWarnings extension
├── quickstart.md                          # Phase 1 — repro & verification recipe
├── contracts/
│   └── signed-sim-options.contract.md     # Phase 1 — Inputs/Outputs/Consumers for the extended sim
├── checklists/
│   └── requirements.md                    # /speckit-specify deliverable (already created)
└── tasks.md                               # Phase 2 — produced by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
calc/
├── fireAgeResolver.js          # Resolver (already mode-aware; will gain strategy passthrough docs)
└── (no new module — inline sim stays inline per current architecture)

FIRE-Dashboard.html             # RR — modify simulateRetirementOnlySigned, signedLifecycleEndBalance,
                                #      renderFireStatus pill stop-gap, and the
                                #      findEarliestFeasibleAge wrapper
FIRE-Dashboard-Generic.html     # Generic — same edits in lockstep

tests/unit/
├── signedSimStrategyOptions.test.js        # NEW — pin sim parity vs projectFullLifecycle
├── fireAgeResolverStrategyAware.test.js    # NEW — pin SC-027 reproducer to feasible=false

tests/e2e/
└── strategy-aware-pill.spec.ts             # NEW — drives SC-027 reproducer in both HTMLs
```

**Structure Decision**: Single-file HTML app with parallel calc modules under `calc/`. The `simulateRetirementOnlySigned` implementation lives inline in both HTMLs (it depends on inline helpers like `getSSAnnual`, `getMortgageAdjustedRetirement`, `getSelectedRelocationCost` that are also inline). Extracting it to a Node-importable module would balloon the diff and is explicitly out of scope. Tests use the established pattern of stubbing minimal `inp` shapes and injecting the inline helpers as mocks (same approach as `tests/unit/withdrawal.test.js`).

## Phase 0 — Research

See `research.md`.

Topics resolved:

1. **Reuse vs duplicate strategy router.** Decision: reuse via dispatch from inside `simulateRetirementOnlySigned`. Rationale: principle of single source.
2. **Performance budget.** Decision: accept 50× withdrawal-step calls per recalc. Profile-budget target ≤ 200 ms total recalc; if exceeded, fall back to caching the per-strategy end balance after the strategy ranker has already computed it.
3. **Stop-gap detection signal.** Decision: compare `chartLastEndBalance` (already published by the lifecycle render path) vs `resolverFeasible` boolean from the latest resolver run.

No `[NEEDS CLARIFICATION]` markers remain.

## Phase 1 — Design Outputs

### `contracts/signed-sim-options.contract.md`

Documents the new options shape on `simulateRetirementOnlySigned` and `signedLifecycleEndBalance`:

```text
options: {
  strategyOverride?: string,    // e.g. 'aggressive-bracket-fill', 'tax-optimized-search'
  thetaOverride?: number,       // 0..1 — only meaningful when strategyOverride === 'tax-optimized-search'
}
```

Resolution order (matches `getActiveChartStrategyOptions()`):
`_previewStrategyId` → `_lastStrategyResults.winnerId` → `undefined` (default = bracket-fill).

Backwards compatibility: when both fields absent, behavior is identical to current (bracket-fill default), and all 493 existing tests continue to pass.

### `data-model.md`

Two pure-data shape changes:

1. **`simulateRetirementOnlySigned` signature** — adds optional `options` param.
2. **`crossValidationWarnings` entry** — adds `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance`, `delta` fields (extending current `kind`, `valueA`, `valueB`, `delta`, `reason`).

No new entities, no new persisted state, no new translation strings.

### `quickstart.md`

Step-by-step reproducer + verification recipe for the SC-027 case so any QA agent (or future you) can reproduce the bug, apply the fix, and verify the pill flips from "On Track" to "Behind / Short by $229,755".

### Agent context update

`CLAUDE.md` already references the active feature. After this plan completes, the `**Active feature**` line in `CLAUDE.md` will be updated to point at `028-strategy-aware-fire-age` with status `PLAN COMPLETE — TASKS PENDING`.

## Re-evaluate Constitution Check (post-design)

Re-walking all 9 principles after Phase 1 design:

- **I, II, III, IV, V, VI, VII, VIII, IX** — all still PASS.
- The contract file design (Phase 1) does not introduce a new module or principle violation; it extends an existing inline function with optional parameters and registers two new test files.
- No `Complexity Tracking` entries needed.

## Complexity Tracking

> Empty by design. No constitutional violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

---

**Plan complete.** Phase 0 (`research.md`) and Phase 1 outputs (`data-model.md`, `contracts/signed-sim-options.contract.md`, `quickstart.md`) are produced as siblings of this file. Run `/speckit-tasks` next to break this into actionable tasks.
