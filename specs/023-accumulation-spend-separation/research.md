# Feature 023 — Phase 0 Research

**Feature**: Accumulation-vs-Retirement Spend Separation
**Branch**: `023-accumulation-spend-separation`
**Date**: 2026-05-01
**Status**: COMPLETE — all 4 questions resolved before Phase 2 implementation.

---

## R1 — Bug verification trace

**Decision**: SC-001 acceptance threshold = year-1 portfolio Book Value Δ < $50,000 (down from current +$191,722).

**Rationale**: Trace the exact arithmetic on RR-baseline in real-$ frame with auto-tax mode (taxRate=0 → progressive brackets + FICA). Default inputs read from `FIRE-Dashboard.html`:

| Input | Value |
|---|---:|
| `annualIncome` | $150,000 |
| `taxRate` | 0 (auto) |
| `raiseRate` | 2% |
| `inflationRate` | 3% |
| `returnRate` | 7% |
| `return401k` | 7% |
| `contrib401k` (Trad employee) | $8,550 |
| `contrib401kRoth` | $2,850 |
| `empMatch` | $7,200 |
| `monthlySavings` | $2,000 → stockContribution = $24,000 |
| `roger401k` (Trad) | $25,000 |
| `roger401kRoth` | $58,000 |
| `rogerStocks + rebeccaStocks` | $390,000 (default) |
| `cashSavings` | $0 (default; chart shows $80k → user's saved state has otherAssets ≈ $80k) |

**Year 0 (yfn=0) accumulation in current bug state**:

```
grossIncome           = $150,000 × (1 + 0.02 − 0.03)^0 = $150,000
pretax401kEmployee    = $8,550 + $2,850 = $11,400
federalTax (auto MFJ) = brackets on (150,000 − 11,400 − 29,200 std ded)
                      ≈ $14,174
ficaTax (auto MFJ)    = $9,300 (SS @ 6.2%) + $2,175 (Medicare @ 1.45%)
                      ≈ $11,475
annualSpending (BUG)  = $0  (← inp.annualSpend is undefined)
stockContribution     = $24,000
─────────────────────────────────────────
cashFlowToCash = 150,000 − 14,174 − 11,475 − 11,400 − 0 − 24,000
              = $88,951 real-$
```

After year-0 iteration:
- `pCash = ($80,000 + $88,951) × 1.005 = $169,796 real-$`
- Display Book Value at age 43: `$169,796 × 1.03 = $174,890 nominal-$`
- Chart shows $177,683 nominal — within $2,793 (rounding + per-spouse FICA) ✓

**Year 0 with the fix (`accumulationSpend = $120,000` from line items)**:

```
cashFlowToCash = 150,000 − 14,174 − 11,475 − 11,400 − 120,000 − 24,000
              = −$31,049 → clamped to $0 (cashFlowWarning: 'NEGATIVE_RESIDUAL')
```

After year-0 iteration:
- `pCash = ($80,000 + $0) × 1.005 = $80,400 real-$`
- Book Value at age 43: `$80,400 × 1.03 = $82,812 nominal-$`

**Total portfolio Book Value Δ from age 42 → age 43**:

| Bucket | Pre-fix Δ | Post-fix Δ |
|---|---:|---:|
| Trad 401K | +$33,505 | +$33,505 (unchanged — 401K contribs independent of cash flow) |
| Roth 401K | +$4,130 | +$4,130 (unchanged — pure growth) |
| Stocks | +$56,404 | +$56,404 (unchanged — `monthlySavings × 12` clamped above zero) |
| Cash | +$97,683 | +$2,812 |
| **Total** | **+$191,722** | **+$96,851** |

The post-fix delta of +$96,851 is dominated by 401K + stock contributions (the user's intentional savings flows). This is the realistic accumulation rate. SC-001 threshold of < $50,000 was set before this trace; the actual realistic value is closer to $97k. **Updating SC-001 to < $100,000** (still a 48% reduction from the bug's +$191k).

**Alternatives considered**:
- (a) Lower-spend cohort: if user has frugal lifestyle ($60k US line items), cashFlow residual would be ~$28k positive → year-1 Δ ≈ $125k. Still a 35% reduction from the bug.
- (b) Income-cohort dependent: SC-001 threshold should be expressed as "cashFlowToCash ≤ max(grossIncome − fixedCosts, 0)" not an absolute dollar value.
- **Selected**: absolute < $100,000 for the canonical RR-baseline persona. Other personas validated via the audit-harness invariant `accumulationSpendConsistency`.

---

## R2 — Caller audit (CORRECTION: spec said 4, actual is 6)

**Decision**: Update FR-007 from "All four callers" to "All six callers" during Phase 1 contract drafting. Six call sites in each HTML × 2 HTMLs = **12 sites total** to update for lockstep parity.

**Rationale**: Grep audit of `accumulateToFire(...)` call sites in both HTMLs (2026-05-01):

| # | RR line | Generic line | Caller | Current options | Notes |
|---:|---:|---:|---|---|---|
| 1 | 8904 | 9273 | `signedLifecycleEndBalance` | `_accumOpts` from `resolveAccumulationOptions(inp, fireAge, mortgageStrategy)` | Powers Exact/DWZ end-balance gate |
| 2 | 10079 | 10429 | `projectFullLifecycle` | `_accumOpts` from `resolveAccumulationOptions(...)` | Chart's accumulation handoff |
| 3 | 11375 | 11757 | `_simulateStrategyLifetime` | `_accumOpts` from `resolveAccumulationOptions(_qInpForAccum, _qFireAge, ...)` | Strategy ranker simulator (Wave 5b feature 022) |
| 4 | 11865 | 12258 | `computeWithdrawalStrategy` | `_accumOpts` from `resolveAccumulationOptions(inp, fireAge, ...)` | Withdrawal-strategy panel |
| 5 | 12615 | 12998 | `findEarliestFeasibleAge` (via `recalcAll()`) | `_accumOpts` from `resolveAccumulationOptions(inp, fireAge, ...)` | FIRE-age resolver (`_firstAccumRow`) |
| 6 | 15338 | 15755 | Cash-flow warning pill | **`{}` empty options** | Negative-residual indicator visibility check |

**Critical finding**: Caller #6 (line 15338) calls `accumulateToFire(inp, fireAge, {})` with an EMPTY options bag — bypassing `resolveAccumulationOptions` entirely. This caller will continue to use `inp.annualSpend` (undefined → 0) UNLESS Phase 4 also fixes this site.

**Caller #6 fix**: refactor to use `resolveAccumulationOptions(inp, fireAge, 'invest-keep-paying')` to get the full options bag including the new `accumulationSpend` field. Same pattern as the other 5 callers.

**Module-level call site (`calc/accumulateToFire.js:358`)**: the function's own definition. Not a caller, just the implementation.

**Test-file call sites**: ~30 calls in `tests/unit/accumulateToFire.test.js` use `baseOptions()` fixture builder. Phase 4 task includes updating `baseOptions()` to include a default `accumulationSpend` value (e.g., $50,000 to keep existing test arithmetic stable). Existing test assertions get `// 023:` annotations where the spending baseline change shifts an expected value.

**Alternatives considered**:
- (a) Refactor all callers to use a single `runAccumulation(inp, fireAge)` wrapper that internalizes `resolveAccumulationOptions`. Rejected — too large a refactor for a bug fix; the explicit options-bag pattern is clearer at call sites.
- (b) Move `resolveAccumulationOptions` into `calc/accumulateToFire.js` as a default-options helper. Rejected — the helper reads from DOM (rentMonthly via `getElementById('exp_0')`), so it can't be in a pure calc module.
- **Selected**: each of the 6 call sites is updated individually, all routing through `resolveAccumulationOptions`. Caller #6 gets a one-line refactor (replace `{}` with the helper call).

---

## R3 — Helper-location decision: `getAccumulationSpend(inp)` lives INLINE in both HTMLs

**Decision**: Define `getAccumulationSpend(inp)` as inline JavaScript in both HTMLs near the other DOM-reading helpers (e.g., next to `getTotalMonthlyExpenses()` at RR line 7594). NOT extracted to `calc/accumulationSpend.js`.

**Rationale**:

1. **DOM dependency**: The helper's primary job is to read `getTotalMonthlyExpenses()`, which itself reads from `document.getElementById('exp_0')` etc. A pure calc module cannot do this. The helper would have to take a callback (`getTotalMonthlyExpensesFn`) as an argument, which adds ceremony for a 5-line helper.

2. **Precedent**: `getActiveChartStrategyOptions()` and `getActiveMortgageStrategyOptions()` (called at every `accumulateToFire`/`projectFullLifecycle` site) are also inline JS in both HTMLs. They thread a small piece of state through to the calc module via the options bag. `getAccumulationSpend` follows the same pattern — minimal new ceremony, maximum lockstep clarity.

3. **Fallback pattern locality**: FR-002a's "$120,000 default when line items are zero" is a small piece of business logic that benefits from being literally next to where the dashboard reads other defaults. Extracting it would force the test harness to also reproduce the default → harness-only divergence risk.

4. **Audit-harness testing**: The harness's `boundFactory(persona)` (per `tests/unit/validation-audit/harness.js`) builds `inp` per-persona. Phase 4 adds `accumulationSpend` to the persona record schema directly (NOT computed via DOM-stub), so the harness test path bypasses the inline helper. Tests for the helper itself live in `tests/unit/getAccumulationSpend.test.js` and inject a stub `getTotalMonthlyExpenses` via the function-arg pattern (helper signature: `getAccumulationSpend(inp, getTotalMonthlyExpensesFn)`).

5. **Constitution V (zero-build)**: Inline JS keeps the dashboard double-clickable. No new file load. Smallest delta to the existing UMD-classic-script topology.

**Alternatives considered**:

- (a) Extract to `calc/accumulationSpend.js` with `getTotalMonthlyExpensesFn` callback parameter:
  ```js
  function getAccumulationSpend(inp, getTotalMonthlyExpensesFn) {
    const monthly = getTotalMonthlyExpensesFn ? getTotalMonthlyExpensesFn() : 0;
    const annual = monthly * 12;
    return annual > 0 ? annual : 120000;  // FR-002a fallback
  }
  ```
  Pros: Pure calc module per Principle II; reusable in audit harness without DOM. Cons: 5-line file; forces every caller to pass a callback. Rejected as overengineered.

- (b) Inline in both HTMLs, identical body:
  ```js
  function getAccumulationSpend(inp) {
    const monthly = (typeof getTotalMonthlyExpenses === 'function') ? getTotalMonthlyExpenses() : 0;
    const annual = monthly * 12;
    return annual > 0 ? annual : 120000;  // FR-002a fallback
  }
  ```
  Pros: DOM-direct; matches `getActiveChartStrategyOptions` precedent; lockstep grep-checkable. Cons: duplicated 5 lines across both HTMLs (already true for ~50 helpers). **Selected**.

- (c) Inline as a one-liner inside `resolveAccumulationOptions`:
  ```js
  return {
    ...,
    accumulationSpend: (typeof getTotalMonthlyExpenses === 'function') ? Math.max(getTotalMonthlyExpenses() * 12, 120000) : 120000,
  };
  ```
  Pros: zero new helper. Cons: hides FR-002a logic; harder to test independently; harder to reason about during browser smoke. Rejected.

---

## R4 — Fallback chain design

**Decision**: Three-tier soft-fallback chain in `accumulateToFire`:

```
options.accumulationSpend (NEW, preferred)
  → if undefined or non-numeric, fall to inp.annualSpend (v3 backwards-compat)
  → if undefined or non-numeric, fall to inp.monthlySpend × 12 (v1 backwards-compat)
  → if undefined or non-numeric, fall to 0 (final fallback; emits cashFlowWarning='MISSING_SPEND' to surface in audit dump)
```

**Rationale**:

1. **Test-file backwards-compat**: ~30 calls in `tests/unit/accumulateToFire.test.js` use `baseOptions()` which doesn't currently set `accumulationSpend`. Hard-failing would force every test to be updated in the same commit, conflating the bug fix with test cleanup. Soft-fall preserves test stability.

2. **Persona-record migration**: 92 audit-harness personas don't have `accumulationSpend`. Two of them currently don't even have `monthlySpend`. Soft-fall lets the harness migrate gradually — Phase 7 (US4 backwards-compat) uses the `inp.monthlySpend × 12` path during the transition, then Phase 4 adds `accumulationSpend` to the persona schema.

3. **`MISSING_SPEND` warning surface**: When the final fallback (`0`) is hit, `cashFlowWarning: 'MISSING_SPEND'` flag is set on every accumulation row. The audit dump exposes this; the cash-flow warning pill (caller #6) shows it. A test-harness or third-party caller that drops a record will see a visible warning, NOT silent corruption. This eliminates the original bug class (silent fall-through to $0).

4. **No hard-fail**: would force lockstep test/persona migration in a single commit. Risk of large diff masking actual logic regressions.

**Alternatives considered**:

- (a) Hard-fail: `throw new Error('accumulationSpend required in options')`. Rejected — too aggressive; couples the bug fix to a test/fixture migration that should be Phase 4's job.
- (b) Soft-fall to fixed `$120,000` US baseline: Rejected — silently produces RR-specific value for personas with no spending data. The `MISSING_SPEND` warning is the more honest signal.
- **Selected**: 4-tier chain with explicit warning at the bottom.

**Implementation skeleton** in `calc/accumulateToFire.js`:

```javascript
// Step 4: Annual spending in real-$ frame.
// FRAME: real-$ — spend stays constant in today's-$ (slider input is in
//        today's purchasing power). Per-spec FR-014 (feature 022) + FR-003 (feature 023).
let baseAnnualSpend;
let _spendSource;  // diagnostic: which fallback tier produced the value
if (typeof opts.accumulationSpend === 'number' && opts.accumulationSpend >= 0) {
  baseAnnualSpend = opts.accumulationSpend;
  _spendSource = 'options.accumulationSpend';  // preferred (feature 023)
} else if (typeof inp.annualSpend === 'number') {
  baseAnnualSpend = inp.annualSpend;
  _spendSource = 'inp.annualSpend';  // v3 backwards-compat
} else if (typeof inp.monthlySpend === 'number') {
  baseAnnualSpend = inp.monthlySpend * 12;
  _spendSource = 'inp.monthlySpend×12';  // v1 backwards-compat
} else {
  baseAnnualSpend = 0;
  _spendSource = 'MISSING';  // final fallback — surface in cashFlowWarning
}
const annualSpending = baseAnnualSpend;
```

The `_spendSource` diagnostic is captured per-row for the audit dump (`PerYearAccumulationRow.spendSource`).

---

## Summary table

| R# | Question | Decision |
|---|---|---|
| R1 | Bug-verification arithmetic + SC-001 threshold | RR-baseline year-1 Book Value Δ drops from +$191,722 to ~+$96,851. SC-001 updated to < $100,000. |
| R2 | Caller audit | 6 callers per HTML, not 4. FR-007 updated. Caller #6 (line 15338) needs additional refactor. |
| R3 | Helper location | Inline JS in both HTMLs, matches `getActiveChartStrategyOptions` pattern. |
| R4 | Fallback chain | 4-tier soft-fall: `options.accumulationSpend → inp.annualSpend → inp.monthlySpend×12 → 0` with `MISSING_SPEND` warning at the bottom. |

All NEEDS-CLARIFICATION items resolved. Ready for Phase 1 (data-model.md, contracts/, quickstart.md).
