# Feature Specification: Year-by-Year Lifecycle Spreadsheet Export

**Feature Branch**: `037-lifecycle-excel-export`
**Created**: 2026-08-13
**Status**: Draft
**Input**: User description: "Lets start a new function button in the \"History\" area, where we have the records. I currently have difficulties reviewing all the results if I don't see all the numbers in a excel file broken down to years. for example, in the excel file, based on the info we have on the website, it will have in the 2026 year all the information in a row, in the year 2027, based on estimation or calculation what the values will be...etc. and the results will have to be based on what we see on the life cycle chart"

## Problem Statement

The dashboard renders the whole plan as charts. A chart answers "is the shape right?" but not "what is the number in 2043, and why?". Today the only way to read a specific year's figures is to hover a tooltip one point at a time, which makes it effectively impossible to scan the plan end-to-end, sanity-check a transition year, or compare two years side by side.

The user's stated difficulty is **reviewing all the results at once**. The fix is a downloadable spreadsheet with **one row per calendar year** — starting at the current year and running to the end of the plan — carrying the numbers behind the **Lifecycle chart**, so the file and the chart can never tell different stories.

## Dependency Decision (Constitution Principle V)

Choosing a true `.xlsx` workbook (FR-010) means the project takes on a **spreadsheet-writing library — its first third-party runtime dependency other than Chart.js**. Principle V permits this only with explicit user approval and a no-build delivery path. **The user gave that approval on 2026-08-13** by selecting the workbook option over CSV with the trade-off stated.

Constraints this decision inherits, which the plan MUST satisfy:

- **The dashboard must still load and run when opened by double-click from disk** (`file://`). ~~It must also export with no network.~~ **Corrected during planning (2026-08-13):** the project already loads Chart.js from cdnjs as its only external script and has no `vendor/` directory, so the Lifecycle chart itself does not render offline. Requiring the export to work offline while the chart it must match does not is incoherent, and Principle V explicitly permits "CDN **or** vendored single file". The binding constraint is therefore: classic-script delivery, no build step, and a **clear failure** if the library is unavailable — not offline operation. See [research.md](./research.md) R1.
- **No build step, no bundler, no `npm install` for end users.** The library ships either vendored as a single local file or via a delivery path with equivalent no-build, offline behaviour.
- **It must not be loaded as an ES module.** Principle V prohibits that pattern outright because ES module imports fail under `file://` — the exact failure that silently broke two calc modules in feature 015.
- **It must not become a dependency of the calc layer.** Only the export path may touch it; the projection stays pure and Node-testable with no knowledge that a workbook writer exists.
- **If the library is unavailable at click time, the export fails loudly** (FR-024/FR-025) rather than producing a broken or empty file.

Selecting the specific library and its delivery mechanism is a planning decision, not a specification one. What the spec fixes is the outcome: a real `.xlsx` the user can open, produced by a dashboard that still works offline from a double-click.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download the whole plan as one year-per-row table (Priority: P1) 🎯 MVP

From the History area the user clicks one button and gets a spreadsheet file. Opening it shows a header row of column names and then one row per year: the current year first, each following year carrying the projected values, through to the final year of the plan. Every number matches what the Lifecycle chart shows for that year.

**Why this priority**: This is the entire request. One button, one file, all years — without it there is no feature. It is also independently valuable: even with no other story shipped, the user can finally read the plan as a table.

**Independent Test**: Click the export button on a freshly loaded dashboard; open the downloaded file in a spreadsheet program; confirm the first data row is the current year, the last is the plan's final year, there is exactly one row per year with no gaps, and spot-checked portfolio values equal the Lifecycle chart's values for those same years.

**Acceptance Scenarios**:

1. **Given** a loaded dashboard with a rendered Lifecycle chart, **When** the user clicks the export button in the History area, **Then** a spreadsheet file downloads without any further prompts or configuration.
2. **Given** the downloaded file, **When** it is opened in a spreadsheet program, **Then** row 1 is a human-readable header row and each subsequent row represents exactly one calendar year in ascending order with no missing or duplicated years.
3. **Given** the downloaded file, **When** the user compares any year's total-portfolio figure against the Lifecycle chart at the same year, **Then** the two agree.
4. **Given** the downloaded file, **When** the user reads the first data row, **Then** it is the current calendar year and its values reflect the user's entered starting position rather than a projection.
5. **Given** the downloaded file, **When** the user reads the final data row, **Then** it corresponds to the plan's final year (the end of the Lifecycle chart's range).

