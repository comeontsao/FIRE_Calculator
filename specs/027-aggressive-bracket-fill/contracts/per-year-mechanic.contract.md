# Contract — `taxOptimizedWithdrawal.options.aggressiveSmoothingMultiplier` (US1)

**Scope:** the new numeric option on the inline `taxOptimizedWithdrawal` function at `FIRE-Dashboard.html:10787` and parallel in Generic.

**Anchored to:** spec FR-002, FR-003, FR-004, FR-005, FR-006, FR-007; SC-001, SC-006.

**Revision (2026-05-07):** Renamed from `disableSmoothingCap` (boolean → "no cap") to `aggressiveSmoothingMultiplier` (number → "scale the cap"). Reason: the original boolean flag emptied the per-year cap entirely, causing the 12% bracket to fill maximally in 4 specific years and creating a chart with tall red bars in 60-63. User feedback (2026-05-07 screenshot review) clarified that the intended behavior was "spread Trad evenly across retirement, just bump up by ~1 bracket". The numeric multiplier scales the smoothing cap rather than removing it.

---

## Option definition

```ts
options.aggressiveSmoothingMultiplier?: number   // default: 1 (when absent or ≤ 1)
```

When `> 1`, the function's Step 2 (bracket-fill computation) **multiplies** the per-year smoothed cap so MORE Trad flows each year while still spreading evenly across the retirement horizon:

| Condition | Step 2 behavior |
|-----------|----------------|
| `aggressiveSmoothingMultiplier > 1` AND `canAccess401k === true` AND `ssIncome === 0` | `wTrad = rmd + min(pTrad − rmd, bracketHeadroom, multiplier × smoothedTarget)` |
| `aggressiveSmoothingMultiplier > 1` AND (`!canAccess401k` OR `ssIncome > 0`) | Multiplier ignored. Apply unscaled smoothed cap (today's behavior). |
| `aggressiveSmoothingMultiplier ≤ 1` OR absent | Apply unscaled smoothed cap. **Byte-identical to today** for backwards compat. |

The strategy registry passes `aggressiveSmoothingMultiplier: 2` (= 2× the smoothed cap). Higher values are technically valid but not currently used by any registered strategy.

## Step 2 reference implementation

Replaces `FIRE-Dashboard.html:10832-10854` (and parallel in Generic):

```js
let wTrad = rmd;
let aggressiveActive = false;
if (canAccess401k) {
  const yearsRemaining = Math.max(1, endAgeOpt - age);
  const smoothedTarget = Math.max(0, pTrad - rmd) / yearsRemaining;
  const aggressiveMult = (typeof opts.aggressiveSmoothingMultiplier === 'number'
                          && opts.aggressiveSmoothingMultiplier > 1)
    ? opts.aggressiveSmoothingMultiplier : 1;
  const useAggressive = aggressiveMult > 1 && ssIncome === 0;
  const effectiveSmoothedTarget = useAggressive
    ? smoothedTarget * aggressiveMult
    : smoothedTarget;
  const additionalTrad = Math.min(
    Math.max(0, pTrad - rmd),
    bracketHeadroom,
    effectiveSmoothedTarget
  );
  if (useAggressive && additionalTrad > smoothedTarget + 0.01) aggressiveActive = true;
  wTrad += additionalTrad;
}
// Pass aggressiveActive into the return shape so caveats reflect it.
```

## Caveat field

The function's return object's `caveats` (or top-level fields if caveats is structured differently) gains:

- `aggressiveActive: boolean` — true iff the no-cap branch above actually ran. False otherwise.

## Constitution VIII (Spending Funded First) — UNCHANGED

The aggressive policy modifies Step 2 only. Step 7.5 (spending-floor pass) remains identical:

- If `wTrad + wRoth + wStocks + wCash + ssIncome` cannot fund `grossSpend + tax`, the spending-floor pass runs and `shortfall` is set accordingly.
- The aggressive policy does NOT bypass the floor pass.
- For the SC-026-A fixture, no shortfall is expected (verified by US2 head-to-head harness — `hasShortfall: false` across all 41 retirement years for both strategies).

## RMD floor (Step 1) — UNCHANGED

For ages ≥ 73, `rmd = pTrad / RMD_DIVISOR(age)` is computed before Step 2. Aggressive policy adds `additionalTrad` ON TOP OF rmd. RMD is mandatory regardless.

## IRMAA cap (Step 7) — UNCHANGED

If aggressive's larger `wTrad` pushes `magi > irmaaThreshold`, Step 7's IRMAA cap re-runs Step 3-6 with reduced `wTrad`. Aggressive operates inside the IRMAA framework — does not breach Tier 1 silently.

For SC-026-A: `wTrad ≈ $118K + $50K SS taxable = $168K MAGI` at age 70. IRMAA Tier 1 = $212K. Aggressive stays below Tier 1 for SC-026-A. Higher-income scenarios (e.g., $300K spend / $1M Trad) MAY trigger IRMAA cap; the cap correctly throttles Trad.

## Synthetic conversion (Step 8) — REINVESTMENT MECHANIC

When aggressive's larger `wTrad` exceeds `grossSpend + tax`, Step 8 sets `syntheticConversion = netReceived − grossSpend`. Caller (signed sim line 9170 + chart sim line 10549) adds this to `pStocks`. **No new code path needed for reinvestment** — verified in `research.md` Section 3.

## Acceptance test (FR-018)

`tests/unit/aggressiveBracketFill.test.js` MUST verify:

1. **Backward compat:** for all 7 existing strategies' fixtures, `taxOptimizedWithdrawal` output is byte-identical when called with `aggressiveSmoothingMultiplier: 1` vs the option absent. (Multiplier > 1 is allowed to differ — that's the point.)
2. **Multiplier path engages at age 65:** `canAccess401k: true, ssIncome: 0, pTrad: $660K, endAge: 100, brackets: MFJ-2024, aggressiveSmoothingMultiplier: 2` → `wTrad ≈ $37,714` (= 2 × 660000/35). The bracketHeadroom ($118,085) is much larger than the doubled smoothed target so the multiplier is the binding constraint. `aggressiveActive: true`.
3. **Multiplier ignored post-SS:** at age 70 with `ssIncome: $58,896, pTrad: $400K, endAge: 100, aggressiveSmoothingMultiplier: 2` → `wTrad < $15K` (unscaled smoothed cap because `ssIncome > 0`).
4. **Pre-unlock blocks both paths:** at age 55 with `canAccess401k: false, aggressiveSmoothingMultiplier: 2` → `wTrad === 0`.
5. **Spending-floor pass intact:** scenario where pools cannot fund spending → `shortfall ≈ 0` after floor pass runs and `hasShortfall: true` flag set if pools insufficient, regardless of multiplier value.
6. **SC-026-A pin (post-rework):** running aggressive (multiplier 2) across the full 55→100 retirement at SC-026-A produces lifetime tax ∈ [$134,811, $149,001] real-$ (= $141,906 ± 5%) and terminal BV ∈ [$1,097,550, $1,213,082] real-$ (= $1,155,316 ± 5%). These targets are slightly milder than the original full-bracket variant ($116,507 / $1,129,821) but still beat baseline smoothed ($165,920 / $627,918) by $24K tax savings + $527K extra estate.

## Backwards compat with existing 7 strategies

When `BRACKET_FILL_SMOOTHED.computePerYearMix(ctx)` runs (no `disableSmoothingCap` set), Step 2 takes the cap path. Output byte-identical to today. The other 6 strategies' helpers (`_drawByPoolOrder`, etc.) don't call `taxOptimizedWithdrawal` at all, so they're unaffected.
