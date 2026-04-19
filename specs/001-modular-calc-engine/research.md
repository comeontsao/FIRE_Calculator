# Phase 0 Research — Modular Calc Engine

**Feature**: `001-modular-calc-engine`
**Date**: 2026-04-19
**Purpose**: Resolve open design decisions before Phase 1 (data-model, contracts).
Every decision below is chosen to honor the six constitution principles — especially
Principle V (zero-build, zero-dependency delivery).

---

## R1. Unit-test runner

**Decision**: Use Node's built-in `node:test` runner with `node:assert/strict`.

**Rationale**:
- **Zero install.** Shipping with Node ≥ 18 as a built-in means no `package.json`
  dependency tree, no `node_modules`, no lockfile. Aligns tightly with Principle V.
- **ES-module native.** Test files can `import` the production `calc/*.js` modules
  directly without a loader shim.
- **Fast.** Comparable to Vitest for the sub-second suites we're targeting; no
  framework startup overhead.
- **CLI invocation** is a one-liner: `node --test tests/`. Easy to add to a GitHub
  Action when CI arrives.

**Alternatives considered**:
- **Vitest** — excellent DX, watch mode, snapshot testing. Rejected: requires
  `node_modules`, `package.json`, and a lockfile. Introduces a dev dependency surface
  the project currently does not have. Not worth the cost for the ~15 fixture cases
  planned.
- **uvu / tape / ava** — all require install. Same rejection reason.
- **Browser-based test runner (Karma, Playwright component testing)** — overkill;
  modules are pure, and we specifically want them testable *without* a browser
  (FR-007).

**Impact**: `tests/` directory contains only `.js` files. No `package.json` is added
at the repo root. Developers run `node --test tests/` from the project root.

---

## R2. Module loading pattern

**Decision**: Native ES modules via `<script type="module" src="./calc/chartState.js"></script>`
(one `<script type="module">` tag per module, or a single bootstrap module that imports
the others).

**Rationale**:
- **Works under `file://`.** All evergreen browsers support ES modules from `file://`
  with no server (one historical caveat — CORS for `import` inside a module — is not
  triggered for same-origin siblings).
- **Same code path in Node and browser.** Node can `import './calc/lifecycle.js'`
  identically. This is what makes FR-007 (testable without HTML) free.
- **No bundler.** Principle V preserved.
- **Scopes cleanly.** Modules export what they expose; no pollution of the global
  namespace (today, everything is a `var` at global scope).
- **Editor tooling works.** VS Code resolves `import` paths natively; JSDoc types on
  exported functions give IntelliSense without a compile step.

**Alternatives considered**:
- **Global IIFE script tags** (current pattern, each calc as an IIFE attaching to a
  namespace like `window.FireCalc`). Rejected: preserves global-scope coupling that
  Principle II is trying to eliminate; Node tests would need a DOM shim or a per-module
  IIFE-unwrap hack.
- **AMD / SystemJS / Snowpack / esbuild** — bundler / loader tooling. Rejected:
  Principle V violation.
- **Dynamic `import()` at runtime with `fetch()` polyfill** — solves nothing the
  static `<script type="module">` approach doesn't solve.

**Impact**: Each HTML file gains a small bootstrap block:

```html
<script type="module">
  import { chartState } from './calc/chartState.js';
  import { runLifecycle } from './calc/lifecycle.js';
  // ... glue to Chart.js renderers in the same file
</script>
```

RR additionally loads `./personal/personal-rr.js` which maps its inputs; Generic does not.

**One caveat documented**: `file://` + `type="module"` requires the user's browser to
treat local file origins as allowed for ES imports. Chrome, Firefox, Safari current-gen
all do. IE is not supported (has been end-of-life since 2022).

---

## R3. Fixture format

**Decision**: Fixtures as `.js` files that export a frozen object with `{name, inputs,
expected, notes?}`.

**Rationale**:
- **Code, not data.** Fixtures can reuse helpers (e.g., `makeCouple(age1, age2, ...)`)
  without duplicating literals.
