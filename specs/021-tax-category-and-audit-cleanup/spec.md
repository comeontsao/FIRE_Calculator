# Feature Specification: Tax Expense Category + Audit-Harness Carry-Forward

**Feature Branch**: `021-tax-category-and-audit-cleanup`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "Feature 021 — Tax expense category + audit-harness carry-forward. Add a Tax category to the expense breakdown UI in both dashboards. Income tax sub-row uses progressive brackets (auto-computed, locked); Other tax sub-row is manual (sums into monthlySpend). Refactor accumulateToFire.js to compute federalTax via progressive brackets (existing flat taxRate becomes optional override). Bundle the four feature-020 carry-forward backlog items B-020-4 through B-020-7."

## Clarifications

### Session 2026-05-01

- Q: Should the displayed Income tax sub-row include FICA (Social Security + Medicare), or strictly federal income tax (1040)? → A: Federal income tax + FICA combined (Option B). The single Income tax row shows federal income tax (1040 progressive brackets) PLUS FICA (Social Security 6.2% up to 2024 wage base $168,600 per individual + Medicare 1.45% on all wages + additional 0.9% Medicare on wages above $200k single / $250k MFJ). Matches the paycheck mental model. Calc layer adds a new `ficaTax` field alongside `federalTax`; UI sums both for the displayed value and effective rate.
- Q: For non-US country scenarios (Japan, Taiwan, etc.), what does the Income tax sub-row display? → A: The Income tax sub-row only models the **pre-FIRE accumulation phase** when the user is still in the US earning their current job income. It always shows **US progressive brackets + FICA** regardless of `selectedScenario` (which only affects post-FIRE retirement location). Post-FIRE retirement tax is handled in two paths: **(2-1) Stay in US** — existing `taxOptimizedWithdrawal` US-tax math (unchanged from feature 020). **(2-2) Go abroad** — the per-country `comfortableSpend` / `normalSpend` values in the existing `scenarios` array are treated as the **all-in annual US-account withdrawal** including any foreign tax a US-citizen retiree would owe. We do not model foreign income tax as a separate calc-layer line item. The existing per-country `taxNote` field documents the rationale for each country's all-in number (territorial tax exemptions, treaty offsets, AMT thresholds, etc.). Implication for the Tax expense category: the **Other tax** sub-row defaults to 0 for ALL countries (the prior proposal of 10% Japan / 5% Taiwan auto-default is REMOVED — that would double-count with the all-in budget tier). Other tax stays manual and is for things not captured elsewhere (US state/local income tax, sales tax beyond what the country budget tier implies, etc.).
- Q: When the new "Auto" toggle is ON next to the Investment-tab `taxRate` slider, how should the slider appear? → A: Slider stays visible but **disabled (grayed out)** with the auto-computed effective rate displayed as a read-only number next to it (Option B). Keeps the layout stable (no slider appearing/disappearing), gives transparency about what rate auto-mode arrived at (e.g., "Auto: 15.8%"), and the visible-but-disabled affordance is a familiar UI pattern signaling "click Auto off to override." Existing users with `taxRate` already populated (>0) default to Auto OFF on first load (slider remains active at their saved value). New users / users who explicitly clear `taxRate` default to Auto ON.
- Q: Should `copyDebugInfo()` expose the per-bracket federal income tax breakdown + FICA component breakdown per accumulation year, or just aggregates? → A: Both — aggregate AND structured breakdown (Option B). Per-row audit fields gain `federalTaxBreakdown: { bracket10: $X, bracket12: $X, bracket22: $X, bracket24: $X, bracket32: $X, bracket35: $X, bracket37: $X, standardDeduction: $X, taxableIncome: $X }` AND `ficaBreakdown: { socialSecurity: $X, medicare: $X, additionalMedicare: $X, ssWageBaseHit: boolean }`. The bundled CI audit harness (US5 / B-020-6) can assert bracket-by-bracket invariants. Aggregate `federalTax` and `ficaTax` fields stay for backwards-compat with feature 020 audit consumers. Constitution Principle VI auditability is upheld.
- Q: Which filing-status / income-split decisions does feature 021 cover, vs defer? → A: MFJ + single only; assume equal income split between two earners for couples; defer MFS (Married Filing Separately) and per-person income field to feature 022 (Option A). Keeps scope contained. MFS users can keep using the flat `taxRate` override during accumulation. Asymmetric-income couples (e.g., one earner at $200k, one at $0) get a small accuracy gap on FICA SS-cap (~$1.2k/yr noise) — bounded and documented. The dashboard's existing `adultCount` field stays the canonical filing-status indicator; no new dropdown.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Income Tax Visibility in Expenses (Priority: P1) — MVP

