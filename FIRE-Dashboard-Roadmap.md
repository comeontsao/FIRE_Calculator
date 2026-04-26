---
date: 2026-04-17
tags: [fire, dashboard, roadmap, side-project, planning, tasks]
status: in-progress
scope: both FIRE-Dashboard.html (Roger & Rebecca) AND FIRE-Dashboard-Generic.html
---

# FIRE Dashboard — Roadmap & Tasks

Master planning document for ongoing development of the FIRE Dashboard suite. Every feature listed here is to be built into **both** files unless explicitly noted.

- Roger & Rebecca version: `FIRE-Dashboard.html`
- Generic version: `FIRE-Dashboard-Generic.html`

**Legend**
- `[x]` shipped
- `[~]` in progress / partial
- `[ ]` planned, not started
- `[?]` needs Roger's input before scoping

---

## ✅ Recently shipped

- [~] **Feature 013 — Tabbed Dashboard Navigation** (implemented, branch `013-tabbed-navigation`, browser smoke pending). Replaces the single-scrolling layout of BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` with a 4-tab themed navigation (Plan · Geography · Retirement · History) and 16 sub-tab pills (Plan: Profile · Assets · Investment · Mortgage · Expenses · Summary; Geography: Scenarios · Country Chart · Healthcare · Country Deep-Dive; Retirement: Social Security · Withdrawal Strategy · Drawdown · Lifecycle · Milestones; History: Snapshots). KPI ribbon, FIRE-mode gate selector (extracted from the SS card to a new `<div id="gateSelector">` above the tab bar — required by FR-015), language toggle, and right-edge pinned Lifecycle sidebar all stay rendered across every tab. State persists to `localStorage["dashboardActiveView"] = {tab, pill}` and to URL hash `#tab=…&pill=…` for bookmarkable deep links; Back/Forward routes through history; invalid hash falls back to Plan/Profile. Each card has a `Next →` button that walks pills sequentially within a tab; the last pill of each tab gets `disabled`. Mobile pill bars scroll horizontally (`overflow-x: auto`, `flex-wrap: nowrap`) at ≤767 px instead of wrapping. Pure frontend reorganization — calc engine, formulas, chart data sources are untouched, all 195 unit tests pass with zero modification. Quick What-If section completely removed (markup, JS handlers, 9 i18n keys). 21 new i18n key pairs (`nav.tab.*`, `nav.pill.*`, `nav.next`) × EN + zh-TW. New pure module `calc/tabRouter.js` (644 lines, 13 unit tests covering FR-026/027 fallbacks, popstate, write-failure tolerance) drives the routing — DOM access via injectable resolver callbacks (`getTabButton`, `getPillButton`, `getPillHost`, `getTabPanel`) so the module remains Node-testable per Principle II. Lockstep verified across 11 structural metrics (4 sections, 16 pill-hosts, 16 sentinels per file, etc.). New 27-test Playwright spec (`tests/e2e/tab-navigation.spec.ts`) covers persistence, deep links, Back/Forward, Next workflow, mobile responsive, and lockstep DOM-diff between RR and Generic — all green alongside Feature 011's 13 responsive-header tests for a 40-test E2E suite. Spec: [specs/013-tabbed-navigation/spec.md](./specs/013-tabbed-navigation/spec.md) · Plan: [specs/013-tabbed-navigation/plan.md](./specs/013-tabbed-navigation/plan.md) · Tasks: [specs/013-tabbed-navigation/tasks.md](./specs/013-tabbed-navigation/tasks.md).
- [~] **Feature 012 — SSA Earnings Record: support years before 2020** (in-progress, branch `012-ssa-earnings-pre-2020`). Adds pre-2020 earnings entry to `FIRE-Dashboard-Generic.html`'s SSA Earnings Record card via a new `+ Add Prior Year` button (prepends `firstYear − 1` per click) and a bulk "Earliest year" number input that expands the record in one step down to a soft floor of 1960. Pure helpers `prependPriorYear` and `setEarliestYear` extracted to `calc/ssEarningsRecord.js` with a fenced Inputs/Outputs/Consumers/Invariants header — RR can reuse them identically when reintroduced. 7 new i18n keys × EN + zh-TW (`ss.addPriorYear`, `ss.earliestYearLabel`, `ss.earliestYearSet`, `ss.earliestYearHint`, `ss.duplicateYear`, `ss.floorReached`, `ss.yearAccepted`). Existing `ssEarningsHistory` localStorage shape unchanged — prepended rows persist via the same path. Spec: [specs/012-ssa-earnings-pre-2020/spec.md](./specs/012-ssa-earnings-pre-2020/spec.md) · Plan: [specs/012-ssa-earnings-pre-2020/plan.md](./specs/012-ssa-earnings-pre-2020/plan.md) · Tasks: [specs/012-ssa-earnings-pre-2020/tasks.md](./specs/012-ssa-earnings-pre-2020/tasks.md).
- [~] **Feature 011 — Responsive header layout fixes (Generic only)** (implemented, branch `011-responsive-header-fixes`). Fixes two bugs on `FIRE-Dashboard-Generic.html`'s site header at narrow viewports: (1) title word-per-line wrap collapsed into a clean 1→2→3-row grid restructure via `@media (max-width: 1023px)` + `@media (max-width: 767px)`, with `word-break: keep-all`, tightened `clamp()` font-size floors (1.2rem at tablet, 1.15rem at phone), and pill reflow to its own row at narrow widths; (2) horizontal seam between header and sidebar eliminated via a new `--header-height` CSS custom property driven by a `ResizeObserver` on `#siteHeader`, consumed by `.sidebar { top: var(--header-height, 0px); }`. Placed the media queries AFTER the skin block so font-size clamps win by cascade. New 13-test Playwright matrix (`tests/e2e/responsive-header.spec.ts`) locks the invariants across 3 viewports × 2 sidebar states × 2 languages + a compact-sticky sanity test — all green. `@playwright/test` added as dev-only dependency (Principle V carve-out). Zero new user-visible strings, zero calc module changes, 161/161 unit tests still green. Explicitly Generic-only (FR-022 vacuous — `FIRE-Dashboard.html` not in repo). Spec: [specs/011-responsive-header-fixes/spec.md](./specs/011-responsive-header-fixes/spec.md) · Plan: [specs/011-responsive-header-fixes/plan.md](./specs/011-responsive-header-fixes/plan.md) · Tasks: [specs/011-responsive-header-fixes/tasks.md](./specs/011-responsive-header-fixes/tasks.md).
- [~] **Feature 010 — Country budget scaling by household size (Generic only)** (implemented, pending browser smoke verification, branch `010-country-budget-scaling`). Generic dashboard now scales per-country lifestyle budgets by an adults-only OECD-modified factor (solo = 0.67× couple baseline; couple = 1.00×). Kids no longer multiply into country-card budgets. Instead, a post-FIRE per-child allowance overlay ($2,000/yr from ages 0–12, ramping to $6,000/yr by age 17, ending at college start) is added to the Lifecycle chart's spend curve; college tuition remains a separate per-kid expense. Per-country **💰 Adjust Annual Spend** override input brings Generic to parity with the former RR dashboard — edits persist to a `scenarioOverrides` map in localStorage and a "(custom)" badge renders on the card. A two-line bilingual scaling indicator (EN + zh-TW) plus tooltip makes the factor legible on the Geography section. Legacy `setLifestyle` mutation removed — `scenarios[]` now holds a read-only invariant (baseline couple budget, never mutated by UI). Shipped: pure helpers `getAdultsOnlyFactor`, `getScaledScenarioSpend`, `calcPerChildAllowance`; ~10 new fixture tests; 161/161 unit tests green. Explicitly Generic-only (FR-021 — RR dashboard `FIRE-Dashboard.html` untouched by design, documented Principle-I lockstep exception). Spec: [specs/010-country-budget-scaling/spec.md](./specs/010-country-budget-scaling/spec.md) · Plan: [specs/010-country-budget-scaling/plan.md](./specs/010-country-budget-scaling/plan.md) · Tasks: [specs/010-country-budget-scaling/tasks.md](./specs/010-country-budget-scaling/tasks.md).
- [~] **Feature 009 — Single-Person Mode (Generic only)** (in progress, branch `009-single-person-mode`). Adds an Adults counter (range 1–2, default 2) to `FIRE-Dashboard-Generic.html` so a solo planner can run the dashboard as a one-adult household. When `adultCount === 1` the dashboard hides Person 2 inputs (birthday, stocks, spousal SS) while preserving their values, flips filing status to Single (Single-filer 2026 defaults via feature-007 plumbing), suppresses Person 2 contributions from net worth / accessible / taxable pool, drops the 50% spousal SS add-on, and scales healthcare to a single-adult base (pre-65 `0.35` share vs couple `0.67`; post-65 halved couple rate) with per-kid scaling preserved so single parents are first-class. Snapshot CSV schema gains an appended `Adults` column; legacy 19-column files default to `adults = 2`. 10 new i18n keys × EN + zh-TW. Explicitly Generic-only (FR-029) — `FIRE-Dashboard.html` (RR) stays two-person by design; documented as a justified Principle-I lockstep exception. Spec: [specs/009-single-person-mode/spec.md](./specs/009-single-person-mode/spec.md) · Plan: [specs/009-single-person-mode/plan.md](./specs/009-single-person-mode/plan.md) · Tasks: [specs/009-single-person-mode/tasks.md](./specs/009-single-person-mode/tasks.md).
- [~] **Feature 008 — Multi-Strategy Withdrawal Optimizer** (in progress, branch `008-multi-strategy-withdrawal-optimizer`). Replaces the single bracket-fill-smoothed withdrawal heuristic with a pool of seven named strategies (Bracket-Fill Smoothed, Trad-First, Roth-Ladder, Trad-Last / Estate-Preserve, Proportional, Tax-Optimized Search, Conventional). User picks one of two objectives — "Leave more behind" or "Retire sooner · pay less tax" — and the system scores all seven strategies on every recalc, displays the winner, and reveals a collapsed ranked comparison of the non-winners on click. Preview any non-winner to see its distribution propagate through the Lifetime Withdrawal chart, the main lifecycle chart, the sidebar mirror, and the KPI ribbon. Architecture B (fixed FIRE age, cycle within the withdrawal module) chosen to meet the 250 ms recalc budget. Spec: [specs/008-multi-strategy-withdrawal-optimizer/spec.md](./specs/008-multi-strategy-withdrawal-optimizer/spec.md) · Plan: [specs/008-multi-strategy-withdrawal-optimizer/plan.md](./specs/008-multi-strategy-withdrawal-optimizer/plan.md) · Tasks: [specs/008-multi-strategy-withdrawal-optimizer/tasks.md](./specs/008-multi-strategy-withdrawal-optimizer/tasks.md).
- [x] **Feature 007 — Bracket-Fill Tax Smoothing** (2026-04-21). Replaces cover-spend withdrawal default with bracket-fill: every accessible retirement year the algorithm withdraws Traditional 401(k) up to the 12% bracket cap × (1 − safety margin), routes excess above spending need into the taxable stocks pool as a synthetic conversion. Four new controls: Safety Margin slider (0–10%, default 5%), Rule of 55 checkbox + separation-age, IRMAA threshold (MFJ $212K default; auto-swap to Single $106K on Generic via `applyFilingStatusDefaults`). Transparency layer: SS-reduction caption, IRMAA dashed line + ⚠ glyph per-year plugin, Rule-of-55 age-55 scatter marker + key-years annotation, info `<details>` panel. Three primary consumers (`signedLifecycleEndBalance`, `projectFullLifecycle`, `computeWithdrawalStrategy`) share a non-negotiable pool-operation ordering (subtract withdrawals → subtract shortfall → add syntheticConversion → compound). Also fixes Generic-only regression: `signedLifecycleEndBalance` now uses `getTaxBrackets(detectMFJ(inp))` instead of hardcoded MFJ (FR-069a). 24 new i18n keys × EN + zh-TW. +13 bracket-fill unit tests (including SC-011 cross-surface consistency, SC-012 FIRE-date propagation, U1 pool-ordering). Spec: [specs/007-bracket-fill-tax-smoothing/spec.md](./specs/007-bracket-fill-tax-smoothing/spec.md) · Closeout: [specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md](./specs/007-bracket-fill-tax-smoothing/CLOSEOUT.md).
- [x] **Feature 006 — UI Noise Reset + Lifecycle Dock** (2026-04-21). Three-story visual + UX pass: pinnable right-edge lifecycle sidebar (US1) that mirrors the primary chart via a shared `_lastLifecycleDataset` cache (no parallel calc); sticky compact header (US2) using IntersectionObserver + live Years-to-FIRE / Progress chips reading `_lastKpiSnapshot`; 12-item noise-reduction pass (US3) with surface tiers, KPI neutral color, quiet card titles, section dividers, FIRE-progress rail refactor, filter demotion, emoji discipline, footer-tip softening. Shipped to both files with 13 new i18n keys in EN + zh-TW. Spec: [specs/006-ui-noise-reset-lifecycle-dock/spec.md](./specs/006-ui-noise-reset-lifecycle-dock/spec.md) · Closeout: [specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md](./specs/006-ui-noise-reset-lifecycle-dock/CLOSEOUT.md).
- [x] **Double-mortgage-adjustment bug fix** (2026-04-17). SS drawdown chart was silently withdrawing ~$20–30K/yr extra because the pre-adjusted `mtgAdj.annualSpend` was passed into `simulateDrawdown`, which then re-applied the adjustment inside `projectFullLifecycle`. Now both the lifecycle chart and the SS drawdown chart pass the raw scenario spend so mortgage adjustment is applied exactly once. Also wired up `fireAgeOverride` honoring in the SS chart so dragging the FIRE triangle keeps both charts in sync. Fixed in both files.

