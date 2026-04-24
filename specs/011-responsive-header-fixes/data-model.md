# Phase 1 Data Model: Responsive Header Layout Fixes

**Feature**: 011-responsive-header-fixes
**Scope**: `FIRE-Dashboard-Generic.html` only. No calc modules, no persistence changes.

## Entities

This feature doesn't introduce domain entities (no calc, no persistence). The "model" here is DOM elements + CSS custom properties + the JS glue that connects them.

### 1. `.header` — sticky site header (existing, modified)

```
DOM: <header id="siteHeader" class="header">
  <div class="header__brand">
    <h1 data-i18n="header.title">…</h1>
    <p class="subtitle" data-i18n="header.subtitle">…</p>
  </div>
  <div class="header__status">
    <div id="fireStatus" class="fire-status warning">…</div>
  </div>
  <div class="header__controls">
    <div class="header__lang-toggle">…</div>
    <button id="themeToggle">…</button>
    <button id="sidebarToggle">…</button>
    <button onclick="resetToDefaults()">Reset</button>
  </div>
</header>
```

**Existing invariants (preserved)**:
- `position: sticky; top: 0; z-index: 100`
- `.header--compact` activates when user scrolls past `#headerSentinel`
- 240ms cubic-bezier transition on padding + background
- `data-i18n` bindings on title + subtitle

**New responsive invariants (added by this feature)**:
- At ≥1024px: `grid-template-columns: 1fr auto auto` (baseline, unchanged).
- At 768–1023px: `grid-template-columns: 1fr auto` with `.header__brand` spanning the full first row, `.header__status + .header__controls` on row 2.
- At <768px: `grid-template-columns: 1fr` with all three children stacked in three rows.
- `.header h1`: `word-break: keep-all`, `clamp()` font-size with floor 1.2rem at 768px, 1.15rem below 768px.
- `.header .fire-status`: always flex/grid participant; no `position: absolute`.

### 2. `.sidebar` — lifecycle sidebar panel (existing, modified)

```
DOM: <aside class="sidebar" id="lifecycleSidebar">
  <div class="sidebar__header">…</div>
  <div class="sidebar__chart">…</div>
</aside>
```

**Existing invariants (preserved)**:
- `position: fixed; right: 0; bottom: 0; width: clamp(320px, 33vw, 80vw)`
- `transform: translateX(100%)` when closed; `transform: translateX(0)` when `.sidebar--open`
- `z-index: 90` (below header's 100)
- 260ms cubic-bezier transition on transform
- `background: var(--card)` (unchanged — this IS the visual seam source pre-fix)

**New invariant (added by this feature)**:
- `top: var(--header-height, 0px)` — previously `top: 0`. The sidebar now starts below the header's bottom edge, eliminating any background overlap.

### 3. `--header-height` — new CSS custom property on `:root`

Single source of truth for the sidebar's top offset.

```css
:root {
  --header-height: 0px; /* default until JS runs */
}
```

**Producer**: `updateHeaderHeight()` JS function (new, in `FIRE-Dashboard-Generic.html`). Wrapped by a `ResizeObserver` on `.header`.

```js
/**
 * updateHeaderHeight() — Feature 011 US2
 * Writes the current header's rendered height to --header-height on :root,
 * so the sidebar's top offset stays in sync across:
 *   (a) initial render
 *   (b) .header--compact toggling
 *   (c) viewport resize that changes header layout (row count)
 *   (d) language toggle (EN -> zh-TW title length changes)
 */
function updateHeaderHeight() {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const h = header.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-height', h + 'px');
}
```

Wiring:
- On DOMContentLoaded: call once.
- `ResizeObserver` on `.header`: fires on every size change.
- Optional: after `switchLanguage()` runs, call `updateHeaderHeight()` explicitly (in case the resize observer has a tick delay).

**Consumer**: `.sidebar { top: var(--header-height, 0px); }` — single CSS rule.

## Relationships

```
.header (ResizeObserver target)
    │
    └──► updateHeaderHeight() (producer)
            │
            └──► --header-height on :root
                    │
                    └──► .sidebar { top: var(--header-height); } (consumer)
```

## State transitions

### Header compact-sticky toggle (existing, unchanged behaviourally)

Scroll past `#headerSentinel` → `.header--compact` class applied → CSS transitions run → header height changes from ~100px to ~50px → ResizeObserver fires → `--header-height` updates → sidebar `top` updates → sidebar visually shifts up with the header.

### Viewport resize (new handling)

User resizes window / rotates tablet → media queries re-apply `.header`'s grid structure → header height may change (e.g., 1-row → 2-row) → ResizeObserver fires → `--header-height` updates → sidebar `top` re-syncs.

### Language toggle (new handling)

User clicks `#langZH` → `switchLanguage('zh')` runs → title text content changes from "FIRE Command Center — Universal Template" to "FIRE 指揮中心 — 通用版" → rendered title may change height (Chinese is shorter horizontally but line count may differ on narrow viewports) → ResizeObserver fires → `--header-height` updates.

## Invariants

1. **Title fits on ≤2 lines at every viewport ≥400px.** Verified by Playwright: `h1.getBoundingClientRect().height / lineHeight <= 2.1` (small epsilon).
2. **Pill never overlaps title.** Verified by Playwright: `rectsDoNotIntersect(h1.rect, fireStatus.rect)`.
3. **Header background is continuous across full viewport width.** Verified by Playwright: pixel sample at `(1px, header_bottom - 1px)` matches sample at `(viewport_width - 1px, header_bottom - 1px)` within ≤2 RGB delta.
4. **Compact-sticky transition preserved.** Verified by Playwright: after programmatic scroll past `#headerSentinel`, `.header` has class `.header--compact`, title font-size is ~1.1rem.
5. **All 4 controls visible and clickable at every viewport.** Verified by Playwright: `page.locator('#langEN, #langZH, #themeToggle, #sidebarToggle, button:has-text("Reset")').isVisible()` for each.
6. **zh-TW title wraps correctly.** Verified by Playwright: toggle language, assert invariants 1–5 still hold.

## Test fixtures (enumerated)

Declared in `contracts/playwright-matrix.contract.md`. One fixture file: `tests/e2e/responsive-header.spec.ts`. Matrix: 3 viewports × 2 sidebar states × 2 languages = 12 cells.
