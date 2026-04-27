# Contract: Shortfall Visualization (US1)

**Wave:** A (P1 — first) | **FRs:** FR-001..FR-005 | **Spec section:** [User Story 1](../spec.md)

This contract pins the wire-level shape of every interface the shortfall feature touches: the per-row `hasShortfall` field, the chart overlay plugin, the audit row class, the bilingual caption, and the Copy Debug payload extension.

---

## 1. Per-row data field

`PerYearRow.hasShortfall: boolean` is added to every row produced by the simulator. The field is mandatory — readers MAY assume it is always present and `false` if the simulator hit no shortfall.

### Computation rule (inside the simulator)

A year has `hasShortfall === true` IFF, after the active strategy attempts to fund that year's required spending from every pool the strategy permits, the residual unfunded amount is `> 0`. In other words: the user would be functionally broke that year. Pools the strategy excluded (e.g., a "taxable-only" strategy excluding 401k pre-59.5) do not count toward funding regardless of their balance.

### Acceptance test

A planted scenario (the user's tax-opt-search θ=0 case) produces `hasShortfall === true` on exactly the expected ages (recorded in `tests/unit/shortfallVisibility.test.js` as the canonical fixture).

---

## 2. Inline Chart.js plugin (lifecycle chart only)

### Plugin shape

```js
const shortfallOverlayPlugin = {
  id: 'shortfallOverlay',
  afterDatasetsDraw(chart, _args, _opts) {
    const ranges = chart.options.shortfallRanges || [];
    if (ranges.length === 0) return;
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 80, 80, 0.18)';
    for (const r of ranges) {
      const x1 = scales.x.getPixelForValue(r.xMin);
      const x2 = scales.x.getPixelForValue(r.xMax);
      ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
    }
    ctx.restore();
  },
};
```

### Registration

Per-instance (NOT global):

```js
// In the lifecycle chart's render function (BOTH HTML files in lockstep):
new Chart(ctx, {
  type: 'line',
  data: { ... },
  options: {
    ...,
    shortfallRanges: lifecycleChartRenderHints.shortfallRanges,
  },
  plugins: [shortfallOverlayPlugin],
});
```

### Color contract

- Fill: `rgba(255, 80, 80, 0.18)` — semi-transparent red, validated for WCAG AA contrast against the dark theme's `--bg` (#0e1116).
- The hex equivalents and Tailwind-equivalent shades are documented in the i18n contract for designer reference but the canvas paint MUST use the rgba literal above for consistency across browsers.

### Constitution V verification

The plugin MUST be defined inline in both HTML files (NOT loaded from a CDN). Adding `chartjs-plugin-annotation` (https://www.chartjs.org/chartjs-plugin-annotation/) is rejected even though it would solve this in fewer lines.

---

## 3. Audit table row class

### CSS

```css
/* In both HTML files' <style> block: */
table.audit-lifecycle-table tr.has-shortfall {
  background-color: rgba(255, 80, 80, 0.10);
}
table.audit-lifecycle-table tr.has-shortfall td:first-child::before {
  content: '⚠ ';
  color: rgba(255, 80, 80, 0.95);
}
```

### Render rule

When the audit table renderer iterates `auditSnapshot.lifecycleProjection.rows`, it sets the row's class:

```js
const tr = document.createElement('tr');
if (row.hasShortfall) tr.classList.add('has-shortfall');
```

The leading `⚠` glyph is added via `::before` so it isn't part of the row's text content (preserves CSV-export and screen-reader semantics).

---

## 4. Bilingual caption

### i18n keys (both HTML files' `TRANSLATIONS` dicts)

| Key | EN | zh-TW |
|-----|-----|-----|
| `lifecycle.shortfall.caption` | `Red-shaded years: active strategy cannot fund spending from any allowed pool.` | `紅色標示年份：當前策略無法從任何允許的資金池支應該年度支出。` |
| `lifecycle.shortfall.tooltipPrefix` | `Shortfall — strategy could not fund spending` | `資金缺口 — 策略無法支應支出` |
| `audit.lifecycle.shortfallColumn.title` | `Shortfall` | `資金缺口` |
| `audit.lifecycle.shortfallColumn.value.true` | `Yes` | `是` |
| `audit.lifecycle.shortfallColumn.value.false` | `—` | `—` |

### Render rule

The caption appears in a `<div class="lifecycle-chart-caption" data-i18n="lifecycle.shortfall.caption">` immediately below the lifecycle chart. The renderer toggles `display: none` when `lifecycleChartRenderHints.captionKey === null` (no shortfall years).

### Translation Catalog

The five keys above MUST be added to `FIRE-Dashboard Translation Catalog.md` in the same commit as the implementation (Constitution VII).

---

## 5. Copy Debug payload extension

### Schema delta

```diff
{
  "audit": {
    "lifecycleProjection": {
      "rows": [
        {
          "age": 50,
          "total": 1234567,
+         "hasShortfall": false,
          ...
        }
      ]
    }
  }
}
```

### Backward compatibility

- The field is **additive** — pre-015 Copy Debug consumers see it as an unrecognized property and ignore it.
- No existing keys are removed (Out of Scope: removal of `feasibilityProbe` / `summary` / `lifecycleSamples`).

---

## 6. False-positive guard (FR-005)

When the simulator produces zero shortfall years for a scenario, ALL of the following MUST be true:

- `lifecycleChartRenderHints.shortfallRanges.length === 0` (plugin paints nothing).
- `lifecycleChartRenderHints.captionKey === null` (caption hides via `display: none`).
- No `<tr>` in the audit table has the `has-shortfall` class.
- Every row in `audit.lifecycleProjection.rows` has `hasShortfall === false`.

A Playwright fixture in `tests/e2e/shortfall-overlay.spec.ts` plants a known feasible scenario and asserts all four conditions.

---

## 7. Acceptance criteria summary

| Criterion | Verifiable by |
|-----------|---------------|
| FR-001 chart overlay paints | Playwright pixel-sample at known shortfall ages (assert red channel > threshold) |
| FR-002 caption appears bilingual | Playwright text-presence in EN AND after `switchLanguage()` to zh-TW |
| FR-003 audit row class | Playwright `tr.has-shortfall` count matches expected shortfall years |
| FR-004 Copy Debug field | Unit test: parse Copy Debug JSON, assert every row has `hasShortfall: boolean` |
| FR-005 zero false positives | Playwright on feasible-scenario fixture: 0 ranges, 0 caption, 0 row classes |
