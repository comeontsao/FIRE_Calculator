# Quickstart — Feature 020 Validation Audit

This document explains how to run the audit harness once Phase 6 lands.

## Run the full audit

```bash
node --test tests/unit/validation-audit/
```

Expected runtime: under 5 minutes (SC-001).
Output: standard `node:test` TAP output PLUS a JSON findings log written to `specs/020-validation-audit/audit-report.json` (regenerated on each run).

## Run a single invariant family

```bash
node --test tests/unit/validation-audit/mode-ordering.test.js
node --test tests/unit/validation-audit/end-state-validity.test.js
node --test tests/unit/validation-audit/cross-chart-consistency.test.js
node --test tests/unit/validation-audit/cashflow-accounting.test.js
node --test tests/unit/validation-audit/drag-invariants.test.js
```

## Run a single persona across all invariants

Set the `PERSONA` env var to the persona ID:

```bash
PERSONA=RR-baseline node --test tests/unit/validation-audit/
```

The harness filters to that persona only. Useful for reproducing a single finding.

## Add a new persona

Edit `tests/unit/validation-audit/personas.js`:

```js
exports.personas.push({
  id: 'my-new-persona',
  dashboard: 'Generic',
  inp: { /* ... full InputState ... */ },
  notes: 'Stress test for X edge case',
});
```

Re-run the audit; the new persona appears in the matrix. If it surfaces a finding, append a row to `audit-report.md`.

## Add a new invariant

Edit the appropriate invariant family file (e.g., `mode-ordering.test.js`):

```js
const myNewInvariant = {
  id: 'A3',
  family: 'mode-ordering',
  description: 'Some new rule',
  severity: 'HIGH',
  check(persona, ctx) {
    const observed = ctx.fireAgeByMode.safe.years;
    const expected = '<some computed value>';
    if (observed !== expected) {
      return { passed: false, observed, expected };
    }
    return { passed: true };
  },
};

invariants.push(myNewInvariant);
```

The harness picks up the new invariant automatically and runs it across the persona matrix.

## Reproduce a specific finding

In `audit-report.md`, every finding has a persona ID and an invariant ID. To reproduce:

```bash
PERSONA=<persona-id> INVARIANT=<invariant-id> node --test tests/unit/validation-audit/
```

The harness logs the inputs, observed value, and expected value for the failing cell. Diagnose with the standard project workflow (read code, write a focused unit test, fix, verify).

## Browser-side smoke (after CRITICAL/HIGH fixes)

The audit runs in pure Node. After CRITICAL or HIGH findings are fixed in code, the user runs browser smoke to confirm UI agreement:

1. Open `FIRE-Dashboard.html` in a real browser.
2. Open `FIRE-Dashboard-Generic.html` (single + couple flips).
3. For each fixed finding's persona: load the inputs, drag the FIRE marker to the failing age, confirm the chart + verdict + Progress card all agree with the audit's expectation.
4. Confirm zero red console errors.

Browser smoke is the user-side gate before merge.
