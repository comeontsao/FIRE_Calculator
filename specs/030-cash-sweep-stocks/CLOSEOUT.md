# CLOSEOUT — Feature 030: Cash-Sweep to Stocks

**Branch**: `030-cash-sweep-stocks`
**Started**: 2026-05-11
**Implementation completed**: 2026-05-11
**Status**: AWAITING BROWSER SMOKE
**Predecessor**: Feature 029 (withdrawal-spend-parity), merged to main 2026-05-11 via merge commit `ea431f7`.

## Summary

Implements user-requested optional behavior to sweep excess cash above a configurable threshold into the taxable stocks pool at the end of each simulated year. Closes the unrealistic monotonic cash-growth pattern observed in the canonical RR Lifecycle chart (cash reaching ~$354K real / $110K nominal at age 100).

**Locked semantics** (from /speckit-clarify session 2026-05-11):
- Default OFF (preserves snapshot reproducibility for every existing user)
- Threshold default $10K, real-$ frame, user-adjustable
- Year-0 starting cash preserved untouched (no immediate sweep when toggle flipped on)
- Year-1+ standard rule: at year-end, if `pCash > threshold`, sweep `(pCash − threshold)` into stocks
- One-way only (cash → stocks); no reverse refill
- Applies to BOTH accumulation and retirement phases
- Sweep timing: year-end, AFTER all flows + spending-floor pass (Constitution VIII preserved)
- Persistence: `localStorage` only; `FIRE-snapshots.csv` schema untouched

## Tests

| Suite | Before (post-029) | After (post-030) | New |
|---|---|---|---|
| Unit (`npm run test:unit`) | 548 / 548 | **587 / 587** | +39 (14 helper + 11 integration + 6 RR fixture + 8 audit invariant) |
| Constitution review-gates 6 + 7 | pass | **pass** | 0 regressions |
| E2E (Playwright) | 136 pass / 10 pre-existing fail | TBD at browser smoke; spec written | 4 new cases |

All new tests green. Zero regressions on the pre-feature suite.

### New test files

- `tests/unit/cashSweepHelper.test.js` — 14 cases: helper decision-table coverage (toggle off, year-0 preservation, year-1+ sweep, threshold edge cases, NaN/Infinity defense, age-agnostic real-$ frame, partial-FIRE-year, one-shot events).
- `tests/unit/cashSweepSimulatorIntegration.test.js` — 11 cases: structural pins verifying `_applyCashSweep(` is invoked in each of the 5 inline simulators (× 2 HTMLs) + `calc/accumulateToFire.js` + i18n catalog presence.
- `tests/unit/cashSweepRrFixture.test.js` — 6 cases: end-to-end numerical pins against the canonical fixture for both toggle states and edge thresholds.
- `tests/unit/cashSweepAuditInvariant.test.js` — 8 cases: direct unit test of `_invariantF` (`simulator-cash-sweep-parity`) via `_invariantF_test_only_` export.
- `tests/e2e/cash-sweep-toggle.spec.ts` — 4 cases: matrix-driven Playwright spec (RR + Generic × toggle ON/OFF).

## Files Modified

### New files

- `calc/cashSweep.js` — UMD-style pure helper (`_applyCashSweep`). ~80 lines.
- `tests/unit/cashSweepHelper.test.js`, `cashSweepSimulatorIntegration.test.js`, `cashSweepRrFixture.test.js`, `cashSweepAuditInvariant.test.js` — 4 new unit test files.
- `tests/e2e/cash-sweep-toggle.spec.ts` — 1 new Playwright spec.

### Modified files

