# Phase 0 Research — SSA Earnings Record: Support Years Before 2020

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**Plan**: `specs/012-ssa-earnings-pre-2020/plan.md`
**Date**: 2026-04-24

## R1 — UI affordance: prepend vs. append

**Question**: How should the user discover the "add a prior year" action without cluttering the existing card?

**Decision**: Two adjacent, equally-weighted buttons below the earnings table: `+ Add Prior Year` (prepends `firstYear − 1`) and `+ Add Year` (appends `lastYear + 1`, existing behaviour). Both use the current `.btn-secondary` style. Left button is the new prior-year control; right is the existing next-year control.

**Rationale**:

- A **dropdown** ("Add year ▾ / choices: Next Year, Prior Year, Specific year…") hides the feature one click deeper than needed and adds a popover component the card doesn't currently have.
- A **single "Insert year" button with a year picker modal** is more flexible but overshoots the defect — 95 % of cases just want to walk backwards one year at a time, which is what the prepend button already solves in one click.
- **Two adjacent buttons** surface both directions at one glance, match existing visual weight, and don't introduce a new interaction pattern.

**Alternatives considered**:

- "Combined ± Year" control with left/right chevrons — cute but error-prone and unclear which side is "prior".
- Inline "+" affordance at the top of the table — subtle, easier to miss, and requires new DOM tooltip scaffolding.

**Implications**: Two button elements with `data-i18n="ss.addPriorYear"` / `data-i18n="ss.addYear"` side by side in a 2-column grid cell. Minor CSS: split the existing `width:100%` on `addSSYear` into `display:grid;grid-template-columns:1fr 1fr;gap:6px` on a wrapping `<div>`.

## R2 — Bulk "Earliest year" input

**Question**: For users with 20+ years of pre-2020 history, clicking "+ Add Prior Year" 20 times is painful. What's the minimum-friction bulk-entry pattern?

**Decision**: A single compact number input (`<input type="number" min="1960" max="<currentYear>">`) + a "Set" button, placed below the two add-year buttons inside the same SSA Earnings Record card. Empty value = no-op. Setting a year **newer** than the current first year = no-op with an inline "no change" message (never destructive, per FR-004).

**Rationale**:

- A **slider** wastes vertical space and gives poor precision for a 60-year range.
- A **modal with a year picker** is overengineered for what is a one-time setup action most users do once per dashboard lifecycle.
- A **plain number input** uses native keyboard behaviour (arrow keys increment, numeric keypad on mobile) and matches the existing visual language of the other card inputs.

**Alternatives considered**:

- Combine it with the existing "+ Add Prior Year" button (e.g., long-press → prompt). Rejected — hidden affordance, not discoverable.
- Infer "earliest year" from user's birthdate ("auto-fill to age 18"). Rejected — assumes a career start that's often wrong; keeps behaviour deterministic and user-driven.

**Implications**: One new `<input>` + one new `<button>` inside the card, with `data-i18n="ss.earliestYearLabel"` on the label and `data-i18n="ss.earliestYearSet"` on the button. An adjacent `<div>` holds the inline status message.

## R3 — Feedback for invalid input (duplicate, floor, non-numeric)

**Question**: When the user tries something invalid (duplicate year, year < 1960, non-numeric entry), how do we surface the failure?

**Decision**: **Inline status line** directly beneath the bulk-input row. Low-emphasis styling (uses existing `color: var(--text-dim)` token; danger cases flip to `var(--warning)`). Auto-clears when the user types into either the bulk input or the earnings input, or after 5 seconds, whichever is first. No toast library, no modal.

**Rationale**:

- **Toast** requires new infrastructure (timer, stacking, animations). The dashboard has no toast system today; adding one just for this feature violates the zero-dependency principle's spirit.
- **Modal/alert** is overkill for what is a recoverable guard rail.
- **Inline** reuses the existing dashboard visual vocabulary (note the `dwzPrecise` and `dwzCaveat` divs nearby — same pattern).

**Alternatives considered**:

- Border-colour change on the input (no text). Rejected — doesn't explain *why* the input was rejected.
- Browser native `alert()`. Rejected — intrusive, not translatable, ugly.

**Implications**: One `<div id="ssEarningsStatus">` with `role="status"` and `aria-live="polite"` beneath the bulk input. JS writes status text via `t('ss.floorReached', year)` / `t('ss.duplicateYear', year)` / `t('ss.yearAccepted', year)`.

## R4 — Unit test coverage plan

**Decision**: `tests/unit/ssEarningsRecord.test.js` MUST ship with the following 10 cases (plus any `.each`-style parametrised groups the engineer adds during TDD):

