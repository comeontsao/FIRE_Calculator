# Implementation Plan: Withdrawal-Strategy Tax Investigation + Header-Zoom and FIRE-Month Display Fixes

**Branch**: `026-withdrawal-tax-and-ui-fixes` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-withdrawal-tax-and-ui-fixes/spec.md`

## Summary

Three independent items bundled because they all surface from the user's review pass after feature 025:

1. **US1 (P1) — verdict-pill months stuck at "1":** Diagnose-then-fix. Likely root cause is in the simulator pro-rate path (`simulateRetirementOnlySigned` at fractional `fireAge`) or the verdict-pill wiring to `_lastKpiSnapshot.fireAgeResult`. Resolver contract (`calc/fireAgeResolver.js`) is presumed structurally correct (8 unit tests pass) but in scope for the diagnosis.
2. **US2 (P1) — withdrawal-strategy tax-cliff investigation:** Pure research deliverable comparing "leave-more-behind" current trajectory vs. a "10%-bracket-smoothed" counterfactual on canonical fixture SC-026-A. Output is `research.md`. No calc-layer change ships in 026; algorithm changes (if any) defer to a follow-up spec.
3. **US3 (P2) — header zoom resilience:** CSS-only fix in both HTML files. Header must hold layout across 75–150% browser zoom on a 1920×1080 viewport in both EN and zh-TW.

**Technical approach.** US1: instrument the `_lastKpiSnapshot.fireAgeResult` path with a Node-runnable diagnostic that probes the resolver across an input sweep, then fix the smallest layer that exhibits the stuck-month pathology. US2: deterministic counterfactual simulation runnable from Node using existing calc modules (`calc/withdrawal.js`, `calc/simulateLifecycle.js`, `calc/strategyRanker.js`); produce `research.md` with tables. US3: CSS `clamp()` typography + flex-wrap for the header row, with explicit zoom-level QA matrix. All three items observe the project's "browser smoke before done" gate (Constitution-adjacent rule from CLAUDE.md).

## Technical Context

**Language/Version**: JavaScript (browser ES2020 baseline; Node 18+ for tests)
**Primary Dependencies**: Chart.js (CDN, no change); Playwright for E2E; Node built-ins for unit tests. No new runtime deps. No new build step.
**Storage**: N/A. The dashboard reads localStorage; no schema change in 026.
**Testing**: Existing harness — Node `node --test` for unit tests in `tests/unit/*.test.js`; Playwright in `tests/e2e/`. New regression tests added under `tests/unit/`. No new test framework.
**Target Platform**: Modern desktop browsers (Chrome / Edge / Firefox on Windows + Safari on macOS). Same target as the rest of the project. `file://` delivery (Constitution V) preserved.
**Project Type**: Single-file HTML web app with extracted calc modules under `calc/`. Two parallel HTML deliverables (`FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html`) per Constitution I.
**Performance Goals**: No regression on the existing 1-second first-render and 30 fps drag floor (Constitution Additional Constraints). The verdict-pill fix touches a single render path; the CSS fix is layout-only.
**Constraints**: Zero-build / zero-dependency (Constitution V). UMD-classic-script loading for any calc-module change. EN + zh-TW bilingual lockstep (Constitution VII). RR + Generic lockstep (Constitution I). file:// must keep working.
**Scale/Scope**: ~2 HTML files (≈ 7K lines each), ~25 calc modules, ~40 unit-test files. The 026 change touches at most 4 files: 2 HTML (verdict-pill + CSS), 1 calc module if diagnosis lands there (`calc/fireAgeResolver.js` or the in-HTML simulator), 1–2 new test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluation against `.specify/memory/constitution.md` v1.2.0:

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| I — Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | All three user stories explicitly require RR + Generic in lockstep (FR-014). |
| II — Pure Calculation Modules with Declared Contracts | ✅ | If US1 diagnosis lands a fix in calc/, it stays pure; if the fix is in the HTML's verdict-pill wiring, no calc module changes. US2 produces no calc change in 026. |
| III — Single Source of Truth for Interactive State | ✅ | US1 fix MUST consume the existing `_lastKpiSnapshot.fireAgeResult` capture rather than re-computing the resolver result independently. |
| IV — Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | New regression test added for "always-1-month" pathology (FR-005). US2 research includes deterministic fixture (SC-026-A). |
| V — Zero-Build, Zero-Dependency Delivery | ✅ | No new deps; if any calc module is touched, it stays UMD-classic-script. CSS fix uses native browser features. |
| VI — Explicit Chart ↔ Module Contracts | ✅ | US1 touches the verdict pill (KPI, not a Chart.js chart). US2 produces no chart change. US3 is CSS-only. No contract update needed. |
| VII — Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | ✅ | Verdict-pill copy already supports both languages (`verdict.fireInYearsMonths` + `dyn.fireInYears`). If US1 reveals a need for an integer-year copy switch, both translations exist. US3 CSS fix is language-agnostic. |
| VIII — Spending Funded First (NON-NEGOTIABLE) | ✅ | US2 counterfactual MUST respect the spending-floor pass (per FR-007). If the counterfactual ever forces shortfall, the report flags it as infeasible — same gate as the production calc. |
| IX — Mode and Objective are Orthogonal | ✅ | US2 fixes the "leave-more-behind" objective on Die-With-Zero mode. The investigation evaluates the existing `getActiveSortKey({mode: 'dieWithZero', objective: 'leave-more-behind'})` chain; no orthogonality change. |

**Result: PASS.** No Complexity Tracking entries required.

Re-check after Phase 1 design appended at end of plan.

## Project Structure

### Documentation (this feature)

```text
specs/026-withdrawal-tax-and-ui-fixes/
├── plan.md                                # This file (/speckit-plan output)
├── spec.md                                # Feature spec (/speckit-specify)
├── research.md                            # Phase 0 — diagnosis + US2 investigation report
├── data-model.md                          # Phase 1 — entity shapes touched by 026
├── quickstart.md                          # Phase 1 — local repro + verification recipe
├── contracts/                             # Phase 1 — behavior contracts
│   ├── verdict-pill.contract.md           #   US1 — what the pill must display when
│   ├── withdrawal-counterfactual.contract.md  #   US2 — what research.md must produce
│   └── header-layout.contract.md          #   US3 — zoom matrix + DOM bounds
├── checklists/
│   └── requirements.md                    # Spec quality checklist (already passing)
└── tasks.md                               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
calc/                                       # PURE calculation modules (UMD-classic-script)
├── fireAgeResolver.js                     # In scope for US1 diagnosis (likely no change)
├── withdrawal.js                          # Read-only reference for US2 counterfactual
├── simulateLifecycle.js                   # Read-only reference for US2 counterfactual
├── strategyRanker.js                      # Read-only reference for US2 counterfactual
└── (others unchanged)

tests/
├── unit/
│   ├── monthPrecisionResolver.test.js     # Existing — must not regress (8 cases)
│   ├── fireAgeResolverSweep.test.js       # NEW (US1) — sweep-style "always 1 months" guard
│   └── (others unchanged)
├── e2e/
│   ├── verdict-pill-sweep.spec.js         # NEW (US1) — Playwright sweep of months
│   └── header-zoom-matrix.spec.js         # NEW (US3) — Playwright zoom 75/100/125/150%
└── fixtures/
    └── sc026a-counterfactual.js           # NEW (US2) — frozen SC-026-A inputs

FIRE-Dashboard.html                         # IN SCOPE (US1 verdict pill + US3 CSS)
FIRE-Dashboard-Generic.html                 # IN SCOPE (lockstep)
FIRE-Dashboard Translation Catalog.md       # POSSIBLY in scope (only if US1 needs new copy)
```

**Structure Decision**: This feature uses the existing project layout. No new top-level directories. New files land in `tests/unit/`, `tests/e2e/`, `tests/fixtures/`, and the spec folder. The two HTML files are edited in lockstep. No `calc/` module is added; an existing module (most likely `fireAgeResolver.js` or the in-HTML simulator) is touched only if Phase 0 diagnosis (FR-001) implicates it.

## Phase 0: Outline & Research

**Output:** `research.md`

Three investigation tracks corresponding to the three user stories.

### Track A — US1 root-cause diagnosis (FR-001)

Question: *Why does the verdict pill always show "1 months"?*

Method:
1. Run a Node-side sweep of `findEarliestFeasibleAge` against the canonical RR inputs, varying monthly savings from $2,000 → $14,000 in $250 steps. Record `{years, months, totalMonths, searchMethod}` for each.
2. Hypothesis A — **Resolver bug:** if Step 1 shows `months` clustering at 1 across the sweep, the resolver itself is producing the stuck value. Drill into the Stage 2 monotonic-flip logic.
3. Hypothesis B — **Simulator pro-rate bug:** if Step 1 shows `months` varying as expected on Node, but the dashboard still pins 1, the in-HTML simulator at fractional `fireAge` differs from the calc-module simulator's pro-rate convention. The resolver's own header docs flag this risk explicitly (Edge Case 4 mitigation).
4. Hypothesis C — **Verdict-pill wiring bug:** if resolver returns `searchMethod === 'integer-year'` (year boundary IS the answer), the pill's gate `_useMonthVerdict` should switch to `dyn.fireInYears` — not append a stale "1 months". Inspect the gate at `FIRE-Dashboard.html:12950–12968` and the parallel block in Generic.
5. Hypothesis D — **Stale `_lastKpiSnapshot.fireAgeResult`:** the resolver runs once per recalc, but the snapshot is mutated only at full-recalc time. If the pill renders during a partial-update path (override drag, FIRE-mode switch), it could read a stale 1-month value from a prior input.

Deliverables in `research.md` Section 1:
- A table of `{input, years, months, searchMethod}` from the Node sweep.
- A clear identification: "the bug is in layer X" (resolver / simulator / verdict-wiring / staleness), with code citations.
- A recommended fix scope (≤ 1 calc module OR ≤ 1 HTML render block) with a paragraph of justification.

### Track B — US2 withdrawal-strategy tax investigation (FR-006)

Question: *Should the "leave-more-behind" strategy smooth some Trad-401k withdrawal into the 60–68 window to soak up the 0–10% bracket headroom?*

Method:
1. Define SC-026-A fixture frozen in `tests/fixtures/sc026a-counterfactual.js`.
2. Run the dashboard's current "leave-more-behind" sequencer against SC-026-A. Capture per-year `{age, traditional401kDraw, taxableLTCG, rothDraw, ssIncome, federalTax, effectiveTaxRate, bookValueRemaining, hasShortfall}` for ages 53–95.
3. Define the counterfactual: a "10%-bracket-smoothed" policy that, in each year of `[60, 68]` where current draw is below the top-of-10%-bracket headroom, draws additional Trad up to that headroom and reinvests the after-tax residual in taxable.
4. Run the counterfactual through the same simulator (`projectFullLifecycle` injection-style; the current calc layer supports this).
5. Compute deltas: `Δ totalLifetimeFederalTax`, `Δ terminalBookValue`, `Δ terminalPurchasingPower`. Compute at three real-return assumptions (3%, 5%, 7%).
6. Apply constraint checks (per FR-007): IRMAA (`tax.irmaaTier1Threshold`), ACA-PTC cliff (200% / 400% FPL — ages < 65 only), AMT, and the surviving-spouse single-filer bracket (one spouse dies in mid-70s; project the survivor's brackets).
7. Apply the spending-floor pass to the counterfactual (Constitution VIII). Counterfactuals that breach the floor are infeasible and discarded.
8. Recommend: `keep` / `change-spec-NNN` / `defer-with-reason`. Threshold: per SC-005, lifetime-tax delta ≥ $5K nominal at SC-026-A is required for `change-spec-NNN`.

Deliverables in `research.md` Section 2:
- SC-026-A fixture summary
- Per-year tables (current + counterfactual) at 5% real return
- Sensitivity table at 3% / 5% / 7% real
- Constraint-breach audit
- Recommendation block

### Track C — US3 zoom-resilient header CSS (FR-010)

Question: *What CSS technique fits the constitution and produces graceful 75–150% degradation?*

Method:
1. Inspect current header rules in both HTML files. Identify fixed-px values that don't scale with `rem`.
2. Survey three candidates:
   - **Option A — `clamp()` typography + min/max sizes** on title and pill. Uses native browser clamping; no JS.
   - **Option B — Container queries** (`@container`) on the header element. Modern browser support is good in 2026 but requires verifying Safari 16+ in scope.
   - **Option C — Pure flex-wrap with `min-width: 0`** to let the title shrink before wrapping.
3. Choose the simplest option that satisfies SC-006 / SC-007 / SC-008. Default to Option A unless a constraint blocks it.
4. Document the choice in `research.md` Section 3 with rationale and a "rejected alternatives" subsection.

Deliverables in `research.md` Section 3:
- Decision: chosen technique + 1-paragraph rationale.
- Rejected alternatives with reasons.
- Risk callouts (e.g., "container queries require X support").

**Output check:** `research.md` exists, all NEEDS-CLARIFICATION markers from spec are gone (the spec has none — none introduced here either).

## Phase 1: Design & Contracts

**Prerequisites:** Phase 0 research complete.

### 1. Entity shapes — `data-model.md`

Three entity blocks, all already implicit in the project:

- **FireAgeResult** — already shipped in `calc/fireAgeResolver.js`. The `data-model.md` entry restates the contract for clarity and adds an explicit acceptance rule for "when `searchMethod === 'integer-year'`, the consumer MUST NOT append a months suffix" (US1 fix anchor).
- **WithdrawalTrajectory** — per-year record produced by `simulateLifecycle.js` and consumed by the withdrawal chart. Restated for the SC-026-A counterfactual table.
- **HeaderLayoutBounds** — DOM contract: which elements are in the header row, what their bounding-rect bounds must be at each zoom level (per SC-006 / SC-007).

### 2. Behavior contracts — `contracts/`

Three contracts, one per user story:

- **`verdict-pill.contract.md`** (US1) — defines the rendering rule: given `_lastKpiSnapshot.fireAgeResult`, which copy template fires (`verdict.fireInYearsMonths` vs. `dyn.fireInYears`) and what arguments are passed. Includes the "≥ 4 distinct months across 25-step sweep" acceptance rule.
- **`withdrawal-counterfactual.contract.md`** (US2) — defines the structure of the research output: required sections, required data tables, the `keep` / `change-spec-NNN` / `defer-with-reason` decision schema, and the constraint checks that must run.
- **`header-layout.contract.md`** (US3) — defines the zoom-level bounds, the EN + zh-TW lockstep requirement, and the no-regression rule at 100% zoom.

### 3. Quickstart — `quickstart.md`

How to reproduce + verify each issue locally:

- **Reproduce US1:** open `FIRE-Dashboard.html`, sweep monthly savings, observe months stuck at 1.
- **Reproduce US2:** load SC-026-A fixture (script provided), inspect age-69 draw.
- **Reproduce US3:** open dashboard, browser-zoom to 125% / 150%, observe header overflow.
- **Verify after fix:** run `node --test tests/unit/fireAgeResolverSweep.test.js`; run `npx playwright test tests/e2e/verdict-pill-sweep.spec.js`; manually browser-smoke at 75 / 100 / 125 / 150% zoom on both HTML files in both languages.

### 4. Agent context update

Update the SPECKIT block in `CLAUDE.md` to point to this plan file.

**Output check:** `data-model.md`, `contracts/verdict-pill.contract.md`, `contracts/withdrawal-counterfactual.contract.md`, `contracts/header-layout.contract.md`, and `quickstart.md` all exist. `CLAUDE.md` SPECKIT block updated.

## Constitution Re-Check (post-design)

To be re-evaluated after Phase 1 artifacts are written. Expected result: same PASS as the pre-design check, with one possible addition:

- If Phase 0 Track A diagnosis identifies the bug in `calc/fireAgeResolver.js`, the fix MUST keep the module pure (Principle II) and UMD-classic-script (Principle V). The `Consumers:` list at the top of the file MUST be re-checked for accuracy in the same commit (Principle VI).

## Complexity Tracking

> **No constitution violations identified.** No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
