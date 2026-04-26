# Research — Calculation Audit View

**Feature**: `014-calc-audit`
**Date**: 2026-04-26

This document captures design decisions taken during planning, with alternatives considered and rejected. Every decision below resolves a question that surfaced during spec review and Constitution check.

---

## R-001 — Audit assembler architecture (pure factory function)

**Decision**: A single pure function `assembleAuditSnapshot(options)` exported from `calc/calcAudit.js`. Inputs are passed by reference through `options`; no global reads inside the function.

```text
options = {
  inputs,                          // resolved input object from getInputs()
  fireAge,                         // current calculated FIRE age
  fireMode,                        // 'safe' | 'exact' | 'dieWithZero'
  annualSpend,                     // post-mortgage-adjusted spend
  rawAnnualSpend,                  // pre-adjustment spend (for spending-adjustments section)
  effectiveSpendByYear,            // [{age, spend}] for the spend-curve chart
  lastStrategyResults,             // _lastStrategyResults snapshot (or null if no recalc)
  fireAgeCandidates,               // [{age, feasible, signedEndBalance}] for the FIRE-age scatter
  // calc-engine references (passed in, NOT global-read):
  projectFullLifecycle,            // function reference
  signedLifecycleEndBalance,       // function reference
  isFireAgeFeasible,               // function reference
  getActiveChartStrategyOptions,   // function reference
  // i18n helper (so the assembler can produce localized plain-English verdicts):
  t,                               // function (key, ...args) => string
  // optional document handle (for terminalBuffer input lookup):
  doc,                             // typeof document; null in Node tests
};
```

**Rationale**:
- Pure module per Constitution Principle II: no DOM, no `window`, no `localStorage` reads inside the function body.
- Node-testable: pass mocks for the calc-engine references and `t()`; assert `AuditSnapshot` shape.
- Separates "what to display" from "how state is sourced" — the dashboard's boot code can wire `assembleAuditSnapshot` to the real globals, while tests wire it to fixtures.

