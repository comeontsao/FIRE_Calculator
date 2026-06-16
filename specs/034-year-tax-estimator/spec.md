# Feature Specification: Year Tax Estimator

**Feature Branch**: `034-year-tax-estimator`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: A single-year "what-if" federal tax lens at the bottom of the Withdrawal Strategy tab in the RR dashboard, to help plan retirement-year withdrawals and avoid accidentally pushing long-term capital gains from the 0% bracket into 15%.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how much more I can sell at 0% capital-gains tax (Priority: P1)

A retired user is taking money out of several accounts during the year and wants to know how much *more* in long-term stock gains they can still realize before any of it gets taxed at 15% instead of 0%. They open the Withdrawal Strategy tab, scroll to the Year Tax Estimator, pick a retirement year, and read a headline that tells them the remaining 0%-capital-gains room for that year in that year's actual dollars.

**Why this priority**: This is the single number the user acts on. It directly prevents the costly mistake described in the request — paying 15% on a stock sale that could have been 0%. It delivers the core value even with nothing else built.

**Independent Test**: Pick a retirement year, observe the auto-pulled ordinary income and gains, and confirm the "Room left at 0% capital gains" headline equals the year's 0%-ceiling minus the year's ordinary taxable income minus gains already realized (floored at zero). Changing the ordinary-income inputs visibly changes the headline.

**Acceptance Scenarios**:

1. **Given** a selected retirement year whose ordinary taxable income is below the year's 0%-capital-gains ceiling, **When** the estimator loads, **Then** the headline shows a positive "room left at 0% capital gains" figure equal to (ceiling − ordinary taxable income − gains already realized).
2. **Given** ordinary taxable income already at or above the year's 0%-capital-gains ceiling, **When** the estimator loads, **Then** the headline shows $0 room left and indicates the next dollar of gain is taxed at 15%.
3. **Given** a displayed room-left figure, **When** the user increases the Roth conversion or Traditional withdrawal input, **Then** the room-left figure decreases by the same amount (until it reaches $0).

---

### User Story 2 - Break down exactly how this year's tax was computed (Priority: P1)

The user does not trust a single "tax owed" number; they want to see the arithmetic. The estimator shows two "show-your-work" cards: one for ordinary income tax (gross → minus standard deduction → taxable → each bracket layer) and one for capital-gains tax (how ordinary income consumes the 0% ceiling, then which slices of gain fall into 0% / 15% / 20%). Each line shows dollars-in-layer × rate = tax.

**Why this priority**: The request explicitly asks for "the calculation details how the numbers came out." Without the breakdown, the tool is a black box the user cannot learn from or sanity-check. The capital-gains stacking breakdown is the heart of the feature.

**Independent Test**: For a hand-computable year, confirm every layer line (bracket threshold range, dollars taxed in that layer, rate, resulting tax) is shown and that the layer taxes sum to the displayed ordinary total and capital-gains total respectively.

**Acceptance Scenarios**:

1. **Given** ordinary gross income and a standard deduction, **When** the breakdown renders, **Then** it shows gross, the deduction subtracted, the resulting taxable amount, one line per ordinary bracket that has dollars in it, and a total equal to the sum of the lines.
2. **Given** long-term gains that straddle the 0% ceiling, **When** the capital-gains breakdown renders, **Then** it shows the portion taxed at 0%, the portion taxed at 15%, any portion at 20%, and a total equal to the sum.
3. **Given** ordinary taxable income that already exceeds the 0% ceiling, **When** the capital-gains breakdown renders, **Then** it shows $0 taxed at 0% and the full gain taxed at 15%/20%.

---

### User Story 3 - Pick any retirement year and edit a what-if without disturbing the plan (Priority: P2)

The user wants to inspect any year of retirement (not just the current one), try changing the withdrawal mix to see the tax effect, and then reset back to the projected numbers — all while being certain none of this alters their actual plan or the Lifecycle chart.

