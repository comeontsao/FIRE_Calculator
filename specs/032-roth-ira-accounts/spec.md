# Feature Specification: Roth IRA Accounts (Roger & Rebecca)

**Feature Branch**: `032-roth-ira-accounts`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "Add Roger's and Rebecca's Roth IRA balances to the RR dashboard under the existing Locked-until-59.5 area, wired through every calc/UI/test/i18n consumer of the existing 401K balances (Lifecycle, FIRE verdict, withdrawal strategies, audit invariants, snapshot CSV, copy-debug, drag-preview, tooltips)."

**Scope note (NON-LOCKSTEP)**: This feature ships **only** to the RR dashboard (`FIRE-Dashboard.html`). The Generic dashboard (`FIRE-Dashboard-Generic.html`) is intentionally NOT changed by this feature. This is the first deliberate departure from the default RR/Generic lockstep rule and is justified by the personal nature of named retirement accounts; the Generic dashboard's owners can decide whether to mirror it in a later feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See Roth IRA balances reflected in Total Net Worth (Priority: P1)

As Roger (or Rebecca), I open the dashboard, navigate to **Plan → Assets**, and enter our current Roth IRA balances. The header **Whole Portfolio Net Worth** updates immediately to include both balances, and the "Locked" sub-label increases by the same amount.

**Why this priority**: This is the smallest visible slice of value. Without this, the new accounts are invisible to the dashboard and offer no benefit over a spreadsheet.

**Independent Test**: Open the RR dashboard, enter $50,000 in "Roger's Roth IRA" and $50,000 in "Rebecca's Roth IRA". Verify the header net-worth figure increases by exactly $100,000 and the "Locked" sub-label increases by exactly $100,000.

**Acceptance Scenarios**:

1. **Given** both Roth IRA inputs are at default 0, **When** I type 50000 into Roger's Roth IRA, **Then** Total Net Worth increases by exactly 50,000 and the "Locked" sub-label increases by exactly 50,000 within one second.
2. **Given** I reload the page, **When** the dashboard initializes, **Then** the Roth IRA inputs restore the last values I entered.
3. **Given** I switch the dashboard language between English and Traditional Chinese, **When** the UI re-renders, **Then** the Roth IRA block label and the two field labels appear in the chosen language while the entered values remain unchanged.

---

### User Story 2 — Roth IRA balances drive the Lifecycle chart (Priority: P1)

As Roger, when I look at the Lifecycle chart, I want to see my Roth IRA balances participate in the year-by-year portfolio projection so the visual reflects my whole retirement portfolio — not just my brokerage, cash, and 401K accounts.

**Why this priority**: The Lifecycle chart is the dashboard's flagship visualization. If Roth IRA balances are present but not reflected here, the user-facing trajectory is incorrect, and any downstream comparisons (verdict, withdrawal, strategy ranker) become inconsistent.

**Independent Test**: Enter a non-zero Roth IRA balance for Roger and observe the Lifecycle chart. The total stacked balance per year visibly increases by an amount consistent with the entered balance compounding at the dashboard's retirement-account growth assumption.

**Acceptance Scenarios**:

1. **Given** Roger's Roth IRA = 0 and the Lifecycle chart shows a known trajectory, **When** I change it to 100,000, **Then** every year's stacked total in the Lifecycle chart increases by at least the starting amount and grows alongside the other locked balances.
2. **Given** non-zero Roth IRA balances, **When** the FIRE marker is dragged left or right, **Then** the chart + verdict + tooltip remain in sync with one another at every step of the drag (no frame mixing, no stale strategy).
3. **Given** the active withdrawal strategy is the post-ranking winner, **When** the chart re-renders, **Then** the Roth IRA pool depletes (or is preserved) consistent with that strategy's stated rules.

---

### User Story 3 — Roth IRA balances drive the FIRE feasibility verdict (Priority: P1)

As Roger, when I add or change a Roth IRA balance, I expect the **On Track / FIRE in X years** verdict at the top of the dashboard to reflect the new total household retirement assets — and to do so under whichever mode I have selected (Safe / Exact / Die With Zero).

