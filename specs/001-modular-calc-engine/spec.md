# Feature Specification: Modular Calc Engine

**Feature Branch**: `001-modular-calc-engine`
**Created**: 2026-04-19
**Status**: Draft
**Input**: User description: "Based on the April 2026 audit of the two FIRE dashboards, implement Recommendation A (fix the drag-propagation bug via a single source of truth for retirement/FIRE age) and Recommendation B (extract pure, contract-documented calculation modules that RR and Generic both consume)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dragging retirement age updates every dependent chart and KPI (Priority: P1)

A planner opens the dashboard, reviews their projection, and drags the retirement-age marker on the Full Portfolio Lifecycle chart to explore "what if I retire three years earlier?" During and after the drag, every chart, KPI card, verdict banner, and scenario-impact number that logically depends on retirement age updates together, telling one consistent story. An explicit reset control returns all views to the solver-calculated age.

**Why this priority**: This is the single highest-leverage fix from the audit. Today, dragging silently leaves the KPI cards, Timeline chart, Healthcare delta, Coast-FIRE check, and Mortgage verdict stale; changing any other input erases the drag. Fixing this alone removes a confusing and incorrect experience from the dashboard's primary interactive feature.

**Independent Test**: With the RR dashboard loaded, drag the FIRE marker from the calculated age X to age X − 3. Verify every metric labelled "at FIRE" or "years to FIRE" reflects X − 3. Repeat on the Generic dashboard and confirm identical behavior.

**Acceptance Scenarios**:

1. **Given** the dashboard has finished its initial calculation with calculated FIRE age X, **When** the user drags the FIRE marker, **Then** the Full Portfolio Lifecycle chart shows a live preview of the dragged age (marker position updates, preview band visible) **without yet** propagating to other charts or KPIs.
2. **Given** the user has released the drag at age X − 3, **When** the drag ends, **Then** an inline "Recalculate for retirement at age X − 3" confirm control appears adjacent to the Full Portfolio Lifecycle chart.
3. **Given** the confirm control is visible, **When** the user clicks confirm, **Then** the override becomes active and every chart depicting retirement timing (Full Portfolio Lifecycle, Lifetime Withdrawal / Roth Ladder, Portfolio Drawdown With-vs-Without SS, Timeline where present), every KPI ("Years to FIRE", "FIRE Net Worth", "Progress %"), every scenario or healthcare delta, every Coast-FIRE indicator, and the Mortgage verdict reflect FIRE age X − 3; a "Reset to calculated FIRE age" control becomes visible.
4. **Given** the confirm control is visible but unclicked, **When** the user dismisses it (clicks away, clicks cancel, or starts another drag), **Then** the lifecycle-chart preview reverts to the prior effective FIRE age and no downstream chart is affected.
5. **Given** an active confirmed override, **When** the user changes any non-retirement input that triggers recalculation (annual spend, return rate, scenario selection, portfolio values, mode, inflation, tax assumption, etc.), **Then** the override is wiped, the solver runs fresh, and all charts revert to the newly calculated FIRE age. The override is never preserved across a recalculation triggered by other inputs.
6. **Given** an active confirmed override, **When** the user clicks the "Reset to calculated FIRE age" control, **Then** the override clears and all charts return to the solver-calculated FIRE age.
7. **Given** the user confirms a dragged age the portfolio cannot sustain, **When** the override activates, **Then** the UI surfaces a clear infeasibility indicator (e.g., a warning badge and a changed banner color) rather than silently absorbing a negative balance into any single asset pool.
8. **Given** a user who has never interacted with the Full Portfolio Lifecycle chart, **When** they view the chart for the first time, **Then** a gentle, persistent affordance (hint label, draggable cursor, subtle pulse, or tooltip on hover) signals that the FIRE-age marker can be dragged.
9. **Given** a user has a confirmed override at age X − 3, **When** they toggle the solver mode between Safe / Exact / Die-with-Zero, **Then** the override age X − 3 is preserved in every chart and KPI; only the feasibility indicator re-evaluates under the new mode. The solver is NOT re-run fresh and the calculated FIRE age is NOT refreshed until the user explicitly clicks Reset.

