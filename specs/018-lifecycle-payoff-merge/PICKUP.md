# Feature 018 — Pickup Notes

**Last session:** 2026-04-29
**Branch:** `018-lifecycle-payoff-merge`
**State at checkpoint:** US1 fully done, US4 calc ~90% done (1 design conflict to resolve), US4 UI not started, US2/US3/Polish not started.

---

## Test status at checkpoint

```
node --test tests/unit/payoffVsInvest.test.js   →  50 tests, 49 pass, 1 fail
node --test tests/unit/lifecyclePayoffMerge.test.js → 2 tests, 2 pass
```

**The 1 failing test is #40** ("Inv-3/Inv-4 lump-sum after Prepay payoff: Prepay-first stage ordering, brokerage drops by realMortgageBalance"). It's a v2 test from feature 017 that conflicts with v3's LTCG gross-up — this is a known design issue that needs resolving (see below).

---

## What's done

### Phase 1 + 2 (T001–T006) — DONE
- Branch verified, baseline 43/43.
- `tests/unit/payoffVsInvest.test.js` regression-lock helper extended to v3 with `V2_PARITY_KEYS` whitelist (`assertV2ParityForBackCompat`, alias `assertV1ParityWhenSwitchOff` retained).
- `calc/payoffVsInvest.js` v3 contract header, `HomeSaleEvent` JSDoc typedef, `_normalizeStrategy` helper exported via `_payoffVsInvestApi`. Strict Inv-12 (mortgageStrategy always wins when present).
- v017 lump-sum tests patched to pass both `lumpSumPayoff: true` AND `mortgageStrategy: 'invest-lump-sum'`.

### Phase 3 — US1 (T007–T019) — DONE
- T007–T009 fixture tests for strategy normalization, `mortgageActivePayoffAge`, and v017 saved-state backwards compat.
- T010 calc adds `mortgageActivePayoffAge: { prepay, invest }` to outputs.
- T011 calc adds two v3 audit subSteps (`'resolve active mortgage strategy: ...'`, `'compute lifecycle mortgage trajectory under ...'`).
- T012/T013: replaced `pviLumpSumPayoff` checkbox with strategy radio fieldset (3 options) in BOTH HTMLs (lockstep). Default checked = `invest-keep-paying`.
- T014: radio change handler clears `fireAgeOverride` and calls `recalcAll()`.
- T015: page-load hydration reads `state._payoffVsInvest.mortgageStrategy` with v2 `lumpSumPayoff` fallback.
- T016: `_assemblePayoffVsInvestInputs` reads from radio, emits both `mortgageStrategy` and `lumpSumPayoff` for back-compat.
- T017: NEW helper `getActiveMortgageStrategyOptions()` mirrors feature 008's `getActiveChartStrategyOptions()` pattern. ALL 13 `projectFullLifecycle` call sites threaded with `mortgageStrategyOverride` (LH-Inv-1 closed — chart and probe use the same strategy).
- T018/T019 SCOPED implementation: lifecycle simulator's `projectFullLifecycle` precomputes calc-module's per-year `amortizationSplit` for the active strategy (when ≠ `'invest-keep-paying'`) and reads `(interestPaidThisYear + principalPaidThisYear) / 12` for monthly P&I. Lump-sum drain wired with the LTCG gross-up applied to `portfolioStocks` at `lumpSumEvent.age`. The `'invest-keep-paying'` default path bypasses the precompute entirely (zero perf impact for the default flow).

T020 manual smoke skipped per user instruction; user will smoke at end of feature.

### Phase 4 — US4 (T021–T035) — PARTIAL

**T021–T025 tests landed (all expected red initially, now mostly green):**
- T021 (Inv-9 HomeSaleEvent invariants) — green
- T022 (Section 121 boundaries — 4 sub-cases) — green
- T023 (Inv-3 lump-sum inhibition under sellAtFire) — green
- T024 (Inv-4 LTCG gross-up) — green
- T025a + T025b in NEW `tests/unit/lifecyclePayoffMerge.test.js` — green