**Why this priority**: The verdict is the dashboard's single most important answer. If it doesn't update with the Roth IRA balances, the user gets a wrong answer to "Am I on track?" — the exact problem feature 031 was created to solve at the strategy level.

**Independent Test**: With all other inputs identical, two sessions — one with Roger's Roth IRA = 0 and one with = 200,000 — must show a meaningfully earlier FIRE age (or stronger surplus) in the 200,000 session, in all three modes.

**Acceptance Scenarios**:

1. **Given** the Safe mode is active and the verdict shows FIRE in N years, **When** I add a large Roth IRA balance, **Then** the verdict updates to show FIRE in fewer years (or "Already FIRE" if the increase is large enough).
2. **Given** the Exact or Die-With-Zero mode is active, **When** I change the Roth IRA balance, **Then** the verdict re-evaluates using the same lifecycle that the chart visualizes (Feature 031 contract — no strategy drift).
3. **Given** the user drags the FIRE marker through the chart, **When** the marker moves, **Then** the verdict's mode-specific feasibility check stays in lockstep with the chart for every position visited.

---

### User Story 4 — Roth IRA balances participate in withdrawal strategies (Priority: P2)

As Roger, when I look at the **Withdrawal Strategy** comparison and tooltip, I want each strategy's depicted draw schedule to honor the Roth IRA pool consistent with that strategy's rules — and the strategy ranker (Pay Less Lifetime Tax / Leave More Behind) to evaluate each candidate strategy on a lifecycle that includes the new pool.

**Why this priority**: Without this, the ranker may pick a winner that ignores a meaningful portion of the household portfolio, producing a misleading "best strategy" recommendation. P2 because P1 stories already deliver value; P2 makes the recommendation correct.

**Independent Test**: With a large Roth IRA balance entered, switch through each strategy in the comparison and confirm the Withdrawal Strategy tooltip line for the Roth pool shows a non-zero draw schedule consistent with that strategy's ordering. Confirm the ranker's chosen winner shifts (or remains, with explanation) compared to a session with zero Roth IRA balances.

**Acceptance Scenarios**:

1. **Given** non-zero Roth IRA balances, **When** I switch to a Roth-ladder-style strategy, **Then** the tooltip shows Roth IRA draws scheduled in the years that strategy's rule prescribes.
2. **Given** any active strategy, **When** I observe the year-by-year draws, **Then** the Roth IRA pool MUST NEVER be drawn down by Required Minimum Distributions (Roth IRAs have no lifetime RMD per IRS rules).
3. **Given** the ranker chooses a winner, **When** the chart, verdict, and tooltip render, **Then** all three reflect the same lifecycle that includes the Roth IRA pool (Feature 031 contract).

---

### User Story 4b — Annual Roth IRA contributions grow the balance during accumulation (Priority: P2)

As Roger, when I set my annual Roth IRA contribution under the Investment tab, I want the accumulation phase to grow my Roth IRA balance by that contribution each year (in addition to investment growth) until I reach FIRE age. The contribution behavior mirrors the existing Roth 401K contribution wiring.

**Why this priority**: Without this, the Roth IRA is only modeled as a static starting balance, which under-counts wealth at FIRE age for anyone still contributing. P2 (not P1) because the static-balance modeling from User Story 1 already delivers a usable answer.

**Independent Test**: Set Roger's Roth IRA balance to $0 and his contribution to $7,000/year. Accumulate to a FIRE age 10 years out. Confirm the Roth IRA balance at FIRE age is approximately $7,000 × 10 plus investment growth — not zero.

**Acceptance Scenarios**:

