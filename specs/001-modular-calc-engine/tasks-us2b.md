---

description: "Task list for feature 001-modular-calc-engine — US2b parity phase"
---

# Tasks: Modular Calc Engine — US2b (Canonical-Engine Parity Extension)

**Input**: Design documents from `/specs/001-modular-calc-engine/` (extended
for US2b: `data-model.md §1b–1e, §3.1`, `contracts/{lifecycle,mortgage,college,
secondHome,studentLoan}.contract.md`, `baseline-rr-inline.md`).

**Prerequisites**: US1 merged ✅; US2 partially complete through T047 ✅
(10 calc modules committed, tests 40 pass / 0 fail / 1 skip); T048/T049 HTML
refactor BLOCKED pending this phase.

**Tests**: REQUIRED. Every new calc-engine feature gets a RED unit test before
GREEN implementation. Every baseline value from `baseline-rr-inline.md` must
pass a parity-check by the end of U2B-5.

**Organization**: U2B-1 through U2B-5 are strictly sequential phase gates.
Within each phase, `[P]` tasks run in parallel.

## Format: `[ID] [P?] [Story] Description`

- Task IDs use `TB##` prefix to avoid collision with the existing T001–T076 series.
- `[US2b]` label on every task (omitted for pure infra).

---

## Phase U2B-1: Setup

**Purpose**: Capture the pre-refactor baseline BEFORE any calc module changes.
Define the canonical input fixtures US2b implementers will measure against.

- [ ] TB01 Create `specs/001-modular-calc-engine/baseline-rr-inline.md` (ALREADY COMPLETE — this task is purely a cross-reference placeholder for traceability).
- [ ] TB02 [P] [US2b] Manually open `FIRE-Dashboard.html` in Chromium from `file://`; enter the canonical RR input set documented in `baseline-rr-inline.md §A`; record observed `yearsToFire`, `fireAge`, `balanceAtUnlockReal`, `balanceAtSSReal`, `endBalanceReal` into `baseline-rr-inline.md §A.observed`. Replace the "must be manually verified" placeholders in that section.
- [ ] TB03 [P] [US2b] Manually open `FIRE-Dashboard-Generic.html` in Chromium from `file://`; enter the canonical Generic input set; record observed values into `baseline-rr-inline.md §B.observed`. Pair with TB02 (both files captured in same session to minimize day-to-day drift).
- [ ] TB04 [P] [US2b] Create `tests/fixtures/rr-realistic.js` — canonical RR input set in the shared `Inputs` shape, with an `expected` block containing the baseline values captured in TB02. Fixture `kind: 'integration'`. Document in `notes` which values are analytically derived vs run-pinned.
- [ ] TB05 [P] [US2b] Create `tests/fixtures/generic-realistic.js` — canonical Generic input set with baseline values from TB03. Same `kind: 'integration'` + notes convention.
- [ ] TB06 [P] [US2b] Extend `tests/fixtures/types.js` with the new typedefs (`Mortgage` with ownership modes, `SecondHome`, `StudentLoan`, `ContributionSplit`). Matches the data-model.md §1b–1e additions.

**Checkpoint**: baseline values locked; canonical RR + Generic fixtures in place but not yet wired to tests; existing 40 tests still pass (no runtime code touched).

---

## Phase U2B-2: Foundational

**Purpose**: Extend the fixture corpus + type surface so downstream TDD tasks
have oracle values and typedefs to import.

