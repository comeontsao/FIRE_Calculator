# Feature Specification: Calculation Audit View

**Feature Branch**: `014-calc-audit`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "The results that are shown in the Full Portfolio Life cycle is so messed up right now. I want you to look through the whole code for the calculation logic, and create an extra catagory tag look through all the calculation with charts showing the final calculation results, so you can get those numbers and the QA engineer can compare the results with the Full Portfolio Life cycle chart. This should also include the calculation for each the Safe, Exact, and DWZ stategies, the order of how this is caluclated, I want everything the creates the results in the Full Portfolio Life cycle, so the Full Portfolio Life cycle should be the END result. the Safe, Exact, and DWZ stategies are just the gates in front of the final results. Not only the QA engineer needs to be able to read the results you create, also in the debug copy button, we need the important info to debug."

## Summary

The Full Portfolio Lifecycle chart is the **final** output of a multi-stage calculation pipeline that today is opaque to the user — and to the QA engineer trying to verify it. When the chart shows a wrong number, the only diagnostic surface is the existing Copy Debug payload, which captures fragments but not the complete chain.

This feature adds a dedicated **Audit** view (a new top-level tab) that exposes every step of the lifecycle pipeline both as **tables** (precise numeric values) and as **per-step charts** (so divergence is visible at a glance). The Audit tab opens with a **calculation-flow diagram** at the top — a horizontal pipeline showing the order of execution and the data each stage hands to the next — followed by section-by-section detail.

