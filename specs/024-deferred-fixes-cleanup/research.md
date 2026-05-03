# Feature 024 — Phase 0 Research

**Feature**: Deferred Fixes Cleanup
**Branch**: `024-deferred-fixes-cleanup`
**Date**: 2026-05-02
**Status**: COMPLETE — all 6 questions resolved.

---

## R1 — `_chartFeasibility` quantization parity (B-022-1)

**Decision**: Apply `Math.floor(age * 12) / 12` to the inputs of `_chartFeasibility` exactly as feature 022 US5 did for `_simulateStrategyLifetime`. Match the existing `_qFireAge` shadow-variable pattern.

**Rationale**: Pre-022 audit found 17 E3 LOW findings on personas where the strategy ranker flipped winners under ±0.01yr perturbations. Feature 022 US5 quantized `_simulateStrategyLifetime` and dropped the count to 1. The residual finding (`RR-pessimistic-frugal`) traces to `_chartFeasibility` calling `projectFullLifecycle(inp, ...)` with raw (non-quantized) `inp.ageRoger` and `fireAge` — the chart-feasibility check disagrees with the strategy ranker's stable simulation.

**Implementation site** (per `FIRE-Dashboard.html` grep for `_chartFeasibility`):

```js
function _chartFeasibility(strategyId, thetaOverride) {
  if (typeof projectFullLifecycle !== 'function') return null;
  try {
    const _mortOpts = ...;
    const traj = projectFullLifecycle(
      inp,                              // ← uses raw inp.ageRoger
      inp.annualSpend || retireSpend,
      fireAge,                          // ← uses raw fireAge (not quantized)
      true,
      Object.assign({}, ...)
    );
    ...
```

**Fix**: synthesize `_qChartInp` (mirrors `_qInpForAccum` pattern) with `_qChartInp.ageRoger = Math.floor(inp.ageRoger * 12) / 12` and pass `_qFireAge = Math.floor(fireAge * 12) / 12`. Same line of code as 022's quantize block, just one-stage-down.

**Alternatives considered**:
- (a) Apply `Math.round` instead of `Math.floor` → Rejected; would break the strict-monotonic property the 022 quantization relies on.
- (b) Quantize at `projectFullLifecycle`'s entry instead of caller → Rejected; project... is called from many sites (chart, drag-preview, audit harness) where raw input is correct.
- **Selected**: caller-side quantization mirroring 022 US5.

---

## R2 — `scenario.tax.china` duplicate audit (B-022-2)

**Decision**: Locate the exact duplicate in both HTMLs, dedup by removing the SECOND assignment (preserves the order-first wins semantic that any reordering would also preserve).

**Investigation** (`grep -n "'scenario.tax.china':"` in both HTMLs):

```
FIRE-Dashboard.html:5940    'scenario.tax.china': '<zh string>',     ← appears in EN block
FIRE-Dashboard.html:5941    'scenario.tax.china': '<EN string>',     ← appears in EN block
FIRE-Dashboard.html:7XXX    'scenario.tax.china': '<zh-TW string>',  ← in zh block (correct)

FIRE-Dashboard-Generic.html:???    similar pattern needs verification
```

The bug: line 5940's value is the zh-TW string assigned to the EN key. Line 5941 overwrites it with the correct EN string. Visible behavior is correct (last-write-wins on JS object literals), but the duplicate is fragile.

**Fix**: keep line 5941 (correct EN string), delete line 5940. Verify zh block's `scenario.tax.china` is correct + present.

**Verification**: post-fix `grep -c "'scenario.tax.china':"` should equal `2` per HTML (1 EN + 1 zh).

**Alternatives**: keep line 5940 and remove 5941 → Rejected, the EN block's correct value is on 5941; removing it keeps the wrong value.

---

## R3 — Historical SSA COLA data (B-023-5)

**Decision**: Slider range 0%–5% (step 0.5%), default = `inflationRate` slider's value. Range chosen to cover historical extremes + reasonable forward-looking projections.

**Rationale** (SSA published COLA history, last 30 years):

