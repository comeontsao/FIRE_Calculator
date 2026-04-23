# Feature Specification: Generic Dashboard — Single-Person Mode

**Feature Branch**: `009-single-person-mode`
**Created**: 2026-04-23
**Status**: Draft
**Input**: User description: "I just realized that for the generic dashboard, we don't have the option to have this planned for a single person. so we need to have the option to remove 2nd person. please do the research how this will effect the calculation. we need to plan this carefully"

## Clarifications

### Session 2026-04-23

- Q: Is the household-size control a binary toggle or a numeric counter like the kids control? → A: Numeric counter **1–2**, default 2, modeled after the existing children-counter UX (±buttons / add / remove). Value stored as an integer adult count, not as a mode enum.
- Q: Where does the adults counter render on the page? → A: Inside the **same "Household composition" block as the children counter**, so both controls sit side-by-side (Adults: 2 ±, Children: N ±). No separate household card; no split across Person 1 / Person 2 rows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Planner decrements the adults counter from 2 to 1, partner inputs collapse, plan recalculates under Single filing status (Priority: P1)

A FIRE planner who lives alone opens the Generic dashboard, finds the "Household composition" block in the Profile & Income section (Adults: 2 ± next to Children: N ±), decrements adults from 2 to 1, and immediately sees the partner-specific inputs disappear (Person 2 birthday, Person 2 stocks, spousal Social Security). The dashboard recomputes every projection under Single-filer tax rules, single-adult healthcare baselines, and no spousal Social Security add-on. All their already-entered single-person data (Person 1 birthday, 401(k), their own stocks, income) is preserved.

**Why this priority**: Without this, the Generic dashboard mathematically cannot serve a single-person household. A solo planner is forced to leave Person 2's fields as zeros, but the tax engine still treats them as Married-Filing-Jointly (because the Person 2 birthday field silently stays populated with a default date), leading to systematically under-estimated federal tax, wrong IRMAA thresholds, and incorrect FIRE-number output. This is a correctness bug, not a nice-to-have — any solo user today gets misleading numbers.

**Independent Test**: Can be fully tested by loading the dashboard, decrementing the Adults counter from 2 to 1, confirming that (a) every partner input disappears from the UI, (b) the "Filing status" display flips from MFJ to Single, (c) the tax-bracket defaults (std-ded, top-of-12%, IRMAA threshold) swap to Single-filer values, (d) the FIRE number re-computes and is visibly different from the couple scenario, and (e) reloading the page preserves the adult count.

**Acceptance Scenarios**:

1. **Given** the Generic dashboard with default settings (Adults: 2), **When** the user decrements Adults to 1, **Then** Person 2 birthday, Person 2 Stocks/Brokerage, and Spouse's own SS monthly benefit inputs are hidden (not merely zeroed), and the Filing Status label now reads "Single."
2. **Given** Adults = 1, **When** the user clicks recalculate or edits any other input, **Then** tax calculations apply the Single-filer brackets ($15K std-ded, $47,150 top-of-12%, $106K IRMAA threshold) as the base defaults.
3. **Given** Adults = 1 with a non-zero Person 1 401(k) balance and Social Security history, **When** the lifecycle chart renders, **Then** the Social Security curve uses only Person 1's own PIA (no spousal 50% add-on).
4. **Given** the user had entered Person 2 stocks and Social Security estimate, **When** they decrement Adults to 1, **Then** those values are preserved but not applied (hidden, not zeroed), and if they re-increment Adults to 2 the previous values reappear unchanged.
5. **Given** Adults = 1 was last selected, **When** the user reloads the page, **Then** Adults = 1 is still active after reload.
6. **Given** Adults = 1, **When** the user saves a snapshot, **Then** the snapshot row records the adult count and the Person 2 Stocks column reads 0.

---

### User Story 2 — Single-adult healthcare baselines apply automatically when Adults = 1, including single-parent households (Priority: P1)

When the planner has Adults = 1, the healthcare cost defaults used by the dashboard should assume one adult (not two) on the plan, with kids still scaled in if the planner has children. A single parent with any number of kids is a first-class scenario, not an edge case. Post-65 Medicare costs should likewise assume an individual enrollee, not a couple. Every country's pre-65 and post-65 healthcare line must reflect the smaller adult head-count.

