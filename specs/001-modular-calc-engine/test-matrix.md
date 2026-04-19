# Test Matrix — Modular Calc Engine (`001-modular-calc-engine`)

**Feature**: `001-modular-calc-engine`
**Author**: QA Engineer
**Date**: 2026-04-19
**Status**: Draft 1 — authoritative test plan for the feature
**Purpose**: Single document an implementer or reviewer can use as a checklist. Every FR-### and SC-### from `spec.md` and every task ID from `tasks.md` Phases 3–6 is cross-referenced in at least one row. All 10 calc modules listed in `plan.md → Project Structure` are covered.

Cross-refs: [spec.md](./spec.md) · [plan.md](./plan.md) · [data-model.md](./data-model.md) · [research.md](./research.md) · [tasks.md](./tasks.md) · [contracts/](./contracts/)

---

## Legend

| Symbol / Term | Meaning |
|---|---|
| FR-### | Functional requirement from `spec.md §Functional Requirements` |
| SC-### | Success criterion from `spec.md §Success Criteria` |
| TXXX | Task ID from `tasks.md` |
| US1..US4 | User stories (priorities P1–P4) |
| RR | `FIRE-Dashboard.html` (Roger & Rebecca personalized) |
| GEN | `FIRE-Dashboard-Generic.html` (public generic) |
| byte-identical | `===` equality on numbers, with tolerance ONLY where fixtures explicitly declare it |
| divergent (parity) | Field intentionally allowed to differ between RR and GEN per fixture's `divergent` list |
| MVP | User Story 1 — delivers the drag-propagation fix by itself |

---

## Section 1 — Unit test matrix

For every calc module in `plan.md → Project Structure`. Every fixture named in each contract's "Fixtures that lock this module" section appears below. Columns: **Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID**.

### 1.1 `calc/inflation.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| inflation | `fixtures/inflation.js → identity` | `toReal` and `toNominal` at `year === baseYear` | identity at base year | FR-017 | T005, T012, T013 |
| inflation | `fixtures/inflation.js → roundTrip` | 5 random year/amount pairs run through `toNominal(toReal(x))` | `toNominal(toReal(x, y), y) === x` within float tolerance | FR-017 | T005, T012, T013 |
| inflation | `fixtures/inflation.js → threePercentTenYear` | 3 % inflation, 10-year horizon | Known real/nominal relationship locked | FR-017, SC-003 | T005, T012, T013 |

### 1.2 `calc/chartState.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| chartState | Scenario 1 — subscribe → `setCalculated(50, true)` | `onChange` dispatch, `setCalculated` initial path | Listener fires once; `{effective:50, source:'calculated'}` | FR-001, FR-002 | T017, T018 |
| chartState | Scenario 2 — `setOverride(45)` | `setOverride` path | Listener fires once; `{effective:45, source:'override'}` | FR-001, FR-014, FR-018 | T017, T018 |
| chartState | Scenario 3 — `setOverride(45)` then `setCalculated(51, true)` | Override-wipe inside `setCalculated` | Override wiped atomically; listener sees `{effective:51, source:'calculated'}` | FR-014, SC-009 | T017, T018, T023 |
| chartState | Scenario 4 — `setOverride(45)` then `clearOverride()` | `clearOverride` path | `{effective:calculated, source:'calculated'}` | FR-003 | T017, T018, T027 |
| chartState | Scenario 5 — unsubscribe returned from `onChange` | Unsubscribe closure | Detached listener does NOT fire | FR-001 | T017, T018 |
| chartState | Scenario 6 — `setOverride(45)` then `revalidateFeasibilityAt(45, false)` | Mode-switch path | Override preserved; only `feasible` updates | FR-015 | T017, T018, T023b |
| chartState | Scenario 7 — atomic transitions (two consecutive mutations same tick) | Notification ordering | Exactly two notifications, each with consistent state snapshot | SC-009 | T017, T018 |

### 1.3 `calc/lifecycle.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| lifecycle | `fixtures/accumulation-only.js` | Accumulation-only simulation from age 30 to endAge | Monotonic growth; `feasible:true` every year; balance checkpoints at 35/45/55 within ±1 % | FR-005, FR-008, SC-003 | T006, T038, T046 |
| lifecycle | `fixtures/three-phase-retirement.js` | Accumulation → preUnlock → unlocked → ssActive transitions | Balance checkpoints at 55, 62, 85; phase sequence integrity; `totalReal === sum(pools)` every year | FR-005, FR-008, FR-017 | T007, T038, T046 |
| lifecycle | `fixtures/infeasible.js` | Pool exhaustion during withdrawal phase | Year with negative pool flagged `feasible:false`; `deficitReal` set; no silent absorption into `pStocks` | FR-004, FR-013, FR-008 | T009, T038, T046 |
| lifecycle | real-nominal-check (inline in `tests/unit/lifecycle.test.js`) | Nominal healthcare delta passes through `inflation.toReal` before subtraction | Real-dollar output asserted; nominal value must NOT leak in | FR-017 | T038, T046, T051 |

### 1.4 `calc/fireCalculator.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| fireCalculator | `fixtures/three-phase-retirement.js` (single) | Binary search over lifecycle feasibility | `yearsToFire:8`, `fireAge:53`, `feasible:true`; `currentAge + yearsToFire === fireAge` | FR-005, FR-008 | T007, T039, T047 |
| fireCalculator | canonical couple (part of `rr-generic-parity.js`) | Two-person portfolio solver | Secondary person's portfolio materially changes `yearsToFire`; SC-005 guarantor | FR-010, SC-005 | T010, T039, T047, T055, T059 |
| fireCalculator | `fixtures/coast-fire.js` | Early-exit path: already coast-feasible | `yearsToFire:0`, portfolio untouched to endAge | FR-005, FR-008 | T008, T039, T047 |
| fireCalculator | `fixtures/infeasible.js` | No feasible age found within `endAge` | `feasible:false`, `fireAge === endAge`, warning flag set | FR-004, FR-008 | T009, T039, T047 |
| fireCalculator | `fixtures/mode-switch-matrix.js` — `solverMode:'safe'` | Buffers-applied feasibility path | `fireAge_safe >= fireAge_exact >= fireAge_dwz` invariant row 1 | FR-005 (solverMode), FR-015 | T011, T039, T047 |
| fireCalculator | `fixtures/mode-switch-matrix.js` — `solverMode:'exact'` | Plain `endBalance >= 0` feasibility | Invariant row 2 | FR-005 (solverMode), FR-015 | T011, T039, T047 |
| fireCalculator | `fixtures/mode-switch-matrix.js` — `solverMode:'dieWithZero'` | `endBalance ≈ 0` optimization within tolerance | Invariant row 3 | FR-005 (solverMode), FR-015 | T011, T039, T047 |