1. `prependPriorYear` — default record (2020–2025) → record starts at 2019 with earnings=0, credits=4.
2. `prependPriorYear` — record already at floor year (1960) → record unchanged, returns `{ history, reason: 'floorReached' }`.
3. `prependPriorYear` — empty record → prepends `currentYear − 1` and returns `{ history: [{year:currentYear-1,earnings:0,credits:4}], reason: null }`.
4. `prependPriorYear` — ensure immutability: original array reference not modified.
5. `setEarliestYear` — default record + target 2015 → rows 2015..2019 prepended, total length = original + 5.
6. `setEarliestYear` — target equal to current first year → no-op, returns `{ history: sameRef, reason: 'noopAlreadyCovered' }`.
7. `setEarliestYear` — target < floor → clamps to floor and returns `{ history, reason: 'clampedToFloor' }`.
8. Dedup — injecting a duplicate year into an existing record is rejected (not the helpers' job, but a defense-in-depth check on the `sortedAscendingUnique` utility).
9. Invariant — after any combination of `prependPriorYear` + `setEarliestYear` + a manual append, the array is strictly ascending and has no duplicate years.
10. **Integration cross-check**: a fixture with 1995–2025 earnings fed through `projectSS` from `calc/socialSecurity.js` produces a higher `annualBenefitReal` than the same fixture truncated to 2020–2025. Locks SC-002's direction ("prepending high-earning years raises the projected benefit").

Test file follows the `node --test` ESM pattern used throughout `tests/unit/`. No new test harness dependencies.

## R5 — Inline `calcRealisticSSA` vs. extracted `projectSS` divergence

**Observation**: The dashboard today has two SS calculation paths:

| Path | Location | AIME formula |
|------|----------|--------------|
| Inline | `FIRE-Dashboard-Generic.html:6266` (`calcRealisticSSA`) | Sorts raw `ssEarningsHistory` values descending, takes top 35, divides by 420. **No wage indexation.** |
| Extracted | `calc/socialSecurity.js` (`projectSS`) | Indexes each year's nominal to `latestEarningsYear - 2` dollars using `inflationRate` as an AWI proxy, then sorts + AIME. |

**Decision**: Do **not** unify the two paths in this feature. Feature 012 is a data-entry fix, not a calc refactor.

**Rationale**:

- The divergence is a known, deferred item from features 001 + 005 (extracted modules live next to inline originals during the migration phase).
- Unifying them would be a multi-file refactor with its own spec, test plan, and parity validation — out of scope.
- The new `calc/ssEarningsRecord.js` helpers are agnostic to which path consumes them; they just produce and validate a well-shaped `SSEarningsHistory`.

**Implications for SC-002 ("within 2% of ssa.gov Retirement Estimator")**: The cross-check fixture in `tests/fixtures/ss-earnings-1995-2025.js` is asserted against `projectSS` (the extracted, indexing-correct path). `calcRealisticSSA` is NOT cross-checked against ssa.gov; it has a looser tolerance that is out of scope for this feature.

**Alternatives considered**:

- Swap `calcRealisticSSA` to call `projectSS` internally. Rejected — behavioural change to the live dashboard's SS numbers. Needs its own spec + parity lock-in.

## R6 — Floor year

**Decision**: Soft floor at **1960**. Configured as a single exported constant in `calc/ssEarningsRecord.js`:

```js
export const EARLIEST_ALLOWED_YEAR = 1960;
```

**Rationale**: Anyone currently planning FIRE who started earning as a teen in the early 1960s is ~80 years old today — well past most users' planning horizons. The floor prevents accidental entry of years that are certainly typos (e.g., 1900) while not imposing on any realistic user.

**Alternatives considered**:

- `1950` — permissive but admits clearly-typo entries.
- `currentYear − 80` — dynamic, but adds complexity for a margin that changes ~0 real users per year.
- No floor — rejected because the UI has no other guard against "1880".

**Implications**: A one-line change to loosen the floor later (e.g., if a 90-year-old FIRE user appears). No localStorage migration needed because existing records never violate the floor.

## R7 — Default values for a prepended row

**Decision**: `{ year: firstYear − 1, earnings: 0, credits: 4 }`.

**Rationale**:

- `$0` is the SSA-valid zero-earnings year (see spec FR-012). A user with a real amount overwrites it via the existing number-input handler (`updateSSEarning`).
- `credits: 4` matches the existing `addSSYear` default, keeps the "Credits: N/40" tally meaningful, and lets the user drop to a lower credit count if the prepended year was partial (e.g., a student co-op year).

**Alternatives considered**:

- Default earnings to `lastRow.earnings × 0.95` (a rough "one year earlier" extrapolation). Rejected — fabricates data that propagates into SC-002's ≤ 2% benefit cross-check.
- Default credits to 0 for prepended rows. Rejected — breaks the existing credit-tally UX; a user who really worked zero credits can still edit it down.

**Implications**: Matches the existing "+ Add Year" default structure exactly, so the two buttons behave consistently apart from direction.

## Research summary

All seven research items resolved. Zero `[NEEDS CLARIFICATION]` markers carried forward. Plan's Phase 0 prerequisite is satisfied — Phase 1 artifacts (data-model, contracts, quickstart) can be written.
