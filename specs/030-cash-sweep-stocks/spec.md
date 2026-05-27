# Feature Specification: Cash-Sweep to Stocks

**Feature Branch**: `030-cash-sweep-stocks`
**Created**: 2026-05-11
**Status**: Draft
**Input**: User observation 2026-05-11 (RR canonical fixture audit screenshot): cash balance grows monotonically across all retirement years, reaching ~$354K real at age 100. Most retirees with a buffer policy would sweep excess cash into the market each year. Dashboard should optionally model this behavior.

**Predecessor**: Feature 029 (withdrawal-spend-parity) merged to `main` 2026-05-11 via merge commit `ea431f7`. This feature reuses the simulator-parity discipline established by 029 — every simulator must apply the sweep identically when enabled.

## Clarifications

### Session 2026-05-11

- Q: Initial-cash behavior when toggle turns ON → A: Sweep only new growth — starting cash ($80K) at year 0 is preserved as-is.
- Q: How is "new growth" defined across the simulation → A: Threshold rule starts year 1. Year 0 cash is preserved; from year 1 onward, sweep fires whenever year-end cash > threshold. Spending + sweep together drain the starting cash to threshold across the first one or two retirement years; thereafter cash stays at the threshold floor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Enable cash-sweep and watch end-of-life cash converge to floor (Priority: P1)

The user opens the dashboard, navigates to the Plan tab → Investment section, sees a new toggle "Sweep excess cash into stocks each year" (default OFF). They turn the toggle ON. A second input "Cash floor to keep" appears, pre-filled with `$10,000`. The user leaves both at defaults. Every chart and KPI in the dashboard immediately re-renders: cash on the Lifecycle chart stops growing across decades and instead asymptotes near the $10K floor; stocks compound faster as the swept dollars start earning the stock return rate.

**Why this priority**: This is the user-requested feature in its essential form. The visible behavior change in the Lifecycle chart is the primary value: cash no longer looks like a slow-growing pile across decades, and the more realistic "spare cash gets invested" model is reflected throughout.

**Independent Test**: Enable the toggle on the canonical RR fixture. Hover the Lifecycle chart at age 100. Cash value should read approximately `$10K real` (purchasing power) — was approximately `$354K real` with the toggle OFF. Stocks at the same age should be visibly higher. Pre-condition: same input fixture; only the toggle is changed.

**Acceptance Scenarios**:

1. **Given** the default RR fixture and toggle OFF, **When** the user reads the Lifecycle chart at age 100, **Then** cash ≈ $354K real (current behavior, unchanged).
2. **Given** the default RR fixture and toggle ON with $10K threshold, **When** the user reads the Lifecycle chart at year 0 (Roger age 42), **Then** cash = `inp.cashSavings` = $80K real (starting cash preserved untouched per clarification).
3. **Given** the same setup, **When** the user reads the Lifecycle chart at age 100, **Then** cash ≈ $10K real and stocks ≈ pre-sweep stocks + accumulated swept dollars compounded at the stock real return.
4. **Given** the same setup, **When** the user reads the Lifecycle chart at year 1 (Roger 43), **Then** cash has stepped down from $80K toward the threshold (typical pattern: cash declines visibly across the first one or two retirement years as natural spending plus sweep drain it; from then on, cash hovers at threshold).
5. **Given** the toggle ON, **When** the user adjusts the threshold from $10K to $50K, **Then** every chart re-renders within one recalc cycle and the new equilibrium cash value reflects the new floor.
6. **Given** the toggle ON at any threshold, **When** the user reads any year-1-or-later cash value, **Then** cash is ≤ threshold + the within-year cash-flow noise band (cash never grows monotonically above the threshold across decades after the first transition year).
7. **Given** the toggle OFF, **When** the user changes the threshold input value, **Then** no chart re-renders (the threshold is inactive when toggle is off).

---

### User Story 2 — Toggle OFF is byte-identical to pre-feature behavior (Priority: P1)

A returning user with prior snapshots saved in `FIRE-snapshots.csv` opens the dashboard. The new toggle defaults to OFF. They do nothing; everything looks and computes exactly as before. Their pre-feature snapshots remain reproducible.

**Why this priority**: Trust-preserving. Defaulting ON would silently invalidate every user's saved snapshot history and shift their FIRE age + end-balance numbers without warning. This story locks in the OFF default and the byte-identical pre-feature behavior path.

