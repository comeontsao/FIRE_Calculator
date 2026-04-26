# Contract — SSA Earnings Record UI Controls

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**File**: `FIRE-Dashboard-Generic.html`

## DOM structure (NEW additions only)

Inserted inside the existing `<div class="card span-3 surface--secondary">` that contains the SSA Earnings Record (between the existing `<button data-i18n="ss.addYear">` and the Credits display line — lines ~2835–2839 today).

```html
<!-- REPLACE the single "+ Add Year" button with a 2-column grid of buttons -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
  <button class="btn-secondary" onclick="addSSPriorYear()"
          data-i18n="ss.addPriorYear"
          style="padding:6px;font-size:0.82em">+ Add Prior Year</button>
  <button class="btn-secondary" onclick="addSSYear()"
          data-i18n="ss.addYear"
          style="padding:6px;font-size:0.82em">+ Add Year</button>
</div>

<!-- NEW: bulk earliest-year entry, low visual weight -->
<div style="display:flex;gap:6px;align-items:center;font-size:0.78em;margin-bottom:4px">
  <label for="ssEarliestYear"
         data-i18n="ss.earliestYearLabel"
         style="color:var(--text-dim);flex:1">Earliest year</label>
  <input type="number" id="ssEarliestYear"
         min="1960"
         style="width:72px;padding:3px 6px;text-align:right;font-size:0.9em;
                background:var(--bg);border:1px solid var(--border);
                border-radius:4px;color:var(--text)">
  <button class="btn-secondary" onclick="setEarliestYearFromInput()"
          data-i18n="ss.earliestYearSet"
          style="padding:4px 10px;font-size:0.78em">Set</button>
</div>

<!-- NEW: inline status line, a11y-announced -->
<div id="ssEarningsStatus"
     role="status"
     aria-live="polite"
     style="font-size:0.75em;color:var(--text-dim);min-height:1.2em;margin-bottom:6px"></div>

<!-- UNCHANGED: the "Credits: N / 40" tally line continues below this point -->
```

## JS wiring (inline helpers in the dashboard)

```js
// Thin delegation to calc/ssEarningsRecord.js. No calc logic inline.
async function addSSPriorYear() {
  const { prependPriorYear } = await import('./calc/ssEarningsRecord.js');
  const { history, reason } = prependPriorYear(ssEarningsHistory, {
    currentYear: new Date().getFullYear(),
  });
  if (reason === 'floorReached') {
    setSSStatus(t('ss.floorReached', 1960), 'warning');
    return;
  }
  ssEarningsHistory = history;
  buildSSEarningsTable();
  recalcAll();
  try { saveState(); } catch (_e) {}
  setSSStatus(t('ss.yearAccepted', history[0].year), 'dim');
}

async function setEarliestYearFromInput() {
  const { setEarliestYear } = await import('./calc/ssEarningsRecord.js');
  const el = document.getElementById('ssEarliestYear');
  const raw = el && el.value ? parseInt(el.value, 10) : NaN;
  if (!Number.isInteger(raw)) {
    setSSStatus(t('ss.invalidYear', String(el.value || '')), 'warning');
    return;
  }
  const { history, reason } = setEarliestYear(ssEarningsHistory, raw, {
    currentYear: new Date().getFullYear(),
  });
  if (reason === 'noopAlreadyCovered') {
    setSSStatus(t('ss.earliestYearHint', raw), 'dim');
    return;
  }
  if (reason === 'clampedToFloor') {
    ssEarningsHistory = history;
    buildSSEarningsTable();
    recalcAll();
    try { saveState(); } catch (_e) {}
    setSSStatus(t('ss.floorReached', 1960), 'warning');
    return;
  }
  ssEarningsHistory = history;
  buildSSEarningsTable();
  recalcAll();
  try { saveState(); } catch (_e) {}
  setSSStatus(t('ss.yearAccepted', raw), 'dim');
}

function setSSStatus(text, tone /* 'dim' | 'warning' */) {
  const el = document.getElementById('ssEarningsStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = tone === 'warning' ? 'var(--warning)' : 'var(--text-dim)';
  // Auto-clear after 5 seconds
  clearTimeout(el._clearTimer);
  el._clearTimer = setTimeout(() => {
    if (el.textContent === text) el.textContent = '';
  }, 5000);
}
```

## Event wiring contract

| Trigger | Handler | Side effects |
|---------|---------|--------------|
| Click `+ Add Prior Year` | `addSSPriorYear()` | 1. helper call; 2. `ssEarningsHistory` reassigned if success; 3. `buildSSEarningsTable()`; 4. `recalcAll()`; 5. `saveState()`; 6. status text set. |
| Click `+ Add Year` | `addSSYear()` (UNCHANGED) | Existing behaviour. |
| Click `Set` next to "Earliest year" input | `setEarliestYearFromInput()` | Same 6-step effect chain as above. |
| Language toggle while card visible | `switchLanguage` (EXISTING) retriggers `data-i18n` rebind | All 7 new keys update immediately. |

## Accessibility

- `role="status"` + `aria-live="polite"` on `#ssEarningsStatus` announces messages to screen readers without stealing focus.
- All buttons have visible `data-i18n` text content (no icon-only buttons).
- Keyboard: `Tab` reaches `+ Add Prior Year`, `+ Add Year`, the number input, the `Set` button, in that DOM order. All are native `<button>` / `<input>` elements; no custom keyboard handling is introduced.

## Non-goals

- Drag-to-reorder rows (rows are always sorted by year; UI does not expose manual reorder).
- Confirm-dialog before prepending (single-step reversible action — no confirmation needed).
- Showing the year the prepend will target before the click (the button label stays static "+ Add Prior Year" in both languages).
