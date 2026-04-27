# Research — Feature 015: Calc-Engine Debt Cleanup

Resolved decisions for each design question raised in [spec.md](./spec.md). Each decision lists rationale + alternatives considered. No NEEDS CLARIFICATION items remain — all five Session 2026-04-27 clarifications are encoded here.

---

## R1. Chart.js shortfall overlay rendering technique (US1)

**Decision:** Inline custom Chart.js plugin defined in both HTML files. The plugin reads `chart.options.shortfallRanges = [{xMin: age, xMax: age}, ...]` and paints `rgba(255, 80, 80, 0.18)` rectangles spanning each range over the canvas chart area. Plugin is registered locally to the lifecycle chart instance only (not globally) so other charts are unaffected.

**Rationale:**
- Constitution V (Zero-Build, Zero-Dependency) — adding `chartjs-plugin-annotation` from CDN would solve this with one line, but it adds a runtime dep we don't need elsewhere. A 30-line inline plugin is cheaper than the dep.
- The plugin's `afterDatasetsDraw` hook gives us pixel coordinates for each x-axis age value via `chart.scales.x.getPixelForValue(age)`. That's exactly the surface we need.
- Per-instance registration (not `Chart.register(plugin)` globally) means the plugin doesn't fire on the audit's small thumbnail charts that share the lifecycle data — only the main chart pays the cost.

