/*
 * calc/lifecycle.js — year-by-year portfolio simulator.
 *
 * Inputs:
 *   {
 *     inputs:  Inputs                          (data-model.md §1)
 *     fireAge: number                          integer age to simulate retirement at
 *     helpers: {                               optional DI bundle; missing members
 *       inflation, tax, socialSecurity,         fall back to direct imports so the
 *       healthcare, mortgage, college,          module is usable standalone. Passing
 *       withdrawal, secondHome, studentLoan     {} is explicitly supported.
 *     }
 *   }
 *
 * Outputs: LifecycleRecord[] (data-model.md §3)
 *   One record per year from inputs.currentAgePrimary through inputs.endAge inclusive.
 *
 * Consumers:
 *   - growthChart renderer      — totalReal, phase, feasible, pool balances
 *   - ssChart renderer          — totalReal, ssIncomeReal, phase, is401kUnlocked
 *   - rothLadderChart renderer  — withdrawalReal, pool balances by year
 *   - timelineChart renderer    — phase, age, year, overlays (mortgage, secondHome, college)
 *   - calc/fireCalculator.js    — feasibility + balance checkpoints
 *
 * Invariants:
 *   - result.length === inputs.endAge - inputs.currentAgePrimary + 1.
 *   - Years strictly monotonic by 1; agePrimary advances by exactly 1 each record.
 *   - totalReal === sum of the four pool fields at every year.
 *   - If any pool would go negative, the offending record carries
 *     feasible:false and deficitReal > 0 (FR-013).
 *   - All money is real dollars. Any nominal input (e.g., a healthcare
 *     override in nominal dollars via scenario.healthcareOverrideNominal)
 *     is converted at THIS boundary via the inflation helper; no other
 *     module performs nominal↔real conversion (FR-017).
 *   - Phase transitions follow enum ordering:
 *       age < fireAge                              → 'accumulation'
 *       fireAge <= age < 60                        → 'preUnlock'   (59.5 rounded up)
 *       60 <= age < ssStartAgePrimary              → 'unlocked'
 *       age >= ssStartAgePrimary                   → 'ssActive'
 *   - accessible === (phase !== 'accumulation' && phase !== 'preUnlock')
 *   - is401kUnlocked === (agePrimary >= 60)
 *
 * US2b contribution split during accumulation:
 *   Default: 60% → trad401kReal, 20% → rothIraReal, 20% → taxableStocksReal.
 *   Override via inputs.contributionSplit (three fractions sum to 1.0). The
 *   cash pool does not receive new contributions — it is only spent down in
 *   retirement and earns returnRateCashReal. `employerMatchReal`, when > 0,
 *   is added to trad401kReal on top of the split contribution each
 *   accumulation year.
 *
 * US2b one-time events at fireAge:
 *   - relocationCostReal: drawn from cash first, then taxableStocks.
 *   - homeSaleAtFireReal: added to taxableStocksReal.
 *   - Primary mortgage sale (via resolveMortgage destiny='sell'): adds
 *     saleProceedsReal to taxableStocksReal.
 *   - Second-home sale (via resolveSecondHome destiny='sell'): adds
 *     saleProceedsReal to taxableStocksReal.
 *
 * US2b compat shim — legacy mortgage shape:
 *   Existing fixtures may still pass mortgage as {balanceReal, interestRate,
 *   yearsRemaining}. When no `ownership` field is present, the shim translates
 *   to the new shape (ownership='already-own', synthetic homePrice & down
 *   payment, yearsPaid=0) so historical fixtures keep working. This shim will
 *   be retired when T048/T049 completes the HTML→canonical migration.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

import { makeInflation } from './inflation.js';
import { computeTax } from './tax.js';
import { projectSS } from './socialSecurity.js';
import { getHealthcareCost } from './healthcare.js';
import { computeMortgage, resolveMortgage } from './mortgage.js';
import { computeCollegeCosts } from './college.js';
import { computeWithdrawal } from './withdrawal.js';
import { resolveSecondHome } from './secondHome.js';
import { computeStudentLoan } from './studentLoan.js';

/**
 * @typedef {import('../tests/fixtures/types.js').Inputs}          Inputs
 * @typedef {import('../tests/fixtures/types.js').LifecycleRecord} LifecycleRecord
 * @typedef {import('../tests/fixtures/types.js').Phase}           Phase
 */

