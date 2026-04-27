# Feature Specification: Calculation-Engine Debt Cleanup

**Feature Branch**: `015-calc-debt-cleanup`
**Created**: 2026-04-26
**Status**: Draft (capture for tomorrow)
**Input**: User description: "Please write down from 1 to 6 all of the things you think we should fix. once this is marked down we can deal with that tomorrow"

## Summary

Now that Feature 014 (Calc Audit View) exposes every step of the lifecycle pipeline, six structural problems in the calc engine become visible. They all came up during the prior debugging sessions on Safe / DWZ / strategy ranking and were patched downstream rather than fixed at the root. This spec captures all six in priority order so they can be dealt with tomorrow without re-deriving the analysis.

The six issues, ranked by my recommended priority of `(impact / effort)`:

1. **Shortfall years are invisible in the chart** (P1 — small scope, big trust win)
2. **`tax-optimized-search` θ-sweep optimizes lifetime tax before feasibility** (P1 — ~20-line cleanup, eliminates a workaround)
3. **Architecture B's circular FIRE-age ↔ strategy dependency** (P2 — needs design decision; oscillations possible today)
4. **DWZ silently overrides the user's chosen objective** (P2 — UX clarity; banner OR new explicit objective)
5. **"Retire sooner / pay less tax" objective is misnamed** (P3 — pure rename; doesn't actually retire sooner)
6. **Three simulators with conflicting contracts produce permanent cross-validation drift** (P3 — biggest scope, most foundational; consolidation pass)

This spec is intentionally a CAPTURE spec — it documents the problems and proposed user-facing outcomes, NOT the implementation. Each user story is independently addressable; the user picks the order at planning time tomorrow.

## Clarifications

### Session 2026-04-27

- Q: How do you want to sequence and scope these 6 stories? → A: Ship all 6 stories in feature 015 in priority order P1 → P3 (one big feature)
- Q: US3 architecture choice — A (iterate to convergence), B (per-strategy FIRE age), or C (freeze strategy across finder)? → A: Option B — per-strategy FIRE age. Each strategy computes its own earliest feasible age; winner is selected by the user's mode + objective. Drag interactions skip the finder via a `userDraggedFireAge` guard so per-strategy computation does not run on every drag frame. Recalc budget (250ms) MUST be measured during planning; if B exceeds it, fall back to Option A.
- Q: US1 shortfall visualization style — fill / dashed / glyph / clamp? → A: Red-tinted background fill on shortfall years on the Full Portfolio Lifecycle chart + a footer caption ("Red-shaded years: active strategy cannot fund spending from any allowed pool.") + a matching `has-shortfall` row class with red tint on the Audit tab's per-year Lifecycle Projection table. Caption text is bilingual (EN + zh-TW per Constitution VII).
- Q: US4 DWZ ↔ objective UX pattern — banner / new objective / disable / orthogonal? → A: Option E — Remove the silent override entirely. DWZ mode and the objective selector are ORTHOGONAL: DWZ is an end-state constraint (end balance ≈ $0 at plan age), the objective is a path-shape choice (which pools deplete in what order along the way). Both apply simultaneously under DWZ. This is the user's insight: a person who plans DWZ to 95 but might die at 80 still cares about path shape because path shape determines what residual exists at the actual (early) death age. No new objective, no banner, no disabled selector — fix the override at the root.
- Q: US6 unified simulator — should we reserve a noise-model hook for a future Monte Carlo feature? → A: Option A — Reserve a `noiseModel` parameter in the unified simulator's input contract (default `null` = deterministic, today's behavior). Document the planned shape via a code comment. Do NOT implement any noise sampling in 015. Future Monte Carlo can drop in without re-touching call sites.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Shortfall years are visible on the lifecycle chart (Priority: P1)

A user dragging the FIRE marker (or experimenting with strategies) lands on a scenario where, in some years, the active withdrawal strategy cannot fund spending from any allowed pool. Today the chart shows a healthy rising trajectory in those years (pools just compound because no withdrawal happened). The user has no way to see they would be functionally broke for those years.

