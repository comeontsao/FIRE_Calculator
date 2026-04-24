# Feature Specification: Generic Dashboard — Country Budget Scaling by Household Size

**Feature Branch**: `010-country-budget-scaling`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Auto-scale per-country budget defaults by household size (adult count + kids) on the Generic FIRE dashboard. Feature 009 shipped adult-count-aware tax, healthcare, and Social Security math, but the country-specific lifestyle budgets (annualSpend, normalSpend, comfortableSpend) stay hardcoded at family-of-4 levels, so a solo planner in Taiwan still sees \$36,000/yr as the default. This overstates the FIRE number for small households unless the user manually lowers the slider."

## Clarifications

### Session 2026-04-24

- Q: Which equivalence formula governs the post-FIRE adults-only scaling factor? → A: OECD-modified adults-only (first adult = 1.0, second adult = 0.5); solo = 1.0/1.5 ≈ 0.67× couple baseline.
- Q: How are the hardcoded country defaults (US \$78K, Taiwan \$36K, etc.) re-interpreted once kids leave the post-FIRE scaling formula? → A: Treat them as **couple baseline** (2 adults). Factor = 1.00× for all Adults=2 households (kid count irrelevant for the country-budget factor itself). Existing couple-with-kids users see zero visual change to the country card. Existing child-related calculations (per-child college tuition, per-child student loans, user-typed Monthly Expense Breakdown) MUST remain intact and untouched — this feature only changes the country-budget scaling factor, never the pre-college child-cost logic.
- Q: For the post-FIRE window when a child is still at home (not yet college age), how should per-child costs be modeled? → A: Add a **post-FIRE per-child allowance** on top of the adults-only country budget, on a fixed age-based schedule that ends when each child enters college. Allowance is a silent under-the-hood overlay (no UI slider). Schedule per child: ages 0–12 → \$2,000/yr flat; age 13 → \$2,500 (+\$500); age 14 → \$3,000 (+\$500); age 15 → \$4,000 (+\$1,000); age 16 → \$5,000 (+\$1,000); age 17 → \$6,000 (+\$1,000, cap). Age 18+ → allowance ends; existing per-child college logic takes over. Allowance applies only during post-FIRE years that precede each child's college start; during pre-FIRE years the user-typed Monthly Expense Breakdown continues to reflect household reality.
- Q: How should the UI scaling indicator display household composition under adults-only scaling? → A: **Two-line caption.** Line 1: "Country budget: X adult(s) → Z× couple baseline." Line 2: "+ per-child allowance during pre-college years (Y children tracked)." Tooltip explains the full rule (adults-only country factor + allowance schedule + college overlay). Localized in English and Traditional Chinese.
- Q: Does the Generic dashboard need a per-country "Adjust Annual Spend" override input analogous to the RR dashboard? → A: **Yes.** The RR dashboard's deep-dive panel exposes an "Adjust Annual Spend" input under each country (alongside Relocation Cost and Annual Visa Cost) that lets the user override the country's lifestyle preset. The Generic dashboard's deep-dive panel is missing this input, even though the i18n strings `geo.adjustSpend` ("💰 Adjust Annual Spend:") and `geo.adjustNote` ("(overrides lifestyle preset for this country)") already exist in the catalog (EN and zh-TW). This feature MUST wire those existing strings to a new `<input type="number">` rendered in the Generic deep-dive panel, with parity to the RR version. The override is per-country, persists in memory, is respected by FR-010/FR-011 user-override precedence, and wins over the adults-only scaling for that country.
- Q: How does the scaled spend + per-child allowance flow into the Full Portfolio Lifecycle chart versus withdrawal strategies? → A: The scaled country budget + per-child allowance overlay defines the **annual spend requirement** at each post-FIRE year. The selected withdrawal strategy (DWZ / SAFE / bracket-fill / low-tax / any future strategy) then decides **how to fund** that spend requirement — which account to draw from, how to smooth Roth conversions, how to stay under tax brackets, etc. Strategies are applied FIRST (they compute the year-by-year drawdown plan against the target spend), and the chart renders the strategy's resulting portfolio trajectory. The scaling factor and allowance MUST never bypass or override the strategy's withdrawal logic.
- Q: Should the Monthly Expense Breakdown table be auto-scaled by the adults-only factor? → A: **No.** The Monthly Expense Breakdown remains fully user-owned, never auto-scaled. Users type whatever reflects their real household (kids implicitly included). Feature 010 does not touch those rows, consistent with FR-008 and the existing user-input-ownership discipline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Solo planner sees a realistic single-person country budget (Priority: P1)

