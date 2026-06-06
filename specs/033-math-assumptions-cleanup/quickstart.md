# Quickstart: Math-Assumptions Cleanup (Feature 033)

**Feature**: 033-math-assumptions-cleanup
**Merge gate**: executed by the Manager before merging to `main`. Most checks
are automated (post-2026-06-05 smoke tooling); only the visual spot-checks need
a human.

## Prerequisites (automated)

- `npm run test:unit` — all green (682+ pre-feature, plus this feature's new tests).
- `npm run test:e2e` — **full suite** green (163+; full-suite-is-the-gate lesson).
- `node tools/console-probe.mjs <abs>/FIRE-Dashboard.html` and
  `…/FIRE-Dashboard-Generic.html` — `errorCount: 0`, all module-load flags true.
- `node tools/smoke-032.mjs` — 15/15 (KPI numerics, persistence, Generic regression).
- `node tools/bug1-repro-probe.mjs <abs>/FIRE-Dashboard.html` — zero non-expected
  `crossValidationWarnings` in all three FIRE modes.

## Feature-specific checks

### 1. Static guards (automated)

- `tests/unit/mathAssumptions.test.js` green: one defining location for the cash
  assumption; zero hardcoded `×1.005`-class multipliers; zero subtraction-form
  real-rate derivations in simulators (SC-002, FR-003, FR-009).

### 2. Conservation residual (automated + eyeball)

1. Open the RR dashboard (file://), Audit tab → cash-flow conservation block.
2. **Expected:** `residual` ≈ $0 (|aggregate| ≤ $100; was ≈ −$32K pre-feature) —
   SC-001. `unfundedSum` is $0 on RR live defaults.
3. Copy-debug → confirm per-year rows carry `stockContributionActual`,
   `fundedFromCash`, `fundedFromStocks`, and that surplus years show
   `actual === planned` with $0 draws.

### 3. Cash trajectory under the new default (eyeball)

1. Plan → Investment, cash sweep OFF, cash balance $80,000.
2. Lifecycle chart → cash series.
3. **Expected:** the cash series's purchasing-power value holds ≈ flat until
   retirement draws begin (no more +0.5%/yr drift); Book-Value display still
   rises with inflation. No NaN.

### 4. Fisher spot-check (eyeball)

1. Set growth 7%, inflation 4% on the Generic dashboard.
2. Copy-debug → resolved inputs.
3. **Expected:** derived real growth ≈ 2.885% (not 3.0%).

### 5. FIRE-age delta documentation (FR-012 / SC-004)

1. `node tools/fireage-delta-probe.mjs` on the pre-feature commit and on the
   feature head (RR live defaults).
2. **Expected:** CLOSEOUT.md records, per mode (Safe / Exact / DWZ): FIRE age,
   end balance, winner strategy — before and after. Movement direction: later
   FIRE age / lower end balance (both corrections are conservative). Any move
   the OTHER way is a bug.

### 6. Shortfall-year display (eyeball)

1. On Generic, set raises 2.5%, inflation 4%, income just above spending, a
   non-zero stock contribution — engineer at least one late-accumulation
   shortfall year.
2. Audit per-year table.
3. **Expected:** shortfall years show the informational reduced-contribution
   flag (not the red NEGATIVE_RESIDUAL ⚠️) when the ladder funds them; the
   bilingual string renders in both EN and 中文 toggle states.

### 7. Lockstep + i18n (automated + eyeball)

- Lockstep verify: calc-layer edits byte-equivalent between the two HTML files.
- New translation keys present in both files' dicts AND the catalog.

## Acceptance

All automated checks green; eyeball checks match Expected; CLOSEOUT documents
the FIRE-age/end-balance delta per mode. If any step fails: STOP, document, do
not merge.

## Sign-off

| Check | Pass / Fail | Notes |
|---|---|---|
| Unit + static guards | | |
| Full E2E suite | | |
| Console probes (both files) | | |
| Conservation residual ≈ $0 | | |
| Cash trajectory flat @ 0% | | |
| Fisher 2.885% spot-check | | |
| FIRE-age delta documented | | |
| Shortfall-year display + i18n | | |
| Lockstep verify | | |
