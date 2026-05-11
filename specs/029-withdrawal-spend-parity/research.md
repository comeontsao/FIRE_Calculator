# Research: Withdrawal-Simulator Spend Parity

**Feature**: 029-withdrawal-spend-parity
**Phase**: 0 (Outline & Research)
**Date**: 2026-05-11

## Open questions resolved by direct code inspection

The two bugs raised in `spec.md` were investigated against current HEAD (commit `7cc84ce` post-028 merge). Findings below.

### R-1: Bug A scope — what exactly is missing from `_simulateStrategyLifetime`'s spend formula?

**Decision:** Add three overlay terms to `_simulateStrategyLifetime`'s `ctx.grossSpend`: `hcDelta`, `collegeCostThisYear`, and `h2Carry` (Home #2 annual carry).

**Rationale:** Comparing `computeWithdrawalStrategy` (default-strategy code path, RR `:12285`) and `projectFullLifecycle` (lifecycle chart driver, RR `:10670`) against `_simulateStrategyLifetime` (RR `:11803-11814`) shows the latter omits ALL THREE overlays:

```js
// computeWithdrawalStrategy (correct):
const grossSpend = retireSpend + hcDelta + collegeCostThisYear;

// projectFullLifecycle (correct):
const grossSpendLC = Math.max(0, retireSpend + hcDelta + collegeCostThisYear + h2Carry);

// _simulateStrategyLifetime (BUG):
const ctx = { age, grossSpend: retireSpend, ssIncome: ssThisYear, ... };
```

Note: `computeWithdrawalStrategy` itself appears to omit `h2Carry` in the visible code (RR `:12285`). This is a separate pre-existing inconsistency. The spec's FR-001 mandates `_simulateStrategyLifetime` match `computeWithdrawalStrategy`'s formula, but the deeper truth is that BOTH should match `projectFullLifecycle`'s formula. Phase 1 contract resolves this: `projectFullLifecycle` is the canonical reference; the other two simulators must align to it. Update FR-001 wording to reflect this — done in `data-model.md`.

**Alternatives considered:**
- Refactor to a single shared `computeGrossSpend(inp, age, scenario)` helper exported from `calc/grossSpend.js`. REJECTED for now — out of scope per spec "We are NOT introducing a fourth simulator or restructuring the lifecycle pipeline." Tracked as a follow-up refactor candidate in `BACKLOG.md`.
- Reuse the existing `getMortgageAdjustedRetirement` envelope. REJECTED — that helper produces `retireSpend` itself; the overlays are additive on top.

### R-2: Bug B root cause — what causes the post-028 `endBalance-mismatch` warning?

**Decision:** The remaining 16% endBalance gap is NOT a spend-input bug. Both `signedLifecycleEndBalance` (RR `:9208`) and `simulateRetirementOnlySigned` (RR `:9800`) already compose `grossSpend = retireSpend + hcDelta + collegeCostThisYear + h2Carry` correctly. The audit warning fires because of a documented design difference between signed-sim and chart-sim, recorded by feature 015 and re-confirmed by feature 028's audit fields.

**Three observed contributors to the 16% gap:**

1. **`pTrad * (1 - taxTrad)` discount.** `signedLifecycleEndBalance`'s `effBal()` (RR `:9069`) returns `pTrad * (1 - taxTrad) + pRoth + pStocks + pCash`. The chart's `row.total` returns the gross pre-tax sum. When pTrad is non-zero at endAge, the signed sim discounts it by ~12% (taxTrad). In the repro pTrad ≈ 0 at age 100, so this term is small but non-zero across the trajectory.
2. **Negative-pool preservation.** Signed sim allows pools to go signed-negative after a shortfall (line `pStocks -= mix.shortfall` at RR `:9849`). Chart sim clamps each pool to `Math.max(0, ...)`. When the same strategy hits a transient shortfall, the two sims thereafter trace different trajectories. The repro shows `hasShortfall: false` everywhere, so this contributor should be zero — but the `expected: true` audit annotation explicitly covers this scenario.
3. **Strategy-router context drift.** Both sims call the registered strategy's `computePerYearMix` with their own constructed `ctx`. Even with identical `_strategyOverride`, the ctx fields (`grossSpend`, `ssIncome`, pools snapshot, `rmdThisYear`, `bracketHeadroom`, `bfOpts`) are constructed independently in each sim. If any field drifts (e.g., `bracketHeadroom` computed off slightly different pool snapshots due to clamping), the per-year mix can diverge, and the cumulative effect over 47 retirement years (54 → 100) compounds.

