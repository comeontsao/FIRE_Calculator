# Phase 0 Research — Feature 021

**Date**: 2026-05-01
**Feature**: Tax expense category + audit-harness carry-forward

This document consolidates external references the implementation depends on. All NEEDS CLARIFICATION markers from the spec are resolved (5 clarifications were captured in `spec.md` § Clarifications). The five entries below are *technology / data references*, not open design questions.

---

## R1 — IRS 2024 Federal Income Tax Brackets

**Decision**: Use the published IRS 2024 brackets and standard deduction for MFJ + single filing statuses.

**Brackets (Married Filing Jointly, 2024)**:

| Rate | Taxable income range |
|---:|---|
| 10% | $0 – $23,200 |
| 12% | $23,200 – $94,300 |
| 22% | $94,300 – $201,050 |
| 24% | $201,050 – $383,900 |
| 32% | $383,900 – $487,450 |
| 35% | $487,450 – $731,200 |
| 37% | $731,200+ |

**Brackets (Single, 2024)**:

| Rate | Taxable income range |
|---:|---|
| 10% | $0 – $11,600 |
| 12% | $11,600 – $47,150 |
| 22% | $47,150 – $100,525 |
| 24% | $100,525 – $191,950 |
| 32% | $191,950 – $243,725 |
| 35% | $243,725 – $609,350 |
| 37% | $609,350+ |

**Standard deduction (2024)**:
- MFJ: $29,200
- Single: $14,600

**Sources**: IRS Revenue Procedure 2023-34 (released November 2023; sets 2024 inflation-adjusted amounts). IRS Publication 17 — Tax Guide 2024. IRS Topic No. 501 (standard deduction).

**Rationale**: The dashboard already uses partial 2024 bracket data (`twStdDed`, `twTop12`, `twTop22`) inside `taxOptimizedWithdrawal` for retirement-phase math. Aligning the accumulation-phase calc with the same year's tables produces internally consistent numbers and matches what users will see on their actual W-2 / 1040.

**Alternatives considered**:
- **2023 brackets**: Out of date for 2026-relevant planning.
- **2025 brackets** (released Oct 2024): Available but not yet stable in published references — defer to a future feature 022/023 cross-year migration when 2025 numbers are well-documented.
- **Inflation-adjusting brackets year-over-year inside the calc**: Out of scope; current dashboard treats numbers as 2024-real throughout the lifecycle.

---

## R2 — SSA 2024 Wage Base + FICA Rates

**Decision**: Use SSA 2024 published rates for FICA computation.

**FICA components**:

| Component | Rate | Wage base (2024) | Threshold |
|---|---:|---|---|
| Social Security (employee) | 6.2% | $168,600 (per individual) | n/a |
| Medicare (employee) | 1.45% | No cap | n/a |
| Additional Medicare | 0.9% | No cap | $200,000 single / $250,000 MFJ |

**Notes**:
- Self-employment FICA is double (~15.3%) but the dashboard currently models employed users; SE-tax modeling is out of scope.
- Employer match for FICA is a hidden cost (employers also pay 6.2% + 1.45%) but does not appear on the user's paycheck. Out of scope for the displayed Income tax row.
- The SS wage base cap applies **per individual** in MFJ scenarios. Spec assumption A1a documents the equal-income-split simplification for couples; per-person split is deferred to feature 022.

**Sources**: SSA Press Release "Social Security Announces 6.5 Percent Cost-of-Living Increase for 2024" (October 2023). IRS Topic No. 751 (Social Security and Medicare withholding rates). IRS Form 8959 instructions (Additional Medicare Tax).

**Rationale**: FICA is the largest "invisible" tax for most W-2 earners — for a $150k MFJ household it's ~$11.5k/yr (vs ~$12.3k federal income tax) — and per the user's clarification (Q1: B), users want the displayed Income tax to match their paycheck mental model.

