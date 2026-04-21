# Contract — Sticky Compact Header

**Feature**: 006 UI Noise Reset + Lifecycle Dock
**Scope**: The top dashboard header in `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (identical contract in both files).

---

## Purpose

Keep the page header visible while the user scrolls the dashboard, collapsing it into a compact bar after the first screen so it does not consume vertical space yet still surfaces the headline answer (Years to FIRE, Progress %, FIRE status) and the primary controls (language toggle, lifecycle sidebar toggle).

---

## State Machine

Two states, transitioned by `IntersectionObserver` on a 1px sentinel placed immediately before the header.

```
                                   sentinel leaves viewport
        ┌───────────────┐         ─────────────────────────▶    ┌──────────────┐
        │   expanded    │                                       │   compact    │
        │  (scrollTop   │         ◀─────────────────────────    │ (scrollTop   │
        │  ≈ top)       │          sentinel re-enters viewport  │  past ~80px) │
        └───────────────┘                                       └──────────────┘
```

**State flag**: CSS class `.header--compact` applied to `<header>`. Absence = expanded.

---

## Required DOM

```html
<div id="headerSentinel" aria-hidden="true"></div>
<header id="siteHeader" class="header">
  <div class="header__brand">
    <h1 data-i18n="header.title">...</h1>
    <p class="subtitle" data-i18n="header.subtitle">...</p>
  </div>
  <div class="header__status">
    <div id="fireStatus" class="fire-status">...</div>
    <div class="header__live-chips" aria-live="polite">
      <span class="chip"><span data-i18n="header.yearsChipLabel">Years to FIRE</span>
        <strong id="headerYearsValue">—</strong></span>
      <span class="chip"><span data-i18n="header.progressChipLabel">Progress</span>
        <strong id="headerProgressValue">—</strong></span>
    </div>
  </div>
  <div class="header__controls">
    <button id="langEN">EN</button>
    <button id="langZH">中文</button>
    <button id="sidebarToggle" aria-pressed="false" aria-label="..." data-i18n-aria="sidebar.toggleAria">⚓</button>
  </div>
</header>
```

The sentinel is a sibling of the header, placed immediately before it. It is 1px tall and invisible; its presence is the scroll-threshold signal.

---

## CSS Contract

```css
#headerSentinel { height: 1px; width: 1px; }

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 20px;
  padding: 24px 32px 20px;
  transition: padding 240ms cubic-bezier(0.2, 0.7, 0.2, 1),
              background 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
  background: transparent;
  border-bottom: 1px solid transparent;
}

.header--compact {
  padding: 10px 24px;
  background: rgba(15,16,22,0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--border);
}

/* h1 shrinks, gradient drops, subtitle collapses out */
.header h1 { transition: font-size 240ms, background 240ms, color 240ms; }
.header--compact h1 {
  font-size: 1.1em;
  background: none;
  -webkit-background-clip: initial;
  -webkit-text-fill-color: initial;
  color: var(--accent2);
}
.header .subtitle {
  transition: max-height 240ms, opacity 200ms, margin 240ms;
  overflow: hidden;
  max-height: 40px;
}
.header--compact .subtitle {
  max-height: 0;
  opacity: 0;
  margin: 0;
}

/* Live chips hidden in expanded, revealed in compact */
.header__live-chips { display: none; }
.header--compact .header__live-chips { display: flex; gap: 12px; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .header, .header *, .header--compact, .header--compact * {
    transition: none !important;
  }
}
```

---

## Behavioral Contract

| # | Behavior |
|---|----------|
| BH-1 | On page load, header is in `expanded` state regardless of saved state. |
| BH-2 | When the user scrolls such that `#headerSentinel` is no longer intersecting the viewport, the header gains `.header--compact` within one animation frame. |
| BH-3 | When the user scrolls back until the sentinel is intersecting again, the header loses `.header--compact` within one animation frame. |
| BH-4 | CSS transitions handle all visual interpolation. No JS animation loop. No `requestAnimationFrame` scheduling in the scroll path. |
| BH-5 | `aria-live="polite"` on the live-chips container announces value changes for screen readers in compact mode. |
| BH-6 | `prefers-reduced-motion: reduce` removes transitions; state switches are instant but functionally identical. |
| BH-7 | The compact header's `backdrop-filter` is paired with an `rgba` background fallback so browsers without `backdrop-filter` remain legible. |
| BH-8 | Language toggle and sidebar toggle remain click-targets in both states. Clickable area never shrinks below 36×36px (touch-target minimum). |
| BH-9 | Dragging the FIRE-age marker on the lifecycle chart does NOT cause the header to intercept pointer events; `pointer-events` on the header remain `auto` (clicks OK), but `z-index` relationships ensure the drag overlay stays above the header during a drag. |

---

## Live Data Contract

| # | Behavior |
|---|----------|
| LD-1 | A render function `renderCompactHeaderStats(state)` is registered as a `chartState.onChange` listener. |
| LD-2 | The render function reads `_lastKpiSnapshot` (existing module-level variable populated by `recalcAll`). |
| LD-3 | It writes `yearsToFire` into `#headerYearsValue.textContent` and `progressPct` into `#headerProgressValue.textContent`. |
| LD-4 | It writes the status class onto `#fireStatus` (keeps the dot color indicator in sync). |
| LD-5 | If `_lastKpiSnapshot` is undefined, values render as `—`. |
| LD-6 | The function never triggers a recalc. It only reads cached state. |

---

## Non-goals

- This contract does NOT cover the header's language-toggle behavior (it reuses the existing `switchLanguage()` function, unchanged).
- This contract does NOT cover the sidebar toggle's effect on the sidebar itself — that lives in [lifecycle-sidebar.contract.md](./lifecycle-sidebar.contract.md). Only the toggle button's presence in the header is specified here.

---

## Test Hooks (for Phase 3 smoke verification)

- `#headerSentinel` exists in both HTML files.
- `#siteHeader` has `position: sticky` computed style.
- `#headerYearsValue` and `#headerProgressValue` exist and get populated within 500ms of page load.
- Scrolling past 80px toggles `.header--compact` on `#siteHeader` (can be asserted with `window.scrollTo + getComputedStyle` or by reading the class).
- `#sidebarToggle` has `aria-label` / `data-i18n-aria` set.