A single adult with no kids opens the Generic dashboard at Adults = 1 and views the country comparison. Each country's default spending budget (the `annualSpend` anchor, the Lean/Normal/Comfortable lifestyle tiers, the blended delta computations) is scaled down from the couple (2-adult) baseline to a single-adult value using the adults-only OECD-modified factor (1.0 / 1.5 ≈ 0.67). For example, the Taiwan default flips from \$36,000/yr (couple baseline) to \$24,000/yr (single adult, 0.67×), and the US default flips from \$78,000/yr to \$52,000/yr. The FIRE target recomputes off the smaller spending floor, producing a materially smaller FIRE number that reflects reality.

**Why this priority**: Without this, feature 009's partial single-person correctness (taxes + healthcare + SS) is undone by a massively overstated lifestyle budget. A solo planner computing against the US \$78,000/yr couple-level default effectively carries \$26,000/yr of nonexistent household spending into their FIRE calculation — overstating the FIRE number by \$650,000+ at a 4 % safe-withdrawal rate. This is the last major correctness gap for single-person mode.

**Independent Test**: Can be fully tested by loading the dashboard at Adults = 2 (record displayed country budgets) and at Adults = 1 (compare). Every country's displayed annual budget must be exactly 0.67× its Adults = 2 value (within rounding). The FIRE number must drop visibly.

**Acceptance Scenarios**:

1. **Given** the Generic dashboard at Adults = 2, 0 kids, **When** the user decrements Adults to 1, **Then** every country card's `annualSpend` display updates to a materially smaller number, the FIRE target drops, and the Full Portfolio Lifecycle chart re-renders with the new (smaller) retirement spend floor.
2. **Given** Adults = 1, 0 kids, **When** the user reviews the country comparison bars, **Then** the relative ranking of countries is preserved (Taiwan still cheaper than US, etc.), only the absolute levels shrink.
3. **Given** Adults = 1, 0 kids, **When** the user views a country's Lean / Normal / Comfortable lifestyle tiers, **Then** ALL THREE tiers scale by the same household-size factor (not just the Normal tier).
4. **Given** Adults = 1, 0 kids, **When** the user saves a snapshot, **Then** the snapshot records the household-size-scaled FIRE target — not the couple-level target that the same inputs would have produced before this feature.

---

### User Story 2 — Solo parent with kids sees adults-only country budget plus per-child allowance overlay (Priority: P1)

A single adult with N children opens the dashboard at Adults = 1, Children = N. The country comparison cards show the **adults-only** scaled budget — identical to a solo planner with no kids, because the country-budget factor is adults-only (0.67× couple baseline). Kids affect post-FIRE spending via a **separate overlay** on the Full Portfolio Lifecycle chart: per-child allowance during each child's pre-college years ($2,000/yr rising to $6,000/yr by age 17), and per-child college tuition during each child's college years (handled by the existing college plan logic). A single parent with 2 kids therefore sees the same country-card budget as a solo planner, but a higher year-by-year post-FIRE spend curve in the Lifecycle chart during the years the kids are pre-college and in college.

**Why this priority**: Single parents are an explicit first-class scenario from feature 009 (FR-014). The country-card budget must reflect the adults-only cost of living (kids don't change the country's lifestyle-tier anchors), while the year-by-year Lifecycle projection must still account for real-world child-rearing costs through the dedicated allowance + college overlays.

**Independent Test**: Set Adults = 1, Children = 2 on the dashboard. Compare the displayed country-card budget against Adults = 1, Children = 0 — they should be identical (country card shows adults-only number). Then inspect the Full Portfolio Lifecycle chart post-FIRE spend curve — with 2 children pre-college, it must show visibly higher annual spend in pre-college years (by $4,000–$12,000/yr depending on child ages), dropping back to the adults-only country budget after both children graduate college.

**Acceptance Scenarios**:

1. **Given** Adults = 1, Children = 0, **When** the user adds a child (any birthdate), **Then** every country's displayed country-card `annualSpend` REMAINS UNCHANGED (because kids don't scale the country factor), but the Lifecycle chart's post-FIRE spend curve rises during that child's pre-college and college years per FR-005a–FR-005e and the existing college logic.
2. **Given** Adults = 1, Children = 2 and Adults = 2, Children = 2, **When** comparing both country-card budgets side-by-side, **Then** the Adults = 1 country card shows 0.67× the Adults = 2 value (kids don't affect country factor in either configuration).
3. **Given** Adults = 1, Children = 2 with both kids under age 12, **When** viewing the Lifecycle chart's post-FIRE years, **Then** the spend floor shows the adults-only country budget + \$4,000/yr (2 kids × \$2,000 each) until the older kid turns 13, then ramps per the per-child schedule.

---

### User Story 3 — Adults-only scaling indicator with per-child allowance note is visible and explainable (Priority: P2)

Near the country comparison section the dashboard shows a two-line indicator. Line 1: "Country budget: 1 adult → 0.67× couple baseline." Line 2 (only if children tracked): "+ per-child allowance during pre-college years (2 children tracked)." A help tooltip explains: country factor is adults-only; per-child allowance ramps \$2,000 → \$6,000 by age 17 and applies post-FIRE pre-college only; college tuition is tracked separately per the existing college plan. Users understand why the numbers behave the way they do when they change the Adults counter or children list.

**Why this priority**: Silent auto-scaling feels broken when users don't know it happened. A two-line caption turns two invisible rules (adults-only country factor + age-graded allowance overlay) into legible, self-documenting numbers.

**Independent Test**: Change the Adults counter (1 ↔ 2) and verify Line 1's multiplier updates in real time. Add/remove children or change their birthdates and verify Line 2's children-tracked count updates. Hover the help icon and confirm the tooltip's explanation appears in both English and Traditional Chinese.

**Acceptance Scenarios**:

1. **Given** any household composition with at least one child, **When** the user looks at the country comparison area, **Then** the two-line caption shows Line 1 with the adults-only factor (format: "Country budget: X adult(s) → Z× couple baseline") and Line 2 with the children-tracked count and pre-college allowance note.
2. **Given** no children in the list, **When** the indicator renders, **Then** Line 2 is omitted entirely; only Line 1 shows.
3. **Given** the user changes the Adults counter or the children list, **When** the dashboard recomputes, **Then** both lines of the caption update to reflect the new composition in the same render pass.
4. **Given** the language toggle is set to 繁體中文, **When** the caption renders, **Then** both lines and the tooltip all appear in Traditional Chinese.

---

### User Story 4 — Manual override of any country's budget still wins (Priority: P2)

A user who has manually adjusted a country's `annualSpend` slider (or entered a custom value in the override field) keeps their value across subsequent household-size changes. Scaling only applies to the scenario-level defaults that the user has NOT touched.

**Why this priority**: Without an override-respect rule, every change to Adults or Children silently overwrites hand-tuned budgets — the same class of frustration feature 007 solved for tax-bracket defaults via `data-user-edited='1'`. Consistency is the goal.

**Independent Test**: At Adults = 2, manually set the US annual budget slider to \$100,000. Change Adults to 1. The US slider must still read \$100,000 — not auto-scale downward. Change it back to 2. Still \$100,000.

**Acceptance Scenarios**:

1. **Given** a user manually edited any country's lifestyle-tier budget, **When** the user changes the Adults counter, **Then** the manually edited country's budget is preserved and not overwritten.
2. **Given** a user who has NOT touched any country's budget, **When** the user changes the Adults counter, **Then** every country's three lifestyle tiers scale in lockstep to the new household size.
3. **Given** a user who has manually edited one country's budget (e.g., US) but not others, **When** the user changes the Adults counter, **Then** ONLY the US budget is preserved; Taiwan, Japan, Thailand, etc., all scale.

---

### User Story 5 — Scaling applies uniformly across all three lifestyle tiers (Priority: P3)

Every country scenario defines three lifestyle anchors: `annualSpend` (Lean / default), `normalSpend` (Normal), and `comfortableSpend` (Fat / Comfortable). All three scale by the same household-size factor so the tier ratios are preserved. A user toggling between Lean / Normal / Comfortable lifestyle sees a consistent experience at any household size.

**Why this priority**: If only `annualSpend` scaled, a solo planner toggling to "Comfortable" would suddenly see a family-of-4 Comfortable number — breaking internal consistency. This is a correctness-adjacent polish requirement: the tier slider already exists and must still make sense at every household size.

**Independent Test**: At Adults = 1, toggle lifestyle from Lean → Normal → Comfortable. Confirm the ratios between tiers match the ratios at Adults = 2 (within floating-point tolerance).

**Acceptance Scenarios**:

1. **Given** Adults = 1, 0 kids, **When** the user toggles through Lean / Normal / Comfortable tiers, **Then** the tier ratios for any given country match (within ~1 %) the same country's tier ratios at Adults = 2, 2 kids.
2. **Given** the per-country-lifestyle configuration is inspected at two different household sizes, **When** the user confirms tier ratios, **Then** `normal / annual` and `comfortable / annual` are identical (modulo rounding) at both sizes.

---

### Edge Cases

- **Adults = 2, any Children count (baseline couple, with or without kids):** Factor is exactly `1.00`. Country budgets are UNCHANGED from today's behavior (hardcoded defaults are re-interpreted as the couple baseline). This is the zero-regression guarantee: no existing user at Adults = 2 sees any country-card number move on first page load after feature 010 lands.
- **Adults = 1, any Children count (solo, with or without kids):** Country-card factor = 1.0 / 1.5 ≈ 0.67. Kids do NOT modify this factor. Kids instead add a per-child allowance overlay on the Lifecycle chart's post-FIRE spend curve (pre-college) and per-child college tuition during college years.
- **Adults = 1, Children ≥ 3 (large single-parent household):** Supported without a hard cap. Country-card factor stays at 0.67; the Lifecycle chart's per-child allowance stacks linearly (N children × allowance schedule).
- **Retiring young with young kids:** Example: FIRE at age 45 with 2 kids aged 8 and 10. The country-card still shows the adults-only budget. The Lifecycle chart post-FIRE spend curve shows: ages 45–52 (older kid age 10→17) increasing allowance per FR-005b; ages 53–56 (older kid in college, younger kid aging 16→19) mixes college and allowance; then allowance tapers as each kid enters college. Adults-only country budget resumes once both kids graduate.
- **User toggles lifestyle mode (Lean → Normal → Comfortable) AT Adults = 1:** All three country-card tiers scale by the same adults-only factor; the tier toggle remains a ratio-preserving multiplier on top of the scaled base. Per-child allowance is independent of lifestyle mode.
- **User overrides one country's budget via the new Adjust Annual Spend input (FR-015a):** The adults-only factor does NOT multiply into the override — user's number wins. Per-child allowance still overlays (user owns the country anchor; they don't opt out of the allowance). Other countries continue to scale.
- **User overrides one country's lifestyle-tier slider but not others:** Only the overridden country's sliders are preserved; others scale. Tracked via `data-user-edited='1'` per slider.
- **Snapshot CSV compatibility:** No schema change required. A snapshot taken at Adults = 1 records the adults-only-scaled country budget plus whatever allowance year applied at snapshot time; a snapshot taken at Adults = 2 records the couple-baseline number. These are NOT directly comparable on a side-by-side basis without normalizing.
- **Feature interaction with the Monthly Expense table:** The Monthly Expense table's per-row values are user-typed household totals and are OUT OF SCOPE for scaling. Only the country scenario's pre-baked `annualSpend` / `normalSpend` / `comfortableSpend` scale (and only by the adults-only factor). Users who type custom per-row expenses own their number.
- **Feature interaction with withdrawal strategies (DWZ / SAFE / bracket-fill / low-tax):** The scaled country budget + per-child allowance + college tuition defines the spend REQUIREMENT per year. The selected strategy determines how to FUND that requirement. Strategies are applied first; the chart reflects the strategy's drawdown plan. Changing the scaling factor or allowance changes the input to the strategy, not the strategy itself.

## Requirements *(mandatory)*

### Functional Requirements

**Scaling formula & baseline**

- **FR-001**: The dashboard MUST compute a single adults-only scaling factor at every recalc, derived from the current Adults counter value. Children do NOT contribute to this factor (their post-FIRE cost is handled via the per-child allowance overlay FR-005a–FR-005e and the existing per-child college tuition logic).
- **FR-002**: The factor MUST equal `1.00` exactly when Adults = 2 (regardless of child count), treating the hardcoded country defaults as a **couple baseline**. Existing users at Adults = 2 (with any number of children) MUST see no change to any country budget after this feature lands.
- **FR-002a**: The existing per-child calculations (college tuition per child, per-child student loan amortization, user-typed Monthly Expense Breakdown which the user populates to reflect their current household including kids, and the FIRE Milestone Timeline's dependency on current savings rate) MUST remain fully functional and unchanged by this feature. Children continue to affect: (a) college spending during each child's tuition years, (b) current daily spending via the user-editable Monthly Expense Breakdown, and (c) the FIRE Milestone Timeline (via the pre-FIRE savings-rate trajectory). Children DO NOT affect post-FIRE country budget scaling.
- **FR-003**: The factor MUST decrease monotonically as adults are removed and increase monotonically as adults are added. Child count changes MUST NOT move the factor.
- **FR-004**: The post-FIRE scaling factor MUST be derived from **adults only**, using OECD-modified adults-only weights: first adult = 1.0, second adult = 0.5. Children do NOT contribute to the post-FIRE country budget scaling factor. Formula: `factor = adult_weight / 1.5` where `adult_weight = 1.0 + 0.5 × max(0, adults − 1)`. Solo (1 adult) → 0.67×; couple (2 adults) → 1.00×.
- **FR-005**: Adding or removing a child MUST NOT change the post-FIRE country-budget scaling factor itself. The factor is adults-only. Children instead contribute to post-FIRE spending via a separate per-child allowance overlay (FR-005a–FR-005e) and via the existing college-tuition logic.

**Per-child post-FIRE allowance (pre-college window)**

- **FR-005a**: For each child, during each post-FIRE year in which the child has NOT yet entered college, the dashboard MUST add a per-child allowance to the post-FIRE annual spend on top of the adults-only country budget. The allowance is computed per child and summed across all children.
- **FR-005b**: The per-child annual allowance schedule MUST follow this fixed age-based table:
  - Age 0–12: \$2,000/yr (flat base)
  - Age 13: \$2,500/yr (+\$500 raise)
  - Age 14: \$3,000/yr (+\$500 raise)
  - Age 15: \$4,000/yr (+\$1,000 raise)
  - Age 16: \$5,000/yr (+\$1,000 raise)
  - Age 17: \$6,000/yr (+\$1,000 raise; cap)
- **FR-005c**: The allowance MUST terminate when a child enters college (age 18 is the default college start; actual start is derived from the existing per-child college-plan data). From that year forward, the existing per-child college tuition/room-board logic takes over and the allowance is zero for that child.
- **FR-005d**: The allowance MUST apply only to post-FIRE years. Pre-FIRE years continue to use the user-editable Monthly Expense Breakdown, which the user is expected to populate to reflect their current household (including current kid costs). No double-counting: during pre-FIRE the allowance is zero.
- **FR-005e**: The allowance MUST be a silent under-the-hood overlay — it is visible in the Full Portfolio Lifecycle chart's post-FIRE spend curve and any downstream drawdown simulations, but no dedicated slider, input, or editable control is introduced by this feature. The allowance amounts and ages are hardcoded per FR-005b.

**Scope of scaling**

- **FR-006**: The adults-only scaling factor MUST multiply every country scenario's `annualSpend`, `normalSpend`, and `comfortableSpend` display values when rendered. The per-child allowance (FR-005a–FR-005e) is added on top as a separate additive term, not multiplied into the country scenario defaults.
- **FR-007**: The combined (scaled country budget + per-child allowance for active post-FIRE pre-college years) MUST flow into every downstream consumer: country comparison bars, country card monthly cost display, Full Portfolio Lifecycle spend floor, Portfolio Drawdown simulations, blended healthcare delta calculations, and any strategy-ranking code that reads the post-FIRE annual spend anchor. Country comparison bars display the adults-only scaled country budget (without allowance) since the allowance is time-varying; the Lifecycle chart incorporates the allowance year-by-year.
- **FR-008**: The scaling factor MUST NOT modify the user's Monthly Expense table per-row values. Those remain user-owned household totals.
- **FR-009**: The scaling factor MUST NOT modify the `relocationCost` or `visaCostAnnual` fields per scenario (those are transaction-level, not headcount-scaled).

**Manual override precedence**

- **FR-010**: Any country scenario's lifestyle-tier budget that the user has manually edited MUST be preserved across household-size changes. User-edit tracking follows the same pattern as feature 007's filing-status defaults (`data-user-edited='1'` per slider or per input).
- **FR-011**: When a user clears their manual override (resets to default), the next household-size change MUST resume scaling that country's budget.

**UI surfacing**

- **FR-012**: The dashboard MUST display a two-line indicator near the country comparison section. Line 1: `Country budget: {X} adult(s) → {Z}× couple baseline` (where Z is computed from FR-004's adults-only formula). Line 2 (conditional): `+ per-child allowance during pre-college years ({Y} children tracked)`, shown only when Y > 0. Line 2 is omitted entirely when no children are registered.
- **FR-013**: Both lines of the indicator MUST update in real time when the Adults counter or the Children list changes (add/remove child, change birthdate).
- **FR-014**: The indicator labels, multiplier format, and help tooltip MUST be localized in English and Traditional Chinese.
- **FR-015**: A help tooltip attached to the indicator MUST explain, in one to three sentences: (a) the country-budget factor is adults-only, (b) the per-child allowance schedule (ages 0–12: \$2,000/yr; ramping to \$6,000/yr at age 17) applies only during post-FIRE pre-college years, and (c) college tuition is tracked separately per child via the existing college plan.

**Per-country user override (parity with RR dashboard)**

- **FR-015a**: The Generic dashboard's country deep-dive panel MUST render a new per-country "Adjust Annual Spend" `<input type="number">` immediately below the existing Annual Visa Cost input. This input wires the already-present i18n strings `geo.adjustSpend` ("💰 Adjust Annual Spend:") and `geo.adjustNote` ("(overrides lifestyle preset for this country)"), including their zh-TW translations, both of which already exist in the catalog (no new i18n keys needed).
- **FR-015b**: Entering a positive value in the Adjust Annual Spend input MUST override the country's lifestyle-tier preset for that country only. The override persists in memory, flags the slider as `data-user-edited='1'`, takes precedence over the adults-only scaling factor (the factor does NOT multiply into an overridden value), and is respected by FR-010/FR-011.
- **FR-015c**: Clearing the Adjust Annual Spend input (setting it to 0 or empty) MUST reset that country to the adults-only-scaled lifestyle preset — identical behavior to any user-override reset path elsewhere in the dashboard.
- **FR-015d**: The Adjust Annual Spend input MUST be implemented ONLY in `FIRE-Dashboard-Generic.html` as part of this feature. The RR dashboard already has its own version and is out of scope (FR-021).

**Full Portfolio Lifecycle — strategy precedence**

- **FR-015e**: The annual spend requirement at each post-FIRE year is the sum of (adults-only-scaled country budget OR per-country override from FR-015b) + (sum of per-child allowances for that year, per FR-005b, for children not yet in college) + (existing per-child college tuition/room-board during college years).
- **FR-015f**: The Full Portfolio Lifecycle chart MUST receive the FR-015e spend requirement as INPUT to the selected withdrawal strategy (DWZ, SAFE, bracket-fill, low-tax, or any future strategy). The strategy computes year-by-year drawdowns against that requirement; the chart renders the strategy's output.
- **FR-015g**: The scaling factor, per-child allowance, and per-country override MUST NOT bypass or override the withdrawal strategy. Strategies are the single source of truth for how spend is funded; scaling/allowance is the single source of truth for how much spend is needed.

**Consistency across tiers**

- **FR-016**: The three lifestyle tiers (Lean / Normal / Comfortable) for any given country MUST scale by the same factor, preserving the per-country tier ratios at every household size.
- **FR-017**: When the user switches lifestyle mode, the household-size scaling factor MUST remain unchanged — the lifestyle toggle multiplies a DIFFERENT axis.

**Backward compatibility & snapshots**

- **FR-018**: First page load after this feature lands MUST NOT visually change any country-card budget for users at Adults = 2 (with any number of children), consistent with FR-002's couple-baseline re-interpretation. The Lifecycle chart's post-FIRE spend curve MAY shift for users with children, because the per-child allowance overlay (new behavior) is now layered on top of post-FIRE spending.
- **FR-019**: Snapshot CSV schema MUST NOT change — the existing `FIRE Target`, `Monthly Spend` columns continue to record whatever the dashboard computed at snapshot time, now including the scaling factor implicitly.
- **FR-020**: When a user imports a pre-feature-010 snapshot, the dashboard MUST render it without error. No retroactive scaling or un-scaling is applied to imported rows.

**Out of scope (explicitly)**

- **FR-021**: The RR dashboard (`FIRE-Dashboard.html`) is explicitly EXCLUDED from this feature, consistent with feature 009's Generic-only scope. RR remains a two-person plan by design.
- **FR-022**: Per-country or per-region custom scaling curves are out of scope. One formula applies uniformly across every country (the regional cost-of-living delta is already encoded in each scenario's individual `annualSpend` anchor).
- **FR-023**: Scaling of the Monthly Expense table's per-row values is out of scope per FR-008. The Monthly Expense Breakdown remains **fully user-owned, never auto-scaled** — users type whatever reflects their real household (kids implicitly included). No feature-010 code touches those rows.
- **FR-024**: Adults > 2 is out of scope (feature 009 FR-028 hard-capped the counter at 2). This feature inherits that cap.
- **FR-025**: The detailed mortgage/home ownership, college, and second-home calculations are out of scope for scaling — those are already separately parameterized.

### Key Entities

- **Adults-only scaling factor**: A single decimal computed at each recalc from `adultCount` only. Formula: `factor = (1.0 + 0.5 × max(0, adults − 1)) / 1.5`. Applies as a multiplier to every country scenario's lifestyle-tier budget. Anchored so that `adults = 2 → 1.00×`. Children do NOT enter this computation.
- **Per-child allowance (post-FIRE, pre-college overlay)**: A year-by-year additive overlay applied to the Lifecycle chart's post-FIRE spend curve. Per child: ages 0–12 → \$2,000/yr flat; age 13 → \$2,500; age 14 → \$3,000; age 15 → \$4,000; age 16 → \$5,000; age 17 → \$6,000 (cap). Terminates at each child's college-start year; the existing college-tuition logic takes over from that year forward.
- **Country scenario (existing)**: Each entry in the `scenarios` list carries `annualSpend` / `normalSpend` / `comfortableSpend`. The adults-only scaling factor applies at render/read time only — the underlying hardcoded numbers MUST NOT be mutated in memory (otherwise re-scaling across Adults-counter changes would drift).
- **User-edited country budget (per-tier sliders)**: A slider that carries a `data-user-edited='1'` flag once the user has changed its value. Scaling skips inputs with this flag set.
- **Per-country Adjust Annual Spend override (new, FR-015a)**: A new `<input type="number">` in the Generic dashboard's deep-dive panel, per country. When non-zero, it overrides the country's lifestyle-tier preset for that country and is exempt from the adults-only scaling factor. Wires the already-present i18n strings `geo.adjustSpend` and `geo.adjustNote`.
- **Annual spend requirement (post-FIRE)**: The per-year amount computed as `(adults-only-scaled country budget OR per-country override) + (sum of per-child allowances for pre-college kids that year) + (per-child college tuition/room-board for kids in college that year)`. This is the INPUT to the selected withdrawal strategy (DWZ / SAFE / bracket-fill / low-tax), which then determines the actual year-by-year drawdown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A solo planner (Adults = 1) switching from the pre-feature-010 dashboard to the post-feature-010 dashboard sees their US `annualSpend` default drop from \$78,000/yr to exactly \$52,000/yr (0.67× couple baseline, adults-only OECD-modified), a reduction of ~33 %. Every other country drops by the same 0.67× factor.
- **SC-002**: A solo planner's resulting FIRE number (the SWR-derived portfolio target) at Adults = 1 and Children = 0 drops by at least 30 % compared to pre-feature-010 behavior, reflecting the single-adult spend floor.
- **SC-003**: Any user at Adults = 2 (regardless of child count) sees ZERO visual change to any country's displayed `annualSpend`, `normalSpend`, or `comfortableSpend` country-card number after this feature lands — existing couple-with-kids users' country-card defaults are pixel-identical. (The Lifecycle chart's post-FIRE spend curve may shift for couples with pre-college kids because the per-child allowance overlay is new.)
- **SC-004**: A single parent with 2 kids (Adults = 1, Children = 2) sees a country-card budget IDENTICAL to a solo planner with 0 kids (both show 0.67× couple baseline — kids don't change the country factor). The difference appears in the Lifecycle chart's post-FIRE spend curve, where the single parent's projection shows the per-child allowance overlay (at least \$4,000/yr while both kids are under 13, scaling up per FR-005b) and per-child college tuition during each child's college years.
- **SC-005**: A user who has either manually edited a country's lifestyle-tier slider OR entered a per-country Adjust Annual Spend override (FR-015a) sees that country's value unchanged after any Adults counter change — zero override loss.
- **SC-006**: The two-line scaling indicator (FR-012) updates within 100 ms of an Adults counter change or a children-list edit. Line 1 shows adults-only factor; Line 2 shows per-child-allowance note if and only if ≥ 1 child is tracked.
- **SC-007**: All text introduced by this feature renders in Traditional Chinese when the language toggle is set to zh-TW; zero English fallback leaks. This includes the Adjust Annual Spend input label (already present as `geo.adjustSpend` / `geo.adjustNote`).
- **SC-008**: Lifestyle tier ratios (`normal / annual`, `comfortable / annual`) are identical at Adults = 1 and Adults = 2 to 3-decimal precision for every country in the scenarios list — the adults-only factor multiplies all three tiers by the same amount.
- **SC-009**: The Full Portfolio Lifecycle chart's post-FIRE spend-curve displays the spend REQUIREMENT (scaled country budget + per-child allowance for that year + college for that year) and the strategy's funding plan. Swapping withdrawal strategies (DWZ → SAFE → bracket-fill → low-tax) changes the DRAWDOWN curve but leaves the spend-requirement curve unchanged.
- **SC-010**: The new per-country Adjust Annual Spend input (FR-015a) exists in the Generic dashboard's deep-dive panel with parity to the RR dashboard — same label, same behavior, same per-country scoping. Clearing the input (setting to 0) restores the adults-only-scaled preset for that country.
- **SC-011**: The full unit test suite stays green after this feature lands, with new tests covering: the adults-only formula branch table (solo vs couple), the Adults=2 → 1.00 regression anchor, the per-child allowance schedule for ages 0–17, the college-takeover transition, the per-country override precedence rule, and strategy-vs-requirement separation. Target ≥ 8 new unit tests.

## Assumptions

- The existing `scenarios` array (line ~3739 of `FIRE-Dashboard-Generic.html`) is the single source of truth for every country's `annualSpend`, `normalSpend`, `comfortableSpend`, `costMult`. Post-clarification these hardcoded values are re-interpreted as a **couple (2-adult) baseline** for post-FIRE spending. This is a documentation/interpretation change only — the numeric values themselves are not modified. The re-interpretation means any Adults = 2 user sees the hardcoded value unchanged (factor 1.00).
- The chosen scaling formula is the **OECD-modified adults-only** variant: first adult = 1.0, second adult = 0.5. Couple weight = 1.5. Runtime factor = `adult_weight / 1.5`. Children do NOT contribute to this factor — that is the core semantic decision of this feature. Factor values: solo (1 adult) = 0.67, couple (2 adults) = 1.00. The Adults counter is hard-capped at 2 (inherited from feature 009 FR-028), so these are the only two factor values ever active.
- Kids affect post-FIRE spending ONLY via (a) the per-child allowance overlay (FR-005a–FR-005e: ramped schedule from \$2,000/yr at ages 0–12 up to a \$6,000/yr cap at age 17, terminating when the child enters college), and (b) the existing per-child college tuition and student loan logic during each child's college years. Kids DO NOT shift the country-card factor.
- Kids affect pre-FIRE spending via the user-editable Monthly Expense Breakdown (which the user populates to reflect current household reality) and the FIRE Milestone Timeline (milestones move with savings rate, which depends on current spending). No automatic pre-FIRE scaling is introduced.
- The per-child allowance schedule is hardcoded per FR-005b. It is NOT user-configurable in this feature (silent under-the-hood overlay). Future features MAY expose a slider or per-kid override if needed.
- Default child college-start age is 18 unless the existing per-child college plan data specifies otherwise. The allowance ends and college logic takes over at whichever year the existing college plan designates as the child's first college year.
- The RR dashboard (`FIRE-Dashboard.html`) is excluded by design. Feature 009 set this precedent; feature 010 continues it. However, the new per-country Adjust Annual Spend input (FR-015a) brings the Generic dashboard to PARITY with the RR dashboard, which already has this input. This is a catch-up addition, not a new RR feature.
- The i18n strings `geo.adjustSpend` (EN: "💰 Adjust Annual Spend:", zh-TW: "💰 調整年度花費：") and `geo.adjustNote` (EN: "(overrides lifestyle preset for this country)", zh-TW: "（覆蓋此國家的生活方式預設）") already exist in the Generic dashboard's translation catalog but are currently unwired. Feature 010 wires them — no new translation keys are required for the override input.
- Existing users who have saved snapshots at Adults = 2 will see no country-card visual change — the feature is transparent to them on the country card itself. Users who saved snapshots at Adults = 1 (after feature 009 but before feature 010) will see their historical snapshots rendered with the old (un-scaled) budgets, while NEW snapshots use the adults-only-scaled values + allowance. This asymmetry is acceptable because the snapshot row records what the dashboard showed at the time, not a re-computed value.
- Manual override tracking uses the same `data-user-edited='1'` pattern introduced in feature 007 and reused in feature 009; no new tracking mechanism is invented. The new Adjust Annual Spend input participates in the same tracking scheme.
- No per-country custom scaling curves are introduced. The country-specific cost-of-living delta is already encoded in each scenario's individual baseline; one global adults-only formula applies uniformly.
- The Monthly Expense table remains user-driven and un-scaled (FR-008, FR-023 now resolved). Users who want to reflect household-size changes in their own expense lines update them manually — that is the current default behavior and preserves user-input ownership.
- Withdrawal strategies (DWZ, SAFE, bracket-fill, low-tax, and any future strategy) take the computed annual spend requirement (scaled country budget + per-child allowance + college tuition) as INPUT and produce the funding plan as OUTPUT. The scaling factor and allowance MUST never bypass strategy logic; they are upstream of it.
- No new server, analytics, or telemetry is introduced. Scaling, allowance, and override live entirely in the client.
