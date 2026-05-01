# Feature Specification: Comprehensive Validation Audit

**Feature Branch**: `020-validation-audit`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Build a deep validation audit of both dashboards (RR + Generic) that catches semantic bugs invisible to unit tests — bugs where the calc produces 'technically valid' numbers that violate user-expected invariants tying the dashboard's modes, strategies, charts, and cash-flow narrative together."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Mode ordering that matches user intuition (Priority: P1)

A FIRE Calculator user comparing the three retirement-readiness modes (Safe, Exact, Die-With-Zero) expects that more conservative modes demand later retirement ages. They expect the dashboard to enforce: **DWZ allows the earliest retirement, then Exact, then Safe (latest)**. When ordering inverts — e.g., Safe shows feasibility at age 55 while Exact is infeasible until age 56 — the user loses trust in the calculator entirely.

**Why this priority**: This is the foundational invariant that gates everything else. If mode ordering is wrong, every downstream metric is suspect. The audit must prove ordering is correct across the entire persona × age × strategy matrix; if it's wrong anywhere, the bug is fixed before the audit is considered complete.

**Independent Test**: Run a parametrized test that sweeps the persona matrix, calls the FIRE-age resolver for each of {Safe, Exact, DWZ}, and asserts `DWZ_age ≤ Exact_age ≤ Safe_age` for every cell. Failures produce a list of (persona, mode, age) tuples that contradicted the invariant.

**Acceptance Scenarios**:

1. **Given** the user's actual RR scenario (currentAge=42, spend=$72,700, mortgage buying-in with sell-at-fire, monthly savings $1,000), **When** the dashboard resolves the earliest feasible age for each mode, **Then** the resolved Safe age ≥ Exact age ≥ DWZ age, with strict inequality unless modes' constraints collapse on the same boundary year.
2. **Given** any persona in the validation matrix, **When** Mode A's constraints are a strict superset of Mode B's, **Then** Mode A's earliest feasible age ≥ Mode B's earliest feasible age.
3. **Given** a fixed FIRE age and any persona, **When** the FIRE NUMBER (total assets needed at FIRE) is computed for each mode, **Then** the values satisfy `DWZ_total ≤ Exact_total ≤ Safe_total`.

---

### User Story 2 — Mode end-state validity matches the chart (Priority: P1)

When the dashboard reports "Safe ✓" the user expects the lifecycle chart to show a portfolio that does NOT bleed toward zero by plan age. When it reports "Exact ✓" the end balance must clear `terminalBuffer × annualSpend`. When it reports "DWZ" the end balance must approximate $0 within a year-granular tolerance — not be wildly positive (over-saving misclassified as DWZ) and not be deeply negative (depleted years before plan age misclassified as DWZ).

**Why this priority**: This is the second foundational invariant. The verdict pill, the FIRE NUMBER card, and the visible chart trajectory must tell one consistent story. Today's dashboard sometimes reports "DWZ ✓" while the chart visibly depletes mid-retirement (years 70–100 below floor). That is the exact bug class the user has called out.

**Independent Test**: For each (persona, mode) cell where the dashboard reports `feasible: true`, run `projectFullLifecycle` and verify the chart trajectory satisfies the mode's end-state contract. Failures produce a list of cells where verdict and chart disagree.

**Acceptance Scenarios**:

1. **Given** Safe mode reports feasibility at age N, **When** the chart is rendered for that age, **Then** every retirement-year row's clamped total is ≥ the buffer floor AND the last row's total is ≥ 20% of the FIRE-year total.
2. **Given** Exact mode reports feasibility at age N, **When** the chart is rendered, **Then** the last row's total is ≥ `terminalBuffer × annualSpend`.
3. **Given** DWZ mode reports feasibility at age N, **When** the chart is rendered, **Then** the trajectory depletes within an acceptable tolerance window of plan age (the latest year where money runs out by plan age, NOT a year that depletes 10+ years too early NOR a year where money lasts forever).
4. **Given** DWZ mode reports feasibility at age N AND infeasibility at age N-1, **When** the user examines both charts, **Then** age N is the boundary year (depletes ≈ on plan age) and N-1 deplets significantly earlier.

