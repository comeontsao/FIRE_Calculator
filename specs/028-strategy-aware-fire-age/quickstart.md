# Quickstart — Reproduce + Verify

**Feature**: 028-strategy-aware-fire-age
**Date**: 2026-05-08

## Reproducer

The user-supplied debug dump (2026-05-08T14:37:49Z) captures the exact failure state. Reproducing without the dump:

1. Open `FIRE-Dashboard.html` in a browser.
2. Reset to defaults (or load a snapshot with the inputs below).
3. Set inputs:
   - Roger age = 42, Rebecca age = 42
   - Annual income = $152,000
   - Roger 401K Trad = $27,659
   - Roger 401K Roth = $64,737
   - Roger Stocks = $235,000
   - Rebecca Stocks = $230,000
   - Cash = $80,000
   - Annual spend (Japan scenario, geo-arbitrage) ≈ $73,400
   - Inflation = 4 %, Return = 7 %, SS COLA = 3 %
   - End age = 100
   - IRMAA threshold = $212,000
4. **Click `💀 Die W/ Zero`** in the gate selector.
5. **Click `📦 Leave more behind`** as the withdraw strategy objective.
6. Wait for the lifecycle chart to settle.

## Pre-fix state (BUG — what we're fixing)

You will see:

- **Header pill (green):** "🔥 On Track — FIRE in 11 years 6 months (age 53) · 42.4% there"
- **Chart:** Lifecycle clearly drains to $0 around age 93, with a red-shaded infeasibility zone from age 93 to 100.
- **Audit panel:** `crossValidationWarnings` contains an `endBalance-mismatch` entry citing `signedLifecycleEndBalance is bracket-fill-only — active strategy is aggressive-bracket-fill`.
- **Strategy ranking row:** winner is `aggressive-bracket-fill`.
- **Click Mode = `⚡ Exact`:** FIRE Number changes ($2,316,157 → $2,536,520) but the FIRE age stays at 53 (11Y 6M). Both modes show the same age.

This is the misleading state — pill green, chart red.

## Post-fix state (after this feature lands)

After `/speckit-implement` ships the full feature:

- **Header pill (red/orange):** Reflects the chart's actual state. Expected text: "Long timeline — FIRE in N years…" or "Behind — Short by $229,755" (depending on whether ANY age is feasible under DWZ + aggressive-bracket-fill, which the user's reproducer says no).
- **Chart:** Unchanged — same red zone, same trajectory.
- **Audit panel:** `crossValidationWarnings` for `endBalance-mismatch` is empty. The chart sim and the signed sim now agree because both run the same strategy.
- **Click Mode = `⚡ Exact`:** FIRE age MAY differ from DWZ now (likely also infeasible at age 53 because Exact requires a higher buffer than DWZ; the resolver continues searching higher ages or returns infeasible).

## Verification commands

After the implementation lands, run from repo root:

```powershell
# Unit tests — must show 493 + new tests, all passing
npm run test:unit

# Specific strategy-aware tests — must show all green
node --test tests/unit/signedSimStrategyOptions.test.js
node --test tests/unit/fireAgeResolverStrategyAware.test.js

# E2E test — driver for the SC-027 reproducer
npx playwright test tests/e2e/strategy-aware-pill.spec.ts

# Manual browser smoke (per CLAUDE.md "Browser smoke before claiming done")
# 1. Open FIRE-Dashboard.html, reproduce setup above
# 2. Confirm pill is NOT green "On Track"
# 3. Confirm chart shows the red zone (unchanged)
# 4. Toggle Mode = Safe → Exact → DWZ; confirm pill text differs across at
#    least two modes (proves Mode selectivity is restored)
# 5. Repeat steps 1–4 for FIRE-Dashboard-Generic.html
```

## What success looks like (mapped to spec.md SC-028-A through F)

- **SC-028-A**: Pill flipped from "On Track" to infeasible state on the SC-027 reproducer. Visual.
- **SC-028-B**: Audit dump's `crossValidationWarnings` is empty for the reproducer. Inspect via Copy Debug button.
- **SC-028-C**: Mode = Safe vs Exact vs DWZ produces at least two different FIRE-age outcomes for the reproducer. Visual + audit dump.
- **SC-028-D**: All 8 registered strategies have at least one resolver test pinning their per-mode verdict. Test corpus inspection.
- **SC-028-E**: `npm run test:unit` shows 493 + new = ≥ 500 passing, 0 failing.
- **SC-028-F**: `git diff FIRE-Dashboard.html FIRE-Dashboard-Generic.html` for the changed regions shows zero non-divergent differences (modulo the `ageRoger` vs `agePerson1` and other documented RR-personal divergences).

## Rollback

If the implementation lands and SC-028-A through F do not all pass:

1. The feature branch `028-strategy-aware-fire-age` is independent of main.
2. The stop-gap (FR-007 to FR-009) ships first within the branch and is independently verifiable — confirm it alone closes SC-028-A even without the root-cause fix.
3. If the root-cause fix (FR-001 to FR-006) regresses anything, revert just those commits; the stop-gap remains and SC-028-A still passes.
4. Worst-case: revert the entire branch; the bug returns to its pre-feature-028 state, which is the user's current observed state.
