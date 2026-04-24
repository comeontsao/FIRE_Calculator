# Implementation Plan: Generic Dashboard — Single-Person Mode

**Branch**: `009-single-person-mode` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-single-person-mode/spec.md`

## Summary

Add an **Adults counter (range 1–2, default 2)** to `FIRE-Dashboard-Generic.html` so a solo planner can run the dashboard as a one-adult household. When `adultCount === 1`, the dashboard:

1. Hides Person 2 inputs (birthday, stocks, spousal SS) without destroying their stored values.
2. Flips filing status to **Single** via the existing feature-007 plumbing (`detectMFJ` + `applyFilingStatusDefaults`), swapping IRMAA / std-ded / top-of-12% defaults to Single 2026 figures.
3. Suppresses Person 2 contributions from net worth, accessible balance, and taxable-pool withdrawals (read-time gate, not by zeroing).
4. Drops the 50 % spousal Social Security add-on; combined household PIA becomes Person 1's own PIA only.
5. Scales healthcare to a single-adult base (pre-65 couple-share 0.67 → single-adult share ≈ 0.35; post-65 couple-rate ÷ 2) while preserving per-kid scaling so **single parents are first-class**.
6. Persists `adultCount` in `localStorage` and appends an `Adults` column to the snapshot CSV schema.
7. Ships both English and Traditional Chinese strings for every new control and label.

**Explicitly Generic-only (FR-029).** `FIRE-Dashboard.html` (RR) remains a two-person plan by design; this is a Principle-I lockstep exception, justified in Complexity Tracking below.

Technical approach: extend the existing inline calc helpers (`getInputs`, `detectMFJ`, `calcNetWorth`, `calcAccessible`, `calcRealisticSSA`, `getSSAnnual`, `getHealthcareFamilySizeFactor`, `getHealthcareMonthly`) to consume a new `adultCount` input signal; add the counter UI inside the existing Profile & Income "Household composition" area; gate Person 2 input visibility via a single `syncAdultCountVisibility()` DOM helper; bolt new unit tests onto `tests/unit/` for the four gates (filing status, SS combination, healthcare scaling, counter bounds).

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020), loaded as inline `<script>` and as ES modules in `calc/*.js`. No transpile.
**Primary Dependencies**: Chart.js (CDN, already loaded). No new runtime deps introduced by this feature.
**Storage**:
- `localStorage` keys `fire_dashboard_generic_state` (inputs) and `fire_dashboard_generic_snapshots` (snapshot cache).
- `FIRE-snapshots-generic.csv` via File System Access API (Chrome/Edge) with IndexedDB-backed file handle — DB Engineer territory.
**Testing**: Node-native `node --test` runner against `tests/unit/*.test.js` (currently 79 tests green on feature 008 branch head). Playwright E2E is structural-only; no browser needed for the new unit tests.
**Target Platform**: Any evergreen browser opening the HTML file directly (double-click or `python -m http.server`). No server runtime.
**Project Type**: Zero-build single-file HTML dashboard with a sibling ES-module calc library and Node unit tests.
**Performance Goals**: First meaningful chart < 1 s on a mid-range laptop with a cold cache; drag on Full Portfolio Lifecycle ≥ 30 fps (constitution §Performance floor). Adults toggle must recompute in one `recalcAll()` call (no measurable delta on top of current recalculation cost).
**Constraints**:
- Principle I (lockstep) is explicitly scoped out for this feature per spec FR-029 — Generic-only. Justified under Complexity Tracking.
- Principle II (pure calc modules): any shared formula we touch must keep its fenced `Inputs/Outputs/Consumers` header in sync.
- Principle IV: new gold-standard fixtures required for (a) Single filing status keyed on `adultCount === 2`, (b) single-adult SS combination, (c) single-adult + N-kid healthcare scaling, (d) counter-bounds clamp. Target ≥ 90 total unit tests.
- Principle VII (bilingual NON-NEGOTIABLE): every new visible string ships EN + zh-TW in the same commit, wired via `data-i18n` / `t()` and mirrored into `FIRE-Dashboard Translation Catalog.md`.
- Snapshot CSV remains append-only: `Adults` added as the 20th column after `Locked`.
- localStorage `adultCount` treated as integer; back-compat with old state blobs (absent key ⇒ 2).
**Scale/Scope**: ~300–400 LoC touched in `FIRE-Dashboard-Generic.html` (counter UI, visibility helper, persist wiring, consumer updates in 6 calc call sites), ~60 LoC of new inline comments + updated contract headers, ~4 new unit test files/updates (≈ 15 new cases), ~15 new i18n keys × 2 languages = 30 catalog entries.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | Both HTML files ship the feature in lockstep OR divergence is explicitly justified. | **Violated (justified).** Feature is Generic-only per spec FR-029 and user directive. RR remains two-person by construction. See Complexity Tracking row 1. |
| II | Pure Calculation Modules with Declared Contracts | Every touched calc helper keeps its fenced `Inputs/Outputs/Consumers` header truthful; no new DOM/Chart.js calls inside pure functions. | **Pass.** Inline helpers (`detectMFJ`, `getHealthcareFamilySizeFactor`, `calcRealisticSSA`, `calcNetWorth`, `calcAccessible`) extended to accept an `adultCount` argument (or read it from `inp`); no new DOM reads added inside them. The sibling `calc/healthcare.js` module already exposes `householdSize`; contract on that module gains an `adultCount` consumer note. |
| III | Single Source of Truth for Interactive State | Adults value is resolved in one place and read by every consumer; no competing re-derivations. | **Pass.** Single state field `inp.adultCount` read uniformly in `getInputs()`; all downstream consumers take it from `inp`. Initial DOM value is the counter element's `value`; persistence flows through the existing `PERSIST_IDS` list. No chart re-reads Person 2 data independently. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | New branches get locked fixtures; test count stays green and grows. | **Pass.** Phase 1 produces contracts for the four new fixture classes (filing-status gate, SS combination, healthcare scaling, counter bounds). SC-009 targets ≥ 90 tests passing. |
| V | Zero-Build, Zero-Dependency Delivery | No bundler, no new npm deps, no framework runtime. | **Pass.** UI is vanilla HTML + onclick handlers; counter pattern mirrors existing children counter. No new CDN libraries. |
| VI | Explicit Chart ↔ Module Contracts | Every chart touching changed calc outputs updates its render-site comment; module `Consumers:` list stays accurate. | **Pass.** Chart renderers for Full Portfolio Lifecycle, Portfolio Drawdown (With/Without SS), Country Comparison, Strategy Compare, Lifetime Withdrawal stacked bars, Monthly Expense pie, Net Worth pie, Savings Rate gauge, What-If card all identified in FR-020 — comment audit is a Phase-2 task enumerated via `/speckit-tasks`. |
| VII | Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | Every new visible string has both translations in the same commit and is referenced in `FIRE-Dashboard Translation Catalog.md`. | **Pass.** FR-005, User Story 4, SC-007 enforce this. New keys enumerated in Phase 1 `contracts/i18n.contract.md`. |

**Overall Gate: PASS with one justified lockstep exception (Principle I).**

## Project Structure

### Documentation (this feature)

```text
specs/009-single-person-mode/
├── plan.md                 # This file (/speckit-plan command output)
├── spec.md                 # Feature specification (already present)
├── research.md             # Phase 0 output — research findings + chosen constants
├── data-model.md           # Phase 1 output — entities, state shape, CSV schema delta
├── quickstart.md           # Phase 1 output — how to manually verify the feature end-to-end
├── contracts/              # Phase 1 output — interface contracts
│   ├── adult-count.contract.md          # UI control + DOM contract
│   ├── calc-functions.contract.md       # Extended signatures for detectMFJ, SS, healthcare, portfolio
│   ├── i18n.contract.md                 # New translation keys (EN + zh-TW)
│   ├── persistence.contract.md          # localStorage + CSV schema delta
│   └── snapshots.contract.md            # Snapshot-row column append + backward compat
├── checklists/
│   └── requirements.md     # Already present from /speckit-specify
└── tasks.md                # Phase 2 output — /speckit-tasks will create this, NOT this command
```

### Source Code (repository root — affected paths only)

```text
FIRE_Calculator/
├── FIRE-Dashboard-Generic.html      # TOUCHED. Counter UI, visibility helper, consumer updates.
├── FIRE-Dashboard.html              # UNTOUCHED by design (FR-029, Principle I exception).
├── FIRE-Dashboard Translation Catalog.md   # TOUCHED. New keys added.
├── FIRE-Dashboard-Roadmap.md        # TOUCHED. Feature 009 row added.
├── calc/
│   ├── healthcare.js                # TOUCHED. Extend contract header's Consumers list to
│   │                                 # note adult-count-aware inline scaling callers.
│   └── socialSecurity.js            # TOUCHED (comment-only). Contract header gains a note
│   │                                 # that spousePIA is now a Generic-inline concern suppressed
│   │                                 # when adultCount === 1; module itself already has no
│   │                                 # spousal branch and stays unchanged.
├── tests/
│   ├── fixtures/
│   │   └── single-person-mode.js    # NEW. Gold-standard fixtures for adult-count branches.
│   └── unit/
│       ├── filingStatus.test.js     # NEW or EXTENDED. detectMFJ keyed on adultCount === 2.
│       ├── socialSecurity.test.js   # EXTENDED. Single-adult combination (no spousal).
│       ├── healthcare.test.js       # EXTENDED. Single-adult + N-kids scaling.
│       └── adultCounter.test.js     # NEW. Counter bounds clamp [1, 2].
└── FIRE-snapshots-generic.csv       # DATA (user-local). Header gains 20th column `Adults`
                                     # on first save after upgrade; old rows remain 19-column
                                     # and are interpreted as Adults = 2 on import (FR-024).
```

**Structure Decision**: Extend the existing "single-file HTML + calc/ ES modules + tests/" layout. No new top-level directories. Inline HTML for the UI, inline calc helpers for the hot paths (because that is where the current consumers live), and Node unit tests for the four fixture classes against a mix of pure `calc/` module calls and newly-extracted pure helpers where practical.

## Complexity Tracking

> Principle I (Dual-Dashboard Lockstep) is violated by design. Documented here with a simpler-alternative analysis.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **Principle I lockstep exception — feature ships to `FIRE-Dashboard-Generic.html` only** | The RR dashboard is a deliberately two-person plan for Roger & Rebecca. An Adults counter on RR would create an input state (Adults = 1) that carries zero personal meaning and invites drift between "what RR actually models" and "what the control claims." The user's spec request is explicit: single-person mode is a Generic-only correctness fix. | **Alt A — also add counter to RR, hardcode it to 2 and hide it.** Rejected: adds code complexity to RR for no user-visible capability; forces every RR calc site to also accept the `adultCount` argument and prove it's always 2; duplicates test surface. **Alt B — promote RR to support Adults = 1 as well.** Rejected as out-of-scope and explicitly contrary to the user's request; RR's whole purpose is the couple-plan. **Alt C — add the counter to both, allow it on both.** Rejected because it re-opens settled RR personal-content assumptions (spousal SS floor, joint std-ded) for a use case that does not exist. Lockstep exemption is the smallest-blast-radius choice. |

## Phase 0 — Outline & Research

See [research.md](./research.md). Consolidated decisions:

- **Single-adult healthcare pre-65 share.** Chosen `SINGLE_ADULT_PRE65_SHARE = 0.35` (half of the current couple-only share `0.67`, rounded). Rationale + alternatives in research.md §1.
- **Post-65 single-Medicare scaling.** Chosen halving the per-country `post65` baseline for `adultCount === 1`. Rationale in research.md §2.
- **Filing-status signal.** Chosen: extend `detectMFJ(inp)` to return `inp.adultCount === 2` (fallback to the existing `agePerson2 > 0` check when `adultCount` is absent, preserving backward compatibility for callers that haven't migrated yet). Rationale in research.md §3.
- **Person 2 input preservation.** Chosen: leave DOM values intact and gate visibility via `display:none` on the wrapping `.input-group` elements. Values still flow through `saveState` and remain in localStorage. Rejected: clearing DOM values on decrement (causes byte-level data loss contrary to FR-007 and SC-005). Rationale in research.md §4.
- **Counter UX.** Chosen: reuse the existing children-counter `±` pattern; disable (not hide) the decrement button at 1 and the increment button at 2, so the control's bounds are visually discoverable. Rationale in research.md §5.
- **CSV schema evolution.** Chosen: append `Adults` column (20th column). Import of a 19-column legacy row returns `adults = 2`. Rationale in research.md §6.
- **Localization strategy.** Chosen: new i18n keys `profile.householdComposition`, `profile.adults`, `profile.adultsTip`, `profile.adultsDec`, `profile.adultsInc`, `tax.filingStatus.single`, `tax.filingStatus.mfj`, plus `snap.adults` for the CSV header and table column. Rationale in research.md §7.

**Output:** `research.md` with every Technical-Context "NEEDS CLARIFICATION" resolved. None remain as of Phase 0 completion.

## Phase 1 — Design & Contracts

**Prerequisite:** Phase 0 research complete.

1. **Entities → `data-model.md`.** Three entities: `AdultCount` (integer ∈ [1, 2]), `Person2Inputs` (pre-existing; lifecycle now gated on `adultCount === 2`), `SnapshotRow` (CSV schema delta). Full field list, validation rules, state transitions (increment/decrement) in `data-model.md`.

2. **Interface contracts → `contracts/`.** Five contracts, one file each:
   - `adult-count.contract.md` — DOM structure of the Household composition block; counter button IDs; `data-i18n` keys; disabled/no-op bounds semantics; synchronization helper `syncAdultCountVisibility()`.
   - `calc-functions.contract.md` — Extended signatures of `detectMFJ(inp)`, `calcNetWorth(inp)`, `calcAccessible(inp)`, `calcRealisticSSA(inp, fireAge)`, `getSSAnnual(inp, claimAge, fireAge)`, `getHealthcareFamilySizeFactor(age, inp)`, `getHealthcareMonthly(scenarioId, age, inp)` — each with Inputs/Outputs/Consumers and the adult-count branch rule.
   - `i18n.contract.md` — Every new translation key with English + Traditional Chinese strings; catalog insertion instructions.
   - `persistence.contract.md` — `adultCount` entry added to `PERSIST_IDS`; storage shape; version bump path; restoration order relative to `_wireFilingStatusEditTracking` so that `applyFilingStatusDefaults` fires after `adultCount` is restored.
   - `snapshots.contract.md` — CSV column ordering (existing 19 columns unchanged, `Adults` appended as column 20); `snapshotsToCSV` and `csvToSnapshots` deltas; backward-compat rule for 19-column legacy rows (`adults = 2`).

3. **Agent context update.** Set the `CLAUDE.md` SPECKIT reference between `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers to point at this plan (`specs/009-single-person-mode/plan.md`).

4. **Quickstart → `quickstart.md`.** Manual verification script a human operator can walk through to prove the feature works: load page → confirm counter = 2 → decrement → confirm Person 2 inputs hidden + FIRE number re-computes + filing status flips → reload → confirm counter persists at 1 → re-increment → confirm Person 2 values come back byte-for-byte → save snapshot → confirm `Adults` column present in CSV.

**Output:** `data-model.md`, `contracts/{adult-count,calc-functions,i18n,persistence,snapshots}.contract.md`, `quickstart.md`, updated `CLAUDE.md` SPECKIT marker.

**Constitution Re-Check (post-design):** All gates still pass with the same Principle-I justification. No new violations introduced by the design (pure modules stay pure; single source of truth preserved; bilingual covered).

## Stop Point

This plan ends at the conclusion of Phase 1. Task generation is the responsibility of `/speckit-tasks` (Phase 2), which reads this plan, the contracts, and the data model to produce an actionable, dependency-ordered `tasks.md`.

**Branch:** `009-single-person-mode`
**Plan:** `C:\Users\roger\Documents\GitHub\FIRE_Calculator\specs\009-single-person-mode\plan.md`
**Generated artifacts:** `research.md`, `data-model.md`, `contracts/adult-count.contract.md`, `contracts/calc-functions.contract.md`, `contracts/i18n.contract.md`, `contracts/persistence.contract.md`, `contracts/snapshots.contract.md`, `quickstart.md`.
