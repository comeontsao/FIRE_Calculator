# Quickstart — Feature 018 Manual Verification

Browser-smoke checklist for verifying the Payoff-vs-Invest → Lifecycle merge in both dashboards. Runs against `file://` (double-click) and `http://` (`python -m http.server`).

## Prereqs

- Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` open in a browser.
- DevTools console visible — zero red errors expected on cold load; zero `[<shim-name>] canonical threw:` messages.
- All unit tests pass: `node --test tests/unit/payoffVsInvest.test.js` AND `node --test tests/unit/lifecyclePayoffMerge.test.js`.

## Smoke Steps

### S1. Backwards compat — switch defaults preserve feature-017 behavior

1. Load any saved-state file from feature 017 (or trigger a fresh page load with no localStorage).
2. Confirm: PvI tab's lump-sum checkbox is unchecked (default OFF). Lifecycle chart's mortgage-balance line follows the bank's contractual amortization. Brokerage line under each strategy is identical to feature 017's output.
3. **Pass:** numbers match feature 017 baseline (locked by SC-004 regression test).

### S2. PvI tab radio selector for mortgage strategy

1. On PvI tab, locate the new "Active mortgage strategy" radio group (FR-010, Q1=A). Three options: Prepay (extra → principal) / Invest, keep paying mortgage / Invest, lump-sum payoff.
2. Default selected: **Invest, keep paying mortgage** (matches v017 default behavior).
3. Click each radio; confirm the PvI chart and verdict banner update accordingly.

### S3. Sidebar mortgage indicator

1. Locate the new sidebar indicator (FR-005). Expected format: "Mortgage: {strategy} · paid off age {N}".
2. Toggle each strategy on PvI tab; sidebar indicator flips immediately.
3. Reload the page; indicator persists from `state._payoffVsInvest.mortgageStrategy`.

### S4. Full Portfolio Lifecycle chart reacts to Prepay

1. Set strategy = Prepay (extra → principal); set extra monthly = $1000.
2. On the Lifecycle chart, confirm:
   - Mortgage-balance line decays faster (accelerated payoff curve).
   - Brokerage line stays at $0 throughout the pre-payoff years (extra cash goes to principal).
   - After mortgage paid off (e.g., age 60), brokerage starts climbing as freed cash flow + extra redirects.
   - The mortgage-payoff age on the lifecycle chart matches the age shown on the PvI tab (within 1 year for rounding).

### S5. Lifecycle chart reacts to Invest + Lump-Sum

1. Set strategy = Invest, lump-sum payoff; extra = $1000, stocks = 7%.
2. On the Lifecycle chart, confirm:
   - Mortgage-balance line follows bank's amortization initially.
   - At the lump-sum trigger age, mortgage-balance drops to $0 in a single step.
   - Brokerage line shows a discrete drawdown at the same age, by `realBalance × (1 + ltcgRate × stockGainPct)` (the LTCG-grossed-up amount, FR-011).
   - Post-lump-sum, brokerage resumes climbing with redirected freed cash flow.

### S6. FIRE-age verdict reacts to strategy

1. Note the current "FIRE in N years (age X)" headline.
2. Toggle Prepay vs Invest. Headline updates if the feasible FIRE age changes.
3. The FIRE marker on the Lifecycle chart auto-moves to the new feasible age (FR-012, Q3=A); any prior manual drag is discarded.

### S7. Strategy ranker re-ranks

1. Choose a marginal scenario (FIRE-age right at the feasibility boundary).
2. Toggle Prepay vs Invest. Confirm the ranker's winning withdrawal strategy may flip; the lifecycle chart re-renders with the new winner's trajectory.

### S8. Sell-at-FIRE × Prepay (Scenario 2 in interaction matrix)

1. Set ownership=already-own with significant equity, mortgage rate=6%, sellAtFire=ON, strategy=Prepay, extra=$1000, FIRE age = 54.
2. On the PvI chart, confirm:
   - Both Prepay and Invest curves show a sell-event marker at age 54 (FR-015).
   - At age 54, both curves jump up by their respective equity-injection amounts.
   - Prepay's jump is larger (less mortgage to subtract).
   - Post-FIRE, both curves grow at the same real rate (parallel lines).
3. On the Lifecycle chart:
   - Mortgage-balance line drops to $0 at age 54.
   - Brokerage line gains the post-sale cash injection at age 54.
   - Retirement phase begins from the post-sale brokerage value.

### S9. Sell-at-FIRE × Invest-keep-paying (Scenario 4)

1. Same as S8 but strategy=Invest, lump-sum OFF.
2. Confirm:
   - PvI chart: bank's amortization curve until age 54; sell event marker at 54; smaller jump (more mortgage subtracted from proceeds).
   - Lifecycle chart: mortgage line stops at 54; brokerage gains less than under Prepay.

### S10. Sell-at-FIRE × Invest+Lump-Sum, lump-sum fires PRE-FIRE (Scenario 6 sub-case A)

1. Set strategy=Invest+Lump-Sum, sellAtFire=ON, FIRE age=54. Use a high-return scenario (stocks=12%, extra=$3000).
2. Configure such that lump-sum fires at age ~50 (pre-FIRE).
3. Confirm:
   - PvI chart shows BOTH events: blue down-arrow at age 50 (lump-sum), green star at age 54 (sale).
   - At age 50, brokerage drops; mortgage = $0.
   - At age 54, full home value × (1 − sellingCostPct − capGainsTax) injected.
4. Lifecycle chart shows both events visually.

### S11. Sell-at-FIRE × Invest+Lump-Sum, lump-sum trigger inhibited (Scenario 6 sub-case B)

1. Same as S10 but use a low-return scenario where lump-sum WOULD fire post-FIRE if not inhibited.
2. Confirm:
   - `lumpSumEvent === null` (verifiable via copyDebugInfo).
   - PvI chart shows ONLY the sell-at-FIRE event (no blue down-arrow).
   - Lifecycle chart matches.

### S12. Section 121 boundary cases

1. **Case A — full exclusion applies (no tax):** home appreciated by less than $500K (MFJ) at sale. Confirm `homeSaleEvent.taxableGain === 0` and `capGainsTax === 0`.
2. **Case B — partial taxation:** home appreciated by more than $500K. Confirm `taxableGain === gain - 500000` and `capGainsTax === taxableGain × ltcgRate`.
3. **Case C — single filer:** Generic dashboard with `singlePerson=true`, exclusion = $250K. Verify the cap is $250K, not $500K.
4. **Case D — home sold at loss:** rare, possible. Confirm `taxableGain === 0` and `capGainsTax === 0`; no negative tax credit emitted.

(Each case verifiable via `copyDebugInfo` payload's `homeSaleEvent` field.)

### S13. Audit tab reflects new subSteps

1. Open the Audit tab.
2. With strategy=Invest+Lump-Sum, sellAtFire=ON, lump-sum firing, confirm the flow diagram shows:
   - "resolve active mortgage strategy: invest-lump-sum"
   - "compute lifecycle mortgage trajectory under invest-lump-sum"
   - "apply lump-sum trigger month-by-month for Invest"
   - "lump-sum LTCG gross-up: realBalance × (1 + ltcgRate × stockGainPct) = $X"
   - "evaluate sell-at-FIRE event at age 54"
   - "Section 121 exclusion: nominalGain=$X, exclusion=$Y, taxableGain=$Z"
   - "home-sale capital gains tax: taxableGain × ltcgRate = $T"
   - "credit post-sale brokerage at FIRE = $B"
   - "lifecycle handoff: pre-FIRE simulator → retirement-phase simulator (postSaleBrokerage = $B)"
3. Toggle to Prepay; confirm the sub-steps update to reflect the new strategy (lump-sum-related lines disappear).

### S14. Copy Debug payload extension

1. Click the "Copy Debug Info" button (bottom-right).
2. Paste the JSON. Confirm the following keys are present (FR-019):
   - `mortgageStrategy: '<active strategy>'`
   - `mortgageActivePayoffAge: <number>`
   - `lumpSumEvent: <object | null>`
   - `homeSaleEvent: <object | null>`
   - `postSaleBrokerageAtFire: <number>`
   - `feasibilityProbe.activeMortgageStrategy === mortgageStrategy` (LH-Inv-1).

### S15. Bilingual (Principle VII)

1. Toggle EN ↔ 中文.
2. Confirm every new string flips: PvI radio labels, sidebar indicator template, sell-marker chart label, audit subStep prefixes (where translatable).
3. No English remnants in the new UI elements.

### S16. Lockstep (Principle I)

1. Run S1–S15 on `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.
2. Numbers may differ between RR and Generic only by personal-content / single-person-mode differences (`mfjStatus` defaults to single in Generic when single-person mode is on); structure and dynamics identical.

## Pass criteria

All 16 steps pass on both dashboards under both `file://` and `http://` delivery modes. Console clean. Browser-smoke gate per `CLOSEOUT.md` (when authored) signed off before merging to main.
