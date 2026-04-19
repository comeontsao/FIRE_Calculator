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
 * @typedef {'buying-now' | 'already-own' | 'buying-in'} MortgageOwnership
 *   - 'buying-now'   — purchase at currentAgePrimary; down-payment outflow hits today.
 *   - 'already-own'  — purchased yearsPaid years ago; no down-payment outflow.
 *   - 'buying-in'    — purchase at mortgage.purchaseAge (> currentAgePrimary).
 */

/**
 * @typedef {'sell' | 'live-in' | 'inherit'} MortgageDestiny
 *   - 'sell'    — at FIRE, sell home and add net proceeds to taxable stocks.
 *   - 'live-in' — keep the home; carry-costs only after payoff.
 *   - 'inherit' — same as 'live-in' for cash flow, plus legacyValueAtEndReal
 *                 emitted at endAge (non-liquid legacy value).
 */

/**
 * @typedef {Object} Mortgage
 *
 * Extended for US2b (data-model.md §1b — ownership-mode variants).
 * The legacy shape `{balanceReal, annualPaymentReal, yearsRemaining,
 * interestRate}` is NOT used by the canonical engine; ownership + homePrice
 * + annualRateReal + termYears is the complete parametrization.
 *
 * @property {MortgageOwnership} ownership
 *   Determines WHEN down-payment / closing-cost outflows hit the portfolio
 *   and WHEN amortization begins (see data-model.md §1b).
 * @property {number} homePriceReal           real dollars at today's price
 * @property {number} downPaymentReal         real dollars; deducted from
 *                                            cash (then stocks) at purchaseAge
 * @property {number} closingCostReal         real dollars; deducted at purchaseAge
 * @property {number} annualRateReal          decimal real rate (nominal − inflation)
 * @property {number} termYears               integer (e.g., 30)
 * @property {number} [purchaseAge]           REQUIRED when ownership === 'buying-in';
 *                                            defaults to currentAgePrimary for
 *                                            'buying-now'; ignored for 'already-own'
 * @property {number} [yearsPaid]             REQUIRED when ownership === 'already-own';
 *                                            integer in [0, termYears]. yearsPaid ===
 *                                            termYears represents a paid-off home
 * @property {number} [propertyTaxReal]       annual real dollars (defaults to 0)
 * @property {number} [insuranceReal]         annual real dollars (defaults to 0)
 * @property {number} [hoaMonthlyReal]        monthly real dollars (defaults to 0)
 * @property {number} [appreciationReal]      decimal annual real appreciation
 *                                            (for net-proceeds calculation at sale)
 * @property {number} [extraPaymentReal]      annual real-dollar extra principal
 * @property {MortgageDestiny} [destiny]      what happens at FIRE; defaults to 'live-in'
 * @property {string} [location]              country code for selling-cost pct
 *                                            (US 7%, TW 4%, JP 6%, etc.)
 */

/**
 * @typedef {Object} SecondHome
 *
 * US2b (data-model.md §1c) — additive property overlay. Unlike Mortgage
 * (primary residence = housing in place of rent), SecondHome stacks costs
 * on top of the primary housing arrangement.
 *
 * @property {string} [label]                 cosmetic display name
 * @property {string} [location]              country code (default 'us')
 * @property {number} homePriceReal           real dollars at today's price
 * @property {number} downPaymentReal         real dollars
 * @property {number} closingCostReal         real dollars
 * @property {number} annualRateReal          decimal real mortgage rate (0 ⇒ cash)
 * @property {number} termYears               integer (ignored when rate === 0)
 * @property {number} [propertyTaxReal]       annual real dollars
 * @property {number} [otherCarryReal]        annual real dollars — insurance, HOA, utilities lumped
 * @property {number} [rentalIncomeReal]      annual real dollars (reduces carry;
 *                                            may exceed carry ⇒ net income)
 * @property {number} [appreciationReal]      decimal real appreciation
 * @property {number} purchaseAge             REQUIRED — age of primary person at purchase.
 *                                            === currentAgePrimary ⇒ immediate;
 *                                            > currentAgePrimary ⇒ buy-in
 * @property {MortgageDestiny} destiny        behavior at FIRE — same semantics as Mortgage
 */

/**
 * @typedef {Object} StudentLoan
 *
 * US2b (data-model.md §1d) — standalone household adult-debt servicing.
 * Kid-college loans live inside College; StudentLoan is for household-
 * level liabilities (household's own student debt, professional-school
 * loan, etc.).
 *
 * @property {string} [name]                  cosmetic display ('Roger grad school')
 * @property {number} principalReal           real dollars outstanding today
 * @property {number} annualRateReal          decimal real rate (nominal − inflation)
 * @property {number} termYears               integer remaining term
 * @property {number} startAge                age payments begin (usually ===
 *                                            currentAgePrimary for existing debt)
 * @property {number} [extraPaymentReal]      annual extra principal; defaults to 0
 */

/**
 * @typedef {Object} ContributionSplit
 *
 * US2b (data-model.md §1 — Inputs.contributionSplit). Overrides the default
 * 60/20/20 trad/roth/taxable split for accumulation-phase contributions.
 *
 * @property {number} trad401kFraction       decimal 0..1 — share routed to trad401k
 * @property {number} rothFraction           decimal 0..1 — share routed to rothIra
 * @property {number} taxableFraction        decimal 0..1 — share routed to taxableStocks
 *
 * Invariant: fractions sum to 1.0 within 1e-9. Default when omitted:
 * {trad401kFraction: 0.60, rothFraction: 0.20, taxableFraction: 0.20}.
 */

