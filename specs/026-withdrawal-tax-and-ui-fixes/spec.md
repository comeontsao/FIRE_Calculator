# Feature Specification: Withdrawal-Strategy Tax Investigation + Header-Zoom and FIRE-Month Display Fixes

**Feature Branch**: `026-withdrawal-tax-and-ui-fixes`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: see "User Input" section below

## User Input

The user raised three concerns after reviewing the dashboard:

1. **Withdrawal-strategy tax shape (investigation):** In the Withdrawal Strategy chart at FIRE age 53 with the "Leave more behind" strategy, the user observed a sharp tax cliff at age 69 — `Trad 401k draw (taxed) = $269.1K` against `Bracket-fill excess = $24.9K`, producing `$7.1K tax (7.6% effective)`. Years 60–68 are essentially 0% effective tax. The user's intuition is that smoothing some of the late-stage Traditional-401k withdrawal into the 60–68 window — paying a small amount of tax (e.g., 10% bracket) earlier and re-investing the unspent residual — should compound favourably over a 10–15 year horizon and beat the "all-zero-then-cliff" shape. The user wants this investigated and a recommendation back: either confirm the current algorithm is right (with the reasoning), or change it.

2. **Header layout breaks at certain zoom levels (bug):** At some browser zoom levels the header becomes oversized, the `ROGER & REBECCA FIRE COMMAND CENTER` title wraps onto multiple lines, and content lower in the viewport becomes invisible until the user scrolls. The current responsive rules don't degrade cleanly across the full zoom range users actually use (75% – 150%).

3. **FIRE duration always shows "X years 1 months" (bug):** The verdict pill shows `FIRE in 11 years 1 months (age 53)` regardless of which input slider the user adjusts. Other month values (0, 2, 3, …, 11) never appear. The month-precision resolver (`calc/fireAgeResolver.js`) ships per spec 020 US4c, but in practice the displayed month is stuck at 1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — FIRE-month display stuck at "1 months" (Priority: P1)

The user adjusts savings rate, retirement spend, age inputs, or the FIRE-mode toggle in the dashboard. The verdict pill at the top renders the duration to FIRE in years and months. Today, the months portion is almost always `1` regardless of inputs, which makes the user distrust the figure.

**Why this priority**: This is a correctness bug in a primary KPI the user reads first when opening the dashboard. The pill is the public-facing commitment — if it's wrong or visibly stuck, every downstream metric the user evaluates is suspect. Highest user-trust impact among the three items.