A FIRE planner browsing the Expenses pill of the Plan tab sees a new **Tax** category alongside Pets, Travel, Hobbies, etc. The Tax category contains an **Income tax** sub-row that displays an auto-computed monthly dollar amount AND an effective tax rate percentage. The displayed value combines (a) **federal income tax** computed via the standard US progressive tax brackets (10% / 12% / 22% / 24% / 32% / 35% / 37% with the standard deduction) PLUS (b) **FICA** (Social Security 6.2% up to the 2024 wage base of $168,600 per individual + Medicare 1.45% on all wages + 0.9% additional Medicare on wages above $200k single / $250k MFJ). The row is read-only (lock icon) and updates in real time as the user adjusts income or 401(k) contribution sliders elsewhere in the dashboard.

A tooltip on the locked row explains: *"Income tax = federal income tax + FICA (Social Security + Medicare). Computed automatically from your gross income, pretax 401(k) contributions, filing status, and the 2024 IRS / SSA tables. Already deducted from your income on the savings side; does NOT add to your monthly spend budget."*

**Why this priority**: Without this, users can't see how much income tax their plan assumes — a #1 invisible cost in any FIRE plan. The current dashboard just had a flat `taxRate` slider buried in the Investment tab, leading to incorrect mental models. This story alone is shippable: even without the Other-tax row or the audit-harness fixes, surfacing a correct progressive-bracket income tax number is itself a complete improvement.

**Independent Test**: Set RR-baseline scenario (Roger + Rebecca, MFJ, $150k joint income, $20k pretax 401(k)). Open Expenses pill. Verify the Tax category shows Income tax ≈ $1,980/month (~16% effective rate). Breakdown: federal income tax ≈ $12,300/yr (progressive brackets on taxable $100,800 after $29,200 std ded and $20k pretax 401k) + FICA ≈ $11,475/yr ($150k × 7.65% — under SS wage base, no additional Medicare) = ~$23,775/yr ÷ 12. Verify the row has a lock icon. Verify changing the income slider to $250k updates the Income tax row to a higher value within one animation frame (FICA portion now hits the additional-Medicare 0.9% threshold for MFJ at $250k). Verify the row does NOT add to `monthlySpend`.

**Acceptance Scenarios**:

1. **Given** an MFJ couple with $150k income and $20k pretax 401(k), **When** the user opens the Expenses pill, **Then** the Tax category shows Income tax ≈ $1,980/mo with effective rate ≈ 15.8% (locked, with explanatory tooltip).
2. **Given** the user is on the Expenses pill, **When** they drag the gross-income slider from $150k to $250k, **Then** the Income tax sub-row updates within one animation frame to reflect both higher federal brackets AND the FICA additional-Medicare 0.9% on income above the MFJ $250k threshold.
3. **Given** the user is on the Expenses pill, **When** they switch language EN ↔ 中文, **Then** the Tax category label, sub-row labels, and tooltip all translate; numeric values are unchanged.
4. **Given** a single-filer scenario (Generic with adultCount=1), **When** the user opens the Expenses pill, **Then** progressive brackets used are the single-filer brackets (NOT MFJ), and the displayed Income tax matches IRS published tables for that filing status.
5. **Given** any persona, **When** the user adds up all visible expense categories (excluding the locked Tax/Income-tax row), **Then** that sum equals `monthlySpend` exactly. (Income tax is not in `monthlySpend`; Other tax is in `monthlySpend`.)

---

### User Story 2 — Other Tax Manual Entry (Priority: P2)

The same Tax category contains a second sub-row called **Other tax** which is **manually editable**. Users type in a monthly dollar amount that captures non-federal-income taxes the dashboard does not otherwise model: US state and local income tax, non-mortgage property tax, vehicle registration, sales tax beyond what the country budget tier implies, etc. This row sums into `monthlySpend` like any other expense bucket.