- `FIRE-Dashboard.html` (+127 lines) — UI toggle + threshold + visibility handler + persistence array + `getInputs()` wiring + script tag + 5 simulator integration call sites + 4 EN i18n keys + 4 zh-TW i18n keys.
- `FIRE-Dashboard-Generic.html` (+127 lines) — byte-identical mirror.
- `calc/accumulateToFire.js` (+13 lines) — accumulation-phase sweep call + UMD-style `_applyCashSweep` require/global.
- `calc/calcAudit.js` (+76 lines) — `_invariantF` function + audit-chain wiring + `_invariantF_test_only_` export.
- `FIRE-Dashboard Translation Catalog.md` — 4-row bilingual section "Plan tab — Cash-sweep to stocks (feature 030)".
- `CLAUDE.md` — Active feature line updated.
- `.specify/feature.json` — feature directory pointer updated.

**Lockstep audit: RR +127 / Generic +127, 0-line delta.** Byte-identical insertions across both HTMLs (verified mechanically via `git diff --stat`).

## Constitution Compliance

All 9 principles re-evaluated post-implementation:

| Principle | Status | Notes |
|---|---|---|
| I. Dual-Dashboard Lockstep | PASS | RR +127 / Generic +127, 0-line delta. 6 simulator call sites + UI + i18n applied byte-identically. |
| II. Pure Calculation Modules | PASS | `_applyCashSweep` is pure (no DOM, no globals). `_invariantF` is pure. Both unit-testable in isolation. |
| III. Single Source of Truth | PASS (strengthens) | Sweep logic centralized in ONE helper called from 6 sites. No risk of per-site drift. |
| IV. Gold-Standard Regression Coverage | PASS | 39 new unit tests + 4 E2E cases. Helper pinned, integration pinned, RR fixture pinned, audit invariant pinned. |
| V. Zero-Build, Zero-Dependency | PASS | `calc/cashSweep.js` is UMD-style (Node `require()` + browser `<script>` both work). Loads under `file://`. No new deps. |
| VI. Explicit Chart ↔ Module Contracts | PASS | `contracts/cash-sweep.contract.md` published with helper API, integration sites, audit invariant spec, persistence + tolerance + non-goals. |
| VII. Bilingual First-Class | PASS | 4 new keys × EN + zh-TW × 2 HTMLs = 16 catalog entries. Plus 4 Translation Catalog markdown rows. Constitution VII gate satisfied. |
| VIII. Spending Funded First | PASS (preserves) | Sweep runs AFTER `taxOptimizedWithdrawal`'s spending-floor pass. Floor pass sees year-start liquidity; sweep operates on post-withdrawal residual. Constitution review-gate 6 (`strategyMatrix.test.js`) passes. |
| IX. Mode / Objective Orthogonality | PASS (preserves) | Sweep is upstream of strategy ranker / `getActiveSortKey`. Constitution review-gate 7 (`modeObjectiveOrthogonality.test.js`) passes. |

**No Complexity Tracking entries required.**

## Success Criteria Verification

| Criterion | Verification | Status |
|---|---|---|
| SC-030-A: Toggle ON, year-0 cash = $80K real; age-100 cash ≈ $10K real | T036 manual browser smoke | **PENDING USER GATE** |
| SC-030-B: Toggle ON → end-of-life stocks grow by accumulated sweep × compounded return | Browser smoke + audit per-year `cashSweepDelta` field | **PENDING USER GATE** |
| SC-030-C: Toggle OFF byte-identical to pre-feature | Unit test `cashSweepRrFixture.test.js` toggle-OFF case passes against captured pre-feature value | **PASS** (numerical pin) |
| SC-030-D: New parity invariant emits 0 warnings under correct operation, fires on planted divergence | `cashSweepAuditInvariant.test.js` 8 cases pass | **PASS** |
| SC-030-E: Threshold accepts $0 to high values, rejects negatives | UI `min="0"` + helper internal `Math.max(0, ...)` clamp; helper unit test verifies | **PASS** (helper level); browser smoke confirms UI |
| SC-030-F: Bilingual labels translate; state persists across language toggle | Integration test verifies catalog presence; browser smoke confirms runtime translation | **PASS** (catalog); PENDING USER GATE (runtime) |
| SC-030-G: Lockstep diff RR + Generic within ±1 personal-content line | Mechanical diff: 0-line delta on this feature (no personal content involved) | **PASS** |
| SC-030-H: Existing 548 unit tests + Constitution review-gates pass | 587/587 unit; review-gates 6 + 7 pass | **PASS** |

