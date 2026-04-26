# Contract — Tab Routing (`tabRouter.js`)

**Feature**: `013-tabbed-navigation`
**Module**: `calc/tabRouter.js`
**Consumers**: tab/pill DOM containers in `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`; chart-init code (calls `registerChart`); cross-pill click handlers (e.g., country-card click).

---

## Public API surface

The module attaches to `window.tabRouter` and exposes exactly these methods:

```text
window.tabRouter = {
  init(options),
  activate(tabId, pillId, source),
  registerChart(pillId, chartInstance),
  getState(),
}
```

### `init(options)`

Called once at page load after DOM is ready and after all charts have been registered.

**Inputs:**

```text
options = {
  tabs: Tab[],                    // entity definitions from data-model
  rootEl: HTMLElement,            // container holding all .tab elements
  tabBarEl: HTMLElement,          // the top tab pill bar
  pillBarsByTab: {<tabId>: HTMLElement},  // sub-tab pill bars per tab
  storage: Storage = localStorage,        // injectable for tests
  win: Window = window,                   // injectable for tests
}
```

**Outputs:** none (side-effects: initial activation, event listener setup, popstate listener attached).

**Behavior:**

1. Read URL hash via `win.location.hash`. Parse `#tab=<id>&pill=<id>`.
2. If hash valid → resolve `(tab, pill)`; use `replaceState` to normalize URL.
3. Else: read `storage.getItem('dashboardActiveView')`. If valid JSON with valid IDs → resolve `(tab, pill)`; use `replaceState` to write hash.
4. Else: default to `('plan', 'profile')`; use `replaceState`.
5. Apply DOM activation: add `.active` class to selected tab/pill, `[hidden]` attribute on others.
6. Resize charts registered for the active pill.
7. Bind click listeners on every tab and every pill (delegated from `tabBarEl` and each `pillBarsByTab[tabId]`).
8. Bind `popstate` listener on `win`.
9. Bind `Next →` button click handlers (any element with `data-action="next-pill"`).
10. Bind sticky-header sentinel observer to active tab's sentinel.

### `activate(tabId, pillId, source = 'click')`

Public method called by all activation triggers (pill clicks, tab clicks, `Next →`, country-card cross-pill).

**Inputs:**

| Param | Type | Validation |
|-------|------|------------|
| `tabId` | string | Must be one of the 4 known IDs; else fall back to `'plan'` (FR-026). |
| `pillId` | string | Must be a valid pill of the named tab; else fall back to first pill of tab (FR-027). |
| `source` | `'click' \| 'load' \| 'popstate' \| 'programmatic'` | Drives `pushState` vs `replaceState`. Default `'click'`. |

**Outputs:** none. Side effects:

1. Compute resolved `(tab, pill)` after fallback.
2. If `(tab, pill)` equals current state → no-op (FR-014).
3. Update internal state.
4. Update DOM:
   - Remove `.active` from previously-active tab/pill.
   - Add `.active` to newly-active tab/pill.
   - Set `[hidden]` on previously-active pill content.
   - Remove `[hidden]` from newly-active pill content.
5. Update URL hash:
   - `source === 'click'` → `pushState`.
   - `source === 'load'` or `source === 'popstate'` → `replaceState` (for popstate, the hash is already updated by the browser; calling `replaceState` is a no-op assertion).
   - `source === 'programmatic'` → `pushState` (treat as user-initiated).
6. Write to localStorage via `try/catch`. On failure, log a debug message; in-memory state continues.
7. Resize all charts registered for the new pill (`registerChart`).
8. Rebind sticky-header sentinel observer to new tab's sentinel (no-op if same tab).

### `registerChart(pillId, chartInstance)`

Called once per chart, after the chart is initialized.

**Inputs:**

- `pillId`: string — the pill that hosts this chart's canvas.
- `chartInstance`: a Chart.js instance (object with a `.resize()` method).

**Outputs:** none. Side effect: appends to internal registry `_chartsByPill[pillId]`.

**Validation:** if `pillId` is not a valid pill ID, throw a developer error (this catches typos at chart-init time rather than silently failing).

### `getState()`

Read-only accessor for testing and for cross-pill click handlers that want to know the current state.

**Inputs:** none.

**Outputs:** `{tab: <id>, pill: <id>}` — a fresh object (not a live reference).

---

## URL hash format

Format: `#tab=<tabId>&pill=<pillId>`

