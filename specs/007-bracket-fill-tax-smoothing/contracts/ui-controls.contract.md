# Contract — UI Controls

**Feature**: 007 Bracket-Fill Tax Smoothing
**Scope**: Four new user-configurable inputs on both dashboards; their persistence, validation, and propagation into `getInputs()`.

---

## Control 1 — Safety Margin slider

**DOM**:
```html
<div class="input-group">
  <label>
    <span data-i18n="bracketFill.safetyMarginLabel">Tax Smoothing Safety Margin</span>
    <span class="val" id="safetyMarginVal">5%</span>
    <span class="info-tip" data-i18n-tip="bracketFill.safetyMarginTip"
          data-tip="Leaves room for IRS bracket drift (brackets & standard deduction rise each year with inflation). 5% is safe; 0% assumes brackets never change year-to-year; 10% is conservative.">?</span>
  </label>
  <input type="range" id="safetyMargin" min="0" max="10" step="1" value="5"
    oninput="document.getElementById('safetyMarginVal').textContent=this.value+'%';recalcAll()">
</div>
```

**Placement**: Inside the existing FIRE Strategy panel (near the Safe/Exact/DWZ buttons and the buffer sliders) so it groups with other tax-strategy controls.

**Persistence**: Append `'safetyMargin'` to `PERSIST_IDS`. Append `safetyMargin: { el: 'safetyMarginVal', fmt: v => v + '%' }` to `SLIDER_LABELS`.

**Validation**: clamped to 0–10 by `<input type="range" min="0" max="10">`. `getInputs()` reads the DOM value, divides by 100, defaults to 0.05 if missing or NaN.

---

## Control 2 — Rule of 55 checkbox

**DOM**:
```html
<div class="input-group">
  <label style="display:flex;align-items:center;gap:8px">
    <input type="checkbox" id="rule55Enabled" onchange="recalcAll()">
    <span data-i18n="bracketFill.rule55Label">Plan to use Rule of 55</span>
    <span class="info-tip" data-i18n-tip="bracketFill.rule55Tip"
          data-tip="If you separate from your employer at age 55+, that employer's 401(k) unlocks penalty-free 4.5 years earlier than 59.5. Only covers the one plan you separated from.">?</span>
  </label>
</div>
```

