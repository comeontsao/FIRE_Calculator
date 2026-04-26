# Contract — Tab UI Markup, IDs, Classes, CSS State

**Feature**: `013-tabbed-navigation`
**Files affected**: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` — both must use IDENTICAL markup, IDs, and classes per Constitution Principle I.

---

## Top-level page structure (after the change)

```text
<body>
  <header id="siteHeader">…</header>             <!-- existing, unchanged -->
  <div id="kpiRibbon">…</div>                    <!-- existing, unchanged -->
  <div id="gateSelector">…</div>                 <!-- existing FIRE-mode (Safe/Exact/DWZ) selector -->

  <nav id="tabBar" class="tab-bar" role="tablist" aria-label="Dashboard sections">
    <button class="tab" data-tab="plan"       role="tab" aria-controls="tab-plan"       data-i18n="nav.tab.plan">Plan</button>
    <button class="tab" data-tab="geography"  role="tab" aria-controls="tab-geography"  data-i18n="nav.tab.geography">Geography</button>
    <button class="tab" data-tab="retirement" role="tab" aria-controls="tab-retirement" data-i18n="nav.tab.retirement">Retirement</button>
    <button class="tab" data-tab="history"    role="tab" aria-controls="tab-history"    data-i18n="nav.tab.history">History</button>
  </nav>

  <div id="tabContainer" class="tab-container">
    <section id="tab-plan" class="tab-panel" data-tab="plan" role="tabpanel" aria-labelledby="…">
      <div class="tab-scroll-sentinel" aria-hidden="true"></div>
      <nav class="pill-bar" role="tablist" aria-label="Plan sections">
        <button class="pill" data-tab="plan" data-pill="profile"    role="tab" data-i18n="nav.pill.profile">Profile</button>
        <button class="pill" data-tab="plan" data-pill="assets"     role="tab" data-i18n="nav.pill.assets">Assets</button>
        <button class="pill" data-tab="plan" data-pill="investment" role="tab" data-i18n="nav.pill.investment">Investment</button>
        <button class="pill" data-tab="plan" data-pill="mortgage"   role="tab" data-i18n="nav.pill.mortgage">Mortgage</button>
        <button class="pill" data-tab="plan" data-pill="expenses"   role="tab" data-i18n="nav.pill.expenses">Expenses</button>
        <button class="pill" data-tab="plan" data-pill="summary"    role="tab" data-i18n="nav.pill.summary">Summary</button>
      </nav>

      <div class="pill-host" data-tab="plan" data-pill="profile">
        <!-- existing Profile & Income card markup, unchanged -->
        <button type="button" class="next-pill-btn" data-action="next-pill" data-i18n="nav.next">Next →</button>
      </div>
      <div class="pill-host" data-tab="plan" data-pill="assets" hidden>
        <!-- existing Current Assets card markup, unchanged -->
        <button type="button" class="next-pill-btn" data-action="next-pill" data-i18n="nav.next">Next →</button>
      </div>
      <!-- ... investment, mortgage, expenses ... -->
      <div class="pill-host" data-tab="plan" data-pill="summary" hidden>
        <!-- existing Savings Rate, Net Worth pie, Expense pie cards, all three together -->
        <button type="button" class="next-pill-btn" data-action="next-pill" data-i18n="nav.next" disabled>Next →</button>
      </div>
    </section>

    <section id="tab-geography" class="tab-panel" data-tab="geography" hidden role="tabpanel">…</section>
    <section id="tab-retirement" class="tab-panel" data-tab="retirement" hidden role="tabpanel">…</section>
    <section id="tab-history" class="tab-panel" data-tab="history" hidden role="tabpanel">…</section>
  </div>

  <aside id="lifecycleSidebar">…</aside>           <!-- existing right-edge pinned sidebar, unchanged -->
  <footer>…</footer>                               <!-- existing -->
</body>
```

---

## ID inventory (must match across both HTML files)

| ID | Element | Notes |
|----|---------|-------|
| `siteHeader` | `<header>` | Existing |
| `kpiRibbon` | `<div>` | Existing |
| `gateSelector` | `<div>` | Existing — FIRE-mode (Safe/Exact/DWZ) selector |
| `tabBar` | `<nav>` | NEW — top tab pill bar |
| `tabContainer` | `<div>` | NEW — direct parent of all 4 tab panels |
| `tab-plan` | `<section>` | NEW — Plan tab panel |
| `tab-geography` | `<section>` | NEW — Geography tab panel |
| `tab-retirement` | `<section>` | NEW — Retirement tab panel |
| `tab-history` | `<section>` | NEW — History tab panel |
| `lifecycleSidebar` | `<aside>` | Existing — right-edge pinned mirror |

Existing card-container IDs (e.g., `profileIncomeCard`, `currentAssetsCard`, `lifecycleCard`, `snapshotsCard`) are preserved verbatim per FR-037; only their parent changes.

---

## Class inventory

| Class | Applied to | Purpose |
|-------|-----------|---------|
| `tab-bar` | `#tabBar` | Top tab pill bar styling and flex layout. |
| `tab-container` | `#tabContainer` | Direct parent of tab panels. No styling needed (just structural). |
| `tab` | every `<button>` in `#tabBar` | Per-tab button styling. |
| `tab-panel` | every `<section>` inside `#tabContainer` | Tab-panel-level styling and inactive hiding. |
| `tab-scroll-sentinel` | inside each tab panel, top | Used by the IntersectionObserver for sticky compact header (Feature 006 US2 rewiring per R-002). Visually `height:1px; visibility:hidden`. |
| `pill-bar` | sub-tab pill bar in each tab panel | Sub-tab pill row styling and flex layout. |
| `pill` | every `<button>` in any `.pill-bar` | Per-pill button styling. |
| `pill-host` | every host container for a pill's cards | Holds the existing card markup; toggled visible via `[hidden]` attribute. |
| `next-pill-btn` | the `Next →` button on each card | Allows targeted styling and the delegated click handler to find them via `[data-action="next-pill"]`. |
| `active` | the currently active `.tab` and `.pill` | Drives the visual active state via CSS. |

