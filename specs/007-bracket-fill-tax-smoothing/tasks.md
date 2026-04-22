---

description: "Task list for feature 007 Bracket-Fill Tax Smoothing"
---

# Tasks: Bracket-Fill Tax Smoothing

**Input**: Design documents from `specs/007-bracket-fill-tax-smoothing/`
**Prerequisites**: [plan.md](./plan.md) ✅, [spec.md](./spec.md) ✅, [research.md](./research.md) ✅, [data-model.md](./data-model.md) ✅, [contracts/](./contracts/) ✅, [quickstart.md](./quickstart.md) ✅

**Tests**: This feature REQUIRES new unit tests per spec FR-081 (≥10 new tests) and SC-011 (cross-surface consistency test). A new test file `tests/unit/bracketFill.test.js` carries them. Existing 65 unit tests and 4 smoke tests must stay green.

**Organization**: Tasks are grouped by user story per spec. US1 (P1) covers the bracket-fill algorithm and primary chart integration; US2 (P2) covers the transparent-caveat indicators. Per CLAUDE.md Constitution Principle I, every implementation task ships to BOTH `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` (Generic) unless a task is explicitly RR-only or Generic-only. Legacy dashboard is OUT OF SCOPE.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files or independent concern, no unresolved dependency)
- **[Story]**: US1 (algorithm + core integration), US2 (caveat transparency). Setup / Foundational / Polish have no story label.
- File paths in every description.

## Path conventions

- Dashboards (no build): `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html` at repo root
- Translation catalog: `FIRE-Dashboard Translation Catalog.md`
- Tests: `tests/unit/bracketFill.test.js` (NEW), `tests/baseline/browser-smoke.test.js` (EXTEND)
- Legacy (excluded): `FIRE-Dashboard - Legacy.html` — DO NOT MODIFY

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: Confirm environment + record baseline numbers before any code change.

- [ ] T001 Confirm current branch is `007-bracket-fill-tax-smoothing` and working tree is clean; run `git status` and `git branch --show-current`
- [ ] T002 [P] Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a browser; record the BASELINE lifetime tax figure (before bracket-fill) for Roger's default scenario by reading it from the Lifetime Withdrawal Strategy chart's current "avg tax" caption, and save screenshots of the primary charts in `specs/007-bracket-fill-tax-smoothing/baseline-screenshots/`. These numbers are the "no-smoothing" comparison target for SC-001 (≥25% reduction) and the CLOSEOUT report.
- [ ] T003 [P] Run the existing test suites and record the green baseline: `node --test "tests/unit/*.test.js"` must show 65 pass; `node tests/baseline/browser-smoke.test.js` must show 4 pass. Any failure blocks the feature.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Shared building blocks that US1 AND US2 both depend on.

**⚠️ CRITICAL**: No user-story work may begin until this phase is complete.

### i18n (blocks all UI surfaces across both stories)

- [ ] T004 [P] Add feature-007 i18n keys to `FIRE-Dashboard.html` `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts, following the key list in [contracts/ui-controls.contract.md](./contracts/ui-controls.contract.md) and [contracts/chart-transparency.contract.md](./contracts/chart-transparency.contract.md). Keys include: `bracketFill.safetyMarginLabel`, `bracketFill.safetyMarginTip`, `bracketFill.rule55Label`, `bracketFill.rule55Tip`, `bracketFill.rule55SeparationAgeLabel`, `bracketFill.rule55SeparationAgeTip`, `bracketFill.rule55InvalidSeparation`, `bracketFill.irmaaThresholdLabel`, `bracketFill.irmaaThresholdTip`, `bracketFill.irmaaDisabled`, `bracketFill.infoSummary`, `bracketFill.infoBody1` … `infoBody4`, `chart.bracketFillExcess`, `chart.irmaaThresholdLine`, `chart.rule55Unlock`, `chart.ssReductionCaption`, `chart.lifetimeTaxComparison`, `chart.dwzCaveat`, `chart.strategyNarrativeBracketFill`. Both EN and zh-TW values required.
- [ ] T005 [P] Add the identical keys (EN + zh-TW) to `FIRE-Dashboard-Generic.html` `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts.
- [ ] T006 [P] Add the same keys to `FIRE-Dashboard Translation Catalog.md` as a new "Category N — Feature 007" section with an EN / zh-TW table (match the feature-006 pattern).

### Generic feature-006 regression fix (blocks bracket-fill algorithm)

