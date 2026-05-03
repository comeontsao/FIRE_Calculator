# Feature 024 — Data Model

**Feature**: Deferred Fixes Cleanup
**Branch**: `024-deferred-fixes-cleanup`
**Date**: 2026-05-02
**Phase**: 1 (Design & Contracts)

This feature is largely cleanup/polish; data-model deltas are minimal and additive.

---

## Entity 1 — `ssCOLARate` (NEW input)

**Source**: `inp` object built by `getInputs()` in both HTMLs.

**Schema**:

| Field | Type | Range | Default | Persistence |
|---|---|---|---:|---|
| `inp.ssCOLARate` | `number` | 0.0–0.05 (= 0% to 5%) | `inp.inflationRate` (preserves current behavior) | localStorage key `ssCOLARate` |

**Validation rules**:

1. MUST be `>= 0` (negative COLA modeled by setting to 0; we don't allow active SS payment shrinkage).
2. MUST be `<= 0.05` (slider range cap).
3. When absent in `inp` (pre-024 saved state OR test fixture without the field), defaults to `inp.inflationRate`. This ensures byte-identical behavior for existing callers.

**State transitions**: None. It's a static input read once per `recalcAll()` and threaded through retirement-loop sites.

**Frame**: `pure-data` (a rate, not a $ value).

---

## Entity 2 — SS payment scaling formula (UPDATED)

**Site**: `getSSAnnual` (or its retirement-loop callers — TBD per R5 implementation).

**Pre-024 behavior**: `getSSAnnual` returns a constant scalar = base PIA × claim-age adjustment. Held constant across all retirement years.

**Post-024 behavior**: `getSSAnnual` returns a function (or accepts an `age` parameter) that scales the constant by `(1 + inp.ssCOLARate - inp.inflationRate)^(age - inp.ssClaimAge)`.

**Formula**:

```
ssAtAge = basePIA × claimAgeAdjustment × (1 + ssCOLA - inflation)^(age - claimAge)
```

Where:
- When `ssCOLA == inflation` (default): scaling factor = 1, real-$ SS constant (matches pre-024 behavior).
- When `ssCOLA < inflation`: scaling factor < 1, real-$ SS shrinks each year.
- When `ssCOLA > inflation`: scaling factor > 1, real-$ SS grows (rare, but supported).

**Frame**: `real-$` output (today's purchasing power per Constitution VI). Display layer converts to Book Value separately.

**Caller update sites** (~6 retirement-loop iterations across both HTMLs):
1. `projectFullLifecycle` retirement-loop (chart)
2. `_simulateStrategyLifetime` retirement-loop (strategy ranker)
3. `simulateRetirementOnlySigned` (signed sim)
4. `computeWithdrawalStrategy` retirement-loop (Withdrawal Strategy panel)
5. `simulateDrawdown` (Drawdown chart wrapper around projectFullLifecycle)
6. `_legacySimulateDrawdown` (kept-for-reference legacy fn)

For each site: replace single-value `ssAnnual` with per-year `ssAtAge(age)` call.

---

## Entity 3 — `endBalance-mismatch` warning schema (extended)

**Source**: `calc/calcAudit.js` `assembleAuditSnapshot` cross-validation block.

**Pre-024 schema**:

```js
{
  kind: 'endBalance-mismatch',
  valueA: 727502,        // signed-sim end balance
  valueB: 2034782,       // chart-sim end balance
  delta: 1307279,        // |valueA - valueB|
  deltaPct: 64.2,        // |delta| / valueB × 100
  expected: false,        // OLD: hardcoded false (set by manual triage)
  reason: 'signed-sim end balance differs from chart-sim end balance.',
  dualBarSeries: { ... },
}
```

**Post-024 schema** — `expected` field gains automatic computation:

```js
{
  ...,
  expected: |delta| / |valueB| < 0.01,  // NEW: auto-true when divergence < 1%
}
```

**Behavior change**:
- Pre-024: 'expected' was `false` for every endBalance-mismatch warning (audit-style noisy)
- Post-024: 'expected' auto-flips to `true` when delta/valueB < 1%, marking the divergence as design-driven (spending-floor numerical noise)

**Display**: existing `audit-crossval-row--expected` CSS class de-emphasizes annotated rows.

---

## Entity 4 — Healthcare card display schema (UPDATED)

**Site**: `renderHealthcareCard` in both HTMLs.

**Pre-024**: card shows `pre65Cost` and `post65Cost` in raw real-$ (e.g., $14,400/yr for US pre-65).

**Post-024**: card shows the same values converted to Book Value at the relevant phase midpoint:
- Pre-65 BV at age `(currentAge + 65) / 2`
- Post-65 BV at age `(65 + endAge) / 2`

**Schema** (per card):

```
{
  scenarioId: 'us',
  flag: '🇺🇸',
  pre65Cost_BV: <number>,    // Book Value at pre-65 midpoint age
  pre65MidAge: <number>,
  post65Cost_BV: <number>,   // Book Value at post-65 midpoint age
  post65MidAge: <number>,
}
```

**Frame**: `nominal-$` (Book Value). Frame suffix "(Book Value)" / "(帳面價值)" appended to header or value.

**Bilingual translation keys**:
- `healthcare.card.pre65BV` / `healthcare.card.post65BV` — labels with frame suffix
- (existing strings updated, not new keys, where possible)

---

## Backwards-compatibility matrix

| Artifact | Pre-024 | Post-024 | Migration |
|---|---|---|---|
| `inp` object | no `ssCOLARate` | optional `ssCOLARate` (default = `inp.inflationRate`) | Soft fallback at read time; no source-code migration needed for old callers. |
| localStorage state | no `ssCOLARate` key | optional key | Pre-024 saves load with default; user opting in writes the key. |
| `getSSAnnual` return | scalar | scalar (default behavior) OR scaled per age (when caller passes age) | Optional age parameter; old callers see byte-identical output. |
| `cross-validation warning.expected` | hardcoded `false` | auto-computed (`|delta|/|B| < 0.01`) | Existing tests pass because expected=true rows still appear in the warnings list. |
| Healthcare card | real-$ display | Book Value display | UI-only change; no schema change to inputs. |
| CSV snapshots | no change | no change | `ssCOLARate` not persisted to CSV (input only). |

---

## Frame summary

| Field | Frame | Site |
|---|---|---|
| `inp.ssCOLARate` | pure-data | `getInputs()` |
| `getSSAnnual(...) returned $` | real-$ | retirement-loop callers |
| `cross-val expected` flag | pure-data | audit assembler |
| Healthcare card displayed $ | nominal-$ Book Value | `renderHealthcareCard` |

All inputs computed in real-$ frame; display layer converts to Book Value where user-visible.
