# Feature Specification: Mortgage Payoff vs. Invest Comparison

**Feature Branch**: `016-mortgage-payoff-vs-invest`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "I want to plan another category after the mortgage that doesn't affect any existing chart, and only creates new charts to show the calculation, so they don't affect other current charts. This category is to calculate what is more worth it, to pay off the mortgage first or invest the money in the market if we have extra money? Since we know the inflation numbers in the plan and the investing % numbers, and by what year we are going to retire, I want you to also brainstorm what are the factors that might change the decision. And then we will create the charts showing through the years, which wins."

## Clarifications

### Session 2026-04-28

- Q: Should we add a dedicated chart visualizing the per-year principal-vs-interest split for both strategies (so the user can SEE the front-loaded-interest dynamic instead of just reading a number)? → A: Yes — add it as a 3rd chart (interest paid + principal paid per year, side-by-side for Prepay and Invest paths). The "amortization is universal across US states" point is informational (no state-specific math is added; the formula is the same in every state).
- Q: Should the comparison handle a planned mid-window refinance (rate change at a chosen year)? → A: Yes — Option B. Add three optional inputs (refi-year slider, new rate, new term ∈ {15, 20, 30} default 30). Both Prepay and Invest paths apply the same refi at the same year; amortization resets from refi date with the new rate + new term. No closing-cost modeling in v1. "Refi as a third strategy" remains out of scope.
- Q: Should we model state-income-tax mortgage-interest deduction (the "varies by state" angle)? → A: Option C — hybrid. Skip the full state-tax-table buildout, but expose a single optional **"Effective mortgage rate (after-tax)"** override slider that defaults to the nominal mortgage rate. Users in states with state-MID benefit can dial it down by ~0.3–0.5 percentage points; everyone else leaves it at the default. The Factor Breakdown card MUST show whether the override is active and by how much.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — "Tell me which path wins at MY numbers" (Priority: P1)

A user with an active mortgage and discretionary monthly cash wants a single clear answer: at their current mortgage rate, expected investment return, inflation rate, tax rate, and FIRE timeline, does prepaying the mortgage or investing the extra money produce more total wealth? They want to see the answer as a chart of total net worth over time, not a one-line verdict, so they can see when (if ever) the lines cross.

**Why this priority**: This is the entire reason the user asked for the feature. Without it, no value lands. Every later refinement (sensitivity, factor breakdown) depends on the baseline comparison being trustworthy and visible.

**Independent Test**: Open the new Plan → Payoff vs Invest pill with default inputs. Two clearly-labeled trajectories ("Prepay Mortgage" vs "Invest Extra") plot from today through plan-end age. The verdict banner names the winner at the FIRE-age year and at the plan-end year. The crossover year (if any) is marked on the chart. The user can read the verdict at a glance without touching any input.

**Acceptance Scenarios**:

1. **Given** the user has the mortgage scenario enabled with `rate = 6.5%, term = 30y, monthlyExtra = $500`, expected stocks return `7%`, inflation `3%`, FIRE in `9 years`, **When** the user opens the Payoff vs Invest pill, **Then** two trajectory lines render: "Prepay Mortgage" and "Invest Extra", with one labeled as the winner at retirement and at plan-end, and a crossover marker drawn at the year (if any) the lines cross.
2. **Given** the same user lowers their stocks return slider to `4%`, **When** the slider releases, **Then** the chart recomputes within ~200 ms and the verdict banner flips (or stays) accordingly, with no other dashboard chart changing its values.
3. **Given** the user has mortgage disabled (renting), **When** they open the pill, **Then** an explainer card replaces the chart: "Payoff vs Invest only applies when you have a mortgage. Toggle the mortgage scenario on the Mortgage pill to see this analysis." No chart errors, no NaN values, no broken layout.
4. **Given** the user's mortgage is shorter than years-to-FIRE (e.g., already-own with `yearsPaid = 25, term = 30`, only 5 years remaining), **When** the chart renders, **Then** both trajectories converge after the natural payoff year and the verdict notes that the comparison effectively ends at the natural payoff date.

---

### User Story 2 — "Show me which factors matter most" (Priority: P2)

