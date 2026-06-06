# CLOSEOUT — Feature 033: Math-Assumptions Cleanup

**Branch**: `033-math-assumptions-cleanup` · **Completed**: 2026-06-06
**Origin**: external review 2026-06-05 (BUG-2/3/4, all verified); BUG-1 did not reproduce.

## What shipped

| Story | Change | Key artifact |
|---|---|---|
| US1 (P1) | Single cash-growth dial: `CASH_REAL_RETURN = 0.0` in new `calc/assumptions.js`; 9 sites/HTML + accumulateToFire + getCanonicalInputs consume it; static guard (a) bans hardcoded multipliers | `calc/assumptions.js`, `tests/unit/mathAssumptions.test.js` |
| US2 (P2) | Honest shortfall funding ladder (cut stock contribution → draw cash → draw brokerage); v7 row siblings; conservation block v4; `CONTRIBUTION_REDUCED` flag (bilingual) | `calc/accumulateToFire.js` v7, conservation v4 both HTMLs |
| US3 (P3) | Fisher real rates via `realRate()`: 28 sites/HTML + 4 calc sites incl. income growth + SS-COLA; static guard (b) bans subtraction forms | same files |

## FIRE-age / end-balance delta (FR-012 / SC-004) — RR live cold-load defaults

Captured by `tools/fireage-delta-probe.mjs` (`baseline-before.json` / `baseline-after.json`).
All three modes report identical values at cold load (winner `aggressive-bracket-fill`, active mode safe):

| Milestone | FIRE age (all modes) | End balance @ endAge | Δ vs previous |
|---|---|---|---|
| Before (pre-033, commit `11189d9`) | 50 | $845,459 | — |
| After US1 (cash 0.0%) | 50 | $845,459 | $0 — RR cold-load `cashSavings` default is $0, so the cash rate is inert until cash exists; the dial matters for live localStorage states with real cash |
| After US2 (funding ladder) | 50 | $606,411 | **−$239,048** — 7 late-accumulation shortfall years no longer "contribute" money that never existed |
| After US3 (Fisher) | 50 | $475,843 | **−$130,568** — ~0.115%/yr compounding overstatement removed across the full horizon |
| **Total** | **50 (unchanged)** | **$475,843** | **−$369,616 (−43.7%)** |

The FIRE age held at 50 because the Safe floor still clears at the lower
trajectory; the projection's terminal cushion was carrying ~$370K of phantom
money. Direction sanity (quickstart §5): later/lower only — ✅ lower, never
earlier/higher.

## SC scorecard

- **SC-001** ✅ conservation residual: RR per-year $0 / aggregate $0 (was ≈ −$32K); Generic $1 worst / $3 aggregate (rounding) — live-browser I6 probe.
- **SC-002** ✅ one defining location; static guards (a)+(b) enforce.
- **SC-003** ✅ 697/697 unit; full Playwright suite green (merge-gate run); zero non-expected crossValidationWarnings in all three modes.
- **SC-004** ✅ delta table above, per mode, attributed per story.
- **SC-005** ✅ lockstep: all shared-code edits byte-identical between the two HTML files (verified per-wave via symmetric diffs + identical added lines).

## Bugs found & fixed along the way (exposed by the honest math)

1. **`projectFullLifecycle` row-copy dropped the v7 fields** — the audit's conservation silently degraded to planned-value math. Caught by the live I6 probe; noted in data-model.md.
2. **DWZ month-interpolation accepted a gate-rejected fractional age** — interpolation now verified against the full `isFireAgeFeasible` at the fractional age (both files).
3. **DWZ gate's endBalance check was vacuous** — it ran on the clamped chart total (never < 0) while a signed −$139K depletion hid behind a floor-passing trajectory (feature-015 signed-debt class). The gate now also requires signed `endBalance ≥ 0` (both files).
4. **`yearsToFIRE` floored the month-precise DWZ result** (6y3m → age 49) so every integer-age consumer evaluated an infeasible age. Now rounds up, per its own documented intent. Active-DWZ verdict drift (49-infeasible-displayed) resolved: displayedFireAge 50, all gates agree.
5. **`getCanonicalInputs.js` is an ES module** — the `typeof require` UMD guard silently bound `undefined` (US1's `returnRateCashReal` shipped undefined; Fisher failed loudly). Real ESM import + regression lock in `mathAssumptions.test.js`.
6. **`ranker-quantize-03` fixture was shortfall-masked** — a forced fireAge-55 plan at the persona's $130K income is genuinely infeasible under honest funding (all end balances $0 for both 55.0/55.5); income raised to $200K to restore the fractional-month discriminator.
7. **`T-019-04`'s zero-income scenario** spent ~$800K over 11 years that "came from nowhere" pre-033; rewritten to assert the honest outcome (stocks drained + funding evidence trail + NEGATIVE_RESIDUAL once pools empty).

## Deferred (BACKLOG entries per T027)

- LTCG gross-up on the `fundedFromStocks` rung (research D4 face-value simplification).
- User-facing `cashRealReturn` input (slider, −2%…+1%) — spec Assumptions.
- Signed-endBalance check for the Safe/Exact gates (DWZ got it in this feature; the same clamp-masking class theoretically applies to the other modes' floor checks — no observed symptom yet).

## Visual spot-checks for the user (quickstart §3/§6 — not CLI-automatable)

- Lifecycle chart cash series: flat purchasing-power line on an undisturbed pool (sweep OFF, cash > 0).
- A shortfall year's ℹ️ flag in the audit table renders in EN and 中文.