1. **Calculation-Flow Diagram** — a single horizontal pipeline (Inputs → Spending Adjustments → Gate Evaluations → FIRE Age Resolution → Strategy Ranking → Lifecycle Projection) showing the order of execution. Each stage is a clickable box that scrolls to its detail section. Stages display a one-line summary of their headline output (e.g., the Gate stage shows "Safe ✓ · Exact ✗ · DWZ ✓ at age 48"), and arrows annotate what data flows downstream (e.g., the FIRE Age stage's outgoing arrow is labeled "fireAge = 48").
2. **Resolved inputs** — exactly what the calc engine received after defaults / scenario overrides / mortgage adjustment. Includes a small composition pie chart of accessible vs. locked balances so the input snapshot is visually scannable.
3. **Mortgage and second-home adjustments** — how raw `annualSpend` becomes the spend curve the lifecycle chart actually uses. Includes a line chart of the effective annual spend over time, with mortgage carry / college years / home #2 carry / sale proceeds visibly annotated as overlays.
4. **Gate evaluations** — Safe / Exact / DWZ, in the order they are computed, each with: a verdict, the trajectory it inspected, the precise reason it returned its boolean, AND **a per-gate small chart** showing the trajectory used by the gate plotted against the gate's threshold (the buffer floor for Safe and DWZ; `terminalBuffer × annualSpend` for Exact). Floor violations are highlighted on the chart.
5. **FIRE age resolution** — the iterative search that picked the displayed FIRE age. Includes a scatter chart of every candidate age the search tried (X = candidate FIRE age, Y = signed-sim end balance OR chart-feasibility verdict), with the FIRST passing age highlighted as the winner.
6. **Strategy ranking** — all seven strategies with end-balance, lifetime tax, floor violations, shortfall years, and feasibility verdict per mode. Includes a grouped bar chart comparing all seven strategies side-by-side on three primary metrics (end balance, lifetime tax, violation count), with the active winner visually distinguished.
7. **The lifecycle projection** — the same data that draws the chart, displayed as a thumbnail of the live Full Portfolio Lifecycle chart aligned **next to** a scrollable per-year table. Each table row is line-aligned with the corresponding chart point so the QA engineer can scan visually.
8. **Cross-validation** — automatic comparison flags where two calculation paths disagree (e.g., signed-sim end-balance vs. chart end-balance, internal-sim feasibility vs. chart feasibility). Each flagged divergence renders as a side-by-side dual-bar chart (value A vs. value B) plus a numeric delta, so the QA engineer can spot the magnitude of mismatch instantly.

The Copy Debug button gains a parallel `audit` block carrying the same data in JSON so it can be shared in bug reports. The Audit view re-renders on every recalc — no separate trigger required. **Charts are first-class output, not optional decoration**: every section that produces a numeric series ALSO produces a chart of that series.

The Safe / Exact / DWZ buttons are explicitly framed in the Audit tab as **gates**, not strategies — they constrain the FIRE age finder; the actual chart trajectory is the result of the picked withdrawal strategy operating at that gated FIRE age. The flow diagram makes this explicit by placing Gate Evaluations as a separate stage between Inputs and FIRE Age Resolution.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — QA engineer verifies the lifecycle chart against intermediate calculations and charts (Priority: P1)

The QA engineer opens the dashboard, configures a fixture scenario, and observes the lifecycle chart. They open the **Audit** tab. The first thing they see is a horizontal **calculation-flow diagram** showing the pipeline (Inputs → Spending Adjustments → Gates → FIRE Age → Strategy Ranking → Lifecycle Projection), with each stage's headline output displayed inline. They scroll down: each stage has both a **table** of precise values AND a **chart** visualizing that stage's output. The Spending Adjustments chart shows the effective spend curve. Each Gate's chart shows trajectory vs. floor. The Strategy Ranking chart shows seven strategies' bars side-by-side. The Lifecycle Projection chart is line-aligned with its per-year table. At every step the QA engineer can see WHAT the calc step produced visually, then verify it against the table.

**Why this priority**: This is the MVP. Without it, a QA engineer can only inspect the final rendered chart — they cannot trace WHERE the calculation diverges. The flow diagram + per-step charts give them a visual reading order that matches the actual pipeline; the tables give them the precise numbers to verify. Every other story builds on this one.

**Independent Test**: Load the dashboard with a known fixture, open Audit, confirm the flow diagram shows 6 pipeline stages with correct headline outputs, scroll through each section, confirm every section displays both a chart and a table, and verify every value the lifecycle chart plots also appears in both the Lifecycle Projection table AND the chart thumbnail.

**Acceptance Scenarios**:

1. **Given** the dashboard renders the lifecycle chart, **When** the QA engineer opens the Audit tab, **Then** the FIRST thing visible is a horizontal flow diagram with 6 connected stages (Inputs → Spending Adjustments → Gate Evaluations → FIRE Age Resolution → Strategy Ranking → Lifecycle Projection) and each stage shows a one-line headline output (e.g., "Inputs: 42yo, $525K NW, $60K spend").
2. **Given** the flow diagram is rendered, **When** the QA engineer clicks on any pipeline stage, **Then** the page scrolls to the corresponding detail section AND that section is briefly highlighted to confirm the navigation.
3. **Given** the QA engineer scrolls through the Audit tab, **When** they reach each detail section, **Then** that section displays BOTH a chart visualization (showing that step's output as a line / bar / scatter / pie as appropriate) AND a table of precise values — neither alone is sufficient.
4. **Given** the lifecycle chart shows a portfolio total of $X at age Y, **When** the QA engineer reads the Lifecycle Projection table AND its line-aligned chart thumbnail in Audit, **Then** the row for age Y shows total = $X (or differs by less than $1 due to display rounding) AND the chart thumbnail's data point at age Y matches.
5. **Given** the user is in Safe mode and the dashboard reports "FIRE in N years (age M)", **When** the QA engineer reads the Gate Evaluations section, **Then** they see Safe gate's verdict at age M is `feasible: true`, see the per-year floor check that justified the verdict, AND see a per-gate chart plotting the trajectory the gate inspected against the floor line — with any violation years visually marked on the chart.
6. **Given** the user is in Safe mode but the lifecycle chart visibly depletes, **When** the QA engineer reads the Gate Evaluations section, **Then** the per-gate Safe chart shows clearly where the trajectory crosses below the floor (or shows that it doesn't, revealing a calc bug). The visual evidence and the table verdict align — or, where they disagree, the Cross-Validation section flags it.
7. **Given** the active strategy is `tax-optimized-search`, **When** the QA engineer reads the Strategy Ranking section, **Then** they see all 7 strategies side-by-side with: end balance, lifetime federal tax, number of buffer-floor violations, number of shortfall years, and a feasibility verdict for each of Safe / Exact / DWZ — both as a table AND as a grouped bar chart with the winner row visually distinguished — so they can see at a glance why the ranker picked the winner.

---

### User Story 2 — Audit data shipped via Copy Debug for bug reports (Priority: P1)

When the user clicks **Copy Debug**, the JSON payload that lands on their clipboard contains the full Audit state under an `audit` key. The user pastes it into an issue, and someone else (developer, QA engineer, AI assistant) can reconstruct the entire calc chain from the JSON alone — without needing to load the dashboard with the same inputs.

**Why this priority**: P1 because the user explicitly asked for it ("also in the debug copy button, we need the important info to debug"). Without the Audit-in-debug, the audit view is only useful at the user's screen — it can't travel with a bug report.

**Independent Test**: Configure a bug-reproducing scenario, click Copy Debug, paste into a new browser session's developer console, verify that the JSON contains all the same numbers visible in the Audit tab (every section, every per-year row).

**Acceptance Scenarios**:

1. **Given** the Audit tab shows N sections of data, **When** the user clicks Copy Debug, **Then** the resulting JSON has an `audit` top-level key containing matching N sub-objects with identical numeric values.
2. **Given** the Audit's Strategy Ranking section shows all 7 strategies with their per-mode feasibility, **When** the JSON is inspected, **Then** the same 7 entries are present with the same `safe_feasible` / `exact_feasible` / `dieWithZero_feasible` booleans and identical violation/shortfall counters.
3. **Given** the Audit's Gate Evaluations section shows the order Safe → Exact → DWZ with their verdicts, **When** the JSON is inspected, **Then** the gates appear in an array (preserving order) with each gate's verdict, mode, age, strategy used, floor, and per-year violation list (if any).

---

### User Story 3 — Cross-validation surfaces discrepancies automatically (Priority: P2)

When two calculation paths disagree on the same fact (e.g., signed-sim end-balance ≠ chart end-balance, or internal-sim feasibility ≠ chart feasibility), the Audit tab displays a visible warning row at the top with the discrepancy quantified. The user does not have to manually compute deltas to find drift.

**Why this priority**: P2 because the QA engineer can find these discrepancies manually using P1's tabular data — but the warning saves them the comparison step.

**Independent Test**: Construct a scenario where signed-sim's end balance is $10K but chart's end balance is $50K, open Audit, confirm the Cross-Validation section flags `endBalance` mismatch with both values displayed and a delta.

**Acceptance Scenarios**:

1. **Given** signed-sim's `endBalance` ≠ chart's last-row `total`, **When** the QA engineer opens Audit, **Then** the Cross-Validation section shows a yellow/red warning row identifying the mismatch with both values and the absolute and percentage delta.
2. **Given** internal `_simulateStrategyLifetime` reports `feasibleUnderCurrentMode = false` but `_chartFeasibility` reports `feasible = true` for the same strategy, **When** the QA engineer opens Audit, **Then** the Cross-Validation section flags this divergence with the strategy ID and both verdicts.
3. **Given** the FIRE age the dashboard displays differs from `_lastStrategyResults.winnerFireAge` (or equivalent), **When** the QA engineer opens Audit, **Then** the Cross-Validation section flags the mismatch.
4. **Given** zero discrepancies, **When** the QA engineer opens Audit, **Then** the Cross-Validation section shows a single positive line "All cross-checks passed" rather than displaying nothing (so the user knows the section was checked).

---

### User Story 4 — Gate evaluations are explicit and ordered (Priority: P2)

The user — possibly not a QA engineer, possibly the dashboard owner trying to understand why Safe says feasible while the chart looks bad — opens the Audit tab and reads the Gate Evaluations section. They see the THREE gates (Safe, Exact, DWZ) listed in the order the calc pipeline evaluates them, each with: the candidate FIRE age it gated against, the strategy it inspected, the metrics it checked (floor, end balance, etc.), and a one-line plain-English verdict.

**Why this priority**: P2 because the data is technically derivable from US1's tabular sections, but explicitly framing the gates as "in front of the final result" matches the user's mental model and makes the gate-vs-chart relationship navigable in seconds.

**Independent Test**: Toggle each of Safe / Exact / DWZ. Observe the Gate Evaluations section update to show the active mode highlighted and all three gates' verdicts at the candidate FIRE age. Verify each gate's plain-English explanation correctly describes its definition.

**Acceptance Scenarios**:

1. **Given** any FIRE mode is active, **When** the QA engineer reads the Gate Evaluations section, **Then** they see all three gates listed (Safe, Exact, DWZ) with the active one highlighted, and EACH gate has its own small chart showing the trajectory it evaluated.
2. **Given** Safe gate is active, **When** the gate verdict is shown, **Then** the plain-English line reads similar to "Safe: every retirement-year total ≥ $X (= bufferUnlock × annualSpend pre-59.5 / bufferSS × annualSpend post-59.5) AND endBalance ≥ 0. Verdict: feasible / infeasible (first violation at age N)." AND a chart accompanies the verdict plotting the trajectory (line) against the floor (dashed horizontal line), with any violation years marked.
3. **Given** DWZ gate is active, **When** the gate verdict is shown, **Then** the plain-English line reads similar to "DWZ: every retirement-year total ≥ floor AND endBalance ≥ 0 (drain target = 0). Verdict: feasible / infeasible (first violation at age N)." AND the per-gate chart shows the same floor + trajectory.
4. **Given** Exact gate is active, **When** the gate verdict is shown, **Then** the plain-English line reads similar to "Exact: endBalance ≥ terminalBuffer × annualSpend = $X. Verdict: feasible / infeasible (end balance $Y vs required $X)." AND the per-gate chart shows the trajectory's end balance with the threshold marked.

---

### Edge Cases

- **Audit tab opens before any recalc has fired**: show "No calculation results yet — change any input or click Reset" rather than an empty page.
- **`_lastStrategyResults` is null** (race during boot): show an empty Strategy Ranking section with the message "Strategy ranking pending — please wait for the next recalc."
- **Cross-validation triggers a known false positive** (e.g., signed-sim is bracket-fill-only and active strategy is Roth-Ladder, so end-balance mismatch is expected): mark such known divergences with a "(expected — different sim contracts)" annotation rather than a warning.
- **Per-year lifecycle table is large** (~58 rows): table is scrollable inside its section without expanding the page; small thumbnail of the lifecycle chart is pinned at the top of the section.
- **Inputs change rapidly via slider drag**: Audit re-renders on every recalc, but rendering the full audit must not block the chart's redraw (per existing perf invariants — chart redraw <250ms remains the gate).
- **Two recalcs happen back-to-back**: Audit always reflects the most recent recalc; no stale data.
- **User on mobile (≤767px)**: Audit tab is usable, with sections stacked vertically and tables horizontally scrollable.
- **Bilingual (EN + zh-TW)**: section labels, plain-English verdicts, column headers all translate. Numeric values remain numeric (not localized).

## Requirements *(mandatory)*

### Functional Requirements

**Audit tab placement and structure**

- **FR-001**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST gain a new top-level tab labeled **Audit** (with a bilingual label key) added to the existing tab bar from feature 013.
- **FR-002**: The Audit tab MUST appear as the LAST tab (after History) so it does not disturb the existing Plan / Geography / Retirement / History order.
- **FR-003**: The Audit tab MUST contain at least 8 sections in the following exact order (top to bottom), each labeled with a bilingual heading:
    1. **Calculation Flow Diagram** (visual pipeline, top of the tab)
    2. Resolved Inputs
    3. Spending Adjustments (mortgage / college / home #2 / scenario overrides)
    4. Gate Evaluations (Safe · Exact · DWZ)
    5. FIRE Age Resolution
    6. Strategy Ranking
    7. Lifecycle Projection (per-year table + chart thumbnail)
    8. Cross-Validation Warnings

**Calculation Flow Diagram section (NEW — top of the Audit tab)**

- **FR-CF-1**: The Audit tab MUST open with a horizontal flow diagram displaying SIX pipeline stages in execution order, connected by arrows: **Inputs** → **Spending Adjustments** → **Gate Evaluations** → **FIRE Age Resolution** → **Strategy Ranking** → **Lifecycle Projection**.
- **FR-CF-2**: Each stage in the flow diagram MUST display a one-line headline output of the live recalc — e.g., the Gate stage shows the active mode and the verdict ("Safe ✓ at age 48"), the FIRE Age stage shows the picked age ("48 = 6 yrs"), the Strategy stage shows the winner ID ("bracket-fill-smoothed"), and the Lifecycle stage shows the end-of-plan total ("$175K at age 100").
- **FR-CF-3**: The arrows between stages MUST display the data each stage hands to the next (e.g., the arrow from Gate Evaluations to FIRE Age Resolution is labeled "verdict + active strategy"; from FIRE Age Resolution to Strategy Ranking is labeled "fireAge = 48").
- **FR-CF-4**: Each stage box in the flow diagram MUST be clickable; clicking scrolls the page to the corresponding detail section AND briefly highlights the section to confirm the navigation.
- **FR-CF-5**: At narrow viewports (≤767px), the flow diagram MAY render vertically (top-to-bottom) instead of horizontally; the SIX stages and their arrows are preserved either way.

**Per-section chart requirements (NEW)**

- **FR-CH-1**: EVERY detail section that produces a numeric series MUST display a chart visualization of that series, in addition to its tabular data. Charts are first-class output, not optional.
- **FR-CH-2**: The Resolved Inputs section MUST include a small composition pie chart of the user's accessible vs. locked balances (Stocks · Cash · 401K-traditional · 401K-Roth) — so the input snapshot is visually scannable.
- **FR-CH-3**: The Spending Adjustments section MUST include a line chart of the effective annual spend over time (X = age, Y = annual spend in $), with overlay markers for: mortgage payoff age, college start/end years, home #2 buy/sell years.
- **FR-CH-4**: Each Gate Evaluation (Safe, Exact, DWZ) MUST include its own small chart plotting the trajectory the gate inspected (X = age, Y = portfolio total), with the gate's threshold drawn as a dashed horizontal line (buffer floor for Safe / DWZ; `terminalBuffer × annualSpend` for Exact). Floor-violation years MUST be visually marked on the chart.
- **FR-CH-5**: The FIRE Age Resolution section MUST include a scatter chart of every candidate age the search tried (X = candidate FIRE age, Y = signed-sim end-balance OR a feasibility-verdict marker), with the FIRST passing age (the displayed FIRE age) visually distinguished from the rest.
- **FR-CH-6**: The Strategy Ranking section MUST include a grouped bar chart comparing all 7 strategies side-by-side on at least three primary metrics: end balance, lifetime federal tax, and floor-violation count. The active winner row's bars MUST be visually distinguished.
- **FR-CH-7**: The Lifecycle Projection section MUST include a thumbnail of the same Full Portfolio Lifecycle chart that lives in Retirement → Lifecycle, displayed adjacent to (and line-aligned with) the per-year table — so a QA engineer can read across.
- **FR-CH-8**: The Cross-Validation Warnings section MUST include, for each flagged divergence, a small dual-bar chart showing value A vs value B side-by-side with the absolute and percentage delta annotated.
- **FR-CH-9**: All Audit-section charts MUST use the SAME chart library (Chart.js) the rest of the dashboard uses; no new chart library may be introduced.
- **FR-CH-10**: All Audit-section charts MUST be rendered at a smaller size than the main lifecycle chart (target: ~300×180px on desktop) so multiple charts fit on the same scrollable page without overwhelming the user.

**Resolved Inputs section**

- **FR-004**: Resolved Inputs MUST display every input field consumed by the calc pipeline (ages, balances, contributions, return rates, inflation rate, SWR, mortgage parameters, second-home parameters, expense breakdown, country scenario, healthcare overrides, SS earnings record, buffer parameters, terminal buffer, end age, safety margin, Rule-of-55 toggle/age, IRMAA threshold, stock gain percentage), grouped logically.
- **FR-005**: The display MUST distinguish raw user input from derived/defaulted values (e.g., when `bufferSS` is the default 1, indicate `(default)`).

**Spending Adjustments section**

- **FR-006**: Spending Adjustments MUST display the raw `scenarioAnnualSpend`, the mortgage-adjusted `annualSpend` (showing the delta), college costs by year, second-home buy/sell timing and costs, and the final `effectiveSpend` curve sample (every 5 years).

**Gate Evaluations section**

- **FR-007**: Gate Evaluations MUST display all three gates (Safe, Exact, DWZ) in fixed order, with the currently-active mode marked.
- **FR-008**: For each gate, the section MUST display: the candidate FIRE age the gate is evaluated at, the strategy used (active or default), the formula in plain English, the input values fed to the formula, and the verdict (feasible / infeasible) with a reason.
- **FR-009**: For Safe and DWZ gates (which check the floor), the section MUST list every retirement year where `total < floor` (with age and the actual `total` and the `floor`) — or "no violations" if clean.

**FIRE Age Resolution section**

- **FR-010**: FIRE Age Resolution MUST show the iterative search that picked the displayed FIRE age, including: each candidate age tried, the gate-feasibility verdict at that age, and the FIRST candidate age that passed (= the displayed FIRE age), or the fallback if none passed.
- **FR-011**: For DWZ mode, FIRE Age Resolution MUST also show the month-precision interpolation result (when applicable) so users can see how the integer-year display compares to the actual fractional crossover age.

**Strategy Ranking section**

- **FR-012**: Strategy Ranking MUST display all 7 strategies (or however many `_lastStrategyResults` contains) in a single table with at minimum these columns: Strategy ID · Chosen θ (if applicable) · End Balance · Lifetime Federal Tax · Buffer Violations · First Violation Age · Shortfall Years · First Shortfall Age · Safe-Feasible · Exact-Feasible · DWZ-Feasible · Winner-Selection Mode (estate / tax / drain).
- **FR-013**: The active winner row MUST be visually distinguished (background color, border, or icon).

**Lifecycle Projection section**

- **FR-014**: Lifecycle Projection MUST display a small thumbnail of the same Full Portfolio Lifecycle chart that lives in Retirement → Lifecycle, AND a per-year table with at minimum these columns: Age · Phase · Total · 401K · Stocks · Cash · Roth · Synthetic Conversion (if any) · SS Income · Withdrawals (Trad+Roth+Stocks+Cash totals).
- **FR-015**: Per-year table MUST cover the full plan range (`ageRoger` through `endAge`), be scrollable inside the section, and have the FIRE-age row visually highlighted.

**Cross-Validation Warnings section**

- **FR-016**: Cross-Validation MUST automatically check at least these invariants and display a warning row for each violation found:
    - signed-sim `endBalance` vs chart-row last `total` (delta + percentage)
    - `_simulateStrategyLifetime`'s `feasibleUnderCurrentMode` vs `_chartFeasibility`'s verdict for the active strategy
    - Displayed FIRE age vs `_lastStrategyResults.winnerFireAge` (if available)
    - Floor violation count via `isFireAgeFeasible` vs floor violation count via `_chartFeasibility` for the active strategy
- **FR-017**: When a known divergence is expected (different sim contracts), the warning row MUST be annotated `(expected — <reason>)` rather than displayed as a problem.
- **FR-018**: When zero violations are found, Cross-Validation MUST display a single positive line "All cross-checks passed".

**Copy Debug payload**

- **FR-019**: The existing **Copy Debug** button MUST gain a top-level `audit` key in its JSON output, containing all 7 sections as nested objects with byte-identical numeric values to what the Audit tab displays.
- **FR-020**: The existing `feasibilityProbe` and `summary` keys in the debug payload MUST remain (no removals), so prior debug payloads remain comparable.
- **FR-021**: The new `audit` block MUST be deterministic — same inputs produce same JSON.

**Routing and integration with feature 013**

- **FR-022**: The Audit tab MUST integrate with the `tabRouter` from feature 013: clicking Audit changes the URL hash to `#tab=audit&pill=...`, persists in localStorage, and is restored on reload.
- **FR-023**: Audit MUST have at least one sub-pill so the existing pill-bar pattern is preserved. The default sub-pill is `summary` (showing all 7 sections in one scrollable view); future sub-pills MAY split into `inputs` / `gates` / `strategies` / `projection` if scrolling becomes unwieldy.

**Lockstep + bilingual + zero-build (per Constitution)**

- **FR-024**: Both HTML files MUST receive identical Audit tab structure (Principle I).
- **FR-025**: Every new user-visible string (section labels, plain-English verdicts, column headers, "All cross-checks passed", warning text, etc.) MUST be added to `TRANSLATIONS.en` AND `TRANSLATIONS.zh` and to `FIRE-Dashboard Translation Catalog.md` (Principle VII).
- **FR-026**: The Audit feature MUST NOT introduce any new runtime dependency or build step (Principle V).

**Performance**

- **FR-027**: Adding the Audit tab MUST NOT slow recalcs by more than 50ms above the existing budget (the chart redraw stays under its own perf gate).
- **FR-028**: The Audit tab MUST render lazily — the per-year table and chart thumbnail are computed only when the Audit tab is the active tab (or when Copy Debug is invoked).

**Calc engine — explicit non-changes**

- **FR-029**: This feature MUST NOT modify any calc-engine logic, formula, gate, or ranker. It is a pure observability layer over the existing pipeline.
- **FR-030**: Existing 195 unit tests + 50 Playwright tests MUST continue to pass without modification.

### Key Entities

- **AuditSnapshot**: the data structure assembled per recalc. Contains FlowDiagramSummary, ResolvedInputs, SpendingAdjustments, GateEvaluations[3], FireAgeResolution, StrategyRanking[7], LifecycleProjection[~58 rows], CrossValidationWarnings[]. Also exposed verbatim under the `audit` key in the Copy Debug payload.
- **FlowDiagramSummary**: an ordered array of 6 stages, each `{ stageId, label, headlineOutput, downstreamArrowLabel }`. Drives both the visual flow diagram at the top of the Audit tab and the equivalent JSON in Copy Debug.
- **GateEvaluation**: `{ mode: 'safe'|'exact'|'dieWithZero', candidateFireAge, strategyUsed, formulaPlainEnglish, formulaInputs, verdict: boolean, reason, violations: [{age, total, floor}], trajectorySeries: [{age, total}] }`. The `trajectorySeries` is the data backing the per-gate chart.
- **StrategyRow**: per-strategy entry with all per-mode feasibility booleans, end balance, tax, violations, shortfalls. The Strategy Ranking chart is rendered from the array of these rows.
- **CrossValidationWarning**: `{ kind, valueA, valueB, delta, deltaPct, expected: boolean, reason }`. Each warning's dual-bar chart is rendered from `valueA` / `valueB`.
- **ChartSeries**: every numeric series the Audit displays as a chart MUST also exist in the snapshot as a plain `{ x, y }[]` array (or `{ category, value }[]` for bar charts). Charts are visualizations of these series — never a separate computation. This makes the JSON-roundtrip property in SC-011 mechanically verifiable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A QA engineer can locate any value shown in the lifecycle chart by reading the Audit tab in under 30 seconds (cold — without prior familiarity with the dashboard).
- **SC-002**: At least one of the existing calc bugs the user has flagged (Safe at 48 depleting; DWZ at 50 plateauing; θ=0 shortfall years) becomes diagnosable from the Audit tab alone — i.e., a developer with the Copy Debug JSON can identify which calc step diverged from expectation without running the dashboard interactively.
- **SC-003**: Copy Debug JSON gains a top-level `audit` key that is deterministic (same inputs produce same JSON byte-for-byte).
- **SC-004**: The audit's `Cross-Validation` section either shows "All cross-checks passed" OR shows ≥1 specific warning identifying a real divergence — never silently passes when a divergence exists for any of the four invariants in FR-016.
- **SC-005**: All 195 existing unit tests pass, all 50 existing Playwright tests pass, plus at least 7 new Playwright tests verify: (1) the flow diagram renders 6 stages with headline outputs, (2) clicking a stage scrolls to its section, (3) every detail section renders BOTH a chart AND a table (no chart-less sections), (4) the per-year Lifecycle Projection table row count equals plan range, (5) Copy Debug includes `audit` key, (6) Cross-Validation flags a planted divergence, (7) lockstep DOM-diff between RR and Generic.
- **SC-006**: Adding Audit (including all per-section charts) does not slow recalc by more than 100ms above the current baseline when the Audit tab is the active tab (charts only render when Audit is active per FR-028 — when on a different tab, the Audit's chart renderers are skipped, so the overhead is zero on Plan/Geography/Retirement/History).
- **SC-007**: The Audit tab is fully bilingual: a Playwright test toggles language to zh-TW and confirms every section heading and plain-English verdict displays Chinese text.
- **SC-008**: Zero calc-engine modifications: a `git diff main..HEAD --stat` for the feature branch shows zero lines changed in any function inside `_simulateStrategyLifetime`, `scoreAndRank`, `rankByObjective`, `_chartFeasibility`, `isFireAgeFeasible`, `findFireAgeNumerical`, `projectFullLifecycle`, `signedLifecycleEndBalance`, `getMortgageAdjustedRetirement`, `computeWithdrawalStrategy`, `getActiveChartStrategyOptions`, or `getTwoPhaseFireNum`.
- **SC-009**: When the user reports a calc bug in the future, the bug-report template can simply ask for the Copy Debug JSON — no separate screenshots or repro steps needed for at least 80% of calc bugs.
- **SC-010**: Audit tab structure is identical between RR and Generic (Playwright DOM-diff per Constitution Principle I).
- **SC-011**: Every chart in the Audit tab is reproduced byte-for-byte in the Copy Debug `audit` JSON as the underlying data series (so a developer can re-render the same chart from the JSON alone — i.e., the chart is a visualization of debuggable data, not a separate computation).
- **SC-012**: The flow diagram's headline outputs match the corresponding detail sections — e.g., the Gate stage's headline ("Safe ✓ at age 48") matches what the Gate Evaluations section table reports for Safe at age 48. Verifiable via a Playwright test that scrapes both and asserts equality.

## Assumptions

- The existing calc-pipeline functions (`signedLifecycleEndBalance`, `findFireAgeNumerical`, `isFireAgeFeasible`, `_simulateStrategyLifetime`, `_chartFeasibility`, `scoreAndRank`, `rankByObjective`, `projectFullLifecycle`) are exposed enough on the global scope (or via the `calc/*.js` module pattern) for the Audit assembler to read their state; no API redesign is required.
- The `_lastStrategyResults` global is the canonical source for strategy ranking detail.
- The new `Audit` tab is wired through the existing `tabRouter` from feature 013; no new routing infrastructure is needed.
- The known calc regressions (Safe-mode depletion at the user's default scenario, DWZ behavior, θ=0 shortfall handling) are NOT fixed by this feature — they are made VISIBLE by it, with the expectation that a follow-up calc-fix feature will use the audit as its diagnostic surface.
- Bilingual catalogs (`TRANSLATIONS.en` / `TRANSLATIONS.zh`) and the i18n catalog markdown file are updated in lockstep with the new strings.
- Both HTML files ship the change in the same PR (Constitution Principle I — lockstep).
- **Chart library reuse**: every Audit-section chart is rendered with the existing Chart.js (already loaded for the main lifecycle chart). No new chart library, no new CDN, no build step (Constitution Principle V — Zero-Build, Zero-Dependency Delivery).
- **Flow diagram rendering**: the calculation-flow diagram at the top of the Audit tab is HTML+CSS only (flexbox boxes + arrow glyphs / borders), NOT a Chart.js chart, NOT an external library. It is a pure markup-and-styling component so it incurs zero rendering cost beyond DOM layout.
- **Chart count**: an estimated ~10–14 small charts will live in the Audit tab (1 input pie + 1 spend curve + 3 gate charts + 1 FIRE-age scatter + 1 strategy bar + 1 lifecycle thumbnail + 0..N cross-validation dual-bars). All deferred to render only when the Audit tab is the active tab (FR-028).

## Out of Scope

- No calc-engine fixes (deliberately excluded — see SC-008 and FR-029).
- No removal or refactoring of the existing `feasibilityProbe` and `summary` keys in Copy Debug — they coexist with the new `audit` key.
- No new chart LIBRARY beyond Chart.js (already in use). The Audit's small per-section charts are new chart INSTANCES, but they reuse the existing chart library.
- No export-to-CSV or export-to-PDF features — Copy Debug is the export path.
- No "what-if" controls inside the Audit tab — the audit reflects the current recalc state, it does not introduce its own input controls.
- No automated calc-bug ticket generation — the audit surfaces problems, but humans still file the tickets.
- No interactive drill-down on Audit charts (no click-to-zoom, no tooltip beyond what Chart.js gives by default) — the charts are read-only diagnostic visualizations.
