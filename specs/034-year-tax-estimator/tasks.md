---
description: "Task list for feature 034 — Year Tax Estimator"
---

# Tasks: Year Tax Estimator

**Input**: Design documents from `specs/034-year-tax-estimator/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/taxEstimator.contract.md

**Tests**: INCLUDED — the spec explicitly requests unit tests (stacking edge cases) and E2E
(render / year-pick / edit-then-reset), and Constitution IV + VIII mandate gold-standard
regression coverage. TDD ordering applies: write tests, see them fail, then implement.

**Scope reminder**: UI + renderer land in **`FIRE-Dashboard.html` (RR) only**. The pure
module `calc/taxEstimator.js` loads in **both** HTML files (calc-layer lockstep); Generic
gets the `<script>` tag + a divergence comment, no UI. Every new user-visible string needs
EN + zh-TW (Constitution VII). User-facing copy uses "dollars / gains / tax owed", never
"real $" (FR-022).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files / no incomplete dependency)
- **[Story]**: US1–US4 (user-story phases only)

---

## Phase 1: Setup

**Purpose**: groundwork that unblocks the foundational module.

- [ ] T001 [P] Audit the displayed-strategy per-year row shape to confirm exact field names for Traditional draw and taxable-sale gain (research D3 open item); read `calc/withdrawal.js` (~lines 230–305), `calc/strategyRanker.js`, and `renderRothLadder` (`FIRE-Dashboard.html` ~14763–14910); record the confirmed real-$ field → estimator-input mapping in `specs/034-year-tax-estimator/data-model.md` §AutoPullRow.
- [ ] T002 [P] Add a feature 034 entry (goal + RR-only scope + status) to `FIRE-Dashboard-Roadmap.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: every user story depends on the calc module + the block skeleton + the
auto-pull plumbing. No US phase can start until this phase is complete.

