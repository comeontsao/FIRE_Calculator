# Quickstart — Feature 017 Manual Verification

This is the smoke checklist for verifying the Stage Model & Lump-Sum Payoff feature lands correctly in both dashboards. Runs against either `file://` (double-click) or a local `python -m http.server` — both delivery modes must work per Constitution Principle V.

## Prereqs

- Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` open in a browser.
- DevTools console visible — there must be **zero red errors** and zero `[<shim-name>] canonical threw:` messages on cold load.
- `tests/unit/payoffVsInvest.test.js` passes locally: `node --test tests/unit/payoffVsInvest.test.js` returns green.

## Smoke Steps

### S1. Switch defaults to OFF; current numbers preserved

1. Open RR dashboard. Navigate to the **Payoff vs Invest** tab.
2. Confirm a new checkbox below the "Extra monthly cash to allocate" slider, labeled "Pay off mortgage in lump sum once Invest can afford it" — **unchecked by default**.
3. Confirm the verdict banner, brokerage chart, amortization chart, and factors panel show the **same numeric values** as before this feature shipped (or as the parity reference for any saved scenario).
4. Repeat on the Generic dashboard. Numbers may differ between RR and Generic only by personal-content differences; structure and dynamics are identical.

### S2. Stage bands render under the curves

1. With the switch still OFF, scroll to the brokerage chart.
2. Confirm three faintly tinted background bands behind the curves (Stage I → II → III), corresponding to: window start → Prepay's natural payoff → Invest's natural payoff → end.
3. Hover the chart legend — the stage labels appear in the tooltip area or as a side legend ("Stage I — both strategies still paying mortgage", etc.).
4. Bands MUST be readable but unobtrusive — opacity ≈ 6%, no overpowering of the curves.

### S3. Pre-buy-in window collapses (`ownership='buying-in'` only)

1. In the dashboard inputs, set ownership to `buying-in`, `buyInYears = 2` (or any other non-zero value), `currentAge = 42`.
2. Navigate to Payoff vs Invest tab.
3. Confirm the brokerage chart's x-axis **starts at age 44** (= 42 + 2), not age 42.
4. Confirm both Prepay and Invest curves start at exactly **$0K** at age 44 — no pre-buy-in compounding artifact.
5. Confirm the yellow "home purchase" diamond marker is **not** present (the window starts at the buy-in age, making the marker redundant).

### S4. Lump-sum switch ON — typical case (Prepay-first)

1. Use a scenario where 6%/4% real spread, mortgage rate ≈ 6%, stocks return ≈ 7%, extraMonthly = $1000 (the screenshot's scenario).
2. Toggle the switch ON.
3. Confirm the brokerage chart re-renders within ~100ms.
4. Confirm the **Invest line shows a sharp downward step** at the lump-sum age — the curve drops from a peak near the remaining-mortgage-real value to ≈ $0, then resumes upward growth.
5. Confirm a **blue down-arrow marker** at the lump-sum age (replaces the prior blue X at the natural payoff age).
6. Confirm the verdict banner gains a third line: "Lump-sum payoff fires at age {X} · brokerage drops from ${Y} to ${Z}, then resumes investing."
7. Reload the page — the switch state persists (was saved to `localStorage.pvi.lumpSumPayoff`).

### S5. Lump-sum switch ON — high-return case (Invest-first)

1. Crank stocksReturn to 0.12 and extraMonthly to $3000.
2. Switch still ON.
3. Confirm the **Invest line drops BEFORE Prepay's curve hits $0** — i.e., the lump-sum trigger fired before Prepay's accelerated payoff finished.
4. Confirm the Stage II band hover label reads "II-I — Invest debt-free via lump sum, Prepay still paying" (the II-I sub-case).
5. Confirm both curves end up debt-free, then both invest in parallel through Stage III.

### S6. Lump-sum switch ON — never-fires case

1. Set stocksReturn = 0.04, extraMonthly = $200.
2. Switch ON.
3. Confirm the Invest curve does **not** drop — the trigger condition never met.
4. Confirm the verdict banner shows the italic note: "Invest never reaches the lump-sum threshold in this horizon."
5. Confirm no errors in console.

### S7. Bilingual check (Principle VII)

1. Toggle the language switch from EN → 中文.
2. Confirm every new string flips: switch label, switch help, banner Line 3, never-reached note, four stage-band hover labels.
3. Confirm no English remains in the new UI elements.

### S8. Lockstep parity (Principle I)

1. Run S1 through S7 on `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.
2. Same scenario inputs (currentAge=42, buyInYears=2, 6%/4%, etc.) → same payoff ages, same lump-sum age, same band layout, same banner text.
3. Any divergence is a Principle I violation and blocks merge.

### S9. Audit observability (Principle II)

1. With switch ON and lump-sum firing, open the Audit tab (if present in the build).
2. Confirm `subSteps` for the Payoff-vs-Invest stage includes:
   - `'check lump-sum payoff trigger each month for Invest'`
   - `'lump-sum fires at age {X}: brokerage drops from {Y} to {Z}'`
   - `'compute stageBoundaries from path inflection points'`
3. With ownership='buying-in' and buyInYears > 0, confirm the additional sub-step:
   - `'window starts at buy-in age (year offset {N})'`

## Pass criteria

All nine steps pass on both dashboards in both `file://` and `http://` delivery modes. Console clean. Browser smoke gate per `CLOSEOUT.md` (when authored) signed off before merging to main.
