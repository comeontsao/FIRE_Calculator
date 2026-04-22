---

description: "Task list for Multi-Strategy Withdrawal Optimizer (feature 008)"
---

# Tasks: Multi-Strategy Withdrawal Optimizer

**Input**: Design documents from `/specs/008-multi-strategy-withdrawal-optimizer/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/` (all four)

**Tests**: INCLUDED — Principle IV (Gold-Standard Regression Coverage) is NON-NEGOTIABLE. Every new calc module requires fixtures. Test tasks appear in each user story's phase and in Foundational.

**Organization**: Tasks grouped by user story from spec.md. MVP scope = User Story 1. Feature works end-to-end after US1 + US2. US3 is polish that finalizes per-strategy chart truthfulness.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1/US2/US3). Setup + Foundational + Polish phases have no story label.
- File paths are absolute-relative to repo root.

## Path Conventions

Single-project single-file HTML app (per plan.md). All code edits land in the two HTML files in lockstep per Principle I; tests live under `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare directories and scaffolding needed before any user-story work.

- [ ] T001 [P] Create fixture directory `tests/fixtures/strategies/` and its `expected/` sub-directory; add a `.gitkeep` so empty directories commit cleanly.
- [ ] T002 [P] Create `tests/unit/strategies.test.js` skeleton with the required Node `--test` imports (`assert`, `test`), empty test suites for each of the 7 strategies, and a `describe`-style top-level header comment linking back to `specs/008-multi-strategy-withdrawal-optimizer/contracts/strategy-module.contract.md`.
- [ ] T003 Open a `Feature 008` H2 section at the bottom of `FIRE-Dashboard-Roadmap.md` with status "In progress" and a link to `specs/008-multi-strategy-withdrawal-optimizer/spec.md`.
- [ ] T004 [P] Open a `Feature 008 — Multi-strategy withdrawal optimizer` section at the bottom of `FIRE-Dashboard Translation Catalog.md` reserving space for the 36 new keys; mark each key with a TODO so untranslated entries are grep-findable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story depends on. No US* task can start until this phase completes.

**⚠️ CRITICAL**: All subsequent phases assume `STRATEGIES` is exposed, `chartState.previewStrategyId` is resolvable, and the 36 i18n keys exist in both HTMLs.

- [ ] T005 In BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, add the fenced `// ==================== MODULE: strategies ====================` comment header (per `contracts/strategy-module.contract.md`) and declare `const STRATEGIES = Object.freeze([])` as an empty placeholder. Export nothing yet; later tasks populate the array.
- [ ] T006 In BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`, extend the `chartState` resolver to include `previewStrategyId: null` in the default state object, add `setPreviewStrategy(id)` mutator that atomically updates + notifies listeners (mirrors `_setCalculatedFire` pattern), and add module-scope `_lastStrategyResults = null` cache variable next to `_lastKpiSnapshot`.
- [ ] T007 [P] In BOTH HTMLs, add the 15 UI-chrome i18n keys from `contracts/ui-comparison-panel.contract.md` to `TRANSLATIONS.en` AND `TRANSLATIONS.zh` dicts (objective selector, winner/preview banners, compare-panel labels, tie-rank template, infeasible tooltip, preview-action button text). Use the exact key names listed in the contract.
- [ ] T008 [P] In BOTH HTMLs, add the 21 strategy-specific i18n keys (7 strategies × {`.name`, `.desc`, `.narrative`}) to `TRANSLATIONS.en` AND `TRANSLATIONS.zh`. English text uses the strategy descriptions from `contracts/strategy-module.contract.md` Per-strategy behavior summary; Traditional Chinese translations follow the same style as existing `strategy.*` style keys (verb-noun pattern).
- [ ] T009 [P] Append all 36 new keys to `FIRE-Dashboard Translation Catalog.md` with both EN and zh-TW values and a "feat-008" tag column entry. Remove the TODO markers placed in T004 for each key as you fill it in.
- [ ] T010 In `tests/baseline/browser-smoke.test.js`, add the Principle VI symmetry-check test from `contracts/chart-dependencies.contract.md` (asserts that every listed renderer's source contains a reference to `strategies` AND that the `strategies` module's Consumers list names each renderer). Test must currently FAIL — it locks the contract ahead of implementation.

**Checkpoint**: `node --test tests/unit/*.test.js` still passes the existing 95 tests. The new Principle-VI test fails (expected — it will pass after US1 lands). Both HTMLs parse cleanly with zero console errors.

---

## Phase 3: User Story 1 — Automatic best-strategy selection by objective (Priority: P1) 🎯 MVP

**Goal**: User flips the "Leave more behind" ↔ "Retire sooner · pay less tax" selector; the Lifetime Withdrawal panel auto-picks the winning strategy and re-renders.

**Independent Test**: Load the dashboard, toggle the objective selector; confirm (a) the chart's distribution changes when the objective flips and (b) the visible winner label names a different strategy under each objective (or an explicit "same strategy wins both races" notice when they converge).

### Tests for User Story 1 (Principle IV — gold-standard regression)

- [ ] T011 [P] [US1] In `tests/fixtures/strategies/young-saver.json`, capture a CanonicalInputs + fireAge for a 32-year-old with $150K Trad / $80K stocks / $20K cash aiming for FIRE at 55; include `expected.winner` and `expected.resultsById` for all 7 strategies under BOTH objectives.
- [ ] T012 [P] [US1] In `tests/fixtures/strategies/three-phase-retiree.json`, capture a 54-year-old at FIRE with sizable Trad + stocks so all three phases (pre-59.5, 59.5–SS, SS-active) exercise. Populate expected winners + resultsById.
- [ ] T013 [P] [US1] In `tests/fixtures/strategies/coast-fire-edge.json`, capture a Coast-FIRE scenario (future value already sufficient, no contribs). Populate expected winners + resultsById.
- [ ] T014 [P] [US1] In `tests/unit/strategies.test.js`, write the **determinism test**: `scoreAndRank(inp, fireAge, mode, objective)` called twice with identical inputs returns deepEqual Rankings (covers FR-008).
- [ ] T015 [P] [US1] In `tests/unit/strategies.test.js`, write the **three fixture assertion tests** (one per scenario): given the fixture's `inp` + `fireAge`, `scoreAndRank` produces a Ranking whose winner ID for each objective matches `expected.winner[objective]` and whose `resultsById[strategyId]` matches `expected.resultsById[strategyId]` within the tolerances documented in `data-model.md §8`.
- [ ] T016 [P] [US1] In `tests/unit/strategies.test.js`, write the **bracket-fill-smoothed parity test**: for each of the three scenarios, assert that `strategies.computePerYearMix` on the `bracket-fill-smoothed` policy returns byte-identical output to the existing `taxOptimizedWithdrawal` function. This guarantees no regression to current users (FR-001).
- [ ] T017 [P] [US1] In `tests/unit/strategies.test.js`, write the **performance microbenchmark**: run `scoreAndRank` 10 times on the three-phase-retiree fixture, assert mean < 150 ms and p95 < 200 ms (matches `contracts/strategy-comparison.contract.md` performance gate).

### Implementation for User Story 1 — strategies module (both HTMLs in lockstep)

- [ ] T018 [P] [US1] In BOTH HTMLs, implement the `BRACKET_FILL_SMOOTHED` `StrategyPolicy` by wrapping the current `taxOptimizedWithdrawal` logic into a `computePerYearMix(ctx)` function. Set `caveats.bracketFillActive = true` for this policy only. Byte-for-byte output parity with today required (enforced by T016).
- [ ] T019 [P] [US1] In BOTH HTMLs, implement the `TRAD_FIRST` `StrategyPolicy` — drain Trad at ordinary rates until depleted, then stocks (LTCG), cash, Roth last. Honor RMD at 73+. Set `caveats.bracketFillActive = false`.
- [ ] T020 [P] [US1] In BOTH HTMLs, implement the `ROTH_LADDER` `StrategyPolicy` — pull Roth first (tax-free), then stocks (LTCG), cash, Trad last (RMD floor still enforced).
- [ ] T021 [P] [US1] In BOTH HTMLs, implement the `TRAD_LAST_PRESERVE` `StrategyPolicy` — stocks first, then cash, then Roth, Trad last (RMD floor still enforced). Estate-optimized.
- [ ] T022 [P] [US1] In BOTH HTMLs, implement the `PROPORTIONAL` `StrategyPolicy` — withdraw from each pool weighted by its current balance share. Tax iterated via the same LTCG fixed-point pattern as bracket-fill.
- [ ] T023 [P] [US1] In BOTH HTMLs, implement the `CONVENTIONAL` `StrategyPolicy` — textbook order Taxable → Trad → Roth. Ignores bracket boundaries intentionally (that's how Conventional differs from bracket-fill).
- [ ] T024 [US1] In BOTH HTMLs, implement the `TAX_OPTIMIZED_SEARCH` `StrategyPolicy` — the 11-point θ-sweep per `research.md §Decision 2`. Evaluate `θ ∈ {0, 0.1, 0.2, …, 1.0}`, simulate lifetime for each, pick the θ minimizing `lifetimeFederalTaxReal`. Depends on T018-T023 being declared first so the sweep can re-use the shared per-year computation primitives.
- [ ] T025 [US1] In BOTH HTMLs, populate the `STRATEGIES` frozen array from T005 with the seven policy objects in alphabetical-ID order. Verify the 7-row length in a comment.
- [ ] T026 [US1] In BOTH HTMLs, implement `scoreAndRank(inp, effectiveFireAge, mode, objective) → Ranking` per `contracts/strategy-comparison.contract.md`. Build shared `YearContext` once per year, iterate the seven policies, aggregate `StrategyResult`s, clamp pools to ≥ 0 before compounding per chart-display invariant. Cache into `_lastStrategyResults` (set up in T006).
- [ ] T027 [US1] In BOTH HTMLs, implement `rankByObjective(results, objective) → Ranking` — pure sort with the three-level tiebreaker (primary metric → other metric → strategy-ID alphabetical) plus tolerance-based `ties[]` detection per `research.md §Decision 4`.

### Implementation for User Story 1 — UI (objective selector + winner banner)

- [ ] T028 [P] [US1] In BOTH HTMLs, add the **objective selector** DOM inside the Lifetime Withdrawal Strategy card, directly below the card title, per `contracts/ui-comparison-panel.contract.md §UI component 1`. Two `<button role="radio">` elements with `data-i18n` keys `withdrawal.objective.estate` / `withdrawal.objective.tax`.
- [ ] T029 [P] [US1] In BOTH HTMLs, add the **winner banner** DOM replacing the current green strategy-summary ribbon, per `§UI component 2`. IDs `#withdrawalWinnerBanner`, `#winnerStrategyName`, `#winnerStrategyDesc`.
- [ ] T030 [US1] In BOTH HTMLs, add `setWithdrawalObjective(id)` global function — sets `localStorage.fire_withdrawalObjective`, calls `rankByObjective(_lastStrategyResults.rows, id)`, fires a `chartState.notify()`-style update so listeners re-render. Requires T026, T027, T028.
- [ ] T031 [US1] In BOTH HTMLs, update `recalcAll()` to call `scoreAndRank(inp, effectiveFireAge, fireMode, currentObjective)` AFTER the existing FIRE-age solver runs and BEFORE any existing chart renderers. Cache result in `_lastStrategyResults`. Persist objective selector's `localStorage` value on every recalc tick (defensive against race conditions).
- [ ] T032 [US1] In BOTH HTMLs, rewire `renderRothLadder` to consume the DISPLAYED strategy's `perYearRows` from `_lastStrategyResults` (via winner ID or preview — preview introduced later in US2; for US1, always winner). Replace today's hardcoded bracket-fill pull with `displayedStrategy.perYearRows.map(...)`. Update the renderer's comment header to declare `strategies` as an upstream (satisfies part of T010).
- [ ] T033 [US1] In BOTH HTMLs, add a `renderWithdrawalWinnerBanner(ranking)` function registered as a `chartState.onChange` listener. Populates `#winnerStrategyName`, `#winnerStrategyDesc` via `t(ranking.winner.nameKey)` / `t(ranking.winner.descKey)`, and appends the "+$X vs runner-up" delta text.
- [ ] T034 [US1] On cold load in BOTH HTMLs, read `localStorage.fire_withdrawalObjective` (default `'leave-more-behind'`), mark the correct `<button role="radio">` as `aria-checked="true"` before the first `recalcAll()` so the initial score uses the persisted objective.
- [ ] T035 [US1] In BOTH HTMLs, update the status-pill update logic (already using the displayed-strategy approach) to feed `ranking.winner.caveatFlagsObservedInRun` into any relevant banner decisions. For US1, this is minimal — just ensures no stale bracket-fill assumption is baked in.

**Checkpoint**: After this phase, the dashboard runs, seven strategies are scored on every recalc, the user can toggle the objective selector, and the chart + winner banner reflect the correct strategy. All 7 fixture tests + determinism test + perf test pass. The Principle-VI symmetry test from T010 now passes for `renderRothLadder`. **MVP is shippable here** — US2 and US3 add transparency + polish.

---

## Phase 4: User Story 2 — Compare all candidate strategies side-by-side (Priority: P2)

**Goal**: User clicks "Compare other strategies" → collapsed panel expands → ranked table of 6 non-winners with end-balance / lifetime-tax / FIRE-age columns + Preview button per row. Preview propagates to Lifetime Withdrawal chart, main lifecycle chart, sidebar mirror, and KPI ribbon.

**Independent Test**: With objective set, click "Compare other strategies", verify 6 rows appear with the right columns; click one row's Preview; verify all four chart surfaces update with a "previewing alternative" banner; click "Restore auto-selected winner"; verify snap-back.

### Tests for User Story 2

- [ ] T036 [P] [US2] In `tests/unit/strategies.test.js`, add **tie-detection test**: engineer inputs where two strategies produce within-tolerance end-balances; assert `ranking.ties.length === 1` and both strategy IDs appear in the tie.
- [ ] T037 [P] [US2] In `tests/baseline/browser-smoke.test.js`, add assertions that BOTH HTMLs contain `id="strategyComparePanel"`, `id="strategyCompareTable"`, `id="strategyCompareTableBody"`, `id="withdrawalPreviewBanner"`, `id="btnRestoreWinner"`.

### Implementation for User Story 2 — compare panel DOM + renderer

- [ ] T038 [P] [US2] In BOTH HTMLs, add the **collapsed comparison panel** DOM per `§UI component 3`: `<details id="strategyComparePanel">` with `<summary>` toggle, table skeleton with `<thead>`, empty `<tbody id="strategyCompareTableBody">`. Placed above the chart canvas, below the narrative ribbon.
- [ ] T039 [P] [US2] In BOTH HTMLs, add the **preview banner** DOM per `§UI component 4`: `<div id="withdrawalPreviewBanner" hidden>` with restore button.
- [ ] T040 [P] [US2] In BOTH HTMLs, add the CSS for `.withdrawal-objective-selector`, `.strategy-compare`, `.strategy-compare__toggle`, `.strategy-compare__body table`, `.strategy-compare tr.is-tied`, `.strategy-compare tr.is-preview-target`, `.strategy-compare tr.is-infeasible` per `§CSS additions`. Use only existing CSS variables.
- [ ] T041 [US2] In BOTH HTMLs, implement `renderStrategyComparePanel(ranking)` function. Populates `#strategyCompareTableBody` with 6 rows (from `ranking.rows.slice(1)`): columns Strategy name, End @ plan age, Lifetime tax, Earliest FIRE, Action (Preview button). Tie rows get `= 2nd` badge via `t('withdrawal.compare.tieRank', '2')`. Infeasible rows get `.is-infeasible` class + `title` attr tooltip from `t('withdrawal.compare.infeasibleTooltip')`. Register as `chartState.onChange` listener.
- [ ] T042 [US2] In BOTH HTMLs, wire each Preview button's click handler to call `setPreviewStrategy(rowStrategyId)`. Declare `setPreviewStrategy(id | null)` globally; it calls `chartState.setPreviewStrategy` (from T006) which atomically updates + notifies listeners.

### Implementation for User Story 2 — preview propagation

- [ ] T043 [US2] In BOTH HTMLs, register `renderWithdrawalPreviewBanner` as a `chartState.onChange` listener that observes `previewStrategyId`. When non-null, shows `#withdrawalPreviewBanner` with `t('withdrawal.preview.prefix') + strategyName + restore button`, AND hides `#withdrawalWinnerBanner`. When null, reverses.
- [ ] T044 [US2] In BOTH HTMLs, modify `renderRothLadder` (already strategy-aware from T032) to read `chartState.previewStrategyId ?? ranking.winnerId` — preview takes precedence.
- [ ] T045 [US2] In BOTH HTMLs, modify `renderGrowthChart` (Full Portfolio Lifecycle chart) so that when `chartState.previewStrategyId !== null`, it reconstructs the lifecycle chart from the previewed strategy's `perYearRows` instead of calling `projectFullLifecycle`. Add a fixture-locked byte-identical invariant: when `previewStrategyId === winnerId`, both paths produce the same chart. Update the renderer's comment header.
- [ ] T046 [US2] In BOTH HTMLs, modify `renderLifecycleSidebarChart` analogously to T045 so the sidebar mirror follows the preview. Update comment header.
- [ ] T047 [US2] In BOTH HTMLs, register `renderKpiCards` on `chartState.onChange` for the `previewStrategyId` field. For v1 the KPI values don't change under preview (fixed FIRE age per Architecture B), but the listener slot is reserved so v2 can surface "Estate at plan age" from the previewed strategy.
- [ ] T048 [US2] In BOTH HTMLs, add the **auto-clear** behavior in `recalcAll()`: on every recalc, after updating `_lastStrategyResults`, call `chartState.setPreviewStrategy(null)` so preview doesn't survive input changes (per `data-model.md §7` mutation invariant).
- [ ] T049 [US2] In BOTH HTMLs, add a defensive check in `setPreviewStrategy(id)` — if `id !== null && !ranking.rows.find(r => r.strategyId === id)`, coerce to `null` rather than leaving `previewStrategyId` pointing at a stale strategy (data-model §7 invariant).

**Checkpoint**: Compare panel works. User can expand, see 6 non-winners, click Preview on any row, observe the Lifetime Withdrawal chart + main lifecycle chart + sidebar + KPI ribbon all update, click Restore, snap back to winner. Editing any slider resets preview automatically. T010's Principle-VI symmetry test now passes for all listed renderers.

---

## Phase 5: User Story 3 — Strategy-aware narrative + caveat captions (Priority: P3)

**Goal**: The narrative ribbon, IRMAA glyph, SS-reduced-fill banner, and "How to read this chart" block reflect the currently DISPLAYED strategy — not hardcoded to bracket-fill.

**Independent Test**: Preview the `conventional` strategy (which doesn't use bracket-fill). Verify: the bracket-fill narrative banner is HIDDEN, the "Strategy: fill 12 % bracket …" text is REPLACED with Conventional's narrative, IRMAA glyph fires only on years where Conventional's MAGI actually breaches, and SS-reduced-fill banner is hidden (non-bracket-fill strategy).

### Tests for User Story 3

- [ ] T050 [P] [US3] In `tests/unit/strategies.test.js`, add **caveat-flag integrity test**: for each fixture × strategy, assert that `caveatFlagsObservedInRun` is the OR-aggregate of per-year `row.caveats` flags (`data-model.md §4` derivation rule).
- [ ] T051 [P] [US3] In `tests/baseline/browser-smoke.test.js`, add assertion that `#ssReductionCaption`, the bracket-fill narrative ribbon, the IRMAA threshold line, and the Roth-5yr banner each carry a data attribute or comment tying them to a caveat flag name (e.g., `data-caveat-gate="bracketFillActive"`) so their gating is grep-findable.

### Implementation for User Story 3

- [ ] T052 [US3] In BOTH HTMLs, gate the existing **bracket-fill narrative ribbon** (currently at the top of the Lifetime Withdrawal card) to render only when `displayedStrategy.caveatFlagsObservedInRun.bracketFillActive === true`. Replace with the `t(displayedStrategy.narrativeKey)` narrative for non-bracket-fill strategies.
- [ ] T053 [US3] In BOTH HTMLs, gate `#ssReductionCaption` on `displayedStrategy.caveatFlagsObservedInRun.ssReducedFill === true` (today it unconditionally shows whenever bracket-fill triggered it).
- [ ] T054 [US3] In BOTH HTMLs, update the IRMAA glyph plugin to read the per-year `displayedStrategy.perYearRows[i].caveats.irmaaCapped / irmaaBreached` instead of `result.strategy[i].*` (symbolic rename to point at the new data structure).
- [ ] T055 [US3] In BOTH HTMLs, update the "How to read this chart" block (`data-i18n="tw.howToRead"`) to use a strategy-aware i18n key that includes a `{strategyName}` placeholder. Add EN + zh-TW templates to the catalog.
- [ ] T056 [US3] In BOTH HTMLs, extend the Roth 5-year banner (`#roth5YearBanner`) to read `displayedStrategy.caveatFlagsObservedInRun.roth5YearWarning`. Stays hidden in v1 because no strategy returns `true` yet — reserved for v2 Roth-conversion-ladder feature.

**Checkpoint**: All four strategy-agnostic UI elements (narrative ribbon, SS banner, IRMAA glyph, how-to-read block) respond correctly to the currently displayed strategy. Previewing `conventional` shows textbook-order copy with no bracket-fill references; previewing `roth-ladder` shows Roth-first copy; and so on.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, documentation sync, and performance validation before closing the feature.

- [ ] T057 [P] In BOTH HTMLs, run a Principle-VI manual audit: `grep -n "renderRothLadder\|renderGrowthChart\|renderLifecycleSidebarChart\|renderKpiCards\|renderCompactHeaderStats\|renderStrategyComparePanel\|renderWithdrawalWinnerBanner\|renderWithdrawalPreviewBanner"` and confirm each renderer has an updated comment header naming `strategies` as an upstream (for those that consume it). Verify the `strategies` module's `Consumers:` list names every one. Fix any drift.
- [ ] T058 [P] Add a dev-only `console.time('recalc-full')` / `console.timeEnd('recalc-full')` pair around `recalcAll()` in both HTMLs, gated by `if (typeof window !== 'undefined' && window.__fireDebugPerf)`. Document the debug flag in `quickstart.md §Debugging tips`.
- [ ] T059 Run `node --test tests/unit/*.test.js tests/baseline/*.test.js` and confirm ALL tests pass — existing 95 plus new strategies tests. Address any regression.
- [ ] T060 [P] Hard-refresh both dashboards in Chrome + Firefox. For each, manually validate: objective toggle flips strategies, compare panel expands, preview propagates to all four surfaces, restore button works, tie badges render, infeasible rows are grayed, collapsed panel state resets on reload (per FR-006). Capture a short test report in `specs/008-multi-strategy-withdrawal-optimizer/CLOSEOUT.md`.
- [ ] T061 [P] Update `FIRE-Dashboard-Roadmap.md` — flip feature 008 status from "In progress" to "Shipped ({date})" and link to the forthcoming `CLOSEOUT.md`.
- [ ] T062 [P] Verify all 36 i18n keys have non-empty EN + zh-TW values in BOTH HTMLs AND in `FIRE-Dashboard Translation Catalog.md`. Remove any remaining TODO markers placed in T004.
- [ ] T063 [P] Write `specs/008-multi-strategy-withdrawal-optimizer/CLOSEOUT.md` summarizing: what shipped, fixture results for the three canonical scenarios, measured recalc wall-clock times (against 250 ms SC-006 target), SC-001/002/003 pass-rate across the 10-fixture test grid, known gaps + v2 backlog (e.g., per-strategy FIRE-age Architecture A, Roth-conversion-ladder true strategy, tax-curve-volatility objective).
- [ ] T064 Final lockstep diff audit: `git diff FIRE-Dashboard.html FIRE-Dashboard-Generic.html --stat` and inspect the symmetric changes. Any asymmetry MUST either be explicitly personal-content (Roger/Rebecca-specific) or documented as intentional divergence in the PR body.

**Checkpoint**: Feature complete, all tests green, performance within budget, CLOSEOUT written, roadmap updated, i18n catalog clean, RR and Generic in lockstep.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies — can start immediately.
- **Phase 2 Foundational**: depends on Phase 1. BLOCKS all user-story phases.
- **Phase 3 US1 (MVP)**: depends on Phase 2 — everything needed for winner selection.
- **Phase 4 US2**: depends on Phase 3 (preview system assumes strategies + ranking are live).
- **Phase 5 US3**: depends on Phase 3 (caveat flags produced by US1 code); can run parallel to US2 if different engineers own UI vs caveat-wiring code paths.
- **Phase 6 Polish**: depends on Phase 3 minimum (MVP shippable). Full polish requires Phases 4 + 5 done.

### User Story Dependencies

- **US1** is the MVP; testable standalone.
- **US2** adds preview + comparison but still relies on US1's winner selection.
- **US3** layers caveat-truthfulness on top; independently testable by flipping preview to a non-bracket-fill strategy and observing banners.

### Within Each User Story

- Fixture tasks (T011–T013) can run in parallel with each other and BEFORE implementation starts so fixtures lock expected outputs first.
- Unit-test tasks (T014–T017) can run before or in parallel with the strategy implementations (T018–T024) — TDD-friendly.
- Strategy implementations T018–T023 are INDEPENDENT (each a new pure function); all marked [P]. T024 (`TAX_OPTIMIZED_SEARCH`) depends on them because it re-uses their per-year primitives.
- Harness (T026, T027) depends on all seven strategies existing.
- UI tasks (T028–T035) mostly depend on the harness existing so they have data to render.

### Parallel Opportunities

- **Phase 1 Setup**: T001, T002, T004 all parallel; T003 serial.
- **Phase 2 Foundational**: T007, T008, T009 parallel (different files); T005, T006, T010 serial on the same HTMLs.
- **Phase 3 US1**: all seven fixture + test tasks (T011–T017) parallel; all six policy implementations T018–T023 parallel; T024 + T025 + T026 + T027 serial. UI tasks T028–T034 mostly parallel except where they share the same file section.
- **Phase 4 US2**: tests T036, T037 parallel; DOM tasks T038–T040 parallel; logic tasks T041–T049 serial within the chain.
- **Phase 5 US3**: tests T050, T051 parallel; implementation T052–T056 mostly independent (each targets a different banner/element).
- **Phase 6 Polish**: T057–T063 mostly [P]; T064 final.

---

## Parallel Example: User Story 1 — Strategy policy implementations

```bash
# After T011–T017 fixtures + tests are in place (all FAIL initially),
# six strategy policies can be implemented in parallel by six engineers
# or one engineer running through them serially — all target BOTH HTMLs
# but edit disjoint <script> sections:
Task: "T018 implement BRACKET_FILL_SMOOTHED policy in both HTMLs"
Task: "T019 implement TRAD_FIRST policy in both HTMLs"
Task: "T020 implement ROTH_LADDER policy in both HTMLs"
Task: "T021 implement TRAD_LAST_PRESERVE policy in both HTMLs"
Task: "T022 implement PROPORTIONAL policy in both HTMLs"
Task: "T023 implement CONVENTIONAL policy in both HTMLs"

# Then T024 (TAX_OPTIMIZED_SEARCH) runs serially — depends on T018–T023
# primitives being available.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundational (module skeleton, chartState extension, all 36 i18n keys, Principle-VI test that FAILS).
3. Complete Phase 3 US1 (tests first, then seven policies, then harness, then UI wiring).
4. **STOP and VALIDATE**: manually flip objective, observe the chart picks different strategies. `node --test` green. Principle-VI test now passes for `renderRothLadder`.
5. Ship MVP — users get automatic best-strategy selection without the compare panel (they just see the winner).

### Incremental Delivery

1. Ship MVP (US1). Users see winner; no comparison UI yet.
2. Add US2 (compare panel + preview) — users can audit + preview.
3. Add US3 (strategy-aware captions) — truthful narrative for every displayed strategy.
4. Polish (US6) — docs, CLOSEOUT, performance validation.

### Parallel Team Strategy (if multiple engineers)

Once Phase 2 completes:
- **Backend engineer**: T018–T027 (strategies module + harness).
- **Frontend engineer**: T028–T035 (objective selector + winner banner) in Phase 3, then T038–T049 (compare panel + preview) in Phase 4.
- **QA engineer**: T011–T017 fixture + test authoring (runs in parallel with backend — tests lock contracts before implementations land).
- **Documentation engineer** (optional): Phase 6 polish tasks.

---

## Notes

- [P] tasks = different files OR disjoint file sections AND no unmet dependency.
- [Story] label maps task to specific user story for traceability (US1/US2/US3).
- Every user story MUST be independently testable — verify by running that phase's checkpoint.
- Fixture-first then test-first is the norm (Principle IV) — locked fixtures + failing tests precede strategy implementations.
- Each task landing in BOTH `FIRE-Dashboard.html` AND `FIRE-Dashboard-Generic.html` in the same commit (Principle I — lockstep).
- Bilingual (Principle VII) — every `data-i18n` key added in T007/T008 must have both EN and zh-TW populated before the renderer referencing it ships.
- Commit after each task or tight logical group; never accumulate more than one user story's worth of work in a single commit.
- Avoid: cross-story dependencies that break independent-testability, in-place edits that conflate two policies into one function, hardcoded English strings in template literals.