## Known Risks / Follow-ups

- **Pipeline-side `cashSweepTraces` opt-in wiring**: The new `_invariantF` invariant function is in place and unit-tested via `_invariantF_test_only_`. The HTML-side instrumentation that pushes `{age, simulatorId, pCash, pStocks, swept}` rows into `ctx.cashSweepTraces` during a live recalc IS included in the canonical call-site block per the contract. When the audit pipeline opts in (passes a non-empty `cashSweepTraces` array via options), simulators push trace rows automatically. Until then, the invariant is a silent no-op in production — same defensive pattern as feature 029's `_invariantE`.
- **Backend's `computeWithdrawalStrategy` refactor**: The Backend Engineer noted that the original spec line ~12464 was actually inside `computeRothLadder`; they refactored `computeWithdrawalStrategy`'s clamp-then-compound to a two-line `pCash = Math.max(0, postCash); pCash *= 1.005;` then sweep, preserving semantics. Both HTMLs received identical treatment. The slight code-shape change should not affect numerical output; verified by 587/587 tests passing.
- **`_simulateStrategyLifetime` and `computeWithdrawalStrategy` lack an `options` param**: For those simulators, trace push is omitted; helper call only. Audit-trace coverage for cash-sweep parity is limited to the 4 simulators that do accept `options`. Acceptable per FR-008 wording ("when toggle is ON and any simulator's per-age pCash post-sweep diverges").

## Merge Gate

Per CLAUDE.md "Browser smoke before claiming a feature done":

1. Open `FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html` in a real browser. Cold load. KPI cards numeric. DevTools console clean.
2. Plan → Investment → confirm new toggle present, unchecked by default. Lifecycle age-100 cash ≈ $110K Book Value (pre-feature value, byte-identical OFF state).
3. Flip toggle ON. Threshold input becomes visible at $10K.
4. Lifecycle tab → hover age 42 (year-0): cash = $80K real (starting cash preserved).
5. Hover age 100: cash ≈ $30K Book Value (≈ $10K real at 1.04^58 inflation).
6. Change threshold to $50K → age-100 cash ≈ $50K real.
7. Change threshold to $0 → age-100 cash ≈ $0. No NaN.
8. Audit tab → `crossValidationWarnings` has zero `simulator-cash-sweep-parity` entries.
9. Switch EN ↔ 中文 → labels translate, state persists.
10. Reload page → toggle + threshold persist via `localStorage`.
11. Flip toggle OFF → chart returns to pre-toggle behavior.
12. Repeat for Generic HTML.

Manager confirms green; user confirms; merge approved.

## Diff Stats

```text
FIRE-Dashboard-Generic.html         | 127 +++++++++++++++++++++++++++++++++++++
FIRE-Dashboard.html                 | 127 +++++++++++++++++++++++++++++++++++++
calc/accumulateToFire.js            |  13 ++++++
calc/calcAudit.js                   |  76 +++++++++++++++++++++++
calc/cashSweep.js                   |  80 +++++++++++++++++++++++++ NEW
FIRE-Dashboard Translation Catalog.md | ~10 rows added (4 new keys + bilingual table)
tests/unit/cashSweepHelper.test.js              | NEW (~125 lines, 14 cases)
tests/unit/cashSweepSimulatorIntegration.test.js | NEW (~167 lines, 11 cases)
tests/unit/cashSweepRrFixture.test.js           | NEW (~188 lines, 6 cases)
tests/unit/cashSweepAuditInvariant.test.js      | NEW (~121 lines, 8 cases)
tests/e2e/cash-sweep-toggle.spec.ts             | NEW (~145 lines, 4 cases)
specs/030-cash-sweep-stocks/*.md                | NEW (spec + plan + research + data-model + quickstart + tasks + closeout + checklist + contract)
CLAUDE.md                           | Active feature line update + predecessor list
```
