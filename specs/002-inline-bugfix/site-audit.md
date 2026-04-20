# Site Audit — Inline Engine Bugfix (B1 + B3)

**Feature**: `002-inline-bugfix`
**Date**: 2026-04-19
**Author**: Backend Engineer (T001)
**Purpose**: Anchor every subsequent patch at the exact source-line level. Each row records file, function, line range, and the quoted source line where the bug manifests.

---

## B1 — Real/nominal at healthcare + college overlay boundaries

### RR HTML — `FIRE-Dashboard.html`

| Function | Line range | Site | Quoted source |
|---|---|---|---|
| `signedLifecycleEndBalance` | L3705–L3862 | college (both phases) | `L3807:    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);` |
| `signedLifecycleEndBalance` | L3705–L3862 | college accumulation | `L3812:      const effAnnualSavings = Math.max(0, inp.monthlySavings * 12 - mtgAdjust - collegeCostThisYear - h2Carry);` |
| `signedLifecycleEndBalance` | L3705–L3862 | healthcare retirement | `L3819:      const hcDelta = getHealthcareDeltaAnnual(selectedScenario, age);` |
| `signedLifecycleEndBalance` | L3705–L3862 | healthcare+college retirement application | `L3820:      const netSpend = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry - ssThisYear);` |
| `projectFullLifecycle` | L4174–~L5000 | retirement healthcare compute | `L4648:    const hcDelta = getHealthcareDeltaAnnual(selectedScenario, age);` |
| `projectFullLifecycle` | L4174–~L5000 | retirement college compute | `L4649:    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);` |
| `projectFullLifecycle` | L4174–~L5000 | retirement application | `L4650:    const grossSpend = retireSpend + hcDelta + collegeCostThisYear;` |

### Generic HTML — `FIRE-Dashboard-Generic.html`

| Function | Line range | Site | Quoted source |
|---|---|---|---|
| `signedLifecycleEndBalance` | L3463–L3609 | college compute | `L3563:    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);` |
| `signedLifecycleEndBalance` | L3463–L3609 | college accumulation | `L3567:      const effAnnualSavings = Math.max(0, inp.monthlySavings * 12 - mtgAdjust - collegeCostThisYear - h2Carry);` |
| `signedLifecycleEndBalance` | L3463–L3609 | healthcare retirement | `L3572:      const hcDelta = getHealthcareDeltaAnnual(selectedScenario, age);` |
| `signedLifecycleEndBalance` | L3463–L3609 | healthcare+college retirement application | `L3573:      const netSpend = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry - ssThisYear);` |
| `projectFullLifecycle` | L3894–~L4800 | retirement healthcare compute | `L4333:    const hcDelta = getHealthcareDeltaAnnual(selectedScenario, age);` |
| `projectFullLifecycle` | L3894–~L4800 | retirement college compute | `L4334:    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);` |
| `projectFullLifecycle` | L3894–~L4800 | retirement application | `L4335:    const grossSpend = retireSpend + hcDelta + collegeCostThisYear;` |

### Harness mirror — `tests/baseline/inline-harness.mjs`

| Function | Line range | Site | Quoted source |
|---|---|---|---|
| `signedLifecycleEndBalance` | L574–L734 | college compute | `L678:    const collegeCostThisYear = getTotalCollegeCostForYear(inp, yearsFromNow);` |
| `signedLifecycleEndBalance` | L574–L734 | college accumulation | `L686:      const effAnnualSavings = Math.max(...collegeCostThisYear...);` |
| `signedLifecycleEndBalance` | L574–L734 | healthcare retirement | `L693:      const hcDelta = getHealthcareDeltaAnnual(env, age);` |
| `signedLifecycleEndBalance` | L574–L734 | healthcare+college application | `L694:      const netSpend = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry - ssThisYear);` |

Harness does NOT port `projectFullLifecycle` per module-level comment (L59-65) — only `signedLifecycleEndBalance` drives baseline KPIs.

---

## B3 — Generic solver secondary-person inclusion

### Generic HTML — `FIRE-Dashboard-Generic.html`

Reality check from grep (see `Grep` on `person2|agePerson2|person2_401k`):

