# Contract: Retirement Status — calc & resolver interfaces

Status: DRAFT (Phase 1). Governs the calc-layer changes for feature 036. Contract tests live in `tests/unit/accumulateToFire.retirement.test.js`.

## C-1. `accumulateToFire(inp, fireAge, options)` — new optional `options.retirement`

Backwards-compatible extension. When `options.retirement` is **absent/undefined**, behavior is byte-identical to v7 (INV-1).

```
options.retirement?: {
  households: Array<{
    income: number,          // annual employment income (real $) for this earner
    retirementAge: number    // age at which THIS earner stops earning/contributing
  }>
}
```

**Semantics (when present):**

1. **Transition age** used for the accumulation→drawdown boundary = `max(households[i].retirementAge)`. `accumulateToFire` accumulates only for ages `< transitionAge`; caller runs drawdown for ages `≥ transitionAge`. When `options.retirement` is present, `fireAge` passed by the caller MUST equal this transition age (caller resolves it via the effectiveTransitionAge rule).
2. **Per-year employment income** for accumulation year at `age`:
   `workingIncome(age) = Σ households[i].income where households[i].retirementAge > age`.
   This replaces the internal `inp.annualIncome` income trajectory base for that year (raise-rate trajectory still applies to each still-working earner's income).
3. **Contribution scaling** for year `age`:
   `scale = totalIncome>0 ? workingIncome(age)/totalIncome : 0`, where `totalIncome = Σ households[i].income`.
   Applied to: `contrib401kTrad`, `contrib401kRoth`, `empMatch`, and the discretionary brokerage/`monthlySavings`-derived `stockContribution`. Fully-retired year (`workingIncome==0`) ⇒ all new contributions 0.
4. **Passive income unaffected**: SS/pension handled downstream in the drawdown loop by `ssClaimAge` — `accumulateToFire` does not model them (no change).
5. **Purity preserved**: the descriptor is passed in; no DOM/global reads added.

**Outputs**: unchanged shape. Per-year rows continue to carry `grossIncome`, `stockContribution`/`stockContributionActual`, `cashFlowWarning`, etc. `grossIncome` reflects the masked `workingIncome`.

**Degenerate cases:**
- RR / single earner: `households:[{income: annualIncome, retirementAge}]`.
- Generic single-adult (`adultCount===1`): one entry only.
- Earner never retires within plan: caller omits them from `households` OR sets `retirementAge = endAge + 1` so their income persists to plan end.

## C-2. `projectFullLifecycle(inp, annualSpend, overrideFireAge, withSS, options)` — threading

- `options.retirement` (same shape as C-1) is forwarded to `accumulateToFire` via `resolveAccumulationOptions`.
- `overrideFireAge` passed to `projectFullLifecycle` MUST equal the effective transition age (household `max` of retirement ages) when status is ON, so the retirement-phase loop's `isRetired = age >= fireAge` boundary matches the accumulator's transition.
- No new retirement branch in the per-year retirement loop — the existing `isRetired`/`ssActive` logic is reused unchanged.

## C-3. Effective-transition resolver precedence (Principle III)

The one effective-transition path — `effectiveFireAge = fireAgeOverride != null ? fireAgeOverride : calculatedFireAge` (RR ~15406) and `chartState.effectiveFireAge` — resolves, highest precedence first (via a new pure helper `resolveRetirementTransitionAge(inp, status)` consulted FIRST). `calc/fireAgeResolver.js` is display-precision only and is NOT in this path.

| Precedence | Condition | Result |
|-----------|-----------|--------|
| 1 | RetirementStatus ON | retirement transition age (RR household age / Generic `max` of retired earners' ages) |
| 2 | `fireAgeOverride != null` (drag) AND status OFF | `fireAgeOverride` |
| 3 | otherwise | `calculatedFireAge` |

While precedence 1 is active, the FIRE-marker drag MUST be inert (FR-011) and MUST NOT write `fireAgeOverride`.

## C-4. Verdict reframe contract (FR-006 / FR-014)

When RetirementStatus ON, the status headline function MUST:
1. NOT emit any "FIRE in N years / age X" countdown string.
2. Probe the resolved lifecycle (`projectFullLifecycle` with the retirement transition + active strategy options — reuse the existing stop-gap probe).
3. Emit `retire.verdict.sustainable` (class `on-track`) when no retirement-year balance is negative through `endAge`; else `retire.verdict.atRisk` (class `behind`) naming the first shortfall year (first year with `hasShortfall` or `total < 0`).

## C-5. Fixtures (Principle IV — lock these)

| Fixture | Inputs | Expected |
|---------|--------|----------|
| `retired-now` | status ON, retirementYear = current year, sufficient balances | every year ≥ current: workingIncome 0, contributions 0; balances draw down; verdict = sustainable |
| `retired-early-shortfall` | status ON, retire before safe age, insufficient balances | complete year-by-year drawdown; a `hasShortfall` year exists; verdict = at-risk naming that year; NOT shown as working |
| `off-revert-parity` | toggle ON then OFF | output == never-toggled feasibility result (INV-1 / SC-004) |
| `staggered-generic` | 2 earners, Y1 < Y2, incomes A & B | years [now,Y1): income A+B; [Y1,Y2): income B only; ≥Y2: income 0 (SC-008) |
| `rr-generic-parity` | identical shared inputs, single-earner scenario | RR and Generic produce identical projections (Principle I numeric parity) |
| `ss-independence` | status ON, retire before ssClaimAge | SS income still starts exactly at ssClaimAge (INV-3) |