The Other tax row defaults to **0 for all country scenarios** — including non-US ones. This is intentional: the per-country `comfortableSpend` / `normalSpend` budget tiers in the existing `scenarios` array are already defined as ALL-IN annual withdrawals from US accounts that include any foreign tax owed by a US-citizen retiree (see Q2 in Clarifications). Auto-populating Other tax with a percentage on top of the budget tier would double-count.

**Why this priority**: Captures the long tail of taxes the dashboard's auto-computed Income tax can't see — primarily US state/local income tax (e.g., MA 5%, CA 9.3%, etc.) for Stay-in-US scenarios, and any extras users want to model on top of the country budget tier. Lower priority than US1 because it's a manual row (no calc-engine work needed beyond reading the input).

**Independent Test**: Set `selectedScenario='us'` and enter $200/month in Other tax (modeling MA state income tax). Confirm `monthlySpend` increases by $200 and the FIRE projection shifts accordingly. Switch to Japan scenario. Confirm Other tax stays at the user's $200 (not auto-overwritten). Confirm Income tax sub-row keeps showing US federal + FICA (the user is still in their pre-FIRE accumulation phase).

**Acceptance Scenarios**:

1. **Given** the user is on the US scenario, **When** they enter $200/month in Other tax, **Then** `monthlySpend` increases by $200 and the lifecycle chart reflects the higher spend.
2. **Given** the user switches country scenario from US to Japan, **When** the Other tax row already has a manual value, **Then** the manual value is preserved (no auto-overwrite).
3. **Given** the user switches country scenario from US to Japan, **When** the Other tax row was 0 (default), **Then** it stays at 0 (no country-percentage auto-fill — the budget tier already includes foreign tax).
4. **Given** the user clears the Other tax field (empty), **When** the calc runs, **Then** Other tax is treated as $0 (not NaN).

---

### User Story 3 — Progressive Bracket Refactor in Accumulation (Priority: P1)

The accumulation phase of the calc engine — `calc/accumulateToFire.js` shipped in feature 020 — currently computes `federalTax` per year as `(grossIncome − pretax401k) × taxRate` using a single flat marginal rate. The retirement phase already uses a more sophisticated bracket-fill model (`taxOptimizedWithdrawal` with `twStdDed`, `twTop12`, `twTop22`). This story aligns the two by upgrading the accumulation calc to use the same progressive bracket math.

The existing flat `taxRate` input in the Investment tab is preserved as an **optional override**: when blank or 0, accumulation uses progressive brackets; when populated, accumulation uses the flat rate (full backwards-compatibility). The UI slider gets a "Use auto-computed brackets" toggle next to it.

The Income tax sub-row in US1 reads its dollar value from the SAME `federalTax` field that the calc engine computes — single source of truth, no UI/calc divergence.

**Why this priority**: P1 because US1 depends on it. Without progressive bracket math in the accumulation calc, US1's "auto-computed Income tax" would just echo a flat-rate number that's less accurate than what users could compute themselves. Doing US1 without US3 would surface the existing oversimplification rather than fix it.

**Independent Test**: Run `node --test tests/unit/accumulateToFire.test.js`. New test cases pin progressive-bracket federalTax values for MFJ + single across $50k / $150k / $250k income bands against IRS published tables. Existing v2-CF-* tests (feature 020) update to reflect the new bracket math but conservation invariants stay green. Backwards-compat: a test setting `taxRate=0.22` produces the same flat-rate output as feature 020.

**Acceptance Scenarios**:

1. **Given** a persona with $150k MFJ income, $20k pretax 401(k), and `taxRate` blank, **When** the accumulation calc runs, **Then** `federalTax` ≈ $20,100/yr (progressive brackets per IRS tables for tax year 2024 MFJ).
2. **Given** a persona with `taxRate = 0.22` and $150k income, **When** the accumulation calc runs, **Then** `federalTax = (150000 − pretax401k) × 0.22` (flat-rate override path; backwards-compat with feature 020 behavior).
3. **Given** a persona with `taxRate` blank and adultCount=1, **When** the calc runs, **Then** brackets used are single-filer brackets (NOT MFJ).
4. **Given** any RR-baseline persona with progressive brackets active, **When** the conservation invariant `Σ(grossIncome) − Σ(federalTax) − Σ(spending) − Σ(pretax401k) − Σ(stockContrib) = Σ(cashFlowToCash)` is checked across the accumulation horizon, **Then** it holds within ±$1 per non-clamped year (Constitution Principle VIII gate).