A user sees the chart but doesn't know *why* one strategy wins. They want a small breakdown that lists the dominant factors at their current inputs (mortgage rate vs after-tax-after-inflation expected return, time horizon, taxable-account drag, etc.) and how each factor pushes the verdict.

**Why this priority**: Builds trust in the chart by exposing the reasoning. Users who don't understand the calc will distrust the verdict and ignore the feature. This is what turns "a chart" into "a decision aid."

**Independent Test**: With the chart already rendering (US1 done), a Factor Breakdown card sits beside it listing 4–6 factors as rows: each row shows the factor name, its current numeric value, and a one-arrow indicator of which strategy it favors (`▲ Invest` or `▼ Prepay`). Toggling any input slider that affects a listed factor visibly updates that row's arrow direction.

**Acceptance Scenarios**:

1. **Given** the user is looking at the verdict ("Invest wins by $42K at FIRE"), **When** the user looks at the Factor Breakdown card, **Then** they see at minimum: real spread (stocks − inflation vs mortgage − inflation), tax drag (LTCG % on the invest path), time horizon (years until first comparison-year ends), and home-equity vs liquid framing — each with a current value and a directional arrow.
2. **Given** the user moves the inflation slider from 3% to 5%, **When** the chart recomputes, **Then** the inflation row in the Factor Breakdown updates its real-spread number and possibly its arrow direction, and the verdict banner reflects the new outcome.
3. **Given** the user toggles between "include home equity in net worth" and "liquid only" framing, **When** the toggle flips, **Then** both trajectories update with the new framing, the verdict may flip accordingly, and the framing factor row reflects the active choice.

---

### User Story 3 — "Tell me when the extra-amount slider changes the answer" (Priority: P3)

A user wants to know whether the choice between Prepay and Invest is sensitive to *how much* extra they have each month. If the answer is the same regardless of `$200/mo` vs `$2000/mo`, that's useful. If the answer flips at some threshold, even more useful.

**Why this priority**: A nice-to-have refinement that only matters once US1 + US2 are clear. Skippable if scope is tight; can ship as a follow-up feature without breaking US1/US2.

**Independent Test**: An "Extra monthly" slider exists on the new pill. Sweeping it from $0 to a reasonable max ($5000) updates both lines on the chart in real time and updates the verdict. The user can find a flip-point (if any exists) by dragging.

**Acceptance Scenarios**:

1. **Given** the user opens the pill, **When** they move the Extra monthly slider, **Then** both trajectories update smoothly (no flicker), and the verdict banner re-evaluates the winner at FIRE age.
2. **Given** the slider is at $0, **When** the chart renders, **Then** both trajectories are identical (no extra money applied to either strategy) and the verdict banner shows "tie — no extra to allocate."

---

### Edge Cases