1. **Given** a Roth IRA starting balance of 0 and an annual contribution of 7000, **When** I look at the year-by-year accumulation, **Then** the Roth IRA balance grows each year by approximately the contribution amount plus the prior balance's growth at the dashboard's retirement-return assumption.
2. **Given** I am 50+ years old (Roger's case post-2032), **When** I view the Roth IRA contribution input helper text, **Then** I see the 2026 catch-up limit ($8,000 total) noted alongside the base limit ($7,000).
3. **Given** I enter a contribution above the IRS limit, **When** the accumulation runs, **Then** the dashboard accepts the value without enforcement (trusts the user) — but the helper text continues to show the IRS limit for reference.
4. **Given** Roger's existing Roth 401K contribution is non-zero, **When** I also set a non-zero Roth IRA contribution, **Then** the two contributions accumulate into their separate pools without one substituting for the other.

---

### User Story 5 — Roth IRA balances captured in snapshot history (Priority: P2)

As Roger, when I record a snapshot (saving a row to `FIRE-snapshots.csv`), I want the two Roth IRA balances captured so the history view shows their evolution over time alongside the existing balances.

**Why this priority**: P2 because the history is a secondary surface — useful for trend analysis but not blocking the primary "am I on track?" answer.

**Independent Test**: Save a snapshot with non-zero Roth IRA balances; reopen the dashboard and confirm the new snapshot row in the history table shows the recorded balances. Confirm legacy snapshots (from before this feature) load correctly with empty/zero Roth IRA values.

**Acceptance Scenarios**:

1. **Given** non-zero Roth IRA balances, **When** I save a new snapshot, **Then** the saved CSV row contains both balance values in dedicated columns.
2. **Given** the CSV already contains snapshots written before this feature shipped, **When** the dashboard loads them, **Then** the missing Roth IRA values are treated as 0 and no row fails to parse.
3. **Given** the snapshot history table on the History tab, **When** it renders, **Then** the two new balance columns appear alongside the existing balance columns without breaking the table layout.

---

### User Story 6 — Roth IRA balances visible in copy-debug snapshot and audit invariants (Priority: P3)

As Roger (in debug mode), when I copy the debug snapshot or open the Audit tab, I want both Roth IRA balances visible in both currency frames (broker statement dollars and purchasing-power equivalent) and I want the audit invariants to continue passing with non-zero values.

**Why this priority**: P3 because this surface is for power-user verification, not day-to-day use. But it MUST work — the audit invariants are the dashboard's self-check; if they fail silently, downstream features can drift undetected (the lesson behind feature 020 and the 031 strategy-drift fix).

**Independent Test**: Set non-zero Roth IRA balances, copy the debug snapshot, and confirm both values appear under appropriate keys. Run the audit; all invariants A through F pass.

**Acceptance Scenarios**:

1. **Given** non-zero Roth IRA balances, **When** I copy the debug snapshot, **Then** the JSON contains both balances in both currency frames.
2. **Given** non-zero Roth IRA balances, **When** I open the Audit tab and run the audit, **Then** every audit invariant (apples-to-apples sim parity, intermediate cash validity, phase duration, withdrawal-tax integrity, withdrawal-spend parity, cash-sweep parity) passes.

---

### Edge Cases

- **Zero values**: With both Roth IRA balances at 0 (the default), the dashboard MUST behave identically to its pre-feature state — same net worth, same chart, same verdict.
- **Very large values**: With Roth IRA balances exceeding $10M each, all numeric formatting (commas, abbreviation to K/M/B in tight spaces) MUST remain correct.
- **Mid-drag language switch**: Switching language while the FIRE marker is being dragged MUST NOT lose the dragged position or desynchronize chart/verdict/tooltip.
- **Pre-feature CSV**: Loading a CSV written before this feature MUST NOT throw; missing Roth IRA columns are treated as 0.
- **Snapshot during typing**: Saving a snapshot while a Roth IRA input has focus but unblurred text MUST capture the latest committed value, not the prior value.
- **RMD years (age 73+)**: As the simulation enters RMD territory for Traditional 401K, the Roth IRA pool MUST be untouched by the RMD branch.

## Requirements *(mandatory)*

### Functional Requirements

**UI / Input**

- **FR-001**: The Plan → Assets tab MUST present two new currency-input fields labeled "Roger's Roth IRA" and "Rebecca's Roth IRA," visually grouped in a block that mirrors the existing Traditional/Roth 401K block ("🔒 Locked until 59.5") in styling and position.
- **FR-002**: Both Roth IRA input values MUST persist across page reloads and language switches.
- **FR-003**: Both field labels and the block header MUST be available in English and Traditional Chinese; switching language MUST update the labels without losing entered values.

**Portfolio Aggregation**

- **FR-004**: The "Whole Portfolio Net Worth" header total MUST include both Roth IRA balances.
- **FR-005**: The "Locked" sub-label under the net-worth header MUST include both Roth IRA balances.
- **FR-006**: The "Accessible Now" sub-label MUST NOT include either Roth IRA balance, because the Roth IRA pool is fully locked until age 59.5 per FR-019.

**Calc Integration**

- **FR-007**: The Lifecycle chart's year-by-year projection MUST include both Roth IRA balances throughout retirement, growing them at the dashboard's retirement-account growth assumption (defaulting to the same rate as the 401K pool).
- **FR-008**: The FIRE feasibility verdict — under all three modes (Safe, Exact, Die With Zero) — MUST evaluate the lifecycle that includes the Roth IRA balances. The verdict's strategy resolution MUST follow the same resolved-winner contract that the Lifecycle chart follows (Feature 031 contract).
- **FR-009**: Each withdrawal strategy MUST treat the Roth IRA pool consistent with that strategy's stated ordering rules in the user-facing tooltip and the lifecycle simulation (per-strategy ordering deferred to clarification — see NC3).
- **FR-010**: The strategy ranker (whichever objective is active — Preserve / Minimize Tax) MUST rank candidate strategies on lifecycles that include the Roth IRA pool.
- **FR-011**: The Roth IRA pool MUST be exempt from any Required Minimum Distribution logic at all ages.
- **FR-012**: Dragging the FIRE marker MUST keep the Lifecycle chart, the verdict, the drag-preview tooltip, and the Withdrawal Strategy tooltip in mutual sync at every drag position — including any new Roth IRA pool data (Feature 031 lockstep contract).

**Persistence**

- **FR-013**: The snapshot CSV MUST append two new columns capturing Roger's and Rebecca's Roth IRA balances when a snapshot is saved.
- **FR-014**: Loading a CSV that lacks the new columns (pre-feature snapshots) MUST succeed with the Roth IRA values defaulting to 0; the loader MUST NOT throw or skip any row.
- **FR-015**: The History tab table MUST surface the two new columns alongside existing balance columns without breaking layout.

**Audit / Debug**

- **FR-016**: The copy-debug snapshot output MUST include both Roth IRA balances in both currency frames (broker-statement dollars and purchasing-power dollars).
- **FR-017**: Every audit invariant currently in the dashboard MUST continue to pass with non-zero Roth IRA balances across all personas covered by the audit harness.

**Lockstep Exemption**

- **FR-018**: The Generic dashboard's **UI** (`FIRE-Dashboard-Generic.html` user-visible elements) MUST remain unchanged by this feature — no new Roth IRA inputs, no new labels, no visible Roth IRA block, no new chart legend entry, no new History-tab columns. The Generic dashboard's **inline calc code AND shared `calc/*.js` modules** ARE updated in lockstep with RR per Constitution Principle I (POOL_KEYS, STRATEGY_ORDERS, effBal() formula, accumulation loop, signed-sim, strategy simulator inline block, SNAPSHOT_COLS array). The new `rothIra` pool defaults to 0 in Generic because no Generic UI input feeds it. This preserves calc-layer lockstep while honoring the RR-only personal scope at the UI layer.

**Locked Semantics (FR-019 resolved → A: fully locked until 59.5)**

- **FR-019**: Both Roth IRA balances MUST be treated as fully locked until age 59.5 — matching the existing Roth 401K pool behavior. The dashboard does NOT distinguish contributed basis from accumulated earnings; the entire balance is inaccessible to the pre-59.5 withdrawal phase. (Trade-off: slightly under-counts the household's true accessible portfolio per IRS rules, in exchange for keeping the v1 calc engine simple. A future feature may split basis vs. earnings if needed.)

**Contribution Inputs (FR-020 resolved → B: add contribution-input fields)**

- **FR-020**: The Investment tab MUST expose two new annual-contribution input fields: "Roger's Roth IRA Contribution" and "Rebecca's Roth IRA Contribution," in USD/year. The accumulation engine MUST grow each Roth IRA balance year-by-year by its contribution amount (in addition to investment growth) until FIRE age, mirroring how the existing Roth 401K contribution field is wired.
- **FR-020a**: Each Roth IRA contribution field MUST display a helper hint with the IRS limit for 2026 ($7,000 base / $8,000 with the age-50+ catch-up). The dashboard MUST NOT enforce the limit (the user is trusted to enter only legitimate contributions); the hint is informational only.
- **FR-020b**: Roth IRA contributions MUST be modeled as a SEPARATE annual amount per person — NOT as a subdivision of the existing Roth 401K contribution fraction. (IRS reality: 401K contribution limit and IRA contribution limit are independent, so the dashboard's per-person Roth IRA contribution is additive to the existing 401K Roth contribution, not a re-allocation of it.)
- **FR-020c**: Modified-AGI-based eligibility phase-out of Roth IRA contributions is NOT enforced in v1; user-entered contributions are trusted.

**Pool Identity & Strategy Ordering (FR-021 resolved → B: new `rothIra` pool with audit-driven threading)**

- **FR-021**: A new pool key `rothIra` MUST be introduced as a sibling of the existing `roth` pool (which represents Roth 401K). The two pools share tax-free withdrawal behavior but are tracked separately so strategies can treat them differently and so the RMD-exemption boundary is explicit.

- **FR-021a (Pool order)**: In the canonical pool key order, `rothIra` MUST sit immediately after `roth`. In every strategy's ordering rule, `rothIra` MUST appear in the same position relative position as `roth` (immediately following it). This is the safest default — Roth IRA and Roth 401K draw in the same phase, with Roth 401K depleting first followed by Roth IRA. (A future feature may reorder if the household wants Roth IRA drawn first to exploit its no-RMD advantage.)

- **FR-021b (Accumulation)**: The accumulation engine MUST grow `rothIra` separately from `roth` (Roth 401K), using the same real return assumption (`return401k`). The two pools MUST NOT be merged inside the calc engine; only the UI may sum them for display.

- **FR-021c (Withdrawal)**: The withdrawal simulator MUST track `rothIra` draws in a dedicated `wRothIra` accumulator, parallel to the existing `wRoth` for Roth 401K. Tax treatment of `rothIra` draws is identical to `roth` (tax-free).

- **FR-021d (RMD exemption)**: Required Minimum Distribution logic MUST continue to apply only to the `trad` pool. The new `rothIra` pool, like the existing `roth` pool, MUST be invisible to the RMD branch. (Audit confirmed the existing RMD branch is hardcoded to `trad`; this FR is enforcement that the pattern be preserved.)

- **FR-021e (Effective-balance formula)**: The FIRE-feasibility effective-balance sum MUST include `pRothIra` alongside `pTrad`, `pRoth`, `pStocks`, and `pCash`. (Missing this would silently de-sync the verdict from the chart — a feature-031-class regression.)

- **FR-021f (Lifecycle row)**: Each lifecycle projection row MUST expose `pRothIra` (real-$) and `pRothIraBookValue` (nominal-$) fields, parallel to the existing `pRoth` / `pRothBookValue` pair.

- **FR-021g (Chart series)**: The Lifecycle chart MUST render a dedicated stacked-area series for `pRothIra`, parallel to the existing Roth 401K series, with its own legend entry and consistent color theming.

- **FR-021h (Tooltip pool line)**: The Withdrawal Strategy tooltip MUST surface a dedicated `rothIra` line showing year-by-year Roth IRA draws (or zero in years it isn't drawn), parallel to the existing `roth` line.

- **FR-021i (Audit invariants)**: All audit invariants (currently A through F) MUST continue to pass with non-zero Roth IRA balances. The audit composition output MUST include `lockedRothIra` as a separate field, parallel to the existing `lockedRoth401k`.

- **FR-021j (Audit harness DOM stubs)**: The audit harness's DOM-element stub generator MUST serve the new `rogerRothIra` and `rebeccaRothIra` input ids per-persona, returning each persona's value (or 0 if unset). This is the lesson from feature 020 — persona-driven fields must be bound inside `boundFactory`, not the static `DOC_STUB`.

**Test Coverage Of Audit Touch Points**

- **FR-022**: For every touch point flagged in the 57-entry caller-audit (`specs/032-roth-ira-accounts/audit.md`), at least one automated test MUST exercise the new `rothIra` path. Coverage MUST be at least 80% on all new code paths.

**CSV Migration Strategy**

- **FR-023**: The CSV header MUST gain two new columns — `rogerRothIra` and `rebeccaRothIra` — appended at the end of the existing column list (NEVER inserted mid-row, per the DB Engineer constitution).
- **FR-023a**: The CSV loader MUST detect short rows (rows lacking the new columns, i.e., legacy snapshots) and default the missing values to 0. The loader MUST NOT throw, skip rows, or misalign existing columns.
- **FR-023b**: No schema-version bump is introduced; the loader's row-length detection is the migration mechanism (consistent with how feature 030 cash-sweep deferred its schema impact to the dashboard rather than the CSV).

### Key Entities

- **Roger's Roth IRA**: A tax-advantaged retirement account, individually owned by Roger, contributed-to with after-tax dollars, with restricted access before age 59.5 and tax-free qualified withdrawals thereafter. No lifetime Required Minimum Distribution. Represented as a single dollar balance entered by the user.
- **Rebecca's Roth IRA**: Same definition as above, for Rebecca. Notably the first individually-named retirement account in the dashboard for Rebecca (whose existing inputs are limited to brokerage balances).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Adding non-zero Roth IRA balances changes the Whole Portfolio Net Worth header total by exactly the sum of those balances, within one second of the input losing focus.
- **SC-002**: Setting Roger's Roth IRA to $200,000 (with all other inputs at the RR baseline) produces a FIRE age that is meaningfully earlier than the baseline in every mode (Safe / Exact / DWZ), and the Lifecycle chart visibly reflects the added balance.
- **SC-003**: The FIRE verdict and the Lifecycle chart's depicted trajectory remain consistent at every moment during a FIRE-marker drag through the chart, including when Roth IRA balances are non-zero (no drift, no stale strategy).
- **SC-004**: A snapshot saved with non-zero Roth IRA balances round-trips through CSV export and reload, restoring the exact entered values on the History tab.
- **SC-005**: All existing automated tests (622 unit tests + 6 Playwright drag E2E) continue to pass after this feature lands. New tests covering the Roth IRA pool wiring achieve at least 80% coverage on every new code path (inputs → state → aggregation → calc → chart → verdict → snapshot).
- **SC-006**: A user can fully understand the impact of their Roth IRA balances on their retirement readiness using only the primary dashboard surfaces (Plan, Lifecycle, header verdict, Withdrawal Strategy tooltip) — without needing to open Audit, Debug, or any developer-only panel.
- **SC-007**: The Generic dashboard remains byte-identical (modulo the unchanged shared calc modules) before and after this feature ships. A diff of `FIRE-Dashboard-Generic.html` against its pre-feature state shows zero behavioral changes.

## Assumptions

All three open clarifications were resolved by the user on 2026-05-28: FR-019 → A (fully locked), FR-020 → B (add contribution inputs), FR-021 → B (new `rothIra` pool with full audit-driven threading). The assumptions below are the remaining defaults.

- **Growth rate**: Roth IRA balances grow at the same real return assumption used for the existing 401K pool (`return401k`). No separate IRA-specific return field is added in this feature.
- **RMD**: Roth IRA pools are not subject to RMD at any age — confirmed IRS rule. Audit confirmed the existing RMD branch in `calc/withdrawal.js:204` is hardcoded to `trad` only, so the existing pattern naturally excludes the new `rothIra` pool.
- **Block label**: The new block is labeled "🔒 Roth IRA" — visually consistent with the existing "🔒 Locked until 59.5 (401K)" block.
- **CSV migration**: Append-only — two new columns at the end of the header row. The loader detects short legacy rows (which lack the new columns) and treats missing values as 0. No schema-version bump.
- **Income phase-outs**: IRS Roth IRA contribution-eligibility phase-out (modified-AGI based) is NOT modeled in v1. User-entered contributions are trusted.
- **Initial balances** (locked 2026-05-28): Roger's Roth IRA starting balance = **$0** (account opening in 2026); Rebecca's Roth IRA starting balance = **$59,021**. These default values populate the inputs the first time the dashboard loads after this feature ships; subsequent values are user-edited and persisted to localStorage.
- **Initial annual contributions** (locked 2026-05-28): Both Roger's and Rebecca's annual Roth IRA contribution default = **$7,000/year** (2026 IRS base limit). Both fields are fully user-adjustable — the user expects to raise these as IRS limits grow in future years (e.g., to $7,500 in 2027 if that becomes the limit). The dashboard MUST accept any non-negative dollar amount; the helper text shows the current-year IRS limit purely as a reference.
- **localStorage persistence**: All four new inputs (2 balances + 2 contributions) MUST be persisted to localStorage on change, parallel to how the existing 401K balance and contribution inputs persist. Page reload restores the last-entered values without requiring a snapshot save.
- **Snapshot independence from localStorage**: Saving a snapshot to `FIRE-snapshots.csv` is OPTIONAL and SEPARATE from localStorage persistence. The user can use the dashboard with up-to-date balances persisted only in localStorage, and only push a row to the CSV when they want to record history. Existing snapshot rows from before this feature MUST remain valid (legacy rows missing the new columns load with the new values defaulted to 0; no row corruption).
- **Roger's Trad 401K and Roth 401K remain unchanged**: This feature only adds new pools; it does not alter the existing 401K pool behavior, contribution rules, or RMD handling. The Roth 401K and Roth IRA pools are kept separate in the calc engine.
- **Pool ordering**: `rothIra` sits immediately after `roth` in every strategy's draw order, meaning Roth 401K depletes before Roth IRA. This is the safest v1 default; the user can revisit ordering in a future feature if they want to favor Roth IRA (no-RMD advantage) being drawn first.
- **Contribution input independence**: The new Roth IRA contribution fields are additive to existing Roth 401K contribution fields, not a re-allocation of the `rothFraction` split in `DEFAULT_CONTRIB_SPLIT`. This matches IRS reality where 401K and IRA contribution limits are independent.
- **Audit-harness personas**: All personas in the audit harness will receive Roth IRA balances of 0 in their default fixture, unless the implementation tasks explicitly add new personas with non-zero values for invariant testing.
- **Lockstep break is one-time**: The RR-only scope applies to this feature only. Future features default back to the lockstep rule unless they explicitly say otherwise.

## Audit Reference

The caller-audit run during /speckit-specify identified **57 touch points across 19 categories** where the new `rothIra` pool must appear. Touch points are persisted at `specs/032-roth-ira-accounts/audit.md` and are the source of truth for /speckit-plan's task breakdown.

| Action | Touch points | Notes |
|---|---|---|
| **PARALLEL** | 28 | Add sibling `rothIra` entry alongside `roth` (pool keys, strategy orderings, accessible set, i18n keys, snapshot columns, test fixtures, chart series) |
| **EXTEND** | 21 | Extend existing reference to include `rothIra` (contribution split logic, effective balance, accumulation loop, HTML input wiring, calcAccessible, audit composition, tooltip pools) |
| **EXEMPT** | 1 | RMD branch — already hardcoded to `trad`; the new pool inherits exemption by construction |
| **NEW** | 2 | Entirely new behavior — new DOM inputs (`rogerRothIra`, `rebeccaRothIra`) and new CSV column pair |
| **NO-CHANGE** | 5 | `roth` references that are incidental (comments, structural iteration covered by POOL_KEYS update) |

The plan and tasks docs will translate each touch point into one or more concrete tasks.