**Why this priority**: The year picker and safe editing make the tool usable across the whole retirement horizon and let the user experiment freely. It builds on P1/P2 but is not required for the core 0%-room answer.

**Independent Test**: Select different years and confirm the inputs repopulate from each year's projection; edit an input and confirm only the estimator's own numbers change; press Reset and confirm the auto-pulled values return; confirm the Lifecycle chart, lifetime-tax caption, and plan are unchanged throughout.

**Acceptance Scenarios**:

1. **Given** the estimator, **When** the user selects a different retirement year, **Then** all editable inputs repopulate with that year's projected amounts in that year's dollars.
2. **Given** edited inputs, **When** the user presses Reset, **Then** every input returns to the auto-pulled value for the currently selected year.
3. **Given** any edits made in the estimator, **When** the user views the Lifecycle chart and lifetime-tax figures, **Then** those are identical to before the edits — the estimator never writes back to the plan.
4. **Given** the estimator block, **When** the user reads it, **Then** a persistent caption states that edits are a local what-if and do not change the Lifecycle chart or plan.

---

### User Story 4 - Understand the jargon and the secondary tax traps (Priority: P2)

The user is not a tax expert. Every technical term (standard deduction, 0% capital-gains ceiling, marginal rate, IRMAA, NIIT) has a hover tooltip in plain English. The estimator also surfaces the next-dollar marginal rates and warns when the year crosses the IRMAA or NIIT thresholds.

**Why this priority**: The user explicitly asked for "i" hover icons because they don't understand the terms, and asked for IRMAA/NIIT/marginal signals. These turn the tool from a calculator into a teaching aid that catches additional traps.

**Independent Test**: Confirm each labelled term exposes a hover tooltip with a plain-language explanation; confirm the marginal next-dollar chips show the correct ordinary and capital-gains next-dollar rates; confirm IRMAA and NIIT warnings appear only when their thresholds are crossed.

**Acceptance Scenarios**:

1. **Given** any labelled input or signal, **When** the user hovers its info icon, **Then** a plain-English explanation appears.
2. **Given** a year whose income leaves the user inside the 12% bracket with 0%-capital-gains room remaining, **When** the marginal chips render, **Then** the "next $1 of ordinary income" chip shows the ordinary marginal rate and the tooltip warns that adding ordinary income can push gains from 0% to 15%.
3. **Given** a year whose total income exceeds the IRMAA Tier 1 threshold, **When** the estimator renders, **Then** an IRMAA warning chip is shown; otherwise it is absent.
4. **Given** a year whose income exceeds the NIIT threshold, **When** the estimator renders, **Then** a NIIT 3.8% warning chip is shown with the extra tax amount; otherwise it is absent.

---

### Edge Cases

- **Stock gain entirely within 0% room**: entire gain taxed at 0%; capital-gains tax is $0; room-left is reduced but non-negative.
- **Gain straddling the 0% ceiling**: split correctly — part at 0%, remainder at 15% (and 20% above the upper breakpoint).
- **Ordinary taxable income exceeds the 0% ceiling**: 0% room is $0; the whole gain is taxed at 15%/20%; room-left headline reads $0.
- **Standard deduction larger than gross ordinary income**: ordinary taxable income floors at $0 (never negative); the full standard deduction is *not* allowed to spill over and shelter capital gains beyond the 0% ceiling rule already in effect.
- **Zero income across all inputs**: all tax figures are $0; effective rate displays as 0% with no division error.
- **No projection available yet (cold load / not feasible)**: the estimator shows a neutral "select inputs" state with zeroed auto-pull rather than NaN, dashes, or errors.
- **Selected year before FIRE / outside retirement range**: the picker only offers valid retirement years (FIRE age → plan age); years outside that range are not selectable.
- **NIIT threshold in a far-future year**: the $250K NIIT threshold stays fixed (not inflated), so later years can trigger NIIT even when inflation-indexed brackets have moved well past it — this is surfaced, not hidden.

## Requirements *(mandatory)*

