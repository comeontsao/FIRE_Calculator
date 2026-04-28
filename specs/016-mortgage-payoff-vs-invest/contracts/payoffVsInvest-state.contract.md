# Contract: DOM Inputs + `localStorage` State + recalcAll Boundary

**Feature**: 016-mortgage-payoff-vs-invest
**Constitution Principles enforced**: III (single source of truth — no shared state), V (no build step)

---

## DOM input ids (NEW)

All new inputs live inside the new `<div class="pill-host" data-tab="plan" data-pill="payoff-invest">`. The renderer reads them by id at render time.

| Element id | Type | Range / values | Default | Persists? |
|------------|------|----------------|---------|-----------|
| `pviExtraMonthly` | `<input type="range">` | 0 – 5000, step 50 | 500 | yes |
| `pviExtraMonthlyVal` | display `<span>` | (read-only) | — | no |
| `pviFramingTotal` | `<input type="radio" name="pviFraming">` | (radio group) | checked | yes |
| `pviFramingLiquid` | `<input type="radio" name="pviFraming">` | (radio group) | unchecked | yes |
| `pviRefiEnabled` | `<input type="checkbox">` | true / false | false | yes |
| `pviRefiYear` | `<input type="range">` | 1 – `endAge − currentAge − 1`, step 1 | 5 | yes |
| `pviRefiYearVal` | display `<span>` | (read-only) | — | no |
| `pviRefiNewRate` | `<input type="number">` | 0.5 – 12.0, step 0.05 | 5.0 | yes |
| `pviRefiNewTerm` | `<select>` | 15 / 20 / 30 | 30 | yes |
| `pviEffRateOverrideEnabled` | `<input type="checkbox">` | true / false | false | yes |
| `pviEffRateOverride` | `<input type="number">` | 0.0 – 12.0, step 0.05 | (= nominal at toggle-on) | yes |

Every input's `oninput` / `onchange` handler calls **only**:

```js
recomputePayoffVsInvest();   // local; calls computePayoffVsInvest + re-renders only the 3 new charts
saveState();                  // existing
```

The handlers MUST NOT call `recalcAll()` (which would re-run the full FIRE projection unnecessarily and might trigger downstream side effects on other charts). Recompute is local to the pill.

---

## localStorage schema (extension to existing `state` object)

```text
state._payoffVsInvest:  // NEW key — opt-in object
  {
    extraMonthly:           number       // 0-5000
    framing:                'totalNetWorth' | 'liquidNetWorth'
    refiEnabled:            boolean
    refiYear:               number       // 1+
    refiNewRate:            number       // % expressed as decimal e.g. 0.04
    refiNewTerm:            15 | 20 | 30
    effRateOverrideEnabled: boolean
    effRateOverride:        number       // % decimal e.g. 0.06
  }
```

`saveState()` adds an entry:

```js
state._payoffVsInvest = {
  extraMonthly: parseFloat(document.getElementById('pviExtraMonthly').value) || 500,
  framing: document.getElementById('pviFramingTotal').checked ? 'totalNetWorth' : 'liquidNetWorth',
  refiEnabled: document.getElementById('pviRefiEnabled').checked,
  refiYear: parseInt(document.getElementById('pviRefiYear').value, 10) || 5,
  refiNewRate: (parseFloat(document.getElementById('pviRefiNewRate').value) || 5) / 100,
  refiNewTerm: parseInt(document.getElementById('pviRefiNewTerm').value, 10) || 30,
  effRateOverrideEnabled: document.getElementById('pviEffRateOverrideEnabled').checked,
  effRateOverride: (parseFloat(document.getElementById('pviEffRateOverride').value) || 0) / 100,
};
```

`restoreState()` reads `state._payoffVsInvest` (if present) and writes the values back to each DOM input. If absent, leaves defaults in place. No migration needed (new key; old saved states simply default).

---

## Renderer integration boundary

### Where it plugs into recalcAll

A new function `recomputePayoffVsInvest()` is called from `recalcAll()` at the end of the recalc pipeline (after `_lastStrategyResults` is set, after `renderGrowthChart` finishes, after the existing pill renderers run):

```js
function recalcAll() {
  // ... existing flow unchanged through chart re-renders ...

  // NEW — Feature 016 — Payoff vs Invest pill (read-only; no side effects on existing state)
  try { recomputePayoffVsInvest(); } catch (_e) { /* swallow per existing pattern */ }
}
```

`recomputePayoffVsInvest()` itself does:

```js
function recomputePayoffVsInvest() {
  const inputs = _assemblePayoffVsInvestInputs();   // reads existing inputs + new pill inputs
  const outputs = computePayoffVsInvest(inputs);     // pure call into calc/payoffVsInvest.js

  if (outputs.disabledReason) {
    _renderPayoffVsInvestExplainerCard(outputs.disabledReason);
    return;
  }

  renderPayoffVsInvestWealthChart(outputs);
  renderPayoffVsInvestAmortizationChart(outputs);
  renderPayoffVsInvestVerdictBanner(outputs.verdict, inputs);
  renderPayoffVsInvestFactorBreakdown(outputs.factors);
}
```

### Slider handlers (separate fast path)

Each new pill input also has a direct `oninput` that calls `recomputePayoffVsInvest()` directly without going through `recalcAll()`. This keeps slider drags snappy (200 ms budget per SC-001) and ensures NO other chart re-renders.

```html
<input type="range" id="pviExtraMonthly" min="0" max="5000" step="50" value="500"
       oninput="document.getElementById('pviExtraMonthlyVal').textContent='$'+Number(this.value).toLocaleString();
                recomputePayoffVsInvest();
                saveState();">
```

---

## chartState integration

This pill does NOT consume or produce `chartState` events. It is a leaf consumer that reads `effectiveFireAge` once at recompute time (via `_cs().state.effectiveFireAge`) and never writes back. The existing `onFireChange_*` listener registry (`tests/unit/chartState.test.js`) is NOT touched.

---

## Tab router registration

In `calc/tabRouter.js`, the Plan tab's pill list extends to include the new pill:

```js
Object.freeze({
  id: 'plan',
  labelKey: 'nav.tab.plan',
  pills: Object.freeze([
    Object.freeze({ id: 'profile',       labelKey: 'nav.pill.profile' }),
    Object.freeze({ id: 'assets',        labelKey: 'nav.pill.assets' }),
    Object.freeze({ id: 'investment',    labelKey: 'nav.pill.investment' }),
    Object.freeze({ id: 'mortgage',      labelKey: 'nav.pill.mortgage' }),
    Object.freeze({ id: 'payoff-invest', labelKey: 'nav.pill.payoffInvest' }),   // NEW
    Object.freeze({ id: 'expenses',      labelKey: 'nav.pill.expenses' }),
    Object.freeze({ id: 'summary',       labelKey: 'nav.pill.summary' }),
  ]),
}),
```

This extends `tests/unit/tabRouter.test.js` — one new test asserting the new pill is in the list and routes correctly.

---

## No-regression guarantee

The browser smoke harness (existing `tests/baseline/browser-smoke.test.js`) MUST be extended with one assertion: load both HTML files, snapshot the data series of the existing Lifecycle / Strategy / Withdrawal charts, navigate to the new pill, navigate back, snapshot again, assert byte-equality. This is the operational proof of FR-002 / SC-004.
