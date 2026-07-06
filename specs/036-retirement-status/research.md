# Phase 0 Research: Explicit Retirement Status

All items below were open questions from the Technical Context. Each is resolved with a decision, rationale, and rejected alternatives, grounded in the current code.

## R1 — Mapping a retirement *date* to the model's *age* axis

**Decision**: The projection is annual and age-indexed (`for (let age = inp.ageRoger; age <= endAge; age++)`, year = `2026 + (age - inp.ageRoger)`; RR `projectFullLifecycle` ~line 11469/11501). Convert a retirement **year** `Y` to a transition age:
`retirementAge = inp.ageRoger + (Y - CURRENT_YEAR)`, where `CURRENT_YEAR = 2026` (the model's base year). Clamp `retirementAge = max(inp.ageRoger, retirementAge)` so a past/current date means "retired now" (FR-013).

**Rationale**: The transition is entirely driven by `const fireAge = overrideFireAge != null ? overrideFireAge : (currentAge + yearsToFIRE)` feeding `const isRetired = age >= fireAge` (RR ~11229/11502). Feeding a retirement-derived age into the same `overrideFireAge` slot reuses the whole downstream machine — no new branch in the per-year loop. Sub-year precision is out of scope (spec Assumptions: annual granularity); a **year** input (not a full date) is sufficient and simplest.

**Alternatives rejected**: (a) A calendar date-picker with month precision — rejected: the model has no sub-year resolution; would add false precision and UI weight. (b) A separate "retirement transition" code path in the loop — rejected: duplicates the working/retired decision and invites drift from the drag path (violates Principle III).

**UI**: a **year** number input (e.g. `retirementYear`, default = current year) shown when the switch is ON. Copy frames it as "Retirement year".

## R2 — Making Retirement Status supersede the FIRE-marker drag without two conflicting levers

**Decision**: Retirement status resolves in the **single** effective-transition path every renderer already reads: `effectiveFireAge = fireAgeOverride != null ? fireAgeOverride : calculatedFireAge` (RR ~15406; also `chartState.effectiveFireAge`, RR ~9065/16979). This is the value passed as `overrideFireAge` into `projectFullLifecycle` at every call site. **Note**: `calc/fireAgeResolver.js` (`findEarliestFeasibleAge`) is *display-precision only* (month rounding for the verdict pill) — it does NOT set the transition; do not route retirement status through it. Introduce a small pure helper `resolveRetirementTransitionAge(inp, status)` and have the effectiveFireAge path consult it FIRST. Precedence, highest first:
1. **Retirement status ON** → effective transition age = the retirement age (RR household; Generic = latest per-person age). The drag `fireAgeOverride` is **ignored** while ON (FR-011).
2. Status OFF → existing behavior: `fireAgeOverride` (drag) if set, else `calculatedFireAge`.

Concretely: gate the drag entry points (mousedown hit-test RR ~16466; `applyOverride`/`cs.setOverride` RR ~16795) on status OFF, and make the `effectiveFireAge` reads return the retirement age when ON.

When status flips ON, disable/park the drag interaction (visually indicate the marker reflects the actual date and is not draggable). When it flips OFF, restore the drag and clear any residual retirement effect (FR-009 / SC-004).

**Rationale**: Principle III mandates one resolver consumed uniformly; the audit history (constitution III "Why") shows split re-derivation causes stale KPIs. Layering retirement status **inside** the resolver guarantees every chart, KPI, verdict, healthcare/mortgage delta reads the same transition.

**Alternatives rejected**: Letting the drag write the retirement date — rejected: conflates a durable fact with a transient what-if; the spec explicitly keeps them distinct (US3).

## R3 — Staggered two-earner retirement inside a single-transition accumulator (Generic)

**Decision**: Extend `calc/accumulateToFire.js` with an **optional** `retirement` descriptor in its `options` bag:
- absent → **unchanged** feasibility-driven behavior (income = `inp.annualIncome`, transition at `fireAge`).
- `{ households: [{ income, retirementAge }, …] }` → per-year employment income = **sum of each earner's income whose `retirementAge > age`**; contributions scale with the remaining working income (see R4). The accumulation phase runs to the **latest** `retirementAge` (household fully retired = drawdown thereafter).

RR (single date) is the degenerate one-earner case: `households: [{ income: inp.annualIncome, retirementAge }]`, transition age = that age. Generic single-adult mode (FR-020): one earner only; Person 2 income hidden/ignored.

**Rationale**: The accumulator already computes per-year gross income (`grossIncome`, income trajectory via `raiseRate`) and derives contributions from it. Masking income per-earner per-year is a localized change in the income computation; the transition age (loop's `isRetired`) becomes `max(retirementAge)`. This keeps one accumulator and one drawdown path.

**Alternatives rejected**: Two independent simulations summed — rejected: pools (401k/stocks/cash) are shared household balances, not per-person; summing two sims double-counts growth and breaks conservation. A hard single transition with no interim income — rejected: fails SC-008 (interim years must retain the still-working earner's income).

## R4 — Contribution attribution across two earners (Generic)

**Decision**: Contributions in the interim (one retired, one working) years scale with **remaining working income share**. Practically: 401(k) employee + match and the discretionary brokerage contribution are reduced in proportion to `remainingWorkingIncome / totalWorkingIncome` for that year; when both are retired, all new contributions are $0 (the honest end state, spec Assumptions). Pre-tax 401(k) of the retired earner stops; the working earner's continues. Exact per-account split is finalized here as **proportional-to-income** (simplest defensible rule) and locked by a fixture.

**Rationale**: Spec flags this as a "modeling detail to be finalized in planning" and requires only that a fully-retired household makes no new contributions. Proportional attribution is transparent, needs no new per-person contribution inputs, and degenerates correctly (RR / single-adult: share = 1 until retirement, then 0).

**Alternatives rejected**: Per-person contribution inputs (person1_401kContrib, …) — rejected for v1: multiplies the input surface; the spec does not ask for per-person contribution entry, only per-person income. Keeping full household contributions until the *later* date — rejected: overstates saving in interim years (a retired earner contributes nothing).

## R5 — Reframing the feasibility verdict when retired (FR-006 / FR-014)

**Decision**: In the verdict block (RR ~14511–14541, Generic equivalent), add a **retired branch taken first** when status is ON. It ignores `yrsToFire`/"FIRE in N years" and instead reads the resolved lifecycle (`projectFullLifecycle` with the retirement transition + active strategy options): if every retirement-year balance stays ≥ 0 through plan end → affirmative "**Sustainable to age {endAge}**"; otherwise "**At risk — shortfall in {year}**" using the first year `hasShortfall`/`total < 0` appears. Never emits a countdown. The Safe/Exact/DWZ gate result is reinterpreted as this sustainability indicator (it does not change the gate math).

**Rationale**: The existing block already probes `projectFullLifecycle` for the stop-gap (RR ~14553–14592) — the retired branch reuses the same probe and the existing `hasShortfall` per-year flag (Principle VIII) to find the shortfall year. Reinterpreting rather than recomputing keeps one source of truth.

**Alternatives rejected**: A separate "retiree mode" panel — rejected: the headline is the single verdict users read; two verdicts would contradict (the very bug FR-014 forbids).

## R6 — Auto-suggest semantics (US4 / FR-012)

**Decision**: Non-blocking, dismissible banner shown only when status is OFF **and** the user's numbers newly cross the feasible line (`yrsToFire <= 0` / resolver feasible today). Dismissal is **session-scoped** via `sessionStorage` (`fire:retireSuggestDismissed`) so it does not nag again that session and does not persist across genuinely new sessions. Accepting sets status ON with retirement year = current year (delegates to US1). The switch, never the detector, is the source of truth — the banner changes no projection unless accepted.

**Rationale**: Mirrors the existing dismissible drag-hint pattern (`fire:dragHintSeen` in `localStorage`, RR ~16790/16897) but uses `sessionStorage` because the spec wants per-session non-nagging, not permanent suppression.

**Alternatives rejected**: `localStorage` permanent dismissal — rejected: user may want the nudge again in a later session as numbers evolve. Auto-flipping status ON when feasible — rejected: violates "switch is the source of truth" and would surprise users still working.

## R7 — Passive income independence (FR-004)

**Decision**: No change needed. Social Security is gated by `ssActive = (age >= inp.ssClaimAge) && withSS` (RR ~11504), fully independent of `fireAge`/the transition. The retirement descriptor only stops **employment** income and **new contributions**; SS/pension continue on their own start ages.

**Rationale**: Confirmed by reading the per-year loop — SS is computed from `ssClaimAge` and `ssCOLARate`, never from the working/retired flag.

## R8 — Persistence shape

**Decision**: Extend the state blob with a structured `state._retirementStatus` object (sibling of `state._payoffVsInvest`, RR ~19206), plus register the new Generic income inputs in `PERSIST_IDS` (~19075). Keys are per-dashboard: RR `STATE_KEY='fire_dashboard_state'` (~19072); Generic `STATE_KEY='fire_dashboard_generic_state'` (~18629). Restored in `restoreState` (RR ~19221) alongside existing structured restores. Shapes differ by dashboard (FR-008).

**⚠ Hazard — do NOT bump `GENERIC_VERSION`.** The Generic dashboard has a schema gate `GENERIC_VERSION='v3'` (~19730) that **wipes both saved state and snapshots** on mismatch. Because `_retirementStatus` and the new income inputs are purely additive (absent ⇒ status OFF; migration back-fills `person1Income`), there is **no reason to bump it** — doing so would destroy every Generic user's saved inputs and snapshot history. Keep `GENERIC_VERSION='v3'`. RR has no version gate; its `Object.assign(DEFAULTS, JSON.parse(...))` (RR ~21508) merges additively.

**Rationale**: Reuses the proven structured-object persistence used for `_payoffVsInvest`/`_expenses`; additive keys mean old saved states still load (INV-1 safe default).

**Alternatives rejected**: A separate top-level localStorage key — rejected: the existing single-blob save/restore already round-trips structured objects; adding a key fragments the schema. Bumping `GENERIC_VERSION` to "migrate" — rejected: it wipes data rather than migrating; additive fields need no gate.