---

## 🎯 Tier 1 — Critical features (highest ROI)

### 1. Foreign home ownership tied to scenario countries
> Roger: *"The homes abroad should also be selected from the countries?"* → Yes.

**Problem.** The mortgage block is US-only. It hard-codes MA-style property tax, 7% US selling costs, USD appreciation, and Section 121 tax treatment. If Roger inherits a home in Taiwan or buys an apartment in Taipei, there is no place to put it.

**Design.**
- Add a **Home Location** dropdown to the mortgage card, populated from the scenarios list.
- When location ≠ US, swap in country-specific defaults: property tax structure, selling cost %, capital-gains treatment on sale, typical appreciation rate.
- Keep-vs-move logic:
    - Home location == scenario location → replace destination housing with ownership cost (same as today's US stay-in-US path).
    - Home location ≠ scenario location → ownership cost added ON TOP of destination living cost (today's "abroad keeping US home" path).

**Tasks**
- [ ] Add `homeLocation` field to mortgage inputs (default `us`).
- [ ] Country-specific defaults table: `propertyTaxRate`, `insuranceRate`, `sellingCostPct`, `appreciationPct`, `capGainsRule`.
- [ ] Refactor `getMortgageAdjustedRetirement` to branch on same-country vs different-country.
- [ ] Update capital-gains calc in `calcMortgageImpact*` per country.
- [ ] UI: location dropdown + exposed tax/cost parameters.
- [ ] Both HTML files.

---

### 2. Multiple homes (Home #1 + Home #2)
**Problem.** Roger's real situation could end up with BOTH a MA home AND an inherited Taiwan home. Today's model supports one.

**Design.**
- Refactor single `mortgageEnabled` + single `mtgOwnership` into an array of home objects.
- Each home: location, ownership state, values, sell-at-FIRE choice — independent.
- Home #2 disabled by default; "Add Home" button reveals it.
- Lifecycle math iterates over all active homes.

**Tasks**
- [ ] Refactor mortgage state from singleton to array.
- [ ] UI: "Add a second home" expandable block.
- [ ] Update all lifecycle/accumulation math to iterate.
- [ ] Both HTML files.

---

### 3. "Give house to children" inheritance scenario
> Roger: *"I don't sell the house and give the house to my children, what do I have to spend?"*

**Design.** Extend `sellAtFire` from binary → three-way:
- `sell` — sell at FIRE, proceeds go to portfolio (today's path).
- `keep-live-in` — keep and live in it (today's keep path).
- `keep-inherit` — keep it as a legacy asset, pass to kids at end-of-plan.

For `keep-inherit`:
- You pay maintenance + property tax + insurance + HOA until end-of-plan regardless of whether you live in it.
- Sub-toggle: **empty** (pure carrying cost) vs **rent it out** (offset by estimated rent net of 25% vacancy/management — ties into Tier 3 Rental Income feature).
- At end-of-plan: home value does NOT flow into portfolio. It leaves as "legacy."
- US tax note in UI: heirs get stepped-up cost basis at death — if they sell immediately, no capital-gains tax.

**Tasks**
- [ ] Extend `sellAtFire` to 3-state enum.
- [ ] Add empty / rented sub-toggle for `keep-inherit`.
- [ ] Lifecycle chart: do NOT add home value to portfolio at end; show as legacy line below zero axis or as a separate marker.
- [ ] US-only stepped-up-basis tooltip.
- [ ] Both HTML files.

---

### 4. Paid-off home support (already-own past mortgage term)
> Roger: *"The already own doesn't 100% represent the situation where everything is paid down. It only shows to 29 years that is already paid."*

**Problem.** `already-own` slider caps at `term - 1`. Can't model a fully paid-off home cleanly. Even when `yearsPaid >= term` (code correctly zeros P&I), the UI still shows stale monthly-payment numbers and the "vs Current Rent" delta is misleading.

**Design.**
- Extend `yearsPaid` slider max to `max(term + 20, 50)`.
- When `yearsPaid >= term`: show a clear "🏠 Paid Off ✓ — X yrs ago" banner.
- Monthly payment display becomes `$0 P&I + tax + ins + HOA + maintenance`.
- Add a quick shortcut button on the Ownership Status row: **"💵 Paid Off"** that sets `already-own` + `yearsPaid = term`.

**Tasks**
- [ ] Extend `yearsPaid` slider max.
- [ ] "Paid Off ✓" status banner.
- [ ] Fix monthly-payment display when paid off.
- [ ] Add maintenance reserve to retirement housing (dovetails with Task 8).
- [ ] Optional shortcut button.
- [ ] Both HTML files.

---

### 5. Healthcare costs by country (pre-Medicare gap aware)
> Roger: *"Heath care, can that be selected from the different Countries? I want you to do a research for what those heath care would cost in those countries."*

**Problem.** Flat `$400/mo` "Health Insurance & Medical" default is the single biggest realism gap in the model. For a US FIRE at 57, actual ACA unsubsidized premiums for a family of 4 run $1,800–2,500/mo. For Taiwan NHI, it's closer to $100/mo. This one line item can swing Roger's FIRE age by 2–4 years.

**Design.**
- Replace the flat default with a **per-scenario** healthcare cost, split into two phases:
    - **Phase A — pre-65 "gap years":** no employer coverage, no Medicare. Expensive in US, cheap elsewhere.
    - **Phase B — 65+:** Medicare kicks in if US-resident; abroad residents continue private.
- Auto-populate defaults from research (Appendix A). User can override with a slider.
- Highlight the gap-years segment on the lifecycle chart.

**Recommended default monthly costs (family of 4, USD, Roger/Rebecca age 57–65):**

| Country | Pre-65 (gap) | 65+ | Notes |
| --- | --- | --- | --- |
| 🇺🇸 US (MA) | $2,000 | $700 | ACA unsubsidized ~$1,800–2,500; Medicare + supplemental + dental/vision post-65 |
| 🇹🇼 Taiwan | $300 | $250 | NHI ~$100 + private top-up; one of the best value systems globally |
| 🇯🇵 Japan | $400 | $350 | NHI income-based; co-pay 30% working age, 10–20% senior |
| 🇹🇭 Thailand | $700 | $800 | LTR visa requires ≥$50K coverage; international family plans $300–1,200 |
| 🇲🇾 Malaysia | $400 | $500 | AIA/Cigna/Allianz ~$80–150/adult; MM2H insurance requirement under 60 |
| 🇸🇬 Singapore | $1,650 | $1,800 | Not eligible for MediShield as expat; private family avg ~$19,900/yr |
| 🇻🇳 Vietnam | $800 | $900 | Family international plans ~$12,500/yr avg |
| 🇵🇭 Philippines | $400 | $500 | PhilHealth ₱15K/yr SRRV + private comprehensive $260–430 |
| 🇲🇽 Mexico | $600 | $700 | IMSS family ~$200/mo if eligible; private comprehensive $125–290/adult |
| 🇨🇷 Costa Rica | $500 | $600 | Caja 7–11% of declared income; INS/international top-up $100–300 per person |
| 🇵🇹 Portugal | $400 | $500 | SNS free once registered; private €50–150/person keeps wait times short |

**Tasks**
- [ ] Per-scenario healthcare defaults (pre-65 and post-65).
- [ ] Healthcare phase A slider (FIRE → 65).
- [ ] Remove flat $400 default from expense table.
- [ ] Lifecycle chart: visually emphasize gap-years healthcare burden (annotation band).
- [ ] Both HTML files.

---

### 6. Kids' college costs (attend + location)
> Roger: *"For the kid's options, maybe that could be calculated if they are going to college or not, and also where they are going to college because US college is cost is extremely high compared to other countries."*

**Research findings — 4-year total cost incl. tuition + room/board + living (USD):**

| Destination | Tuition/yr | Living/yr | 4-yr total |
| --- | --- | --- | --- |
| US public in-state | $11,950 | $15,200 | **~$109K** |
| US public out-of-state | $30,780 | $14,900 | **~$183K** |
| US private | $43,350 | $15,300 | **~$235K** |
| 🇹🇼 Taiwan (NTU intl) | $3,200–4,400 | $10,000 | **~$53K** |
| 🇯🇵 Japan (public intl) | $4,800–6,500 | $16,000 | **~$85K** |
| 🇸🇬 Singapore (NUS intl) | $15,000–17,000 | $8,500 | **~$94K** |
| 🇳🇱 Netherlands (non-EU BA) | $6,500–16,000 | $13,000 | **~$78–116K** |
| 🇩🇪 Germany (public) | $500 admin | $13,000 | **~$54K** (tuition-free) |
| 🇵🇹 Portugal | $2,500–5,000 | $10,000 | **~$50K** |

**Design.** Per-kid inputs:
- Will attend college? (Y/N)
- Where? (dropdown: the table above + "Other")
- Years (default 4)
- Start age (default 18)
- Parental contribution % (default 100; lets Roger model kids paying some via loans/scholarships)

Lifecycle chart gets spend spike for each active college year; sums stack when both kids overlap.

**Tasks**
- [ ] Per-kid college inputs in both dashboards.
- [ ] Annual spend spike during college years.
- [ ] Optional 529 pre-funded pool (subtracted from spike).
- [ ] Both HTML files.

---

### 7. Tax-aware withdrawal strategy chart
> Roger: *"Does any chart show the tax information how much tax I pay and from which 401K (Traditional or Roth) should I withdraw from at that point to avoid high tax? ... draw out the Traditional later when I don't have any income and I get older..."*

**Design.** New panel: **"Annual Tax & Withdrawal Strategy."**

For each year post-FIRE, show:
- Total withdrawal needed ($).
- Suggested split: Taxable / Trad 401K / Roth 401K.
- Estimated federal tax bracket (MFJ, 2026 brackets).
- Estimated total tax paid that year.

Withdrawal-order heuristic (greedy):
1. Take from Taxable first (preserves tax-advantaged compounding).
2. Fill the 0%/10%/12% brackets with Trad 401K withdrawals OR Trad→Roth conversions when in low-income years.
3. Touch Roth LAST (tax-free growth, also best for heirs).
4. Respect RMDs at age 73 (Roger's cohort: 73 since born ≤1960 for Rebecca, 75 for Roger born 1984).

Also surface:
- **Roth conversion ladder opportunity**: highlight years where MAGI is low and conversion up to top-of-12%-bracket is optimal.
- **RMD warning**: at 73/75, show forced Trad withdrawal minimum.
- **State tax consideration**: MA 5% flat for US residency; most scenario countries have territorial or no tax on foreign investment income if structured properly — link to scenario `taxNote`.

**Tasks**
- [ ] New Tax Strategy chart panel.
- [ ] 2026 federal MFJ bracket table + state tax toggle.
- [ ] Year-by-year withdrawal-order heuristic.
- [ ] Roth conversion ladder suggestion engine.
- [ ] RMD handling at age 73/75.
- [ ] Tooltip linking to each scenario's `taxNote`.
- [ ] Both HTML files.

---

## 📌 Tier 2 — Important features

### 8. Maintenance reserve (1% of home value/yr)
- [ ] Add as a separate line in retirement housing when homeowner.
- [ ] Default 1% of home value/year, user-adjustable.

### 9. Property tax / insurance / HOA real-dollar inflation
- [ ] Apply ~1–2% real growth/yr to tax, insurance, HOA.
- [ ] Leave P&I fixed (locked by mortgage terms).

### 10. Capital gains tax on home sale
- [ ] US: Section 121 ($500K MFJ exclusion) + LTCG 15/20% + MA 5%.
- [ ] Taiwan: 房地合一稅 rules.
- [ ] Japan, Portugal, etc. per-country rules.
- [ ] Apply in `calcMortgageImpact*` netProceeds calc.

---

## 💡 Tier 3 — Nice-to-have

- [ ] **Rental income toggle** — "rent it out" when keeping home; subtract gross rent × 75% (vacancy/mgmt/repairs).
- [ ] **Rule of 55 / 72(t) SEPP** — earlier 401K access when separation age qualifies.
- [ ] **Sequence-of-returns / Monte Carlo** — 500–1000 randomized runs, success probability bands.
- [ ] **Long-term care spike** — optional $100K+/yr band in last 5–10 years.
- [ ] **Part-time / barista-FIRE income** — post-FIRE income stream slider.
- [ ] **Currency risk on foreign assets** — FX volatility stress test.
- [ ] **Expected inheritance** — one-time windfall slot with timing.
- [ ] **529 college savings pool** — separate bucket tied to kids.
- [ ] **Second-country scenario FX tooltips** — show both USD and local currency.

---

## ✅ Design decisions (2026-04-17)

All six open questions answered by Roger. These now govern Tier 1 implementation.

- **Q1 — Foreign home tax defaults** → ✅ **Pre-populated per-country defaults.** Each of the 11 scenarios gets researched defaults for `propertyTaxRate`, `insuranceRate`, `sellingCostPct`, `appreciationPct`, and `capGainsRule`. User can override via exposed fields.
- **Q2 — Kids count** → ✅ **Variable count 0–4 with per-kid inputs** (Generic version). Each kid gets their own age + college-location dropdown. Roger & Rebecca version stays fixed at 2 kids but gains per-kid college location.
- **Q3 — Healthcare granularity** → ✅ **Baked-in per-country defaults.** Pre-65 and post-65 Medicare monthly costs wired to each scenario (see Appendix A). Single slider exposed for override. No ACA subsidy toggle for now — add later if needed.
- **Q4 — Tax strategy style** → ✅ **Prescriptive, auto-computed optimal strategy.** New chart runs a simple optimizer each year: picks Trad/Roth/taxable mix minimizing total tax while meeting spend. Shows recommended dollars per bucket per year + total tax paid.
- **Q5 — Inheritance display** → ✅ **Legacy marker on lifecycle chart.** End-of-projection annotation: "Legacy: $X.XM to heirs" with step-up basis note. No separate stat card.
- **Q6 — Currency display** → ✅ **USD-only everywhere.** Keeps math clean and scenarios comparable. Local currency noted in Appendix only.

---

## 🗂️ Appendix A — Healthcare research (full notes)

**🇺🇸 US (MA)**
- ACA unsubsidized benchmark Silver for age 55–64 family: $22,600+/yr per family unit; couple-only can exceed $1,200/mo.
- MA caps age rating at 2:1 (most states 3:1) — slightly better for older enrollees.
- Post-65: Medicare Part B (~$175/mo/person 2026 standard) + Medigap ($150–250/mo) + Part D ($30–50/mo) + dental/vision ≈ $700/mo combined for a couple.
- Biggest FIRE wildcard — ACA subsidy depends on MAGI, which depends on Roth conversion strategy. Cross-reference with Task 7.

**🇹🇼 Taiwan**
- NHI premium: 4.69% of monthly income capped at NT$175,601. Typical expat: $30–50/mo/person.
- Gold Card / APRC holders + dependents enroll immediately.
- Private top-up for private hospital access and shorter waits: $100–200/mo for family.
- World-class care quality + language match for Roger.

**🇯🇵 Japan**
- NHI three portions (basic / elderly support / long-term care), income-based + per-person fixed.
- Tokyo example (Chuo Ward 2025): 7.71% income rate + ¥47,300/person basic; caps at ¥660,000/yr.
- Co-pay: 30% working age, 20% senior (70–74), 10% (75+).
- Out-of-pocket monthly cap ~¥80–100K (high-cost protection).

**🇹🇭 Thailand**
- LTR visa mandates ≥$50K health coverage.
- Local Thai plan satisfies visa for <THB 20K/yr (high deductible).
- International comprehensive: $80–500+/mo/person; family of 4 comfortable: $500–1,200/mo.

**🇲🇾 Malaysia**
- MM2H applicants under 60 must show proof of insurance.
- AIA, Cigna Global, Allianz ~$80–150/mo for retirees under 65.
- AXA cheapest plans from $48/mo/person.

**🇸🇬 Singapore**
- Expats NOT eligible for MediShield Life (citizens/PR only).
- Family international avg: USD $19,879/yr (Pacific Prime 2025).
- Individual: USD $6,855/yr average.
- Highest-cost country in the scenario list for healthcare.

**🇻🇳 Vietnam**
- Individual international: ~$4,500/yr. Family: ~$12,500/yr (2024 data).
- Local basic plans $100/yr available but thin coverage.
- Second-largest expense after rent for retirees — budget $200–500/mo/person.

**🇵🇭 Philippines**
- PhilHealth: SRRV holders pay ~₱15,000/yr (~$260/yr) for baseline.
- Private comprehensive: ₱15,000–25,000/mo ($259–431) for international-grade.
- Most expats use PhilHealth as baseline + private top-up.

**🇲🇽 Mexico**
- IMSS voluntary for retirees: $117–590/yr/person based on age.
- IMSS excludes many pre-existing conditions (tumors, chronic, mental, HIV).
- Private comprehensive for age 60–70: $1,500–3,500/yr/person.

**🇨🇷 Costa Rica**
- Caja (CCSS): 7–11% of declared monthly income, covers dependents.
- Pensionado visa requires ≥$1,000/mo pension.
- INS private (monopoly) or international top-up: $100–300/mo/person.
- Many expats run Caja + private in parallel.

**🇵🇹 Portugal**
- D7 visa requires 1 yr travel insurance at application.
- Post-residency: SNS free once registered.
- Private top-up €30–150/mo/person; most expats keep private for wait times.

Sources:
- [Healthinsurance.org MA marketplace](https://www.healthinsurance.org/aca-marketplace/massachusetts/)
- [KFF ACA Subsidy Calculator](https://www.kff.org/interactive/subsidy-calculator/)
- [Taiwan Gold Card NHI](https://goldcard.nat.gov.tw/en/tags/national-health-insurance/)
- [Alea Taiwan Expat Health Insurance](https://alea.care/resources/taiwan-expat-health-insurance)
- [Expatica Japan Health Insurance](https://www.expatica.com/jp/health/healthcare/japan-health-insurance-79371/)
- [ExpatDen Japan Health Insurance](https://www.expatden.com/japan/health-insurance-in-japan/)
- [Pacific Prime Thailand Expat Mandatory](https://www.pacificprime.com/blog/mandatory-health-insurance-for-expats-in-thailand.html)
- [Pacific Prime Malaysia Retirement](https://www.pacificprime.com/blog/senior-retirement-visa-health-plans-malaysia.html)
- [Pacific Prime Singapore Costs](https://www.pacificprime.com/blog/health-insurance-cost-in-singapore.html)
- [Alea Vietnam Healthcare Costs](https://alea.care/resources/cost-health-vietnam)
- [LiveLife Philippines PhilHealth](https://livelifethephilippines.com/posts-retirement/phil-health/philhealth-article.html)
- [Mexperience IMSS Guide](https://www.mexperience.com/how-to-access-the-mexican-healthcare-system-imss/)
- [CRIE Costa Rica Private Insurance](https://crie.cr/costa-rica-private-health-insurance-for-expats/)
- [Global Citizen Portugal Healthcare](https://www.globalcitizensolutions.com/portugal-healthcare-foreigners/)

---

## 🎓 Appendix B — College cost research (full notes)

**🇺🇸 US**
- Public 4-yr in-state: $11,950 tuition + $12,917 room/board = $24,867/yr → **~$109K 4-yr**
- Public 4-yr out-of-state: $30,780 + $12,917 = $43,697/yr → **~$183K 4-yr**
- Private nonprofit 4-yr: $43,350 + $13,842 = $57,192/yr → **~$235K 4-yr**
- Ivy+: often $85–95K/yr all-in → **$340–380K 4-yr**

**🇹🇼 Taiwan**
- NTU undergrad intl: NT$100,000–140,000/yr tuition (~$3,200–4,400 USD).
- Living: $8,000–12,000/yr in Taipei.
- 4-yr total: **~$45–65K** — enormous savings vs US.
- Gold Card / APRC makes enrollment straightforward for Roger's kids as dependents.

**🇯🇵 Japan**
- National/public undergrad: ¥535,800–600,000/yr (~$4,800–6,500).
- Living: ¥80K–150K/mo (~$11,000–20,000/yr).
- Private universities: ¥900,000–1,200,000/yr (~$8,100–10,800).
- 4-yr total (public): **~$75–100K**.
- English-taught programs are still more common at grad than undergrad.

**🇸🇬 Singapore**
- NUS intl undergrad: SGD 20,000–22,100/yr (~$15,000–17,000).
- Living: SGD 11,400/yr (~$8,500).
- 4-yr total: **~$90–100K**.

**🇳🇱 Netherlands**
- Non-EU BA tuition: €6,000–15,000/yr (~$6,500–16,000).
- Living: ~€12,000/yr (~$13,000).
- 4-yr total: **~$78–116K**.

**🇩🇪 Germany**
- Public universities tuition-free for all nationalities (€100–300/sem admin).
- English-taught undergrad rare — German competency required.
- Living: ~€12,000/yr (~$13,000).
- 4-yr total: **~$54K** (almost all living expense).

**🇵🇹 Portugal**
- Tuition varies widely; typical €2,500–5,000/yr for international.
- Living: €10,000/yr in Lisbon; cheaper elsewhere.
- 4-yr total: **~$50K**.

Sources:
- [EducationData US College Costs](https://educationdata.org/average-cost-of-college)
- [College Board Trends in Pricing](https://research.collegeboard.org/trends/college-pricing/highlights)
- [NTU Tuition & Fees](https://admissions.ntu.edu.tw/fees-scholarships/tuition-fees/)
- [Study in Japan Academic Fees](https://www.studyinjapan.go.jp/en/planning/academic-fees/)
- [NUS Undergraduate Fees](https://www.nus.edu.sg/registrar/administrative-policies-procedures/undergraduate/undergraduate-fees)
- [Mastersportal Europe Tuition](https://www.mastersportal.com/articles/405/tuition-fees-at-universities-in-europe-overview-and-comparison.html)
- [Leverage Edu Netherlands Fees](https://leverageedu.com/learn/netherlands-university-fees/)

---

## 🔗 Related notes
- [[FIRE Planning - Roger & Rebecca]]
- [[FIRE-Dashboard Translation Catalog]]