**Persistence**: Append `'rule55Enabled'` to `PERSIST_IDS`. (Checkbox `.value` serialization uses `.checked` — `saveState` / `restoreState` already handle checkbox-shaped inputs correctly per feature 005's design; if not, a small extension captures `.checked` as `'1'`/`'0'`.)

**Visibility**: Always visible on both dashboards. Default unchecked.

---

## Control 3 — Rule of 55 Separation Age input

**DOM**:
```html
<div class="input-group" id="rule55SeparationAgeGroup">
  <label>
    <span data-i18n="bracketFill.rule55SeparationAgeLabel">Separation age (year you leave employer)</span>
    <span class="info-tip" data-i18n-tip="bracketFill.rule55SeparationAgeTip"
          data-tip="The calendar-year age at which you separate from your current employer. Must be 55 or higher for the rule to apply; if you leave earlier, you can't use Rule of 55.">?</span>
  </label>
  <input type="number" id="rule55SeparationAge" min="50" max="65" value="54"
    onchange="recalcAll()">
</div>
```

**Placement**: Directly below the Rule of 55 checkbox. Wrap in a container that sets `display: none` when the checkbox is unchecked.

**Persistence**: Append `'rule55SeparationAge'` to `PERSIST_IDS`.

**Validation**:
- Range 50–65 enforced by input min/max.
- If `rule55Enabled && rule55SeparationAge < 55`, show a visible warning below the input: "Rule of 55 requires separation at age 55 or older — defaulting to 59.5 unlock." (`data-i18n="bracketFill.rule55InvalidSeparation"`)
- Default: initialized to the current computed FIRE age. Kept in sync via a small listener that updates the input's value whenever the calculated FIRE age changes, UNLESS the user has manually edited the separation age (detect via `data-user-edited`).

---

## Control 4 — IRMAA threshold input

**DOM**:
```html
<div class="input-group">
  <label>
    <span data-i18n="bracketFill.irmaaThresholdLabel">IRMAA Tier 1 threshold (MFJ)</span>
    <span class="info-tip" data-i18n-tip="bracketFill.irmaaThresholdTip"
          data-tip="MAGI above this level triggers Medicare Part B & D premium surcharges two years later. Default 2026 MFJ: $212K. Single: $106K. Enter 0 to disable IRMAA protection.">?</span>
  </label>
  <input type="number" id="irmaaThreshold" min="0" step="1000" value="212000"
    onchange="recalcAll()">
</div>
```

**Placement**: Adjacent to the existing tax-bracket inputs (`#twStdDed`, `#twTop12`, `#twTop22`).

**Persistence**: Append `'irmaaThreshold'` to `PERSIST_IDS`.

**Default behavior**:
- RR: always 212000 (hardcoded MFJ).
- Generic: auto-swap between 212000 (MFJ) and 106000 (Single) via `applyFilingStatusDefaults(isMFJ)` helper, unless the user has edited the input (tracked via `data-user-edited`).

**Disabled state**: value `0` or blank disables IRMAA protection. A small hint below the input says "⚠️ IRMAA protection disabled" (`data-i18n="bracketFill.irmaaDisabled"`).

---

## Info Panel (expandable)

**DOM**:
```html
<details class="bracketFill-info">
  <summary data-i18n="bracketFill.infoSummary">📖 What is bracket-fill smoothing? (click to expand)</summary>
  <div class="bracketFill-info__body">
    <p data-i18n-html="bracketFill.infoBody1">...plain English explanation...</p>
    <p data-i18n-html="bracketFill.infoBody2">...safety margin explanation...</p>
    <p data-i18n-html="bracketFill.infoBody3">...IRMAA / Rule of 55 / 5-year Roth definitions...</p>
    <p data-i18n-html="bracketFill.infoBody4">...when it saves vs. when it doesn't...</p>
  </div>
</details>
```

**Placement**: Below the FIRE Strategy panel, above the Lifetime Withdrawal Strategy chart.

**Default state**: collapsed. No JS required — uses native `<details>` / `<summary>`.

**Styling**: reuse the existing `.tw-summary` / `.coast-fire-note` CSS pattern so it matches other expandable panels.

---

## `getInputs()` extension

Feature 007 additions to the return object:

```js
function getInputs() {
  const inp = {
    // ... existing fields ...
  };
  
  // Feature 007 — Bracket-fill tax smoothing
  const sm = document.getElementById('safetyMargin');
  inp.safetyMargin = (parseFloat((sm||{}).value) || 5) / 100;
  
  const r55 = document.getElementById('rule55Enabled');
  const r55Age = document.getElementById('rule55SeparationAge');
  inp.rule55 = {
    enabled: !!(r55 && r55.checked),
    separationAge: parseInt((r55Age||{}).value) || (inp.ageRoger + (yearsToFIREcache || 0)),
  };
  
  const irmaa = document.getElementById('irmaaThreshold');
  inp.irmaaThreshold = parseFloat((irmaa||{}).value) || 0;
  
  return inp;
}
```

Defensive parsing so a missing DOM element (e.g., during early init) doesn't throw.

---

## Lockstep rules

- Safety Margin slider: **identical on both files** (same DOM, same ID, same defaults).
- Rule of 55 + separation age: **identical on both files**.
- IRMAA threshold: **identical DOM** on both files; only the default value differs on Generic (auto-swap via `applyFilingStatusDefaults`). RR keeps 212000 hardcoded.
- Info panel: **identical on both files**.

---

## Test Hooks (Phase 3 QA)

- DOM: `#safetyMargin`, `#rule55Enabled`, `#rule55SeparationAge`, `#irmaaThreshold` all exist in both HTML files.
- Persistence: after setting each control and reloading the page, the value round-trips.
- `getInputs()`: returns `inp.safetyMargin`, `inp.rule55`, `inp.irmaaThreshold` with the expected defaults + user-set values.
- Validation: setting `#rule55SeparationAge` to 54 with `#rule55Enabled` checked shows the validation warning and the algorithm falls back to 59.5.
- Generic + filing-status change: toggling household configuration from "has partner" to "solo" updates the IRMAA threshold to 106000 and the std-ded / 12%-cap defaults to 15000 / 47150 (via `applyFilingStatusDefaults`) — unless user has edited those inputs manually.
- i18n: each new user-visible string has EN and zh-TW values in `TRANSLATIONS` and the strings render correctly on language switch.