---

### User Story 4 — Strategy Ranker Hysteresis at Integer-Age Boundaries (Priority: P3) — Carry-forward B-020-4

The strategy ranker (`calc/strategyRanker.js`) currently flips its winner under tiny perturbations near integer-age boundaries (a $1 spend perturbation or 0.01-year age perturbation can swap `trad-first ↔ bracket-fill-smoothed` or `proportional ↔ conventional`). The feature 020 audit cataloged 17 LOW findings (E3 invariant) for this knife-edge behavior. This story adds **hysteresis**: a tie-breaking margin of ±0.05 years (or equivalent in score) so the ranker prefers the previously-winning strategy unless the new contender beats it by more than the margin.

**Why this priority**: P3 because the user impact is invisible most of the time (drag UI snaps to integer-year increments anyway). But it's worth fixing because the audit harness flags it on every run, and a clean audit report is more trustworthy.

**Independent Test**: Re-run `node --test tests/unit/validation-audit/drag-invariants.test.js` after the fix. E3 finding count drops from 17 to 0.

**Acceptance Scenarios**:

1. **Given** any persona where the ranker previously flipped winners under a 0.01-year age perturbation, **When** the perturbation is applied, **Then** the winner stays the same (hysteresis blocks the flip).
2. **Given** a scenario where the new contender genuinely beats the previous winner by a clear margin (>0.5 years equivalent), **When** the ranker runs, **Then** the new contender wins (hysteresis does not block real changes).

---

### User Story 5 — Audit Harness in CI (Priority: P2) — Carry-forward B-020-6

Add a GitHub Actions workflow (`.github/workflows/audit.yml`) that runs the validation-audit harness on every push to a feature branch and every pull request. The job posts a comment on the PR summarizing finding counts by severity (CRITICAL / HIGH / MEDIUM / LOW). Workflow fails if any CRITICAL findings appear; HIGH findings emit a warning but don't fail the build.

**Why this priority**: P2 because the audit infrastructure shipped in feature 020 is otherwise manual. Putting it in CI means future calc-engine changes get automated validation against the persona matrix without anyone having to remember to run the harness.

**Independent Test**: Open a draft PR with a deliberate calc-layer regression (e.g., flip the sign on `federalTax`). The CI workflow runs the audit harness and posts a comment showing CRITICAL findings. Revert the regression; CI shows zero CRITICAL findings.

**Acceptance Scenarios**:

1. **Given** a PR with a calc regression that breaks mode ordering, **When** the workflow runs, **Then** CI fails with a comment listing the specific persona × invariant cells that flagged.
2. **Given** a PR with no audit regressions, **When** the workflow runs, **Then** CI passes and the comment shows zero CRITICAL / zero HIGH.
3. **Given** the workflow takes longer than 10 minutes, **Then** it times out and posts a warning comment (but does not block merge).

---

### User Story 6 — Harness fireAge ≤ endAge Clamp (Priority: P3) — Carry-forward B-020-7

The audit harness's call to `findFireAgeNumerical` for the `RR-edge-fire-at-endage` persona produces a `fireAge` value greater than `endAge` because the harness sandbox doesn't apply the same UI-side clamp the real dashboard does (the live UI prevents users from setting `fireAge > endAge`). This produces the last remaining HIGH finding in the audit report. This story adds the clamp inside the harness's invocation.

**Why this priority**: P3, but it clears the last HIGH finding from feature 020's audit-report (SC-003 fully satisfied for the first time). Quick fix.

**Independent Test**: After the clamp is added, re-run `node --test tests/unit/validation-audit/cross-chart-consistency.test.js`. The C3 finding count drops from 1 (`RR-edge-fire-at-endage`) to 0.

**Acceptance Scenarios**:

1. **Given** a persona where `currentAge + accumulationYears > endAge`, **When** the harness invokes `findFireAgeNumerical`, **Then** the returned `fireAge` is clamped to `endAge` and the persona is treated as already-retired in subsequent invariant checks.
2. **Given** the C3 invariant runs across all 92 personas after the clamp, **Then** zero `endBalance-mismatch` findings remain.

---

### User Story 7 — True Fractional-Year DWZ Feasibility (Priority: P3, OPTIONAL) — Carry-forward B-020-5

Currently, month-precision in the FIRE-age display is a **UI refinement only**: feasibility is checked at year granularity, and the displayed months come from a second-pass year-then-month search that calls the same year-level helper with a fractional age. This story extends `simulateRetirementOnlySigned` to **pro-rate the FIRE-year row** by `(1 − m/12)` so feasibility is genuinely month-precise rather than display-only.

**Why this priority**: P3 OPTIONAL — defer if scope creeps. The UX value is small (current month-display works fine for typical users; the underlying feasibility decision rarely flips at the month boundary). Adding this is a meaningful calc-layer change with its own test surface.

**Independent Test**: New unit test in `tests/unit/monthPrecisionResolver.test.js` checks that for a synthetic persona where the year-level search returns "feasible at 55", the month-precision search now correctly identifies the earliest *month* (e.g., 55y 7mo) where the simulator's pro-rated FIRE-year row passes the feasibility gate.

**Acceptance Scenarios**:

1. **Given** a persona at the year boundary of feasibility (e.g., barely feasible at 55, infeasible at 54), **When** the month-precise search runs, **Then** it correctly identifies the earliest month within age 55 where feasibility holds.
2. **Given** any persona, **When** the month-precision search returns `{years: Y, months: M}`, **Then** simulating with `fireAge = Y + M/12` produces a feasible chart trajectory (no `hasShortfall` rows under the active mode).

---

### Edge Cases

- **Country scenario change**: Other tax has no country-percentage auto-default (default = 0 for all countries). User's manual entry MUST be preserved across country switches.
- **Country scenario change while in pre-FIRE phase**: Income tax sub-row continues to show US progressive + FICA regardless of country selected. The country selection only affects post-FIRE retirement assumptions (already handled by the existing `scenarios` array budget tiers).
- **Filing status change (single ↔ MFJ)**: When `adultCount` changes in the Generic dashboard, the Income tax row immediately recomputes using the new bracket table.
- **Income below standard deduction**: Income tax row shows $0/mo and 0% effective rate; no negative tax.
- **`taxRate` override flag user already had populated**: Existing users with `taxRate=0.22` keep flat-rate behavior unchanged when they reload after the upgrade. Migration is implicit (no popup).
- **Audit harness timeout in CI**: If the workflow exceeds 10 minutes, it fails soft (warning, not blocker).
- **All countries, including territorial-tax / no-foreign-tax (Malaysia, Singapore, Costa Rica) and worldwide-income-tax (Japan, Taiwan, China, Mexico)**: Other tax default = 0; foreign tax (if any) is already absorbed into the budget-tier number per A2.
- **Renderer crash if calc returns unexpected shape**: Lock icon + tooltip for the Income tax row gracefully shows "—" if `federalTax` is missing or non-finite. No NaN cascade.

## Requirements *(mandatory)*

### Functional Requirements

#### Tax Expense Category UI (US1, US2)

