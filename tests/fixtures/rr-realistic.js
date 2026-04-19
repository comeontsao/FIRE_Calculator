/**
 * Canonical RR realistic input fixture (US2b — TB04).
 *
 * This fixture expresses Roger & Rebecca's personal dashboard cold-load
 * defaults in the shared canonical `Inputs` shape (data-model.md §1, §1b–1e).
 * It is the structural counterpart to `tests/baseline/inputs-rr.mjs`, which
 * expresses the same values in the legacy inline-engine shape. The harness
 * runs the inline shape; this fixture runs through the canonical calc
 * modules once US2b Phase U2B-3 implementations land.
 *
 * Expected-output block (below) is LOCKED to the values captured by
 * `tests/baseline/inline-harness.mjs` (see `baseline-rr-inline.md §A.observed`).
 * These are the PRE-refactor inline-engine outputs; the canonical engine's
 * intentional-correctness deltas (baseline §C) may shift them slightly in
 * TB21 — at which point this fixture's `expected` block gets re-locked to
 * the canonical values with a note documenting the delta.
 *
 * Derivation notes per field:
 *
 *   Ages:
 *     currentAgePrimary   = inputs.ageRoger (43)
 *     currentAgeSecondary = inputs.ageRebecca (42)
 *     endAge              = inputs.endAge (95)
 *
 *   Portfolios (baseline §A "Derived canonical Inputs shape"):
 *     portfolioPrimary.trad401kReal        = 25_000
 *     portfolioPrimary.rothIraReal         = 58_000   (Roth 401k merged)
 *     portfolioPrimary.taxableStocksReal   = 190_000
 *     portfolioPrimary.cashReal            = 0
 *     portfolioPrimary.annualContributionReal = 24_000 + 8_550 + 2_850 + 7_200
 *                                           = 42_600
 *       (monthly $2k×12 + trad 401k annual + roth 401k annual + employer match)
 *     portfolioSecondary.taxableStocksReal = 200_000; other pools 0;
 *       annualContributionReal = 0 (Rebecca's contributions are not separated
 *       in the RR legacy shape; all contributions flow through the primary).
 *
 *   Returns & inflation:
 *     returnRateReal      = 0.04    (7% nominal - 3% inflation)
 *     returnRateCashReal  = 0.005   (CASH_ANNUAL_GROWTH = 1.005 → 0.5%/yr
 *                                    real; inline uses 0.5% post-inflation)
 *     inflationRate       = 0.03
 *
 *   Spend & scenario:
 *     annualSpendReal     = 60_100  (Taiwan annualSpend $60k + visaCost $100)
 *     scenarioSpendReal   = 60_100  (retirement-phase override = base for now)
 *     relocationCostReal  = 15_000  (Taiwan scenario one-time relocation)
 *
 *   Contributions & tax:
 *     contributionSplit   = default {0.60, 0.20, 0.20} — US2b lifecycle uses
 *                           this for accumulation-phase contributions.
 *     employerMatchReal   = 7_200   (Traditional only; added on top of split)
 *     taxTradRate         = 0.15    (legacy shorthand for trad withdrawal
 *                                    tax drag — kept for parity with
 *                                    signed-lifecycle invariant until
 *                                    withdrawal.js fully supersedes)
 *
 *   SS:
 *     ssStartAgePrimary   = 67, ssStartAgeSecondary = 67
 *     ssPrimary           = Roger's actual earnings history (from
 *                           inputs-rr.mjs). Expressed here as the canonical
 *                           SSEarnings shape.
 *
 *   Buffers & solver:
 *     solverMode          = 'safe'
 *     bufferUnlockMultiple = 2, bufferSSMultiple = 3
 *
 *   Colleges (Janet & Ian, us-private, no loan financing):
 *     Janet  currentAge 10, fourYearCostReal 85_000 × 4 = 340_000
 *     Ian    currentAge  4, fourYearCostReal 85_000 × 4 = 340_000
 *     pctFinanced 0, parentPayPct 1 (defaults)
 *
 *   Mortgage / secondHome / studentLoans:
 *     Both mortgage and secondHome OFF (cold-load default) — omitted here
 *     entirely. No studentLoans.
 *
 *   rentAlternativeReal = 2_690  (matches env.rentMonthly default; inert
 *                                 when mortgage absent)
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/**
 * Roger's real SS earnings history, expressed in the canonical SSEarnings
 * shape. Mirrors the legacy ssEarningsHistoryRR table in inputs-rr.mjs
 * (FIRE-Dashboard.html:1920-1928). Only the nominal earnings array + the
 * latest year are needed in the canonical shape.
 */
