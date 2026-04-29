# Phase 0 Research — Feature 017

## Research Tasks Identified

The Technical Context section produced no `NEEDS CLARIFICATION` markers — the spec phase resolved all design questions. Phase 0 instead investigates four implementation-level questions that affect HOW (not WHAT) we implement.

---

## R1. Chart.js custom plugin pattern for shaded bands (no new dependency)

**Decision:** Inline plugin object passed via the chart's `plugins` array (or registered globally), implementing `beforeDatasetsDraw(chart, args, options)` to fill rectangles in chart-area pixel coordinates derived from `chart.scales.x.getPixelForValue(age)`.

**Rationale:** Chart.js 4.4.1 supports inline plugin definitions per-chart since v3. No third-party annotation plugin needed. The `beforeDatasetsDraw` hook fires after axes are drawn but before data series, so bands render *under* the lines. Pattern is well-documented in Chart.js docs and used widely. Avoids adding `chartjs-plugin-annotation` (would require a CDN-loaded second script and Constitution-Principle-V approval).

**Alternatives considered:**
- `chartjs-plugin-annotation` — most ergonomic API but adds a runtime CDN dep (rejected per Principle V).
- Painting rectangles in HTML/CSS as absolutely-positioned divs over the canvas — fragile under chart resize.
- Using `chart.options.plugins.annotation` natively — does not exist without the plugin.

**Reference snippet (informative only — final code in implementation):**

```js
const stageBandsPlugin = {
  id: 'pviStageBands',
  beforeDatasetsDraw(chart) {
    const stageBoundaries = chart.options.plugins.pviStageBands?.boundaries;
    if (!stageBoundaries) return;
    const { ctx, chartArea, scales } = chart;
    // Three rectangles: I (windowStart → firstPayoffAge),
    //                  II (firstPayoffAge → secondPayoffAge),
    //                  III (secondPayoffAge → end).
    // Colors from CSS variables --chart-phase1/2/3 at 6% opacity.
  },
};
```

---

## R2. Resolving CSS variables (`--chart-phase1`/2/3) inside canvas drawing

**Decision:** Read the variables once on chart creation via `getComputedStyle(document.documentElement).getPropertyValue('--chart-phase1').trim()`, then pass the resolved color strings into the plugin via `chart.options.plugins.pviStageBands.colors`. Apply opacity by re-emitting as `rgba()` after parsing the OKLCH source.

**Rationale:** Canvas 2D context does NOT resolve CSS variables — `ctx.fillStyle = 'var(--foo)'` silently fails. The variables resolve to OKLCH strings (e.g., `oklch(60% 0.14 var(--hue-terra))`) which Chart.js `ctx.fillStyle` accepts directly in modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+). For the 6% band opacity, we wrap the OKLCH in `color-mix(in oklch, oklch(...) 6%, transparent)` — supported in the same browser baseline.

**Alternatives considered:**
- Hardcode hex colors in the plugin — violates the dark-theme variable system (would need a manual update if the palette ever shifts).
- Convert OKLCH → RGB at runtime — needs a color library (Principle V violation).
- Layer a translucent `<div>` overlay outside the canvas — mismatches chart's animated resize behavior.

**Implication:** Document a minimum browser baseline note in the calc module's chart-renderer comment. The dashboard already targets evergreen browsers; this is consistent.

---

## R3. localStorage migration / back-compat for `pvi.lumpSumPayoff`

**Decision:** Treat absence-of-key as `false` (matches the chosen default OFF in Q3). No migration step required.

**Rationale:** Existing PvI localStorage keys (per feature 016) are read with `JSON.parse(localStorage.getItem(key) ?? 'false')` style — already handles missing keys. New key `pvi.lumpSumPayoff` follows the same convention. No version bump on the localStorage schema is required because the new key is additive and defaults safely.

**Alternatives considered:**
- Add a `pvi.schema.version` key and gate behind it — premature for a one-key addition.
- Store under a nested object (`pvi.toggles.lumpSumPayoff`) — inconsistent with existing flat-key pattern.

---

## R4. Threading `lumpSumPayoff` through state plumbing without Principle III violation

**Decision:** Single canonical source = the checkbox `checked` state, mirrored to/from `localStorage.pvi.lumpSumPayoff` on user interaction and on page load. The dashboard's existing `assemblePayoffVsInvestInputs()` (or equivalent) reads the checkbox state at recompute time and passes it as `inputs.lumpSumPayoff`. No global mutable variable; no second copy of the truth.

**Rationale:** Principle III prohibits multiple consumers re-deriving shared state from different sources. Here the chain is: DOM checkbox → input record → calc module → render. localStorage is a persistence sidecar (write on change, read on init), not a parallel source. Recompute-on-toggle is the existing pattern for the refi and effective-rate toggles.

**Alternatives considered:**
- Cache the value in a top-level `let lumpSumPayoff = false` — creates two sources of truth (the variable and the DOM).
- Read directly from localStorage at recompute time — slow (storage call per recompute) and weakens the DOM as canonical truth.

---

## Open NEEDS CLARIFICATION items

None. All Phase 0 questions resolved.

## Phase 0 Output

This research file. Phase 1 begins next.
