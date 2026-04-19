# Feature 001-modular-calc-engine — Closeout (paused at `d080a7e`)

**Date**: 2026-04-19
**Final HEAD**: `d080a7e Revert "feat(U2B-4a): narrow solver swap onto canonical engine"`
**Branch**: `001-modular-calc-engine` (unmerged — decision pending)
**Runner status**: 76 tests / 75 pass / 0 fail / 1 skip

## What this feature delivered

### ✅ Shipped (US1 MVP — fully working in the dashboard today)

- **Single source of truth for retirement/FIRE age** (`calc/chartState.js`). Every chart, KPI, verdict, and derived delta now reads `effectiveFireAge` from one place. Drag/input/override all flow through one resolver.
- **Drag → confirm → reset flow** on the Full Portfolio Lifecycle chart. Dragging the FIRE marker now opens an inline confirm overlay; clicking it promotes the dragged age to the override; explicit Reset control clears it. Dragging alone is preview-only (no downstream charts update until confirm).
- **Mode-switch preserves override**. Toggling Safe / Exact / Die-with-Zero while an override is active now keeps the overridden age — only the feasibility banner re-evaluates. Implemented via `chartState.revalidateFeasibilityAt`.
- **Drag affordance** (cursor grab/grabbing + hint label + first-load pulse).
- **Infeasibility indicator** (red banner surfaces `chartState.state.feasible === false`).
- **Audit-identified bug fixes documented** but deferred to future HTML wire-up: real/nominal mixing, silent shortfall absorption, Generic-ignoring-secondary-person.

### ✅ Shipped (US2 calc engine — ready for wire-up)

- **Ten pure calc modules** under `calc/` with fenced `Inputs/Outputs/Consumers/Invariants/Purity` headers:
  `chartState`, `inflation`, `tax`, `withdrawal`, `socialSecurity`, `healthcare`, `mortgage` (ownership-mode aware), `college` (loan-financing overlay), `secondHome`, `studentLoan`, `lifecycle`, `fireCalculator`.
- **Contract discipline**: each module has a per-module contract doc in `contracts/`.
- **US2b parity extensions**: canonical Inputs models mortgage ownership modes, second home, student loans, contribution split, employer match, `taxTradRate`, `scenarioSpendReal`, `relocationCostReal`, `homeSaleAtFireReal`, `rentAlternativeReal`. LifecycleRecord carries `accessible`, `is401kUnlocked`, `mortgagePaymentReal`, `secondHomeCarryReal`, `collegeCostReal`, `studentLoanPaymentReal`, `oneTimeOutflowReal`, `effBalReal`, plus transitional aliases `p401kTradReal`/`p401kRothReal`.
- **effBal display layer** (`effBalReal` on every lifecycle record + `*EffReal` fields on FireSolverResult) — matches the inline engine's post-tax-drag presentation convention.

### ✅ Shipped (test infrastructure)

- **75 passing tests** across 22 test files (unit, meta, parity, baseline) in under 1 second.
- **Inline-engine Node harness** (`tests/baseline/inline-harness.mjs`) — reproduces the inline dashboard's `fireAge` and balance numbers without a browser. Regression oracle for future work.
- **Canonical fixtures with locked expected values**: `accumulation-only`, `three-phase-retirement`, `coast-fire`, `infeasible`, `rr-generic-parity`, `mode-switch-matrix`, `real-nominal-check`, `rr-realistic`, `generic-realistic`.
- **Meta-tests**: module-boundary purity check + fixture-shape validation.

### ✅ Shipped (design artifacts)

- **Constitution v1.0.0** with six non-negotiable principles.
- **Spec / plan / research / data-model / 10 contracts / quickstart / test-matrix / qa-audit / qa-session / baseline / CLOSEOUT** (this document).
- **Two tasks files**: `tasks.md` (original 77-task plan) and `tasks-us2b.md` (parity extension, 31 tasks).

## What's deferred

### ⏸ US2 HTML wire-up (TB22–TB25)

