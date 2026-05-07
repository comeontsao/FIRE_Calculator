# Feature Specification: Aggressive Bracket-Fill Withdrawal Strategy

**Feature Branch**: `027-aggressive-bracket-fill`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: see "Background" below.

## Background

The dashboard's existing "Bracket-Fill (Smoothed)" strategy caps annual Traditional 401k withdrawal at `MIN(bracketHeadroom, pTrad / yearsRemaining)`. The smoothing factor was added to prevent the older "drain Trad in 3-5 years" pathology. **However**, for households with modest Trad balances and long retirements (e.g., the SC-026-A fixture: $567K Trad split across 45 retirement years = $12.6K/yr cap, well below the $30K MFJ standard deduction), the smoothing cap dominates and the strategy never fills the 12% bracket. The user's standard-deduction headroom goes unused for years 60-69, and the deferred Trad balance is later withdrawn at higher effective rates in the 70s/80s (when Social Security stacks with Trad ordinary income).

Feature 026 US2 verified this with a head-to-head simulation in `tests/diagnostics/us2-aggressive-vs-smoothed.js`:

| Path | Lifetime Federal Tax (real-$) | Terminal BV at 95 (real-$) |
|------|------------------------------:|---------------------------:|
| **Smoothed** (current) | $165,920 | $627,918 |
| **Aggressive** (proposed) | $116,507 | $1,129,821 |
| **Δ** (aggressive − smoothed) | **−$49,413** (saves tax) | **+$501,903** (more estate) |

Both metrics improve by large margins. There is no trade-off — aggressive bracket-fill with explicit reinvestment of after-tax surplus is Pareto-better for this user class. Feature 027 ships the strategy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Strategy registration + per-year mechanic (Priority: P1)

