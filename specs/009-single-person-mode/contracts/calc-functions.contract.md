# Contract — Calc Function Signatures

**Scope:** Every inline calc helper in `FIRE-Dashboard-Generic.html` and every `calc/*.js` module whose contract is affected by the Adult Counter. Each function below lists its final signature, its new behavior branch on `adultCount`, and the chart/KPI consumers that depend on the change.

All helpers remain **pure** (Principle II): no DOM reads added inside them; where an input is needed it is delivered via `inp`.

---

## 1. `detectMFJ(inp)` — extended

**Signature:** unchanged. `(inp) => boolean`.

**New body:**

```javascript
function detectMFJ(inp) {
  // Feature 009 — primary signal is the adult counter.
  if (Number.isInteger(inp.adultCount)) return inp.adultCount === 2;
  // Fallback (pre-feature-009 call sites / fixtures): key on agePerson2 presence.
  const age2 = inp.agePerson2;
  return age2 != null && age2 > 0 && !isNaN(age2);
}
```

**Contract:**
- **Inputs:** `inp.adultCount` (optional integer), `inp.agePerson2` (optional number).
- **Output:** `true` ⇔ Married Filing Jointly, `false` ⇔ Single.
- **Consumers (existing — no change, all pick up new semantics via `inp.adultCount`):** `applyFilingStatusDefaults` at bootstrap; `getTaxBrackets(detectMFJ(inp))` in the lifecycle tax layer (line 7489), withdrawal engine (line 6907), roth-ladder view, and every simulator branch that calls `getTaxBrackets`.
- **Invariant:** idempotent; side-effect-free.

---

## 2. `applyFilingStatusDefaults(isMFJ)` — unchanged

Signature and body unchanged. New integration: the Adult counter click handler calls `applyFilingStatusDefaults(detectMFJ(getInputs()))` so that the IRMAA / std-ded / top-of-12% defaults swap without bypassing the existing `data-user-edited` gate.

**Consumers:** `twStdDed`, `twTop12`, `irmaaThreshold` DOM defaults.

---

## 3. `calcNetWorth(inp)` — extended

**Signature:** unchanged. `(inp) => number`.

**New body:**

```javascript
function calcNetWorth(inp) {
  const p2 = (inp.adultCount === 2) ? inp.person2Stocks : 0;
  return inp.person1_401k + inp.person1Stocks + p2 + inp.cashSavings + inp.otherAssets;
}
```

**Contract:**
- **Input delta:** reads new `inp.adultCount`.
- **Consumers:** `#totalNetWorth` KPI, snapshot row's `netWorth` field, What-If card, Savings Rate gauge denominator (if applicable).
- **Invariant:** when `adultCount === 1`, Person 2 stocks do not contribute; value in DOM is preserved for round-trip (FR-018, FR-007).

---

## 4. `calcAccessible(inp)` — extended

```javascript
function calcAccessible(inp) {
  const p2 = (inp.adultCount === 2) ? inp.person2Stocks : 0;
  return inp.person1Stocks + p2 + inp.cashSavings + inp.otherAssets;
}
```

**Consumers:** `#nwAccessible` KPI, pre-59.5 accessible-pool headroom checks, feasibility gates (Safe / Exact / DWZ), lifecycle simulator's "taxable pool" seed.

---

## 5. `calcRealisticSSA(inp, fireAge)` — extended

**Signature:** unchanged.

**New body (inside the function, after computing `pia` from the AIME formula):**

```javascript
// Feature 009 — when adultCount === 1, no spousal benefit is added.
const isSingle = (inp.adultCount === 1);
const spousePIA = isSingle ? 0 : Math.max(pia * 0.5, inp.ssSpouseOwn);
const combinedPIA = pia + spousePIA;
```

**Contract:**
- **Output delta:** `spousePIA` always `0` when `adultCount === 1`; `combinedPIA === pia`.
- **Consumers:** `getSSAnnual`, SS panel displays (`ss.person2Spousal`, `ss.combinedAtFra`), lifecycle simulator's `ssIncomeReal` stream.
- **Invariant:** `ssSpouseOwn` DOM value preserved; simply not applied when single (FR-013).

---

## 6. `getSSAnnual(inp, claimAge, fireAge)` — extended

**New body (adjustments only):**

```javascript
let rogerMonthly = ssa.primaryPIA;
let rebeccaMonthly = ssa.spousePIA;   // already 0 when adultCount === 1 (see §5)
// ... existing claimAge adjustments unchanged ...
return (rogerMonthly + rebeccaMonthly) * 12;   // rebeccaMonthly collapses to 0 when single
```

No new branch in `getSSAnnual` itself — the zero propagates from `calcRealisticSSA`. Contract is preserved via §5.

