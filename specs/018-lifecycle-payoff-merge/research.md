# Phase 0 Research — Feature 018

The Technical Context section produced no `NEEDS CLARIFICATION` markers — Q1–Q6 in the spec phase resolved every design decision. Phase 0 instead investigates five implementation-level questions that affect HOW (not WHAT) we implement.

---

## R1. How does the existing lifecycle simulator consume mortgage state today?

**Decision:** Identify the single function call in each HTML where the lifecycle simulator reads mortgage cash flow, and inject the resolved mortgage trajectory at that point. The most likely call site is `projectFullLifecycle(inp, annualSpend, fireAge, isFinalSimulation, options)` (consistent with feature 008's option-override pattern) — we add a new `mortgageStrategyOverride` option following the same convention.

**Rationale:** The codebase already uses an "options override" pattern threaded through `projectFullLifecycle` for strategy and theta (per feature 008's `strategyOverride` / `thetaOverride`). Adding `mortgageStrategyOverride` to the same options bag keeps the call-site consistent with the established pattern and ensures every feasibility probe + chart render goes through the same input pipeline (closing the feature-014 drift gap).

**Alternatives considered:**
- A new module-level `let` variable read by the lifecycle simulator at recompute time — rejected as a Principle III violation (creates a parallel source of truth).
- Refactoring the lifecycle simulator into `calc/lifecycle.js` first — rejected as out-of-scope per spec.

**Implementation note:** During plan execution, the implementer's first task should be to grep both HTML files for `projectFullLifecycle\(` to enumerate every call site (chart renderer, FIRE-age search, audit, copyDebug). Each MUST receive `mortgageStrategyOverride` in the same change set.

---

## R2. Where in the lifecycle simulator does the mortgage cash flow apply?

**Decision:** The lifecycle simulator computes annual net contributions (income − spending − mortgage P&I − other expenses). The mortgage line item enters as a fixed monthly P&I until the bank's amortization end. Replace this with the calc module's `mortgageActivePayoffAge` and the per-year mortgage cash flow under the active strategy:

- For `prepay-extra`: monthly P&I + `extraMonthly` until accelerated payoff age; $0 thereafter.
- For `invest-keep-paying`: monthly P&I until bank's natural payoff; the `extraMonthly` is invested in the brokerage every month.
- For `invest-lump-sum`: monthly P&I until lump-sum trigger month (or FIRE under sell-at-FIRE precedence); brokerage gets `extraMonthly` until trigger; on trigger, brokerage drops by `realBalance × (1 + ltcgRate × stockGainPct)` and mortgage = $0; thereafter (P&I + extra) → brokerage.

**Rationale:** The lifecycle simulator's cash-flow accounting is the right level for this — it already separates income from expenses and maintains a brokerage balance. Threading the strategy through cash-flow accounting reuses the simulator's existing tax / IRMAA / RMD plumbing for free.

**Alternatives considered:**
- Pre-computing the mortgage trajectory in the calc module and passing year-by-year deltas — rejected because the lifecycle simulator already has its own per-year loop; duplicating it would create two sources of truth for "what's the mortgage balance at year N?".

---

## R3. How is the FIRE-age auto-move (Q3=A) implemented without breaking user-override semantics?

**Decision:** The existing `effectiveFireAge` resolver (per Principle III) reads either `fireAgeOverride` (manual marker drag) or `calculatedFireAge`. When the user changes mortgage strategy, the simulator re-runs FIRE-age search → produces a new `calculatedFireAge` → if `fireAgeOverride === null` (no manual override active), the resolver returns the new calculated age and every consumer follows. **For the auto-move semantics**, we additionally CLEAR `fireAgeOverride` whenever `mortgageStrategy` changes, ensuring the new calculated age becomes effective even if the user had previously dragged the marker.

**Rationale:** Q3=A specifies "the user's last manual marker drag is discarded" on strategy change. The cleanest implementation is to invalidate the override when strategy changes, allowing the resolver to fall through to the calculated value naturally. This is consistent with the dashboard's existing "input change resets override" pattern (per the Principle III rationale comment in the constitution).

**Alternatives considered:**
- Force the override to the new calculated value (vs. clearing it) — rejected because it muddies the meaning of "override".
- Show a banner offering "Apply suggested FIRE age?" — rejected because Q3 explicitly chose A (auto-move, no banner).

**Side effect to verify:** Other input changes (e.g., editing return rate) should also clear the override per the existing pattern. We do NOT introduce a new "only mortgage strategy clears override" carve-out.

---

## R4. Section 121 exclusion implementation — primary residence assumption

**Decision:** Treat the home as primary residence (US Section 121 eligibility assumed). Compute:

```
nominalGain = homeValueAtFire - originalPurchasePrice
section121Cap = (mfjStatus === 'mfj') ? 500000 : 250000
taxableGain = max(0, nominalGain - section121Cap)
capGainsTax = taxableGain * ltcgRate
```

For the `mfjStatus` input: the RR dashboard defaults to `'mfj'` (Roger & Rebecca). The Generic dashboard defaults from the existing single-person-mode flag — `singlePerson === true` → `'single'`, else `'mfj'`. No new UI field.

**Rationale:** Q5=B chose Section 121 + LTCG above. Primary-residence is the correct default for a personal FIRE planner; rental-property scenarios are out-of-scope per spec. Reusing the existing single-person-mode flag avoids adding a third filing-status input.

**Alternatives considered:**
- Add an explicit "primary residence" toggle — rejected as redundant (vast majority of users own one home, used as primary).
- Per-country home-sale tax dispatch — rejected per spec out-of-scope.
- Pro-rate Section 121 by ownership-years (the IRS 2-of-5 rule) — rejected as out-of-scope; we assume 2+ years ownership.

**Boundary cases tested:**
- Home value exactly equals exclusion cap → $0 taxable gain.
- Home value exactly $1 over cap → $1 × ltcgRate taxable.
- Home value < purchase price (rare, possible in down markets) → `nominalGain < 0` → `taxableGain = 0`, no tax.

---

## R5. Lifecycle handoff value — pure-function vs. mid-simulation read

**Decision:** The lifecycle handoff value `postSaleBrokerageAtFire` is computed by the calc module (pure function of inputs) and PASSED into the lifecycle simulator as a SCALAR seed for the retirement-phase brokerage balance. The lifecycle simulator does NOT re-derive it from intermediate state; it accepts the value verbatim.

**Rationale:** Pure-function separation keeps the calc module independently testable (per Principle II) and gives `tests/unit/lifecyclePayoffMerge.test.js` a clean unit-test surface — no need to mock the lifecycle simulator. The handoff is a single number; the cost of "passing it" is negligible.

**Alternatives considered:**
- Have the lifecycle simulator read the calc module's outputs directly mid-simulation — rejected because the lifecycle simulator currently runs a single-pass annual loop; it doesn't naturally have a "stop at FIRE, read external value, continue" sequence point. Threading the seed through the input record is cleaner.
- Run the calc module twice (once for the PvI tab's full-horizon view, once truncated for the lifecycle handoff) — rejected as wasteful; the calc module's `postSaleBrokerageAtFire` output covers both consumers.

**Audit consequence:** The handoff value's computation gets a dedicated subStep — `'lifecycle handoff: pre-FIRE simulator → retirement-phase simulator (postSaleBrokerage = $X)'` — so the user can see the seed value in the Audit tab.

---

## Open NEEDS CLARIFICATION items

None. All Phase 0 questions resolved; spec-phase Q1–Q6 covered the design space.

## Phase 0 Output

This research file. Phase 1 (data-model, contracts, quickstart) begins next.