- [ ] T003 [US-none] Write `tests/unit/taxEstimator.test.js` FIRST (RED): the 7 edge-case fixtures + 9 behavioral guarantees from `contracts/taxEstimator.contract.md` (gain fully in 0%, straddle 0%→15%, ordinary eats all 0% room, NIIT trigger, IRMAA trigger, std-ded flooring, 20% layer; layer-sum identities; all-zero ⇒ no-NaN; purity/freeze). Consume the CommonJS export. Run and confirm it FAILS (module absent).
- [ ] T004 Create `calc/taxEstimator.js` — pure UMD classic-script module implementing `estimateYearTax(params) → EstimatorOutput` per the contract: ordinary marginal brackets, LTCG-on-ordinary stacking (0%/15%/20%), `signals` (roomLeftAt0, irmaa, niit with caller-supplied fixed threshold), `marginal` (next ordinary/LTCG rate), and structured `steps[]` descriptors `{key,args}` (NO `t()` calls — language-neutral). Fenced Inputs/Outputs/Consumers header + `FRAME: nominal-$` annotation. UMD footer: unique const `_taxEstimatorApi`, `module.exports`, `globalThis.estimateYearTax`. Run T003 → GREEN.
- [ ] T005 Extend `tests/unit/globalScopeCollision.test.js` to statically guard `calc/taxEstimator.js` (unique global `estimateYearTax`, unique UMD const `_taxEstimatorApi`, no top-level `export`).
- [ ] T006 Wire `<script src="calc/taxEstimator.js"></script>` into BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` next to the other `calc/*.js` script tags (lockstep). In `FIRE-Dashboard-Generic.html`, add an HTML comment at the equivalent Withdrawal Strategy tab location documenting the intentional Principle-I UI divergence (module loaded, no estimator UI).
- [ ] T007 Add the Year Tax Estimator block skeleton at the bottom of the Withdrawal Strategy tab in `FIRE-Dashboard.html` (after the `strategyComparePanel`, ~line 4101, inside the withdrawal pill-host): section title, a persistent "local what-if — does NOT sync with the Lifecycle chart or plan" caption, a year-picker `<select>`, a Reset button, and empty containers for the two breakdown cards + signal chips. z-index/sticky N/A (in-scroll body).
- [ ] T008 Add the NEW "0% capital-gains ceiling" `<input>` to the block (default ~$96,700 MFJ 2026) and identify the existing tab inputs to reuse (standard deduction `twStdDed`, ordinary bracket tops `twTop12`/`twTop22`, `irmaaThreshold`, `stockGainPct`). Add a small inflation helper hook that reads the dashboard's existing inflation rate + base year (same source `calc/inflation.js` uses) for threshold inflation.
- [ ] T009 Implement `renderYearTaxEstimator()` plumbing in `FIRE-Dashboard.html`: (a) populate the year picker with retirement years (effective FIRE year → plan-age year); (b) auto-pull adapter that reads the displayed strategy's per-year row (per T001 mapping) and converts real-$ → nominal-$ at the selected year via `inflation.js toNominal`; (c) inflate indexed thresholds to the selected year, hold NIIT fixed at $250k; (d) call `estimateYearTax` and stash the result; (e) graceful zero/neutral state when no projection is available (FR-023). Renderer comment declares it consumes `calc/taxEstimator.js` + `calc/inflation.js` (Constitution VI). Hook `renderYearTaxEstimator` into the existing recalc/tab-render path WITHOUT any write-back to plan state.
- [ ] T010 [P] Add base i18n keys (EN + zh-TW) for the block title, the no-sync caption, the 6 input labels, the year-picker label, and the Reset button to `TRANSLATIONS.en`/`TRANSLATIONS.zh` in `FIRE-Dashboard.html`; mirror in `FIRE-Dashboard Translation Catalog.md`.

**Checkpoint**: module proven by unit tests; block renders with auto-pulled numbers; nothing surfaced yet beyond raw plumbing.

---

## Phase 3: User Story 1 - Room left at 0% capital gains (Priority: P1) 🎯 MVP

**Goal**: the headline number the user acts on — how much more long-term gain can be realized
this year at 0% federal tax, in the selected year's dollars.

**Independent Test**: pick a year; confirm the headline equals `max(0, 0%ceiling − ordinaryTaxable − gains)`; increasing Roth conversion / Traditional withdrawal shrinks it to $0.

- [ ] T011 [P] [US1] Add a targeted unit assertion block in `tests/unit/taxEstimator.test.js` for `signals.roomLeftAt0` across the three US1 acceptance scenarios (positive room, zero room when ordinary ≥ ceiling, room shrinks as ordinary rises).
- [ ] T012 [US1] Render the "Room left at 0% capital gains" headline chip from `output.signals.roomLeftAt0` (nominal, selected year) in `renderYearTaxEstimator()` (`FIRE-Dashboard.html`); make it the visually-dominant element of the signals row.
- [ ] T013 [P] [US1] Add EN + zh-TW i18n keys for the headline label + its plain-English tooltip ("how much more in long-term gains you can still sell this year at 0% federal tax"); update the Translation Catalog.

**Checkpoint**: MVP — a user can read the 0%-LTCG room for any year. Stop-and-validate point.

---

## Phase 4: User Story 2 - Show-your-work breakdowns (Priority: P1)

**Goal**: two transparent breakdown cards so the user can see exactly how ordinary tax and
LTCG tax (with stacking) were computed.

**Independent Test**: for a hand-computed year, every layer line shows range/dollars/rate/tax
and the layers sum to the displayed totals; a straddling gain shows 0% + 15% slices.

- [ ] T014 [US2] Render the ordinary income tax card from `output.ordinary` (gross → minus standard deduction → taxable → one row per non-empty bracket layer with range, dollars-in-layer, rate, layer tax → total) in `FIRE-Dashboard.html`.
- [ ] T015 [US2] Render the LTCG tax card from `output.ltcg` (show how ordinary taxable income consumes the 0% ceiling, then the 0% / 15% / 20% layers each with dollars + tax → total) in `FIRE-Dashboard.html`.
- [ ] T016 [US2] Resolve `output.steps[]` descriptors via `t(key, ...args)` so the show-your-work text is bilingual and flips with the language toggle; render into the cards.
- [ ] T017 [P] [US2] Add EN + zh-TW i18n keys for the two card headings and every `steps[]` template (`te.step.*`) referenced by the module; update the Translation Catalog.

**Checkpoint**: US1 + US2 — headline + full transparent arithmetic, read-only.

---

## Phase 5: User Story 3 - Year picker + safe what-if editing (Priority: P2)

**Goal**: edit any input to explore, reset to the projection, switch years freely — with an
ironclad guarantee that none of it touches the Lifecycle chart or plan.

**Independent Test**: edit an input → only the estimator changes; Reset → auto-pulled values
return; switch year → repopulates; Lifecycle chart + lifetime-tax unchanged throughout.

- [ ] T018 [US3] Make all six inputs editable and wire `onchange`/`oninput` to re-run `estimateYearTax` + repaint ONLY the estimator (must NOT call `recalcAll`, `renderGrowthChart`, the strategy ranker, or write any shared/`localStorage` state) in `FIRE-Dashboard.html`.
- [ ] T019 [US3] Implement the Reset button to re-run the auto-pull adapter for the currently selected year and re-seed every input, then repaint (`FIRE-Dashboard.html`).
- [ ] T020 [US3] Wire the year-picker `change` to re-pull + re-inflate + repaint for the newly selected year (`FIRE-Dashboard.html`).
- [ ] T021 [P] [US3] Write the E2E spec `tests/e2e/year-tax-estimator.spec.*` (match the project's Playwright layout): block renders on the Withdrawal Strategy tab; year-pick repopulates inputs; edit-then-Reset round-trips; and — critically (SC-004) — capture the Lifecycle end-balance/lifetime-tax KPI, perform a sequence of estimator edits, and assert the KPI is unchanged.
- [ ] T022 [P] [US3] Add EN + zh-TW i18n keys for the Reset button and any edit-mode helper text; update the Translation Catalog.

**Checkpoint**: full interactive what-if across all years, provably isolated from the plan.

---

## Phase 6: User Story 4 - Tooltips + secondary-trap signals (Priority: P2)

**Goal**: plain-English hover help on every term, plus marginal next-dollar rates and the
IRMAA / NIIT warning chips (NIIT threshold fixed at $250k with a "not inflation-indexed" tip).

**Independent Test**: every term exposes a working tooltip; marginal chips show correct
ordinary + LTCG next-dollar rates; IRMAA/NIIT chips appear only when their thresholds cross.

- [ ] T023 [US4] Render the marginal next-dollar chips (ordinary + LTCG) from `output.marginal`, with a tooltip warning that adding ordinary income shrinks the 0% room and can flip gains from 0% to 15% (`FIRE-Dashboard.html`).
- [ ] T024 [US4] Render the IRMAA Tier 1 warning chip conditionally from `output.signals.irmaa.crossed` (`FIRE-Dashboard.html`).
- [ ] T025 [US4] Render the NIIT 3.8% warning chip + amount conditionally from `output.signals.niit` (fixed $250k threshold), with a tooltip explaining it is NOT inflation-indexed so later years trigger it more easily (`FIRE-Dashboard.html`).
- [ ] T026 [US4] Add `info-tip`/`ⓘ` icons + plain-English explanations to every label and signal in the block (standard deduction, 0% LTCG ceiling, ordinary vs LTCG, marginal, IRMAA, NIIT, room-left) using the existing `info-tip`/`data-tip` pattern.
- [ ] T027 [P] [US4] Add EN + zh-TW i18n keys for all tooltips + the three signal chips; update the Translation Catalog.

**Checkpoint**: all four stories live; the block teaches as well as calculates.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Run the full unit suite (`npm test`) — all green including `taxEstimator.test.js` and `globalScopeCollision.test.js`.
- [ ] T029 [P] Run the FULL Playwright E2E suite (`npm run test:e2e`) — green (not just the new spec; CLAUDE.md gate).
- [ ] T030 Browser smoke on `FIRE-Dashboard.html` via `file://` AND `python -m http.server`: walk the 9 quickstart steps (cold-load numerics, year-pick, edit, reset, no-write-back, tooltips, language flip, zero console errors). Run `node tools/console-probe.mjs` on both HTML files.
- [ ] T031 [P] Generic regression: confirm `FIRE-Dashboard-Generic.html` loads `calc/taxEstimator.js` without error, shows NO estimator UI, and carries the divergence comment.
- [ ] T032 Constitution VII + terminology audit: grep every new string for EN+zh parity (`FIRE-Dashboard.html` TRANSLATIONS + Catalog) and confirm no "real $"/"real money" in any user-facing copy.
- [ ] T033 [P] Finalize Chart↔Module annotations: `calc/taxEstimator.js` `Consumers:` lists `renderYearTaxEstimator`; renderer comment lists the module; verify `data-model.md` §AutoPullRow matches the T001 audit.
- [ ] T034 Update the `CLAUDE.md` SPECKIT ledger (status → implemented/awaiting smoke) and do a final Translation Catalog sync.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: T001, T002 — start immediately; T001 BLOCKS T009 (auto-pull mapping).
- **Foundational (P2)**: T003→T004 (TDD), then T005, T006, T007, T008, T009 (needs T001+T004), T010. BLOCKS all user stories.
- **US1 (P3)**, **US2 (P4)**, **US3 (P5)**, **US4 (P6)**: all require Foundational complete. They touch overlapping regions of `renderYearTaxEstimator()`/the block, so within a single dev they run in priority order; across devs, US1/US2 (read-only render) are the most separable, US3 (interaction) and US4 (chips/tooltips) can follow.
- **Polish (P7)**: after all desired stories.

### Critical path

T001 → T003 → T004 → T009 → T012 (US1 MVP) → … → T030 (smoke) → T034.

### Within each story

- Tests before/with implementation (T003 before T004; T011 alongside T012; T021 is the US3 E2E).
- Render plumbing (foundational) before story-specific surfacing.

### Parallel opportunities

- **Setup**: T001 ∥ T002.
- **Foundational**: T005 ∥ T010 (after T004); T006 can run alongside T007/T008 (different file regions, but all touch HTML — serialize HTML edits per file to avoid churn).
- **i18n tasks** (T013, T017, T022, T027) are `[P]` within their story — catalog + TRANSLATIONS additions are additive.
- **Polish**: T028 ∥ T029 ∥ T031 ∥ T033.

---

## Parallel Example: Foundational

```text
# After T004 (module) is green:
Task T005: extend globalScopeCollision.test.js
Task T010: add base i18n keys (EN+zh)
# (T006–T009 edit FIRE-Dashboard.html — keep HTML edits serial to avoid conflicts.)
```

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 (room-left headline) →
**STOP & validate**: the user can read "how much more can I sell at 0%?" for any year.

### Incremental delivery

US1 (headline) → US2 (breakdowns) → US3 (edit/reset/no-write-back) → US4 (tooltips + IRMAA/NIIT/marginal),
each an independently testable increment on the shared foundation. Polish + full-suite + browser
smoke gate the merge.

---

## Notes

- `[P]` = different files / no incomplete dependency. HTML edits to the same file are NOT
  parallel-safe even when conceptually independent — serialize them.
- Every story phase adds value without breaking the previous (read-only render → interaction → teaching).
- Constitution gates that MUST be green before merge: full unit suite, FULL Playwright suite,
  `globalScopeCollision`, EN+zh parity, RR browser smoke (file:// + http), Generic regression.
- No CSV column, no `localStorage` key, no new dependency — keep it that way.