**Why this priority**: Healthcare is the single largest line item the FIRE math cares about in the US (ACA) and a non-trivial line in every other country. If the dashboard keeps charging the planner a couple's premium when they live alone, the FIRE number is overstated by thousands to tens of thousands of dollars per year — a material error. Single-parent households are especially exposed because they already carry per-kid costs.

**Independent Test**: Set Adults = 1 with zero kids. Compare the displayed pre-65 and post-65 healthcare dollars for the US scenario against the Adults = 2, 2-kids defaults. Single-adult pre-65 must be materially lower (the single-adult share of the family-of-4 reference per the existing scale formula), and post-65 must be approximately half of the published couple rate. Repeat with Adults = 1 + 2 kids to confirm per-kid scaling still applies on top of the single-adult base.

**Acceptance Scenarios**:

1. **Given** Adults = 1 with zero kids, **When** the user views any country card's healthcare line, **Then** the pre-65 cost is the single-adult share of the family reference, not the couple share.
2. **Given** Adults = 1 with 2 kids (single parent), **When** the user views the US healthcare line, **Then** the pre-65 cost equals single-adult + 2 kids (kids still scale per existing per-child share), which is measurably lower than Adults = 2 + 2 kids.
3. **Given** Adults = 1, **When** the user views post-65 healthcare, **Then** the displayed cost is the single-Medicare-enrollee rate (approximately half of the couple-Medicare reference), not the full couple rate.
4. **Given** the user has manually overridden the pre-65 or post-65 healthcare dollar field, **When** they change the Adults counter, **Then** their override is preserved and the automatic scaling does not overwrite it.

---

### User Story 3 — Household-composition block groups Adults and Children counters in one place (Priority: P2)

The "Household composition" block sits in the Profile & Income section and contains two parallel counters: Adults (default 2, range 1–2) and Children (default matches existing kids default, range 0–N). Both counters use the same ±button UX so users learn one pattern. Help text next to the Adults counter explains in one sentence that setting it to 1 switches tax brackets, healthcare scaling, and Social Security to single-person defaults. Decrementing adults does not destroy Person 2's previously entered data — it hides it.

**Why this priority**: Control discoverability and parallelism with the existing kids UX determine whether users actually find the feature and trust it. A user who can't find the counter will keep seeing the wrong tax math. A user who decrements to 1 and loses their Person 2 stocks balance will never trust the tool again.

**Independent Test**: Ask a user unfamiliar with the dashboard to plan as a single person. Observe whether they locate the Adults counter without prompting (expected: yes, because it sits next to the already-familiar kids counter) and whether their Person 2 entries survive a 2→1→2 round-trip.

**Acceptance Scenarios**:

1. **Given** the dashboard is loaded, **When** the user scans the Profile & Income section, **Then** the Household composition block is visible with two counters labeled "Adults" (value 2) and "Children" (value N), visually grouped, without needing to scroll or expand an accordion.
2. **Given** the user hovers or taps the help tip on the Adults counter, **When** the tooltip appears, **Then** it explains in one sentence that setting Adults to 1 switches tax brackets, healthcare scaling, and Social Security to single-person defaults.
3. **Given** the user has Person 2 data entered, **When** they decrement Adults 2 → 1 → then re-increment 1 → 2, **Then** Person 2 fields show their original values after the re-increment, byte-for-byte unchanged.
4. **Given** Adults = 1, **When** the user looks at the Filing Status row in the tax-planning section, **Then** the status reads "Single" (in English) or the Traditional-Chinese equivalent; not "MFJ."
5. **Given** Adults is at its minimum (1), **When** the user clicks the decrement button, **Then** the control does not decrease below 1 (either disabled or no-op).
6. **Given** Adults is at its maximum (2), **When** the user clicks the increment button, **Then** the control does not increase above 2 (either disabled or no-op).

---

### User Story 4 — Localization and snapshots honor the adult count (Priority: P3)

