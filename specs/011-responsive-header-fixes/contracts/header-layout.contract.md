# Contract: Responsive Header Layout

**Feature**: 011-responsive-header-fixes
**Owner**: Frontend Engineer.
**Scope**: CSS inside `FIRE-Dashboard-Generic.html` at two existing header blocks (lines ~138–250 and ~1434–1505 pre-feature-011).

---

## Breakpoint matrix

| Viewport width | Layout class | Grid columns | Grid rows | Title max lines |
|----------------|--------------|--------------|-----------|-----------------|
| ≥1024px | (no extra class) | `1fr auto auto` | 1 row | 1 (single-line) |
| 768–1023px | (driven by `@media (max-width: 1023px)`) | `1fr auto` | 2 rows | 2 |
| <768px | (driven by `@media (max-width: 767px)`) | `1fr` | 3 rows | 2 |

### ≥1024px — baseline (unchanged)

```css
.header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 20px;
  /* existing padding, transition, background, z-index unchanged */
}
```

Row 1: `[.header__brand] [.header__status] [.header__controls]`. Title sits on one line. Pill + controls align right.

### 768–1023px — two-row

```css
@media (max-width: 1023px) {
  .header {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    row-gap: 12px;
  }
  .header__brand {
    grid-column: 1 / -1;   /* span full width, row 1 */
    grid-row: 1;
  }
  .header__status {
    grid-column: 1;        /* row 2, left */
    grid-row: 2;
    justify-self: start;
  }
  .header__controls {
    grid-column: 2;        /* row 2, right */
    grid-row: 2;
    justify-self: end;
  }
}
```

Row 1: `[.header__brand (full width)]`. Row 2: `[.header__status] [.header__controls]`. Title has its own row with full horizontal runway → fits on 1–2 lines naturally.

### <768px — three-row stack

```css
@media (max-width: 767px) {
  .header {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    row-gap: 10px;
    padding: 16px 20px;  /* tighter padding for phones */
  }
  .header__brand,
  .header__status,
  .header__controls {
    grid-column: 1;
    justify-self: stretch;  /* full-width rows */
  }
  .header__brand { grid-row: 1; }
  .header__status {
    grid-row: 2;
    justify-self: start;
  }
  .header__controls {
    grid-row: 3;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
  }
}
```

Row 1: title only. Row 2: pill only. Row 3: controls wrap across one or more flex lines.

---

## Title typography

### Baseline (≥1024px, preserved)

```css
.header h1 {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: clamp(1.8rem, 2.4vw + 0.5rem, 2.35rem);
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 6px;
}
```

### Narrow-viewport overrides (new)

```css
@media (max-width: 1023px) {
  .header h1 {
    font-size: clamp(1.2rem, 2.4vw + 0.5rem, 2.35rem);
    word-break: keep-all;          /* prevent word-per-line wraps */
    overflow-wrap: normal;          /* no mid-word breaks */
    hyphens: manual;                /* respect explicit hyphens only */
    line-height: 1.2;
  }
}

@media (max-width: 767px) {
  .header h1 {
    font-size: clamp(1.15rem, 3vw + 0.2rem, 1.8rem);
    line-height: 1.25;
  }
}
```

### Subtitle handling

Subtitle remains visible at ≥768px. Below 768px, optionally shrink to 0.85rem or allow it to wrap to 2 lines; no behaviour change required for the bug fix (the bug is about the h1, not the subtitle).

---

## `.fire-status` pill (existing, no major change)

Currently:
```css
.fire-status {
  font-family: var(--font-sans);
  font-weight: 500;
  font-size: 0.88rem !important;
  padding: 8px 16px !important;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
```

No `position: absolute` is currently applied to `.fire-status` — confirmed by Grep (2026-04-24). The overlap bug is NOT caused by absolute positioning; it's caused by the title's word-wrap growing the `.header__brand` row vertically while the pill stays vertically centred at the row's original height.

The layout fix (two-row / three-row stacking from the previous section) naturally eliminates the overlap because the pill no longer sits in the same row as the title at <1024px viewports.

### Minor pill size adjustment at <768px

```css
@media (max-width: 767px) {
  .fire-status {
    font-size: 0.78rem !important;
    padding: 6px 12px !important;
  }
}
```

Reduces pill size slightly on phones. Not strictly required for the bug fix but improves visual rhythm.

---

## `.header__controls` wrapping at <768px

```css
@media (max-width: 767px) {
  .header__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* Reset button can wrap to its own line if needed; stays clickable */
  .header__controls button {
    flex-shrink: 0;
  }
}
```

---

## Invariants (locked by Playwright tests)

1. At viewport width 1440px: header renders on 1 row; title on 1 line.
2. At viewport width 768px: header renders on 2 rows; title on ≤ 2 lines; pill + controls on row 2 below title.
3. At viewport width 400px: header renders on 3 rows; title on ≤ 2 lines at ≥1.15rem font size.
4. At every viewport size: no word appears isolated on its own line (assertion: `words.length > lines.length`).
5. At every viewport size: `h1.rect` and `.fire-status.rect` do NOT intersect (DOMRect overlap check).

---

## Implementation notes

- Insert the new media queries inside the EXISTING CSS block around line 138 (not create a new separate block). Keep related rules grouped.
- The second existing header CSS block around line 1434 (the "skin" / theme block) does NOT need media-query additions — it already uses `clamp()` on the font-size and doesn't touch the grid structure. Leave alone.
- Preserve all existing `.header--compact` rules. The responsive media queries do NOT interact with the compact-sticky state — both systems work orthogonally.
- Do NOT add `!important` to the new rules unless existing selectors force it. Grep confirms the baseline `.header` / `.header h1` rules are specificity-0 class selectors; media-query overrides will win by cascade order.
