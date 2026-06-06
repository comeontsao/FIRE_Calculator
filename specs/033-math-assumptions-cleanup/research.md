# Research: Math-Assumptions Cleanup (033)

**Date**: 2026-06-05 · **Input**: spec.md (clarifications Q1=0.0%, Q2=Fisher in scope)

All inventories below were generated against the post-032-merge tree
(`32846c0` + spec commit) on 2026-06-05. Line numbers are anchors, not
contracts — re-grep at implement time.

## R1 — Cash-growth site inventory (US1)

Pattern: `1\.005|0\.005` filtered to genuine cash-growth semantics.

**Genuine code sites (consume `CASH_REAL_RETURN`):**

| Surface | Sites | Form |
|---|---|---|
| FIRE-Dashboard.html | 9088, 9385, 9493, 10117*, 10990, 11065, 12285, 12824, 12932 | `pCash *= 1.005` / `portfolioCash *= 1.005`; *10117 is the scaled partial-year form `pCash *= (1 + 0.005 * scale)` |
| FIRE-Dashboard-Generic.html | 9402, 9673, 9783, 10395*, 11252, 11325, 12572, 13119, 13228 | mirrors RR 1:1 |
| calc/accumulateToFire.js | 782 (code), 95 + 779-781 (contract/comment text) | `pCash *= 1.005;` with the **frame-mislabeled** comment "0.5%/yr nominal (FR-016 — hardcoded, locked)" |
| calc/getCanonicalInputs.js | 239 (code), 25 + 238 (comments) | `const returnRateCashReal = 0.005;` — the canonical-inputs mirror MUST consume the same constant or Node-side tests drift from the browser |

**Comment-only references to update in the same sweep:** RR 9190, Generic 9494
("compounded at 1.005"), accumulateToFire 95/779-781, getCanonicalInputs 25/238.

**False positives (DO NOT touch):** CSS `letter-spacing: 0.005em` (RR 1503/1552/1726
+ Generic equivalents), `isTie … < 0.005` (RR 16310), `SAFE_TIE_FRACTION = 0.005`
and spread thresholds in calc/payoffVsInvest.js (109, 1115-1116, 1138), scenario
constants (RR 5198).

## R2 — Fisher-relation site inventory (US3)

Pattern: `- inp\.inflationRate` / `- inflationRate`.

| Surface | Count | Sites |
|---|---|---|
| FIRE-Dashboard.html | 28 | 8890, 9045-9046, 9157-9159, 9327†, 9943-9945, 10016†, 10185, 10371, 10375, 10401-10402, 10417†, 10525-10526, 10805†, 12087-12088, 12206†, 12680-12681, 12741†, 12916-12917, 14098, 17755 |
| FIRE-Dashboard-Generic.html | 28 | mirrors RR 1:1 (9204 … 17969) |
| calc/accumulateToFire.js | 3 | 427, 429 (`realReturnStocks` / `realReturn401k`), 665 (income growth `1 + raiseRate - inflationRate`) |
| calc/getCanonicalInputs.js | 1 | 237 (`returnRateReal = returnNominal - inflationRate`) |

† = SS-COLA form `((ssCOLARate ?? inflationRate) - inflationRate)` →
`realRate(ssCOLARate ?? inflationRate, inflationRate)`. When COLA defaults to
inflation the result is exactly 0 in both forms — byte-identical behavior on
defaults (spec US3 scenario 2).

**Comment-only:** calc/displayConverter.js:52, calc/payoffVsInvest.js:169 — update
wording, no code change. `// FRAME:` annotations that literally say
"(nominal − inflation)" (e.g., RR 9156-area, accumulateToFire 428) must be
re-worded to "(Fisher: (1+nominal)/(1+inflation)−1)"; check
`tests/meta/frame-coverage.test.js` regexes for pinned wording.

## Decisions

### D1 — Single defining location: new `calc/assumptions.js`

**Decision**: new UMD classic-script module, loaded as the FIRST calc script tag
(before `calcAudit.js`) in BOTH HTML head blocks. Exports
`CASH_REAL_RETURN` (number) and `realRate(nominal, inflation)` (pure function)
via `globalThis` + CommonJS. Top-level lexical names unique per the 2026-06-05
global-scope lesson: `_assumptionsApi` for the export const; the public globals
are `CASH_REAL_RETURN` and `realRate`. The existing
`tests/unit/globalScopeCollision.test.js` automatically guards the new file
(it scans every `<script src="calc/...">`).

**Rationale**: both HTML inline simulators AND Node-tested calc modules
(`accumulateToFire`, `getCanonicalInputs`) must consume one source. Script-tag
order makes eval-time capture safe for the inline sims; calc modules use
`require('./assumptions.js')`-or-`globalThis` resolution (require resolves
immediately under Node; under the browser the script-tag order guarantees the
global exists — same pattern as `_taxBrackets` in accumulateToFire, which loads
after its dependency, NOT the failed `_applyCashSweep` pattern, which loaded
before).

**Alternatives rejected**: constant inside accumulateToFire.js (inverts the
dependency for getCanonicalInputs; makes an unrelated module the registry);
constant inline in each HTML (breaks Node tests + lockstep).

### D2 — Default value 0.0 + FR-016 (feature 030) supersession

**Decision**: `CASH_REAL_RETURN = 0.0` (clarification Q1). The feature-030
contract note "pCash grows at 0.5%/yr nominal (FR-016 — hardcoded, locked)" is
formally superseded by `contracts/assumptions.contract.md`; the mislabeled
"nominal" comment is corrected (the multiplier applies in the today's-dollars
frame — it was always a purchasing-power gain). A supersession note is appended
to `specs/030-cash-sweep-stocks/` documentation rather than rewriting history.

