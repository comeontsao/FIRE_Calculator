# Contract — Bracket-Fill Algorithm

**Feature**: 007 Bracket-Fill Tax Smoothing
**Scope**: The `taxOptimizedWithdrawal` function (or its replacement) in both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## Purpose

Compute the per-year withdrawal mix that minimizes lifetime federal tax by filling the 12% ordinary-income bracket with Traditional 401(k) draws every accessible year, routing any excess above spending need into the taxable stocks pool (synthetic conversion). Detect and flag the four caveats (SS provisional-income, IRMAA, Rule of 55, 5-year Roth clock) so the chart renderer can surface them transparently.

Replaces the current "fill the 12% bracket only up to spend × 1.15" logic.

---

## Function Signature

Existing signature (keep):
```
taxOptimizedWithdrawal(
  grossSpend,        // number — target spending need (before SS offset)
  ssIncome,          // number — gross SS income this year
  pTrad,             // number — Traditional 401(k) balance at start of year
  pRoth,             // number — Roth 401(k) balance
  pStocks,           // number — taxable stocks balance
  pCash,             // number — cash balance
  age,               // integer — current age
  brackets,          // object — from getTaxBrackets(isMFJ)
  stockGainPct       // number (0..1) — fraction of each stock sale that is LTCG
)
```

Feature 007 adds a trailing object parameter for new controls:
```
taxOptimizedWithdrawal(
  ... (existing 9 args),
  options = {
    safetyMargin: 0.05,         // 0..0.10
    rule55: { enabled: false, separationAge: 54 },
    irmaaThreshold: 212000,     // 0 = disabled
  }
)
```

Defaults make the function safe to call with the old signature during the transition period. Callers are updated one by one to pass `options`.

---

## Return Shape

Existing fields (keep):
- `wTrad, wRoth, wStocks, wCash, rmd` — withdrawal amounts per pool
- `taxOwed, ordIncome, shortfall, ltcgTax, effRate` — tax metadata

New fields (feature 007):
- `syntheticConversion` — number (dollars) — excess Trad above net spend, to be added to `pStocks` at year-boundary
- `ssReducedFill` — boolean — true if taxable SS consumed > 20% of headroom this year
- `irmaaCapped` — boolean — true if bracket-fill was reduced to stay under IRMAA
- `irmaaBreached` — boolean — true if MAGI exceeds IRMAA even at wTrad = 0
- `rule55Active` — boolean — true if this year's Trad draw is a Rule-of-55 draw (age ∈ [55, 59.5) and rule55.enabled)
- `roth5YearWarning` — boolean — reserved; always false in feature 007
- `magi` — number — computed MAGI for this year (Trad + 0.85*SS + LTCG gain)
- `bracketHeadroom` — number — `(stdDed + top12) * (1 - safetyMargin) - 0.85*ssGross - rmd`

---

## Algorithm Steps

Run in order. Each step updates running state (proposed `wTrad`, `wRoth`, `wStocks`, `wCash`, flags).

### Step 0 — Resolve effective unlock age

```
effectiveUnlockAge = (rule55.enabled && rule55.separationAge >= 55) ? 55 : 59.5
canAccess401k = age >= effectiveUnlockAge
rule55Active = effectiveUnlockAge === 55 && age < 59.5 && age >= 55
```

### Step 1 — Forced RMD (age 73+)

Unchanged from current algorithm. RMD takes priority over bracket-fill.

```
if (age >= 73 && pTrad > 0):
  rmd = min(pTrad, pTrad / getRMDDivisor(age))
else:
  rmd = 0

wTrad = rmd
```

### Step 2 — Bracket-fill (bracket-fill headroom calculation)

```
taxableSS = ssIncome * 0.85
targetBracketCap = (brackets.stdDed + brackets.top12) * (1 - safetyMargin)
currentOrdIncome = taxableSS + rmd
bracketHeadroom = max(0, targetBracketCap - currentOrdIncome)

if (canAccess401k):
  proposedTrad = min(pTrad - rmd, bracketHeadroom)
  wTrad += proposedTrad
```

This is the KEY divergence from the retired algorithm. We no longer cap by `gapAfterRMD * 1.15`. We fill the bracket every year.

### Step 3 — Compute tax + net cash from Trad/RMD/SS

```
ordIncome = taxableSS + wTrad
taxable = max(0, ordIncome - brackets.stdDed)
taxOwed = calcOrdinaryTax(taxable, brackets)
netFromTradAndSS = ssIncome + wTrad - taxOwed
```

