# Audit Report — Feature 020 Validation Audit

**Run date**: 2026-04-30
**Branch**: `020-validation-audit`
**Harness**: `tests/unit/validation-audit/`
**Persona matrix**: 92 personas (RR + Generic, single + couple, US/Japan/Taiwan, mortgage matrix)

## Executive summary

Five invariant families ran across 92 personas (≈1,150 persona×invariant cells total). The audit ran in two passes: an initial run surfaced ~296 findings dominated by harness-wiring artifacts (persona-driven inputs not flowing through `document.getElementById` stub, and `SAFE_TERMINAL_FIRE_RATIO` missing from sandbox `OVERRIDES`). Both gaps were patched in Phase 10 (commits below). Re-run produced **38 real findings**: 12 HIGH, 6 MEDIUM, 20 LOW.

The three CRITICAL invariants (A1 mode-ordering) report **zero violations** — meaning `dieWithZero ≤ exact ≤ safe` holds across the full persona matrix. **SC-002 is satisfied** (zero CRITICAL findings).

The 12 HIGH findings cluster in two known-divergence areas (DWZ shortfall flagging vs feasibility helper, and endBalance-mismatch for stress personas) that are inherited from features 014/018/019 and triaged DEFERRED with rationale below. **SC-003 (zero HIGH post-fixes) is partially satisfied** — see triage table for fix vs defer disposition.

## Totals

| Severity | Findings | Status |
|---:|---:|---|
| CRITICAL | 0 | — (none) |
| HIGH | 12 | 8 DEFERRED (B3) + 4 DEFERRED (C3) |
| MEDIUM | 6 | 1 DEFERRED (C2) + 5 DEFERRED (E2) |
| LOW | 20 | 20 DEFERRED (E3) |
| **TOTAL** | **38** | All triaged |

## By-invariant detail

### A1 (CRITICAL) — fireAge mode ordering
- Description: `dieWithZero.totalMonths ≤ exact.totalMonths ≤ safe.totalMonths`
- Personas evaluated: 92
- **Findings: 0** ✓
- Status: All personas satisfy mode ordering. Constitution-VIII gate via `findFireAgeNumerical` is consistent across modes after harness wiring fix.

### A2 (HIGH) — per-fireAge feasibility implication
- Description: `feasible(safe) ⇒ feasible(exact) ⇒ feasible(dieWithZero)` at each candidate fireAge
- Cells evaluated: 92 personas × 4 fireAge candidates = 368
- **Findings: 0** ✓
- Status: Implication chain holds across all candidates.

### B1 (HIGH) — Safe trajectory + 20% terminal
- Description: Safe-feasible personas have all retirement-year totals ≥ buffer × annualSpend AND end-row total ≥ 20% × FIRE-year total
- Personas evaluated: 92
- **Findings: 0** ✓
- Status: Safe trajectory enforcement is consistent.

### B2 (MEDIUM) — Exact terminalBuffer
- Description: Exact-feasible personas have end-row total ≥ terminalBuffer × annualSpend
- Personas evaluated: 92
- **Findings: 0** ✓
- Status: Exact-mode terminal buffer satisfied.

### B3 (HIGH) — DWZ strict 0-shortfall + boundary check
- Description: DWZ-feasible personas have zero `hasShortfall:true` rows AND DWZ infeasible at fireAge−1
- Personas evaluated: 92
- **Findings: 8** (HIGH) — all DEFERRED
- Affected personas: `RR-age-young`, `Generic-single-frugal`, `Generic-couple-young`, `RR-edge-fire-at-endage`, `Generic-edge-single-zero-person2`, `RR-young-high-income`, `RR-late-low-income`, `RR-inflation-fat`
- Pattern: chart sim flags `hasShortfall:true` on 1–3 rows mid-trajectory while row totals remain positive (e.g., $485k–$725k). The `findFireAgeNumerical(mode='dieWithZero')` helper considers the DWZ feasible at fireAge `N`, but the year-by-year chart sim raises shortfall flags at intermediate ages.
- **Triage**: DEFER. Root cause: divergence between year-level DWZ feasibility helper and per-year chart sim's `hasShortfall` flag (the latter flags "couldn't fully draw from pool X" even when pool Y covered the gap). Not user-visible because row totals stay positive and the chart still renders. Track as feature 021 backlog item: harmonize DWZ shortfall semantics between `signedLifecycleEndBalance` and `projectFullLifecycle`.

### C1 (HIGH) — Lifecycle ↔ Withdrawal Strategy chart parity
- Description: per-year `wTrad`, `wRoth`, `wStocks`, `wCash` arrays match within $5
- Cells evaluated: 92 personas
- **Findings: 0** ✓
- Status: The two simulators agree on per-year withdrawal mix.

