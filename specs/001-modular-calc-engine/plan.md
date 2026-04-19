# Implementation Plan: Modular Calc Engine

**Branch**: `001-modular-calc-engine` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-modular-calc-engine/spec.md`

## Summary

Extract every FIRE calculation — lifecycle simulation, years-to-FIRE solver, withdrawal
strategy, tax-aware withdrawal, Social Security projection, healthcare/mortgage/college
adjustments, inflation handling — out of the two ~7 000-line HTML files and into a set
of pure, contract-documented, unit-testable JavaScript modules that both `FIRE-Dashboard.html`
(RR) and `FIRE-Dashboard-Generic.html` (Generic) consume. Introduce a single
`effectiveFireAge` resolver (`chartState`) that every chart and KPI reads from, eliminating
the drag-propagation bug in which dragging the retirement-age marker updated only two
charts and left KPIs, Timeline, healthcare delta, Coast-FIRE check, and mortgage verdict
stale. Promote a dragged age to an active override only via an explicit in-chart confirm
control; wipe the override on any input-triggered recalculation.

Technical approach (from research.md): ES-module `.js` files loaded alongside each HTML
via `<script type="module" src="./calc/...">` relative paths — no bundler, still file://
runnable. Fixtures stored as `.js` files exporting typed records. Unit tests via Node's
built-in `node:test` + `node:assert` (zero external dev dependency). The two HTML files
become thin presentation layers; the RR file gets a `personal.js` adapter that injects
Roger/Rebecca's personal data into the shared contracts.

## Technical Context

**Language/Version**: JavaScript (ES2022, native ES modules). No TypeScript; JSDoc for
type hints in module headers to support editor tooling without a compile step.

**Primary Dependencies**: Chart.js (CDN, already in both HTML files). No other runtime
dependencies. Dev-only: `node:test` and `node:assert` (built-ins, zero install).

**Storage**: N/A for this feature. `FIRE-snapshots.csv` and `localStorage` schemas are
owned by the DB Engineer and out of scope (per spec Assumptions).

**Testing**: Node 20+ with `node --test` runner. Fixtures in `tests/fixtures/*.js` exporting
canonical `{name, inputs, expected}` records. Test suites in `tests/unit/*.test.js`. A
dedicated parity test (`tests/parity/rr-vs-generic.test.js`) loads the same canonical
input through both the shared module (as Generic would) and through RR's PersonalData
adapter, asserting byte-identical output on fixture fields.

**Target Platform**: Modern browsers (Chromium, Firefox, Safari — last two major versions)
loaded via `file://` OR any static HTTP host. No server-side runtime. Dev environment is
Node 20+ on Windows/macOS/Linux.

**Project Type**: Single-file-openable web application with sidecar JS calc modules.
Not a traditional SPA, not a library; the HTML files are the entry points and they load
Chart.js from CDN plus relative `./calc/*.js` modules.

**Performance Goals** (from Constitution Principle V + spec FR-002):
- First meaningful chart < 1 s on cold cache, mid-range laptop.
- Drag on Full Portfolio Lifecycle ≥ 30 fps sustained.
- Full recalc on any input change ≤ 1 animation frame (≤ 16 ms) budget for the resolver
  + solver path on the canonical input; chart re-render completes within the same frame
  or next.
- Unit test corpus green in ≤ 10 s on developer laptop.

**Constraints**:
- Zero build step. No bundler, no transpiler. Runs via `file://` double-click.
- No new runtime dependency beyond Chart.js.
- Both HTML files must remain drop-in openable — shipping the dashboard means shipping
  the two HTML files plus the `calc/` directory as siblings.
- All calc modules MUST be pure (no DOM, no Chart.js, no `localStorage`, no `window.*`
  reads in function bodies).

**Scale/Scope**:
- 2 HTML files, ~14 000 LoC today → target ~5 000 LoC HTML + ~3 000 LoC extracted modules
  after extraction.
- ~8 charts per dashboard.
- ~10 calc modules (see data-model.md).
- ~15 fixture cases across unit + parity tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluating each principle against the planned approach:

| Principle | Status | Evidence |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | Spec FR-009 + FR-010. Both HTML files consume identical `calc/*.js` sources. Only RR's `personal.js` diverges, and that layer is explicitly a data adapter, not a formula fork. Parity test in `tests/parity/` mechanically enforces byte-identical headline outputs. |
| II. Pure Calculation Modules with Declared Contracts | ✅ | Spec FR-005, FR-006, FR-007. Every `calc/*.js` file opens with a fenced `Inputs / Outputs / Consumers` header. No DOM, no Chart.js, no globals in function bodies — enforced by a grep-based precommit check (see research.md). |
| III. Single Source of Truth for Interactive State | ✅ | Spec FR-001, FR-014, FR-018, FR-020. One `effectiveFireAge` resolver in `calc/chartState.js` is the only path to the current FIRE age; charts read from it. Override is set only via confirm control and cleared on any input-triggered recalc. |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | Spec FR-008 + SC-003. Five mandated fixture cases (accumulation-only, three-phase retirement, Coast-FIRE, infeasible, RR↔Generic parity) plus module-specific cases. `node --test` runs them in under 10 s. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | ES modules loaded via relative `<script type="module" src="./calc/...">`. Chart.js still from CDN. Test tooling is Node built-ins (`node:test`, `node:assert`) — zero install. HTML files + `calc/` directory remain double-click openable. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | Spec FR-011, FR-012. Each chart renderer opens with a comment declaring consumed module(s) and read fields; each module's `Consumers:` list mirrors it. Grep audit enforced in the test harness. |

**Gate result: PASS.** No constitutional violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-modular-calc-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions on runner, loader, fixtures, UI patterns)
├── data-model.md        # Phase 1 output (entity schemas: EffectiveFireAge, Lifecycle, etc.)
├── quickstart.md        # Phase 1 output (how to verify end-to-end)
├── contracts/           # Phase 1 output (per-module input/output contracts)
│   ├── chartState.contract.md
│   ├── lifecycle.contract.md
│   ├── fireCalculator.contract.md
│   ├── withdrawal.contract.md
│   ├── tax.contract.md
│   ├── socialSecurity.contract.md
│   ├── healthcare.contract.md
│   ├── mortgage.contract.md
│   ├── college.contract.md
│   └── inflation.contract.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# Runtime (ships to users — file:// openable)
FIRE-Dashboard.html              # RR dashboard (presentation + personal-data adapter call)
FIRE-Dashboard-Generic.html      # Generic dashboard (presentation)
FIRE-Dashboard.ico
fire-dashboard-icon-v2.png
FIRE-Dashboard Translation Catalog.md

calc/                            # Pure calc modules (NEW — shared by both HTML files)
├── chartState.js                # effectiveFireAge resolver, override lifecycle
├── lifecycle.js                 # year-by-year portfolio simulator
├── fireCalculator.js            # binary-search solver using lifecycle
├── withdrawal.js                # tax-aware withdrawal strategy
├── tax.js                       # bracket-aware ordinary / LTCG / RMD rates
├── socialSecurity.js            # SS projection (generic curve + actual-earnings mode)
├── healthcare.js                # scenario × age × country healthcare delta
├── mortgage.js                  # mortgage cost curve & payoff adjustment
├── college.js                   # college cost windows by child
└── inflation.js                 # real/nominal conversion helpers

personal/                        # RR-only personal-data adapter (NEW)
└── personal-rr.js               # maps Roger/Rebecca's inputs into shared module contracts

# Dev-only (does NOT ship to users)
tests/
├── fixtures/
│   ├── accumulation-only.js
│   ├── three-phase-retirement.js
│   ├── coast-fire.js
│   ├── infeasible.js
│   ├── rr-generic-parity.js
│   └── [module-specific fixtures]
├── unit/
│   ├── chartState.test.js
│   ├── lifecycle.test.js
│   ├── fireCalculator.test.js
│   ├── withdrawal.test.js
│   ├── tax.test.js
│   ├── socialSecurity.test.js
│   ├── healthcare.test.js
│   ├── mortgage.test.js
│   ├── college.test.js
│   └── inflation.test.js
└── parity/
    └── rr-vs-generic.test.js

# Repo meta
.specify/                        # spec-kit workspace
CLAUDE.md                        # team playbook (agent context)
FIRE-Dashboard-Roadmap.md
FIRE-snapshots.csv
```

**Structure Decision**: Single-project layout, but with an explicit runtime / dev-only
split. The `calc/` and `personal/` directories ship alongside the HTML files; `tests/`
stays dev-only. This honors Principle V (zero-build) — opening an HTML file in a browser
loads `./calc/*.js` as ES modules via native browser support; Node loads the same files
during testing via native ES-module support.

### Chart-name glossary (UI label ⇄ DOM id)

Spec uses user-facing labels; code uses DOM canvas ids. The mapping:

| User-facing label (spec.md) | Canvas/DOM id (code) |
|---|---|
| Full Portfolio Lifecycle chart | `growthChart` |
| Lifetime Withdrawal / Roth Ladder chart | `rothLadderChart` |
| Portfolio Drawdown With-vs-Without SS chart | `ssChart` |
| Net Worth Breakdown (doughnut) | `netWorthPie` |
| Monthly Expense Breakdown (doughnut) | `expensePie` |
| Healthcare by Country (bar) | `countryChart` |
| Timeline chart | `timelineChart` (if present) |

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

*No violations. Section intentionally empty.*