**Consumers:** Portfolio Drawdown (With/Without SS), Full Portfolio Lifecycle, country-card SS overlay, Social Security panel.

---

## 7. `getHealthcareFamilySizeFactor(age, inp)` — extended

**Signature change:** now accepts `inp` as second argument so it can read `adultCount`. **Note:** for backward compatibility during the transition, if `inp` is not passed, the function falls back to reading `#adultCount` directly from the DOM (classic-script call sites during bootstrap); the pure-function path is preferred.

**New body:**

```javascript
const SINGLE_ADULT_PRE65_SHARE = 0.35;   // Feature 009 — see research.md §1.
const COUPLE_PRE65_SHARE       = 0.67;   // Existing — unchanged.
const PER_KID_SHARE            = 0.165;  // Existing — unchanged.
const HC_KID_OFF_PLAN_AGE      = 22;     // Existing — unchanged.

function getHealthcareFamilySizeFactor(age, inp) {
  if (age >= 65) return 1.0;   // post-65 couple-rate baseline; single scaling is handled by getHealthcareMonthly.
  // Resolve adultCount: prefer the passed `inp`, fall back to DOM for legacy classic callers.
  let adults = 2;
  if (inp && Number.isInteger(inp.adultCount)) {
    adults = inp.adultCount;
  } else {
    const el = document.getElementById('adultCount');
    if (el) adults = parseInt(el.value) || 2;
  }
  const p1El = document.getElementById('agePerson1');
  if (!p1El) return 1.0;
  const p1Age = parseInt(p1El.value) || 0;
  const yrsFromNow = age - p1Age;
  let kidsOnPlan = 0;
  if (typeof childrenList !== 'undefined' && childrenList) {
    for (let i = 0; i < childrenList.length; i += 1) {
      const el = document.getElementById(`ageChild${i + 1}`);
      if (!el) continue;
      const k = parseInt(el.value);
      if (!isNaN(k) && (k + yrsFromNow) < HC_KID_OFF_PLAN_AGE) kidsOnPlan += 1;
    }
  }
  const k = Math.min(2, kidsOnPlan);
  const adultShare = (adults === 1) ? SINGLE_ADULT_PRE65_SHARE : COUPLE_PRE65_SHARE;
  return adultShare + PER_KID_SHARE * k;
}
```

**Contract:**
- **Inputs:** `age` (integer years), optional `inp` object with `adultCount` integer.
- **Output:** multiplicative factor for pre-65 healthcare baseline.
- **Consumers:** `getHealthcareMonthly`, country comparison chart, lifecycle simulator's healthcare subtraction.
- **Branch summary:**
  - `adultCount=2, kids=0 → 0.67`
  - `adultCount=2, kids=1 → 0.835`
  - `adultCount=2, kids=2 → 1.00` (family-of-4 reference)
  - `adultCount=1, kids=0 → 0.35`
  - `adultCount=1, kids=1 → 0.515`
  - `adultCount=1, kids=2 → 0.68`
- **Caveat:** The inline function currently reads the DOM (`agePerson1`, children `ageChild{i}`) for `kidsOnPlan`. That legacy impurity is preserved to keep this feature's patch small. A future refactor can extract a fully-pure version into `calc/healthcare.js`; this feature commits only to making the `adultCount` branch present and correct.

---

## 8. `getHealthcareMonthly(scenarioId, age, inp)` — extended

**Signature change:** now takes optional `inp` (to forward to `getHealthcareFamilySizeFactor`, and to read `adultCount` for post-65 halving).

**New body (key delta — post-65 branch):**

```javascript
function getHealthcareMonthly(scenarioId, age, inp) {
  const hc = HEALTHCARE_BY_COUNTRY[scenarioId] || HEALTHCARE_BY_COUNTRY.us;
  const isPost65 = age >= 65;
  const overrideEl = document.getElementById(isPost65 ? 'hcOverridePost65' : 'hcOverridePre65');
  let base;
  if (overrideEl) {
    const v = parseFloat(overrideEl.value);
    if (!isNaN(v) && v > 0) base = v;
  }
  if (base === undefined) base = isPost65 ? hc.post65 : hc.pre65;

  // Feature 009 — single-enrollee Medicare halving when adultCount === 1 AND user did NOT override.
  // If the user provided an override (positive pre/post-65 value), respect it verbatim (FR-017).
  const adults = (inp && Number.isInteger(inp.adultCount))
    ? inp.adultCount
    : (parseInt((document.getElementById('adultCount') || {}).value) || 2);
  const userOverrode = overrideEl && !isNaN(parseFloat(overrideEl.value)) && parseFloat(overrideEl.value) > 0;

  if (!isPost65) {
    // Pre-65: family-size factor encodes the single-vs-couple delta.
    base *= getHealthcareFamilySizeFactor(age, inp);
  } else if (adults === 1 && !userOverrode) {
    // Post-65 single-enrollee Medicare halving.
    base *= 0.5;
  }
  return base;
}
```