- **Mortgage scenario disabled** — the pill displays an explainer card instead of an empty chart. No NaN, no errors.
- **Mortgage already paid off** (already-own + yearsPaid ≥ term) — the pill displays an explainer: "Mortgage already paid off; comparison would be Invest vs Invest." No chart.
- **Mortgage natural payoff before FIRE** — comparison effectively ends at natural payoff year; both lines continue identically afterward (both fully invest the freed cash flow). Verdict notes the truncation.
- **Negative real spread** (mortgage rate > expected stocks return after tax + inflation) — Prepay trivially wins from year 1. Chart still renders both lines so the user sees how decisively.
- **Stocks return < inflation rate** — extreme/edge scenario. Math still works; the chart shows Invest losing real value, Prepay winning.
- **Extra monthly = 0** — both strategies identical. Verdict displays "no extra cash to compare."
- **User toggles mortgage off after the pill is loaded** — the pill auto-switches to the explainer card on next recalc.
- **Plan-end age is before the natural mortgage payoff** — comparison runs only to plan-end age (truncated). Verdict notes residual mortgage balance under each strategy.
- **Mortgage `buy-in` years > 0 (planned future purchase)** — extra-money allocation only kicks in once the mortgage starts. Pre-purchase years show identical investing for both lines.
- **Planned refi-year is after the Prepay path has already paid off the mortgage** — the refi event is a no-op for the Prepay path and a real rate-change for the Invest path. The chart annotation MUST still mark the refi-year, with a tooltip noting that one path no longer has a mortgage to refi.
- **Planned refi term extends the mortgage past plan-end age** — comparison still runs; the chart shows the residual mortgage balance at plan-end for both strategies and the verdict accounts for it (subtracted from net worth).
- **Planned refi-year is set before the buy-in year** — the refi-year is clamped to the buy-in year (you can't refi a mortgage you haven't taken out yet) with a small UI note.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a new pill labeled "Payoff vs Invest" to the Plan tab's pill bar, positioned immediately after the existing Mortgage pill and before the Expenses pill.
- **FR-002**: The new pill MUST be entirely additive — no existing chart's data, axes, or rendering may change as a side effect of opening, navigating away from, or interacting with this pill.
- **FR-003**: System MUST read its inputs (mortgage rate, balance, term, monthly P&I; expected stocks return; inflation rate; LTCG-equivalent tax drag; current age; FIRE age; plan-end age) from the existing dashboard state. No new persistent input fields are required for the baseline comparison except a single "Extra monthly amount" slider.
- **FR-004**: System MUST render two year-by-year wealth trajectories from today through plan-end age:
  - **Prepay Path** — apply the extra monthly amount to the mortgage principal each month until the mortgage is paid off, then redirect the freed cash flow (former P&I + extra) into a taxable brokerage investment account at the configured stocks return rate.
  - **Invest Path** — keep paying the contractual minimum mortgage payment; deposit the extra monthly amount into a taxable brokerage investment account from day one.
- **FR-005**: Both paths MUST track total net worth = home equity (home value − remaining mortgage balance) + invested balance, computed in real (inflation-adjusted) dollars.
- **FR-006**: System MUST compute and visibly mark the **crossover year** — the first year (if any) where one trajectory overtakes the other — on the chart. If no crossover exists within the plan window, the chart MUST indicate that the winner is monotonic.
- **FR-007**: System MUST display a **Verdict banner** stating the winning strategy and the dollar margin at two fixed reference years: the FIRE age year and the plan-end year. The banner MUST also indicate "tie" cases (margin < 0.5% of larger value) explicitly.
- **FR-008**: System MUST display a **Factor Breakdown card** listing at least these factors with a current numeric value and a directional arrow indicating which strategy each factor favors:
  - Mortgage rate (nominal & real)
  - Effective mortgage rate (only shown when the FR-021 override differs from nominal — surfaces the delta)
  - Expected stocks return (nominal & real, after-LTCG drag)
  - Time horizon (years until plan-end)
  - Years remaining on mortgage as of today
  - Tax drag on the invest path (LTCG-equivalent rate × stock-gain portion)
  - Whether the mortgage will naturally pay off before FIRE
  - Whether a planned refi is active (and at what year + new rate, if so)