### 1.5 `calc/withdrawal.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| withdrawal | three-phase canonical (inline fixture) | `preUnlock` / `unlocked` / `ssActive` draw splits | Sum-of-draws invariant; `netSpendReal === annualSpendReal` when feasible | FR-005 | T037, T045 |
| withdrawal | RMD-active (age ≥ 73, Trad > 0) | RMD enforcement path | Minimum distribution drawn from Trad even if strategy would prefer other pools | FR-005 | T037, T045 |
| withdrawal | infeasibility (tiny pools, large spend) | Typed shortfall return | `feasible:false`; `deficitReal > 0`; no silent absorption into any pool | FR-013, FR-004 | T037, T045 |

### 1.6 `calc/tax.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| tax | bracket-boundary (income at threshold) | Marginal bracket arithmetic | Combined marginal amount equals expected; `totalOwedReal === ordinaryOwedReal + ltcgOwedReal` | FR-005 | T032, T040 |
| tax | LTCG 0 % bracket | LTCG path, zero-tax branch | LTCG within 0 % bracket → zero LTCG tax | FR-005 | T032, T040 |
| tax | empty case (all zeros) | Early-return / zero-guard | All outputs zero; `effectiveRate:0` | FR-005 | T032, T040 |

### 1.7 `calc/socialSecurity.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| socialSecurity | generic curve (single earner, claim 67) | Generic mode | Benefit locked; current SSA claim-age curve honored | FR-005 | T033, T041 |
| socialSecurity | actual-earnings 35-year synthetic | Actual-earnings mode with 2026 bend points | `indexedEarnings` and `annualBenefitReal` locked | FR-009, FR-017 | T033, T041 |
| socialSecurity | claim at 62 | Early-claim reduction path | Expected percent reduction vs FRA | FR-005 | T033, T041 |
| socialSecurity | claim at 70 | Delayed-retirement credit path | Expected percent increase vs FRA | FR-005 | T033, T041 |

### 1.8 `calc/healthcare.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| healthcare | US, age 50 pre-fire | `phase:'prefire'` branch | Real-dollar cost > 0 locked | FR-005, FR-017 | T034, T042 |
| healthcare | US, age 60 post-fire ACA | `phase:'aca'` branch | Different real-dollar cost locked | FR-005, FR-017 | T034, T042 |
| healthcare | US, age 70 Medicare | `phase:'medicare'` branch | Different real-dollar cost locked | FR-005, FR-017 | T034, T042 |
| healthcare | country override applied | Override path | Per-scenario curve locked | FR-005 | T034, T042 |

### 1.9 `calc/mortgage.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| mortgage | 30-yr fixed $500 k @ 3 % real | Standard amortization | `payoffYear` and `totalInterestPaidReal` locked; monotonic balance decrease | FR-005, FR-017 | T035, T043 |
| mortgage | extra-payment ($500/mo) | Extra-principal branch | `payoffYear` reduced by expected delta | FR-005 | T035, T043 |

### 1.10 `calc/college.js`

| Module | Fixture | Code path exercised | Invariants locked | FR/SC mapped | Task ID |
|---|---|---|---|---|---|
| college | two kids 5 yrs apart (Janet/Ian-like) | Non-overlapping windows | Default `startAge:18`; 4-year window `[startAge, startAge+3]` | FR-005 | T036, T044 |
| college | two kids 2 yrs apart | Overlap path | Overlapping years show doubled `costReal` | FR-005 | T036, T044 |
| college | no kids | Empty-array branch | `perYear: []` | FR-005 | T036, T044 |

### 1.11 Module test totals

- 10 modules; ≥ 5 constitution-mandated canonical fixtures (accumulation-only, three-phase, coast, infeasible, parity) + 5 additional module-specific fixtures = **≥ 10 fixtures total** (satisfies SC-003).
- All fixtures import-check via `tests/meta/fixture-shapes.test.js` (T015).
- Purity enforcement via `tests/meta/module-boundaries.test.js` checks (a) + (b) (T014).

---

## Section 2 — Integration test matrix

Pipelines that cross ≥ 2 modules.

