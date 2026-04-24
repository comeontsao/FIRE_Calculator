# Contract: Per-Child Post-FIRE Allowance

**Feature**: 010-country-budget-scaling
**Owner**: Backend Engineer
**Purity**: Pure.

---

## `calcPerChildAllowance(childrenList, projectionYear, fireYear)`

Computes the total per-child allowance to add to the post-FIRE spend curve for a given projection year, summed across all children still in their pre-college window.

### Inputs

| Name | Type | Constraints |
|------|------|-------------|
| `childrenList` | `Array<{ date: 'YYYY-MM-DD', college: string, collegeStartYear?: number }>` | Reused from existing feature-009 children schema. Must not be mutated. |
| `projectionYear` | integer | Calendar year being projected (e.g., 2045). |
| `fireYear` | integer | Calendar year at which FIRE is reached. |

### Output

| Type | Range |
|------|-------|
| number (integer in practice) | 0 when pre-FIRE or no eligible children; otherwise ≥ 2000 × eligibleChildren, capped per child at 6000. |

### Algorithm

```
1. if projectionYear < fireYear:
     return 0                              // pre-FIRE: Monthly Expense Breakdown owns household spend

2. total = 0
3. for child in childrenList:
     childBirthYear = int(child.date.slice(0, 4))
     childAge = projectionYear - childBirthYear
     collegeStart = child.collegeStartYear ?? (childBirthYear + 18)
     if projectionYear >= collegeStart:
       continue                             // college window — allowance is 0, tuition logic takes over
     total += allowanceForAge(childAge)
4. return total
```

### `allowanceForAge(age)` — age-graded schedule

```
age ≤ 12          → 2000   (flat base)
age == 13         → 2500   (+500 raise 1)
age == 14         → 3000   (+500 raise 2)
age == 15         → 4000   (+1000)
age == 16         → 5000   (+1000)
age ≥ 17          → 6000   (cap)
```

Ages ≥ 17 return the \$6,000 cap; in practice the `projectionYear >= collegeStart` short-circuit filters out most ≥ 18 cases, but age 17 in its own right returns \$6,000. If a child is delayed in college-start to age 19 or 20, the cap continues to apply and prevents unbounded growth.

Negative ages (unborn children — `projectionYear < childBirthYear`) return `allowanceForAge(negative)` which falls under `age ≤ 12` and yields \$2,000. The intended semantics for unborn children are "no cost", so callers MUST filter these BEFORE invoking `allowanceForAge`, OR the pre-loop guard `if childAge < 0: continue` can be added. **Decision for this feature**: add the pre-loop guard — a child not yet born contributes 0 to the allowance.

### Pre/Post-conditions

- **Pre**: `fireYear` is an integer ≥ 1900. `childrenList` entries have a valid ISO `date`. `collegeStartYear`, if provided, is ≥ `childBirthYear + 10` (defensive; not enforced).
- **Post**: Return value is non-negative integer.
- **Invariant (pre-FIRE zero-out)**: `projectionYear < fireYear` always returns 0. Locked by fixture.
- **Invariant (college-takeover)**: for any child, if `projectionYear >= child.collegeStartYear`, that child contributes 0. Locked by fixture.
- **Invariant (cap)**: per-child contribution never exceeds 6000. Locked by fixture.
- **Invariant (unborn child)**: `childAge < 0 → 0 contribution`. Locked by fixture.

### Consumers (Principle VI)

- **Full Portfolio Lifecycle chart** — added to the spend-curve input at each post-FIRE year.
- **Strategy Compare card** — when it computes per-strategy lifetime spend requirements.
- **Scaling indicator Line 2** — reads `childrenList.length` (not the allowance value itself) to show the tracked-children count.

Each consumer site MUST carry a comment naming this contract file.

---

## Fixtures (locked via `tests/unit/perChildAllowance.test.js`)

Notation: `fireYear = 2030`, all children have `college = 'us-private'` (college start defaults to birthYear + 18 unless overridden).

1. **Pre-FIRE zero-out**: `calcPerChildAllowance([{date:'2020-01-01',college:'us-private'}], 2025, 2030)` → `0`.
2. **Age 0–12 flat**: for a child born 2020-01-01, `calcPerChildAllowance([child], 2030, 2030)` → `2000` (age 10). Same result for ages 11, 12.
3. **Age 13**: `calcPerChildAllowance([{date:'2020-01-01',…}], 2033, 2030)` → `2500` (age 13).
4. **Age 14, 15, 16, 17**: return `3000`, `4000`, `5000`, `6000` respectively (fixture covers all four).
5. **Cap**: `calcPerChildAllowance([{date:'2020-01-01',collegeStartYear:2040,…}], 2038, 2030)` → `6000` (age 18 but college delayed to 20; allowance caps at 6000).
6. **College-takeover**: `calcPerChildAllowance([{date:'2020-01-01',…}], 2038, 2030)` → `0` (age 18 ≥ default collegeStart = 2038).
7. **Multi-child summation**: two kids, one age 10 one age 14, both pre-FIRE transition → `2000 + 3000 = 5000`.
8. **Unborn child**: `calcPerChildAllowance([{date:'2032-01-01',…}], 2030, 2030)` → `0` (child not yet born; guard clause).
9. **Mixed pre-college + in-college**: child A age 10 (allowance 2000), child B in college year → `2000` total.
10. **Empty list**: `calcPerChildAllowance([], 2040, 2030)` → `0`.
