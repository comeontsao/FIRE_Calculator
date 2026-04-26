# Research — Tabbed Dashboard Navigation

**Feature**: `013-tabbed-navigation`
**Date**: 2026-04-25

This document captures the design decisions taken during planning, with the alternatives that were considered and rejected. Every decision below resolves a question that surfaced during brainstorming or constitution re-check.

---

## R-001 — Chart.js sizing inside hidden tabs

**Decision**: On every pill activation, walk the pill's chart instances and call `chart.resize()`. All charts stay registered with Chart.js even when their containing pill is hidden via `display:none`.

**Rationale**: Chart.js renders to a `<canvas>` whose dimensions are read at chart-init time. When a canvas is inside a `display:none` ancestor at init, both width and height are 0; the chart subsequently renders empty. The well-known fix is to call `chart.resize()` once the canvas becomes visible — Chart.js then reads the now-correct dimensions and re-paints. This is the standard pattern documented in Chart.js's own FAQ and is what every tabbed dashboard built on Chart.js does.

**Alternatives considered**:

- **Lazy-initialize charts on first pill view** — would require rewriting every chart's init path to defer until visible, dragging in test-fixture and timing complexity. Rejected because all 4 tabs are present in DOM at load (FR-012), so we can keep the existing init-on-load pattern and just add a single resize call on visibility.
- **Use `visibility: hidden` instead of `display: none`** — keeps layout but hides content. Charts would init at correct dimensions because the canvas is laid out. Rejected because (a) it leaves the hidden-pill content's whitespace pushing the page height up, defeating the "less on screen" goal, and (b) accessibility tools still announce hidden content as present.

**Implementation note**: store chart references on a registry so the activator can find them by pill ID; alternative is iterating all `Chart.instances` and filtering by canvas DOM ancestry. Either works.

---

## R-002 — IntersectionObserver for sticky compact header (Feature 006 US2) across hidden tabs

**Decision**: Re-scope the existing IntersectionObserver to a fixed-height sentinel `<div>` placed at the top of every tab container (one sentinel per tab). The active tab's sentinel is observed; on tab switch, disconnect from the old sentinel and reconnect to the new one.

**Rationale**: Feature 006 US2 wires sticky-header pinning to scroll position via IntersectionObserver. Today the observer watches an element near the top of the single-scroll layout. Once tabs hide most of the page via `display:none`, the observed element may itself be hidden (observer still fires, but reports `intersectionRatio: 0` constantly). We could either (a) move the observed element to persistent chrome (above the tab bar) — but that breaks the "header pins when content scrolls past" semantic, since the chrome itself never scrolls — or (b) place a sentinel inside each tab container and rebind on tab switch. (b) preserves the original semantic exactly.

**Alternatives considered**:

- **Drop sticky compact header during this feature**, restore later. Rejected — it's a UX regression and Feature 006 was non-trivial work to ship.
- **Switch to `scroll` event listener** instead of IntersectionObserver. Rejected — `scroll` runs on the main thread on every frame, IntersectionObserver delegates to the browser. Performance regression for no benefit.
- **Use a single sentinel placed at the body top, outside tab containers**. Rejected — that sentinel is always visible (since persistent chrome is always rendered), so the observer never fires once the page has loaded. Defeats the purpose.

**Implementation note**: the sentinel can be a 1px-height invisible div with class `tab-scroll-sentinel`. On tab switch, the activator calls `observer.disconnect()` then `observer.observe(newTab.querySelector('.tab-scroll-sentinel'))`.

---

## R-003 — URL hash routing pattern: `pushState` vs `replaceState`

**Decision**:
- **User-initiated** tab/pill change (click on tab, click on pill, `Next →` button): use `history.pushState` — adds a history entry so Back/Forward navigates through view changes.
- **System-initiated** state restoration (page load with hash, page load with localStorage value, fallback from invalid hash to default): use `history.replaceState` — updates the URL without adding a history entry.
- **Listen for `popstate`** to drive tab/pill changes when the user uses browser Back/Forward.

**Rationale**: The user expectation is that browser Back/Forward steps through view changes (FR-028 requires this). Using `pushState` for clicks gives that for free. Using `replaceState` for system-driven loads avoids polluting history with synthetic entries (e.g., reloading the page would otherwise create a duplicate history entry on every reload). `popstate` fires on Back/Forward and is read to set the active tab+pill from the new hash.

**Alternatives considered**:

- **Use `pushState` for everything** including reloads. Rejected — would bloat history with reload entries; user pressing Back after a reload would land on the same view they just had.
- **Use `replaceState` for everything** including clicks. Rejected — Back/Forward would skip over view changes, surprising the user.
- **Use the `hashchange` event** instead of `popstate`. Workable but `popstate` plays better with `pushState`/`replaceState` semantics — `hashchange` fires on every hash mutation including programmatic ones, requiring extra guard logic.