- `tabId` MUST match `^[a-z]+$` (one of `plan`, `geography`, `retirement`, `history`).
- `pillId` MUST match `^[a-z][a-z0-9-]*$` (kebab-case).
- Order of `tab` and `pill` params is fixed for canonical URLs but the parser accepts either order.
- Unknown extra params are ignored (FR-026 edge case).
- Missing or empty `tab` or `pill` triggers fallback per FR-026/FR-027.

**Examples (all valid)**:

- `#tab=plan&pill=profile`
- `#tab=retirement&pill=ss`
- `#tab=geography&pill=country-deep-dive`

**Examples (invalid → fallback)**:

- `#tab=foo&pill=bar` → fall back to `('plan', 'profile')`.
- `#tab=plan&pill=xyz` → fall back to `('plan', 'profile')` (first pill of named tab).
- `#` (empty hash) → use localStorage; if empty, default.

---

## localStorage shape

**Key**: `dashboardActiveView`
**Value**: JSON-stringified object `{tab: <tabId>, pill: <pillId>}`.

**Examples**:

```json
{"tab": "plan", "pill": "profile"}
{"tab": "retirement", "pill": "lifecycle"}
```

**Read failure modes**:
- Key missing → fall back to default.
- Value is not valid JSON → fall back to default.
- Value is valid JSON but missing `tab` or `pill` → fall back to default.
- Value has unknown `tab` → fall back to `('plan', 'profile')`.
- Value has known `tab` but unknown `pill` → fall back to first pill of named tab.

**Write failure modes**:
- `setItem` throws (private browsing quota) → catch, log debug, continue with in-memory state. Do NOT use the `[shim-name]` prefix in the log (this is not a calc shim).

---

## `popstate` handling

When the user navigates Back/Forward, the browser updates `location.hash` and fires a `popstate` event. The router:

1. Reads the new hash.
2. Calls `activate(tab, pill, 'popstate')` with the parsed values.
3. The `popstate` source code path uses `replaceState` (no new history entry for the synthetic activation).

If the hash is invalid after Back/Forward, fall back per FR-026/FR-027 and `replaceState` to the canonical URL.

---

## `Next →` button handling

Every card that needs a Next button gets a button element with:

```text
<button type="button" data-action="next-pill" data-i18n="nav.next">Next →</button>
```

The router binds a single delegated click handler on `rootEl` that:

1. Catches clicks on `[data-action="next-pill"]`.
2. Reads the closest `.pill[data-tab][data-pill]` ancestor.
3. Computes `nextPill = currentTab.pills[currentTab.pills.indexOf(currentPill) + 1]`.
4. If `nextPill` is undefined (current is last pill in tab) → no-op (button should be `disabled`, but this is a defensive guard).
5. Else → `activate(currentTab.id, nextPill.id, 'click')`.

The `disabled` attribute on Next buttons of last pills is set declaratively in markup OR programmatically by `tabRouter.init()` walking the DOM and disabling the appropriate buttons.

---

## Error handling

All public methods MUST be defensive:
- Invalid tab/pill IDs from any source → fallback per FR-026/FR-027, never throw to caller.
- localStorage failures → catch and continue.
- `popstate` with malformed hash → fallback and `replaceState`.

Internal helpers (registry lookups, ID validation) MAY throw developer errors when called with obviously-wrong inputs (e.g., `registerChart('typo-pill-id', ...)`) — these are bugs that should fail loud at dev time.

---

## Test surface

`tests/unit/tabRouter.test.js` MUST cover:

- T1: `init` with no hash, no localStorage → activates `('plan', 'profile')`; URL is `#tab=plan&pill=profile`.
- T2: `init` with valid hash → activates from hash, ignores localStorage.
- T3: `init` with invalid hash but valid localStorage → activates from localStorage; URL normalizes to canonical hash.
- T4: `init` with both invalid → activates default; both localStorage and URL normalized.
- T5: `activate` with invalid tab → falls back to `('plan', 'profile')`; URL/localStorage updated.
- T6: `activate` with valid tab + invalid pill → falls back to first pill of tab.
- T7: `activate` with same `(tab, pill)` as current → no-op (no DOM mutation, no URL/storage write).
- T8: `popstate` event drives state from new hash; uses `replaceState`.
- T9: `setItem` throws → state remains in-memory; no exception bubbles.
- T10: `registerChart` with unknown pillId → throws developer error.
- T11: `getState()` returns a fresh object copy.

E2E tests in `tests/e2e/tab-navigation.spec.ts` cover the integrated flow with real DOM and Chart.js (see `quickstart.md`).
