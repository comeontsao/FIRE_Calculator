# Contract — Adult Counter UI and DOM

**Scope:** `FIRE-Dashboard-Generic.html` only. The counter, its event handlers, and the visibility-synchronization helper for Person 2 inputs.

---

## 1. DOM structure — the "Household composition" block

The block lives inside the Profile & Income card, directly above the current children UI (line range ~2015–2036 today), replacing the stand-alone Person 1 / Person 2 birthday rows' labeling with a two-counter group. Exact final tree:

```html
<!-- Household composition (feature-009) — Adults + Children counters, side-by-side -->
<div class="household-composition" style="grid-column:1/-1;margin:4px 0 10px 0;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">

  <!-- Label spanning both counters -->
  <div style="font-size:0.72em;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);flex-basis:100%">
    <span data-i18n="profile.householdComposition">Household composition</span>
  </div>

  <!-- Adults counter -->
  <div class="counter-group" data-counter="adults" style="display:flex;align-items:center;gap:8px">
    <label style="font-size:0.9em">
      <span data-i18n="profile.adults">Adults</span>
      <span class="info-tip" data-i18n-tip="profile.adultsTip" data-tip="Set to 1 to switch tax brackets, healthcare scaling, and Social Security to single-person defaults. Person 2 inputs are hidden but preserved.">?</span>
    </label>
    <button type="button" id="adultCountDec" aria-label="Decrease adults" data-i18n-aria="profile.adultsDec"
      onclick="changeAdultCount(-1)" class="counter-btn">−</button>
    <span id="adultCountDisplay" style="min-width:1.4em;text-align:center;font-weight:700;color:var(--accent2)">2</span>
    <button type="button" id="adultCountInc" aria-label="Increase adults" data-i18n-aria="profile.adultsInc"
      onclick="changeAdultCount(+1)" class="counter-btn">+</button>
    <input type="hidden" id="adultCount" value="2">
  </div>

  <!-- Children counter (existing ± buttons live here; the buttons themselves are not changed by this feature) -->
  <div class="counter-group" data-counter="children" style="display:flex;align-items:center;gap:8px">
    <label style="font-size:0.9em">
      <span data-i18n="profile.children">Children</span>
    </label>
    <button type="button" onclick="removeLastChild()" id="removeChildBtnCompact" class="counter-btn">−</button>
    <span id="childCountDisplay" style="min-width:1.4em;text-align:center;font-weight:700;color:var(--accent2)">0</span>
    <button type="button" onclick="addChild()" class="counter-btn">+</button>
  </div>
</div>
```

- `style` attributes are illustrative of the contract, not literal — tasks may polish them. What matters is:
  - A single `.household-composition` wrapper contains BOTH counters, labeled by the `profile.householdComposition` key.
  - The Adults counter is the FIRST counter in the block (left in LTR layouts).
  - `<input type="hidden" id="adultCount">` is present and always matches the displayed `<span id="adultCountDisplay">` integer.
  - The children counter's existing `addChild()` / `removeLastChild()` handlers are preserved; this feature ONLY adds the Adults counter pattern beside them. It may also surface a `#childCountDisplay` readout for visual symmetry (nice-to-have; not a spec requirement).

---

## 2. CSS class `.counter-btn`

Shared button style for `±` controls. Minimum-viable definition (additive to existing CSS):

```css
.counter-btn {
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  font-size: 1.05em;
}
.counter-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- Disabled state is applied via the native `disabled` HTML attribute (toggled programmatically) — NOT via a separate class.

---

## 3. Click handler — `changeAdultCount(delta)`

Single entry point for mutation. Contract:

**Inputs:**
- `delta`: integer, expected `+1` or `-1`. Any other value is clamped at the target-range boundary.

**Outputs:** none (side effects on DOM + localStorage).

**Side effects (in order):**
1. Read the current value from `#adultCount` (fallback `2`).
2. Compute `next = Math.max(1, Math.min(2, current + delta))`.
3. If `next === current`, return early (no-op — defense-in-depth against clicks on disabled buttons).
4. Write `next` to `#adultCount.value` and to `#adultCountDisplay.textContent`.
5. Call `syncAdultCountVisibility()` — toggles CSS visibility of Person 2 input-groups.
6. Call `applyFilingStatusDefaults(next === 2)` — feature-007 integration; swaps `irmaaThreshold` / `twStdDed` / `twTop12` defaults respecting `data-user-edited`.
7. Update the `+` / `-` button `disabled` attributes to reflect the new bounds (`next === 1` ⇒ dec disabled; `next === 2` ⇒ inc disabled).
8. Call `saveState()` to persist.
9. Call `recalcAll()` to re-render every chart / KPI.

**Purity:** this function is a thin DOM-mutating orchestrator; it does not compute any financial value itself. All math flows through `recalcAll`.

---

## 4. Visibility helper — `syncAdultCountVisibility()`

Single point that knows which elements to hide/show based on `#adultCount.value`.

**Inputs:** none (reads DOM directly).
**Outputs:** none (mutates `style.display` on a closed list of input-group wrappers).

**Closed list of elements hidden when `adultCount === 1`:**
- The `.input-group` wrapping `#bdPerson2` (Person 2 Birthday).
- The `.input-group` wrapping `#person2Stocks` (Person 2 Stocks/Brokerage).
- The `.input-group` wrapping `#ssSpouseOwn` (Spouse's own SS monthly benefit override).

Optionally — styled as a de-emphasized column in the snapshot history table when `adultCount === 1` (FR-008). Styling approach is Phase-2; the contract only requires the column not be visually prominent.

**Behavioral invariant:** `display: none` on the wrapping `.input-group`, NOT `visibility: hidden`. The latter would leave a blank slot in the grid layout.

**Idempotent:** Can be called any number of times without side effect. Safe to call from `restoreState` after loading a persisted `adultCount === 1`.

---

## 5. Initial boot sequence

At the end of `restoreState()` (or at the bottom of the bootstrap block if no persisted state exists):

1. Read `#adultCount.value`.
2. Call `syncAdultCountVisibility()` once — ensures Person 2 inputs are hidden if the user last saved the page at `adultCount === 1`.
3. Set `+` / `-` button `disabled` attributes from the current value.
4. Call `applyFilingStatusDefaults(adultCount === 2)` (already part of the existing feature-007 boot flow at lines 3164–3168; needs to pass the new `adultCount`-keyed filing status instead of the current `agePerson2`-keyed check).

---

## 6. Accessibility requirements

- Each counter button has an `aria-label` (EN default, `data-i18n-aria` provides the i18n key for dynamic re-label on language toggle).
- The displayed count is not an editable text input; screen readers read the adjacent label + the span value.
- When disabled, the `disabled` attribute is set (screen readers announce it).

---

## 7. Non-goals (explicitly)

- **Editable numeric input for adult count.** Out of scope; the counter is strictly `±` only.
- **Head-of-Household filing status.** Out of scope (FR-026).
- **Three-adult households.** Out of scope; counter hard-capped at 2 (FR-028).
- **Shared counter CSS component extracted to a `.css` file.** Out of scope; matches the zero-build architecture (Principle V) by leaving styles inline.
- **Synchronizing the Adults counter to the existing Children `+ Add Child` / `− Remove Child` full-width buttons.** Those buttons are preserved as-is; the new compact `.counter-group` for children is an optional visual-symmetry nicety, not a requirement.