**Independent Test**: Sweep one input across a wide range (e.g., monthly savings $2K → $10K in $250 steps) and confirm the displayed `months` value takes on a variety of values across `0..11`, not just `1`. A scripted Playwright pass over both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` records the displayed months at each step; the histogram across `{0..11}` must not be degenerate (i.e., not >80% concentrated on a single bucket for monotonically-varied inputs).

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded with default RR inputs, **When** the user moves the monthly-savings slider through 25 distinct positions, **Then** the displayed months value across those positions covers at least 4 distinct values in `{0..11}`.
2. **Given** the dashboard is loaded, **When** the user toggles between Safe / Exact / Die-With-Zero modes without changing other inputs, **Then** the months value updates consistent with the underlying mode-specific feasibility boundary (the same value is allowed across modes only if the boundary truly coincides, otherwise it differs).
3. **Given** any input combination that produces a feasible FIRE age, **When** the verdict pill renders, **Then** `years + months/12` equals the resolver's `totalMonths/12` to within 1/12 (no arithmetic drift between resolver and display).
4. **Given** the resolver returns `searchMethod: 'integer-year'` (year boundary IS the answer), **When** the pill renders, **Then** the display SHOULD use the integer-year copy `"FIRE in N years"` and SHOULD NOT append a misleading `0 months` or stale `1 months`.

---

### User Story 2 — Withdrawal-strategy tax-cliff investigation (Priority: P1)

The user is preparing for an actual retirement decision and wants the dashboard's recommended withdrawal sequence to reflect a defensible long-horizon tax-and-compounding optimum, not just a year-by-year greedy minimum. They observed a $269K Traditional-401k draw at age 69 in the "Leave more behind" strategy producing a $7.1K tax bill while ages 60–68 are 0% — and want to know whether earlier modest-tax withdrawals (e.g., topping up the 10% bracket from age 60) reinvested would beat the current shape after long-term compounding.

**Why this priority**: Retirement-decision-grade math. Even a 1–2% drift in lifetime after-tax wealth from a sub-optimal withdrawal sequence is meaningful at the user's portfolio scale. The investigation may end with "current logic is correct because of constraint X" (an explanation the user can rely on), or it may produce a calc-layer change. Either way, the answer is high-value.

**Independent Test**: Run a head-to-head simulation on the SC-026-A canonical fixture (defined in Success Criteria below) comparing (a) the current "Leave more behind" trajectory versus (b) a counterfactual "10%-bracket-smoothed" trajectory. Report the difference in (i) total lifetime federal tax in nominal $, (ii) terminal Book-Value portfolio at plan end, and (iii) terminal purchasing-power equivalent. The investigation deliverable is a written report (`research.md` section) — the test is "the report exists, has computed numbers from the fixture, and recommends keep / change with the reasoning". A behavior change ships only if the report's recommendation is to change.

**Acceptance Scenarios**:

1. **Given** the SC-026-A fixture loaded as RR inputs, **When** the simulation is run under both "Leave more behind" and the proposed "10%-bracket-smoothed" counterfactual, **Then** `research.md` reports total lifetime federal tax (nominal $) and terminal Book Value for both, with the delta highlighted.
2. **Given** the report's recommendation is "keep current logic", **When** the user reads the explanation, **Then** the explanation must name the dominant constraint (e.g., RMD-driven late-stage spike, IRMAA, ACA cliff, surviving-spouse-bracket ramp, or "the higher pre-tax-balance compounding inside the 401k more than offsets the later marginal-rate jump") and quantify the trade-off, not hand-wave.
3. **Given** the report's recommendation is "change the algorithm", **When** the user reviews the proposed change, **Then** the change is described as a contract-level diff to a named calc module (e.g., `calc/withdrawalSequencer.js` or whichever owns the "Leave more behind" policy) with named inputs, named outputs, and the new acceptance test that gate the change.
4. **Given** any algorithm change is proposed, **When** the dashboard re-runs the SC-026-A fixture, **Then** the after-change lifetime tax must be ≤ the before-change lifetime tax (the change cannot regress the metric it's trying to improve), AND the after-change end-of-life Book Value must be within the same tolerance band specified for the active FIRE mode (Safe: ≥ buffer × annualSpend at all ages; Exact / DWZ: per existing contract).
5. **Given** the report's recommendation, **When** that recommendation is acted on (or explicitly deferred), **Then** the spec.md status field for this user story moves from "Open" to "Resolved — Kept Current Logic" or "Resolved — Algorithm Change Landed in Spec NNN".

---

### User Story 3 — Header zoom-resilient layout (Priority: P2)

The user works at varying browser zoom levels (75%, 100%, 125%, 150%) on different monitors. At certain zoom levels the dashboard header expands far beyond its intended height — the title wraps to multiple lines, the verdict pill drops below the title, and content below the header is pushed off-screen.

**Why this priority**: Real usability friction but workaround exists (return to 100% zoom). Lower than the two correctness items but high enough that ignoring it leaves a polish gap on a page the user opens daily.

**Independent Test**: Open both dashboard files in a real browser (per CLAUDE.md "Browser smoke before claiming a feature done" rule), step zoom from 75% → 100% → 125% → 150%, and at each level the header fits in ≤ 200px vertical space (suggested target; ratifiable in the Success Criteria), the title remains on a single line OR wraps to at most 2 lines without overlapping other header elements, and the first KPI row remains visible without scrolling on a 1080p display.

**Acceptance Scenarios**:

1. **Given** the dashboard loaded at 100% zoom on 1920×1080, **When** the page renders, **Then** the header occupies ≤ 200px vertical space and the verdict pill, language toggle, and theme toggle are all on the same row as the title.
2. **Given** the dashboard loaded at 125% zoom on 1920×1080, **When** the page renders, **Then** the title may wrap to 2 lines but no header element overlaps another, AND the first KPI card row is fully visible without page scroll.
3. **Given** the dashboard loaded at 75% zoom, **When** the page renders, **Then** font sizes and spacing remain legible (no element collapses to ≤ 10px effective rendered size) and the layout looks deliberate, not "pinched".
4. **Given** the dashboard loaded at 150% zoom, **When** the page renders, **Then** any unavoidable header overflow degrades to vertical stacking (title → verdict pill → toggles in column) rather than horizontal clipping, and content below the header is reachable without first scrolling past a giant header.
5. **Given** the layout is changed to fix zoom robustness, **When** the user uses the dashboard at 100% (the canonical zoom), **Then** there is no visual regression from today's 100% layout.

---

### Edge Cases

- **US1 — month-precision resolver is tripped up by fractional-year simulator behaviour:** if `simulateRetirementOnlySigned` doesn't actually pro-rate the FIRE-year row by `(1 − m/12)` correctly, the resolver's `Stage 2` finds the same first-feasible month for every input, which would explain "always 1 months". The spec MUST require a root-cause diagnosis before the fix, not just a UI patch. Specifically the diagnosis must distinguish (a) resolver bug, (b) simulator pro-rate bug, (c) feasibility-gate bug evaluating the wrong strategy at fractional ages.
- **US1 — `searchMethod === 'integer-year'` returned but UI still appends "1 months":** if the year-boundary IS the answer (Stage 2 falls back), the verdict pill should switch to year-only copy. Today the gate is `_useMonthVerdict` which checks `searchMethod === 'month-precision'`; if that gate is correct, the bug must be elsewhere (e.g., a stale cached resolver result mismatched to current inputs).
- **US1 — month value crossing 11 → 0 boundary:** when an input change pushes feasibility from `Y-1, m=11` to `Y, m=0`, the displayed years AND months both change. Test must cover this.
- **US2 — zoom interacts with mobile breakpoint:** the responsive media-query thresholds may collide with high zoom on a desktop monitor (effective viewport at 150% zoom on 1920px = 1280px effective, which might cross a tablet breakpoint). The fix must not silently activate the mobile layout on a desktop just because zoom is high.
- **US2 — long zh-TW translations:** the title in zh-TW (`羅傑與蕾貝卡 FIRE 指揮中心`) may wrap differently from EN. Layout must hold for both languages.
- **US3 — the counterfactual smoothing might violate IRMAA, ACA, or AMT thresholds** that the current "Leave more behind" already steers around. The investigation report MUST consider these constraints, not just bracket-fill arithmetic.
- **US3 — investigation result depends on assumed market-return path:** the recommendation must report sensitivity to the assumed real return rate (e.g., "smoothing wins by $X at 7% real, breaks even at 5% real, loses by $Y at 3% real").
- **US3 — surviving-spouse bracket cliff:** withdrawing more between 60–68 reduces 401k balance going into the surviving-spouse window (single-filer brackets), which is itself a tax-pressure event. The report must factor this, not just the current MFJ projection.

## Requirements *(mandatory)*

### Functional Requirements

#### Group A — FIRE-month display (US1)

- **FR-001**: System MUST diagnose the root cause of the "always 1 months" verdict-pill bug across both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` BEFORE shipping a fix. Diagnosis output is a short note in `research.md` naming which of the three layers — resolver / simulator / feasibility-gate — produced the stuck value.
- **FR-002**: System MUST display the FIRE-duration months value with month resolution that actually varies across inputs. For 25 sweep points across the monthly-savings range, the displayed months value MUST take on at least 4 distinct values in `{0..11}` (per US1 Independent Test).
- **FR-003**: When the resolver returns `searchMethod === 'integer-year'`, the verdict pill MUST render the integer-year copy (`'dyn.fireInYears'`) — not append a stale or default months value.
- **FR-004**: System MUST keep the displayed FIRE age (`Y` in `(age Y)`) and the duration (`years + months`) arithmetically consistent — i.e., `displayedFireAge − currentAge` MUST equal `years + months/12` rounded per the resolver's contract. Existing feature 023 follow-up that switches the displayed age to the resolver's integer-floor MUST hold.
- **FR-005**: All existing month-precision tests in `tests/` MUST continue to pass after the fix. New tests covering the "always 1 months" regression MUST be added to `tests/unit/fireAgeResolver.test.js` (or sibling) and `tests/integration/verdict-pill.test.js`.

