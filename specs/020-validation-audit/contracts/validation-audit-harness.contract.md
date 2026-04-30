# Contract — Validation Audit Harness

**Module**: `tests/unit/validation-audit/harness.js` (NEW in feature 020)
**Constitution**: Principle IV (Gold-Standard Regression Coverage).

## Function signatures

```
runHarness(personas, invariants, options) → HarnessResult

HarnessResult = {
  totalCells: number,            // personas.length × invariants.length
  passed: number,
  failed: number,
  findings: Finding[],
  durationMs: number,
}

Finding = {
  invariantId: string,
  invariantDescription: string,
  invariantSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  invariantFamily: string,
  personaId: string,
  observed: any,
  expected: any,
  notes?: string,
  discoveredAt: ISO8601 string,
}
```

## Lifecycle

For each `(persona, invariant)` pair:

1. **Build harness context** (cached per persona — many invariants share simulator outputs):
   ```
   ctx = {
     chart: projectFullLifecycle(persona.inp, ...),       // chart sim
     signedSim: signedLifecycleEndBalance(persona.inp, ...), // signed sim
     strategyRanking: scoreAndRank(persona.inp, ...),     // ranker
     fireAgeByMode: { safe, exact, dieWithZero },
     fireNumberByMode: { safe, exact, dieWithZero },
   }
   ```
2. **Run invariant check**: `result = invariant.check(persona, ctx)`.
3. **If `result.passed === false`**: append a `Finding` with persona ID, invariant ID, observed, expected.
4. **If a Persona's harness context construction THROWS**: skip all invariants for that persona; log a critical error in findings (special invariant ID `harness/persona-construction-failed`).

## Sandbox extraction (matches existing pattern)

Personas need to call functions defined inside the HTML files. The harness uses the same `extractFn(name)` + `new Function(...)` pattern as existing `tests/unit/strategies.test.js`, `tests/unit/wCashSumRegression.test.js`.

To extract from RR (`FIRE-Dashboard.html`) AND Generic (`FIRE-Dashboard-Generic.html`), the harness loads each HTML once and selects the appropriate sandbox per persona's `dashboard` field.

Stub functions injected into the sandbox (DOM-free / window-free):
- `getMortgageInputs()` returns persona's `inp.mtgXxx` fields shaped into the `mtg` object.
- `getSecondHomeInputs()` similar for Home #2.
- `getTotalCollegeCostForYear()` — returns 0 unless persona specifies college years.
- `getHealthcareDeltaAnnual()` — returns 0 unless persona specifies delta.
- `getActiveChartStrategyOptions()` / `getActiveMortgageStrategyOptions()` — return `undefined` for default strategy.
- `resolveAccumulationOptions(...)` — synthesized in-sandbox to return persona-driven options bundle.
- `accumulateToFire` — loaded via `require('../../calc/accumulateToFire.js')`.

## Persona ID conventions

```
RR-baseline                          # Roger & Rebecca's actual scenario (from audit dump)
RR-spend-frugal                      # baseline with annualSpend = $50k
Generic-couple-japan                 # Generic + adultCount=2 + selectedScenario=japan
Generic-single-fresh                 # Generic + adultCount=1 + person2Stocks=0
Generic-single-stale                 # Generic + adultCount=1 + person2Stocks=$50k (regression for INV-09)
Generic-mortgage-already-own         # baseline minus mortgage state change
... etc
```

Each ID is a stable string. Used for traceability across runs.

## Filtering (env vars for debugging)

The harness honors:
- `PERSONA=<id>` — only run cells for that persona.
- `INVARIANT=<id>` — only run that invariant family across all personas.
- `FAMILY=<family>` — only run invariants in that family.

Without filters: full matrix.

## Output

In addition to `node:test` TAP output, the harness writes:

- `specs/020-validation-audit/audit-report.json` — structured findings (regenerated each run).
- `specs/020-validation-audit/audit-report.md` — markdown table (regenerated each run).
- Console summary: `<total> cells, <passed> passed, <failed> failed (P0=N CRITICAL, P1=N HIGH, P2=N MEDIUM, P3=N LOW). Duration <X>s.`

## Performance budget

SC-001: ≤200 cells × 5 invariant families = ≤1,000 cell-checks total. Target completion: under 5 minutes.

If a single cell takes > 5 seconds, the harness logs a slow-cell warning. Persona contexts are cached per persona so 5 invariant families share the simulator output rather than re-computing.

## Adding new invariants

Each invariant is a self-contained object:

```js
const myInvariant = {
  id: 'C4',
  family: 'cross-chart-consistency',
  description: 'Withdrawal Strategy chart wCash sum matches Lifecycle chart pCash drain',
  severity: 'HIGH',
  check(persona, ctx) {
    const lifecycleCashSum = ctx.chart.reduce((s, r) => s + (r.pCashDrain || 0), 0);
    const withdrawalCashSum = ctx.withdrawalStrategy.reduce((s, r) => s + r.wCash, 0);
    if (Math.abs(lifecycleCashSum - withdrawalCashSum) > 1) {
      return {
        passed: false,
        observed: { lifecycleCashSum, withdrawalCashSum },
        expected: 'within $1',
        notes: 'Lifecycle and Withdrawal Strategy charts disagree on cash drain',
      };
    }
    return { passed: true };
  },
};

invariants.push(myInvariant);
```

The harness picks up the new invariant on the next run.

## Testing the harness itself

`tests/unit/validation-audit/harness.test.js` (meta-test):

- Construct a known-good persona + a known-failing invariant; verify the harness reports a finding.
- Construct a known-bad persona (harness context construction throws); verify the harness records the special `persona-construction-failed` finding rather than crashing.
- Run with `PERSONA=` filter; verify only that persona is checked.
- ≥4 meta-test cases.