**Independent Test**: Take a snapshot before this feature lands (or freeze main as the baseline). After the feature lands with toggle OFF, recompute every KPI + chart series on the same canonical fixtures and confirm zero diff vs the baseline.

**Acceptance Scenarios**:

1. **Given** the canonical RR fixture and a baseline snapshot of FIRE age, end-balance, lifetime tax, and bar-chart series taken before the feature lands, **When** the feature lands and the toggle defaults to OFF, **Then** every recomputed value matches the baseline within rounding tolerance.
2. **Given** the toggle defaults to OFF, **When** any chart renders or any KPI computes, **Then** there is zero call to the sweep code path (verifiable via debug instrumentation or by toggling and observing that the OFF state produces results identical to the pre-feature commit).
3. **Given** an existing `FIRE-snapshots.csv` row recorded pre-feature, **When** the user re-runs the dashboard with the same input fixture and the toggle OFF, **Then** the recomputed snapshot row is byte-identical to the stored row (modulo ISO timestamp).

---

### User Story 3 — Threshold value reflects today's purchasing power across all simulated years (Priority: P2)

The user sets the threshold to `$10,000`. They understand this means "$10K of today's spending power, every year, regardless of when in retirement." The simulator interprets this as a real-$ floor — it does NOT inflate the threshold over time. At Roger 100 (58 years post-currentAge), with the toggle ON, the cash balance still hovers near $10K real (≈ $30K+ nominal at 4% inflation × 58 years), preserving the real purchasing-power constancy.

**Why this priority**: Avoids confusion. Every other Plan-tab dollar input (annual spend, contribution amounts, savings, retirement spend) is interpreted in real-$ today's dollars. Threshold MUST follow the same convention so users can reason about a single mental model. Marked P2 because P1 stories already mandate the correct behavior; this story explicitly tests the real-$ interpretation against the alternative (nominal-$ floor that erodes by inflation).

**Independent Test**: Enable toggle with $10K threshold. Verify the simulator's per-year cash floor in real-$ is exactly $10K at every retirement age. In nominal-$ (Book Value) display, the floor visually grows with the inflation curve, matching what `retireSpend` and other real-$ Plan inputs already do.

**Acceptance Scenarios**:

