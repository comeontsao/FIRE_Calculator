# Contract: Adults-Only Scaling Formula

**Feature**: 010-country-budget-scaling
**Owner**: Backend Engineer
**Purity**: Pure (no DOM, no globals, no Chart.js, no `localStorage`).

---

## `getAdultsOnlyFactor(adultCount)`

Derives the post-FIRE country-budget scaling factor from the number of adults.

### Inputs

| Name | Type | Constraints |
|------|------|-------------|
| `adultCount` | integer | Must be 1 or 2 (feature 009 hard-caps the counter). |

### Output

| Type | Range | Notes |
|------|-------|-------|
| number | `[2/3, 1.0]` | `adultCount=1 → 2/3 ≈ 0.6667`, `adultCount=2 → 1.0000` exactly. |

### Formula

```
adult_weight = 1.0 + 0.5 * max(0, adultCount - 1)
couple_weight = 1.5
factor = adult_weight / couple_weight
```

### Pre/Post-conditions

- **Pre**: `adultCount ∈ {1, 2}`. Values outside this range are a caller bug; function may clamp (preferred: clamp to `[1, 2]` and return the boundary factor; DO NOT throw — callers treat this as display-time math).
- **Post**: Return value is finite, positive, ≤ 1.0.
- **Invariant**: `getAdultsOnlyFactor(2) === 1.0` exactly. Locked by regression fixture.

### Consumers

- `getScaledScenarioSpend(...)` (below).
- Scaling indicator Line 1 renderer (inline in `FIRE-Dashboard-Generic.html`).

---

## `getScaledScenarioSpend(scenario, tier, adultCount, overrides)`

Resolves the post-FIRE country budget for a scenario, applying the adults-only factor except when a per-country override is active.

### Inputs

| Name | Type | Constraints |
|------|------|-------------|
| `scenario` | `Scenario` object | Must be an element of the `scenarios[]` array. Read-only inside this function. |
| `tier` | `'lean' \| 'normal' \| 'comfortable'` | Selects which of `annualSpend` / `normalSpend` / `comfortableSpend` to read. |
| `adultCount` | integer | Forwarded to `getAdultsOnlyFactor`. |
| `overrides` | `{ [scenarioId: string]: number }` | The `scenarioOverrides` map; may be empty. |

### Output

| Type | Range |
|------|-------|
| number | ≥ 0; typically a country-level annual spend in USD. |

### Algorithm

```
1. if overrides[scenario.id] > 0:
     return overrides[scenario.id]              // override wins; factor NOT multiplied

2. baseline =
     if tier == 'lean':         scenario.annualSpend
     elif tier == 'normal':     scenario.normalSpend
     elif tier == 'comfortable': scenario.comfortableSpend
     else:                      scenario.annualSpend  // defensive default

3. factor = getAdultsOnlyFactor(adultCount)

4. return baseline * factor
```

### Pre/Post-conditions

- **Pre**: `scenarios[]` is unmodified in memory. Asserted by fixture 6 (`lockstepRegression`).
- **Post**: Return value is non-negative. Tier ratios are preserved: for any scenario `s` and any `adultCount`, `getScaledScenarioSpend(s, 'normal', a, {})  / getScaledScenarioSpend(s, 'lean', a, {}) === s.normalSpend / s.annualSpend` (within floating-point tolerance).
- **Invariant (override precedence)**: if `overrides[s.id] > 0`, the return value equals `overrides[s.id]` regardless of `adultCount`, `tier`, or any hardcoded baseline. Locked by fixture 4.
- **Invariant (regression anchor)**: at `adultCount == 2` and `overrides == {}`, the return value equals the baseline for that tier byte-for-byte. Locked by fixture 6.

### Consumers (Principle VI — this list MUST stay synchronised with render-site comments)

- **Country comparison cards** — `scenario-card` grid render (~line 10301 of `FIRE-Dashboard-Generic.html`).
- **Scenario insight deep-dive panel** — `scenarioInsight` render (~line 10312).
- **Country annual-budget label** in the deep-dive panel (`geo.annualBudget` line).
- **Full Portfolio Lifecycle chart** — spend-curve input for each post-FIRE year.
- **Portfolio Drawdown (With SS)** chart — same spend-curve input.
- **Portfolio Drawdown (Without SS)** chart — same spend-curve input.
- **Strategy Compare card** — reads requirement per year from the same accessor.
- Any future strategy-ranking helper that sorts countries by projected spend — MUST consume via this accessor and not re-read `scenarios[s.id].annualSpend` directly.

Each consumer site MUST carry a comment in its render function naming this contract file, per Principle VI.

---

## Fixtures (locked via `tests/unit/adultsOnlyFactor.test.js`)

1. `getAdultsOnlyFactor(1)` → `0.6666666666666666` (exact IEEE-754 representation of 2/3).
2. `getAdultsOnlyFactor(2)` → `1.0` (exact).
3. `getAdultsOnlyFactor(0)` → clamp to `getAdultsOnlyFactor(1)` (defensive; log a warning is optional).
4. `getAdultsOnlyFactor(3)` → clamp to `getAdultsOnlyFactor(2)` (defensive; counter is hard-capped but the formula must not explode).
5. Tier-ratio preservation: for every scenario in `scenarios[]`, and for `tier ∈ {'lean','normal','comfortable'}`, `getScaledScenarioSpend(s, tier, 1, {}) / getScaledScenarioSpend(s, 'lean', 1, {}) === s[tierField] / s.annualSpend`.
6. Override precedence: `getScaledScenarioSpend(us, 'normal', 1, { us: 100000 }) === 100000`.
7. Regression anchor: `getScaledScenarioSpend(us, 'lean', 2, {}) === 78000` (current US `annualSpend`).
