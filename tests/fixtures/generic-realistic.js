/**
 * Canonical Generic realistic input fixture (US2b — TB05).
 *
 * Structural counterpart to `tests/baseline/inputs-generic.mjs`. Expresses
 * the Generic dashboard's cold-load defaults in the shared canonical
 * `Inputs` shape (data-model.md §1). Expected-output block is LOCKED to
 * harness-captured values from `baseline-rr-inline.md §B.observed`.
 *
 * Derivation notes per field:
 *
 *   Ages:
 *     currentAgePrimary   = 36, currentAgeSecondary = 36, endAge = 95
 *
 *   Portfolios (all zero on Generic cold load — infeasibility-by-design
 *   becomes feasibility-at-65 once the full signed simulator runs; see
 *   baseline-rr-inline.md §B "Analytical expectation vs observed"):
 *     portfolioPrimary.trad401kReal / rothIraReal / taxableStocksReal /
 *       cashReal = 0
 *     portfolioPrimary.annualContributionReal = $500×12 + $3_000 + $1_500
 *                                             = $10_500
 *     portfolioSecondary = zeros everywhere, no contributions
 *
 *   Returns & inflation: 4%/0.5%/3% real (same derivation as RR fixture).
 *
 *   Spend & scenario:
 *     annualSpendReal    = 78_000  (US scenario annualSpend on Generic's table)
 *     scenarioSpendReal  = 78_000
 *     relocationCostReal = 0       (US: no relocation)
 *
 *   Contributions & tax:
 *     contributionSplit  = default 60/20/20
 *     employerMatchReal  = 1_500
 *     taxTradRate        = 0.15
 *
 *   SS:
 *     ssStartAgePrimary  = 67, ssStartAgeSecondary = 67
 *     ssPrimary          = Generic's default 6-year earnings history
 *
 *   Buffers & solver:
 *     solverMode         = 'safe'
 *     bufferUnlockMultiple = 2, bufferSSMultiple = 3
 *
 *   Kids / colleges: NONE on Generic cold load (empty childrenList → empty
 *   colleges array).
 *
 *   Mortgage / secondHome / studentLoans: all OFF.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/**
 * Generic's default SS earnings history (FIRE-Dashboard-Generic.html:
 * 2004-2010). Expressed in canonical SSEarnings shape.
 */
const ssPrimary = Object.freeze({
  annualEarningsNominal: Object.freeze([
    50_000, // 2020
    55_000, // 2021
    60_000, // 2022
    70_000, // 2023
    80_000, // 2024
    90_000, // 2025
  ]),
  latestEarningsYear: 2025,
});

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'generic-realistic — Generic dashboard canonical cold-load (US2b parity lock)',
  kind: 'integration',
  inputs: Object.freeze({
    currentAgePrimary: 36,
    currentAgeSecondary: 36,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: 0,
      cashReal: 0,
      annualContributionReal: 10_500, // monthly 6k + trad 3k + match 1.5k
    }),
    portfolioSecondary: Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: 0,
      cashReal: 0,
      annualContributionReal: 0,
    }),

    annualSpendReal: 78_000,   // US scenario annualSpend (Generic table)
    scenarioSpendReal: 78_000,
    returnRateReal: 0.04,
    returnRateCashReal: 0.005,
    inflationRate: 0.03,

    tax: Object.freeze({
      ordinaryBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.10 }),
        Object.freeze({ threshold: 23_200, rate: 0.12 }),
        Object.freeze({ threshold: 94_300, rate: 0.22 }),
        Object.freeze({ threshold: 201_050, rate: 0.24 }),
      ]),
      ltcgBrackets: Object.freeze([
        Object.freeze({ threshold: 0, rate: 0.00 }),
        Object.freeze({ threshold: 94_050, rate: 0.15 }),
        Object.freeze({ threshold: 583_750, rate: 0.20 }),
      ]),
      rmdAgeStart: 73,
    }),
    taxTradRate: 0.15,
    solverMode: 'safe',
    buffers: Object.freeze({
      bufferUnlockMultiple: 2,
      bufferSSMultiple: 3,
    }),

    scenario: Object.freeze({
      country: 'US',
      healthcareScenario: 'us',
    }),
    relocationCostReal: 0,
    rentAlternativeReal: 2_690,

    // Empty kids list (Generic cold load).
    colleges: Object.freeze([]),

    ssPrimary,
    ssStartAgePrimary: 67,
    ssStartAgeSecondary: 67,
  }),
  expected: Object.freeze({
    // Re-locked 2026-04-19 in TB21 to CANONICAL-ENGINE values. The
    // pre-refactor inline-harness baseline was fireAge=65, but the canonical
    // engine produces fireAge=75 — a +10-year shift driven by the
    // correctness-framework deltas documented in baseline §C.5 (dominant:
    // §C.1, §C.2, §C.3c, plus zero-portfolio start amplifies the shift
    // because the canonical engine's stricter feasibility gate + non-
    // taxTrad-discounted totalReal mean that a zero-start portfolio needs
    // substantially more accumulation years to satisfy Safe-mode buffers).
    // None of these are regressions.
    //
    // Original inline baseline (preserved for historical reference):
    //   fireAge=65, yearsToFire=29, balanceAtUnlockReal=520_393.76,
    //   balanceAtSSReal=389_735.33, endBalanceReal=164_650.19
    yearsToFire: 39,
    fireAge: 75,
    feasible: true,
    balanceAtUnlockReal: 410_367.34, // canonical-engine-pinned (TB21)
    balanceAtSSReal: 622_947.52,     // canonical-engine-pinned (TB21)
    endBalanceReal: 299_076.99,      // canonical-engine-pinned (TB21)

    fireAgeToleranceYears: 1,
    balanceRelativeTolerance: 0.10,
  }),
  notes:
    'Canonical Generic input set in shared Inputs shape. Expected values ' +
    'are CANONICAL-ENGINE-PINNED (post-US2b lifecycle+fireCalculator, ' +
    're-locked 2026-04-19 in TB21). Previously locked to inline-harness ' +
    'values (fireAge=65); rolled forward to fireAge=75 with correctness ' +
    'delta documented in baseline §C.5. Classification: ' +
    '(a) ANALYTICAL — baseline §B.analytical predicted infeasibility but ' +
    'the canonical engine finds feasibility at age 75 (SS + residual ' +
    'compounding cushion). ' +
    '(b) CANONICAL-PINNED — all six expected values are canonical-engine ' +
    'outputs captured 2026-04-19 via solveFireAge. ' +
    '(c) INTENTIONAL DEVIATIONS from inline baseline — documented in ' +
    'baseline §C.1/§C.2/§C.3c and summarized in §C.5. The zero-portfolio ' +
    'cold start amplifies the Safe-mode-buffer-binding effect. ' +
    'This fixture exercises: zero-portfolio cold-start path, no-kids path, ' +
    'no-mortgage path, US scenario defaults, SS-dependent feasibility.',
});

export default fixture;
