# Implementation Plan: SSA Earnings Record — Support Years Before 2020

**Branch**: `012-ssa-earnings-pre-2020` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-ssa-earnings-pre-2020/spec.md`

## Summary

Add a "+ Add Prior Year" control to the SSA Earnings Record UI in `FIRE-Dashboard-Generic.html` so users can extend the earnings history **chronologically backward** (prepending `firstYear − 1`). Back the UI with a small pure helper that enforces the record's invariants (ascending year order, unique years, integer years, non-negative earnings, soft floor at 1960) so the existing SS calculation pipeline (`calcRealisticSSA` inline + `calc/socialSecurity.js` extracted) consumes the new rows with **zero calc-layer changes**. Optional P2: a bulk "Earliest year" text input that expands the table in one step. Lock behaviour with a new Node unit-test suite in `tests/unit/ssEarningsRecord.test.js`.

**Approach**:

1. Introduce a pure helper `prependPriorYear(history, { floor = 1960 })` that returns a new array with `firstYear − 1` prepended (or the unchanged array + reason code if the floor is hit or the record is empty). No mutation, no DOM, no globals — follows Principle II.
2. Introduce a pure helper `setEarliestYear(history, target, { floor = 1960 })` that prepends every year from `target..firstYear − 1` in a single pass. Reuses the same invariants as `prependPriorYear`.
3. Wire a new button in the SSA Earnings Record card (next to "+ Add Year") with `data-i18n="ss.addPriorYear"`. onClick assigns `ssEarningsHistory = prependPriorYear(...).history`, calls `buildSSEarningsTable()` + `recalcAll()` + `saveState()`, matching the existing `addSSYear` path exactly.
4. Add a compact "Earliest year" text input + "Set" button below the add-year buttons (collapsible/secondary-styled), wired to `setEarliestYear`. Shows a low-emphasis inline status message (rather than a toast — keeps the change contained to the card).
5. Add 7 new i18n keys (EN + zh-TW) per Principle VII.
6. Add the test file with fixtures covering: prepend from default, prepend when already at floor, prepend with empty history, dedup rejection, bulk-prepend, bulk-prepend when target ≥ current first, invariant preservation under repeated prepend, AIME goes up (or stays equal) when a new non-zero prior year is added.
7. No change to `calc/socialSecurity.js`. No change to `calcRealisticSSA`. The inline `buildSSEarningsTable` input's `onchange="updateSSEarning(...)"` already parses-and-coerces; we reuse that handler for edit-coercion (FR-009).

**Scope**: Generic-only (the only HTML dashboard currently in the tree). ~60 LoC helper, ~30 LoC UI wiring, ~14 i18n catalog entries (7 keys × 2 languages), ~180 LoC test file. Zero calc changes. Zero new dependencies. No build step.

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020). No transpile. Inline `<script>` helpers in the HTML file plus a sibling `calc/ssEarningsRecord.js` module holding the pure prepend/bulk helpers (same pattern as `calc/socialSecurity.js`).
**Primary Dependencies**: None new. Chart.js (CDN) unchanged. Node built-in `node --test` for unit tests (same harness features 010–011 used).
**Storage**: Existing `_ssEarningsHistory` key in `saveState` / `restoreState` (localStorage, same JSON shape: `[{year:int, earnings:number, credits:int}, ...]`). No schema change. Pre-existing serialisation round-trips untouched.
**Testing**:
- Pre-existing: `tests/unit/*.test.js` — all must remain green (SC-004 locks the "no NaN" behaviour).
- New: `tests/unit/ssEarningsRecord.test.js` — at minimum 10 cases covering the helper contract. Runs under `node --test tests/`.
**Target Platform**: Any evergreen browser opening `FIRE-Dashboard-Generic.html` directly. No browser-version gate beyond what the rest of the dashboard already requires.
**Project Type**: Zero-build single-file HTML dashboard + Node unit tests.
**Performance Goals**: Prepend + rebuild + recalc completes within one animation frame (≤ 16 ms) on the constitution's "mid-range laptop" baseline. Bulk prepend of 40 years completes within 100 ms.
**Constraints**:
- Principle I (lockstep): **N/A (vacuous)** — `FIRE-Dashboard.html` (RR) is not in this repo (confirmed in feature 011 plan). Feature ships to `FIRE-Dashboard-Generic.html` only. If RR is reinstated later, the helpers are already extracted to `calc/ssEarningsRecord.js` — RR just imports them and binds the same UI.
- Principle II (pure calc modules): new helpers live in `calc/ssEarningsRecord.js` with a fenced contract header (Inputs / Outputs / Consumers / Invariants). No DOM, no globals.
- Principle III (single source of truth): `ssEarningsHistory` stays the single source for the record. The helpers never touch it directly — callers pass it in and assign the returned array back.
- Principle IV (gold-standard fixtures): new fixture-backed unit tests lock the contract; existing tests continue green.
- Principle V (zero-build delivery): no new runtime deps. The dashboard still double-clicks open. Helpers are ES module `export`s consumed both by Node tests and the HTML file (the file already reads `calc/*.js` modules at boot; no change to that loading strategy).
- Principle VI (chart ↔ module contracts): SS chart's calc-path annotations stay accurate — the chart still consumes `calcRealisticSSA`, which still consumes `ssEarningsHistory`. The new helpers produce, they don't render.
- Principle VII (bilingual NON-NEGOTIABLE): every new user-visible string ships with both EN + zh-TW on the same commit. 7 new keys.
**Scale/Scope**: Touched files: `FIRE-Dashboard-Generic.html` (inline UI + i18n dicts), new `calc/ssEarningsRecord.js`, new `tests/unit/ssEarningsRecord.test.js`, update `FIRE-Dashboard Translation Catalog.md`, update `BACKLOG.md` (mark U6 as in-progress → closed once merged), update `FIRE-Dashboard-Roadmap.md`. Line-count estimate: ~350 LoC net add across all files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | Both HTML files ship changes in lockstep OR divergence is documented. | **N/A (vacuous).** Only `FIRE-Dashboard-Generic.html` is present in the repo. Helper extraction to `calc/ssEarningsRecord.js` de-risks future RR parity: when RR is reinstated, its SS card binds to the same helpers + same i18n keys. Forward-looking constraint is captured as spec FR-013 + assumption. |
| II | Pure Calculation Modules with Declared Contracts | Every touched calc module keeps its fenced header synced. | **Pass.** New `calc/ssEarningsRecord.js` ships with the standard fenced header (Inputs / Outputs / Consumers / Invariants). `calc/socialSecurity.js` header is **not** touched — this feature is data-entry, not calc. The existing `Consumers:` list in `calc/socialSecurity.js` is already accurate (lifecycle + ssChart). |
| III | Single Source of Truth for Interactive State | One resolver per shared state field. | **Pass.** `ssEarningsHistory` remains the one authoritative list of earnings rows. All mutations go through the same four operations (`addSSYear`, new `addSSPriorYear`, new `setEarliestYear`, existing `removeSSYear`, existing `updateSSEarning`), each ending with `buildSSEarningsTable()` + `recalcAll()` + `saveState()`. No parallel copy; no shadow state. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | New branches get locked fixtures; test count stays green and grows. | **Pass.** `tests/unit/ssEarningsRecord.test.js` locks the helper contract with 10+ cases (see research.md §R4). Existing 160+ unit tests stay green. SC-002 in spec (canonical fixture: 1995–2025 earnings → benefit within 2% of ssa.gov estimator) will be represented in a standalone fixture `tests/fixtures/ss-earnings-1995-2025.js` and asserted against `calc/socialSecurity.js`'s `projectSS` — not against the inline `calcRealisticSSA`, since the inline version uses a different (simpler) AIME formula. This is documented in research.md §R5. |
| V | Zero-Build, Zero-Dependency Delivery | No bundler, no runtime deps, no framework. | **Pass.** Zero new runtime or dev dependencies. Helpers are ESM files loaded by Node tests (same as feature 001+). The HTML file continues to run by double-click with only the Chart.js CDN script tag. |
| VI | Explicit Chart ↔ Module Contracts | Comments sync between chart renderers and calc modules. | **Pass.** The SS chart renderer already comments its calc-path (`calcRealisticSSA`). No chart changes here. The new helper's header declares `Consumers: FIRE-Dashboard-Generic.html → addSSPriorYear / setEarliestYear UI handlers`. No chart-side comment update needed because no chart changes. |
| VII | Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | Every new visible string has both translations in the same commit. | **Pass.** 7 new keys added to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts in the same commit, plus `FIRE-Dashboard Translation Catalog.md` updated. Keys: `ss.addPriorYear`, `ss.earliestYearLabel`, `ss.earliestYearSet`, `ss.earliestYearHint`, `ss.duplicateYear`, `ss.floorReached`, `ss.yearAccepted`. All wired via `data-i18n` or `t(...)` per constitution §VII rules. |

**Overall Gate: PASS** with no justified violations. Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-ssa-earnings-pre-2020/
├── plan.md                             # This file (/speckit-plan output)
├── spec.md                             # Feature specification (present)
├── research.md                         # Phase 0 output — UI + helper-API decisions
├── data-model.md                       # Phase 1 output — SSEarningsRow + SSEarningsHistory contracts
├── quickstart.md                       # Phase 1 output — manual verification steps
├── contracts/                          # Phase 1 output
│   ├── ss-earnings-record.contract.md  # Invariants + helper function signatures
│   ├── ss-ui-controls.contract.md      # Button + bulk-input + status message contract
│   └── ss-i18n.contract.md             # 7 new keys with EN + zh-TW strings
├── checklists/
│   └── requirements.md                 # Already present from /speckit-specify
└── tasks.md                            # Phase 2 output — /speckit-tasks creates this
```

### Source Code (repository root — affected paths only)

```text
FIRE_Calculator/
├── FIRE-Dashboard-Generic.html         # TOUCHED.
│                                       #   - SSA Earnings Record card HTML: new button + bulk input
│                                       #   - Inline <script>: addSSPriorYear(), setEarliestYear() wrappers
│                                       #     (thin — delegate to calc/ssEarningsRecord.js)
│                                       #   - TRANSLATIONS.en + TRANSLATIONS.zh: 7 new keys each
├── calc/
│   ├── socialSecurity.js               # UNTOUCHED. Fenced header already accurate.
│   └── ssEarningsRecord.js             # NEW. Pure helpers: prependPriorYear, setEarliestYear,
│                                       #   plus validation + sort/dedup utilities.
├── tests/unit/
│   └── ssEarningsRecord.test.js        # NEW. 10+ fixture cases locking the helper contract.
├── tests/fixtures/
│   └── ss-earnings-1995-2025.js        # NEW (optional, if SC-002 cross-check is wired).
│                                       #   Realistic 31-year earnings profile + expected benefit.
├── FIRE-Dashboard Translation Catalog.md  # TOUCHED. New ss.* keys documented.
├── FIRE-Dashboard-Roadmap.md           # TOUCHED. Feature 012 entry added.
├── BACKLOG.md                          # TOUCHED. U6 status updated (in-progress → closed on merge).
└── CLAUDE.md                           # TOUCHED. SPECKIT active-feature pointer updated (between markers).
```

**Structure Decision**: Zero-build single-file dashboard with an extracted-helpers pattern (same as features 008–011). The helper lives in `calc/` alongside `socialSecurity.js` because it's the data-entry twin of the calc module: `calc/ssEarningsRecord.js` produces and validates earnings records; `calc/socialSecurity.js` consumes them. Tests live in `tests/unit/` alongside the other Node-runnable unit tests.

## Phase 0 — Outline & Research

See [research.md](./research.md) for:

- **R1**: UI affordance pattern — side-by-side `+ Add Prior Year` button vs combined "Add year" dropdown. **Decision**: two adjacent buttons underneath the table; prior-year button uses same `.btn-secondary` style.
- **R2**: Bulk "Earliest year" input UX — text input vs slider vs year-picker. **Decision**: plain `<input type="number" min="1960" max="currentYear">` + a compact "Set" button; inline status text.
- **R3**: Feedback for invalid input (duplicate, floor-reached, invalid number) — toast vs inline. **Decision**: inline in a low-emphasis status line beneath the bulk input; auto-clears on next interaction. No dependency on any toast library.
- **R4**: Test coverage plan — 10-case list for `ssEarningsRecord.test.js`.
- **R5**: Inline `calcRealisticSSA` vs extracted `projectSS` divergence — decision to NOT unify them in this feature; SC-002 cross-check is asserted against `projectSS` only, with a note in `research.md` that the inline path still uses non-indexed AIME.
- **R6**: Floor year choice — 1960 confirmed; rationale = accommodates anyone currently planning FIRE who started earning as a teen in the early 1960s. Loosening it later is a one-constant change.
- **R7**: Default earnings value for a prepended row — $0 with credits = 4. Matches existing `addSSYear` default and the SSA-valid zero-earnings year.

## Phase 1 — Design & Contracts

### Entities (see [data-model.md](./data-model.md))

- **SSEarningsRow**: `{ year: integer, earnings: non-negative finite number, credits: integer }`.
- **SSEarningsHistory**: ordered list of `SSEarningsRow`, strictly ascending by year, no duplicate years.

### Contracts (see [contracts/](./contracts/))

- **`ss-earnings-record.contract.md`** — function signatures for `prependPriorYear`, `setEarliestYear`, `sortedAscendingUnique` (internal), `isValidRow`. Documents immutability (helpers never mutate inputs), pure-function status, and exact return shapes.
- **`ss-ui-controls.contract.md`** — DOM structure of the new button + bulk input, event wiring, and the inline status element's states.
- **`ss-i18n.contract.md`** — the 7 new keys with full EN + zh-TW strings and the placeholder interpolation pattern for the three messages that embed a year number (`ss.duplicateYear`, `ss.floorReached`, `ss.yearAccepted`).

### Quickstart (see [quickstart.md](./quickstart.md))

Manual verification sequence: cold load → prepend 5 years one-by-one → bulk set earliest to 1995 → enter $60k for 2005 → reload → confirm 2005 persisted with $60k → SS projected benefit increased vs pre-feature baseline. Includes the duplicate and floor-reached guard tests.

### Agent context update

The plan reference between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` in `CLAUDE.md` is updated by this phase to point to this plan (`specs/012-ssa-earnings-pre-2020/plan.md`).

## Complexity Tracking

> None — Constitution Check passed without documented violations or justified additions.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
