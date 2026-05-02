# Contract — Audit Invariant: `accumulationSpendConsistency`

**File**: NEW `tests/unit/validation-audit/accumulation-spend-consistency.test.js`
**Feature**: 023-accumulation-spend-separation
**Severity**: HIGH (drift indicates Constitution VI violation — chart↔module contracts)

---

## Purpose

Lock the bug-fix invariant: across all 92 audit personas × 3 modes × 6 callers of `accumulateToFire`, the year-0 accumulation row's `annualSpending` field MUST be identical (within ±$0.01).

Pre-feature-023 baseline: cellpack would report 6/6 disagreement on every persona because caller #6 (cashflow-warning-pill) used `{}` empty options while the others used `resolveAccumulationOptions`. Post-fix: 0/0 disagreement on every persona.

## Cell count

`92 personas × 3 modes (Safe / Exact / DWZ) × 6 callers × 2 invariant assertions = 3,312 cells`

The 2 assertions per cell:

1. **AS-1 (HIGH)**: `caller_i.annualSpending === caller_j.annualSpending` for all (i, j) pairs.
2. **AS-2 (MEDIUM)**: `caller_i.spendSource === 'options.accumulationSpend'` for all callers (i.e., none should be on the fallback chain).

## Invariant body (pseudocode)

```javascript
suite('AS — accumulationSpendConsistency', () => {
  for (const persona of PERSONAS) {
    for (const mode of ['safe', 'exact', 'dieWithZero']) {
      test(`${persona.id}/${mode}`, () => {
        const inp = persona.inp;
        const fireAge = persona.fireAge;
        const accumSpend = getAccumulationSpend_harnessImpl(inp);

        const callerOutputs = {};
        for (const callerId of CALLER_IDS) {
          // CALLER_IDS = ['signedLifecycleEndBalance', 'projectFullLifecycle',
          //              '_simulateStrategyLifetime', 'computeWithdrawalStrategy',
          //              'findEarliestFeasibleAge', 'cashflowWarningPill']
          const opts = buildOptsForCaller(callerId, inp, fireAge, accumSpend);
          const result = invokeCaller(callerId, inp, fireAge, opts);
          callerOutputs[callerId] = result.perYearRows[0];
        }

        // AS-1: all 6 caller outputs agree on annualSpending
        const spends = Object.values(callerOutputs).map(r => r.annualSpending);
        const uniqueSpends = [...new Set(spends.map(s => Math.round(s * 100)))];
        assert.equal(uniqueSpends.length, 1,
          `[AS-1] HIGH ${persona.id}/${mode}: 6 callers disagree on annualSpending: ${JSON.stringify(spends)}`);

        // AS-2: every caller used the preferred (options.accumulationSpend) path
        for (const [callerId, row] of Object.entries(callerOutputs)) {
          assert.equal(row.spendSource, 'options.accumulationSpend',
            `[AS-2] MEDIUM ${persona.id}/${mode}/${callerId}: spendSource=${row.spendSource} (expected 'options.accumulationSpend')`);
        }
      });
    }
  }
});
```

## Per-caller setup (`buildOptsForCaller`)

| Caller ID | Setup |
|---|---|
| `signedLifecycleEndBalance` | Resolve mortgageStrategy from persona; call `resolveAccumulationOptions(inp, fireAge, mortgageStrategy)` + override `.accumulationSpend = accumSpend`. Mirrors RR line 8898-8904. |
| `projectFullLifecycle` | Same as above, mirrors RR line 10076-10079. |
| `_simulateStrategyLifetime` | Use the v022 quantize block: `_qInpForAccum` shadow object with `_qFireAge = Math.floor(fireAge * 12) / 12`. Mirrors RR line 11371-11375. |
| `computeWithdrawalStrategy` | Same options builder as #1, mirrors RR line 11861-11865. |
| `findEarliestFeasibleAge` | Same options builder, mirrors RR line 12611-12615. |
| `cashflowWarningPill` | **Post-fix**: same options builder. **Pre-fix would use `{}`** → invariant catches this. Mirrors RR line 15338. |

## Failure modes

| Failure | Severity | Diagnostic |
|---|---|---|
| 1 caller out of 6 reports `annualSpending = 0` | HIGH (AS-1) | One caller bypassed `resolveAccumulationOptions`; identify by `callerId` in error message. |
| 2+ callers report different non-zero values | HIGH (AS-1) | Inconsistent `accumulationSpend` resolution; check whether some caller is using a stale `inp.annualSpend` clone. |
| Some caller reports `spendSource = 'inp.annualSpend'` | MEDIUM (AS-2) | Fallback path triggered; means the new options field wasn't passed. Verify `resolveAccumulationOptions` extension landed. |
| Some caller reports `spendSource = 'MISSING'` | HIGH (AS-2 escalates to HIGH) | Final fallback hit; data corruption or harness misconfig. |

## Severity rationale

- **HIGH** because lockstep violation across 6 callers is exactly the bug class that produced the latent $0-spending fault. Same severity as Constitution VI violations.
- **MEDIUM** for AS-2 (fallback-path detection) because the system still produces *consistent* output if all callers fall through to the same fallback, just not the *correct* output.

## Cross-feature dependencies

- Persona schema (data-model.md Entity 4) gains optional `inp.accumulationSpend`. When absent, the harness derives via `inp.monthlySpend × 12` or $120k default per FR-015.
- Audit harness `boundFactory` extension: must build `_accumOpts` per persona including the new field. Without this, AS-2 fails universally on the harness side.
- Existing `cash-flow-conservation.test.js` (feature 020) passes after this fix lands because its conservation invariant uses `annualSpending` from the row — which is now sourced from the consistent value.

## CI gate

This invariant runs on every commit to feature/023-* branches and on every PR to main. Severity HIGH cells block merge. The audit-harness CI workflow from feature 021 picks up this new invariant family automatically (no workflow change needed).
