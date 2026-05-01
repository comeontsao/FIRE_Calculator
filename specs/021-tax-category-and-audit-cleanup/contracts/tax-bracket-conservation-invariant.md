# Contract — Tax-Bracket Conservation Audit Invariant

**Family**: `tax-bracket-conservation` (NEW in feature 021)
**File**: `tests/unit/validation-audit/tax-bracket-conservation.test.js`
**Severity**: HIGH
**Constitution**: Principles II (audit observability), IV (gold-standard regression coverage), VI (chart ↔ module contracts)

## Purpose

Ensures that the per-bracket tax breakdown emitted by `calc/accumulateToFire.js` v3 sums to the aggregate `federalTax`, and that the FICA component breakdown sums to the aggregate `ficaTax`. Locks the bracket math against silent drift (e.g., a future calc-engine refactor that miscounts a bracket boundary).

## Invariants

### TBC-1 (HIGH): Federal-tax-breakdown conservation

For each persona × accumulation year where `computedFromBrackets === true`:

```
Σ(federalTaxBreakdown.bracket10
  + federalTaxBreakdown.bracket12
  + federalTaxBreakdown.bracket22
  + federalTaxBreakdown.bracket24
  + federalTaxBreakdown.bracket32
  + federalTaxBreakdown.bracket35
  + federalTaxBreakdown.bracket37) === federalTax    // within ±$1
```

If `computedFromBrackets === false` (flat-rate override path), this invariant is SKIPPED for that row (breakdown is empty by design).

### TBC-2 (HIGH): FICA-breakdown conservation

For each persona × accumulation year where `computedFromBrackets === true`:

```
ficaBreakdown.socialSecurity
  + ficaBreakdown.medicare
  + ficaBreakdown.additionalMedicare === ficaTax    // within ±$1
```

### TBC-3 (MEDIUM): Taxable-income definition

For each persona × accumulation year where `computedFromBrackets === true`:

```
federalTaxBreakdown.taxableIncome === Math.max(0,
  perYearRow.grossIncome
    - perYearRow.pretax401kEmployee
    - federalTaxBreakdown.standardDeduction
)    // exact equality (integer dollars)
```

### TBC-4 (HIGH): Filing-status correctness

For each persona × accumulation year where `computedFromBrackets === true`:

- If `persona.inp.adultCount === 1`: `federalTaxBreakdown.standardDeduction === 14600` (single 2024 std ded).
- If `persona.inp.adultCount === 2` (or undefined for RR): `federalTaxBreakdown.standardDeduction === 29200` (MFJ 2024 std ded).

### TBC-5 (HIGH): Backwards-compat for flat-rate override

For each persona × accumulation year where `inp.taxRate > 0` (flat-rate override path):

- `federalTaxBreakdown` is empty `{}`.
- `ficaBreakdown` is empty `{}`.
- `ficaTax === 0`.
- `federalTax === Math.max(0, (grossIncome - pretax401kEmployee) * inp.taxRate)` — byte-identical to feature 020 v2 behavior.

## Implementation pattern

The test file follows the standard pattern established by feature 020's audit invariants:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runHarness } = require('./harness.js');
const { personas } = require('./personas.js');

const invariantTBC1 = {
  id: 'TBC-1',
  family: 'tax-bracket-conservation',
  description: 'federalTaxBreakdown bracket sum equals federalTax aggregate within $1',
  severity: 'HIGH',
  check(persona, ctx) {
    const rows = ctx.accumulationRows || [];
    for (const row of rows) {
      if (!row.federalTaxBreakdown || Object.keys(row.federalTaxBreakdown).length === 0) {
        // computedFromBrackets === false; skip
        continue;
      }
      const breakdown = row.federalTaxBreakdown;
      const sum = (breakdown.bracket10 || 0) + (breakdown.bracket12 || 0)
                + (breakdown.bracket22 || 0) + (breakdown.bracket24 || 0)
                + (breakdown.bracket32 || 0) + (breakdown.bracket35 || 0)
                + (breakdown.bracket37 || 0);
      if (Math.abs(sum - row.federalTax) > 1) {
        return {
          passed: false,
          observed: { breakdownSum: sum, federalTax: row.federalTax, age: row.age },
          expected: 'breakdown sum within ±$1 of federalTax',
        };
      }
    }
    return { passed: true };
  },
};

// (TBC-2 through TBC-5 defined similarly)

test('T021-TBC: tax-bracket-conservation invariants run across the persona matrix', () => {
  const result = runHarness(personas, [invariantTBC1, invariantTBC2, invariantTBC3, invariantTBC4, invariantTBC5], {});
  console.log(`# [tax-bracket-conservation] cells: ${result.cellsTotal} passed: ${result.cellsPassed} failed: ${result.cellsFailed}`);
  // Don't assert findings === 0 here — Phase 11 polish runs the full audit and triages.
  assert.ok(result.cellsTotal >= 92, 'expected at least 92 cells (one per persona)');
});

module.exports = { invariantTBC1, invariantTBC2, invariantTBC3, invariantTBC4, invariantTBC5 };
```

## Harness extension

The harness's `buildHarnessContext` already exposes the per-persona accumulation result. Phase 6 implementation may need to extend `ctx` to surface `accumulationRows` directly (or call `accumulateToFire(persona.inp, ...)` inline within `check`). Either path is acceptable; pick whichever keeps the harness API minimal.

## Expected results post-implementation

After the v3 refactor lands and the new test file is wired up:

- TBC-1 + TBC-2 + TBC-4: 0 findings expected (math is exact within rounding).
- TBC-3: 0 findings expected (definition is canonical).
- TBC-5: 0 findings expected (flat-rate path is byte-identical to v2).

If any finding fires, it indicates a bug in `_computeYearTax` (the new helper in `accumulateToFire.js` v3) — most likely a bracket-boundary off-by-one or a sign-error in the FICA additional-Medicare threshold.

## Integration with US5 (B-020-6) audit-in-CI

This invariant family runs alongside the existing 5 families (mode-ordering, end-state-validity, cross-chart-consistency, drag-invariants, harness-meta) in the new `.github/workflows/audit.yml` workflow. Findings appear in the PR comment summary alongside the other families.
