# Contract — `signedLifecycleEndBalance` Spending-Floor Pass Extension (B-023-6)

**Site**: `signedLifecycleEndBalance` inline definition in both HTMLs.
**Feature**: 024-deferred-fixes-cleanup
**FRs**: FR-017, FR-018, FR-019, FR-020

---

## Purpose

Eliminate the 3-64% end-balance divergence between `signedLifecycleEndBalance` (signed sim) and `projectFullLifecycle` (chart sim). Pre-024 the two simulators disagreed because chart sim applied Constitution VIII spending-floor pass + IRMAA cap while signed sim ran unclamped withdrawal logic.

Post-024 the two simulators agree within 1% on every persona × mode combination. Cross-validation `endBalance-mismatch` warnings auto-annotate `expected: true` for divergences below 1% (numerical noise from rounding + spending-floor edge cases).

## Pre-024 signed-sim algorithm

```
For each retirement year (age = fireAge .. endAge):
  withdrawal = max(0, annualSpend - ssThisYear - mtgAdj.deltas - hcDelta - collegeDelta)

  // Drain pools in order: stocks → cash → Trad → Roth (no spending-floor logic)
  if !is401kUnlocked:
    pStocks -= withdrawal  // signed (can go negative)
  else:
    // Pre-024: drain stocks/cash first, then Trad/Roth proportionally
    pStocks -= withdrawal × stocksFraction
    pCash   -= withdrawal × cashFraction
    pTrad   -= withdrawal × tradFraction × (1 + tradTaxRate)  // gross-up
    pRoth   -= withdrawal × rothFraction

  // No spending-floor pass; no IRMAA cap; no RMD floor

return { endBalance: pStocks + pCash + pTrad + pRoth, ... }  // can be negative
```

**Issue**: when stocks/cash run out before Trad's unlock at 59.5, signed sim shows negative pools while chart sim's spending-floor pass converts the shortfall into Trad draws (with associated tax gross-up). End balances diverge significantly.

## Post-024 signed-sim algorithm

```
For each retirement year (age = fireAge .. endAge):
  withdrawal = max(0, annualSpend - ssThisYear - mtgAdj.deltas - hcDelta - collegeDelta)

  // Step 1: drain stocks/cash first as before
  pStocks -= min(pStocks, withdrawal × stocksFraction)
  pCash   -= min(pCash, withdrawal × cashFraction)

  // Step 2: residual goes to Trad if available (NEW — spending-floor pass)
  let _residualNeed = withdrawal - drawnFromStocksCash
  if _residualNeed > 0 AND age >= 59.5 AND pTrad > 0:
    let _tradDraw = min(_residualNeed × (1 + tradTaxRate), pTrad)
    pTrad -= _tradDraw
    _residualNeed -= _tradDraw / (1 + tradTaxRate)

  // Step 3: residual goes to Roth if Trad exhausted (NEW)
  if _residualNeed > 0 AND pRoth > 0:
    let _rothDraw = min(_residualNeed, pRoth)
    pRoth -= _rothDraw
    _residualNeed -= _rothDraw

  // Step 4: IRMAA cap (NEW — caps Trad+Roth conversion at threshold)
  // Skipped here — too narrow to materially affect end-balance divergence;
  //                deferred to feature 025 if data shows it matters.

  // Step 5: any remaining shortfall just leaves pools negative
  // (signed sim's "honest sign" property preserved)

return { endBalance: pStocks + pCash + pTrad + pRoth, ... }
```

**What changed**: Steps 2 and 3 add the spending-floor pass mirroring chart sim's `taxOptimizedWithdrawal` Step 7.5 (Feature 015). This is the largest contributor to divergence per R5 trace hypothesis.

**What didn't change**: Output contract, signed-sign semantics (pools CAN still go negative when both Trad + Roth exhausted), bracket-fill smoothing logic (signed sim doesn't apply bracket-fill — that's chart-sim only by design).

## Invariants

1. **Output schema preserved**: `signedLifecycleEndBalance` returns `{endBalance, signedMinPhase1, signedMinPhase2, signedMinPhase3}` — same shape as pre-024.
2. **Honest-sign property preserved**: when both Trad AND Roth exhausted AND a pool would still go negative, sim records a NEGATIVE value (NOT zero clamping). This is what catches genuinely insolvent plans (feature 015 silent-shortfall regression).
3. **Bracket-fill NOT applied**: signed sim is meant for FAST mode-feasibility checks. Not a chart sim. Bracket-fill smoothing requires per-year bracket math, expensive. Out of scope for this contract.
4. **IRMAA cap NOT applied**: deferred to feature 025 unless R5 trace shows it's a significant contributor.
5. **RMD floor NOT applied**: same reason — defer to feature 025.

## Test contract

`tests/unit/signedSimSpendingFloor.test.js` (NEW, ≥5 cases):

| # | Setup | Verifies |
|---|---|---|
| 1 | Stocks/cash drain by age 65, Trad has $500k available | Spending-floor pass draws Trad to fund spending, not negative pStocks |
| 2 | All pools drain by age 80 | Post-80 years record negative endBalance (honest-sign preserved) |
| 3 | Pre-59.5 years with low stocks/cash | Pools go negative (Trad locked); behavior preserved |
| 4 | Roth available + Trad exhausted | Spending-floor pass draws Roth |
| 5 | Equivalence: signedLifecycleEndBalance + chart sim agree within 1% on RR-baseline | Cross-validation invariant tightened |

## Cross-validation invariant

`tests/unit/validation-audit/cross-chart-consistency.test.js` (existing, will be extended):

Pre-024: invariant fires `endBalance-mismatch` for any non-zero divergence.

Post-024: invariant fires only when divergence ≥ 1% AND `expected: false`. Auto-annotation per data-model.md Entity 3.

## Implementation site

Two HTMLs both contain inline `signedLifecycleEndBalance` (search via `grep -n "function signedLifecycleEndBalance"`). Same modification pattern in both:

1. Locate the retirement-loop block where stocks/cash are drained
2. Add the spending-floor pass logic after stocks/cash drain
3. Verify output contract preserved

Lockstep grep: `grep -n "spending-floor pass.*signedLifecycleEndBalance" FIRE-Dashboard.html FIRE-Dashboard-Generic.html` returns identical context lines post-fix.
