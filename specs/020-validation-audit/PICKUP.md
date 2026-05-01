# Feature 020 — Pickup Notes

**Last session:** 2026-04-30 (paused for user review of calc rewrite)
**Branch:** `020-validation-audit` (4 commits ahead of `main`)
**State:** Phase 1 + Phase 2 + Phase 3 Wave 1 complete. Phase 3 Wave 2 (UI) NOT YET STARTED. User wants to manually review the calc rewrite before launching the UI work.

---

## Where we are

```
Phase 1 ✅  Setup + 379 baseline confirmed             (commit 6429525)
Phase 2 ✅  Research (cashflow-research.md) + harness  (commit b35ce02)
Phase 3 Wave 1 ✅  Cash-flow calc rewrite              (commit 354b0f5)
─────
Phase 3 Wave 2 ⏸  Plan-tab UI (T032-T039)              ← NEXT
Phase 4    ⏸  Month-precision header (T040-T049)
Phase 5    ⏸  US1 mode-ordering invariants
Phase 6    ⏸  US2 end-state validity invariants
Phase 7    ⏸  US3 cross-chart invariants
Phase 8    ⏸  US5 drag invariants
Phase 9    ⏸  US6 withdrawal survey
Phase 10   ⏸  Polish + audit run + fixes + closeout
```

## Test status

- 389 tests pass (was 379 baseline + 10 v2 cash-flow tests).
- 0 failures.
- Constitution VIII (Spending Funded First) gate: green.
- Conservation invariant verified for RR-baseline persona ($0 exact).

## Wave 1 summary (already committed)

- `calc/accumulateToFire.js` — v2 algorithm: tracks `grossIncome`, `federalTax`, `annualSpending`, `pretax401kEmployee`, `empMatchToTrad`, `stockContribution`, `cashFlowToCash`, `cashFlowWarning` per accumulation year.
- Tax base per IRS Topic 424: `(grossIncome − pretax401kEmployee) × taxRate`. Employer match flows direct to Trad (NOT on salary side).
- Override hook ready: `pviCashflowOverrideEnabled` + `pviCashflowOverride` are read from `inp` (Wave 2 wires the UI inputs).
- Negative residual clamps `cashFlowToCash` at $0 + emits `cashFlowWarning='NEGATIVE_RESIDUAL'`.
- `projectFullLifecycle` typeof-guarded fallback REMOVED — if helper throws, log + re-throw (no silent v1 fallback).
- 2 existing tests updated with `// 020:` comments (closed-form pCash + audit-regression pCash); see commit `354b0f5`.

## What user wanted to review before Wave 2 (option C)

The user paused after Wave 1 to manually review the calc layer. Likely areas of inspection:

1. **The conservation invariant numbers**: for RR-baseline at year 1, the residual cash is `$10,772`. Spec said `~$12,788` but spec was illustrative, not specifying. The IRS-correct figure (per R3 + R1) is `$10,772`. User may want to confirm this matches their intuition.

2. **Existing test fixture updates**: two tests in `tests/unit/accumulateToFire.test.js` had pinned dollar values that legitimately shifted post-rewrite. Both annotated with `// 020:` comments. User may want to confirm the rationale.

3. **The audit dump shape**: `copyDebugInfo()` in both HTMLs now emits `lifecycleProjection` per-year + `summary.totalCashFlow` + `cashFlowConservation` block. User may want to see the new fields in their browser before the UI work locks in.

4. **The chart visual**: in a real browser, the Lifecycle chart's pCash line now starts growing during accumulation (was flat). User may want to verify this looks right.

## How to resume

### If user has reviewed and is ready for Wave 2

Tell me "go for Wave 2" or "launch Wave 2". I'll dispatch a Frontend Engineer for T032–T039:

- T032/T033 — new cashflow input + override toggle in both HTMLs (Plan tab)
- T034 — negative-residual warning UI
- T035/T036 — TRANSLATIONS.en + TRANSLATIONS.zh updates
- T037 — `FIRE-Dashboard Translation Catalog.md`
- T038/T039 — relabel `monthlySavings` to "Monthly Stock Contribution"

Estimated 1 day of agent work. Background-runnable.

### If user found something during review

User reports the issue. We triage:
- Real bug → patch on this branch before Wave 2
- Misunderstanding → docs/comment fix
- Spec gap → revise spec.md, possibly clarify question

### If user wants to skip Wave 2 and go straight to audit invariants

Wave 2 is UI plumbing only. The calc itself works without it. The audit invariants (Phases 5–8) operate on the calc, not the UI. So Wave 2 can be deferred. But: without Wave 2, users can't actually USE the override input or see the warning in the dashboard. Recommend doing Wave 2 first.

## Open questions surfaced by Wave 1 (Wave 2 decisions)

1. **`pviCashflowOverrideEnabled` localStorage key**: Wave 2 should grep `getInputs()` and `saveInputs()` in both HTMLs to verify no key collision before adding.

2. **`annualSpend` vs `monthlySpend`**: Calc reads `inp.annualSpend` first, falls back to `inp.monthlySpend × 12`. Wave 2 should confirm dashboard `getInputs()` populates ONE consistently. Currently `monthlySpend` is what `getInputs()` returns; calc handles the conversion.

3. **`taxRate` field semantics**: Calc uses `inp.taxRate` as a decimal (e.g., 0.28 not 28). Confirmed both HTMLs already store as decimal via `parseFloat(...) / 100`. No change needed.

## Where to find things

- Full spec: `specs/020-validation-audit/spec.md`
- Plan: `specs/020-validation-audit/plan.md`
- Tasks: `specs/020-validation-audit/tasks.md` (Wave 2 = T032–T039)
- Research: `specs/020-validation-audit/cashflow-research.md` (the user-facing summary)
- Persona matrix: `tests/unit/validation-audit/personas.js` (92 cells, ready for audit phases)
- Harness: `tests/unit/validation-audit/harness.js` (ready for invariant test files)
- Calc: `calc/accumulateToFire.js` (v2 with full per-year cash-flow tracking)
- Calc tests: `tests/unit/accumulateToFire.test.js` (34 tests, all green)

## Commit chain on `020-validation-audit`

```
354b0f5  phase3-wave1(020): cash-flow calc engine rewrite (US4)
b35ce02  phase2(020): research + harness scaffolding
22648c5  tasks(020): 84-task plan organized by user story
148c2ed  plan(020): 9-phase implementation plan + Phase 1 design artifacts
073bad7  spec(020): comprehensive validation audit + cash-flow rewrite
6429525  chore(020): flip SPECKIT pointer to 020 (validation-audit)
─────
(off main at f73ab44)
```

## Notes for tomorrow

- The 010+ test files survive — agent did NOT regress 019's work.
- 92 personas in the matrix are ready. Audit phases (5–8) can run as soon as Wave 2 lands.
- The 5 invariant test files (mode-ordering, end-state-validity, etc.) are NOT yet written — they're Phases 5–8.
- Translation Catalog has the cashflow keys reserved (will be added by Wave 2).
- No browser smoke required between Wave 1 and Wave 2 (UI hasn't changed yet — Wave 2 IS the UI change).
