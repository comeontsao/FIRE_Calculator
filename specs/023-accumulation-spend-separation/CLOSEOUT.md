# Feature 023 — CLOSEOUT

**Feature**: Accumulation-vs-Retirement Spend Separation
**Branch**: `023-accumulation-spend-separation`
**Started**: 2026-05-01 (same day as feature 022 merged to main)
**Implemented**: 2026-05-02 (single autonomous run)
**Status**: **AWAITING USER BROWSER-SMOKE** before merge to `main`

---

## Phase-by-phase summary

| Phase | Scope | Commit | Outcome |
|---|---|---|---|
| Spec | Spec + checklist + money-terminology codification | `ab33c11` | ✓ |
| Plan | 9-phase plan + Phase 0 research + Phase 1 design artifacts | `78a9176` | ✓ R1–R4 resolved; FR-007 corrected from 4→6 callers |
| Tasks | 59-task plan organized by user story (10 phases incl. user gate) | `2c8d7f3` | ✓ |
| 1+2 | Setup + Foundational (helper + options-bag + v5 calc-engine + tests) | `7700db0` | ✓ +18 net new tests (496 total) |
| 4+5 | Country-tier-isolation + accumulation-spend-consistency invariants + harness extension | `c1b1cfb` | ✓ +5 audit invariants (501 total) |
| 5+6+8 | Caller #6 refactor + Copy Debug audit visibility + bilingual labels | `8b7323b` | ✓ all 12 caller-sites consistent across both HTMLs |
| 9 | Polish + audit run + closeout | (this commit) | ✓ |

## Total commits on branch

```
(this CLOSEOUT commit)
8b7323b  phase5+6+8(023): caller #6 refactor + Copy Debug audit visibility + bilingual labels
c1b1cfb  phase4+5(023): country-tier-isolation + accumulation-spend-consistency invariants + harness extension
7700db0  phase2(023): foundational helper + options-bag plumbing + v5 calc-engine
2c8d7f3  tasks(023): 59-task plan organized by user story (10 phases incl. user gate)
78a9176  plan(023): 9-phase implementation plan + Phase 0 research + Phase 1 design artifacts
ab33c11  spec(023): accumulation-vs-retirement spend separation + money terminology codification
```

## Tests added/modified

- `tests/unit/getAccumulationSpend.test.js` (NEW): **10 cases**.
- `tests/unit/accumulateToFire.test.js`: **+8 v5-spend tests**.
- `tests/unit/validation-audit/country-tier-isolation.test.js` (NEW): **2 invariants** (CTI-1 HIGH + CTI-2 LOW), 102 evaluations across persona matrix.
- `tests/unit/validation-audit/accumulation-spend-consistency.test.js` (NEW): **3 invariants** (AS-1 HIGH + AS-2 MEDIUM + AS-3 LOW), 276 evaluations.

**Test totals at closeout**:
- Unit + audit + meta: **501 tests, 500 pass, 1 intentional skip, 0 fail**.
- Was: 478 pre-feature-023. Added: **+23 net new tests**.
- Constitution VIII gate (`spendingFloorPass.test.js`): 7/7 throughout.

## Findings (by severity)

