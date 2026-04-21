# Quickstart — 007 Bracket-Fill Tax Smoothing

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-04-21

Manual verification script. Run after `/speckit-implement` to confirm every acceptance criterion holds.

---

## Setup

1. Checkout the `007-bracket-fill-tax-smoothing` branch.
2. Open both dashboards in two browser tabs (desktop viewport ≥1280px recommended).
3. DevTools → Console on each tab. Watch for errors throughout.

---

## Check 1 — Baseline non-regression

| Step | Expected |
|------|----------|
| 1.1 | `node --test "tests/unit/*.test.js"` | At least **65 tests pass** (pre-feature count) + **≥10 new bracket-fill tests pass**. Total ≥75. |
| 1.2 | `node tests/baseline/browser-smoke.test.js` | 4 smoke tests pass (3 baseline + 1 feature-006 DOM contract) + any new feature-007 DOM asserts. |

If any test fails, STOP. Feature is not ready.

---

## Check 2 — Bracket-fill produces expected tax reduction (SC-001, SC-002)

| Step | Expected |
|------|----------|
| 2.1 | Open `FIRE-Dashboard.html`. Use default RR scenario. | Status bar shows a FIRE age. |
| 2.2 | Scroll to the Lifetime Withdrawal Strategy chart. | Traditional-draw bars appear in EVERY year from 401K unlock (59.5, or 55 if Rule of 55 is enabled) through plan age — not just 3 concentrated years. |
| 2.3 | Strategy summary narrative above the chart | Reads something like: "Strategy: bracket-fill at $118,085 (12% cap × 95% safety). Fills cheap 12% bracket with Traditional each year, routes excess $X/yr into taxable stocks. Avg tax 3-6%." |
| 2.4 | Full Portfolio Lifecycle chart caption | Shows "Lifetime federal tax (bracket-fill): $A · vs. no-smoothing: $B · savings $C (N%)" where `N ≥ 25%`. |
| 2.5 | `_lastKpiSnapshot` or equivalent showing Trad balance at age 73 | At least 50% lower than what the feature-006 CLOSEOUT baseline documented. |

---

## Check 2b — Cross-surface consistency (SC-011, SC-012, FR-063)

Every downstream chart / KPI / banner must agree with bracket-fill's effect. Perform these in order on the same RR scenario.

| Step | Expected |
|------|----------|
| 2b.1 | Note the FIRE age in the status banner ("On Track — FIRE in X years (age Y)"). | Record Y as baseline. |
| 2b.2 | Note the same FIRE age on the Full Portfolio Lifecycle chart — position of the red FIRE-marker triangle. | Matches Y. |
| 2b.3 | Feature 006 sidebar — click the anchor (⚓) to pin. | Sidebar mirror opens; caption shows "FIRE age: Y" — matches. |
| 2b.4 | Sidebar chart shape | Same phase coloring and same markers as the primary chart; total portfolio line follows the same trajectory. |
| 2b.5 | Drag the FIRE marker on the primary chart to age Y+3. Accept the recalculation. | Sidebar chart re-renders in the same frame; sidebar caption updates to Y+3. Lifetime Withdrawal Strategy chart's bars shift (Trad fill now starts at Y+3's unlock-or-earlier depending on Rule of 55). |
| 2b.6 | Clear the override (click "Reset to calculated" or switch strategy mode). | All three surfaces return to the solver's answer. FIRE age in banner, chart marker, sidebar caption all agree again. |
| 2b.7 | KPI row: Years to FIRE, Progress to FIRE, FIRE Number (Primary) | All three reflect bracket-fill (new FIRE number is lower than pre-feature-007; Progress ratio accordingly higher). |
| 2b.8 | Feature 006 compact header live chips (after scrolling past 80px) | "Years to FIRE X" and "Progress Z%" match the KPI values. |
| 2b.9 | Progress rail under KPI row | Fill width matches Progress %; midpoint tick = target/2; target label = new FIRE Number. |
| 2b.10 | Portfolio Drawdown: With vs Without SS chart | Phase coloring reflects bracket-fill's draw pattern (Trad being drawn steadily through retirement). |
| 2b.11 | Roth Ladder chart (if present) | Shape consistent with bracket-fill — less Trad left at older ages. |
| 2b.12 | FIRE-by-Country bar chart | Each country's bar re-ranked under bracket-fill; lengths differ from feature-006 baseline. |
| 2b.13 | Country scenario grid cards (11 countries) | Each card's FIRE number and years update; selecting a different country does not shift the others (feature-005 fix still holds). |
| 2b.14 | Milestone Timeline | Per-country FIRE milestones positioned at the new (usually earlier) ages. |
| 2b.15 | Coast FIRE card / banner | Target updated to the new (bracket-fill) FIRE number. |
| 2b.16 | Take a snapshot (click the snapshot button). | Snapshot CSV row logs the new FIRE target (not the pre-feature-007 value). |
| 2b.17 | Unchanged: Net Worth Pie, Expense Pie, Healthcare comparison, Section dividers, Merged footer | None of these shift. |