---

### User Story 3 — Cross-chart consistency (Priority: P1)

When the user views the **Lifecycle chart** and the **Withdrawal Strategy chart** side by side, both must reflect the same underlying simulation. If the Lifecycle chart shows the portfolio drawing from cash in year Y, the Withdrawal Strategy chart's bar at year Y must show a cash component. If one chart shows zero cash and the other shows a cash withdrawal, the dashboard is internally contradicting itself.

**Why this priority**: Feature 019 fixed the **accumulation-phase** divergence between these charts. This audit must verify the **retirement-phase** divergence is also closed, and add a permanent regression net so future PRs cannot reintroduce it.

**Independent Test**: For each persona, run both simulators (Lifecycle and Withdrawal Strategy) at the same FIRE age and strategy. Diff the per-year `wTrad`, `wRoth`, `wStocks`, `wCash` arrays. Any non-zero diff is a finding.

**Acceptance Scenarios**:

1. **Given** the same persona, FIRE age, and active strategy, **When** the Lifecycle chart and Withdrawal Strategy chart are computed, **Then** their per-year withdrawal mix arrays match within $1.
2. **Given** the verdict pill says "Needs Optimization · X% there", **When** the Progress card is read, **Then** the Progress percentage agrees directionally (both above 100%, both below 100%, or both at 100%) — they MAY differ in computation method, but they must not point at contradictory conclusions.
3. **Given** the strategy ranker has chosen a winner, **When** the Lifecycle chart is rendered, **Then** the chart simulates that exact winner (same `strategyOverride` and `thetaOverride` threaded through). The audit MUST NOT find any `crossValidationWarnings.endBalance-mismatch` records under default operating conditions.

---

### User Story 4 — Cash-flow model rewrite to match common-sense accounting (Priority: P1)

A user looking at the dashboard sees their salary, taxes, spending, 401k contributions, and the input "Monthly Stock Contribution" (renamed from `monthlySavings`). They form a mental model: "salary − taxes − spending − 401k − stock contribution = leftover cash, which goes into my savings account." The dashboard MUST reflect this accounting literally: the cash pool grows year by year by exactly that residual.

User-confirmed model (Q2 from the clarification round):
> Monthly income from Salary − Monthly spending including tax, 401k contribution, etc. = monthly saving. Monthly saving − stock monthly contribution = Cash. Based on inflation, the spending will increase; based on salary increase rate, the salary will increase as well.

This requires a **calc engine rewrite** (option C from the original clarification): the accumulation loop in `accumulateToFire` must be extended to track salary, taxes, spending, contributions, and route the residual to the cash pool. The user pointed out that "common sense" personal-finance accounting differs from the dashboard's current model and that the implementation MUST be validated against authoritative sources (Bogleheads, Investopedia, etc.) — see FR-015.3.

**Why this priority**: Promoted to P1. This is a calc-engine change that affects EVERY accumulation simulation, not just an audit invariant. Without it, the accumulation totals are systematically too low (cash residual lost) and the chart's pre-FIRE trajectory under-counts wealth, which then affects every downstream metric.

**Independent Test**: For each persona with non-zero income and stock contribution where `salary − taxes − spending − 401k − stockContrib > 0`, verify the cash pool grows year-over-year by exactly that residual (within $1 floating-point tolerance). For personas where the residual would be negative (over-spending), verify the cash pool does NOT decrease (clamped at $0 negative inflow).

**Acceptance Scenarios**:

1. **Given** a persona with `annualIncome = $152,000`, `taxRate = 0.28`, `annualSpend = $72,700`, `monthlySavings (= stockContrib) = $1,000`, `contrib401k = $19,400 + $7,200 match`, **When** the accumulation runs for one year, **Then** the cash pool inflow that year ≈ `152000 − (152000 − 26600) × 0.28 − 72700 − 19400 − 12000 ≈ $12,768` (sanity-check arithmetic; exact formula per FR-015 step 6).

