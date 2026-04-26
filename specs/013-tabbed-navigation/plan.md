# Implementation Plan: Tabbed Dashboard Navigation

**Branch**: `013-tabbed-navigation` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-tabbed-navigation/spec.md`

## Summary

Replace the current single-scroll layout of `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` with a 4-tab themed navigation (**Plan · Geography · Retirement · History**) backed by sub-tab pill bars. Each pill hosts one or more existing cards. The KPI ribbon, FIRE-mode gate selector, language toggle, and right-edge pinned Lifecycle sidebar remain rendered across all tabs as persistent chrome. State is persisted to `localStorage` under a single new key `dashboardActiveView` and mirrored to a URL hash (`#tab=…&pill=…`) for deep linking and browser Back/Forward support.

**Technical approach.** This is a pure-frontend reorganization: zero changes to calc modules, chart data sources, formulas, or input fields. Each existing card section is wrapped (or grouped with siblings) inside a `<div class="pill" data-tab="…" data-pill="…" hidden>` host; a thin `tabRouter` IIFE-style controller manages active state, hash sync, localStorage persistence, and `chart.resize()` triggers on pill activation. Quick What-If markup, JS handlers, and i18n keys are removed entirely. The implementation ships to both HTML files in the same PR per Principle I.

## Technical Context

**Language/Version**: JavaScript (ES2020+), HTML5, CSS3 — single-file HTML app
**Primary Dependencies**: Chart.js (existing, loaded from CDN). No new runtime dependencies.
**Storage**: Browser `localStorage` — single new key `dashboardActiveView` storing `{tab, pill}` JSON. URL hash for routing.
**Testing**: Node `--test` for unit tests on the routing controller (extracted to `calc/tabRouter.js` for testability); Playwright (dev-only, already present from Feature 011) for E2E coverage of tab/pill switches, deep links, mobile pill-bar overflow, and DOM-diff parity between RR and Generic; manual browser smoke walkthrough per CLAUDE.md "Browser smoke before claiming a feature 'done'" rule.
**Target Platform**: Modern browsers (Chrome / Edge / Firefox / Safari, desktop and mobile). Mobile breakpoint ≤767px (matches Feature 011 phone breakpoint).
**Project Type**: Single-file HTML web application — zero build step, zero bundler, double-click-to-open.
**Performance Goals**: First interactive view (Plan/Profile pill rendered) under 1.5s on broadband (SC-003). Tab switch + Chart.js resize under 200ms (SC-004). Drag-to-update on Full Portfolio Lifecycle chart maintains ≥30 fps (Constitution baseline).
**Constraints**: Zero new runtime dependencies (Principle V). Both HTML files identical in tab/pill structure, IDs, classes (Principle I). All new user-visible strings paired EN + zh-TW (Principle VII). No calc/chart module changes (FR-036 to FR-039).
**Scale/Scope**: 2 HTML files (~13k lines each); 4 tabs × 16 pills total (Plan 6, Geography 4, Retirement 5, History 1); 21 new i18n key pairs; 1 new localStorage key; 1 new pure JS module (`calc/tabRouter.js`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 7 principles in `.specify/memory/constitution.md` v1.1.0.

| Principle | Status | Justification |
|-----------|--------|---------------|
| **I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)** | ✅ PASS | FR-032 and FR-033 require identical tab/pill structure, IDs, classes, and CSS in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`. Personal-only content (RR's hard-coded names, private numeric defaults) lives inside the same pill IDs. Both files ship in the same PR. |
| **II. Pure Calculation Modules with Declared Contracts** | ✅ PASS | This feature does not add or modify any calculation. The one new JS module (`calc/tabRouter.js`) is a routing controller — its inputs are URL hash + localStorage values, its outputs are active tab/pill state and DOM class flips. It will carry the standard `Inputs / Outputs / Consumers` fenced header, even though no chart consumes it (consumers are DOM containers). Calc engine purity (Principle II.1) is preserved by the negative requirements FR-036 to FR-039. |
| **III. Single Source of Truth for Interactive State** | ✅ PASS | The new `dashboardActiveView` state is UI-routing only and does not interact with FIRE age, gate selection, scenario picks, or any input that drives calc. The `effectiveFireAge` resolver and existing single-source state are untouched. No new derived state is introduced anywhere in the calc layer. |
| **IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)** | ✅ PASS | FR-036 and SC-007 require all 161 existing unit tests to pass without modification. The new `tabRouter.js` ships with its own unit-test file (`tests/unit/tabRouter.test.js`) covering: state restoration from localStorage, URL hash priority over localStorage, fallback for invalid tab/pill, popstate handling, first-time visitor default. No calc fixture changes required since no calc behavior changes. |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ PASS | No new runtime dependency. `tabRouter.js` is loaded by a vanilla `<script src="calc/tabRouter.js">` tag in both HTML files (or, alternatively, kept inline as a fenced `<script>` block per the transitional pattern documented in Principle II). Mobile horizontal scroll uses standard CSS (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`). |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ PASS | No chart code is modified. Chart ↔ Module annotations remain valid as written. The new `tabRouter.js` includes a comment noting its consumers (the tab/pill DOM containers in both HTML files) but is not a chart-feeding module. |
| **VII. Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE)** | ✅ PASS | FR-034 requires 21 new key pairs (4 tab labels + 16 pill labels + 1 `Next →` button) added to both `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts in BOTH HTML files, plus a row added to `FIRE-Dashboard Translation Catalog.md`. Tab/pill DOM elements use `data-i18n="<key>"`. The `Next →` button uses `data-i18n="nav.next"`. `switchLanguage()` already triggers a re-render that picks up `data-i18n` attributes — pill state (active pill ID) is preserved by ID, not label, so the toggle does not lose state. |

**Result:** All gates PASS. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/013-tabbed-navigation/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions and rejected alternatives
├── data-model.md        # Phase 1 — Tab / Pill / ActiveView entity model
├── quickstart.md        # Phase 1 — how to verify the feature end-to-end
├── contracts/
│   ├── tab-routing.contract.md   # localStorage shape, URL hash format, fallback rules
│   ├── tab-ui.contract.md        # DOM structure, IDs, classes, CSS state
│   └── tab-i18n.contract.md      # i18n key inventory + EN/zh-TW values
├── checklists/
│   └── requirements.md  # Spec quality checklist (already passes)
└── tasks.md             # Phase 2 — generated by /speckit-tasks (NOT created here)
```

