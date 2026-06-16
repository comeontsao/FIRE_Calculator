# Phase 0 Research: Year Tax Estimator

All decisions below were resolved from the existing codebase + the brainstorming session.
No open `NEEDS CLARIFICATION` items remain.

---

## D1 — LTCG stacking algorithm (the core)

**Decision:** Implement capital-gains tax by stacking gains on top of ordinary **taxable**
income against a 0%/15%/20% schedule:

```
ordinaryTaxable = max(0, ordinaryGross − standardDeduction)
zeroRoom        = max(0, ltcg0Ceiling − ordinaryTaxable)
gainAt0         = min(ltcg, zeroRoom)
fifteenRoom     = max(0, ltcg15Ceiling − max(ordinaryTaxable, ltcg0Ceiling))
gainAt15        = min(ltcg − gainAt0, fifteenRoom)
gainAt20        = ltcg − gainAt0 − gainAt15
ltcgTax         = gainAt15 * 0.15 + gainAt20 * 0.20
```

`ltcg15Ceiling` is the 15%→20% breakpoint (current-law MFJ ≈ $600k, inflation-indexed).

**Rationale:** This is real US law (LTCG rate is determined by *total* taxable income, with
ordinary income filling the bottom brackets first). It is exactly what the user must reason
about to avoid pushing a sale from 0% into 15%.

**Why not reuse `calc/tax.js computeTax`:** Its own header (lines 35–44) states it taxes
LTCG on a **separate** schedule on its own dollars (no stacking) and applies **no standard
deduction** — a documented simplification "accurate enough for FIRE projections." That is
the opposite of what this tool needs. We add a new module rather than change `computeTax`,
because `computeTax` is consumed by the withdrawal engine and its fixtures lock its current
(simplified) behavior; changing it would ripple into strategy results. (FR-014.)

**Alternatives considered:** (a) extend `computeTax` with an optional `stack: true` flag —
rejected to avoid destabilizing the engine's fixtures mid-feature (CLAUDE.md "field-semantics
extensions need test audits BEFORE landing"); (b) compute only 0% vs 15% (ignore 20%) —
rejected as incorrect for high-gain years, cheap to include.

---

## D2 — Nominal frame & inflation of thresholds

**Decision:** The estimator computes and displays in the **selected year's nominal dollars**.
- Auto-pulled income/gains come from strategy rows in **real-$** and are converted to nominal
  at the selected calendar year via `calc/inflation.js` `makeInflation(inflationRate, baseYear).toNominal(real, year)`.
- Indexed thresholds (standard deduction, ordinary brackets, LTCG 0% ceiling, LTCG 15→20
  breakpoint, IRMAA Tier 1) are entered/defaulted in today's dollars and inflated to the
  selected year with the SAME factor.
- The **NIIT $250k MFJ threshold is NOT inflated** — it stays a fixed nominal $250k every
  year (it is frozen in statute since 2013). (FR-021.)

**Rationale:** A tax return is filed in that year's actual dollars against that year's
(inflation-adjusted) brackets. Doing the whole stack in one nominal frame keeps every
per-layer breakdown number honest. The NIIT exception is a genuine planning trap and is
surfaced via tooltip rather than hidden. (FR-019/020/021.)

**Inflation source:** the dashboard's existing inflation assumption + base year (same values
`calc/inflation.js` and the lifecycle already use). No new inflation input is introduced
(spec Assumptions). The renderer reads the existing inflation rate/baseYear from the inputs
object the rest of the dashboard already builds.

**Frame discipline:** `calc/taxEstimator.js` is itself frame-agnostic arithmetic — it takes
already-nominal numbers and already-nominal thresholds and returns nominal results. The
ONLY real↔nominal conversion happens in the renderer's auto-pull adapter via `inflation.js`,
preserving FR-017's "single conversion site" rule. The module header is annotated
`FRAME: nominal-$ (caller-supplied; conversion upstream in renderer via inflation.js)`.

---

## D3 — Auto-pull data source & field mapping

**Decision:** Source per-year numbers from the SAME data the Roth-ladder chart renders
(`renderRothLadder`, FIRE-Dashboard.html ~line 14763), i.e. the active displayed strategy's
per-year rows: `_lastStrategyResults.rows[].perYearRows[]` when a non-default strategy is
displayed, else `computeWithdrawalStrategy(...).strategy[]`. Map per-year row → estimator
inputs (all real-$ before conversion):

