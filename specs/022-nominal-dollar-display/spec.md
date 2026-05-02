# Feature Specification: Nominal-Dollar Display + Frame-Clarifying Comments + B-021 Carry-Forward

**Feature Branch**: `022-nominal-dollar-display`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "For P5, I want Option A. But I am also afraid this will bring complexity when I ask you to do other calculation changes, a solution might be you add comments in the code to clearly state what the calculations are for. but if that is a very complicated case, then B might be better."

## Background

The dashboard currently uses a **hybrid accounting frame**:
- Asset pools (`pStocks`, `pTrad`, `pRoth`, `pCash`) grow at **real return** = `nominal − inflation` → values are in today's purchasing power.
- Income is inflated by `raiseRate` per year → nominal-future-$ frame.
- Spending is inflated by `inflationRate` per year → nominal-future-$ frame.
- The cash-flow residual line in `accumulateToFire.js` **mixes both frames** (subtracts nominal income/spending from real-$ contributions), producing a slow systematic distortion in `pCash`.

When the user looks at the Lifecycle chart and sees `$822k at age 53`, that number is **today's purchasing power**, NOT the nominal balance their brokerage statement will show in 2037 (~$1,126k). This is unintuitive: real users mentally model their portfolio in nominal $ because that's what they see on every account statement.

This feature switches **display** to nominal future dollars without a heavy calc-engine rewrite (P5 Option A), inflating real-$ values at render time. It also fixes the hybrid-frame bug, adds frame-clarifying code comments to all calc modules, and bundles two carry-forward items from feature 021 (B-021-1 ranker simulator-discreteness, B-021-2 fractional-year DWZ).

A fallback safety valve (US7, OPTIONAL) ships a display toggle so users can flip between today's-$ and future-$ if the always-nominal display proves disorienting in practice.

## Clarifications

### Session 2026-05-01

- Q: What's the scope of "nominal-$ display" rollout — Lifecycle chart only, top-level surfaces, or all future-$ displays uniformly? → A: **All future-$ displays uniformly** (Option A). Switch the entire dashboard's future-value rendering to nominal-$ in one rollout. The full chart/display inventory in scope: (1) Lifecycle chart; (2) Withdrawal Strategy chart; (3) Drawdown chart; (4) Roth Ladder chart; (5) Healthcare delta chart; (6) Mortgage payoff bar chart; (7) Payoff vs Invest brokerage trajectory + amortization split + verdict banner; (8) Country budget tier comparison + Country deep-dive insight panel; (9) Strategy ranker score bar chart; (10) Plan-tab Expenses pill (incl. feature-021 Income tax sub-row); (11) all KPI cards (Current Net Worth, FIRE NUMBER, Total at FIRE, Years to FIRE message, Progress card); (12) Verdict pill + verdict banner; (13) Drag-preview overlay during FIRE-marker drag; (14) Audit-tab tables (per-year accumulation, gates, lifecycleProjection, fireAgeCandidates) — these get per-column frame labels since some columns are pure-data, some real-$, some nominal-$. **Snapshots history chart (History tab) stays as-is** since `FIRE-snapshots.csv` already contains nominal historical balances. **Rationale**: most coherent UX; user sees "every $ for a future year is in that year's dollars" — no per-chart inconsistency to remember. Implementation surface ~12-15 charts touched; estimated +1 day vs Lifecycle-only scope.
- Q: How does drag-preview + post-commit re-render handle nominal-$ conversion? → A: **Both use nominal-$ at the relevant target age** (Option A). During FIRE-marker drag, the drag-preview floating tooltip shows nominal-$ at the previewed age (e.g., "If you retire at 55 in 2039: ~$1.42M nominal (≈ $1.05M today's $)"). The temporary chart re-render during drag also uses nominal-$. After commit, ALL in-scope charts (FR-001 a–n) re-render with data points freshly converted using `nominal = real × (1 + inflationRate)^(dataPointAge − currentAge)` against the new fireAge — the conversion factor recomputes per data point, not just at fireAge. Performance: each chart re-render adds N `Math.pow` operations (N = chart data point count, ~50 max); 12 charts × 50 pow ops = ~600 pow operations per drag-frame; well under the 16ms / 60fps budget per Constitution III performance floor.
- Q: Does the spec need to define a visual treatment for a "today" boundary marker in any chart mixing historical + projected data? → A: **No special treatment needed** (Option A). The Snapshots history chart stays history-only per FR-001a. Future-projection charts (Lifecycle, Withdrawal Strategy, etc.) start at currentAge — the "today boundary" IS the leftmost data point, already implicit. No vertical "today" marker added in this feature. If a future feature builds a chart that mixes historical + projected data on the same axis, that feature defines its own boundary-marker UX.
- Q: Which terminology pair becomes canonical for user-facing UI strings? → A: **EN "purchasing power" / "Book Value" · zh-TW "約等於今日價值" / "帳面價值"**. Accounting-flavored framing rather than temporal: "Book Value" is literally what financial statements record (nominal $ as the account states), "purchasing power" is the economist-standard term for real-$ purchasing equivalent. Avoids the looser "today's $ / future $" framing and grounds the labels in concepts users encounter in real accounting contexts. Internal `// FRAME:` code comments keep the technical pair `real` / `nominal` for precision; the UI/code split prevents jargon leak while preserving calc-module rigor.
- Q: Which integration pattern does the spec adopt for applying the nominal-$ conversion across all in-scope charts (per-chart inline vs centralized snapshot)? → A: **Centralized in `recalcAll()`** (Option B). The snapshot object that `recalcAll()` produces gains a `bookValue` companion field for every `realValue` field consumed by charts (e.g., `lifecycleProjection.rows[i].totalBookValue` alongside the existing `total`). Render functions consume the `bookValue` fields directly; the conversion is computed once per recalc rather than per render. Consequence: a future new chart that forgets to read `bookValue` and reads `realValue` instead visibly shows today's-$ amounts in the chart — the bug is structurally surface-able in browser smoke + a new meta-test (`tests/meta/snapshot-frame-coverage.test.js`) that asserts every chart-consumed snapshot field has a `BookValue` companion. Estimated cost: ~30-min one-time `recalcAll()` extension plus the meta-test. **Rationale**: per the user's preference for "robust + doesn't easily get missed when there are changes" — this pattern makes forgetting to convert a visible bug rather than a silent one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Nominal-Dollar Display in Lifecycle Chart + KPI Cards (Priority: P1) — MVP