- **FR-009**: System MUST allow the user to adjust the **Extra monthly amount** via a slider (range $0 to $5,000, step $50) and update both trajectories within 200 ms of slider release.
- **FR-010**: System MUST allow the user to toggle the **Net-worth framing** between "Total net worth (includes home equity)" and "Liquid net worth (investments + cash only)". The toggle MUST re-render both trajectories and re-evaluate the verdict.
- **FR-011**: When the mortgage scenario is disabled (no mortgage active), system MUST replace the chart with an explainer card directing the user to enable the mortgage scenario, with no NaN values, no broken layout, and no console errors.
- **FR-012**: When the mortgage is already-paid-off or its natural payoff falls before today, system MUST display an explainer noting the comparison is moot, with no chart.
- **FR-013**: All user-visible strings introduced by this feature MUST ship with both English and Traditional Chinese (zh-TW) translations in the same change set, per Constitution Principle VII.
- **FR-014**: New chart wiring MUST follow Constitution Principle VI: the chart's render function MUST declare in a comment which calc module(s) it consumes and which named output fields it reads; the calc module's `Consumers:` list MUST name this chart.
- **FR-015**: The new calc module MUST be pure (Constitution Principle II): no DOM access, no Chart.js calls, no global mutable state. Inputs in, outputs out. Independently unit-testable without loading the HTML.
- **FR-016**: The "Extra monthly amount" slider value MUST persist across page reloads via the existing `localStorage` state mechanism, default `$500/month`.
- **FR-017**: When `mortgage.ownership === 'buying-in'` (planned future purchase), the comparison's extra-money allocation MUST start in the buy-in year, not before. Years before purchase contribute identically to both trajectories (extra goes to investments under both, since there's no mortgage yet to prepay).
- **FR-018**: System MUST render a third chart titled "Where each dollar goes" beneath the wealth-trajectory chart, plotting per-year **interest paid** and per-year **principal paid** for both the Prepay and Invest strategies. The chart MUST visually convey the front-loaded-interest dynamic of standard amortization (interest dominates early years, principal dominates late years) so the user can see how Prepay flattens the interest area faster than Invest. Cumulative interest paid under each strategy MUST be available via tooltip or summary line.
- **FR-019**: System MUST expose three optional inputs for a **planned mid-window refinance**: (a) refi-year slider (0 = no refi, range 1 to plan-end-year-current-age), (b) new annual rate (number, %), (c) new term in years (radio: 15 / 20 / 30, default 30). When refi-year > 0, both the Prepay and Invest trajectories MUST apply the rate change starting at the refi-year, with the amortization schedule restarting from the refi-year balance using the new rate + new term. No refinance closing costs are modeled in v1.
- **FR-020**: When a planned refi is active (refi-year > 0), the wealth-trajectory chart MUST visually mark the refi event (e.g., a small annotation line) so the user can correlate the trajectory shape with the refi date. The "Where each dollar goes" chart (FR-018) MUST also reflect the post-refi amortization curve (interest jumps back up after refi because amortization resets to year 1 of the new schedule).
- **FR-021**: System MUST expose an optional **"Effective mortgage rate (after-tax)"** override slider that defaults to the user's nominal mortgage rate from the existing Mortgage pill. When the override is set below the nominal rate, the **Prepay path's interest cost MUST be computed using the override** (the user is saying "after state-MID savings I really only pay X%"). The amortization SCHEDULE itself (P&I, balance, principal/interest split) MUST continue to use the nominal contractual rate — banks bill at the contractual rate; the override only adjusts the user's effective economic cost for verdict purposes. The Factor Breakdown card MUST surface the override delta when active.
- **FR-022**: The "Effective mortgage rate" override MUST persist via the existing `localStorage` state mechanism. Default is "no override" (effective rate = nominal rate).

### Out of Scope (deferred to future features)

- **Monte Carlo / sequence-of-returns variance** — the comparison uses point-estimate returns. A future feature could overlay confidence bands.
- **Refinancing as a third strategy** — "what if I refi instead of prepay or invest" as a third trajectory line is out of scope. *(In-scope as of clarification 2026-04-28: a planned refi shared by BOTH strategies, applied at a chosen year — see FR-019 / FR-020.)*
- **Mortgage interest deduction modeling** — under the post-2018 standard deduction, most users don't itemize. Including this adds complexity for marginal benefit. Out of scope; can be a future toggle.
- **Pre-tax (401K / Roth) investment account types** — extra cash is assumed to be after-tax discretionary. Modeling 401K-as-the-extra-vehicle would require contribution-limit logic and tax-treatment branching. Out of scope.
- **Behavioral / psychological factors** — debt-free comfort, sequence-of-returns risk tolerance, etc. The feature reports the math, not the feelings.
- **HELOC / cash-out refinance as a third option** — out of scope.
- **Extra-money source modeling** — the feature treats extra monthly cash as exogenous. It does NOT subtract this amount from existing savings rate, contribution, or expense calculations elsewhere on the dashboard.
- **Effect on existing FIRE age** — the extra money in this pill does NOT modify the user's projection on any other chart. The comparison is read-only relative to the rest of the dashboard.

### Key Entities