---

## Check 3 — Safety margin slider behavior (SC-004)

| Step | Expected |
|------|----------|
| 3.1 | Slider at 5% (default) | Lifetime tax figure noted. |
| 3.2 | Drag slider to 0% | Lifetime tax decreases OR stays similar (more aggressive fill); IRMAA cap now binds at full threshold. |
| 3.3 | Drag slider to 10% | Lifetime tax increases slightly (less aggressive fill); Trad-draw bars visibly shorter. |
| 3.4 | No console errors during drag | Clean. |
| 3.5 | Reload page | Slider restores to last-set value. |

---

## Check 4 — Social Security integration (SC-005, caveat 1)

| Step | Expected |
|------|----------|
| 4.1 | Scroll to the Lifetime Withdrawal Strategy chart. | Trad-draw bars pre-67 are larger than bars at 67+. |
| 4.2 | Hover the age-67 bar | Caption appears: "📌 Social Security taxable (85%) fills $X of the 12% bracket this year — Traditional fill reduced accordingly." |
| 4.3 | Change SS claim age to 70 via existing SS-claim buttons | Trad-draw bars at 67, 68, 69 resize upward (full bracket fill resumes until 70). Caption updates. |

---

## Check 5 — IRMAA protection (SC-006, caveat 2)

| Step | Expected |
|------|----------|
| 5.1 | Default scenario — IRMAA threshold $212K. | No ⚠ glyphs on the chart; the red dashed line at the threshold is visible but nothing crosses it. |
| 5.2 | Set IRMAA threshold to $100,000 manually. | Red line drops to $95,000 (= 100K × 0.95). At least one year's bar now has a ⚠ glyph. Hover the glyph: tooltip shows MAGI and estimated Medicare surcharge. |
| 5.3 | Set IRMAA threshold to $0 | Red line disappears. Hint below the input shows "⚠️ IRMAA protection disabled." No glyphs render. |

---

## Check 6 — Rule of 55 toggle (SC-007, caveat 3)

| Step | Expected |
|------|----------|
| 6.1 | Rule of 55 unchecked (default) | No diamond marker on the Full Portfolio Lifecycle chart at age 55. Trad draws start at 59.5. |
| 6.2 | Check "Plan to use Rule of 55" | Separation age input appears. Default = current FIRE age. |
| 6.3 | If FIRE age ≥ 55 | Diamond marker appears at age 55 on Full Portfolio Lifecycle chart. Trad-draw bars on Lifetime Withdrawal Strategy chart now start at 55. Key Years annotation includes "Age 55 🔓 Rule of 55 Trad unlock". |
| 6.4 | Set separation age to 54 | Warning appears: "Rule of 55 requires separation at age 55 or older — defaulting to 59.5 unlock." Trad-draw bars revert to starting at 59.5. |
| 6.5 | Uncheck Rule of 55 | All Rule-of-55 indicators disappear; Trad draws revert to 59.5. |
| 6.6 | Reload page with Rule of 55 checked + separation age 56 | State restores correctly. |

