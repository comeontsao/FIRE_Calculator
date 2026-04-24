# Phase 0 Research: Country Budget Scaling by Household Size

**Feature**: 010-country-budget-scaling
**Date**: 2026-04-24
**Status**: Complete — all NEEDS CLARIFICATION markers resolved via `/speckit-clarify`.

This file consolidates the decisions that shaped the plan. Each entry follows the `Decision / Rationale / Alternatives considered` format.

---

## 1. Adults-only scaling formula

**Decision**: OECD-modified adults-only equivalence scale. First adult = 1.0, second adult = 0.5. Couple weight = 1.5. Runtime factor = `adult_weight / 1.5`. Children do NOT contribute to this factor.

**Rationale**:

- OECD-modified is the most internationally recognized household cost-of-living scale (adopted by Eurostat, OECD Better Life Index, and most BLS single-vs-married comparisons).
- Yields clean factor values: solo = 0.67, couple = 1.00. The Adults counter is hard-capped at 2 (inherited from feature 009 FR-028), so these are the only two factor values that can occur. This makes the regression surface small and the fixture coverage trivial.
- Matches published single-vs-couple cost studies (BLS Consumer Expenditure, NerdWallet single-person benchmarks typically center on 0.65–0.70).
- Keeps the formula legible for the help tooltip: "Adults-only OECD-modified — solo households run ~67% of couple costs because housing, utilities, and transport are largely fixed."

**Alternatives considered and rejected**:

- **Linear shared-overhead** (`0.60 + 0.20 × (adults − 1)`, solo = 0.60, couple = 0.80): required re-anchoring hardcoded country defaults and produced a 20% first-load drop for existing couple users. Rejected by user — violated FR-002 zero-regression guarantee.
- **Flat 0.70× solo**: too rough; gives the same factor regardless of underlying household economics. Rejected in favor of a formula the tooltip can name.
- **Square-root scale** (solo = 1/√2 ≈ 0.71): elegant mathematically but not tied to any widely-recognized domestic-economics framework; harder to justify in the tooltip.
- **Full OECD-modified with kids** (kids at 0.3 each, solo = 0.48, family-of-4 = 1.00): the original spec assumption before clarification. Rejected by user's explicit directive that children should not scale post-FIRE country budgets (pre-college child costs are handled via the separate per-child allowance overlay; college is handled by existing logic).

---

## 2. Baseline re-interpretation

**Decision**: Re-interpret the hardcoded `scenarios[]` entries (US \$78K, Taiwan \$36K, Japan \$42K, …) as the **couple (2-adult) baseline**. This is a documentation-level change; the hardcoded numbers themselves are untouched.

**Rationale**:

- Preserves FR-002's zero-regression guarantee for every Adults=2 user, regardless of child count. First-load visual delta = 0 for the overwhelming majority of current users.
- Aligns with the adults-only factor: at Adults=2 the factor is exactly 1.00×, so the displayed value equals the hardcoded value.
- Avoids a data-migration step. No scenario array mutation, no snapshot re-computation, no CSV rewrite.
- Semantically consistent with the user's directive: "spending of children are not used in the calculation after FIRE" — the baseline is the adults' lifestyle cost, and kids layer on top via the allowance.

**Alternatives considered and rejected**:

- **Treat hardcoded values as family-of-4, strip kids' share on first load**: would produce a ~29% drop for every existing couple-with-kids user. Rejected — breaks FR-002.
- **Re-calibrate `scenarios[]` to a published single-person benchmark and scale up**: would introduce a data migration, require re-sourcing every country's underlying cost basis, and churn the whole config for no user-facing benefit. Rejected — out of scope.

---

## 3. Per-child post-FIRE allowance schedule

**Decision**: Hardcoded age-graded schedule applied only during each child's post-FIRE pre-college years.

