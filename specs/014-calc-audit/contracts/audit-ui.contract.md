# Contract — Audit Tab UI Markup, Classes, Chart Instances

**Feature**: `014-calc-audit`
**Files affected**: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` — both must use IDENTICAL markup, IDs, and classes per Constitution Principle I.

---

## Top-level Audit tab structure

The Audit tab is added as the **5th** `<section>` inside `#tabContainer` (after the existing 4 tab-panels from feature 013). It contains a single sub-pill `summary` (FR-023) so the existing pill-bar pattern is preserved.

```html
<section id="tab-audit" class="tab-panel" data-tab="audit" hidden role="tabpanel">
  <div class="tab-scroll-sentinel" aria-hidden="true"></div>
  <nav class="pill-bar" role="tablist" aria-label="Audit sections">
    <button class="pill active" data-tab="audit" data-pill="summary" role="tab"
            aria-selected="true" data-i18n="nav.pill.summary">Summary</button>
  </nav>

  <div class="pill-host" data-tab="audit" data-pill="summary">
    <!-- AUDIT MARKUP — see sections below -->
  </div>
</section>
```

Tab bar gains a 5th `<button class="tab">`:

```html
<button class="tab" data-tab="audit" role="tab" aria-controls="tab-audit"
        aria-selected="false" data-i18n="nav.tab.audit">Audit</button>
```

---

## Audit markup outline (inside `.pill-host[data-tab="audit"]`)

```html
<div class="audit-root">

  <!-- Section 1: Calculation Flow Diagram -->
  <section id="audit-flow-diagram" class="audit-section audit-section--flow">
    <h2 data-i18n="audit.section.flow.title">Calculation Flow</h2>
    <div class="audit-flow">
      <button class="audit-flow__stage" data-target="audit-section-inputs">
        <div class="audit-flow__label" data-i18n="audit.flow.stage.inputs">Inputs</div>
        <div class="audit-flow__headline" id="audit-flow-headline-inputs"></div>
      </button>
      <span class="audit-flow__arrow" aria-hidden="true">▶</span>
      <span class="audit-flow__arrow-label" id="audit-flow-arrow-inputs-spending"></span>
      <button class="audit-flow__stage" data-target="audit-section-spending">…</button>
      <!-- 4 more stages + arrows -->
    </div>
  </section>

  <!-- Section 2: Resolved Inputs -->
  <section id="audit-section-inputs" class="audit-section">
    <h2 data-i18n="audit.section.inputs.title">Resolved Inputs</h2>
    <div class="audit-grid">
      <div class="audit-chart"><canvas id="audit-chart-inputs-pie"></canvas></div>
      <div class="audit-table-wrap" id="audit-table-inputs"></div>
    </div>
  </section>

  <!-- Section 3: Spending Adjustments -->
  <section id="audit-section-spending" class="audit-section">
    <h2 data-i18n="audit.section.spending.title">Spending Adjustments</h2>
    <div class="audit-grid">
      <div class="audit-chart"><canvas id="audit-chart-spending-curve"></canvas></div>
      <div class="audit-table-wrap" id="audit-table-spending"></div>
    </div>
  </section>

  <!-- Section 4: Gate Evaluations -->
  <section id="audit-section-gates" class="audit-section">
    <h2 data-i18n="audit.section.gates.title">Gate Evaluations</h2>
    <div class="audit-gate" data-gate="safe">
      <div class="audit-gate__verdict" id="audit-gate-safe-verdict"></div>
      <div class="audit-chart"><canvas id="audit-chart-gate-safe"></canvas></div>
      <div class="audit-table-wrap" id="audit-table-gate-safe-violations"></div>
    </div>
    <div class="audit-gate" data-gate="exact">…</div>
    <div class="audit-gate" data-gate="dieWithZero">…</div>
  </section>

  <!-- Section 5: FIRE Age Resolution -->
  <section id="audit-section-fireage" class="audit-section">
    <h2 data-i18n="audit.section.fireage.title">FIRE Age Resolution</h2>
    <div class="audit-grid">
      <div class="audit-chart"><canvas id="audit-chart-fireage-scatter"></canvas></div>
      <div class="audit-table-wrap" id="audit-table-fireage"></div>
    </div>
  </section>

  <!-- Section 6: Strategy Ranking -->
  <section id="audit-section-strategy" class="audit-section">
    <h2 data-i18n="audit.section.strategy.title">Strategy Ranking</h2>
    <div class="audit-grid">
      <div class="audit-chart audit-chart--wide"><canvas id="audit-chart-strategy-bars"></canvas></div>
      <div class="audit-table-wrap" id="audit-table-strategy"></div>
    </div>
  </section>

  <!-- Section 7: Lifecycle Projection -->
  <section id="audit-section-lifecycle" class="audit-section">
    <h2 data-i18n="audit.section.lifecycle.title">Lifecycle Projection</h2>
    <div class="audit-grid">
      <div class="audit-chart"><canvas id="audit-chart-lifecycle-thumb"></canvas></div>
      <div class="audit-table-wrap audit-table-wrap--scroll" id="audit-table-lifecycle"></div>
    </div>
  </section>

  <!-- Section 8: Cross-Validation Warnings -->
  <section id="audit-section-crossval" class="audit-section">
    <h2 data-i18n="audit.section.crossval.title">Cross-Validation</h2>
    <div id="audit-crossval-list"></div>
  </section>

</div>
```