### Functional Requirements

**Scope & placement**

- **FR-001**: The estimator MUST appear only in the RR dashboard (`FIRE-Dashboard.html`), at the bottom of the Withdrawal Strategy tab, and MUST NOT be added to the Generic dashboard.
- **FR-002**: The estimator MUST be a self-contained "what-if" lens: user edits within it MUST NOT change the Lifecycle chart, the lifetime-tax figures, the strategy ranking, or any persisted plan input.
- **FR-003**: The estimator MUST display a persistent, plainly-worded caption stating that its numbers are a local what-if and do not sync with the Lifecycle chart or the plan.

**Year selection & auto-pull**

- **FR-004**: Users MUST be able to select any retirement year from FIRE age through plan age via a year picker.
- **FR-005**: Selecting a year MUST auto-populate the estimator's inputs from that year's projected figures, drawn from the same strategy results that drive the Roth-ladder view, so the estimator agrees with the projection on un-edited values.
- **FR-006**: A Reset control MUST restore every input to the auto-pulled value for the currently selected year.

**Editable inputs**

- **FR-007**: The estimator MUST provide editable inputs for: Other ordinary income, Traditional 401k/IRA withdrawal, Roth conversion, and Long-term stock gain realized.
- **FR-008**: The estimator MUST provide an editable Standard deduction input and a NEW dedicated "0% capital-gains ceiling" input (defaulting to the current-law MFJ figure, ~$96,700 for 2026), distinct from the existing "Top of 12% bracket" input.
- **FR-009**: Every input and every signal MUST expose a plain-English hover explanation of the term it represents.

**Tax computation — ordinary**

- **FR-010**: The estimator MUST compute ordinary income tax as: gross ordinary income (Other income + Traditional withdrawal + Roth conversion) minus the standard deduction (taxable amount floored at $0), then marginal brackets applied layer by layer.
- **FR-011**: The ordinary tax breakdown MUST show gross, the deduction, the taxable amount, one line per bracket layer that contains dollars (range, dollars-in-layer, rate, layer tax), and a total equal to the sum of the layers.

**Tax computation — capital gains (the core)**

- **FR-012**: The estimator MUST compute long-term capital-gains tax by stacking gains *on top of* ordinary taxable income: ordinary taxable income consumes the bottom of the 0% capital-gains ceiling; only the remaining room is taxed at 0%; the next slice is taxed at 15% up to the upper breakpoint; the remainder is taxed at 20%.
- **FR-013**: The capital-gains breakdown MUST show, as explicit layers, the dollars taxed at 0%, at 15%, and at 20%, and a total equal to the sum.
- **FR-014**: This stacking behavior MUST be implemented independently of `calc/tax.js` `computeTax`, which deliberately does not stack capital gains on ordinary income and applies no standard deduction.

**Signals**

- **FR-015**: The estimator MUST display a headline "Room left at 0% capital gains" equal to max(0, 0%-ceiling − ordinary taxable income − gains already realized), in the selected year's dollars.
- **FR-016**: The estimator MUST display the marginal next-dollar rate for ordinary income and for long-term capital gains, with a tooltip warning that adding ordinary income can push gains from the 0% bracket into 15%.
- **FR-017**: The estimator MUST show an IRMAA Tier 1 warning when the year's income measure crosses the IRMAA Tier 1 threshold, and hide it otherwise.
- **FR-018**: The estimator MUST show a NIIT 3.8% warning, including the extra tax amount, when the year's income exceeds the NIIT threshold, and hide it otherwise.

**Frame (nominal dollars of the selected year)**

- **FR-019**: All estimator inputs, computations, and displayed figures MUST be in the selected year's nominal (future) dollars — the dollars that would appear on that year's tax return — not today's purchasing power.
- **FR-020**: Bracket thresholds that are inflation-indexed in current tax law — standard deduction, the ordinary brackets, the 0% capital-gains ceiling, and the IRMAA Tier 1 threshold — MUST be inflated to the selected year using the dashboard's existing inflation assumption.
- **FR-021**: The NIIT threshold MUST remain fixed at its statutory $250K (MFJ) in nominal terms for every year (it is not inflation-indexed in law), and a tooltip MUST explain that later years therefore trigger NIIT more easily.