---

### User Story 2 - Calc logic lives in pure modules with declared input/output contracts (Priority: P2)

A developer or auditor opening the code can answer two questions for any number on the screen: which module produced it, and which inputs that module consumed. Each calculation module opens with a fenced header declaring `Inputs`, `Outputs`, and `Consumers`, contains no DOM or Chart.js calls, and can be exercised by a unit test without loading either HTML file.

**Why this priority**: Principles II, IV, and VI of the constitution require this foundation. It is also the structural fix for the correctness bugs the audit flagged (real-vs-nominal mixing, silent shortfall absorption, off-by-one age risk, and the deterministic "Monte Carlo"). Without it, every future fix can re-introduce the same class of bug. The "three retirement phases" referenced throughout this spec (taxable-only → 401(k)-unlocked → SS-active) correspond to the `Phase` enum values `preUnlock → unlocked → ssActive` in `data-model.md §3` — see the glossary there for the full mapping.

**Independent Test**: Run the unit-test corpus in a command-line runner. All fixtures pass against the extracted modules with zero browser or DOM dependency. Open any module and confirm its header truthfully lists inputs, outputs, and consuming charts.

**Acceptance Scenarios**:

1. **Given** the lifecycle simulator module, **When** invoked with the canonical accumulation-only fixture, **Then** it returns a year-by-year projection array matching the locked fixture's expected values.
2. **Given** the FIRE solver module, **When** invoked with the canonical three-phase retirement fixture, **Then** it returns `{yearsToFire, fireAge, feasible, endBalance, balanceAtUnlock, balanceAtSS}` matching the fixture.
3. **Given** the source of any calc module, **When** searched for DOM references, Chart.js references, or reads of browser-only global state, **Then** no matches are found.
4. **Given** the source of any chart renderer, **When** searched for arithmetic on return-rate, spend, or portfolio-balance variables, **Then** no matches are found (all such arithmetic lives in modules; renderers only project module outputs onto Chart.js datasets).

---

### User Story 3 - RR and Generic consume the same calc engine, with a clear personal-data layer (Priority: P3)

