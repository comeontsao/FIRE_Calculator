# Implementation Plan: Comprehensive Validation Audit + Cash-Flow Rewrite

**Branch**: `020-validation-audit` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-validation-audit/spec.md`

## Summary

Feature 020 is a two-headed effort that ships in one branch:

1. **Cash-flow calc engine rewrite** (User Story 4, FR-015 / FR-015.1–6): replace today's "monthlySavings × 12 → all stocks" model with the user's common-sense personal-finance accounting: `salary − tax − spending − 401k − stockContrib = cash`. Cash pool now grows year-over-year by an explicit residual, surfaced as a Plan-tab input with override toggle and a non-blocking warning when residual goes negative.

2. **Comprehensive validation audit** (User Stories 1–3, 5; FR-001–014, FR-018–023): build a parameterized Node-only test framework that runs five invariant families (mode ordering, end-state validity, cross-chart consistency, cash-flow accounting, drag invariants) across a persona matrix of ≤200 cells covering both dashboards, both adultCount values, three countries, three spend levels, three income levels, multiple mortgage states, and the full strategy × mode × age product. Findings drive bug fixes on the same branch.

Plus two cross-cutting deliverables: month-precision FIRE-age resolver with "X Years Y Months" header display (User Story 4c, FR-010.1 / 010.2) and a research-only withdrawal-strategy survey (User Story 6, FR-023).

The technical approach treats the cash-flow rewrite as the foundation: it ships first (Phase 2) so the audit (Phases 6–7) runs against the corrected calc rather than a moving target. Month-precision and UI changes (Phases 3–5) interleave between them.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2017+, no transpile). Calc modules use UMD-classic-script pattern per Constitution Principle V.
**Primary Dependencies**: Chart.js (CDN, browser-only). No runtime npm dependencies. Node ≥18 for `node:test` (test-only).
**Storage**: `localStorage` for user inputs (key schema documented in CLAUDE.md). `FIRE-snapshots.csv` for append-only history. No server.
**Testing**: `node:test` for unit tests on extracted calc modules + sandbox-extracted HTML functions. Playwright for E2E. Test-only — never runtime.
**Target Platform**: Browser via `file://` (double-click) OR `http://`. Modern desktop browsers (Chrome / Edge / Safari current versions). Mobile-responsive layouts required.
**Project Type**: Two-file single-page application. Calc layer: ~20 Node-importable modules in `calc/`. UI layer: two HTMLs (`FIRE-Dashboard.html` RR + `FIRE-Dashboard-Generic.html` Generic).
**Performance Goals**: First chart render < 1s on mid-range laptop with cold cache (Constitution Principle V performance floor). FIRE-marker drag ≥ 30fps. Full validation audit matrix (≤200 cells × 5 invariant families) completes in under 5 minutes (SC-001).
**Constraints**: Zero build step, zero new runtime dependencies, file://-compatible. Lockstep RR + Generic for every code change (Principle I). All 379 existing unit tests must remain green except cash-flow-impacted fixture deltas (FR-026).
**Scale/Scope**: ~17,000 lines per HTML × 2 = ~34,000 lines of UI/inline-calc code. ~3,000 lines across `calc/*.js` modules. ~12,000 lines of existing tests across 41 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluation against `.specify/memory/constitution.md` v1.2.0 — all 9 principles:

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Dual-Dashboard Lockstep | ✅ PASS | Phases 2–5 explicitly require lockstep RR + Generic. The new Plan-tab input (FR-015.5) ships in both files in the same change set. |
| II | Pure Calculation Modules with Declared Contracts | ✅ PASS | Cash-flow rewrite extends `calc/accumulateToFire.js` while preserving its purity (no DOM, no globals). New `perYearRows` fields added to the contract header. Audit-observability sub-requirement satisfied: the new audit-dump fields surface the cash-flow per year so users can trace anomalies (II.4). |
| III | Single Source of Truth for Interactive State | ✅ PASS | The cash-flow override input lives in localStorage like other shared inputs; the calc reads it via the unified `inp` object. No parallel re-derivation. |
| IV | Gold-Standard Regression Coverage | ✅ PASS | Phase 6 builds the persona matrix (≤200 cells). Phase 7 adds 5 invariant test families. The cash-flow rewrite includes ≥10 dedicated unit tests in Phase 2. Strategy Matrix coverage preserved — no new strategies in this feature. |
| V | Zero-Build, Zero-Dependency Delivery | ✅ PASS | No new dependencies. No build step. `accumulateToFire.js` already follows UMD-classic-script pattern; cash-flow extension keeps it compatible with `file://`. |
| VI | Explicit Chart ↔ Module Contracts | ✅ PASS | Cash-flow chart in the Lifecycle visualization gains a new field. The `accumulateToFire.js` `Consumers:` list is updated to reflect new chart consumption. |
| VII | Bilingual First-Class — EN + zh-TW | ✅ PASS | Phases 4 (header months) and 5 (cash-flow input + warning) explicitly include zh-TW translations. Translation Catalog updated in the same commit as code. |
| VIII | Spending Funded First | ⚠️ VERIFY | The cash-flow rewrite must NOT alter the retirement-phase withdrawal logic (where Spending Funded First applies). The accumulation-phase changes are upstream of the spending-floor pass and therefore non-conflicting, BUT Phase 2 must include a regression test asserting `tests/unit/spendingFloorPass.test.js` continues to pass post-rewrite. |
| IX | Mode and Objective are Orthogonal | ✅ PASS | No changes to `getActiveSortKey`, `scoreAndRank`, or `rankByObjective`. The audit's mode-ordering invariants (FR-005, FR-006) actively *verify* the orthogonality is preserved. |