---

## Check 7 — Single-filer brackets on Generic (SC-008a, SC-008b, SC-008c)

| Step | Expected |
|------|----------|
| 7.1 | Open `FIRE-Dashboard-Generic.html` with default scenario (partnered). | Std ded pre-filled ~$30K; 12% cap ~$94K; IRMAA threshold ~$212K. |
| 7.2 | Change household configuration to remove the partner. | Std ded auto-updates to ~$15K, 12% cap to ~$47K, IRMAA to ~$106K (unless user already edited — test both cases). |
| 7.3 | Verify bracket-fill numbers | Trad-draw bars are VISIBLY SMALLER per year than partnered scenario. Bracket-fill-excess synthetic-conversion amount shrinks correspondingly. |
| 7.4 | `grep 'getTaxBrackets(true)' FIRE-Dashboard-Generic.html` | Returns **0 matches**. Every call site routes through `detectMFJ(inp)`. |
| 7.5 | Reload with single-filer configuration set. | State restores. |

---

## Check 8 — DWZ mode re-targets earlier FIRE age

| Step | Expected |
|------|----------|
| 8.1 | Switch to DWZ mode on RR scenario. | Caption below the FIRE-strategy buttons appears explaining the earlier-FIRE effect. |
| 8.2 | Compared to feature-006 DWZ result for the same scenario | New FIRE age is EARLIER by at least a few months (because synthetic conversions grow the terminal portfolio). |
| 8.3 | Portfolio at plan age | Still approximately $0 (DWZ contract honored). |

---

## Check 9 — Chart transparency (SC-005, caveat visibility)

Overall sanity: a user who has never seen this dashboard can identify within 60 seconds:

| Thing to identify | Where |
|-------------------|-------|
| Strategy is bracket-fill | Strategy narrative above the Lifetime Withdrawal Strategy chart |
| Safety margin is 5% | Same narrative; and the slider value |
| SS is affecting Trad fill (if SS active this year) | Caption beneath the chart |
| IRMAA is binding (if it binds) | ⚠ glyph on the bar AND the red dashed line position |
| Rule of 55 is active (if checked) | Diamond marker at age 55 on lifecycle chart AND key-years annotation |
| Lifetime tax savings vs no-smoothing | Caption below the Full Portfolio Lifecycle chart |

---

## Check 10 — Performance sanity

| Step | Expected |
|------|----------|
| 10.1 | DevTools → Performance. Record 5 seconds of slider drag on the safety-margin slider. | Frame rate ≥ 30fps; recalc latency per drag event < 40ms. |
| 10.2 | Drag the FIRE marker on the primary lifecycle chart for 5 seconds. | ≥30fps (Constitution floor); no visible chart lag; sidebar mirror (feature 006) stays in sync. |

---

## Rollback plan

If any check fails and the fix is not obvious, revert with:

```bash
git checkout main
git branch -D 007-bracket-fill-tax-smoothing  # after abandoning
```

The feature is fully additive (new controls, new code paths). The only change to existing behavior is in `taxOptimizedWithdrawal`; reverting the branch restores the feature-006 cover-spend algorithm. No CSV schema changes, no breaking localStorage changes, no deleted features — safe to revert cleanly.

---

## Known limitations (only a human in the browser can verify)

- Real frame-rate measurement under drag (SC-010 floor).
- Visual polish: new bar segments, IRMAA line, Rule-of-55 diamond all render in the correct stack order and don't overlap.
- Info panel prose reads naturally in both EN and zh-TW.
- Tooltip text doesn't overflow on small viewports.
- Caption updates on every recalc without flicker.