---

### User Story 2 - Read each year in both money and purchasing power (Priority: P2)

For every year the file reports figures both as **money** — the dollars a bank or brokerage statement will actually show that year — and as **purchasing power**, the equivalent in today's spending capacity. Column headers state plainly which is which, so a reader can never mistake one for the other.

**Why this priority**: The dashboard's primary chart frame is money (nominal Book Value) while much of the underlying math runs in purchasing power. A spreadsheet that silently mixed the two, or shipped only one, would recreate the exact confusion this feature exists to remove. It is P2 rather than P1 because a single clearly-labelled frame is still useful; two frames make the file trustworthy.

**Independent Test**: Export, then confirm that for a given year the money column exceeds the purchasing-power column by the compounding effect of inflation over the years elapsed, that the current year's two columns are equal, and that every column header names its frame unambiguously.

**Acceptance Scenarios**:

1. **Given** the downloaded file, **When** the user inspects any money column header, **Then** it identifies the figures as statement dollars for that year.
2. **Given** the downloaded file, **When** the user inspects any purchasing-power column header, **Then** it identifies the figures as today's-spending-capacity equivalents.
3. **Given** the current year's row, **When** the user compares its money and purchasing-power values for the same measure, **Then** they are equal (no inflation has yet elapsed).
4. **Given** a year late in the plan, **When** the user compares the two frames for the same measure, **Then** the money figure is the larger of the two under any positive inflation assumption — *for the ordinary case where the value is positive*.
5. **Given** a year in which the plan has run out of money (a negative balance), **When** the user compares the two frames, **Then** both carry the **same sign** and the money figure is the larger in **magnitude** — not the larger in value. *(Added during implementation 2026-08-13: inflating a negative balance makes it more negative, so the naive "money is bigger" rule inverts for depleted years. Verified against the live converter: −$50,000 of purchasing power is −$57,964 of money at 3% over 5 years.)*

---

### User Story 3 - The file reflects the plan currently on screen (Priority: P2)

The export is a snapshot of what the user is looking at. If they change the FIRE mode, pick a different withdrawal strategy, toggle retirement status, or edit any input, the next export reflects those choices. The file records which settings produced it, so a file found on disk months later can still be interpreted.

**Why this priority**: The user's requirement is explicitly "based on what we see on the life cycle chart". An export that quietly used defaults while the chart showed something else would be worse than no export — it would be a wrong answer that looks authoritative. This mirrors the project's existing rule that any consumer of the projection must read the same active strategy the chart renders.

**Independent Test**: Export once, change the FIRE mode, export again, and confirm the two files differ in the expected years; confirm each file's recorded settings block matches the dashboard state at the time of that export.

**Acceptance Scenarios**:

1. **Given** two exports taken before and after changing the FIRE mode, **When** the files are compared, **Then** their year rows differ in a way consistent with the mode change.
2. **Given** any export, **When** the user reads its recorded settings, **Then** the settings state the FIRE mode, the active withdrawal strategy, the retirement-transition year, and the export timestamp in effect when the file was produced.
3. **Given** an export taken while a non-default withdrawal strategy is active, **When** its year rows are compared to the Lifecycle chart then on screen, **Then** they agree — the export does not fall back to the default strategy.
4. **Given** an export taken while the user is marked retired, **When** the transition year is inspected, **Then** employment income and new contributions stop at the declared retirement year, matching the chart.

---

### User Story 4 - Read the transitions, not just the balances (Priority: P3)

Each year's row marks which phase of the plan that year belongs to — still working, retired but before penalty-free retirement-account access, before Social Security has started, drawing Social Security — and flags any year where the plan cannot fund the year's spending. The reader can find the turning points by scanning a column instead of inferring them from chart colours.

**Why this priority**: Transitions are where plans break and where the user's attention actually goes. Valuable, but the balances alone already deliver the core benefit, so this can ship after US1–US3.

**Independent Test**: Export and confirm the phase column changes value exactly at the retirement transition year, at the penalty-free-access year, and at the Social Security claim year; confirm a shortfall flag appears on precisely the years the chart tints as shortfall years.

**Acceptance Scenarios**:

1. **Given** the downloaded file, **When** the user scans the phase column, **Then** its value changes exactly at the retirement transition, the penalty-free-access age, and the Social Security claim age.
2. **Given** a plan that runs short of money, **When** the user scans the shortfall flag column, **Then** it is set on exactly the years the dashboard identifies as shortfall years, and the earliest such year matches the year named in the on-screen verdict.
3. **Given** a plan that never runs short, **When** the user scans the shortfall flag column, **Then** no year is flagged.

