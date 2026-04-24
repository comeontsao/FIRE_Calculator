# Implementation Plan: Generic Dashboard — Country Budget Scaling by Household Size

**Branch**: `010-country-budget-scaling` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-country-budget-scaling/spec.md`

## Summary

Scale the Generic dashboard's hardcoded per-country lifestyle budgets (`annualSpend`, `normalSpend`, `comfortableSpend`) by a new **adults-only scaling factor** (OECD-modified: 1.0 / 1.5 ≈ 0.67 for solo, 1.00 for couple) so feature 009's single-person mode is numerically coherent. Children do NOT enter the country-budget factor — instead, they affect post-FIRE spending via two orthogonal overlays:

1. A **per-child allowance schedule** applied to the Full Portfolio Lifecycle chart's post-FIRE spend curve (silent, hardcoded): \$2,000/yr flat for ages 0–12, ramping +\$500 → +\$500 → +\$1,000 → +\$1,000 → +\$1,000 at ages 13–17, capped at \$6,000/yr, terminating the year a child enters college.
2. The **existing per-child college tuition / student-loan logic** (untouched by this feature; already per-child in the codebase).

Additionally:

3. Wire an **Adjust Annual Spend** per-country override input into the Generic deep-dive panel (parity with the RR dashboard). The i18n strings `geo.adjustSpend` / `geo.adjustNote` already exist in `TRANSLATIONS.en` and `TRANSLATIONS.zh` — they are currently orphaned and this feature hooks them to a new `<input type="number">`.
4. Introduce a **two-line scaling indicator** near the country comparison section (Line 1: adults-only factor; Line 2: per-child allowance note when ≥ 1 child is tracked).
5. Enforce **strategy-first precedence**: the scaled country budget + per-child allowance + college tuition defines the annual spend REQUIREMENT; the selected withdrawal strategy (DWZ / SAFE / bracket-fill / low-tax) decides how to FUND it. Scaling never bypasses strategy logic.

**Explicitly Generic-only** (inherits feature 009's Principle-I lockstep exception, justified below under Complexity Tracking). `FIRE-Dashboard.html` (RR) already has its own per-country Adjust Annual Spend input and remains a two-person plan.

**Technical approach**: extend the inline `scenarios` array readers (currently ~line 3739 of `FIRE-Dashboard-Generic.html`) with a `getScaledScenarioSpend(s, tier)` accessor that applies the adults-only factor at render/read time — never mutating the underlying array. Add a pure helper `calcPerChildAllowance(childrenList, year, fireYear)` that sums the age-graded schedule across all pre-college children active in a given year. Thread both into the Full Portfolio Lifecycle chart's spend-curve input BEFORE strategy dispatch. Add a per-country override slot on each scenario (`s.adjustedAnnualSpend`) driven by the new deep-dive `<input>` and respected by the accessor. Ship bilingual strings for the new indicator keys (override input keys already exist).

## Technical Context

**Language/Version**: Vanilla JavaScript (ES2020), inline `<script>` blocks + ES modules in `calc/*.js`. No transpile.
**Primary Dependencies**: Chart.js (CDN, already loaded). No new runtime deps.
**Storage**:
- `localStorage` key `fire_dashboard_generic_state` (inputs). A new per-scenario `adjustedAnnualSpend` map is added under a new sub-key `scenarioOverrides` (documented in `persistence.contract.md`). Backward-compatible: absent sub-key → all overrides = 0 (no override).
- `FIRE-snapshots-generic.csv` — no schema change required (FR-019). The stored `Monthly Spend` column continues to record whatever the dashboard computed at snapshot time.
**Testing**: Node-native `node --test` runner against `tests/unit/*.test.js`. Feature 009 brought the suite to ~90 tests green; feature 010 targets ≥ 8 new tests (SC-011) for adults-only formula, allowance schedule, college-takeover transition, per-country override precedence, strategy-vs-requirement separation, regression anchor (Adults=2 → 1.00), and tier-ratio preservation.
**Target Platform**: Any evergreen browser opening the HTML file directly.
**Project Type**: Zero-build single-file HTML dashboard + sibling ES-module calc library + Node unit tests.
**Performance Goals**: First meaningful chart < 1 s cold. Adults counter or children-list change recomputes in one `recalcAll()` call with no perceptible lag (scaling factor + per-child allowance sum across tracked children is O(N_kids × N_years) — both small constants).
**Constraints**:
- Principle I (lockstep) is explicitly scoped out per spec FR-021 — Generic-only. Justified under Complexity Tracking (same rationale as feature 009).
- Principle II (pure calc modules): the scaling accessor and allowance helper MUST be pure (no DOM, no Chart.js, no localStorage inside function bodies). The deep-dive input's `onchange` handler writes to state and calls `recalcAll()`; it does NOT directly touch the pure accessors.
- Principle IV: new gold-standard fixtures required for (a) adults-only factor branch table, (b) age-graded allowance schedule for ages 0–17 inclusive, (c) college-takeover transition (allowance → tuition at year of college entry), (d) per-country override precedence, (e) Adults=2 regression anchor (factor == 1.00), (f) strategy-vs-requirement separation (swap strategies → requirement unchanged).
- Principle VI (chart ↔ module contracts): the Full Portfolio Lifecycle chart's render comment gains a Consumers line naming the new `getScaledScenarioSpend` and `calcPerChildAllowance` helpers. The Country Comparison cards' render site updates similarly. Each listed in `contracts/calc-functions.contract.md`.
- Principle VII (bilingual NON-NEGOTIABLE): the new two-line scaling indicator and its tooltip add ~4 new i18n keys × 2 languages = ~8 catalog entries. The Adjust Annual Spend input reuses pre-existing `geo.adjustSpend` / `geo.adjustNote` (no new keys for those).
- No snapshot CSV schema change (FR-019).
**Scale/Scope**: ~200–300 LoC touched in `FIRE-Dashboard-Generic.html` (scaling accessor, allowance helper, indicator HTML block, deep-dive input render, override persistence wiring, ~5 consumer updates at read sites). ~1 new pure module or inline fenced block with contract header for `calcPerChildAllowance`. ~4 new i18n keys × 2 languages = 8 catalog entries. ~8 new unit test cases across 2–3 test files. `FIRE-Dashboard.html` (RR): UNTOUCHED.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Dual-Dashboard Lockstep (NON-NEGOTIABLE) | Both HTML files ship the feature in lockstep OR divergence is explicitly justified. | **Violated (justified).** Feature is Generic-only per spec FR-021 and inherits feature 009's lockstep exception. RR already has a per-country Adjust Annual Spend input; this feature brings Generic to parity, not the other way around. See Complexity Tracking row 1. |
| II | Pure Calculation Modules with Declared Contracts | Every touched calc helper keeps its fenced `Inputs/Outputs/Consumers` header truthful; no new DOM/Chart.js calls inside pure functions. | **Pass.** The two new pure helpers (`getScaledScenarioSpend`, `calcPerChildAllowance`) are declared in `contracts/calc-functions.contract.md` with Inputs/Outputs/Consumers headers. Neither reads DOM nor globals; both take all inputs as parameters. The existing `scenarios` array is READ but not mutated by the scaling accessor. |
| III | Single Source of Truth for Interactive State | One resolver per shared state field; no competing re-derivations. | **Pass.** The adults-only factor is computed once in `getAdultsOnlyFactor(inp.adultCount)` and consumed uniformly by every scenario read site. The per-country override is stored in a single `scenarioOverrides[s.id]` map and read via the accessor only. The per-child allowance is computed once per year via `calcPerChildAllowance(childrenList, projectionYear, fireYear)` and consumed by the Lifecycle chart's spend-curve input. |
| IV | Gold-Standard Regression Coverage (NON-NEGOTIABLE) | New branches get locked fixtures; test count stays green and grows. | **Pass.** Phase 1 contracts enumerate the six new fixture classes (formula, allowance schedule, college-takeover, override precedence, Adults=2 regression anchor, strategy-vs-requirement separation). SC-011 targets ≥ 8 new unit tests. Existing feature 009 suite (~90 tests) must stay green. |
| V | Zero-Build, Zero-Dependency Delivery | No bundler, no new npm deps, no framework runtime. | **Pass.** All UI is vanilla HTML (`<input type="number">`) + `onchange` handlers. Indicator is a plain `<div>` with two `<span data-i18n="…">` children. No CDN additions. |
| VI | Explicit Chart ↔ Module Contracts | Every chart touching changed calc outputs updates its render-site comment; module `Consumers:` list stays accurate. | **Pass.** `contracts/chart-consumers.contract.md` enumerates every renderer that reads scenario spend (country comparison cards, deep-dive panel, Full Portfolio Lifecycle, Portfolio Drawdown (With/Without SS), Strategy Compare, any strategy-ranking helper). Each render site's comment gains a line naming `getScaledScenarioSpend` and (where applicable) `calcPerChildAllowance`. The new pure helpers' headers list those charts in `Consumers:`. |
| VII | Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE) | Every new visible string has both translations in the same commit and is referenced in `FIRE-Dashboard Translation Catalog.md`. | **Pass.** Four new keys for the two-line scaling indicator and tooltip (`geo.scale.line1`, `geo.scale.line2`, `geo.scale.tooltip`, `geo.scale.childrenTracked`) are enumerated in `contracts/i18n.contract.md` with EN + zh-TW translations in the same commit. The Adjust Annual Spend input reuses the already-present `geo.adjustSpend` / `geo.adjustNote` keys (no new keys; just wire unused strings). |

**Overall Gate: PASS with one justified lockstep exception (Principle I), identical rationale to feature 009.**

## Project Structure

### Documentation (this feature)

```text
specs/010-country-budget-scaling/
├── plan.md                       # This file (/speckit-plan command output)
├── spec.md                       # Feature specification (already present)
├── research.md                   # Phase 0 output — formula choice, allowance rationale, override pattern
├── data-model.md                 # Phase 1 output — entities, state shape, override storage
├── quickstart.md                 # Phase 1 output — manual end-to-end verification steps
├── contracts/                    # Phase 1 output — interface contracts
│   ├── scaling-formula.contract.md          # getAdultsOnlyFactor + getScaledScenarioSpend
│   ├── child-allowance.contract.md          # calcPerChildAllowance + age-graded schedule
│   ├── adjust-annual-spend.contract.md      # Per-country override input + state key
│   ├── chart-consumers.contract.md          # Every chart/renderer that reads scenario spend
│   ├── i18n.contract.md                     # New translation keys (EN + zh-TW)
│   └── persistence.contract.md              # localStorage scenarioOverrides map schema
├── checklists/
│   └── requirements.md           # Already present from /speckit-specify
└── tasks.md                      # Phase 2 output — /speckit-tasks creates this, NOT /speckit-plan
```

### Source Code (repository root — affected paths only)

```text
FIRE_Calculator/
├── FIRE-Dashboard-Generic.html          # TOUCHED. New pure helpers, indicator HTML, deep-dive input,
│                                         # override persistence, consumer updates at every scenario-spend
│                                         # read site, updated chart-render comments.
├── FIRE-Dashboard.html                  # UNTOUCHED by design (FR-021, Principle I exception inherited
│                                         # from feature 009; RR already has its own Adjust Annual Spend).
├── FIRE-Dashboard Translation Catalog.md  # TOUCHED. 4 new indicator keys × 2 languages = 8 entries.
├── FIRE-Dashboard-Roadmap.md            # TOUCHED. Feature 010 row added under the active-features block.
├── calc/
│   └── (no new files required)          # Helpers live as fenced inline <script> blocks in Generic HTML,
│                                         # per the existing transitional extraction convention. Migration
│                                         # to calc/scaling.js + calc/childAllowance.js is a follow-up.
├── tests/
│   ├── fixtures/
│   │   └── country-budget-scaling.js    # NEW. Gold-standard fixtures for the 6 new fixture classes.
│   └── unit/
│       ├── adultsOnlyFactor.test.js     # NEW. Formula branch table (solo 0.67, couple 1.00) +
│       │                                 # Adults=2 regression anchor.
│       ├── perChildAllowance.test.js    # NEW. Age-graded schedule ages 0–17 + college-takeover
│       │                                 # transition + N-children summation.
│       └── scenarioOverride.test.js     # NEW. Per-country override precedence + clear/reset behavior
│                                         # + factor-does-not-multiply-override rule.
└── FIRE-snapshots-generic.csv           # UNTOUCHED SCHEMA (FR-019). Stored values reflect whatever
                                          # the dashboard computed at snapshot time.
```

**Structure Decision**: Extend the existing "single-file HTML + calc/ ES modules + tests/" layout. No new top-level directories. The two new pure helpers live as fenced inline `<script>` blocks in `FIRE-Dashboard-Generic.html` with full Inputs/Outputs/Consumers contract headers (Principle II transitional pattern). The Adjust Annual Spend input is a `<input type="number">` inside the existing deep-dive `scenarioInsight` panel (around line 10310 per current file). The indicator sits in its own `<div>` immediately above the country-comparison grid. Unit tests import the helpers directly via a thin Node shim (same convention as feature 009's `socialSecurity.test.js`).

## Phase 0 — Outline & Research

See [research.md](./research.md). Consolidated decisions (all resolved via `/speckit-clarify`):

1. **Scaling formula**: OECD-modified adults-only (1.0 + 0.5 × extra adults). Rationale: internationally recognized standard, matches published adult-cost equivalence studies, yields clean 0.67× solo factor. Alternatives (square-root scale, flat 0.70, linear shared-overhead) considered and rejected in research.md.
2. **Baseline anchor**: 2-adult couple. Hardcoded country defaults (US \$78K, Taiwan \$36K, …) re-interpreted as the couple baseline. Zero-regression guarantee for any Adults=2 user (FR-002).
3. **Per-child allowance schedule**: hardcoded per FR-005b. Rationale: captured from user domain knowledge (typical pre-college-kid costs when retirement income comes from portfolio rather than paycheck); ages 0–12 flat reflects early-childhood economies of scale; age 13+ ramp reflects teen costs; \$6K cap reflects diminishing incremental returns before college takes over.
4. **College-takeover rule**: allowance terminates the year a child's existing college-plan data says college starts. Rationale: the dashboard already has per-child college logic (`childrenList[i].college` and derived college-start year); reusing that date avoids a separate termination control.
5. **Per-country override semantics**: when non-zero, `adjustedAnnualSpend` wins; the adults-only factor does not multiply into it. Rationale: parity with RR behavior; matches feature 007's `data-user-edited='1'` pattern for respecting manual edits.
6. **Strategy-vs-requirement separation**: spend REQUIREMENT feeds into strategy; strategy determines DRAWDOWN. Rationale: preserves the withdrawal-strategy architecture from features 007–008 which the user has explicitly invested in (DWZ / SAFE / bracket-fill / low-tax).

**Output**: research.md consolidating these decisions with cited alternatives.

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md) for entity/state shape, [contracts/](./contracts/) for interface specs, [quickstart.md](./quickstart.md) for manual verification.

**Contracts produced** (one file each under `contracts/`):

- `scaling-formula.contract.md` — `getAdultsOnlyFactor(adultCount) → number` and `getScaledScenarioSpend(scenario, tier, adultCount, overrides) → number`. Signatures, pre/post-conditions, the regression anchor, tier-ratio preservation invariant.
- `child-allowance.contract.md` — `calcPerChildAllowance(childrenList, projectionYear, fireYear) → number`. Age-graded schedule table, college-takeover rule, pre-FIRE zero-output rule.
- `adjust-annual-spend.contract.md` — Deep-dive input DOM contract (id pattern `adjust_<scenarioId>`), `onchange` handler name, state key, reset semantics, i18n key reuse.
- `chart-consumers.contract.md` — Enumeration of every renderer that reads scenario spend (country comparison cards, deep-dive panel, Full Portfolio Lifecycle, Portfolio Drawdown With/Without SS, Strategy Compare, any strategy-ranking helper). Each entry lists the pure helpers it now consumes.
- `i18n.contract.md` — Four new keys (`geo.scale.line1`, `geo.scale.line2`, `geo.scale.tooltip`, `geo.scale.childrenTracked`) with full EN + zh-TW translations. Reuse of pre-existing `geo.adjustSpend` / `geo.adjustNote` documented explicitly.
- `persistence.contract.md` — `scenarioOverrides` sub-key under `fire_dashboard_generic_state`: `{ [scenarioId: string]: number }`. Missing key or value ≤ 0 treated as no-override. Migration: none (additive).

**Agent context update**: `CLAUDE.md` gets its active-feature pointer updated to reference this plan. The existing feature-009 block under `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` flips to point at `specs/010-country-budget-scaling/plan.md`.

**Post-design Constitution re-check**: every principle listed above remains PASS (no new violations surfaced by the contracts). Principle I lockstep exception remains the sole justified violation, identical rationale.

## Complexity Tracking

> Principle I (Dual-Dashboard Lockstep) is violated by design, inherited from feature 009. Documented here with the same simpler-alternative analysis.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **Principle I lockstep exception — feature ships to `FIRE-Dashboard-Generic.html` only** | The RR dashboard is a deliberately two-person plan for Roger & Rebecca, and it already has its own per-country Adjust Annual Spend input. Feature 010 brings the Generic dashboard to PARITY with capabilities RR already has; it is a one-directional catch-up. Adding the adults-only scaling factor to RR would create an `adultCount=1` code path in RR that carries zero personal meaning (Roger and Rebecca are a couple) and invites drift between "what RR actually models" and "what the Adults counter claims." | **Alt A — mirror the adults-only factor into RR, hardcoded to 2.** Rejected: adds complexity to RR for no user-visible capability; forces every RR scenario-spend read site to also accept the factor argument and prove it's always 1.00; duplicates test surface. **Alt B — promote RR to support Adults=1.** Rejected as out-of-scope; RR's whole purpose is the couple plan (see feature 009 spec's FR-029 and this spec's FR-021). **Alt C — mirror only the per-child allowance into RR.** Rejected: RR's children are the real Janet and Ian, whose costs are already modeled explicitly in RR's personal-content cells; overlaying a generic allowance schedule on top would double-count. Lockstep exemption for the whole feature is the smallest-blast-radius choice. |

---

**Ready for**: `/speckit-tasks` — generate the dependency-ordered task list that turns this plan into concrete commits.