The canonical engine is **not yet wired into the two HTML dashboards**. Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` still compute FIRE age + lifecycle via their inline code (`projectFullLifecycle`, `findFireAgeNumerical`, etc.). US1 drag/confirm/reset works correctly in this hybrid state because it's driven by `chartState` which accepts `setCalculated` from whichever solver is live.

U2B-4a (narrow solver swap) was attempted and reverted (commit `d080a7e`). Cause: the swap passed all unit tests but broke the dashboards in the browser — the canonical engine threw when called with edge-case inputs from the HTML's default form values, and the glue layer's error handling left KPI cards frozen on "Calculating…". Unit tests cannot catch this class of failure; the team needs a **browser-side smoke test harness** before re-attempting the wire-up.

### ⏸ US3 (shared calc engine between RR and Generic)

Pending the HTML wire-up. Once both dashboards route through the canonical engine, RR's `personal-rr.js` adapter becomes meaningful and the parity fixture (`tests/fixtures/rr-generic-parity.js`) gains its regression value.

### ⏸ US4 (bidirectional chart↔module annotations)

Pending HTML wire-up. The meta-test `tests/meta/module-boundaries.test.js` already has check (c) implemented and skipped pending US4.

### ⏸ Baseline-identified audit bugs

Documented in `baseline-rr-inline.md §C` but remain latent in the inline engine (which is what the dashboard still runs):

- **§C.1** real/nominal mixing in healthcare/college overlays
- **§C.2** silent shortfall absorption
- **§C.3** Generic's FIRE solver ignoring the secondary person
- Deterministic "Monte Carlo" (out of scope, flagged for a future feature)

All three are FIXED in the canonical engine that's now sitting ready on disk.

## Known delta if the HTML wire-up resumes later

Documented in `baseline-rr-inline.md §C.5`. Canonical engine produces different numbers than inline on identical canonical inputs:

| Input | Inline | Canonical (with §C.3b contribution-split adapter) |
|---|---|---|
| RR fireAge | 54 | ~55–57 (+1 to +3 yrs from correctness fixes) |
| Generic fireAge | 65 | ~68–72 (+3 to +7 yrs from correctness fixes) |

Deltas come from:
- Correct real/nominal conversion in healthcare costs (genuine fix).
- Typed shortfall instead of silent absorption (genuine fix).
- Secondary-person portfolio sensitivity in Generic (genuine fix).

## How to resume

### Prerequisites before re-attempting HTML wire-up
1. **Build a Node-runnable HTML smoke test**. Simulate `getCanonicalInputs()` from the HTML's default form values; confirm `solveFireAge(canonical)` doesn't throw; assert sane output shapes. Without this gate, unit tests pass but browser breaks — the exact failure mode this revert documents.
2. **OR**: introduce Playwright (violates Principle V; requires explicit user approval and a constitution amendment).
3. Consider wrapping every canonical call in a `try/catch` inside the shim bodies, falling back to the existing inline implementation on error. Defense-in-depth is cheap insurance for this one-way swap.

### Resumption commit target
After the smoke-test harness lands, re-dispatch the narrow U2B-4a work (now guarded by the smoke test). Then U2B-4b (projectFullLifecycle swap with legacy-shape adapter for chart renderers), then U2B-4c (canonical-native renderer rewrite).

### Merge-to-main decision
This branch can be merged to `main` in its current state (`d080a7e`). The dashboards are fully working on the inline engine with the US1 MVP improvements visible. The calc modules under `calc/` ship as "prepared infrastructure" — loaded as ES modules but not yet authoritative for dashboard KPIs. Merging documents the investment so a future session picks up from `tasks-us2b.md` phase U2B-4 onward.

Alternatively, keep the branch open until you decide on Playwright / browser-smoke-test investment.

## Commits in this feature

```
d080a7e Revert "feat(U2B-4a): narrow solver swap onto canonical engine"
d167b22 feat(U2B-4a): narrow solver swap onto canonical engine  [REVERTED]
a448626 feat: add effBal display layer for inline-parity presentation
b37573d feat(TB17-TB21): extend lifecycle+fireCalculator to US2b parity
b6e7c54 feat(TB13-TB16): US2b leaf module extensions
92c3d05 test(TB04-TB12): US2b fixtures + RED test surface for parity modules
71fc830 test(TB02,TB03): automated inline-engine harness for baseline capture
83dbb2a docs(US2b): scope parity phase — data model, contracts, tasks, baseline
d5a949e feat(T024-T030): confirm overlay, reset, drag affordance, infeasibility banner, i18n
2257397 fix(US1): re-evaluate feasibility on confirmed override (QA R-A)
<qa-audit commit>  docs(T031): QA static audit and manual validation session for US1
899faa5 feat(T019-T023b): route HTML glue through chartState
a744a25 feat(T017-T018): chartState single source of truth for FIRE age
<Backend B commit> feat(T041-T044): extract socialSecurity, healthcare, mortgage, college modules
<Backend A commit> feat(T040,T045): extract tax and withdrawal calc modules
a7bd121 feat(T001-T016): scaffold calc/, tests/, inflation module, meta-tests
79ec922 docs: ratify constitution v1.0.0 and specify feature 001-modular-calc-engine
```

## Lessons recorded for future sessions

- Unit tests locked calc-module correctness but did NOT validate HTML integration. Next feature touching the HTML ↔ calc boundary needs a browser-equivalent smoke test BEFORE the work ships.
- When adopting "extract this calc" refactors, audit all callers of each legacy helper up front (the Frontend Engineer's audit caught this correctly AFTER the Manager's original dispatch had oversimplified — now codified as a required pre-step).
- The inline-harness pattern (`tests/baseline/inline-harness.mjs`) is reusable: any future effort that needs to "measure current inline behavior without Playwright" can copy this template.