| Estimator input | Source field (real-$) | Notes |
|---|---|---|
| Other ordinary income | `0.85 × ssIncome` (taxable SS portion) | matches `renderRothLadder`'s SS handling (`calc/withdrawal.js` line 287); other taxable interest assumed 0 unless a field exists |
| Traditional 401k/IRA withdrawal | `drawn.trad` per-year (the row's trad draw) | ordinary |
| Roth conversion | `syntheticConversion` | ordinary; the bracket-fill synthetic conversion |
| Long-term stock gain | `drawn.taxable × (1 − basisFraction)` | LTCG; `basisFraction` derived from the existing `stockGainPct` input |

**Rationale:** Reusing the exact same source the Roth-ladder consumes guarantees the
estimator's un-edited values AGREE with the projection (FR-005) and avoids a second,
drift-prone derivation.

**Open implementation detail (resolve during tasks, NOT a spec ambiguity):** the precise
field names on `perYearRows[]` must be audited in `calc/withdrawal.js` /
`calc/strategyRanker.js` before wiring — per CLAUDE.md "investigate consumers before coding"
(project_031 lesson). If a component (e.g. trad draw or taxable-sale gain) is not exposed as
a named field on the row, the renderer derives it from the fields that are present and the
data-model.md mapping is updated. The auto-pull adapter is the single place this mapping
lives.

**Graceful degradation:** when no strategy result is available (cold load / infeasible),
the adapter returns zeros and the block shows a neutral "select inputs" state (FR-023),
never NaN.

---

## D4 — Module loading & file:// / global-scope safety

**Decision:** `calc/taxEstimator.js` uses the UMD classic-script pattern proven by
`calc/cashSweep.js` (lines 79–96): plain `function estimateYearTax(...)`, no top-level
`export`; bottom-of-file registration `const _taxEstimatorApi = { estimateYearTax };`
(UNIQUE name — never `_api`), `module.exports = _taxEstimatorApi` for Node, and
`globalThis.estimateYearTax = estimateYearTax`. Loaded as `<script src="calc/taxEstimator.js">`
in BOTH HTML files near the other calc scripts.

**Rationale:** Constitution V + the hard-won CLAUDE.md lesson "Classic-script global scope is
ONE shared lexical scope" — a duplicate top-level `const`/`let` silently kills the second
module in the browser while Node tests stay green. Unique global name + lazy call-time
references avoid that class of failure. `tests/unit/globalScopeCollision.test.js` will be
extended to statically guard the new module.

---

## D5 — Editing, reset, and no-write-back guarantee

**Decision:** Estimator inputs are independent DOM fields seeded from the auto-pull adapter.
Editing recomputes ONLY the estimator's own display via `renderYearTaxEstimator`. Reset
re-runs the adapter for the current year and re-seeds the fields. The renderer NEVER calls
`recalcAll`, `renderGrowthChart`, the strategy ranker, or any plan-mutating path; it writes
to no shared state and no `localStorage`. A persistent caption states this (FR-003).

**Rationale:** FR-002/FR-004/FR-006 + Principle III. Keeping the estimator a pure read +
local-display lens is what makes Option A safe (vs the rejected Option B chart-feedback).

**Verification:** an E2E asserts the Lifecycle chart's rendered end-balance KPI is identical
before and after a sequence of estimator edits (SC-004).

---

## D6 — Signals (room-left, marginal, IRMAA, NIIT)

**Decisions:**
- **Room left at 0% LTCG** = `max(0, ltcg0Ceiling − ordinaryTaxable − ltcg)` in selected-year
  dollars. Headline. (FR-015.)
- **Marginal next-dollar (ordinary)** = the rate of the bracket the next ordinary dollar lands
  in. **Marginal next-dollar (LTCG)** = 0% if `room > 0` else 15% (or 20% above the breakpoint).
  Tooltip warns adding ordinary income shrinks the 0% room and can flip gains to 15%. (FR-016.)
- **IRMAA Tier 1** flag when MAGI (≈ ordinaryGross + ltcg) > inflated IRMAA threshold. (FR-017.)
- **NIIT 3.8%** flag + amount = `0.038 × min(netInvestmentIncome, MAGI − 250k)` when MAGI > fixed
  $250k; netInvestmentIncome here ≈ ltcg. (FR-018.)

**Rationale:** These are the secondary traps the user asked to surface; all are derivable from
the same nominal inputs with no extra data. NIIT uses the fixed (un-inflated) threshold per D2.

**Out of scope (spec Assumptions):** state tax, AMT, the 0.9% Additional Medicare Tax on wages,
SS taxability interactions beyond the 85% inclusion already pulled. Documented, not silently
dropped.

---

## D7 — Bilingual strings & terminology

**Decision:** Every new string (block title, sync caption, 6 input labels, ~10 tooltips, 2
breakdown card headings + dynamic step text, 4 signal chips) is added to `TRANSLATIONS.en`
AND `TRANSLATIONS.zh` in `FIRE-Dashboard.html` and mirrored in the Translation Catalog.
Dynamic "show-your-work" step strings use the `t(key, ...args)` placeholder pattern so they
flip with the language toggle. Financial acronyms (LTCG, IRMAA, NIIT, MFJ, Roth) stay English
per the Principle-VII exemption list; surrounding prose translates. User-facing copy uses
"dollars / gains / tax owed" — never "real $" (FR-022).

**Rationale:** Constitution VII is a non-negotiable merge gate; RR has the live language toggle.

**Note:** Generic gets only the `<script>` tag + divergence comment — no new translatable
strings there, so no Generic TRANSLATIONS churn.