The user opens the Withdrawal Strategy tab. They see a new strategy option called **"Aggressive Bracket-Fill"** alongside the existing options. When they select it (or it's auto-picked as the winner under "Pay less lifetime tax" objective for their scenario), the per-year withdrawal logic fills the 12% bracket fully each year ages 60-69, pays the resulting tax, and reinvests the after-tax surplus into Taxable stocks. Ages 70-95 revert to the existing smoothed cap behavior (because SS becomes ordinary income and stacks with any Trad pull).

**Why this priority**: This is the core feature. Without it, the registry is missing the strategy that the feature 026 US2 investigation identified as Pareto-better.

**Independent Test**: Load the SC-026-A fixture, select "Aggressive Bracket-Fill", verify the chart shows: (a) red Trad bars of ~$118K in years 60-69 with non-zero effective tax (~9%), (b) Trad balance fully drained by age 67-68, (c) the Taxable stocks bar visibly larger in years post-68 than under Smoothed Bracket-Fill (reflecting the reinvested surplus growing in Taxable), (d) lifetime federal tax displayed for the strategy is within ±5% of $116,507 real-$.

**Acceptance Scenarios**:

1. **Given** SC-026-A fixture loaded with "Pay less lifetime tax" objective, **When** the strategy ranker runs, **Then** "Aggressive Bracket-Fill" appears in the strategy registry with `lifetimeFederalTax` ≈ $116,507 real-$ (±5%) and `endBalance` ≈ $1,129,821 real-$ (±5%).
2. **Given** SC-026-A fixture, **When** "Aggressive Bracket-Fill" is the active winner under "Pay less lifetime tax" + Safe mode, **Then** the chart's per-year stacked bars show non-zero red (Trad) and purple (Trad bracket-fill excess) components in years 60-69, with effective tax rate ~8-10% in those years.
3. **Given** SC-026-A fixture with "Aggressive Bracket-Fill" selected, **When** the simulation reaches age 67 or 68, **Then** the Trad pool balance is approximately $0 (drained by the aggressive policy), and ages 70+ rely entirely on Taxable + Cash + SS for spending.
4. **Given** any input combination, **When** "Aggressive Bracket-Fill" runs the per-year mechanic, **Then** no year produces `hasShortfall: true` if the same scenario is feasible under "Bracket-Fill (Smoothed)" — i.e., aggressive doesn't make a feasible scenario infeasible.
5. **Given** a fixture where Trad balance is already large enough that smoothedTarget ≈ bracketHeadroom (e.g., $4M Trad / 30-year retirement), **When** comparing aggressive vs smoothed, **Then** the lifetime-tax delta is small (< $5K) and terminal-BV delta is small (< $30K) — the strategies converge for high-Trad cases. (Validates that aggressive does NOT regress for users where smoothed was already correct.)

---

### User Story 2 — Strategy ranker + UI integration (Priority: P2)

The user sees the new strategy in the Strategy Ranking audit panel alongside the existing 7 strategies. Under "Pay less lifetime tax" objective, if Aggressive Bracket-Fill has the lowest `lifetimeFederalTax` AND passes the active mode gate, it wins and is rendered in the chart. The ranker output exposes the same fields (`endBalance`, `lifetimeFederalTax`, `hasShortfall`, `safe_feasible`, `exact_feasible`, `dieWithZero_feasible`, `feasibleUnderCurrentMode`, `chosenTheta`) as the existing strategies.

**Why this priority**: Without ranker integration, the new strategy can't be auto-selected. The user would have to manually pick it every time.

**Independent Test**: Open the **Audit → Strategy Ranking** panel. Confirm "Aggressive Bracket-Fill" appears as a row alongside `bracket-fill-smoothed`, `tax-optimized-search`, etc. with all fields populated. Toggle objective Preserve ↔ Tax — winner switches accordingly. Confirm the strategy participates in the existing tie-breaker chain (Constitution IX).

**Acceptance Scenarios**:

1. **Given** the strategy registry is rendered, **When** the user opens the audit panel, **Then** they see exactly 8 strategies (the 7 existing + "Aggressive Bracket-Fill").
2. **Given** SC-026-A fixture + Safe mode + "Pay less lifetime tax" objective, **When** the ranker runs, **Then** "Aggressive Bracket-Fill" wins (lowest lifetime tax among feasible) AND `feasibleUnderCurrentMode: true`.
3. **Given** SC-026-A fixture + Die-With-Zero mode + "Leave more behind" objective, **When** the ranker runs, **Then** "Aggressive Bracket-Fill" is feasible but does NOT win (because the larger terminal estate it produces breaks the DWZ end-balance ≈ 0 constraint OR another strategy beats it on the residualArea sort key); the ranker's tie-breaker behavior remains correct.
4. **Given** any strategy ranker run, **When** the ranker emits the `barChartSeries` for the Strategy Ranking chart, **Then** "Aggressive Bracket-Fill" is included as a labeled bar with its endBalance / lifetimeFederalTax / violations data.

---

### User Story 3 — User-facing copy + tooltips (Priority: P2)

The user reads the strategy card describing what "Aggressive Bracket-Fill" does and when to pick it over Smoothed. The copy must be available in **both English and Traditional Chinese** (Constitution VII NON-NEGOTIABLE).

**Why this priority**: Without clear copy, users will pick the strategy by accident or fail to understand the trade-off (paying more tax now in exchange for more terminal estate over the long run).

**Independent Test**: Toggle EN ↔ 中文 in the language switcher. Confirm:
- The strategy name appears in the strategy card title in both languages.
- The 1-2 sentence description appears in both languages.
- The strategy-card tooltip (hover state) explains when to pick this over Smoothed in both languages.
- All new strings are wired through `data-i18n` / `t()` and present in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts in BOTH HTML files.

**Acceptance Scenarios**:

1. **Given** EN locale, **When** the user hovers the new strategy card, **Then** the tooltip reads (suggested wording): "Fills the 12% bracket every retirement year and reinvests the after-tax surplus into Taxable stocks. Larger lifetime tax savings than Smoothed Bracket-Fill but requires the user to actually reinvest the surplus (not consume it). Best for households with modest Trad balances and long retirements."
2. **Given** zh-TW locale, **When** the user hovers the same card, **Then** the tooltip renders the equivalent Traditional Chinese translation (no untranslated EN strings).
3. **Given** the dashboard with "Aggressive Bracket-Fill" as the active winner, **When** the strategy-narrative card is rendered, **Then** the displayed name and short description are in the user's selected locale.

---

### User Story 4 — Visual feedback in the Withdrawal Strategy chart (Priority: P3)

The user looks at the per-year stacked bar chart with "Aggressive Bracket-Fill" selected. The chart visibly differs from Smoothed:
- Years 60-69: meaningful red (Trad draw taxed) and purple (Trad bracket-fill excess) bars.
- Effective tax rate line (yellow) jumps from 0% to ~8-10% in years 60-69.
- Years 70+: smaller Trad bars (Trad pool exhausted by age 68); Taxable bars visibly larger than under Smoothed.
- Tooltip on year 65 shows `Trad 401K draw (taxed)` of approximately $50-60K and `Trad: Bracket-fill excess` of approximately $50-60K (totaling ~$118K of Trad pull at the bracket cap).

**Why this priority**: User trust hinges on the chart visibly reflecting what the strategy is doing. Without visible Trad bars in 60-69, the user (correctly) assumes the strategy isn't actually filling the bracket — exactly the bug feature 026 US2 surfaced.

**Independent Test**: Manual browser smoke. Load SC-026-A fixture with "Aggressive Bracket-Fill" selected. Hover ages 60, 65, 68. Confirm the tooltip values match the policy: full bracket fill ~$118K, effective tax ~9%. Compare side-by-side with Smoothed: the visual difference must be obvious.

**Acceptance Scenarios**:

1. **Given** "Aggressive Bracket-Fill" selected on SC-026-A, **When** the chart renders ages 60-69, **Then** each year shows a stacked combination of (Trad-taxed + Trad-bracket-fill-excess) totaling approximately $118K, plus the residual Taxable/Cash needed to cover spending after the Trad pull.
2. **Given** the same fixture with Smoothed selected, **When** the user toggles to Aggressive, **Then** the visual delta in years 60-69 is unmistakable (red+purple bars appear where there were none before).
3. **Given** the audit panel with strategy-by-strategy table, **When** the user reads the row for "Aggressive Bracket-Fill", **Then** the displayed `lifetimeFederalTax` value reflects the actual ~$116K (real-$) — NOT $0, which would indicate the strategy isn't running.

---

### Edge Cases

- **Trad balance smaller than full bracket headroom**: e.g., user has only $50K Trad. Aggressive fills the bracket up to whatever Trad is available — no error; falls back to "drain Trad in N years" behavior with the bracket cap still respected.
- **canAccess401k=false (pre-59.5)**: aggressive policy MUST NOT attempt to draw Trad in pre-unlock years. Same gate as existing strategies.
- **Rule of 55 enabled**: if user has Rule-of-55 + separation age ≥ 55, the unlock age drops to 55. Aggressive policy starts at 55 in this case, not 60.
- **SS active before age 70 (early-claim)**: if `inp.ssClaimAge < 70`, the aggressive window shrinks to `[max(60, unlockAge), ssClaimAge - 1]`. Once SS starts, aggressive REVERTS to smoothed cap because SS taxable income reduces bracket headroom.
- **Spending exceeds full bracket-fill + reinvestment**: if `(Trad bracket fill − tax) + Taxable + Cash + Roth < spend`, aggressive falls back to the **spending-floor pass** (Constitution VIII NON-NEGOTIABLE) — same as all other strategies. Spending must be funded first.
- **High-Trad case where smoothedTarget ≈ bracketHeadroom**: aggressive and smoothed converge. The new strategy MUST NOT regress for these users — see US1 acceptance scenario 5.
- **DWZ mode interaction**: aggressive may produce a much larger terminal estate than DWZ targets ($0 at plan age). Under DWZ, aggressive is unlikely to win the ranker (loses on residualArea sort key). It SHOULD remain feasible — just not preferred.
- **IRMAA threshold breach**: if aggressive pull pushes ordinary income (Trad + taxable SS) above IRMAA Tier 1 ($212K MFJ 2026), the existing IRMAA cap (Step 7 in `taxOptimizedWithdrawal`) MUST trigger. Aggressive policy plays inside the existing IRMAA framework, not around it.
- **Surviving-spouse single-filer brackets**: if the simulator models first-death and the survivor enters single-filer brackets, aggressive policy must use the SURVIVOR's tighter bracketHeadroom for those years, not the original MFJ value.

## Requirements *(mandatory)*

### Functional Requirements

#### Group A — Per-year mechanic (US1)

- **FR-001**: System MUST register a new strategy with id `aggressive-bracket-fill` in the existing strategy registry (the `STRATEGIES` array in `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`).
- **FR-002**: For each retirement year where `canAccess401k === true` AND `ssActive === false`, the strategy MUST set `wTrad = rmd + min(pTrad − rmd, bracketHeadroom)` — i.e., fill the full bracket headroom regardless of `pTrad / yearsRemaining`. (No smoothing cap in this window.)
- **FR-003**: For each retirement year where `ssActive === true`, the strategy MUST revert to the existing smoothed cap: `wTrad = rmd + min(pTrad − rmd, bracketHeadroom, smoothedTarget)`. (Same as `bracket-fill-smoothed` for ages 70+.)
- **FR-004**: After the year's spending is funded, any after-tax Trad surplus (i.e., `wTrad − ordinaryTaxOwed − amountConsumedForSpending`) MUST be reinvested into the Taxable stocks pool (`pStocks`).
- **FR-005**: System MUST honor Constitution VIII (Spending Funded First). If a year's pulls cannot cover spending, the spending-floor pass MUST run and `hasShortfall` MUST be flagged correctly.
- **FR-006**: System MUST honor existing IRMAA cap (Step 7) and RMD floor (Step 1) without modification. Aggressive policy modifies only Step 2 (bracket-fill computation).
- **FR-007**: System MUST NOT touch Trad in pre-unlock years (`canAccess401k === false`). Same gate as existing strategies.

#### Group B — Strategy ranker + audit integration (US2)

- **FR-008**: System MUST expose `endBalance`, `lifetimeFederalTax`, `hasShortfall`, `firstShortfallAge`, `violations`, `firstViolationAge`, `safe_feasible`, `exact_feasible`, `dieWithZero_feasible`, `feasibleUnderCurrentMode`, `chosenTheta` (null for non-search strategies), `isWinner` for the new strategy in the Strategy Ranking audit row, matching the schema of the existing 7 strategies.
- **FR-009**: System MUST include the new strategy in the `barChartSeries` consumed by the Strategy Ranking chart visualization, with the same datasets (End Balance, Lifetime Federal Tax, Floor Violations).
- **FR-010**: System MUST participate in the existing `getActiveSortKey({mode, objective})` chain (Constitution IX). Tie-breaker chain unchanged: primary → secondary → `strategyId` alphabetical.
- **FR-011**: System MUST be selectable as the active winner under the Pay-less-lifetime-tax objective for any mode where it is feasible. Under Leave-more-behind objective, it competes by `endBalance` + `residualArea` like the others.

#### Group C — User-facing copy + i18n (US3)

- **FR-012**: System MUST ship EN + zh-TW translations for: (a) the strategy name, (b) the 1-2 sentence description, (c) the strategy-card tooltip, (d) any narrative text the strategy contributes to the audit. New keys MUST be added to `TRANSLATIONS.en` AND `TRANSLATIONS.zh` dicts in BOTH HTML files (Constitution VII).
- **FR-013**: User-facing copy MUST avoid economics jargon per project memory. Use "lifetime tax", "broker dollars / Book Value", "purchasing power" — NOT "real $", "real money", "real value" without qualification.
- **FR-014**: New keys MUST be added to `FIRE-Dashboard Translation Catalog.md` in the same change set as the code change.

#### Group D — Visual feedback in chart (US4)

- **FR-015**: Withdrawal Strategy chart's per-year stacked bars MUST visibly reflect the aggressive policy: red (Trad taxed) + purple (Trad bracket-fill excess) bars in years 60-69 totaling ~$118K (real-$ at SC-026-A), with effective tax line (yellow) showing 8-10% in those years.
- **FR-016**: Tooltip on years 60-69 MUST show the correct breakdown: `Trad 401K draw (taxed)`, `Trad: Bracket-fill excess`, `Taxable stocks (LTCG)`, `Cash`, `Effective tax rate (%)`, `Total drawn`, `Tax owed`.
- **FR-017**: When the user toggles between strategies, the chart MUST re-render within one animation frame (no flash, no stale state).

#### Group E — Cross-cutting

- **FR-018**: Any change to `taxOptimizedWithdrawal` or to the ranker MUST include a passing run of `tests/unit/strategyMatrix.test.js` AND `tests/unit/spendingFloorPass.test.js` (Constitution review gates 6).
- **FR-019**: Any change to the sort-key dispatch MUST include a passing run of `tests/unit/modeObjectiveOrthogonality.test.js` (Constitution review gate 7).
- **FR-020**: System MUST be runnable via `file://` protocol (Constitution V). No new ES module imports, no new build step.
- **FR-021**: All code changes MUST land in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in lockstep (Constitution I).

### Key Entities

- **AggressiveBracketFillPolicy**: per-year withdrawal mix function with the same shape as existing `taxOptimizedWithdrawal` strategies. Inputs: `(grossSpend, ssIncome, pTrad, pRoth, pStocks, pCash, age, brackets, stockGainPct, options)`. Outputs: `{wTrad, wRoth, wStocks, wCash, taxOwed, ltcgTax, shortfall, ordIncome, syntheticConversion, ...}`.
- **StrategyRegistryEntry**: `{id: 'aggressive-bracket-fill', name: <i18n key>, description: <i18n key>, narrative: <i18n key>, computePerYearMix: AggressiveBracketFillPolicy}` — same shape as the existing 7 entries in the `STRATEGIES` array.
- **Existing entities preserved**: `WithdrawalTrajectory[]`, `StrategyRankingRow`, `BarChartSeries`, `WithdrawalResult` — all from feature 026 and earlier features. No schema change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At SC-026-A fixture, the new "Aggressive Bracket-Fill" strategy MUST produce `lifetimeFederalTax` between $110,682 and $122,332 real-$ (= $116,507 ± 5%) AND `endBalance` between $1,073,330 and $1,186,312 real-$ (= $1,129,821 ± 5%). Verified by `tests/unit/aggressiveBracketFill.test.js` (NEW).
- **SC-002**: At SC-026-A fixture, the new strategy MUST pass `safe_feasible: true` AND `exact_feasible: true`. (DWZ feasibility is allowed but not required — DWZ aims for $0 end balance, which the aggressive strategy by design overshoots.)
- **SC-003**: For at least one "high-Trad" fixture (e.g., $4M Trad / 30-year retirement), the lifetime-tax delta between Aggressive and Smoothed MUST be < $5K real-$ AND the terminal-BV delta MUST be < $30K real-$ (the strategies converge — aggressive doesn't regress for users where smoothed was already correct).
- **SC-004**: The Strategy Ranking audit panel MUST list the new strategy as one of 8 rows (existing 7 + the new one). All ranker fields populated.
- **SC-005**: When the user selects EN locale OR zh-TW locale, all new user-visible strings (strategy name, description, tooltip) MUST render in the selected language. Zero untranslated EN strings appearing under zh-TW.
- **SC-006**: The Withdrawal Strategy chart MUST render visually distinct bar shapes for ages 60-69 when toggling between Aggressive and Smoothed. The visual difference MUST be obvious to a non-technical user (no code inspection required).
- **SC-007**: The full unit test suite MUST pass (565 baseline + new tests added by 027) with 0 failures.
- **SC-008**: Playwright spec for the new strategy MUST run cleanly: load SC-026-A, select "Aggressive Bracket-Fill", verify chart bars + tooltip values match SC-001 ranges.
- **SC-009**: Browser smoke gate (per CLAUDE.md "Browser smoke before claiming a feature done"): both HTML files in EN + zh-TW, the new strategy appears in the registry, the chart renders correctly, no DevTools console errors.

## Assumptions

- The "Aggressive Bracket-Fill" name is final unless feature stakeholders prefer a different name during planning. Working name used in this spec.
- The aggressive window is `[max(60, effectiveUnlockAge), ssClaimAge - 1]` for users with default `ssClaimAge = 70`. Earlier claims shrink the window. Later claims (e.g., ssClaimAge = 70+) extend the window slightly, but most users claim at 67-70.
- The smoothing cap (`pTrad / yearsRemaining`) is preserved AS-IS for ages 70+ when SS is active. Ages 70+ behave identically to today's `bracket-fill-smoothed` strategy — no regression for the late-life phase.
- The reinvestment of the after-tax surplus into Taxable stocks uses the same compounding model the simulator already uses (real return at inputs' rate). No new tax-treatment assumption needed.
- The new strategy is added BESIDE the existing `bracket-fill-smoothed`, not replacing it. Backwards compat with the existing default winner is preserved.
- The strategy's identity in `getActiveSortKey` is unchanged: it competes by the same primary / tie-breaker keys as the existing strategies. No new sort axis added.
- The fixture SC-026-A is the canonical regression check. If a future feature changes default RR inputs (e.g., spend slider, retirement age), the published $116,507 / $1,129,821 numbers may shift; the ±5% tolerance accommodates small drift, but a major drift may require fixture re-baselining.
- The dashboard's existing IRMAA / ACA / AMT / surviving-spouse logic applies to aggressive identically. No new tax-modeling work is in scope.
- "Aggressive" is the user-facing name. The strategy is NOT "tax-optimized-search aggressive variant" — it's a separate registry entry. Tax-optimized-search remains as-is.
