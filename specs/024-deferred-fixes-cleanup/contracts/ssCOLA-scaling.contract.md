# Contract — SS COLA Scaling Formula (B-023-5)

**Site**: `getSSAnnual` + retirement-loop callers in both HTMLs.
**Feature**: 024-deferred-fixes-cleanup
**FRs**: FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016

---

## Purpose

Allow users to model SS payments where COLA differs from general inflation. Pre-024 the dashboard implicitly assumed `ssCOLA == inflationRate` (real-$ SS holds purchasing power). Post-024, users can dial a separate `ssCOLARate` that may lag (typical case ~2.5% vs 3.0% inflation) or lead inflation.

## Formula

```
ssAtAge(age) = basePIA × claimAgeAdjustment × max(0, (1 + ssCOLA - inflation)^(age - claimAge))
```

Where:
- `basePIA` = the user's Primary Insurance Amount at FRA (age 67), pre-COLA, real-$ today
- `claimAgeAdjustment` = `0.70` if claimAge=62, `0.867` if claimAge=65, `1.00` if claimAge=67, `1.24` if claimAge=70 (Roger); `0.65 / 0.833 / 1.00 / 1.00` for spouse
- `ssCOLA` = `inp.ssCOLARate` (decimal; default = `inp.inflationRate`)
- `inflation` = `inp.inflationRate` (decimal)
- `age` = current retirement-loop iteration's age
- `claimAge` = `inp.ssClaimAge`

The `max(0, ...)` guard handles the edge case `ssCOLA - inflation < -1` (impossible at slider's 0%-5% range, but defensive).

## Invariants

1. **Backward-compat**: when `ssCOLA == inflation`, the formula reduces to `basePIA × claimAgeAdjustment` (constant), matching pre-024 behavior byte-identical.
2. **Frame**: output is real-$ (today's purchasing power). Display layer converts to Book Value separately via `displayConverter.toBookValue`.
3. **Pre-claim years**: when `age < claimAge`, callers SHOULD return 0 (SS not yet active). The formula doesn't compute negative-exponent powers because callers gate on `age >= claimAge`.
4. **Post-mortality**: `endAge` is the planning horizon. Formula extends through `endAge` if user lives that long; doesn't model mortality.

## Caller update specification

Each of the 6 retirement-loop call sites currently does:

```js
const ssAnnual = getSSAnnual(inp, inp.ssClaimAge, fireAge);
// ... later in the loop ...
const ssThisYear = (age >= inp.ssClaimAge) ? ssAnnual : 0;
```

Post-024:

```js
const ssAnnualBase = getSSAnnual(inp, inp.ssClaimAge, fireAge);  // base PIA × claimAgeAdj
// ... later in the loop ...
const ssThisYear = (age >= inp.ssClaimAge)
  ? ssAnnualBase * Math.pow(1 + (inp.ssCOLARate ?? inp.inflationRate) - inp.inflationRate, age - inp.ssClaimAge)
  : 0;
```

The `?? inp.inflationRate` fallback handles pre-024 saved states + test fixtures.

## Default + fallback chain

1. Read `inp.ssCOLARate` from `getInputs()` (DOM slider value).
2. If absent (no DOM slider OR test fixture without field): fall back to `inp.inflationRate`.
3. If `inp.inflationRate` also absent: fall back to `0.03` (existing project-wide default).

## UI specification

**Slider location**: Investment tab, near `inflationRate` slider (within the same INVESTMENT & SAVINGS card).

**Label**: "SS COLA Rate" / "社安福利調整率" (= COLA = Cost-of-Living Adjustment)

**Range/step**: 0% – 5%, step 0.5%

**Default**: synced to `inflationRate` slider's current value on initial load.

**Live label**: shows current value (e.g., "2.5%") to right of slider.

**Tooltip / help text**: "Annual cost-of-living adjustment for Social Security. Historical SSA average ~2.5%/yr. When set lower than inflation, real-$ SS shrinks across retirement." (EN); "社會安全福利的年度生活成本調整率。SSA 歷史平均約 2.5%/年。設定低於通膨率時，社安福利的實質購買力會逐年下降。" (zh-TW)

## Test contract

`tests/unit/ssCOLA.test.js` (NEW, ≥5 cases):

| # | Inputs | Expected behavior |
|---|---|---|
| 1 | ssCOLA = inflation = 0.03; age = 70; claimAge = 70 | ssAtAge = basePIA × claimAgeAdj × 1.0 (factor = 1) |
| 2 | ssCOLA = 0.025; inflation = 0.03; age = 75; claimAge = 70 | factor = 0.995^5 ≈ 0.9752 (slight shrinkage) |
| 3 | ssCOLA = 0.0; inflation = 0.03; age = 90; claimAge = 70 | factor = 0.97^20 ≈ 0.5438 (45% shrinkage over 20 years) |
| 4 | ssCOLA = 0.04; inflation = 0.03; age = 80; claimAge = 70 | factor = 1.01^10 ≈ 1.1046 (10% growth, anti-historical but supported) |
| 5 | ssCOLA absent (test fixture); inflation = 0.03 | falls back to factor = 1.0 (matches pre-024 behavior) |

## Persistence contract

`localStorage` key: `ssCOLARate` (string-serialized decimal)

**Read**: `getInputs()` calls `parseFloat(document.getElementById('ssCOLARate').value) / 100` with NaN fallback to `inp.inflationRate`.

**Write**: existing `saveState()` already iterates input IDs; new ID gets persisted automatically.

**Migration**: pre-024 saved states have no `ssCOLARate` key. On load, `getInputs()` falls back to `inflationRate`. User can opt in by adjusting the slider (which writes the key).

## Audit dump

Top-level field added to `copyDebugInfo()` JSON:

```json
{
  ...,
  "ssCOLARate": 0.025,
  "ssCOLA_source": "explicit",  // or "fallback:inflationRate" when default
  ...
}
```

This makes future debug investigations of SS-related issues directly traceable.