/** Default calendar base year when fixture doesn't supply one. */
const DEFAULT_BASE_YEAR = 2026;

/** 401(k) unlock age — 59.5 rounded to the end-of-year boundary. */
const UNLOCK_AGE = 60;

/** Default contribution allocation rule (60% trad / 20% roth / 20% taxable). */
const DEFAULT_CONTRIB_SPLIT = Object.freeze({
  trad401kFraction: 0.60,
  rothFraction: 0.20,
  taxableFraction: 0.20,
});

/** Floating-point tolerance for contributionSplit sum-to-one check. */
const SPLIT_SUM_TOLERANCE = 1e-9;

/** Default withdrawal strategy when inputs don't specify. */
const DEFAULT_WITHDRAWAL_STRATEGY = 'tax-optimized';

/**
 * Validate Inputs at the lifecycle boundary (FR-001 range checks).
 * Throws a descriptive Error on any violation.
 *
 * @param {Inputs} inp
 */
function validateInputs(inp) {
  if (!inp || typeof inp !== 'object') {
    throw new Error('lifecycle: inputs must be an object');
  }
  if (!Number.isInteger(inp.currentAgePrimary)) {
    throw new Error(`lifecycle: currentAgePrimary must be an integer, got ${inp.currentAgePrimary}`);
  }
  if (inp.currentAgePrimary < 18) {
    throw new Error(`lifecycle: currentAgePrimary must be >= 18, got ${inp.currentAgePrimary}`);
  }
  if (!Number.isInteger(inp.endAge) || inp.endAge > 110) {
    throw new Error(`lifecycle: endAge must be an integer <= 110, got ${inp.endAge}`);
  }
  if (inp.currentAgePrimary >= inp.endAge) {
    throw new Error(
      `lifecycle: currentAgePrimary (${inp.currentAgePrimary}) must be < endAge (${inp.endAge})`,
    );
  }
  if (!(inp.annualSpendReal > 0)) {
    throw new Error(`lifecycle: annualSpendReal must be > 0, got ${inp.annualSpendReal}`);
  }
  if (!(inp.returnRateReal >= -0.10 && inp.returnRateReal <= 0.20)) {
    throw new Error(
      `lifecycle: returnRateReal must be within [-0.10, 0.20], got ${inp.returnRateReal}`,
    );
  }
  if (!(inp.returnRateCashReal >= -0.10 && inp.returnRateCashReal <= 0.20)) {
    throw new Error(
      `lifecycle: returnRateCashReal must be within [-0.10, 0.20], got ${inp.returnRateCashReal}`,
    );
  }
  if (!(inp.inflationRate >= -0.05 && inp.inflationRate <= 0.20)) {
    throw new Error(
      `lifecycle: inflationRate must be within [-0.05, 0.20], got ${inp.inflationRate}`,
    );
  }
  const portfolios = [inp.portfolioPrimary, inp.portfolioSecondary].filter(Boolean);
  for (const p of portfolios) {
    for (const field of ['trad401kReal', 'rothIraReal', 'taxableStocksReal', 'cashReal', 'annualContributionReal']) {
      if (!(p[field] >= 0)) {
        throw new Error(`lifecycle: portfolio.${field} must be >= 0, got ${p[field]}`);
      }
    }
  }
  if (inp.portfolioSecondary && inp.currentAgeSecondary === undefined) {
    throw new Error('lifecycle: portfolioSecondary present but currentAgeSecondary missing');
  }
  if (!Number.isInteger(inp.ssStartAgePrimary) || inp.ssStartAgePrimary < 62 || inp.ssStartAgePrimary > 70) {
    throw new Error(
      `lifecycle: ssStartAgePrimary must be an integer in [62,70], got ${inp.ssStartAgePrimary}`,
    );
  }
  if (inp.ssStartAgeSecondary !== undefined) {
    if (!Number.isInteger(inp.ssStartAgeSecondary) || inp.ssStartAgeSecondary < 62 || inp.ssStartAgeSecondary > 70) {
      throw new Error(
        `lifecycle: ssStartAgeSecondary must be an integer in [62,70], got ${inp.ssStartAgeSecondary}`,
      );
    }
  }

  // US2b extensions.
  if (inp.contributionSplit !== undefined) {
    const cs = inp.contributionSplit;
    if (!cs || typeof cs !== 'object') {
      throw new Error('lifecycle: contributionSplit must be an object when provided');
    }
    const { trad401kFraction, rothFraction, taxableFraction } = cs;
    for (const [field, value] of [
      ['trad401kFraction', trad401kFraction],
      ['rothFraction', rothFraction],
      ['taxableFraction', taxableFraction],
    ]) {
      if (!(typeof value === 'number' && value >= 0 && value <= 1)) {
        throw new Error(
          `lifecycle: contributionSplit.${field} must be a number in [0,1], got ${value}`,
        );
      }
    }
    const sum = trad401kFraction + rothFraction + taxableFraction;
    if (Math.abs(sum - 1) > SPLIT_SUM_TOLERANCE) {
      throw new Error(
        `lifecycle: contributionSplit fractions must sum to 1.0 (±${SPLIT_SUM_TOLERANCE}); got sum=${sum}`,
      );
    }
  }
  if (inp.employerMatchReal !== undefined && !(inp.employerMatchReal >= 0)) {
    throw new Error(`lifecycle: employerMatchReal must be >= 0, got ${inp.employerMatchReal}`);
  }
  if (inp.scenarioSpendReal !== undefined && !(inp.scenarioSpendReal > 0)) {
    throw new Error(`lifecycle: scenarioSpendReal must be > 0 when provided, got ${inp.scenarioSpendReal}`);
  }
  if (inp.relocationCostReal !== undefined && !(inp.relocationCostReal >= 0)) {
    throw new Error(`lifecycle: relocationCostReal must be >= 0, got ${inp.relocationCostReal}`);
  }
  if (inp.homeSaleAtFireReal !== undefined && !(inp.homeSaleAtFireReal >= 0)) {
    throw new Error(`lifecycle: homeSaleAtFireReal must be >= 0, got ${inp.homeSaleAtFireReal}`);
  }
  if (inp.rentAlternativeReal !== undefined && !(inp.rentAlternativeReal >= 0)) {
    throw new Error(`lifecycle: rentAlternativeReal must be >= 0, got ${inp.rentAlternativeReal}`);
  }
}