All new text introduced by this feature (Adults label, Children label if newly added, the Household composition heading, any help copy, counter button aria-labels) is available in both English and Traditional Chinese. The snapshot CSV schema records the adult count so users can compare snapshots taken in different household configurations.

**Why this priority**: The Generic dashboard is bilingual by design. Leaving a new control in English breaks that contract. CSV schema continuity matters because snapshots from before this feature landed still need to be readable; so does the ability to filter or color snapshots by adult count after the feature lands.

**Independent Test**: Switch to 繁體中文, locate the Household composition block, verify the Adults label and tooltip are Chinese. Save a snapshot with Adults = 1 and confirm the CSV file contains a column recording the adult count as an integer.

**Acceptance Scenarios**:

1. **Given** the language toggle is set to 繁體中文, **When** the Household composition block is rendered, **Then** the Adults label, tooltip, and any counter button aria-labels are in Traditional Chinese.
2. **Given** Adults = 1, **When** the user saves a snapshot, **Then** the CSV row contains an integer `1` in a new "Adults" column (appended, not inserted, per CSV schema discipline).
3. **Given** a user imports a snapshot CSV saved before this feature existed, **When** the dashboard reads it, **Then** the missing Adults column is interpreted as 2 (backward-compatible default).

---

### Edge Cases

- **Single parent (Adults = 1, Children ≥ 1)**: First-class scenario, not an edge case. Healthcare scaling formula adds per-kid share on top of the single-adult base; filing status is Single (Head-of-Household is separately out of scope — see Assumptions).
- **Mid-plan death of a spouse**: Not modeled. The counter is a static household configuration, not a life-event timeline. (Out of scope.)
- **Zero 401(k) and zero stocks with Adults = 1**: Must still produce a valid FIRE projection (from cash + taxable + Social Security).
- **Social Security with no work history**: Already handled by existing logic (PIA floors at zero); Adults = 1 must not break that path.
- **User starts at Adults = 1, then re-increments to 2**: Person 2 inputs reappear with whatever values they last held (empty defaults if never entered).
- **Counter bounds**: Adults cannot be decremented below 1 nor incremented above 2. The decrement/increment buttons must be visually disabled or no-op at the bounds. (See Acceptance Scenarios US3-5 and US3-6.)
- **Snapshots with different adult counts**: The dashboard should not silently compare across adult counts without flagging the difference in the snapshot history view.
- **Initial state of new installs**: Defaults to Adults = 2 (preserves existing behavior; zero migration risk for current users).

## Requirements *(mandatory)*

### Functional Requirements

**Household composition control**

- **FR-001**: The Generic dashboard MUST expose an Adults counter with range 1–2 and default value 2, rendered using the same ±button UX pattern as the existing Children counter.
- **FR-002**: The Adults counter MUST live inside a single "Household composition" block that also contains the Children counter, so both controls sit side-by-side. This block MUST be located in the Profile & Income section.
- **FR-003**: The Adults counter's decrement button MUST be disabled or no-op when the value is 1; the increment button MUST be disabled or no-op when the value is 2.
- **FR-004**: The Adults counter's selected value MUST persist across reloads via the existing localStorage state-persistence mechanism.
- **FR-005**: The Adults counter label, tooltip, and any button aria-labels MUST be localized in both English and Traditional Chinese.

**Input visibility and preservation**

- **FR-006**: When Adults = 1, the dashboard MUST hide (visually remove from layout, not merely zero): the Person 2 birthday input, the Person 2 Stocks/Brokerage input, and the Spouse's own Social Security monthly benefit input.
- **FR-007**: Hidden Person 2 values MUST be preserved in memory and in localStorage so that re-incrementing Adults to 2 restores the previously entered values byte-for-byte.
- **FR-008**: When Adults = 1, the snapshot history UI MUST either hide or visually de-emphasize the Person 2 Stocks column.

**Tax engine behavior**

