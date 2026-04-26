# Feature Specification: SSA Earnings Record — Support Years Before 2020

**Feature Branch**: `012-ssa-earnings-pre-2020`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "lets work on that memo where we found that we can't add years in the SS record in front of the year 2020"
**Source memo**: `BACKLOG.md` §U6 — "SSA Earnings Record cannot add pre-2020 years"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Enter a pre-2020 earnings year manually (Priority: P1)

A user with US work history that starts before 2020 opens the dashboard, reviews the SSA Earnings Record table, and needs to add years that fall **before** the current first row. Today the record is seeded with 2020 as the earliest year and the only control available — "+ Add Year" — appends a year **after** the latest row. The user needs a way to extend the table **backwards in time** so every year in their actual SSA statement (including years like 2005, 2012, 2019) can be captured.

**Why this priority**: This is the primary, blocking defect reported in the memo. Without it, any user with a work history older than 2020 cannot enter the earnings that drive the "highest 35 years" AIME calculation. The projected Social Security benefit is silently understated, which causes users to over-save for FIRE or retire later than necessary. No workaround exists inside the UI today.

**Independent Test**: Load the dashboard cold. Starting from the default record (2020→2025), click "+ Add prior year" (or equivalent control) six times. Verify the table now shows six additional rows for 2014, 2015, 2016, 2017, 2018, 2019 at the top of the list, the rows remain in strictly ascending year order, each new row starts with an empty/zero earnings value that the user can edit, and the "credits" column reflects the new row's contribution (4 per earning year by default) in the totals summary.

**Acceptance Scenarios**:

1. **Given** the default record with earliest year 2020, **When** the user activates the "add prior year" control, **Then** a new row appears at the top of the table for year 2019, with an editable earnings input defaulting to 0 (or a clearly-editable placeholder) and a credits value of 4, and the table order remains oldest-to-newest.
2. **Given** the record already contains 2015–2025, **When** the user activates "add prior year" three times, **Then** rows for 2012, 2013, 2014 appear at the top, the table remains strictly ascending, and no duplicate years are created.
3. **Given** the user has added 2019 and entered $62,000, **When** the page is reloaded, **Then** the 2019 row persists with its $62,000 earnings value and counts toward the AIME/PIA calculation as expected.
4. **Given** the user has added prior years with non-zero earnings, **When** they view the Social Security projection chart/metric, **Then** the projected annual benefit reflects the additional years (benefit ≥ the benefit before the years were added, and strictly greater whenever at least one new year raises the top-35 indexed total).

---

### User Story 2 — Bulk-enter a full history without clicking dozens of times (Priority: P2)

A user whose first year of US earnings is 1995 does not want to click "add prior year" 25 times. They want to set an "earliest work year" (or equivalent starting point) and have the table expand to that year automatically, then fill in earnings for each row.

**Why this priority**: It eliminates a repetitive, frustrating interaction for the long-history case (the exact user that most benefits from the fix). Delivers a noticeable UX win once P1 ships. Not strictly required to resolve the reported defect, so it rides behind P1.

**Independent Test**: Set "earliest year" to 1995. Verify the table now contains a row for every year from 1995 through the current latest year, in ascending order, with no duplicates, and each added row is editable and initialized to 0.

**Acceptance Scenarios**:

1. **Given** the default table (2020–2025), **When** the user specifies 1995 as the earliest year, **Then** the table expands upward to include every year from 1995 through 2019 (inclusive) plus the original rows, 25 new rows in total, sorted ascending.
2. **Given** the user typed an earliest year newer than the current earliest (e.g., 2023 when first row is 2020), **When** they confirm, **Then** the table is not shrunk — no rows are lost — and the user is shown a non-blocking note that nothing changed because their existing record already covers that year.

---

### User Story 3 — Prevent invalid entries and data loss (Priority: P2)

When the user adds or edits years, the system must protect the integrity of the earnings record: no duplicate years, years stored as integers, ascending order preserved, and pre-existing entered values never overwritten by a "add prior year" action.

**Why this priority**: A feature that silently corrupts the earnings record would be worse than the current limitation. These guardrails are cheap to specify now and expensive to retrofit once users have committed data to localStorage.

**Independent Test**: Attempt each failure case listed below and confirm the system rejects it with a clear, user-visible message and no data loss.

**Acceptance Scenarios**:

1. **Given** the record contains 2018, **When** the user attempts to add a prior year that would create a duplicate 2018 row, **Then** no new row is created and the user is informed (inline or toast) that 2018 already exists.
2. **Given** the user types a non-integer or negative earnings value into a row, **When** the input loses focus, **Then** the value is rejected or coerced to a valid non-negative number and the projection does not display NaN.
3. **Given** the user has entered earnings for 2015–2019 and reloads the page, **When** they click "add prior year" to add 2014, **Then** 2015–2019 retain their entered earnings and only a new 2014 row is prepended.
4. **Given** the record has reached a configured floor (e.g., 1960), **When** the user tries to add another prior year, **Then** the action is a no-op and the user is shown a short message explaining the floor.

---

### User Story 4 — Dashboard-to-dashboard consistency (Priority: P3)

If and when a second personalized dashboard file is reintroduced alongside the Generic dashboard (per the project's dual-dashboard convention documented in `CLAUDE.md`), the same capability must be available and must behave identically.

**Why this priority**: The only HTML dashboard currently present in the working tree is `FIRE-Dashboard-Generic.html`. `FIRE-Dashboard.html` is not present at the time of this spec, so a parity fix cannot be verified. This item is a forward-looking requirement for whoever re-introduces the RR dashboard; it is strictly lower priority than the user-visible P1 fix.

**Independent Test**: If `FIRE-Dashboard.html` is added to the repo before this feature ships, the QA engineer loads both files, performs User Story 1 in each, and confirms identical behaviour.

**Acceptance Scenarios**:

1. **Given** both `FIRE-Dashboard-Generic.html` and `FIRE-Dashboard.html` are present, **When** User Story 1 is performed in either file, **Then** both files produce the same resulting table state and the same projected Social Security benefit (given identical other inputs).

---

### Edge Cases

- User enters an earnings value that exceeds the annual SSA contribution-and-benefit base (the "wage cap") for that year. The system must store what the user typed (the SSA record reflects actual reported wages, even if some of it is above the cap) but must not include any portion above the SSA cap for that specific year in AIME/PIA contribution. (This is a pre-existing behaviour in the actual-earnings mode; the feature must preserve it for prepended years.)
- User prepends a year that pushes the record past 35 entries. The AIME calculation already picks the top-35 by indexed value, so extra years are expected; the UI must not block this and must not hide years.
- User prepends a year earlier than the dashboard's earliest supported calculation year (e.g., 1950). The system must either (a) accept it if within the configured floor or (b) reject it with a clear message if outside.
- User loads a previously-saved state that already contains pre-2020 years (e.g., they manually edited localStorage or imported a state file from an older/branched build). The table must render those rows correctly without re-sorting or deduplication surprises.
- Language toggle (EN ↔ 中文) while the earnings table is visible: the new "add prior year" control's label must update with the language switch (parity with `ss.addYear`).
- Empty earnings years (a legal SSA record state — e.g., a year of unemployment, study abroad, or military service with no covered earnings). The record must accept $0 as a valid, non-destructive value that counts as a zero entry in the top-35 selection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide a user-visible control that adds a new earnings row **chronologically before** the current earliest row (i.e., prepends `earliestYear − 1`).
- **FR-002**: The "add prior year" control MUST create an editable row with earnings defaulting to a clearly-empty value (0, empty, or a placeholder the user can overwrite) and credits defaulting to the same default the "+ Add Year" control uses today (4).
- **FR-003**: The earnings table MUST always be sorted strictly ascending by year after any add/remove operation, with no duplicate years.
- **FR-004**: Prepending a prior year MUST NOT overwrite, reorder, or drop any existing row or any value the user has previously entered.
- **FR-005**: The system MUST persist prepended rows across page reloads using the same persistence mechanism the current `ssEarningsHistory` uses (localStorage, the same state key the "+ Add Year" path writes to).
- **FR-006**: The Social Security projection (PIA, AIME, annual benefit, and the SS chart) MUST consume prepended rows via the same calculation code path as other rows — i.e., the fix is a UI/data-entry change, and the top-35 AIME calculation in `calc/socialSecurity.js` must see the new rows with no per-feature branching.
- **FR-007**: The system MUST enforce a configurable earliest-year floor (default: 1960). Attempts to prepend before the floor MUST be blocked with a short, non-blocking user-visible message and MUST NOT modify the record.
- **FR-008**: The system MUST reject any attempt to add a duplicate year, regardless of whether it originates from "Add Year", "Add prior year", or a bulk "earliest year" entry, and MUST communicate the rejection to the user.
- **FR-009**: The system MUST coerce or reject non-numeric, negative, or non-finite earnings values entered by the user, such that the downstream Social Security projection never produces NaN, −Infinity, or negative benefits because of a single bad row.
- **FR-010**: All new user-visible strings (button labels, tooltips, error messages) MUST be available in both currently-supported languages (EN and 中文/zh-TW), reusing the existing i18n catalog pattern.
- **FR-011**: The credit tally displayed beneath the table ("Credits: N / 40") MUST include credits from prepended rows so the user can see progress toward the 40-credit SS eligibility threshold.
- **FR-012**: A prepended row that the user leaves empty MUST be treated as a valid $0-earnings year for AIME purposes (SSA allows $0 years in the 35-year selection); the UI SHOULD display a low-emphasis visual hint that the row is empty, but MUST NOT block the page or the projection.
- **FR-013**: Whenever the dashboard is present in the repo under a second filename (e.g., a re-introduced `FIRE-Dashboard.html` per `CLAUDE.md`'s lockstep rule), this feature's behaviour MUST apply identically to that file. Implementation work MUST ship to both files in the same commit, or the commit MUST explicitly document why only one file is touched.

### Key Entities *(include if feature involves data)*

- **Earnings Record Row**: one year of SSA-reported earnings. Attributes: calendar year (integer), nominal earnings (non-negative real number, user-entered, in the currency shown on the user's SSA statement — USD in the current single-currency scope), credits (integer, default 4 when the row has non-zero earnings, 0 otherwise — display-only; credits are not used in AIME but are used for the "40 credits / 10 years" eligibility indicator).
- **Earnings Record**: ordered list of Earnings Record Rows, strictly ascending by year, no duplicate years. Persisted alongside the rest of the dashboard state. Consumed by the actual-earnings mode of the Social Security projection (see `calc/socialSecurity.js` module header).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with 25 years of pre-2020 US earnings can enter the full history in under 3 minutes of interaction time (from cold-load of the dashboard to a saved state with 25 prepended rows carrying their values).
- **SC-002**: For a canonical fixture user with earnings from 1995–2025 (31 years, varied amounts), the projected annual Social Security benefit computed after this feature ships is within 2% of the value the user would see on `ssa.gov`'s Retirement Estimator using the same earnings history, given the dashboard's already-documented simplifying assumptions (integer claim ages, inflationRate as wage-index proxy, 2026 bend points).
- **SC-003**: 100% of pre-2020 years entered by a user in a single session persist across a page reload without loss or reordering.
- **SC-004**: Zero cases where a user entering invalid input (empty, non-numeric, negative, or above-cap) causes the projection to display NaN, "Calculating…", `—`, or a visibly broken chart. In all invalid-input cases the system either coerces or rejects, and the projection updates to a finite, non-negative number within one animation frame.
- **SC-005**: The number of support/"why is my SS benefit so low?" bug reports or BACKLOG entries traced to the pre-2020 limitation drops to zero after one full release cycle post-ship.

## Assumptions

- **Dashboard file scope**: At the time of writing, the only dashboard HTML file present in the working tree is `FIRE-Dashboard-Generic.html`. The BACKLOG entry and `CLAUDE.md` both reference a second file (`FIRE-Dashboard.html` — the "RR" dashboard) that applies the lockstep-update rule. This spec assumes that if `FIRE-Dashboard.html` is re-introduced before implementation lands, the feature ships to both files per the lockstep rule; otherwise the feature ships to `FIRE-Dashboard-Generic.html` only and FR-013 remains a forward-looking constraint.
- **Currency and locale**: Earnings are assumed to be entered in USD, matching the existing single-currency scope of the SSA earnings UI. Internationalisation of the currency itself is out of scope for this feature.
- **Calculation surface**: The Social Security calc module (`calc/socialSecurity.js`) already implements the actual-earnings mode with 35-year-indexed AIME and 2026 bend points. This feature does not alter the math; it only extends the data-entry surface feeding that module.
- **Persistence**: The existing `ssEarningsHistory` state already round-trips through `saveState` / `restoreState` via the `_ssEarningsHistory` key; prepended rows are expected to follow the same path with no schema change.
- **Floor year**: The proposed earliest-year floor of 1960 is an informed default, covering any user currently planning FIRE who started earning as a teenager in the early 1960s. This is a soft UI floor, not a calc-level constraint; it can be loosened in a follow-up without a schema change.
- **Credits column**: The existing "credits: 4 per working year" default is treated as the display default for new rows. This feature does not reopen the design of the credits column.
- **Out of scope**: SSA bend point updates, spousal/survivor benefit modeling, month-level claim granularity, separate wage-growth vs inflation rate, currency localization, and SSA statement file-import (PDF/CSV upload) — all remain deferred to their respective future features.