- **Importable by both Node and browser.** The browser-side parity harness can import
  the same fixture file.
- **Grep-friendly.** Locking an expected number requires editing a `.js` file; diff is
  readable.
- **Typed via JSDoc.** A central `tests/fixtures/types.js` exports JSDoc typedefs so
  fixtures gain editor autocomplete.
- **`Object.freeze`** on exports prevents tests from mutating shared fixtures.

**Alternatives considered**:
- **JSON files.** Rejected: no comments (Principle IV's "describe *why* the number is
  this" cannot live inline), no helpers, no type hints.
- **YAML files.** Rejected: adds a parser dependency.
- **Inline in test files.** Rejected: kills the parity-test story (we want the same
  fixture consumed by a unit test and by a parity test).

**Impact**: `tests/fixtures/*.js` pattern. Example header:

```js
// tests/fixtures/three-phase-retirement.js
/** @typedef {import('./types.js').FixtureCase} FixtureCase */
/** @type {FixtureCase} */
export default Object.freeze({
  name: 'three-phase retirement — single, age 45, $1.2M',
  inputs: { /* ... */ },
  expected: {
    yearsToFire: 8,
    fireAge: 53,
    balanceAtUnlock: 1_850_000, // ± 1%
    feasible: true,
  },
  notes: 'Locks the handoff from taxable-only → 401(k)-unlocked at age 59.5.',
});
```

---

## R4. Confirm-control UI pattern (FR-018)

**Decision**: DOM overlay positioned absolutely over the Full Portfolio Lifecycle
chart's container. Not a Chart.js annotation.

**Rationale**:
- **Chart.js doesn't render native buttons.** Annotations are drawn onto the canvas,
  meaning click targets are pixel-sniffed. That's the mechanism the current drag handler
  already uses, and it's exactly the pattern that has produced the existing maintenance
  problems.
- **DOM overlay is accessible.** A real `<button>` is keyboard-focusable, screen-reader
  readable, and styled with standard CSS. `cursor: pointer`, focus rings, and hover
  states come free.
- **Positioning is trivial.** Chart.js emits chart-coordinate → pixel-coordinate
  conversion on a per-instance basis; we compute the marker's pixel X and place the
  overlay at `left: {px}, top: {chartHeight - 40}px`.
- **Isolation from canvas redraws.** Overlay is not repainted on every animation frame
  — only when the override state changes.

**Alternatives considered**:
- **Canvas-drawn button** using a Chart.js plugin. Rejected: no accessibility, fragile
  hit-testing.
- **Always-visible "Confirm override" sidebar** outside the chart. Rejected: loses the
  spatial connection to the marker the user just dragged ("confirm THIS age").
- **Immediate override with undo toast** (like Gmail delete). Rejected: user explicitly
  asked for a confirm step in Q1.

**Impact**: Each HTML file gains a small `<div class="override-confirm" hidden>...</div>`
overlay adjacent to the lifecycle chart canvas. A lightweight positioning helper in
`chartState.js` exposes `getMarkerPixelX(chart, age)` that the HTML glue layer uses to
place the overlay. Styling lives alongside existing CSS variables (`--accent`, `--card`).

---

## R5. Drag-affordance UI pattern (FR-019)

**Decision**: Three layered hints, smallest to largest:

1. **Cursor change**: `cursor: grab` when hovering the marker; `cursor: grabbing` during
   drag. Implemented via a Chart.js plugin hit-test + canvas `style.cursor` write.
2. **Persistent label**: small italicized hint text below the marker ("drag me") that
   fades to 30 % opacity after the user's first successful drag+confirm (tracked in
   `localStorage` under `fire:dragHintSeen=true`).
3. **One-time subtle pulse**: 3-second CSS keyframe pulse on the marker on first page
   load per session. Dismisses permanently after first drag.

**Rationale**:
- Principle V: all three are pure CSS + Chart.js lifecycle hooks; no new dependency.
- Progressive disclosure: new users see the hint; veterans see a quieter dashboard.
- Accessible: cursor and label remain; only the pulse is purely visual.

