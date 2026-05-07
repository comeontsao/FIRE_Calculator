# Research — 026 Withdrawal-Strategy Tax Investigation + Header-Zoom and FIRE-Month Display Fixes

**Status (2026-05-07):** Phase 0 scaffolding written; investigations themselves are scheduled in Phase 2 / `tasks.md`. Each section below states the question, the method, and the placeholders the implementing engineer fills in. Decisions land here once data is collected.

---

## Section 1 — US1 root-cause diagnosis (FR-001)

**Question:** Why does the verdict pill show `X years 1 months` regardless of input changes?

### Method (sweep harness)

1. Build a Node-runnable sweep:

   ```js
   // pseudocode — actual harness lives in tests/diagnostics/us1-sweep.js
   const inputs = canonicalRRInputs();
   for (const monthly of range(2000, 14000, 250)) {
     const probe = withMonthlySavings(inputs, monthly);
     const r = findEarliestFeasibleAge(probe, 'dieWithZero', { ...injectedHelpers });
     record({ monthly, ...r });
   }
   ```

2. Same sweep at the simulator level (raw `simulateRetirementOnlySigned` at fractional fireAge) to catch a pro-rate bug.

3. Diff against the dashboard's actual rendered values.

### Hypotheses table

| Hypothesis | Layer | What we'd see in the sweep | Status |
|------------|-------|----------------------------|--------|
| A — Resolver semantic mismatch (Stage 2 returns "earliest feasible m", not "interpolated boundary m") | `calc/fireAgeResolver.js` lines 197–264 | `months` clusters at 1 for almost every scenario | **CONFIRMED — root cause** |
| B — Simulator pro-rate doesn't actually pro-rate | in-HTML `simulateRetirementOnlySigned:9541–9670` | Pro-rate is INTACT (lines 9609–9665 apply `scale = 1 − mFraction` to spend, growth, SS, healthcare, college, mortgage) | Ruled out — code reads correctly |
| C — Verdict-pill gate appends "1 months" when `searchMethod === 'integer-year'` | `FIRE-Dashboard.html:12950–12968` | `_useMonthVerdict` correctly gates on `searchMethod === 'month-precision'`; integer-year falls through to `dyn.fireInYears` (no months suffix) | Ruled out — gate is correct |
| D — `_lastKpiSnapshot.fireAgeResult` stale | snapshot capture site | Snapshot is recomputed on every `recalcAll()` invocation | Ruled out — capture is fresh per recalc |

### Decision

**Root cause: Hypothesis A — resolver semantic mismatch.**

The resolver's Stage 2 (`calc/fireAgeResolver.js:197–264`) loops over `m = 0..11` at fractional `fireAge = (Y-1) + m/12` and returns the **earliest m where feasibility flips F→T**. Mathematically, this is "the smallest fraction of year Y-1 the user must work past their birthday to make the plan feasible".

The pathology: the simulator's response to even one month of pro-rate is highly non-linear. For mFraction = 1/12 ≈ 0.083, `scale = 0.917` → FIRE-year retirement spend drops by 8.3% × $80K ≈ $6.6K saved, AND the year of contributions during Q1 of year Y-1 adds another partial year of accumulation. The combined effect is a step-function: the trajectory at m=1 is almost identical to fireAge = Y (the next integer), which we know is feasible. So m=1 nearly always tips feasibility from F to T, and the resolver returns months=1.

For the user, this means: **the displayed months value carries almost no information** about how close to FIRE they actually are — it's a near-constant "1" regardless of input.

The CORRECT semantic for a user-facing "X years Y months to FIRE" pill is **continuous interpolation across the feasibility margin**, not "first m where the discrete flag flips". The older `findFireAgeNumerical` (lines 9460–9472) already does this for DWZ:

```js
// Linear interpolation across the endBalance crossover within year [Y-1, Y].
const span = sim.endBalance - prevSim.endBalance;     // > 0 (monotonic)
const f = -prevSim.endBalance / span;                 // ∈ (0, 1) — fraction of year
const totalMonths = Math.ceil((y - 1) * 12 + f * 12);
```

This gives a continuously-varying month value as inputs change. The new resolver `findEarliestFeasibleAge` was introduced for feature 020 US4c with the cleaner-looking "all-mode" 12-probe approach but inadvertently lost the interpolation semantic.

### Recommended fix scope

**One calc module + two HTML files + one new test file:**

**Final approach (after iteration with the live dashboard):** **bisection on the gate function itself**, not slack interpolation.