**State classes** (added/removed by `tabRouter`):

- `.tab.active` — exactly one at a time (FR-008).
- `.pill.active` — exactly one within the active tab (FR-008).
- `.tab-panel[hidden]` — applied to all but the active tab panel (FR-011, FR-012). Note: `[hidden]` HTML attribute is used (not a class) so the browser's default `display:none` applies.
- `.pill-host[hidden]` — applied to all but the active pill's host within the active tab.

---

## Data attributes

Every `.tab` button: `data-tab="<tabId>"`.
Every `.pill` button: `data-tab="<tabId>" data-pill="<pillId>"`.
Every `.pill-host`: `data-tab="<tabId>" data-pill="<pillId>"`.
Every `.next-pill-btn`: `data-action="next-pill"`.
Every label: `data-i18n="<key>"`.

---

## CSS rules (sketch — exact CSS lives in the HTML files)

```text
/* Top tab bar */
.tab-bar {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  position: sticky;
  top: var(--header-height, 0);  /* compatible with Feature 011 ResizeObserver */
  z-index: 10;
}
.tab {
  flex: 0 0 auto;          /* don't shrink — required for horizontal scroll */
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.tab.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

/* Sub-tab pill bar — same pattern, slightly smaller */
.pill-bar {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  border-bottom: 1px solid var(--border);
}
.pill {
  flex: 0 0 auto;
  padding: 0.35rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.95em;
}
.pill.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}

/* Pill host — show/hide via the [hidden] attribute */
.pill-host[hidden] { display: none; }

/* Tab panel — show/hide via [hidden] */
.tab-panel[hidden] { display: none; }

/* Next button on the last pill of each tab */
.next-pill-btn:disabled { opacity: 0.4; cursor: default; }

/* Sentinel for sticky-header observer */
.tab-scroll-sentinel {
  height: 1px;
  visibility: hidden;
}

/* Mobile breakpoint — already covered by overflow-x: auto on the bars,
   but tighten padding so more pills fit at narrow widths */
@media (max-width: 767px) {
  .tab-bar { padding: 0.4rem 0.6rem; gap: 0.35rem; }
  .pill-bar { padding: 0.3rem 0.6rem; gap: 0.3rem; }
  .tab { padding: 0.4rem 0.75rem; font-size: 0.95em; }
  .pill { padding: 0.3rem 0.65rem; font-size: 0.9em; }
}
```

---

## Persistent chrome — what stays outside the tab container

These elements MUST live as siblings of `#tabContainer`, NOT inside any `<section class="tab-panel">`:

- `<header id="siteHeader">`
- `#kpiRibbon`
- `#gateSelector` (the FIRE-mode Safe/Exact/DWZ selector)
- `#tabBar` (the top tab pill bar itself)
- `<aside id="lifecycleSidebar">` (right-edge pinned mirror)
- `<footer>`

This guarantees they remain rendered regardless of the active tab (FR-015, FR-016).

---

## ARIA / accessibility

- `<nav id="tabBar" role="tablist" aria-label="Dashboard sections">`
- Each `<button class="tab" role="tab" aria-controls="tab-<id>" aria-selected="<true|false>">`
- Each `<section class="tab-panel" role="tabpanel" aria-labelledby="<tab-button-id>">`
- Sub-tab pill bar: `<nav class="pill-bar" role="tablist" aria-label="<tab-name> sections">`
- `aria-selected` is updated by `tabRouter` on activation.

---

## Lockstep enforcement

The Playwright test `tests/e2e/tab-navigation.spec.ts` MUST include a DOM-diff assertion:

1. Load `FIRE-Dashboard.html`; collect `tabBar` outerHTML and every `.pill-bar` outerHTML; collect every `.pill-host`'s `data-tab` + `data-pill` attribute pair.
2. Load `FIRE-Dashboard-Generic.html`; collect the same.
3. Assert: tab IDs identical, pill IDs identical, pill-host pair set identical, ordering identical.

This is the structural lockstep gate per SC-009.