**Alternatives considered**:
- **Federal income tax only (Q1 Option A)**: Rejected per user; understates the W-2 tax bite.
- **Three separate sub-rows (Q1 Option C)**: Rejected as adding visual clutter; single combined Income tax row + per-component breakdown in the audit dump (FR-016a) gives transparency where it matters.

---

## R3 — Auto-Toggle UX Pattern

**Decision**: Use the **visible-but-disabled** affordance for the existing `taxRate` slider when the new "Auto" toggle is ON (per Q3 Option B).

**Pattern reference**: The dashboard's existing `pviEffRateOverrideEnabled` checkbox (Investment tab, near the Payoff vs Invest section) follows the same pattern: when the override checkbox is OFF, the underlying slider is grayed out and shows the auto-computed value as a label. This is a well-established convention in the codebase.

**Default Auto state per spec FR-015**:
- New users (or users with `taxRate` blank/0): Auto = ON, slider grayed out, shows e.g. "Auto: 15.8%".
- Existing users with a non-zero saved `taxRate`: Auto = OFF, slider active at saved value (no migration popup; preserves user mental model).

**localStorage key**: `taxRateAutoMode` (boolean). Persisted alongside `taxRate` so a user toggling Auto ON → typing a value with Auto OFF → toggling Auto ON again still remembers their typed value when they go OFF a third time.

**Sources**: Existing dashboard pattern (`pviEffRateOverrideEnabled` and similar override toggles for `pviCashflowOverrideEnabled` from feature 020). Material Design — Disabled controls. Apple HIG — Disabled appearance.

**Rationale**: Reusing the project's own established pattern beats inventing new UX. Users who learned the override-toggle pattern from feature 016 / 020 will recognize this immediately.

**Alternatives considered**:
- **Hide slider entirely (Q3 Option A)**: User briefly chose this then reverted to B, confirming the visible-but-disabled pattern is the right call.
- **Slider stays fully active, any non-zero overrides Auto silently (Q3 Option C)**: Confusing — when slider value didn't match displayed effective rate, users would file bug reports.

---

## R4 — GitHub Actions Audit-Comment Pattern

**Decision**: Use a minimal `node:test` runner step + `gh pr comment` to post finding counts. No `actions/github-script` JS-eval heaviness.

**Workflow shape** (`.github/workflows/audit.yml`):

```yaml
name: Validation Audit
on: [pull_request, push]
jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Run audit harness
        id: audit
        run: |
          # capture findings counts from harness output
          node --test tests/unit/validation-audit/ > audit-output.txt 2>&1 || true
          CRITICAL=$(grep -oP 'CRITICAL=\K\d+' audit-output.txt | head -1)
          HIGH=$(grep -oP 'HIGH=\K\d+' audit-output.txt | head -1)
          MEDIUM=$(grep -oP 'MEDIUM=\K\d+' audit-output.txt | head -1)
          LOW=$(grep -oP 'LOW=\K\d+' audit-output.txt | head -1)
          echo "critical=$CRITICAL" >> "$GITHUB_OUTPUT"
          echo "high=$HIGH" >> "$GITHUB_OUTPUT"
          echo "medium=$MEDIUM" >> "$GITHUB_OUTPUT"
          echo "low=$LOW" >> "$GITHUB_OUTPUT"
      - name: Post PR comment
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ github.event.pull_request.number }} --body "Audit results: CRITICAL=${{ steps.audit.outputs.critical }} HIGH=${{ steps.audit.outputs.high }} MEDIUM=${{ steps.audit.outputs.medium }} LOW=${{ steps.audit.outputs.low }}"
      - name: Fail on CRITICAL
        run: |
          if [ "${{ steps.audit.outputs.critical }}" -gt 0 ]; then exit 1; fi
```

**Key design choices**:
- Zero-dep: only `gh` CLI (preinstalled on `ubuntu-latest`) and `node:test` (built-in). No npm install. Constitution Principle V preserved.
- 10-minute timeout: matches spec SC-008 (workflow posts comment within 10 min).
- Finding counts captured via grep on the existing harness output format (`# [harness] N cells, M passed, K failed (CRITICAL=A HIGH=B MEDIUM=C LOW=D)`).
- CRITICAL findings fail the build (exit 1); HIGH only warn.