- **FR-009**: When Adults = 1, the filing-status detection MUST return "Single," which MUST propagate to every tax calculation (bracket lookup, standard deduction, LTCG brackets, IRMAA threshold). When Adults = 2, filing status MUST remain MFJ.
- **FR-010**: When Adults = 1, the default values applied by the filing-status defaults helper (standard deduction, top-of-12% bracket, IRMAA threshold) MUST match the published Single-filer 2026 estimates already defined in the existing codebase (Single: $15,000 std-ded, $47,150 top-of-12%, $106,000 IRMAA Tier-1).
- **FR-011**: If the user has manually edited any of those three filing-status-driven fields, their value MUST NOT be overwritten when the Adults counter changes (existing user-edit tracking via `data-user-edited='1'` MUST be respected).

**Social Security**

- **FR-012**: When Adults = 1, the combined household PIA used in every drawdown, country card, milestone, and KPI MUST equal Person 1's own PIA only — no 50% spousal add-on, no `ssSpouseOwn` override, no `spousePIA` term.
- **FR-013**: When Adults = 1, the "Spouse's own SS monthly benefit" override input MUST be hidden (FR-006) and its in-memory value MUST be treated as if zero by the SS math while hidden.

**Healthcare scaling**

- **FR-014**: When Adults = 1, the pre-65 healthcare family-size factor MUST treat the household as one adult plus any kids still on the plan (under age 22). The per-kid share formula MUST remain unchanged, so a single parent still incurs per-kid scaling on top of the single-adult base.
- **FR-015**: When Adults = 1, the post-65 healthcare cost MUST use the single-Medicare-enrollee rate (approximately half of the couple-Medicare reference baked into the per-country table), not the couple rate.
- **FR-016**: With Adults = 1 and zero kids, the pre-65 healthcare cost MUST be materially lower than the Adults = 2, zero-kids equivalent (specifically, the single-adult share of the family-of-4 reference).
- **FR-017**: The user's manual override of either `hcOverridePre65` or `hcOverridePost65` MUST take precedence over automatic scaling (existing behavior preserved).

**Portfolio math**

- **FR-018**: When Adults = 1, `person2Stocks` MUST NOT contribute to net worth, accessible balance, or any taxable-pool withdrawal calculation. Because `person2Stocks` is preserved (FR-007), its contribution MUST be suppressed at read time, not by zeroing the stored value.
- **FR-019**: The expense table and country cost multipliers MUST NOT change based on the Adults counter (expenses are already single-total and country multipliers are already household-level, not per-person). No further requirement.

**Projections and charts**

- **FR-020**: Every chart that currently renders with Adults = 2 MUST render an equivalent, numerically consistent version with Adults = 1: Full Portfolio Lifecycle, Portfolio Drawdown (With/Without SS), Country Comparison bars, Strategy Compare, Lifetime Withdrawal stacked bars, Monthly Expense pie, Net Worth pie, Savings Rate gauge, What-If card.
- **FR-021**: Strategy ranking and feasibility gates (Safe / Exact / Die-With-Zero) MUST behave identically aside from the downstream tax and healthcare inputs changing.
- **FR-022**: Drag-to-adjust FIRE age MUST continue to work and produce the correct single-adult result when Adults = 1.

**Snapshots**

- **FR-023**: The snapshot CSV schema MUST append (not insert) a single new "Adults" column that records the integer adult count (1 or 2) at the time the snapshot was taken.
- **FR-024**: When loading a CSV without the "Adults" column, the dashboard MUST assume 2 (backward-compatible).
- **FR-025**: The snapshot history UI MUST display the adult count for each row in a way that makes cross-household-size comparisons visually distinguishable.

**Out of scope (explicitly)**

- **FR-026**: Head-of-Household filing status is out of scope; a single parent will be treated as Single filer.
- **FR-027**: Modeling a spouse who dies partway through retirement is out of scope.
- **FR-028**: Adults > 2 is out of scope; the counter is hard-capped at 2 (per Q1 clarification). Three-adult households are not supported in v1.
- **FR-029**: The RR dashboard (`FIRE-Dashboard.html`) is explicitly excluded from this feature. RR is Roger-and-Rebecca-specific and remains a two-person plan by design. Both dashboards normally move in lockstep, but this feature is Generic-only.

### Key Entities