---

### Edge Cases

- **Plan already ended / degenerate range**: the user's current age equals or exceeds the plan end age, so there is no future year to project. The export must produce a file with headers and whatever single year applies rather than an empty or malformed file.
- **Chart not yet rendered or projection unavailable**: the user clicks export during initial load, or after an input error leaves the projection unresolved. The export must refuse with a plain-language message naming what to do next, and must not download a file containing blanks, zeros, or error text masquerading as data.
- **Shortfall years and depleted portfolio**: once the portfolio is exhausted, the chart clamps displayed totals at zero while the underlying math may be negative. The file must not present a clamped zero as if the plan were solvent — a depleted year must be identifiable as such.
- **Retired-status interaction**: when retirement status is on, the transition year comes from the declared retirement year rather than the calculated feasible age. The export must use the same transition the chart uses, not recompute its own.
- **Language setting**: the user may be running the dashboard in either supported language when they export.
- **Very long plans**: a plan running to age 95+ produces roughly 50–70 rows; the file must remain readable and the download must not visibly stall the dashboard.
- **Repeated exports in one session**: exporting several times in a row must produce distinguishable files rather than silently overwriting or colliding.
- **Numbers a spreadsheet can compute on**: values must land in cells as numbers, not as pre-formatted text with currency symbols or thousands separators that a spreadsheet would treat as strings. Formatting is a cell format, never baked into the value.
- **Workbook writer unavailable**: the spreadsheet library fails to load — offline, blocked, or missing. The export must say so plainly and produce nothing, rather than downloading a zero-byte or corrupt file that Excel then offers to repair.
- **Opened straight from disk**: the user double-clicks the dashboard rather than serving it. Export must still work, since that is the project's protected delivery mode.
- **A column with no data for the whole plan**: a measure that never applies to this user (for example a pool they hold nothing in) must still appear as a column of zeros rather than being dropped, so column positions stay stable between exports (FR-015b).

## Requirements *(mandatory)*

### Functional Requirements

#### Export trigger and placement

- **FR-001**: The dashboard MUST provide a single, clearly-labelled control in the **History** area that produces the year-by-year spreadsheet file.
- **FR-002**: The control MUST be reachable without leaving the History area and MUST sit alongside the existing snapshot record actions, so "the place where the records are" remains one destination.
- **FR-003**: Activating the control MUST require no further configuration — one click yields a file.
- **FR-004**: The control's label and any status or error message it produces MUST be available in both supported languages.

#### File shape

- **FR-005**: The file MUST contain one row per calendar year, in ascending year order, with no gaps and no duplicate years.
- **FR-006**: The first data row MUST be the current calendar year; the last MUST be the final year of the plan as shown on the Lifecycle chart.
- **FR-007**: The file MUST begin with a header row naming every column in plain language.
- **FR-008**: Each row MUST state both the calendar year and the corresponding age.
- **FR-009**: Numeric values MUST be written so a spreadsheet program treats them as numbers available for arithmetic, sorting, and charting.
- **FR-010**: The file MUST be a true Excel workbook (`.xlsx`) that opens directly in Excel with no repair prompt, no import wizard, and no manual delimiter choice. *(Resolved 2026-08-13: user chose a real workbook over CSV — see **Dependency Decision** below.)*
- **FR-011**: The file MUST carry a recognisable, distinct filename that includes the export date, so repeated exports do not collide.
- **FR-011a**: Currency figures MUST carry a currency number format, and year and age MUST carry a plain integer format, so the workbook is readable without the user reformatting anything.
- **FR-011b**: The header row MUST remain visible while scrolling down the year rows, and column widths MUST be set so no heading is truncated on open.
- **FR-011c**: The workbook MUST place the year-by-year table and the settings block on separate, clearly-named sheets, so the data table stays machine-readable while the provenance stays legible.
- **FR-011d**: Because the plan's column set is wide (FR-015), the workbook MUST keep the year and age columns visible while scrolling horizontally.

#### Column content

