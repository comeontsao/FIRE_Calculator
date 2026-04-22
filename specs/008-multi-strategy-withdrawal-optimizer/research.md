# Research: Multi-Strategy Withdrawal Optimizer

**Date**: 2026-04-22
**Phase**: 0 (pre-design)
**Purpose**: Resolve all open architectural and algorithmic decisions before data-model.md and contracts/ are written.

---

## Decision 1: Per-strategy FIRE-age solver vs fixed FIRE age

**Context**: The spec's FR-013 requires each candidate strategy to have a computed "earliest feasible FIRE age" so the "Retire sooner / pay less tax" objective can reward a strategy that unlocks earlier retirement. Architecture A runs the outer `findFireAgeNumerical` solver once per strategy (~7× solver cost); Architecture B runs it once with the incumbent strategy and fixes FIRE age for all candidates.

### Decision

**Architecture B — fixed FIRE age** is chosen for v1.

### Rationale

1. **Performance budget (FR-014, SC-006)**. Current solver cost at typical inputs is ~40–60 ms (45-year linear search, each iteration runs `signedLifecycleEndBalance` which is ~1 ms). 7× is 280–420 ms, already at or past the 250 ms budget *before* adding per-strategy lifecycle renders for chart + KPI + sidebar. Architecture B keeps the budget headroom comfortable: 1 × 50 ms solver + 7 × 3 ms lifecycle sim = ~75 ms, leaving ~175 ms for rendering.

2. **User's original framing**. The spec explicitly quotes the user: *"the order of calculation shouldn't change, it is just cycling within the withdraw strategy module."* Architecture B is a literal implementation of that intuition. Architecture A silently promotes the strategy choice up one level, which the user didn't ask for.

3. **Single-source-of-truth (Principle III)**. Architecture B keeps one authoritative `effectiveFireAge` resolved by the upstream Safe/Exact/DWZ solver, read uniformly by every downstream chart. Architecture A would need per-strategy `effectiveFireAge` values coexisting in memory, which every chart renderer would have to disambiguate — a regression of the state-centralization work shipped in feature 006.

4. **Feasibility is already solved**. The Safe mode fix shipped earlier in this conversation made the feasibility check chart-consistent (`isFireAgeFeasible` uses `projectFullLifecycle` directly for Safe). The earliest feasible FIRE age under Safe is therefore already the earliest the chart will accept — strategies can't "buy" an earlier one without also passing the Safe check, which would require Architecture A and its cost.

5. **Spec's objective B remains meaningful**. Under Architecture B, "Retire sooner / pay less tax" still reduces to a well-defined scoring axis: **minimize lifetime federal tax at the fixed FIRE age**. The "retire sooner" framing is preserved at the dashboard level because the user already sees the earliest feasible age in the FIRE-status pill — the objective now sharpens the *how we drain once retired*, not *when we retire*.

### Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Architecture A — per-strategy FIRE-age solver** | Higher fidelity; strategy could unlock earlier FIRE | 7× solver cost; breaches 250 ms budget; violates SSoT (Principle III) | Performance + architectural cost not justified by marginal benefit |
| **Hybrid — A for default strategy, B for others** | Preserves today's FIRE age exactly; others share it | Same SSoT concern for the default; inconsistent scoring across strategies | Inconsistency is worse than pure B |
| **Lazy A — "Recompute FIRE age for this strategy" button in preview** | Users who care can opt in | Surface-area cost (UI + docs); most users won't find it | Deferred to v2 — document as backlog item instead |

### Impact on spec

FR-013 is tightened in the Assumptions section (planning decision resolved). The fourth clarification Q&A ("per-strategy vs fixed FIRE age") is now answered authoritatively.

---

## Decision 2: Tax-Optimized Numerical Search algorithm

**Context**: Strategy #6 in the canonical seven is "Tax-Optimized Numerical Search" — the only strategy that needs a *search* rather than a fixed pool-order policy. Options range from simple greedy per-year to full dynamic programming.

### Decision

