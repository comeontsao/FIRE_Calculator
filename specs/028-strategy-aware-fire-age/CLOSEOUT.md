# CLOSEOUT — Feature 028: Strategy-Aware FIRE-Age Resolver + Verdict-Pill Stop-Gap

**Branch**: `028-strategy-aware-fire-age`
**Started**: 2026-05-08
**Implementation completed**: 2026-05-08
**Status**: AWAITING BROWSER SMOKE
**Predecessor**: feature 027 (aggressive-bracket-fill), merged via `a316ed1`

## Summary

Closes a misleading-verdict bug discovered 2026-05-08 via a user-supplied debug dump. With feature 027's `aggressive-bracket-fill` selected as the strategy winner under DWZ mode, the header verdict pill displayed green "On Track — FIRE in 11Y 6M (age 53) · 42.4% there" while the chart visibly showed depletion to $0 by age 93 with a red "Short by $229,755" infeasibility zone.

Root cause: `signedLifecycleEndBalance` and `simulateRetirementOnlySigned` were bracket-fill-only by design — the resolver and verdict pill evaluated a different simulator than the chart rendered. Same class of bug as feature 014's incident, re-opened by feature 027 not extending the signed simulator.

Two-layer fix shipped in this branch:

1. **US1 stop-gap pill guard** — pure helper `_shouldOverrideStatusToInfeasible` in both HTMLs, plus a probe call to `projectFullLifecycle` with active strategy options. Forces the pill to "behind" when the chart says infeasible while the resolver says feasible. Closes the user-visible misleading state immediately.

2. **US2 strategy-aware threading** — extended `signedLifecycleEndBalance` and `simulateRetirementOnlySigned` (both HTMLs) to accept `options.strategyOverride` and `options.thetaOverride`, mirroring `projectFullLifecycle`. Updated the `findEarliestFeasibleAge` wrapper in both HTMLs to thread the active strategy via `getActiveChartStrategyOptions()`. After this, the chart and the resolver agree by construction; the US1 stop-gap becomes inert in normal operation but remains in place as a safety net for future strategies.

3. **US3 audit visibility** — extended `crossValidationWarnings.endBalance-mismatch` entries with `activeStrategyId`, `mode`, `chartEndBalance`, `signedEndBalance` fields (additive; `valueA`/`valueB` preserved for back-compat).

## Tests

| Suite | Before | After | New |
|---|---|---|---|
| Unit (`npm run test:unit`) | 493 | 528 | +35 |
| E2E (`tests/e2e/strategy-aware-pill.spec.ts`) | — | 8/8 | new |

New unit test files:
- `tests/unit/verdictPillStopGap.test.js` — 12 cases (6 each per HTML), pinning the stop-gap helper's pure-decision logic.
- `tests/unit/signedSimStrategyOptions.test.js` — 16 cases (8 per HTML), structural pins on the function signatures + dispatch patterns.
- `tests/unit/fireAgeResolverStrategyAware.test.js` — 5 cases (3 resolver-mock + 2 wrapper-structural), pinning resolver feasibility verdicts and wrapper threading.
- `tests/unit/crossValidationWarningsExtended.test.js` — 2 cases, pinning the audit-entry shape extension.

New E2E spec:
- `tests/e2e/strategy-aware-pill.spec.ts` — 8 cases (4 per HTML), exercising the live helper exposure, function arity, and sim-divergence under strategy override.

All tests green: 528/528 unit + 8/8 E2E. Zero pre-existing regressions.

## Files Modified

### Both HTMLs (lockstep per Constitution Principle I)

- `FIRE-Dashboard.html` (+208 lines)
- `FIRE-Dashboard-Generic.html` (+207 lines, 1-line delta is RR-only personal content per audit)

Per-file changes:
1. Added `_shouldOverrideStatusToInfeasible` pure helper (US1).
2. Added stop-gap probe block in `renderFireStatus()` calling `projectFullLifecycle` with active options (US1).
3. Extended `signedLifecycleEndBalance` to accept `options` parameter and dispatch via strategy router when override is set (US2).
4. Extended `simulateRetirementOnlySigned` to accept `options` parameter and dispatch via strategy router when override is set (US2).
5. Updated `findEarliestFeasibleAge` call site to wrap injected sim with strategy options (US2).

### Calc layer

- `calc/calcAudit.js` — extended `_invariantA` to pass strategy options into `signedLifecycleEndBalance` and emit new diagnostic fields on `endBalance-mismatch` entries (US3).

### Documentation

- `CLAUDE.md` — active feature line updated.
- `specs/028-strategy-aware-fire-age/spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/signed-sim-options.contract.md`, `tasks.md`, `checklists/requirements.md`.

