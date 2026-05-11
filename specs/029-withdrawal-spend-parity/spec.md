# Feature Specification: Withdrawal-Simulator Spend Parity

**Feature Branch**: `029-withdrawal-spend-parity`
**Created**: 2026-05-11
**Status**: Draft
**Input**: User repro 2026-05-11 (RR scenario, kid2 college Roger ages 57–60, `aggressive-bracket-fill` winning strategy). User observed total portfolio dropping by ~$14K nominal year-over-year while the visible withdrawal bar showed only $132.2K (~5% of portfolio) and growth was set to 7%. Investigation traced the dissonance to two simulators in the pipeline that omit overlay spending (college tuition, pre-65 healthcare) from their `grossSpend` input, while a third simulator (the lifecycle chart) includes them — producing visible inconsistencies and an `endBalance-mismatch` audit warning that feature 028's strategy-aware threading did not resolve.

**Predecessor**: Feature 028 (strategy-aware-fire-age) merged to `main` 2026-05-11 via merge commit `7cc84ce`. Feature 028 fixed parity along the **strategy axis** (which strategy each simulator uses). This feature extends parity along the **spend axis** (which `grossSpend` value each simulator consumes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Withdrawal-Strategy chart truthfully shows total annual drawdown during overlay-spend years (Priority: P1)

The user is studying their FIRE plan during a year where annual spending is elevated by an overlay — kid college tuition, pre-65 healthcare premiums, or both. They hover over the Withdrawal-Strategy bar chart for that retirement year. The chart's stacked bar must equal what the portfolio actually pays out, including the overlay, so the user can trust the visible withdrawal rate when comparing it to projected returns.

**Why this priority**: The user-reported bug. The current visible-vs-actual gap leads to confused conclusions about whether the plan is sustainable. Truthful charts are the dashboard's primary value proposition. Highest priority because every user is affected during their kids' college years, every user pre-65 with healthcare costs.

**Independent Test**: Open RR HTML with the canonical repro fixture (Roger 42, kid2 age 3, college kid2 = `us-public-oos`, strategy winner = aggressive-bracket-fill). Hover the Withdrawal Strategy chart at age 57. The Taxable-stocks (LTCG) bar height must reflect base-spend + college tuition overlay (~$184K nominal), not just base-spend (~$132K). Repeat at age 58, 59, 60. Switch to Generic HTML, repeat. Switch active strategy via the picker through all 8 strategies; bar height stays in agreement with the lifecycle chart's portfolio drawdown for each.

**Acceptance Scenarios**:

1. **Given** the repro fixture above and `aggressive-bracket-fill` selected, **When** the user hovers age 57 on the Withdrawal Strategy chart, **Then** the stacked bar sum (Taxable stocks LTCG + others) shows ~$184K nominal (purchasing-power ~$102K), matching `lifecycleProjection.rows[57].withdrawals` in the audit dump.
2. **Given** the same fixture and any of the 8 strategies selected via the picker, **When** the user switches between strategies, **Then** for each strategy the age-57 bar height equals that strategy's actual age-57 drawdown as rendered on the Lifecycle chart.
3. **Given** a pre-65 fixture with significant healthcare overlay (e.g. scenario `us` with healthcare delta ≥ $10K/yr real), **When** the user hovers ages between FIRE and 65, **Then** the bar height includes the healthcare delta.
4. **Given** any retirement-age year with zero overlay (no college, no healthcare delta), **When** the user hovers that year, **Then** the bar height equals base-spend, identical to current behavior — no regression.

---

### User Story 2 — Strategy ranker compares strategies under correct spending (Priority: P1)

The strategy ranker scores all 8 withdrawal strategies and picks the winner based on a per-strategy lifecycle simulation. That simulation must use the same `grossSpend` formula the lifecycle chart uses, so the ranker's verdict reflects what the user will actually see drawn on the chart.

**Why this priority**: Same P1 as Story 1 — the ranker's output drives the displayed strategy, which drives every downstream visualization and the verdict pill. A ranker that judges strategies under understated spending may pick a "winner" that is actually infeasible (or pick a sub-optimal one) when overlay years are accounted for.

**Independent Test**: Run the ranker over a fixture where the spread between base-spend and base-spend + college is large enough to flip strategy feasibility (e.g., college at us-private at $85K/yr for one kid for four years, slim retirement buffer). Capture the strategy ranking. Apply the spec's fix. Re-rank. At least one strategy that was previously marked `feasibleUnderCurrentMode: true` must now correctly report `false` (or vice versa), reflecting the full spending pressure. The winner ID may change.

**Acceptance Scenarios**:

1. **Given** a fixture where adding overlay spend changes feasibility for at least one strategy, **When** the ranker runs, **Then** that strategy's `feasibleUnderCurrentMode` reflects the spending including overlays.
2. **Given** the standard repro fixture, **When** the ranker runs, **Then** every strategy's `endBalance` in the ranking table matches the chart's age-100 portfolio total when that strategy is selected for display.
3. **Given** a fixture with no overlays in any retirement year, **When** the ranker runs, **Then** the strategy ranking is byte-identical to current behavior — no regression.

---

### User Story 3 — Signed simulator agrees with chart simulator on end balance (Priority: P2)

The feature-028 verdict-pill stop-gap and the FIRE-age resolver rely on `signedLifecycleEndBalance` returning a number that agrees with `projectFullLifecycle`'s end-of-life balance. When they disagree (currently by 16% in the repro), the audit emits an `endBalance-mismatch` cross-validation warning, and the resolver's feasibility verdict can diverge from what the user sees on the chart in edge cases.

**Why this priority**: P2 because feature 028's stop-gap guard catches the user-visible symptom (misleading "On Track" pill) — so this is correctness of the safety net, not the user-facing surface. Still important: an untrusted safety net erodes trust in the verdict pill across all features that rely on it.

**Independent Test**: Open the repro fixture audit dump. Verify `crossValidationWarnings` contains an `endBalance-mismatch` entry today. Apply the fix. Reopen — entry must be absent. Repeat for every distinct strategy × mode combination in the canonical fixture set.

**Acceptance Scenarios**:

1. **Given** the repro fixture with `aggressive-bracket-fill` as winner and Exact mode, **When** the audit panel is opened, **Then** `crossValidationWarnings` contains zero `endBalance-mismatch` entries.
2. **Given** any of the 8 strategies × 3 modes (Safe / Exact / DWZ), **When** any canonical fixture is run, **Then** `signedLifecycleEndBalance` returns a value within ±$1 of the chart's age-`endAge` total for the same strategy.
3. **Given** a fixture where overlays push the chart end-balance to exactly zero, **When** the signed simulator runs, **Then** it agrees (also exactly zero), so the DWZ verdict gate cannot diverge by mistake.

---

### User Story 4 — Audit panel surfaces simulator-spend disagreements going forward (Priority: P3)

After this fix lands, a new audit invariant pins per-year `grossSpend` equality across all three simulators (`computeWithdrawalStrategy`, `_simulateStrategyLifetime`, `signedLifecycleEndBalance` / `projectFullLifecycle`). If a future change re-introduces a discrepancy, the audit panel surfaces a `simulator-grossSpend-parity` warning at the first affected age, with both values, so the regression is caught immediately rather than rediscovered via user repro.

**Why this priority**: P3 — defensive guardrail. Doesn't fix today's bug; prevents tomorrow's regression. Audit invariants are how the project codified the lessons of feature 014 (strategy-axis drift) and feature 028. This adds the spend-axis counterpart.

**Independent Test**: Modify the local copy of `_simulateStrategyLifetime` to once again pass `grossSpend: retireSpend` (drop the overlay). Run the audit. Verify the new invariant fires with a clear message naming the simulator, age, and the two divergent values. Revert.

**Acceptance Scenarios**:

1. **Given** a canonical fixture and all three simulators in agreement, **When** the audit runs, **Then** the `simulator-grossSpend-parity` invariant passes silently (no warning emitted).
2. **Given** an artificially induced spend discrepancy in any one simulator at any retirement age, **When** the audit runs, **Then** the invariant emits a structured warning containing `{ age, simulator, expectedSpend, actualSpend, diff }`.
3. **Given** a fixture with zero overlays (no college, no healthcare), **When** the audit runs, **Then** the invariant passes — the parity check does not introduce false positives.

---

### Edge Cases

- **No-overlay years**: When `collegeCostThisYear == 0` AND `hcDelta == 0`, all three simulators must produce byte-identical results to the pre-fix code path (regression-safe).
- **Negative-overlay years**: Healthcare delta can be negative (post-65 Medicare cheaper than ACA in some scenarios). Verify the fix handles negative deltas correctly without clamping.
- **Mortgage-adjusted base spend**: `retireSpend` is already mortgage-adjusted by `getMortgageAdjustedRetirement` before the simulators see it. The fix must not double-count mortgage P&I.
- **Home 2 carry**: `computeWithdrawalStrategy` adds h2Carry where applicable; check whether `_simulateStrategyLifetime` and `signedLifecycleEndBalance` need the same overlay. (Audit dump's `h2Carry` for the repro is 0, but the formula must support it.)
- **Scenario-specific overlays**: Geo-arbitrage scenarios (Japan, Taiwan, etc.) modify retireSpend and healthcare. Verify parity holds across all geographic scenarios in the canonical fixture suite.
- **SS-claim year cross-over**: When SS income starts at age 70, the simulators net SS against gross spend differently in subtle ways. Verify parity holds across the SS-claim boundary.
- **RMD years (73+)**: RMD floor interacts with the bracket-fill cap. Verify overlay-inclusive grossSpend doesn't perturb the RMD path.
- **One-shot lump-sum payoff years**: Feature 017/018 lump-sum mortgage payoff is a one-time event. Verify the fix doesn't inadvertently include it twice in any simulator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `_simulateStrategyLifetime` MUST compute `grossSpend` per retirement year as `retireSpend + hcDelta + collegeCostThisYear` (matching `computeWithdrawalStrategy`'s formula), where `hcDelta = getHealthcareDeltaAnnual(selectedScenario, age)` and `collegeCostThisYear = getTotalCollegeCostForYear(inp, age - inp.ageRoger)`.
- **FR-002**: `signedLifecycleEndBalance` (and any sub-simulator it delegates to, e.g. `simulateRetirementOnlySigned`) MUST consume the same `grossSpend` formula at every retirement age.
- **FR-003**: The fix MUST apply to all 8 registered strategies (`bracket-fill-smoothed`, `aggressive-bracket-fill`, `conventional`, `trad-first`, `proportional`, `tax-optimized-search`, `trad-last-preserve`, `roth-ladder`) and across all 3 FIRE modes (Safe, Exact, DieWithZero) and both Objectives (Preserve, Minimize Tax).
- **FR-004**: The Withdrawal Strategy chart (`renderRothLadder`) MUST display per-year bar totals equal to the per-strategy simulator's actual annual drawdown, including overlays, in book-value (nominal-$) and purchasing-power (real-$) frames.
- **FR-005**: A new `calcAudit` cross-validation invariant `simulator-grossSpend-parity` MUST compare, for every retirement age, the `grossSpend` consumed by `computeWithdrawalStrategy`, `_simulateStrategyLifetime`, and `projectFullLifecycle` (via `signedLifecycleEndBalance`'s call chain). When any disagree by more than $1, the invariant emits a structured `crossValidationWarnings` entry with `{ kind: 'simulator-grossSpend-parity', age, simulators: { ... }, diff }`.
- **FR-006**: The post-028 `endBalance-mismatch` cross-validation warning MUST resolve to zero entries on the canonical repro fixture set after the fix lands.
- **FR-007**: Both HTML dashboards (`FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`) MUST receive identical code changes per Constitution Principle I (Dual-Dashboard Lockstep). Personal-content delta (Roger / Rebecca references) must stay within ±1 line.
- **FR-008**: Existing 528 unit tests + 8 E2E tests MUST continue to pass with zero regressions.
- **FR-009**: New unit tests MUST pin: (a) `_simulateStrategyLifetime`'s grossSpend formula equals `computeWithdrawalStrategy`'s at every retirement age across the canonical fixture suite; (b) `signedLifecycleEndBalance`'s end-balance equals `projectFullLifecycle`'s end-balance within ±$1 for every strategy × mode combination; (c) the new audit invariant fires correctly on artificially induced discrepancies and stays silent under parity.
- **FR-010**: New E2E test MUST verify the Withdrawal Strategy chart bar at college years displays the overlay-inclusive total, both in EN and 中文 locales, both HTMLs.
- **FR-011**: The fix MUST NOT alter the formula for any input: `retireSpend`, `hcDelta`, or `collegeCostThisYear` retain their current semantics. The change is exclusively to ensure all simulators consume the same composed value.

### Key Entities *(include if feature involves data)*

- **GrossSpend (per retirement-year)**: The composed annual outflow target the withdrawal pipeline must fund. Composed of `retireSpend` (mortgage-adjusted base) + `hcDelta` (per-age, per-scenario healthcare premium delta) + `collegeCostThisYear` (per-age kid college tuition + loan repayments) + `h2Carry` (Home 2 annual carry where applicable). Consumed by every simulator in the pipeline; the source of truth for downstream `taxOptimizedWithdrawal` and per-strategy mix calls.
- **Simulator**: A function that, given pool balances + inputs + age, returns a per-year withdrawal mix and updated pool balances. The three canonical simulators are `computeWithdrawalStrategy` (default-strategy chart driver), `_simulateStrategyLifetime` (per-strategy ranker + non-default chart driver), and `projectFullLifecycle` (lifecycle chart + verdict gate). All three MUST consume the same GrossSpend at every age.
- **CrossValidationWarning**: Audit-emitted structured record `{ kind, age, simulators, diff, ... }` that surfaces in the Audit panel and JSON dump when invariant checks fail. The new `simulator-grossSpend-parity` kind joins existing kinds (`endBalance-mismatch`, etc.) per the calcAudit contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-029-A**: On the canonical RR repro fixture (Roger 42, kid2 age 3, college kid2 = us-public-oos, `aggressive-bracket-fill` winner, Exact mode), the Withdrawal Strategy chart bar at age 57 shows ~$184K nominal total (purchasing-power ~$102K), matching `lifecycleProjection.rows[57].withdrawals × inflationFactor`. Pre-fix value is $132K nominal.
- **SC-029-B**: On the same fixture, `crossValidationWarnings` array contains zero `endBalance-mismatch` entries after the fix lands.
- **SC-029-C**: Across all 8 strategies × all 3 modes × the canonical fixture suite (RR + Generic, 4+ scenarios), every strategy's audit `endBalance` matches the lifecycle chart's age-100 total when that strategy is selected. Tolerance ±$1.
- **SC-029-D**: The new `simulator-grossSpend-parity` cross-validation invariant fires correctly on artificially induced discrepancies (verified by test) and emits zero warnings on the canonical fixture suite.
- **SC-029-E**: Zero regressions on the existing 528 unit tests + 8 E2E tests. The lockstep diff between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` after the fix lands stays within ±1 line, all of which are personal-content (Roger / Rebecca name references).
- **SC-029-F**: User can hover the Withdrawal Strategy chart at any retirement age and read a bar total that matches what their portfolio actually pays out — bar height equals chart drawdown — to within rounding error visible at the 1K dollar resolution of the chart axes.

## Assumptions

- The fix is in scope of the existing three simulators. We are NOT introducing a fourth simulator or restructuring the lifecycle pipeline.
- `getTotalCollegeCostForYear(inp, yearsFromNow)` and `getHealthcareDeltaAnnual(selectedScenario, age)` return values in real (today's) dollars that are valid for use as additive overlays to `retireSpend` (already real-dollar). The cost composition is the same whether computed inside `computeWithdrawalStrategy` (existing code) or `_simulateStrategyLifetime` (this fix).
- The lifecycle chart's `projectFullLifecycle` correctly includes overlays today (per `FIRE-Dashboard.html:10670` evidence and the matching audit `lifecycleProjection.rows` values). We are aligning the OTHER two simulators to match `projectFullLifecycle`, not the other way around.
- `_simulateStrategyLifetime` lives inside the strategy-ranker block (line 11698) and is called once per strategy during ranking. The performance cost of adding two function calls per retirement year (~58 calls × 8 strategies = ~464 extra calls per recalc) is negligible relative to existing strategy-ranker cost.
- Geographic scenarios (`selectedScenario` parameter) and kid input shape are already available in `_simulateStrategyLifetime`'s closure scope through `inp`. No additional input plumbing is required.
- The `signedLifecycleEndBalance` fix is feasible by either (a) threading overlay computation into the signed-sim's inner loop directly, or (b) replacing the signed-sim's spend input with `projectFullLifecycle`'s already-correct value via a thin adapter. The /speckit-plan phase will decide between these.
- The new `simulator-grossSpend-parity` invariant runs once per recalc as part of the audit pipeline. Cost is O(retirement-years × num-simulators-checked) ≈ 58 × 3 = 174 numeric comparisons. Negligible.
- Feature 028's stop-gap pill guard (`_shouldOverrideStatusToInfeasible`) remains in place as defense-in-depth even after this fix. Removing it is out of scope.
- No translation strings change. The fix is internal calc plumbing; user-visible numbers shift on the existing bars but no new strings are needed.

## Dependencies

- Feature 028 (strategy-aware-fire-age) merged at `7cc84ce` — provides the strategy-axis parity foundation this feature builds on.
- Feature 014 (calc-audit) — provides the cross-validation warning framework this feature extends with a new invariant kind.
- Feature 018 (lifecycle-payoff-merge) — provides the lockstep `getActiveMortgageStrategyOptions` helper pattern that this feature mirrors for its own threading.
- Feature 022 (nominal-dollar-display) — provides the `_extendRowsWithBookValues` infrastructure that converts the per-year `wStocks` (real-$) into the `wStocksBookValue` (nominal-$) actually shown on the chart bar. No changes here; we just want the upstream value correct.

## Out of Scope

- Changing the *formula* for `retireSpend`, `hcDelta`, `collegeCostThisYear`, or `h2Carry`. The user-supplied inputs and their composition rules stay exactly as today.
- Spending-Floor (Step 7.5) tax behavior within `taxOptimizedWithdrawal`. That gate is its own concern with its own contract.
- Mortgage strategy threading. Already correct per feature 018; no changes here.
- Removing or simplifying the feature-028 `_shouldOverrideStatusToInfeasible` stop-gap. Stays in place as a safety net.
- Adding new strategies, new modes, new objectives, or new audit invariants beyond `simulator-grossSpend-parity`.
- Refactoring the dual-simulator architecture into a single shared simulator. That is a desirable longer-term refactor, but its scope is dramatically larger and would block this user-reported bug fix.