| Child age | Annual allowance (\$) | Delta vs prior year |
|-----------|-----------------------|---------------------|
| 0–12 | 2,000 | — (flat base) |
| 13 | 2,500 | +500 (raise 1) |
| 14 | 3,000 | +500 (raise 2) |
| 15 | 4,000 | +1,000 |
| 16 | 5,000 | +1,000 |
| 17 | 6,000 | +1,000 (cap) |
| 18+ (college) | 0 (existing per-child college logic takes over) | — |

**Rationale**:

- Derived from user domain input during clarification Q3. Reflects the user's mental model: retirees funding household spending from investments (not paycheck) need an explicit line item for kids' pre-college costs, because the Monthly Expense Breakdown is only populated for pre-FIRE years.
- Flat \$2,000/yr through age 12 reflects early-childhood economies of scale (shared food, existing housing, minimal independent activities). Ramp starts at age 13 mirroring typical teen-cost inflection (phone plans, activities, clothing, transport contributions).
- \$6,000/yr cap at age 17 reflects the point at which incremental per-year growth flattens just before college takes over. Avoids unbounded growth or a cliff.
- Silent overlay (no user-editable slider in this feature) matches user's Option C preference: they want it modeled automatically, not as yet another dial to tune.
- Terminates the year a child enters college (driven by each child's existing `collegeStartYear` derived from birthdate + college-plan data) so there is no double-count with college tuition.

**Alternatives considered and rejected**:

- **Flat \$6,000/yr per child from birth through age 17** (the original Option C wording): rejected by user — understated early years and overstated late years.
- **Linear \$1,000/yr ramp for all ages**: rejected — user specifically wanted the first two raises to be smaller (\$500) to reflect gentler age-12-to-14 cost growth.
- **User-configurable slider**: rejected — user explicitly asked for silent under-the-hood overlay to keep UI from bloating.
- **Strict adults-only (no allowance at all)**: original Option A in Q3. Rejected by user because retirement spending in this dashboard comes from the portfolio; the model needs to capture realistic post-FIRE kid costs for users retiring with young kids.

---

## 4. College-takeover rule

**Decision**: Allowance terminates the year a child's existing college-plan data designates as college start. Existing per-child college tuition / room-board / student-loan logic takes over from that year forward. Default college start age = 18 unless the child's birthdate + college-plan explicitly differs.

**Rationale**:

- Reuses the dashboard's existing per-child college machinery (`childrenList[i].college`, `childrenList[i].date` → derived `collegeStartYear`). No new control needed.
- Guarantees no double-count: any year that belongs to the college window is NOT an allowance year for the same child.
- Consistent with feature 010's "children still exist before they go to college" clarification — the allowance IS the "before college" cost; the existing logic handles "during college."

**Alternatives considered and rejected**:

- **Hard-code age 18 college start for all kids**: rejected — ignores the per-child college plan that the dashboard already supports and that the user has explicitly tuned per kid in RR.
- **Run allowance through age 22 (alongside college) as pocket money**: rejected — college tuition already accounts for room/board/incidentals; adding allowance on top would double-count.

---

## 5. Per-country override semantics

**Decision**: The new per-country Adjust Annual Spend `<input type="number">` wins over the adults-only factor. When the override is non-zero, the scaling accessor returns the override value directly without multiplying by the factor. Setting the input to 0 or empty restores the factor-scaled preset.

**Rationale**:

- Parity with RR behavior (user's explicit requirement in clarification Q4). RR has had this input for months; Generic has only been missing the UI wiring.
- Matches feature 007's `data-user-edited='1'` discipline — manual edits always win over auto-computed defaults.
- Stores per-scenario, so users can override one country (e.g., set US to their measured budget) without affecting others. Other countries continue to auto-scale.

**Alternatives considered and rejected**:

- **Multiply factor into override**: rejected — defeats the purpose of "manual override wins." Users would still see their typed value get scaled down at Adults=1.
- **Override replaces factor only when Adults=1**: rejected — asymmetric behavior surprising to users.
- **Add override as a third tier alongside Lean/Normal/Comfortable**: rejected — too invasive; current lifestyle toggle is a separate axis (FR-017) that should be preserved.

---

## 6. Strategy-vs-requirement separation

**Decision**: The scaled country budget + per-child allowance + per-child college tuition defines the annual spend REQUIREMENT at each post-FIRE year. The selected withdrawal strategy (DWZ / SAFE / bracket-fill / low-tax / any future strategy) takes the requirement as input and produces the year-by-year drawdown plan. Strategy is applied FIRST — the chart renders the strategy's output, not the raw requirement.

**Rationale**:

- Preserves the withdrawal-strategy architecture from features 007 (bracket-fill tax smoothing) and 008 (multi-strategy withdrawal optimizer). The user explicitly invested in that architecture and the user's clarification Q4 confirmed strategies must continue to take precedence.
- Enables the correct mental model: "how much spend do I need?" (scaling + allowance + college) is independent from "how do I fund it tax-efficiently?" (strategy).
- Swapping strategies at the same household composition changes the drawdown curve but must leave the requirement curve identical — this is testable via SC-009 and a new fixture class.

**Alternatives considered and rejected**:

- **Apply scaling factor inside each strategy's logic**: rejected — would require touching every strategy implementation (DWZ, SAFE, bracket-fill, low-tax) and create N places where the factor could drift from the single source of truth.
- **Apply scaling factor to the strategy's OUTPUT (the drawdown plan)**: rejected — misattributes the adjustment (it's a spend-need change, not a withdrawal-style change).

---

## 7. UI indicator format

**Decision**: Two-line caption near the country comparison section.

- Line 1 (always shown): `Country budget: {adultCount} adult(s) → {factor}× couple baseline`
- Line 2 (shown only when ≥ 1 child tracked): `+ per-child allowance during pre-college years ({childCount} children tracked)`

Tooltip explains the full rule: adults-only country factor, per-child allowance schedule (ages 0–12: \$2,000/yr ramping to \$6,000/yr at age 17), and that college tuition is tracked separately per child.

**Rationale**:

- Surfaces both behaviors to the user: the factor they can reason about (Line 1) and the overlay that silently affects the Lifecycle chart (Line 2).
- Line 2 is conditionally shown to keep the UI quiet for users with no children — otherwise a permanent `0 children tracked` feels like an error.
- Localized in both EN and zh-TW per Principle VII (SC-007).

**Alternatives considered and rejected**:

- **One-line, adults-only**: rejected — hides the per-child allowance from users, who then wonder why their Lifecycle chart's post-FIRE curve isn't flat.
- **Composite "X adults + Y kids → Z× (adults-only)"**: rejected — implies kids moved the factor, when they didn't.
- **Omit the indicator entirely for Adults=2**: rejected — a permanent visible indicator is better UX than conditional visibility, because users toggling Adults 1↔2 benefit from seeing the factor flip in place.

---

## 8. Monthly Expense Breakdown — out of scope

**Decision**: Monthly Expense Breakdown table remains fully user-owned and is NOT touched by feature 010. No auto-scaling, no default regeneration, no first-load migration.

**Rationale**:

- User explicitly confirmed this in clarification Q5 (Option A).
- Consistent with FR-008 from the original spec and with feature 007's user-input-ownership pattern.
- The table is where kids naturally enter pre-FIRE spending (the user types household totals that reflect their actual situation, including kids). No automated scaling needed.

**Alternatives considered and rejected**:

- **One-time default population at Adults=1 first load**: rejected — risks overwriting a user who typed their own values before touching Adults. Also conflates "empty defaults" with "user-owned" ambiguously.
- **Live scaling on Adults change**: rejected — would silently rewrite user data every time they toggle Adults.

---

**Output**: All decisions locked. Ready for Phase 1 (data-model.md, contracts/, quickstart.md).