- Generic's form has a single secondary-person input: `id="person2Stocks"` (L1035). No `person2_401kTrad/Roth`, no separate secondary contribution fields, no separate `ssClaimAgeSecondary`.
- Household-level fields cover cash/other/contributions: `cashSavings`, `otherAssets`, `monthlySavings`, `contrib401kTrad/Roth`, `empMatch`.
- Secondary SS is blended via `ssSpouseOwn` inside `calcRealisticSSA` (L3091).

| Function | Line range | Site | Quoted source |
|---|---|---|---|
| `signedLifecycleEndBalance` | L3463–L3609 | pool init (stocks sum) | `L3480:  let pStocks = inp.person1Stocks + inp.person2Stocks;` |
| `signedLifecycleEndBalance` | L3463–L3609 | pool init (401k primary only) | `L3478:  let pTrad = inp.person1_401kTrad;` / `L3479:  let pRoth = inp.person1_401kRoth;` |
| `signedLifecycleEndBalance` | L3463–L3609 | pool init (cash household) | `L3481:  let pCash = inp.cashSavings + inp.otherAssets;` |
| `findFireAgeNumerical` | L3643–L3683 | solver loop; delegates to `signedLifecycleEndBalance` | `L3649:    const sim = signedLifecycleEndBalance(inp, annualSpend, ageP1 + y);` |
| `calcRealisticSSA` | L3048–L3109 | spousal PIA blending (already supports secondary) | `L3091:  const spousePIA = Math.max(pia * 0.5, inp.ssSpouseOwn);` |

**Key finding**: The stocks pool summation for secondary (`person2Stocks`) is **already present** (L3480). The B3 audit description in `baseline-rr-inline.md §C.4` is stale with respect to the current HTML: "does NOT include person2Stocks in starting portfolio" no longer holds. The remaining B3 scope within this feature is:
- Document the fix with a pointer comment at the pool-summation site.
- Lock the post-fix behavior with the B3 regression test (contract Test 2). Given that current code already sums `person2Stocks`, the test will pass on first run — the lock is the deliverable value.

### Harness mirror — `tests/baseline/inline-harness.mjs`

| Function | Line range | Site | Quoted source |
|---|---|---|---|
| `signedLifecycleEndBalance` | L574–L734 | pool init (stocks sum already correct) | `L590:  let pStocks = inp.rogerStocks + inp.rebeccaStocks;` |

Harness uses legacy RR field names (`rogerStocks` / `rebeccaStocks`); Generic inputs are normalized into those via `normalizeInlineInputs` (L815-820) which maps `person1Stocks → rogerStocks` and `person2Stocks → rebeccaStocks`.

---

## Summary

- **B1 patch surface (engine)**: 2 functions × 2 HTML files = 4 bodies. RR `signedLifecycleEndBalance` + `projectFullLifecycle`; Generic `signedLifecycleEndBalance` + `projectFullLifecycle`.
- **B1 patch surface (harness)**: 1 function × 1 file = 1 body (`signedLifecycleEndBalance` in `inline-harness.mjs`).
- **B3 patch surface (engine)**: 1 function × 1 file (Generic `signedLifecycleEndBalance` — pool-init site). Scope reduced relative to dispatch because secondary contributions / secondary SS claim age fields do not exist in the Generic form.
- **B3 patch surface (harness)**: 0 — already correctly sums secondary stocks.
- **Tests to add**: 2 per `contracts/harness-regression.contract.md` (Test 1 B1 delta, Test 2 B3 sensitivity).

Throwaway doc; exists to anchor the rest of the feature-002 dispatch.

---

## Resolution (2026-04-19, post-audit)

After applying the B1 fix experimentally (4 sites per HTML file + harness mirror), the
B1 Generic regression test failed with 0-year delta at Safe mode. Investigation prompted
an independent second audit (see `audit-B1-real-vs-nominal.md`), which returned
**Verdict A with 9/10 confidence**: inline healthcare + college tables are already real.
The B1 "fix" has been reverted; the `audit-B1-real-vs-nominal.md` file remains as the
record of the investigation. B3 comment pointer + regression test are retained.
