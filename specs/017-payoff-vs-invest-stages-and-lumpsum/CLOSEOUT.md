# Feature 017 — Closeout

**Branch:** `017-payoff-vs-invest-stages-and-lumpsum`
**Implemented:** 2026-04-29
**Status:** Calc + tests + UI + translations all landed; final browser-smoke gate pending user verification (S1–S9 in [`quickstart.md`](./quickstart.md)).

---

## Scope shipped

| User story | What | Test gate | Visible change |
|---|---|---|---|
| **US1 — Pre-buy-in window fix** | Window starts at buy-in age for `ownership='buying-in'`; pre-buy-in branches removed from monthly loop | T006 + T007 + parity loop (4 v1 snapshots) | Both Prepay and Invest curves start at exactly $0 at the buy-in age; the $45K artifact at age 58 in the user's screenshot is gone |
| **US2 — Stage-band visualization** | Three faintly tinted background bands behind the brokerage curves: Stage I (Both paying) / II (First-payoff, with II-P or II-I sub-case) / III (Both debt-free) | T014 (stage-boundaries consistency) | Background tints + bilingual stage-band labels |
| **US3 — Lump-sum payoff branch** | Opt-in switch (default OFF) makes Invest write a check the moment its real-dollar brokerage equals the remaining real-dollar mortgage | T025 + T026 + T027(a) + T027(b) | New checkbox below "Extra monthly cash" slider; chart shows a sharp downward step at the trigger age; verdict gains a third line; blue X marker becomes a labeled blue down-arrow when the lump-sum fires |

## Files changed

| File | Lines changed (approx) | Notes |
|---|---|---|
| `calc/payoffVsInvest.js` | +249/-? net (149 → 1090ish lines) | v2 contract header, JSDoc typedefs, `windowStartAge` logic, `_findStageBoundaries` helper, lump-sum trigger, new `lumpSumEvent` + `stageBoundaries` outputs, audit subSteps |
| `tests/unit/payoffVsInvest.test.js` | +633/-? | `assertV1ParityWhenSwitchOff` helper, parity loop, T006-T007 (US1), T014 (US2), T025-T027 (US3) |
| `tests/unit/fixtures/payoffVsInvest_v1Snapshots.json` | NEW | 4 v1 ground-truth snapshots locking Inv-1 (typical-buying-now, refi-mid-window, effective-rate-override, already-own-5yrs) |
| `FIRE-Dashboard.html` | +155/-? | Switch UI, banner Line 3 element, `pviStageBandsPlugin`, marker swap, plugin registration, 9 new EN + 9 new zh-TW translation keys, state save/restore for `lumpSumPayoff` |
| `FIRE-Dashboard-Generic.html` | +155/-? | Lockstep mirror — byte-identical to RR for all non-personal-content blocks |
| `FIRE-Dashboard Translation Catalog.md` | +14 | 9 new entries grouped under "Feature 017 — Stage bands + Lump-sum payoff" |
| `CLAUDE.md` | (updated) | SPECKIT block points to feature 017; closeout pointer added on completion |
| `.specify/feature.json` | (updated) | `feature_directory` → `specs/017-payoff-vs-invest-stages-and-lumpsum` |

**Total diff vs. main: ~1100 insertions, ~88 deletions across 7 files (plus the new JSON fixture).**

## Test gate

`node --test tests/unit/payoffVsInvest.test.js` — **43 / 43 pass, 0 fail.**

Includes:
- 35 baseline v1 fixtures from feature 016 (unchanged behavior)
- 1 v1 parity regression-loop test (4 snapshots × byte-identical assertion)
- T006 / T007 (US1)
- T014 (US2)
- T025 / T026 / T027(a) / T027(b) (US3)

## Constitution compliance check

| Principle | Verdict |
|---|---|
| I. Dual-Dashboard Lockstep | ✅ Sentinel-symbol audit clean (5/5 matched counts; full diff blocks identical) |
| II. Pure Calculation Modules | ✅ `calc/payoffVsInvest.js` remains pure; new helper `_findStageBoundaries` is closure-free; subSteps emitted for audit observability |
| III. Single Source of Truth | ✅ `lumpSumPayoff` flows: DOM checkbox → input record → calc → render; no parallel sources |
| IV. Gold-Standard Regression Coverage | ✅ Inv-1 byte-parity regression locked via `assertV1ParityWhenSwitchOff` over 4 snapshots; 7 new fixture cases for v2 behaviors |
| V. Zero-Build, Zero-Dependency Delivery | ✅ Chart.js plugin defined inline (no new dependency); UMD-style classic-script pattern in calc module preserved |
| VI. Explicit Chart ↔ Module Contracts | ✅ Renderer comment headers updated to declare new fields consumed; calc module's Consumers list re-verified |
| VII. Bilingual First-Class — EN + zh-TW | ✅ All 9 new keys ship with both languages; catalog synced |
| VIII. Spending Funded First | N/A (not a withdrawal-strategy feature) |
| IX. Mode and Objective are Orthogonal | N/A (not a strategy-ranker feature) |

## Pending gates before merge

1. **Manual browser smoke (T013 / T024 / T040 / T043).** User must run `quickstart.md` S1–S9 against both dashboards in both `file://` and `http://` delivery modes. T013 (US1) was verbally confirmed mid-implementation. T024, T040, and S1–S9 require a fresh look at the new switch + bands + banner.
2. **Lockstep visual verification.** Open both dashboards side-by-side; confirm the new switch row, chart bands, and verdict Line 3 are visually identical.
3. **`file://` delivery mode test.** Open the dashboards via double-click (not via a local web server) and confirm zero console errors. Constitution Principle V is non-negotiable on this point.
4. **Bilingual flip.** Toggle EN ↔ 中文 with the switch ON; confirm switch label, banner Line 3, and stage-band hover labels all flip cleanly.

## Process lessons (candidates for CLAUDE.md)

1. **Spec-kit branch keying via `.specify/feature.json`, not just the current git branch.** During the `/speckit-plan` workflow, the script clobbered `specs/016-.../plan.md` because `feature_directory` still pointed at 016 even though we'd moved to a 017 branch. Fix is to update both signals when switching features. Worth documenting in CLAUDE.md so the next feature's `/speckit-*` workflow doesn't repeat this.
2. **Regression-lock fixtures FIRST, calc changes SECOND.** T003's parity helper + 4 captured v1 snapshots gave us a free "is the v1 contract intact?" check on every subsequent calc edit. Without it, the +249-line calc diff would have been much riskier. This is the kind of investment that pays for itself within the same feature.
3. **Backwards-compat invariant scope creep.** Inv-1 originally said "for `lumpSumPayoff === false`, every output is byte-identical to v1". The implementation revealed that the buying-in window-start change makes this NOT byte-identical for ownership='buying-in' even with the switch off — so the contract was tightened to "lumpSumPayoff === false AND ownership !== 'buying-in'". The regression test loop was scoped accordingly. Worth documenting so future features know the parity contract isn't unconditional.

## Open follow-ups

None blocking merge. Optional enhancements (not in scope here):
- Animated transition for the Invest line drop at the lump-sum age (currently a discrete step between two annual rows).
- Drag-handle to set the lump-sum brokerage cushion factor (e.g., "fire when brokerage ≥ 1.2× remaining mortgage" instead of strict equality).
- Audit-tab integration of stageBoundaries into the flow diagram (subSteps already emit the right strings; the audit renderer would need to recognize them).
