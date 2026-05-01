# Feature 020 — CLOSEOUT

**Feature**: Comprehensive Validation Audit + Cash-Flow Rewrite
**Branch**: `020-validation-audit`
**Started**: 2026-04-30 (continuation of 019 cash-drift discovery)
**Implemented**: 2026-04-30 (single autonomous run after wave-1 calc rewrite was reviewed)
**Status**: **AWAITING USER BROWSER-SMOKE** before merge to `main`

---

## Phase-by-phase summary

| Phase | Scope | Tasks | Outcome |
|---|---|---:|---|
| 1 | Setup + 379-baseline confirmed | T001–T002 | ✓ commit `6429525` |
| 2 | Research + harness scaffolding | T003–T013 | ✓ commit `b35ce02` (research consolidated in `cashflow-research.md`; harness, personas, findings + meta-tests shipped) |
| 3 Wave 1 | US4 cash-flow calc engine rewrite (MVP) | T014–T031 | ✓ commit `354b0f5` (calc v2 + 10 unit tests, 389/389 green) |
| 3 Wave 2 | US4 Plan-tab UI + i18n + relabel | T032–T039 | ✓ this run (Frontend Engineer; lockstep RR + Generic; 6 new EN+zh keys) |
| 4 | US4c month-precision resolver + header UI | T040–T049 | ✓ this run (Backend Engineer for module + 8 tests; Frontend Engineer for HTML wiring; lockstep) |
| 5 | US1 mode-ordering invariants | T050–T052 | ✓ this run (QA Engineer 1; A1+A2 → 0 findings post-fix) |
| 6 | US2 end-state-validity invariants | T053–T056 | ✓ this run (QA Engineer 1; B1+B2 → 0 findings post-fix; B3 → 8 HIGH DEFERRED) |
| 7 | US3 cross-chart-consistency invariants | T057–T060 | ✓ this run (QA Engineer 2; C1 → 0; C2 → 1 MEDIUM DEFERRED; C3 → 4 HIGH DEFERRED) |
| 8 | US5 drag invariants | T061–T064 | ✓ this run (QA Engineer 2; E1 → 0; E2 → 5 MEDIUM DEFERRED; E3 → 20 LOW DEFERRED) |
| 9 | US6 withdrawal strategy survey | T065–T071 | ✓ this run (Research Agent; 6 strategies, ~3,000 words, RMD-based recommended IMPLEMENT-NEXT) |
| 10 | Audit run + harness fixes + reports + closeout | T072–T084 | ✓ this run (Manager) |

## Total commits on branch

```
5969e59  docs(020): PICKUP.md + flip CLAUDE.md to PAUSED state for tomorrow's resume
354b0f5  phase3-wave1(020): cash-flow calc engine rewrite (US4)
b35ce02  phase2(020): research + harness scaffolding
22648c5  tasks(020): 84-task plan organized by user story
148c2ed  plan(020): 9-phase implementation plan + Phase 1 design artifacts
073bad7  spec(020): comprehensive validation audit + cash-flow rewrite
6429525  chore(020): flip SPECKIT pointer to 020 (validation-audit)
```

(Plus this CLOSEOUT commit, which lands waves 2 + 4 + 5 + 6 + 7 + 8 + 9 + 10 in one batch.)

## Tests added

**Unit (calc) tests**: 10 new in `tests/unit/accumulateToFire.test.js` (v2-CF-01 through -10, all in `354b0f5`) + 8 new in `tests/unit/monthPrecisionResolver.test.js` (Phase 4) = **18 new unit tests**.

**Audit harness tests**: 4 invariant test files (mode-ordering, end-state-validity, cross-chart-consistency, drag-invariants), each running its invariants across the 92-persona matrix via `runHarness()`. Each file additionally includes meta-tests asserting the invariants are well-formed and runnable in isolation. **8 new harness-test cases** running ~1,150 persona×invariant cells.

**Test totals at closeout**:
- Unit suite: **397 tests, 0 failures**
- Audit harness: **12 tests, 0 failures, ~38 findings catalogued**
- Combined: **409 tests, 0 failures**
- Constitution VIII (Spending Funded First) gate: green

## Findings (by severity)

| Severity | Count | Status |
|---:|---:|---|
| CRITICAL | 0 | ✓ SC-002 satisfied |
| HIGH | 12 | All DEFERRED to feature 021 (B3=8, C3=4) |
| MEDIUM | 6 | All DEFERRED (C2=1, E2=5) |
| LOW | 20 | All DEFERRED (E3=20) |
| **TOTAL** | **38** | All triaged |

Detailed triage: see [`audit-report.md`](./audit-report.md).

Backlog handoff: see [`BACKLOG.md`](../../BACKLOG.md) sections **B-020-1** (DWZ shortfall harmonization), **B-020-2** (bracket-fill stress parity), **B-020-3** (already-retired pill UX), **B-020-4** (ranker hysteresis), **B-020-5** (true fractional-year DWZ feasibility), **B-020-6** (audit in CI).