---

## R-004 — `localStorage` write failure handling

**Decision**: Wrap every `localStorage.setItem('dashboardActiveView', ...)` call in `try/catch`. On exception, log a debug message (no `console.error`, no `[shim-name]` prefix — this is not a calc shim) and continue with in-memory state. Read failures (`getItem` returning null or invalid JSON) fall back to first-time-visitor defaults per FR-026/FR-027.

**Rationale**: Private browsing modes throw `QuotaExceededError` on `setItem`. The feature must not crash. Tab/pill state in memory continues to work for the session; only persistence across reloads is lost (acceptable degradation). The decision to suppress `console.error` is to avoid false positives in the SC-008 smoke check (zero `[shim-name]` prefixed errors during walkthrough).

**Alternatives considered**:

- **Silent swallow without log** — rejected, makes debugging harder.
- **Bubble up to user** — rejected, this is non-actionable for the user and would be alarming.
- **Use sessionStorage as fallback** — possible but adds complexity for a low-frequency edge case. The simpler pattern (in-memory only, accept the loss) is fine.

---

## R-005 — Mobile pill-bar overflow pattern

**Decision**: Apply CSS `overflow-x: auto`, `flex-wrap: nowrap`, `-webkit-overflow-scrolling: touch` to both the top tab pill bar and every sub-tab pill bar. No JS-driven scroll-snap or auto-center on active pill.

**Rationale**: This is the standard mobile-friendly horizontal-scroll pattern that requires no JS. The user requested horizontal scroll explicitly (Q6.C in brainstorming). The top tab bar with 4 tabs likely fits without scrolling on most phones; scrolling kicks in only if needed. The sub-tab pill bar (up to 6 pills in Plan) more often needs the scroll.

**Alternatives considered**:

- **Auto-scroll the active pill into view on activation**. Nice-to-have. Rejected as scope-creep for this feature; can be added later if user feedback asks for it. The activated pill becomes visible as content even if its bar position is partially off-screen.
- **Horizontal momentum scroll with custom JS** (`-webkit-overflow-scrolling: touch` doesn't apply on every browser). Rejected — modern Chrome/Edge/Firefox handle native scrolling fine without it; iOS Safari is the one that benefits. Adding a JS shim is unnecessary.
- **Wrap to 2 lines on narrow screens** instead of scrolling. Rejected by user choice during brainstorming (Q6.C explicit pick).

---

## R-006 — Cross-pill click handlers (country card → Country Deep-Dive)

**Decision**: Expose a single public method `tabRouter.activate(tab, pill)` that all click handlers call — both pill-bar clicks and any cross-pill click (e.g., a country card in Geography/Scenarios switching to Geography/Country Deep-Dive). The existing country-card click handler is rewired to call `tabRouter.activate('geography', 'country-deep-dive')` after it sets the deep-dive's content.

**Rationale**: One activation API means one place to enforce invariants (URL hash sync, localStorage write, chart resize, sentinel rebind). Cross-pill clicks become trivial. This is the natural fit since the existing handler already updates the deep-dive panel; it just additionally needs to surface the panel via tab activation.

**Alternatives considered**:

- **Imperative DOM toggling at each click site** — rejected, scatters invariant enforcement and risks divergence.
- **Custom event (`dashboard:activate`) with a listener inside `tabRouter`** — slightly more decoupled but adds a level of indirection that's overkill for an in-page UI. Stick with direct method calls.

---

## R-007 — `Next →` button treatment on the last pill of each tab

**Decision**: Render the `Next →` button on every card, but on the last pill of each tab apply the `disabled` HTML attribute. Button stays in DOM for visual consistency; pointer becomes default; click is a no-op.

**Rationale**: Three options were on the table:
1. **Disabled button** (chosen): consistent layout, instantly recognizable as "end of tab," zero new i18n strings.
2. **Hidden button**: changes card height/spacing across pills inconsistently; could shift focus order.
3. **Replace label with "Done →" or "Continue to Geography →"**: requires per-pill i18n keys (4 new pairs), introduces logic about what the next tab is, harder to internationalize cleanly.

Option 1 is simplest, most consistent, and zero net i18n cost.

**Alternatives considered**: see above.

---

## R-008 — Where to extract the routing controller (`calc/tabRouter.js` vs inline `<script>`)

**Decision**: Extract to `calc/tabRouter.js`, loaded by both HTML files via `<script src="calc/tabRouter.js"></script>`. The controller exposes a small surface on `window.tabRouter` (`init`, `activate`, `getState`).

**Rationale**: Principle II says calc modules SHOULD eventually migrate to `calc/` and be Node-importable for unit testing. While `tabRouter` isn't a calculation module, the same testability argument applies: routing edge cases (invalid hash, popstate, fallback to default, localStorage write failure) are exactly the kind of code that benefits from headless unit tests. Extracting now sidesteps the "test-only by browser smoke" anti-pattern.

The controller deliberately does not import any DOM-specific code at module load — it accepts the DOM container references via `init(options)` so Node tests can pass mock containers.

**Alternatives considered**:

- **Inline `<script>` block in both HTML files** — fits the transitional pattern (Principle II allows this) but doubles the maintenance surface (two copies must stay in sync). Rejected because (a) feature 012 already established the `calc/<module>.js` pattern with `ssEarningsRecord.js`, and (b) testability outweighs the marginal cost of one new file.
- **Single inline definition with a copy-paste warning comment** — even worse than two inline copies; relies on discipline.

---

## R-009 — Chart instance discovery for resize-on-activation

**Decision**: Maintain a registry `tabRouter._chartsByPill = {<pillId>: [chart1, chart2, ...]}` populated at chart-init time by each chart's existing init code calling `tabRouter.registerChart(pillId, chartInstance)`. On pill activation, look up `_chartsByPill[newPillId]` and call `.resize()` on each.

**Rationale**: Three options:
1. **Explicit registry** (chosen): O(1) lookup on activation, exact set of charts to resize, no false positives. Each chart-init site already has the chart instance and the pill ID is known from the markup; one extra line per chart.
2. **DOM walk + `Chart.getChart(canvas)` lookup** at activation time: works without registry but every activation does a `querySelectorAll('canvas')` traversal under the active pill. Marginally slower; relies on Chart.js's static `getChart` API.
3. **Iterate `Chart.instances` (or its replacement `Chart.registry`) and check ancestry**: hardest to read; risk of resizing charts in unrelated pills.

Registry is cleanest. There are ~10–12 charts total across both files, so the registration boilerplate is small.

**Alternatives considered**: see above.

---

## R-010 — i18n key namespace (`nav.tab.*` vs `tab.*`)

**Decision**: Use `nav.tab.<id>` for tab labels, `nav.pill.<id>` for pill labels, and `nav.next` for the `Next →` button. Reserve the `nav.*` namespace for navigation-chrome strings going forward.

**Rationale**: Existing i18n keys are organized by surface — `sec.*` for section titles, `header.*` for header strings, `kpi.*` for KPI labels, etc. A new `nav.*` namespace cleanly groups tab/pill/router strings without colliding with existing keys. Using sub-namespaces (`nav.tab` and `nav.pill`) also keeps the dictionary readable.

**Alternatives considered**:

- **Reuse existing `sec.*` keys** for pill labels (since most pills correspond to existing section titles). Tempting because it would save ~10 new strings — but the pill label is shown on a small pill button, while the section title is shown above a card; they may want to diverge in length and tone (e.g., the pill label "Country Chart" vs the section title "Years to FIRE by Retirement Location"). Rejected to keep flexibility.
- **Flat `tab_plan`, `pill_profile`** etc. without dotted namespaces. Rejected — inconsistent with existing convention.

**Implementation note**: full key list with EN + zh-TW values in `contracts/tab-i18n.contract.md`.

---

## R-011 — Quick What-If removal scope

**Decision**: Delete the Quick What-If markup, JS event handlers, and i18n keys completely from both HTML files in the same commit that adds tab navigation. Do not preserve as a hidden module.

**Rationale**: User explicitly said "I never use the quick what if, so we don't need that" during brainstorming. Removing entirely (not hiding) means: smaller files, no dead code to confuse future readers, and a clean grep target (`grep -i quickwhatif` in both files) for the SC-012 success criterion.

**Removal targets (audit before commit)**:
- HTML: every element with id starting `quickWhatIf` or class `quick-what-if`; the entire card section labeled `sec.whatIf`.
- JS: any function or event handler bound to those elements.
- i18n: every key under `whatIf.*` or `sec.whatIf` in both `TRANSLATIONS.en` and `TRANSLATIONS.zh`, in both files. Catalog row in `FIRE-Dashboard Translation Catalog.md` removed.
- Translation Catalog: row removed.

**Verification**: `grep -in "whatif\|quickwhatif" FIRE-Dashboard.html FIRE-Dashboard-Generic.html` returns zero matches post-implementation.

---

## Summary

All 11 research questions resolved with concrete decisions. No NEEDS CLARIFICATION remain. Implementation can proceed to Phase 1 contracts (already drafted as part of this planning run) and then Phase 2 task generation.