2. **Given** any persona, **When** the new calc completes accumulation, **Then** the conservation invariant holds: every dollar of gross income is accounted for as tax, spending, contribution, or pool growth — no money created or destroyed.

3. **Given** the user reads "Monthly Stock Contribution" tooltip, **When** they hover, **Then** the tooltip explains "Leftover salary after taxes, 401k, and spending automatically flows to your cash pool."

4. **Given** a persona where over-spending would produce negative cash flow (spending > salary − taxes − 401k − stock contrib), **When** accumulation runs, **Then** the cash pool stays at its prior balance (no phantom debt). The dashboard SHOULD warn the user that their spending exceeds available cash flow.

5. **Given** a persona with zero stock contribution and modest spending, **When** accumulation runs, **Then** all leftover income flows to cash, and the cash pool grows substantially over time — matching the intuition that not investing means saving as cash.

---

### User Story 4b — Original concern, now documentation-only (deprecated, see User Story 4)

This story was the original framing that asked between options (a) docs only / (b) UI split / (c) calc rewrite. The user picked option (c) which is now User Story 4 above. Keeping this header for traceability so future readers can see how Q2 evolved.

---

### User Story 4c — FIRE-age display in years AND months (Priority: P2)

The dashboard header currently shows "Years to FIRE: 13 yrs" or similar — year-precision only. The user wants "12 Years 7 Months" granularity in the header and verdict pill. This requires extending the FIRE-age resolver from year-precision to month-precision. The DWZ tolerance answer (Q1: A, strict at year level) makes month-precision especially relevant — DWZ's "boundary year" can now resolve to a specific month within that year, sharpening the verdict.

**Why this priority**: P2 because it's a UX clarity improvement, not a correctness fix. Month-precision aligns the header display with how people actually think about retirement timing ("I'll retire in 2 years 6 months" is more meaningful than "I'll retire in 2 yrs"). Adding it without the audit's calc fixes would be cosmetic; with the calc fixes, it makes the dashboard tighter end-to-end.

**Independent Test**: For each persona, compute the FIRE-age for each mode using the existing year-precision resolver, then refine to month-precision via fractional-year inner search. Assert the month-precision result rounds DOWN to the year-precision result (months are always between 0–11 within the resolved year). Header DOM displays the formatted "X Years Y Months" string in both EN and zh-TW.

**Acceptance Scenarios**:

1. **Given** the user's RR scenario where year-precision FIRE age is 53 (Exact mode), **When** month-precision is computed, **Then** the result is "10 Years M Months" for some `M ∈ {0, 1, ..., 11}` — interpretable as "the boundary month within year 53 where Exact's endBalance threshold is just met".

2. **Given** the FIRE marker is at age 55 (year-resolved), **When** the user reads the header, **Then** it displays "13 Years 0 Months" (boundary year exactly) or "12 Years 11 Months" (just before the boundary).

3. **Given** zh-TW is the active language, **When** the header is rendered, **Then** it displays the equivalent Traditional Chinese (e.g., `13 年 5 個月` or culturally appropriate format — see Translation Catalog for the chosen template).

---

### User Story 5 — Drag invariants behave intuitively (Priority: P2)

When the user drags the FIRE marker forward (delays retirement by one year), they expect the verdict to either improve or — for DWZ specifically — flip from "DWZ ✓" to "you'd over-save, this is now Exact territory". When they drag backward (retire one year earlier), the verdict should either degrade or stay at the same boundary. Tiny perturbations to inputs (±$1 to spend, ±1 day to age) should NOT cause the strategy ranker winner to flip unless on a true tie boundary.

**Why this priority**: P2 because while these invariants are user-visible, violations are usually annoying rather than show-stopping. Numerical instability in the ranker is the bigger concern within this story.

**Independent Test**: For each persona, sweep FIRE ages from `currentAge + 5` to `currentAge + 30` and record per-mode feasibility + per-strategy ranker winner. Assert monotonic feasibility within Safe and Exact modes (later age → still feasible). For DWZ, verify the boundary-year semantic. Inject ±0.01% perturbations to spend and age and verify the winner does not flip.

