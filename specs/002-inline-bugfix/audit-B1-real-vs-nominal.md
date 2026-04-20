# B1 Adjudication — Healthcare & College: Real or Nominal?

Independent audit. No prior artifacts read beyond the five evidence items below.

---

## E1. Healthcare table definition

**Quote — `FIRE-Dashboard.html:2442-2452`:**

```
2442: // Per-country healthcare monthly USD (family of 4 pre-65, couple Medicare-equivalent post-65).
2443: \ Research: see FIRE-Dashboard-Roadmap.md Appendix A. User can override via #hcOverridePre65 / #hcOverridePost65.
2444: // Baseline $400/mo represents what the scenario.annualSpend values implicitly include, so the
2445: // drawdown model adds (effective hc - baseline) as a delta to avoid double-counting.
2446: const HC_BASELINE_MONTHLY = 400;
2447: const HEALTHCARE_BY_COUNTRY = {
2448:   us:          { pre65: 1800, post65: 700, ... },
2449:   taiwan:      { pre65: 250,  post65: 100, ... },
```

**Hypothesis:** Values are present-day USD. The rates map to current-market products (ACA silver, Medicare B+Medigap, NHI, AIA/Cigna). These are quotes you could call a broker for TODAY.

**Counter-check:** Is there an anchor year baking these into nominal 20xx dollars? No — the constant is declared once, referenced directly, no date tag, no inflation index attached. The comment ties the $400 baseline to `scenario.annualSpend` (also real — see E3). Hypothesis stands: **real dollars**.

---

## E2. Healthcare consumption site

**Quote — `FIRE-Dashboard.html:2502-2503`:**

```
2502: function getHealthcareDeltaAnnual(scenarioId, age) {
2503:   return (getHealthcareMonthly(scenarioId, age) - HC_BASELINE_MONTHLY) * 12;
```

**Four call sites:**

- Line 3822-3823 (`signedLifecycleEndBalance` retirement branch): `hcDeltaNominal = getHealthcareDeltaAnnual(...); hcDelta = hcDeltaNominal / Math.pow(1 + inp.inflationRate, yearsFromNow);`
- Line 4020 (`signedLifecycleEndBalance` tax-aware path): `const hcDelta = getHealthcareDeltaAnnual(...)` — NO conversion.
- Line 4326-4327 (`projectFullLifecycle`): same `/Math.pow(1+inflation, yearsFromNow)` conversion.
- Line 4655 (`computeWithdrawalStrategy` strategy loop): `const hcDelta = getHealthcareDeltaAnnual(...)` — NO conversion.

**Hypothesis:** Two of the four sites were recently changed to treat the table value as nominal and divide. The other two still treat it as real. The variable name `hcDeltaNominal` on lines 3822/4326 is a *post-hoc label*, not evidence of the table's nature.

**Counter-check:** Is there any OTHER spot multiplying by `(1+inflation)^n` upstream so the delta arrives at consumption already inflated? Grep result: no — `getHealthcareDeltaAnnual` is called directly at all four sites with no wrapper. The function itself (line 2502-2503) does zero inflation math. Hypothesis stands: **the table is real, consumed as real at 2 sites, and erroneously "converted" at 2 sites**.

---

## E3. Healthcare receiving variable (`retireSpend` in the projection loop)

**Quote — `FIRE-Dashboard.html:3705-3717`:**

```
3705: function signedLifecycleEndBalance(inp, annualSpend, fireAge) {
3706:   const realReturnStocks = inp.returnRate - inp.inflationRate;
3707:   const realReturn401k = inp.return401k - inp.inflationRate;
...
3716:   const mtgAdj = getMortgageAdjustedRetirement(annualSpend, yrsToFire);
3717:   const retireSpend = mtgAdj.annualSpend;
```

**And scenario source — `FIRE-Dashboard.html:2383`:**

```
2383: { id: 'us', ..., annualSpend: 120000, comfortableSpend: 120000, normalSpend: 78000, ... },
```

**Hypothesis:** The engine is explicitly a **real-dollar engine**. Returns are inflation-stripped (`returnRate - inflationRate`). Pools grow at real rates (lines 3812-3815, 3854: `pStocks * (1 + realReturnStocks)`). `retireSpend` is pulled from static `annualSpend = 120000` sliders with no year-indexing — it stays $120k in year 1 AND year 40. That is the signature of real dollars.

**Counter-check:** Is `retireSpend` ever multiplied by `(1+inflation)^n` before the healthcare+college additions? Search: no. The only inflation mentions in the projection loops are the `realReturn*` subtractions at function top, which move the simulation *into* real space, not out of it. So `retireSpend + hcDelta + collegeCostThisYear` is `real + real + real = real` — which is exactly what the loop needs. Adding the B1 "fix" makes the expression `real + (real / (1+π)^n) + (real / (1+π)^n) = real + shrinking + shrinking`, i.e., healthcare and college *artificially disappear over time*.