After this fix, the chart visibly marks shortfall years using a **red-tinted background fill** over the affected age range (clarification 2026-04-27), plus a footer caption explaining the marking, plus a matching `has-shortfall` row class on the Audit tab's per-year Lifecycle Projection table. The user sees the problem at a glance instead of trusting a misleading green line.

**Why this priority**: This is the deepest user-trust issue we hit. The whole "θ=0 wins because zero withdrawals → zero tax" pathology was masked by this — the chart looked fine while reality was 8 years of starvation. The audit's per-year table has the data, but no visual signal. Fixing this restores trust in the chart faster than anything else.

**Independent Test**: Configure a scenario known to produce shortfall (the user's tax-optimized-search θ=0 case). Confirm the lifecycle chart visibly distinguishes those shortfall years (color / glyph / annotation). Confirm the chart's caption or legend explains what the visual mark means.

**Acceptance Scenarios**:

1. **Given** a scenario where strategy + FIRE age combination produces 1+ shortfall years, **When** the user views the lifecycle chart, **Then** the affected years are visually marked AND a one-line caption explains the marking.
2. **Given** a feasible scenario with zero shortfall years, **When** the user views the lifecycle chart, **Then** no shortfall markings appear (no false positives).
3. **Given** a shortfall is visible, **When** the user opens the Audit tab → Lifecycle Projection, **Then** the per-year table flags the same years' rows consistently.
4. **Given** the chart shows shortfall years, **When** the user copies the debug payload, **Then** the JSON's `audit.lifecycleProjection.rows` includes a per-row shortfall flag matching the visual marking.

---

### User Story 2 — `tax-optimized-search` θ-sweep filters feasibility BEFORE picking lowest-tax (Priority: P1)

Today the θ-sweep tries 11 θ values, ranks by lifetime federal tax, and picks the lowest-tax winner — even when that θ produces shortfall years. We patched this downstream by AND-ing `hasShortfall` into the ranker's feasibility verdict, which catches the symptom but leaves the optimizer pursuing an objective that ignores feasibility.

After this fix, the θ-sweep filters out infeasible θ values BEFORE ranking by tax. If all 11 θ values are infeasible, the strategy is correctly marked infeasible without needing the downstream `hasShortfall` AND-check (which becomes redundant).

**Why this priority**: Small scope (~20 lines), eliminates the post-hoc `hasShortfall` AND we added in feature 014 prep. Makes the optimizer's intent self-consistent (feasibility-first, then tax). Reduces special-casing in the strategy ranker.

**Independent Test**: Plant the user's exact scenario (where θ=0 has 8 shortfall years and zero tax). Verify the θ-sweep selects a higher θ that's feasible AND has the lowest tax among feasible candidates. Verify the audit's strategy-ranking row for tax-opt-search shows `chosenTheta > 0` and `shortfallYears === 0` AND the active winner is no longer tax-opt-search-θ=0.

**Acceptance Scenarios**:

1. **Given** the θ-sweep tries 11 candidates, **When** any subset is infeasible (shortfall OR floor violations), **Then** the sweep discards them BEFORE ranking by tax.
2. **Given** all 11 θ candidates are infeasible, **When** the sweep concludes, **Then** the strategy reports `feasibleUnderCurrentMode: false` AND records the lowest-tax candidate's θ for diagnostic display only.
3. **Given** at least one θ candidate is feasible, **When** the sweep concludes, **Then** the chosen θ is feasible AND has the lowest tax among feasible candidates (NOT among all candidates).
4. **Given** the audit Strategy Ranking section, **When** the user inspects tax-opt-search's row, **Then** the displayed `chosenTheta` is always feasible whenever the row reports `feasibleUnderCurrentMode: true`.

---

### User Story 3 — Resolve Architecture B's circular FIRE-age ↔ strategy dependency (Priority: P2)

Today: `findFireAgeNumerical` runs FIRST using the previous recalc's winner strategy (via `getActiveChartStrategyOptions`), producing a fixed FIRE age. THEN strategies rank at that fixed age. Because FIRE-age depends on strategy AND strategy depends on FIRE-age, the system can oscillate across recalcs as inputs change (e.g., recalc N: bracket-fill → 48 → tax-opt wins; recalc N+1: tax-opt → 50 → bracket-fill wins; recalc N+2: oscillate). Cross-validation invariants will blink in/out as a result.

After this fix, FIRE-age and strategy converge deterministically per recalc via **Option B — per-strategy FIRE age** (clarification 2026-04-27). Each strategy gets its own earliest feasible FIRE age; the winner is the strategy whose FIRE age is earliest under the user's mode + objective. This is the original "Architecture A" pattern; revived because it eliminates oscillation by construction (no FIRE-age ↔ strategy circular dependency) AND makes the "Retire sooner" objective a real semantic lever (each objective can legitimately produce a different FIRE age).

**Performance guard**: B was previously rejected on the 250ms recalc budget. Planning MUST measure recalc latency for the user's default scenario before committing; if B exceeds the budget, fall back to **Option A — iterate to convergence** (run finder → rank → re-finder with the new winner → re-rank, capped at 3 cycles, stable when 2 consecutive cycles agree).

**Drag-skip guard**: When the user is dragging the FIRE marker on the lifecycle chart, the per-strategy finder MUST be short-circuited via a `userDraggedFireAge` flag — only the strategy ranker runs at the user-set age. This decouples drag interactivity from the per-strategy finder cost.

**Rejected — Option C** (freeze strategy across finder, weaken cross-validation invariant): rejected because it requires loosening the audit's "active strategy" invariant to "expected — bracket-fill is the gating strategy by design," weakening a diagnostic surface we just shipped in feature 014.

**Why this priority**: P2 — this is real but doesn't cause user-visible blank charts; it causes confusing transients and forces downstream reconciliation code (`getActiveChartStrategyOptions` is the band-aid). Fixing it cleans up the architecture; not fixing it leaves us debugging the same class of issue every time strategy ranking changes.

**Independent Test**: Construct a scenario at the boundary where bracket-fill and tax-opt-search produce different FIRE ages. Run recalc N times by changing one input slightly each time. Verify the chosen FIRE age and active strategy converge to the same pair within 2 recalcs and stay there.

**Acceptance Scenarios**:

1. **Given** any input scenario, **When** the dashboard runs `recalcAll` twice in a row with no input change, **Then** the second run produces the same `(fireAge, winnerStrategyId)` pair as the first.
2. **Given** an input change that moves the system across the boundary between bracket-fill and tax-opt-search winning, **When** the user makes the change, **Then** the system reaches its new stable `(fireAge, winnerStrategyId)` within ≤ 2 recalcs (no infinite oscillation).
3. **Given** the audit's Cross-Validation section, **When** all inputs are unchanged across 3 consecutive recalcs, **Then** the cross-validation warnings are byte-identical across the 3 recalcs (no flickering of warnings).

---

### User Story 4 — DWZ and the user's objective are orthogonal, not conflicting (Priority: P2)

**The conceptual fix (clarification 2026-04-27, Option E):** DWZ mode and the objective selector operate on different dimensions and MUST coexist:

- **Mode** (Safe / Exact / **DWZ**) controls the **end-state constraint** at plan age — Safe enforces a buffer floor across all retirement years AND `endBalance ≥ 0`; Exact enforces `endBalance ≥ terminalBuffer × annualSpend`; DWZ enforces `endBalance ≈ $0` at plan age (the user expects to be drained when they die).
- **Objective** ("Preserve estate" / "Minimize lifetime tax") controls the **path shape** between FIRE age and plan age — i.e., the order in which pools (Cash / 401k / Stocks / Roth / Pension / SS) are drawn down.

These are orthogonal. The user's insight: someone planning DWZ to age 95 may die at 80. At 80, what's left in each pool depends entirely on path shape, not the age-95 end-state. So even under DWZ, "preserve estate" is meaningful — it back-loads the drain so more residual remains at any age before plan age.

**Today's bug:** DWZ silently overrides the user's objective and forces "smallest end balance among feasible" as the sort key. This is doubly wrong:

1. Under DWZ, ALL feasible candidates have `endBalance ≈ $0` by construction, so "smallest end balance" is degenerate as a sort key — every feasible candidate ties.
2. The override discards the user's actual objective signal, so a user who picked "Preserve estate + DWZ" gets a front-loaded drain (the opposite of preservation), and a user who picked "Minimize tax + DWZ" gets the same trajectory regardless of tax efficiency.

**After this fix:** the silent override is removed at the root. Under DWZ, the strategy ranker uses the user's chosen objective as the primary sort key, evaluated only over the subset of strategies that satisfy the DWZ end-state constraint (`endBalance ≈ $0` at plan age). The "smallest end balance" sort key is retired — or kept only as a deterministic tie-breaker when path-shape scores tie. The Audit's Strategy Ranking section (FR-014) labels the active sort key so QA can verify the rank order matches the user's expectation.

#### Worked examples — expected behavior matrix

| Scenario # | Mode | Objective | Expected sort key (primary) | Expected path shape | Expected end balance at plan age 95 |
|------------|------|-----------|----------------------------|---------------------|------------------------------------|
| 1 | Safe | Preserve estate | Maximize end balance among feasible | Conservative draw, preserve growth pools | ≥ buffer × annual spend (≥ 0 always) |
| 2 | Safe | Minimize lifetime tax | Minimize cumulative federal tax among feasible | Bracket-fill conversions, harvest LTCG at 0% | ≥ buffer × annual spend (≥ 0 always) |
| 3 | Exact | Preserve estate | Maximize end balance among feasible | Same as Safe but trajectory floor relaxed | ≥ terminal buffer × annual spend |
| 4 | Exact | Minimize lifetime tax | Minimize cumulative federal tax among feasible | Same as Safe but trajectory floor relaxed | ≥ terminal buffer × annual spend |
| 5 | **DWZ** | **Preserve estate** | **Maximize residual-area-under-curve (NEW)** | **Back-loaded drain: deplete Cash + 401k earlier, preserve Stocks + Roth longer. If user dies at 80, more residual remains.** | **≈ $0** |
| 6 | **DWZ** | **Minimize lifetime tax** | **Minimize cumulative federal tax among feasible** | **Bracket-fill, LTCG harvesting, possibly front-load taxable to clear it before high-RMD years. End balance still drains to ≈ $0.** | **≈ $0** |

**Implementation contract for the new "residual-area-under-curve" sort key (scenario 5):**

- For each candidate strategy, compute `residualArea = sum(perYearTotal) for years between FIRE age and plan age`.
- Higher `residualArea` = the strategy keeps more wealth on the books for more years = better at "preserve estate" if early death occurs at any age between FIRE and plan.
- This is a single scalar sort; ties broken by lower `endBalance` (closest to $0).

**Implementation contract for the cumulative-tax sort key (scenario 6):**

- For each candidate strategy, compute `cumulativeFederalTax = sum(perYearFederalTax) for years between FIRE age and plan age`.
- Lower = better.
- Ties broken by higher `residualArea` (so when tax is equal, prefer the path that preserves more residual).

**Tie-breaker for the retired "smallest end balance" sort:**

- If the primary objective sort produces a tie among 2+ feasible candidates (e.g., two strategies have identical `cumulativeFederalTax`), THEN the secondary sort is `|endBalance|` ascending (closest to $0 wins).
- If still tied, the tertiary sort is `strategyId` alphabetical for deterministic ordering (no random tie-breaking).

#### Concrete worked example — user's "preserve estate + DWZ" scenario

**Setup:** User is 35, plans retire at 50, plan age 95. Scenario inputs identical except for the (Mode, Objective) pair.

**Today (silent override + degenerate sort):**

- DWZ + Preserve Estate → ranker forces "smallest end balance" → all feasible candidates tie ≈ $0 → tie-broken arbitrarily → user sees front-loaded drain (whatever the first feasible candidate happens to be).
- At age 80 (early death scenario): little residual in any pool because everything was front-loaded.

**After fix (Option E):**

- DWZ + Preserve Estate → ranker uses `residualArea` (descending) → winner is the strategy that keeps Stocks + Roth largest for longest → at age 95 end balance ≈ $0, but at age 80 a meaningful residual remains in Stocks + Roth.
- The user's intent ("preserve") is honored; the mode constraint ("end at zero") is also honored.

**Why this priority**: P2 — the dashboard works "correctly" today only in the narrow sense that DWZ produces a $0 end balance. It produces the WRONG path shape when the user's objective is preserve-estate. Fixing it is a real correctness win, not just UX clarity.

**Independent Test**: Configure two scenarios identical in inputs except Objective: (a) Preserve Estate, (b) Minimize Tax. Both with DWZ mode. Verify:

1. Both reach `endBalance ≈ $0` at plan age 95 (DWZ honored).
2. The two scenarios produce DIFFERENT path shapes (Audit's per-year Lifecycle Projection rows differ in pool composition).
3. Scenario (a) has a higher `residualArea` than scenario (b) is permitted to have.
4. Scenario (b) has a lower `cumulativeFederalTax` than scenario (a) is permitted to have.
5. The Audit's Strategy Ranking section labels the active sort key correctly: "residualArea ↓" for (a), "cumulativeFederalTax ↑" for (b).

**Acceptance Scenarios**:

1. **Given** DWZ mode + "Preserve estate" objective, **When** the strategy ranker runs, **Then** the primary sort key is `residualArea` descending; the audit Strategy Ranking section labels it; the winner produces a back-loaded drain trajectory.
2. **Given** DWZ mode + "Minimize lifetime tax" objective, **When** the strategy ranker runs, **Then** the primary sort key is `cumulativeFederalTax` ascending; the audit Strategy Ranking section labels it; the winner has the lowest cumulative federal tax among feasible candidates.
3. **Given** the user toggles between Safe / Exact / DWZ with the same objective selected, **When** the user observes the chart, **Then** the path shape is consistent with the chosen objective in each mode (no silent override); only the end-state constraint changes.
4. **Given** DWZ mode is active, **When** two feasible strategies produce identical primary-sort scores, **Then** the tie is broken deterministically by `|endBalance|` ascending, then by `strategyId` alphabetical (no flicker across recalcs).
5. **Given** the audit Strategy Ranking section, **When** any (Mode, Objective) pair is active, **Then** the section displays the active primary sort key, the active tie-breaker, and the active mode's end-state constraint in plain text so the QA engineer can verify the rank order.

---

### User Story 5 — Verify "Retire sooner / pay less tax" label matches behavior under per-strategy FIRE age (Priority: P3)

US3 picked Option B (per-strategy FIRE age, clarification 2026-04-27). Under B, flipping "Retire sooner / pay less tax" CAN legitimately move the displayed FIRE age — each objective is allowed to pick a different per-strategy winner whose FIRE age differs. So the existing label is no longer misleading IF US3 ships as specified.

After this fix, US5 reduces to a verification step: confirm the "Retire sooner / pay less tax" toggle, post-US3, can produce different FIRE ages across its two states for at least one realistic scenario. If yes, the label is preserved (FR-013 path). If no (e.g., the per-strategy finder produces identical ages for all strategies in practice), rename per FR-012.

**Why this priority**: P3 — gated on US3's measured behavior. Pure verification + conditional rename; trivial in either direction.

**Independent Test**: Inspect the UI label and i18n keys. Confirm the EN and zh-TW labels accurately describe what flipping the toggle actually does in the current architecture (post-US3).

**Acceptance Scenarios**:

1. **Given** US3 is resolved with option A (iterate to convergence) OR option C (Architecture B preserved), **When** the user reads the objective toggle label, **Then** the label does NOT promise an outcome the system doesn't deliver (e.g., "retire sooner" is removed since the system can't actually retire sooner under those options).
2. **Given** US3 is resolved with option B (per-strategy FIRE age), **When** the user flips the objective, **Then** the displayed FIRE age can change AND the label can legitimately retain "retire sooner" — story is closed without rename.
3. **Given** any rename happens, **When** the language toggle is exercised, **Then** both EN and zh-TW labels are updated together (Constitution VII).

---

### User Story 6 — Consolidate the three simulators (Priority: P3)

Today the calc engine has three simulators that disagree on the same scenario by design:

- `signedLifecycleEndBalance` — bracket-fill-only, used for DWZ feasibility's signed-sim fallback and end-balance reporting.
- `projectFullLifecycle` — strategy-aware, the chart producer.
- `_simulateStrategyLifetime` — strategy-aware but ignores mortgage / college / home #2 overlays, used inside `scoreAndRank`.

The audit's cross-validation already documents one of these disagreements as "(expected — different sim contracts)" — the fact that we had to hard-code an exception is the smell. Real divergences and architectural divergences look the same to the user.

After this fix, ONE simulator answers all three call sites. Inputs include strategy + θ + overlays (mortgage / college / home #2 / scenario overrides). Outputs include the per-year trajectory + end balance + per-year shortfall flag + per-year floor-violation flag. All call sites read the same answer for the same scenario.

**Why this priority**: P3 — biggest scope, most foundational, most architectural. Worth doing only AFTER US1–US5 reduce the surface area. Doing it first risks breaking work that hasn't been re-pointed.

**Independent Test**: Run the audit's cross-validation on a wide range of scenarios. Confirm zero "(expected — different sim contracts)" annotations remain — every cross-check either passes outright or flags a real bug. Confirm the chart, audit, and Copy Debug payload all show byte-identical numbers for the same scenario.

**Acceptance Scenarios**:

1. **Given** any scenario, **When** the audit's Cross-Validation section runs, **Then** zero warnings have `expected: true` based on "different sim contracts."
2. **Given** any scenario, **When** the chart's lifecycle data and the audit's lifecycle table are compared, **Then** every per-year `total` matches within $1 (current display rounding).
3. **Given** any scenario, **When** the strategy ranker's reported `endOfPlanNetWorthReal` is compared with the chart's last-row `total` for the same strategy, **Then** they match within $1 (currently they routinely differ by thousands because of overlays-vs-no-overlays divergence).
4. **Given** any unit test currently passes against `_simulateStrategyLifetime`, **When** that test is re-pointed at the unified simulator, **Then** the test still passes (no behavioral regression).

---

### Edge Cases (across all stories)

- **Backward compatibility for prior debug payloads**: pre-cleanup Copy Debug JSON dumps must remain readable. Don't remove existing keys — only refactor or relocate where safe.
- **Performance budget**: each fix must keep the existing recalc budget (currently 250ms). US3 ships as Option B (per-strategy FIRE age) which is the most likely to push the budget; planning MUST measure recalc latency before committing. Drag interactivity is protected by the `userDraggedFireAge` short-circuit. If B's measured budget exceeds 250ms even with the drag guard, fall back to Option A (iterate to convergence).
- **Monte Carlo / future features**: the unified simulator from US6 MUST expose a `noiseModel` parameter in its input contract (default `null` = deterministic, today's behavior) per clarification 2026-04-27. The planned shape (e.g., `{ returns: { distribution: 'normal', mean, std } }`) is documented via code comment. NO noise sampling code ships in 015 — the hook is reserved so a future Monte Carlo feature can drop in without re-touching the simulator's call sites.
- **Test coverage**: each fix gets at least one regression test pinning the new behavior so a future change doesn't silently revert the fix.

## Requirements *(mandatory)*

### Functional Requirements

These are the high-level outcomes per story. Detailed FRs land at planning time.

**Story 1 — Shortfall visibility**

- **FR-001**: The Full Portfolio Lifecycle chart MUST mark shortfall years with a red-tinted semi-transparent background fill spanning the affected age range. Color choice MUST satisfy WCAG contrast for the chart's dark theme; opacity ≈ 30% to keep underlying line legible.
- **FR-002**: A bilingual footer caption (EN + zh-TW) MUST appear immediately below the chart explaining the red-shaded marking. Caption is hidden when no shortfall years exist.
- **FR-003**: The Audit tab's per-year Lifecycle Projection table MUST flag the same shortfall years using a `has-shortfall` row class with matching red tint.
- **FR-004**: The Copy Debug `audit.lifecycleProjection.rows` MUST include a per-row `hasShortfall` boolean.
- **FR-005**: A scenario with zero shortfall years MUST display NO shortfall markings, NO caption, and NO row tinting (no false positives).

**Story 2 — θ-sweep feasibility-first**

- **FR-006**: The `tax-optimized-search` θ-sweep MUST filter out θ candidates that produce shortfall OR floor violations BEFORE ranking the survivors by lifetime federal tax.
- **FR-007**: The downstream `hasShortfall && gate.feasible` AND-check in the ranker (added in feature 014 prep) MUST become redundant — the spec succeeds when removing it is safe.

**Story 3 — FIRE-age / strategy convergence (per-strategy FIRE age, Option B)**

- **FR-008**: For any unchanged-input scenario, two consecutive recalcs MUST produce the same `(fireAge, winnerStrategyId)` pair. Under Option B this is satisfied by construction — each strategy has a deterministic per-strategy FIRE age, no circular dependency exists.
- **FR-009**: The strategy ranker MUST evaluate each strategy at the strategy's own per-strategy FIRE age (not at a single global FIRE age). The displayed FIRE age is the winner strategy's per-strategy age.
- **FR-010**: When the user drags the FIRE marker on the lifecycle chart (`userDraggedFireAge === true`), the per-strategy finder MUST be short-circuited; only the ranker runs at the user-dragged age.
- **FR-011**: The audit's Cross-Validation invariant `C` (displayed FIRE age = ranker FIRE age) MUST never produce false positives in a stable state.
- **FR-012**: Recalc latency for the user's default scenario MUST stay at or below 250ms with Option B in effect; planning MUST measure this before committing. If exceeded, fall back to Option A (iterate to convergence, cap 3 cycles).

**Story 4 — DWZ ↔ objective orthogonality (Option E)**

- **FR-013**: The strategy ranker MUST treat Mode and Objective as orthogonal. Mode controls the end-state constraint at plan age (Safe = trajectory + buffer floor, Exact = `endBalance ≥ terminalBuffer × annualSpend`, DWZ = `endBalance ≈ $0`). Objective controls the path-shape sort key applied across mode-feasible candidates. The "smallest end balance among feasible" silent override under DWZ MUST be removed.
- **FR-014**: When the active Objective is "Preserve estate" (regardless of Mode), the ranker's primary sort key MUST be `residualArea` descending, where `residualArea = sum(perYearTotal) for years from FIRE age through plan age - 1`. Tie-breaker: `|endBalance|` ascending. Tertiary tie-breaker: `strategyId` alphabetical.
- **FR-015**: When the active Objective is "Minimize lifetime tax" (regardless of Mode), the ranker's primary sort key MUST be `cumulativeFederalTax` ascending, where `cumulativeFederalTax = sum(perYearFederalTax) for years from FIRE age through plan age - 1`. Tie-breaker: `residualArea` descending. Tertiary tie-breaker: `strategyId` alphabetical.
- **FR-016**: The audit's Strategy Ranking section MUST display, in plain text on every recalc: (a) the active Mode + its end-state constraint formula, (b) the active Objective + its primary sort key formula, (c) the active tie-breaker chain. This is the single source of truth for QA verification of rank order.
- **FR-017**: For any DWZ-mode scenario, two strategies with the same inputs but different Objectives MUST produce DIFFERENT trajectories (verifiable via per-year Lifecycle Projection rows) AND both MUST satisfy `endBalance ≈ $0` at plan age within $1.

**Story 5 — Objective label verification (US3 picked Option B)**

- **FR-018**: Planning MUST verify that flipping "Retire sooner / pay less tax" can produce a different displayed FIRE age for at least one realistic scenario under US3's per-strategy architecture. If yes, the existing label is preserved.
- **FR-019**: If verification fails (per-strategy finder produces identical FIRE ages for all strategies in practice), the objective MUST be renamed in EN and zh-TW to a label that accurately describes what flipping the toggle does. Recommended rename: "Minimize lifetime tax" to match the FR-015 sort key.

**Story 6 — Single simulator**

- **FR-020**: The calc engine MUST expose ONE simulator function consumed by `findFireAgeNumerical` (per-strategy), `scoreAndRank`, and the chart-rendering path.
- **FR-021**: The unified simulator's input contract MUST include a `noiseModel` parameter that defaults to `null` (deterministic, today's behavior). A code comment MUST document the planned shape (e.g., `{ returns: { distribution: 'normal', mean, std } }`). NO noise sampling code is implemented in 015.
- **FR-022**: The audit's Cross-Validation section MUST stop emitting "(expected — different sim contracts)" annotations once US6 ships.
- **FR-023**: For the same scenario, the chart's per-year `total`, the audit's per-year row `total`, and the strategy ranker's `endOfPlanNetWorthReal` MUST agree within $1.

### Key Entities

This is a refactor / cleanup spec — no new domain entities. The existing `AuditSnapshot` from feature 014 is the diagnostic surface for verifying these fixes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Story 1)**: 100% of scenarios containing ≥ 1 shortfall year display a visible chart marking. 0% of zero-shortfall scenarios display the marking. Verifiable by a Playwright fixture test that plants both states.
- **SC-002 (Story 2)**: After ship, the post-hoc `hasShortfall && gate.feasible` AND-check in the strategy ranker can be removed without changing behavior on any of the 16 existing audit unit-test cases. Verifiable by a TDD test: remove the AND-check, run tests, expect green.
- **SC-003 (Story 3)**: Two consecutive recalcs with no input change produce byte-identical Copy Debug `audit` blocks (excluding `generatedAt`). Verifiable in Playwright.
- **SC-004 (Story 4)**: For any DWZ scenario, two strategies identical in inputs except Objective (Preserve estate vs Minimize tax) produce trajectories that differ on at least one per-year row by ≥ $100, AND both trajectories satisfy `endBalance ≈ $0` at plan age within $1. Verifiable by a Playwright fixture test that asserts both conditions on a planted scenario.
- **SC-005 (Story 5)**: After ship, the EN and zh-TW objective labels accurately describe what flipping the toggle does in the post-US3 architecture. Verifiable by code review of the i18n keys.
- **SC-006 (Story 6)**: After ship, the audit's Cross-Validation section emits zero `expected: true` warnings whose `reason` field contains "different sim contracts." Verifiable by a Playwright test.
- **SC-007 (Cross-cutting)**: All 211 existing unit tests + 95 Playwright tests pass after each story ships, with no test removed. New tests pin each story's new behavior.
- **SC-008 (Cross-cutting)**: Recalc latency stays at or below today's 250ms budget for the user's default scenario. Verifiable by `performance.now()` instrumentation around `recalcAll`.
- **SC-009 (Audit-tab regression)**: The audit tab from feature 014 continues to render all 7 detail sections + flow diagram correctly after each story ships. The Audit IS the diagnostic surface for verifying these fixes.

## Assumptions

- The Audit tab from feature 014 is shipped and provides the diagnostic surface used to verify these fixes.
- The known calc regression flagged at the end of feature 013 (Safe-mode depleting at the user's default scenario) IS one of the symptoms these fixes resolve — specifically Stories 1 and 6.
- No new user input fields are introduced by any story; they are all internal cleanups + UX clarity.
- Constitution Principle I (Lockstep) applies to every story — both HTML files updated together.
- Constitution Principle VII (Bilingual) applies to every story that touches user-visible text (Stories 1, 4, 5).
- All 6 stories ship together in feature 015 in priority order P1 → P3 (clarification 2026-04-27). `/speckit-plan` produces a single ordered task list covering US1 → US6 sequentially.

## Out of Scope

- New calc behavior (e.g., a Monte Carlo feature, a new tax bracket, a new withdrawal strategy). This spec only fixes existing logic; new features get their own specs.
- Performance optimization beyond keeping today's 250ms recalc budget. If the budget becomes a binding constraint during a story, that's a separate decision.
- UI redesign of the lifecycle chart beyond adding shortfall markings (Story 1). The chart's overall structure stays.
- Removal of the existing `feasibilityProbe` / `summary` / `lifecycleSamples` keys in Copy Debug. These remain (FR-020 from feature 014 carries forward).
- Migration of localStorage keys. No state schema changes from this work.
- Closeout work for features 013 and 014 (browser smoke gates, manual quickstart walks). Those are tracked separately.