## Constitution Compliance

All 9 principles re-evaluated post-implementation:

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep | PASS | RR +208 / Generic +207 (1-line delta = RR personal content). Mechanical diff audit confirmed. |
| II. Pure Calculation Modules | PASS | New options are documented in function header comments + the contract file. Functions remain pure. |
| III. Single Source of Truth | PASS | All consumers route through `getActiveChartStrategyOptions()`. |
| IV. Gold-Standard Regression Coverage | PASS | 35 new unit tests + 8 E2E. Existing 493 untouched. |
| V. Zero-Build, Zero-Dependency | PASS | No new dependency. UMD-style; works under file://. |
| VI. Explicit Chart ↔ Module Contracts | PASS | `contracts/signed-sim-options.contract.md` published. |
| VII. Bilingual First-Class | PASS | No new translation strings. Reused existing `dyn.statusBehindSched` for stop-gap text. |
| VIII. Spending Funded First | PASS | Strategy router preserves the spending-floor pass; threaded by reuse, not duplication. |
| IX. Mode/Objective Orthogonality | PASS | `getActiveSortKey` untouched. Mode selectivity is restored, not eroded. |

No `Complexity Tracking` entries.

## Success Criteria Verification

| Criterion | Verification | Status |
|---|---|---|
| SC-028-A: Pill flipped from "On Track" to infeasible on SC-027 reproducer | Browser smoke (T035) | PENDING USER GATE |
| SC-028-B: SC-027 audit dump has 0 endBalance-mismatch warnings | Browser smoke + audit dump inspection | PENDING USER GATE |
| SC-028-C: Mode = Safe vs Exact vs DWZ produces ≥ 2 distinct FIRE-age outcomes | Browser smoke | PENDING USER GATE |
| SC-028-D: All 8 strategies have resolver tests | `tests/unit/signedSimStrategyOptions.test.js` covers all non-default strategies via structural pin; bracket-fill tested via back-compat case | PASS |
| SC-028-E: 0 unit-test regressions | `npm run test:unit` → 528/528 | PASS |
| SC-028-F: Lockstep diff intact | T031 mechanical audit: 208/207 lines, 1-line delta = RR personal content | PASS |

## Known Risks / Follow-ups

- **R-A (research.md)**: `_previewStrategyId` hover now triggers resolver re-run in addition to chart preview render. Not benchmarked at implementation time. If hover feels laggy in browser smoke, debounce at one frame (16 ms) — small follow-up. Documented in research.md.
- **R-2 (research.md)**: Per-recalc memoization deferred until profiling shows >200 ms. Watchpoint for future.
- **`tax-optimized-search` parity tests**: Not pinned in `signedSimStrategyOptions.test.js` because parity requires mirroring the strategy ranker's 3-pass θ-sweep. The strategy is dispatched correctly (verified via structural test) and its θ flows through; concrete θ-aware parity is deferred to a future test if anyone adds θ-tuning logic.

## Merge Gate

Per CLAUDE.md "Browser smoke before claiming a feature done":

1. Open `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser.
2. Reproduce the SC-027 fixture (per `quickstart.md`).
3. Confirm the pill is no longer green "On Track".
4. Toggle Mode = Safe / Exact / DWZ; confirm at least two produce different verdicts.
5. Open Audit panel; confirm `crossValidationWarnings` does NOT contain `endBalance-mismatch` entries for the active strategy.
6. Toggle EN ↔ 中文; confirm pill text translates.
7. Toggle to a feasible scenario (default strategy + Safe mode); confirm pill returns to "On Track" — proves no false negatives.

Manager confirms green; user confirms; merge approved.

## Diff Stats

```text
FIRE-Dashboard-Generic.html       | 207 ++++++++++++++++++++++++++++++++++++++++---
FIRE-Dashboard.html               | 208 +++++++++++++++++++++++++++++++++++++++++---
calc/calcAudit.js                 |  ~30 net additions
tests/unit/verdictPillStopGap.test.js                   | NEW (~120 lines)
tests/unit/signedSimStrategyOptions.test.js             | NEW (~140 lines)
tests/unit/fireAgeResolverStrategyAware.test.js         | NEW (~135 lines)
tests/unit/crossValidationWarningsExtended.test.js      | NEW (~110 lines)
tests/e2e/strategy-aware-pill.spec.ts                   | NEW (~150 lines)
specs/028-strategy-aware-fire-age/*.md                  | NEW (spec + plan + research + data-model + quickstart + tasks + closeout + checklist + contract)
CLAUDE.md                         | Active feature line update
```