- **FR-012**: Each year's row MUST carry that year's total portfolio value.
- **FR-013**: Each year's row MUST carry that year's value for each portfolio component the Lifecycle chart plots as its own series, so every visible line has a readable column.
- **FR-014**: The file MUST report figures in both frames — money (that year's statement dollars) and purchasing power (today's equivalent) — with headers that unambiguously distinguish them.
- **FR-015**: The export MUST carry **every per-year figure the Lifecycle projection produces**, not only the balances the chart plots. *(Resolved 2026-08-13: user chose the full audit trail.)* At minimum this means, for each year: the plotted balances (FR-013); gross employment income; federal income tax; payroll tax; the year's spending; contributions broken out by destination; the amount actually contributed after any reduction; withdrawals broken out by source; Social Security income; the funding-ladder outcome for a short year (contribution cut, cash drawn, brokerage drawn); and the tax breakdown detail the projection already computes.
- **FR-015a**: Columns MUST be laid out in a stated, stable order and grouped by meaning — identity (year, age, phase) first, then balances, then income and tax, then spending, then contributions, then withdrawals, then funding-ladder and diagnostic fields — so a wide sheet remains navigable.
- **FR-015b**: The column order MUST be stable across exports so a user can diff or stack two files from different dates.
- **FR-015c**: Where a figure is meaningful in only one phase (for example, employment income during accumulation or withdrawals during drawdown), the inapplicable years MUST be unambiguously empty or zero — never blank in a way that reads as missing data.
- **FR-016**: Each row MUST identify which phase of the plan the year falls in.
- **FR-017**: Each row MUST flag whether that year's spending could not be fully funded.
- **FR-018**: A year in which the portfolio is exhausted MUST be distinguishable from a year in which it merely reaches zero on the chart's clamped display.

#### Fidelity to the on-screen plan

- **FR-019**: Every value in the file MUST come from the same projection that renders the Lifecycle chart, for the same active FIRE mode, withdrawal strategy, objective, mortgage strategy, and retirement status in effect at the moment of export. The export MUST NOT recompute the plan under default settings.
- **FR-020**: The file MUST record the settings that produced it — at minimum the FIRE mode, the active withdrawal strategy, the retirement transition year, and the export timestamp — so a file read later remains interpretable.
- **FR-021**: When the user is marked retired, the export MUST use the declared retirement transition rather than the calculated feasible age.
- **FR-022**: The export MUST NOT alter any dashboard state, input, stored record, or chart as a side effect of producing the file.

#### Scope of records included

- **FR-023**: The workbook MUST contain **only the forward-looking projection** — the current year through the plan's end. *(Resolved 2026-08-13: user chose projection-only.)* Recorded historical snapshots MUST NOT be mixed in.
- **FR-023a**: The existing snapshot export control MUST remain unchanged and continue to be the way recorded history leaves the dashboard. The new control MUST be visually distinct from it so the two are not confused.

#### Failure behaviour

- **FR-024**: If the projection is unavailable or incomplete when the control is activated, the export MUST be refused with a plain-language message that says what the user should do, and MUST NOT produce a file.
- **FR-025**: A refused or failed export MUST leave no partial file and MUST NOT silently substitute zeros, blanks, or placeholder text for real values.

#### Parity

- **FR-026**: The feature MUST ship to both dashboards with identical behaviour, except where a dashboard genuinely lacks a data source the other has, in which case the difference MUST be stated in the plan.

### Key Entities

