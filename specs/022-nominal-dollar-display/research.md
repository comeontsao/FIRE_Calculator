# Phase 0 Research — Feature 022

**Date**: 2026-05-01
**Feature**: Nominal-dollar display + frame-clarifying comments + B-021 carry-forward

This document consolidates implementation-pattern references the feature 022 work will lean on. The 5 clarifications session resolved design questions (`spec.md` § Clarifications); R1–R5 below are *technology / pattern references*, not open design questions.

---

## R1 — Inflation-conversion math precision

**Decision**: Use `nominal = real × (1 + inflationRate)^yearsFromNow` per the FIRE-community convention.

**Rationale**: This is the standard inflation-projection formula used in:
- IRS published inflation-adjusted figures (annual bracket inflation indexing).
- Mr. Money Mustache's "Shockingly Simple Math behind Early Retirement" projections.
- Bogleheads wiki "Inflation" page on real-vs-nominal conversion.
- Vanguard / Fidelity retirement-planning calculators (when they expose nominal projections).

The formula composes naturally with `realReturn = (1 + nominalReturn) / (1 + inflationRate) − 1` (the multiplicative real-return convention used in `calc/accumulateToFire.js`). Round-tripping `realValue × (1 + i)^t` against `nominalValue / (1 + i)^t` cancels exactly to floating-point precision.

**Edge cases**:
- `inflationRate = 0`: `nominal = real × 1^t = real`. Conversion no-op. Charts visually identical to feature-021 behavior.
- `inflationRate < 0` (deflation): `(1 + i)^t < 1`; nominal < real. Mathematically valid but unusual; spec FR allows.
- `t = 0` (currentAge data point): `nominal = real × 1 = real`. KPI "Current Net Worth" needs no conversion (FR-006).

**Alternatives considered**:
- **Continuous compounding**: `nominal = real × e^(i × t)`. More academically pure for instantaneous compounding but ~0.5% off vs annual compounding for typical i = 3-5%. The discrete annual formula matches IRS bracket indexing convention; closer to user mental model.
- **Subtractive shortcut** (`nominal = real × (1 + i × t)`): used in some quick-arithmetic estimates but has 5-15% error over 30+ year horizons. Rejected.

---

## R2 — Central-snapshot transformation pattern

**Decision**: Extend `recalcAll()` to produce `bookValue` companion fields per Q5 / FR-008d, following the established codebase pattern.

**Codebase precedent**:
- **Feature 014 `assembleAuditSnapshot`** (`calc/calcAudit.js`): the audit-tab assembler is the canonical "single transformation point feeding N renderers" pattern. It runs once per recalc, produces a shaped snapshot object, and audit-tab renderers consume specific paths. Feature 022's `bookValue` extension is a strict superset of this pattern.
- **Feature 020 `lifecycleProjection.rows`** (in `copyDebugInfo` output): a per-year row array that's both consumed by chart renderers AND surfaced in the audit dump. Feature 022 will gain `lifecycleProjection.rows[i].totalBookValue` alongside the existing `total`.
- **Feature 021 `taxIncomeRow.formatTaxIncomeRow`** (`calc/taxExpenseRow.js`): reads from a snapshot field and formats for UI display. Feature 022 will update this helper to read `lifecycleProjection.rows[0].federalTaxBookValue` instead of `federalTax`.

**Snapshot extension shape**:

```js
// Existing (feature 020/021)
snap.lifecycleProjection.rows[i] = {
  age, year, total, p401k, pStocks, pCash, pRoth,
  federalTax, ficaTax, grossIncome, annualSpending, ...
};

// Feature 022 adds — same row gains `*BookValue` fields:
snap.lifecycleProjection.rows[i] = {
  // ... all existing real-$ fields preserved ...
  totalBookValue,           // = total × (1 + i)^(age − currentAge)
  p401kBookValue,
  pStocksBookValue,
  pCashBookValue,
  pRothBookValue,
  federalTaxBookValue,
  ficaTaxBookValue,
  grossIncomeBookValue,
  annualSpendingBookValue,
  // ... etc.
};
```

Render functions read `*BookValue` directly — no inline conversion. The `recalcAll()` extension function is a single ~30-line loop that maps each row's $-valued fields through `displayConverter.toBookValue(value, age, currentAge, inflationRate)`.

**Alternatives considered**:
- **Per-chart inline conversion** (Option A in Q5): rejected because forgetting to convert silently shows today's-$. Single-source-of-truth violation per Constitution III.
- **Render middleware / wrapper** (Option D in Q5): over-engineered for a 14-chart surface; introduces architectural layer the project doesn't currently use.

---

## R3 — `// FRAME:` annotation taxonomy

**Decision**: Use four canonical comment categories with a strict grep-able pattern. Meta-test `tests/meta/frame-coverage.test.js` enforces ≥95% coverage on qualifying lines.

**Canonical categories**:

```js
// FRAME: real-$ (today's purchasing power; pool growth uses realReturn)
const realReturnStocks = inp.returnRate - inp.inflationRate;

// FRAME: nominal-$ (year-of-occurrence dollars; inflated from base by raiseRate)
const grossIncomeNominal = annualIncomeBase * Math.pow(1 + raiseRate, yearsFromNow);

// FRAME: conversion (real-$ × (1 + i)^t → nominal-$ for chart render)
const totalBookValue = total * Math.pow(1 + inflationRate, yearsFromNow);

// FRAME: pure-data (no $ value; not subject to frame conversion)
const ageRow = perYearRow.age;
```

**Module-level header pattern**:

```js
/*
 * calc/<module>.js — <description>
 *
 * Inputs: <existing>
 * Outputs: <existing>
 * Consumers: <existing>
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: real-$ (today's purchasing power)
 *   Frame-conversion sites: NONE (this module produces real-$ outputs only;
 *     conversion to nominal-$ happens at recalcAll() snapshot time)
 *   OR
 *   Frame-conversion sites:
 *     - Line 234: realToNominal computed at recalcAll() time
 *     - Line 567: per-row Math.pow(1 + i)^t for chart x-axis labels
 */
```

**Meta-test grep pattern**:

```js
// In tests/meta/frame-coverage.test.js
const QUALIFYING_TOKEN_REGEX = /\b(realReturn|inflationRate|nominalReturn|raiseRate|Math\.pow\s*\(\s*1\s*\+\s*inflationRate)\b/;
const FRAME_COMMENT_REGEX = /\/\/\s*FRAME:\s*(real|nominal|conversion|pure-data)/;

// For each line matching QUALIFYING_TOKEN_REGEX:
//   Check that within 3 lines above, FRAME_COMMENT_REGEX matches.
//   If not, add to offenders[].
// Assert offenders.length / qualifying.length <= 0.05 (≥95% coverage).
```

**Alternatives considered**:
- **Type system / TypeScript declarations** (`type RealUSD = number`): would be ideal but Constitution V prohibits build steps. Comments are the workable equivalent.
- **JSDoc annotations** (`@frame real`): less greppable, more verbose. The bare `// FRAME:` pattern is concise + meta-testable.
- **Single-line annotation only** (no module-level header): loses the "what's the dominant frame" overview. Both module-level header + per-line annotation give complementary signals.

---

## R4 — Hybrid-frame bug forensic in `accumulateToFire.js`

**Decision**: US3 fix replaces the cash-flow residual line with a single-frame (real-$) computation.

**Pre-fix evidence** (`calc/accumulateToFire.js` lines 525-570 in feature 021):

```js
// Pool growth: real-$ frame (uses realReturn)
pStocks = pStocks * (1 + realReturnStocks) + effectiveAnnualSavings;
pTrad = pTrad * (1 + realReturn401k) + tradContrib;

// Income: NOMINAL frame (inflated by raiseRate)
const grossIncome = annualIncomeBase * Math.pow(1 + raiseRate, yearsFromNow);

// Spending: NOMINAL frame (inflated by inflationRate)
const annualSpending = baseAnnualSpend * Math.pow(1 + inflationRate, yearsFromNow);

// Tax: computed on NOMINAL income with FIXED 2024 brackets
const taxResult = _computeYearTax(grossIncome, pretax401kEmployee, inp);
const federalTax = taxResult.federalTax;
const ficaTax = taxResult.ficaTax;

// 401k contributions: REAL frame (constant $23,500/yr regardless of year)
// stockContribution: REAL frame (constant $12,000/yr)

// Cash-flow residual MIXES FRAMES:
const residual = grossIncome - federalTax - ficaTax - pretax401kEmployee
                 - annualSpending - stockContribution;
//   ^nominal-$  ^nominal-$    ^nominal-$  ^real-$              ^nominal-$  ^real-$
// Then assigned to pCash which grew at realReturn (real-$ frame):
pCash = pCash * (1 + realReturn) + residual;
//                                    ^^^^^^^^ frame mismatch — residual is mostly nominal but pCash is real
```

**Post-fix design**:

```js
// FRAME: real-$ (income converted from nominal to real before residual)
const grossIncomeReal = annualIncomeBase * Math.pow(1 + raiseRate - inflationRate, yearsFromNow);
const annualSpendingReal = baseAnnualSpend;  // constant in real terms

// FRAME: real-$ (tax computed on real income; brackets treated as today's $ values
//        per FR-015 — the implicit assumption is that brackets inflation-index
//        in lockstep with real wages, which they roughly do in reality)
const taxResult = _computeYearTax(grossIncomeReal, pretax401kEmployee, inp);

// FRAME: real-$ (residual all in single frame)
const residual = grossIncomeReal - taxResult.federalTax - taxResult.ficaTax
                 - pretax401kEmployee - annualSpendingReal - stockContribution;

// FRAME: real-$ pool growth + real-$ residual
pCash = pCash * (1 + realReturnCash) + residual;
```

**Pre-fix vs post-fix delta on RR-baseline (≈$150k income, $20k pretax 401k, 11-yr horizon)**:

Year 1 pre-fix residual:
```
$150,000 × 1.03 - $12,000 - $11,475 - $20,000 - $80,000 × 1.03 - $12,000
= $154,500 - $12,000 - $11,475 - $20,000 - $82,400 - $12,000
= $16,625 nominal residual
Added to real-$ pCash → ~$2,000 distortion (year-1 alone)
```

