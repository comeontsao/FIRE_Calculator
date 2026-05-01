# Feature 021 — CLOSEOUT

**Feature**: Tax Expense Category + Audit-Harness Carry-Forward
**Branch**: `021-tax-category-and-audit-cleanup`
**Started**: 2026-05-01 (same day as feature 020 merged)
**Implemented**: 2026-05-01 (single autonomous run via 4-wave multi-agent dispatch)
**Status**: **AWAITING USER BROWSER-SMOKE** before merge to `main`

---

## Phase-by-phase summary

| Phase | Scope | Tasks | Outcome |
|---|---|---:|---|
| 1 | Setup + verify clean baseline | T001–T002 | ✓ commit `26fc57d` (spec/plan/tasks docs) |
| 2 | Foundational — `calc/taxBrackets.js` + IRS-table parity tests | T003–T009 | ✓ commit `c94c876` |
| 3 | US3 — Progressive bracket calc refactor + Investment-tab Auto toggle | T010–T035 | ✓ commit `703bb7b` |
| 4+5 | US1 — Income tax sub-row + US2 — Other tax manual entry | T036–T059 | ✓ commit `195b0b2` |
| 6 | US4 — Strategy ranker hysteresis (B-020-4) | T060–T066 | ✓ commit `9f40bc1` (E3 not cleared — see B-021-1 deferral) |
| 7 | US5 — Audit harness in CI (B-020-6) | T067–T069 | ✓ commit `85af431` |
| 8 | US6 — Harness fireAge clamp (B-020-7) | T070–T072 | ✓ commit `b14f369` (C3 HIGH 1 → 0) |
| 9 | US7 — True fractional-year DWZ (B-020-5) — DEFERRED | T073–T078 | ✓ commit `09c547d` (deferred to feature 022) |
| 10 | Polish + audit run + closeout | T079–T092 | ✓ this commit |

## Total commits on branch

```
9f40bc1  phase6(021): US4 strategy ranker hysteresis (B-020-4)
09c547d  phase9(021): US7 (B-020-5) DEFERRED to feature 022 — assessment notes
85af431  phase7(021): US5 audit harness in CI (B-020-6)
b14f369  phase8(021): US6 harness fireAge clamp (B-020-7)
195b0b2  phase4+5(021): US1 income tax sub-row + US2 other tax manual entry
703bb7b  phase3(021): US3 progressive-bracket calc refactor + Investment-tab Auto toggle
c94c876  phase2(021): tax brackets data module + IRS-table parity tests
26fc57d  spec/plan/tasks(021): tax expense category + audit-harness carry-forward
```

(Plus this CLOSEOUT commit.)

## Tests added

**Unit tests**:
- `tests/unit/taxBrackets.test.js` (NEW): 9 cases (6 required + 3 IRS-table parity sub-cases combined).
- `tests/unit/accumulateToFire.test.js`: +12 v3-TX-* tests for progressive-bracket math.
- `tests/unit/taxExpenseRow.test.js` (NEW): 6 tests (3 US1 + 3 US2).
- `tests/unit/strategyRankerHysteresis.test.js` (NEW): 5 tests (3 required + 2 bonus).

**Audit harness tests**:
- `tests/unit/validation-audit/tax-bracket-conservation.test.js` (NEW): 5 invariants (TBC-1 through TBC-5) running 460 cells across 92 personas.
- `tests/unit/validation-audit/cross-chart-consistency.test.js`: +1 regression test (`C3-clamp-regression`).
- `tests/unit/validation-audit/drag-invariants.test.js`: E3 invariant updated to pass `baselineWinner` for hysteresis.

**Test totals at closeout**:
- Unit + audit + meta: **450 tests, 449 pass, 1 skip, 0 fail**.
- Was: 414 pre-feature-021. Added: 36 net new tests.
- Constitution VIII gate (`spendingFloorPass.test.js`): 7/7 throughout.

## Findings (by severity)