- **FR-001**: System MUST add a **Tax** top-level expense category to the Expenses pill in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (lockstep).
- **FR-002**: The Tax category MUST contain exactly two sub-rows: **Income tax** (auto-computed, read-only, lock icon) and **Other tax** (manually editable).
- **FR-003**: Income tax sub-row MUST display two values: monthly dollar amount AND effective tax rate as a percentage.
- **FR-004**: Income tax sub-row MUST show a tooltip explaining that the value is auto-computed and is NOT included in `monthlySpend`.
- **FR-005**: Income tax sub-row MUST update within one animation frame (≤16ms) when any input affecting the calculation changes.
- **FR-006**: Income tax MUST NOT sum into `monthlySpend` (it is already deducted from income via the v2 cash-flow calc).
- **FR-007**: Other tax sub-row MUST sum into `monthlySpend` like a normal expense bucket.
- **FR-008**: Other tax sub-row MUST default to **0 for ALL country scenarios** (including non-US). The per-country `comfortableSpend` / `normalSpend` budget tiers in the existing `scenarios` array are defined as all-in annual withdrawals that include any foreign tax owed by a US-citizen retiree drawing from US accounts; auto-populating Other tax with a percentage on top would double-count.
- **FR-009**: Other tax sub-row's manually-entered value MUST be preserved across country-scenario changes.
- **FR-009a**: The per-country `taxNote` field in the existing `scenarios` array MUST be displayed alongside the Income tax sub-row (or via tooltip) when `selectedScenario !== 'us'` to surface the country-specific foreign-tax landscape that justifies the all-in budget tier number. Implementation may use the existing scenarios-array `taxNote` strings unchanged.
- **FR-010**: System MUST add new translation keys `expenses.tax.category`, `expenses.tax.income`, `expenses.tax.incomeTooltip`, `expenses.tax.other`, `expenses.tax.otherPlaceholder` to `TRANSLATIONS.en` and `TRANSLATIONS.zh` in both HTMLs, plus updating `FIRE-Dashboard Translation Catalog.md`.

#### Progressive Bracket Calc Refactor (US3)