Year 1 post-fix residual:
```
$150,000 - $12,300 - $11,475 - $20,000 - $80,000 - $12,000
= $14,225 real residual
Added to real-$ pCash → 0 distortion (single frame)
```

Cumulative distortion over 11 years pre-fix: ~$8,000–$15,000 in pCash alone (depending on raiseRate vs inflationRate spread). Drives buffer-floor decisions during retirement.

**Backwards-compat with feature 020 conservation invariant**: feature 020 used the pre-fix (nominal) residual. Conservation invariant `Σincome − Σtax − Σspend − Σ401k − Σstock = ΣcashFlow` HELD because both sides were nominal — but pCash growth at real-return frame meant the saved cash (in nominal $) silently inflated faster than pCash's real-return growth could offset. Feature 022 conservation invariant becomes well-defined: all single-frame.

**Alternatives considered**:
- **Convert pool growth to nominal frame instead** (everything nominal): cleaner conceptually but violates the dashboard's longstanding real-$ convention for asset projections. Would invalidate hundreds of pinned test values across features 001-021.
- **Keep mixed-frame, document the bias**: rejected — silent ~$8-15k pCash distortion drives feasibility decisions; not acceptable for FIRE planning.

---

## R5 — `_simulateStrategyLifetime` integer-year truncation

**Decision**: US5 fix quantizes the ranker's age input to monthly precision before iteration.

**Pre-fix evidence** (in both HTMLs' inline `_simulateStrategyLifetime`):

```js
function _simulateStrategyLifetime(strategy, inp, fireAge, ...) {
  const currentAge = inp.agePerson1 || inp.ageRoger || 42;
  const yrsToFire = fireAge - currentAge;
  // ^^^ When currentAge = 42.00 → yrsToFire = 13.00
  // ^^^ When currentAge = 42.01 → yrsToFire = 12.99 → SAME accumulation loop
  //     (loop iterates Math.floor(yrsToFire) years)
  // ^^^ When currentAge = 41.99 → yrsToFire = 13.01 → SAME 13-year loop
  // ^^^ But when currentAge = 41.00 → yrsToFire = 14.00 → 14-year loop
  //     (different by a full extra year — score jumps massively)

  for (let y = 0; y < Math.floor(yrsToFire); y++) {
    // ... year-by-year accumulation ...
  }
}
```

The audit's ±0.01yr perturbations (E3 invariant) shift `agePerson1` by 0.01, which 99% of the time stays within the same `Math.floor(yrsToFire)` integer bucket — but at integer boundaries (whole-year ages 41.00, 42.00, etc.) the perturbation DOES flip the loop count by one full year, producing score jumps of 0.08–11.44 years.

**Post-fix design**:

```js
function _simulateStrategyLifetime(strategy, inp, fireAge, ...) {
  const currentAge = inp.agePerson1 || inp.ageRoger || 42;

  // FRAME: pure-data (age in years, not $-valued)
  // FR-021 / B-021-1 fix: quantize ages to monthly precision before subtraction
  // so a ±0.01yr perturbation in either age stays within the same integer-month
  // bucket rather than spanning a whole-year boundary.
  const currentAgeMonths = Math.floor(currentAge * 12);
  const fireAgeMonths = Math.floor(fireAge * 12);
  const monthsToFire = fireAgeMonths - currentAgeMonths;
  const yrsToFire = monthsToFire / 12;

  for (let y = 0; y < Math.floor(yrsToFire); y++) {
    // ... year-by-year accumulation (same as before for integer-yr inputs) ...
  }
}
```

**Backwards-compat verification**:
- `currentAge = 42.0`, `fireAge = 55.0`: `monthsToFire = 660 − 504 = 156`, `yrsToFire = 13.0` ✓ (identical to pre-fix).
- `currentAge = 42.0`, `fireAge = 55.5`: `monthsToFire = 666 − 504 = 162`, `yrsToFire = 13.5` ✓ (preserves fractional age input from feature 020 month-precision).
- `currentAge = 42.01`, `fireAge = 55.0`: `currentAgeMonths = 504` (Math.floor), `monthsToFire = 156`, `yrsToFire = 13.0` ✓ (perturbation absorbed — was 12.99 pre-fix).

Hysteresis from feature 021 FR-018 (±0.05yr) now correctly absorbs the residual sub-month noise.

**Alternatives considered**:
- **Increase hysteresis threshold to 1.0yr+**: would mask real winner changes. Rejected per spec FR-018 rationale.
- **Replace integer-year accumulation with month-by-month iteration**: 12× more loop iterations; performance cost; out of scope. The pre-quantization approach gets the audit-stability benefit without changing the simulator's iteration granularity.
- **Quantize age input but keep integer-year loop**: this IS what we're doing.

---

## Open items deferred to later phases

None. All 5 research items above resolve to concrete data, pattern references, or arithmetic traces that the implementation can consume directly. Phase 1 design proceeds without further research.