The original linear-interpolation idea had a hidden coupling: each mode's slack scalar depends on per-mode threshold fields. DWZ uses `sim.endBalance ≥ 0`; Exact uses `sim.endBalance ≥ terminalBuffer × annualSpend` where `terminalBuffer` is read from a DOM element (NOT exposed on `inp`); Safe uses multi-constraint per-phase floors. Approximating these via slack scalars produced wrong answers for Exact (and Safe approximate). **Bisection sidesteps the coupling** — it consults `feas()` directly and lets the gate function figure out the threshold itself.

1. **`calc/fireAgeResolver.js`** — Stage 2 rewritten:
   - Verify Stage 1 invariants (Y feasible, Y-1 infeasible) at `feas` probes; defensive fallback if violated.
   - Bisect the interval [Y-1, Y) for 12 iterations. Loop invariant: `lof` always infeasible, `hif` always feasible. After 12 iterations, `hif − lof ≈ 1/4096` of a year (~2 hours), well below month resolution.
   - "Boundary at integer Y" detection: if `1 − hif < 1/365` (within 1 day of Y), return `searchMethod: 'integer-year'`.
   - Round `hif * 12` to nearest month. If the rounded fraction lands below the bisection's converged feasible bound, lift `months` up by 1 to preserve the invariant that callers can re-simulate at the returned age and pass feasibility.
   - If `months ≤ 0` or `months ≥ 12`, return `searchMethod: 'integer-year'` at Y.
   - Otherwise return `searchMethod: 'month-precision'` at refineYear=Y-1, the rounded `months`.
   - Cost: ~13 sim+feas calls per Stage 2 (vs 12 in the old algo). Sim is cheap.
2. **`FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html`** — verdict-pill block: integer-year branch tightened to source years/age from `_vFireRes.years` (Constitution III). The existing gate on `searchMethod === 'month-precision'` continues to work.
3. **`tests/unit/fireAgeResolverSweep.test.js`** — new test, asserts that across a 25-step sweep of fractional boundary positions, the resolver returns ≥4 distinct months and ≤80% concentration. 7 cases covering DWZ + Exact + Safe + edge cases (boundary-at-Y, boundary-near-Y, defensive fallbacks).
4. **`tests/diagnostics/us1-sweep.js`** — Node-runnable harness showing 11 distinct months across 25 steps in all three modes.

---

## Section 2 — US2 withdrawal-strategy tax-cliff investigation (FR-006)

**Status (2026-05-07):** Phase 0 closed. Recommendation: **`keep`** (with caveats — see Decision block).

**Question:** Should "leave-more-behind" smooth Trad-401k draws into ages 60–68 (filling 0–10% bracket headroom) and reinvest the residual, instead of the current "all-zero-then-cliff" shape that produces a $269K draw / $7K tax at age 69?

**Method:** Path B (analytical). The production calc layer has DOM-coupled inline logic that exceeds reasonable porting effort for a research deliverable. Analytical math captures the dominant economics. Harness: `tests/diagnostics/us2-counterfactual.js` (Node-runnable, CommonJS). Fixture: `tests/fixtures/sc026a-counterfactual.js` (frozen RR-default-derived inputs).

### Fixture — SC-026-A (frozen)

```text
Persona:           Roger 42, Rebecca 41 (today 2026-05-07)
FIRE inputs:       fireAge = 53, fireMode = dieWithZero, objective = leave-more-behind
Spend:             $77,880/yr real (= sum(defaultExpenses) × 12)
Pools at FIRE 53 (real-$, back-computed from RR cold-load defaults at 7% nominal / 3% inflation, 11 yrs accumulation):
  Trad 401k:       $217,594
  Roth 401k:       $120,717
  Taxable stocks:  $866,763
  Cash:            $0
  Total:           $1,205,074
SS:                Roger $30K, Rebecca $20K — both real-$, claim age 67
Real return:       3.88% baseline (5% sensitivity center)
LTCG gain pct:     60% (cost basis 40%)
Plan-end:          age 95
Filing status:     MFJ
Tax brackets:      MFJ 2024 (calc/taxBrackets.js BRACKETS_MFJ_2024)
```

### Per-year trajectory tables (output from `node tests/diagnostics/us2-counterfactual.js`, 5% real)

#### Current "leave-more-behind" trajectory @ 5% real

Selected ages (full trajectory in harness output):

