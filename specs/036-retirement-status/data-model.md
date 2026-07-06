# Phase 1 Data Model: Explicit Retirement Status

## Entities

### RetirementStatus (per dashboard, user-asserted, persisted)

The single source of truth for the accumulation→drawdown transition when ON. Absence / OFF = feasibility-driven behavior (no residual effect).

**RR (`FIRE-Dashboard.html`) — single household state**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `retired` | boolean | `false` | ON = user has retired. |
| `retirementYear` | integer | current year (2026) | Calendar year of retirement. Mapped to age via R1. |

Persisted as `state._retirementStatus = { retired, retirementYear }`.

**Generic (`FIRE-Dashboard-Generic.html`) — per-person (up to two earners)**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `persons` | array (len 1–2) | `[{retired:false, retirementYear:2026}, {retired:false, retirementYear:2026}]` | Index 0 = Person 1, index 1 = Person 2. |
| `persons[i].retired` | boolean | `false` | Per-earner. |
| `persons[i].retirementYear` | integer | current year | Per-earner retirement year. |

In single-adult mode (`adultCount === 1`) only `persons[0]` is meaningful; `persons[1]` is hidden/ignored (FR-020).

Persisted as `state._retirementStatus = { persons: [...] }`.

### PerPersonIncome (Generic only, NEW inputs — FR-019)

Replaces the single household `annualIncome` (Generic line 3292) with two inputs. Household employment income = their sum (migration: on first load with no `person2Income`, set `person1Income = legacy annualIncome`, `person2Income = 0`).

| Input id | Type | Default | Notes |
|----------|------|---------|-------|
| `person1Income` | number (annual $) | 80000 | Person 1 employment income. |
| `person2Income` | number (annual $) | 0 | Person 2 employment income; hidden when `adultCount === 1`. |

RR keeps its existing single household `annualIncome` — no per-person income (Principle I divergence C1).

### Feasibility Verdict (existing — reinterpreted)

The Safe/Exact/DWZ evaluation is unchanged as *math*. When `RetirementStatus.retired` is ON, its user-facing headline is **reinterpreted** as a sustainability readout (see Verdict States below). It never renders a countdown while retired (FR-014).

### Planned Retirement (existing — superseded when ON)

The FIRE-marker drag / `fireAgeOverride`. Active only while status is OFF (FR-010). Inert while ON (FR-011); the marker reflects the actual retirement age and is not draggable.

## Derived values

### Retirement age (from year)

```
retirementAge(year, currentAge) = max(currentAge, currentAge + (year - 2026))
```

### Effective transition age (the ONE resolver — Principle III)

```
effectiveTransitionAge =
  status.retired
    ? (RR:      retirementAge(status.retirementYear, currentAge))
      (Generic: max over working earners' retirementAge(...), i.e. household fully retired
                = max(retirementAge(person[i].retirementYear) for each i with retired==true;
                      if a person is NOT marked retired, they never stop within plan → use endAge+1))
    : (fireAgeOverride != null ? fireAgeOverride : calculatedFireAge)
```

Note: an earner who is not marked retired contributes income through plan end (spec edge case "second earner never retires within the plan").

### Per-year employment income (feeds `accumulateToFire`)

```
workingIncome(age) =
  status.retired
    ? Σ person[i].income  for each earner with retirementAge_i > age
    : inp.annualIncome        // unchanged feasibility-driven path
```

RR: single earner → `annualIncome` until `retirementAge`, then 0.

### Per-year contribution scale (R4 — proportional attribution)

```
contribScale(age) = totalWorkingIncome > 0 ? workingIncome(age) / totalWorkingIncome : 0
```
Applied to 401(k) employee + match and discretionary brokerage contributions for that year. Both retired → scale 0 → no new contributions.

## Verdict States (when retired — FR-006)

| Condition (from resolved lifecycle) | Class | Copy key |
|-------------------------------------|-------|----------|
| All retirement-year balances ≥ 0 through `endAge` | `on-track` | `retire.verdict.sustainable` → "🟢 Retired — sustainable to age {0}" |
| Any year has `hasShortfall` / `total < 0` before `endAge` | `behind` | `retire.verdict.atRisk` → "⚠️ Retired — at risk · shortfall in {0}" |

## State transitions

```
OFF ──(toggle on)──▶ ON(retirementYear=default)
 ▲                          │
 │  (toggle off:            │ (edit year)
 │   full revert,           ▼
 │   no residual) ◀──── ON(retirementYear=Y)
```

- OFF → ON: transition age = retirement age; drag parked; verdict reframes; auto-suggest (if shown) cleared.
- ON → OFF: `_retirementStatus.retired=false`; resolver falls back to override/calculated; drag re-enabled; verdict reverts. Output MUST equal the never-toggled feasibility result (SC-004).
- Generic per-person: each earner toggles independently; household transition = latest retired earner's age.

## Persistence & migration

- `STATE_KEY = 'fire_dashboard_state'`; add `state._retirementStatus` (write in `saveState`, read in `restoreState`).
- Generic: add `person1Income`, `person2Income` to `PERSIST_IDS`. Migration on restore: if `person1Income`/`person2Income` absent but legacy `annualIncome` present → `person1Income = annualIncome`, `person2Income = 0`.
- No schema-version bump: additive; absent `_retirementStatus` ⇒ OFF (safe default), preserving existing saved states.
- **⚠ Do NOT bump `GENERIC_VERSION` (`'v3'`, ~19730)** — on mismatch it *wipes* Generic state + snapshots. Additive fields need no gate; bumping would destroy user data. RR keys: `fire_dashboard_state`; Generic: `fire_dashboard_generic_state`.

## Invariants

- **INV-1 (off-parity)**: With `retired=false`, projection output is byte-identical to pre-feature behavior (SC-004).
- **INV-2 (no-income-when-fully-retired)**: For every year ≥ effective transition age, `workingIncome = 0` and new contributions = 0 (SC-002).
- **INV-3 (SS untouched)**: SS/passive income for any year depends only on `ssClaimAge`, never on retirement status (FR-004).
- **INV-4 (single resolver)**: Every chart/KPI/verdict reads `effectiveTransitionAge` from the one resolver; none re-derives it (Principle III).
- **INV-5 (staggered generic)**: With two earners at years Y1<Y2, interim years [Y1,Y2) show only the later earner's income; years ≥ Y2 show zero employment income (SC-008).
- **INV-6 (household = sum, Generic)**: `annualIncome_household = person1Income + person2Income` at all times.