**Acceptance Scenarios**:

1. **Given** Safe is feasible at FIRE age N, **When** the FIRE age is dragged to N+1, **Then** Safe remains feasible at N+1 (strictly monotonic).
2. **Given** Exact is feasible at FIRE age N, **When** the FIRE age is dragged to N+1, **Then** Exact remains feasible at N+1.
3. **Given** DWZ is feasible at FIRE age N (boundary year), **When** the FIRE age is dragged to N+1, **Then** the verdict transitions to "Exact territory — over-saving" or equivalent, NOT silently reports "DWZ ✓" with a positive end balance.
4. **Given** any persona, **When** the spend input is perturbed by ±$1 (≈0.001% relative), **Then** the strategy ranker winner does NOT change.

---

### User Story 6 — Withdrawal strategy survey for future expansion (Priority: P3)

The user has asked whether additional withdrawal strategies (beyond the current 7) belong in the dashboard. This audit produces a survey document recommending which strategies to add in future features and which to skip, based on their fit with the FIRE Calculator's deterministic model and existing user value.

**Why this priority**: P3 because this is a research deliverable, not a blocking validation invariant. Recommendations inform future feature work but do not change today's correctness.

**Independent Test**: A markdown document that lists each candidate strategy, its definition, its compatibility with the dashboard's model, and a recommendation (implement now / defer / not applicable). Reviewable as a doc artifact.

**Acceptance Scenarios**:

1. **Given** the user wants to know whether the 4% rule, VPW, Guyton-Klinger, bucket strategy, dynamic spending, and RMD-based withdrawal should be added, **When** they read the survey doc, **Then** each strategy has a clear recommendation with rationale.
2. **Given** the survey recommends implementing a strategy in a future feature, **When** the recommendation is read, **Then** it includes a rough scoping note (data inputs needed, integration points, risks).

---

### Edge Cases

- **All-zeros persona**: persona with $0 starting assets, $0 income, $0 monthlySavings — every mode should report infeasible at every age; dashboard should not crash or display NaN.
- **Already-retired persona**: persona where `currentAge ≥ planAge` — accumulation skipped entirely; chart starts from currentAge; the FIRE-age resolver should clamp to currentAge.
- **Single-person mode with stale person2 data**: Generic dashboard with `adultCount=1` and non-zero `person2Stocks` (stale from a prior couple-mode session) — the calc must ignore person2Stocks (feature 009 contract); regression covered in feature 019 INV-09 + INV-10 tests.
- **Strategy that produces shortfall in every year**: a persona where every strategy depletes pre-FIRE — dashboard should display "no strategy is feasible at any age" rather than picking a least-bad winner silently.
- **FIRE age past unlockAge but before SS**: persona where `fireAge ∈ [60, ssClaimAge)` — Phase 1 (taxable-only bridge) collapses to zero years; Phase 2 immediately active. Calc must handle the degenerate phase.
- **Buy-in year exactly at fireAge**: mortgage `buyInYears` such that the purchase event falls on the FIRE-year boundary — buy-in handled in accumulation OR retirement, not both, not neither.
- **Plan age beyond actuarial reasonable**: `endAge > 110` — calc should not crash; results may be informational only.

## Requirements *(mandatory)*

### Functional Requirements

#### Test infrastructure (must enable invariant checking)

- **FR-001**: System MUST provide a `personas.js` fixture file that defines a parameterized matrix of personas. The matrix dimensions are: country (3), adultCount (2), mortgage state (5), mortgage strategy (3), home #2 state (4), spend level (3), income level (3), starting age (3), Rule of 55 (2), SS claim age (3). Total combinations are factorial; the test harness MUST select a representative subset (≤200 cells) covering all single-dimension variations and a subset of pair-wise combinations.

- **FR-002**: System MUST provide a parameterized test harness that runs each invariant family across the persona matrix and produces a structured findings list (persona ID, invariant ID, observed value, expected value, severity).

- **FR-003**: All validation tests MUST run in pure Node (no browser, no DOM emulation) using the existing sandbox-extraction pattern from `tests/unit/wCashSumRegression.test.js` and `tests/unit/strategies.test.js`.