A FIRE planner opens the dashboard and reads the Lifecycle chart Y-axis, KPI cards (Current Net Worth, FIRE NUMBER, Total Portfolio at FIRE), verdict pill, and year-by-year asset breakdown table. **Every monetary value displays in nominal future dollars** — what the brokerage account statement will literally show on that future date. A small tooltip / footnote explains the inflation assumption (e.g., "All values shown in nominal future dollars at 3% assumed annual inflation").

For RR-baseline (start $445k, $12k/yr contribution, 7% nominal, 3% inflation):
- Today (age 42): $445k
- Age 53 (FIRE, 11 years out): ~**$1,126k nominal** (was: $822k real in feature 021's display)
- Age 100 (plan end, 58 years out): nominal value substantially larger

**Why this priority**: User mental model alignment — real users look at brokerage statements in nominal $ daily. The "$822k after 11 years" feedback was disorienting because it didn't match what users expect to see in their account. Displaying nominal $ is the FIRE community's de-facto convention (Mr. Money Mustache, Mad Fientist, Early Retirement Now all default to nominal projections).

**Independent Test**: Set RR-baseline. Lifecycle chart at age 53 shows ~$1,126k (within ±$20k of `nominal_FV = 445k × 1.07^11 + 12k_yr_annuity_at_7%`). KPI card "Total Portfolio at FIRE" matches the chart number. Switch language EN ↔ 中文; values unchanged, label localizes.

**Acceptance Scenarios**:

1. **Given** RR-baseline scenario, **When** the user opens the Lifecycle chart, **Then** Y-axis values are in nominal future dollars and the chart's age-53 total ≈ $1,126k.
2. **Given** the user is on any tab, **When** they read a KPI card showing a future $ amount (FIRE NUMBER, Total at FIRE, etc.), **Then** the value is nominal future $.
3. **Given** any chart, **When** the user hovers over a data point, **Then** the tooltip shows the nominal future $ value AND a one-line caveat ("≈ $X in today's dollars" — small text below).
4. **Given** the user switches inflation rate from 3% to 5%, **When** the chart re-renders, **Then** all future $ values shift up (more inflation = more nominal $ for the same real purchasing power).
5. **Given** the dashboard is loaded for the first time, **When** the user looks at the Lifecycle chart caption, **Then** a one-line note explains the nominal-$ display ("Values shown in nominal future dollars at {inflationRate}% assumed annual inflation").

---

### User Story 2 — Frame-Clarifying Code Comments (Priority: P1)

Every calculation module and every inline simulator in both HTMLs gains explicit `// FRAME:` comment annotations declaring which accounting frame each variable lives in. This is preventive maintenance — addresses the user's stated concern that future calc changes might re-introduce frame mismatches if the conventions aren't visible at the call site.

Examples of the annotation pattern:

```js
// FRAME: real-$ (today's purchasing power)
const realReturnStocks = inp.returnRate - inp.inflationRate;

// FRAME: nominal future-$ (year `yearsFromNow` from start)
const grossIncome = annualIncomeBase * Math.pow(1 + raiseRate, yearsFromNow);

// FRAME: real-$ pool growth + real-$ contribution. End-of-year balance
//        is in real-$ (today's purchasing power).
pStocks = pStocks * (1 + realReturnStocks) + effectiveAnnualSavings;

// FRAME-DISPLAY: convert real-$ pStocks to nominal future-$ for chart render.
const pStocksNominal = pStocks * Math.pow(1 + inp.inflationRate, yearsFromNow);
```

**Why this priority**: P1 because it's the user's hedge against complexity. They explicitly said: *"a solution might be you add comments in the code to clearly state what the calculations are for"*. Without these comments, future Manager-dispatched calc changes risk re-introducing the hybrid-frame bug US3 fixes.

**Independent Test**: Grep `calc/*.js` and inline simulators in both HTMLs for `// FRAME:` annotations. Every variable name containing "Real" or "Nominal" or any compound expression touching `realReturn`, `inflationRate`, or `Math.pow(1 + ...)` MUST have a `// FRAME:` annotation within 3 lines above. Coverage threshold: ≥95% of qualifying lines.

**Acceptance Scenarios**:

1. **Given** any calc module, **When** a developer reads the file top-down, **Then** every numeric expression that crosses a frame boundary (real → nominal or vice versa) is annotated.
2. **Given** a future Manager-dispatched task ("change the federalTax computation"), **When** the agent reads `accumulateToFire.js`, **Then** the `// FRAME:` comments make the existing accounting frame unambiguous.
3. **Given** the meta-test `tests/meta/frame-coverage.test.js` (NEW in this feature), **When** it runs, **Then** it asserts ≥95% of qualifying calc-module lines have `// FRAME:` annotations within 3 lines above.

---

### User Story 3 — Fix Hybrid-Frame Bug in Accumulation Cash-Flow Residual (Priority: P1)

In `calc/accumulateToFire.js`, the v3 cash-flow residual line subtracts nominal income (`grossIncome`, inflated by `raiseRate`) and nominal spending (`annualSpending`, inflated by `inflationRate`) from real-$ contributions (`pretax401kEmployee`, `stockContribution` — constant $$ each year). The residual is then added to `pCash` which grows at real return. This produces ~1-3% systematic distortion in the cash pool over 11+ year horizons, especially when `raiseRate ≠ inflationRate`.

This story aligns the cash-flow residual to a single frame (real-$, since that's the dominant frame for pool growth):

- Compute `grossIncome_real` = `annualIncomeBase * Math.pow(1 + raiseRate − inflationRate, yearsFromNow)` — assume real wage growth = `raiseRate − inflationRate`.
- Spending stays constant in real terms: `annualSpending_real = baseAnnualSpend` (no inflation pow).
- Tax is computed on real income (the IRS brackets are inflation-indexed in reality, so this is closer to truth than the current "fixed 2024 brackets applied to inflated income" path which produces synthetic bracket creep).
- Residual: `grossIncome_real − federalTax_real − ficaTax_real − pretax401k − annualSpending_real − stockContribution` (all real-$).
- Conservation invariant from feature 020 (`Σincome − Σtax − Σspend − Σ401k − Σstock = ΣcashFlow`) becomes well-defined.

**Why this priority**: P1 because the bug compounds over time and silently distorts FIRE-feasibility math. The cash pool drives buffer-floor decisions during retirement; ~1-3% drift accumulates to thousands of $ in user-visible FIRE-age shifts.

**Independent Test**: Run `node --test tests/unit/accumulateToFire.test.js`. New v4-FRAME-* test cases verify the residual is computed in a single frame. Re-run feature 020's `cashFlowConservation` audit invariant — RR-baseline residual should be $0 exact (was: $0 exact in feature 020 because all values were in nominal frame, but inconsistent with pool growth).

**Acceptance Scenarios**:

1. **Given** RR-baseline persona, **When** `accumulateToFire` runs, **Then** the cash-flow residual is computed in a single frame (real-$). Conservation invariant holds within ±$1 per year.
2. **Given** a persona with `raiseRate ≠ inflationRate` (e.g., real wage growth 1%/yr), **When** the calc runs, **Then** real income grows at `(raiseRate − inflationRate)`/yr, not at `raiseRate`/yr.
3. **Given** the v3 audit invariant family `tax-bracket-conservation` (TBC-1 through TBC-5 from feature 021), **When** rerun against the post-fix calc, **Then** all 5 invariants stay green.

---

### User Story 4 — Country Budget Tier Frame Audit + Documentation (Priority: P2)

The 12 country scenarios in `FIRE-Dashboard.html` have `comfortableSpend` and `normalSpend` numbers (e.g., Taiwan = $60k / Japan = $72k / US = $120k). Per feature 021's Q2 clarification, these are intended as **all-in annual withdrawals including any foreign tax**. But the spec didn't pin which frame the dollar values live in — today's $ or year-of-retirement $.

This story:
1. **Document** the canonical frame: country budget tiers are stated in **today's purchasing power** (real-$). The retirement-phase simulator inflates them per year.
2. **Audit** the 12 scenarios + verify each `taxNote` is consistent with today's $ framing (e.g., Taiwan's $33k AMT exemption is "today's $33k" not "year-2037 $33k").
3. **Add a tooltip** to the country-budget tier display: "Annual cost in today's dollars; the dashboard inflates this to your retirement year."
4. **No tier number changes** — just frame disambiguation.

**Why this priority**: P2 because the country tiers don't currently produce wrong numbers (the existing real-$ pool growth implicitly handles them correctly), but the FRAME ambiguity bites the user when they ask "is $60k Taiwan tier today's $ or future $?". US1's nominal-$ display will visually expose this gap.

**Independent Test**: Open dashboard with country = Taiwan. Verify the budget tier tooltip explicitly says "today's $". Re-read each `scenarios[].taxNote` for consistency.

**Acceptance Scenarios**:

1. **Given** the user views the country selector, **When** they hover the tier dollar amount, **Then** a tooltip clarifies the frame ("Cost in today's dollars; inflated during retirement").
2. **Given** the dashboard switches to US1's nominal-$ display, **When** the retirement-phase chart shows the country's spending, **Then** the tier dollar amount inflates correctly per year (not stuck at today's $).

---

### User Story 5 — Strategy Ranker Simulator-Discreteness Fix (Priority: P3) — Carry-forward B-021-1

**17 LOW findings (E3) inherited from feature 021 audit.** Root cause: `_simulateStrategyLifetime` accumulation loop iterates integer years; `yrsToFire = fireAge − inp.agePerson1` truncates to integer; a 0.01yr perturbation shifts `yrsToFire` by a full year, producing score deltas of 0.08–11.44 years (above the 0.05yr hysteresis threshold from feature 021 FR-018).

This story fixes the simulator's integer-year sensitivity by quantizing the ranker's age input to monthly precision before simulator iteration. The audit's ±0.01yr perturbations no longer cross integer-month boundaries; score deltas collapse to sub-0.05yr; hysteresis correctly absorbs them.

**Why this priority**: P3 because the user impact is invisible (drag UI snaps to integer-year increments anyway), but it's the last unresolved audit-finding cluster. Bundles cleanly with US6 since both touch simulator integer-year handling.

**Independent Test**: Re-run `node --test tests/unit/validation-audit/drag-invariants.test.js`. E3 finding count drops from 17 to 0.

**Acceptance Scenarios**:

1. **Given** any persona where the ranker previously flipped winners under a ±0.01yr age perturbation, **When** the perturbation is applied post-fix, **Then** the winner stays the same.
2. **Given** the feature 021 hysteresis tests (`tests/unit/strategyRankerHysteresis.test.js`), **When** rerun, **Then** all 5 tests stay green.

---

### User Story 6 — True Fractional-Year DWZ Feasibility (Priority: P3) — Carry-forward B-021-2 / B-020-5

The deferred-twice item from feature 020 → feature 021 → feature 022. Extends `simulateRetirementOnlySigned` to pro-rate the FIRE-year row by `(1 − m/12)` for fractional `fireAge` inputs. Combined with US5 (which makes the simulator quantize to monthly precision), the whole month-precision DWZ feasibility becomes a true fractional-year search rather than a UI-display refinement.

The 6 spec hooks documented in `specs/021-tax-category-and-audit-cleanup/audit-report.md` Phase 9 deferral section apply:
1. Pick growth-multiplier convention (linear `1 + r × (1 − m/12)` vs exponential `(1 + r)^(1 − m/12)`).
2. Sub-iteration split at age 59.5 / `ssClaimAge` thresholds.
3. Tighten or replace monotonic-flip stability tolerance.
4. Add real-persona fractional-year tests.
5. New audit invariant `month-precision-feasibility`: simulating with the resolver's returned `Y + M/12` produces zero `hasShortfall:true` rows.
6. Flip `month-precision-resolver.contract.md` Edge Case 4 default from (c) to (b).

**Why this priority**: P3 because UI display already shows correct months in feature 020. True fractional feasibility is a precision improvement, not a visible correctness fix. P3, but bundled with US5 because both touch simulator integer-year handling.

**Independent Test**: New unit test in `tests/unit/monthPrecisionResolver.test.js` checks fractional-year feasibility for a barely-feasible-at-55 persona.

**Acceptance Scenarios**:

1. **Given** a synthetic persona barely feasible at age 55, infeasible at age 54, **When** the month-precision resolver runs, **Then** it identifies the earliest feasible month (e.g., 55y 7mo).
2. **Given** any persona with a `searchMethod === 'month-precision'` resolver result, **When** the simulator runs at `fireAge = Y + M/12`, **Then** zero `hasShortfall:true` rows appear under the active mode.

---

### User Story 7 — Display Toggle (Real-$ vs Nominal-$) (Priority: P3 OPTIONAL — Safety valve)

A small UI toggle — perhaps in the header next to the language switcher, or in a Settings popup — lets the user switch between **today's $ display** and **nominal future-$ display**. The default is nominal (per US1). The toggle is purely visual; no calc-engine changes.

**Why this priority and OPTIONAL**: This is the user's hedge mentioned in the spec input. If US1's always-nominal display proves intuitive in practice (the typical case for FIRE planners), US7 is unnecessary noise. If the always-nominal display causes visible confusion (e.g., users see "$1.13M FIRE NUMBER" and panic without realizing it's tomorrow's $), US7 ships the toggle.

**Decision criterion**: After US1 ships and the user has 1-2 weeks of feedback, ASK the user before implementing US7. If they're comfortable with always-nominal: skip. If they want the toggle: implement.

**Independent Test**: Add a toggle to header. Click "Today's $" → all values shift to feature-021-style real-$ display. Click "Future $" → values shift back to feature 022 nominal-$ display. State persists in localStorage.

**Acceptance Scenarios** (only if implemented):

1. **Given** the user toggles "Today's $", **When** they look at the Lifecycle chart, **Then** age-53 RR-baseline shows ~$822k.
2. **Given** the user toggles "Future $", **When** they look at the Lifecycle chart, **Then** age-53 RR-baseline shows ~$1,126k.
3. **Given** the user reloads the page, **When** the dashboard loads, **Then** the previously-selected toggle state restores.

---

### Edge Cases

- **Inflation rate = 0%**: nominal and real are identical; nothing changes visually.
- **Inflation rate higher than nominal return**: real return goes negative (1% nominal − 3% inflation = -2% real); feature 020's lifecycle chart already handles this. Verify both calc and display stay coherent.
- **Inflation rate slider drag**: every chart and KPI re-renders within one animation frame to reflect the new nominal projection.
- **Snapshot CSV (`FIRE-snapshots.csv`)**: this file records actual measured net worth over time — it MUST stay in nominal $ (it's what was in the accounts on that date). Confirm no accidental inflation/deflation conversion happens at write time.
- **Audit dump (`copyDebugInfo`)**: each field needs a frame label. The audit-tab table needs visual distinction between real-$ and nominal-$ columns.
- **zh-TW translation**: all new labels and tooltips ("today's $" / "今日購買力", "nominal future $" / "未來名目美元") in both languages from inception.
- **Country-budget switch**: switching from US to Japan with US1 active — the nominal-$ display for spending should reflect the country's tier inflated to retirement year.

## Requirements *(mandatory)*

### Functional Requirements

#### Display layer (US1) — Full chart/display inventory

- **FR-001**: ALL future-$ displays in the dashboard MUST uniformly switch to nominal-$ rendering. The complete inventory in scope:
  - **(a)** Lifecycle chart (Plan tab → Lifecycle pill AND Retirement → Lifecycle pill — same chart instance).
  - **(b)** Withdrawal Strategy chart (Retirement → Withdrawal Strategy pill).
  - **(c)** Drawdown chart (Retirement → Drawdown pill).
  - **(d)** Roth Ladder chart (Retirement → Drawdown pill, secondary chart).
  - **(e)** Healthcare delta chart (Geography → Healthcare pill).
  - **(f)** Mortgage payoff bar chart (Plan → Mortgage pill).
  - **(g)** Payoff vs Invest brokerage trajectory chart + amortization split chart + verdict banner (Plan → Payoff vs Invest pill).
  - **(h)** Country budget tier comparison + Country deep-dive insight panel (Geography → Scenarios pill).
  - **(i)** Strategy ranker score bar chart (rendered alongside Withdrawal Strategy / Audit tab).
  - **(j)** Plan-tab Expenses pill (all expense bucket rows + Tax category Income tax + Other tax sub-rows shipped in feature 021).
  - **(k)** All KPI cards: Current Net Worth, FIRE NUMBER (Primary), Total Portfolio at FIRE, Years to FIRE message, Progress card "% there".
  - **(l)** Verdict pill ("On Track — FIRE in X Years Y Months · Z% there") + verdict banner messages (Payoff vs Invest, infeasibility deficit, etc.).
  - **(m)** Drag-preview overlay during FIRE-marker drag (the floating tooltip that previews the projected total at the dragged-to age before user commits).
  - **(n)** Audit-tab tables (per-year accumulation row table, gates table, lifecycleProjection.rows, fireAgeCandidates table) — these gain a per-column frame label since some columns are pure-data (e.g., `age`, `year`), some real-$ (e.g., `taxableIncome`), some nominal-$ (e.g., displayed `total`).
- **FR-001a**: The Snapshots history chart (History tab plotting `FIRE-snapshots.csv`) is OUT OF SCOPE — those data points are already nominal historical balances and stay rendered as-is.
- **FR-002**: Each in-scope display MUST apply the conversion `nominal = real × (1 + inflationRate)^yearsFromNow` per data point at render time. `yearsFromNow` is computed from the data point's `age` field minus current age.
- **FR-003**: Tooltips on every in-scope chart hover MUST show the Book Value (nominal $) AS the primary value AND a one-line "(≈ $X in purchasing power)" companion line for inflation-context awareness. zh-TW: primary "$X 帳面價值" + companion "約等於今日價值 $Y".
- **FR-004**: Each in-scope chart MUST render a one-line caption / footnote near its title: EN "Book Value at {inflationRate}% assumed annual inflation"; zh-TW "帳面價值 (假設年通膨率 {inflationRate}%)". A shared rendered helper (e.g., `_renderBookValueCaption(chartContainerEl)`) avoids per-chart copy-paste.
- **FR-005**: All translated UI strings — `display.frame.bookValue` ("Book Value" / "帳面價值"), `display.frame.purchasingPower` ("purchasing power" / "約等於今日價值"), `display.frame.assumedInflation` ("assumed annual inflation" / "假設年通膨率"), `display.frame.captionTemplate` (full caption string with `{0}` for inflationRate placeholder) — ship in EN + zh-TW per Constitution VII. Translation Catalog updated atomically.
- **FR-006**: KPI card "Current Net Worth" MUST stay rendered identically to today (today's-$ = today's-nominal $ = same value). Visual treatment: same KPI tile, no caption (the value is unambiguous because it's at year-0).
- **FR-007**: Audit-tab tables MUST display per-column frame labels in column headers: e.g., "Total (Book Value)", "Federal Tax (Book Value)", "Taxable Income (purchasing power)" / zh-TW "總額 (帳面價值)" / "聯邦稅 (帳面價值)" / "課稅所得 (約等於今日價值)". Frame label uses translated UI string per FR-005.
- **FR-008**: The display conversion factor `(1 + inflationRate)^yearsFromNow` MUST be applied at render time only, never written to localStorage or the snapshots CSV.
- **FR-008a**: During FIRE-marker drag, the drag-preview overlay MUST display Book Value at the previewed target age, with a purchasing-power companion line (e.g., EN "If you retire at 55: $1.42M Book Value · ≈ $1.05M purchasing power"; zh-TW "若於 55 歲退休: 帳面價值 $1.42M · 約等於今日價值 $1.05M"). The temporary chart re-render shown during drag MUST also use Book Value rendering.
- **FR-008b**: After drag commit (or any other input change that triggers `recalcAll()`: mode switch, slider drag, country switch, etc.), every in-scope chart MUST recompute the conversion factor `(1 + inflationRate)^(dataPointAge − currentAge)` per data point and re-render in nominal-$ within one animation frame (≤16ms per Constitution III performance floor).
- **FR-008c**: Drag-cancel (user releases the drag without committing) MUST revert all in-scope charts to their pre-drag nominal-$ rendering state — no residual visual inconsistency.
- **FR-008d**: The Book Value conversion MUST be applied centrally inside `recalcAll()`. The recalc snapshot object MUST gain `bookValue` companion fields for every `realValue` field consumed by charts. Render functions MUST read the `bookValue` field directly; they MUST NOT call a per-chart conversion helper. (This is the structural-robustness property: a future new chart that forgets to read `bookValue` displays a visibly wrong number rather than silently using the wrong frame.)
- **FR-008e**: A new meta-test `tests/meta/snapshot-frame-coverage.test.js` MUST assert that every chart-consumed snapshot field (enumerated against the FR-001 a–n inventory) has a corresponding `bookValue` companion in the snapshot. The test is a structural gate — adding a new chart without a `bookValue` companion fails the test before merge.

#### Frame-clarifying comments (US2)

- **FR-009**: Every `calc/*.js` module file MUST have a `// FRAME:` block header within the existing module-header comment that states the dominant frame and lists frame-conversion sites.
- **FR-010**: Every variable name containing `Real`, `Nominal`, `Inflation`, or any expression touching `Math.pow(1 + inflationRate, ...)` or `realReturn` MUST have a `// FRAME:` inline comment within 3 lines above documenting which frame the value lives in.
- **FR-011**: A new meta-test `tests/meta/frame-coverage.test.js` MUST run on every commit, asserting ≥95% of qualifying calc-module lines have `// FRAME:` annotations within 3 lines above.

#### Calc-layer fix (US3)

- **FR-012**: `calc/accumulateToFire.js` cash-flow residual MUST be computed in a single frame (real-$). All inputs to the residual MUST be in real-$ before subtraction.
- **FR-013**: `grossIncome` in the cash-flow residual MUST be computed using `(raiseRate − inflationRate)` (real wage growth), not `raiseRate` (nominal wage growth).
- **FR-014**: `annualSpending` in the cash-flow residual MUST be constant in real terms (no inflation pow inside the residual loop).
- **FR-015**: Federal tax + FICA MUST be computed on real-$ income. The 2024 IRS brackets / SSA wage base are treated as today's $ values — the implicit assumption is that brackets inflation-index in lockstep with real income (which they roughly do in reality).
- **FR-016**: Feature 020's `cashFlowConservation` audit invariant MUST stay green post-fix. Feature 021's `tax-bracket-conservation` invariants (TBC-1 through TBC-5) MUST stay green.
- **FR-017**: Existing test fixtures with pinned `cashFlowToCash`, `federalTax`, `ficaTax` values MAY be updated with `// 022:` comments documenting the frame-fix-induced delta (per the same convention as features 020 and 021).

#### Country budget tier audit (US4)

- **FR-018**: A tooltip on the country budget tier display MUST clarify the frame: "Cost in today's $; the dashboard inflates this to your retirement year for projections."
- **FR-019**: Each `scenarios[].taxNote` string MUST be reviewed for frame consistency. If any `taxNote` references a dollar value that's ambiguous (e.g., "$33k AMT exemption"), explicitly mark it as today's $ in the string.
- **FR-020**: No country budget tier numbers change in this feature — tier values stay verbatim from features 010 + 020 + 021 baselines.

#### B-021 carry-forward (US5, US6)

- **FR-021**: `_simulateStrategyLifetime` (in both HTMLs) MUST quantize the ranker's age input to monthly precision before iteration. Score deltas under ±0.01yr perturbations drop below the 0.05yr hysteresis threshold from feature 021 FR-018. (US5 / B-021-1)
- **FR-022**: `simulateRetirementOnlySigned` MUST support fractional `fireAge` inputs by pro-rating the FIRE-year row by `(1 − m/12)`. Spec hook 1 (growth-multiplier convention) MUST be resolved during planning. (US6 / B-021-2)
- **FR-023**: New audit invariant family `month-precision-feasibility` MUST be added to `tests/unit/validation-audit/`: for every persona with `searchMethod === 'month-precision'`, simulating at `fireAge = Y + M/12` produces zero `hasShortfall:true` rows under the active mode.

#### Display toggle — OPTIONAL safety valve (US7)

- **FR-024** *(OPTIONAL)*: A header-positioned toggle MAY ship that lets the user switch between "Purchasing Power" and "Book Value" display modes. EN labels: "purchasing power" / "Book Value"; zh-TW: "約等於今日價值" / "帳面價值". State persists via localStorage key `displayDollarMode` (`'purchasingPower'` or `'bookValue'`, default `'bookValue'`). All charts + KPI cards re-render on toggle within one animation frame.
- **FR-025** *(OPTIONAL)*: If FR-024 ships, the "Purchasing Power" state visually reproduces feature 021's display behavior exactly (no regression for users who prefer the inflation-adjusted framing).

#### Cross-cutting

- **FR-026**: Both HTML files MUST stay in lockstep (Constitution Principle I): every UI / calc / comment change ships to both, every translation key in both, every audit invariant test runs against both via the persona matrix.
- **FR-027**: Constitution Principle VIII (Spending Funded First) gate at `tests/unit/spendingFloorPass.test.js` MUST stay green throughout.
- **FR-028**: Browser-smoke gate (manual) MUST be executed before merge to `main`.
- **FR-029**: All existing 450+ tests MUST stay green. New tests added (estimated +18 to +25) all pass.

### Key Entities

- **Frame**: a label declaring the accounting basis of a numeric value. Two values: `real` (today's purchasing power) and `nominal` (year-of-occurrence dollars). Internally documented via `// FRAME:` comments; not a runtime data type.
- **DisplayConverter**: pure helper `toNominal(realValue, yearsFromNow, inflationRate) → nominalValue`. Lives in a new `calc/displayConverter.js` module per Constitution V.
- **DisplayDollarMode** *(if US7 implemented)*: localStorage value `'today'` | `'future'`. Drives a render-time switch.
- **FrameComment**: a `// FRAME: <real|nominal|conversion>` annotation in calc-module source. Not a runtime entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening the Lifecycle chart at RR-baseline sees an age-53 total within ±$20k of the nominal-FV calculation `$445k × 1.07^11 + $12k × annuity_factor_11_at_7% ≈ $1,126k`.
- **SC-002**: For any persona, the chart total at any future year MUST equal `realValue × (1 + inflationRate)^yearsFromNow` within ±0.5% (display precision rounding).
- **SC-003**: Every calc-module file passes the `frame-coverage.test.js` meta-test (≥95% qualifying-line annotation coverage).
- **SC-004**: Feature 020 conservation invariant stays green AND becomes well-defined post-US3 fix (residual single-frame, no hybrid).
- **SC-005**: Feature 021 audit invariants (TBC-1 through TBC-5) all stay green.
- **SC-006**: E3 LOW finding count from feature 021 audit drops from 17 to 0 post-US5 fix.
- **SC-007**: Tooltip on the country-budget tier display explicitly states "today's $" framing.
- **SC-008**: Existing 450+ tests stay green; new tests added all pass.
- **SC-009**: Constitution Principle VIII gate stays green throughout.
- **SC-010**: User-side browser-smoke gate (T088-equivalent) passes before merge.

## Assumptions

- **A1**: P5 Option A is the implementation path. Internal calc stays real-$; display layer converts at render time. If the resulting code-comment burden (US2) proves untenable in practice, the user may downgrade to P5 Option B (display toggle in US7) and revert US1 to default-real-$ mode.
- **A2**: The user prefers a single global display mode (US1's always-nominal) over a toggle (US7) by default. The toggle (US7) is a safety valve, not a required ship.
- **A3**: US3's hybrid-frame fix WILL change pinned dollar values in some existing tests. Budget for `// 022:` annotation work (~30 min per failing test, estimated 5-10 affected tests).
- **A4**: Country budget tier values stay verbatim in this feature. Future feature 023+ may revisit per-country tax-table modeling (out of scope here).
- **A5**: `FIRE-snapshots.csv` stays in nominal $ as it always has — these are measured historical balances. No frame conversion at write time.
- **A6**: The 2024 IRS brackets + SSA FICA constants are treated as today's $ in the calc layer (FR-014). Real-world brackets DO inflation-index in lockstep with wages, so this is closer to truth than the current code's "fixed 2024 brackets applied to inflated income" path.
- **A7**: US7 (display toggle) is OPTIONAL and ships only after user-validation feedback that always-nominal causes UX confusion.
- **A8**: All new translation keys ship in EN + zh-TW from inception.
- **A9**: Browser-smoke gate is user-side and runs before merge (same workflow as features 018, 019, 020, 021).
- **A10**: The audit harness's 92-persona matrix from feature 020 is reused unchanged.
- **A11**: Feature 021 should ideally merge to `main` BEFORE feature 022 implementation starts. If feature 021 hasn't merged when feature 022 implementation begins, all 022 work happens on a branch that has 021's commits; 022 cannot merge until 021 merges.