- [ ] T007 In `FIRE-Dashboard-Generic.html`, locate line ~5505 where `signedLifecycleEndBalance` currently calls `getTaxBrackets(true)`. Change it to `getTaxBrackets(detectMFJ(inp))` per spec FR-069a. Run `node --test "tests/unit/*.test.js"` and `node tests/baseline/browser-smoke.test.js` — both must stay green (the RR equivalent stays hardcoded MFJ which is correct per FR-067).

### `getInputs()` extension (blocks every algorithm caller)

- [ ] T008 [P] In `FIRE-Dashboard.html`, extend `getInputs()` per [contracts/ui-controls.contract.md §getInputs() extension](./contracts/ui-controls.contract.md) to read the four new DOM inputs (`#safetyMargin`, `#rule55Enabled`, `#rule55SeparationAge`, `#irmaaThreshold`) and populate `inp.safetyMargin`, `inp.rule55`, `inp.irmaaThreshold`. Use defensive parsing so a missing DOM element defaults to spec-documented values (0.05, unchecked, 212000). Run existing unit tests — must stay green.
- [ ] T009 [P] Repeat T008 in `FIRE-Dashboard-Generic.html` with the IRMAA default swap (212000 MFJ / 106000 Single based on `detectMFJ(inp)`).

### DOM controls (blocks wiring and chart integration)

- [ ] T010 [P] In `FIRE-Dashboard.html`, add the four new DOM controls per [contracts/ui-controls.contract.md](./contracts/ui-controls.contract.md):
  - Safety Margin slider (`#safetyMargin`, range 0–10, default 5, label `bracketFill.safetyMarginLabel`) — placed inside the existing FIRE Strategy panel near the Safe/Exact/DWZ buttons.
  - Rule of 55 checkbox (`#rule55Enabled`) + Separation Age number input (`#rule55SeparationAge`, range 50–65) — placed in the Projections / Savings panel. Separation Age input initially hidden when checkbox is unchecked (toggle via small `onchange` handler that shows/hides `#rule55SeparationAgeGroup`).
  - IRMAA threshold input (`#irmaaThreshold`, number, default 212000) — placed adjacent to the existing `#twStdDed`/`#twTop12`/`#twTop22` inputs.
  - Info panel (expandable `<details>` / `<summary>`) — placed below the FIRE Strategy panel, above the Lifetime Withdrawal Strategy chart.
  - Add `'safetyMargin'`, `'rule55Enabled'`, `'rule55SeparationAge'`, `'irmaaThreshold'` to `PERSIST_IDS`. Add `safetyMargin: { el: 'safetyMarginVal', fmt: v => v + '%' }` to `SLIDER_LABELS`.
- [ ] T011 [P] Repeat T010 in `FIRE-Dashboard-Generic.html`.
- [ ] T012 In `FIRE-Dashboard-Generic.html` only, add the `applyFilingStatusDefaults(isMFJ)` helper that pre-fills `#irmaaThreshold`, `#twStdDed`, `#twTop12` with Single-or-MFJ defaults based on `detectMFJ(inp)`, UNLESS the user has already edited those inputs (track via `data-user-edited` attribute flipped on first `input` event). Call the helper from init and from any listener that changes household configuration. Per spec FR-068.

**Checkpoint**: Foundation complete. Both user stories can proceed.

---

## Phase 3: User Story 1 — Bracket-fill algorithm + FIRE-date + chart integration (Priority: P1)

**Goal**: The bracket-fill withdrawal algorithm replaces the cover-spend default, excess Trad routes into stocks as synthetic conversions, all three primary consumers (`signedLifecycleEndBalance`, `projectFullLifecycle`, `computeWithdrawalStrategy`) stay in lockstep, and every downstream KPI / chart / banner picks up the new behavior. No transparency indicators yet — just the algorithm and the core numbers.

**Independent Test**: Run the Roger & Rebecca default scenario. Lifetime tax drops ≥25% vs the no-smoothing baseline (SC-001). Traditional-draw bars appear in EVERY year from unlock through plan age, not concentrated in 3 years. Safe / Exact / DWZ solver FIRE ages change (usually earlier). All three downstream surfaces (status banner, Full Portfolio Lifecycle chart, Lifetime Withdrawal Strategy chart) agree with each other.

### Core algorithm