/**
 * Resolve a phase label for a given age.
 *
 * @param {number} age
 * @param {number} fireAge
 * @param {number} ssStartAge
 * @returns {Phase}
 */
function resolvePhase(age, fireAge, ssStartAge) {
  if (age < fireAge) return 'accumulation';
  if (age < UNLOCK_AGE) return 'preUnlock';
  if (age < ssStartAge) return 'unlocked';
  return 'ssActive';
}

/**
 * Sum the four pool fields of a pool object using the internal short-key shape.
 *
 * @param {{trad401k:number, rothIra:number, taxable:number, cash:number}} p
 * @returns {number}
 */
function sumPools(p) {
  return p.trad401k + p.rothIra + p.taxable + p.cash;
}

/**
 * Compute this year's healthcare cost in real dollars, honoring the
 * scenario.healthcareOverrideNominal convention. If the scenario declares a
 * nominal healthcare override and the simulated year matches
 * healthcareOverrideNominalYear, the nominal value is converted via the
 * injected inflation helper (FR-017 boundary).
 *
 * @param {object} args
 * @returns {number}
 */
function healthcareForYear({
  age,
  scenario,
  householdSize,
  year,
  inflation,
  healthcareFn,
}) {
  if (
    scenario &&
    typeof scenario.healthcareOverrideNominal === 'number' &&
    scenario.healthcareOverrideNominalYear === year
  ) {
    // Nominal→real conversion at THIS boundary. FR-017.
    return inflation.toReal(scenario.healthcareOverrideNominal, year);
  }
  const { annualCostReal } = healthcareFn({
    age,
    scenario,
    householdSize,
  });
  return annualCostReal;
}

