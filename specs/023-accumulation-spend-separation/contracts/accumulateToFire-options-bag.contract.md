# Contract — `AccumulateToFireOptions` v3 → v5 schema delta

**Module**: `calc/accumulateToFire.js`
**Feature**: 023-accumulation-spend-separation
**Predecessor contract**: `specs/022-nominal-dollar-display/contracts/accumulateToFire-v3-frame-fix.contract.md` (frame fix); `specs/021-tax-category-and-audit-cleanup/contracts/accumulateToFire-v3.contract.md` (v3 progressive-bracket).

---

## Purpose

Extend the options bag with a single new field `accumulationSpend` (real-$, optional) and define the fallback-chain semantics when the field is absent. The change preserves byte-identical behavior for any caller that doesn't pass the new field.

## Schema delta (v3 → v5)

```typescript
// v3 schema (unchanged from feature 021):
type AccumulateToFireOptionsV3 = {
  mortgageStrategyOverride?: 'invest-keep-paying' | 'prepay-extra' | 'invest-lump-sum';
  mortgageEnabled?: boolean;
  mortgageInputs?: MortgageInputs | null;
  secondHomeEnabled?: boolean;
  secondHomeInputs?: SecondHomeInputs | null;
  rentMonthly?: number;
  pviExtraMonthly?: number;
  selectedScenario?: string;
  collegeFn?: (inp: object, yearsFromNow: number) => number;
  payoffVsInvestFn?: ((inp: object) => PvIOutputs) | null;
  framing?: 'liquidNetWorth' | 'totalAssets';
  mfjStatus?: 'mfj' | 'single';
};

// v5 schema (feature 023):
type AccumulateToFireOptionsV5 = AccumulateToFireOptionsV3 & {
  accumulationSpend?: number;  // NEW — real-$, today's purchasing power
};
```

(v4 was reserved for the cash-flow residual frame fix that landed inside feature 022's accumulateToFire-v3-frame-fix contract; v5 is the next semver bump for feature 023's options-bag extension.)

## Fallback chain (R4 decision)

When `accumulateToFire` resolves the spending baseline, it walks this chain in order:

```
1. options.accumulationSpend (preferred)
   ↓ (when undefined / null / non-numeric / negative)
2. inp.annualSpend (v3 backwards-compat — country-tier value if caller stuffed it on inp)
   ↓ (when undefined / null / non-numeric)
3. inp.monthlySpend × 12 (v1 backwards-compat — pre-feature-010 callers)
   ↓ (when undefined / null / non-numeric)
4. 0 (final fallback) + cashFlowWarning='MISSING_SPEND' on every accumulation row
```

The fallback is **soft** — `accumulateToFire` never throws when `accumulationSpend` is absent. This preserves test/harness backwards-compat and lets the bug fix ship without a coupled fixture migration.

## Per-row diagnostics

Every `perYearRows[i]` gets a new optional field:

```typescript
type PerYearAccumulationRowV5 = PerYearAccumulationRowV3 & {
  spendSource?: 'options.accumulationSpend' | 'inp.annualSpend' | 'inp.monthlySpend×12' | 'MISSING';
};
```

Audit dump consumers can group rows by `spendSource` to verify the fix is reaching every consumer. The `MISSING` value is a red flag — surface it loudly in `cashFlowWarning`.

## Frame contract

| Field | Frame | Notes |
|---|---|---|
| `options.accumulationSpend` | **real-$** | Today's purchasing power. Constant across years (FR-014 of feature 022 preserved). Caller is responsible for ensuring real-$ (helper does this via `getTotalMonthlyExpenses() × 12`). |
| `perYearRows[].annualSpending` | real-$ | Equals `options.accumulationSpend` when sourced from preferred tier. |
| `perYearRows[].spendSource` | pure-data | Diagnostic string; no $ value. |

## Behavior preservation guarantees

For any caller that does NOT set `options.accumulationSpend`:

1. The function's output is **byte-identical** to v3 if the caller's `inp` provides `inp.annualSpend` or `inp.monthlySpend`.
2. The function's output is **byte-identical** to v3 if neither `inp` field is set (both fall through to `annualSpending = 0`).
3. The new `spendSource` field is added to row outputs; consumers that ignore it are unaffected.

For callers that DO set `options.accumulationSpend`:

1. The function uses the new value, ignoring `inp.annualSpend` and `inp.monthlySpend`.
2. The new value is per FR-002a expected to be `>= $1,000` (with the helper's $120k floor catching any zero); the function does NOT enforce this floor — that's the helper's responsibility.

## Testing requirements (FR-014 + IV)

Every test in `tests/unit/accumulateToFire.test.js` MUST be reviewed:

- Tests that pass NO spending (existing cases): annotated with `// 023: spendSource=MISSING` to make the fallback explicit.
- Tests that pass `inp.annualSpend`: annotated with `// 023: spendSource=inp.annualSpend (backwards-compat path)`.
- New tests `v5-spend-*` exercise the preferred path:
  - `v5-spend-1`: explicit `options.accumulationSpend = $120,000` produces row.annualSpending = $120,000.
  - `v5-spend-2`: explicit + `inp.annualSpend` set → preferred wins (options is preferred).
  - `v5-spend-3`: explicit `0` is treated as valid → row.annualSpending = 0, NOT MISSING fallback.
  - `v5-spend-4`: explicit negative → coerced to 0 with warning.
  - `v5-spend-5`: missing options + missing `inp.annualSpend` + present `inp.monthlySpend` → uses `monthlySpend × 12`.
  - `v5-spend-6`: all missing → row.cashFlowWarning='MISSING_SPEND' AND row.annualSpending = 0.

## Conservation invariant (FR-010)

Post-feature-023, the v3 conservation invariant becomes:

```
grossIncome − federalTax − ficaTax − pretax401kEmployee − annualSpending − stockContribution === cashFlowToCash  (within ±$1)
```

where `annualSpending` is sourced per the fallback chain. This is identical in form to the v3 invariant; only the value resolution changes.

The audit-harness invariant `cash-flow-conservation.test.js` (feature 020) continues to enforce this. Phase 4 verifies the harness tests stay green when `_accumOpts.accumulationSpend` is added to the harness's options-bag construction.

## Versioning

- Module-header version block updated to `v5 — feature 023`.
- The `Inputs:` block adds: `options.accumulationSpend (number, optional, real-$)`.
- The `Outputs:` block adds: `perYearRows[].spendSource (string, optional)`.
- The `Consumers:` list is unchanged (same 6 callers, just thread the new field).