- **Adult count**: A single integer in the range [1, 2], default 2. Owns the behavior of every downstream calculation that currently branches on "is Person 2 present." Persisted in localStorage alongside existing fire-dashboard state, and recorded in every snapshot row.
- **Child count**: Already exists — the existing Children counter. The Adult counter joins it inside the new "Household composition" block; no change to Child-count semantics.
- **Person 2 inputs**: Existing entities (`agePerson2` / `BIRTHDATES.person2` / `person2Stocks` / `ssSpouseOwn`). Their lifecycle changes: they are no longer inferred from "field exists in DOM" but gated by `adultCount === 2`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single-person user can complete a full 2 → 1 adult decrement — click the Adults decrement button, confirm all partner fields are hidden, view the recomputed FIRE number — in under 15 seconds from page load, without reading documentation.
- **SC-002**: With Adults = 1 and identical Person 1 inputs (income, 401(k), stocks, spend) and zero Person 2 data, the computed lifetime federal tax is at least 10% higher than the equivalent Adults = 2 run — reflecting the smaller Single-filer standard deduction and narrower brackets. This validates that the Single filing-status defaults are actually propagating.
- **SC-003**: With Adults = 1 and zero kids, the displayed pre-65 annual healthcare cost for the US scenario is materially lower than the Adults = 2, zero-kids cost (the single-adult share of the family-of-4 reference), within a tolerance chosen during planning against the exact scaling constants.
- **SC-004**: With Adults = 1, the combined monthly Social Security benefit displayed on the Social Security panel equals Person 1's own PIA to the dollar — no spousal add-on appears anywhere on the page.
- **SC-005**: A user who enters partner data, decrements Adults to 1, then re-increments to 2 sees the partner data in each field unchanged. Zero data loss across an unlimited number of 2↔1 round-trips.
- **SC-006**: A snapshot CSV saved before this feature loads and renders correctly on a dashboard with this feature installed; all prior rows are interpreted as Adults = 2.
- **SC-007**: All text introduced by this feature renders in Traditional Chinese when the language toggle is set to zh-TW; zero English fallback leaks in the new UI.
- **SC-008**: The Adults counter decrement button is disabled or no-op at value 1, and the increment button is disabled or no-op at value 2; there is no user action sequence that produces a value outside [1, 2].
- **SC-009**: The full unit test suite (currently 79 tests) stays green after this feature lands, with new tests added for: filing-status detection keyed on `adultCount === 2`, single-adult SS combination, single-adult + N-kids healthcare scaling, and counter-bounds enforcement (target: ≥ 90 total tests passing).

## Assumptions

- The existing `detectMFJ(inp)` + `applyFilingStatusDefaults(isMFJ)` infrastructure added in feature 007 is the correct plumbing for filing-status propagation; this feature extends its input signal from "Person 2 age > 0" to "`adultCount === 2`."
- The existing healthcare scaling formula `factor = 0.67 + 0.165 * kids` (couple-only share + per-kid share) is a reasonable reference and can be extended with a single-adult share of approximately 0.35 without commissioning new actuarial data.
- Post-65 Medicare halving for single enrollees (÷ 2 of the couple reference) is an acceptable approximation consistent with how the dashboard already approximates pre-65 costs; users who want precision can override via the existing `hcOverridePost65` field.
- The default on-load Adult count is 2 — every existing user's experience is unchanged unless they explicitly decrement the counter.
- Head-of-Household, Qualifying Widow(er), and Married-Filing-Separately are out of scope for v1. A single parent is taxed as Single for the purposes of this calculator; this is a conservative (higher-tax) assumption that users can override manually via the std-ded / top-of-12% / IRMAA fields.
- The RR dashboard (`FIRE-Dashboard.html`) is deliberately excluded from this feature. The lockstep rule in the project CLAUDE.md applies by default but can be scoped by explicit user intent (as stated in the feature request).
- The snapshot CSV must remain append-only per DB Engineer constitution; the new "Adults" integer column is appended to the right of existing columns.
- No server component, no analytics, no telemetry is introduced. The Adult count lives entirely in the client's localStorage and (if saved) the user's local CSV file.