- [ ] T013 [US1] In `FIRE-Dashboard.html`, rewrite the `taxOptimizedWithdrawal` function to implement bracket-fill per [contracts/bracket-fill-algorithm.contract.md §Algorithm Steps](./contracts/bracket-fill-algorithm.contract.md). Add the trailing `options` parameter (defaults provided so old callers don't break mid-refactor). Implement all 10 steps including Step 7 IRMAA cap. Add new return-object fields: `syntheticConversion`, `ssReducedFill`, `irmaaCapped`, `irmaaBreached`, `rule55Active`, `roth5YearWarning` (always false in this feature), `magi`, `bracketHeadroom`. Preserve all existing return fields.
- [ ] T014 [US1] In `FIRE-Dashboard-Generic.html`, implement the identical `taxOptimizedWithdrawal` rewrite. File-specific diff: NONE — the function body is identical. Both files produce identical output for identical input given identical `brackets` argument.

### Caller integration — `signedLifecycleEndBalance`

- [ ] T015 [US1] In `FIRE-Dashboard.html`, update `signedLifecycleEndBalance` to forward the new `options` param (`safetyMargin`, `rule55`, `irmaaThreshold` from `inp`) to `taxOptimizedWithdrawal`. Apply the non-negotiable pool-operation ordering per [contracts/bracket-fill-algorithm.contract.md §Caller pool-operation ordering](./contracts/bracket-fill-algorithm.contract.md): (1) subtract per-pool withdrawals, (2) subtract `mix.shortfall` from stocks if any, (3) add `mix.syntheticConversion` to stocks if any, (4) compound signed (no clamp — feature-006 invariant). This happens on every retirement year inside the loop.
- [ ] T016 [US1] Repeat T015 in `FIRE-Dashboard-Generic.html`. Confirm T007's fix (`getTaxBrackets(detectMFJ(inp))`) is still in place at the now-updated call site.

### Caller integration — `projectFullLifecycle`

- [ ] T017 [US1] In `FIRE-Dashboard.html`, update `projectFullLifecycle` to forward the new `options` param. Apply the non-negotiable pool-operation ordering per [contracts/bracket-fill-algorithm.contract.md §Caller pool-operation ordering](./contracts/bracket-fill-algorithm.contract.md): (1) subtract per-pool withdrawals, (2) subtract `mix.shortfall` from stocks if any, (3) add `mix.syntheticConversion` to stocks if any, (4) compound with clamping (chart-display invariant). Update the `_lastLifecycleDataset` cache assembly to include the new per-year annotation flags (`ssReducedFill`, `irmaaCapped`, `irmaaBreached`, `rule55Active`, `syntheticConversion`) so the sidebar mirror (feature 006) can read them if needed in a future change. **Constitution Principle VI**: update the comment block above `renderGrowthChart` to add the new consumed fields to its `Consumers:` list (`syntheticConversion`, `ssReducedFill`, `irmaaCapped`, `irmaaBreached`, `rule55Active`).
- [ ] T018 [US1] Repeat T017 in `FIRE-Dashboard-Generic.html`, including the Consumers comment update on Generic's `renderGrowthChart`.

### Caller integration — `computeWithdrawalStrategy`

- [ ] T019 [US1] In `FIRE-Dashboard.html`, update `computeWithdrawalStrategy` to forward the new `options` param and apply the non-negotiable pool-operation ordering per [contracts/bracket-fill-algorithm.contract.md §Caller pool-operation ordering](./contracts/bracket-fill-algorithm.contract.md): (1) subtract per-pool withdrawals, (2) subtract `mix.shortfall` from stocks if any, (3) add `mix.syntheticConversion` to stocks if any, (4) compound with clamping (matches chart-display semantics). Append the new flag fields (`syntheticConversion`, `ssReducedFill`, `irmaaCapped`, `irmaaBreached`, `rule55Active`, `magi`) to each `strategy.push({...})` row so the Lifetime Withdrawal Strategy chart renderer can read them. Update the function's Consumers comment per Constitution Principle VI to declare the new fields.
- [ ] T020 [US1] Repeat T019 in `FIRE-Dashboard-Generic.html`.

### Chart updates (core)

- [ ] T021 [US1] In `FIRE-Dashboard.html`, extend the Lifetime Withdrawal Strategy chart renderer to add the "Trad: Bracket-fill excess" stacked bar segment per [contracts/chart-transparency.contract.md §Change 1](./contracts/chart-transparency.contract.md). New dataset with `label: t('chart.bracketFillExcess')`, `backgroundColor: 'rgba(108,99,255,0.55)'`, stacked between Trad and Roth segments. Data: `strategy.map(s => s.syntheticConversion)`.
- [ ] T022 [US1] Repeat T021 in `FIRE-Dashboard-Generic.html`.
- [ ] T023 [US1] In `FIRE-Dashboard.html`, update the strategy summary narrative above the Lifetime Withdrawal Strategy chart per [contracts/chart-transparency.contract.md §Change 5](./contracts/chart-transparency.contract.md). Compute: effective bracket cap, average annual synthetic conversion, average effective tax rate, estimated savings % vs no-smoothing. Render the narrative template as a `<p>` element with `data-i18n` for the surrounding text + dynamic values interpolated via `t()`.
- [ ] T024 [US1] Repeat T023 in `FIRE-Dashboard-Generic.html`.
- [ ] T025 [US1] In `FIRE-Dashboard.html`, add the lifetime-tax-comparison caption below the Full Portfolio Lifecycle chart per [contracts/chart-transparency.contract.md §Change 9](./contracts/chart-transparency.contract.md). Text template: "Lifetime federal tax (bracket-fill): $X · vs. no-smoothing: $Y · savings $Z (N%)". Compute Y via a one-shot comparison run using the retired cover-spend algorithm snapshotted in a helper `_computeLegacyLifetimeTax(inp)` (called once per input change, not per Chart.js update).
- [ ] T026 [US1] Repeat T025 in `FIRE-Dashboard-Generic.html`.
- [ ] T027 [US1] In `FIRE-Dashboard.html`, add the DWZ-mode caveat caption below the FIRE-strategy buttons per [contracts/chart-transparency.contract.md §Change 10](./contracts/chart-transparency.contract.md). Visible only when `fireMode === 'dieWithZero'`; hidden in Safe/Exact. Text: `t('chart.dwzCaveat')`.
- [ ] T028 [US1] Repeat T027 in `FIRE-Dashboard-Generic.html`.

### Cross-surface consistency (FR-063 / FR-064 / FR-065-sidebar)

- [ ] T029 [US1] In both files, verify (via careful code review — no new tests yet, those are in Phase 5 T040) that every downstream consumer enumerated in FR-063 picks up bracket-fill automatically. Specifically trace data flow:
  - KPI row values → `_lastKpiSnapshot` → populated by `recalcAll` using `yearsToFIRE` / `getTwoPhaseFireNum` which call `signedLifecycleEndBalance` → ✅ inherits via T015/T016.
  - Status banner → same path → ✅.
  - Feature 006 compact header live chips → read `_lastKpiSnapshot` → ✅.
  - Progress rail → reads `progress` from `_lastKpiSnapshot` → ✅.
  - Feature 006 sidebar mirror → reads `_lastLifecycleDataset` populated by `projectFullLifecycle` → ✅ inherits via T017/T018.
  - Portfolio Drawdown: With vs Without SS chart → uses `simulateDrawdown` which wraps `projectFullLifecycle` → ✅ inherits.
  - Roth Ladder chart → uses `projectFullLifecycle` directly → ✅ inherits.
  - Country scenario grid cards (via `computeScenarioFireFigures` from feature 006) → calls `yearsToFIRE` + `getTwoPhaseFireNum` per scenario → ✅ inherits.
  - FIRE-by-Country ranked bar chart + Milestone Timeline → same path → ✅ inherits.
  - Coast FIRE card → `coastFIRECheck` → uses `findMinAccessibleAtFireNumerical` which calls `signedLifecycleEndBalance` → ✅ inherits.
  - Override banner + infeasibility banner → call `projectFullLifecycle` and `_evaluateFeasibilityAtAge` → ✅ inherits.
  - Snapshot save → writes the currently-shown FIRE target → ✅ inherits.
  Document the audit in a PR comment or CLOSEOUT note. If any surface does NOT inherit, file a follow-up task in Phase 5.

### Algorithm unit tests

- [ ] T030 [P] [US1] Create `tests/unit/bracketFill.test.js` with ≥6 tests covering core algorithm cases per [contracts/bracket-fill-algorithm.contract.md §Test Hooks](./contracts/bracket-fill-algorithm.contract.md):
  1. Bracket-fill with zero SS, zero RMD, ample Trad, $72K spend → `wTrad ≈ (stdDed + top12) × 0.95`, `syntheticConversion > 0`, all flags false.
  2. Bracket-fill with SS active consuming 40% of headroom → `ssReducedFill === true`, `wTrad` reduced accordingly.
  3. Scenario where MAGI would hit $250K → `irmaaCapped === true`, `magi <= irmaaThreshold × 0.95`.
  4. Safety margin 0% vs 5% vs 10% → `targetBracketCap` monotonically decreasing; `wTrad` monotonically decreasing.
  5. Trad balance smaller than bracket headroom → `wTrad === pTrad`, bracket-fill stops at pool exhaustion.
  6. Age 73 RMD + bracket-fill → `wTrad >= rmd`, bracket-fill tops up to cap when room remains.
  Use the existing `tests/unit/withdrawal.test.js` import pattern; Node `--test` compatible.

**Checkpoint**: User Story 1 complete. Bracket-fill is live. Every surface in FR-063 reflects bracket-fill. Safe/Exact/DWZ all produce updated FIRE ages. No transparency indicators yet.

---

## Phase 4: User Story 2 — Transparent caveat indicators (Priority: P2)

**Goal**: Every algorithmic decision the user needs to trust — SS headroom reduction, IRMAA cap, Rule of 55 unlock, 5-year Roth warning (placeholder) — has a visible indicator on the appropriate chart or caption. A user reading the dashboard can identify within 60 seconds (SC-005) which caveats are affecting their current plan.

**Independent Test**: Build four contrived scenarios (one per caveat). Each caveat's indicator is visible when the caveat binds, invisible when it doesn't.

### Social Security integration transparency

- [ ] T031 [US2] In `FIRE-Dashboard.html`, add the SS-reduction caption element below the Lifetime Withdrawal Strategy chart canvas per [contracts/chart-transparency.contract.md §Change 4](./contracts/chart-transparency.contract.md). A `<p class="chart-caveat" id="ssReductionCaption" data-i18n="chart.ssReductionCaption">` element populated by the chart renderer on every recalc. Show when the first year with `ssReducedFill === true` is found in `strategy[]`; hide when no year triggers. Text: "📌 Social Security taxable (85%) fills $X of the 12% bracket this year — Traditional fill reduced accordingly" with X interpolated.
- [ ] T032 [US2] Repeat T031 in `FIRE-Dashboard-Generic.html`.

### IRMAA indicators

- [ ] T033 [US2] In `FIRE-Dashboard.html`, add the IRMAA horizontal threshold line as a new Chart.js dataset per [contracts/chart-transparency.contract.md §Change 2](./contracts/chart-transparency.contract.md). Rendered when `inp.irmaaThreshold > 0`. Two data points at `[firstYear, effectiveIrmaaCap]` and `[lastYear, effectiveIrmaaCap]`. `borderDash: [5,5]`, `borderColor: 'rgba(255,107,107,0.4)'`. Legend entry: `t('chart.irmaaThresholdLine')`.
- [ ] T034 [US2] Repeat T033 in `FIRE-Dashboard-Generic.html`.
- [ ] T035 [US2] In `FIRE-Dashboard.html`, add the year-level IRMAA `⚠` glyph as a small inline Chart.js plugin per [contracts/chart-transparency.contract.md §Change 3](./contracts/chart-transparency.contract.md). Plugin signature mirrors the existing drag-hint plugin. Iterates `strategy[]`, draws a small `⚠` text glyph above any year where `irmaaCapped || irmaaBreached`. Tooltip (via Chart.js `tooltip.callbacks`) explains: MAGI = $X; Medicare surcharge est $Y/mo applies 2 years later.
- [ ] T036 [US2] Repeat T035 in `FIRE-Dashboard-Generic.html`.

### Rule of 55 indicators

- [ ] T037 [US2] In `FIRE-Dashboard.html`, add the Rule-of-55 scatter marker dataset to the Full Portfolio Lifecycle chart per [contracts/chart-transparency.contract.md §Change 7](./contracts/chart-transparency.contract.md). Single point at `(age=55, lifecycle.find(d => d.age === 55).total)`, `pointStyle: 'rectRot'`, `pointRadius: 7`, `backgroundColor: '#ffd93d'`. Hidden when `inp.rule55.enabled === false` OR `inp.rule55.separationAge < 55`. Legend entry: `t('chart.rule55Unlock')`.
- [ ] T038 [US2] Repeat T037 in `FIRE-Dashboard-Generic.html`.
- [ ] T039 [US2] In both files, extend the Key Years annotation line on the Full Portfolio Lifecycle chart to include "Age 55 🔓 Rule of 55 Trad unlock" when `inp.rule55.enabled && inp.rule55.separationAge >= 55`. Per [contracts/chart-transparency.contract.md §Change 8](./contracts/chart-transparency.contract.md).

### 5-year Roth warning (placeholder)

- [ ] T040 [US2] In both files, add the yellow-banner warning element (closed/hidden by default). Wire a conditional render path that checks `strategy.some(s => s.roth5YearWarning)` — in feature 007, this is always false because synthetic conversions don't create a Roth clock. The element exists so a future true-Roth-conversion feature can activate it without UI churn. Per spec §R3 and FR-040. `data-i18n="chart.roth5YearWarning"`, `data-i18n="chart.roth5YearWarningBanner"`.

### Info panel

- [ ] T041 [US2] In `FIRE-Dashboard.html`, add the "What is bracket-fill smoothing?" expandable info panel per [contracts/chart-transparency.contract.md §Info Panel](./contracts/chart-transparency.contract.md) and [contracts/ui-controls.contract.md §Info Panel](./contracts/ui-controls.contract.md). Use `<details id="bracketFillInfo" class="bracketFill-info">` / `<summary>` — no JS needed. The specific `id` and `class` let the smoke test (T046) assert presence without confusing this panel with other existing `<details>` elements on the page (e.g., the feature-005 "📖 New to this?" tax-strategy panel). Content covers: bracket-fill plain-English, safety margin explanation, IRMAA, Rule of 55 (including FR-034's single-plan limitation — "Rule of 55 is penalty-free only from the plan of the employer you separated from in or after the year you turned 55; old-employer plans rolled INTO that plan BEFORE separation are covered, but external IRAs are not"), 5-year Roth clock definition, when-it-saves-money vs. when-it-doesn't. All prose behind `data-i18n` / `data-i18n-html` keys added in T004.
- [ ] T042 [US2] Repeat T041 in `FIRE-Dashboard-Generic.html` with identical `id="bracketFillInfo"` and `class="bracketFill-info"`.

### Validation helpers

- [ ] T043 [US2] In both files, add the Rule-of-55 validation helper: if `rule55Enabled === true && rule55SeparationAge < 55`, show a visible warning near the separation-age input: `data-i18n="bracketFill.rule55InvalidSeparation"`. The algorithm's fallback to 59.5 is already handled by `effectiveUnlockAge` logic in T013/T014; this task only adds the UI warning.
- [ ] T044 [US2] In both files, add the IRMAA-disabled hint: when `#irmaaThreshold` value is 0 or blank, show hint `⚠️ IRMAA protection disabled` below the input. `data-i18n="bracketFill.irmaaDisabled"`.

### Caveat-transparency unit tests

- [ ] T045 [US2] Extend `tests/unit/bracketFill.test.js` with ≥4 caveat-flag tests:
  7. Rule of 55 enabled, age 56 → `wTrad > 0`, `rule55Active === true`.
  8. Rule of 55 disabled, age 56 → `wTrad === 0`, `rule55Active === false`.
  9. IRMAA threshold = 0 → `irmaaCapped === false && irmaaBreached === false` regardless of MAGI.
  10. Generic + filing status Single → bracket cap = (15000 + 47150) × 0.95 = 59042.50, wTrad assertion.

**Checkpoint**: User Story 2 complete. Every caveat the algorithm acts on is visible somewhere on the dashboard.

---

## Phase 5: Cross-surface consistency + integration testing

**Purpose**: Verify the FR-063 cross-surface invariants explicitly and add regression protection.

- [ ] T046 [P] Extend `tests/baseline/browser-smoke.test.js` with a feature-007 DOM contract assertion block per spec §Test Hooks in the contracts. Check that both HTML files contain: `#safetyMargin`, `#rule55Enabled`, `#rule55SeparationAge`, `#irmaaThreshold`, `#ssReductionCaption`, `<details id="bracketFillInfo" class="bracketFill-info">` (the feature-007-specific info panel — a generic `<details>` check would false-positive on feature-005's "📖 New to this?" panel, so this assertion must use the id or class), the new legend entries via `data-i18n` keys. Check all ~20 new i18n keys (listed in T004) resolve in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts of each HTML file AND appear in `FIRE-Dashboard Translation Catalog.md`.
- [ ] T047 [P] Add cross-surface consistency unit test to `tests/unit/bracketFill.test.js` (test #11, covering SC-011): instrument `signedLifecycleEndBalance` to expose cumulative Trad draws; instrument `projectFullLifecycle` similarly; instrument `computeWithdrawalStrategy.strategy[]` sum of `wTrad`. For the RR baseline scenario, assert all three totals agree within $10 absolute and 0.1% relative.
- [ ] T048 [P] Add FIRE-date propagation unit test to `tests/unit/bracketFill.test.js` (test #12, covering SC-012): run the baseline scenario with safetyMargin 5% and safetyMargin 10%; assert `yearsToFIRE` differs between the two configurations (proves bracket-fill propagates to the solver).
- [ ] T048a [P] Add pool-operation ordering unit test to `tests/unit/bracketFill.test.js` (test #13, covering the non-negotiable ordering invariant from [contracts/bracket-fill-algorithm.contract.md §Caller pool-operation ordering](./contracts/bracket-fill-algorithm.contract.md) and /speckit-analyze finding U1): construct a hand-built scenario where `mix.shortfall > 0` AND `mix.syntheticConversion > 0` both occur in the same retirement year. Assert that the resulting year-end `pStocks` value is identical (within floating-point tolerance) across all three primary consumers (`signedLifecycleEndBalance`, `projectFullLifecycle` pre-clamp, `computeWithdrawalStrategy` pre-clamp). This guards against re-introducing the feature-006-class bug where callers diverge on pool state.
- [ ] T049 Run the full test battery and confirm: `node --test "tests/unit/*.test.js"` passes ≥75 tests (65 baseline + ≥10 new); `node tests/baseline/browser-smoke.test.js` passes all smoke tests including the new DOM contracts.

### Quickstart walkthrough

- [ ] T050 Walk through `quickstart.md` Check 1 (baseline non-regression) on both dashboards; record pass/fail for each step.
- [ ] T051 Walk through Check 2 (tax reduction ≥25% vs baseline) and Check 2b (cross-surface consistency, 17 steps) on both dashboards; record.
- [ ] T052 Walk through Checks 3 through 7 (safety margin, SS integration, IRMAA, Rule of 55, Single-filer on Generic); record.
- [ ] T053 Walk through Checks 8 (DWZ re-target), 9 (60-second user readability), and 10 (performance sanity); record. Confirm SC-010 (Chart.js update count) by counting render function invocations per recalc.

---

## Phase 6: Polish & closeout

- [ ] T054 [P] Final parity audit: `git diff FIRE-Dashboard.html FIRE-Dashboard-Generic.html` — confirm only personal-content + filing-status + localStorage-namespace differences exist. Structural divergence is a Principle I violation; reconcile.
- [ ] T055 [P] Grep sanity checks:
  - `grep -c 'getTaxBrackets(true)' FIRE-Dashboard-Generic.html` → 0 (regression fix verified).
  - `grep -c 'getTaxBrackets(true)' FIRE-Dashboard.html` → 3 (RR keeps MFJ hardcoded per FR-067 — confirm exactly the 3 expected call sites).
  - `grep -c 'syntheticConversion' FIRE-Dashboard.html FIRE-Dashboard-Generic.html` → ≥5 each (3 primary consumer usages + algorithm + chart renderer).
  - `grep -c 'bracketHeadroom' FIRE-Dashboard.html FIRE-Dashboard-Generic.html` → ≥2 each.
- [ ] T056 [P] Update `FIRE-Dashboard-Roadmap.md` to mark feature 007 complete with a brief description and link to `specs/007-bracket-fill-tax-smoothing/spec.md`.
- [ ] T057 Write `specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md`: before/after lifetime tax numbers for the RR baseline scenario (per SC-001), age-73 Trad balance comparison (per SC-002), Single-filer Generic before/after numbers (per FR-069a), list of all surfaces verified in FR-063 audit, any follow-up items discovered (e.g., true Roth conversion feature as a future enhancement, state-tax modeling for high-tax-state users).
- [ ] T058 Final full-suite gate: run `node --test "tests/unit/*.test.js"` and `node tests/baseline/browser-smoke.test.js` one last time; both must be green. Open both HTML files manually and smoke-test Check 2b (cross-surface consistency) one final time. Ready for merge.

---

## Dependencies & execution order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1. MUST complete before any user-story work.
- **Phase 3 (US1)**: Depends on Phase 2. Can run in parallel with Phase 4 (US2) if staffed by two engineers — but Phase 4 builds on top of US1's chart-renderer updates (e.g., IRMAA line is a new dataset on the Lifetime Withdrawal Strategy chart that also got the bracket-fill-excess segment in US1 T021). In practice: US1 → US2 sequentially is simpler.
- **Phase 5 (Integration testing)**: Depends on Phase 3 + 4 complete.
- **Phase 6 (Polish)**: Depends on all previous phases.

### User-story independence

- **US1** is an MVP — shipping only US1 produces a functional bracket-fill algorithm with working algorithm-driven FIRE dates + all three primary charts. Transparency indicators are not yet visible, but the calc is correct.
- **US2** adds the trust-and-auditability layer. Without US1, US2 has nothing to reveal.

### Within each user story

- Algorithm rewrite (T013/T014) before caller updates (T015–T020).
- Caller updates before chart integration (T021–T028).
- Chart integration before chart annotations (US2).
- Unit tests can begin once the algorithm (T013/T014) is in place; they're parallel with caller/chart work.

### Parallel opportunities

- **Phase 2**: T004 + T005 + T006 parallel (three files). T008 + T009 parallel (two files). T010 + T011 parallel.
- **Phase 3 US1**: T013 + T014 parallel (two files, same function). T015 + T016 parallel. T017 + T018 parallel. T019 + T020 parallel. T021 + T022 parallel. T023 + T024 parallel. T025 + T026 parallel. T027 + T028 parallel. T030 parallel with anything else (test file).
- **Phase 4 US2**: T031 + T032 parallel. T033 + T034 parallel. T035 + T036 parallel. T037 + T038 parallel. T041 + T042 parallel. T045 parallel with anything.
- **Phase 5**: T046 + T047 + T048 parallel (three different test files / additions).
- **Phase 6**: T054 + T055 + T056 parallel.

### Cross-story dispatch (if two Frontend engineers)

Agent A (Frontend, US1): Phase 2 T008 → T013–T030 sequentially.
Agent B (Frontend, US2): Phase 2 T004+T005+T006+T010+T011+T012 parallel first, wait for Agent A to finish T013/T014, then T031–T045.
Agent C (QA): Phase 5 T046–T053 after Agents A+B land.
Manager: Phase 1 + T007 (regression fix, small and quick) + Phase 6 gating.

---

## Parallel examples

### Phase 2 Foundational — i18n + getInputs in parallel

```bash
Task: "T004 — Add feature-007 i18n keys to FIRE-Dashboard.html TRANSLATIONS dicts"
Task: "T005 — Add feature-007 i18n keys to FIRE-Dashboard-Generic.html TRANSLATIONS dicts"
Task: "T006 — Add feature-007 i18n keys to FIRE-Dashboard Translation Catalog.md"
Task: "T008 — Extend getInputs() in FIRE-Dashboard.html"
Task: "T009 — Extend getInputs() in FIRE-Dashboard-Generic.html"
```

### US1 algorithm + caller rewrite in parallel per file

```bash
Task: "T013 — Rewrite taxOptimizedWithdrawal in FIRE-Dashboard.html"
Task: "T014 — Rewrite taxOptimizedWithdrawal in FIRE-Dashboard-Generic.html"
# After T013+T014 complete:
Task: "T015 — Update signedLifecycleEndBalance in RR"
Task: "T016 — Update signedLifecycleEndBalance in Generic"
Task: "T017 — Update projectFullLifecycle in RR"
Task: "T018 — Update projectFullLifecycle in Generic"
Task: "T019 — Update computeWithdrawalStrategy in RR"
Task: "T020 — Update computeWithdrawalStrategy in Generic"
```

---

## Implementation strategy

### Incremental delivery (recommended — low risk)

1. Phase 1 Setup.
2. Phase 2 Foundational (blocks all).
3. Phase 3 US1 (MVP — ship algorithm + core chart integration).
4. **Checkpoint**: Run quickstart Check 2b on both dashboards. Safe/Exact/DWZ FIRE ages should change; lifetime tax should drop ≥25%; cross-surface consistency verified by eye. If checkpoint holds, US2 proceeds.
5. Phase 4 US2 (transparency).
6. Phase 5 Integration testing.
7. Phase 6 Polish.

### Parallel team strategy (two Frontend + one QA)

See "Cross-story dispatch" above.

---

## Notes

- Every RR/Generic pair marked `[P]` can be dispatched to two agents concurrently. A single agent can also run them sequentially — `[P]` marks parallel CAPABILITY, not requirement.
- Constitution Principle I lockstep: almost every US task has a matching RR and Generic counterpart. Only T007 (regression fix) and T012 (filing-status defaults helper) are Generic-only; that's documented.
- Personal-content divergence (Roger/Rebecca names, hardcoded MFJ in RR per FR-067) does not violate Principle I.
- No new runtime dependencies, no build step, no new libraries. Chart.js stays the only CDN.
- Feature-006 invariants (`_lastLifecycleDataset` shared cache, sidebar mirror, chartState.onChange pipeline) stay intact and inherit bracket-fill via the three primary consumers.
- Failure of T003 (baseline tests) blocks the feature. Failure of T049 or T058 (final gates) blocks merge.