### Step 4 — Remaining spend → Roth

```
stillNeeded = max(0, grossSpend - netFromTradAndSS)

if (canAccess401k && pRoth > 0 && stillNeeded > 0):
  wRoth = min(pRoth, stillNeeded)
  stillNeeded -= wRoth
```

### Step 5 — Remaining spend → Taxable stocks (with LTCG)

Unchanged from current algorithm (iterative fixed-point solve for net after LTCG tax):

```
if (pStocks > 0 && stillNeeded > 0):
  // ... same as today ...
  wStocks = (iterated)
  ltcgTax = calcLTCGTax(wStocks * gainPct, ordTaxable, brackets)
  stillNeeded -= max(0, wStocks - ltcgTax)
```

### Step 6 — Remaining spend → Cash (last resort)

Unchanged:

```
if (pCash > 0 && stillNeeded > 0):
  wCash = min(pCash, stillNeeded)
  stillNeeded -= wCash
```

### Step 7 — IRMAA check (age 63+)

```
magi = wTrad + taxableSS + wStocks * gainPct
effectiveIrmaaCap = irmaaThreshold * (1 - safetyMargin)

if (irmaaThreshold > 0 && age >= 63 && magi > effectiveIrmaaCap):
  overage = magi - effectiveIrmaaCap
  tradReduction = min(wTrad - rmd, overage)  // can't reduce below RMD
  wTrad -= tradReduction
  irmaaCapped = true
  
  // Recompute tax + net
  // ... (rerun step 3, 4, 5 with new wTrad)
  
  // Check if we still breach (sometimes SS + stocks alone exceed)
  magi = wTrad + taxableSS + wStocks * gainPct
  if (magi > effectiveIrmaaCap):
    irmaaBreached = true
```

### Step 8 — Compute synthetic conversion

```
grossReceived = ssIncome + wTrad + wRoth + wStocks + wCash
totalTax = taxOwed + ltcgTax
netReceived = grossReceived - totalTax

if (netReceived > grossSpend):
  syntheticConversion = netReceived - grossSpend
else:
  syntheticConversion = 0
```

### Step 9 — Compute annotation flags

```
ssReducedFill = taxableSS > (targetBracketCap * 0.2)  // SS consumed >20% of headroom
// irmaaCapped / irmaaBreached set above
// rule55Active set in Step 0
roth5YearWarning = false  // reserved
```

### Step 10 — Return

```
return {
  wTrad, wRoth, wStocks, wCash, rmd,
  taxOwed: totalTax,
  ordIncome,
  shortfall: stillNeeded,
  ltcgTax,
  effRate: grossReceived > 0 ? totalTax / grossReceived : 0,
  // feature 007 additions:
  syntheticConversion,
  ssReducedFill,
  irmaaCapped,
  irmaaBreached,
  rule55Active,
  roth5YearWarning,
  magi,
  bracketHeadroom,
}
```

---

## Invariants

| # | Invariant |
|---|-----------|
| I-1 | `wTrad + wRoth + wStocks + wCash >= 0` always. |
| I-2 | `wTrad >= rmd` always (RMD takes priority). |
| I-3 | `ordIncome <= (stdDed + top12) * (1 - safetyMargin)` unless RMD forces overage OR IRMAA cap is binding (in which case ordIncome <= irmaaThreshold * (1 - safetyMargin)). |
| I-4 | `syntheticConversion >= 0`. |
| I-5 | If `age < effectiveUnlockAge` (pre-unlock), then `wTrad = 0 && wRoth = 0 && rmd = 0`. |
| I-6 | If `pTrad === 0`, then `wTrad = 0 && rmd = 0 && syntheticConversion = 0`. |
| I-7 | If `irmaaThreshold === 0`, then `irmaaCapped === false && irmaaBreached === false`. |
| I-8 | If `rule55.enabled === false`, then `rule55Active === false`. |
| I-9 | `roth5YearWarning === false` in feature 007 (reserved for future). |

---

## Caller pool-operation ordering (NON-NEGOTIABLE)

