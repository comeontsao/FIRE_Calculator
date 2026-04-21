# Contract — Pinnable Lifecycle Sidebar

**Feature**: 006 UI Noise Reset + Lifecycle Dock
**Scope**: The right-edge drawer hosting a mirror instance of the Full Portfolio Lifecycle chart in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## Purpose

Keep the Full Portfolio Lifecycle chart visible while the user edits inputs elsewhere on the page, without duplicating calc work. The sidebar is an always-available secondary view onto the same live projection data as the primary in-page lifecycle chart.

---

## Modes

| Mode | When | Appearance |
|------|------|------------|
| `hidden` | User unpinned (desktop) OR closed (mobile) | Drawer off-screen, toggle button visible in header |
| `docked` | Pinned + desktop viewport (≥780px) | Drawer docked to right edge, ~420px wide; main content reflows to share width |
| `overlay` | Opened on mobile viewport (<780px) | Drawer slides in from right as an overlay; scrim dims main content; closes on scrim tap / close button / Escape key |

`docked` requires desktop viewport. If the user is pinned on desktop and resizes to mobile, mode flips to `overlay`. Returning to desktop with pin preference still true flips back to `docked`.

---

## Required DOM

```html
<aside id="lifecycleSidebar" class="sidebar" aria-hidden="true" aria-labelledby="sidebarTitle">
  <div class="sidebar__header">
    <h2 id="sidebarTitle" class="sidebar__title" data-i18n="sidebar.title">Lifecycle</h2>
    <div class="sidebar__controls">
      <button class="sidebar__pin" data-i18n-aria="sidebar.pinAria" aria-pressed="false">📌</button>
      <button class="sidebar__close" data-i18n-aria="sidebar.closeAria" aria-label="Close">✕</button>
    </div>
  </div>
  <div class="sidebar__chart">
    <canvas id="lifecycleSidebarCanvas"></canvas>
  </div>
  <div class="sidebar__caption">
    <span data-i18n="sidebar.fireAgeLabel">FIRE age</span>
    <strong id="sidebarFireAge">—</strong>
    <span class="sep">·</span>
    <span data-i18n="sidebar.endPortfolioLabel">End-of-life portfolio</span>
    <strong id="sidebarEndPortfolio">—</strong>
  </div>
</aside>

<!-- Scrim for mobile overlay mode -->
<div id="sidebarScrim" class="sidebar-scrim" aria-hidden="true"></div>
```

The sidebar sits at the end of `<body>`, after the footer, so it positions relative to the viewport rather than a document section.

---

## CSS Contract

```css
.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 100vw;
  transform: translateX(100%);
  transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
  background: var(--card);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 90;
}
.sidebar--open { transform: translateX(0); }

.sidebar-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms;
  z-index: 80;
}
.sidebar-scrim--visible {
  opacity: 1;
  pointer-events: auto;
}

/* Docked mode — main content reflows */
body.sidebar-docked .dashboard,
body.sidebar-docked .footer-panel {
  margin-right: 420px;
  transition: margin-right 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
}

/* Mobile viewport: no docked mode, scrim is used */
@media (max-width: 779.98px) {
  .sidebar { width: 100vw; }
  body.sidebar-docked .dashboard,
  body.sidebar-docked .footer-panel {
    margin-right: 0;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sidebar, .sidebar-scrim, .dashboard, .footer-panel {
    transition: none !important;
  }
}
```

---

## Behavioral Contract

