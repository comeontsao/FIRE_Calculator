# Contract: Chart ↔ Module Consumers

**Feature**: 010-country-budget-scaling
**Owner**: Frontend + Backend Engineers jointly.
**Purpose**: Enumerate every renderer that currently reads scenario spend (directly or transitively) and specify the required update to each, per Constitution Principle VI.

Every listed render site MUST, in the same commit as the calc-helper addition:

1. Replace any direct read of `s.annualSpend` / `s.normalSpend` / `s.comfortableSpend` with a call to `getScaledScenarioSpend(s, tier, inp.adultCount, scenarioOverrides)`.
2. For Lifecycle-chart-class consumers that compute year-by-year spend requirements, add `calcPerChildAllowance(childrenList, year, inp.fireYear)` to the post-FIRE spend for each projection year.
3. Add a comment at the top of its render function naming the two contract files:
   ```js
   // Consumes: scaling-formula.contract.md::getScaledScenarioSpend
   //           child-allowance.contract.md::calcPerChildAllowance (Lifecycle consumers only)
   ```

---

## Consumer table

Line numbers are approximate and refer to the state of `FIRE-Dashboard-Generic.html` at feature 010 start. Actual numbers MAY drift as the feature is implemented — tasks regenerate exact positions.

| # | Render site / function | Current read | Replacement | Allowance? |
|---|------------------------|--------------|-------------|-----------|
| 1 | `renderScenarioCards()` / country comparison grid (~line 10301) | `s.annualSpend`, via the `sSpend` local | `getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, scenarioOverrides)` | No (country card shows annual only) |
| 2 | `scenarioInsight` deep-dive panel (~line 10312) | `s.annualSpend.toLocaleString()` inside the `Annual Budget:` summary line | same accessor, then format | No (deep-dive shows annual only) |
| 3 | `getScenarioEffectiveSpend(s)` (~line 10356) | `s.annualSpend + (s.visaCostAnnual || 0)` | `getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, scenarioOverrides) + (s.visaCostAnnual || 0)` | No (per-year allowance layered separately by Lifecycle consumers) |
| 4 | Full Portfolio Lifecycle chart — spend-curve input for each post-FIRE year (~line 7040 and similar in the projection loop) | Currently reads the post-FIRE `annualSpend` once and projects flat | Read the scaled value once per recalc, ADD `calcPerChildAllowance(childrenList, yr, inp.fireYear)` at each projected year, then hand the resulting spend requirement array to the active withdrawal strategy | Yes |
| 5 | Portfolio Drawdown (With SS) chart | Same path as Lifecycle for post-FIRE years | Same replacement as row 4 | Yes |
| 6 | Portfolio Drawdown (Without SS) chart | Same path for the "no-SS" counterfactual | Same replacement as row 4 | Yes |
| 7 | Strategy Compare card — per-strategy lifetime-requirement numbers | Reads `getScenarioEffectiveSpend(s)` and flat-projects | Consume row-3's updated return value; add allowance per year via `calcPerChildAllowance` for post-FIRE years | Yes |
| 8 | Blended healthcare delta (if any branch reads country spend directly) | Any direct read of `s.annualSpend` outside the above sites | Route through `getScaledScenarioSpend` | No |
| 9 | Country Two-Phase FIRE number (`getTwoPhaseFireNum`) — called with `getScenarioEffectiveSpend(s)` | Inherits row 3's correction automatically | No code change at this call site; verified by fixture | No |
| 10 | `calcSimpleFIRENumber(sSpend, inp.swr)` call sites (~line 10300–10301) | `sSpend` is currently the raw annual | Re-compute `sSpend` via `getScaledScenarioSpend` before calling; otherwise no change | No |

---

## Strategy precedence (FR-015e / FR-015f / FR-015g)

The spend requirement per year (row 4+) is computed **once** and passed as input to the selected withdrawal strategy. The strategy is the single authority for how the requirement is funded (which account, which tax bracket, which year to take Social Security). This contract does NOT modify any strategy's internal drawdown logic. In particular:

- The adults-only factor never enters a strategy's body.
- The per-child allowance is added to the REQUIREMENT array passed to the strategy, not to the strategy's output.
- Swapping strategies (DWZ → SAFE → bracket-fill → low-tax) at fixed household composition MUST leave the requirement array byte-for-byte identical — asserted by the `strategyVsRequirement` fixture.

Pseudo-code for the Lifecycle chart post-FIRE loop (illustrative):

```js
// Feature-010 change: compute requirement array THEN dispatch to strategy.
const requirement = [];
for (let yr = inp.fireYear; yr <= projectionEndYear; yr++) {
  const baseScaled = getScaledScenarioSpend(s, inp.lifestyleTier, inp.adultCount, scenarioOverrides);
  const allowance = calcPerChildAllowance(childrenList, yr, inp.fireYear);
  const college = existingCollegeTuitionForYear(childrenList, yr);
  const visa = s.visaCostAnnual || 0;
  requirement.push(baseScaled + allowance + college + visa);
}
const drawdownPlan = activeStrategy.run(inp, requirement, startingPortfolio);
renderLifecycleChart(drawdownPlan);
```

`requirement` is computed by pure helpers; `activeStrategy.run(...)` is the existing strategy API, unchanged.

---

## Verification checklist (Frontend + QA)

After implementation:

- [ ] Every row 1–10 call site has a `// Consumes: …` comment naming the two contract files.
- [ ] Grep `FIRE-Dashboard-Generic.html` for `s.annualSpend` and `s.normalSpend` and `s.comfortableSpend` — every remaining hit is inside `getScaledScenarioSpend` itself or a dev-only debug line.
- [ ] Lifecycle chart visually shows a stepped post-FIRE spend curve when children are present (allowance ramps at ages 13, 15; drops at college start).
- [ ] Switching the withdrawal strategy dropdown (DWZ ↔ SAFE ↔ bracket-fill ↔ low-tax) at a fixed household composition produces different drawdown curves but the underlying requirement curve does not move (spot-check via debug logging or a QA fixture assertion).