- [ ] TB07 [P] [US2b] Write `tests/unit/mortgage-ownership.test.js` — three RED tests covering the three ownership modes (buying-now, already-own, buying-in). Use analytical expected values per the contract invariants. MUST FAIL (computeMortgage's current signature does not accept ownership).
- [ ] TB08 [P] [US2b] Write `tests/unit/secondHome.test.js` — RED tests covering cash-only purchase, mortgaged + sell-at-FIRE, rented-out net-income, inherit destiny. MUST FAIL (module does not yet exist).
- [ ] TB09 [P] [US2b] Write `tests/unit/studentLoan.test.js` — RED tests for 10-year term, extra-payment, zero-rate, short-term cases. MUST FAIL (module does not yet exist).
- [ ] TB10 [P] [US2b] Extend `tests/unit/college.test.js` with loan-financing cases — `pctFinanced: 0.5, parentPayPct: 1.0` (parent pays half), `pctFinanced: 1.0, parentPayPct: 0` (kid absorbs fully). MUST FAIL until TB18 lands.
- [ ] TB11 [P] [US2b] Extend `tests/unit/lifecycle.test.js` with four RED tests: (a) contributionSplit override honored; (b) employerMatchReal adds to trad only; (c) relocationCostReal applied at fireAge; (d) homeSaleAtFireReal added to taxable at fireAge. MUST FAIL until TB20.
- [ ] TB12 [US2b] Extend `tests/unit/fireCalculator.test.js` with the `rr-realistic` fixture integration test — loads TB04, runs `solveFireAge`, asserts `fireAge` within ±1 year of the baseline-captured value (baseline-rr-inline.md §C documents the allowed intentional deviations). MUST FAIL until TB21 relaxes.

**Checkpoint**: All new RED tests exist and fail; fixture corpus covers US2b scope.

---

## Phase U2B-3: Module Extensions

**Purpose**: Implement the parity gaps. Each implementation task pairs with its
RED test from U2B-2.

- [ ] TB13 [US2b] Extend `calc/mortgage.js` to accept the full `Mortgage` typedef (ownership, purchaseAge, yearsPaid, destiny, propertyTax, insurance, HOA, appreciation) and export `resolveMortgage({mortgage, currentAgePrimary, endAge, fireAge, rentAlternativeReal?, homeLocation?})` per `contracts/mortgage.contract.md`. Preserve the existing `computeMortgage(params)` signature — new function wraps it. TB07 turns GREEN.
- [ ] TB14 [US2b] Create `calc/secondHome.js` — export `resolveSecondHome({secondHome, currentAgePrimary, endAge, fireAge})` per `contracts/secondHome.contract.md`. Pure; no DOM; fenced Inputs/Outputs/Consumers header. TB08 turns GREEN.
- [ ] TB15 [US2b] Create `calc/studentLoan.js` — export `computeStudentLoan(params)`. Implementation decision: if the amortization reduces exactly to `computeMortgage(...)` with renamed params, wrap it (document why in the module header); otherwise implement standalone. TB09 turns GREEN.
- [ ] TB16 [US2b] Extend `calc/college.js` to accept the loan-financing overlay fields (pctFinanced, parentPayPct, loanRateReal, loanTermYears) and emit `inSchoolShareReal` + `loanShareReal` in each perYear entry. Default behavior when fields omitted is byte-identical to today's output (regression safety). TB10 turns GREEN.
- [ ] TB17 [US2b] Extend `calc/lifecycle.js` Inputs validation + simulation:
  - Accept `contributionSplit` (validate fractions sum to 1.0); apply to accumulation-phase contributions.
  - Accept `employerMatchReal`; add to trad401kReal each accumulation year.
  - Accept `relocationCostReal`, `homeSaleAtFireReal`; apply at the `agePrimary === fireAge` boundary.
  - Accept `rentAlternativeReal`; thread into `resolveMortgage` helper call.
  - Accept `scenarioSpendReal`; use in place of `annualSpendReal` for retirement-phase adjusted-spend calculation (accumulation unchanged).
  - Accept `secondHome`; call `resolveSecondHome` and integrate its `perYear` into lifecycle's year loop (oneTimeOutflowReal, carryReal, saleProceedsReal).
  - Accept `studentLoans`; for each loan call `computeStudentLoan` and integrate per-year payments.
  - Replace the inline mortgage handling (currently based on `mortgage.balanceReal` / `mortgage.interestRate` / `mortgage.yearsRemaining`) with `resolveMortgage` — but keep a compat shim that maps the old shape to the new when both are supplied (zero-regression path for existing fixtures). TB11 turns GREEN.
- [ ] TB18 [US2b] Extend `calc/lifecycle.js` LifecycleRecord emission to populate the new fields: `accessible`, `is401kUnlocked`, `mortgagePaymentReal`, `secondHomeCarryReal`, `collegeCostReal`, `studentLoanPaymentReal`, `oneTimeOutflowReal`. Backward-compat aliases `p401kTradReal === trad401kReal` and `p401kRothReal === rothIraReal` — emit both for the T048/T049 transition window.
- [ ] TB19 [US2b] Update `calc/fireCalculator.js` to thread the new `Inputs` fields through to `runLifecycle`. Verify solver still binary-searches correctly when `scenarioSpendReal` is in effect (solver searches for earliest age where `scenarioSpendReal`-based lifecycle is feasible).
- [ ] TB20 [US2b] Re-run `bash tests/runner.sh` — every existing test still passes; every new US2b test also passes. If any existing test goes red: that's a regression — fix before moving on.
- [ ] TB21 [US2b] Run `tests/unit/fireCalculator.test.js` `rr-realistic` case from TB12. Compare output against `baseline-rr-inline.md §A.observed`. Deviations fall into two buckets:
  - **Intentional correctness fixes** (documented in `baseline-rr-inline.md §C`): expected; lock the NEW canonical value in the fixture's `expected` block.
  - **Unexpected regressions**: trace through the changed modules, fix.
  Same for `generic-realistic` from TB05. TB12 turns GREEN.

**Checkpoint**: Canonical engine reaches feature parity with the inline engine for the baseline inputs. The `rr-realistic` and `generic-realistic` fixtures lock the numbers for future regression detection.

---

## Phase U2B-4: HTML Refactor (T048/T049 Revisited)

**Purpose**: With the canonical engine at parity, the inline engine can finally
be ripped out without losing features. This was the originally-blocked
T048/T049 work — now mechanical.

- [ ] TB22 [US2b] Refactor `FIRE-Dashboard.html`: replace the inline `projectFullLifecycle`, `findFireAgeNumerical`, `signedLifecycleEndBalance`, `yearsToFIRE`, `getTwoPhaseFireNum`, `calcRealisticSSA`, `taxAwareWithdraw`, `taxOptimizedWithdrawal`, `getMortgageAdjustedRetirement`, `calcMortgagePayment` (the inline helpers) with calls into `calc/*.js` modules. The new `getInputs()` produces a canonical `Inputs` shape (via a thin RR adapter that maps `inp.ageRoger` → `currentAgePrimary`, merges `inp.roger401kTrad` → `portfolioPrimary.trad401kReal`, etc.).
- [ ] TB23 [US2b] Apply the identical refactor to `FIRE-Dashboard-Generic.html` (lockstep with TB22 — same commit).
- [ ] TB24 [US2b] Rename chart renderer field reads: update the Frontend Engineer-owned chart render blocks that currently read `data[i].p401kTrad` etc. to read `record.trad401kReal` (or the transitional alias `record.p401kTradReal`). Update phase-string comparisons per the bridge table in `data-model.md §3.1`.
- [ ] TB25 [US2b] Remove the inline helpers that TB22/TB23 replaced. `wc -l` both HTML files — expect ~1500+ lines deleted per file. Commit with the message body stating the LoC reduction.

**Checkpoint**: Both HTML files run on the canonical engine. Inline calc surface is zero.

---

## Phase U2B-5: Verification

**Purpose**: Prove behavioral preservation + audit corrections are both intact.

- [ ] TB26 [US2b] Run T050 (grep audit) against both HTML files: zero retirement-age arithmetic inside chart renderers; every chart reads from `chartState.state.effectiveFireAge` or a lifecycle record.
- [ ] TB27 [US2b] Run T051 (real/nominal audit): `grep -rn 'Nominal' calc/*.js` — every match is adjacent to `inflation.toReal` / `inflation.toNominal`. Audit findings committed to `specs/001-modular-calc-engine/checklists/real-nominal-audit.md`.
- [ ] TB28 [US2b] Parity regression check: re-run `bash tests/runner.sh`. Every existing test plus TB07–TB12 extensions are green. `rr-realistic` and `generic-realistic` fixtures pass at their locked values (from TB21).
- [ ] TB29 [US2b] Manual smoke test: open both dashboards in Chromium from `file://`, enter a canonical input set, confirm visible KPIs match the baseline values within the documented intentional-correctness deltas.
- [ ] TB30 [US2b] Update `specs/001-modular-calc-engine/baseline-rr-inline.md §D` with the POST-refactor observed values — the new canonical baseline, against which future feature work measures.
- [ ] TB31 [US2b] Close-out: mark T048/T049 DONE in `tasks.md` with a pointer to this file. Manager dispatches the polish phase (T068–T076).

**Checkpoint**: US2b complete. Canonical engine is the single source of FIRE math for both dashboards. Baseline document reflects the post-refactor truth.

---

## Dependencies & Execution Order

### Phase gates
- U2B-1 → U2B-2: baseline values captured (TB02, TB03) + fixtures committed (TB04, TB05, TB06).
- U2B-2 → U2B-3: RED tests exist and fail on the current runtime.
- U2B-3 → U2B-4: canonical engine reaches parity; TB20 + TB21 green.
- U2B-4 → U2B-5: both HTML files running on canonical engine; visible behavior unchanged.
- U2B-5 → close: audit-correctness delta documented; test suite green.

### Parallelism
- TB02 ‖ TB03 (two separate browser sessions capturing two fixtures).
- TB04 ‖ TB05 ‖ TB06 (independent fixture files).
- TB07 ‖ TB08 ‖ TB09 ‖ TB10 ‖ TB11 (independent test files).
- TB13 ‖ TB14 ‖ TB15 (independent modules). TB16 depends on none. TB17 depends on TB13 + TB14 + TB15 + TB16. TB18 depends on TB17. TB19 depends on TB17.
- TB22 ‖ TB23 (two HTML files — lockstep-commit mandatory per Principle I).

### Lockstep commits (Principle I NON-NEGOTIABLE)
- TB22 ‖ TB23: same commit.
- TB24 touches both HTML files in the same commit.

---

## Notes

- **TDD discipline**: every test task (TB07–TB12) lands before its corresponding implementation (TB13–TB19). Tests must be RED at commit time of the test, GREEN at commit time of the impl.
- **Baseline discipline**: `baseline-rr-inline.md` is the authoritative delta record between inline and canonical engines. Intentional deviations MUST be documented BEFORE they are observed in a passing test — otherwise the "correctness fix" claim is unfalsifiable.
- **Zero-build discipline**: no new dependencies introduced. All new code is ES-modules in `calc/*.js` loadable from `file://`.
- **Scope guard**: if during TB17 the implementer finds that the inline engine's signed-lifecycle semantics (allow pools to go negative) produce materially different feasibility results than the canonical engine's typed `{feasible:false, deficitReal}`, that IS the audit-identified silent-shortfall bug. Document in `baseline-rr-inline.md §C` and proceed — do NOT port the signed-pool behavior into the canonical engine.

---

**Total tasks**: 31 across 5 phases (TB01–TB31). Expected wall-clock: ~3–5 focused days solo, ~2–3 days with Backend + Frontend splitting U2B-3 / U2B-4.
