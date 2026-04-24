# Contract: Per-Country Adjust Annual Spend Input

**Feature**: 010-country-budget-scaling
**Owner**: Frontend Engineer (UI wiring) + DB Engineer (localStorage schema).
**Parity reference**: `FIRE-Dashboard.html` (RR) deep-dive panel, Taiwan card — already has this input.

---

## DOM contract

Inserted into the existing deep-dive scenario-insight template (~line 10312 of `FIRE-Dashboard-Generic.html`), immediately below the "Annual Visa Cost:" row.

### HTML

```html
<strong data-i18n="geo.adjustSpend">💰 Adjust Annual Spend:</strong>
<input type="number"
       id="adjust_${s.id}"
       value="${(scenarioOverrides[s.id] ?? 0) || ''}"
       placeholder="0"
       min="0"
       step="1000"
       style="width:100px;padding:4px 8px;text-align:right;font-size:0.9em;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);margin-left:6px"
       onchange="updateAdjustedAnnualSpend('${s.id}', this.value)">
<span style="font-size:0.82em;color:var(--text-dim);margin-left:4px" data-i18n="geo.adjustNote">(overrides lifestyle preset for this country)</span>
```

### i18n keys (both already present in the catalog)

| Key | EN | zh-TW |
|-----|----|----|
| `geo.adjustSpend` | `💰 Adjust Annual Spend:` | `💰 調整年度花費：` |
| `geo.adjustNote` | `(overrides lifestyle preset for this country)` | `（覆蓋此國家的生活方式預設）` |

**No new i18n keys are added by this contract.** The catalog strings exist at `FIRE-Dashboard-Generic.html` lines 4312–4313 (EN) and 5158–5159 (zh-TW) but are currently orphaned. This feature wires them.

---

## Event handler

```js
/**
 * Wire-up for the per-country Adjust Annual Spend input.
 * Inputs:  scenarioId — id from scenarios[] (e.g. 'us', 'taiwan').
 *          valueStr — raw string from the <input>.
 * Outputs: side-effect on the `scenarioOverrides` map in state, plus recalc.
 * Consumers: every chart that reads country spend (see scaling-formula.contract.md).
 */
function updateAdjustedAnnualSpend(scenarioId, valueStr) {
  const value = Math.max(0, parseFloat(valueStr) || 0);
  if (value > 0) {
    scenarioOverrides[scenarioId] = value;
    const el = document.getElementById('adjust_' + scenarioId);
    if (el) el.setAttribute('data-user-edited', '1');
  } else {
    delete scenarioOverrides[scenarioId];
    const el = document.getElementById('adjust_' + scenarioId);
    if (el) el.removeAttribute('data-user-edited');
  }
  persistState();   // writes fire_dashboard_generic_state including scenarioOverrides
  recalcAll();
}
```

Notes:

- `scenarioOverrides` is a module-level variable alongside the existing `inp`, `childrenList`, etc. See `persistence.contract.md` for storage details.
- `persistState()` is the existing feature-009 state-save helper; this feature adds `scenarioOverrides` to the serialised payload.
- `recalcAll()` is the existing full-dashboard recomputation entry point.

---

## Behavioural spec

### Override set (value > 0)

1. User types a positive number into the Adjust Annual Spend input for country X.
2. `scenarioOverrides[X] = value`. DOM gets `data-user-edited="1"`.
3. State persisted.
4. On `recalcAll()`:
   - Country X's card and deep-dive panel display `value` as the annual budget (NOT multiplied by the adults-only factor).
   - Country X's Lifecycle-chart spend requirement uses `value` as the base; per-child allowance and college tuition still overlay on top.
   - Other countries (Y, Z, …) continue to scale via the adults-only factor.

### Override cleared (value == 0 or empty)

1. User clears the input or types 0.
2. `delete scenarioOverrides[X]`. DOM loses `data-user-edited`.
3. State persisted; the serialised `scenarioOverrides` map is normalised (no zero-value entries stored).
4. On `recalcAll()`, country X reverts to adults-only-factor-scaled display.

### Adults counter change with an active override

- If `scenarioOverrides[X]` is set and user toggles Adults 2 → 1:
  - Country X's displayed budget STAYS at the override value.
  - Every other country scales down by the factor (0.667).

### Language toggle with an active override

- Override value is language-independent (a number). Only the label strings (`geo.adjustSpend`, `geo.adjustNote`) flip language.

---

## Accessibility

- The `<input>` has an implicit label via the adjacent `<strong data-i18n="geo.adjustSpend">` element. No explicit `<label for>` added to keep parity with the existing Relocation Cost and Visa Cost inputs above it.
- Keyboard: standard `<input type="number">` behaviour. Up/Down arrows nudge by `step=1000`.
- Mobile: reuses existing deep-dive panel responsive rules.

---

## Test hooks

Unit test (`tests/unit/scenarioOverride.test.js`) imports:

- The pure `getScaledScenarioSpend` accessor (from `scaling-formula.contract.md`).
- A mocked `scenarioOverrides` map.

And asserts:

1. Empty overrides → factor-scaled value.
2. `overrides = { us: 100000 }` at `adultCount=1` → 100000 for US, scaled for all others.
3. `overrides = { us: 100000 }` at `adultCount=2` → 100000 for US (still wins over the 1.00× factor).
4. `overrides = { us: 0 }` (legacy bad state) → treated as no override; factor-scaled value.
5. Normalisation: after clearing US override, the serialised map contains no `us` key.

E2E smoke (Playwright, follow-up in feature 010 QA work):

- Open Generic dashboard at Adults=2.
- Open US deep-dive panel; confirm Adjust Annual Spend input is visible and empty (placeholder `0`).
- Type `100000`, blur.
- Confirm country card for US updates to `$100,000/yr`; factor indicator Line 1 unchanged.
- Toggle Adults to 1. Confirm US stays at `$100,000/yr`; Taiwan drops from `$36,000/yr` to `$24,000/yr` (= 36000 × 0.667).
- Toggle Adults back to 2. Confirm US still at `$100,000/yr`.
- Clear the US input (type 0 or empty). Confirm US reverts to `$78,000/yr`.
