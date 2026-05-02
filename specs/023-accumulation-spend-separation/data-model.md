# Feature 023 — Data Model

**Feature**: Accumulation-vs-Retirement Spend Separation
**Branch**: `023-accumulation-spend-separation`
**Date**: 2026-05-01
**Phase**: 1 (Design & Contracts)

This document specifies the data-model deltas introduced by feature 023. The deltas are additive — no field is removed, no field is renamed.

---

## Entity 1 — `AccumulateToFireOptions` (extended)

**Source**: `calc/accumulateToFire.js` v3 → v5 contract.

**Existing fields (unchanged from v3)**:

| Field | Type | Description |
|---|---|---|
| `mortgageStrategyOverride` | `string?` | One of `invest-keep-paying` (default), `prepay-extra`, `invest-lump-sum` |
| `mortgageEnabled` | `boolean` | Mirror of `mortgageEnabled` flag in dashboard scope |
| `mortgageInputs` | `MortgageInputs?` | Snapshot of `getMortgageInputs()` |
| `secondHomeEnabled` | `boolean` | Mirror of `secondHomeEnabled` flag |
| `secondHomeInputs` | `SecondHomeInputs?` | Snapshot of `getSecondHomeInputs()` |
| `rentMonthly` | `number` | Baseline housing expense for `mtgSavingsAdjust` |
| `pviExtraMonthly` | `number` | Extra monthly P&I contribution slider |
| `selectedScenario` | `string` | Country tier id (`taiwan`, `us`, etc.) |
| `collegeFn` | `(inp, yearsFromNow) => number` | College drain callback |
| `payoffVsInvestFn` | `(inp) => PvIOutputs?` | PvI module reference |
| `framing` | `'liquidNetWorth' \| 'totalAssets'` | PvI framing mode |
| `mfjStatus` | `'mfj' \| 'single'` | Filing status for tax computation |

**NEW fields (feature 023)**:

| Field | Type | Description | Required? |
|---|---|---|---|
| **`accumulationSpend`** | `number` | Annual spending during accumulation phase, real-$ (today's purchasing power). Sourced from `getAccumulationSpend(inp)` per FR-002. | NO (soft-fallback per R4) |

**Validation rules**:

1. `accumulationSpend` MUST be `>= 0` when present. Negative values are coerced to `0` with `cashFlowWarning: 'MISSING_SPEND'` semantics.
2. When `accumulationSpend` is `undefined`, `null`, or non-numeric, the fallback chain in R4 applies (`inp.annualSpend → inp.monthlySpend×12 → 0`).
3. The field MUST stay in real-$ frame (today's purchasing power). It is NEVER scaled by inflation across years inside `accumulateToFire` — spending stays constant in today's-$ per FR-014 of feature 022.

**Frame**: `real-$`. Annotation in source: `// FRAME: real-$ — accumulationSpend (feature 023): household spending in today's purchasing power, constant across accumulation years`.

---

## Entity 2 — `getAccumulationSpend(inp)` helper output

**Source**: NEW inline JS in both HTMLs, near `getTotalMonthlyExpenses()` (RR line 7594-7602).

**Signature**:

```javascript
/**
 * Compute accumulation-phase annual spending from Plan-tab line items.
 *
 * @param {object} inp - Dashboard state record (currently unused but kept for future
 *                       per-year scaling extension; matches call-site convention).
 * @returns {number} Annual spending in real-$ (today's purchasing power).
 */
function getAccumulationSpend(inp) { ... }
```

**Behavior**:

1. Read `getTotalMonthlyExpenses()` (existing helper at RR line 7594).
2. Multiply by 12 to get annual spend.
3. If result is `>= 1000` (sanity floor), return it.
4. Otherwise (line items are zero or near-zero), return `120000` (Stay-in-US comfortable spend, per FR-002a).

**Why $1,000 floor (not $0)?**: If a user has only the default Rent row at $0/mo (during initial setup), the helper would return $0 → bug rebirth. The $1,000 floor is a defense in depth — any plausible real spending exceeds $1,000/yr.

**Frame**: `real-$` output.

---

## Entity 3 — `PerYearAccumulationRow` (semantic clarification + 1 new field)

**Source**: `calc/accumulateToFire.js` `perYearRows[]`.

**Existing fields (unchanged)**: `age`, `pTrad`, `pRoth`, `pStocks`, `pCash`, `mtgPurchasedThisYear`, `h2PurchasedThisYear`, `lumpSumDrainThisYear`, `contributions`, `effectiveAnnualSavings`, `mtgSavingsAdjust`, `collegeDrain`, `h2Drain`, `grossIncome`, `federalTax`, `annualSpending`, `pretax401kEmployee`, `empMatchToTrad`, `stockContribution`, `cashFlowToCash`, `cashFlowWarning`, `ficaTax`, `federalTaxBreakdown`, `ficaBreakdown`.

**Semantic clarification (feature 023)**:

- **`annualSpending`**: Pre-feature-023 this field was sourced from `inp.annualSpend → inp.monthlySpend×12 → 0`. Post-feature-023 it is sourced from `options.accumulationSpend` (preferred) with the legacy chain as fallback. The field name and frame stay the same; only the source resolution changes.

**NEW field (feature 023)**:

| Field | Type | Description |
|---|---|---|
| `spendSource` | `'options.accumulationSpend' \| 'inp.annualSpend' \| 'inp.monthlySpend×12' \| 'MISSING'` | Diagnostic: which fallback tier produced the `annualSpending` value. Surfaced in audit dump for debug visibility. |

**`cashFlowWarning` extension**:

| Value | When emitted |
|---|---|
| `'NEGATIVE_RESIDUAL'` (existing) | Cash flow residual computes to a negative value → clamped to 0. |
| **`'MISSING_SPEND'` (NEW)** | Final fallback tier hit: no spending source provided. Indicates harness misconfig or third-party caller bug. |

---

## Entity 4 — Audit-harness `Persona` record (extended)

**Source**: `tests/unit/validation-audit/harness.js` persona schema.

**Existing relevant fields**: `inp.annualIncome`, `inp.taxRate`, `inp.cashSavings`, `inp.otherAssets`, `inp.roger401kTrad`, `inp.roger401kRoth`, `inp.rogerStocks`, `inp.rebeccaStocks`, `inp.contrib401kTrad`, `inp.contrib401kRoth`, `inp.empMatch`, `inp.monthlySavings`, `inp.inflationRate`, `inp.returnRate`, `inp.return401k`, `inp.raiseRate`, `inp.swr`, `inp.bufferUnlock`, `inp.bufferSS`, `inp.endAge`, `inp.ssWorkStart`, `inp.ssAvgEarnings`, `inp.ssRebeccaOwn`, `inp.ssClaimAge`, `inp.adultCount`.

**NEW field (feature 023)**:

| Field | Type | Description | Required? |
|---|---|---|---|
| `inp.accumulationSpend` | `number` | Annual spending during accumulation phase, real-$. Persona-specific override. When absent, harness derives from `inp.monthlySpend × 12` if present, else `120,000` default. | NO |

The harness's `boundFactory(persona)` (loaded fresh per-persona to avoid the static-DOC_STUB bug from feature 020) builds the `_accumOpts` for each `accumulateToFire` invocation. After feature 023 it does:

```javascript
const _accumulationSpend = (typeof persona.inp.accumulationSpend === 'number')
  ? persona.inp.accumulationSpend
  : ((typeof persona.inp.monthlySpend === 'number') ? persona.inp.monthlySpend * 12 : 120000);

const _accumOpts = {
  ...resolveAccumulationOptions_harnessImpl(persona.inp, fireAge, mortgageStrategy),
  accumulationSpend: _accumulationSpend,
};
```

This mirrors the in-HTML `resolveAccumulationOptions` extension (per FR-006).

---

## Entity 5 — Audit dump JSON (Copy Debug output)

**Source**: `FIRE-Dashboard.html` `copyDebugInfo()` (line ~19107).

**Existing top-level fields**: `_generatedAt`, `_file`, `fireMode`, `fireAge`, `currentAge`, `ssClaimAge`, `annualSpend`, `bufferUnlock_yrs`, `bufferSS_yrs`, `summary`, `feasibilityProbe`, `mortgageStrategy`, `mortgageActivePayoffAge`, `lumpSumEvent`, `homeSaleEvent`, `postSaleBrokerageAtFire`, `audit`, `lifecycleSamples`, `lifecycleProjection`, `inputs`.

**NEW top-level fields (feature 023)**:

| Field | Type | Description |
|---|---|---|
| `accumulationSpend` | `number` | Real-$ value used for accumulation-phase residual. Mirrors what was passed to all 6 callers. |
| `accumulationSpend_source` | `string` | Diagnostic: `'getAccumulationSpend(inp)'` (normal path) OR `'fallback:inp.annualSpend'` (when DOM is unavailable, e.g., test harness) |

The existing `annualSpend` top-level field is preserved (it's the country-tier post-FIRE value). Audit consumers (downstream tools, debug agents) can now distinguish accumulation vs retirement spending from a single dump.

---

## Entity 6 — Audit-harness invariant — `accumulationSpendConsistency`

**Source**: NEW `tests/unit/validation-audit/accumulation-spend-consistency.test.js`.

**Cell count**: 92 personas × 3 modes × 6 callers = **1,656 cells** (correction from spec FR-014's 1,104 = 92 × 3 × 4).

**Invariant**:

For each persona × mode triple:
1. Resolve `_accumulationSpend` once via `getAccumulationSpend(persona.inp)` (or harness equivalent).
2. Invoke each of the 6 callers (signedLifecycleEndBalance, projectFullLifecycle, _simulateStrategyLifetime, computeWithdrawalStrategy, findEarliestFeasibleAge, cashflow-warning-pill check) with the same `inp`, `fireAge`, options.
3. Capture the `annualSpending` field of each caller's first accumulation-row output (year 0).
4. Assert all 6 values are equal within ±$0.01.

**Severity**: **HIGH** (drift indicates Constitution VI violation).

**Failure mode example (pre-fix)**: caller #6 (cashflow-warning-pill) used `{}` empty options → `annualSpending = 0` while the other 5 used `accumulationSpend = $120,000` → 6/6 disagreement.

---

## State transitions

None. All fields are pure data; no lifecycle/state-machine semantics introduced.

---

## Backwards-compatibility matrix

| Artifact | Pre-023 schema | Post-023 schema | Migration |
|---|---|---|---|
| `AccumulateToFireOptions` | v3 (no `accumulationSpend`) | v5 (optional `accumulationSpend`) | Soft-fallback at read time; no source-code migration needed for v3 callers. |
| `PerYearAccumulationRow` | v3 (no `spendSource`) | v5 (optional `spendSource`) | Field absent on v3 rows; consumers tolerate `undefined`. |
| Persona record (audit harness) | v2 (no `inp.accumulationSpend`) | v3 (optional `inp.accumulationSpend`) | Harness derives at runtime from `monthlySpend×12` or default. |
| Audit dump JSON | v3 (no `accumulationSpend` top-level) | v4 (`accumulationSpend` + `accumulationSpend_source` top-level) | Additive; downstream consumers safe. |
| CSV snapshots | v3 (no `accumulationSpend` column) | v3 (UNCHANGED) | `accumulationSpend` is computed at runtime, never persisted to CSV. |
| `localStorage` saved state | v3 (no `accumulationSpend` key) | v3 (UNCHANGED) | Same — runtime-derived. |

---

## Frame summary

| Field | Frame | Site |
|---|---|---|
| `options.accumulationSpend` | real-$ | All 6 caller call sites + `accumulateToFire.js` line ~593 |
| `getAccumulationSpend(inp)` return | real-$ | Both HTMLs near line 7594 |
| `PerYearAccumulationRow.annualSpending` | real-$ | `accumulateToFire.js` perYearRows[] |
| `audit dump.accumulationSpend` | real-$ | `copyDebugInfo()` line ~19107 |
| `audit harness persona.inp.accumulationSpend` | real-$ | `tests/unit/validation-audit/harness.js` |

All fields stay in **real-$ frame** (today's purchasing power). Conversion to nominal/Book Value happens centrally in `recalcAll()` per feature 022 — feature 023 does NOT introduce new conversion sites.

---

## Cross-feature references

- **Feature 010 (country-budget-scaling)**: `annualSpend` (country-tier) is the SOURCE for retirement-phase spending. Feature 023 leaves this contract intact.
- **Feature 020 (validation-audit)**: cash-flow conservation invariants (`v2`+) extended to consume `options.accumulationSpend` per FR-010.
- **Feature 021 (tax-category)**: tax-bracket-conservation invariants (TBC-1..TBC-5) untouched — they don't read `annualSpending`.
- **Feature 022 (nominal-dollar-display)**: `bookValue` companion fields on `pCash`, `pStocks`, etc. continue to compute from real-$ pools post-fix. Feature 023 does NOT modify the displayConverter.