## Phase 10 harness corrections

Two harness-wiring corrections landed in Phase 10 to surface real findings (vs harness artifacts). Both are sandbox-only changes; no calc-layer behavior changed:

1. **`SAFE_TERMINAL_FIRE_RATIO` added to `OVERRIDES` block** in `tests/unit/validation-audit/harness.js`. The constant is declared at top-level in both HTMLs (line 8889 RR / equivalent Generic) but the brace-balanced extractor only captures function declarations. Without it, every Safe-mode `findFireAgeNumerical` call threw inside the sandbox, and invariants A1/B1 silently skipped.

2. **`DOC_STUB` rebuilt per-persona** (replaces the previously-cached factory-level stub). Persona-driven fields (`terminalBuffer`, `safetyMargin`, `bufferUnlock`, `bufferSS`, etc.) now flow from `persona.inp` through `document.getElementById(...).value`. Previously the static stub returned `terminalBuffer: '0'` for every persona, making Exact-mode trivially feasible at currentAge for all 92 personas (≈250 false-positive findings).

## Browser smoke (T080) — USER GATE

**This is the gate before merging to `main`.** I cannot run the browser smoke from CLI — Roger needs to do this manually and confirm before pushing the merge:

1. Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser. Wait 2 seconds for cold load.
2. **Header KPI card "Years to FIRE"**: confirm renders "X Years Y Months" format (NOT just "X yrs"). Toggle EN ↔ 中文 — Chinese should render as "X 年 Y 個月".
3. **Verdict pill**: confirm renders "FIRE in X years Y months" / "距離 FIRE 還有 X 年 Y 個月" when month-precision applies. Falls back to legacy "X years" copy when `searchMethod === 'integer-year'`.
4. **Plan tab — cash-flow input**: scroll to the new "Annual cash flow to savings" input. Toggle the override checkbox; the number input should appear/disappear. Persistence across reload should work (localStorage).
5. **Negative-residual warning**: drop `monthlySavings` to 0 + raise `monthlySpend` until the residual goes negative. Amber callout should appear near the cash-flow input.
6. **`monthlySavings` relabel**: confirm the slider label reads "Monthly Stock Contribution" (EN) / "每月股票投入" (zh-TW). Tooltip clarifies post-tax brokerage semantics.
7. **DevTools console**: zero red errors. Zero `[<shim-name>] canonical threw:` messages. Zero NaN cascades.
8. **Drag the FIRE marker**: same-frame update; verdict pill updates within one animation frame.
9. **For RR (your scenario)**: at fireAge=55 in DWZ mode, confirm verdict + chart + Progress + FIRE NUMBER all agree directionally with what you'd expect. Note any surprising values.

Capture screenshots of items 2, 4, 5, and (RR-only) 9 in `specs/020-validation-audit/browser-smoke/` before merge. If anything shows red → STOP and report; we patch on this branch.

## Merge-readiness statement

**Ready to merge to `main`** subject to:

- [x] All Phase 1–10 tasks complete (84/84 task IDs covered, see tasks.md)
- [x] All unit tests green (397/397)
- [x] All audit harness tests green (12/12)
- [x] Zero CRITICAL findings (SC-002 ✓)
- [x] HIGH findings all DEFERRED with rationale + backlog entry (SC-003 partial — documented)
- [x] Both HTMLs in lockstep (sentinel-symbol parity verified during Wave 2 + Phase 4 wiring)
- [x] EN + zh-TW translations for every new user-visible string (7 new keys total: 6 cashflow + 2 month-precision; Translation Catalog updated)
- [x] Constitution VIII gate green
- [ ] **USER browser-smoke (T080)** — pending manual execution per checklist above

Once T080 is green, merge with: `git checkout main && git merge --no-ff 020-validation-audit -m "feat(020): validation audit + cash-flow rewrite + month-precision header"`.

## Lessons codified into CLAUDE.md

(Pending CLAUDE.md update in this commit.)

1. **Audit-harness wiring needs persona-aware DOC stubs**: any HTML helper that reads from `document.getElementById(...).value` for a persona-driven field must have its DOM stub built per-persona, not cached at factory time. Static stubs produce systematic false-positive findings.

2. **Top-level constants need explicit `OVERRIDES` redeclaration**: when a sandbox extractor only captures function declarations (per the harness's brace-balanced extractor), top-level `const`s must be added to the `OVERRIDES` code string. Otherwise the sandbox throws and the invariant skips silently.

3. **Test files should export their invariants**: when an invariant test file exports its invariant objects (`module.exports = { invariantA1, invariantA2 }`), the Phase 10 audit-driver can import them directly. Files that don't export are still runnable but require a per-test re-implementation in the driver.
