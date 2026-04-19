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
 *       withdrawal                              {} is explicitly supported.
 *     }
 *   }
 *
 * Outputs: LifecycleRecord[] (data-model.md §3)
 *   One record per year from inputs.currentAgePrimary through inputs.endAge inclusive.
 *
 * Consumers:
 *   - growthChart renderer      — totalReal, phase, feasible, pool balances
 *   - ssChart renderer          — totalReal, ssIncomeReal, phase
 *   - rothLadderChart renderer  — withdrawalReal, pool balances by year
 *   - timelineChart renderer    — phase, age, year, overlays
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
 *
 * Contribution split during accumulation (documented; future feature may refine):
 *   60% → trad401kReal, 20% → rothIraReal, 20% → taxableStocksReal.
 *   Cash pool does not receive new contributions — it is only spent down in
 *   retirement and earns returnRateCashReal.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

import { makeInflation } from './inflation.js';
import { computeTax } from './tax.js';
import { projectSS } from './socialSecurity.js';
import { getHealthcareCost } from './healthcare.js';
import { computeMortgage } from './mortgage.js';
import { computeCollegeCosts } from './college.js';
import { computeWithdrawal } from './withdrawal.js';

/**
 * @typedef {import('../tests/fixtures/types.js').Inputs}          Inputs
 * @typedef {import('../tests/fixtures/types.js').LifecycleRecord} LifecycleRecord
 * @typedef {import('../tests/fixtures/types.js').Phase}           Phase
 */

/** Default calendar base year when fixture doesn't supply one. */
const DEFAULT_BASE_YEAR = 2026;

/** 401(k) unlock age — 59.5 rounded to the end-of-year boundary. */
const UNLOCK_AGE = 60;

/** Contribution allocation rule (see header). */
const CONTRIB_SPLIT = Object.freeze({
  trad401k: 0.60,
  rothIra:  0.20,
  taxable:  0.20,
});

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
 *     mortgage?: typeof computeMortgage,
 *     college?: typeof computeCollegeCosts,
 *     withdrawal?: typeof computeWithdrawal,
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
  const mortgageFn = helpers.mortgage ?? computeMortgage;
  const collegeFn = helpers.college ?? computeCollegeCosts;

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

  // Pre-compute mortgage + college schedules so per-year lookups are O(1).
  /** @type {Map<number, number>} */
  const mortgageByYear = new Map();
  if (inputs.mortgage && inputs.mortgage.balanceReal > 0) {
    const schedule = mortgageFn({
      principalReal: inputs.mortgage.balanceReal,
      annualRateReal: inputs.mortgage.interestRate,
      termYears: inputs.mortgage.yearsRemaining,
      startAge: inputs.currentAgePrimary,
      extraPaymentReal: 0,
    });
    for (const entry of schedule.perYear) {
      mortgageByYear.set(baseYear + entry.year, entry.paymentReal);
    }
  }

  /** @type {Map<number, number>} */
  const collegeByYear = new Map();
  if (Array.isArray(inputs.colleges) && inputs.colleges.length > 0) {
    // The college module expects kids in a slightly different shape than the
    // fixture's College[] typedef. Map defensively: prefer explicit kid-shape
    // fields if present (RR adapter), otherwise translate the generic
    // College[] shape.
    /** @type {Array<{name:string, currentAge:number, fourYearCostReal:number, startAge?:number}>} */
    const kids = [];
    for (const c of inputs.colleges) {
      if (typeof c.currentAge === 'number' && typeof c.fourYearCostReal === 'number') {
        kids.push({
          name: c.name ?? c.kidName ?? 'kid',
          currentAge: c.currentAge,
          fourYearCostReal: c.fourYearCostReal,
          startAge: c.startAge,
        });
      } else if (typeof c.startYear === 'number' && typeof c.annualCostReal === 'number') {
        // Generic College typedef: derive synthetic currentAge + startAge = 18
        // such that the calculated calendar year matches startYear exactly.
        // year = baseYear + (startAge - currentAge) → currentAge = 18 - (startYear - baseYear).
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

  // Initial pool balances — sum of primary + secondary portfolios.
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

    if (phase === 'accumulation') {
      // Step 2a: Add contributions (split per CONTRIB_SPLIT).
      if (i > 0) {
        contributionReal = totalAnnualContribution;
        pools.trad401k += contributionReal * CONTRIB_SPLIT.trad401k;
        pools.rothIra  += contributionReal * CONTRIB_SPLIT.rothIra;
        pools.taxable  += contributionReal * CONTRIB_SPLIT.taxable;
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
      // in real dollars. Healthcare + mortgage + college are all layered on top
      // of the baseline annualSpendReal.
      healthcareCostReal = healthcareForYear({
        age: agePrimary,
        scenario: inputs.scenario,
        householdSize,
        year,
        inflation,
        healthcareFn,
      });
      const mortgagePayment = mortgageByYear.get(year) ?? 0;
      const collegeCost = collegeByYear.get(year) ?? 0;
      const adjustedSpend = inputs.annualSpendReal
        + healthcareCostReal
        + mortgagePayment
        + collegeCost;

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

    // Assemble the record for this year.
    const totalReal = sumPools(pools);
    const rec = {
      year,
      agePrimary,
      phase,
      totalReal,
      trad401kReal: pools.trad401k,
      rothIraReal: pools.rothIra,
      taxableStocksReal: pools.taxable,
      cashReal: pools.cash,
      contributionReal,
      withdrawalReal,
      ssIncomeReal,
      taxesPaidReal,
      effectiveTaxRate,
      healthcareCostReal,
      feasible,
    };
    if (ageSecondary !== undefined) rec.ageSecondary = ageSecondary;
    if (deficitReal !== undefined) rec.deficitReal = deficitReal;
    records.push(Object.freeze(rec));
  }

  return records;
}