#### Group B — Withdrawal-strategy tax investigation (US2)

- **FR-006**: System MUST produce a written investigation report at `specs/026-withdrawal-tax-and-ui-fixes/research.md` covering at minimum: (a) the canonical fixture inputs, (b) the current "Leave more behind" trajectory's per-year tax + Book-Value table, (c) a "10%-bracket-smoothed" counterfactual trajectory's per-year tax + Book-Value table, (d) the lifetime tax delta and terminal-portfolio delta, (e) sensitivity to assumed real return (3%, 5%, 7%), (f) a keep / change recommendation.
- **FR-007**: The investigation MUST consider IRMAA, ACA-PTC cliffs, AMT, and surviving-spouse single-filer brackets as constraints when evaluating the counterfactual. A counterfactual that improves marginal-rate arithmetic but breaches one of those constraints MUST be flagged in the report.
- **FR-008**: If the recommendation is "change the algorithm", the change MUST be specified as a calc-module contract diff — named module, named inputs, named outputs, named consumers — and follow the project's existing calc-module discipline (Constitution Principle II + III). Implementation lands in a follow-up feature spec, not in 026 directly.
- **FR-009**: If the recommendation is "keep current logic", the report MUST explicitly name the dominant constraint or compounding mechanism that justifies the apparent cliff at age 69. Hand-wave reasoning is not acceptable.