This ordering invariant resolves an ambiguity flagged during /speckit-analyze (finding U1). If both `mix.shortfall > 0` and `mix.syntheticConversion > 0` occur in the same year — a rare but possible edge case if, for example, the user's Trad bracket-fill produces excess AND stocks couldn't fund the remaining spend — the order in which those deltas are applied to `pStocks` determines whether the three primary consumers (`signedLifecycleEndBalance`, `projectFullLifecycle`, `computeWithdrawalStrategy`) produce identical signed-pool state before their respective clamp-or-keep-signed compounding steps. They must produce identical state or spec FR-063 cross-surface consistency fails.

**Required sequence per retirement year**, in every caller:

1. Subtract each pool's normal withdrawal: `pTrad -= mix.wTrad; pRoth -= mix.wRoth; pStocks -= mix.wStocks; pCash -= mix.wCash;`
2. Subtract shortfall from `pStocks` (signed): `if (mix.shortfall > 0) pStocks -= mix.shortfall;`
3. Add synthetic conversion to `pStocks` (signed): `if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;`
4. Compound. `signedLifecycleEndBalance` compounds signed pools as-is; `projectFullLifecycle` and `computeWithdrawalStrategy` clamp each pool to `Math.max(0, pool)` before multiplying by the return factor. (This clamp-vs-no-clamp difference is INTENTIONAL and inherited from feature 006 — the signed simulator's job is to detect infeasibility as negative end-balance; the chart consumers display zero-floored values. Steps 1–3 run identically in all three, producing identical signed intermediate state.)

**Why this order matters**: steps 2 and 3 commute mathematically (addition is associative), but applying them in a consistent order makes the code easier to audit and matches the natural meaning — "we fell short on spending THIS year, AND we also routed excess Trad back into the brokerage THIS year." Swapping the order produces the same numeric result in the signed case, but the clamped consumers would see a different transient state if Step 2 drove pStocks negative and Step 3 restored it; by applying the subtraction first and the addition second, the clamping at compounding time always sees the NET result, which is consistent across consumers.

**Implementation note**: all three caller tasks (T015/T016, T017/T018, T019/T020) MUST follow this sequence. A unit test in `bracketFill.test.js` for a hand-constructed scenario where both `shortfall > 0` AND `syntheticConversion > 0` asserts identical `pStocks` state at year-end across the three simulators.

---

## Caller integration

Three callers, all must pass the new `options` param:

1. **`signedLifecycleEndBalance`** (solver): reads `safetyMargin`, `rule55`, `irmaaThreshold` from `inp`, forwards to `taxOptimizedWithdrawal`. After the call, applies `pStocks += mix.syntheticConversion` before the compounding step. Generic-specific: also replaces the `getTaxBrackets(true)` at this call site with `getTaxBrackets(detectMFJ(inp))` (FR-069a regression fix).

2. **`projectFullLifecycle`** (chart renderer): same — reads options from `inp`, forwards, applies synthetic-conversion routing. Already uses `detectMFJ(inp)` correctly on Generic.

3. **`computeWithdrawalStrategy`** (Lifetime Withdrawal Strategy chart data): same — forwards options, applies synthetic-conversion routing. Adds the new flag fields to each `strategy.push({...})` row so the chart renderer can read them.

All three consumers use identical math. Feature-006 invariant preserved.

---

## Test Hooks (Phase 3 QA)

- Unit: bracket-fill with zero SS, zero RMD, ample Trad, $72K spend → `wTrad ≈ targetBracketCap`, `syntheticConversion > 0`, all flags false.
- Unit: bracket-fill with SS active consuming 40% of headroom → `ssReducedFill === true`, `wTrad` reduced by `0.85 * ssIncome`.
- Unit: synthetic-MAGI-$250K scenario → `irmaaCapped === true`, `magi <= irmaaThreshold * 0.95`.
- Unit: Rule of 55 enabled, age 56 → `wTrad > 0`, `rule55Active === true`.
- Unit: Rule of 55 disabled, age 56 → `wTrad === 0`, `rule55Active === false`.
- Unit: safety margin 0% vs 5% vs 10% → `targetBracketCap` monotonically decreasing; lifetime tax monotonically increasing.
- Unit: Trad balance < bracket headroom → `wTrad === pTrad`, `syntheticConversion` proportional to the shortage-vs-spend gap.
- Unit: Generic + filing status Single → bracket cap = (15000 + 47150) * 0.95 = 59042.50. Assertions on wTrad.
- Unit: age 73 RMD + bracket-fill → `wTrad >= rmd`, bracket-fill tops up to cap if room.
- Unit: no IRMAA breach at age 62 (pre-lookback) → `irmaaCapped === false` regardless of MAGI.
