# Contract — Chart Transparency (Caveat Indicators)

**Feature**: 007 Bracket-Fill Tax Smoothing
**Scope**: Visual indicators and annotations added to the Lifetime Withdrawal Strategy chart and the Full Portfolio Lifecycle chart so users can SEE every rule the algorithm is honoring.

---

## Purpose

Make every algorithmic decision auditable on screen. When the algorithm reduces Trad fill because of Social Security, or caps because of IRMAA, or enables an earlier unlock because of Rule of 55, or would trigger a 5-year Roth warning — there must be a visible indicator on the chart (not hidden in a console or a tooltip the user might miss).

Per Constitution Principle VI: each chart that consumes these new flags updates its `Consumers:` comment to declare which flags it reads and how.

---

## Lifetime Withdrawal Strategy chart — changes

### Change 1 — New legend entry and bar segment: "Trad: Bracket-fill excess → taxable"

The existing stacked-bar chart has segments for: RMD, Trad 401K draw (taxed), Roth draw (tax-free), Taxable stocks (LTCG), Cash, Social Security.

**Add a new segment** between the Trad and Roth segments:

- Label: `Trad: Bracket-fill excess` (data-i18n: `chart.bracketFillExcess`)
- Color: `rgba(108,99,255,0.55)` — accent2 tint, distinct from the solid red of the main Trad-draw bar
- Data per year: `strategy[i].syntheticConversion`
- Visual: same stacked bar; the new segment stacks on top of the main Trad-draw segment in a slightly different hue so the eye distinguishes "Trad used for spend" from "Trad routed to taxable"

**Legend order** (top to bottom): Social Security, Trad 401K draw (taxed), **Trad: Bracket-fill excess**, Roth draw (tax-free), Taxable stocks (LTCG), Cash, Effective tax rate.

### Change 2 — IRMAA horizontal threshold line

A new dataset (type `line`) drawn across the entire x-axis at `y = effectiveIrmaaCap`:

- `borderColor: 'rgba(255,107,107,0.4)'` (danger-tinted)
- `borderDash: [5, 5]`
- `pointRadius: 0`
- `fill: false`
- `borderWidth: 1.5`
- Legend entry: `IRMAA threshold (Tier 1)` (data-i18n: `chart.irmaaThresholdLine`)
- Hidden if `inp.irmaaThreshold === 0`

### Change 3 — Year-level IRMAA indicator

A small inline plugin (≤20 lines, same pattern as the drag-hint plugin in feature 006) draws a `⚠` glyph above any bar where `strategy[i].irmaaCapped || strategy[i].irmaaBreached`.

- `irmaaCapped` → yellow warning glyph, tooltip: "Bracket-fill capped to stay under IRMAA Tier 1 threshold."
- `irmaaBreached` → red warning glyph, tooltip: "MAGI = $X this year — Medicare Part B/D surcharge applies two years later (est. $Y/month)."

Tooltip content is computed client-side from `magi` and a hardcoded IRMAA-premium lookup table (single tier for v1, $70/month surcharge estimate).

### Change 4 — SS-reduction annotation (caption below chart)

Below the chart canvas, a `<p class="chart-caveat">` element shows:

> "📌 Social Security taxable (85%) fills $X of the 12% bracket this year — Traditional fill reduced accordingly."

Rendered when `strategy[i].ssReducedFill === true` for the currently-hovered year. If the user is not hovering a specific year, show the message for the FIRST year where `ssReducedFill` is true (typically the SS claim year).

If no year has `ssReducedFill === true`, the caption is hidden.

### Change 5 — Strategy summary narrative (above chart)

The existing narrative is replaced with a feature-007 version:

> "Strategy: bracket-fill at `(stdDed + top12)` × `(1 − X%)` safety margin. Fills cheap 12% bracket with Traditional each year, routes excess `$Y/yr` into taxable stocks. Avg tax Z% — `N%` lower than no-smoothing."

Where `X` = safety margin %, `Y` = average annual synthetic conversion, `Z` = average effective tax rate over retirement, `N` = estimated savings vs. the retired cover-spend algorithm.

If Rule of 55 is active, append: " Rule of 55 unlocks Trad at 55 (not 59.5) — you have 4.5 extra bracket-fill years."

If a 5-year Roth warning were ever active: append a yellow banner. (Reserved; never triggered in feature 007.)

### Change 6 — Consumers comment (Constitution VI)

The renderer's comment block must be updated:

```
// Consumers of strategy[] from computeWithdrawalStrategy:
//   Reads from each row:
//     - wTrad, wRoth, wStocks, wCash, rmd      → stacked bar segments
//     - taxOwed / grossReceived                 → effective tax rate line
//     - syntheticConversion                     → Trad-excess bar segment (NEW)
//     - irmaaCapped, irmaaBreached, magi        → IRMAA indicator overlay (NEW)
//     - ssReducedFill                           → SS-reduction caption (NEW)
//     - rule55Active                            → rule-55 badge on Trad bar segment (NEW)
```

---

## Full Portfolio Lifecycle chart — changes

### Change 7 — Rule of 55 age-55 marker