**T026–T030 calc work — partially landed by Backend agent before time-out:**
- The agent committed substantive work (`+188/-5` lines on `calc/payoffVsInvest.js` per `git diff --stat HEAD`).
- Most of `_section121Tax`, `homeSaleEvent`, lump-sum inhibition, LTCG gross-up, `postSaleBrokerageAtFire`, and the new subSteps appear to have landed (since T021–T025 are green).
- ONE test still fails — see "Open issue" below.

**T031–T035 UI not started.**

### Phases 5, 6, 7 (US2, US3, Polish) — NOT STARTED

---

## Open issue requiring decision (next session)

**Conflict between test 40 (v2) and T024 (v3) on LTCG gross-up semantics.**

- **Test 40, assertion 3** (from feature 017's T025): `brokerageAfter ≈ brokerageBefore - paidOff` (within ±$2). This was authored when there was no LTCG gross-up; `paidOff` and the actual brokerage drop were the same number.
- **T024** (feature 018): asserts `actualDrawdown === paidOff × (1 + ltcgRate × stockGainPct)` because v3 applies the LTCG gross-up per FR-011 (Q2=B).

These two assertions cannot both hold simultaneously when `ltcgRate × stockGainPct > 0`.

**Three resolution options to consider:**

| Option | Action | Tradeoff |
|---|---|---|
| **A** | Update test 40's assertion 3 to acknowledge the v3 gross-up: `actualDrawdown = brokerageBefore - brokerageAfter` and assert `actualDrawdown === paidOff × (1 + ltcgRate × stockGainPct)` (same shape as T024). | Test 40 then duplicates T024. May want to drop one. |
| **B** | Add a NEW field `actualDrawdown` (or `grossedUpDrawdown`) to `LumpSumEvent`, separate from `paidOff`. `paidOff` keeps v2 semantics ("what the bank received = realBalance"); `actualDrawdown` is the true brokerage drop including LTCG. T024 asserts on `actualDrawdown`; test 40 keeps using `paidOff` and the assertion holds again. **Recommended** — preserves v2 semantics and explicitly surfaces the LTCG cost. | Slightly more output state; may need contract Inv-4 update. |
| **C** | Redefine `paidOff` to mean the grossed-up drawdown (current Backend-agent landed code seems to do this). Update test 40's expectation. | Backwards-incompatible with v2 paidOff semantics; might confuse downstream consumers. |

**My recommendation: Option B.** Update the contract Inv-4 to clarify the two values (`paidOff` = mortgage retired, `actualDrawdown` = brokerage drop = paidOff × gross-up), then add `actualDrawdown` field to the event, then make T024 reference it.

---

## Files at checkpoint

```
git status (uncommitted):
  M .specify/feature.json
  M CLAUDE.md
  M FIRE-Dashboard-Generic.html
  M FIRE-Dashboard.html
  M calc/payoffVsInvest.js          # +188/-5 — has Backend agent's partial US4 work
  M tests/unit/payoffVsInvest.test.js
  ?? specs/018-lifecycle-payoff-merge/
  ?? tests/unit/lifecyclePayoffMerge.test.js
```

These are committed in the checkpoint commit (see git log).

---

## Resume plan

1. **Review the agent's partial work in calc/payoffVsInvest.js** — confirm T026 (`_section121Tax`), T027 (`homeSaleEvent`), T028 (lump-sum inhibition + LTCG gross-up), T029 (`postSaleBrokerageAtFire`), T030 (subSteps) all landed.
2. **Resolve the test-40-vs-T024 conflict** — pick option A/B/C above and implement.
3. **Verify 50/50 pass on payoffVsInvest.test.js + 2/2 on lifecyclePayoffMerge.test.js (or 51/51 + 2/2 if you adopt Option A and merge T024 into test 40).**
4. **Continue with T031–T035** (US4 UI: sell-event marker on PvI chart, banner Line 4, lifecycle handoff truncation when sellAtFire=true).
5. **Then Phase 5 (US2), Phase 6 (US3), Phase 7 (Polish)** per `tasks.md`.
6. Final browser smoke per `quickstart.md` S1–S16.
7. CLOSEOUT.md, BACKLOG/Roadmap update, CLAUDE.md SPECKIT block flip.