**Sources**: GitHub Actions docs (jobs.<job_id>.timeout-minutes, $GITHUB_OUTPUT). `gh pr comment` CLI reference. Existing project workflow `.github/workflows/tests.yml` pattern.

**Rationale**: Stays consistent with the existing CI pattern (`tests.yml` is also zero-dep, uses `node:test`). Adding `actions/github-script` would introduce a dependency on a marketplace action and pull JS evaluation into CI — not justified for this simple use case.

**Alternatives considered**:
- **`actions/github-script` for richer comment formatting**: Overkill; plain bash + `gh` is sufficient.
- **Separate workflow per audit invariant family**: Too granular; one workflow that runs all 5 families is sufficient and matches the spec.
- **Run audit on `push` only, not `pull_request`**: Misses the PR-comment use case (SC-008).

---

## R5 — Strategy-Ranker Hysteresis Threshold

**Decision**: ±0.05 years equivalent score margin for hysteresis, per spec FR-018.

**Empirical justification**: The feature 020 audit (E3 invariant in `tests/unit/validation-audit/drag-invariants.test.js`) cataloged 17 LOW findings where the strategy ranker winner flipped under a 0.01-year age perturbation. Inspecting the audit dump for those personas shows the score deltas between competing strategies cluster within ±0.03 years equivalent. A ±0.05 threshold:

- **Cleanly absorbs** the 0.01-year noise band that drives the audit findings.
- **Preserves real winner changes** where one strategy beats another by 0.5-1.0+ years equivalent (the typical persona delta when a strategy is genuinely better).
- **Maps to a small fraction of a year** that's invisible to users at the integer-year granularity the drag UI exposes.

**Implementation**:

```js
// In strategyRanker.js scoreAndRank
function _newWinnerBeats(prevWinner, newContender, mode, objective) {
  if (!prevWinner) return true;
  const sortKey = getActiveSortKey({ mode, objective });
  const HYSTERESIS_YEARS = 0.05;
  // Convert primary sort key delta to "years-equivalent" using the score's
  // units. For endBalance (units of $), translate via annualSpend per year.
  const deltaInYears = _scoreDeltaToYears(
    sortKey.primary, prevWinner, newContender, /* annualSpend */
  );
  return deltaInYears > HYSTERESIS_YEARS;
}
```

The exact `_scoreDeltaToYears` mapping depends on the active sort key:
- `endBalance` desc: delta = `(newContender.endBalance − prevWinner.endBalance) / annualSpend` (years of spend).
- `cumulativeFederalTax` asc: delta = `(prevWinner.cumulativeFederalTax − newContender.cumulativeFederalTax) / annualFederalTax_avg`.
- `residualArea` desc: delta in normalized residual-area units; map to years via `residualArea / annualSpend / planYears`.

**Sources**: Feature 020 audit findings (`specs/020-validation-audit/audit-report.md` § E3). Standard hysteresis literature (Schmitt trigger thresholds in control systems, generalized to ranking systems).

**Rationale**: A purely score-based threshold would need different units per sort key. Normalizing to "years-equivalent" gives a single tunable knob the user can reason about ("the new strategy must beat the old by more than 18 days of spending to flip the winner").

**Alternatives considered**:
- **Fixed dollar threshold ($1000)**: Doesn't generalize across sort keys; cumulative tax delta of $1000 is meaningful for a 30-year plan, irrelevant for a 60-year plan.
- **Percentage threshold (1% of score)**: Has the inverse problem — close-to-zero scores produce tiny percentage thresholds, allowing flips to slip through.
- **Hysteresis off; just round inputs to integer ages**: Cures the symptom but breaks the audit harness's drag-invariants test which deliberately probes ±0.01yr.

---

## Open items deferred to later phases

None. All 5 research items above resolve to concrete data tables, code patterns, or threshold values that the implementation can consume directly. Phase 1 design proceeds without further research.