- **PrepayInvestComparison** — one analysis run. Inputs: `extraMonthly`, `currentAge`, `fireAge`, `endAge`, `mortgageInputs` (rate, balance, P&I, term, ownership), `stocksReturn`, `inflation`, `ltcgEquivalentRate`, `homeAppreciationRate`, `framing` ∈ `{totalNetWorth, liquidNetWorth}`, `plannedRefi` ∈ `{ enabled, refiYear, newRate, newTerm }` (optional, off by default). Output: two year-by-year wealth arrays + per-year interest/principal split arrays + a Verdict + a list of Factor evaluations + a CrossoverPoint or null + an optional RefiAnnotation marker.
- **WealthPath** — for each strategy, a year-indexed array of `{age, year, mortgageBalance, homeEquity, investedReal, totalNetWorthReal, liquidNetWorthReal}` from `currentAge` through `endAge`.
- **Verdict** — `{winnerAtFire, marginAtFire, winnerAtEnd, marginAtEnd, isTie, naturalPayoffYear?}`.
- **Factor** — `{key, label, valueDisplay, favoredStrategy ∈ {prepay, invest, neutral}, magnitude ∈ {dominant, moderate, minor}}`. The Factor Breakdown card consumes a list of these.
- **CrossoverPoint** — `{age, year, totalAtCrossoverReal}` or `null` when no crossover occurs within the plan window.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At default RR inputs (mortgage rate `6.5%`, stocks return `7%`, inflation `3%`, LTCG-equivalent `15%`, FIRE in `9 years`, extra `$500/mo`), the chart and verdict render within **2 seconds of opening the pill** for the first time and within **200 ms** on every subsequent slider movement.
- **SC-002**: Toggling the Extra monthly slider from $0 to $5000 produces a **monotonically larger margin** in whichever direction the verdict already pointed (i.e., more extra cash makes the winner win by more, never less). If this invariant fails, the math is wrong.
- **SC-003**: With mortgage rate `=` stocks return (after tax + inflation, real terms), the verdict at FIRE-age MUST report a margin within **±1% of the larger trajectory's value** (a true tie). This is the calibration check that the comparison is honestly computing the spread.
- **SC-004**: Switching to a different Plan sub-pill (Profile, Assets, Investment, Mortgage, Expenses, Summary) MUST NOT cause any of those existing pills' charts to display different numeric values than they did before this feature shipped. Verified by the existing browser smoke harness comparing pre- and post-feature snapshots of every existing KPI and chart.
- **SC-005**: With mortgage scenario disabled, the new pill MUST render the explainer card, **zero console errors**, and **zero NaN dollar amounts**. Verified by a browser-smoke check that loads the page with `mortgageEnabled = false`, opens the pill, and asserts no NaN strings appear.
- **SC-006**: The bilingual translation toggle (EN ↔ zh-TW) MUST flip every user-visible string in the new pill on a single click, including chart legend labels, the verdict banner sentence, the Factor Breakdown row labels, the slider label, and the explainer card text.
- **SC-007**: The Factor Breakdown card MUST list **at least 5 factors** at all times, each with a current numeric value rounded to a sensible precision and a directional arrow that updates within 200 ms of the relevant input changing.
- **SC-008**: A unit test MUST exercise the calc module against a fixture case where prepay clearly wins (e.g., mortgage rate `8%`, stocks return `4%`) and another where invest clearly wins (mortgage rate `3%`, stocks return `8%`), asserting the correct strategy is named in the Verdict in each case.
- **SC-009**: With a planned refi enabled at year 5 (rate dropping from `7%` to `4%`, term resetting to 30 years), the **Where each dollar goes** chart MUST show a visible jump in interest paid at year 5 (because the new amortization is back to interest-heavy year-1 of the new schedule), and the wealth-trajectory chart MUST show a visible inflection. Verified by inspecting the data series at the refi-year index — interest at year 5 is meaningfully higher than at year 4.
- **SC-010**: When the FR-021 effective-rate override is set below the nominal mortgage rate, the verdict at FIRE-age MUST shift toward Invest (or stay Invest, never flip away from Invest) as the effective rate decreases, holding all other inputs constant. Confirms the override's economic logic.

## Assumptions

