---
description: "Task list for Year-by-Year Lifecycle Spreadsheet Export (feature 037)"
---

# Tasks: Year-by-Year Lifecycle Spreadsheet Export

**Input**: Design documents from `specs/037-lifecycle-excel-export/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/lifecycle-export.contract.md](./contracts/lifecycle-export.contract.md), [quickstart.md](./quickstart.md)
**Branch**: `037-lifecycle-excel-export`

**Tests**: **INCLUDED and NON-OPTIONAL.** Constitution Principle IV (Gold-Standard Regression
Coverage) is NON-NEGOTIABLE, and contract §C-4 enumerates the obligations. Pure-module fixtures are
written TDD-first (RED before GREEN); E2E specs drive both dashboards and unzip the produced `.xlsx`.

**Lockstep note (Principle I)**: unless a task says otherwise, every HTML change lands in **BOTH**
`FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in the same task. This feature has **no**
planned divergence — the export reads whatever each dashboard's own projection produced.

**Bookkeeping note**: features 035 and 036 both shipped with `tasks.md` at 0 ticked, losing the
record of what was actually done. **Tick these boxes as you go** (T041 enforces it at the end).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4; Setup / Foundational / Polish carry no story label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a green anchor and pin the new dependency before any code moves.

- [X] T001 Record the pre-feature regression anchor: run `npm run test:unit`, `npx playwright test` (FULL suite), and `node tools/console-probe.mjs` on both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`; write the pass counts — **including which E2E specs flake under parallel load and pass in isolation** — into `specs/037-lifecycle-excel-export/BASELINE.md`.
- [X] T002 Pin the dependency in `specs/037-lifecycle-excel-export/research.md`: confirm `https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js` still returns HTTP 200, re-verify the bundle is classic UMD with zero ESM syntax, and record the byte size + a SHA-384 integrity hash for optional SRI use.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure model builder and its static guards. Every user story consumes this.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T003 Create `calc/lifecycleExport.js` as a classic UMD module per contract §C-1.1 — no `export` keyword, `globalThis` registration, `module.exports` for Node, and a fenced `Inputs:` / `Outputs:` / `Consumers:` / `FRAME:` header (Principles II + VI). **UMD export const MUST be `_lifecycleExportApi` — never `_api`.**
- [X] T004 Add `calc/lifecycleExport.js` to the static guard in `tests/unit/globalScopeCollision.test.js` so a duplicate top-level `const` can never silently kill the module in a browser (this exact failure shipped twice — see CLAUDE.md Process Lessons).
- [X] T005 Implement the column registry from `specs/037-lifecycle-excel-export/data-model.md` §3 as pure data inside `calc/lifecycleExport.js` — `key`, `header`, `group`, `frame`, `source`, `phases`, `numFmt`, plus a `registryVersion` constant.
- [X] T006 [P] TDD (RED): create `tests/unit/lifecycleExport.test.js` with FAILING fixtures for INV-2 (one row per year, no gaps), INV-4 (column count/order independent of data), INV-7 (blank vs zero per data-model §2), and all three §C-1.2 error paths (`LIFECYCLE_UNAVAILABLE`, `YEAR_SEQUENCE_INVALID`, `SETTINGS_INCOMPLETE`).
- [X] T007 Implement `buildLifecycleExport(input) → ExportModel` in `calc/lifecycleExport.js` per contract §C-1.2 — the accumulation/retirement **union**, the **join on `age`** to strategy rows, blank-vs-zero semantics, and no-mutation of inputs. Make T006 GREEN.
- [X] T008 [P] Add fixtures to `tests/unit/lifecycleExport.test.js` covering the phase union explicitly: an accumulation year populates cash-flow columns and leaves withdrawal columns blank; a retirement year does the inverse; a missing strategy-row match leaves withdrawal columns blank rather than zero.

**Checkpoint**: the model builder is unit-green in Node with zero DOM and zero ExcelJS. UI can begin.

---

## Phase 3: User Story 1 - Download the whole plan as one year-per-row table (Priority: P1) 🎯 MVP

**Goal**: One button in History downloads a real `.xlsx` with one row per year, current year → plan end, matching the Lifecycle chart.

**Independent Test**: Click the button on a freshly loaded dashboard; the file downloads, opens in Excel with no repair prompt, row 2 is the current year, the last row is the plan's final year, one row per year with no gaps, and a spot-checked total matches the chart.

- [X] T009 [US1] Add EN + zh-TW keys for the button label, the in-progress state, and the four failure messages (projection unavailable, library unavailable, build failed, write failed) to `TRANSLATIONS.en` / `.zh` in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, and to `FIRE-Dashboard Translation Catalog.md` (Principle VII).
- [X] T010 [US1] Add the export button to the History → Snapshots action row (RR ~4584) in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, beside the existing `📤 Export CSV`, visually distinct from it per FR-023a, wired to `exportLifecycleProjectionXlsx()`.
- [X] T011 [US1] Implement the lazy ExcelJS loader in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per research R1 — inject the pinned cdnjs `<script>` on **first click only**, await load with a timeout, no-op if already loaded, and surface a caught failure as the translated "library unavailable" message with **no download** (FR-024/025).
- [X] T012 [US1] Implement `exportLifecycleProjectionXlsx()` steps 1 and 3 in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per contract §C-2.1: read the **cached** chart lifecycle (RR ~18310) and call `buildLifecycleExport`. **MUST NOT call `projectFullLifecycle` with fresh options** (INV-5). Unavailable ⇒ translated refusal, no file.
- [X] T013 [US1] Implement the workbook writer in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per contract §C-2.2 — `Projection` sheet, header row from `columns[].header`, frozen header + frozen identity columns (`views:[{state:'frozen', xSplit, ySplit:1}]`), per-column widths, and currency/integer `numFmt`. Numerics written as **numbers**, blanks as **empty cells** (FR-009, INV-7).
- [X] T014 [US1] Implement the download step in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` — filename `FIRE-Lifecycle-Projection-YYYY-MM-DD.xlsx` (FR-011), reusing the existing in-page download path used by `exportSnapshotsCSV()`.
- [X] T015 [P] [US1] Create `tests/e2e/lifecycle-export.spec.ts` with US1 cases against BOTH dashboards: click export, capture the download, **unzip the `.xlsx` and assert on sheet XML** — header row present, row count equals the plan range, first data row is the current year, last row is plan end, years ascend with no gaps (SC-003).
- [X] T016 [P] [US1] Add a chart-parity case to `tests/e2e/lifecycle-export.spec.ts`: sample three years (accumulation, transition, late-plan) and assert the workbook's money `total` equals the Lifecycle chart's rendered value at the same year (SC-002 — the feature's credibility check).

**Checkpoint**: MVP — a user can export the whole plan and it matches the chart.

---

## Phase 4: User Story 2 - Read each year in both money and purchasing power (Priority: P2)

**Goal**: Every figure appears in both frames, with headers that make the difference obvious.

**Independent Test**: In the current-year row the two frames are equal; in a late year money exceeds purchasing power; headers name their frame without external explanation.

- [X] T017 [US2] Extend the `_extendRowsWithBookValues` lifecycle call site (RR ~18323) in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` from the current 8 balance fields to the **full numeric field list** (income, taxes, spending, contributions, funding-ladder), per research R3. This is a **list change only** — no new conversion maths.
- [X] T018 [US2] Emit paired money / purchasing-power columns in `calc/lifecycleExport.js` per contract §C-1.3 — money read from the `<field>BookValue` companion, purchasing power from the base field, sibling column immediately after, and a `meta.frameFallback` flag set if a companion is missing.
- [X] T019 [P] [US2] Add fixtures to `tests/unit/lifecycleExport.test.js` for INV-3 (money ≥ purchasing power, equal only in the current year), correct pairing order, and the `frameFallback` flag firing when a `BookValue` companion is absent.
- [X] T020 [US2] Add bilingual frame-naming to the column headers in `calc/lifecycleExport.js` + `FIRE-Dashboard Translation Catalog.md` so each header states its frame in the active language (research R8) — using the project's money / purchasing-power terminology, never "real $".
- [X] T021 [P] [US2] Add US2 cases to `tests/e2e/lifecycle-export.spec.ts` on BOTH dashboards: current-year frames equal, late-year money larger, every money column has an adjacent purchasing-power sibling.

**Checkpoint**: the file is trustworthy about which dollars are which.

---

## Phase 5: User Story 3 - The file reflects the plan currently on screen (Priority: P2)

**Goal**: The export follows the active mode / strategy / retirement status and records what produced it.

**Independent Test**: Export, change the FIRE mode, export again — the files differ consistently with the chart, and each Settings sheet records the settings in force for that export.

- [X] T022 [US3] Resolve active settings in `exportLifecycleProjectionXlsx()` in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` via `getActiveChartStrategyOptions()` and `getActiveMortgageStrategyOptions()` per contract §C-2.1 step 2 — reading `state._payoffVsInvest.mortgageStrategy` directly is prohibited.
- [X] T023 [US3] Join withdrawal columns to the **active** strategy's rows (`_lastStrategyResults`) rather than the default in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, so a non-default winner is what the file reports (research R2/R6).
- [X] T024 [US3] Build the `ExportSettings` block in `calc/lifecycleExport.js` per data-model §1.3 — FIRE mode, strategy id + display name, objective, mortgage strategy, retirement status and transition year, plan end age, inflation rate, language, dashboard variant, and an **injected** timestamp (no `Date.now()` in the pure module).
- [X] T025 [US3] Write the `Settings` sheet as the workbook's second sheet in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per FR-011c / contract §C-2.2, as label/value pairs.
- [X] T026 [US3] Assert side-effect freedom in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (FR-022 / INV-6): the handler must not call `recalcAll()`, write `localStorage`, mutate `state`, or re-render a chart.
- [X] T027 [P] [US3] Add US3 cases to `tests/e2e/lifecycle-export.spec.ts` on BOTH dashboards: export → change FIRE mode → re-export produces different, chart-consistent rows; a non-default withdrawal strategy is honoured; retirement status ON stops income/contributions at the declared year (FR-021); the Settings sheet matches the dashboard state.
- [X] T028 [P] [US3] Add a purity case to `tests/e2e/lifecycle-export.spec.ts`: snapshot inputs, KPI text, and `localStorage` before and after an export and assert all are unchanged (INV-6).

**Checkpoint**: the file can never quietly disagree with the screen.

---

## Phase 6: User Story 4 - Read the transitions, not just the balances (Priority: P3)

**Goal**: Phase and shortfall are scannable columns, and depletion is visible.

**Independent Test**: The phase column changes exactly at the retirement transition, penalty-free-access age, and SS claim age; shortfall flags match the chart's tinted years and the verdict's named year.

- [X] T029 [US4] Populate the `phase`, `is401kUnlocked`, and `hasShortfall` identity columns in `calc/lifecycleExport.js` from the lifecycle rows (FR-016, FR-017).
- [X] T030 [US4] Make depletion distinguishable from a clamped display zero in `calc/lifecycleExport.js` per FR-018 / INV-8 — the chart clamps totals at zero for display; the export must not inherit that clamp silently.
- [X] T031 [P] [US4] Add fixtures to `tests/unit/lifecycleExport.test.js` for phase-change years, shortfall flagging, and the clamped-zero vs genuinely-depleted distinction.
- [X] T032 [P] [US4] Add US4 cases to `tests/e2e/lifecycle-export.spec.ts` on BOTH dashboards: phase transitions land on the right years; the earliest flagged shortfall year equals the year named in the on-screen verdict (SC-007); a solvent plan flags nothing.

**Checkpoint**: all four stories independently functional.

---

## Phase 7: Retirement-year tax + signed total — SCOPE REDUCED 2026-08-13

**Purpose**: Close the two real holes in "all the numbers".

**⚠️ RESEARCH R4 WAS WRONG — corrected during implementation.** R4 concluded that retirement-year
federal tax "is computed inside `taxOptimizedWithdrawal` and never surfaced onto any row", and
scoped a calc-layer change to expose it. That was based on inspecting the **lifecycle** row shapes
and the `options._trajectory` rows. It missed that the **withdrawal-strategy** `perYearRows` are
built as `Object.assign(rowBase, mix)` — and `mix` already carries **`taxOwed`** (ordinary + LTCG).
Since the export already joins those rows for the withdrawal columns, the tax comes free from the
same source, which is *more* internally consistent than a separate calc path would have been.

**Consequence**: T033 and T034 are **superseded** — the feature now has **zero calc-behaviour
changes**. Only T034a (`signedTotal`) remains, because no existing row carries an un-clamped total.

- [~] T033 **SUPERSEDED** — no calc change is needed for retirement-year tax, so there is no absent-safe guarantee to fixture. The equivalent guard for the one remaining calc addition lives in T034a.
- [~] T034 **SUPERSEDED** — retirement-year federal tax is mapped from the strategy row's existing `taxOwed` field (ordinary + LTCG) in `FIRE-Dashboard.html` / `FIRE-Dashboard-Generic.html`, not surfaced by a calc change. Zero projection risk.
- [X] T034a Surface the **un-clamped** retirement-row total as a new additive sibling field `signedTotal` in BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (added 2026-08-13 — INV-8 cannot be met by the pure module alone, because `projectFullLifecycle` writes `total: Math.max(0, total)` onto the row before the export ever sees it). Same additive/absent-safe discipline and the same byte-identical-when-unread fixture as T034.
- [X] T035 **Already satisfied by the pure module** — `calc/lifecycleExport.js` auto-emits a Settings line "Retirement-year federal tax: Not reported" whenever no retirement row carries a finite `retirementFederalTax`, and it disappears on its own once the value is mapped. No UI work was required. Verify the line is ABSENT in the shipped workbook (because T034's mapping populates it).

**Checkpoint**: retirement years explain themselves. The feature ships with **no calc-behaviour change** beyond the additive `signedTotal` field.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T036 [P] Update `FIRE-Dashboard-Roadmap.md` with a feature 037 entry describing the shipped scope, the ExcelJS dependency exception, and the Phase 7 decision.
- [X] T037 Lockstep audit: diff the export-related regions of `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` and confirm they are identical (this feature has no planned divergence); record the matched-marker counts in the commit message (Principle I).
- [X] T038 i18n audit: `grep -oE '[A-Za-z]{4,}'` over every new user-visible fragment in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` and confirm each string is behind `data-i18n` / `t()` / `TRANSLATIONS`, including the workbook column headers (Principle VII).
- [X] T039 Full regression gate: `npm run test:unit`, `npx playwright test` (**FULL suite, not just this feature's spec**), and `node tools/console-probe.mjs` on BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` (`errorCount 0`); re-run any failure in isolation and classify it against the T001 baseline as flake or regression.
- [ ] T040 Human merge gate per `specs/037-lifecycle-excel-export/quickstart.md`: open the produced workbook in **real Excel** and confirm no repair prompt, that the ~68-column sheet is navigable with the frozen panes, and that headers read sensibly in EN and zh-TW. **Features 035 and 036 both merged with this gate unsigned — do not make it three.**
- [X] T041 Write `specs/037-lifecycle-excel-export/CLOSEOUT.md` recording final test counts, the Phase 7 decision, any deferred items, and confirm **every checkbox in this file is ticked to match reality** before merge.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)**: no dependencies.
- **Foundational (T003–T008)**: after Setup. **Blocks every user story.** Order: T003 → T004 → T005 → T006 (RED) → T007 (GREEN) → T008.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after Foundational; best validated with US1 present since it adds columns to the same sheet.
- **US3 (Phase 5)**: after US1 (extends the same handler).
- **US4 (Phase 6)**: after Foundational; independent of US2/US3.
- **Phase 7**: independent of all UI work; can land any time after Foundational, or be skipped.
- **Polish (Phase 8)**: after all desired stories.

### Within each story

- Tests marked RED are written and **must fail** before the implementing task.
- Pure-module tasks (`calc/lifecycleExport.js`) before the HTML tasks that call them.
- T017 (field-list extension) before T018 (column pairing) — the companions must exist first.

### Parallel opportunities

- T006 and T008 are `[P]` — separate fixture blocks in one new test file.
- E2E tasks T015, T016, T021, T027, T028, T031, T032 are `[P]` **relative to implementation**, but they all edit `tests/e2e/lifecycle-export.spec.ts` — serialize edits to that file, or assign the whole spec to one owner.
- T033 is `[P]` — a different test file entirely.
- T036 is `[P]` — a different document.
- **Not parallel**: every HTML task edits the same two files. Serialize them to preserve lockstep and avoid edit conflicts. The genuine parallel surface is calc-module work, test authoring, and docs.

---

## Implementation Strategy

### MVP first (US1 only)

1. T001–T002 (anchor + pin) → T003–T008 (pure model, unit-green) → T009–T016 (button to download).
2. **STOP AND VALIDATE**: run the quickstart happy path and the chart-parity check on both dashboards.
3. Demoable MVP: the user can export their whole plan and trust it against the chart.

### Incremental delivery

Foundational → US1 (MVP) → US2 (both frames) → US3 (fidelity + provenance) → US4 (transitions) → Phase 7 (retirement tax, optional) → Phase 8 gate.

### Notes

- `[P]` = different files, no incomplete-task dependency. Lockstep HTML edits are single tasks spanning both files.
- Every new user-visible string ships EN + zh-TW + catalog in the **same** task (Principle VII, merge gate).
- Commit after each task or logical group; keep the FULL E2E suite green, not just this feature's spec.
- The `_lifecycleExportApi` naming rule (T003) and its static guard (T004) are not style preferences — a duplicate top-level `const` silently kills the module in every real browser while Node tests stay green.
