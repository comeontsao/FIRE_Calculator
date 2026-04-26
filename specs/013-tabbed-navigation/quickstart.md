# Quickstart — Verifying Tabbed Dashboard Navigation

**Feature**: `013-tabbed-navigation`
**Audience**: a developer or QA engineer who wants to verify the feature end-to-end after implementation, before merge.

This is the manual checklist that supplements the automated test suites (`tests/unit/tabRouter.test.js` and `tests/e2e/tab-navigation.spec.ts`). All steps below must pass on **both** `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## Prerequisites

```bash
# Serve the dashboards locally
python -m http.server 8766
# Open in two browser tabs
# - http://localhost:8766/FIRE-Dashboard.html
# - http://localhost:8766/FIRE-Dashboard-Generic.html
```

Open DevTools console in both tabs.

---

## Step 1 — First-time visitor lands on Plan / Profile (FR-025)

1. Open DevTools → Application → Local Storage → clear `dashboardActiveView` if present.
2. Navigate to the dashboard URL with no hash.
3. Hard reload (Ctrl+Shift+R / Cmd+Shift+R).

**Expected**:
- The Plan tab is the active tab (highlighted).
- The Profile pill is the active pill.
- Profile & Income card is visible; all other cards hidden.
- URL hash is `#tab=plan&pill=profile`.
- Console shows zero red errors.

---

## Step 2 — All 4 tabs render with correct labels and pills (FR-001 to FR-005)

1. Visually confirm 4 tabs in the top bar: **Plan · Geography · Retirement · History** (in that order).
2. Click each tab in turn.
3. For each tab, count and verify the pills:
   - **Plan**: 6 pills — Profile, Assets, Investment, Mortgage, Expenses, Summary
   - **Geography**: 4 pills — Scenarios, Country Chart, Healthcare, Country Deep-Dive
   - **Retirement**: 5 pills — Social Security, Withdrawal Strategy, Drawdown, Lifecycle, Milestones
   - **History**: 1 pill — Snapshots

**Expected**:
- Each tab activation flips the active class and switches the visible content.
- Each pill activation shows only that pill's card(s).
- Console stays clean.

---

## Step 3 — Persistent chrome stays visible across all tabs (FR-015, FR-016, SC-010)

1. Note the position of the KPI ribbon (FIRE age, years-to-FIRE, progress, net worth).
2. Note the right-edge pinned Lifecycle sidebar (with the mini lifecycle chart inside).
3. Note the FIRE-mode gate selector (Safe / Exact / DWZ).
4. Switch to each of the 4 tabs.

**Expected**:
- KPI ribbon remains visible in every tab.
- Right-edge Lifecycle sidebar remains visible and continues to render the mini lifecycle chart.
- Gate selector remains accessible.
- Site header and language toggle remain visible.

---

## Step 4 — Charts render correctly inside their pills (FR-013, SC-004)

1. Open Retirement → **Lifecycle**. The big lifecycle chart should appear filled to its container width within ~200ms; no zero-width rendering.
2. Switch to Retirement → **Drawdown**. The drawdown chart appears at correct width.
3. Switch to Retirement → **Social Security**. The SS chart and projection table appear.
4. Switch to Retirement → **Milestones**. The milestone timeline chart appears.
5. Open Geography → **Country Chart**. The country bar chart appears.
6. Open Geography → **Healthcare**. The healthcare comparison chart appears.
7. Open Plan → **Summary**. Three cards (Savings Rate, Net Worth pie, Expense pie) all render with their charts visible.

**Expected**:
- Every chart paints at full width inside its pill.
- No chart is clipped, blank, or zero-width.
- Switching to a pill with charts is visually instant (≤200ms).

---

## Step 5 — `Next →` button workflow (FR-018, FR-019)

1. Open Plan → Profile.
2. Confirm a `Next →` button is present at the bottom of the card.
3. Click `Next →`. Confirm Plan → **Assets** is now active.
4. Continue clicking `Next →`: Investment → Mortgage → Expenses → Summary.
5. On Plan → **Summary**, confirm the `Next →` button is **disabled** (grayed out, click does nothing).
6. Repeat the walk-through inside Geography (Scenarios → Country Chart → Healthcare → Country Deep-Dive) and Retirement (SS → Withdrawal → Drawdown → Lifecycle → Milestones).
7. On the last pill of each tab, confirm `Next →` is disabled.
8. On History → Snapshots (single-pill tab), confirm `Next →` is either absent or disabled.