**Constitution Check verdict: PASS with one VERIFY (VIII)**. The verification is a Phase 2 acceptance criterion (run existing spending-floor regression after the cash-flow rewrite); not a blocker.

No principle violations require justification. Complexity Tracking section is empty (omitted).

## Project Structure

### Documentation (this feature)

```text
specs/020-validation-audit/
├── plan.md                          # This file (/speckit-plan output)
├── spec.md                          # User-facing requirements (existing)
├── checklists/
│   └── requirements.md              # Spec quality checklist (existing)
├── research.md                      # Phase 0 — cash-flow accounting research
├── data-model.md                    # Phase 1 — entities (Persona, Invariant, Finding, etc.)
├── quickstart.md                    # Phase 1 — how to run the audit
├── contracts/
│   ├── accumulate-to-fire-v2.contract.md         # cash-flow rewrite contract
│   ├── month-precision-resolver.contract.md      # FIRE-age resolver contract
│   └── validation-audit-harness.contract.md      # persona + invariant types
├── cashflow-research.md             # Phase 1 deliverable per FR-015.3 (research summary)
├── audit-report.md                  # Phase 8 deliverable — findings list
├── withdrawal-strategy-survey.md    # Phase 8 deliverable per FR-023
├── tasks.md                         # Phase 2 output (/speckit-tasks command)
└── CLOSEOUT.md                      # Phase 9 deliverable
```

### Source Code (repository root)

```text
calc/
├── accumulateToFire.js              # EXTENDED in Phase 2 (cash-flow rewrite)
├── fireAgeResolver.js               # NEW in Phase 3 (month-precision wrapper)
└── ...                              # other modules unchanged

FIRE-Dashboard.html                  # RR — modified in Phases 2, 3, 4, 5 (lockstep)
FIRE-Dashboard-Generic.html          # Generic — modified in Phases 2, 3, 4, 5 (lockstep)
FIRE-Dashboard Translation Catalog.md  # i18n — updated in Phases 4 + 5

tests/unit/
├── accumulateToFire.test.js         # EXTENDED in Phase 2 (≥10 new cases)
├── validation-audit/                # NEW in Phase 6
│   ├── personas.js                  # persona matrix fixture (≤200 cells)
│   ├── harness.js                   # parameterized test runner
│   ├── findings.js                  # finding accumulator + reporter
│   ├── mode-ordering.test.js        # invariants A1, A2
│   ├── end-state-validity.test.js   # invariants B1, B2, B3
│   ├── cross-chart-consistency.test.js  # invariants C1, C2, C3
│   ├── cashflow-accounting.test.js  # invariants D1, D2, D3
│   └── drag-invariants.test.js      # invariants E1, E2, E3
├── monthPrecisionResolver.test.js   # NEW in Phase 3
└── ...                              # all other existing tests preserved
```