Formulas, default parameters, module contracts, and event propagation are identical between RR and Generic. RR adds a thin personal-data adapter (Roger's and Rebecca's birthdates, Roger's actual SS earnings history, fixed kid college years for Janet and Ian) that feeds the shared modules; it does not fork the math. A parity fixture suite proves both dashboards produce identical headline numbers for identical canonical inputs.

**Why this priority**: Principle I's structural enforcement. Closes the drift the audit surfaced (`inp.ageRoger` vs `inp.agePerson1`, hardcoded kids, custom SS). Also corrects the audit-identified bug that Generic's FIRE solver today ignores the secondary person of a couple.

**Independent Test**: Given the parity fixture — a canonical set of inputs expressible in both RR and Generic — both dashboards produce identical values for `yearsToFire`, `fireAge`, lifecycle balances at age milestones (e.g., 55, 59.5, 62, 67, 85), and withdrawal-phase totals.

**Acceptance Scenarios**:

1. **Given** the shared canonical input fixture loaded into both dashboards via the parity test harness, **When** the calc engine runs, **Then** RR and Generic produce byte-identical headline outputs on every fixture-declared field.
2. **Given** a change to a formula in the shared calc module, **When** the unit test suite re-runs, **Then** both RR's and Generic's parity outputs reflect the change without any code edits to either HTML file's calc code.
3. **Given** Generic's two-person household inputs (primary and secondary person portfolios and earnings), **When** the FIRE solver runs, **Then** the secondary person's portfolio and earnings materially influence the result — concretely: doubling the secondary person's portfolio changes `yearsToFire`.

---

### User Story 4 - Chart-to-module annotations make dependencies self-documenting (Priority: P4)

Every chart renderer carries a header comment declaring which module(s) it consumes and which named output fields it reads. Every calc module's `Consumers` list names those charts. Any PR that changes a chart's data source or a module's output shape updates both sides.

**Why this priority**: Enables the "what breaks if I change this formula?" question to be answered in seconds rather than by file-wide tracing. Lower priority than P1–P3 because it delivers ongoing maintainability rather than immediate correctness, but still required for merge by the constitution.

**Independent Test**: Grep every chart render function — each has a header comment listing module name and read fields. Grep every calc module — each `Consumers` line names every chart that grep reveals as reading it.

**Acceptance Scenarios**:

1. **Given** any chart renderer, **When** its source is read, **Then** a header comment declares the module(s) consumed and the specific output field names used.
2. **Given** any calc module, **When** its `Consumers` list is read, **Then** every chart listed can be located in the codebase, and every chart that grep proves reads this module is listed.

---

### Edge Cases

- **Infeasible override:** user confirms a drag to an age the portfolio cannot sustain. UI must surface infeasibility explicitly; shortfall must never be silently absorbed into `pStocks` (audit finding).
- **Override + non-retirement input change:** the override is wiped as soon as any input triggers a recalculation. The user must re-drag and re-confirm to apply a new override against the updated inputs. (See FR-014.)
- **Override + solver-mode switch** (Safe / Exact / Die-with-Zero): the override is preserved; only the feasibility evaluation changes under the new mode. (See FR-015.)
- **Drag released without confirming:** lifecycle chart preview reverts; no downstream chart is affected. The override is activated only by the confirm control, never by the drag alone.
- **Drag then second drag before confirming:** the second drag supersedes the first; only one confirm control is shown at a time.
- **Parity drift:** RR introduces a field Generic does not have. The parity fixture convention must mark those fields as intentionally divergent rather than failing the test.
- **Fractional ages:** RR derives age from birthdate (fractional); Generic uses integer age inputs. Shared modules must define their age contract explicitly.
- **Silent shortfall:** today, negative pool balances in the withdrawal phase are pushed into `pStocks` without flagging. The extracted withdrawal module must represent shortfalls as a typed result.
- **Real-vs-nominal inconsistency:** accumulation uses real returns; healthcare and college deltas are applied as nominal. Extracted lifecycle module must declare which dimension each input is in and convert explicitly.
- **`fireAgeOverride` reset on `recalcAll()`:** today, any input change silently sets `fireAgeOverride = null`. Under the new design, this behavior is preserved — and made explicit by FR-014: an input-triggered recalc deliberately wipes any active override. The change is that the override is also only ever *set* through an explicit confirm click (not through a raw drag), so the wipe is no longer surprising.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001:** The system MUST resolve the effective FIRE age in exactly one place — a single `effectiveFireAge` resolver that combines the solver's calculated age and any active user override — and every chart, KPI, verdict banner, and derived delta MUST read from it.
- **FR-002:** When the user drags the FIRE marker on the Full Portfolio Lifecycle chart, every chart, KPI, verdict banner, and derived delta that depends on FIRE age MUST update within a single animation frame of the drag value changing, with no chart remaining stale during the drag.
- **FR-003 (consolidated with FR-020):** The system MUST provide an explicit, user-visible "Reset to calculated FIRE age" control. The control MUST be visible whenever an override is active (`chartState.state.source === 'override'`) and hidden otherwise. Clicking it clears the override and restores the solver-calculated value. FR-020 below was absorbed into this consolidated requirement.
- **FR-004:** The system MUST surface infeasibility of a FIRE age (dragged or solved) through a visible indicator rather than silently absorbing negative portfolio balances into any asset pool.
- **FR-005:** All FIRE calculation logic — years-to-FIRE solving; lifecycle simulation across accumulation and the three retirement phases (taxable-only, 401(k)-unlocked, SS-active); withdrawal strategy; tax-aware withdrawal; Social Security projection; healthcare delta; mortgage adjustment; college-cost adjustment; inflation handling — MUST live in modules that are pure (no DOM access, no Chart.js calls, no reads of browser-global mutable state).
- **FR-006:** Each calc module MUST begin with a fenced header declaring `Inputs`, `Outputs`, and `Consumers` in a consistent machine-grep-able convention.
- **FR-007:** Each calc module MUST be independently unit-testable without loading either HTML file in a browser.
- **FR-008:** A fixture corpus MUST exist covering at minimum: an accumulation-only case, a three-phase retirement case, a Coast-FIRE case, an infeasible case, and an RR↔Generic parity case. All fixtures MUST pass at merge time.
- **FR-009:** RR and Generic MUST share the same calc-module sources. RR MAY add a personal-data adapter layer that maps Roger/Rebecca's personal inputs into the shared module input contract; it MUST NOT fork formulas.
- **FR-010:** Generic's FIRE solver MUST include the secondary person's portfolio and earnings in its calculation, correcting the audit finding that the solver currently effectively runs as single-person for couples.
- **FR-011:** Every chart renderer MUST carry a header comment declaring which calc module(s) it consumes and which output field names it reads.
- **FR-012:** Each calc module's `Consumers` list MUST remain synchronized with the set of chart renderers that read it; divergence is a merge blocker.
- **FR-013:** The withdrawal-phase module MUST represent shortfalls as a typed result (e.g., `{feasible: false, deficit: ...}`) rather than silently pushing negative balances into any asset pool.
- **FR-014:** A drag of the FIRE marker MUST be treated as a preview only. The override becomes active only when the user clicks an explicit in-chart "Recalculate for retirement at age X" confirm control that appears after the drag ends. When any non-retirement input subsequently changes and triggers a recalculation, the active override MUST be cleared and the solver MUST re-run fresh. The override never persists across an input-triggered recalculation.
- **FR-015:** When the user switches solver mode (Safe / Exact / Die-with-Zero) while an override is active, the override MUST be preserved. The mode change only re-evaluates feasibility of the overridden age under the new mode; it MUST NOT clear the override or trigger a fresh solve that discards the override. Implementation: the mode-switch event MUST route through `chartState.revalidateFeasibilityAt(effectiveFireAge, feasible)` (which updates only `feasible`), NOT through the `recalcAll()` → `setCalculated()` path (which wipes overrides per FR-014).
- **FR-016:** The scope of calc extraction in this feature is **full extraction**: lifecycle, FIRE solver, `effectiveFireAge` resolver (chartState), withdrawal strategy, tax-aware withdrawal, Social Security projection, healthcare delta, mortgage adjustment, college-cost adjustment, and inflation handling — all MUST be modularized in this feature. Personal-data adapter layer (RR-only) is included. Monte Carlo remains out of scope (future feature, slotting into the same module skeleton).
- **FR-017:** Real-vs-nominal dimension MUST be explicit at every module input and output. Inputs expressed in nominal dollars MUST be converted to real (or vice versa) at the module boundary, not implicitly.
- **FR-018:** The Full Portfolio Lifecycle chart MUST present an inline confirm control ("Recalculate for retirement at age X") after a drag gesture ends and an implied override is pending. The control MUST disappear when the override is applied (confirmed), cancelled (dismissed), or superseded by a new drag. Only one confirm control MAY be visible at any time.
- **FR-019:** The Full Portfolio Lifecycle chart MUST display a discoverable affordance indicating the retirement-age marker is draggable. The affordance is discoverable on first view without requiring the user to hover over the marker itself. Concretely, the implementation provides at least three layered cues: (1) a `cursor: grab` cursor on marker hover that switches to `cursor: grabbing` during drag; (2) a persistent italicized hint label ("drag me" or i18n-catalog equivalent) positioned near the marker; (3) a one-time 3-second subtle pulse animation on first page load per session. Layers may be tuned per future usability feedback, but all three MUST be present in the initial implementation.
- **FR-020:** *(Consolidated into FR-003 above to eliminate duplication; retained as a reference anchor so existing plan/task/contract cross-references continue to resolve.)*

### Key Entities *(include if feature involves data)*

- **EffectiveFireAge:** the single resolved value of the user's retirement age, computed once per recalc cycle from the solver's calculated age and any active override. Every dependent view reads this.
- **Lifecycle projection:** year-by-year portfolio simulation spanning accumulation + the three retirement phases. Has a pure input contract and a documented output array of per-year records.
- **FireSolverResult:** the typed output of the solver — `{yearsToFire, fireAge, feasible, endBalance, balanceAtUnlock, balanceAtSS}`.
- **WithdrawalResult:** typed output of the withdrawal module — `{feasible, perYear: [...], deficit?, shortfallPhase?}`.
- **FixtureCase:** canonical `{name, inputs, expected_outputs}` triplet driving unit tests and parity checks.
- **PersonalDataAdapter (RR-only):** thin layer that maps Roger/Rebecca's personal inputs (birthdates, real SS earnings history, fixed kid college years) into the shared module input contract.
- **ChartRenderContract:** the header declaration at the top of each chart renderer naming the module(s) and fields consumed; mirrored by the module's `Consumers` list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001:** Dragging the FIRE marker produces consistent updates on 100 % of retirement-age-dependent charts, KPIs, deltas, and verdicts. Baseline: audit identified ≥ 6 dependents stale during drag today. Target: zero stale dependents.
- **SC-002:** An independent reader can answer "which module produces this number and what are its inputs?" for any number displayed on the dashboard in under 30 seconds, by reading the chart's renderer comment and the module's header.
- **SC-003:** The unit-test corpus runs to green in under 10 seconds on a developer laptop, exercising at least the five constitution-mandated fixture cases plus five additional module-specific cases.
- **SC-004:** For any formula change committed to a shared calc module, RR and Generic produce identical parity-fixture output with zero additional code edits to either HTML file.
- **SC-005:** Generic's FIRE solver produces a measurably different `yearsToFire` for a two-person household versus the same household with the secondary person's portfolio set to zero, confirming the secondary person is wired into the calc. Today, doubling the secondary person's portfolio produces no change.
- **SC-006:** No chart renderer contains FIRE arithmetic: grep for return-rate, spend, or balance arithmetic inside any renderer function returns zero matches.
- **SC-007:** Lines-of-code diff ratio between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` on new-feature PRs approaches 1 : 1 — evidence that shared logic now lives in shared modules.
- **SC-008:** The confirm-to-override flow, override + input change (wipes override), and override + mode switch (preserves override) each produce predictable, documented behavior verified by acceptance scenarios and fixtures. 100 % of users in usability observation can locate the drag affordance without prompting.
- **SC-009:** After a confirmed override, any subsequent input change demonstrably clears the override in under one animation frame (verifiable by inspecting the `effectiveFireAge` resolver state before and after the input event).

## Assumptions

- **Zero-build, zero-dependency runtime preserved** (Constitution Principle V): modules may be split into fenced `<script>` blocks inside the HTML files during the transitional phase, or loaded via relative `<script src>` tags to plain `.js` files, but no bundler, transpiler, or framework is introduced.
- **Unit-test tooling is permitted** (Node-based, runs only in the developer environment) because it does not ship to end users.
- **Monte Carlo simulation is out of scope.** The audit noted that today's "Monte Carlo" is deterministic. A genuine stochastic engine will be specced separately once modules exist; this feature preserves the deterministic current behavior but behind a clean module boundary so a future Monte Carlo module can slot in.
- **CSV snapshot schema and `localStorage` migrations are out of scope here** (DB Engineer territory, separate feature).
- **i18n is scoped to new user-visible strings** introduced by this feature (e.g., the "Reset to calculated FIRE age" control label and the infeasibility indicator). Those MUST be added to `FIRE-Dashboard Translation Catalog.md`.
- **The April 2026 audit report (this session's analysis) is the authoritative source of defects this spec must fix.** If a later discovery surfaces an additional defect in the same calc surface, it MAY be folded into this feature at `/speckit-plan` time without a new spec.
- **Single-file-openable distribution preserved** even if modules are extracted to separate `.js` files: both HTML files, plus any sibling `.js` modules in the same directory, still work when opened via `file://` — no server required.