**Alternatives considered**:
- **Permanent prominent "DRAG HERE" banner.** Rejected: noisy for repeat users.
- **No visible hint, rely on cursor only.** Rejected: Q2 user ask explicitly includes a
  "gentle" hint; cursor-only misses users on touch devices (no hover).
- **Touch-hint toast.** Deferred — the current drag handler is mouse-only anyway; touch
  support is a separate future feature.

**Impact**: ~20 lines of CSS, ~10 lines of JS glue in each HTML file. `localStorage` key
`fire:dragHintSeen` documented in the DB Engineer's localStorage schema (separate
feature) — included here only as a read/write, not a schema change.

---

## R6. Real-vs-nominal discipline (FR-017)

**Decision**: Every money field in every module contract carries a mandatory `Unit`
suffix: `*Real` or `*Nominal`. Lifecycle projection outputs are always **real dollars**
(today's purchasing power). Inflation conversion happens at one and only one boundary:
`inflation.js`. Any module that accepts nominal input and needs real internally MUST
call `inflation.toReal(amount, year)` explicitly.

**Rationale**:
- Eliminates the audit-identified bug where accumulation uses real returns but
  healthcare/college deltas sneak in as nominal.
- Naming convention is grep-able: a reviewer can search a renderer for `Nominal` and
  instantly see all nominal-dollar references.
- Forces module authors to declare units at the contract boundary (FR-017).

**Alternatives considered**:
- **Typed unit objects** (`{amount: 3000, unit: 'nominal', year: 2026}`). More rigorous
  but adds allocation overhead in the hot loop of the lifecycle simulator.
- **Global "all dollars are real" convention.** Rejected: silently converts at the
  input layer, losing the audit-trail we want.

**Impact**: Breaking change to internal signatures. All touched; no user-visible effect.
Naming examples: `annualSpendReal`, `healthcareCostNominal`, `portfolioValueReal`.

---

## R7. Module-boundary enforcement (Principle II)

**Decision**: Four mechanical checks in the test harness:

1. **DOM/Chart.js/`window`/`document`/`localStorage` grep** on `calc/*.js` — any hit
   fails the suite.
2. **Contract-header grep** — every `calc/*.js` MUST begin with a comment block matching
   `/\* Inputs: ... Outputs: ... Consumers: ... \*/` (regex in harness).
3. **Consumer-sync grep** — parse each module's `Consumers:` list and verify each named
   chart renderer (in the HTML files) has a reciprocal `@module:` comment citing this
   module. Bidirectional audit. (Stays disabled until US4; see tasks.md T014 and T063.)
4. **Fixture-shape conformance** — every `tests/fixtures/*.js` export imports cleanly
   and conforms to the `FixtureCase` typedef. Catches fixture drift (added/removed
   fields) before a unit test accidentally depends on an invalid fixture. Lives in
   `tests/meta/fixture-shapes.test.js` (tasks.md T015).

Checks 1, 2, and 4 live in `tests/meta/` and run as part of `node --test`. Check 3
activates in US4.

**Rationale**:
- Fast, deterministic, zero-dep.
- Catches Principle II and VI violations at the earliest possible point (before review).
- Simpler than AST parsing: the patterns we're forbidding are textual (a literal
  `document.` or `Chart.js` reference is a clear violation).

**Alternatives considered**:
- **ESLint + custom rules.** Rejected: installs ESLint (Principle V cost) for a job
  three regexes do.
- **AST-based (acorn) scanner.** Same dependency concern.
- **Honor system / code review only.** Rejected: the current audit found exactly this
  kind of violation persisting precisely because honor-system discipline had no teeth.

**Impact**: ~60 lines of test-harness code in `tests/meta/module-boundaries.test.js`.
Violations produce actionable error messages with file and line.

---

## R8. Personal-data adapter loading (FR-009, FR-010)

**Decision**: `personal/personal-rr.js` is a default-export function
`applyPersonalData(genericInputs) → enrichedInputs`. RR's HTML imports it and calls it
inside the input-gathering pipeline; Generic does not import it at all.

