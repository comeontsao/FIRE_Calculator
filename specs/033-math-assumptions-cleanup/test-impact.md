# Test-Impact Catalog (T006) — Feature 033

**Date**: 2026-06-05 · Pre-change baseline: 687/687 unit green (incl. 5 new
assumptions-module tests), full E2E run in flight (T006 gate), both dashboards
console-clean with `calc/assumptions.js` loaded.

## T005 caller-audit results (supersedes research D6 where noted)

| Field | Surface | Hits | Disposition |
|---|---|---|---|
| `stockContribution` | calc/accumulateToFire.js (8), **calc/calcAudit.js (1 — NEW finding: lifecycleProjection row mapper :585)**, both HTMLs (5 each), tests/unit/accumulateToFire.test.js (12), tests/meta/snapshot-frame-coverage.test.js (1) | 32 | calcAudit.js mapper gains the v7 sibling fields (additive) — folded into T016 scope |
| `cashFlowToCash` | calc/accumulateToFire.js (9), calc/calcAudit.js (1), both HTMLs (5 each), accumulateToFire.test.js (31) | 51 | semantics unchanged (stays ≥ 0); draws live in new fields |
| `cashFlowWarning` | calc/accumulateToFire.js (8), calc/calcAudit.js (1), both HTMLs (11 each), accumulateToFire.test.js (13) | 44 | new enum value `CONTRIBUTION_REDUCED` is additive; `NEGATIVE_RESIDUAL` narrows to "unfunded remainder" |
| `returnRateCashReal` | calc/getCanonicalInputs.js (3), **calc/lifecycle.js (4 — NEW finding: bounds-checked INPUT at :167/:544, no hardcoded default)** | 7 | lifecycle.js needs NO change — T010 (getCanonicalInputs derives from `CASH_REAL_RETURN`) feeds it |

No consumer falls outside the spec's FRs → no scope expansion required.

## Impact map (tag = story whose math change moves the expectations)

| File | Tag | Why |
|---|---|---|
| tests/fixtures/real-nominal-check.js | US1, US3 | frame-sensitive expected values |
| tests/fixtures/three-phase-retirement.js | US1, US3 | full-horizon balances |
| tests/fixtures/coast-fire.js | US3 | growth-rate sensitive |
| tests/fixtures/accumulation-only.js | US1, US2, US3 | cash residual + growth |
| tests/fixtures/infeasible.js | US2, US3 | shortfall semantics + rates |
| tests/fixtures/mode-switch-matrix.js | US3 | rate-derived end balances |
| tests/fixtures/generic-realistic.js | US1, US3 | mixed |
| tests/unit/accumulateToFire.test.js | US1, US2, US3 | cash site, ladder (new cases), rates |
| tests/unit/lifecycle.test.js | US1 (via canonical inputs), US3 | returnRateCashReal + returnRateReal feed |
| tests/unit/getCanonicalInputs.test.js | US1, US3 | asserts the derived rate values |
| tests/unit/calcAudit.test.js | US2 | conservation block fixtures |
| tests/unit/strategyMatrix.test.js | US3 | starvation locus draws (review gate 6 — must still close < $100) |
| tests/unit/spendingFloorPass.test.js | US3 | gate 6 |
| tests/unit/modeObjectiveOrthogonality.test.js | US3 | gate 7 |
| tests/unit/aggressiveBracketFill.test.js | US3 | rate-derived draws |
| tests/unit/verdictStrategyParity.test.js / debugDisplaybug32a.test.js / rothIra*.test.js | US1, US3 | absolute balances if asserted |
| tests/meta/frame-coverage.test.js | US3 | FRAME-comment regexes may pin "(nominal − inflation)" |
| tests/meta/snapshot-frame-coverage.test.js | US2 | row-shape coverage may enumerate fields |
| tests/e2e/cash-sweep-toggle.spec.ts | US1 | OFF-case peak (= exactly $80K at 0% — passes) |
| tests/e2e/rothIra-flow.spec.ts, feature-018-*.spec.ts, savings-redirect | US1/US3 | re-run; thresholds reviewed only if red |

**Procedure per story**: flip the math → run `npm run test:unit` → update every
red expectation with a `// 033(USn): value moved from X (delta: reason)` note →
green checkpoint before next story.