**Expected**:
- `Next →` advances exactly one pill within the same tab.
- Last-pill `Next →` is disabled in every tab.
- No tab boundary auto-cross (Plan/Summary's Next does NOT jump to Geography/Scenarios).

---

## Step 6 — Persistence across reload (FR-021, FR-022, SC-005)

1. Navigate to Retirement → Lifecycle.
2. Confirm URL hash is `#tab=retirement&pill=lifecycle`.
3. Confirm DevTools → Application → Local Storage → `dashboardActiveView` is `{"tab":"retirement","pill":"lifecycle"}`.
4. Hard reload (Ctrl+Shift+R).

**Expected**:
- Page reopens on Retirement → Lifecycle within 2 seconds.
- URL still shows `#tab=retirement&pill=lifecycle`.
- Lifecycle chart renders correctly.

---

## Step 7 — Deep link from a fresh browser session (FR-024, SC-006)

1. Copy URL `http://localhost:8766/FIRE-Dashboard-Generic.html#tab=geography&pill=healthcare`.
2. Open a new private/incognito window (clean localStorage).
3. Paste the URL and load.

**Expected**:
- Page opens directly on Geography → Healthcare.
- Healthcare chart renders.
- localStorage in the new window has `dashboardActiveView` = `{"tab":"geography","pill":"healthcare"}` after first interaction.

---

## Step 8 — Invalid hash falls back gracefully (FR-026, FR-027)

1. In a clean window, load `http://localhost:8766/FIRE-Dashboard-Generic.html#tab=foo&pill=bar`.

**Expected**:
- Page opens on Plan → Profile (default fallback).
- URL normalizes to `#tab=plan&pill=profile` after a moment (replaceState).
- No console error.

2. In a clean window, load `http://localhost:8766/FIRE-Dashboard-Generic.html#tab=plan&pill=xyz`.

**Expected**:
- Page opens on Plan → Profile (first pill of named tab).
- URL normalizes.

---

## Step 9 — Browser Back / Forward navigates through history (FR-028, SC-013)

1. Start on Plan → Profile.
2. Click Plan → Assets.
3. Click Plan → Investment.
4. Click Geography (top tab).
5. Press the browser **Back** button three times.

**Expected**: each Back step regresses the active view exactly one step:
- Back 1 → Plan / Investment.
- Back 2 → Plan / Assets.
- Back 3 → Plan / Profile.

6. Press **Forward** three times. Each Forward advances one step in the opposite direction.

URL hash and active classes update on each Back/Forward.

---

## Step 10 — Country card cross-pill click (FR-029)

1. Navigate to Geography → Scenarios.
2. Click any country card in the country grid.

**Expected**:
- Active pill switches to **Country Deep-Dive** automatically.
- Deep-dive panel content updates with the clicked country's details.
- URL hash updates to `#tab=geography&pill=country-deep-dive`.

---

## Step 11 — Mobile horizontal scroll (FR-030, FR-031, SC-011)

1. Open DevTools → Device Toolbar → set viewport to ≤767px (e.g., iPhone SE 375×667).
2. Reload.

**Expected**:
- Top tab pill bar is in a single horizontal row (no wrap).
- Sub-tab pill bar is in a single horizontal row (no wrap).
- If the bars overflow horizontally, they scroll on touch/drag.
- Active pill remains visible (or becomes visible by scrolling).
- Site header, KPI ribbon, gate selector, content area all readable.

3. Touch-drag the sub-tab pill bar left and right.

**Expected**:
- Smooth horizontal scroll.
- Pill activation still works on tap (drag does NOT trigger activation).

---

## Step 12 — Language toggle preserves pill state (FR-035)

1. Navigate to Retirement → Withdrawal Strategy.
2. Toggle language EN → zh-TW.

**Expected**:
- Active tab is still Retirement (label now displays `退休`).
- Active pill is still Withdrawal Strategy (label now displays `提款策略`).
- All pill labels in the active tab display in zh-TW.
- Card content within Withdrawal Strategy displays in zh-TW.
- URL hash unchanged.

3. Toggle back to EN.

**Expected**: same active state, labels back in EN.

---

## Step 13 — Quick What-If is fully removed (SC-012)

```bash
grep -in "quickwhatif\|whatif" FIRE-Dashboard.html FIRE-Dashboard-Generic.html
```

**Expected**: zero matches.

```bash
grep -in "quickwhatif\|whatif" "FIRE-Dashboard Translation Catalog.md"
```

**Expected**: zero matches.

---

## Step 14 — Existing unit tests still pass (FR-036, SC-007)

```bash
node --test "tests/unit/*.test.js"
```

**Expected**:
- All existing 161 tests pass.
- New `tests/unit/tabRouter.test.js` tests pass.
- Total test count = 161 + N (where N is the count of new `tabRouter` tests, typically ~11 per the contract test surface).

---

## Step 15 — Browser smoke per CLAUDE.md "FIRE-mode gates" rule

This is the same browser-smoke gate the project requires before any feature touching the boot path is declared done.

For each tab and each pill (16 pill activations × 2 files = 32 walks):

1. Wait 2 seconds for cold load.
2. Confirm every KPI card shows a numeric value (NOT "Calculating…", NaN, $0, "—", or "40+").
3. Open DevTools console. Confirm zero red errors AND zero `[shim-name] canonical threw:` messages (SC-008).
4. Drag the FIRE marker on the lifecycle chart (where present); confirm same-frame update.

If any pill activation produces a NaN, an error, or a Calculating… stuck state, that is a regression of either Feature 005 (canonical shim defense-in-depth) or this feature's chart-resize-on-activation logic.

---

## Step 16 — Lockstep DOM diff between RR and Generic (SC-009)

`tests/e2e/tab-navigation.spec.ts` runs an automated DOM-diff. Manually:

1. Open both files in DevTools.
2. In console of each file, run:

```js
JSON.stringify({
  tabs: [...document.querySelectorAll('#tabBar .tab')].map(b => b.dataset.tab),
  pills: [...document.querySelectorAll('.pill')].map(p => `${p.dataset.tab}:${p.dataset.pill}`),
  hosts: [...document.querySelectorAll('.pill-host')].map(h => `${h.dataset.tab}:${h.dataset.pill}`),
})
```

**Expected**: the JSON output is byte-identical between the two files.

---

## All-green criteria

This feature is ready to merge when:

- ✅ All 16 manual steps above pass on both HTML files.
- ✅ All 161 existing unit tests pass.
- ✅ All new `tabRouter` unit tests pass.
- ✅ All new Playwright E2E tests pass (DOM-diff, deep-link, mobile responsive).
- ✅ `grep -in "quickwhatif\|whatif"` returns zero matches in both HTML files and the catalog.
- ✅ Browser smoke walk produces zero red console errors and zero `[shim-name] canonical threw:` messages.
- ✅ `FIRE-Dashboard-Roadmap.md` updated with the feature's status.
- ✅ README's "What's next" section updated to "Recently shipped" with link to closeout.
