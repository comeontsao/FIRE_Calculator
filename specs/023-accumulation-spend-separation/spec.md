# Feature Specification: Accumulation-vs-Retirement Spend Separation

**Feature Branch**: `023-accumulation-spend-separation`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "accumulation-vs-retirement-spend-separation: Fix latent bug where accumulation phase uses $0 spending. Architecture: introduce `accumulationSpend` (= `getTotalMonthlyExpenses() × 12`, the user's existing Plan-tab line-item expenses representing TODAY's US household spending) as a distinct concept from `annualSpend` (country-tier post-FIRE spending). Pre-FIRE accumulation in `calc/accumulateToFire.js` consumes `accumulationSpend`. Post-FIRE retirement loop in `projectFullLifecycle` continues to consume `annualSpend` (country-tier ONLY, no contamination from accumulation-phase spending). Both HTMLs in lockstep. Frame: real-$ throughout the calc engine (preserve existing FRAME annotations from feature 022). Constraint: when user is in TW scenario showing $60k/yr post-FIRE, the simulator must use $60k for retirement-year withdrawals while using ~$120k (user's actual US line-item sum) for accumulation-year cash-flow residual."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pre-FIRE accumulation uses the user's real US household spending (Priority: P1)

A user opens the dashboard. They have set up their Plan-tab Expense rows to reflect their actual current US life: rent $2,690/mo, food $1,500/mo, healthcare $400/mo, transportation $600/mo, utilities $300/mo, etc. — totalling roughly $10,000/mo or $120,000/yr. They have selected Taiwan as their target retirement country (post-FIRE annual budget ~$60,000/yr). Their household gross income is $150,000.

Today, the dashboard's Lifecycle chart shows their money pile growing implausibly fast in the first 5 years of accumulation, e.g., +$95,000/year additions to the cash bucket — far more than their actual disposable income could produce. After this feature, the chart shows realistic accumulation: cash flow ≈ $0 to slightly negative because gross income minus tax minus 401K minus US household spending leaves little or nothing for the cash bucket.

**Why this priority**: This is the bug fix that motivates the whole feature. Without it, the dashboard's pre-FIRE projection is unreliable enough that the user cannot trust ANY downstream metric (FIRE age, FIRE number, strategy ranker, country comparison). Every chart and KPI fed by `projectFullLifecycle` is contaminated. This is the table-stakes correctness fix.

**Independent Test**: Run RR-baseline persona (Roger 42, Rebecca 41, gross $150k, US-spending ~$120k via line items, TW retirement $60k, FIRE age computed). Walk the Lifecycle chart year-by-year through accumulation. Verify: (a) age-43 total portfolio Book Value is < age-42 + (gross income × 0.5), (b) the cash bucket year-over-year delta during accumulation never exceeds (gross income − federal tax − FICA − 401K − getTotalMonthlyExpenses × 12) × 1.05, (c) the conservation invariant `grossIncome − federalTax − ficaTax − pretax401kEmployee − accumulationSpend − stockContribution === cashFlowToCash` holds (within ±$1) every year of accumulation.

**Acceptance Scenarios**:

1. **Given** RR-baseline persona with line-item US spending summing to $120k/yr and TW selected as retirement country, **When** the user opens the Lifecycle chart, **Then** the year-1 (age-43) total portfolio Book Value is within $30k of (year-0 portfolio + 1 year's growth + 1 year's 401K + 1 year's stock savings) — i.e., minimal cash-flow residual contribution because US spending nearly equals net take-home.
2. **Given** the same persona, **When** the user opens the Audit tab and inspects the year-0 accumulation row, **Then** the row exposes a new `accumulationSpend` field (matching `getTotalMonthlyExpenses() × 12`) AND the row's `annualSpending` field equals `accumulationSpend`, NOT `annualSpend` (the country-tier value).
3. **Given** the same persona, **When** the user clicks Copy Debug, **Then** the JSON dump includes BOTH `accumulationSpend` and `annualSpend` as top-level inputs so future bug investigations can verify the values.
4. **Given** the user changes the Rent row from $2,690 to $4,000/mo (raising US line-item total from $120k to $135.7k/yr), **When** they release the input, **Then** the Lifecycle chart re-renders and the cash bucket trajectory shrinks proportionally — the simulator now consumes more of the user's income before the cash residual.

---

### User Story 2 — Post-FIRE retirement uses ONLY the country-tier budget; no contamination from accumulation spending (Priority: P1)

The user has Taiwan selected as their retirement country (annual budget = $60,000/yr in today's purchasing power). The user's CURRENT US line-item expenses sum to ~$120,000/yr. After this feature, the simulator's retirement-phase withdrawals must size to support $60,000/yr of TW spending — NOT $120,000/yr (the US accumulation level). The two values must remain functionally separate.

**Why this priority**: The user explicitly required this constraint: "make sure then for the spending after FIRE is only counting the spending from that country." If accumulation contaminates retirement, the FIRE number balloons (the simulator would target $120k/yr forever) and FIRE age recedes catastrophically. This is the purity guarantee.

**Independent Test**: For each persona × country-tier combination, verify that `projectFullLifecycle`'s retirement-phase loop (age ≥ fireAge) consumes ONLY the country-tier `annualSpend` value (= `getScenarioEffectiveSpend(s)`), never `accumulationSpend`. Run a paired comparison: for the same persona, compute end-of-life portfolio with TW selected ($60k/yr) vs Stay-in-US selected ($120k/yr). The end portfolios must differ by the cumulative withdrawal differential — confirming that switching country tier moves ONLY the retirement-phase spending.

**Acceptance Scenarios**:

1. **Given** RR-baseline with TW selected, **When** the audit dump captures the retirement-phase rows (age ≥ FIRE age), **Then** every row's withdrawal amount sizes to support exactly $60,100/yr (= TW $60k + visa $100) of spending, NOT $120k/yr.
2. **Given** the user switches the country tier from TW to Stay-in-US, **When** the chart re-renders, **Then** the retirement-phase withdrawals scale up to $120k/yr while the accumulation-phase cash flow remains UNCHANGED (because accumulation still uses the same US line-item sum).
3. **Given** the user is on Country Chart tab, **When** they review the per-country FIRE figures, **Then** each country's "Bridge $ at FIRE" and "FIRE in N years" reflect that country's ONLY annualSpend (not the US accumulation amount). No country-tier comparison is contaminated.

---

### User Story 3 — Audit visibility: both spending values surface in the audit dump and on the Plan tab (Priority: P2)

The user opens the Audit tab and Copy Debug button. The audit dump exposes the current `accumulationSpend` (in real-$, computed from line items) AND `annualSpend` (in real-$, country-tier). The Plan-tab Expenses pill clearly indicates that the line-item total represents "current spending" (driving accumulation) and notes that retirement spending is separately set by the country tier.

**Why this priority**: Without visibility, future bug investigations cannot easily tell which value the simulator used. The hidden-input bug existed undetected for ≥4 features (020, 021, 022, latent bugs from earlier). Audit-trail clarity prevents recurrence.

**Independent Test**: Run Copy Debug on RR-baseline. The JSON contains top-level `accumulationSpend` (numeric, > 0) AND `annualSpend` (numeric, > 0, equals country-tier value). Both should be in real-$ frame. The Plan-tab Expenses pill caption (or tooltip) explicitly says the total drives accumulation-phase spending.

**Acceptance Scenarios**:

1. **Given** the user clicks Copy Debug, **When** they paste the JSON into a chat / file, **Then** they can immediately see both spending values and verify which the simulator used for which phase.
2. **Given** the user hovers over the Plan-tab Expenses pill total, **When** the tooltip appears, **Then** it explains: "This total drives your simulated current household spending. Retirement spending is set separately by your selected country tier."
3. **Given** the bilingual user toggles to 中文, **When** they hover the same pill, **Then** the tooltip is rendered in zh-TW with parallel meaning.

---

### User Story 4 — Backwards compatibility: existing snapshots, persona fixtures, and audit harness keep working (Priority: P2)

Existing CSV snapshots, audit-harness persona records (92 personas), and pre-feature-023 saved state in localStorage do not contain an `accumulationSpend` field. After this feature, those existing artifacts must continue to load and produce valid results.

**Why this priority**: A user with a populated snapshot history or an in-progress persona session should not lose data or get incorrect numbers because the schema changed. The audit harness (478+ tests) must not regress.

**Independent Test**: Before-and-after the feature lands, run the full audit harness on all 92 personas. Total findings must NOT increase. Existing CSV snapshots must continue to round-trip through CSV import without parse errors. Pre-feature-023 saved localStorage state must continue to populate the dashboard with no console errors.

**Acceptance Scenarios**:

1. **Given** a user has a 50-row CSV snapshot file from before feature 023, **When** they import it, **Then** every row parses successfully and the historical lifecycle chart renders correctly.
2. **Given** the audit harness runs all 92 personas under the new schema, **When** the run completes, **Then** the total findings count is ≤ feature 022 baseline (1 LOW finding) and the conservation invariants pass on all personas.
3. **Given** a pre-feature-023 saved state in localStorage (no `accumulationSpend` field), **When** the dashboard loads it, **Then** `accumulationSpend` is computed at runtime from `getTotalMonthlyExpenses() × 12` (no migration needed) and the chart renders correctly.

---

### User Story 5 — Strategy ranker, FIRE feasibility solver, and verdict pill use the correct spending value per phase (Priority: P2)

Three other consumers of `accumulateToFire` exist in addition to the chart's `projectFullLifecycle` accumulation handoff:
1. `_simulateStrategyLifetime` (powers strategy ranker — feature 008)
2. `computeWithdrawalStrategy` (powers withdrawal-strategy panel)
3. `findFireAgeNumerical` / `findEarliestFeasibleAge` (powers FIRE-age resolution + verdict pill)

After this feature, all four consumers must consistently use `accumulationSpend` (pre-FIRE) and `annualSpend` (post-FIRE).

**Why this priority**: The bug-fix's correctness is only complete if EVERY caller of `accumulateToFire` is updated. A partial fix where the chart is correct but the strategy ranker still spends $0 during accumulation creates a subtler version of the same drift bug — verdict pill green while chart is red, etc. Constitution VI (chart↔module contracts) requires this lockstep.

**Independent Test**: Add audit-harness invariant `accumulationSpendConsistency`: for each persona × mode × strategy, verify that the FIRE-age resolver, the strategy ranker, and the chart's accumulation all consume the same `accumulationSpend` value within ±$1. The invariant runs after the feature lands and must report 0 findings across all 92 personas.

**Acceptance Scenarios**:

1. **Given** RR-baseline with line-item US spending = $120k, **When** the strategy ranker runs, **Then** `_simulateStrategyLifetime`'s accumulation phase consumes $120k/yr accumulationSpend (matching the chart), not $0.
2. **Given** the same persona, **When** the FIRE-age solver runs, **Then** `findFireAgeNumerical` consumes the same $120k accumulationSpend; the resolved FIRE age changes to reflect the reality that accumulation now leaves less surplus per year.
3. **Given** the same persona, **When** the verdict pill ("On Track — FIRE in N years") is computed, **Then** the displayed N matches the resolved FIRE age that consumed the corrected accumulation spending.

---

### User Story 6 — User-facing labelling and translations clarify the new pair (Priority: P3)

The user sees clear labels distinguishing the two spending concepts, in both EN and zh-TW. The Plan-tab Expense pill is captioned "Current spending (US household)" / "目前支出（美國家計）" and the Geography-tab country-tier display shows "Annual budget (post-FIRE, in {country})" / "年度預算（FIRE後，於{country}）".

**Why this priority**: Soft polish. The bug fix lands without it, but cognitive friction remains. Adding labels makes the dashboard self-documenting.

**Independent Test**: Open the dashboard in EN and 中文. Both label pairs render correctly with no untranslated string keys. The labels match the Money Terminology in CLAUDE.md (no "real $" leakage).

**Acceptance Scenarios**:

1. **Given** the user is in EN mode, **When** they look at the Plan tab, **Then** the Expenses pill explicitly labels its total as "current spending" or equivalent.
2. **Given** the user toggles to 中文, **When** they look at the same panel, **Then** the label is translated correctly with parallel meaning.
3. **Given** any new text introduced for FR-013, **When** it surfaces to the user, **Then** it follows the project's "money / purchasing power" pair (CLAUDE.md), never "real $".

---

### Edge Cases

- **Plan tab has zero expense rows**: `getTotalMonthlyExpenses()` returns 0 → `accumulationSpend` = 0 → cash bucket inflates as before. **Mitigation**: a non-zero floor — when computed `accumulationSpend` is 0 or unset, fall back to country-tier comfortable spend for the user's CURRENT location (default Stay-in-US = $120k). Document this in Assumptions.
- **User has rows but they sum to $0**: same as above — fall back applies.
- **`accumulationSpend > grossIncome`**: residual goes negative → already clamped to 0 with `cashFlowWarning: 'NEGATIVE_RESIDUAL'`. No behavior change.
- **Country-tier change during session**: must ONLY change `annualSpend`. `accumulationSpend` is independent, derived from line items.
- **Mortgage payment counted in line items**: existing line items may include rent (which the mortgage adjustment already accounts for via `mtgSavingsAdjust`). Risk of double-counting. **Mitigation**: `accumulationSpend` includes line items (incl. rent), and `mtgSavingsAdjust` subtracts the mortgage P&I delta from `monthlySavings` (stockContribution), NOT from spending. So no double-count, but document the interaction.
- **CSV snapshot import (pre-023 file)**: old rows have no `accumulationSpend` column → derive at load time from line items, do not fail.
- **Audit-harness persona records (pre-023)**: no `accumulationSpend` field → harness must compute from `monthlySpend × 12` if present, else from country-tier comfortable, else $120k default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST treat `accumulationSpend` (today's US household spending, real-$) and `annualSpend` (post-FIRE country-tier spending, real-$) as two distinct fields with separate read paths.
- **FR-002**: `accumulationSpend` MUST be computed at runtime as `getTotalMonthlyExpenses() × 12`, where `getTotalMonthlyExpenses()` is the existing helper summing the user's Plan-tab Expense rows plus the "Other tax" sub-row.
- **FR-002a**: When `accumulationSpend` would compute to 0 (no expense rows or all rows are zero), system MUST fall back to the Stay-in-US country-tier comfortable spend ($120,000/yr in real-$). This prevents the original bug from re-emerging if the user clears all rows.
- **FR-003**: Pre-FIRE accumulation phase (every iteration in `accumulateToFire`'s for-loop, ages currentAge through fireAge-1) MUST use `accumulationSpend` for its `annualSpending` term in the cash-flow residual computation.
- **FR-004**: Post-FIRE retirement phase (every iteration in `projectFullLifecycle`'s retirement loop, ages fireAge through endAge) MUST use `annualSpend` (country-tier) for the per-year withdrawal sizing. NO contamination from `accumulationSpend`.
- **FR-005**: Country-tier selection (TW, Japan, Thailand, etc.) MUST affect ONLY `annualSpend`. Switching the selected scenario MUST leave `accumulationSpend` unchanged.
- **FR-006**: The pure module `calc/accumulateToFire.js` MUST accept `accumulationSpend` via its options bag (or as an explicit parameter) — NOT by reading `inp.annualSpend`. The `inp.annualSpend = undefined → fall through to 0` failure mode is closed permanently.
- **FR-007**: All four callers of `accumulateToFire` MUST pass the same `accumulationSpend` value:
  1. `projectFullLifecycle` (the chart's accumulation handoff)
  2. `_simulateStrategyLifetime` (strategy ranker simulator)
  3. `computeWithdrawalStrategy` (withdrawal-strategy panel)
  4. `findFireAgeNumerical` / `findEarliestFeasibleAge` (FIRE-age resolver)
- **FR-008**: All four callers MUST resolve `accumulationSpend` through a single shared helper (e.g., `getAccumulationSpend(inp)`) so future calc changes cannot accidentally drift one consumer.
- **FR-009**: Audit dump (Copy Debug) MUST expose `accumulationSpend` and `annualSpend` as top-level fields, plus per-row `annualSpending` (already exists) which equals `accumulationSpend` during accumulation rows.
- **FR-010**: The conservation invariant for accumulation rows MUST hold post-fix:
  ```
  grossIncome − federalTax − ficaTax − pretax401kEmployee − annualSpending − stockContribution === cashFlowToCash  (±$1)
  ```
  where `annualSpending` is now sourced from `accumulationSpend`.
- **FR-011**: The frame contract is preserved: `accumulationSpend` is in real-$ (today's purchasing power), constant across years (per FR-014 of feature 022 — spending stays constant in today's-$). The `// FRAME: real-$` annotation in the calc module continues to apply.
- **FR-012**: Both HTMLs (FIRE-Dashboard.html + FIRE-Dashboard-Generic.html) MUST be updated in lockstep. Sentinel-symbol parity is verified via grep before merge.
- **FR-013**: User-facing labels MUST use the conversational money-terminology pair (per CLAUDE.md):
  - Plan-tab Expenses pill caption: "Current spending (US household, today's dollars)" / "目前支出（美國家計，今日購買力）"
  - Geography-tab country tier display: keep existing "Annual budget" labels; add tooltip clarifying "applies post-FIRE, in {country}".
- **FR-014**: Audit harness invariant `accumulationSpendConsistency` MUST be added to `tests/unit/validation-audit/`:
  - For each persona × mode × strategy, verify that all four `accumulateToFire` callers see the same `accumulationSpend` value.
  - Cell count: 92 personas × 3 modes × 4 callers = 1,104 cells.
  - Severity: HIGH (drift indicates Constitution VI violation).
- **FR-015**: Pre-feature-023 CSV snapshots and saved localStorage states MUST continue to load without errors. `accumulationSpend` is computed at load time, not stored.
- **FR-016**: Frame-coverage meta-test (`tests/meta/frame-coverage.test.js`) MUST be updated to recognize the new options-bag field as a valid `// FRAME: real-$` site.
- **FR-017**: When `cashFlowWarning === 'NEGATIVE_RESIDUAL'` is set during accumulation, the audit dump MUST surface it. Existing UX: a warning row appears in the Audit tab. No new UI.

### Key Entities

- **`accumulationSpend`** (real-$): A scalar value representing the user's annual household spending during the accumulation phase. Computed dynamically from Plan-tab Expense rows. Fed to `accumulateToFire`'s cash-flow residual via the options bag. NOT persisted; always recomputed.
- **`annualSpend`** (real-$): A scalar value representing the user's annual household spending during the retirement phase (in their selected destination country). Set by country-tier selection (`getScenarioEffectiveSpend(s)`). Fed to `projectFullLifecycle` as the second positional argument. UI-editable per scenario.
- **`AccumulateToFireOptions.accumulationSpend`** (real-$, NEW): A new field on the options bag passed to `accumulateToFire`. Single source for all four call sites. When absent, falls back to FR-002a default.
- **`PerYearAccumulationRow.annualSpending`** (real-$): An existing v2 row field. Post-feature-023, its value during accumulation rows equals `accumulationSpend` (NOT the country-tier `annualSpend`). The renaming or aliasing is internal-only; the field name stays for backwards-compat.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Bug eliminated)**: For RR-baseline persona with line-item US spending = $120k and TW retirement, the year-1 (age-43) total portfolio Book Value differs from the year-0 baseline by less than 30% of (gross income × 1.0), down from the current ~31% gain. Specifically: Δ portfolio < $50,000 (vs current $191,722).
- **SC-002 (Cash-bucket sanity)**: For RR-baseline persona, the cash bucket year-over-year delta during accumulation never exceeds (gross income − federal tax − FICA − 401K − getTotalMonthlyExpenses × 12 − monthlySavings × 12) × 1.05 in real-$. The conservation invariant is exact within ±$1.
- **SC-003 (Country-tier purity)**: Switching the selected country tier from TW ($60k) to Stay-in-US ($120k) changes the retirement-phase withdrawals by exactly $60k/yr × (endAge − fireAge), and changes accumulation-phase cash flow by $0. Verified per persona in audit invariant `countryTierIsolation`.
- **SC-004 (Audit harness regression)**: After the fix lands, total audit findings (across all invariant families on 92 personas) is ≤ feature 022 baseline (1 LOW). The new `accumulationSpendConsistency` invariant family reports 0 findings on first run.
- **SC-005 (FIRE-age stability)**: For each persona, the resolved FIRE age (from `findFireAgeNumerical`) post-feature-023 is consistent with the chart's accumulation trajectory (verdict pill matches chart). E3 hysteresis findings do not regress; B-022-1 may finally be cleanable as a side-effect of consistent options-bag plumbing.
- **SC-006 (User-perceived correctness)**: For RR-baseline, the Lifecycle chart's age-43 portfolio (in Book Value) is within $30k of the user's expected sum: (current $525k + ~$30k 401K + ~$24k stocks + minimal cash) × 1.03 inflation factor ≈ $600k–$620k Book Value, NOT $801k.
- **SC-007 (No regressions)**: Constitution VIII gate (`spendingFloorPass.test.js`): 7/7 throughout the implementation. Every existing unit test continues to pass.
- **SC-008 (Both HTMLs identical)**: Sentinel grep confirms `accumulationSpend` is defined and consumed in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` with parallel call sites.

## Assumptions

- The Plan-tab Expense rows + "Other tax" row already capture the user's full current US household spending, EXCEPT for federal income tax + FICA (which are deducted on the income side via `accumulateToFire`'s tax computation per FR-006 of feature 021). No additional spending line items are needed.
- The user's CURRENT location is the US ("Stay in US (MA)" country-tier baseline = $120k). If a user is currently living abroad and wants to model that, they edit Plan-tab line items accordingly. Out of scope: a separate "current location" country-tier selector for accumulation phase.
- Spending stays constant in real-$ across the accumulation phase (no annual scaling). This matches feature 022 FR-014. If the user wants their spending to grow over time, they adjust line items manually. Out of scope: time-varying accumulation-spend trajectories.
- The audit harness's persona record schema CAN be extended to include an explicit `accumulationSpend` field per persona (instead of relying on `monthlySpend × 12` derivation). This makes test fixtures self-describing.
- Mortgage carry adjustment (`mtgSavingsAdjust`) continues to debit `monthlySavings × 12` (stockContribution), NOT `accumulationSpend`. The Plan-tab Rent row is the canonical baseline-housing expense; the mortgage delta is the EXTRA cost that mortgage adds. No double-counting.
- The healthcare-cost delta (per-country) for retirement years is part of `annualSpend` (country-tier, post-FIRE), not accumulation. Pre-FIRE healthcare is captured in Plan-tab line items.
- Branch `023-accumulation-spend-separation` is created from `022-nominal-dollar-display`. Feature 022 is awaiting user browser-smoke; this fix is independent and can ship in parallel. If 022 merges to main first, this branch will rebase or merge cleanly.
- Constitution principles I (lockstep), II (pure modules), III (single source of truth), VI (chart↔module contracts), VIII (Spending Funded First retirement-phase contract) are unchanged. This feature reinforces VI by closing the four-caller drift gap.