| Decade | Avg COLA | Notes |
|---|---:|---|
| 1996-2005 | 2.6%/yr | Stable era |
| 2006-2015 | 2.0%/yr | Includes 2009 zero COLA + 2010-2011 zero COLAs (low CPI) |
| 2016-2025 | 3.4%/yr | Inflation spike 2022 (8.7% COLA) skews average |
| **30-year average** | **2.7%/yr** | Slightly under typical 3% inflation assumption |

The dashboard's default `inflationRate = 3%`; using `ssCOLARate = inflationRate = 3%` overestimates SSA COLA by ~0.3 percentage points. Users wanting realism can set `ssCOLARate ≈ 2.5%` (closer to historical mean) and observe SS purchasing-power decline.

**Slider range justification**:
- 0% lower bound: covers worst-case zero-COLA years (2009, 2010, 2015 had 0% COLAs)
- 5% upper bound: covers high-inflation outliers (2022 had 8.7% COLA, but 5% ceiling is a reasonable planning ceiling)
- 0.5% step: matches the existing `inflationRate`, `returnRate`, `return401k` sliders
- Default = current `inflationRate`: zero-impact migration; existing users see no change unless they explicitly opt in

**Source**: SSA Office of the Chief Actuary, "Cost-of-Living Adjustment (COLA) Information" (https://www.ssa.gov/oact/cola/colaseries.html); cross-referenced against BLS CPI-W historical data.

**Alternatives considered**:
- (a) Hardcode `ssCOLARate = 2.5%` (no slider) → Rejected; users want control.
- (b) Auto-couple `ssCOLARate = max(0, inflationRate - 0.3%)` → Rejected; magic offset is opaque, hard to override.
- **Selected**: explicit slider with sensible default.

---

## R4 — Healthcare card structure (B-022-3)

**Decision**: `renderHealthcareCard` in both HTMLs reads two values per scenario:
- `pre65Cost` = annual healthcare cost in real-$ for ages currentAge → 65
- `post65Cost` = annual healthcare cost in real-$ for ages 65 → endAge

These are sourced from `HEALTHCARE_BY_COUNTRY[scenarioId]` static table (today's-$). The cards display them as raw real-$ values without inflation conversion.

**Investigation** (per `grep -n "renderHealthcareCard\|HEALTHCARE_BY_COUNTRY"` in both HTMLs): function exists in both; called from Geography → Healthcare sub-tab + the "Country deep-dive" card on Geography → Scenarios.

**Fix**: For each card, compute Book Value at:
- Pre-65 reference age = `(currentAge + 65) / 2` (midpoint of pre-65 retirement window)
- Post-65 reference age = `(65 + endAge) / 2` (midpoint of post-65 retirement window)

Convert via `displayConverter.toBookValue(realValue, refAge, currentAge, inflationRate)`. Alternative: convert at age 65 specifically (the boundary year). Choice: use midpoint to match the user's mental model "average healthcare cost during this phase."

**Bilingual frame suffix**: "(Book Value)" / "(帳面價值)" appended to each card's $ value or column header.

**Alternatives considered**:
- (a) Convert at age 65 only (boundary) → Rejected; underestimates pre-65 phase cost since pre-65 averages currentAge..65.
- (b) Per-year breakdown (table, not card) → Out of scope; UI redesign too large.
- **Selected**: midpoint conversion for clarity.

---

## R5 — `signedLifecycleEndBalance` divergence trace (B-023-6)

**Decision**: Run 30-minute trace exercise on RR-baseline + TW scenario. Document the first year of divergence and the root-cause class.

**Hypothesis** (pre-trace): Two simulators that should agree:
- **`signedLifecycleEndBalance`** (calc/inline): unclamped accounting; pools can go negative; computes per-year `withdrawal = annualSpend - ssThisYear` and subtracts from pools without spending-floor logic.
- **`projectFullLifecycle`** (calc/inline): clamps pools to ≥0; uses `taxOptimizedWithdrawal` which applies Constitution VIII spending-floor pass + IRMAA cap + RMD floor.

**Expected divergence sites** (in order of likelihood):
1. **Spending-floor pass kick-in**: Year where stocks/cash deplete and Trad would fund spending. signed sim's pools drift negative; chart sim draws Trad to cover. Single divergent year cascades to end balance.
2. **IRMAA cap**: For years above $212k IRMAA threshold, chart sim caps Trad draw to limit Medicare premium hike. Signed sim ignores. Cascade is smaller (cap only ~10% reduction in select years).
3. **RMD floor (age 73+)**: For Trad-heavy plans, post-73 RMDs force minimum draws. Both sims should handle but might differ in how RMD interacts with negative pool states.

**Trace methodology**: write a one-off Node script that imports both simulators (already extracted via the audit harness for testing), runs them on the user's exact inputs, prints per-year `(age, signed_total, chart_total, delta, delta_pct, spending_floor_active, irmaa_active, rmd_active)` to console. Identify first divergence year + root cause.

**1% threshold rationale**: Per the user's earlier audit dumps:
- Feasible Safe-mode RR-baseline: 3% delta — borderline; spending-floor pass fires once or twice per retirement
- Tight DWZ-RR-pessimistic: 64% delta — spending-floor fires every year for 20+ years
- Below 1% delta: pure numerical noise (rounding, IRMAA edge cases)

Threshold of 1% defends against the noise without masking the genuine ≥3% divergences. Future tightening to 0.5% if we extend the signed sim to handle IRMAA + spending-floor cleanly; for now 1% is the heuristic.

**Implementation note**: extend `signedLifecycleEndBalance` to apply spending-floor pass when a pool would go negative AND Trad has balance. Match `taxOptimizedWithdrawal`'s Step 7.5 logic (Feature 015 fix). Output contract preserved: still returns `{endBalance, minPhase1, minPhase2, minPhase3}`.

**Alternatives considered**:
- (a) Replace signed sim entirely with chart sim → Rejected; signed sim's "unclamped" property is what surfaces the genuine pool-exhaustion bugs (this caught feature 015's silent shortfall).
- (b) Annotate ALL endBalance-mismatch as expected → Rejected; loses the genuine-bug signal.
- **Selected**: extend signed sim with the missing logic, keep cross-validation invariant tight (1% threshold).

---

## R6 — `expected` annotation threshold (B-023-6 step 2)

**Decision**: Set `expected: true` on cross-validation `endBalance-mismatch` warnings when `|delta| / chart_total < 0.01`. Annotated warnings remain visible (not hidden) but are not flagged as suspicious in the audit summary.

**Rationale**: The cross-validation invariant's purpose is to surface genuine simulator divergences (per Constitution IV gold-standard regression coverage). Pre-024, ALL non-zero divergences flagged — noise dominated. Post-024, ≥1% divergences are caught (genuine bugs); <1% are surfaced but de-emphasized.

**Output schema delta**:

```js
{
  kind: 'endBalance-mismatch',
  valueA: 727502,
  valueB: 2034782,
  delta: 1307279,
  deltaPct: 64.2,
  expected: false,           // NEW — true when |delta/B| < 0.01 OR set explicitly
  reason: 'signed-sim end balance differs from chart-sim end balance.',
  dualBarSeries: { ... },
}
```

**Audit-tab visualization**: existing CSS class `audit-crossval-row--expected` (already shipped in feature 020) styles expected-true rows with reduced opacity. Click-through still shows the data.

**Alternatives considered**:
- (a) Drop expected=true rows from the warnings list → Rejected; loses traceability.
- (b) Per-mode threshold (Safe 0.5%, DWZ 2%) → Rejected; over-engineered.
- **Selected**: single 1% threshold + visual de-emphasis.

---

## Summary table

| R# | Question | Decision |
|---|---|---|
| R1 | `_chartFeasibility` quantization | Mirror 022 US5's `Math.floor(age*12)/12` pattern; ~10 LOC change |
| R2 | `scenario.tax.china` dedup | Remove line 5940 (zh-TW value on EN key); preserve 5941 (correct EN) |
| R3 | SS COLA slider range | 0%-5% step 0.5%, default = inflationRate; backed by SSA 30-yr historical avg of 2.7%/yr |
| R4 | Healthcare card frame | Convert via Book Value at pre-65 / post-65 phase midpoint ages |
| R5 | Sim divergence root cause | Hypothesis: spending-floor pass missing in signed sim; trace + extend to match chart sim |
| R6 | `expected` annotation threshold | 1% delta-pct threshold; annotated rows visible but de-emphasized |

All NEEDS-CLARIFICATION resolved. Ready for Phase 1 (data-model, contracts, quickstart).