| # | Behavior |
|---|----------|
| BH-1 | On page init, read `localStorage[<keyForFile>]` (see [data-model.md §1](../data-model.md#1-sidebar-pin-preference)). If `'1'` AND viewport is desktop, open in `docked` mode. Otherwise, start in `hidden`. |
| BH-2 | Clicking the pin button on desktop → toggle between `hidden` and `docked`; persist the new preference. |
| BH-3 | Clicking the sidebar-toggle in the header on mobile → toggle between `hidden` and `overlay`; do NOT persist (overlay is transient). |
| BH-4 | Clicking the close (×) button → close to `hidden`. On desktop this also clears the pin preference. On mobile it only closes the overlay (pin preference is untouched). |
| BH-5 | On `docked` entry, add `.sidebar--open` to the sidebar AND `.sidebar-docked` to `<body>`. |
| BH-6 | On `overlay` entry, add `.sidebar--open` to the sidebar AND `.sidebar-scrim--visible` to the scrim. |
| BH-7 | Tapping the scrim in overlay mode closes to `hidden`. |
| BH-8 | Pressing Escape in overlay mode closes to `hidden`. |
| BH-9 | On `resize` crossing 780px (either direction), re-evaluate mode: desktop + pin=`'1'` → `docked`; mobile + currently-docked → `overlay` (if not already explicitly closed). Do NOT auto-open on mobile widen — require user to explicitly pin. |
| BH-10 | After a pin/unpin transition on desktop, wait for `transitionend` on the dashboard element (or fall back to `setTimeout(..., 350)`) then call `chart.resize()` on every registered Chart.js instance. |
| BH-11 | If `localStorage.setItem` throws (private mode, storage full), swallow the error. Sidebar still works for the session; preference just won't persist. |
| BH-12 | If the sidebar canvas is not yet visible on cold load (e.g., unpinned), the mirror chart is NOT instantiated until the first time the sidebar opens. Defers ~5-10ms of Chart.js init work. |

---

## Mirror Chart Contract

| # | Behavior |
|---|----------|
| MC-1 | A function `renderLifecycleSidebarChart(state)` is registered as a `chartState.onChange` listener AFTER the primary lifecycle render function. Order matters: primary computes `_lastLifecycleDataset`, sidebar consumes it. |
| MC-2 | The sidebar render function reads `_lastLifecycleDataset` (the module-scope cache populated by the primary chart's render). It does NOT re-run `projectFullLifecycle` or any other calc. |
| MC-3 | On first render, the function instantiates a Chart.js bar/line chart on `#lifecycleSidebarCanvas`. On subsequent renders, it calls `chart.update()` with the new dataset. |
| MC-4 | The sidebar chart is visually simplified: smaller fonts, no legend (or compact legend), fewer axis ticks. The data is identical to the primary chart. |
| MC-5 | If the sidebar is in `hidden` mode, the render function still fires but is a no-op (it reads `_lastLifecycleDataset` into nothing; or guards with `if (sidebarMode === 'hidden') return;`). |
| MC-6 | The sidebar caption updates alongside the chart: `#sidebarFireAge` ← current FIRE age; `#sidebarEndPortfolio` ← current projected end-of-life portfolio value. Both read from `_lastKpiSnapshot` and `_lastLifecycleDataset` respectively. |
| MC-7 | Per Constitution Principle VI, `renderLifecycleSidebarChart`'s comment declares: `Inputs: _lastLifecycleDataset (computed by renderGrowthChart), _lastKpiSnapshot.fireAge`. The lifecycle module's `Consumers:` comment line adds "lifecycleSidebar" alongside "lifecycleChart". |

---

## Accessibility Contract

| # | Behavior |
|---|----------|
| A11y-1 | The sidebar element has `role="complementary"` (implicit via `<aside>`) and `aria-labelledby="sidebarTitle"`. |
| A11y-2 | `aria-hidden="true"` when in `hidden` mode; `false` when open. Updated on every mode change. |
| A11y-3 | The pin button has `aria-pressed="true"/"false"` reflecting the pinned state. |
| A11y-4 | The close button has a fixed `aria-label` (e.g., `Close lifecycle sidebar` / `關閉生涯側欄`) via `data-i18n-aria`. |
| A11y-5 | Focus management: opening the sidebar moves focus to the pin button (first focusable child). Closing restores focus to the element that triggered the open. |
| A11y-6 | Keyboard: Tab cycles through sidebar controls when open; Escape closes. |

---

## Non-goals

- The sidebar does NOT provide a second set of chart controls (zoom, range picker, etc.). It is a read-only mirror.
- The sidebar does NOT support drag-to-resize. Width is fixed at 420px (desktop) or 100vw (mobile).
- The sidebar does NOT support multiple charts. Only the lifecycle chart. (Future: could be generalized if the user asks.)
- The sidebar does NOT support being docked to the left. Right-edge only.

---

## Test Hooks (for Phase 3 smoke verification)

- `#lifecycleSidebar` exists in both HTML files.
- `#lifecycleSidebarCanvas` is a `<canvas>` element.
- `#sidebarScrim` exists.
- `#sidebarToggle` in header triggers an `aria-pressed` change on click.
- After pin on a desktop-width viewport, `document.body.classList.contains('sidebar-docked')` is true AND `.sidebar--open` is on the sidebar.
- After a page reload while pinned, the sidebar is already open before any user interaction (within 500ms of DOMContentLoaded).
- Editing any lifecycle-affecting input triggers a single re-render on both the primary chart and the sidebar chart (verified via Chart.js `afterUpdate` hook or `update` call count).
