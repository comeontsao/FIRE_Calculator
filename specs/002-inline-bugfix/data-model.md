# Data Model — Inline Engine Bugfix (B1 + B3)

**Feature**: `002-inline-bugfix`
**Date**: 2026-04-19

This feature introduces **no new entities**. It patches the math that
consumes existing inline-engine inputs and produces existing outputs. This
doc records exactly which existing fields are affected, so the implementer
and the reviewer know what behavior changes and what stays byte-identical.

---

## Inputs affected (read-only changes)

### B1 (real/nominal) — reads unchanged, just interpreted differently

The inline engine already reads these fields; the fix changes how they enter
the projection formula:

| Field (inline shape) | Unit today | Unit after fix (at use site) | Where read |
|---|---|---|---|
| `inp.scenario.healthcareDeltaMonthly` (or equivalent country-override) | nominal dollars | converted to real inside `projectFullLifecycle` | healthcare-delta application in retirement phase |
| `inp.collegeKid1Cost`, `inp.collegeKid2Cost` (and any per-year overlays) | nominal dollars | converted to real inside `projectFullLifecycle` | college-cost application in accumulation AND retirement years |
| `inp.inflationRate` | decimal (e.g., 0.03) | unchanged | the divisor in the conversion formula |
| `yearIndex` (loop variable) | integer years from start | unchanged | exponent in `(1 + inflationRate)^yearIndex` |

**Invariant**: field names, types, and input-time values are unchanged.

### B3 (Generic secondary person) — previously ignored fields now consumed

Generic's solver currently ignores these fields. After the fix, each is
consumed at the layer below:

| Field (inline shape, Generic) | Currently read by solver? | After fix |
|---|---|---|
| `inp.portfolioSecondary.trad401kReal` | No | Summed into accumulation pool base + retirement withdrawal pool |
| `inp.portfolioSecondary.rothIraReal` | No | Same |
| `inp.portfolioSecondary.taxableStocksReal` | No | Same |
| `inp.portfolioSecondary.cashReal` | No | Same |
| `inp.portfolioSecondary.annualContributionReal` | No | Added to annual contribution total during accumulation years |
| `inp.ssStartAgeSecondary` | No | Secondary SS benefit activates at this age in retirement |
| Secondary SS benefit computation (derived from Generic's existing SS logic applied to secondary's SS-related inputs) | No | Computed per year, added to retirement-phase income |

**Invariant for single-person mode**: when every secondary field is zero or
undefined (user has no secondary person), each summation above contributes 0
and the per-year output is byte-identical to today.

---

## Outputs affected

### FireSolverResult-equivalent (inline shape)

The inline solver returns `{years, months, endBalance, sim, feasible}` (or
equivalent; exact shape varies slightly between RR and Generic). Fields
affected:

| Output field | B1 impact | B3 impact |
|---|---|---|
| `years` / `yearsToFire` | decreases by 0.5–1.5 years on canonical inputs | decreases further when secondary contributes portfolio / contributions / SS |
| `months` | tracks `years` | tracks `years` |
| `endBalance` | changes on inputs that exercise healthcare or college overlays; byte-identical on inputs with none | changes on Generic two-person inputs; byte-identical on single-person |
| `sim` (per-year lifecycle array) | per-year `adjustedSpend` reflects real-dollar overlays | per-year pool balances + contributions + SS income include secondary |
| `feasible` | unchanged meaning; may flip from true→false or false→true in edge cases where the fix makes the math honest | same |

### Baseline oracle values (to be updated in lockstep)

`tests/baseline/inline-harness.mjs` exposes `EXPECTED_RR` and `EXPECTED_GENERIC`
constants currently pinned to pre-fix observed values. Both sets must be
re-pinned to post-fix observed values as part of this feature's commit(s).

| Constant | Pre-fix (locked today) | Post-fix (locked in this feature) |
|---|---|---|
| `EXPECTED_RR.fireAge` (Safe) | 54 | ~52.5–53.5 (actual value captured during implementation) |
| `EXPECTED_RR.endBalanceReal` | $618,741 | recaptured from harness post-fix |
| `EXPECTED_RR.balanceAtUnlockReal` | $704,027 | recaptured |
| `EXPECTED_RR.balanceAtSSReal` | $344,908 | recaptured |
| `EXPECTED_GENERIC.fireAge` (Safe) | 65 | ~63.5–64.5 (actual value captured during implementation) |
| `EXPECTED_GENERIC.endBalanceReal` | $164,650 | recaptured |
| `EXPECTED_GENERIC.balanceAtUnlockReal` | $520,394 | recaptured |
| `EXPECTED_GENERIC.balanceAtSSReal` | $389,735 | recaptured |

---

## New test-only structures

### `tests/baseline/inline-harness.test.js` — two new named tests

Not entities; just test specs. See `contracts/harness-regression.contract.md`
for detail.

1. **`B1 real/nominal fix: canonical RR fireAge drops 0.5–1.5 years`** — runs
   the harness with the locked post-fix values; compares computed delta
   against the pre-fix locked value recorded inline in the test as a named
   constant.
2. **`B3 secondary-person sensitivity: doubling secondary portfolio changes yearsToFire by ≥ 1 year`** —
   runs the Generic harness twice with two versions of the canonical Generic
   input set (secondary $0 vs $300 k), asserts the resulting `yearsToFire`
   values differ by at least 1 year.

Both tests are pure Node, no DOM.

---

## Relationships (sketch)

```text
FIRE-Dashboard.html / FIRE-Dashboard-Generic.html   <--- patches apply here
    │
    ▼
inline engine (projectFullLifecycle, findFireAgeNumerical, ...)
    │
    ├── healthcareDeltaReal  [NEW: converted inline from healthcareDeltaNominal]
    ├── collegeCostReal      [NEW: converted inline from collegeCostNominal]
    ├── pool sums            [CHANGED in Generic: primary + secondary]
    ├── annual contributions [CHANGED in Generic: primary + secondary]
    └── SS income            [CHANGED in Generic: primary + secondary separately]
         │
         ▼
     {years, months, endBalance, sim, feasible}

tests/baseline/inline-harness.mjs   <--- mirror changes here
    │
    ▼
EXPECTED_RR, EXPECTED_GENERIC   <--- re-pinned to post-fix values

tests/baseline/inline-harness.test.js
    ├── existing locks           [auto-pass after EXPECTED_* update]
    ├── B1 regression test       [NEW]
    └── B3 sensitivity test      [NEW]
```

---

## Validation summary

- **No new input fields.** All reads are from existing `inp` shape.
- **No new output fields.** All writes are to existing solver-result shape.
- **Single-person and no-overlay inputs remain byte-identical** (FR-003, FR-006).
- **Harness and engine stay in lockstep** — same commit, same math.
- **No changes to the canonical `calc/*.js` modules.** Feature 004 is the
  path that integrates them; this feature works exclusively in the inline
  layer.