**Structure Decision**: existing `calc/` + `tests/unit/` + dual-HTML structure. The new `tests/unit/validation-audit/` subdirectory keeps the parameterized audit tests visible alongside existing tests but in their own namespace so future features can extend them without bloating the existing test files.

## Phasing & Risks

### Phase 0 — Research (1 day, blocks Phase 2)

Per FR-015.3, validate the proposed cash-flow accounting model against ≥3 authoritative personal-finance sources. Output: `cashflow-research.md`.

Sources to consult:
- **Bogleheads wiki** (canonical for retiree-investor consensus on accumulation accounting)
- **Investopedia** (industry-standard definitions: gross income, AGI, take-home, savings rate)
- **Mr. Money Mustache** / **The Mad Fientist** / **Early Retirement Now** (FIRE-community-specific savings-rate formulas)
- **Ramit Sethi's Conscious Spending Plan** (the "leftover after fixed costs + investments" model)
- **IRS Publication 17** for the canonical pre-tax 401(k) → AGI math (employer match is NOT taxable income at contribution; it's already excluded from gross W-2 in box 1)

If consensus differs from the spec's FR-015 formula, surface the difference and pause for user decision. No implementation in Phase 0.

**Risk:** my proposed formula `gross − tax − spending − 401k − stockContrib = cash` may have an arithmetic ambiguity around when `federalTax` is computed (on gross, or on gross minus pre-tax 401k?). The IRS reality is the latter — `taxableIncome = gross − pretax401k − stdDeduction − ...`. The research must confirm whether to use simplified `tax = grossIncome × taxRate` (current code) or refined `tax = (grossIncome − pretax401k) × taxRate`. Resolution pinned in research.md.

### Phase 1 — Design & Contracts (1 day)

1. **`data-model.md`** documents entities: Persona, Invariant, Finding, StrategyFitnessVerdict, plus the new accumulation-row fields (`grossIncome`, `federalTax`, `annualSpending`, `cashFlowToCash`).
2. **`contracts/accumulate-to-fire-v2.contract.md`** specifies the new function signature, all input fields, all output fields per row, conservation invariants, edge cases (negative residual, ageRoger == fireAge degenerate case).
3. **`contracts/month-precision-resolver.contract.md`** specifies `findEarliestFeasibleAge(inp, mode, options) → {years, months}` semantics, including the year-then-month two-stage search.
4. **`contracts/validation-audit-harness.contract.md`** specifies the persona type signature, invariant check function shape, and finding record format.
5. **`quickstart.md`** documents how to run the full audit: `node --test tests/unit/validation-audit/` plus how to extend the persona matrix for future features.
6. Update CLAUDE.md SPECKIT block to point at this plan.

### Phase 2 — Cash-flow calc rewrite (2-3 days)

Lockstep RR + Generic. Touch:
- `calc/accumulateToFire.js`: add per-year cash-flow tracking, new `perYearRows` fields (`grossIncome`, `federalTax`, `annualSpending`, `cashFlowToCash`, `stockContribution`), update `accumResult.end.pCash` to reflect accumulated cash flow.
- `calc/accumulateToFire.js` header docstring: updated `Inputs:` / `Outputs:` / `Consumers:` per Principle II.
- Both HTMLs `projectFullLifecycle`: replace the typeof-guarded fallback inline accumulation OR remove it (Step 2 of 019 left it as a safety net; the new model means the inline fallback would be wrong if the helper fails). Choice: REMOVE the inline fallback in Phase 2; the helper is the only allowed path. If `accumulateToFire` throws, the dashboard surfaces a console error and falls back to the legacy `monthlySavings → stocks` semantics for that single render — but logs the error loudly via `[projectFullLifecycle] accumulateToFire threw:` (CLAUDE.md Process Lessons shim defense-in-depth).
- Both HTMLs `_simulateStrategyLifetime`, `computeWithdrawalStrategy`, `signedLifecycleEndBalance`: already routed through the helper post-019; verify they pick up the new fields cleanly.
- Audit dump (`copyDebugInfo`): add the per-year cash-flow fields to `lifecycleProjection.rows`.
- `tests/unit/accumulateToFire.test.js`: ≥10 new cases covering income flow, conservation, negative-residual clamping, `pretax401k` tax treatment, employer-match accounting, single-mode (`adultCount=1`) cash flow, retirement-only flow (no income), edge cases.
- `tests/unit/spendingFloorPass.test.js`: re-run unchanged; assertions must still pass (Constitution Principle VIII verification).

**Risk #1 (CRITICAL):** every existing test that pins specific accumulation dollar values will fail with the new (correct) numbers. Approach: (a) after rewriting, run the full suite, (b) for each failing test, decide whether the failure reflects "old wrong → new right" (update fixture with `// 020:` comment) or "new logic broke something" (investigate). Time-box per failure: 30 minutes. If a fixture delta seems to violate intent, flag to user.

### Phase 3 — Month-precision FIRE-age resolver (1-2 days)

Lockstep RR + Generic. Touch:
- New file `calc/fireAgeResolver.js` (UMD pattern): exports `findEarliestFeasibleAge(inp, mode, options) → {years, months, totalMonths}`. Internally calls existing `isFireAgeFeasible(...)` for year-resolution, then linear scans 0–11 months at the year boundary.
- Both HTMLs: callers of `findEarliestFeasibleAge` (KPI cards, verdict pill, FIRE-marker default position) updated to consume `{years, months}` from the new return shape.
- `tests/unit/monthPrecisionResolver.test.js`: ≥6 cases covering boundary detection, edge cases (FIRE at currentAge, FIRE at endAge, infeasible scenarios returning sentinel).

**Risk #2 (MEDIUM):** month-precision may surface numerical instability near the boundary (e.g., feasibility flips back and forth across multiple months due to floating-point tax math). Approach: at the year boundary, use `feasibility(month) - feasibility(month-1)` as a discrete derivative; require monotonic flip (one transition only). If multi-flip detected, fall back to year-precision and log a warning.

### Phase 4 — Header UI: months display (1 day)

Lockstep RR + Generic. Touch:
- KPI card "Years to FIRE": render "X Years Y Months" instead of "X yrs".
- Verdict pill: "On Track — FIRE in X years Y months" (similarly for "Needs Optimization").
- `FIRE-Dashboard Translation Catalog.md`: new keys for the months format in EN + zh-TW.
- zh-TW format research: Traditional Chinese typically uses `年` and `個月` separators. Validate readability with the user before locking.

### Phase 5 — Cash-flow override input + negative warning (1 day)

Lockstep RR + Generic. Touch:
- Plan tab DOM: add input field "Annual cash flow to savings" with override toggle (mirroring `pviEffRateOverrideEnabled`).
- localStorage: persist `pviCashflowOverrideEnabled` and `pviCashflowOverride`.
- `accumulateToFire`: read override from `inp` (when toggle is on) instead of computing.
- Warning: per FR-015.6, render a non-blocking warning near the cash-flow display when calculated residual would be negative. Auto-clear when residual is positive.
- i18n: new keys for input label, tooltip, warning copy. EN + zh-TW lockstep.

### Phase 6 — Persona matrix + harness (2 days)

New `tests/unit/validation-audit/personas.js`:
- Single-dimension sweep: each persona varies one axis from RR baseline.
- Pair sweep: representative mortgage × country, country × adultCount, etc.
- Final cell count ≤ 200 (SC-001 budget).
- Each persona has a stable string ID for finding traceability.

New `tests/unit/validation-audit/harness.js`:
- Parameterized runner. For each (persona, invariant) pair, calls invariant's `check(persona)` function. Collects findings into structured array.
- Reuses sandbox-extraction patterns from `tests/unit/wCashSumRegression.test.js`, `tests/unit/strategies.test.js`.

New `tests/unit/validation-audit/findings.js`:
- Finding accumulator (in-memory + serializable to JSON).
- Reporter that produces the markdown table for `audit-report.md`.

### Phase 7 — Implement 5 invariant test files + run audit (2-3 days)

`mode-ordering.test.js`, `end-state-validity.test.js`, `cross-chart-consistency.test.js`, `cashflow-accounting.test.js`, `drag-invariants.test.js`: each implements the invariants listed in spec FR-005 through FR-021. Each file imports the harness and personas, defines its invariants as an array of `{id, description, severity, check}` objects, and runs them across the matrix.

Run the full audit. Capture findings. Most likely findings categories:
- A1 / A2 mode-ordering violations (if any) → CRITICAL
- B1 / B2 / B3 end-state violations → HIGH
- C1 cross-chart drift → HIGH (feature 019 fixed this for accumulation; retirement-phase may still drift)
- D1–D3 cash-flow accounting → MEDIUM (mostly verifies the rewrite)
- E1 / E2 / E3 drag invariants → MEDIUM (numerical stability)

### Phase 8 — Fix CRITICAL/HIGH findings + reports (2-3 days)

For each CRITICAL/HIGH finding:
1. Reproduce locally.
2. Code fix (lockstep RR + Generic if applicable).
3. Add a dedicated regression test (in addition to the parameterized harness catching it).
4. Re-run the full audit; finding's row in audit-report.md transitions to status `FIXED` with commit hash.

For each MEDIUM/LOW finding: documented decision (FIXED if trivial, DEFERRED with rationale if complex).

Write `audit-report.md` (full findings table) and `withdrawal-strategy-survey.md` (≥6 strategies with recommendations). The survey covers: 4% rule (Bengen/Trinity), VPW (Bogleheads), Guyton-Klinger guardrails, Bond tent, Bucket strategy, Dynamic spending, RMD-based withdrawal — each with definition, model-fit, recommendation.

### Phase 9 — Closeout + merge (0.5 day)

`CLOSEOUT.md`, `BACKLOG.md` update, CLAUDE.md flip pointer to "020 merged". Browser-smoke-by-user gate before merge. PR or direct merge per user preference.

## Risks & Mitigations Summary

1. **Cash-flow rewrite breaks existing test fixtures (HIGH probability).** Mitigation: dedicated time budget in Phase 2 for fixture review; comment every delta with `// 020: was $X, now $Y because <reason>`.
2. **Month-precision numerical instability (MEDIUM probability).** Mitigation: monotonic-flip check at year boundary; fall back to year-precision with warning if violated.
3. **Persona matrix size > 200 cells (LOW probability).** Mitigation: dimensional sweep first, pair sweep second, prune to budget.
4. **Browser smoke surfaces issues calc tests miss (MEDIUM probability).** Mitigation: Phase 8 ends with "ready for browser smoke", not "merged"; user is the gate.
5. **Constitution Principle VIII (spending floor) regression in retirement phase (LOW probability — not modifying retirement code).** Mitigation: Phase 2 acceptance criterion runs `tests/unit/spendingFloorPass.test.js`.

## Complexity Tracking

*No principle violations identified. This section is empty by design.*