| # | Pipeline | Entry input | Expected end state | Assertions | FR/SC | Task IDs covered |
|---|---|---|---|---|---|---|
| INT-1 | HTML form → `personal-rr.js` adapter → `fireCalculator.solveFireAge` → `chartState.setCalculated` → every subscriber renderer | RR's input: birthdate 1983-06-15, portfolio, spend | All RR charts + KPIs rendered with `FireSolverResult`; `chartState.source === 'calculated'`; `feasible` matches lifecycle record | Each chart renderer called exactly once after `setCalculated`; read values trace back to `chartState.state.effectiveFireAge` | FR-001, FR-009, SC-002 | T021, T023, T048, T056, T057 |
| INT-2 | Generic HTML form (no adapter) → shared `calc/*` → `chartState` | Generic's two-person input: ages 40/38, both portfolios > 0 | Same pipeline, NO personal adapter invoked | Byte-identical headline outputs vs RR when fed the parity fixture (except `divergent` list) | FR-009, SC-004, SC-007 | T022, T049, T058 |
| INT-3 | **Infeasibility propagation** (FR-013 → FR-004): withdrawal typed shortfall → lifecycle `feasible:false` record → solver `feasible:false` → `chartState.feasible:false` → HTML banner activation | `fixtures/infeasible.js` | Warning banner visible; color change; `deficitReal` surfaced (tooltip or copy); every layer carries `feasible:false` | At each layer, assert the flag; assert no silent push into `pStocks` | FR-013, FR-004, SC-001 | T029 (explicit bridge check), T037, T045, T046, T047 |
| INT-4 | Override lifecycle (drag → confirm UI → `setOverride` → all subscribers fire → non-retirement input change → `setCalculated` wipes override → subscribers fire again) | Steady-state dashboard; user drags marker from `fireAge:50` → `47`; clicks confirm; then changes `annualSpend` | After confirm: all charts + KPIs show `effectiveFireAge:47`, `source:'override'`, reset control visible. After spend change: override wiped; all charts show new `calculatedFireAge`; reset control hidden | Count subscriber calls before and after; assert override wiped atomically (no flicker) | FR-001, FR-003, FR-014, FR-018, SC-008, SC-009 | T017, T018, T023, T026, T027, T031 |
| INT-5 | Mode-switch preservation (FR-015 path) — override active, user toggles Safe/Exact/Die-with-Zero | Override active at age 47; mode change event | `effectiveFireAge` UNCHANGED (47); `overrideFireAge` UNCHANGED; `source` UNCHANGED (`'override'`); only `feasible` may change | `chartState.revalidateFeasibilityAt` invoked, NOT `setCalculated`; solver NOT re-run fresh | FR-015, SC-008 | T017 case 6, T023b, T031 (Scenario 9) |
| INT-6 | Drag-without-confirm (preview only) | Steady-state; user drags from 50 → 47 and then dismisses | Lifecycle preview marker moves during drag; on dismiss, marker snaps back; NO downstream chart changed; NO `chartState` mutation observed | Subscriber-call counter unchanged between before-drag and after-dismiss | FR-014, FR-018 | T026, T031 |
| INT-7 | Second drag before first confirm | Drag 50→47 (don't confirm); drag again 50→45 | Only one confirm overlay visible; first dragged age discarded; confirm reflects `45` | `override-confirm` DOM element re-positioned; no duplicates | FR-018 | T024, T025, T026, T031 |
| INT-8 | `effectiveFireAge` resolver cross-read audit | Load dashboard; grep every renderer | Zero renderers read `calculatedFireAge` or `fireAgeOverride` directly; all read `chartState.state.effectiveFireAge` | Static grep in T021 + T022 verification | FR-001, SC-006 | T021, T022, T050 |
| INT-9 | FR-002 drag-frame responsiveness | Drag marker | Within 16 ms (1 animation frame), all subscribers have received notification and chart frame rendered | Instrument `performance.now()` around drag event → subscriber dispatch | FR-002, SC-009 | T071 |
| INT-10 | Real-vs-nominal boundary discipline (FR-017) | Healthcare scenario input in nominal dollars | All lifecycle outputs in real dollars; grep for `*Nominal` in `calc/*.js` only appears where `inflation.toReal` is called on the same line or immediate surrounding | Grep audit; unit test `real-nominal-check` in lifecycle | FR-017, SC-006 | T051, T038, T046 |

---

## Section 3 — Acceptance scenario matrix

All 9 US1 acceptance scenarios × 2 dashboards = **18 rows**. `spec.md §US1` scenario numbering preserved. Scenario 9 covers FR-015 (mode switch).

| # | Scenario | Dashboard | Steps | Expected observable outcome | Automation | Task ID in Phase 3 |
|---|---|---|---|---|---|---|
| A-1a | #1 Drag preview only (no downstream update) | RR | Load; drag marker from X → X−3 | Only lifecycle marker + preview band move; other charts/KPIs unchanged | Playwright (pixel-coordinate drag simulation) + manual visual | T026, T031 |
| A-1b | #1 same | GEN | same | same | same | T026, T031 |
| A-2a | #2 Release drag → confirm control appears | RR | Release drag at age X−3 | Inline "Recalculate for retirement at age X−3" overlay visible adjacent to lifecycle chart | Playwright locator `.override-confirm` visible | T024, T031 |
| A-2b | #2 same | GEN | same | same | same | T025, T031 |
| A-3a | #3 Confirm click → all dependents update | RR | Click confirm | Full Portfolio Lifecycle, Roth Ladder, SS chart, KPIs, scenario cards, healthcare delta, Coast-FIRE, Mortgage verdict all reflect X−3; Reset control visible | Playwright: snapshot text of each KPI; assert `effectiveFireAge` via `data-*` attribute | T026, T027, T031 |
| A-3b | #3 same | GEN | same | same | same | T031 |
| A-4a | #4 Dismiss before confirm | RR | Drag; then click-away/cancel | Preview reverts; NO downstream chart affected | Playwright; assert KPI text unchanged | T026, T031 |
| A-4b | #4 same | GEN | same | same | same | T031 |
| A-5a | #5 Active override + non-retirement input change wipes override | RR | Confirm override; change `annualSpend`; observe | Override wiped; solver re-runs; all charts show new `calculatedFireAge`; Reset hidden | Playwright; count `chartState.onChange` notifications via injected hook | T023, T026, T031 |
| A-5b | #5 same | GEN | same | same | same | T023, T031 |
| A-6a | #6 Reset control clears override | RR | Confirm override; click Reset | Override cleared; all charts revert to calculated age | Playwright: click Reset; assert state | T027, T031 |
| A-6b | #6 same | GEN | same | same | same | T027, T031 |
| A-7a | #7 Infeasible override surfaces indicator | RR | Drag to age portfolio cannot sustain; confirm | Warning badge visible; banner color changed; no silent shortfall absorption | Playwright: assert `.infeasible` class; visual diff | T029, T031 |
| A-7b | #7 same | GEN | same | same | same | T029, T031 |
| A-8a | #8 First-view drag affordance | RR | Load dashboard fresh (clear `fire:dragHintSeen`) | `cursor: grab` on marker hover; italic "drag me" label visible; 3-sec pulse animation plays once | Playwright: check computed cursor + label presence; manual visual for pulse | T028, T031 |
| A-8b | #8 same | GEN | same | same | same | T028, T031 |
| A-9a | #9 Mode-switch preserves override | RR | Confirm override at X−3; toggle Safe → Exact → Die-with-Zero | Every chart/KPI continues to show X−3; only `feasible` may change; solver NOT re-run | Playwright: assert `effectiveFireAge` constant through three mode changes | T023b, T031 |
| A-9b | #9 same | GEN | same | same | same | T023b, T031 |

### 3.1 Acceptance scenarios for US2–US4 (summary; full scenarios already covered by integration + parity)

| Story | Scenario | Automation | Task ID |
|---|---|---|---|
| US2 | All 4 `spec.md §US2` scenarios — module TDD green; no DOM/Chart.js in `calc/*.js`; no arithmetic in renderers | `node --test` + grep audit | T032–T052 |
| US3 | All 3 `spec.md §US3` scenarios — parity byte-identical; formula change propagates; secondary-person sensitivity | Parity test + SC-005 sensitivity case | T054, T055, T060 |
| US4 | Both `spec.md §US4` scenarios — chart headers declared; bidirectional Consumer list matches | Meta-test check (c) | T063–T067 |

---

## Section 4 — Parity test matrix

**Rule** (`data-model.md §7`): `tests/parity/rr-vs-generic.test.js` asserts byte-identical equality on every top-level field of `FireSolverResult` EXCEPT fields listed in the fixture's `divergent` array.

**Sensitivity check**: SC-005 — doubling `portfolioSecondary.taxableStocksReal` in Generic MUST change `yearsToFire` by ≥ 1 year. Today's broken behavior: doubling produces NO change.

| Field | Byte-identical required? | If divergent, why | Divergence declared where |
|---|---|---|---|
| `yearsToFire` | YES | — | — |
| `fireAge` | YES | — | — |
| `feasible` | YES | — | — |
| `endBalanceReal` | YES | — | — |
| `balanceAtUnlockReal` | YES | — | — |
| `balanceAtSSReal` | YES | — | — |
| `lifecycle[i=age55].totalReal` | YES | — | — |
| `lifecycle[i=age59.5→floor(60)].totalReal` | YES | integer-age floor rule (`data-model.md §1`) — age 59.5 checkpoint evaluated at age 60 | — |
| `lifecycle[i=age62].totalReal` | YES | — | — |
| `lifecycle[i=age67].totalReal` | YES | — | — |
| `lifecycle[i=age85].totalReal` | YES | — | — |
| `ssPrimary.annualEarningsNominal` | **NO** | RR uses Roger's real 35-year earnings; GEN uses generic current-earnings curve | `rr-generic-parity.js → divergent: ['ssPrimary.annualEarningsNominal']` |
| `ssPrimary.indexedEarnings` | **NO** | Downstream of above | Same fixture divergent list |
| `ssPrimary.annualBenefitReal` | **CONDITIONAL** | If fixture elects generic mode for RR too, parity MUST hold; if fixture declares actual-earnings, divergence expected | Fixture-dependent, declared in fixture |
| `colleges[*].startYear` (RR Janet/Ian) | **NO** | Personal-data adapter injects; GEN has no such injection for parity fixture | `divergent: ['colleges']` |
| `currentAgePrimary` | YES | Both paths must produce the same integer age — RR's fractional birthdate age MUST be `Math.floor`'d by adapter (see §5 fractional-age row) | — |
| **SC-005 sensitivity** | — | `fireCalculator({...inputs, portfolioSecondary.taxableStocksReal: 2x}).yearsToFire !== fireCalculator(inputs).yearsToFire` — delta ≥ 1 yr | — | T055 |

**Parity-test tasks**: T054 (author), T055 (secondary-sensitivity), T056 (adapter), T058 (GEN wiring), T059 (solver fix), T060 (gate).

---

## Section 5 — Edge case matrix

Every bullet in `spec.md §Edge Cases` becomes a row below; augmented with the 5 explicit additions requested.

| # | Edge case | Trigger | Expected behavior | How to verify | FR linked |
|---|---|---|---|---|---|
| E-1 | Infeasible override | Drag to age portfolio cannot sustain; confirm | Warning badge + banner color change; NO silent shortfall absorption into `pStocks`; `deficitReal` surfaced | Playwright (A-7a/A-7b); integration test INT-3; unit test `fixtures/infeasible.js` | FR-004, FR-013 |
| E-2 | Override + non-retirement input change wipes override | Confirm override; change spend / return / scenario / portfolio / mode-unrelated input | Override cleared atomically; solver re-runs fresh; all charts revert to new `calculatedFireAge` | Playwright A-5; unit test scenario 3; INT-4 | FR-014 |
| E-3 | Override + solver-mode switch preserves override | Confirm override; toggle Safe/Exact/Die-with-Zero | Override preserved; only `feasible` re-evaluated; no fresh solve | Playwright A-9; unit test scenario 6; INT-5 | FR-015 |
| E-4 | Drag released without confirming → preview reverts, no downstream change | Drag; click away / cancel | Preview reverts; no chart downstream affected | Playwright A-4; INT-6 | FR-014, FR-018 |
| E-5 | Second drag before confirming → first dragged age discarded | Drag to 47 (no confirm); drag to 45 | Only one confirm overlay visible; shows `45`; first discarded | Playwright — count `.override-confirm` elements (must be 1); INT-7 | FR-018 |
| E-6 | Parity drift — RR has field GEN does not | Parity test encounters RR-only field | Test reads fixture's `divergent` list; field excluded from byte-identical check; test passes | `tests/parity/rr-vs-generic.test.js` iterates FireSolverResult fields, skips `divergent` entries | FR-009, SC-004 |
| E-7 | Fractional ages — RR birthdate-derived | RR: Roger born 1983-06-15, today 2026-04-19 | Adapter `personal-rr.js` produces `currentAgePrimary = Math.floor(42.84...) = 42` (NOT 43) per `data-model.md §1` integer-age rule | Unit test in `tests/unit/personal-rr.test.js` (or `tests/parity/`): feed the above birthdate + today date → assert `42` | FR-009, FR-017 |
| E-8 | Silent shortfall elimination (audit fix) | Run retirement where pools go negative | Withdrawal returns `{feasible:false, deficitReal:X}`; lifecycle carries flag; no pool silently absorbed | `fixtures/infeasible.js`; INT-3; unit test `withdrawal.test.js` infeasibility case | FR-013 |
| E-9 | Real-vs-nominal inconsistency (audit fix) | Healthcare/college supplied as nominal | Lifecycle converts via `inflation.toReal` before integrating | Grep `calc/*.js` for `Nominal` usages — every one adjacent to `inflation.toReal`/`toNominal`; `real-nominal-check` unit test | FR-017 |
| E-10 | `fireAgeOverride` reset on `recalcAll()` | Any input-triggered recalc | Override reset as part of `setCalculated` atomic mutation — behavior preserved but now explicit | Unit test scenario 3; INT-4 | FR-014 |
| E-11 | Drag + mode switch feasible→infeasible | Override at age X−3 feasible under Exact; switch to Safe (more conservative) → infeasible | Banner activates (`feasible:false`); override PERSISTS | Playwright: confirm override; change mode; assert banner + overrideAge still X−3 | FR-004, FR-015 |
| E-12 | Drag + mode switch infeasible→feasible | Override at age X−3 infeasible under Safe; switch to Die-with-Zero → feasible | Banner CLEARS (`feasible:true`); override PERSISTS | Playwright: reverse of E-11 | FR-004, FR-015 |
| E-13 | Fractional-age conversion (explicit corner) | RR Roger birthdate 1983-06-15; today 2026-04-19 | `Math.floor(2026-1983 - (pre-birthday adjustment)) = 42`. Because the 6/15 birthday has NOT yet occurred as of 4/19, age is 42 not 43. Adapter tests both pre- and post-birthday cases | Parameterized unit test with fixed `Date`: pre-birthday → 42; post-birthday → 43 | FR-017, data-model §1 |
| E-14 | RR file committed to public branch | Git push of branch including `FIRE-Dashboard.html` with real Roger/Rebecca dollar figures | Pre-commit guard or CI check flags; constitution §Additional Constraints §Security Baseline | Constitution gate §8 (see §8) + manual review; security-review skill | Constitution §Additional Constraints |
| E-15 | Two-parity fixture fields with tolerance | Fixture declares tolerance | Checkpoint compared with `±tolerance`; outside tolerance fails | `FixtureCase.expected.lifecycleCheckpoints[*].tolerance` honored in comparator | SC-003, FR-008 |

---

## Section 6 — Regression (baseline-capture) matrix

### 6.1 Why a baseline?

The April 2026 audit identified latent math bugs (real/nominal mixing, silent shortfall absorption, secondary person ignored). During US2 extraction, the **refactor goal is behavioral preservation** — the calc modules must produce the same numbers the HTML currently produces, EVEN IF those numbers are mathematically wrong, so we can distinguish:

- **Regression** = calc output changed between `FIRE-Dashboard*.html` today and extracted `calc/*.js` (a bug introduced by extraction).
- **Correctness fix** = intentional, audit-driven math change (documented in the commit; fixture updated deliberately per Constitution Principle IV).

This distinction is critical. Without it, we cannot tell whether a "red" test after extraction means "extraction broke something" or "the old code was wrong and we are now right."

### 6.2 Baseline capture procedure

**Before ANY calc extraction begins (T040 onward):**

1. Open `FIRE-Dashboard-Generic.html` in Chromium from `file://` (mirroring the intended end-user path).
2. For each of the 5 canonical fixture inputs below, manually type the values into the Generic form fields and trigger recalc.
3. For each input set, record the exact numeric values of:
   - `yearsToFire` (visible KPI)
   - `fireAge` (visible KPI)
   - `balanceAtUnlockReal` (inspect via DOM or read from the Full Portfolio Lifecycle chart marker)
   - `balanceAtSSReal` (same)
   - `endBalanceReal` (last lifecycle record total)
   - Every visible KPI number in the Progress / FIRE cards
4. Commit the captured table into `tests/fixtures/baseline-capture.md` (the implementer will create this file during T007–T011 foundational fixture work).
5. **Also** repeat steps 1–4 in `FIRE-Dashboard.html` (RR) to capture its pre-extraction baseline for later parity validation.

### 6.3 Canonical input sets (5)

| # | Fixture name | Key inputs (exact) |
|---|---|---|
| B-1 | `accumulation-only` | Single person, age 30, $100 000 total portfolio (split example: $50 k taxable, $30 k 401k, $20 k cash), $2 000/mo spend, 5 % real return, 3 % inflation, endAge 95, solverMode `safe` |
| B-2 | `three-phase-retirement` | Single person, age 45, $1.2 M portfolio (60/30/10 split), $50 k/yr spend, 5 % real, 3 % inflation, endAge 95, solverMode `safe` |
| B-3 | `coast-fire` | Single person, age 40, $2 M taxable, $4 k/mo spend (low), 5 % real — already coast-feasible |
| B-4 | `infeasible` | Single person, age 50, $500 k portfolio, $80 k/yr spend — solver should say infeasible (or fireAge = endAge) |
| B-5 | `rr-generic-parity` | Couple, primary age 43, secondary age 41; both portfolios populated; $70 k spend; 5 % real; solverMode `safe` |

### 6.4 Distinction documentation

The baseline capture file **MUST** include a preface stating:

> "The values in this file reflect the observed output of the dashboards as of 2026-04-19, BEFORE any calc extraction. They are used to detect extraction regressions. Some values are known or suspected to be incorrect per the April 2026 audit (real/nominal mixing, silent shortfall, secondary-person omission). A separate 'correctness fixture' set (`tests/fixtures/*-correct.js`) locks the audit-corrected values once those bugs are fixed. Diverging from the baseline during US2 is a regression; diverging from baseline during US2 correctness-fix commits is expected and MUST be documented in the commit body."

### 6.5 Task mapping

| Activity | Task ID |
|---|---|
| Create baseline capture file | QA owns — scheduled immediately after T011, before T038 |
| Verify baseline during US2 extraction | T053 (manual regression after US2) |
| Lock baseline into `baseline-capture.md` | T053 documentation step |
| Audit-correctness deviation commits | Called out in commit body per Constitution Principle IV |

---

## Section 7 — Browser / environment matrix

The dashboard ships as `file://` HTML + ES-module JS (`research.md §R2`). Target platforms per `plan.md → Technical Context`.

Primary user platform: Windows (per `env`).

| Environment | Loads? | Drag interactive? | Confirm overlay positioned correctly? | Notes |
|---|---|---|---|---|
| Chromium (Chrome/Edge) stable, Windows 11, `file://` | MUST — YES | MUST — YES | MUST — YES | Primary user path. Verify ES-module loading from `file://` (R2 caveat) |
| Chromium stable, Windows 11, local HTTP server (`python -m http.server`) | MUST — YES | MUST — YES | MUST — YES | Secondary; validates no `file://`-only quirks |
| Firefox stable, Windows 11, `file://` | MUST — YES | MUST — YES | MUST — YES | Verify module fetch from `file://`. Firefox historically stricter with CORS |
| Firefox stable, Windows 11, local HTTP | MUST — YES | MUST — YES | MUST — YES | |
| Safari (if user has Mac access) | SHOULD — YES | SHOULD — YES | SHOULD — YES | Not mandatory for MVP; target support per `plan.md` |
| Chromium, mobile viewport emulation | SHOULD — YES | **Deferred** (current drag handler is mouse-only per `research.md §R5`) | SHOULD — YES | Touch-drag is out of scope for this feature; note in PR |

**Drag interactive?** tested by Playwright `mouse.down/move/up` with chart-coordinate → pixel conversion. For environments where Playwright cannot reliably pixel-sniff the Chart.js canvas marker, fall back to direct JS injection (see §9 Risk R-2).

**Confirm overlay positioned correctly** verified by locator `.override-confirm` bounding box overlapping the marker's pixel X within ±20 px.

---

## Section 8 — Constitution gate matrix

For each of the six principles (`constitution.md §Core Principles`), the test/check that enforces it.

| # | Principle | Enforcement test / check | Where implemented | Task ID |
|---|---|---|---|---|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | Lockstep diff — `git diff` on shared regions of both HTML files stays 1:1; PR reviewer checks paired task commits landed together | T074 final lockstep diff; PR review checklist | T019‖T020, T021‖T022, T024‖T025, T048‖T049, T064‖T065, T074 |
| II | Pure Calc Modules with Declared Contracts | Meta-test: grep `calc/*.js` for `document.`, `window.`, `Chart`, `localStorage` — zero hits | `tests/meta/module-boundaries.test.js` check (a) | T014 |
| III | Single Source of Truth for Interactive State | Static grep that no renderer reads `calculatedFireAge` or `fireAgeOverride` directly — all reads go through `chartState.state.effectiveFireAge` | T021, T022 review + a meta-grep script | T021, T022, INT-8 |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | `node --test tests/` runs green; 5 mandated fixtures + module-specific fixtures present; `tests/meta/fixture-shapes.test.js` passes | `node --test` + T015 | T005–T015, T016, T052 |
| V | Zero-Build, Zero-Dependency Delivery | `git status` / git log never shows `node_modules/`, `package.json`, `yarn.lock`, `package-lock.json`, or bundler configs entering the tree. Double-click `file://` load works end-to-end | T075 + pre-commit sanity | T075, quickstart step 1 |
| VI | Explicit Chart ↔ Module Contracts | Meta-test check (c): every `@chart:` / `@module:` comment in HTML files has a reciprocal `Consumers:` entry in the named `calc/*.js`, and vice versa | `tests/meta/module-boundaries.test.js` check (c), enabled in US4 | T014 (skeleton), T063, T064, T065, T066 |

---

## Section 9 — Risk register

Honest list of test-design risks that could undermine the matrix.

**R-1. Three-phase retirement fixture expected values cannot be computed analytically.**
The `fixtures/three-phase-retirement.js` expected balances at ages 55/62/85 depend on the full interaction of accumulation return, withdrawal sequencing, tax brackets, and SS curve — values will be *locked during TDD of `lifecycle.js`* by running the freshly-implemented module once and pinning the output. Risk: if the first-run output has a bug, the fixture encodes that bug permanently.
**Mitigation**: baseline-capture procedure (§6) gives us a pre-extraction observed value to compare against. A reviewer cross-checks two independent calculations (dashboard-observed + module output) before locking. Document in the fixture's `notes:` field which values were analytically derived vs run-pinned.

**R-2. Chart.js canvas drag interaction is hard to automate via Playwright.**
The FIRE-age marker sits inside a `<canvas>`; there is no DOM locator. Playwright's `mouse.down/move/up` needs exact pixel coordinates that depend on chart sizing, DPR, and Chart.js internal layout.
**Mitigation (in order of preference)**:
1. Expose the marker pixel X via a `data-marker-x` attribute on the chart wrapper `<div>` — Playwright reads it.
2. Inject a test-mode JS helper `window.__test.dragTo(age)` that directly calls `chartState.setOverride(age)` — bypasses canvas but still validates the downstream pipeline.
3. Fall back to visual screenshot diff for the drag-preview, and use (2) for the confirm/reset flow.

**R-3. Real/nominal discipline is enforced by naming convention + grep — static-only, not runtime.**
A developer CAN accidentally compute `3 * healthcareCostNominal` inside `lifecycle.js` without any test catching it, if the resulting real-dollar number happens to be close to the expected fixture value.
**Mitigation**: (a) The meta-test grep for `Nominal` in `calc/*.js` flags every occurrence; PR reviewer verifies each is adjacent to an `inflation.toReal/toNominal` call. (b) The `real-nominal-check` unit test fixture deliberately uses mismatched numbers so a nominal-leak produces a visibly wrong answer.

**R-4. RR dashboard contains personal financial data and must not leak to public branches.**
`FIRE-Dashboard.html` has real Roger/Rebecca dollar figures, birthdates, and SS earnings. Committing to a public branch exposes these.
**Mitigation**: flag for security-review agent before any push; add a CI check that looks for specific canary strings (e.g., "Roger", "Rebecca", specific dollar figures) in the Generic file; constitution §Additional Constraints §Security Baseline already mandates this.

**R-5. `performance.now()` timing in INT-9 (FR-002 16-ms budget) may be flaky under CI.**
Virtualized CI runners have unpredictable clock resolution.
**Mitigation**: run the timing assertion locally only (T071), with generous tolerance (e.g., p95 ≤ 16 ms over 100 iterations). CI asserts "no exception thrown", not a specific millisecond figure.

**R-6. Playwright under `file://` on Windows requires `launchOptions: { channel: 'chrome' }` or similar flag.**
Some Playwright versions refuse `file://` URLs by default.
**Mitigation**: document in `tests/runner.sh` (T003) the exact flag; test harness uses a local HTTP server by default, `file://` as a supplementary verification on explicit opt-in.

**R-7. Chart.js CDN version drift.**
If the CDN serves a new major version of Chart.js between dev and CI runs, drag-handler plugins may break.
**Mitigation**: pin Chart.js to a specific version in the `<script>` tag. Document in constitution §Additional Constraints.

**R-8. Fixture file freezing (`Object.freeze`) does not prevent deep mutation.**
Nested arrays in fixtures (e.g., `portfolio`, `colleges`) remain mutable.
**Mitigation**: meta-test `fixture-shapes.test.js` (T015) can deep-freeze at import; contracted invariant.

**R-9. "Byte-identical" parity check over floats.**
IEEE-754 operations across different code paths (adapter vs direct) may produce bit-level differences even for mathematically identical computations if operation ordering differs.
**Mitigation**: parity test asserts `===` on the pinned checkpoint fields (which are all produced by *the same final module call*), and uses `Math.abs(a-b) < ε` ONLY on fields explicitly marked for tolerance. Document which fields require exact equality vs tolerance.

---

## Section 10 — Test execution sequence

### 10.1 Flow diagram (ASCII)

```text
                       ┌───────────────────────────┐
                       │ Phase 1 Setup (T001–T004) │
                       └──────────┬────────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────────┐
                    │ Phase 2 Foundational           │
                    │ T005–T016                      │
                    │ - Fixtures (T005–T011)         │
                    │ - Inflation TDD (T012→T013)    │
                    │ - Meta-tests (T014, T015)      │
                    │ - Baseline capture (§6)        │
                    └──────────┬─────────────────────┘
                               │  GATE: T016 green  ← blocks US1
                               ▼
                    ┌────────────────────────────────┐
                    │ Phase 3 US1 / P1 / MVP         │
                    │ T017–T031                      │
                    │ - chartState unit tests RED→GREEN
                    │ - HTML glue + confirm overlay  │
                    │ - Mode-switch path (T023b)     │
                    │ - Affordances + infeasibility  │
                    │ - Acceptance scenarios A-1..A-9│
                    │ - INT-3..INT-7                 │
                    └──────────┬─────────────────────┘
                               │  GATE: T031 green (18 rows §3)
                               ▼           ← MVP checkpoint, optional stop
                    ┌────────────────────────────────┐
                    │ Phase 4 US2 / P2               │
                    │ T032–T053                      │
                    │ - Unit tests RED (T032–T039)   │
                    │ - Leaf modules (T040–T044)     │
                    │ - withdrawal (T045)            │
                    │ - lifecycle (T046)             │
                    │ - fireCalculator (T047)        │
                    │ - HTML refactor (T048, T049)   │
                    │ - INT-1, INT-2, INT-10         │
                    │ - Real/nominal audit (T051)    │
                    └──────────┬─────────────────────┘
                               │  GATE: T052 green, ≤10 s
                               ▼
                    ┌────────────────────────────────┐
                    │ Phase 5 US3 / P3               │
                    │ T054–T062                      │
                    │ - Parity test RED (T054)       │
                    │ - SC-005 sensitivity (T055)    │
                    │ - personal-rr adapter (T056)   │
                    │ - Solver fix (T059)            │
                    └──────────┬─────────────────────┘
                               │  GATE: T060 green + T062 visual
                               ▼
                    ┌────────────────────────────────┐
                    │ Phase 6 US4 / P4               │
                    │ T063–T067                      │
                    │ - Meta-test check (c) enabled  │
                    │ - HTML annotations (T064, T065)│
                    │ - Consumer list sync (T066)    │
                    └──────────┬─────────────────────┘
                               │  GATE: T063 green, T067 trace ≤30 s
                               ▼
                    ┌────────────────────────────────┐
                    │ Phase 7 Polish (T068–T076)     │
                    │ Perf + a11y + final lockstep   │
                    └────────────────────────────────┘
```

### 10.2 Gates between phases

| From → To | Gate (all MUST be green) |
|---|---|
| Setup → Foundational | T004 typedefs importable |
| Foundational → US1 | T016 green: inflation unit test + meta (a)(b) + fixture-shapes + baseline-capture file committed |
| US1 → US2 | T031 green: all 18 acceptance scenarios (§3) pass; all INT-3..INT-7 pass |
| US2 → US3 | T052 green: all unit tests green in ≤ 10 s; meta-tests (a)(b) green; T053 manual regression vs baseline |
| US3 → US4 | T060 green: parity test byte-identical (except `divergent`); T055 SC-005 sensitivity green |
| US4 → Polish | T063 green (bidirectional meta-test (c)); T067 trace-time audit ≤ 30 s |
| Polish → PR | T071 perf green; T072 a11y green; T074 lockstep diff clean; T075 zero-dep verified |

### 10.3 Per-phase verification commands (Phase 3 onward)

| Phase | Verification command | Expected output |
|---|---|---|
| Foundational | `node --test tests/` (from repo root) | 0 failures; inflation + meta-tests listed |
| US1 | `node --test tests/` + manual Playwright/manual run of 18 acceptance rows | All chartState scenarios green; all 18 rows green |
| US2 | `node --test tests/` — timing target ≤ 10 s wall-clock | All module unit tests green; meta (a)(b) green |
| US3 | `node --test tests/parity/` | 0 failures on the parity fixture (except declared `divergent`); SC-005 delta ≥ 1 year |
| US4 | `node --test tests/meta/` with check (c) enabled | 0 bijection violations |
| Polish | Full suite + Playwright E2E | All green |

### 10.4 Parallelization notes

- Phase 2 fixtures (T005–T011) run in parallel.
- Phase 3 HTML glue in RR and GEN is paired but parallel across files (T019‖T020 etc.).
- Phase 4 leaf modules (T040–T044) run in parallel; then serialize through withdrawal → lifecycle → fireCalculator.
- Phase 6 annotations T064‖T065.

---

## Appendix A — FR / SC coverage audit

Every requirement from `spec.md` is cross-referenced to at least one matrix row. Validated by manual audit during authoring.

| ID | First matrix row mapping | Secondary mappings |
|---|---|---|
| FR-001 | §1.2 chartState Scenario 1 | INT-4, INT-8, Gate III (§8) |
| FR-002 | INT-9 | §3 Acceptance (observable in drag-propagation timing) |
| FR-003 | §1.2 chartState Scenario 4 | A-6a/A-6b |
| FR-004 | §1.3 lifecycle infeasible | INT-3, A-7a/A-7b, E-1, E-11, E-12 |
| FR-005 | §1.3–1.10 (all module fixtures) | — |
| FR-006 | Gate II (§8) | T014 meta-test (b) |
| FR-007 | §1 all (Node-only, zero-browser) | Gate II |
| FR-008 | §1 constitution fixtures | §4 parity, §6 baseline |
| FR-009 | INT-1, INT-2, §4 parity | E-6, E-7 |
| FR-010 | §4 SC-005 sensitivity row | T055, T059 |
| FR-011 | Gate VI (§8) | T064, T065 |
| FR-012 | Gate VI | T066, T063 |
| FR-013 | §1.5 withdrawal infeasibility | INT-3, E-8 |
| FR-014 | §1.2 chartState Scenario 3 | INT-4, A-5a/A-5b, E-2, E-10 |
| FR-015 | §1.2 chartState Scenario 6 | INT-5, A-9a/A-9b, E-3, E-11, E-12 |
| FR-016 | Module coverage §1.1–1.10 | — |
| FR-017 | INT-10, §1.3 real-nominal-check | E-9, E-13 |
| FR-018 | A-2, E-4, E-5, INT-6, INT-7 | — |
| FR-019 | A-8a/A-8b | T028 |
| FR-020 | Consolidated into FR-003 | §1.2 Scenario 4 |
| SC-001 | INT-3 + §3 acceptance (zero stale) | — |
| SC-002 | Gate VI + T067 trace audit | — |
| SC-003 | §1.11 totals + §10.3 perf target | — |
| SC-004 | §4 parity matrix | — |
| SC-005 | §4 sensitivity row, T055 | — |
| SC-006 | INT-8, INT-10, T050 | Gate III |
| SC-007 | T061 LoC diff | — |
| SC-008 | A-5, A-6, A-9 | — |
| SC-009 | §1.2 Scenario 7 + INT-4 + INT-9 | — |

Every FR-### and SC-### from `spec.md` appears in at least one row. ✅

---

## Appendix B — Task ID coverage audit (tasks.md Phases 3–6)

Every task ID in Phases 3–6 appears in at least one matrix row.

| Task | First matrix row |
|---|---|
| T017 | §1.2 chartState fixtures |
| T018 | §1.2 |
| T019, T020 | INT-1 / §7 envs |
| T021, T022 | INT-8 |
| T023 | §1.2 Scenario 3 |
| T023b | §1.2 Scenario 6 + INT-5 |
| T024, T025 | A-2a/A-2b |
| T026 | A-1, A-3, A-4, E-4, E-5 |
| T027 | A-6, §1.2 Scenario 4 |
| T028 | A-8 |
| T029 | INT-3 (integration bridge) |
| T030 | (i18n, no matrix row — covered by Polish) |
| T031 | §3 all acceptance |
| T032–T039 | §1.5–§1.10 module tests |
| T040–T044 | §1.6–§1.10 module impls |
| T045 | §1.5 withdrawal |
| T046 | §1.3 lifecycle |
| T047 | §1.4 fireCalculator |
| T048, T049 | INT-1, INT-2 |
| T050 | INT-8, SC-006 |
| T051 | INT-10, E-9 |
| T052 | §10.2 gate |
| T053 | §6 baseline + §10.2 |
| T054 | §4 parity |
| T055 | §4 sensitivity row |
| T056 | E-7, E-13, INT-1 |
| T057, T058 | INT-1, INT-2 |
| T059 | SC-005 row |
| T060 | §10.2 gate |
| T061 | SC-007 row |
| T062 | §10.2 gate |
| T063 | Gate VI |
| T064, T065 | Gate VI, FR-011 |
| T066 | FR-012 |
| T067 | SC-002 row |

Every Phase 3–6 task appears. ✅

---

**End of test-matrix.md**