1. **Given** the toggle ON with $10K threshold and inflation = 4%, **When** the simulator runs through retirement years 54 → 100, **Then** the cash balance at every year (per the audit's per-year row data) is ≤ $10,000 + within-year flow noise in real-$ terms.
2. **Given** the same setup, **When** the chart displays cash in Book Value (nominal-$) view, **Then** the floor visually scales with `1.04^(age - currentAge)` — at age 100, the nominal floor appears as ~$30K, NOT $10K.
3. **Given** the user expects parity with other dollar inputs, **When** they compare the threshold's frame with `retireSpend` and contribution amounts, **Then** all three behave the same way (real-$ input, nominal-$ when displayed in Book Value mode).

---

### User Story 4 — All six simulators apply the sweep identically (Priority: P2)

The dashboard has 6 simulators that maintain `pCash` + `pStocks` across simulated years. When the sweep is ON, every one must apply the same year-end sweep, or the chart's displayed trajectory will disagree with the verdict-pill's feasibility check or the strategy ranker's per-strategy `endBalance`. The new feature-029 `simulator-grossSpend-parity` invariant family is extended (or a parallel `simulator-cash-sweep-parity` invariant added) to catch any future simulator that gets the sweep wrong.

**Why this priority**: Defense in depth. The lesson of features 014, 018, 020, 028, and 029 is that simulator parity is THE recurring failure mode of this codebase. Any new pool-flow behavior MUST be threaded through every simulator and have an audit-layer pin. Otherwise: chart shows one trajectory, verdict pill judges a different one, user loses trust. Marked P2 because the user-visible outcome is covered by P1; this is the regression-prevention armor.

**Independent Test**: With the toggle ON, run the audit-snapshot assembler. Verify that the new `simulator-cash-sweep-parity` invariant (or extended `simulator-grossSpend-parity` invariant covering cash flows) returns zero warnings on the canonical fixture set. Artificially break the sweep in one simulator (test scaffold). Verify the invariant fires with a structured warning.

**Acceptance Scenarios**:

1. **Given** the toggle ON and the canonical fixture, **When** the audit pipeline runs, **Then** zero parity warnings concerning the cash-sweep behavior are emitted.
2. **Given** an artificially induced sweep mismatch (e.g., one simulator's sweep disabled while the others run), **When** the audit pipeline runs, **Then** a `simulator-cash-sweep-parity` warning fires identifying the divergent simulator and the offending year.
3. **Given** every strategy in the 8-strategy registry, **When** the per-strategy ranker runs with the toggle ON, **Then** every strategy's `endBalance` matches the chart's displayed end balance for that strategy (the same parity guarantee feature 029 established for `grossSpend` extended to the cash-pool flow).

---

### User Story 5 — Bilingual UI controls (Priority: P3)

The toggle and threshold input render correctly in English and Traditional Chinese. The toggle label, threshold field label, and inline help text all translate. Switching language via the EN/中文 toggle re-renders the UI labels without losing the toggle state or threshold value.

**Why this priority**: Constitution Principle VII (Bilingual First-Class) is non-negotiable. Every new user-visible string must ship with paired EN + zh-TW translations. P3 because the underlying calc behavior is unaffected by language; this is pure UI scaffolding.

**Independent Test**: Open the dashboard in EN, locate the new toggle and threshold input, read their labels. Switch to 中文; re-read the same labels and confirm they translate correctly. Toggle the switch; switch language; confirm the toggle state persists.

**Acceptance Scenarios**:

1. **Given** the dashboard in EN, **When** the user finds the new toggle, **Then** its label reads "Sweep excess cash into stocks each year".
2. **Given** the dashboard in 中文, **When** the user finds the same toggle, **Then** its label reads the Traditional Chinese equivalent (per the translation catalog).
3. **Given** the user switches language while the toggle is ON, **When** the page re-renders, **Then** the toggle remains ON and the threshold value persists.
4. **Given** the inline help text describes the sweep behavior, **When** the user reads it in either language, **Then** the explanation is clear, mentions year-end timing, and references stock-return compounding.

---

### Edge Cases

- **Threshold = $0**: From year 1 onward, all cash sweeps to stocks every year. Cash bucket drops to literally $0 after year 1. (Year 0 cash still preserved per clarification.) Verify no division-by-zero or NaN in downstream calc (e.g., percentage allocations).
- **Threshold > current cash**: No sweep occurs that year. Cash stays where it is. Verify no negative-stock-injection from a mis-signed delta.
- **Threshold extremely high (e.g., $10M)**: Sweep effectively disabled even with toggle ON. Verify behavior matches toggle-OFF behavior numerically.
- **Cash balance drops below threshold mid-year due to withdrawals**: Per the one-way contract, no rebalance happens (no stock → cash flow). Cash stays below threshold; sweep doesn't fire until it climbs back above.
- **Accumulation phase with substantial monthly savings flowing into cash**: Pre-FIRE years can grow cash quickly. With sweep ON, accumulation cash also gets swept. Verify accumulation-phase FIRE-age calculation still converges (not delayed by money flowing into stocks via sweep that would otherwise build cash reserves).
- **Threshold scaled to nominal**: Out of scope per the user's design. Real-$ only. Validate that threshold input is interpreted as real-$ end-to-end.
- **Partial-FIRE-year row (mFraction > 0, feature 022)**: First retirement-year cash sweep scales linearly with `(1 - mFraction)` to preserve the partial-year semantics. Verify no double-sweep or missed-sweep at the integer-age boundary.
- **One-shot events (home sale, lump-sum payoff)**: Cash injected by one-shot events triggers a same-year sweep if the post-event cash exceeds the threshold. Verify the audit dump's `lumpSumEvent` + `homeSaleEvent` fields don't lose information when the sweep fires in their year.
- **Snapshot CSV reproducibility**: Existing CSV rows recorded pre-feature must remain reproducible when the toggle defaults to OFF. Verify no schema change to `FIRE-snapshots.csv`; persistence of the new toggle + threshold values lives in `localStorage` only (not in the snapshot row itself).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Boolean toggle input named "Sweep excess cash into stocks each year" (or equivalent translated label) in the Plan tab's Investment section. Default state: OFF.
- **FR-002**: System MUST provide a numeric input named "Cash floor to keep" (or equivalent translated label) with default value `$10,000`, accepting any non-negative integer dollar amount. Negative inputs MUST be rejected with a user-visible validation message.
- **FR-003**: The threshold input value MUST be interpreted as real-$ (today's purchasing power), consistent with how every other Plan-tab dollar input is interpreted.
- **FR-004**: When the toggle is ON, at the end of every simulated year STARTING WITH YEAR 1 (one full year after currentAge; i.e., the sweep is SKIPPED in year 0 / currentAge) — after income, contributions, growth, withdrawals, and one-shot events — every simulator that tracks `pCash` and `pStocks` MUST execute: `if (pCash > threshold) { pStocks += pCash - threshold; pCash = threshold; }`. Threshold is in real-$ matching the simulator's frame. **Year 0 starting cash (`inp.cashSavings`) is preserved untouched, even if it exceeds threshold.** This means the user's reported starting cash remains visible at year 0 on every chart; from year 1 onward, the combination of natural spending plus the sweep brings cash down to threshold (typically within the first one or two retirement years), and cash stays at threshold from that point forward.
- **FR-005**: All 6 simulators MUST apply the sweep identically when toggle is ON: `accumulateToFire`, `projectFullLifecycle`, `_simulateStrategyLifetime`, `signedLifecycleEndBalance`, `simulateRetirementOnlySigned`, `computeWithdrawalStrategy`.
- **FR-006**: When the toggle is OFF, every simulator's cash trajectory MUST be byte-identical to pre-feature behavior. The sweep code path MUST NOT execute under this state.
- **FR-007**: System MUST persist the toggle state + threshold value in `localStorage` (consistent with other Plan-tab settings). On page reload, the user's prior selection MUST restore.
- **FR-008**: System MUST extend the audit cross-validation suite with a new `simulator-cash-sweep-parity` invariant (or extend feature 029's `simulator-grossSpend-parity` invariant to also cover cash flows). When the toggle is ON and any simulator's per-age `pCash` post-sweep diverges from the canonical reference by more than $1 real, the invariant MUST emit a structured warning.
- **FR-009**: System MUST ship both the EN and zh-TW translations of the toggle label, threshold field label, and inline help text in the same change set, per Constitution Principle VII.
- **FR-010**: System MUST NOT modify `FIRE-snapshots.csv` schema. The new toggle + threshold are runtime configuration, not snapshot row content.
- **FR-011**: System MUST handle one-shot cash events (home sale, lump-sum mortgage payoff, second-home sale) by allowing the sweep to fire in the same year as the event when post-event cash exceeds the threshold. The sweep MUST fire AFTER all one-shot deposits/withdrawals are applied for that year.
- **FR-012**: System MUST apply the partial-FIRE-year scaling (feature 022 `mFraction`) to the sweep when fireAge is non-integer. Specifically: the swept amount in the partial-FIRE-year is computed against the year-end pCash AFTER all other scale-multiplied flows have been applied.
- **FR-013**: System MUST preserve the existing cash-growth-rate compounding (~0.5% real) for the residual cash balance that stays below or at the threshold after sweep.

### Key Entities *(include if feature involves data)*

- **CashSweepConfig**: Runtime configuration consumed by every simulator. Fields:
  - `enabled: boolean` — toggle state. Default `false`.
  - `threshold: number` — cash floor in real-$. Default `10000`. Validation: `>= 0`.
  - Persistence: `localStorage` keys `pviCashSweepEnabled` (or similar consistent with existing keys) and `pviCashSweepThreshold`.
- **CashSweepEvent (audit / introspection)**: Per-year record of what the sweep did, surfaced in the audit's `lifecycleProjection.rows[].cashSweepDelta` field. When sweep is OFF or no excess existed, `cashSweepDelta = 0`. When sweep fired, value = swept dollars (positive number).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-030-A**: With toggle ON, default $10K threshold, canonical RR fixture, year-0 (Roger age 42) cash on the Lifecycle chart = `inp.cashSavings` = $80K real (starting cash preserved per clarification); end-of-life (`age 100`) cash ≈ $10K real (purchasing power). Pre-feature end-of-life value: ~$354K real. Tolerance: ±$2K real on the end-of-life value.
- **SC-030-B**: With toggle ON and the same fixture, end-of-life stocks ≈ pre-feature stocks + cumulative-swept-dollars × compounded growth. Numerical check via the audit dump's per-year `cashSweepDelta` and stock balance trajectory.
- **SC-030-C**: With toggle OFF, every KPI and every chart series matches pre-feature output exactly (modulo timestamp). Verified by snapshot comparison against the pre-feature commit on the canonical RR + Generic fixtures.
- **SC-030-D**: New parity invariant emits zero warnings under correct operation, and fires correctly on artificially induced sweep mismatches (one-simulator misbehavior).
- **SC-030-E**: Threshold accepts adjustments from $0 (full sweep) to high values (e.g., $10M = effectively disabled). UI validation rejects negative inputs.
- **SC-030-F**: Toggle and threshold labels translate correctly between EN and 中文. State persists across language toggle.
- **SC-030-G**: Lockstep diff between `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` after fix stays within ±1 line for personal content per Constitution Principle I.
- **SC-030-H**: All existing 548 unit tests pass with zero regressions. New unit tests pin the sweep behavior across all 6 simulators × toggle states × edge cases.

## Assumptions

- The sweep happens at the END of the year, after all income, contributions, growth multiplication, spending withdrawals, and one-shot events have been applied for that year. This is the most predictable timing and matches how a real-life sweep policy would be implemented (review balance at year-end; transfer excess).
- The threshold is interpreted as real-$ (today's purchasing power) end-to-end. This matches the project's existing convention for `retireSpend`, contribution amounts, and all Plan-tab numeric inputs.
- The sweep is one-way (cash → stocks only). There is no opposite "if cash drops below floor, sell some stocks to top up" behavior in this feature. Refilling cash from stocks already happens naturally via the existing withdrawal-strategy logic when retirement withdrawals draw from stocks.
- The sweep applies to BOTH accumulation phase and retirement phase, not just retirement. Accumulation-phase cash often grows from monthly savings flowing into the cash bucket; sweeping that excess into stocks during accumulation accelerates compounding and reflects real investor behavior.
- Stocks compound at the user-set stock return rate (the existing `inp.returnRate` field) once swept. This is automatic — once in the stocks bucket, dollars compound at the stock rate. No new compounding mechanism needed.
- The sweep does not generate a taxable event (it's an internal model transfer; in reality a cash-to-brokerage transfer is not a sale, so no tax consequence). LTCG and ordinary-income tax behavior in `taxOptimizedWithdrawal` is unaffected.
- The toggle default is OFF to preserve every existing user's snapshot reproducibility. Users opt in deliberately.
- `localStorage` is the correct persistence layer; the toggle + threshold are user-preference inputs, not snapshot-row content. `FIRE-snapshots.csv` schema is untouched.
- The new parity invariant follows the same pattern as feature 029's `_invariantE` (`simulator-grossSpend-parity`): opt-in trace array, function returns warnings array, wired into `assembleAuditSnapshot`. May be a new `_invariantF` or an extension of `_invariantE` to track multiple per-year flows.
- The sweep does NOT cap at $0 in the partial-FIRE-year scaling case: the year-end pCash AFTER all scale-multiplied flows is the subject of the comparison, not a separately-scaled threshold value. The threshold is constant real-$ regardless of partial-year.

## Dependencies

- Feature 029 (withdrawal-spend-parity) — provides the simulator-parity discipline and the `_invariantE` audit invariant pattern this feature mirrors.
- Feature 022 (nominal-dollar-display) — provides the real-$ ↔ Book Value frame conversion the threshold's display relies on (cash is shown in Book Value in the chart; threshold is input in real-$).
- Feature 014 (calc-audit) — provides the `crossValidationWarnings` framework for the new parity invariant.
- Existing `localStorage` schema for Plan-tab settings — provides the persistence pattern for the new toggle + threshold values.

## Out of Scope

- **Sweep into 401k or Roth**: This feature touches only the taxable stocks pool. Sweeping into tax-deferred or tax-free accounts requires contribution-limit handling and is a separate feature.
- **Per-year threshold variation**: A single threshold across all simulated years. No "threshold = $10K pre-65, $20K post-65" or similar age-banded values.
- **Stock → Cash refill direction**: One-way sweep only. If user wants automatic cash top-up from stocks when cash dips below the floor, that's a separate feature (and somewhat redundant since the withdrawal-strategy logic already pulls from stocks when needed).
- **Nominal-$ threshold**: Threshold is real-$ only. No "inflate the threshold by inflation rate each year" mode.
- **Visual sweep indicator on the chart**: The Lifecycle chart shows the result (cash flatlines at floor); no per-year sweep-arrow annotation is required. Stretch goal for a future polish iteration.
- **Migration of existing snapshots**: `FIRE-snapshots.csv` is unchanged. Users with pre-feature snapshots don't need to migrate; toggle OFF makes the dashboard byte-identical to pre-feature behavior.
- **A/B sweep mode (e.g., monthly vs annual sweep)**: Annual year-end only. Monthly sweep adds intra-year flow complexity and isn't requested.
- **Tax-loss harvesting interaction**: Not modeled. The sweep is a simple model transfer.