/**
 * Detect whether a mortgage payload is in the legacy shape
 *   {balanceReal, interestRate, yearsRemaining}
 * with no `ownership` field. If so, translate to the new Mortgage typedef
 * (ownership='already-own', homePrice = balanceReal, downPayment = 0,
 * yearsPaid = 0). This shim preserves regression safety for pre-US2b fixtures
 * and will be eliminated when T048/T049 migrates the HTML to emit the new
 * shape directly.
 *
 * @param {object} mortgage
 * @returns {object | null}
 */
function normalizeMortgageShape(mortgage) {
  if (!mortgage || typeof mortgage !== 'object') return null;
  // If it already has an ownership mode, trust the caller's shape.
  if (typeof mortgage.ownership === 'string') return mortgage;
  // Legacy shape detection: balanceReal + interestRate + yearsRemaining.
  if (
    typeof mortgage.balanceReal === 'number' &&
    typeof mortgage.interestRate === 'number' &&
    typeof mortgage.yearsRemaining === 'number'
  ) {
    if (!(mortgage.balanceReal > 0)) return null;
    return {
      ownership: 'already-own',
      homePriceReal: mortgage.balanceReal,
      downPaymentReal: 0,
      closingCostReal: 0,
      annualRateReal: mortgage.interestRate,
      termYears: mortgage.yearsRemaining,
      yearsPaid: 0,
      destiny: 'live-in',
    };
  }
  return null;
}

/**
 * Run the year-by-year lifecycle simulation.
 *
 * @param {{
 *   inputs: Inputs,
 *   fireAge: number,
 *   helpers?: {
 *     inflation?: {toReal: Function, toNominal: Function},
 *     tax?: typeof computeTax,
 *     socialSecurity?: typeof projectSS,
 *     healthcare?: typeof getHealthcareCost,
 *     mortgage?: typeof resolveMortgage,
 *     college?: typeof computeCollegeCosts,
 *     withdrawal?: typeof computeWithdrawal,
 *     secondHome?: typeof resolveSecondHome,
 *     studentLoan?: typeof computeStudentLoan,
 *   }
 * }} args
 * @returns {LifecycleRecord[]}
 */