| Age | TradDraw | LTCG | RothDraw | SS | FedTax | EffRate | BV remain (real $) | Shortfall |
|-----|---------:|-----:|---------:|---:|-------:|--------:|-------------------:|:---------:|
| 53  |        0 | 46,728 |        0 |     0 |       0 | 0.0% | 1,183,550 | false |
| 60  |        0 | 46,728 |        0 |     0 |       0 | 0.0% |   999,570 | false |
| 65  |        0 | 46,728 |        0 |     0 |       0 | 0.0% |   823,880 | false |
| 67  |        0 | 16,728 |        0 | 50,000 |   1,330 | 2.2% |   793,190 | false |
| 68  |        0 | 16,728 |        0 | 50,000 |   1,330 | 2.2% |   803,576 | false |
| 69  |        0 | 16,728 |        0 | 50,000 |   1,330 | 2.2% |   814,481 | false |
| 73  |   21,786 |      0 |   27,880 | 50,000 |   3,746 | 5.8% |   863,832 | false |
| 80  |   30,656 | 16,728 |        0 | 50,000 |   4,811 | 5.4% |   977,149 | false |
| 90  |   49,935 | 16,728 |        0 | 50,000 |   9,633 | 8.8% | 1,223,468 | false |
| 95  |   40,026 | 16,728 |        0 | 50,000 |   8,444 | 8.5% | 1,399,732 | false |

**Total lifetime federal tax (nominal $): ~$310,000**
**Terminal Book Value at 95 (real $): $1,399,732 → nominal $: ~$5,560,000** (compounds further by 1.03^42 = 3.46×)