#### Group C — Header zoom-resilient layout (US3)

- **FR-010**: At browser zoom levels in the range 75% – 150% (inclusive) on a 1920×1080 viewport, the dashboard header MUST occupy ≤ 200px vertical space at 100% zoom and degrade gracefully (per acceptance scenarios) at the other zoom levels.
- **FR-011**: Header layout MUST hold under both EN and zh-TW translations of the title at every supported zoom level — the longer string in either language MUST NOT overflow the header bounding box at 100% zoom.
- **FR-012**: The fix MUST NOT introduce a visual regression at the canonical 100% zoom. Existing layout, spacing, and font sizes at 100% are the contract.
- **FR-013**: If the fix uses CSS container queries, viewport units, or `clamp()` typography, the technique MUST be documented inline in the relevant CSS section so future-Frontend-Engineer can understand the intent.
- **FR-014**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST receive the same fix in lockstep per CLAUDE.md "Dashboard changes default to both files" rule.

#### Group D — Cross-cutting

- **FR-015**: All work MUST follow the project's "browser smoke before claiming done" gate — the user (Manager) MUST verify both dashboard files in a real browser at 75/100/125/150% zoom, with the verdict pill exhibiting variable months across input sweeps, before the feature is marked done.

### Key Entities *(include if feature involves data)*