- **FR-011**: `calc/accumulateToFire.js` MUST compute `federalTax` per year using progressive tax brackets when the user's `taxRate` input is blank or 0.
- **FR-011a**: `calc/accumulateToFire.js` MUST also compute a new `ficaTax` field per year, equal to Social Security tax (6.2% on wages up to the 2024 wage base of $168,600 per individual) + Medicare tax (1.45% on all wages) + additional Medicare tax (0.9% on wages above $200,000 single / $250,000 MFJ).
- **FR-011b**: For RR (always MFJ) and Generic with `adultCount=2`, the SS wage base cap MUST apply per individual (not per couple); spec assumes income split equally across the two earners unless a per-person income field is added in a future feature.
- **FR-012**: Federal brackets used MUST match the IRS standard brackets for tax year 2024: 10% / 12% / 22% / 24% / 32% / 35% / 37% with the standard deduction. FICA rates and wage base MUST match the SSA 2024 published values.
- **FR-013**: Filing status MUST be detected from `adultCount` (Generic) or RR-default (RR is always MFJ).
- **FR-014**: When `taxRate` is populated (>0), accumulation MUST use the flat-rate path for full backwards-compatibility with feature 020. In flat-rate mode `ficaTax` is set to 0 (the user's flat rate is presumed to already account for FICA).
- **FR-015**: The Investment-tab `taxRate` slider MUST gain an "Auto" toggle that clears the flat rate (sets to 0/blank) and switches to progressive brackets + FICA. When Auto is ON, the slider stays visible but disabled (grayed out) and displays the auto-computed effective rate as a read-only number next to it (e.g., "Auto: 15.8%"). When Auto is OFF, the slider behaves as today (manual flat rate). Default Auto state on first load: ON if `taxRate` is blank/0; OFF if `taxRate` has a non-zero saved value (preserves existing-user mental models).
- **FR-016**: The Income tax sub-row in the Expenses UI MUST read its monthly value from `(federalTax + ficaTax) / 12` produced by the calc engine — not recompute independently — so UI and calc cannot diverge. Effective rate displayed = `(federalTax + ficaTax) / grossIncome × 100`.
- **FR-016a**: `copyDebugInfo()` MUST emit per-row `federalTaxBreakdown` (object with bracket-by-bracket dollar amounts plus standardDeduction and taxableIncome) and `ficaBreakdown` (object with socialSecurity, medicare, additionalMedicare, ssWageBaseHit) alongside the existing aggregate `federalTax` and the new aggregate `ficaTax` fields. Aggregates kept for backwards-compat with feature-020 audit consumers; breakdowns are additive.
- **FR-016b**: The validation-audit harness MUST add a new invariant family `tax-bracket-conservation` asserting that for any non-clamped accumulation year `Σ(federalTaxBreakdown.bracket*) === federalTax` within ±$1 (sum of breakdown components equals the aggregate). Severity HIGH.
- **FR-017**: Existing 413 unit tests MUST stay green after the refactor. Tests with pinned dollar values impacted by the bracket switch MAY be updated with a `// 021:` comment documenting the delta (per the same convention as feature 020's `// 020:` comments).

#### Audit-Harness Carry-Forward (US4, US5, US6, US7-optional)

- **FR-018**: `calc/strategyRanker.js` MUST add hysteresis to its scoring: a winner change requires the new contender to beat the previous winner by more than ±0.05 years' equivalent score margin. (US4 / B-020-4)
- **FR-019**: Repository MUST add `.github/workflows/audit.yml` running `node --test tests/unit/validation-audit/` on every push and PR. (US5 / B-020-6)
- **FR-020**: The CI workflow MUST post a PR comment summarizing finding counts by severity. CRITICAL findings fail the build; HIGH emit warnings.
- **FR-021**: The audit harness's invocation of `findFireAgeNumerical` MUST clamp the returned `fireAge` to `≤ endAge`. (US6 / B-020-7)
- **FR-022** *(OPTIONAL)*: `simulateRetirementOnlySigned` MAY pro-rate the FIRE-year row by `(1 − m/12)` to support true fractional-year feasibility. (US7 / B-020-5; defer if scope creeps.)

#### Cross-cutting

- **FR-023**: Both HTML files MUST stay in lockstep (Constitution Principle I): every UI change ships to both, every translation key in both, every calc-side change reflected in both inline copies if applicable.
- **FR-024**: Constitution Principle VIII (Spending Funded First) gate at `tests/unit/spendingFloorPass.test.js` MUST stay green throughout.
- **FR-025**: Browser-smoke gate (manual) MUST be executed before merge to `main`.

### Key Entities

- **Tax expense category**: a top-level row in the Expenses pill containing two ordered sub-rows. Persists no value of its own (it's a header).
- **Income tax sub-row**: derived field. Reads `federalTax + ficaTax` from the active calc snapshot, divides by 12, formats as monthly $. Effective rate computed as `(federalTax + ficaTax) / grossIncome × 100`.
- **Other tax sub-row**: persisted manual input under a new localStorage key `exp_tax_other`. Sums into `monthlySpend`. Stores both the user's manual value AND a "country auto" sentinel that flips to false the moment the user types a value.
- **Tax brackets table**: `BRACKETS_MFJ_2024` and `BRACKETS_SINGLE_2024` constants for federal income tax — pure data, no logic.
- **FICA constants**: `FICA_SS_RATE = 0.062`, `FICA_SS_WAGE_BASE_2024 = 168600`, `FICA_MEDICARE_RATE = 0.0145`, `FICA_ADDITIONAL_MEDICARE_RATE = 0.009`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000`, `FICA_ADDITIONAL_MEDICARE_THRESHOLD_MFJ = 250000`.
- **`federalTax` v2 contract field**: existing field from feature 020's `accumulateToFire.js`. Now produced by progressive-bracket math (or flat-rate override). UI consumers must read this same field; no recomputation.
- **`ficaTax` v3 contract field**: NEW in feature 021. Sibling to `federalTax`. Set to 0 in flat-rate-override mode.
- **`federalTaxBreakdown` v3 audit field**: NEW in feature 021. Per-row audit-only structure exposing how `federalTax` was assembled — `{ bracket10, bracket12, bracket22, bracket24, bracket32, bracket35, bracket37, standardDeduction, taxableIncome }` (all integer dollars). Surfaced via `copyDebugInfo()` only; not consumed by any chart. Empty/zeroed when flat-rate override is in use.
- **`ficaBreakdown` v3 audit field**: NEW in feature 021. Per-row audit-only structure exposing FICA components — `{ socialSecurity, medicare, additionalMedicare, ssWageBaseHit }`. Surfaced via `copyDebugInfo()` only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening the Expenses pill in either dashboard sees a Tax category with both sub-rows visible within 1 second of pill activation.
- **SC-002**: For an RR-baseline scenario (MFJ, $150k income, $20k pretax 401k), the Income tax sub-row displays a monthly dollar value within ±$10 of the combined IRS-published 2024 federal income tax + SSA-published 2024 FICA for the same scenario (target ≈ $1,980/mo combined).
- **SC-003**: After dragging the gross-income slider, the Income tax sub-row updates within 16ms (one animation frame at 60fps).
- **SC-004**: 100% of country scenarios (US, Japan, Taiwan, others) produce a sensible Other-tax default that the user can override; user overrides are preserved across country changes.
- **SC-005**: The progressive-bracket refactor produces zero new CRITICAL findings in the validation audit harness when re-run after the change.
- **SC-006**: Strategy ranker hysteresis (US4) reduces E3 LOW findings from 17 to 0 in the audit re-run.
- **SC-007**: Harness fireAge clamp (US6) reduces remaining C3 HIGH findings from 1 to 0 in the audit re-run.
- **SC-008**: Audit CI workflow (US5) posts a PR comment within 10 minutes of every push to the feature branch.
- **SC-009**: SC-003 of feature 020 (zero HIGH findings post-fixes) becomes fully satisfied for the first time after this feature merges.
- **SC-010**: Existing 413 unit tests stay green; new tests added (estimated +12 to +15) all pass.
- **SC-011**: Constitution Principle VIII (Spending Funded First) gate stays green throughout all phases.

## Assumptions

- **A1**: User accepts US 2024 federal tax brackets AND 2024 FICA rates / wage base as the canonical reference; cross-year migration to 2025+ tables is a future feature, not part of this scope.
- **A1a**: For MFJ scenarios, the SS wage-base cap is applied per individual. The spec assumes income is split equally between the two earners (Roger + Rebecca for RR, person1 + person2 for Generic) for SS-cap purposes. A future feature (022) may add a per-person income split slider.
- **A1b**: Filing status is detected from `adultCount` (1 = single brackets, 2 = MFJ brackets). Married Filing Separately (MFS) is OUT OF SCOPE for feature 021 — MFS users keep the flat `taxRate` override path. A future feature (022) may add an explicit filing-status dropdown with MFS bracket table.
- **A1c**: For asymmetric-income couples where one earner significantly exceeds the SS wage base while the other earns little, the equal-split assumption may understate FICA by up to ~$1,200/yr (the SS-cap delta on the over-cap earner). Bounded and acceptable for feature 021; resolved by A1a's per-person-split future feature.
- **A2**: The Income tax sub-row models the **pre-FIRE accumulation phase only** — when the user is still in the US earning their current job income. It always uses US progressive brackets + FICA regardless of `selectedScenario` (which only affects post-FIRE retirement location). Post-FIRE foreign tax for non-US retirement scenarios is implicitly absorbed into the existing per-country `comfortableSpend` / `normalSpend` budget tiers in the `scenarios` array (treat those numbers as all-in withdrawals including any foreign tax). The existing `taxNote` field on each scenario documents the per-country foreign-tax rationale (territorial tax, treaty offsets, AMT thresholds). No country-specific progressive tax tables are added in this feature; the existing flat `taxRate` field remains available as an override for users who want a custom rate during accumulation.
- **A2a**: For Stay-in-US retirement (`selectedScenario === 'us'`), the existing `taxOptimizedWithdrawal` bracket-fill smoothing in retirement remains unchanged. This feature does not modify retirement-phase tax math.
- **A3**: The existing Investment-tab `taxRate` slider stays in place as an override; we don't relocate or rename it (avoids breaking user mental models from the current dashboard).
- **A4**: US7 (true fractional-year DWZ feasibility) is OPTIONAL and may be deferred to feature 022 if Phase 5 scope creeps beyond ~1 day of agent work.
- **A5**: The strategy ranker hysteresis tolerance of ±0.05 years was chosen heuristically from the audit data (E3 findings cluster within this band). May be tuned during implementation if it under- or over-corrects.
- **A6**: CI workflow uses `ubuntu-latest` and Node 20, matching the existing `.github/workflows/tests.yml` pattern. No `npm install`, no package.json (Constitution Principle V — zero-dep).
- **A7**: All UI strings are bilingual EN + zh-TW from the start; new keys are added to both translation tables atomically.
- **A8**: Browser-smoke gate (T080-equivalent) is user-side only and runs before merge — same workflow as features 018, 019, 020.
- **A9**: The audit harness's persona matrix shipped in feature 020 (92 personas) is reused unchanged. No new personas added in this feature.
- **A10**: Income tax effective rate is shown as a percentage rounded to one decimal place (e.g., "13.4%"). Monthly dollar value is rounded to whole dollars.