- **FR-004**: All validation tests MUST execute in under 5 minutes total on a developer laptop. If a single test cell takes longer than 5 seconds, the harness MUST log the slow cell so future optimization can target it.

#### Mode-ordering invariants (User Story 1)

- **FR-005**: System MUST verify that for every persona in the matrix, the earliest feasible FIRE age satisfies `DWZ_age ≤ Exact_age ≤ Safe_age`.

- **FR-006**: System MUST verify that for every (persona, fireAge) pair, the per-mode FIRE NUMBER (`findMinTotalAtFireNumerical` result) satisfies `DWZ_total ≤ Exact_total ≤ Safe_total`.

#### End-state validity invariants (User Story 2)

- **FR-007**: For every (persona, fireAge) cell where Safe mode reports feasibility, the chart's last-row total MUST be ≥ 20% of the FIRE-year total (terminal preservation), AND every retirement-year row's total MUST be ≥ buffer × annualSpend (trajectory floor).

- **FR-008**: For every (persona, fireAge) cell where Exact mode reports feasibility, the chart's last-row total MUST be ≥ `terminalBuffer × annualSpend`.

- **FR-009**: For every (persona, fireAge) cell where DWZ mode reports feasibility, the chart's trajectory MUST deplete within a strict YEAR-level tolerance: zero shortfall years before plan age (current strict behavior). A few months of shortfall in the final plan year is acceptable; a full shortfall year or more is NOT acceptable.

- **FR-010**: For DWZ specifically, the resolved age N MUST be the boundary year — i.e., dragging to N-1 produces "money depletes significantly before plan age" (infeasible), and dragging to N+1 produces "money grows beyond plan age" (over-saving, no longer DWZ).

- **FR-010.1**: System MUST extend the FIRE-age resolver from year-precision to **month-precision**. The resolver returns `{years: int, months: int (0–11)}` so the dashboard header can display "XX Years MM Months" (e.g., "12 Years 7 Months"). Month-precision is computed by the existing year-level search PLUS a fractional-year inner search at the boundary. Year-level binary search remains the outer loop; month-precision is a refinement applied only at the resolved year boundary.

- **FR-010.2**: Dashboard headers (RR + Generic, EN + zh-TW) MUST show "Years to FIRE" with months: e.g., `12 Years 7 Months` instead of `13 yrs`. The verdict pill SHOULD also include months: e.g., "On Track — FIRE in 12 years 7 months". Lockstep across both HTMLs.

#### Cross-chart consistency invariants (User Story 3)

- **FR-011**: For every (persona, fireAge, strategy) cell, the per-year withdrawal mix arrays produced by `projectFullLifecycle` (Lifecycle chart) and `computeWithdrawalStrategy` (Withdrawal Strategy chart) MUST match within $1 across `wTrad`, `wRoth`, `wStocks`, `wCash`.

- **FR-012**: For every (persona, fireAge) cell, the verdict pill's "X% there" and the Progress card's "Y% of accessible target" MUST agree directionally (both above 100%, both at 100%, or both below 100%).

- **FR-013**: For every (persona, fireAge) cell, the audit dump's `crossValidationWarnings` MUST contain no `endBalance-mismatch` records under default operating conditions (active strategy = winner strategy).

#### Cash-flow invariants (User Story 4)

- **FR-014**: For every (persona, fireAge) cell, the cash pool balance during retirement years MUST be non-negative, and the sum of `wCash` across all retirement years MUST be ≤ the cash pool balance entering FIRE plus any 0.5%/yr growth.