**Alternatives considered:**
- `chartjs-plugin-annotation` (CDN dep): rejected on Constitution V.
- Pure CSS overlay positioned over the canvas: rejected because the canvas resizes responsively and CSS positioning would drift relative to the data points.
- Per-bar/per-point color override (paint each shortfall year's data point red): rejected because lifecycle is a stacked area chart, not a bar chart — per-point recoloring is awkward and doesn't communicate "year range" as cleanly as a vertical band.

---

## R2. Audit row tinting + visual parity with chart (US1)

**Decision:** Add a `has-shortfall` CSS class to `<tr>` elements in the audit's per-year Lifecycle Projection table when `row.hasShortfall === true`. CSS: `tr.has-shortfall { background-color: rgba(255, 80, 80, 0.10); }`. Use the SAME red hue as the chart overlay for visual consistency, but ~half the opacity since text needs to remain readable on the row's pale-red background against the dark theme.

**Rationale:** Acceptance Scenario 3 of US1 requires the audit table to flag the same years as the chart with a "consistent" marking. Using the same red hue at lower opacity satisfies "consistent" while preserving WCAG AA text contrast on the dark theme.

**Alternatives considered:**
- A new column "Shortfall?" with `Y/N`: rejected — too many columns already; row class is denser.
- A warning icon (⚠) in the leftmost column: rejected as redundant once row tinting is in place.

---

## R3. θ-sweep filter-then-rank rewrite location (US2)

**Decision:** The fix lives in `calc/strategyTaxOptSearch.js` (or wherever the `tax-optimized-search` strategy implementation currently sits — verified at task time during Wave A T001 caller-audit). Today's implementation iterates 11 θ values, calls `_simulateStrategyLifetime` for each, sorts the array by `lifetimeFederalTax` ascending, returns the first. The fix splits into 3 passes:

1. **Pass 1 — Simulate**: for each θ ∈ [0.0, 0.1, ..., 1.0], call the unified simulator (post-US6) or the existing simulator (during Wave A before US6 lands), collect `{θ, perYearRows, endBalance, hasShortfall, floorViolations, cumulativeFederalTax}`.
2. **Pass 2 — Filter**: retain only candidates where `hasShortfall === false && floorViolations.length === 0`.
3. **Pass 3 — Rank**: sort survivors by `cumulativeFederalTax` ascending; pick first. If survivors is empty, return `{feasibleUnderCurrentMode: false, chosenTheta: null, lowestTaxOverallTheta: <pass-1-lowest-tax-θ for diagnostic display>}`.

**Rationale:**
- 3-pass form mirrors the spec's Acceptance Scenarios 1, 2, 3 directly — easier to test each pass in isolation.
- Storing the `lowestTaxOverallTheta` even when all candidates are infeasible preserves diagnostic information for the audit's Strategy Ranking row (audit can show "Infeasible — lowest-tax overall θ would be 0.4, but it produced 8 shortfall years").
- The post-hoc `hasShortfall && gate.feasible` AND-check in `scoreAndRank` (added in feature 014 prep) becomes redundant once this lands. A test in Wave A explicitly removes that AND-check and asserts the existing 16 audit unit-test cases still pass (SC-002).

**Alternatives considered:**
- Lazy filtering (sort first, then take-while feasible): rejected — produces same result but obscures intent; "feasibility-first" is a stronger semantic guarantee than "filter incidentally."
- Keeping the post-hoc AND-check as belt-and-suspenders: rejected — it papers over a bug instead of fixing it. SC-002 explicitly verifies removal is safe.

---

## R4. Per-strategy FIRE age algorithm (US3)

**Decision:** `findPerStrategyFireAge(strategyId, scenarioInputs, mode) → {strategyId, perStrategyFireAge, perStrategyTrajectory}` is a thin wrapper around the existing `findFireAgeNumerical` bisection that threads `strategyOverride: strategyId` (and `thetaOverride` when applicable) through every call to the underlying simulator. The dashboard's per-recalc orchestration becomes:

```
for each strategyId in STRATEGY_REGISTRY:
  perStrategyResults[strategyId] = findPerStrategyFireAge(strategyId, scenarioInputs, mode)
ranking = rankStrategies(perStrategyResults, getActiveSortKey({mode, objective}))
displayedFireAge = ranking[0].perStrategyFireAge
displayedTrajectory = ranking[0].perStrategyTrajectory
```

**Rationale:**
- Eliminates oscillation by construction: the FIRE age is now an attribute OF the strategy, not a global value the strategy is evaluated against. No circular dependency.
- Reuses the existing bisection; only the input-threading changes. Lower implementation risk than rewriting the bisection.
- The per-strategy output is the natural input shape for US4's sort-key dispatch — `residualArea` and `cumulativeFederalTax` are computed once per strategy at its own FIRE age, not at a shared age.

**Alternatives considered:**
- Option A (iterate to convergence, cap 3 cycles): kept as the **fallback** if Option B's recalc latency exceeds 250ms. Code path is implemented behind a feature flag so the budget measurement (R6) can flip it without re-rolling.
- Option C (freeze strategy, weaken cross-validation invariant): rejected per the clarification — weakens the audit diagnostic surface.

---

## R5. Drag-skip guard for the per-strategy finder (US3)

**Decision:** A global `window._userDraggedFireAge: boolean` flag, set to `true` by the FIRE marker drag handler and cleared on any input change OR on the next idle (whichever comes first). When `recalcAll` runs and `_userDraggedFireAge === true`, the per-strategy finder is skipped: all strategies receive the user-dragged age as an input override, and the ranker still runs at that age. Drag interactivity is decoupled from per-strategy finder cost.

**Rationale:**
- A boolean global is the simplest representation. Lives in `window` so both HTML files reach it identically; lifetime is one drag interaction.
- "Cleared on input change" matches the existing override semantics (touching any input resets the manual FIRE age to the calculated value).
- "Cleared on next idle" (e.g., 500ms after drag end) protects against the stale-flag case where the user drags, releases, and then the next recalc still skips the finder. After idle, the next recalc re-runs the per-strategy finder so the displayed FIRE age catches up.

**Alternatives considered:**
- Pass `userDraggedFireAge` as a parameter through every function in the recalc chain: rejected as too much plumbing for a transient drag flag.
- Throttle/debounce the finder during drag instead of skipping: rejected — even a 50ms throttle on a 200ms finder still costs 25%+ of the budget per drag frame; skipping is cleaner.

---

## R6. Recalc budget measurement protocol (US3)

**Decision:** Instrument `recalcAll` with `performance.now()` markers around the per-strategy finder loop. Run the user's default scenario 10 times in sequence on a cold page load. Record p50 and p95 of the per-strategy finder time. Decision rule:

- If p50 < 200ms (50ms headroom on the 250ms budget) AND p95 < 250ms → **adopt Option B**.
- Otherwise → **fall back to Option A** (iterate to convergence, cap 3 cycles, stable when 2 consecutive cycles produce same `(fireAge, winnerStrategyId)`).

The measurement is run as a Playwright fixture in `tests/e2e/recalc-convergence.spec.ts` so it's reproducible. The fallback decision is recorded in `auditSnapshot.metadata.fireAgeFinderMode` ('per-strategy' | 'iterate-to-convergence') so the audit shows which mode is active.

**Rationale:**
- p95 < 250ms ensures even the slowest 5% of recalcs stays within budget — the user's drag interaction sees consistent latency.
- p50 < 200ms gives headroom for future calc additions (more strategies, more pools) without immediately busting budget.
- The fallback being automatic and observable in the audit means we don't need a separate "Option B vs Option A" UI toggle — the system picks the right one.

**Alternatives considered:**
- Single-run measurement: rejected — too noisy on cold caches and JIT warmup.
- p50 only (no p95): rejected — drag latency is felt as worst-case, not median.
- Manual flag flip after measurement: rejected — automated record + fallback in audit is more robust.

---

## R7. Sort-key dispatch architecture (US4)

**Decision:** A single pure function `getActiveSortKey({mode, objective}) → ActiveSortKeyChain` in `calc/strategyRanker.js` (or a new `calc/sortKeyDispatch.js` if isolation aids testing — decided at task time). The function is the SOLE place where (mode, objective) → sort-key mapping happens. Both the ranker and the audit's Strategy Ranking section consume its output identically.

| Mode | Objective | Primary Sort | Tie-Breaker 1 | Tie-Breaker 2 |
|------|-----------|--------------|---------------|---------------|
| Safe | Preserve estate | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| Safe | Minimize lifetime tax | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| Exact | Preserve estate | `endBalance` desc | `residualArea` desc | `strategyId` asc |
| Exact | Minimize lifetime tax | `cumulativeFederalTax` asc | `endBalance` desc | `strategyId` asc |
| **DWZ** | **Preserve estate** | **`residualArea` desc** | **`absEndBalance` asc** | **`strategyId` asc** |
| **DWZ** | **Minimize lifetime tax** | **`cumulativeFederalTax` asc** | **`residualArea` desc** | **`strategyId` asc** |

**Rationale:**
- Under Safe / Exact, `endBalance` desc is still meaningful as the primary "preserve" key because the mode constraints permit a wide range of end balances.
- Under DWZ, `endBalance` desc is degenerate (every feasible candidate ends ≈ $0) — `residualArea` becomes the path-shape primary; `absEndBalance` (ascending: closest to $0) becomes the tie-breaker.
- "Minimize lifetime tax" uses `cumulativeFederalTax` asc as primary in all three modes — that's the user's actual intent.
- Tie-breaker tail `strategyId` asc guarantees deterministic order regardless of map iteration order.

**Alternatives considered:**
- A 6-value Mode×Objective enum that hardcodes sort logic in the ranker: rejected — duplicates logic between ranker and audit; brittle to future Mode/Objective additions.
- Object-based sort key (OOP-style class hierarchy): rejected as over-engineered for 6 cells.

---

## R8. residualArea and cumulativeFederalTax precision (US4)

**Decision:** Both are computed in cents (integer arithmetic) then converted to dollars for display. Specifically:

- `residualArea` = `Math.round(sum(perYearRow.total) for years in [fireAge, planAge))` — sum is in dollars; rounding to nearest dollar before comparison.
- `cumulativeFederalTax` = `Math.round(sum(perYearRow.federalTax) for years in [fireAge, planAge))` — same.

Comparison is integer-equal, so floating-point representation issues never produce flickering tie-breaks across recalcs.

**Rationale:**
- The 250ms recalc budget includes plenty of headroom for an extra integer rounding pass.
- $1-precision rounding matches today's display rounding everywhere else in the dashboard.
- Eliminates a class of "this strategy was winning yesterday and losing today on the same input" bugs caused by sub-cent floating-point drift.

**Alternatives considered:**
- Cents-based integer arithmetic throughout: rejected as a too-large refactor — confined to sort-key precision.
- Float comparison with `Math.abs(a - b) < 0.005`: rejected — works but is more error-prone than integer compare.

---

## R9. US5 verification protocol (US5)

**Decision:** After Wave B ships, run the following Playwright fixture at `tests/e2e/objective-label-verification.spec.ts`:

```
For each scenarioFixture in [youngSaver, midCareer, preRetirement]:
  For each mode in [Safe, Exact, DWZ]:
    Toggle Objective: "Preserve estate" → record displayedFireAge_A
    Toggle Objective: "Minimize lifetime tax" → record displayedFireAge_B
    if displayedFireAge_A !== displayedFireAge_B:
      pass — label "Retire sooner / pay less tax" is accurate; preserve label
      return
After all 9 cells:
  fail — rename to "Minimize lifetime tax" in EN + zh-TW (FR-019)
```

**Rationale:**
- 3 scenarios × 3 modes covers the realistic input space without combinatorial explosion.
- "At least one cell differs" is the lowest bar that proves the label is accurate — if even one case shows a different FIRE age across objectives, the label is delivering on its promise.
- The rename is mechanical (i18n key change in both HTML files + catalog) and ships in the same Wave C task batch as US6.

**Alternatives considered:**
- Hand-pick one scenario to verify: rejected — doesn't generalize; a hand-picked passing case may not represent reality.
- Automated A/B sampling across 100 random scenarios: rejected as overkill for a label-rename decision.

---

## R10. Unified simulator API surface (US6)

**Decision:** `simulateLifecycle(options) → SimulationResult` where `options` is a single object with these fields:

```js
{
  scenarioInputs,       // current inp (or a frozen subset thereof)
  fireAge,              // age at which FIRE begins
  planAge,              // age at which simulation ends (e.g., 95)
  strategyOverride,     // 'bracket-fill-smoothed' | 'tax-optimized-search' | etc.
  thetaOverride,        // number 0..1 for tax-opt-search; undefined otherwise
  overlays: {
    mortgage: bool,     // include mortgage P&I cash flow
    college: bool,      // include college savings + outflow
    home2: bool,        // include second-home overlay
  },
  noiseModel: null,     // RESERVED — must be null in 015; throws if non-null
}
```

Output:

```js
{
  perYearRows: [{ age, total, cash, t401k, stocks, roth, ssIncome, federalTax, ... }],
  endBalance,
  hasShortfall,
  shortfallYearAges: [age, age, ...],
  floorViolations: [{ age, deficit, kind: 'buffer' | 'negative' }],
  cumulativeFederalTax,
  residualArea,
}
```

**Rationale:**
- The single options object means future field additions are non-breaking.
- Returning ALL diagnostics (shortfalls, violations, sums) in one call avoids duplicate simulation work in the ranker (which today re-derives sums from `perYearRows` after the simulator returns).
- The `noiseModel === null` precondition is enforced at the function entry — 015 ships deterministic-only, but the function signature is future-proof.

**Alternatives considered:**
- Multiple specialized entry points (`simulateForFinder`, `simulateForRanker`, ...): rejected — that's the current state we're consolidating away from.
- Builder/fluent API (`new Simulator().withStrategy(...).simulate()`): rejected as ceremony for a pure function.

---

## R11. Migration strategy for retiring 3 simulators (US6)

**Decision:** 4-step migration inside Wave C:

1. **Build alongside**: write `calc/simulateLifecycle.js` with full API per R10. Three existing simulators (`signedLifecycleEndBalance`, `projectFullLifecycle`, `_simulateStrategyLifetime`) remain untouched.
2. **Parity test**: for every existing `tests/unit/*.test.js` and `tests/e2e/*.spec.ts` fixture, replay the same inputs through `simulateLifecycle()` and assert byte-equivalent outputs vs the existing simulators (with documented `expected: true` exceptions ONLY where the spec already calls out the simulators disagree by design — those exceptions become bugs to fix).
3. **Flip call sites one at a time**: chart renderer first (most isolated), then audit assembler (FR-022), then strategy ranker (FR-020), then `findFireAgeNumerical` (per-strategy entry from US3). After each flip, run the full test suite. If any test regresses, revert the flip and add a parity-test failure to the punch list before proceeding.
4. **Delete retired simulators**: only AFTER all four call sites are flipped AND all parity tests are still green AND the audit Cross-Validation section emits zero "expected — different sim contracts" warnings (FR-021 / SC-006).

**Rationale:**
- Migrating one call site at a time bounds the blast radius of any per-site regression.
- The "delete only after parity holds" rule means the codebase is never in a "half-migrated and broken" state — at any point during Wave C, both the old and new simulators are live and the dashboard is shippable.
- Following the lessons from feature 004 (the abandoned canonical-swap), no helper is deleted without a caller-audit grep first; the commit message records the call-site count.

**Alternatives considered:**
- Big-bang flip-all-at-once: rejected — too risky; 4 call sites × 3 simulators = 12 potential regression surfaces.
- Permanent deprecation (keep both): rejected — defeats the consolidation purpose.

---

## R12. `noiseModel` reservation enforcement (US6)

**Decision:** `simulateLifecycle()`'s function body opens with:

```js
if (noiseModel !== null && noiseModel !== undefined) {
  throw new Error('simulateLifecycle: noiseModel is reserved for future Monte Carlo support and must be null in this build (feature 015).');
}
```

The JSDoc above the function documents the planned shape:

```js
/**
 * @param {Object|null} options.noiseModel - RESERVED. Must be null in feature 015.
 *   Future Monte Carlo will populate this with:
 *   {
 *     returns: { distribution: 'normal' | 'lognormal', mean: number, std: number },
 *     inflation: { distribution: 'normal', mean: number, std: number },
 *     lifespan: { distribution: 'normal', meanAge: number, stdAge: number },
 *     samples: number,    // e.g., 1000 trials
 *     seed?: number,      // optional deterministic seed
 *   }
 *   The implementation will run `samples` trials and return percentile aggregates.
 */
```

**Rationale:**
- Throwing on non-null forces future Monte Carlo code to extend this function explicitly, not silently no-op.
- The JSDoc is the single source of truth for what "future Monte Carlo" looks like, removing ambiguity about scope.
- Documenting the planned shape (not just the parameter name) means a reader 6 months from now can understand the intent without re-deriving it from a Monte Carlo PRD.

**Alternatives considered:**
- Silent no-op when non-null: rejected — masks future-developer mistakes.
- Skip the JSDoc and document elsewhere: rejected — colocation with the reservation makes the constraint discoverable.

---

## R13. Wave-by-wave smoke gate (cross-cutting)

**Decision:** Each wave (A → B → C) closes with a Manager-driven 5-step browser smoke walk on BOTH HTML files (per `CLAUDE.md > Browser smoke before claiming a feature "done"`):

1. Open both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` in a real browser.
2. Wait 2 seconds for cold load.
3. Confirm every KPI card shows a numeric value (no "Calculating…", NaN, $0, "—", "40+").
4. Open DevTools console. Confirm zero red errors AND zero `[<shim-name>] canonical threw:` messages.
5. Drag the FIRE marker; confirm same-frame update.

Wave B additionally verifies:
- After drag release + 500ms idle, the per-strategy finder re-runs (verified by the `userDraggedFireAge` flag transitioning back to `false` and `recalcAll` measurably running for ≥ 50ms in the next tick).
- Toggling between Modes (Safe / Exact / DWZ) produces visibly different chart trajectories under the same Objective.
- Toggling between Objectives ("Preserve estate" / "Minimize lifetime tax") produces visibly different chart trajectories under DWZ mode.

Wave C additionally verifies:
- The audit Cross-Validation section displays zero `expected: true` warnings.
- The chart's last-row `total`, the audit's last-row `total`, and the strategy ranker's `endOfPlanNetWorthReal` agree within $1 (FR-022).

**Rationale:** CI green is necessary but insufficient — feature 004's failure mode (CI green, browser visibly broken) is exactly what wave-by-wave smoke gates prevent. Bounding blast radius per wave means a Wave A bug is fixed before Wave B's debugging compounds it.

**Alternatives considered:**
- Single smoke gate at end of feature 015: rejected — too late; multi-wave bugs become entangled.
- Automated visual regression testing only: rejected as supplemental, not primary — visual regression catches some classes of bugs but not "the chart looks fine while reality is 8 years of starvation."

---

## Appendix: Caller-Audit Baseline (T001–T006, 2026-04-27)

### T001 — `signedLifecycleEndBalance` call sites
- 38 occurrences across 6 files.
- `calc/calcAudit.js`: 6 — assembler reads for cross-validation invariant A.
- `calc/shims.js`: implicit (uses canonical wrapper).
- `FIRE-Dashboard.html`: 11 — chart code, DWZ feasibility fallback, KPI verdict logic.
- `FIRE-Dashboard-Generic.html`: 11 — lockstep mirror.
- `tests/unit/bracketFill.test.js`: 5.
- `tests/unit/calcAudit.test.js`: 4.
- `tests/unit/strategyVsRequirement.test.js`: 1.

### T002 — `projectFullLifecycle` call sites
- 104 occurrences across 6 files.
- `calc/calcAudit.js`: 8 — primary lifecycle source for audit per-year rows.
- `FIRE-Dashboard.html`: 43 — chart producer, multiple recalcAll branches.
- `FIRE-Dashboard-Generic.html`: 39 — lockstep mirror.
- `tests/unit/bracketFill.test.js`: 3.
- `tests/unit/calcAudit.test.js`: 10.
- `tests/unit/strategyVsRequirement.test.js`: 1.

### T003 — `_simulateStrategyLifetime` call sites
- 10 occurrences across 2 files (HTML only — defined inline, not extracted).
- `FIRE-Dashboard.html`: 5 — strategy ranker's inline helper.
- `FIRE-Dashboard-Generic.html`: 5 — lockstep mirror.
- **Note**: This simulator is INLINE in HTML, not in `calc/`. Wave C deletion task T089 must delete the inline block in both files.

### T004 — `tax-optimized-search` strategy implementation
- Defined inline in both HTML files (no `calc/strategyTaxOptSearch.js` exists as the plan template suggested).
- `FIRE-Dashboard.html`: 8 — `STRATEGY_REGISTRY` entry + θ-sweep loop + ranker references.
- `FIRE-Dashboard-Generic.html`: 8 — lockstep mirror.
- `tests/unit/calcAudit.test.js`: 5; `tests/unit/strategies.test.js`: 3.
- **Implication for T031**: the 3-pass refactor edits BOTH HTML files (lockstep) since the strategy is inline.

### T005 — `findFireAgeNumerical`, `scoreAndRank`, `getActiveChartStrategyOptions` locations
- 70 occurrences across 7 files; ~20 each in RR + Generic HTML (inline implementations).
- `calc/shims.js`: 6 — defensive wrappers for canonical helpers.
- `calc/calcAudit.js`: 5 — reads `_lastStrategyResults` and these helpers' outputs.
- `tests/unit/strategies.test.js`: 11; `tests/unit/shims.test.js`: 6; `tests/unit/calcAudit.test.js`: 2.
- **Implication for T043, T058**: per-strategy finder + sort-key dispatch are added to `calc/strategyRanker.js` (NEW; extracted) OR added inline. Decision: create `calc/strategyRanker.js` as a NEW pure module to satisfy Constitution II.

### T006 — Baseline test corpus
- Total: 215 tests via `bash tests/runner.sh`.
- Pass: 213.
- Fail: 1 (`tests/meta/module-boundaries.test.js` — pre-existing failure on `window` references in `calc/calcAudit.js` and `calc/tabRouter.js`; both use the standard UMD-style global registration pattern from features 013 and 014. Not introduced by feature 015. Tracked separately).
- Skip: 1.
- Feature 015 must keep 213 passing; the 1 pre-existing fail is acceptable to inherit.

### Architectural observation from caller audits
- `_simulateStrategyLifetime`, `tax-optimized-search`, `findFireAgeNumerical`, `scoreAndRank` are ALL inline in the HTML files, not extracted to `calc/`.
- The plan.md's "calc/strategyRanker.js" and "calc/strategyTaxOptSearch.js" file paths describe the END state (post-extraction) but those files do NOT exist at start of feature 015.
- **Strategy adopted**: extract the strategy ranker + sort-key dispatch into NEW `calc/strategyRanker.js` as part of Wave B (US3 + US4) so the contracts are satisfied. The θ-sweep refactor (US2) stays inline in HTML for Wave A speed (extraction can happen in Wave B as a side effect of strategyRanker.js creation).
- For US6, the unified `simulateLifecycle.js` extraction REPLACES inline `_simulateStrategyLifetime` and inline portions of `projectFullLifecycle`/`signedLifecycleEndBalance` — the goal is to get both HTML files calling the new module.
