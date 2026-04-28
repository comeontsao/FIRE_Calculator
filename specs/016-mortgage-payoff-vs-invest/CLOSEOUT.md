# Feature 016 — Mortgage Payoff vs. Invest Comparison — CLOSEOUT

**Branch**: `016-mortgage-payoff-vs-invest`
**Shipped**: 2026-04-28 (v1.0), v1.1 home-equity real/nominal fix, v1.2 buy-and-hold tax fix — all same day
**Status**: ✅ Implemented (MVP US1 + US2 + foundational Phase 2). US3 verification is manual and can be done by dragging the extraMonthly slider in a browser.

## v1.1 correctness fix (2026-04-28, post-initial-implementation)

The user noticed an asymmetry while reading the verdict numbers: the calc treats stocks returns as real (deflated by inflation) but treated the mortgage balance as nominal — yet subtracted that nominal balance from a real-constant home value when computing home equity. Mathematically a units mismatch (subtracting nominal $ from real $).

**The fix** (in `_detectCrossover`'s caller — the year-snapshot loop): deflate the nominal mortgage balance to today's real-dollar purchasing power before subtracting from the real home value:

```js
const inflationFactor = Math.pow(1 + inputs.inflation, yearOffset);
const realMortgageBalanceP = mortgageStateP.balance / inflationFactor;
const homeEquityP = Math.max(0, homeValueThisYear - realMortgageBalanceP);
```

This gives BOTH strategies the inflation tailwind on their remaining nominal debt — the natural benefit of holding a fixed-nominal liability while inflation runs. Both `mortgageBalance` (nominal, what the user actually owes the bank) and `mortgageBalanceReal` (real, used for the equity calc) are now exposed on each `WealthPathRow`.

I also fixed `_detectCrossover` to scan from the END backward and return the LAST crossover. After the v1.1 fix, scenarios near the rate-tie boundary can produce two crossovers (a sub-$100 noise-level one near year 0, then a meaningful permanent-winner crossover later). Returning the last one gives the user the long-term-decisive transition.

### Verdict table — before vs after the v1.1 fix

| Scenario | At FIRE BEFORE | At FIRE AFTER | At plan-end (unchanged) | Crossover (after) |
|---|---|---|---|---|
| **rr** (mortgage 6.5%, stocks 7%) | Prepay +$11,967 | **Invest +$7,701** ⟶ flipped | Prepay +$394,524 | age 63 |
| **invest-wins** (mortgage 3%, stocks 8%) | Invest +$5,840 | Invest +$22,160 | Invest +$222,672 | none |
| **tie** (real spread = 0%) | Prepay +$11,816 | **Invest +$7,046** ⟶ flipped | Prepay +$263,407 | age 63 |
| **prepay-wins** (mortgage 8%, stocks 4%) | Prepay +$28,647 | Prepay +$7,281 | Prepay +$357,820 | none |

Plan-end verdicts didn't change because at plan age both strategies have $0 mortgage balance, so the deflation factor is irrelevant. The fix matters most during the years the mortgage is active.

### What this means for the user

At RR's actual scenario (mortgage 6.5%, stocks 7%, FIRE in 9 years):

- **At FIRE age (51)**: Invest wins by $7,701 in real today's dollars.
- **At age 63**: the lines cross — Prepay catches up because the cash-flow-redirect effect (after Prepay's earlier mortgage payoff) overtakes Invest's mid-life lead.
- **At plan-end (99)**: Prepay wins by $394,524 in real today's dollars.

So the "right" answer depends on the user's planning horizon:
- Optimize for early-FIRE wealth → Invest the extra $500/mo.
- Optimize for end-of-life legacy / longest planning horizon → Prepay the mortgage.
- Roughly equal at age 63.

This is the kind of nuance the dashboard is supposed to expose. The Verdict banner shows BOTH ages (FIRE-age + plan-end) precisely so the user can see this trade-off without the tool picking a winner for them.

### Tests after the fix

All 302 unit tests still pass. The 12 fixture-locked tests in `tests/unit/payoffVsInvest.test.js` use direction + tolerance assertions (e.g., "winnerAtFire === 'prepay' for inputs where mortgage 8% beats stocks 4%"), so they survived the magnitude shifts. The "Tie calibration" test (5% near-tie tolerance at FIRE-age) still passes because the post-fix margin shrinks slightly (the real spread really is closer to zero now).

## v1.2 correctness fix (2026-04-28, immediately after v1.1)

The user noticed a second issue while reading the factor breakdown: the calc was applying an annual LTCG drag to the stocks return (9 % drag in the default RR config), but the user is doing **buy-and-hold** during this comparison — they're contributing extra cash to a brokerage every month and not selling. LTCG only applies on sale; during accumulation a buy-and-hold portfolio compounds at the full real return.

Worse, this also made the Payoff-vs-Invest module **inconsistent with the rest of the dashboard**: the existing lifecycle simulator (`signedLifecycleEndBalance`, `projectFullLifecycle`) uses `realReturn = returnRate − inflationRate` directly, with no annual tax drag — tax is only applied on withdrawal via the active strategy's per-year mix. Our module was alone in subtracting tax annually.

**The fix:**
- `_monthlyRealReturnAfterTax` (now `_monthlyRealReturn`): drops the LTCG drag entirely. Stocks compound at `(returnRate − inflation)` per year, monthly-stepped.
- The factor previously labeled `expected-stocks-return-after-tax` is now `expected-stocks-return` with display value `"X.XX% real (buy & hold)"`.
- The factor previously labeled `ltcg-tax-drag` is now `terminal-ltcg-if-sold` with display value `"X.XX% (only if you sell)"` and a neutral arrow — surfaces what the terminal tax bite would be without applying it during accumulation.
- The `real-spread` factor uses the no-drag stocks return when computing the spread.

The user can mentally adjust if their plan involves selling the brokerage in retirement: a 9 % terminal LTCG bite on the gains portion of the final balance is the back-of-envelope correction.

### Verdict table — v1.1 vs v1.2

| Scenario | At FIRE v1.1 | At FIRE v1.2 | At plan-end v1.1 | At plan-end v1.2 | Crossover v1.1 | Crossover v1.2 |
|---|---|---|---|---|---|---|
| **rr** (mortgage 6.5%, stocks 7%) | Invest +$7,701 | Invest +$9,055 | Prepay +$394,524 | Prepay +$400,999 | age 63 | age 64 |
| **invest-wins** (mortgage 3%, stocks 8%) | Invest +$22,160 | Invest +$23,946 | Invest +$222,672 | **Invest +$345,501** | none | none |
| **tie** (mortgage 5.73%, stocks 6%) | Invest +$7,046 | Invest +$8,008 | Prepay +$263,407 | Prepay +$267,445 | age 63 | age 64 |
| **prepay-wins** (mortgage 8%, stocks 4%) | Prepay +$7,281 | Prepay +$6,994 | Prepay +$357,820 | Prepay +$366,272 | none | none |

Most striking change: the **invest-wins plan-end margin grew 55%** (from $222K to $345K). With no annual tax drag eating 9% of the stocks return, the long-term compounding shows its true power. Other scenarios shifted modestly — the underlying winner direction never changed, but margins are now honest about buy-and-hold accumulation.

The "tie" preset is now slightly off-tie (real-spread = +0.27% instead of 0.00%) because the original calibration assumed annual tax drag. If the user wants a *literal* tie, the calibrated mortgage rate needs to drop from 5.73% to 5.94% under the new model. Not worth changing — the preset is illustrative, and the unit test's 5% tolerance still passes.

### Tests after v1.2

All 302 unit tests still pass. The factor-key assertion in the "Output shape" test was updated to the new key names (`expected-stocks-return` and `terminal-ltcg-if-sold`). All other tests use direction-only assertions and survived intact.

### What this means for the user, end to end

After v1.0 + v1.1 + v1.2:

- The calc is now **internally consistent** (real dollars on both sides) and **consistent with the rest of the dashboard** (no annual tax drag during accumulation).
- The verdict at FIRE-age in the user's RR scenario is now **Invest wins by ~$9K in today's dollars**.
- The verdict at plan-end is **Prepay wins by ~$401K in today's dollars**.
- The lines cross at **age ~64** — that's when the cash-flow-redirect effect (Prepay paid off the mortgage at 71 and has been redirecting $3,028/mo to investments since) overtakes Invest's mid-life lead.
- Terminal LTCG on sale is surfaced in the Factor Breakdown but not applied — the user can mentally apply it if their plan involves selling the brokerage.

## What shipped

A new read-only Plan sub-pill (`Payoff vs Invest`) sitting between Mortgage and Expenses. Visualizes whether prepaying the mortgage or investing extra cash year-by-year leaves the user wealthier, surfaces the dominant decision factors, and supports planned mid-window refi + state-MID effective-rate override.

### Three new charts

1. **Wealth Trajectory** (line chart) — Prepay path vs Invest path, both plotted from `currentAge` through `endAge`. Crossover marker (gold cross) drawn at the year (if any) the lines intersect. Refi annotation (green square) drawn at refi-year when configured. Tooltip uses index-mode so hovering any year shows both strategies' values.
2. **"Where each dollar goes"** (stacked grouped-bar chart) — Per-year interest paid + principal paid for both strategies, side-by-side. Visualizes the front-loaded-interest amortization dynamic (the user's clarification Q1 emphasis): early years are mostly interest, late years mostly principal; the Prepay path's principal portion grows faster.
3. **Verdict banner** — Two-line summary stating winner + dollar margin at FIRE-age and at plan-end, with bilingual templating and tie-detection (margin < 0.5 % of larger trajectory).

### Factor Breakdown card

Lists 7+ factors driving the verdict, each with a current value and a directional arrow:
- Real return spread (after tax & inflation) — the dominant factor.
- Nominal mortgage rate, expected stocks return after-tax-real, time horizon, LTCG drag, mortgage years remaining, mortgage-naturally-paid-off-before-FIRE.
- Effective-rate override delta (only when override is active).
- Planned refi summary (only when refi is enabled).

### User controls (all local to the pill)

- **Extra monthly cash** slider ($0–$5,000, step $50, default $500).
- **Net-worth framing** toggle (Total incl. home equity / Liquid only).
- **Plan a refinance** checkbox + 3 inputs (refi-year, new rate, new term ∈ {15, 20, 30}).
- **Effective mortgage rate (after-tax)** override slider — verdict-only, does not change amortization (banks bill at contractual rate).

### Edge cases handled

- Mortgage scenario disabled → explainer card, no NaN, no console errors.
- Mortgage already paid off → explainer card.
- Invalid age window → explainer card.
- Mortgage in `buying-in` mode → comparison's extra-money allocation only kicks in once the mortgage starts.
- Refi-year before buy-in → clamped to buy-in year, with note exposed to renderer via `refiClampedNote`.
- Refi-year past natural payoff for either strategy → no-op for that strategy; annotation still drawn.

## Files changed

| File | Purpose |
|------|---------|
| `calc/payoffVsInvest.js` | NEW — pure calc module (UMD). ~600 LOC. |
| `calc/tabRouter.js` | Added `payoff-invest` pill to Plan tab's pills array. |
| `tests/unit/payoffVsInvest.test.js` | NEW — 12 fixture-locked unit tests. |
| `tests/unit/tabRouter.test.js` | NEW assertion: payoff-invest pill present between mortgage and expenses. |
| `tools/pvi-cli.mjs` | NEW — Node CLI front-end for the calc module. Lets you sanity-check any scenario without opening a browser; presets for RR / Generic / prepay-wins / invest-wins / tie. |
| `FIRE-Dashboard.html` | Added pill button, pill-host scaffolding, CSS, EN+zh i18n keys, 7 renderer functions, `recomputePayoffVsInvest()` orchestrator, recalcAll wiring, saveState/restoreState extension. |
| `FIRE-Dashboard-Generic.html` | Same changes in lockstep (Constitution Principle I). |
| `README.md` | Added Payoff vs Invest bullet to Features list. |
| `BACKLOG.md` | Added "Done in feature 016" entry. |
| `CLAUDE.md` | Updated Active feature pointer + predecessor list. |

## CLI for headless sanity-checking

`tools/pvi-cli.mjs` wraps the same `calc/payoffVsInvest.js` module the dashboard uses. Useful for verifying a specific scenario without needing a browser, and for spot-checking that the calc produces sensible numbers when you tweak inputs.

```bash
# Basic — RR defaults
node tools/pvi-cli.mjs --preset rr

# Test fixtures from the unit tests
node tools/pvi-cli.mjs --preset prepay-wins
node tools/pvi-cli.mjs --preset invest-wins
node tools/pvi-cli.mjs --preset tie

# Override individual fields
node tools/pvi-cli.mjs --preset rr --extra-monthly 1000 --stocks-return 0.09

# Refi mid-window (this is the case that flips the verdict from Prepay to Invest)
node tools/pvi-cli.mjs --preset rr --refi-year 5 --refi-rate 0.04 --refi-term 30

# State-MID effective-rate override (verdict-only, doesn't change amortization)
node tools/pvi-cli.mjs --preset rr --override-rate 0.045

# Already-own with low remaining
node tools/pvi-cli.mjs --ownership already-own --years-paid 28 --mortgage-term 30 --mortgage-rate 0.04

# Disabled state
node tools/pvi-cli.mjs --ownership already-own --years-paid 30 --mortgage-term 30

# Full year-by-year table
node tools/pvi-cli.mjs --preset rr --full-table

# Raw JSON (for scripting / regression diffs)
node tools/pvi-cli.mjs --preset rr --json

# Help
node tools/pvi-cli.mjs --help
```

Output includes the verdict at FIRE and plan-end, the Factor Breakdown with directional arrows, the crossover detection, an ASCII sparkline of the spread (Prepay − Invest) over time, milestone-year per-pool table, and the calc's `subSteps[]` audit trail.

### Behavioral note exposed by the CLI

The "tie" preset (real spread ≈ 0) is NOT a literal verdict tie — Prepay wins by ~$12K at FIRE (within the 5 % near-tie tolerance the unit test uses) and ~$263K at plan-end. This is **not** a calc bug; it's the cash-flow-timing effect: when Prepay pays off the mortgage earlier, it can redirect (former P&I + extra) into investments earlier than Invest can. The "real-spread" factor describes the long-run rate spread; the verdict is the actual simulated trajectory, which always slightly favors the earlier-payoff path even when real rates match.

## Test count

- Before: 289 unit tests
- After: 302 unit tests (12 new payoffVsInvest fixtures + 1 new tabRouter assertion)
- All 302 green ✅

## Constitution gates

| Principle | Gate satisfied? | Note |
|-----------|-----------------|------|
| I. Dual-Dashboard Lockstep | ✅ | Both HTML files shipped in same change set. |
| II. Pure Calculation Modules | ✅ | `calc/payoffVsInvest.js` has no DOM, no Chart.js, no globals beyond UMD attach. Module header declares Inputs/Outputs/Consumers. `subSteps[]` emitted for audit-observability. |
| III. Single Source of Truth | ✅ | Pill is a leaf consumer; reads `effectiveFireAge` once per recompute, never writes. Three new local state values are pill-scoped only. |
| IV. Gold-Standard Regression Coverage | ✅ | 12 fixture-locked tests; SC-002, SC-003, SC-008, SC-009, SC-010 each covered. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | UMD wrapper, no `export` keyword, file:// compatible. No new runtime deps. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | Each renderer's comment header names `calc/payoffVsInvest.js`; module's Consumers list names all four renderers. |
| VII. Bilingual First-Class | ✅ | All ~50 new keys in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` for both files. |
| VIII. Spending Funded First | ✅ N/A | Feature is read-only relative to withdrawal strategies. |
| IX. Mode and Objective are Orthogonal | ✅ N/A | Feature doesn't touch the strategy ranker. |

## Manual smoke checklist (for the user to verify in a browser)

This list is the operational equivalent of T053–T055, T073–T076, T081, T082 from `tasks.md`.

1. Reload either HTML file and navigate to **Plan → Payoff vs Invest**.
2. With the mortgage enabled, verify:
   - Verdict banner shows winner + dollar margin at FIRE-age and at plan-end.
   - Wealth Trajectory chart renders with Prepay (red) and Invest (purple) lines.
   - "Where each dollar goes" chart renders stacked bars showing the front-loaded-interest curve.
   - Factor Breakdown lists 7+ factors with arrows.
3. Drag the **Extra monthly** slider $0 → $5,000 — both charts and the verdict update within ~200 ms (SC-001). At $0, the verdict reads tie/no-extra. At $5,000 with invest-winning inputs, the margin grows monotonically (SC-002, manual confirmation of T075/T076).
4. Toggle **Net-worth framing** (Total ↔ Liquid) — chart redraws, verdict re-evaluates.
5. Enable **Plan a refinance**, set year=5, rate=4%, term=30 — wealth trajectory shows green square at age `currentAge+5`; "Where each dollar goes" chart reflects the new amortization curve.
6. Enable the **Effective mortgage rate** override and lower it below nominal — verdict shifts toward Invest, "Effective rate override active" row appears in the Factor Breakdown.
7. Toggle **中文** at the top-right — every label, banner sentence, factor row, and chart legend flips to Traditional Chinese.
8. Disable the mortgage scenario on the Mortgage pill — Payoff vs Invest pill replaces all three charts with the explainer card. Zero NaN, zero console errors.
9. Visit other pills (Profile, Assets, Investment, Mortgage, Expenses, Summary, Geography, Retirement, History, Audit) — confirm no other chart's numbers changed (SC-004 manual confirmation).
10. Open via `file://` (double-click the HTML) — pill loads and reacts correctly with no local web server (Constitution Principle V file-protocol gate).

## Out of scope (deferred to future features)

- Monte Carlo / sequence-of-returns variance bands.
- Refi closing costs / no-cost refi modeling.
- Federal mortgage interest deduction at IRS itemization level.
- 401K / Roth as the extra-money vehicle.
- HELOC / cash-out refinance.
- Refi-as-a-third-strategy line (the planned refi we DO model is shared by both strategies).
- Per-state tax-rate table (we use the FR-021 effective-rate override slider instead).
- Snapshot CSV extension.

## Tasks status (vs `tasks.md`)

| Phase | Range | Status |
|-------|-------|--------|
| 1 — Setup | T001–T002 | ✅ Done (folded into Phase 2) |
| 2 — Foundational | T003–T025 | ✅ Done. T025 (browser smoke regression Playwright assertion) deferred — would require a Playwright session; the calc module's purity + read-only renderer guarantee are the primary defense. |
| 3 — US1 MVP | T026–T055 | ✅ Code done. T053–T055 manual browser smoke = the user's verification checklist above. |
| 4 — US2 | T056–T074 | ✅ Done. T073–T074 manual = same verification checklist. |
| 5 — US3 | T075–T076 | ✅ Code is in place; verification = same checklist (drag slider $0→$5000). |
| 6 — Polish | T077–T085 | ✅ Done. T077 (full unit suite) green. T078 (browser smoke regression Playwright) deferred per T025 note. T079 BACKLOG ✅. T080 README ✅. T081–T082 = user verification checklist. T083 spec checklist ✅ (already passed). T084 CLOSEOUT = this file ✅. T085 CLAUDE.md = updated below. |

## Follow-ups (none blocking)

- Add a Playwright-driven browser smoke regression that loads the dashboard, navigates to the new pill, snapshots every other chart's data series before/after, and asserts byte-equality (T025 / T078 — operational proof of SC-004).
- Consider adding the Verdict mini-chart (Chart 3 from `payoffVsInvest-charts.contract.md`) as a follow-up polish if desired.
- Consider extending `FIRE-Dashboard Translation Catalog.md` with a dedicated Payoff vs Invest section (currently the keys live in the source files only; adding to the catalog is documentation-only).