- **FR-015**: System MUST rewrite the cash-flow accounting to match standard personal-finance practice ("pay yourself first" model). The new per-year accumulation flow during pre-FIRE years is:
   1. **Gross income** = `annualIncome × (1 + raiseRate)^yearsFromNow` (existing).
   2. **Pre-tax 401(k) contributions** = `contrib401kTrad + contrib401kRoth` (employee), employer match flows separately into Trad pool.
   3. **Federal tax withheld** = computed from `(grossIncome − pre-tax 401k) × taxRate` (existing field, current calc applies it implicitly via the `monthlySavings` input).
   4. **Annual spending** = `annualSpend × (1 + inflationRate)^yearsFromNow` (real terms preserved by the existing real-return convention; spending is in TODAY's dollars and inflation-adjusted by the same factor as returns).
   5. **Stock contribution** = the input currently called `monthlySavings × 12`. This input is RELABELED in the UI as "Monthly stock contribution" (or equivalent in zh-TW). It represents the user's discretionary investment into the taxable brokerage.
   6. **Net cash flow into cash pool** = `grossIncome − federalTax − pretax401k − annualSpending − stockContribution`. Clamped at $0 — if the user spends more than they earn (after contributions), cash pool does NOT decrease (the user is implicitly assumed to either reduce stock contributions OR borrow, neither of which is modeled here). Excess flows into the cash pool.
   7. **Pool updates** as today: pTrad += contrib401kTrad + empMatch (after growth); pRoth += contrib401kRoth (after growth); pStocks += stockContribution + monthly returns (existing); **pCash += netCashFlowToCash** (NEW); pCash growth at 0.5%/yr nominal (FR-016 unchanged).

- **FR-015.1**: System MUST update the input label `monthlySavings` to "Monthly Stock Contribution" (RR + Generic, EN + zh-TW) with a tooltip clarifying: "This is the amount you invest in your taxable brokerage each month. Leftover salary after taxes, 401k, and spending automatically flows to your cash pool."

- **FR-015.2**: For every (persona, fireAge) cell, the new cash-flow model MUST satisfy the conservation invariant: `Σ(grossIncome) − Σ(federalTax) − Σ(annualSpending) = Σ(401k_contribs) + Σ(stockContrib) + Σ(cashPoolChange) − Σ(employerMatch)`, summed over accumulation years. Employer match enters separately as a non-cash inflow to Trad.

- **FR-015.3**: The audit MUST research and cite how authoritative personal-finance sources (e.g., Bogleheads wiki, Investopedia, "I Will Teach You To Be Rich" Conscious Spending Plan, Mr. Money Mustache) define the income → tax → spending → savings → investment → cash residual flow. The implementation MUST align with the consensus definition. A research summary MUST be included in `specs/020-validation-audit/cashflow-research.md`.

- **FR-015.4**: Backwards-compatibility: the persisted `monthlySavings` value continues to mean "Monthly Stock Contribution". No data migration needed. The label and tooltip changes are presentation-only.

- **FR-015.5**: System MUST surface the computed cash flow as a visible input in the Plan tab, displayed adjacent to (or beneath) the spending and stock-contribution inputs. The field follows the **override-toggle** pattern already used by `pviEffRateOverrideEnabled` in the codebase:
   - Default state: auto-compute toggle ON, field shows `salary − federalTax − annualSpending − 401k_contribs − stockContrib*12` and is read-only.
   - Toggle OFF: field becomes editable and the user-supplied annual cash flow overrides the calculated value. A clear visual indicator (color or border accent) shows that an override is in effect.
   - Field label: "Annual cash flow to savings" (EN) / "每年存入現金的金額" (zh-TW, or culturally appropriate phrasing). Tooltip: "Auto-computed as salary minus taxes, spending, 401k contributions, and stock contributions. Toggle off to override."
   - Persistence: stored under a new `pviCashflowOverrideEnabled` + `pviCashflowOverride` localStorage pair (mirroring the PvI override pattern). Backwards-compatible default = auto-compute ON.
   - Lockstep RR + Generic.

- **FR-015.6**: When the calculated cash flow would be negative (i.e., spending exceeds salary − taxes − 401k − stockContrib), the calc MUST clamp the cash-pool inflow at $0 (no negative debt modeling) AND the dashboard MUST display a non-blocking warning near the cash-flow display. Suggested copy: "⚠️ Spending exceeds available cash flow this year — your cash pool isn't growing. Consider reducing spending or stock contribution." Warning shows only for the years where the residual would be negative; if the user's plan goes positive in later years (e.g., spending drops post-college), the warning auto-clears for those years.

- **FR-016**: Cash growth rate stays at `1.005` (0.5%/yr nominal) hardcoded. The dashboard MUST add an explanatory tooltip on the cash pool's chart label: "Cash represents non-interest checking. For HYSA modeling, see (future feature)." No user input added in this feature.

- **FR-017**: For every (persona, fireAge) cell, the 401(k) contribution accounting MUST verify that `contrib401kTrad + empMatch` flows ONLY to pTrad and `contrib401kRoth` flows ONLY to pRoth — no double-counting, no leakage.

#### Drag invariants (User Story 5)

- **FR-018**: For every (persona, mode ∈ {Safe, Exact}), if mode is feasible at FIRE age N then it MUST be feasible at N+1 (monotonic feasibility).

- **FR-019**: For every persona where DWZ is feasible at age N, dragging to N+1 MUST produce a different verdict (e.g., "Exact territory" or "over-saving warning") rather than silently reporting "DWZ ✓" with positive end balance.

- **FR-020**: For every persona, perturbing `annualSpend` by ±$1 (relative ≈0.001%) MUST NOT change the strategy ranker winner.

- **FR-021**: For every persona, perturbing `currentAge` by ±0.01 years MUST NOT change the strategy ranker winner.

#### Reporting requirements

- **FR-022**: The audit MUST produce a markdown report at `specs/020-validation-audit/audit-report.md` with one entry per finding, structured as: invariant ID, persona ID, observed value, expected value, severity (CRITICAL / HIGH / MEDIUM / LOW), and status (FIXED / DEFERRED / WONTFIX).

- **FR-023**: The audit MUST produce a markdown survey at `specs/020-validation-audit/withdrawal-strategy-survey.md` covering ≥6 candidate withdrawal strategies (4% rule, VPW, Guyton-Klinger, Bucket, Dynamic Spending, RMD-based), each with definition, model-fit assessment, and implement/defer/skip recommendation.

- **FR-024**: For every CRITICAL or HIGH severity finding, the implementation MUST include a code fix on this branch with a dedicated regression test. MEDIUM and LOW findings MAY be deferred with a documented rationale.

#### Lockstep + non-regression requirements

- **FR-025**: Any code fix landing on this branch MUST be applied lockstep to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, preserving the documented `mfjStatus` divergence noted in feature 018's CLOSEOUT.

- **FR-026**: All tests in the existing test suite (379 unit tests as of feature 019 merge) MUST remain green throughout this feature's implementation. A pre-commit smoke check MUST verify this.

### Key Entities

- **Persona**: a parameterized scenario fixture combining country, adultCount, ages, balances, mortgage state, home #2 state, spend level, income level, and SS configuration. Identified by a stable string ID (e.g., `RR-baseline`, `Generic-single-frugal-Japan`). Persona definitions are versioned with the test fixture file so future test runs can reproduce historical findings.

- **Invariant**: a named rule (e.g., A1, B3, C1) with a description, a check function, and an expected outcome. The check function operates on (persona, fireAge, mode, strategy) inputs and returns either `{passed: true}` or `{passed: false, observed, expected}`.

- **Finding**: an instance of an invariant violation. Tied to a persona ID and a moment in time (test run timestamp). Contains observed value, expected value, severity, and status fields. Findings persist in the audit report; resolved findings are not deleted but marked as FIXED with the commit that fixed them.

- **Strategy fitness verdict**: per-strategy summary including {feasible-under-current-mode, end-balance, lifetime-tax, violations-count}. Used by mode-ordering and end-state-validity invariants.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every persona in the validation matrix can be evaluated end-to-end in under 5 seconds on a developer laptop. The full matrix (≤200 cells × 5 invariant families) completes in under 5 minutes total.

- **SC-002**: 100% of CRITICAL findings (verdict-inverting bugs) discovered by the audit are fixed on this branch before merge.

- **SC-003**: 100% of HIGH findings (chart-contradicts-display bugs) are fixed on this branch before merge.

- **SC-004**: All existing unit tests (379 tests as of merge of feature 019) remain passing throughout. No regression in the existing test suite.

- **SC-005**: The audit report enumerates every invariant violation found, with reproducible inputs and severity classifications. A reviewer can pick any finding and re-run its specific test to verify the fix.

- **SC-006**: After the fixes land, re-running the full audit against the fixed code produces zero CRITICAL or HIGH findings. MEDIUM/LOW findings may remain if explicitly deferred with rationale.

- **SC-007**: The withdrawal-strategy survey covers at least 6 candidate strategies, each with a definitive recommendation (implement-now / defer-to-future-feature / skip-with-rationale). Reviewers can use the survey to plan future feature work without further research.

- **SC-008**: For the user's actual RR scenario at FIRE age 55 in DWZ mode, the verdict pill, FIRE NUMBER card, Progress bar, and Lifecycle chart all tell the same story (either all "feasible / on track" with consistent percentages, or all "infeasible / not sustainable" with consistent narrative).

- **SC-009**: For every (persona, mode) cell where the test harness reports feasibility at age N, manually loading that persona into the dashboard and dragging the marker to age N produces a chart and verdict that visually agree with the test's feasibility claim.

- **SC-010**: The cash-flow rewrite (FR-015) is validated against ≥3 authoritative personal-finance sources (cited in `cashflow-research.md`). The implementation produces, for the user's RR scenario, a year-1 cash inflow within 5% of an independently computed reference number — proving the dashboard now tracks "leftover salary" correctly.

- **SC-011**: The header displays month-precision "X Years Y Months" in both EN and zh-TW. The verdict pill follows suit. Browser-smoke confirms the format renders correctly in both files at all reasonable FIRE ages (5–30 years out).

- **SC-012**: Cash pool conservation: after running a 50-year accumulation simulation for any persona, the sum of `(grossIncome − federalTax)` over all years equals the sum of `(annualSpending + 401k_pre-tax_contribs + stockContrib + cashPoolInflow)` over all years (employer match is excluded from the gross-income side because it is non-cash to the employee). Floating-point tolerance: ±$1 per year of simulation.

## Assumptions

- The audit operates against the post-019 calc baseline (commit `f73ab44`). Pre-019 bugs (cash drift, gate-vs-chart drift, accessible-bridge metric) are considered fixed, not subject to re-validation in this feature.
- Browser-smoke is NOT required for the audit's calc-layer findings. Browser smoke is required only for CRITICAL or HIGH fixes that change UI-visible behavior, gating the merge of this feature.
- The persona matrix is a representative subset of all theoretically possible scenarios. Findings discovered during the audit may motivate adding new personas to the matrix; the matrix is treated as living documentation.
- The validation framework introduced in this feature is intended to be **durable** — future features (e.g., new withdrawal strategies, new mortgage states) extend the matrix and re-run the invariants. The framework lives in `tests/unit/validation-audit/` so it's discoverable next to existing tests.
- The "year-granular" resolution of FIRE ages is preserved as the default behavior. Month-precision is out of scope for this feature unless an invariant fundamentally requires it.
- The audit findings document uses severity as guidance, not as a strict gating mechanism — the MANAGER (per CLAUDE.md team structure) makes the final call on which findings block merge.
- Survey research for additional withdrawal strategies will use existing Context7 / web search tooling (e.g., Bogleheads VPW documentation, Bengen's 1994 paper on the 4% rule, Guyton-Klinger original publications). Cite sources in the survey doc.
- Single-person mode regression (covered by feature 019 INV-09 / INV-10) is preserved. New persona variations involving `adultCount=1` MUST exercise both fresh-single (zero person2 data) and ex-couple (stale person2 data) scenarios.
- The feature's code lockstep applies to BOTH HTML files for any production code change. Test code may live in a single shared file when the test extracts code from both HTMLs symmetrically.
- Pre-existing crossValidationWarnings infrastructure (the audit dump's `endBalance-mismatch` field) is leveraged as a sentinel; this feature does NOT redesign the audit dump format unless required by a finding.
