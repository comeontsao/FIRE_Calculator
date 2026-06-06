# Tasks: Math-Assumptions Cleanup

**Input**: Design documents from `specs/033-math-assumptions-cleanup/`
**Prerequisites**: plan.md, spec.md, research.md (R1/R2 inventories, D1–D8), data-model.md, contracts/assumptions.contract.md, quickstart.md

**Tests**: INCLUDED — Constitution IV (gold-standard fixtures move in the same change set) and the calc-contract field-semantics lesson (test audit BEFORE flipping math) make them mandatory for this feature.

**Organization**: by user story. US1 (cash dial) is the MVP; US2 (funding ladder) and US3 (Fisher) are independently testable increments. Stories run **sequentially** (they share files and the fixture corpus; per-story fixture updates keep each story's FIRE-age delta attributable — plan Phase 2 note).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: baseline capture + the shared assumptions module (everything later consumes it)

- [ ] T001 Write `tools/fireage-delta-probe.mjs` (pattern: `tools/bug1-repro-probe.mjs`) reading `fireAgeResolution.displayedFireAge`, signed end balance, and winner per FIRE mode (safe/exact/dieWithZero) on RR live defaults; run it on the CURRENT commit and save output to `specs/033-math-assumptions-cleanup/baseline-before.json` — MUST land before any math flips (FR-012, research D8)
- [ ] T002 Create `calc/assumptions.js` per `contracts/assumptions.contract.md`: `CASH_REAL_RETURN = 0.0` with load-time bounds throw, `realRate(nominal, inflation)`, full Inputs/Outputs/Consumers header, UMD tail with UNIQUE lexical name `_assumptionsApi`, globals `CASH_REAL_RETURN` + `realRate`
- [ ] T003 [P] Create `tests/unit/mathAssumptions.test.js` — module unit cases: `realRate(x,0)===x`, `realRate(x,x)===0`, `realRate(0.07,0.04)≈0.0288462`, bounds-throw on bad constant, N-year constant-cash identity at 0.0 (static guards arrive in T011/T023)
- [ ] T004 Add `<script src="calc/assumptions.js"></script>` as the FIRST calc tag (before `calcAudit.js`) in BOTH `FIRE-Dashboard.html` (~line 10) and `FIRE-Dashboard-Generic.html` (~line 15); verify with `npm run test:unit` (globalScopeCollision guard auto-covers the new file) + `node tools/console-probe.mjs` on both files (errorCount 0, globals present)

**Checkpoint**: module loads in both dashboards, zero console errors, baseline-before.json committed.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the two process-lesson audits that gate every story's edits

- [ ] T005 Caller-audit (CLAUDE.md lesson): grep BOTH HTML files + `calc/` + `tests/` for every consumer of `stockContribution`, `cashFlowToCash`, `cashFlowWarning`, `returnRateCashReal`; reconcile against research D6's known-consumer table; record final counts + any newly found consumer in the T005 commit message (expand scope if a consumer falls outside spec FRs)
- [ ] T006 Test-impact catalog (field-semantics lesson): run `npm run test:unit` + `npm run test:e2e` green on the feature branch BEFORE any math change; list every test/fixture file holding absolute projection expectations (research D7 map as the seed) into `specs/033-math-assumptions-cleanup/test-impact.md` with a per-file "expected to move in US1/US2/US3" tag

**Checkpoint**: full suites green pre-change; impact catalog committed.

---

## Phase 3: User Story 1 — One honest cash-growth dial (P1) 🎯 MVP

**Goal**: every simulator's cash growth consumes `CASH_REAL_RETURN` (0.0); no hardcoded multiplier survives anywhere.

**Independent Test**: flip the constant's value locally → every cash trajectory shifts consistently; static guard proves single-source; with 0.0 an undisturbed $80K cash pool stays $80K of purchasing power across the horizon.

- [ ] T007 [P] [US1] Replace the 9 cash-growth sites in `FIRE-Dashboard.html` (R1 anchors: 9088, 9385, 9493, 10117 scaled-form, 10990, 11065, 12285, 12824, 12932) with `(1 + CASH_REAL_RETURN)` / `(1 + CASH_REAL_RETURN * scale)`; update the comment at 9190 and any adjacent `// FRAME:` wording
- [ ] T008 [P] [US1] Same replacement in `FIRE-Dashboard-Generic.html` (R1 anchors: 9402, 9673, 9783, 10395 scaled-form, 11252, 11325, 12572, 13119, 13228; comment 9494) — lockstep with T007
- [ ] T009 [P] [US1] `calc/accumulateToFire.js`: site :782 consumes the constant (require-or-global resolution per contract §4 — assumptions.js loads FIRST so eval-time capture is safe); CORRECT the frame-mislabeled comment at :779-781 ("0.5%/yr nominal (FR-016 — hardcoded, locked)" → today's-$ frame + supersession pointer to `contracts/assumptions.contract.md`); update the module header at :95
- [ ] T010 [P] [US1] `calc/getCanonicalInputs.js`: `returnRateCashReal` (:239) consumes `CASH_REAL_RETURN` instead of literal 0.005; update comments :25/:238 so Node-side canonical inputs can never drift from the browser
- [ ] T011 [US1] Static guard (a) in `tests/unit/mathAssumptions.test.js`: scan both HTML files + every browser-loaded calc module for hardcoded cash-growth multipliers (`*= 1.005`-class, `(1 + 0.005 * scale)`-class) outside `calc/assumptions.js`; exclusion rules per research R1 false-positive ledger (CSS `letter-spacing`, `isTie`/`SAFE_TIE_FRACTION` thresholds, scenario constants) — guard must PASS now and FAIL if any site regresses
- [ ] T012 [US1] Fixture/test sweep for the cash-0% delta: update every file tagged US1 in `test-impact.md` (expect `tests/fixtures/*.js`, `tests/unit/accumulateToFire.test.js`, `tests/unit/calcAudit.test.js`, others per catalog) with per-change delta notes; verify `tests/e2e/cash-sweep-toggle.spec.ts` OFF-case still passes (peak cash = exactly $80K ≥ $75K) and ON-case unchanged
- [ ] T013 [US1] Copy sweep: grep `TRANSLATIONS` dicts in both HTML files + `FIRE-Dashboard Translation Catalog.md` for "0.5%"/cash-growth prose; update any tooltip naming the old assumption (EN + zh-TW pairs, Principle VII)

**Checkpoint**: `npm run test:unit` green; `node tools/smoke-032.mjs` 15/15; cash series flat in purchasing-power terms on an undisturbed pool. US1 alone is shippable.

---

## Phase 4: User Story 2 — Honest funding of late-accumulation shortfalls (P2)

**Goal**: negative residuals funded by the ladder (cut contribution → cash → brokerage); conservation residual ≈ $0.

**Independent Test**: engineer a shortfall year (raises 2.5% < inflation 4%) → every contributed dollar traces to income, a recorded reduction, or a recorded draw; audit conservation block ≈ $0.

- [ ] T014 [US2] Failing-first unit tests in `tests/unit/accumulateToFire.test.js`: ladder cases (reduction-only; reduction+cash; reduction+cash+stocks; unfunded remainder keeps `NEGATIVE_RESIDUAL`; funded year carries `CONTRIBUTION_REDUCED`; override-ON bypasses ladder entirely; surplus year rows byte-identical to v6) + invariants I1–I6 from data-model §2
- [ ] T015 [US2] Implement the funding ladder in `calc/accumulateToFire.js` (replace the floor at ~:689 per research D3 pseudocode); add v7 sibling row fields `stockContributionActual` / `fundedFromCash` / `fundedFromStocks` (`stockContribution` KEEPS planned semantics); apply pool draws; update the module's v-doc header + Outputs contract
- [ ] T016 [US2] Conservation block v4 in BOTH HTML files (RR ~:20540 area + Generic mirror): `stockSum` sums `stockContributionActual`, add `stockPlannedSum`/`fundedFromCashSum`/`fundedFromStocksSum`/`unfundedSum`, extend `residual` formula per data-model §3; extend copy-debug `lifecycleProjection.rows` export with the v7 fields
- [ ] T017 [US2] Display wiring in BOTH HTML files: audit per-year table renders `CONTRIBUTION_REDUCED` as informational (distinct from the red `NEGATIVE_RESIDUAL` ⚠️, anchors RR ~:19358); `pviCashflowWarning` callout (RR ~:16523) keys on `NEGATIVE_RESIDUAL` only — verify unchanged; add the Accumulation stage `subSteps` entry "shortfall funding ladder (cut stock contribution → draw cash → draw brokerage)" (Principle II.4)
- [ ] T018 [P] [US2] i18n: add `audit.flag.contributionReduced` + `audit.tip.fundingLadder` EN + zh-TW pairs (data-model §5) to `TRANSLATIONS` in BOTH HTML files AND `FIRE-Dashboard Translation Catalog.md`
- [ ] T019 [US2] Conservation verification sweep: update US2-tagged expectations in `test-impact.md` files (`tests/unit/calcAudit.test.js` conservation fixtures first); add an assertion that RR-live-defaults aggregate residual ≤ $100 and per-year residual ≤ $1 on non-flagged years (SC-001); run the validation-audit persona harness (`tests/unit/validation-audit/`) — zero new persona regressions

**Checkpoint**: conservation residual ≈ $0 on RR defaults; shortfall years display the informational flag bilingually; unit suite green.

---

## Phase 5: User Story 3 — Mathematically correct real returns (P3)

**Goal**: every real-rate derivation routes through `realRate()`; no subtraction form survives in simulator code.

**Independent Test**: growth 7% / inflation 4% → derived real rate 2.885%; SS-COLA at default → exactly 0 (byte-identical); static guard proves no remaining subtraction sites.

- [ ] T020 [P] [US3] Route the 28 `FIRE-Dashboard.html` sites (R2 anchors: 8890 … 17755, incl. the 6 SS-COLA † forms → `realRate(ssCOLARate ?? inflationRate, inflationRate)`) through `realRate()`; update adjacent `// FRAME:` comments from "(nominal − inflation)" to "(Fisher)"
- [ ] T021 [P] [US3] Same for the 28 `FIRE-Dashboard-Generic.html` sites (R2 anchors: 9204 … 17969) — lockstep with T020
- [ ] T022 [P] [US3] Calc-module sites: `calc/accumulateToFire.js` :427/:429 (real returns) and :665 (income growth → `Math.pow(1 + realRate(raiseRate, inflationRate), years)`); `calc/getCanonicalInputs.js` :237; comment-only updates in `calc/displayConverter.js`:52 + `calc/payoffVsInvest.js`:169
- [ ] T023 [US3] Static guard (b) in `tests/unit/mathAssumptions.test.js`: zero subtraction-form real-rate derivations (`- inp.inflationRate` / `- inflationRate` in rate expressions) in both HTML files + calc simulators; update `tests/meta/frame-coverage.test.js` regexes if they pin the "(nominal − inflation)" wording
- [ ] T024 [US3] Fixture/test sweep for the Fisher delta: update US3-tagged files in `test-impact.md`; explicitly verify the review gates — `tests/unit/strategyMatrix.test.js` starvation locus still closes shortfall < $100 (gate 6), `tests/unit/spendingFloorPass.test.js` green (gate 6), `tests/unit/modeObjectiveOrthogonality.test.js` green (gate 7)

**Checkpoint**: unit suite green incl. both static guards and review gates 6–7.

---

## Phase 6: Polish & merge gate

- [ ] T025 Run `tools/fireage-delta-probe.mjs` on the feature head; write `specs/033-math-assumptions-cleanup/CLOSEOUT.md` with the before/after table per FIRE mode (FIRE age, end balance, winner) from `baseline-before.json` vs the new output, attributing the delta per story (FR-012 / SC-004); sanity: movement is later/lower — anything else is a bug, STOP
- [ ] T026 Full merge gate per `specs/033-math-assumptions-cleanup/quickstart.md`: `npm run test:unit`, `npm run test:e2e` (FULL suite), `node tools/console-probe.mjs` ×2, `node tools/smoke-032.mjs`, `node tools/bug1-repro-probe.mjs` (zero non-expected warnings ×3 modes), lockstep verify (calc-layer edits byte-equivalent between HTML files), eyeball checks §3/§4/§6
- [ ] T027 [P] Update `FIRE-Dashboard-Roadmap.md` (033 complete) and add a BACKLOG entry for the deferred LTCG gross-up on the `fundedFromStocks` rung (research D4) + the deferred user-facing cash-return input (spec Assumptions)

---

## Dependencies & execution order

```
Phase 1 (T001→T002→{T003,T004})
  → Phase 2 (T005, T006 — parallel)
    → Phase 3 US1 ({T007,T008,T009,T010} parallel → T011 → T012 → T013)
      → Phase 4 US2 (T014 → T015 → T016 → {T017,T018} → T019)
        → Phase 5 US3 ({T020,T021,T022} parallel → T023 → T024)
          → Phase 6 (T025 → T026 → T027)
```

- T001 MUST precede every math edit (baseline capture).
- Stories are sequential by design (shared files + per-story fixture attribution); WITHIN each story the per-surface edits (RR / Generic / calc) are parallelizable by different engineers under the lockstep ownership table.
- T014 precedes T015 (failing-first, tdd lesson); T011/T023 land AFTER their story's replacements so the guards pass at introduction.

## Parallel execution examples

- **US1**: dispatch Frontend (T007+T008, both HTML files), Backend (T009+T010, calc modules) concurrently; QA takes T011+T012 after both report.
- **US3**: same split — T020+T021 (Frontend, HTML), T022 (Backend, calc) — then T023/T024 (QA).
- **US2** is mostly sequential (one module, one ladder), with T018 (i18n) parallel to T017.

## Implementation strategy

**MVP** = Phase 1–3 (US1). Ship-worthy alone: single-source cash dial at the honest default, static guard, fixtures updated, FIRE-age delta from the cash change measurable via the probe. US2 then fixes conservation; US3 completes the correction wave. Each story ends at a green-suite checkpoint so the feature can pause/merge at any story boundary if needed.