- **FireAgeResult**: `{years:int, months:int, totalMonths:int, feasible:bool, searchMethod:'integer-year'|'month-precision'|'none'}` — already produced by `calc/fireAgeResolver.js`. US1 fixes how the dashboard CONSUMES it; the contract itself is unchanged unless the diagnosis (FR-001) implicates the resolver layer.
- **Withdrawal Strategy Trajectory**: per-year cash-flow table `{age, traditional401kDraw, rothDraw, taxableLTCG, cashDraw, ssIncome, taxOwed, effectiveTaxRate, bookValueRemaining}` from age (FIRE-age) to age (plan-end). The investigation in US2 compares two such trajectories.
- **Header layout DOM contract**: title element + verdict pill + EN/zh toggle + theme toggle + chart-mode toggle, in a single flex row at canonical 100% zoom. US3 fix preserves the elements but makes the row resilient to zoom.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (US1):** After fix, sweeping monthly savings across 25 evenly-spaced steps (e.g., $2,000 → $14,000 in $500 increments) on the canonical RR inputs, the displayed `months` value covers ≥ 4 distinct values in `{0..11}` and is NOT >80% concentrated on a single bucket. Verified by automated Playwright scrape of the verdict pill across the sweep.
- **SC-002 (US1):** No regression in the 8 existing month-precision tests in `tests/` (currently passing per feature 020). New regression tests covering "always 1 months" added and passing.
- **SC-003 (US1):** Manual browser smoke: Manager loads RR + Generic, sweeps savings slider through 10 positions, sees ≥ 3 distinct month values across the sweep, and reports back. (Required gate per CLAUDE.md.)
- **SC-026-A (US2 fixture):** Canonical investigation fixture for the withdrawal-strategy tax-cliff study — `RR-default + FIRE age = 53 + Die-With-Zero mode + Leave more behind strategy + LTCG 60% gain + plan-end age 95`. The fixture name `SC-026-A` is referenced by `research.md` and any follow-up tests.
- **SC-004 (US2):** `research.md` exists at `specs/026-withdrawal-tax-and-ui-fixes/research.md` with all six required sections (a)-(f) populated using SC-026-A data. The recommendation is one of: `keep`, `change-spec-NNN`, or `defer-with-reason`.
- **SC-005 (US2):** If recommendation is `change-spec-NNN`, the lifetime-tax delta in `research.md` is ≥ $5,000 nominal at SC-026-A's inputs (otherwise the cost of changing isn't worth the disruption); otherwise the recommendation is `keep` or `defer`.
- **SC-006 (US3):** At 100% zoom on 1920×1080, header height ≤ 200px (measured via DOM `getBoundingClientRect`). Verified for both HTML files and both EN + zh-TW.
- **SC-007 (US3):** At 125% and 150% zoom, no header element overlaps another (no element's rect intersects another header element's rect by >2px). Verified via DOM probe in browser smoke.
- **SC-008 (US3):** Existing 100%-zoom layout pixel-snapshot is unchanged within a 2-pixel tolerance after the fix lands.
- **SC-009 (cross-cutting):** All three user stories pass the "browser smoke gate" — Manager opens both HTML files in a real browser and confirms the four scenarios end-to-end (sweep months, sweep zoom, read research.md). Until this passes, the branch does NOT merge to main.

## Assumptions

- The user runs the dashboard primarily on desktop browsers (Chrome / Edge / Firefox on Windows + Safari on macOS) at zoom levels 75% – 150%. Mobile-viewport breakpoints are a separate concern.
- The "Leave more behind" strategy's current $269K spike at age 69 is reproducible from default RR inputs at FIRE age 53 with Die-With-Zero — i.e., it is a deterministic feature of the current algorithm, not a hover-state visual artifact.
- The month-precision resolver in `calc/fireAgeResolver.js` is structurally correct (its 8 unit tests pass); the bug is most likely either in (a) the simulator's pro-rate behaviour for fractional-year cash flows (per the resolver's own header docs §"Edge Case 4 mitigation"), or (b) the dashboard's wiring of the resolver result to the verdict pill (`_lastKpiSnapshot.fireAgeResult` capture timing, stale state, etc.). Diagnosis (FR-001) confirms which.
- Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` are in scope per project lockstep rule; any per-file divergence must be explicitly justified.
- The investigation in US2 is a **research deliverable**, not an implementation. Behaviour changes to the withdrawal sequencer ship only via a follow-up spec referenced from this report. Feature 026 closes when the report is written and the recommendation is recorded — even if the recommendation is "change". The change itself is a separate feature.
- IRMAA, ACA, and AMT thresholds for the investigation use the same hard-coded 2026-tier values already present in the calc layer (no new tax-table research is in scope for this feature).
