# Contract — `// FRAME:` Comment Conventions

**Where**: Every `calc/*.js` module + every inline simulator in both HTMLs.
**Constitution**: Principle II § audit-observability sub-requirement; Principle VI (chart ↔ module contracts).
**Spec FRs**: FR-009, FR-010, FR-011.

## Purpose

Make every $-valued variable's accounting frame self-documenting at the point of use, so future Manager-dispatched calc changes don't silently re-introduce frame mismatches. The user explicitly named this hedge as a P1 deliverable.

## Four canonical comment categories

| Category | When to use | Example |
|---|---|---|
| `// FRAME: real-$` | Variable holds today's-purchasing-power value. Pool growth, contributions, real-return-discounted future projections. | `const realReturnStocks = inp.returnRate - inp.inflationRate;` |
| `// FRAME: nominal-$` | Variable holds year-of-occurrence (Book Value) dollars. Income inflated by raiseRate, snapshot `*BookValue` companions, audit-table nominal columns. | `const grossIncomeNominal = base * Math.pow(1 + raiseRate, t);` |
| `// FRAME: conversion (real → nominal at year N)` | Lines that perform the conversion explicitly. Found in `displayConverter.toBookValue()`, `_extendSnapshotWithBookValues`, audit-dump bookValue assemblers. | `const totalBookValue = total * Math.pow(1 + i, age - currentAge);` |
| `// FRAME: pure-data (no $ value)` | Non-$-valued variables that just happen to be near $-handling code. Ages, year indices, count fields, ratios, percentages. | `const yrsToFire = fireAge - currentAge;` |

## Module-level header pattern

Every `calc/*.js` file's existing header comment block gains a `FRAME:` block:

```
/*
 * calc/<module>.js — <existing description>
 *
 * Inputs: <existing>
 * Outputs: <existing>
 * Consumers: <existing>
 *
 * FRAME (feature 022 / FR-009):
 *   Dominant frame: <real-$ | nominal-$ | mixed | conversion>
 *   Frame-conversion sites:
 *     - Line N: <description>          [if any]
 *     - Line M: <description>          [if any]
 *   OR:
 *   Frame-conversion sites: NONE (single-frame module)
 */
```

**Allowed `Dominant frame` values**:
- `real-$`: module produces and consumes real-$ values exclusively (e.g., `lifecycle.js`, `payoffVsInvest.js`).
- `nominal-$`: module produces nominal-$ outputs (rare; only `displayConverter.js`'s output side).
- `mixed`: module spans both frames by design (only `accumulateToFire.js` post-US3 still mixes due to income/spending nominal-vs-real handling at conversion sites — explicitly listed).
- `conversion`: module's primary purpose is real ↔ nominal conversion (only `displayConverter.js`).

If `mixed`, the module MUST list every conversion site in `Frame-conversion sites:`. Other categories may say `NONE` if no conversions happen inline.

## Inline annotation pattern

Every line that:
- contains a variable name with `Real`, `Nominal`, `Inflation`, `BookValue` substring, OR
- contains the expression `Math.pow(1 + inflationRate, ...)` or `Math.pow(1 + raiseRate, ...)`, OR
- contains a reference to `realReturn`, `realReturnStocks`, `realReturn401k`,

MUST have a `// FRAME:` annotation within 3 lines above (not necessarily on the same line; can be a header for a small block).

The annotation comments may stack multiple lines:

```js
// FRAME: real-$ — pool growth at real-return rate
// FRAME: real-$ — contribution constant in today's $
pStocks = pStocks * (1 + realReturnStocks) + effectiveAnnualSavings;
```

OR a single comment covering a block:

```js
// FRAME: real-$ — both grossIncome (post-US3 fix) and federalTax (computed
//        on real income with inflation-indexed brackets) live in real frame.
const taxResult = _computeYearTax(grossIncomeReal, pretax401kEmployee, inp);
const federalTax = taxResult.federalTax;
const ficaTax = taxResult.ficaTax;
```

## Meta-test enforcement (FR-011)

`tests/meta/frame-coverage.test.js` walks every `calc/*.js` file and asserts ≥95% qualifying-line coverage:

```js
const QUALIFYING_TOKEN_REGEX = /\b(realReturn|realReturnStocks|realReturn401k|inflationRate|nominalReturn|raiseRate|BookValue|toBookValue|invertToReal)\b/;
const FRAME_COMMENT_REGEX = /\/\/\s*FRAME:\s*(real-\$|nominal-\$|conversion|pure-data|mixed)/;

// Allowed: a qualifying line preceded within 3 lines by a FRAME comment.
// Allowed: a qualifying line that IS itself a FRAME comment (// FRAME: ... realReturn ...).
// Allowed: a qualifying line inside a block comment (between /* and */).

// Test passes if: offenders.length / qualifying.length ≤ 0.05
```

The 5% slack accommodates:
- Qualifying tokens inside string literals that are audit-step descriptions.
- Lines where the comment-of-record lives 4+ lines above (rare but allowed).
- Test files themselves (the meta-test excludes its own scan target).

## Lockstep across two HTMLs

Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` inline simulators MUST get matching `// FRAME:` annotations on parallel lines. The lockstep parity check after Phase 3 implementation:

```bash
grep -c "// FRAME:" FIRE-Dashboard.html
grep -c "// FRAME:" FIRE-Dashboard-Generic.html
# Counts should match within ±2 (allowance for personal-content-only lines).
```

## Examples per calc module

### `calc/accumulateToFire.js` (mixed frame)

Module header:
```
FRAME (feature 022 / FR-009):
  Dominant frame: mixed (real-$ pool growth + nominal-$ income inflation,
    reconciled to real-$ at cash-flow residual after US3 fix)
  Frame-conversion sites:
    - Line 530: grossIncome inflated to nominal (raiseRate)
    - Line 545: annualSpending inflated to nominal (inflationRate)
    - Line 530-560 (US3 fix): single-frame real-$ residual
    - Line 605-607: pool growth at realReturn
```

### `calc/displayConverter.js` (conversion module)

Module header:
```
FRAME (feature 022 / FR-009):
  Dominant frame: conversion (real-$ input → nominal-$ output)
  Frame-conversion sites: every public function in this module IS a conversion.
```

### `calc/taxBrackets.js` (pure data, no frame)

Module header:
```
FRAME (feature 022 / FR-009):
  Dominant frame: pure-data (no $ values; bracket boundary table is a fixed
    set of dollar thresholds in 2024 IRS-published amounts; treated as today's $
    per feature 021 spec § A6)
  Frame-conversion sites: NONE
```
