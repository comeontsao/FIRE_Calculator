# Contract — Header Zoom-Resilient Layout (US3)

**Scope:** the CSS rules that govern `#siteHeader` and its children in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

**Anchored to:** spec FR-010, FR-011, FR-012, FR-013, FR-014; SC-006, SC-007, SC-008.

---

## DOM contract (header bounds)

The header is a single flex row containing, left-to-right at canonical 100% zoom on a 1920×1080 viewport:

| Element                          | Required at 100% zoom | Behavior at 125% / 150% zoom |
|----------------------------------|-----------------------|------------------------------|
| `.brand-block` (title + sublabels) | single line, full title visible | MAY wrap to 2 lines; MUST NOT overlap any sibling |
| `.verdict-pill` (status pill)    | inline, right-aligned with title | MAY wrap below the title row; MUST stay readable |
| `.lang-toggle` (EN / 中文)        | rightmost group (top-right cluster) | stays clustered; MUST NOT overflow the viewport |
| `.theme-toggle` (sun/moon)       | rightmost group | stays clustered |
| `.chart-mode-toggle` (line/area) | rightmost group | stays clustered |

Exact class names confirmed at task time via grep — placeholders here use the inferred names from current source.

## Visual contract (per zoom level)

| Zoom | Header height bound | Title behavior | Element overlap | Other |
|------|---------------------|----------------|:---------------:|-------|
| 75% | ≤ 150px | single line | none | no element < 10px effective font |
| 100% | ≤ 200px (SC-006) | single line | none | pixel-snapshot unchanged ±2px from current (SC-008) |
| 125% | ≤ 280px | 1–2 lines | none (≤ 2px tolerance) | first KPI row visible without scroll |
| 150% | (no upper bound; degrades to vertical stack) | wraps to multiple lines | none | content below header reachable; no horizontal clipping |

## Required CSS technique (per research.md Section 3 default; subject to confirmation)

**Default:** Option A — `clamp()` typography on the title and pill, plus `flex-wrap: wrap` and `min-width: 0` on the right-side toggle cluster.

```css
/* Pseudocode — actual rules land in both HTML files at task time */
#siteHeader {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(0.5rem, 1vw, 1.5rem);
  padding: clamp(0.5rem, 1vw, 1.25rem);
}
.brand-block {
  flex: 1 1 auto;
  min-width: 0;        /* allows shrink-to-fit before forcing a wrap */
}
.brand-block h1 {
  font-size: clamp(1rem, 1.6vw, 1.75rem);
  line-height: 1.2;
  /* avoid forcing a single-line truncation; let zh-TW wrap gracefully */
}
.verdict-pill {
  font-size: clamp(0.85rem, 1.1vw, 1.05rem);
}
.right-cluster {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
```

If Phase 0 Section 3 picks a different option (B container queries / C pure flex-wrap), these rules adapt; the visual contract above is unchanged.

## Sticky-Chrome integration (Constitution Additional Constraints)

The header publishes `--header-height` via ResizeObserver (see Constitution v1.2.0 Sticky-Chrome Discipline). The 026 fix MUST NOT break this:

- After the CSS change, `--header-height` MUST continue to publish a sane numeric value (px) at every zoom level, consumed by `#gateSelector { top: var(--header-height); }`.
- z-index hierarchy MUST be preserved: `#siteHeader` stays at z-index 100.

## Bilingual requirement (Constitution VII)

The contract MUST hold for both EN title (`ROGER & REBECCA FIRE COMMAND CENTER` — RR file; `FIRE COMMAND CENTER` — Generic file) and zh-TW title (`羅傑與蕾貝卡 FIRE 指揮中心` — RR; `FIRE 指揮中心` — Generic). The implementing engineer MUST verify both languages at every zoom level.

## Lockstep requirement (Constitution I)

Both HTML files receive the same CSS change. Personal-content fields (the title text in RR) differ; the rules themselves do not.

## Required tests (FR-010 + SC-006/SC-007/SC-008)

### `tests/e2e/header-zoom-matrix.spec.js` (NEW — Playwright)

Loads each HTML file in each language, sets browser zoom to 75% / 100% / 125% / 150%, and asserts:

1. `#siteHeader.getBoundingClientRect().height` is within the bound for that zoom level (per the visual-contract table).
2. No header child element's bounding rect intersects another child's by > 2px.
3. At 100% zoom, the rendered header pixels are within 2px of the captured pre-fix snapshot (SC-008 regression guard).

### Manual smoke (CLAUDE.md "browser smoke before done" gate)

Manager opens both HTML files in EN and zh-TW, steps zoom 75 → 100 → 125 → 150%, and confirms the visual contract holds without DevTools.