### Source Code (repository root)

This is a single-file HTML application with a small extracted `calc/` directory. The feature touches:

```text
FIRE-Dashboard.html              # RR (Roger & Rebecca) dashboard — tab/pill markup added; Quick What-If removed
FIRE-Dashboard-Generic.html      # Public Generic dashboard — identical tab/pill markup; Quick What-If removed
FIRE-Dashboard Translation Catalog.md  # 21 new key pairs documented (EN + zh-TW)
README.md                        # "What's next" section already added; will be moved to "Features" once shipped
calc/
├── ssEarningsRecord.js          # (existing — feature 012)
└── tabRouter.js                 # NEW — pure routing controller (state, hash, localStorage, fallbacks)
tests/
├── unit/
│   ├── ssEarningsRecord.test.js # (existing — feature 012)
│   └── tabRouter.test.js        # NEW — covers FR-021 to FR-028
└── e2e/
    ├── responsive-header.spec.ts  # (existing — feature 011)
    └── tab-navigation.spec.ts     # NEW — covers SC-001, SC-005, SC-006, SC-009, SC-010, SC-011
```

**Structure Decision**: Stay on the existing single-file HTML pattern with a thin `calc/` directory for testable pure modules (matches feature 012's pattern with `calc/ssEarningsRecord.js`). The new `tabRouter.js` is the only extracted module; everything else (DOM markup, CSS, the inline glue that wires `tabRouter` to actual DOM) lives directly in the two HTML files. Tests follow the same split as feature 011 / 012: Node unit tests for the pure module, Playwright spec for E2E coverage.

## Phase 0 — Outline & Research

See [research.md](./research.md). Key resolved questions:

1. **Chart.js zero-width in hidden tabs** — confirmed pattern: trigger `chart.resize()` on pill activation. No alternative needed.
2. **IntersectionObserver across `display:none` containers** — Feature 006 US2 sticky header observer needs scoping to a fixed-height anchor inside the active tab container, OR re-attached on tab switch.
3. **URL hash routing with `popstate` + `pushState`/`replaceState`** — chosen pattern: pill clicks use `pushState` (so Back/Forward step through pills), localStorage-restored loads use `replaceState` (so the restored state is in the URL but doesn't add a synthetic history entry).
4. **localStorage write failures (private browsing)** — wrap writes in `try/catch`; in-memory state continues to work; no throw.
5. **Mobile pill-bar overflow** — `overflow-x: auto`; `flex-wrap: nowrap`; `-webkit-overflow-scrolling: touch`. No JS-driven scroll snapping needed.
6. **Cross-pill click handlers (country card → Country Deep-Dive)** — handled via the same `tabRouter.activate(tab, pill)` API the pill bar itself uses.
7. **`Next →` button on the last pill of each tab** — chosen treatment: `disabled` attribute set on the button, kept in DOM for layout consistency. (Hidden alternative rejected because it changes card height, alternative non-action label rejected because i18n complexity not worth it.)

**Output:** [research.md](./research.md) with all decisions resolved.

## Phase 1 — Design & Contracts

### Entities → [data-model.md](./data-model.md)

- **Tab**: `{id, labelKey, pills: Pill[]}`. Fixed-order list of 4 tabs.
- **Pill**: `{id, labelKey, hostsCardIds: string[], hasNextButton: boolean}`. Fixed-order list per tab.
- **ActiveView**: `{tab: <tab.id>, pill: <pill.id>}`. Persisted in localStorage; mirrored to URL hash.

### Contracts → [contracts/](./contracts/)

- **`tab-routing.contract.md`** — localStorage key, JSON shape, URL hash format, fallback rules (invalid tab → Plan/Profile; invalid pill → first pill of named tab), `popstate` handling, write-failure behavior.
- **`tab-ui.contract.md`** — DOM structure (top tab bar markup, sub-pill bar markup, pill host containers), exact IDs and classes, CSS state classes (`.tab.active`, `.pill.active`, `.pill[hidden]`), `data-i18n` attributes for every label, mobile breakpoint behavior.
- **`tab-i18n.contract.md`** — full inventory of 21 new key pairs with EN and zh-TW values.

### Quickstart → [quickstart.md](./quickstart.md)

Step-by-step manual verification covering: first-time visitor lands on Plan/Profile, tab switching, pill switching, `Next →` advances within tab and stops at last pill, deep-link URL works in fresh browser, reload restores last tab+pill, mobile pill bar scrolls horizontally, language toggle preserves pill state, country card click switches to Deep-Dive pill, KPI ribbon + Lifecycle sidebar visible across all tabs, all 161 unit tests still green.

### Agent context update

Update the SPECKIT block in `CLAUDE.md` to point Active feature at `013-tabbed-navigation`.

**Output:** data-model.md, contracts/*.md, quickstart.md, CLAUDE.md SPECKIT block updated.

## Post-Design Constitution Re-check

Re-evaluating the 7 principles after Phase 1 design:

- **I.** ✅ Both files get identical markup; `tab-ui.contract.md` enforces this in writing.
- **II.** ✅ `tabRouter.js` carries `Inputs / Outputs / Consumers` header. No calc module changes.
- **III.** ✅ `dashboardActiveView` is UI-routing only; no calc state affected.
- **IV.** ✅ `tests/unit/tabRouter.test.js` will cover all routing edge cases. Existing 161 tests remain untouched.
- **V.** ✅ Zero new runtime deps. `tabRouter.js` is plain JS loadable via `<script src>`.
- **VI.** ✅ No chart annotation changes needed.
- **VII.** ✅ All 21 new keys defined with EN + zh-TW values in `tab-i18n.contract.md`.

**Result:** Post-design check still PASSES. No violations introduced during design.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none)    | (none)     | (none)                               |