**Rationale**: user-confirmed; excess cash is handled by the (now actually
functional) opt-in cash-sweep, so the remaining cash pool holding constant
purchasing power is the honest model.

### D3 — Funding ladder semantics + sibling fields (US2)

**Decision** (per-accumulation-year, override OFF):

```
residual = grossIncome − federalTax − ficaTax − annualSpending
           − pretax401kEmployee − stockContribution(planned)
if residual ≥ 0:
    cashFlowToCash = residual; actual = planned; no flags          (unchanged)
else:
    need               = −residual
    stockContributionActual = max(0, planned − need); need −= planned − actual
    fundedFromCash     = min(pCash, need);            need −= fundedFromCash
    fundedFromStocks   = min(pStocks, need);          need −= fundedFromStocks
    unfunded           = need
    cashFlowToCash     = 0
    cashFlowWarning    = unfunded > 0 ? 'NEGATIVE_RESIDUAL' : 'CONTRIBUTION_REDUCED'
    pCash −= fundedFromCash; pStocks −= fundedFromStocks
```

Row fields: `stockContribution` KEEPS its v2 "planned" semantics (sibling-field
lesson, feature 018); new siblings `stockContributionActual`, `fundedFromCash`,
`fundedFromStocks`. The conservation block sums `stockContributionActual` and
adds back `fundedFromCash + fundedFromStocks`, so per-year residual ≡ `unfunded`
(0 for every funded year — SC-001's ±$1 applies to non-NEGATIVE_RESIDUAL years;
a still-flagged year is genuine infeasibility, surfaced not hidden).
`NEGATIVE_RESIDUAL` keeps its meaning ("money is missing") — the UI callout at
the cash-flow input keys on it unchanged; `CONTRIBUTION_REDUCED` is a NEW
informational flag (bilingual string pair required, Principle VII).

**Alternatives rejected**: deflating contributions as nominal-fixed (review
option a) — contradicts the dashboard's contribution inputs being explicitly
today's-dollars amounts; redefining `stockContribution` in place — violates the
sibling-field lesson and every existing consumer's expectation.

### D4 — Brokerage draw at face value (no LTCG gross-up)

**Decision**: the `fundedFromStocks` rung draws at face value. Documented
simplification.

**Rationale**: the rung only activates after the contribution is cut to $0 AND
cash is empty — a rare, deep-shortfall regime where the plan is near-infeasible
anyway; a LumpSumEvent-style gross-up (feature 018) would inject tax into a
year whose tax was already computed, requiring a second tax pass through the
conservation identity. Revisit if a persona shows material `fundedFromStocks`.

### D5 — Fisher application set

**Decision**: route through `realRate()`: `returnRate`, `return401k`, SS-COLA
adjustment, and the income-raise derivation
(`Math.pow(1 + raiseRate - inflationRate, n)` →
`Math.pow(1 + realRate(raiseRate, inflationRate), n)`). Sites per R2.
displayConverter's Book-Value conversion (`Math.pow(1 + inflationRate, n)`) is
NOT a real-rate derivation and is untouched.

### D6 — Caller audit for row-field/conservation consumers

Known consumers to update (re-grep at implement time per the caller-audit lesson):

| Field | Consumers |
|---|---|
| `stockContribution` | conservation block (RR ~20500-20548 + Generic mirror), audit per-year table renderer (~19350-area), copy-debug `lifecycleProjection.rows` export, `_cashflowUpdateWarning` indirectly |
| `cashFlowToCash` | same conservation block, audit table cash-delta column (~19356), copy-debug rows |
| `cashFlowWarning` | `pviCashflowWarning` callout (RR 16523-16548), audit table ⚠️ (19358-19360), copy-debug rows (20521), `accumulateToFire` v-doc header |

### D7 — Test/fixture impact map (audit BEFORE flipping math)

| Family | Expected impact |
|---|---|
| `tests/fixtures/*.js` (7 files incl. real-nominal-check, three-phase-retirement, coast-fire, infeasible) | absolute expected values shift from BOTH cash-0% and Fisher; update with per-fixture delta notes |
| `tests/unit/accumulateToFire.test.js` | new funding-ladder cases; conservation ≈ $0 assertions; existing absolute numbers shift |
| `tests/unit/strategyMatrix.test.js` | starvation locus has pCash=0 (cash change inert) but Fisher shifts realReturn-derived draw numbers — verify the `< $100` shortfall closure still holds |
| `tests/unit/spendingFloorPass.test.js`, `modeObjectiveOrthogonality.test.js` | review gates 6-7 — must stay green |
| `tests/unit/calcAudit.test.js` | lifecycleProjection/conservation fixture numbers |
| `tests/meta/frame-coverage.test.js` | FRAME-comment regexes may pin "nominal − inflation" wording |
| `tests/e2e/cash-sweep-toggle.spec.ts` | OFF-case peak ≥ $75K still holds (cash sits at exactly $80K under 0%) |
| `tests/e2e/feature-018-*`, `savings-redirect` | re-run; absolute thresholds reviewed if red |
| Translation catalog + TRANSLATIONS dicts | grep for "0.5%" / cash-growth prose in tooltips; update if the assumption is named in copy |

### D8 — FIRE-age delta capture (FR-012)

**Decision**: temp probe `tools/fireage-delta-probe.mjs` (same pattern as
`tools/bug1-repro-probe.mjs`) reads `fireAgeResolution.displayedFireAge` +
signed end balance per FIRE mode (safe/exact/dieWithZero) on RR live defaults.
Run once on the pre-change commit and once post-implementation; both outputs
recorded in CLOSEOUT.md. Baseline (captured 2026-06-05, post-032): FIRE age 50,
winner `aggressive-bracket-fill`, zero non-expected cross-validation warnings.