- **Extra cash is after-tax discretionary.** The user has $X/month of post-tax money available; the question is *where* to put it. No payroll-deduction or pre-tax routing is modeled.
- **Investments under the Invest path are taxable brokerage**, with returns drag-adjusted by the LTCG-equivalent rate × the stock-gain portion (`stockGainPct`) at sale. We model this as a continuous drag on the real return rather than a one-time terminal tax to keep the comparison year-by-year visualizable.
- **Home appreciation rate** for computing home equity uses the existing `inflationRate` as a real-zero proxy (real home appreciation is approximately zero on a 30-year horizon for a primary residence in most US markets). This keeps the comparison conservative and prevents home equity from artificially inflating the prepay path.
- **Mortgage interest is not deductible** (post-2018 standard deduction reality for most filers). A future feature could add an itemization toggle.
- **The mortgage P&I is fixed nominal**; inflation erodes its real cost over time. This favors the Invest strategy and is one of the factors surfaced in the Factor Breakdown.
- **Plan-end age** uses the dashboard's existing `endAge` setting (default 99–100). The comparison runs from `currentAge` through `endAge`.
- **No effect on existing dashboard state.** The comparison is read-only with respect to FIRE-age search, strategy ranking, scenario calculations, snapshot CSV, and every other chart. The "Extra monthly" amount is exogenous to the rest of the model.
- **The new calc module lives under `calc/`** as a UMD-classic-script-loadable file (Constitution Principle V), with EN+zh-TW i18n keys added to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in lockstep (Principle I).
- **The new pill placement is the Plan tab**, between Mortgage and Expenses. The pill ID for routing is `payoff-invest`.

---

## Brainstorm: factors that change the verdict

The user explicitly asked for a brainstorm of factors. This list informs FR-008's Factor Breakdown card and the spec's requirements above; it is **not** itself a requirements list.

**First-order (almost always the verdict driver):**

1. **Real return spread** — `(stocks_return − inflation − tax_drag)` vs `(mortgage_rate − inflation)`. If positive, Invest wins; if negative, Prepay wins.
2. **Time horizon** — longer = compounding amplifies the spread in either direction.
3. **Tax drag on invested gains** — LTCG (~15–20%) × `stockGainPct` reduces the effective Invest return.
4. **Mortgage years remaining** — shorter remaining = less interest to avoid via prepay = Invest favored.

**Second-order (move the magnitude, rarely flip the verdict):**

5. **Inflation itself** — affects the real value of fixed nominal mortgage payments. Higher inflation = nominal mortgage cheaper in real terms = Invest favored.
6. **Home appreciation rate** — assumed real-zero in the baseline; if positive, the home equity component grows under both strategies. Mostly cancels.
7. **Whether the mortgage naturally pays off before FIRE** — if yes, the comparison effectively ends at the natural payoff year; the Invest-strategy advantage compounds for fewer years.
8. **Net-worth framing** — including home equity vs liquid only changes which line *appears* higher visually but doesn't change the underlying spread. Surfaced as a toggle so the user can see both framings.

**In-scope as of 2026-04-28 clarification:**

9. **Front-loaded interest amortization** — surfaced via dedicated "Where each dollar goes" chart (FR-018) showing per-year principal vs interest for both strategies side-by-side.
10. **Planned mid-window refinance** — a single shared refi event applied to both strategies (FR-019, FR-020). Inputs: refi-year, new rate, new term.

**Out-of-scope factors (explicitly NOT modeled in v1):**

11. **Federal mortgage interest deduction at the IRS itemization level** — irrelevant under post-2018 standard deduction for most filers. *(State-level MID is partially captured via the FR-021 effective-rate override slider.)*
12. Sequence-of-returns / variance — point-estimate only.
13. Liquidity preference — qualitative; not a number.
14. Psychological comfort with debt — qualitative.
15. **Refi as a third strategy line** — separate from the planned refi event we DO model; this would be a third trajectory ("refi and keep paying minimum") that we're not adding.
16. Refi closing costs — typically $3–5K, marginal vs the multi-decade comparison; can be added later if needed.
17. Pre-tax investment accounts (401K / Roth) — separate feature.
18. HELOC / cash-out — separate feature.
