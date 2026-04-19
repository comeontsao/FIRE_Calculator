/**
 * Shared JSDoc typedefs for fixture files and calc modules.
 *
 * This file exports nothing at runtime. It exists so every fixture and test
 * can `@typedef {import('./types.js').Inputs}` etc. and get editor
 * autocomplete / IDE type-checking without a compile step. Shapes mirror
 * `specs/001-modular-calc-engine/data-model.md` exactly.
 */

/**
 * @typedef {'accumulation' | 'preUnlock' | 'unlocked' | 'ssActive'} Phase
 *
 * Phase glossary (per data-model.md §3):
 *   'accumulation' — still working, contributing; no withdrawals.
 *   'preUnlock'    — spec.md "taxable-only"; retired, pre-59.5, 401(k) locked.
 *   'unlocked'     — spec.md "401(k)-unlocked"; post-59.5, pre-SS.
 *   'ssActive'     — spec.md "SS-active"; Social Security income flowing.
 */

/**
 * @typedef {'safe' | 'exact' | 'dieWithZero'} SolverMode
 */

/**
 * @typedef {Object} TaxBracket
 * @property {number} threshold  real-dollar lower bound for this bracket
 * @property {number} rate       decimal (e.g., 0.22 for 22%)
 */

/**
 * @typedef {Object} TaxConfig
 * @property {TaxBracket[]} ordinaryBrackets   real-dollar thresholds + rates
 * @property {TaxBracket[]} ltcgBrackets
 * @property {number} rmdAgeStart              e.g., 73 or 75
 */

/**
 * @typedef {Object} SafetyBuffers
 * @property {number} bufferUnlockMultiple  (years of spend) required at 401(k) unlock
 * @property {number} bufferSSMultiple      (years of spend) required at SS start
 */

/**
 * @typedef {Object} Portfolio
 * @property {number} trad401kReal               real dollars
 * @property {number} rothIraReal
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} annualContributionReal     current annual savings
 */

/**
 * @typedef {Object} Scenario
 * @property {string} country                    e.g., 'US'
 * @property {string} healthcareScenario         e.g., 'employer' | 'aca' | 'medicare'
 */

/**
 * @typedef {Object} Mortgage
 * @property {number} balanceReal
 * @property {number} annualPaymentReal
 * @property {number} yearsRemaining
 * @property {number} interestRate               decimal
 */

/**
 * @typedef {Object} College
 * @property {string} kidName
 * @property {number} startYear                  calendar year college begins
 * @property {number} years                      duration in years (typically 4)
 * @property {number} annualCostReal
 */

/**
 * @typedef {Object} SSEarnings
 * @property {number[]} annualEarningsNominal  per-year nominal earnings, oldest → newest (max 35 entries used)
 * @property {number} latestEarningsYear       calendar year of the most-recent entry
 */

/**
 * @typedef {Object} Inputs
 *
 * @property {number} currentAgePrimary        integer years, primary person today
 * @property {number} [currentAgeSecondary]    integer years, secondary person today; undefined for single household
 * @property {number} endAge                   age to simulate to (e.g., 95)
 *
 * @property {Portfolio} portfolioPrimary      primary person's accounts
 * @property {Portfolio} [portfolioSecondary]  secondary person's accounts
 *
 * @property {number} annualSpendReal          today-dollar annual spend target
 * @property {number} returnRateReal           real return on stocks (decimal, e.g., 0.05)
 * @property {number} returnRateCashReal       real return on cash (decimal)
 * @property {number} inflationRate            for converting nominal ↔ real (decimal)
 *
 * @property {TaxConfig} tax
 * @property {SolverMode} solverMode           'safe' | 'exact' | 'dieWithZero'
 * @property {SafetyBuffers} buffers           required balances at phase boundaries
 *
 * @property {Scenario} scenario               country / healthcare scenario
 * @property {Mortgage} [mortgage]
 * @property {College[]} colleges              empty array for no kids
 * @property {SSEarnings} [ssPrimary]          null → use generic SS curve
 * @property {SSEarnings} [ssSecondary]
 * @property {number} ssStartAgePrimary        integer 62..70 — claim age for primary person
 * @property {number} [ssStartAgeSecondary]    integer 62..70 — claim age for secondary person (when present)
 */

/**
 * @typedef {Object} EffectiveFireAgeState
 * @property {number} calculatedFireAge   integer years — last solver result
 * @property {number | null} overrideFireAge   integer years, or null when no override
 * @property {number} effectiveFireAge    = overrideFireAge ?? calculatedFireAge (convenience)
 * @property {'calculated' | 'override'} source
 * @property {boolean} feasible           feasibility evaluated at effectiveFireAge
 */

/**
 * @typedef {Object} LifecycleRecord
 * @property {number} year                absolute year (e.g., 2026)
 * @property {number} agePrimary          age at start of this year
 * @property {number} [ageSecondary]
 * @property {Phase} phase
 * @property {number} totalReal           sum of all pools, real dollars
 * @property {number} trad401kReal
 * @property {number} rothIraReal
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} contributionReal    (accumulation only)
 * @property {number} withdrawalReal      (retirement phases only)
 * @property {number} ssIncomeReal        (ssActive only)
 * @property {number} taxesPaidReal
 * @property {number} effectiveTaxRate
 * @property {boolean} feasible           false if any pool went negative this year
 * @property {number} [deficitReal]       present when !feasible
 */

/**
 * @typedef {Object} FireSolverResult
 * @property {number} yearsToFire         integer years (rounded up)
 * @property {number} fireAge             integer age at which FIRE is feasible
 * @property {boolean} feasible           false ⇒ FIRE not achievable within endAge under current inputs
 * @property {number} endBalanceReal      portfolio value at endAge under this plan
 * @property {number} balanceAtUnlockReal value at 401(k) unlock (age 59.5, rounded to 60)
 * @property {number} balanceAtSSReal     value at SS start age
 * @property {LifecycleRecord[]} lifecycle  the projection that justifies this answer
 */

/**
 * @typedef {Object} WithdrawalPerYear
 * @property {number} year
 * @property {number} age
 * @property {number} fromTradReal
 * @property {number} fromRothReal
 * @property {number} fromTaxableReal
 * @property {number} fromCashReal
 * @property {number} fromSSReal
 * @property {number} taxOwedReal
 * @property {number} netSpendReal           should equal annualSpendReal when feasible
 */

/**
 * @typedef {Object} WithdrawalResult
 * @property {boolean} feasible
 * @property {WithdrawalPerYear[]} perYear
 * @property {Phase} [shortfallPhase]         first phase in which a pool went negative
 * @property {number} [deficitReal]           cumulative shortfall to endAge
 */

/**
 * @typedef {Object} LifecycleCheckpoint
 * @property {number} age
 * @property {number} totalReal
 * @property {number} tolerance   percent (0.01 = ±1%) or absolute (caller-documented)
 */

/**
 * @typedef {Partial<FireSolverResult> & { lifecycleCheckpoints?: LifecycleCheckpoint[] }} FixtureExpected
 */

/**
 * @typedef {Object} FixtureCase
 * @property {string} name
 * @property {Inputs} inputs
 * @property {FixtureExpected | Object} expected  partial FireSolverResult or placeholder shape
 * @property {string[]} [divergent]   parity-only: field names expected to differ between RR and Generic and EXCLUDED from byte-identical equality checks (e.g., ['ssPrimary.annualEarningsNominal'])
 * @property {string} [notes]
 * @property {'unit' | 'parity' | 'integration'} kind
 */

export {};