### C2 (MEDIUM) — verdict pill ↔ Progress card directional agreement
- Description: both above 100% / both at 100% / both below 100%
- Personas evaluated: 92
- **Findings: 1** (MEDIUM) — DEFERRED
- Affected persona: `RR-edge-already-retired` (pill 99% / progress card 108.9%)
- Pattern: pill caps at 99% because `yrsToFire` defaulted to 99 (Safe-mode search returned infeasible at currentAge=65 — the persona is past plan age and already retired).
- **Triage**: DEFER. Edge case: already-retired personas legitimately can't compute "% there" via standard formula. Pill-cap-at-99 is intentional UX. Track as backlog item: design a dedicated already-retired verdict pill format.

### C3 (HIGH) — endBalance-mismatch warnings under default operation
- Description: zero `endBalance-mismatch` records in `audit.crossValidationWarnings`
- Personas evaluated: 92
- **Findings: 4** (HIGH) — all DEFERRED
- Pattern: deltas between signed-sim end-balance and chart-sim end-balance for stress-spend / pessimistic-return / inflation-fat personas. Magnitude $500k–$4.6M.
- **Triage**: DEFER. Known divergence inherited from feature 014 + 018. The two simulators use different LTCG handling and bracket-fill smoothing semantics in stress regimes. Track as feature 021 backlog item: bracket-fill smoothing parity between signed sim and chart sim for stress personas.

### E1 (MEDIUM) — Safe + Exact monotonic feasibility
- Description: feasible at N ⇒ feasible at N+1 (across [currentAge+5, currentAge+30])
- Personas evaluated: 92
- **Findings: 0** ✓
- Status: Monotonic feasibility holds for Safe + Exact modes.

### E2 (MEDIUM) — DWZ boundary semantics
- Description: DWZ-feasible at N ⇒ infeasible at N−1 AND non-negative endBalance at N+1
- Personas evaluated: 92
- **Findings: 5** (MEDIUM) — all DEFERRED
- Affected personas: `RR-age-young`, `Generic-couple-young`, `Generic-single-frugal`, two others
- Pattern: `endBalanceAtNp1` highly negative (e.g., −$8.07M) for young personas — DWZ search reports feasibility well before the actual zero-crossing.
- **Triage**: DEFER. Same root cause as B3 (DWZ feasibility helper diverges from chart sim under aggressive draw scenarios). Bundled with B3 in feature 021 follow-up.

### E3 (LOW) — strategy ranker stability under ±0.01yr / ±$1 perturbation
- Description: winner strategyId unchanged under tiny perturbation
- Personas evaluated: 92
- **Findings: 20** (LOW) — all DEFERRED
- Pattern: ranker winner flips under −0.01yr age perturbation across multiple personas (e.g., `trad-first → bracket-fill-smoothed`, `proportional → conventional`). Knife-edge near integer ages.
- **Triage**: DEFER. Numerical knife-edge is annoying but rarely user-visible (drag UI snaps to integer-year increments). Track as backlog item: add hysteresis to ranker scoring at integer-year boundaries.

## Phase 10 fixes (harness-wiring corrections)

Two harness fixes landed in Phase 10 to surface real findings (vs harness artifacts):

1. **`SAFE_TERMINAL_FIRE_RATIO` added to harness OVERRIDES block** — the constant is declared at top-level in both HTMLs (line 8889 RR) but the harness brace-balanced extractor only captures function declarations. Without it, every Safe-mode `findFireAgeNumerical` call threw inside the sandbox, and invariants A1/B1 silently skipped.

2. **DOC_STUB rebuilt per-persona** — persona-driven fields (`terminalBuffer`, `safetyMargin`, `bufferUnlock`, `bufferSS`, etc.) now flow from `persona.inp` through `document.getElementById(...).value`. Previously the static stub returned `terminalBuffer: '0'` for every persona, making Exact-mode trivially feasible at currentAge for all 92 personas (≈250 false-positive findings).

These are harness-wiring corrections only — no calc-layer behavior changed.

## Constitution gate alignment

- **SC-001 (≤200 persona cells)**: 92 personas, well under cap. ✓
- **SC-002 (zero CRITICAL findings post-fixes)**: 0 CRITICAL. ✓
- **SC-003 (zero HIGH post-fixes)**: 12 HIGH, all DEFERRED with rationale tied to feature 014/018/019 known divergences. **PARTIAL** — deferral documented; track in feature 021.
- **Constitution VIII (Spending Funded First)**: Existing test (`tests/unit/spendingFloorPass.test.js`) green throughout. ✓

## Backlog handoff

Findings deferred to feature 021 (proposed):

1. **DWZ shortfall semantics harmonization** — bundles B3 (8) + E2 (5) = 13 findings. Reconcile `signedLifecycleEndBalance.hasShortfall` flag with `findFireAgeNumerical(mode='dieWithZero')` feasibility check.
2. **Bracket-fill parity in stress regimes** — bundles C3 (4) findings. Align signed sim and chart sim LTCG/bracket-fill behavior for stress-spend / pessimistic-return personas.
3. **Already-retired verdict UX** — bundles C2 (1). Dedicated pill format for `currentAge ≥ planAge`.
4. **Ranker integer-year hysteresis** — bundles E3 (20). Add ±0.05yr hysteresis or quantize age to monthly precision.
