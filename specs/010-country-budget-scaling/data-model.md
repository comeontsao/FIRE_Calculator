# Phase 1 Data Model: Country Budget Scaling

**Feature**: 010-country-budget-scaling
**Scope**: `FIRE-Dashboard-Generic.html` only (Principle I exception per FR-021 and inherited from feature 009).

## Entities

### 1. Adults-only scaling factor (derived, not stored)

Pure function of the existing `inp.adultCount`.

```
getAdultsOnlyFactor(adultCount: 1 | 2) -> number

  // adults-only OECD-modified equivalence
  adult_weight = 1.0 + 0.5 * max(0, adultCount - 1)
  couple_weight = 1.5
  return adult_weight / couple_weight
```

- `adultCount = 1` → factor = 0.667 (repeating; round at display time only)
- `adultCount = 2` → factor = 1.000 exactly (regression anchor, FR-002)

Inputs: `adultCount` (integer, 1 or 2, validated upstream by feature 009's counter clamp).
Outputs: a positive number in the range `[0.667, 1.000]`.
Consumers: `getScaledScenarioSpend` (this feature), the scaling-indicator renderer (this feature).
Storage: none — pure derivation at every recalc.

### 2. Per-country override map (new localStorage sub-field)

A sparse map keyed by scenario ID, storing user-entered Adjust Annual Spend values.

```
scenarioOverrides: {
  [scenarioId: string]: number // positive = override active; 0 or absent = no override
}
```

Examples:

```json
{ "us": 100000 }                  // user set US to $100,000/yr; all others auto-scale
{ "us": 100000, "taiwan": 30000 } // two countries overridden; rest auto-scale
{}                                // nothing overridden (default for fresh state)
```

Storage: nested under the existing `fire_dashboard_generic_state` localStorage key as a new sibling field, alongside `inp`, `childrenList`, etc.

```
localStorage[fire_dashboard_generic_state] = {
  inp: { ... existing fields ... },
  childrenList: [ ... existing per-kid entries ... ],
  scenarioOverrides: { ... new this feature ... }
}
```

Migration behaviour: if `scenarioOverrides` is absent on load (users on pre-010 state blobs), treat as `{}`. Additive only — no breaking change. Documented in `contracts/persistence.contract.md`.

Validation:
- Values must be numeric and ≥ 0.
- Value of 0 means "no override" and MUST be normalised (removed from the map) before save.
- Values are not clamped to a max — users are free to enter any household budget.
- No cross-scenario constraint (one country's override does not affect another).

### 3. Per-child allowance (derived per year, not stored)

Pure function of `childrenList`, the projection year, and the FIRE year.

```
calcPerChildAllowance(
  childrenList: Array<{ date: YYYY-MM-DD, college: string, collegeStartYear?: number }>,
  projectionYear: integer,
  fireYear: integer
) -> number

  if (projectionYear < fireYear) return 0           // pre-FIRE: Monthly Expense Breakdown handles
  total = 0
  for (child in childrenList):
    childAge = projectionYear - year(child.date)
    collegeStart = child.collegeStartYear ?? (year(child.date) + 18)
    if (projectionYear >= collegeStart) continue    // college window handled elsewhere
    total += allowanceForAge(childAge)
  return total

allowanceForAge(age: integer) -> number
  if age <= 12: return 2000
  if age == 13: return 2500
  if age == 14: return 3000
  if age == 15: return 4000
  if age == 16: return 5000
  if age >= 17: return 6000   // cap; 17 is the last pre-college year
```

Inputs: the full `childrenList` (no mutation), `projectionYear`, `fireYear`.
Outputs: non-negative integer — the total allowance across all pre-college kids for that year.
Consumers: Full Portfolio Lifecycle chart's spend-curve input. Any strategy-ranking helper that computes lifetime spend requirement.
Storage: none — pure derivation at every recalc, per year.

### 4. Annual spend requirement (derived per year, not stored)

The TOTAL input to the withdrawal strategy. Not a separate stored entity; defined by this composition at each post-FIRE year:

```
spendRequirement(s, year, inp, childrenList, overrides) -> number
  countryBudget = getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, overrides)
  allowance = calcPerChildAllowance(childrenList, year, inp.fireYear)
  collegeTuition = existingCollegeTuitionForYear(childrenList, year)    // unchanged from pre-010 code
  visaCost = s.visaCostAnnual ?? 0
  return countryBudget + allowance + collegeTuition + visaCost
```

Inputs: scenario, year, input bag, children list, overrides map.
Outputs: non-negative number — the amount of spending the strategy must fund in this year.
Consumers: all withdrawal strategies (DWZ, SAFE, bracket-fill, low-tax, future ones); Full Portfolio Lifecycle chart (which renders the strategy output, not the raw requirement).

## State transitions

### Adults counter (existing from feature 009)

`adultCount` toggles 1 ↔ 2 via the Adults counter UI. On change:

1. `getInputs()` picks up the new value.
2. `getAdultsOnlyFactor(adultCount)` re-derives (0.667 ↔ 1.000).
3. All scenario-spend read sites re-render via `recalcAll()`.
4. Scaling indicator updates (Line 1 always changes; Line 2 unchanged unless children list also changed).
5. Full Portfolio Lifecycle chart re-computes year-by-year spend requirement and dispatches to the active strategy.

### Per-country override set / cleared

On blur / `onchange` of an Adjust Annual Spend input:

1. If value > 0: set `scenarioOverrides[scenarioId] = value`. Mark the input's DOM node `data-user-edited="1"`.
2. If value == 0 or empty: delete `scenarioOverrides[scenarioId]`. Remove the `data-user-edited` flag.
3. Persist to localStorage (merged into `fire_dashboard_generic_state`).
4. `recalcAll()` — all downstream spend-reading renderers re-pull through the accessor.

### Children list edited (add/remove/change birthdate/change college plan)

Existing feature-009 event handlers already fire `recalcAll()`. On recalc:

1. `calcPerChildAllowance(...)` re-runs for every post-FIRE year in the Lifecycle chart's horizon.
2. Line 2 of the scaling indicator updates its `{childCount} children tracked` count.
3. If a child's birthdate change flips their post-FIRE pre-college status (e.g., newly old enough to be in college), the allowance for the affected years goes to 0 and college logic takes over.

## Relationships

```
scenarios[] ──┬─ readonly source of hardcoded baselines (unchanged)
              │
              ├─► getScaledScenarioSpend(s, tier, adultCount, overrides)
              │       ↑                               ↑
              │       │                               │
              │   getAdultsOnlyFactor(adultCount)   scenarioOverrides[s.id]
              │
              └─► country comparison cards, deep-dive panel, strategy compare card

childrenList[] ──► calcPerChildAllowance(childrenList, year, fireYear)
                       │
                       └─► Full Portfolio Lifecycle spend-curve input

inp.adultCount ──► getAdultsOnlyFactor ──► scaling indicator Line 1
inp.fireYear, childrenList ──► calcPerChildAllowance ──► scaling indicator Line 2 count

spendRequirement(s, year, inp, childrenList, overrides)
    │
    └─► withdrawal strategy (DWZ | SAFE | bracket-fill | low-tax | …)
            │
            └─► Full Portfolio Lifecycle chart (renders strategy output)
```

## Invariants

1. `scenarios[]` is never mutated by feature-010 code. All adjustments happen at read time via the accessor. Asserted by the `scenario-override.test.js` fixture that toggles Adults 1↔2↔1 and verifies `scenarios[0].annualSpend === 78000` throughout.
2. `getAdultsOnlyFactor(2) === 1.0` exactly (not `0.9999…` or `1.0001…`). Asserted by the regression-anchor fixture.
3. Lifestyle tier ratios `normalSpend / annualSpend` and `comfortableSpend / annualSpend` are identical at Adults=1 and Adults=2 for every country (because the factor multiplies all three tiers by the same amount). Asserted per SC-008.
4. The per-child allowance is 0 during pre-FIRE years (`projectionYear < fireYear`) for every child regardless of age. Asserted by a pre-FIRE fixture.
5. The per-child allowance for any single child is 0 during and after that child's college window. Asserted by a college-takeover fixture.
6. A per-country override (when non-zero) is returned by the accessor without being multiplied by the factor. Asserted by an override-precedence fixture at both Adults=1 and Adults=2.
7. Swapping withdrawal strategies at a fixed household composition leaves the spend requirement identical. Asserted by the strategy-vs-requirement fixture.

## Test fixtures (enumerated)

To be formalised in `tests/fixtures/country-budget-scaling.js`. Six classes:

| # | Fixture class | Purpose |
|---|---------------|---------|
| 1 | `adultsOnlyFactor` | Branch table: solo (0.667) and couple (1.000) with 3-decimal precision. Regression anchor. |
| 2 | `perChildAllowance` | Age-graded table for ages 0–17 + pre-FIRE zero-out + college-takeover transition + N-children summation. |
| 3 | `tierRatioPreservation` | Normal/Annual and Comfortable/Annual ratios identical at both Adults values for every country. |
| 4 | `scenarioOverride` | Override wins over factor; override normalises to removed on clear; `data-user-edited` round-trip. |
| 5 | `strategyVsRequirement` | Swap strategies at same composition → requirement curve identical. |
| 6 | `lockstepRegression` | Any Adults=2 state (with any child count) produces byte-for-byte identical country-card numbers before and after this feature lands. |
