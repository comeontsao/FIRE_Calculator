# Contract — Month-Precision-Feasibility Audit Invariant

**Family**: `month-precision-feasibility` (NEW in feature 022)
**File**: `tests/unit/validation-audit/month-precision-feasibility.test.js`
**Severity**: HIGH
**Constitution**: Principles II (audit observability), IV (gold-standard regression coverage)
**Spec**: FR-022, FR-023 (US6 / B-021-2 / B-020-5 carry-forward)

## Purpose

Verify that the true fractional-year DWZ feasibility extension (US6 — extending `simulateRetirementOnlySigned` to pro-rate the FIRE-year row by `(1 − m/12)`) actually produces feasible trajectories at the resolver's returned `Y + M/12` age.

For every persona where the feature 020 month-precision resolver returns `searchMethod === 'month-precision'`, the simulator at the fractional age must produce zero `hasShortfall: true` rows under the active mode. This locks the property: month-precision is no longer a UI-display refinement (option c per feature 020 contract); it's a true fractional-year feasibility search (option b).

## Invariants

### MPF-1 (HIGH): Fractional-year feasibility holds at month-precision result

For each persona × `mode ∈ {'safe', 'exact', 'dieWithZero'}` cell where:
- `findEarliestFeasibleAge(persona.inp, mode, options)` returns `searchMethod === 'month-precision'`
- The result is `{years: Y, months: M, feasible: true}`

Run `simulateRetirementOnlySigned(persona.inp, annualSpend, Y + M/12, ...)` and assert:
- For `mode === 'safe'`: every retirement-year row has `total >= floor`. Zero `hasShortfall: true` rows.
- For `mode === 'exact'`: end-row `total >= terminalBuffer × annualSpend`. Zero `hasShortfall: true` rows.
- For `mode === 'dieWithZero'`: zero `hasShortfall: true` rows; `endBalance >= 0`.

Severity HIGH: a violation means the resolver is reporting "feasible at age Y years M months" but the underlying simulator can't actually fund the trajectory at that age — same class of bug as feature 020's B3 finding before it was fixed.

### MPF-2 (MEDIUM): Boundary check — infeasible at one month earlier

For each persona × mode where MPF-1 reports feasibility at `{Y, M}`:
- If `M > 0`: assert `simulateRetirementOnlySigned` at `Y + (M-1)/12` produces at least one `hasShortfall: true` row OR `endBalance < 0` (mode-dependent).
- If `M === 0`: assert at `(Y-1) + 11/12` (i.e., 11/12 of a year earlier) the same boundary infeasibility holds.

Severity MEDIUM: violations indicate the resolver returned an unnecessarily-late month (could have reported feasibility a month earlier). Less critical than MPF-1 but still a precision concern.

### MPF-3 (LOW): Conversion convention consistency

For each persona where the resolver returns `searchMethod === 'month-precision'`:
- The growth-multiplier convention used in `simulateRetirementOnlySigned`'s pro-rated FIRE-year row MUST match what the spec hook 1 resolution chose during planning (linear `1 + r × (1 − m/12)` vs exponential `(1 + r)^(1 − m/12)`).
- Assert by capturing the per-row growth factor and matching against the chosen convention.

Severity LOW: convention divergence within the simulator is a code-style consistency issue, not a user-visible bug.

## Implementation pattern

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { runHarness } = require(path.join(__dirname, 'harness.js'));
const { personas } = require(path.join(__dirname, 'personas.js'));

const invariantMPF1 = {
  id: 'MPF-1',
  family: 'month-precision-feasibility',
  description: 'Resolver-reported month-precision fireAge produces zero hasShortfall rows under active mode',
  severity: 'HIGH',
  check(persona, ctx) {
    const fireAgeByMode = ctx.fireAgeByMode || {};
    for (const mode of ['safe', 'exact', 'dieWithZero']) {
      const result = fireAgeByMode[mode];
      if (!result || result.searchMethod !== 'month-precision') continue;

      const fractionalAge = result.years + result.months / 12;
      const annualSpend = persona.inp.annualSpend || 72700;

      let sim;
      try {
        sim = ctx._api.simulateRetirementOnlySigned(persona.inp, annualSpend, fractionalAge);
      } catch (err) {
        return {
          passed: false,
          observed: { mode, fractionalAge, error: err.message },
          expected: 'simulator runs without throwing at fractional age',
        };
      }

      const shortfallRows = (sim.rows || []).filter(r => r.hasShortfall === true);
      if (shortfallRows.length > 0) {
        return {
          passed: false,
          observed: {
            mode, fractionalAge,
            shortfallCount: shortfallRows.length,
            firstShortfallAge: shortfallRows[0].age,
          },
          expected: 'zero hasShortfall:true rows at month-precision-resolved fireAge',
        };
      }

      if (mode === 'dieWithZero' && sim.endBalance < 0) {
        return {
          passed: false,
          observed: { mode, fractionalAge, endBalance: sim.endBalance },
          expected: 'DWZ endBalance >= 0 at month-precision-resolved fireAge',
        };
      }
    }
    return { passed: true };
  },
};

// (MPF-2, MPF-3 defined similarly)

test('T022-MPF: month-precision-feasibility invariants run across the persona matrix', () => {
  const result = runHarness(personas, [invariantMPF1, invariantMPF2, invariantMPF3], { silent: true });
  // Same console.log + assertion pattern as feature-021 tax-bracket-conservation tests.
});
```

## Expected results post-implementation

After US6 ships (the simulator pro-rate change):

- MPF-1: 0 findings expected. Every month-precision resolver result is genuinely feasible.
- MPF-2: 0–5 findings expected. Some personas may have resolver returning a later month than strictly necessary due to monotonic-flip stability fallback; those are acceptable per spec hook 3 in feature 020 audit-report.
- MPF-3: 0 findings expected. Single growth-multiplier convention enforced.

If any MPF-1 finding fires, it indicates a bug in the simulator's pro-rate handling — most likely a sub-iteration boundary issue at age 59.5 (401k unlock) or `ssClaimAge`.

## Integration with US7's display

This invariant family is independent of the display-frame work (US1). It locks the calc-layer property regardless of whether the user has Book Value or purchasing-power display active.

## Integration with feature 021's audit harness CI workflow

The new test file runs alongside the existing 6 invariant test families (mode-ordering, end-state-validity, cross-chart-consistency, drag-invariants, harness meta, tax-bracket-conservation) in `.github/workflows/audit.yml`. Findings appear in the PR comment summary alongside the other families.

## Out of scope

Does NOT verify that the resolver's `searchMethod === 'integer-year'` results are also correct — those are locked by feature 020's existing invariants (B3 regression test pins integer-year correctness for previously-flagged personas).

Does NOT verify the resolver's monotonic-flip stability fallback is correct — that's a separate property covered by `tests/unit/monthPrecisionResolver.test.js` cases 2 + 6.