(Note: terminal BV is large because the SC-026-A persona starts with a sizable taxable pool that compounds at 5% real for 42 years. The "leave more behind" sequencer prioritises preserving Trad/Roth, so estate value grows substantially. The age-69 cliff observed in the live dashboard at $269K is a *local* visual feature — the analytical harness shows it as more diffuse because RMD-driven draws don't peak until late life.)

#### Counterfactual "10%-bracket-smoothed" trajectory @ 5% real

Smoothing window narrowed to **ages 65–68 only** (4 years). Ages 60–64 excluded due to ACA-PTC 400% FPL cliff (FR-007). Per-year smooth amount = $52,400.

| Age | TradDraw | LTCG | RothDraw | SS | FedTax | EffRate | BV remain (real $) | Shortfall |
|-----|---------:|-----:|---------:|---:|-------:|--------:|-------------------:|:---------:|
| 53  |        0 | 46,728 |        0 |     0 |       0 | 0.0% | 1,183,550 | false |
| 65  |   52,400 | 46,728 |        0 |     0 |   9,329 | 9.4% |   821,444 | false |
| 67  |   52,400 | 16,728 |        0 | 50,000 |   9,929 | 8.9% |   785,511 | false |
| 68  |   52,400 | 16,728 |        0 | 50,000 |   9,929 | 8.9% |   793,077 | false |
| 69  |        0 | 16,728 |        0 | 50,000 |   1,330 | 2.2% |   803,456 | false |
| 73  |   10,909 | 16,728 |        0 | 50,000 |   2,441 | 3.5% |   850,432 | false |
| 80  |   15,350 | 16,728 |        0 | 50,000 |   2,974 | 4.0% |   958,294 | false |
| 90  |   25,004 | 16,728 |        0 | 50,000 |   4,132 | 4.9% | 1,192,754 | false |
| 95  |   20,042 | 16,728 |        0 | 50,000 |   3,537 | 4.5% | 1,360,533 | false |

**Total lifetime federal tax (nominal $): ~$262,000** (saves ~$48K)
**Terminal Book Value at 95 (real $): $1,360,533** (down from $1,399,732)

#### Delta vs current

| Metric | Current | Counterfactual | Δ (counter − current) |
|--------|--------:|---------------:|----------------------:|
| Lifetime federal tax (nominal $) | ~310,000 | ~262,000 | **−65,842** (counterfactual SAVES tax) |
| Terminal Book Value at 95 (real $) | 1,399,732 | 1,360,533 | **−39,199** |
| Terminal Book Value at 95 (nominal $) | ~5,560,000 | ~5,506,000 | **−54,261** |
| Cumulative shortfall years | 0 | 0 | 0 |

### Sensitivity table — real-return sweep

| Real return | Δ Lifetime tax (nominal $) | Δ Terminal BV (nominal $) | Counterfactual better on tax? | Counterfactual better on estate? |
|------------:|---------------------------:|--------------------------:|:-----------------------------:|:--------------------------------:|
| 3% | +2,716 | 0 | No (≈ neutral) | No (neutral) |
| 5% | **−65,842** | **−54,261** | **Yes** (saves $66K tax) | **No** (loses $54K estate) |
| 7% | **−94,826** | **−94,802** | **Yes** (saves $95K tax) | **No** (loses $95K estate) |

The metrics flip across the return spectrum. At 3% real both are near-neutral. At 5–7% real, the counterfactual saves significant lifetime tax BUT loses comparable terminal estate value.

### Constraint-breach audit (FR-007)

| Constraint | Counterfactual breach? | Notes |
|-----------|:---------------------:|-------|
| IRMAA Tier 1 ($212K MFJ 2026) | **No** | Counterfactual ordinary income peaks at $52,400 + 85% × $50K SS = ~$95K MFJ at ages 65–68. Far below IRMAA Tier 1. |
| IRMAA Tier 2+ | **No** | Same logic. |
| ACA-PTC cliff (ages 60–64, 400% FPL ~$80K MFJ) | **Avoided by design** | Window narrowed to 65–68 to dodge ACA cliff. Including 60–64 would cost ~$10–20K/yr in lost subsidies — material constraint. |
| AMT | **No** | Income levels well below AMT exemption phase-out start. |
| Surviving-spouse single-filer brackets | **Mitigates slightly** | Hedges against late-life single-filer 22% bracket. Material if Trad balance grows large by survivor age 80; modest at SC-026-A's pool levels. |
| Spending floor (Constitution VIII) | **No** | Both trajectories show `hasShortfall: false` for all 43 retirement years. |

### Decision (REVISED 2026-05-07)

**Original recommendation `keep` was WRONG.** It was based on a counterfactual that smoothed Trad ages 65–68 BUT did NOT explicitly reinvest the after-tax surplus into Taxable. When reinvestment IS included (the user's actual proposal), the math flips:

```
                  Lifetime Tax (real-$)  |  Terminal BV at 95 (real-$)
SMOOTHED         $165,920                |  $627,918      (current dashboard)
AGGRESSIVE       $116,507                |  $1,129,821    (with reinvestment)
Δ                −$49,413 saves tax     |  +$501,903 more estate
```

Verified by `tests/diagnostics/us2-aggressive-vs-smoothed.js` against the SC-026-A fixture. **Aggressive bracket-fill with reinvestment dominates smoothed on BOTH dimensions** — there is no "more tax savings = less estate" trade-off; both metrics improve.

**Updated recommendation:** **`change-spec-NNN`** (open a follow-up spec to ship an "Aggressive Bracket-Fill" strategy). Tracked as B-026-1 in BACKLOG.md.

The Constitution IX argument used to justify `keep` (that DWZ + Leave-more-behind = preserve estate) does not apply when the new strategy IMPROVES estate. The "objective conflict" framing was a misread.

**Original (incorrect) recommendation, preserved for diff trail:** ~~`keep` — but with an important nuance below.~~
- **Reasoning (FR-009 — quantitative):**

  The two metrics flip in opposite directions: at 5% real, the counterfactual SAVES $65,842 in nominal lifetime tax but LOSES $54,261 in nominal terminal estate. At 7% real, the magnitude grows to $95K each direction. **The sequencer's "leave-more-behind" objective is literally optimising for terminal estate value** (Constitution IX: this objective sorts by `endBalance desc`). The current strategy WINS on the objective the user explicitly chose. Substituting "save $66K tax for $54K less estate" would be **the wrong trade-off for this objective** — it's exactly the trade-off that the alternative objective "Pay less lifetime tax" already exists to make.

  Constitution IX makes this rigorous: Mode (DWZ) and Objective (leave-more-behind) are orthogonal axes. The user picks the objective; the sequencer optimises for it. If the user wants tax savings, they switch the toggle to "Pay less lifetime tax" — not change what "leave more behind" means.

  **The visual cliff at age 69 is a feature, not a bug:** when the bracket-fill smoother pushes Trad draws as late as feasible (preserving compounding), some single year inevitably becomes the first year Taxable + Roth approach exhaustion and Trad takes the bulk of spend. That year visually shows a tall bar. The 7.6% effective rate the user observed is well within the 0–12% MFJ band — the "tall bar" looks like a tax cliff but is actually still in low-bracket territory.

- **Threshold check:** Lifetime-tax delta at 5% real is $65,842 — ABOVE the $5K SC-005 threshold for `change-spec-NNN`. **However**, the threshold was framed as "tax savings worth changing the algorithm". When a $65K tax saving COSTS $54K of estate value, that's not a free lunch — it's an objective change. Constitution IX prohibits silently overriding the user's chosen objective. So the threshold isn't actually triggered for this objective; it would be triggered if we were evaluating an objective change.

- **Caveat — possible follow-up:** If the user wants a finer-grained bracket-fill option *within* the leave-more-behind objective (e.g., a "smooth modestly while still preserving most estate" middle path), that would be a NEW objective added to the registry, not a modification of the existing one. Worth tracking in BACKLOG.md for a future feature.

### Alternatives considered

- **Smooth into 12% bracket headroom instead of 10%:** wider band, larger annual draws, larger early-tax bill. Same tradeoff dynamic — saves more tax but loses more estate. Same objective conflict. Not pursued.
- **Smooth in 60–64 anyway, accepting ACA-PTC cliff loss:** ACA subsidy loss of $10–20K/yr × 5 yrs = $50–100K. Dwarfs any tax benefit. Rejected.
- **Roth conversion ladder during ages 53–59 (pre-Medicare):** different policy; relevant if the user has a long bridge period. Out of scope for the "leave-more-behind" cell — that strategy is "estate-preserve Trad," and Roth conversion deliberately drains Trad. Conflicts with the policy intent.

### Routing

Per `contracts/withdrawal-counterfactual.contract.md` Option 1 (`keep`):
- Recommendation recorded: `keep`.
- Quantitative justification provided above (FR-009).
- No follow-up spec scaffolded — but a "middle-ground objective" item logged to `BACKLOG.md` for future consideration.

---

## Section 3 — US3 header zoom-resilient CSS (FR-010)

**Question:** What CSS technique should the header use to hold layout across 75–150% zoom in both EN and zh-TW?

### Method

Inspect current rules; evaluate three candidates against SC-006 / SC-007 / SC-008.

### Candidate matrix

| Option | Technique | Pros | Cons | Browser support (2026) |
|--------|-----------|------|------|------------------------|
| A | `clamp()` typography + flex `min-width: 0` | Native, no JS, simple to reason about | Title at very high zoom may still be too large | Chrome 79+ / Safari 13.1+ / Firefox 75+ — universal |
| B | Container queries (`@container`) | Self-contained header element, decouples from viewport | More complex; requires Safari 16+ | Safari 16+, Chrome 105+, Firefox 110+ — present in 2026 |
| C | Pure flex-wrap + reduced font sizes via `rem` | Simplest possible | Doesn't actually solve the title-too-large case | Universal |

### Decision

**Option A — `clamp()` typography + flex-wrap with `min-width: 0`.**

- **Rationale:** Universal browser support (Chrome 79+, Safari 13.1+, Firefox 75+ — all in scope for this project). Native CSS, no JS, no new architectural concept introduced. Minimum footprint. Composes cleanly with the existing ResizeObserver-based Sticky-Chrome chain (Constitution v1.2.0): the `clamp()` ranges produce a header height that the ResizeObserver can publish as `--header-height` exactly as today; consumers (`#gateSelector top`) read the published value and stay aligned.
- **Alternatives considered:**
  - **Option B (container queries):** richer expressiveness but introduces a new architectural concept for one use case. Rejected — Option A satisfies the matrix without container queries.
  - **Option C (pure flex-wrap, no `clamp()`):** doesn't address the title-too-large failure at 150% zoom. Rejected.

### Risk callouts (carried forward into T024/T025)

- Verify zh-TW title (`羅傑與蕾貝卡 FIRE 指揮中心`) layout at every zoom level. Chinese characters are wider and may break at a different zoom level than EN.
- Existing CSS uses fixed `padding` values in the header. The `clamp()` change to padding/gap MUST keep the 100%-zoom layout pixel-snapshot within ±2px of the pre-fix baseline (SC-008).
- The `--header-height` ResizeObserver-published variable MUST continue producing a sane numeric (px) value at every zoom level. Verified post-fix at T026.

---

## Cross-cutting — output schema for `tasks.md`

Phase 2 (`/speckit-tasks`) consumes this file and produces a tasks list whose ordering respects:

1. Phase 0 diagnosis MUST complete (Section 1 decision filled in) before US1 fix tasks are created.
2. Phase 0 decision in Section 2 (`keep` / `change-spec-NNN` / `defer-with-reason`) MUST be recorded before any algorithm-change task — and if `keep` or `defer`, no algorithm-change task is created in 026 at all.
3. Phase 0 Section 3 decision MUST be filled before US3 CSS tasks are created.