**Terminology & robustness**

- **FR-022**: All user-facing copy MUST follow the project money terminology — "dollars / tax owed / gains" — and MUST NOT use the phrase "real $" / "real money" for any figure.
- **FR-023**: The estimator MUST degrade gracefully: zero or missing inputs and an unavailable projection MUST yield zeros and a neutral state, never NaN, blank dashes, or thrown errors.
- **FR-024**: New user-visible strings MUST be wired through the existing i18n catalog consistent with the rest of the dashboard.

### Key Entities *(include if feature involves data)*

- **Year tax estimate (input)**: a selected retirement year plus the four income components (other ordinary income, Traditional withdrawal, Roth conversion, long-term gain) and the two settings (standard deduction, 0% capital-gains ceiling), all in that year's nominal dollars.
- **Year tax estimate (output)**: ordinary tax with its layer breakdown; capital-gains tax with its 0%/15%/20% layer breakdown; the four signals (0%-room headline, marginal next-dollar rates, IRMAA flag, NIIT flag + amount); and an ordered list of human-readable calculation steps ("show your work").
- **Inflation-adjusted bracket set**: the standard deduction, ordinary brackets, 0% capital-gains ceiling, and IRMAA threshold inflated to the selected year; plus the fixed (un-inflated) NIIT threshold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find the "how much more can I sell at 0% capital gains this year" figure for any chosen retirement year in under 30 seconds from opening the Withdrawal Strategy tab.
- **SC-002**: For every test year, the displayed ordinary tax equals the sum of its shown bracket layers, and the displayed capital-gains tax equals the sum of its shown 0%/15%/20% layers (no unexplained residual).
- **SC-003**: Editing any input updates all dependent figures within the same interaction (no manual refresh), and Reset returns every input to its auto-pulled value 100% of the time.
- **SC-004**: After any sequence of estimator edits, the Lifecycle chart, lifetime-tax figures, and persisted plan are byte-for-byte unchanged from before the edits.
- **SC-005**: Every technical term in the block has a working plain-English hover explanation; a non-expert can state what "0% capital-gains ceiling," "IRMAA," and "NIIT" mean after reading the tooltips.
- **SC-006**: The capital-gains stacking calculation matches hand-computed expected values across the defined edge cases (gain fully in 0%, straddling 0%→15%, ordinary income consuming all 0% room, NIIT trigger, IRMAA trigger, deduction flooring) with zero failures.

## Assumptions

- The RR dashboard's existing strategy/projection layer already exposes, per retirement year, the ordinary income components and realized long-term gains needed for auto-pull (the Roth-ladder view consumes the same data); if a needed component is not separately available, a reasonable derived split is used and noted.
- The dashboard's existing inflation assumption is the single source for inflating indexed thresholds to the selected year; no new inflation input is introduced.
- Default bracket figures (standard deduction, ordinary bracket tops, 0% capital-gains ceiling ~$96,700 MFJ 2026, IRMAA $212K, NIIT $250K) reflect MFJ current-law estimates; the user can override the editable ones.
- Filing status follows the household (MFJ for R&R); single-filer handling is out of scope for this RR-only block.
- State income tax, the additional Medicare surtax beyond NIIT, AMT, and Social Security taxation interactions are out of scope for v1; the estimator covers federal ordinary tax, long-term capital-gains tax, and the IRMAA/NIIT flags only.
- This is a planning estimate, not tax advice; copy reflects that framing.
- The estimator reuses the existing tab's bracket inputs where they already exist (standard deduction, top of 12%/22%, IRMAA threshold, stock-gain %) rather than duplicating them, adding only the new 0% capital-gains ceiling input.