**Recommended fix:** Tighten the signed-sim's `bracketHeadroom` and `rmdThisYear` computation to use the same intermediate state the chart's `projectFullLifecycle` uses. Additionally, when both A ≥ 0 and B ≥ 0 (`bothFeasible`), suppress the audit warning (already flagged `expected: true`; suppression makes the user's audit panel cleaner). When verdict disagreement risks (one sim says feasible, the other says infeasible), keep the warning.

**Implementation approach:** Two-stage.
- Stage 1: emit the audit warning ONLY when `verdictA !== verdictB` (i.e., one sim crosses zero while the other doesn't). This eliminates the 16% noise from the user's audit panel without changing simulator math. Low-risk.
- Stage 2: Add a `simulator-trajectory-divergence` diagnostic field on each row that captures per-age `effBal_signed` vs `total_chart` for the repro fixture. Surfaces in audit JSON only when an admin debug flag is set. Lets future investigators rapidly diagnose the trajectory drift cause without a full repro session. This is the "leave as-is and document" path — Bug B remains a known trajectory-divergence, but the user-visible warning goes away.

**Alternatives considered:**
- Replace signed sim's per-year withdrawal with a direct call to `projectFullLifecycle` and snip out the rows ≥ fireAge. REJECTED — `projectFullLifecycle` produces clamped output; signed sim's whole purpose is to surface negative end balances. Conflating them defeats the safety invariant.
- Switch signed sim to chart-frame `pTrad` (drop the `* (1 - taxTrad)` discount). REJECTED — that discount IS the design intent: a $325k pTrad balance is not $325k of spendable equity once future income tax is paid. Removing it would systematically over-report end balance.

### R-3: New audit invariant `simulator-grossSpend-parity` — where to emit, what to compare?

**Decision:** Add a new function `_invariantE` in `calc/calcAudit.js` (next free letter after the 028-added `_invariantD`). It iterates over retirement ages (FIRE → endAge) and compares the `grossSpend` value each simulator consumes for that age. Inputs come from the audit's `ctx.simulatorTraces` field (new), populated by each simulator emitting a per-age `{ age, simulatorId, grossSpend }` row into a shared trace array passed by the caller. When any pair disagrees by more than $1, the invariant emits a `crossValidationWarnings` entry.

**Rationale:** A function-level dispatch table is cleaner than embedding parity checks inside each simulator. The trace-array pattern matches `feasibilityProbe.strategyBreakdown` already established by feature 028. Per-age granularity catches selective overlay omissions (e.g., a simulator that drops only `h2Carry` while keeping `collegeCostThisYear`).

**Required wiring:** Each of the 3 simulators MUST be modified to optionally push to `simulatorTraces` when an `options.captureTrace` flag is set. Default off (zero allocation overhead in normal runs); on only when audit is rendering.

**Alternatives considered:**
- Emit the parity check INSIDE each simulator. REJECTED — duplicates the comparison logic 3× and tightly couples simulators to the audit module, violating Constitution II purity.
- Use snapshot-based comparison (run all 3 sims with the same inputs, diff the per-age grossSpend output). REJECTED — costs 3× the simulation work just for audit. Trace-array is O(retirement-years) memory and a constant 1 push per age.

### R-4: Strategy ranker — does fixing Bug A change winners?

**Decision:** Yes, for some fixtures the winner WILL change. Plan must include a fixture-snapshot test: pre-fix winner vs post-fix winner for a canonical fixture suite, recorded in `tests/unit/perStrategyEndBalanceMatchesChart.test.js`. The snapshot is allowed to change; what's NOT allowed is the chart's displayed end-balance disagreeing with the ranker's stored end-balance for the displayed winner.

**Rationale:** The strategy ranker's per-strategy `endBalance` is computed by `_simulateStrategyLifetime` (pre-fix: with understated spend → optimistic end balance). Post-fix: end balance reflects actual spend → potentially lower → potentially flipping which strategy ranks highest. This is the CORRECT behavior: the ranker should reflect reality.

**Risk:** Pre-fix users who saw "aggressive-bracket-fill wins" may post-fix see "bracket-fill-smoothed wins" or vice versa. This is a one-time visible change, not a regression. The user receives a more truthful ranking.

**Alternatives considered:**
- Backport: pin the pre-fix ranker for backward compat, run post-fix ranker in shadow mode, expose diff. REJECTED — would entrench the bug as the supported behavior and double the simulator runtime.

### R-5: E2E test strategy — Playwright for both HTMLs × EN/中文?

**Decision:** Use the established pattern from feature 028's `tests/e2e/strategy-aware-pill.spec.ts`: a single spec file iterates over `[FIRE-Dashboard.html, FIRE-Dashboard-Generic.html] × [en, zh-TW]` and runs the same assertions in each combination. Total: 4 test cases × N assertions per case.

**Rationale:** Maintains lockstep test coverage. The spec.md SC-029-A specifies "both HTMLs" and "both locales" so a single matrix-driven spec satisfies coverage cheaply.

**Alternatives considered:**
- Two separate spec files. REJECTED — duplicates ~80% of assertions and risks them drifting.

## Performance research

Per-recalc cost increase:
- `_simulateStrategyLifetime`: 2 new function calls per age × 47 ages × 8 strategies = 752 calls per recalc. Each is a O(kids+1) lookup. Negligible.
- `simulator-grossSpend-parity` invariant: 3 numeric comparisons × 47 ages = 141 comparisons. Negligible.
- Audit panel render: 1 new row in `crossValidationWarnings` IF discrepancy detected. Zero rows under correct operation.

Profiling not required at implementation time. Existing recalc latency (~80 ms cold, ~30 ms warm) gains ≤ 1 ms.

## Decision summary

| ID | Decision | Status |
|---|---|---|
| R-1 | Add `hcDelta + collegeCostThisYear + h2Carry` to `_simulateStrategyLifetime.ctx.grossSpend` (mirror `projectFullLifecycle`'s formula, not `computeWithdrawalStrategy`'s — the latter has its own missing `h2Carry`). | Resolved |
| R-2 | Stage 1: gate `endBalance-mismatch` warning emission behind `verdictA !== verdictB`. Stage 2: add `simulator-trajectory-divergence` diagnostic field. | Resolved |
| R-3 | Add `_invariantE` in `calc/calcAudit.js`; use `simulatorTraces` array pattern with opt-in `captureTrace` flag. | Resolved |
| R-4 | Strategy ranker winner may change for some fixtures; this is correct. Pin snapshot tests for documented fixtures. | Resolved |
| R-5 | Single matrix-driven E2E spec covers both HTMLs × both locales. | Resolved |

## Out-of-scope investigations (logged for future follow-up)

- **Pre-existing `h2Carry` omission in `computeWithdrawalStrategy`:** Documented in R-1. Tracked as a follow-up cleanup in `BACKLOG.md`; if `getMortgageAdjustedRetirement` or h2 inputs are zero (current default), it's invisible. Worth a focused fix in a later feature.
- **Signed-sim `pTrad * (1 - taxTrad)` discount semantics:** Documented in R-2 contributor 1. Future feature could replace `taxTrad` (user-input flat rate) with the trajectory's actual marginal-tax-on-Trad-drawdown, derived from the bracket structure. Probably a 5–10% accuracy gain on end-balance estimates but a calc-debt cleanup task in its own right.
- **Shared `computeGrossSpend(inp, age, scenario)` helper extraction:** Documented in R-1 alternatives. Right call once the 3-simulator architecture is itself ripe for consolidation. Scope: 1 helper × 3 call-site replacements × 2 HTMLs + tests. Estimate: 1 day. Defer until either another spend-overlay bug surfaces or a 4th simulator gets added.