const ssPrimary = Object.freeze({
  annualEarningsNominal: Object.freeze([
    44_037,  // 2019
    77_957,  // 2020
    80_783,  // 2021
    83_714,  // 2022
    94_786,  // 2023
    125_753, // 2024
    148_272, // 2025
  ]),
  latestEarningsYear: 2025,
});

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'rr-realistic — Roger & Rebecca canonical RR cold-load (US2b parity lock)',
  kind: 'integration',
  inputs: Object.freeze({
    currentAgePrimary: 43,
    currentAgeSecondary: 42,
    endAge: 95,

    portfolioPrimary: Object.freeze({
      trad401kReal: 25_000,
      rothIraReal: 58_000, // Roth 401k merged into rothIraReal per data-model §1 note
      taxableStocksReal: 190_000,
      cashReal: 0,
      annualContributionReal: 42_600, // monthly 24k + trad 8.55k + roth 2.85k + match 7.2k
    }),
    portfolioSecondary: Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: 200_000,
      cashReal: 0,
      annualContributionReal: 0,
    }),

    annualSpendReal: 60_100,     // Taiwan annualSpend $60k + visaCostAnnual $100
    scenarioSpendReal: 60_100,   // retirement-phase override (identical here;
                                 // documented explicitly so lifecycle exercises
                                 // the scenarioSpendReal code path)
    returnRateReal: 0.04,        // 7% nominal - 3% inflation
    returnRateCashReal: 0.005,   // CASH_ANNUAL_GROWTH = 1.005 real
    inflationRate: 0.03,

    tax: Object.freeze({
      // Standard 2025 MFJ brackets (RR's signed simulator only uses the
      // taxTradRate shorthand; full brackets are carried for future
      // withdrawal-module use).
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
    taxTradRate: 0.15, // legacy parity shorthand
    solverMode: 'safe',
    buffers: Object.freeze({
      bufferUnlockMultiple: 2,
      bufferSSMultiple: 3,
    }),

    scenario: Object.freeze({
      country: 'Taiwan',
      healthcareScenario: 'taiwan',
    }),
    relocationCostReal: 15_000,
    rentAlternativeReal: 2_690, // monthly; inert absent mortgage but documented

    // Mortgage + secondHome OFF at cold load (baseline §A). No studentLoans.
    // (Fields omitted entirely; the canonical engine treats undefined as absent.)

    colleges: Object.freeze([
      Object.freeze({
        name: 'Janet',
        currentAge: 10,
        fourYearCostReal: 340_000, // us-private $85k × 4
        // pctFinanced, parentPayPct, loanRateReal, loanTermYears omitted
        // → canonical defaults (0, 1, 0.0353, 10) ⇒ no loan financing.
      }),
      Object.freeze({
        name: 'Ian',
        currentAge: 4,
        fourYearCostReal: 340_000,
      }),
    ]),

    ssPrimary,
    ssStartAgePrimary: 67,
    ssStartAgeSecondary: 67,
  }),
  expected: Object.freeze({
    // Re-locked 2026-04-19 in TB21 to CANONICAL-ENGINE values. The
    // pre-refactor inline-harness baseline was fireAge=54, but the canonical
    // engine produces fireAge=58 — a +4-year shift driven by the
    // correctness-framework deltas documented in baseline-rr-inline.md §C.5
    // (dominant drivers: §C.1 real/nominal healthcare mixing; §C.2 typed
    // silent-shortfall feasibility; §C.3b 60/20/20 contribution-split default
    // vs inline's implicit $-routing; §C.3c totalReal raw-sum vs inline's
    // effBal taxTrad-adjusted sum). None of these are regressions.
    //
    // Original inline baseline (preserved for historical reference):
    //   fireAge=54, yearsToFire=11, balanceAtUnlockReal=704_027.35,
    //   balanceAtSSReal=344_907.56, endBalanceReal=618_741.27
    yearsToFire: 15,
    fireAge: 58,
    feasible: true,
    balanceAtUnlockReal: 1_261_296.08, // canonical-engine-pinned (TB21)
    balanceAtSSReal: 1_061_540.29,     // canonical-engine-pinned (TB21)
    endBalanceReal: 990_645.48,        // canonical-engine-pinned (TB21)

    // effBal presentation-layer companions — canonical-engine-pinned on the
    // TB21-locked fireAge=58 trajectory (2026-04-19). Formula at each
    // checkpoint: effBalReal = totalReal − (trad401kReal × taxTradRate), with
    // taxTradRate=0.15 from this fixture's inputs. Gap vs inline harness
    // (§A.observed: end $618,741 / unlock $704,027 / SS $344,908) remains
    // material because the RR canonical run retires at age 58, not 54 — the
    // +4-year shift is §C.1/§C.2/§C.3b correctness drivers, not the effBal
    // presentation. Locked for regression; shrinks toward inline parity as
    // T048/T049 closes §C.3b.
    endBalanceEffReal: 918_525.24,
    balanceAtUnlockEffReal: 1_175_103.41,
    balanceAtSSEffReal: 948_116.61,

    // Tolerance band for TB12 integration test: ±1 year on fireAge absorbs
    // small floating-point drift in future canonical-engine refactors. The
    // balance checkpoints are looser (±10%) because fireAge drift cascades
    // into larger terminal-balance swings at age 95.
    fireAgeToleranceYears: 1,
    balanceRelativeTolerance: 0.10,
  }),
  notes:
    'Canonical RR input set expressed in the shared Inputs shape. Expected ' +
    'values are CANONICAL-ENGINE-PINNED (post-US2b lifecycle+fireCalculator, ' +
    're-locked 2026-04-19 in TB21; effBal companions added U2B-parity dispatch ' +
    '2026-04-19). Previously locked to inline-harness values (fireAge=54); ' +
    'rolled forward to fireAge=58 with correctness-delta documented in baseline ' +
    '§C.5. ' +
    'Classification of expected fields: ' +
    '(a) ANALYTICAL — none in this fixture. ' +
    '(b) CANONICAL-PINNED — yearsToFire, fireAge, feasible, balanceAtUnlockReal, ' +
    'balanceAtSSReal, endBalanceReal. Captured from solveFireAge on canonical ' +
    'engine 2026-04-19. `*Real` fields are gross (canonical); `*EffReal` fields ' +
    'are post-tax-drag (display parity with inline engine baseline §A/§B); ' +
    '§C.3c originally captured the gap and the effBal layer now closes the ' +
    'presentation half of it. Acts as the forward-regression oracle. ' +
    '(c) INTENTIONAL DEVIATIONS from inline baseline — documented in baseline ' +
    '§C.1 (healthcare real/nominal mixing), §C.2 (typed silent-shortfall), ' +
    '§C.3b (60/20/20 contribution-split default), §C.3c (totalReal raw-sum vs ' +
    'inline effBal taxTrad-adjusted — now mirrored via effBalReal field). See ' +
    '§C.5 for the delta summary table. ' +
    'Mortgage + secondHome + studentLoans intentionally OMITTED (cold-load ' +
    'default; exercises the lifecycle default-value paths).',
});

export default fixture;