| Severity | Count | Status |
|---:|---:|---|
| CRITICAL | 0 | ✓ SC-005 satisfied |
| HIGH | 0 | ✓ **SC-009 fully satisfied for the first time** since feature 020 launched the audit |
| MEDIUM | 0 | — |
| LOW | 17 | All DEFERRED to feature 022 (E3 simulator-discreteness — backlog B-021-1) |
| **TOTAL** | **17** | All triaged |

Detailed triage: see [`audit-report.md`](./audit-report.md).

Backlog handoff: see [`BACKLOG.md`](../../BACKLOG.md) sections **B-021-1** (E3 simulator-discreteness fix), **B-021-2** (US7 fractional-year DWZ carry-forward of B-020-5).

## What changed in this branch

### Calc layer
- New module `calc/taxBrackets.js` — IRS 2024 federal brackets + SSA 2024 FICA constants. Pure data, UMD-classic-script, frozen.
- New module `calc/taxExpenseRow.js` — pure helper `formatTaxIncomeRow(snapshot)` for the UI.
- `calc/accumulateToFire.js` v2 → v3:
  - New `_computeYearTax` helper computes federal tax via progressive brackets and FICA via 2024 SSA constants.
  - New per-row outputs: `ficaTax`, `federalTaxBreakdown` (per-bracket dollars + std deduction + taxable income), `ficaBreakdown` (SS / Medicare / additional Medicare / wage-base-hit flag).
  - Flat-rate `taxRate` override path preserved for backwards-compat (returns empty breakdowns + `ficaTax: 0`).
- `calc/strategyRanker.js`: new `_newWinnerBeats` helper applies ±0.05yr hysteresis when `previousWinnerId` is provided.

### UI layer
- New **Tax** category in Plan-tab Expenses pill (both HTMLs lockstep).
- **Income tax** sub-row: read-only, lock icon, monthly $ + effective rate %, reads `(federalTax + ficaTax) / 12` from accumulation snapshot. Updates within one animation frame on slider drag.
- **Other tax** sub-row: manual entry, sums into `monthlySpend`, defaults to $0 for ALL countries (no auto-fill — country budget tiers absorb foreign tax per Q2 clarification).
- Country tax-note caption surfaces the existing `scenarios[].taxNote` when `selectedScenario !== 'us'`.
- **Auto** toggle in Investment-tab next to existing `taxRate` slider. When ON, slider grays out and shows "Auto: X.X%" effective rate. When OFF, slider editable (manual flat rate). Default Auto state: ON for new users, OFF for users with non-zero saved `taxRate`.
- 8+ new bilingual EN + zh-TW translation keys; Translation Catalog updated.

### Audit infrastructure
- `tests/unit/validation-audit/tax-bracket-conservation.test.js` — 5 new invariants (TBC-1 through TBC-5) running 460 cells against 92 personas.
- `tests/unit/validation-audit/harness.js` — fireAge ≤ endAge clamp added (B-020-7 fix).
- `.github/workflows/audit.yml` — new CI workflow runs the audit harness on every push and PR. Posts findings count as PR comment. CRITICAL fails the build; HIGH warns. 10-minute timeout.

### Documentation
- `specs/021-tax-category-and-audit-cleanup/audit-report.md` — full per-invariant detail with triage decisions.
- `specs/021-tax-category-and-audit-cleanup/CLOSEOUT.md` — this file.
- `BACKLOG.md` — feature 021 marked done in changelog; 2 new backlog items (B-021-1, B-021-2) for feature 022.
- `CLAUDE.md` SPECKIT block flipped to "AWAITING USER BROWSER-SMOKE".

## Key design decisions (per spec § Clarifications)