- **Projected Year Row**: one calendar year of the plan. Carries the year, the age reached and plan phase; the total portfolio and each plotted component in both money and purchasing-power frames; the year's income, taxes, spending, contributions by destination, withdrawals by source, and Social Security income; the funding-ladder outcome for a short year; and a funding-shortfall flag. Ordered ascending; one per year from the current year to the plan's end.
- **Export Settings Block**: the plan configuration in force when the file was produced — FIRE mode, active withdrawal strategy, retirement transition year, export timestamp. Makes a file interpretable after the dashboard has moved on.
- **Export Workbook**: the downloadable `.xlsx` artifact. Two named sheets — a **projection sheet** holding the header row plus the ordered run of Projected Year Rows (frozen header, frozen identity columns, currency and integer number formats), and a **settings sheet** holding the Export Settings Block. Named distinctly per export, with the export date in the filename.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from a loaded dashboard to an open spreadsheet showing every year of their plan in under 30 seconds and a single click, with no configuration step.
- **SC-002**: For every year in the file, the total portfolio figure matches the Lifecycle chart's value for that year — zero disagreements across the full plan range.
- **SC-003**: The file contains exactly one row per year from the current year through the plan's final year, with no gaps, duplicates, or out-of-order rows.
- **SC-004**: Changing the FIRE mode, the withdrawal strategy, or retirement status and re-exporting produces a file whose year rows match the newly-rendered chart — in 100% of combinations tested.
- **SC-005**: A reader who has never seen the dashboard can tell, from column headers alone, which figures are statement dollars and which are today's purchasing power — with no external explanation.
- **SC-006**: Every numeric cell is usable in a spreadsheet formula without cleaning, retyping, or find-and-replace.
- **SC-007**: The earliest shortfall year flagged in the file is the same year named in the dashboard's on-screen verdict, whenever the plan runs short.
- **SC-008**: Exporting leaves the dashboard's inputs, saved records, and charts unchanged — verifiable by comparing state before and after.
- **SC-009**: Both dashboards produce files with identical structure for identical inputs.
- **SC-010**: Clicking export when the projection is unavailable yields an understandable message and no downloaded file — never a file of zeros.
- **SC-011**: The downloaded workbook opens in Excel with no repair prompt and no import wizard, on first attempt.
- **SC-012**: Export works with the dashboard opened directly from disk (`file://`) rather than served. *(Amended during planning: the original wording also required networking disabled. The Lifecycle chart itself needs the network, so that bar was incoherent — offline now yields a clear "export unavailable" message and no file, per SC-010.)*
- **SC-013**: Every figure the Lifecycle projection computes for a year is present in that year's row; a reviewer auditing one year against the dashboard's own detail view finds no missing measure.
- **SC-014**: A user scrolling to the last year of a wide sheet can still see which year and age they are reading.

## Assumptions

- **One continuous forward-looking table.** "In 2026 all the information in a row, in 2027 based on estimation" is read as: the current year is the starting position and every later year is projected, in one table, to the plan's end. The current year is therefore the first data row, not a historical record.
- **The Lifecycle chart is the authority.** Where any other view of the plan disagrees with the Lifecycle chart, the chart wins — the user said the results must be based on it. The export reads the same projection the chart reads, at the same active settings.
- **Both money and purchasing power ship, both labelled.** Rather than choosing one frame, the file carries both. This follows the project's standing terminology rule: money is what a statement shows; purchasing power is a comparison to today's spending capacity, and the two are never conflated.
- **Snapshot of the moment, not a live link.** The file is a static export reflecting the dashboard at click time. It does not update afterwards and is not re-read by the dashboard.
- **Read-only.** Export is a pure output action with no effect on inputs, stored records, or the CSV snapshot history.
- **Both dashboards, lockstep.** Per the project's dual-dashboard rule, the feature ships to the personalised and the public dashboard alike; the user did not scope it to one.
- **Bilingual.** All new user-visible text ships in both supported languages, as every user-visible string in this project must.
- **Existing download mechanics are reusable.** The History area already downloads a snapshot file, so a proven in-browser download path exists and no new delivery mechanism is assumed.
- **Row volume is modest.** A plan to age 95 is on the order of 50–70 rows, so no pagination, streaming, or chunking is assumed. The file is wide (FR-015) rather than long.
- **One new runtime dependency, approved.** A spreadsheet-writing library is in scope per the **Dependency Decision** section above, subject to the offline / no-build / no-ES-module constraints recorded there. No other new dependency is assumed.
- **Width is accepted in exchange for completeness.** The user chose the full audit trail over a narrow, chart-only sheet. The file will require horizontal scrolling; frozen identity columns and column grouping (FR-011d, FR-015a) are the mitigation, not a reduced column set.
- **"All the numbers" means all the numbers the projection already computes.** It does not mean deriving new figures that the dashboard does not currently calculate. If a figure the user expects turns out not to exist in the projection, that is a finding for the plan, not a silent omission.

## Out of Scope

- Editing the plan from the spreadsheet, or importing a modified file back into the dashboard.
- Charts, pivot tables, conditional formatting, or spreadsheet formulas inside the exported file. Number formats, a frozen header row, frozen identity columns, set column widths, and a separate settings sheet are **in** scope (FR-011a–d); anything beyond that presentation floor is not.
- Mixing recorded historical snapshots into this workbook, or changing the existing snapshot export (FR-023/FR-023a).
- Exporting any view other than the Lifecycle projection — the withdrawal-strategy matrix, the country comparison, the tax estimator, and the audit tables keep their existing surfaces.
- Scheduled, automatic, or server-side export; emailing or uploading the file anywhere.
- Changing how the Lifecycle chart itself calculates or renders. If the export and the chart disagree, the export is wrong.
- Comparing two scenarios side by side in one file.