---

## ID inventory (must match across both HTML files)

### Static markup IDs (declared in HTML, used by JS)

| ID | Purpose |
|----|---------|
| `tab-audit` | The 5th tab-panel `<section>` |
| `audit-flow-diagram` | Anchor for the flow diagram section |
| `audit-section-inputs` | Section 2 anchor |
| `audit-section-spending` | Section 3 anchor |
| `audit-section-gates` | Section 4 anchor |
| `audit-section-fireage` | Section 5 anchor |
| `audit-section-strategy` | Section 6 anchor |
| `audit-section-lifecycle` | Section 7 anchor |
| `audit-section-crossval` | Section 8 anchor |
| `audit-flow-headline-{inputs,spending,gates,fireAge,strategy,lifecycle}` | Per-stage headline output spans (6 total) |
| `audit-flow-arrow-{inputs-spending,spending-gates,gates-fireAge,fireAge-strategy,strategy-lifecycle}` | Per-arrow label spans (5 total) |
| `audit-chart-inputs-pie` | Canvas for inputs composition pie |
| `audit-chart-spending-curve` | Canvas for spend curve |
| `audit-chart-gate-{safe,exact,dieWithZero}` | Canvas for each gate trajectory chart (3 total) |
| `audit-chart-fireage-scatter` | Canvas for FIRE-age scatter |
| `audit-chart-strategy-bars` | Canvas for strategy grouped bars |
| `audit-chart-lifecycle-thumb` | Canvas for lifecycle thumbnail |
| `audit-table-{inputs,spending,fireage,strategy,lifecycle}` | Table containers per section |
| `audit-table-gate-{safe,exact,dieWithZero}-violations` | Per-gate violations table |
| `audit-gate-{safe,exact,dieWithZero}-verdict` | Per-gate plain-English verdict span |
| `audit-crossval-list` | Container for cross-validation warning rows |

### Dynamic chart instance registry