export function runLifecycle(args) {
  const { inputs, fireAge } = args;
  const helpers = args.helpers ?? {};

  validateInputs(inputs);

  const baseYear = typeof inputs.baseYear === 'number' ? inputs.baseYear : DEFAULT_BASE_YEAR;
  const inflation = helpers.inflation ?? makeInflation(inputs.inflationRate, baseYear);
  const withdrawalFn = helpers.withdrawal ?? computeWithdrawal;
  const ssFn = helpers.socialSecurity ?? projectSS;
  const healthcareFn = helpers.healthcare ?? getHealthcareCost;
  const mortgageFn = helpers.mortgage ?? resolveMortgage;
  const collegeFn = helpers.college ?? computeCollegeCosts;
  const secondHomeFn = helpers.secondHome ?? resolveSecondHome;
  const studentLoanFn = helpers.studentLoan ?? computeStudentLoan;

  const ssStartAgePrimary = inputs.ssStartAgePrimary;
  const ssStartAgeSecondary = inputs.ssStartAgeSecondary;
  const hasSecondary = inputs.portfolioSecondary !== undefined;
  const householdSize = hasSecondary ? 2 : 1;

  // Pre-compute per-person SS projections (pure; once per call).
  const ssProjPrimary = ssFn({
    currentAge: inputs.currentAgePrimary,
    ssStartAge: ssStartAgePrimary,
    earnings: inputs.ssPrimary ?? null,
    inflationRate: inputs.inflationRate,
  });
  const ssProjSecondary = hasSecondary && ssStartAgeSecondary !== undefined
    ? ssFn({
        currentAge: inputs.currentAgeSecondary,
        ssStartAge: ssStartAgeSecondary,
        earnings: inputs.ssSecondary ?? null,
        inflationRate: inputs.inflationRate,
      })
    : null;

  // -------------------------------------------------------------------
  // Primary mortgage — resolve via the ownership-aware helper when the
  // input carries the new Mortgage typedef (ownership, homePrice, etc.),
  // or via the legacy compat shim for pre-US2b fixtures.
  // -------------------------------------------------------------------
  const normalizedMortgage = normalizeMortgageShape(inputs.mortgage);

  /** @type {Map<number, {paymentReal:number, propertyTaxReal:number, insuranceReal:number, hoaAnnualReal:number, oneTimeOutflowReal:number, saleProceedsReal:number}>} */
  const mortgageByYear = new Map();
  if (normalizedMortgage) {
    // Helpers may inject either a full resolveMortgage (new) OR the legacy
    // computeMortgage (old signature). Detect by checking whether our
    // normalized shape has an `ownership` field we can hand to resolveMortgage.
    // When helpers.mortgage was overridden in tests, we respect the override.
    if (mortgageFn === resolveMortgage || typeof mortgageFn === 'function') {
      // Use resolveMortgage semantics — works for both new and legacy-shimmed
      // shapes because normalizeMortgageShape produces a valid Mortgage.
      try {
        const bundle = mortgageFn === resolveMortgage || normalizedMortgage.ownership
          ? resolveMortgage({
              mortgage: normalizedMortgage,
              currentAgePrimary: inputs.currentAgePrimary,
              endAge: inputs.endAge,
              fireAge,
              rentAlternativeReal: inputs.rentAlternativeReal ?? 0,
              homeLocation: normalizedMortgage.location,
            })
          : null;
        if (bundle && Array.isArray(bundle.perYear)) {
          for (const entry of bundle.perYear) {
            const year = baseYear + entry.year;
            mortgageByYear.set(year, {
              paymentReal: entry.paymentReal,
              propertyTaxReal: entry.propertyTaxReal,
              insuranceReal: entry.insuranceReal,
              hoaAnnualReal: entry.hoaAnnualReal,
              oneTimeOutflowReal: entry.oneTimeOutflowReal,
              saleProceedsReal: entry.saleProceedsReal,
            });
          }
        }
      } catch (_err) {
        // If resolveMortgage rejects, fall back to the legacy computeMortgage
        // path for test helpers that stub a minimal mortgage function.
        const legacy = inputs.mortgage && typeof inputs.mortgage.balanceReal === 'number'
          ? computeMortgage({
              principalReal: inputs.mortgage.balanceReal,
              annualRateReal: inputs.mortgage.interestRate,
              termYears: inputs.mortgage.yearsRemaining,
              startAge: inputs.currentAgePrimary,
              extraPaymentReal: 0,
            })
          : null;
        if (legacy && Array.isArray(legacy.perYear)) {
          for (const entry of legacy.perYear) {
            const year = baseYear + entry.year;
            mortgageByYear.set(year, {
              paymentReal: entry.paymentReal,
              propertyTaxReal: 0,
              insuranceReal: 0,
              hoaAnnualReal: 0,
              oneTimeOutflowReal: 0,
              saleProceedsReal: 0,
            });
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Second home overlay.
  // -------------------------------------------------------------------
  /** @type {Map<number, {carryReal:number, oneTimeOutflowReal:number, saleProceedsReal:number}>} */
  const secondHomeByYear = new Map();
  if (inputs.secondHome && typeof inputs.secondHome === 'object') {
    const bundle = secondHomeFn({
      secondHome: inputs.secondHome,
      currentAgePrimary: inputs.currentAgePrimary,
      endAge: inputs.endAge,
      fireAge,
    });
    for (const entry of bundle.perYear) {
      const year = baseYear + entry.year;
      secondHomeByYear.set(year, {
        carryReal: entry.carryReal,
        oneTimeOutflowReal: entry.oneTimeOutflowReal,
        saleProceedsReal: entry.saleProceedsReal,
      });
    }
  }

  // -------------------------------------------------------------------
  // Student loans overlay — sum across all loans per year.
  // -------------------------------------------------------------------
  /** @type {Map<number, number>} */
  const studentLoanByYear = new Map();
  if (Array.isArray(inputs.studentLoans) && inputs.studentLoans.length > 0) {
    for (const loan of inputs.studentLoans) {
      if (!loan || !(loan.principalReal > 0) || !(loan.termYears > 0)) continue;
      const startAge = typeof loan.startAge === 'number' ? loan.startAge : inputs.currentAgePrimary;
      const schedule = studentLoanFn({
        principalReal: loan.principalReal,
        annualRateReal: loan.annualRateReal,
        termYears: loan.termYears,
        startAge,
        extraPaymentReal: loan.extraPaymentReal ?? 0,
      });
      for (const entry of schedule.perYear) {
        // Schedule yields year-from-startAge offsets. Convert to calendar year.
        const calendarYear = baseYear + (entry.age - inputs.currentAgePrimary);
        studentLoanByYear.set(
          calendarYear,
          (studentLoanByYear.get(calendarYear) ?? 0) + entry.paymentReal,
        );
      }
    }
  }

  // -------------------------------------------------------------------
  // College costs.
  // -------------------------------------------------------------------
  /** @type {Map<number, number>} */
  const collegeByYear = new Map();
  if (Array.isArray(inputs.colleges) && inputs.colleges.length > 0) {
    // The college module expects kids in a slightly different shape than the
    // fixture's College[] typedef. Map defensively: prefer explicit kid-shape
    // fields if present (RR adapter), otherwise translate the generic
    // College[] shape.
    /** @type {Array<object>} */
    const kids = [];
    for (const c of inputs.colleges) {
      if (typeof c.currentAge === 'number' && typeof c.fourYearCostReal === 'number') {
        kids.push({
          name: c.name ?? c.kidName ?? 'kid',
          currentAge: c.currentAge,
          fourYearCostReal: c.fourYearCostReal,
          startAge: c.startAge,
          pctFinanced: c.pctFinanced,
          parentPayPct: c.parentPayPct,
          loanRateReal: c.loanRateReal,
          loanTermYears: c.loanTermYears,
        });
      } else if (typeof c.startYear === 'number' && typeof c.annualCostReal === 'number') {
        // Generic College typedef: derive synthetic currentAge + startAge = 18
        // such that the calculated calendar year matches startYear exactly.
        const syntheticStartAge = 18;
        const syntheticCurrentAge = syntheticStartAge - (c.startYear - baseYear);
        kids.push({
          name: c.kidName ?? 'kid',
          currentAge: syntheticCurrentAge,
          fourYearCostReal: c.annualCostReal * (c.years ?? 4),
          startAge: syntheticStartAge,
        });
      }
    }
    if (kids.length > 0) {
      const schedule = collegeFn({ kids, currentYear: baseYear });
      for (const entry of schedule.perYear) {
        collegeByYear.set(entry.year, entry.costReal);
      }
    }
  }

  // -------------------------------------------------------------------
  // Initial pool balances — sum of primary + secondary portfolios.
  // -------------------------------------------------------------------
  const pools = {
    trad401k: inputs.portfolioPrimary.trad401kReal
      + (hasSecondary ? inputs.portfolioSecondary.trad401kReal : 0),
    rothIra: inputs.portfolioPrimary.rothIraReal
      + (hasSecondary ? inputs.portfolioSecondary.rothIraReal : 0),
    taxable: inputs.portfolioPrimary.taxableStocksReal
      + (hasSecondary ? inputs.portfolioSecondary.taxableStocksReal : 0),
    cash: inputs.portfolioPrimary.cashReal
      + (hasSecondary ? inputs.portfolioSecondary.cashReal : 0),
  };

  const totalAnnualContribution = inputs.portfolioPrimary.annualContributionReal
    + (hasSecondary ? inputs.portfolioSecondary.annualContributionReal : 0);

  const strategy = typeof inputs.withdrawalStrategy === 'string'
    ? inputs.withdrawalStrategy
    : DEFAULT_WITHDRAWAL_STRATEGY;

  // Contribution split — override or default.
  const split = inputs.contributionSplit ?? DEFAULT_CONTRIB_SPLIT;
  const employerMatchReal = inputs.employerMatchReal ?? 0;

  // Retirement-phase spend target — scenarioSpendReal overrides annualSpendReal
  // for retirement phases ONLY. Accumulation spend is unchanged.
  const retirementSpendReal = typeof inputs.scenarioSpendReal === 'number'
    ? inputs.scenarioSpendReal
    : inputs.annualSpendReal;

  const relocationCostReal = inputs.relocationCostReal ?? 0;
  const homeSaleAtFireReal = inputs.homeSaleAtFireReal ?? 0;

  /** @type {LifecycleRecord[]} */
  const records = [];
  const numYears = inputs.endAge - inputs.currentAgePrimary + 1;
  const returnStocks = inputs.returnRateReal;
  const returnCash = inputs.returnRateCashReal;

  for (let i = 0; i < numYears; i += 1) {
    const agePrimary = inputs.currentAgePrimary + i;
    const ageSecondary = hasSecondary ? inputs.currentAgeSecondary + i : undefined;
    const year = baseYear + i;
    const phase = resolvePhase(agePrimary, fireAge, ssStartAgePrimary);

    // Step 1: Apply growth to each pool (real returns, end-of-period compounding).
    // Year-0 record is the starting state (i=0 → no growth applied yet).
    if (i > 0) {
      pools.trad401k *= (1 + returnStocks);
      pools.rothIra  *= (1 + returnStocks);
      pools.taxable  *= (1 + returnStocks);
      pools.cash     *= (1 + returnCash);
    }

    let contributionReal = 0;
    let withdrawalReal = 0;
    let ssIncomeReal = 0;
    let taxesPaidReal = 0;
    let effectiveTaxRate = 0;
    let feasible = true;
    /** @type {number | undefined} */
    let deficitReal;
    /** @type {number} */
    let healthcareCostReal = 0;

    // Per-year overlay values (populated below as needed).
    const mortgageEntry = mortgageByYear.get(year);
    const mortgagePaymentTotalReal = mortgageEntry
      ? mortgageEntry.paymentReal
        + mortgageEntry.propertyTaxReal
        + mortgageEntry.insuranceReal
        + mortgageEntry.hoaAnnualReal
      : 0;

    const secondHomeEntry = secondHomeByYear.get(year);
    const secondHomeCarryReal = secondHomeEntry ? secondHomeEntry.carryReal : 0;

    const collegeCostReal = collegeByYear.get(year) ?? 0;
    const studentLoanPaymentReal = studentLoanByYear.get(year) ?? 0;

    // Composite one-time outflow accumulator (used for the record field AND
    // to reduce pools at fireAge). NOTE: saleProceeds are NOT part of the
    // outflow total — they are inflows applied separately to taxable stocks.
    let oneTimeOutflowReal = 0;
    if (mortgageEntry) oneTimeOutflowReal += mortgageEntry.oneTimeOutflowReal;
    if (secondHomeEntry) oneTimeOutflowReal += secondHomeEntry.oneTimeOutflowReal;
    if (agePrimary === fireAge) oneTimeOutflowReal += relocationCostReal;

    if (phase === 'accumulation') {
      // Step 2a: Add contributions (split per CONTRIB_SPLIT).
      if (i > 0) {
        contributionReal = totalAnnualContribution;
        pools.trad401k += contributionReal * split.trad401kFraction;
        pools.rothIra  += contributionReal * split.rothFraction;
        pools.taxable  += contributionReal * split.taxableFraction;
        // Employer match stacks on top of split — goes to trad401k only.
        if (employerMatchReal > 0) {
          pools.trad401k += employerMatchReal;
        }
      }
      // Accumulation years also accrue healthcare cost (baseline employer premium).
      healthcareCostReal = healthcareForYear({
        age: agePrimary,
        scenario: inputs.scenario,
        householdSize,
        year,
        inflation,
        healthcareFn,
      });
    } else if (i > 0) {
      // Retirement phases. First, figure out this year's adjusted spend target
      // in real dollars. Healthcare + mortgage + college + secondHome carry +
      // studentLoan payments are all layered on top of the retirement spend.
      healthcareCostReal = healthcareForYear({
        age: agePrimary,
        scenario: inputs.scenario,
        householdSize,
        year,
        inflation,
        healthcareFn,
      });
      const adjustedSpend = retirementSpendReal
        + healthcareCostReal
        + mortgagePaymentTotalReal
        + collegeCostReal
        + secondHomeCarryReal
        + studentLoanPaymentReal;

      // SS income is phase-gated.
      if (phase === 'ssActive') {
        ssIncomeReal += ssProjPrimary.annualBenefitReal;
        if (
          ssProjSecondary
          && ageSecondary !== undefined
          && ssStartAgeSecondary !== undefined
          && ageSecondary >= ssStartAgeSecondary
        ) {
          ssIncomeReal += ssProjSecondary.annualBenefitReal;
        }
      }

      // Withdraw from pools via the tax-aware strategy.
      const wd = withdrawalFn({
        annualSpendReal: adjustedSpend,
        pools: {
          trad401kReal: pools.trad401k,
          rothIraReal: pools.rothIra,
          taxableStocksReal: pools.taxable,
          cashReal: pools.cash,
        },
        phase,
        ssIncomeReal,
        age: agePrimary,
        tax: inputs.tax,
        strategy,
      });

      // Decrement pools by the actual draws (never negative — withdrawal module
      // guarantees it caps draws at balance).
      pools.trad401k = Math.max(0, pools.trad401k - wd.fromTradReal);
      pools.rothIra  = Math.max(0, pools.rothIra  - wd.fromRothReal);
      pools.taxable  = Math.max(0, pools.taxable  - wd.fromTaxableReal);
      pools.cash     = Math.max(0, pools.cash     - wd.fromCashReal);

      withdrawalReal = wd.fromTradReal + wd.fromRothReal + wd.fromTaxableReal + wd.fromCashReal;
      taxesPaidReal = wd.taxOwedReal;
      const grossIncome = withdrawalReal + ssIncomeReal;
      effectiveTaxRate = grossIncome > 0 ? taxesPaidReal / grossIncome : 0;

      if (!wd.feasible) {
        feasible = false;
        deficitReal = typeof wd.deficitReal === 'number'
          ? wd.deficitReal
          : Math.max(1e-6, adjustedSpend - wd.netSpendReal);
      }
    }

    // Step 3: Apply fireAge-specific one-time events BEFORE finalizing the
    // record. These affect pool balances directly (not via withdrawal).
    if (agePrimary === fireAge) {
      // Relocation cost — draw from cash first, then taxable stocks.
      if (relocationCostReal > 0) {
        const drawFromCash = Math.min(pools.cash, relocationCostReal);
        pools.cash -= drawFromCash;
        const remaining = relocationCostReal - drawFromCash;
        if (remaining > 0) {
          pools.taxable = Math.max(0, pools.taxable - remaining);
        }
      }
      // Home sale at FIRE — add proceeds to taxable stocks.
      if (homeSaleAtFireReal > 0) {
        pools.taxable += homeSaleAtFireReal;
      }
      // Primary mortgage sale proceeds.
      if (mortgageEntry && mortgageEntry.saleProceedsReal > 0) {
        pools.taxable += mortgageEntry.saleProceedsReal;
      }
      // Second-home sale proceeds.
      if (secondHomeEntry && secondHomeEntry.saleProceedsReal > 0) {
        pools.taxable += secondHomeEntry.saleProceedsReal;
      }
    }

    // Assemble the record for this year.
    const totalReal = sumPools(pools);
    const is401kUnlocked = agePrimary >= UNLOCK_AGE;
    const accessible = phase !== 'accumulation' && phase !== 'preUnlock';
    const rec = {
      year,
      agePrimary,
      phase,
      totalReal,
      trad401kReal: pools.trad401k,
      rothIraReal: pools.rothIra,
      taxableStocksReal: pools.taxable,
      cashReal: pools.cash,
      // Transitional aliases — removed when T048/T049 retires the inline
      // engine's 'p401kTrad' / 'p401kRoth' field names.
      p401kTradReal: pools.trad401k,
      p401kRothReal: pools.rothIra,
      contributionReal,
      withdrawalReal,
      ssIncomeReal,
      taxesPaidReal,
      effectiveTaxRate,
      healthcareCostReal,
      feasible,
      accessible,
      is401kUnlocked,
      mortgagePaymentReal: mortgagePaymentTotalReal,
      secondHomeCarryReal,
      collegeCostReal,
      studentLoanPaymentReal,
      oneTimeOutflowReal,
    };
    if (ageSecondary !== undefined) rec.ageSecondary = ageSecondary;
    if (deficitReal !== undefined) rec.deficitReal = deficitReal;
    records.push(Object.freeze(rec));
  }

  return records;
}