1. **Income tax = federal + FICA combined** (Q1 / Option B). Single Income tax row shows both per the user's paycheck mental model. Calc emits both as separate fields; UI sums them for display.
2. **Pre-FIRE-only model for Income tax sub-row** (Q2). Always uses US progressive + FICA regardless of `selectedScenario`. Country selection only affects post-FIRE retirement; foreign tax is implicitly absorbed in the existing `scenarios[].comfortableSpend` / `normalSpend` budget tiers.
3. **Visible-but-disabled Auto toggle** (Q3 / Option B). Slider grays out when Auto ON; users see "Auto: 15.8%" label.
4. **Audit dump exposes per-bracket breakdown** (Q4 / Option B). New TBC invariant family locks bracket math in CI.
5. **MFJ + single only** (Q5 / Option A). MFS deferred to feature 022 (or never — most FIRE users don't file MFS).

## Browser smoke (T088) — USER GATE

**This is the gate before merging to `main`.** I cannot run the browser smoke from CLI — Roger needs to do this manually and confirm. See `specs/021-tax-category-and-audit-cleanup/quickstart.md` for the 9-step checklist:

1. Cold load both HTMLs (no console errors).
2. Tax category visible in Plan-tab Expenses pill (both sub-rows).
3. Auto toggle works in Investment tab.
4. Audit dump exposes new fields.
5. Strategy ranker stable under FIRE-marker drag.
6. Verdict pill + Lifecycle chart consistency.
7. Bilingual EN ↔ 中文.
8. Console silence (zero red errors).
9. `file://` delivery preserved.

Capture screenshots in `specs/021-tax-category-and-audit-cleanup/browser-smoke/` before merge.

## Merge-readiness statement

**Ready to merge to `main`** subject to:

- [x] All Phase 1–10 tasks complete (84 of 92 tasks done; 6 deferred per US7 + 2 not-needed-because-already-passing per US3 fixture-update gate)
- [x] All unit + audit tests green (450/450 minus 1 intentional skip)
- [x] Zero CRITICAL findings (SC-005 ✓)
- [x] Zero HIGH findings (SC-009 ✓ — first-time-satisfied milestone)
- [x] Both HTMLs in lockstep (sentinel-symbol parity verified across all UI changes)
- [x] EN + zh-TW translations for every new user-visible string (8+ new keys; Translation Catalog updated)
- [x] Constitution VIII gate green throughout
- [ ] **USER browser-smoke (T088)** — pending manual execution per quickstart.md checklist

Once T088 is green, merge with: `git checkout main && git pull origin main && git merge --no-ff 021-tax-category-and-audit-cleanup -m "feat(021): tax expense category + audit-harness carry-forward"`.

## Lessons codified

1. **Multi-wave multi-agent dispatch produces lockstep results when each agent gets the full contract path**: feature 021 used 4 sequential waves (Wave 1 calc, Wave 2 UI, Wave 3 four-parallel-agents on US4/5/6/7, Wave 4 closeout). All 6 agents succeeded on first dispatch with no rework. The pattern that made this work: each prompt named the exact contract / spec / data-model file, the exact files to edit, the exact files to LEAVE ALONE, and the test gates to verify before declaring done.

2. **Audit invariants must match the test the spec assumed they would catch**: SC-006 said "E3 LOW count drops 17 → 0". US4 hysteresis shipped per FR-018 spec, but E3 didn't drop because the audit perturbations exercise simulator-discreteness, not ranker noise. The ranker fix was correct; the spec's SC-006 assumption was wrong about the root cause. Lesson: when an SC depends on a downstream effect of an FR, validate the empirical chain before assuming SC will be satisfied by FR alone.

3. **Defer cleanly when scope explodes**: US7 (fractional-year DWZ feasibility) was OPTIONAL per spec § A4. The agent investigated for ~30 minutes, found 3 cross-cutting risks (monotonic-flip stability, growth-multiplier convention, age-threshold sub-iteration), and DEFERRED to feature 022 with a 3-paragraph rationale + 6 spec hooks. Result: clean handoff, no half-finished implementation, no test breakage. Pattern: a deferral with structured rationale is more valuable than a partially-shipped fix.