A new module-level object `_auditCharts = {}` holds Chart.js instances keyed by canvas ID. The `tabRouter.registerChart` helper from feature 013 is called for the lifecycle thumbnail (so the existing chart-resize-on-activation flow handles it). The other Audit charts use the same registry but are not registered with `tabRouter` (they don't need cross-tab resize because they live INSIDE the audit pill).

---

## CSS class inventory

| Class | Applied to | Purpose |
|-------|-----------|---------|
| `audit-root` | wrapper inside `.pill-host` | Top-level vertical flex layout |
| `audit-section` | each of the 8 `<section>` containers | Section card styling, scroll-anchor target |
| `audit-section--flow` | the flow-diagram section | Padding override (no chart, no table — flow uses its own layout) |
| `audit-section--highlight` | TRANSIENT class added by click-to-scroll, removed after 1.5s | Brief flash to confirm navigation |
| `audit-flow` | the horizontal flex container of stages + arrows | Flexbox row, wraps to vertical at ≤767px |
| `audit-flow__stage` | each clickable stage `<button>` | Box styling + hover/focus states |
| `audit-flow__label` | top line in each stage box | Stage label (e.g., "Inputs") |
| `audit-flow__headline` | bottom line in each stage box | Live one-line summary (e.g., "42yo · $525K NW") |
| `audit-flow__arrow` | `<span>` between stages | Renders `▶` glyph (centered, accent-colored) |
| `audit-flow__arrow-label` | `<span>` between stages | Optional small label above the arrow (e.g., "fireAge = 48") |
| `audit-grid` | layout wrapper inside detail sections | 2-col grid (chart \| table) on desktop, 1-col on ≤767px |
| `audit-chart` | wrapper around each `<canvas>` | Fixed size 300×180px (320px max-width) |
| `audit-chart--wide` | wider variant for the strategy bar chart | 600×220px on desktop, full-width on mobile |
| `audit-table-wrap` | wrapper around each table | Padding + max-width |
| `audit-table-wrap--scroll` | wrapper for the lifecycle per-year table | `max-height: 400px; overflow-y: auto` for scrolling |
| `audit-gate` | wrapper around each gate's verdict + chart + violations | Border separator between the 3 gates |
| `audit-gate--active` | Added to the gate matching the active mode | Highlighted background |
| `audit-gate__verdict` | the plain-English verdict line | Bold, sized larger than table text |
| `audit-crossval-row` | each warning row inside `#audit-crossval-list` | Side-by-side dual bar + delta text |
| `audit-crossval-row--expected` | annotated expected divergence | Neutral styling instead of warning color |

---

## State classes (added/removed by JS)

- `.tab.active` (existing) — Audit tab button receives this when its pill is active.
- `.pill.active` (existing) — Audit's `summary` pill receives this.
- `.audit-gate--active` — applied to whichever gate matches the active fire mode.
- `.audit-section--highlight` — TRANSIENT (1.5s) — applied to the targeted section after click-to-scroll.

---

## Click-to-scroll wiring (R-006)

A single delegated click handler on `.audit-flow`:

```js
auditFlowEl.addEventListener('click', (ev) => {
  const stage = ev.target.closest('.audit-flow__stage[data-target]');
  if (!stage) return;
  const targetId = stage.dataset.target;
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  targetEl.classList.add('audit-section--highlight');
  setTimeout(() => targetEl.classList.remove('audit-section--highlight'), 1500);
});
```

---

## Deferred render lifecycle (R-004)

```js
let _auditChartsBuilt = false;
const _auditCharts = {};

function buildAuditCharts(snapshot) {
  // Called ONCE on first Audit-tab activation.
  _auditCharts.inputsPie = new Chart(document.getElementById('audit-chart-inputs-pie'), {...});
  _auditCharts.spendingCurve = new Chart(document.getElementById('audit-chart-spending-curve'), {...});
  _auditCharts.gateSafe = new Chart(document.getElementById('audit-chart-gate-safe'), {...});
  // ... (10–14 charts total)
  _auditChartsBuilt = true;
}

function updateAuditCharts(snapshot) {
  // Called on every subsequent recalc while Audit tab is active.
  for (const [id, chart] of Object.entries(_auditCharts)) {
    chart.data = computeChartDataFor(id, snapshot);
    chart.update('none');  // 'none' = no animation, faster
  }
}

function renderAuditUI(snapshot) {
  // Always called when the Audit tab activates AND on subsequent recalcs while active.
  renderFlowDiagram(snapshot.flowDiagram);
  renderTables(snapshot);
  if (!_auditChartsBuilt) {
    buildAuditCharts(snapshot);
  } else {
    updateAuditCharts(snapshot);
  }
}

// Wired into tabRouter.init's onAfterActivate:
onAfterActivate: (state) => {
  if (state.tab === 'audit' && window._lastAuditSnapshot) {
    renderAuditUI(window._lastAuditSnapshot);
  }
}

// Also called on every recalcAll while Audit is currently the active tab:
function recalcAll() {
  // ... existing recalc logic ...
  window._lastAuditSnapshot = window.assembleAuditSnapshot({...});
  if (window.tabRouter && window.tabRouter.getState().tab === 'audit') {
    renderAuditUI(window._lastAuditSnapshot);
  }
}
```

---

## Mobile responsive

`@media (max-width: 767px)`:

- `.audit-flow` switches `flex-direction: column` (stages stack vertically); arrows rotate to `▼`.
- `.audit-grid` collapses to 1 column (chart above table).
- `.audit-chart` shrinks to 280×160px max.
- `.audit-table-wrap` allows horizontal scroll (`overflow-x: auto`) for tables that don't fit.

---

## Lockstep enforcement

A new Playwright test in `tests/e2e/calc-audit.spec.ts` walks both HTML files and asserts identical structure:

```js
const collect = (page) => page.evaluate(() => ({
  sections: [...document.querySelectorAll('#tab-audit .audit-section')].map(s => s.id),
  canvases: [...document.querySelectorAll('#tab-audit canvas')].map(c => c.id),
  flowStages: [...document.querySelectorAll('.audit-flow__stage')].map(b => b.dataset.target),
}));
const rr = await collect(rrPage);
const generic = await collect(genericPage);
expect(rr).toEqual(generic);
```

This is the structural lockstep gate per SC-010.