**Alternatives considered**:
- **Direct global reads** (the assembler reads `window._lastStrategyResults` etc. internally). Rejected — violates Principle II purity, harder to test in Node.
- **Class-based assembler** (instantiate once, hold references). Rejected — overkill for a stateless transformation; adds construction ceremony with no benefit.
- **Multiple per-section functions** (`assembleGateSection`, `assembleStrategyRanking`, etc.). Rejected — fine in concept but the cross-section data dependencies (e.g., the gate section's `trajectorySeries` is the same data the lifecycle section uses) are easier to manage as one assembly pass that produces a single snapshot.

---

## R-002 — Flow diagram rendering (HTML+CSS, not Chart.js)

**Decision**: The horizontal flow diagram at the top of the Audit tab is rendered as plain HTML + CSS (flexbox row of stage boxes, connected by `▶` glyphs or `::after` arrow pseudo-elements). NOT a Chart.js chart, NOT an external library like mermaid or D3.

**Rationale**:
- Constitution Principle V (zero-build, zero-dependency): no new library, no build step.
- Renders instantly on every recalc; no chart-instance lifecycle to manage.
- Mobile responsive via simple `@media (max-width: 767px)` flex-direction switch (horizontal → vertical).
- Each stage is a `<button>` so click-to-scroll is native + accessible (keyboard-navigable, screen-reader-readable).
- Plays well with the existing dark-theme CSS variable system.

**Alternatives considered**:
- **mermaid.js diagram**: would require a CDN dependency. Rejected (Principle V).
- **SVG hand-drawn**: doable but adds complexity for ~6 boxes that flexbox handles perfectly.
- **Chart.js with a custom plugin**: Chart.js doesn't naturally produce flowchart-style diagrams; would need significant plugin code. Rejected for simplicity.

**Implementation note**: stage boxes use the existing `--card` / `--accent` / `--border` variables; arrows are `::after` pseudo-elements with `border-style: dashed` and an inline `▶` glyph for accessibility.

---

## R-003 — Per-section chart sizing and library choice

**Decision**: Reuse the existing Chart.js library (already loaded for the main lifecycle chart). Each Audit chart targets 300×180px desktop / 280×160px mobile. Charts are wrapped in a `.audit-chart` div.

**Rationale**:
- Chart.js is already loaded — no new dependency.
- The size keeps multiple charts on one scrollable page without overwhelming.
- Standard size lets all Audit charts share visual rhythm; the user reads down a column of consistent-sized panels.

**Alternatives considered**:
- **Inline SVG sparklines** (no library): too primitive for the gate-trajectory + floor-line + violation-markers we need.
- **Bigger charts (500×300)**: the user has up to 14 charts on one page; they'd scroll forever.
- **Tabular-only "charts"** (CSS-rendered bars from data attributes): rejected because the user explicitly asked for charts ("results in the charts").

**Implementation note**: a single utility helper `renderAuditChart(canvasEl, type, data, options)` wraps Chart.js construction and applies the dashboard's existing theme defaults (font, colors). Each chart has a known `id` so the deferred-render code can dispose-and-recreate cleanly on subsequent recalcs.

---

## R-004 — Deferred render (charts only build when Audit tab is active)

**Decision**: Audit chart instances are created lazily on the FIRST activation of the Audit tab via `tabRouter`'s `onAfterActivate` callback. Subsequent recalcs while the Audit tab is the active tab trigger a re-render via `audit.update()`. When the user switches to another tab, the chart instances are NOT destroyed (kept warm), so re-activating is fast.

**Rationale**:
- FR-027 / FR-028 / SC-006: no recalc overhead when Audit tab isn't active.
- Charts kept warm on tab switch means re-activation is cheap (Chart.js `update()` on existing instance, not `new Chart()`).
- Aligns with Feature 013's `tabRouter.registerChart` pattern — Audit charts are registered the same way as existing charts.

**Alternatives considered**:
- **Build all charts at boot**: violates FR-028 (every recalc would build all Audit charts even if user is on Plan tab).
- **Build on every Audit activation, destroy on deactivation**: wastes work and adds construction latency on every tab visit.
- **Manual "Refresh" button on Audit**: rejected — the user expects the Audit to always be live; staleness is a worse UX than the rendering cost.

**Implementation note**: a flag `_auditChartsBuilt = false` is flipped on first activation. The `onAfterActivate` callback inspects the flag, builds-or-updates as appropriate, then continues.

---

## R-005 — Cross-validation invariant set

**Decision**: Four invariants checked automatically per recalc:

| Invariant | Path A | Path B | Tolerance | Expected when known divergence? |
|-----------|--------|--------|-----------|-------------------------------|
| **A — End balance match** | `signedLifecycleEndBalance(...).endBalance` | `projectFullLifecycle(...).last.total` | $1000 abs OR 1% rel | Yes when active strategy ≠ bracket-fill (signed sim is bracket-fill-only by design — annotated "(expected — different sim contracts)") |
| **B — Active-strategy feasibility** | `_lastStrategyResults.rows[active].feasibleUnderCurrentMode` | `_chartFeasibility(active.id, active.theta).feasible` | strict equality | No — these MUST agree by construction |
| **C — Displayed FIRE age = ranker FIRE age** | dashboard's displayed FIRE age | `_lastStrategyResults.fireAge` (or fallback) | strict equality | No |
| **D — Floor violation count** | violations from `isFireAgeFeasible(active strategy)` | violations from `_chartFeasibility(active strategy)` for the floor-checking modes | strict equality | No |

**Rationale**:
- Each invariant catches a different class of bug. A is the classic "signed sim and chart drifted apart" check; B is the "ranker-vs-display" check that has bitten us before; C is the "FIRE age display lies" check; D is the "two paths through the same floor logic" check.
- Annotating expected divergences (rather than hiding them) keeps the cross-validation honest — the user can see "yes the systems differ here, but it's by design".

**Alternatives considered**:
- **Single mega-invariant** (deep-equal everything): too noisy — surfaces every legitimate difference between sim contracts as a "warning."
- **Add more invariants** (e.g., per-year totals match): out of scope for the MVP audit; the per-year table already exposes those values for human comparison. If additional invariants prove valuable they can be added in a follow-up feature.

---

## R-006 — Click-to-scroll from flow diagram to detail section

**Decision**: Use native `element.scrollIntoView({behavior: 'smooth', block: 'start'})` plus a brief `.audit-section--highlight` CSS class flash (1.5s, fade-out) on the targeted section.

**Rationale**:
- Native API: zero new code, accessible, smooth-scroll respects user's `prefers-reduced-motion` setting.
- The flash makes navigation confirmation visible without requiring user attention shift.

**Alternatives considered**:
- **Anchor links (`<a href="#section-...">`)**: would update the URL hash and conflict with the tabRouter's hash handling. Rejected.
- **JS-driven manual scroll calculation**: harder to maintain than `scrollIntoView`. Rejected.
- **No flash, no smooth scroll** (jump cuts): less polished UX. Rejected.

---

## R-007 — Bilingual-safe plain-English gate verdicts

**Decision**: Verdict strings are template strings stored under keys like `audit.gate.safe.verdict.feasible` and `audit.gate.safe.verdict.infeasible`. They use `{0}`-style placeholders for numeric values, so EN and zh-TW each carry their own template; the audit assembler emits the SAME numeric arguments for both languages.

Example (FR-007 / Story 4 acceptance):

```text
EN: 'audit.gate.safe.verdict.feasible': 'Safe: every retirement-year total ≥ ${0}. End balance ${1}. Verdict: feasible.'
zh: 'audit.gate.safe.verdict.feasible': '安全：每年退休後總額 ≥ ${0}。期末餘額 ${1}。判定：可行。'

EN: 'audit.gate.safe.verdict.infeasible': 'Safe: every retirement-year total ≥ ${0}. First violation at age {1} (total ${2}). Verdict: infeasible.'
zh: 'audit.gate.safe.verdict.infeasible': '安全：每年退休後總額 ≥ ${0}。首次違反於 {1} 歲（總額 ${2}）。判定：不可行。'
```

**Rationale**:
- Constitution Principle VII NON-NEGOTIABLE: every user-visible string ships in EN + zh-TW.
- Numeric values stay numeric (not localized) — the user's existing i18n `t()` helper interpolates them as strings, but the audit assembler emits canonical USD-formatted numbers (`$60,100`) for clarity.
- Splitting "feasible" vs "infeasible" into separate keys avoids constructing sentences from concatenated fragments (which fights translation).

**Alternatives considered**:
- **Single key with conditional logic in JS**: harder to translate; smaller pieces of meaning split across runtime code.
- **Generate verdicts in JS without i18n**: fails Principle VII.

---

## R-008 — Copy Debug payload integration

**Decision**: The Audit's `AuditSnapshot` is cached on `window._lastAuditSnapshot` immediately after each `recalcAll` finishes. The existing Copy Debug button reads from this cache (NOT recomputes) when serializing. The new `audit` key sits at the top level of the debug JSON, alongside the existing `feasibilityProbe`, `summary`, `lifecycleSamples` keys (none of which are removed — FR-020).

**Rationale**:
- SC-011 requires the JSON's audit data to be byte-for-byte equivalent to what the UI is rendering. Caching the snapshot guarantees this — both UI and JSON read from the same object.
- No additional computation when the user clicks Copy Debug → fast.
- Backward-compatible: prior debug payloads remain comparable; only an additive key.

**Alternatives considered**:
- **Recompute on Copy Debug click**: risks divergence between UI snapshot and JSON snapshot if the user changes inputs between Audit-tab activation and Copy Debug click. Rejected.
- **Replace the existing `feasibilityProbe` key**: breaks backward compatibility for anyone with prior debug payloads. Rejected (FR-020).

---

## R-009 — Audit tab placement in the existing tab structure

**Decision**: The Audit tab is the **5th** top-level tab, appearing AFTER `History`. It contains a single sub-pill `summary` for the MVP. The tabRouter's `TABS` constant gains a 5th entry.

```text
TABS = [
  { id: 'plan',       pills: [...] },
  { id: 'geography',  pills: [...] },
  { id: 'retirement', pills: [...] },
  { id: 'history',    pills: [...] },
  { id: 'audit',      pills: [{ id: 'summary', labelKey: 'nav.pill.summary' }] },
];
```

**Rationale**:
- Last-position placement does not disturb the existing user-facing flow (Plan → Geography → Retirement → History).
- The audit is a diagnostic tool, not part of the daily workflow — last-position matches its priority.
- A single-pill tab (`summary`) preserves the existing pill-bar pattern (FR-023). Future versions MAY split the Audit into multiple pills (`inputs` / `gates` / `strategies` / `projection`) if scrolling becomes unwieldy.

**Alternatives considered**:
- **Position before History**: rejected — History is more user-facing than Audit.
- **No tab, just an expanded Copy Debug panel**: rejected — the spec explicitly asks for a separate viewable surface (the QA engineer needs to scroll through visualizations, not parse JSON).

---

## R-010 — Lifecycle Projection chart thumbnail (re-render or snapshot?)

**Decision**: The Lifecycle Projection section's chart thumbnail is a NEW Chart.js instance bound to its own canvas, rendered from the SAME `lifecycleSeries` data the main chart in `Retirement → Lifecycle` consumes. It is NOT a screenshot or DOM-clone of the main chart.

**Rationale**:
- A separate instance keeps the two charts independent (the thumbnail can use simpler axis labels, smaller tick density, no draggable FIRE marker — that's a Retirement-tab interaction).
- Both charts read from the same source-of-truth data array, so they cannot drift.
- Aligns with Constitution Principle III (single source of truth) — the source is the data, and both charts consume it.

**Alternatives considered**:
- **Mirror the main chart via DOM cloning**: brittle, breaks when the main chart's class names change.
- **CSS scale transform**: doesn't actually shrink the chart's tick density / label font sizes.

---

## R-011 — `_lastAuditSnapshot` schema versioning

**Decision**: The `AuditSnapshot` carries a top-level `schemaVersion: '1.0'` field. Future breaking changes to the snapshot shape (e.g., adding required fields) bump this number. Code that consumes the snapshot (renderers, debug serializer) MAY check the version but is not required to — additive changes don't bump the version.

**Rationale**:
- Future-proofs the Copy Debug JSON for tooling that wants to ingest snapshots from old vs new dashboards.
- Cheap insurance — single string field.
- Aligns with how localStorage migrations are handled elsewhere in the project (e.g., `ssEarningsHistory`'s structure).

**Alternatives considered**:
- **No versioning**: rejected — even though the snapshot is internal, debug payloads get pasted into bug reports that may be revisited months later.

---

## Summary

11 research questions resolved with concrete decisions. No NEEDS CLARIFICATION remain. Implementation can proceed to Phase 1 contracts and then Phase 2 task generation.