A new scatter-point dataset rendered when `inp.rule55.enabled && inp.rule55.separationAge >= 55`:

- Single data point at `(age=55, portfolioValue)` pulled from `lifecycle.find(d => d.age === 55)`
- `pointStyle: 'rectRot'` (diamond — distinct from the existing `rect` square for the 59.5 unlock)
- `pointRadius: 7`
- `backgroundColor: '#ffd93d'` (warning-tinted), same family as the existing 59.5 marker but visually distinct
- `showLine: false`
- Legend entry: `🔓 Rule of 55 Trad unlock (age 55)` (data-i18n: `chart.rule55Unlock`)
- Hidden entirely when Rule of 55 is off

### Change 8 — Key Years annotation line

The existing key-years annotation below the chart reads something like:

> "Key years: Age 54 🔒 401K locked — drawing from taxable · Age 67 🎯 SS claim year · Age 73 📌 RMDs begin"

When Rule of 55 is active, prepend:

> "Age 55 🔓 Rule of 55 Trad unlock · ..."

### Change 9 — Lifetime-tax-comparison caption

Below the chart (or in the existing `#strategy-caption` area), a new text block:

> "Lifetime federal tax (bracket-fill): `$X` · vs. no-smoothing: `$Y` · savings `$Z` (`N%`)"

Where `$X` comes from `computeWithdrawalStrategy`'s `totalLifetimeTax`, and `$Y` comes from a one-shot comparison run using the retired cover-spend algorithm (computed once at feature load for comparison purposes — NOT recomputed on every slider drag, for performance).

If bracket-fill saves less than 5% for the current scenario, the caption degrades to a neutral tone: "Bracket-fill saves negligible tax for your scenario (≤5%) — you're already in a low-tax regime."

### Change 10 — DWZ-mode earlier-FIRE caveat caption

When the user is in DWZ mode, a one-line caption appears below the FIRE-strategy buttons:

> "Die-With-Zero with bracket smoothing retires you earlier than the simple-tax version — your synthetic Trad→taxable conversions compound through retirement, so you need less starting portfolio to end at $0. See the ⓘ below for the math."

Hidden in Safe and Exact modes.

---

## Info Panel (expandable, from ui-controls.contract.md)

The info-panel body prose MUST cover:

1. **What bracket-fill does** — plain English. "Every year the algorithm withdraws a little from your Traditional 401(k), pays cheap 12%-bracket tax on it, and re-invests the excess into your brokerage. Over 10+ years this shrinks your Traditional balance before RMDs hit, and cuts your lifetime tax bill."

2. **Why 5% safety margin** — "IRS brackets and the standard deduction shift a bit each year with inflation. We leave 5% of headroom so a bracket-drift year doesn't accidentally push you into 22%."

3. **IRMAA** — "Medicare Part B & D premiums jump when your tax income exceeds the Tier 1 threshold (currently ~$212K MFJ / $106K Single). The algorithm caps your Trad fill to avoid that cliff."

4. **Rule of 55** — "If you leave your employer in or after the year you turn 55, that employer's 401(k) becomes penalty-free at 55, not 59.5. Only the plan you separated from, not old employer plans you rolled into an IRA."

5. **5-year Roth conversion clock** — "Each Roth conversion has its own 5-year clock before the converted principal is penalty-free. Feature 007 only does 'synthetic conversion' (Trad → taxable brokerage), which doesn't create a clock — but this warning is wired up for a future true Roth conversion feature."

6. **When it saves money (most cases)** — "If you have a substantial Traditional balance AND your retirement spending is below the 12% bracket cap, bracket-fill typically saves 10–30% of your lifetime federal tax bill."

7. **When it doesn't (smaller wins)** — "If your Trad balance is small, if your state has high income tax (CA/NY/NJ/OR/MN — not applicable if you're retiring abroad), if your spending is already at the 22%+ bracket, or if you plan large Qualified Charitable Distributions at 70.5+ — the savings shrink."

---

## Test Hooks (Phase 3 QA)

- DOM: each new legend entry, annotation, caption element is queryable by stable class/id.
- Rendering: for a baseline Roger & Rebecca scenario with bracket-fill on, the "Trad: Bracket-fill excess" bar segment is visible in at least one year.
- IRMAA: forcing `irmaaThreshold = 100000` and running the Roger scenario causes the horizontal line to render at y=95000 (95000 = 100000 * (1 - 0.05)) and at least one bar has the `⚠` overlay.
- Rule of 55: enabling the checkbox causes the diamond marker to appear at age 55 on the Full Portfolio Lifecycle chart. Disabling causes it to disappear within one recalc cycle.
- Strategy narrative: matches the template above; updates when the safety margin slider changes; updates when Rule of 55 is toggled.
- Lifetime tax caption: shows a reasonable savings number for the default Roger scenario (matches the SC-001 threshold of ≥25% savings).
- DWZ caption: visible only in DWZ mode; hidden in Safe/Exact.
- Consumers comment updated on both Lifetime Withdrawal Strategy render function and Full Portfolio Lifecycle render function.
- Lockstep: all chart changes render identically on both HTML files (modulo the MFJ/Single filing-status difference which affects numbers but not structure).
