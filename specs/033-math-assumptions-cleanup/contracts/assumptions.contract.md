# Contract: calc/assumptions.js + the shortfall funding ladder

**Feature**: 033-math-assumptions-cleanup · **Date**: 2026-06-05
**Status**: Draft (binding once tasks.md references it)

## Module: `calc/assumptions.js`

```
// =============================================================================
// Inputs : none (pure constants + one pure function)
// Outputs: CASH_REAL_RETURN : number — today's-$ growth rate of the cash pool
//          realRate(nominal, inflation) : number — Fisher conversion
// Consumers: every lifecycle/accumulation/signed simulator in BOTH HTML files,
//          calc/accumulateToFire.js, calc/getCanonicalInputs.js,
//          tests/unit/mathAssumptions.test.js
// =============================================================================
```

### Loading rules (Constitution V + 2026-06-05 global-scope lesson — NON-NEGOTIABLE)

1. UMD classic script. NO top-level `export` keyword.
2. Script tag inserted as the **FIRST** `calc/` tag in BOTH HTML head blocks
   (before `calcAudit.js`) so every later classic script and inline simulator
   may capture the globals at evaluation time.
3. Top-level lexical names are globally unique: the export const is
   `_assumptionsApi`; the public globals are `CASH_REAL_RETURN` and `realRate`.
   `tests/unit/globalScopeCollision.test.js` enforces this automatically.
4. Node consumption: `module.exports = _assumptionsApi`. Calc modules that
   consume it use `require('./assumptions.js')` under Node and the global under
   the browser. Because assumptions.js loads FIRST, eval-time capture is
   permitted (the `_taxBrackets` pattern) — but the resolution MUST still
   tolerate absence with a hard throw, never a silent fallback value.

### Exports

| Export | Contract |
|---|---|
| `CASH_REAL_RETURN = 0.0` | Locked by clarification Q1 (2026-06-05). Module throws at load if non-finite or outside [−0.05, 0.05]. This value SUPERSEDES feature 030's FR-016 note "pCash grows at 0.5%/yr nominal (hardcoded, locked)" — that comment also mislabeled the frame: the multiplier applies to a today's-$ pool, i.e., a purchasing-power gain. |
| `realRate(nominal, inflation)` | `(1 + nominal) / (1 + inflation) − 1`. Pure; no rounding. Identities: `realRate(x,0)=x`, `realRate(x,x)=0`, `realRate(0.07,0.04)≈0.0288462`. |

### Consumption rules

- Cash growth in every simulator: `pCash *= (1 + CASH_REAL_RETURN)`; scaled
  partial-year form: `pCash *= (1 + CASH_REAL_RETURN * scale)`.
- Real-rate derivations: `realRate(inp.returnRate, inp.inflationRate)`,
  `realRate(inp.return401k, inp.inflationRate)`,
  `realRate(ssCOLARate ?? inflationRate, inflationRate)`,
  income growth `Math.pow(1 + realRate(raiseRate, inflationRate), years)`.
- **Static guards** (`tests/unit/mathAssumptions.test.js`): scanning both HTML
  files + all browser-loaded calc modules, (a) zero hardcoded cash-growth
  multipliers (`*= 1.005`-class) outside `calc/assumptions.js`; (b) zero
  subtraction-form real-rate derivations (`- inp.inflationRate` /
  `- inflationRate` in a rate expression) in simulator code. Comment text and
  CSS values are excluded by the scan rules.

## Shortfall funding ladder (calc/accumulateToFire.js — NON-NEGOTIABLE ordering)

When the accumulation-year residual is negative AND the cash-flow override is
OFF, funding proceeds in EXACTLY this order, stopping as soon as the gap closes:

1. **Cut the discretionary brokerage contribution** — down to $0 at most.
   Pre-tax 401K employee contributions and employer match are NEVER reduced.
2. **Draw from the cash pool** — down to $0 at most.
3. **Draw from the brokerage pool** — face value (no LTCG gross-up; D4
   documented simplification).
4. Any remainder is `unfunded` → row keeps `cashFlowWarning: 'NEGATIVE_RESIDUAL'`.
   A year funded by rungs 1–3 carries `cashFlowWarning: 'CONTRIBUTION_REDUCED'`
   (informational) instead.

Silent flooring of the residual to $0 without recording the funding is
PROHIBITED — that is the bug this feature removes.

Row fields, invariants I1–I6, and the v4 conservation block are specified in
[data-model.md](../data-model.md). `stockContribution` keeps its v2 "planned"
semantics; actual flows live in the new sibling fields (feature-018
sibling-field lesson).

## Supersession note

This contract supersedes, for the cash-growth rate only, the "hardcoded,
locked" clause of feature 030's FR-016. The sweep semantics themselves
(default OFF, year-0 preserved, one-way, $10K threshold, sweep AFTER all
flows) are untouched.
