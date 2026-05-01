# Feature 021 — Audit Report

**Status**: WORK IN PROGRESS. This file is built up incrementally through Phase 9
(per-user-story interim deferral notes) and finalised in Phase 10 (full audit
harness re-run + finding triage per tasks T079–T086).

---

## Phase 9 — User Story 7 (B-020-5) Deferral Rationale

**Decision**: **DEFERRED** to feature 022.

**Date**: 2026-04-30
**Branch**: `021-tax-category-and-audit-cleanup`
**Tasks not executed**: T073, T074, T075, T076, T077, T078.
**Constitution VIII gate**: ✅ green pre-decision (7/7 in `spendingFloorPass.test.js`); no calc-engine changes shipped, so no risk of regression.

### What was investigated

The carry-forward goal (per `BACKLOG.md` B-020-5 and spec § US7 / FR-022) was
to flip `calc/fireAgeResolver.js` from **option (c)** ("month-precision is a
UI-display refinement; year-level feasibility unchanged") to **option (b)**
("extend `simulateRetirementOnlySigned` to pro-rate the FIRE-year row by
`(1 − m/12)` so feasibility is truly month-precise") per the contract at
`specs/020-validation-audit/contracts/month-precision-resolver.contract.md`
§Edge case 4.

Investigation looked at:

1. **The current resolver** (`calc/fireAgeResolver.js`, lines 95–248). Already
   passes fractional `fireAge` values into `simulateRetirementOnlySigned` via
   the injected `opts.simulateRetirementOnlySigned`. Stage 2 month-refinement
   probes `m = 0..11` at `fractionalAge = (Y - 1) + m/12`. The simulator
   tolerates non-integer `fireAge` because its loop is
   `for (let age = fireAge; age < endAge; age++)` — JavaScript's `++` works
   on floats, producing 55.583, 56.583, 57.583, … as iteration values. But
   each iteration applies a **full year** of spending, SS income, healthcare,
   college costs, mortgage carry, and pool growth — there is no pro-rating of
   the partial first year. That is the exact gap option (b) was meant to close.

2. **The simulator** (`FIRE-Dashboard.html` line 9313 and
   `FIRE-Dashboard-Generic.html` line 9673 — read end-to-end). To pro-rate the
   FIRE-year row by `(1 − mFraction)` where `mFraction = fireAge - Math.floor(fireAge)`,
   the change set spans:
   - Compute `mFraction` once at the top of the function.
   - On the FIRST loop iteration only, scale `grossSpend`, `ssThisYear`,
     `collegeCostThisYear`, `hcDelta`, `h2Carry`, and the mortgage cash flow
     by `(1 − mFraction)`.
   - On the FIRST loop iteration only, scale the growth multipliers
     `(1 + realReturn401k)` and `(1 + realReturnStocks)` to
     `(1 + realReturnX × (1 − mFraction))` — simple linear approximation
     consistent with the rest of the codebase's per-year integration style.
   - Audit `balanceAtUnlock` / `balanceAtSS` / `balanceAtFire` capture timing
     to ensure the partial-year boundary doesn't shift their semantics
     (e.g., a fractional FIRE age of 59.0833 — 59 years 1 month — must NOT
     mark the partial year as 401k-unlocked since age 59.5 only crosses
     mid-iteration).

3. **The existing test suite**. The 8 month-precision tests in
   `tests/unit/monthPrecisionResolver.test.js` use dependency injection
   with synthetic mocks, so the simulator change cannot break them. But the
   broader unit + audit suite (now ~430 tests post-Phase 8) contains FIRE-age
   resolution paths and lifecycle simulations that DO call the real simulator
   with integer `fireAge`. Backwards-compatibility holds mathematically (the
   pro-rate factor `(1 − 0/12) = 1` reduces to today's behavior), but pinning
   that across all consumers requires a full audit run before commit.

### Why this exceeds the time budget

The task prompt's deferral criterion is: "if you find that pro-rating the
FIRE-year row by `(1 − m/12)` requires more than ~30 minutes of investigation
OR risks breaking existing tests in ways that aren't quickly fixable, STOP."
Three concrete risks pushed this past the budget:

1. **Numerical instability triggering the monotonic-flip stability check.**
   The resolver currently falls back to year-precision when feasibility flips
   non-monotonically across `m = 0..11` (line 205). Today this rarely fires
   because option (c) keeps the simulator's behavior constant across all 12
   probes — every probe yields essentially the same feasibility verdict.
   Once the simulator pro-rates by `(1 − m/12)`, real-world personas near a
   tax-bracket boundary or an SS-claim transition will produce genuinely
   non-monotonic feasibility patterns (e.g., feasible at m=3 because partial
   spending stays under the 22% bracket, infeasible at m=7 because the larger
   pro-rate fraction crosses the bracket, feasible again at m=10 because SS
   kicks in mid-year). The fallback would fire frequently, defeating the
   stated goal of true fractional-year search.

2. **Growth-multiplier approximation choice.** Linear pro-rating
   (`1 + r × (1 − m/12)`) and exponential pro-rating (`(1 + r)^(1 − m/12)`)
   produce ~30 bps differences over a 7-month partial year at typical real
   returns of 5%. Either choice is defensible, but picking one without a
   broader review risks introducing an unauditable systematic bias into every
   month-precision FIRE-age calculation. This is a discussion that belongs in
   a dedicated spec, not a phase-9 carry-forward.

3. **Sibling-state capture timing.** `balanceAtUnlock`, `balanceAtSS`, and
   `balanceAtFire` (lines 9376–9377 in the RR HTML) assume each iteration is
   a full year. Pro-rating breaks the assumption that "the snapshot taken on
   the first iteration with `is401kUnlocked === true`" represents the balance
   at the user's actual unlock date. If `fireAge = 59.0833` (just 1 month
   short of 59.5), the partial first iteration starts pre-unlock but the
   second iteration is ALREADY post-unlock for its full duration. Resolving
   this requires either (a) a sub-iteration split at the 59.5 boundary or
   (b) a documented redefinition of the snapshot semantics. Both are spec-level
   decisions.

### Estimated true scope

Conservatively: 2–3 hours of focused implementation + 1–2 hours of audit run
for any cascading test failures + 1 hour of contract documentation. Total
~4–6 hours, plus the unbounded debug-loop risk if the monotonic-flip
fallback fires on real personas and triggers a cascade of "fall back to
year-precision" warnings in the broader audit harness.

The spec § US7 budget was "~1 day", so this is technically still in scope —
but the agent prompt's tighter "~30 minutes of investigation" criterion is
exceeded the moment the three risks above are catalogued. Deferring is the
correct decision per both the agent prompt and the spec's OPTIONAL marker.

### Suggested feature 022 spec hooks

When the user opens feature 022 to address B-020-5 (and any other deferred
items from feature 021's audit run in Phase 10), the spec should cover:

1. **Pick a growth-multiplier convention** (linear vs exponential) and
   document the rationale. Add to `calc/accumulateToFire.js` and
   `simulateRetirementOnlySigned` headers.
2. **Sub-iteration split at unlock / SS thresholds.** When `fireAge`'s
   fractional portion places the partial first year STRADDLING age 59.5
   (or `ssClaimAge`), split the iteration into pre- and post-threshold halves
   so the snapshot timing is unambiguous.
3. **Monotonic-flip tolerance.** Either tighten the resolver's tolerance
   (allow up to 2 flips before falling back) or replace the linear scan with
   bisection. Bisection is the cleaner answer once the simulator genuinely
   varies with `m`.
4. **Test coverage extension.** Add real-persona fractional-year tests
   beyond the synthetic mocks — pin a known persona where year-precision
   reports `Y` but month-precision reports `Y - 1 + 7/12`, and assert
   feasibility holds exactly at that fractional age in the real simulator.
5. **Audit-harness extension.** Add a `month-precision-feasibility`
   invariant to the validation-audit harness (`tests/unit/validation-audit/`)
   that asserts: for every persona where the resolver reports
   `searchMethod === 'month-precision'`, simulating with the returned
   `Y + M/12` fractional age produces zero `hasShortfall: true` rows.
6. **Contract update.** Flip
   `specs/020-validation-audit/contracts/month-precision-resolver.contract.md`
   §Edge case 4 from "default option (c)" to "default option (b), with
   option (c) preserved as a fallback when monotonic-flip stability fails."

### What was shipped in this work product

- This deferral rationale section (3 paragraphs + suggested feature 022 spec hooks).
- No calc-engine changes.
- No HTML changes.
- No test additions.
- `BACKLOG.md` B-020-5 entry remains open and unmodified.
- Tasks T073–T078 remain unchecked in `tasks.md`.
