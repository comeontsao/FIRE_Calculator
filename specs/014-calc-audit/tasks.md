---
description: "Task list for feature 014 — Calculation Audit View"
---

# Tasks: Calculation Audit View

**Input**: Design documents from `/specs/014-calc-audit/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This feature includes **unit tests for `calc/calcAudit.js`** (per Constitution Principle IV — non-negotiable for any new module) and **Playwright E2E tests** (matching the project's existing pattern from features 011, 012, 013).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. The four user stories from `spec.md` are:

- **US1 (P1)**: QA verifies the lifecycle chart against intermediate calculations and charts — the MVP.
- **US2 (P1)**: Audit data shipped via Copy Debug for bug reports.
- **US3 (P2)**: Cross-validation surfaces discrepancies automatically.
- **US4 (P2)**: Gate evaluations are explicit and ordered.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4).

## Path Conventions

This is a single-file HTML application with a thin `calc/` directory for testable pure modules. The feature touches:

- `FIRE-Dashboard.html` — RR (Roger & Rebecca) dashboard.
- `FIRE-Dashboard-Generic.html` — Public Generic dashboard.
- `calc/calcAudit.js` — NEW pure assembler module (UMD-style classic script).
- `tests/unit/calcAudit.test.js` — NEW Node unit tests.
- `tests/e2e/calc-audit.spec.ts` — NEW Playwright E2E tests.
- `FIRE-Dashboard Translation Catalog.md` — i18n catalog.
- `FIRE-Dashboard-Roadmap.md` — master roadmap.

Per Constitution Principle I (Dual-Dashboard Lockstep), every task that modifies one HTML file MUST modify the other in the same change.

---

## Phase 1: Setup

- [ ] T001 Create skeleton `calc/calcAudit.js` with the `Inputs: / Outputs: / Consumers:` fenced module header (per Constitution Principle II) — header MUST list inputs (resolved-input snapshot, fireAge, fireMode, lastStrategyResults, calc-function refs, t() helper), outputs (`AuditSnapshot` per data-model.md), and consumers (Audit-tab UI renderers in both HTML files + Copy Debug serializer). Stub `assembleAuditSnapshot(options)` returning a minimal valid snapshot so tests can import.
- [ ] T002 [P] Create skeleton `tests/unit/calcAudit.test.js` — `require('../../calc/calcAudit.js')`, scaffold a `describe('calcAudit', ...)` block with one placeholder `test.todo` for each of the 14 contract test cases T1–T14 from `contracts/audit-assembler.contract.md`.
- [ ] T003 [P] Create skeleton `tests/e2e/calc-audit.spec.ts` — import `@playwright/test`, scaffold a top-level `test.describe('Calc Audit Tab', ...)` with placeholder `test.skip` for each user story (US1–US4) and the lockstep DOM-diff. Use the existing `webServer` config + the file-protocol harness pattern from `tests/e2e/file-protocol.spec.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the assembler, its unit tests, all i18n keys, all CSS, and the script-tag wiring — everything every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Implement the full `calc/calcAudit.js` per `contracts/audit-assembler.contract.md`. Functions: `assembleAuditSnapshot(options)` (validate options, build all 8 sections of `AuditSnapshot`, run 4 cross-validation invariants, return snapshot). Pure (no globals/DOM access in body); UMD wrapper at the bottom (window + module.exports). Path: `calc/calcAudit.js`.
- [ ] T005 Write the 14 unit tests T1–T14 in `tests/unit/calcAudit.test.js` per `contracts/audit-assembler.contract.md` "Test surface" — covering: snapshot shape, determinism, schema version, empty/pending state, gates fixed order, active-mode flag, all 4 cross-validation invariants (planted + expected divergence), bilingual verdicts, calc-function failure, FIRE-age scatter shape. Use lightweight in-memory mocks for the calc function references (no jsdom). Path: `tests/unit/calcAudit.test.js`.
- [ ] T006 Run `node --test "tests/unit/*.test.js"` from repo root. All 14 new `calcAudit` cases pass AND all 195 pre-existing tests (Features 001–013) still pass without modification (FR-030, SC-005). If any pre-existing test breaks, stop — `calcAudit` MUST be additive only.
- [ ] T007 Add the ~37 new i18n key pairs from `contracts/audit-i18n.contract.md` to BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` dictionaries in BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Group under a comment block `// === Feature 014: Calc Audit ===`. Verify byte-identical key set across both files. Audit existing keys first to avoid duplicating any `gate.*` labels that already exist. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T008 [P] Append `## Feature 014 — Calc Audit (i18n)` section to `FIRE-Dashboard Translation Catalog.md` containing the ~37 new key pairs in markdown table form (Key · EN · zh-TW), grouped by sub-category (tab/pill labels, section headings, flow-stage labels, gate verdicts, table columns, cross-validation messages, other). Path: `FIRE-Dashboard Translation Catalog.md`.
- [ ] T009 Add CSS rules per `contracts/audit-ui.contract.md` to BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Includes: `.audit-root`, `.audit-section`, `.audit-section--flow`, `.audit-section--highlight` (transient), `.audit-flow`, `.audit-flow__stage`, `.audit-flow__label`, `.audit-flow__headline`, `.audit-flow__arrow`, `.audit-flow__arrow-label`, `.audit-grid`, `.audit-chart`, `.audit-chart--wide`, `.audit-table-wrap`, `.audit-table-wrap--scroll`, `.audit-gate`, `.audit-gate--active`, `.audit-gate__verdict`, `.audit-crossval-row`, `.audit-crossval-row--expected`, plus `@media (max-width: 767px)` overrides. Use existing CSS variables (`--bg`, `--card`, `--accent`, `--accent-soft`, `--border`, `--text`). Place after the existing skin block per Feature 011 cascade rule. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T010 Add `<script src="calc/calcAudit.js"></script>` (classic script — file://-safe per Constitution V) to BOTH HTML files immediately after the existing `<script src="calc/tabRouter.js">` tag. Then add a small inline bootstrap that captures the assembler reference: `<script>window._assembleAuditSnapshot = window.assembleAuditSnapshot;</script>`. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.

**Checkpoint**: Assembler module passes all 14 unit tests; both HTML files have i18n keys, CSS, and script tag in place.

---

## Phase 3: User Story 1 — QA verifies via flow + per-section charts (Priority: P1) 🎯 MVP

**Goal**: Add the Audit tab as the 5th top-level tab with the flow diagram + 7 detail sections + per-section charts and tables. Every value in the lifecycle chart can be located in the Audit tab in under 30 seconds.

**Independent Test**: Open Audit tab, confirm flow diagram with 6 stages, click each stage to scroll to its section, verify every section has both a chart AND a table, verify Lifecycle Projection table matches lifecycle chart values within $1.

### Implementation for User Story 1

- [ ] T011 [US1] Add the 5th top-level tab button `<button class="tab" data-tab="audit" ...>` to `#tabBar` AND the corresponding 5th tab-panel `<section id="tab-audit" class="tab-panel" data-tab="audit" hidden>` (with sentinel + pill bar with single `summary` pill + pill-host) inside `#tabContainer` in BOTH HTML files. Per `contracts/audit-ui.contract.md` markup outline. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T012 [US1] Add the 5th entry `{ id: 'audit', pills: [{ id: 'summary', labelKey: 'nav.pill.summary' }] }` to the `TABS` constant in `calc/tabRouter.js`. Path: `calc/tabRouter.js`.
- [ ] T013 [US1] Add the Calculation Flow Diagram markup inside the audit pill-host: `.audit-flow` containing 6 `<button class="audit-flow__stage" data-target="audit-section-{stage}">` boxes connected by `<span class="audit-flow__arrow">▶</span>` glyphs and `<span class="audit-flow__arrow-label">` labels. Per `contracts/audit-ui.contract.md`. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T014 [US1] Add the 7 detail-section containers (`#audit-section-inputs`, `#audit-section-spending`, `#audit-section-gates`, `#audit-section-fireage`, `#audit-section-strategy`, `#audit-section-lifecycle`, `#audit-section-crossval`) per `contracts/audit-ui.contract.md` markup outline — each a `<section class="audit-section">` with H2 heading, `.audit-grid` (chart wrap + table wrap), and unique canvas/table IDs. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T015 [US1] Implement the Audit-tab JS controller inline in BOTH HTML files: `_auditCharts = {}` registry, `_auditChartsBuilt = false` flag, `buildAuditCharts(snapshot)` (creates ~10–14 Chart.js instances per `contracts/audit-ui.contract.md` deferred-render lifecycle), `updateAuditCharts(snapshot)` (chart.data = ...; chart.update('none')), `renderAuditTables(snapshot)` (writes table HTML for each section), `renderFlowDiagram(snapshot.flowDiagram)` (writes 6 stage headlines + 5 arrow labels into spans), `renderAuditUI(snapshot)` (orchestrates flow + tables + charts). Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T016 [US1] Wire the Audit assembly into `recalcAll()` in BOTH HTML files: at the end of `recalcAll`, after `_lastStrategyResults` is set, call `window._lastAuditSnapshot = window.assembleAuditSnapshot({...})` with all required options from `contracts/audit-assembler.contract.md`. Then if `tabRouter.getState().tab === 'audit'`, call `renderAuditUI(window._lastAuditSnapshot)`. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T017 [US1] Add the `onAfterActivate` callback hook in `tabRouter.init({...})` so when the user activates the Audit tab, `renderAuditUI(window._lastAuditSnapshot)` runs (and `buildAuditCharts` if first activation). Update the existing init call (added in Feature 013 T017) — extend the existing `onAfterActivate` to also handle the new tab. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T018 [US1] Wire the click-to-scroll handler on `.audit-flow` (per `contracts/audit-ui.contract.md` "Click-to-scroll wiring" section): single delegated click listener that resolves `closest('.audit-flow__stage[data-target]')`, calls `scrollIntoView({behavior: 'smooth', block: 'start'})`, applies `audit-section--highlight` class for 1.5s. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T019 [US1] Add Playwright tests for User Story 1 in `tests/e2e/calc-audit.spec.ts`: (a) Audit tab is the 5th tab; (b) clicking Audit tab reveals flow diagram with 6 stages and headline outputs; (c) clicking a stage scrolls to its detail section AND applies highlight class; (d) every detail section has BOTH a chart `<canvas>` AND a table; (e) Lifecycle Projection per-year table row count equals (endAge - ageRoger + 1); (f) Lifecycle Projection's age 60 `total` matches the main lifecycle chart's age-60 data point within $1. Run on both `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html`. Path: `tests/e2e/calc-audit.spec.ts`.
- [ ] T020 [US1] Browser smoke walk per CLAUDE.md "Browser smoke before claiming a feature 'done'" rule. Serve via `python -m http.server 8766` AND open via `file://`. For BOTH HTML files: load fresh; click Audit tab; verify flow diagram + 7 sections render; verify ~10–14 charts render at correct size (300×180 desktop); click each flow stage and verify scroll+highlight; resize to ≤767px and verify mobile vertical-stack layout; DevTools console shows zero red errors AND zero `[shim-name] canonical threw:` messages.

**Checkpoint**: US1 fully functional. Audit tab + flow + sections + charts + tables shippable as MVP.

---

## Phase 4: User Story 2 — Audit data in Copy Debug (Priority: P1)

**Goal**: The existing Copy Debug button's JSON output gains a top-level `audit` key carrying the full `AuditSnapshot`.

**Independent Test**: Click Copy Debug, paste into a JSON validator, confirm `audit` key present, confirm `audit.flowDiagram.stages.length === 6`, confirm `audit.gates.length === 3`, confirm existing keys (`feasibilityProbe`, `summary`, `lifecycleSamples`, `inputs`) still present.

- [ ] T021 [US2] Update the Copy Debug button's JSON-build code in BOTH HTML files: locate the existing `feasibilityProbe` assembly block; AFTER it, add `audit: window._lastAuditSnapshot ?? null` to the top-level debug object. Do NOT remove or modify any existing keys. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T022 [US2] Add Playwright test for User Story 2 in `tests/e2e/calc-audit.spec.ts`: (a) click Copy Debug; (b) read clipboard via `page.evaluate(() => navigator.clipboard.readText())`; (c) parse as JSON; (d) assert top-level `audit` key present; (e) assert `audit.schemaVersion === '1.0'`; (f) assert `audit.flowDiagram.stages.length === 6`; (g) assert `audit.gates.length === 3` with modes safe, exact, dieWithZero; (h) assert `audit.lifecycleProjection.rows.length === (endAge - ageRoger + 1)`; (i) assert existing `feasibilityProbe`, `summary`, `lifecycleSamples`, `inputs` keys still present (FR-020). Run on both HTML files. Path: `tests/e2e/calc-audit.spec.ts`.

**Checkpoint**: US2 verified. Copy Debug self-contained for bug reports.

---

## Phase 5: User Story 3 — Cross-validation auto-flags discrepancies (Priority: P2)

**Goal**: When two calculation paths disagree (4 named invariants), the Audit's Cross-Validation section displays a warning row with both values, the delta, and the reason.

**Independent Test**: With normal dashboard, confirm "All cross-checks passed". Plant a divergence in `_lastAuditSnapshot.crossValidationWarnings`, re-render, confirm warning row visible with dual-bar chart.

> Implementation of the 4 invariants is in T004 (the assembler). This phase adds the UI rendering and verification.

- [ ] T023 [US3] Implement `renderCrossValidation(warnings)` inside the Audit-tab JS controller in BOTH HTML files: when `warnings.length === 0`, render a single positive line "All cross-checks passed" (i18n key `audit.crossval.allPassed`). When `warnings.length > 0`, render one row per warning with: kind label (i18n), reason text, dual-bar `<canvas>` chart, delta annotation. If warning has `expected: true`, apply the `audit-crossval-row--expected` class for neutral styling and append the "(expected — <reason>)" suffix. Paths: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`.
- [ ] T024 [US3] Add Playwright test for User Story 3 in `tests/e2e/calc-audit.spec.ts`: (a) load dashboard; (b) wait for `_lastAuditSnapshot`; (c) plant a fake warning via `page.evaluate(() => { window._lastAuditSnapshot.crossValidationWarnings.push({...planted...}); window._renderAuditUI?.(window._lastAuditSnapshot); })`; (d) assert one warning row visible with the planted reason; (e) assert dual-bar chart rendered; (f) reload page; (g) assert "All cross-checks passed" returns. Path: `tests/e2e/calc-audit.spec.ts`.

**Checkpoint**: US3 verified. Cross-validation surfaces real divergences AND planted ones.

---

## Phase 6: User Story 4 — Gate evaluations explicit and ordered (Priority: P2)

**Goal**: The Gate Evaluations section displays all 3 gates in fixed order (Safe → Exact → DWZ), each with verdict, plain-English explanation, per-gate chart, and violations table. The active mode is highlighted.

**Independent Test**: Toggle each of Safe / Exact / DWZ. Confirm Gate Evaluations section updates to show active gate highlighted; each gate's chart renders trajectory + floor; verdict text matches active mode.

> Most of US4 is implemented in T015 (the JS controller renders all 3 gates) and T004 (assembler builds the gate snapshots). This phase adds focused E2E coverage.

- [ ] T025 [US4] Add Playwright tests for User Story 4 in `tests/e2e/calc-audit.spec.ts`: (a) load with Safe active; assert all 3 gates rendered (data-gate="safe", "exact", "dieWithZero"); assert `data-gate="safe"` has `audit-gate--active` class; (b) toggle to Exact; assert `audit-gate--active` moves to Exact gate; (c) toggle to DWZ; same; (d) for each gate, assert verdict text contains the expected i18n template (e.g., for Safe feasible: contains floor amount; for Safe infeasible: contains "first violation at age"); (e) for each gate, assert per-gate canvas renders (non-empty bounding box); (f) for a known infeasible scenario, assert violations table has rows. Path: `tests/e2e/calc-audit.spec.ts`.

**Checkpoint**: US4 verified. Gate evaluations explicit + ordered + visualized.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T026 [P] Add Playwright lockstep DOM-diff test (SC-010) in `tests/e2e/calc-audit.spec.ts`: open both HTML files in separate contexts, collect `{sections, canvases, flowStages, pillIds}` from each, assert byte-identical structure. Path: `tests/e2e/calc-audit.spec.ts`.
- [ ] T027 [P] Update `FIRE-Dashboard-Roadmap.md` — under "Recently shipped" (or "in progress" while merge is pending), add an entry for **Feature 014 — Calculation Audit View**, summarizing: 5th top-level tab, 6-stage flow diagram, 7 detail sections each with chart + table, ~37 new bilingual i18n keys, new pure module `calc/calcAudit.js`, Copy Debug `audit` key, zero calc-engine modifications (SC-008). Link to spec, plan, tasks. Path: `FIRE-Dashboard-Roadmap.md`.
- [ ] T028 Run full Node unit test suite: `node --test "tests/unit/*.test.js"`. Confirm all pre-existing 195 tests pass AND all 14 new `calcAudit` tests pass. Total: 209+ green.
- [ ] T029 Run full Playwright E2E suite: `npx playwright test`. Confirm all pre-existing 50 tests still green AND all new `tests/e2e/calc-audit.spec.ts` cases pass. Capture trace artifacts on any failure.
- [ ] T030 Quickstart end-to-end validation: walk through all 14 manual steps in `specs/014-calc-audit/quickstart.md` on BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` (over both http:// AND file:// per Constitution V).
- [ ] T031 SC-008 calc-engine zero-modification verification: run `git diff main..HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html` and grep for changes inside any of the 12 named calc functions (`signedLifecycleEndBalance`, `findFireAgeNumerical`, `isFireAgeFeasible`, `_simulateStrategyLifetime`, `_chartFeasibility`, `scoreAndRank`, `rankByObjective`, `projectFullLifecycle`, `getMortgageAdjustedRetirement`, `getActiveChartStrategyOptions`, `getTwoPhaseFireNum`, `computeWithdrawalStrategy`). The only allowed change inside those functions' regions is at the call sites that newly pass options to `assembleAuditSnapshot` — function bodies themselves MUST be unchanged.
- [ ] T032 Final lockstep audit per Constitution Principle I: count `<section id="audit-section-`, `class="audit-section"`, `class="audit-flow__stage"`, `<canvas id="audit-chart-`, `data-i18n="audit\.` in both HTML files. All counts MUST match. Document any allowed personal-content divergences (none expected for the Audit tab).
- [ ] T033 Update `CLAUDE.md` SPECKIT block: change "Next step" from `/speckit-tasks` to `/speckit-implement` (during work) or to a closeout link (after merge). Path: `CLAUDE.md`.

**Checkpoint**: Feature 014 ready to merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 first; T002 + T003 [P] after T001.
- **Foundational (Phase 2)**: depends on Phase 1. Internal sequencing: T004 → T005 → T006; T007 (i18n in HTML) before any UI rendering tasks; T008 [P] alongside T007; T009 (CSS) and T010 (script tag) any time after T004 lands the JS file.
- **US1 (Phase 3)**: depends on Phase 2. Internal sequencing: T011 (tab markup) → T012 (TABS const) → T013 (flow diagram markup) → T014 (detail sections) → T015 (JS controller) → T016 (recalcAll wiring) → T017 (tabRouter onAfterActivate) → T018 (click-to-scroll) → T019 (E2E tests) → T020 (browser smoke).
- **US2 (Phase 4)**: depends on Phase 2 (assembler exists) AND Phase 3 (Audit tab markup exists for E2E to drive). T021 → T022.
- **US3 (Phase 5)**: depends on Phase 2 + Phase 3. T023 → T024.
- **US4 (Phase 6)**: depends on Phase 2 + Phase 3 (the 3-gate rendering is part of T015). T025 only.
- **Polish (Phase 7)**: depends on US1–US4 complete.

### Parallel Opportunities

- T002 + T003 in parallel after T001.
- T008 (catalog) + T007 (HTML keys) can run in parallel.
- T026 (DOM-diff E2E) + T027 (roadmap update) in parallel.
- E2E tests (T019, T022, T024, T025, T026) all live in one file (`calc-audit.spec.ts`) — run sequentially or merge into one writing pass per phase.

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Phase 1 + Phase 2 → assembler + i18n + CSS + script tag in place.
2. Phase 3 (US1) → Audit tab + flow + sections + charts + tables.
3. Phase 4 (US2) → Copy Debug `audit` key.
4. **STOP and VALIDATE**: smoke walk both files; run unit + E2E; QA verifies via the new tab.
5. If desired, ship as MVP.

### Incremental Delivery

1. Setup + Foundational + US1 + US2 → MVP shipped.
2. Add US3 (cross-validation auto-flagging) → ship.
3. Add US4 (gate-explicitness E2E coverage) → ship.
4. Polish phase → final merge.

### Single-Engineer Strategy

Manager dispatches Backend Engineer for T001, T004, T005 (the pure module + tests). Frontend Engineer for T009 (CSS), T011–T018 (HTML markup + JS controller wiring), T021 (Copy Debug), T023 (cross-validation rendering). QA Engineer for T002, T003, T006 (run tests), T019, T022, T024, T025, T026 (E2E tests), T020 (browser smoke), T028–T032 (verifications). DB Engineer is unused — no schema change.

---

## Notes

- Every task that modifies an HTML file modifies BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` per Constitution Principle I (Lockstep, NON-NEGOTIABLE).
- Every task that adds user-visible text adds EN + zh-TW pair per Constitution Principle VII.
- Tests must be written and pass before claiming a phase complete (Principle IV).
- Zero calc-engine changes — explicitly verified by SC-008 (T031).
- `calc/calcAudit.js` uses UMD-style classic-script load (file://-safe per Constitution V), mirroring `calc/tabRouter.js` pattern from feature 013.
- After all phases complete, write a closeout: `specs/014-calc-audit/CLOSEOUT.md`. Update `FIRE-Dashboard-Roadmap.md` to reference the closeout.