**Rationale**:
- Shared calc modules see an identical shape input from both dashboards. RR's adapter
  is the *only* place where Roger/Rebecca personal data enters the pipeline.
- Generic can never accidentally read personal data (file is never loaded).
- Parity test can import `personal-rr.js` with a stub of generic inputs and verify the
  output is a valid generic-input shape — catching schema drift.
- Makes FR-009 (shared calc sources) a structural invariant, not a review-time check.

**Alternatives considered**:
- **Inline personal data in RR's HTML.** Rejected: that's the current pattern and is
  exactly the source of drift the audit flagged.
- **Personal-data JSON file loaded at runtime.** Rejected: introduces a fetch step
  incompatible with `file://` on some browsers unless marked `type="module"` with a JS
  wrapper — at which point a JS module is simpler.
- **Environment-variable–style runtime toggle in one shared file.** Rejected: couples
  Generic and RR even tighter; defeats the purpose of the split.

**Impact**: `personal/personal-rr.js` ≤ 200 lines. One import + one call in RR's HTML.
Generic's HTML has no reference to `personal/` at all.

---

## R9. Override lifecycle and event ordering (FR-014)

**Decision**: `chartState.js` owns both `calculatedFireAge` and `effectiveFireAge`.
State transitions:

- `recalcAll()` → `chartState.setCalculated(newAge)` → **clears any active override** →
  `effectiveFireAge = calculated`.
- Drag end → preview only; no `chartState` mutation yet.
- Confirm click → `chartState.setOverride(draggedAge)` → `effectiveFireAge = override`.
- Reset click → `chartState.clearOverride()` → `effectiveFireAge = calculated`.
- Any listener that fires `recalcAll()` wipes the override as an atomic part of
  `setCalculated`.

`chartState` exposes a subscription API (`chartState.onChange(fn)`) that every chart
renderer registers with. A single change notification per user action.

**Rationale**:
- Makes FR-014 (override wiped on any input-triggered recalc) an invariant of
  `setCalculated`, not a convention to remember.
- The subscription pattern removes the scattered manual `renderGrowthChart(inp)` calls
  currently in the drag handler (audit lines 5770–5771). All charts react to one event.
- Matches FR-002 (one-animation-frame propagation) because the resolver and dispatch
  happen synchronously inside the user-gesture handler.

**Alternatives considered**:
- **Event bus via `CustomEvent` on a DOM node.** Rejected: drags DOM into state mgmt;
  also slightly slower (browser dispatch has overhead). We can use it for UI events but
  `chartState` itself should be pure JS.
- **Global observable (Proxy).** Rejected: cute but Principle V cost and mental overhead
  not justified.

**Impact**: `chartState.js` has a small `Set<fn>` of listeners and a `notify()` that
iterates synchronously. Every chart's renderer is wrapped into a function
`renderX({chart, effectiveFireAge, lifecycle, ...}) => void` that is registered as a
listener.

---

## Summary of decisions

| ID | Area | Decision |
|---|---|---|
| R1 | Test runner | `node:test` + `node:assert/strict`, zero install |
| R2 | Module loading | Native ES modules, `<script type="module">`, `file://` compatible |
| R3 | Fixture format | `.js` files exporting frozen `{name, inputs, expected, notes}` |
| R4 | Confirm control | DOM overlay positioned over lifecycle chart (not canvas-drawn) |
| R5 | Drag affordance | `cursor: grab` + italic label + 3-second first-load pulse |
| R6 | Real/nominal | Mandatory `*Real` / `*Nominal` suffixes; conversion only in `inflation.js` |
| R7 | Module boundary enforcement | Three grep-based meta-tests in `tests/meta/` |
| R8 | Personal-data adapter | `personal/personal-rr.js` imported by RR only |
| R9 | Override lifecycle | `chartState.js` owns state; `setCalculated` atomically wipes override |

All `NEEDS CLARIFICATION` items from the plan's Technical Context are resolved. Ready
for Phase 1.