---

## E4. College (combined E1 + E2 + E3)

**E4a — Table definition `FIRE-Dashboard.html:2553-2557`:**

```
2553: // ==================== COLLEGE BY COUNTRY ====================
2554: // Annual all-in cost in TODAY's USD (tuition + room + board + books + travel).
2555: // Durations assumed 4 years — adjust `years` if needed.
2556: \ Sources: 2024-25 published rates; international undergrad pricing where applicable.
2557: const COLLEGE_BY_COUNTRY = {
```

**Explicit declaration: "TODAY's USD"**. No ambiguity.

**E4b — Consumption site `FIRE-Dashboard.html:2619-2626`:**

```
2619: function getTotalCollegeCostForYear(inp, yearsFromNow) {
...
2624:   return getKidYearExpense(kid1AgeThen, inp.collegeKid1 || 'us-private', ...)
2625:        + getKidYearExpense(kid2AgeThen, ...);
2626: }
```

No inflation math inside. Just table lookup + optional loan-amortization math (also in real dollars — flat-rate loan payment against fixed principal).

**E4c — Receiving variable:** Same loops as healthcare — added to `retireSpend` (real) OR subtracted from `inp.monthlySavings * 12` (also real, since slider values are constant today's dollars). Line 3814: `effAnnualSavings = Math.max(0, inp.monthlySavings * 12 - mtgAdjust - collegeCostThisYear - h2Carry);` — every summand is a real-dollar slider value; college here must match.

**Four call sites of `getTotalCollegeCostForYear`:** Same two-vs-two split as healthcare. Lines 3808-3809 and 4324-4325 divide by `(1+π)^n` as "B1 fix"; lines 4019 and 4656 use it raw.

**Verdict for college:** Table is real → consumed as real → needs to stay real when added.

---

## E5. Canonical engine (`calc/healthcare.js`, `calc/college.js`)

**`calc/healthcare.js:20-39`:**

```
20:  * Outputs: HealthcareCost (data-model.md §6, with phase enum)
21:  *   {
22:  *     annualCostReal: number,                     // > 0, real dollars
23:  *     phase:          'prefire' | 'aca' | 'medicare',
...
36:  *   - All cost values are real dollars. Overrides, scenario defaults, and
37:  *     outputs live in the same real-dollar space — no nominal conversion
38:  *     happens here (FR-017). Callers convert via calc/inflation.js at the
39:  *     boundary if they hold nominal inputs.
```

**`calc/college.js:30, 60`:**

```
30:  *       costReal:          number,  // summed across overlapping kids
...
60:  *   - All values real dollars — no inflation conversion happens here.
```

**Hypothesis:** Canonical modules treat both as **real**. Output contract names the field `annualCostReal` / `costReal`. An explicit invariant at `healthcare.js:36-39` says "real-dollar space — no nominal conversion happens here. Callers convert via calc/inflation.js at the boundary if they hold nominal inputs" — i.e., the canonical contract is that the inline table (its sibling) is also real, and no conversion is needed when they are fed to a real-dollar projection engine.

**Counter-check:** Is there a caller-side wrapper around the canonical modules that secretly inflates? Not relevant to this audit — we're adjudicating the inline code. But the canonical modules' contract is a tie-breaker: they codify the intent as "real throughout." The inline B1 "fix" breaks this intent.

---

## Verdict

**VERDICT A — Tables are ALREADY REAL.** The healthcare and college tables are declared in today's purchasing-power USD, consumed without inflation indexing, and added to an explicitly real-dollar projection loop (real returns, constant-dollar `retireSpend`, constant-dollar `monthlySavings`); the B1 "fix" that divides by `Math.pow(1+inflation, yearsFromNow)` at 4 of the 8 total call sites in the two HTML files is an error that makes healthcare and college costs shrink toward zero in later years (e.g., at 3% inflation, year-30 college falls to ~41% of its real value — a $85K kid becomes a $35K kid in the sim).

## Recommendation for feature 002

**Revert the B1 "fix" at all four inline call sites** (`FIRE-Dashboard.html:3808-3809, 3822-3823, 4324-4325, 4326-4327` and the corresponding blocks in `FIRE-Dashboard-Generic.html` including lines 3566-3579 and 4043-4047). After reverting, all eight call sites across both files will read the tables raw and add them to `retireSpend`/`effAnnualSavings` as real dollars — consistent with the canonical `calc/healthcare.js` and `calc/college.js` contracts and with the "TODAY's USD" comment in the table definition. If baseline tests depended on the broken B1 behavior, regenerate those baselines after revert. Before landing, add a regression test that pins healthcare delta at year 30 to its raw table value (not the shrunken value) so this cannot silently reintroduce.