/**
 * @typedef {Object} College
 *
 * Extended for US2b (data-model.md §1e — loan-aware). Replaces the older
 * fixture-schema shape {kidName, startYear, years, annualCostReal}. The
 * extended shape uses fourYearCostReal (total across 4 years) and adds
 * loan-financing overlay fields.
 *
 * @property {string}  name                  child's display name
 * @property {number}  currentAge            today's age
 * @property {number}  [startAge]            default 18
 * @property {number}  fourYearCostReal      total real-dollar cost across all 4 years
 * @property {number}  [pctFinanced]         0..1 — share of annual tuition financed
 *                                           by Federal Direct Subsidized. Default 0
 *                                           (fully cash-funded)
 * @property {number}  [parentPayPct]        0..1 — share of loan repayment parent
 *                                           covers. Default 1 (parent fully covers).
 *                                           0 ⇒ kid assumes loan, no retirement impact
 * @property {number}  [loanRateReal]        decimal real rate (default 0.0353 ≈
 *                                           6.53% nominal − 3% infl)
 * @property {number}  [loanTermYears]       integer (default 10)
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
 * @property {Mortgage} [mortgage]              primary residence mortgage (US2b — ownership-mode variants, §1b)
 * @property {SecondHome} [secondHome]          optional additional property (US2b, §1c)
 * @property {College[]} colleges              empty array for no kids; each College may carry student-loan metadata (§1e)
 * @property {StudentLoan[]} [studentLoans]    standalone adult-debt loans (US2b, §1d)
 * @property {SSEarnings} [ssPrimary]          null → use generic SS curve
 * @property {SSEarnings} [ssSecondary]
 * @property {number} ssStartAgePrimary        integer 62..70 — claim age for primary person
 * @property {number} [ssStartAgeSecondary]    integer 62..70 — claim age for secondary person (when present)
 *
 * @property {ContributionSplit} [contributionSplit]  US2b — override default 60/20/20 during accumulation
 * @property {number} [employerMatchReal]      US2b — real dollars/year added to trad401k during accumulation (defaults to 0)
 * @property {number} [taxTradRate]            US2b — decimal shorthand for trad-withdrawal tax drag (legacy parity; 0..0.60)
 * @property {number} [scenarioSpendReal]      US2b — per-scenario spend override in real dollars for retirement phases
 * @property {number} [relocationCostReal]     US2b — one-time real-dollar deduction at FIRE age
 * @property {number} [homeSaleAtFireReal]     US2b — real-dollar primary-home sale proceeds at FIRE
 * @property {number} [rentAlternativeReal]    US2b — monthly rent in today-dollars for buy-vs-rent delta
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
 *
 * Extended for US2b (data-model.md §3). New fields: derived convenience
 * booleans (`accessible`, `is401kUnlocked`), optional overlay fields for
 * mortgage / second-home / college / student-loan costs, and transitional
 * aliases `p401kTradReal` / `p401kRothReal` maintained during the T048/T049
 * HTML-refactor window.
 *
 * @property {number} year                absolute year (e.g., 2026)
 * @property {number} agePrimary          age at start of this year
 * @property {number} [ageSecondary]
 * @property {Phase} phase
 * @property {number} totalReal           sum of all pools, real dollars
 * @property {number} trad401kReal        Traditional 401(k) balance only (pre-tax)
 * @property {number} rothIraReal         Roth 401(k) + Roth IRA balance (post-tax, merged)
 * @property {number} [p401kTradReal]     US2b — alias of trad401kReal for HTML-renderer parity
 *                                        with the inline engine's 'p401kTrad' field name
 * @property {number} [p401kRothReal]     US2b — alias of rothIraReal (same transitional rationale)
 * @property {number} taxableStocksReal
 * @property {number} cashReal
 * @property {number} contributionReal    (accumulation only)
 * @property {number} withdrawalReal      (retirement phases only)
 * @property {number} ssIncomeReal        (ssActive only)
 * @property {number} taxesPaidReal
 * @property {number} effectiveTaxRate
 * @property {boolean} feasible           false if any pool went negative this year
 * @property {number} [deficitReal]       present when !feasible
 *
 * Derived convenience booleans (US2b — present every year):
 * @property {boolean} [accessible]       true iff phase !== 'accumulation' && phase !== 'preUnlock'
 *                                        — "can I tap any retirement pool THIS year?"
 * @property {boolean} [is401kUnlocked]   true iff agePrimary >= 60 (the UNLOCK_AGE constant)
 *
 * Optional overlay fields (US2b — present only when corresponding input exists):
 * @property {number} [healthcareCostReal]         annual healthcare cost for this year (real)
 * @property {number} [mortgagePaymentReal]        primary P&I + tax + insurance + HOA this year
 * @property {number} [secondHomeCarryReal]        Home #2 annual carry
 *                                                 (positive = drain, negative = net income)
 * @property {number} [collegeCostReal]            merged kid college + loan repayment this year
 * @property {number} [studentLoanPaymentReal]     sum of household studentLoans[*] payments this year
 * @property {number} [oneTimeOutflowReal]         composite — present the year relocation / home
 *                                                 sale / second-home sale hits the portfolio.
 *                                                 Positive = outflow; used by Timeline chart
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