**One-dimensional parameter sweep** on the Trad-aggressiveness parameter `θ ∈ [0, 1]`, where `θ = 0` means "pull no fresh Trad (RMD only)" and `θ = 1` means "fill the full 12 % bracket". Evaluate 11 discrete values (`θ = 0, 0.1, 0.2, …, 1.0`), simulate the full lifecycle at each, and pick the `θ` that minimizes lifetime federal tax. Roth / stocks / cash ordering after Trad is fixed (Roth → Stocks-LTCG → Cash, matching today's algorithm).

### Rationale

1. **Captures the interesting tradeoff**. The reason bracket-fill smoothed is not always optimal is precisely the Trad-aggressiveness tradeoff (the user's intuition — "pay a little more tax early, less later"). A 1-D sweep over that parameter covers the dominant axis of variation.

2. **Cost-bounded**. 11 lifecycle sims × ~60 years × ~0.05 ms/year ≈ 33 ms. Stays inside the 250 ms budget. Fewer sweep points if profiling reveals hotspots.

3. **Deterministic and debuggable**. Any user can reproduce the winning `θ` by inspection. Gradient descent or DP would lock the choice behind an opaque optimizer.

4. **Extensible**. If v2 wants 2-D search (Trad-aggressiveness × Roth-vs-stocks split) the contract accommodates it — the `runTaxOptimizedSearch(inp, fireAge) → {mix, θ}` interface only needs the second parameter added.

### Alternatives considered

| Alternative | Rejection reason |
|---|---|
| **Greedy per-year tax minimizer** | Short-sighted: minimizing each year's tax drains Trad at the cheapest per-year rate, but ignores RMD-forced draws later that may push into 22 % bracket. |
| **Dynamic programming backward from plan age** | Full DP needs a discretized state space (pool balances × age); state explosion makes it slower than 11-point sweep for comparable accuracy. |
| **Gradient descent on continuous θ** | Requires numerical derivatives; no speed advantage for a well-conditioned 1-D problem; harder to reason about. |
| **Monte Carlo optimization** | Adds stochasticity where none is warranted — inputs are deterministic. Over-engineered. |

### Implementation note

The search loop MUST short-circuit when two consecutive `θ` values produce identical lifetime tax within the $100 tolerance (FR-009) to avoid wasting CPU on a flat optimum. Expected typical case: winning `θ` lies on a rounded tenth, no ties.

---

## Decision 3: Strategy policy interface shape

**Context**: Seven strategies must share a single calling convention so `taxOptimizedWithdrawal` (or a successor) can be called with a strategy policy object pluggable by ID.

### Decision

Adopt a **strategy policy object** with the shape:

```text
StrategyPolicy {
  id: string,                          // stable — used as UI key and fixture key
  nameKey: string,                     // i18n key — e.g., 'strategy.bracketFillSmoothed.name'
  descKey: string,                     // i18n key for one-line description
  eligibility: {                       // strategies that fail eligibility are greyed out, not removed
    requiresRule55?: boolean,
    requires401kUnlock?: boolean,      // (e.g., Conventional policy: needs Trad pool reachable)
  },
  computePerYearMix(ctx) → { wTrad, wRoth, wStocks, wCash, syntheticConversion?, rmd, taxOwed, ltcgTax, effRate, magi, … }
}
```

Where `ctx = { grossSpend, ssIncome, pools, age, brackets, stockGainPct, rmdThisYear, bracketHeadroom, bfOpts }`.

### Rationale

1. **Minimal refactor of existing code**. Today's `taxOptimizedWithdrawal` already returns roughly the shape above for bracket-fill smoothed. Wrapping the bracket-fill logic into a `BracketFillSmoothedPolicy.computePerYearMix` and stamping out six siblings is a local change.

2. **i18n-first**. Using `nameKey` + `descKey` (not raw strings) enforces Principle VII at the module boundary — an engineer can't accidentally ship an English-only strategy name.

3. **Eligibility flags, not hard filters**. UI can visually mark a strategy as unavailable (e.g., Conventional when `canAccess401k=false`) without breaking the "always 7 rows" promise for FR-005's ranking table. Scoring skips ineligible strategies by returning `infeasibleAtThisFireAge=true` in the result.

4. **Policy object → result object separation**. Policies are immutable, declared once at module load. Results are per-recalc. Clean lifecycle.

### Alternatives considered

- **Subclass pattern (ES6 `class extends`)** — rejected: adds OO boilerplate to a functional codebase; no polymorphism savings.
- **One mega-function with `if (strategyId === …)` branches** — rejected: dumps seven policies' logic into one function body (800+ lines), blows Principle II's "small, auditable pure module" intent.
- **String-name dispatch table** with free-standing functions — acceptable but less self-documenting than the policy object with explicit `eligibility` field.

---

## Decision 4: Strategy scoring tie-breakers

**Context**: FR-008 requires deterministic winner selection. FR-009 specifies a $1,000 tolerance on end-balance and $100 on lifetime tax for tie detection. But when multiple strategies genuinely tie, we still need a canonical order for display.

### Decision

**Tiebreakers, in order of precedence**:

1. Objective's primary metric (end-balance for "leave-more-behind", lifetime-tax for "retire-sooner-pay-less-tax"), with the tolerance from FR-009.
2. The *other* objective's metric (end-balance ties break by lifetime tax; lifetime-tax ties break by end-balance).
3. **Strategy ID string sort (alphabetical)** as the final deterministic tiebreaker — guarantees FR-008 determinism when all metrics are within tolerance.

The ranked list UI MUST display a tie indicator (e.g., `= 2nd`) when ≥ 2 strategies share rank under rule 1 only.

### Rationale

The two-level tiebreaker surfaces meaningful differentiation (a strategy that ties on estate and wins on tax is a better choice than one that ties on both), and the alphabetical fallback makes the order user-inspectable and regression-testable. No randomness, no timestamp-based ordering.

---

## Decision 5: Caveat flags per strategy

**Context**: FR-010 requires the narrative ribbon, IRMAA glyph, SS-reduced-fill caveat, and "how to read" block to reflect the *currently displayed* strategy. Different strategies trigger caveats differently (e.g., Conventional doesn't use bracket-fill, so the SS-reduced-fill message is nonsensical for it).

### Decision

Each `StrategyResult` carries a `caveatFlags: { ssReducedFill, irmaaCapped, irmaaBreached, rule55Active, roth5YearWarning, bracketFillActive }` set, derived from that strategy's per-year runs. Chart renderers read `displayedStrategy.caveatFlags` instead of the hard-coded `strategy[i].ssReducedFill` from today's code. A NEW flag `bracketFillActive` gates any bracket-fill-specific caption (the blue banner the user saw in their screenshot). Non-bracket-fill strategies (Trad-first, Conventional, etc.) set `bracketFillActive=false` → banner hidden.

### Rationale

The alternative — unconditionally showing the bracket-fill caption for every strategy — would mislead the user (e.g., "bracket-fill saves negligible tax" is nonsensical when the displayed strategy is Conventional). Per-strategy caveat flags keep the narrative truthful.

---

## Decision 6: Preview-state location in `chartState`

**Context**: Principle III requires a single source of truth for interactive state. The preview feature introduces a new piece of UI state — "which strategy is currently being viewed, even if it's not the winner" — that must be read by four consumers (Lifetime Withdrawal chart, main lifecycle chart, sidebar mirror, KPI ribbon).

### Decision

Extend the existing `chartState` resolver with a new field:

```text
chartState {
  // existing fields
  calculatedFireAge, fireAgeOverride, effectiveFireAge, feasible, source,
  // NEW
  previewStrategyId: string | null,   // null → display the winner for the current objective
}
```

With a single mutator `setPreviewStrategy(id | null)` that atomically updates all listeners (same pattern as `_setCalculatedFire`). `previewStrategyId` is session-scoped (not persisted across reloads, per FR-006).

### Rationale

Principle III explicitly names `chartState` as the single-source-of-truth for interactive state. Putting `previewStrategyId` anywhere else (e.g., a module-scope let in the strategies module) would create the "stale preview on FIRE-age drag" bug class that feature 006 spent several sessions eliminating. Extending the existing resolver keeps all downstream listeners (registered via `cs.onChange`) firing on preview transitions for free.

### Implementation note

When a recalc fires (e.g., user edits any slider), `previewStrategyId` MUST be cleared automatically — preview doesn't survive re-scoring because the set of candidates and their relative rankings may have shifted. The "previewing alternative" banner therefore auto-dismisses on recalc, and the panel snaps back to the new winner. This keeps the user from staring at stale data.

---

## Summary of Phase 0 outcomes

| Decision | Outcome |
|---|---|
| 1. FIRE-age architecture | **Architecture B** — fixed FIRE age, strategies cycle at that age |
| 2. Tax-optimized search algo | **11-point θ-sweep** — 1-D parameter scan over Trad aggressiveness |
| 3. Strategy interface | **StrategyPolicy object** with `computePerYearMix(ctx)` + eligibility flags + i18n keys |
| 4. Tiebreakers | Primary metric (tol) → other metric → strategy-ID alphabetical |
| 5. Caveats | Per-strategy `caveatFlags` on `StrategyResult`; new `bracketFillActive` gate |
| 6. Preview state | Extend `chartState` with `previewStrategyId`; session-scoped; auto-cleared on recalc |

All `NEEDS CLARIFICATION` from the spec are now resolved. Phase 1 (data-model + contracts) can proceed.
