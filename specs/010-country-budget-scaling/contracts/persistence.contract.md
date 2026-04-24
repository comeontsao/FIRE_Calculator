# Contract: Persistence (localStorage + CSV)

**Feature**: 010-country-budget-scaling
**Owner**: DB Engineer.

---

## localStorage

### Key: `fire_dashboard_generic_state`

Existing top-level key from features 005–009. Feature 010 adds one new sibling field; no other field is touched.

#### New field: `scenarioOverrides`

```ts
type ScenarioOverrides = {
  // scenario id (matches an entry in scenarios[])  →  user-entered annual spend (>0)
  [scenarioId: string]: number
};
```

- **Presence**: optional. Absent ≡ empty map ≡ no overrides active.
- **Normalisation on write**: entries whose value is `0`, negative, non-finite, or `NaN` MUST be removed before serialisation. The serialised map never contains zero-value entries.
- **Normalisation on read**: if a stored entry has `value <= 0`, treat as no-override (defensive against legacy / hand-edited blobs).
- **Cross-session persistence**: round-trips across reload, language toggle, and Adults counter toggle.

#### Shape of the full blob (excerpt)

```json
{
  "inp": { /* ... existing feature-009 input bag ... */ },
  "childrenList": [ /* ... existing per-child entries ... */ ],
  "selectedScenario": "us",
  "scenarioOverrides": {
    "us": 100000,
    "taiwan": 30000
  }
}
```

#### Migration path

No schema version bump required. Additive field. On load:

```
const saved = JSON.parse(localStorage.getItem('fire_dashboard_generic_state') ?? '{}');
scenarioOverrides = saved.scenarioOverrides ?? {};
```

Pre-010 blobs lack the field and default to `{}` cleanly. Post-010 blobs loaded into pre-010 code would silently drop the field (forward-incompatible by design — no one should be running pre-010 code on post-010 state, and the user has no multi-version workflow).

---

## CSV

**No schema change.** Feature 010 preserves the existing `FIRE-snapshots-generic.csv` columns exactly (FR-019). Snapshots continue to record whatever the dashboard computed at snapshot time; the adults-only scaling, per-child allowance, and per-country override all feed into the same `Monthly Spend`, `FIRE Target`, and related columns that already exist.

Confirmed columns (unchanged):

```
Date, Age, Net Worth, ..., Monthly Spend, FIRE Target, ..., Adults, Locked
```

`Adults` is column 20 (added by feature 009). Feature 010 does NOT add a column.

### Historical snapshot interpretation

A pre-010 snapshot row taken at `adultCount=1` was recorded against the un-scaled country budget. That row's `Monthly Spend` remains what it was — no retroactive re-scaling. Post-010 snapshots at `adultCount=1` use the scaled number. The dashboard makes no attempt to normalise the two side-by-side; users comparing snapshots across the feature-010 boundary should expect a one-time step change in the `FIRE Target` column for `adultCount=1` rows.

---

## In-memory state shape (for reference)

```ts
// Module-level variables in FIRE-Dashboard-Generic.html
let inp: InputsBag;                           // existing
let childrenList: ChildEntry[];               // existing (feature 009)
let selectedScenario: string;                 // existing
let scenarioOverrides: ScenarioOverrides;     // NEW — feature 010
```

`scenarioOverrides` is read by the pure accessor `getScaledScenarioSpend(s, tier, adultCount, overrides)` and written by the UI handler `updateAdjustedAnnualSpend(scenarioId, valueStr)`.

---

## Test hooks

Covered in `tests/unit/scenarioOverride.test.js`:

1. Empty map round-trip: JSON.parse(JSON.stringify({})) === {}.
2. Set → save → reload → still set: `scenarioOverrides = {us: 100000}; save; reload; expect scenarioOverrides.us === 100000`.
3. Normalisation on write: `scenarioOverrides = {us: 0, taiwan: 30000}; save; reload; expect keys === ['taiwan']`.
4. Normalisation on read: stored `{us: -5}` → in-memory `{}`.
5. Forward-compat: pre-010 blob (no `scenarioOverrides` field) loads cleanly with empty map.