**Contract:**
- **Input delta:** optional `inp`.
- **Output:** monthly real-dollar healthcare cost.
- **Consumers:** country comparison chart, country cost card, lifecycle simulator, blended-delta helper, what-if card.
- **Invariant (FR-017 preserved):** any positive user override takes precedence over every automatic scaling (both the pre-65 family-size factor and the post-65 halving).
- **Invariant (FR-015):** with `adultCount === 1` and no override, post-65 cost === 0.5 × per-country `post65` baseline.
- **Invariant (FR-016):** with `adultCount === 1` and zero kids and no override, pre-65 cost === `(SINGLE_ADULT_PRE65_SHARE) × per-country pre65` — materially lower than the `adultCount === 2, kids === 0` equivalent.

---

## 9. `getInputs()` — extended

**Signature:** unchanged. `() => inp`.

**New body delta:** read `adultCount` from the hidden input, clamp to `[1, 2]`, default `2`.

```javascript
const _acEl = document.getElementById('adultCount');
const _acRaw = _acEl ? parseInt(_acEl.value) : NaN;
inp.adultCount = Math.max(1, Math.min(2, Number.isInteger(_acRaw) ? _acRaw : 2));
```

Placed adjacent to the existing feature-007 `safetyMargin` / `rule55` / `irmaaThreshold` reads so all household-and-tax fields are grouped.

---

## 10. Call-site updates in lifecycle & withdrawal engines

Four known call sites today read `inp.person2Stocks` directly in an arithmetic sum with `inp.person1Stocks`:

- `FIRE-Dashboard-Generic.html:6692` — `portfolioStocks = inp.person1Stocks + inp.person2Stocks;`
- `FIRE-Dashboard-Generic.html:6790` — `pStocks = inp.person1Stocks + inp.person2Stocks;`
- `FIRE-Dashboard-Generic.html:7305` — `portfolioStocks = inp.person1Stocks + inp.person2Stocks;`
- `FIRE-Dashboard-Generic.html:8665` — `pStocks = inp.person1Stocks + inp.person2Stocks;`

All four become:

```javascript
const _p2 = (inp.adultCount === 2) ? inp.person2Stocks : 0;
portfolioStocks = inp.person1Stocks + _p2;   // or pStocks = ... as appropriate
```

Equivalently, we may introduce a tiny helper `_ownedStocks(inp)` to DRY the expression — optional, Phase-2's call.

---

## 11. `calc/healthcare.js` (sibling pure module) — contract note only

The module itself is unchanged (it already accepts `householdSize`). The contract header's `Consumers:` list gains:

```
 *   - FIRE-Dashboard-Generic.html inline — the dashboard's own
 *     `getHealthcareFamilySizeFactor` / `getHealthcareMonthly` mirror this
 *     module's `householdSize` semantic: `householdSize = adultCount` for the
 *     pre-65 adult-share portion, with per-kid scaling layered on top.
```

No functional change; aligning documentation so future refactors consolidate.

---

## 12. `calc/socialSecurity.js` — contract note only

`calc/socialSecurity.js` already has no spousal branch (the Generic inline `calcRealisticSSA` is where spousal math lives today). Its contract header gains a note:

```
 *   - Generic dashboard inline `calcRealisticSSA` wraps this module's PIA
 *     with a spousal add-on when adultCount === 2, and suppresses the
 *     add-on when adultCount === 1 (feature 009, FR-012/FR-013).
```

---

## 13. Summary table — which functions branch on `adultCount`

| Function | Branch kind | Returns (adultCount=1) | Returns (adultCount=2) |
|---|---|---|---|
| `detectMFJ(inp)` | Gate | `false` | `true` |
| `calcNetWorth(inp)` | Sum-suppress | `…` without `person2Stocks` | `…` with `person2Stocks` |
| `calcAccessible(inp)` | Sum-suppress | `…` without `person2Stocks` | `…` with `person2Stocks` |
| `calcRealisticSSA(inp, …)` | Set `spousePIA = 0` | `combinedPIA = pia` | `combinedPIA = pia + max(pia/2, ssSpouseOwn)` |
| `getHealthcareFamilySizeFactor(age, inp)` | Switch adult-share constant | `0.35 + 0.165·k` | `0.67 + 0.165·k` |
| `getHealthcareMonthly(scenarioId, age, inp)` | Multiply post-65 by 0.5 (no override) | `0.5 × post65` / pre-65 via factor above | `1.0 × post65` / pre-65 via factor above |
| `getInputs()` | Populate `inp.adultCount` | `inp.adultCount = 1` | `inp.adultCount = 2` |

Each row is also a fixture-case target (`tests/unit/*.test.js`).