| Severity | Count | Status |
|---:|---:|---|
| CRITICAL | 0 | ✓ SC-001 satisfied |
| HIGH | 0 | ✓ |
| MEDIUM | 0 | ✓ |
| LOW | 1 | UNCHANGED — pre-existing E3 residual `RR-pessimistic-frugal` from B-022-1 (independent issue, not affected by feature 023's plumbing) |
| **TOTAL** | **1** | All triaged |

Pre-feature-023 baseline (feature 022 closeout): 1 LOW finding. Post-feature-023: 1 LOW finding. **No regressions; no new findings.**

## What changed in this branch

### The bug

Pre-feature-023 the dashboard's pre-FIRE accumulation phase silently spent **$0/year** because:
1. `inp.annualSpend` was never assigned on the canonical input object — every assignment was on a *cloned* copy (e.g., `inpForScoring`).
2. All six callers of `accumulateToFire` read the original `inp` directly.
3. Inside `accumulateToFire`, `inp.annualSpend === undefined` fell through to `inp.monthlySpend × 12 === undefined → 0`.

This inflated the cash bucket trajectory by ~$95k/year on RR-baseline (year-1 portfolio Book Value Δ = +$191,722 vs realistic +$96,851). Every chart fed by `projectFullLifecycle` was contaminated.

### The fix

1. **New inline helper** `getAccumulationSpend(inp)` in both HTMLs (RR line 7604, Generic line 7963). Computes `getTotalMonthlyExpenses() × 12` with a $1,000 sanity floor falling back to Stay-in-US comfortable spend ($120k) per FR-002a — prevents bug rebirth on edge inputs.

2. **Extended `resolveAccumulationOptions`** in both HTMLs to thread `accumulationSpend: getAccumulationSpend(inp)` into the options bag. All 5 callers that already routed through this helper now thread the new field automatically.

3. **Caller #6 refactor**: `_cashflowUpdateWarning` (RR line 15362, Generic line 15779) was the only caller using `accumulateToFire(inp, fireAge, {})` empty-options bag. Refactored to use `resolveAccumulationOptions` like the other 5. Now all 12 sites (6 callers × 2 HTMLs) are in lockstep.

4. **Calc-engine v3 → v5**: `calc/accumulateToFire.js` reads `options.accumulationSpend` with a 4-tier soft-fall (preserves test/harness backwards-compat). Per-row `spendSource` diagnostic identifies which tier produced each row's `annualSpending` value. New `cashFlowWarning='MISSING_SPEND'` surfaces the latent-bug class (final-tier fallback) for future detection.

5. **Audit dump exposure**: `copyDebugInfo()` extended in both HTMLs to expose top-level `accumulationSpend` + `accumulationSpend_source`. Audit consumers can immediately tell which spending baseline drove the simulation.

6. **Bilingual UI labels**: 3 new EN+zh-TW translation keys distinguishing "current spending (US household, today's dollars)" / "目前支出（美國家計，今日購買力）" from country-tier post-FIRE budget. Caption rendered below the Plan-tab Expenses pill.

7. **Audit-harness invariants**: `country-tier-isolation` (CTI-1 + CTI-2) + `accumulation-spend-consistency` (AS-1 + AS-2 + AS-3) lock the contract against future drift.

## Key design decisions (per spec § Phase 0 Research)

1. **Helper location**: Inline JS in both HTMLs, NOT extracted to `calc/`. Matches `getActiveChartStrategyOptions` precedent. R3 decision.
2. **Fallback chain**: 4-tier soft-fall preserves test/harness backwards-compat. Hard-fail rejected. R4 decision.
3. **6 callers, not 4**: Caller audit corrected the spec mid-implementation. Caller #6 (cashflow-warning-pill at line 15338/15779) was using `{}` empty options — the bug surface is wider than initially scoped. FR-007 + audit invariant cell counts updated accordingly.
4. **SC-001 threshold**: Updated from "<$50k" to "<$100k" after R1 trace pinned realistic post-fix delta to +$96,851 (intentional 401K + stock contributions + investment growth).

## Browser smoke (T055-T057) — USER GATE

**This is the gate before merging to `main`.** Roger needs to do this manually. See `specs/023-accumulation-spend-separation/quickstart.md` for the 8-step checklist:

1. Cold load + console silence.
2. Lifecycle chart year-1 sanity check (RR-baseline age-43 Δ < $100k).
3. Country-tier purity (TW ↔ Stay-in-US swap leaves accumulation untouched).
4. Audit-tab verification (year-0 row shows annualSpending ≈ $120k, NOT $0).
5. Copy Debug verification (top-level `accumulationSpend` + `accumulationSpend_source`).
6. Bilingual EN ↔ 中文 (caption renders correctly).
7. Strategy ranker + verdict pill consistency.
8. File:// + cross-browser.

## Merge-readiness statement

**Ready to merge to `main`** subject to:

- [x] All Phase 1–9 tasks complete (54 of 54 CLI-executable; 5 user-side T055–T059 gated)
- [x] All unit + audit + meta tests green (500/501 + 1 intentional skip)
- [x] Zero CRITICAL findings
- [x] Zero HIGH findings
- [x] Zero MEDIUM findings
- [x] No new LOW findings (1 unchanged from B-022-1)
- [x] Both HTMLs in lockstep (sentinel `getAccumulationSpend` defined in both, all 6 callers route through `resolveAccumulationOptions` in both)
- [x] EN + zh-TW translations for every new user-visible string (3 new keys)
- [x] Constitution VIII gate green throughout (7/7 spending-floor-pass tests)
- [ ] **USER browser-smoke** — pending manual execution per quickstart.md checklist

Once browser-smoke is green, merge with: `git checkout main && git pull origin main && git merge --no-ff 023-accumulation-spend-separation -m "Merge feature 023-accumulation-spend-separation: separate accumulation vs retirement spending"`.

## Lessons codified

1. **Latent bugs hide for multiple features**. The `inp.annualSpend = undefined → fall through to 0` failure persisted through features 020, 021, AND 022 because every test fixture and audit-harness persona happened to set `inp.annualSpend` on the cloned object (which the calc engine never read). The bug surfaced only when a real user looked at the chart and asked "why is my cash growing so fast?" — emphasizing the irreplaceable value of user-validation as the final gate.

2. **Caller audits before plumbing changes**. The spec initially said "4 callers"; R2 grep audit found 6. Caller #6 (line 15338) used a different code path (`{}` empty options) that the typical contract-driven thinking missed. CLAUDE.md's "Caller-audit before extraction" lesson applies here: every refactor that adds a new options field MUST `grep` the function name across the entire repo before declaring the contract "fully plumbed."

3. **Soft-fall fallback chains preserve fixture stability**. The 4-tier fallback (`options.accumulationSpend → inp.annualSpend → inp.monthlySpend × 12 → 0` with `MISSING_SPEND` warning) lets the bug fix ship without coupling to a test/persona migration. ~30 existing accumulateToFire test calls continue to work; the new `MISSING_SPEND` warning surfaces if any caller forgets the field. Better than hard-fail for a multi-call-site bug fix.

4. **Audit invariants are the durable contract**. The two new invariant families (`country-tier-isolation`, `accumulation-spend-consistency`) lock the bug fix into the regression suite. A future refactor that re-introduces the bug class (e.g., adding back an `inp.annualSpend` read inside the calc loop) will fire the invariant before reaching production. Constitution IV pays back here.
