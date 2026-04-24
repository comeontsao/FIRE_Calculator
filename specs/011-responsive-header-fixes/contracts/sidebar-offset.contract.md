# Contract: Sidebar Top Offset via `--header-height`

**Feature**: 011-responsive-header-fixes
**Owner**: Frontend Engineer.
**Scope**: CSS rule change on `.sidebar` + ~10 LoC of JS inside `FIRE-Dashboard-Generic.html`.

---

## CSS change

Current (line ~1289):
```css
.sidebar {
  position: fixed;
  top: 0;               /* ← CHANGED */
  right: 0;
  bottom: 0;
  width: clamp(320px, var(--sidebar-width), 80vw);
  max-width: 100vw;
  transform: translateX(100%);
  transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
  background: var(--card);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 90;
}
```

New:
```css
.sidebar {
  position: fixed;
  top: var(--header-height, 0px);   /* ← NEW */
  right: 0;
  bottom: 0;
  /* rest unchanged */
}
```

The fallback `0px` in the CSS `var()` default means: if JS fails to set `--header-height` for any reason, the sidebar falls back to its current behaviour (top: 0) rather than breaking.

---

## JS producer

Add near other DOMContentLoaded-initialised helpers in `FIRE-Dashboard-Generic.html`. Must run AFTER the header element is in the DOM.

```js
// === FEATURE 011 US2 — --header-height producer ===
// Writes the live header height to --header-height on :root so the
// sidebar's top offset (set via CSS var() in .sidebar) stays in sync
// across: initial render, .header--compact transitions, viewport
// resize, language toggle, and any other mutation that changes header
// layout / height.
//
// Consumers:
//   - .sidebar { top: var(--header-height, 0px); }
//   (no other CSS or JS consumer as of feature 011)
function updateHeaderHeight() {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const h = header.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-height', h + 'px');
}

// Initial sync + ResizeObserver for ongoing updates.
(function initHeaderHeightObserver() {
  // Initial call after DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHeaderHeight, { once: true });
  } else {
    updateHeaderHeight();
  }
  // Keep in sync with any size change.
  if (typeof ResizeObserver !== 'undefined') {
    const header = document.getElementById('siteHeader');
    if (header) {
      const ro = new ResizeObserver(updateHeaderHeight);
      ro.observe(header);
    }
  } else {
    // Fallback for ancient browsers without ResizeObserver: update on resize.
    window.addEventListener('resize', updateHeaderHeight);
  }
})();
```

**Wiring into `switchLanguage`**: no change needed — `switchLanguage` already triggers layout mutations that the `ResizeObserver` will pick up automatically.

**Wiring into `.header--compact` toggle**: no change needed — the class change triggers CSS transitions, which the `ResizeObserver` observes.

---

## Edge cases

### ResizeObserver batching delay

`ResizeObserver` callbacks fire asynchronously on the next animation frame. There may be a 16ms delay between the header's height changing and the sidebar's top updating. For the compact-sticky transition (240ms total), this is imperceptible. For instant layout changes (e.g., viewport rotation), the flicker is minimal.

If a visibly-jarring flicker is observed during Playwright testing, fall back to explicit calls:
```js
// Add to the end of switchLanguage(lang):
if (typeof updateHeaderHeight === 'function') updateHeaderHeight();
```
Not expected to be needed, but documented here as a safety net.

### Header does not exist yet (very early script execution)

Guarded by `if (!header) return;`. The IIFE uses DOMContentLoaded as the trigger, so this is defensive only.

### Server-side rendering (SSR)

Not applicable — this is a client-only static HTML file.

### Print / print preview

`@media print` could be an issue if the header layout changes in print. Out of scope; feature 011 does not add print styles.

---

## Invariant (locked by Playwright test)

At every viewport × sidebar state × language combination, pixel sampled at the top-right edge of the visible header strip (coordinates `(viewport_width - 1, header_bottom - 1)`) matches the pixel sampled at the top-left edge (coordinates `(1, header_bottom - 1)`) within ≤2 RGB delta per channel. This assertion directly validates FR-011 (background continuity) and will fail if the sidebar intrudes on the header's top strip.

---

## Verification

After implementation, run in a browser console:

```js
// Confirm --header-height is set and non-zero:
getComputedStyle(document.documentElement).getPropertyValue('--header-height');
// Expected: something like "92px" (not "" or "0px")

// Confirm .sidebar.top reads the var correctly:
getComputedStyle(document.querySelector('.sidebar')).top;
// Expected: the same pixel value as --header-height

// Scroll to trigger compact-sticky, re-check:
window.scrollTo(0, 500);
setTimeout(() => console.log(
  'compact header height:',
  getComputedStyle(document.documentElement).getPropertyValue('--header-height')
), 300);
// Expected: smaller value (~50px)
```
