/*
 * calc/secondHome.js — additive lifecycle overlay for a second property.
 *
 * Unlike `calc/mortgage.js` (primary residence — supplies housing in place of
 * rent), Home #2 stacks costs on top of the primary housing arrangement:
 * upfront purchase outflow, annual carry cost (P&I + property tax + other
 * carry minus rental income), optional sale proceeds at FIRE, or legacy
 * value at end-of-plan.
 *
 * Inputs:
 *   params: {
 *     secondHome: SecondHome,      // data-model.md §1c
 *     currentAgePrimary: number,
 *     endAge:            number,
 *     fireAge:           number,
 *   }
 *
 * Outputs: SecondHomeLifecycleBundle (contracts/secondHome.contract.md)
 *   {
 *     perYear: Array<{
 *       year:               number,  // 0-indexed offset from currentAgePrimary
 *       age:                number,  // currentAgePrimary + year
 *       carryReal:          number,  // annualPI + propertyTax + otherCarry − rentalIncome
 *                                    //   (0 pre-purchase; 0 post-sale; may be negative
 *                                    //    while owned if rental income > carrying costs)
 *       oneTimeOutflowReal: number,  // downPayment + closingCost the year age === purchaseAge
 *       saleProceedsReal:   number,  // net proceeds at fireAge when destiny === 'sell'
 *       owned:              boolean, // is Home #2 on the books this year?
 *     }>,
 *     legacyValueAtEndReal: number,  // appreciated value at endAge when destiny === 'inherit'
 *   }
 *
 * Consumers:
 *   - calc/lifecycle.js   — applies oneTimeOutflowReal at purchase, adds
 *                           carryReal to withdrawals / subtracts from savings
 *                           each owned year, adds saleProceedsReal to taxable
 *                           stocks at fireAge when destiny === 'sell'.
 *   - secondHomeImpact HTML panel — displays legacy / sale / cumulative carry.
 *
 * Invariants:
 *   - perYear.length === endAge − currentAgePrimary + 1.
 *   - Exactly one year has oneTimeOutflowReal > 0 — the year age === purchaseAge
 *     (or zero if purchaseAge > endAge).
 *   - At most one year has saleProceedsReal > 0 — year age === fireAge when
 *     destiny === 'sell' AND purchaseAge <= fireAge <= endAge.
 *   - carryReal is the same annual amount every owned year until sale (the
 *     household pays a constant equal-payment mortgage, flat property tax,
 *     and constant other-carry in real dollars). After sale, carry = 0.
 *   - All values real dollars — inflation happens only via calc/inflation.js.
 *
 * Purity: no DOM, no Chart.js, no globals, no I/O, no module-scope mutation.
 */

const MONTHS_PER_YEAR = 12;

const SELLING_COST_PCT_BY_LOCATION = Object.freeze({
  us: 0.07,
  tw: 0.04,
  jp: 0.06,
});

function sellingCostPct(location) {
  if (typeof location !== 'string') return SELLING_COST_PCT_BY_LOCATION.us;
  const key = location.toLowerCase();
  const pct = SELLING_COST_PCT_BY_LOCATION[key];
  return typeof pct === 'number' ? pct : SELLING_COST_PCT_BY_LOCATION.us;
}

/**
 * Closed-form fixed monthly payment on a standard amortizing loan.
 * Returns 0 when the loan has zero principal (cash-only purchase).
 *
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} termYears
 */
function annualPIReal(principal, annualRate, termYears) {
  if (!(principal > 0) || !(termYears > 0)) return 0;
  const r = annualRate / MONTHS_PER_YEAR;
  const n = termYears * MONTHS_PER_YEAR;
  if (Math.abs(r) < 1e-12) return (principal / n) * MONTHS_PER_YEAR;
  const monthly = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * MONTHS_PER_YEAR;
}

/**
 * Closed-form remaining balance after monthsElapsed months of amortization.
 *
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} termYears
 * @param {number} monthsElapsed
 */
function remainingBalance(principal, annualRate, termYears, monthsElapsed) {
  if (!(principal > 0) || !(termYears > 0)) return 0;
  const n = termYears * MONTHS_PER_YEAR;
  if (monthsElapsed >= n) return 0;
  const r = annualRate / MONTHS_PER_YEAR;
  if (Math.abs(r) < 1e-12) {
    return principal * (1 - monthsElapsed / n);
  }
  const pmt =
    (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return (
    principal * Math.pow(1 + r, monthsElapsed) -
    (pmt * (Math.pow(1 + r, monthsElapsed) - 1)) / r
  );
}

/**
 * Resolve a SecondHome input into a lifecycle-indexed overlay bundle.
 *
 * @param {{
 *   secondHome: object,
 *   currentAgePrimary: number,
 *   endAge: number,
 *   fireAge: number,
 * }} params
 * @returns {{
 *   perYear: ReadonlyArray<{
 *     year: number,
 *     age: number,
 *     carryReal: number,
 *     oneTimeOutflowReal: number,
 *     saleProceedsReal: number,
 *     owned: boolean,
 *   }>,
 *   legacyValueAtEndReal: number,
 * }}
 */
export function resolveSecondHome(params) {
  const { secondHome, currentAgePrimary, endAge, fireAge } = params;
  if (!secondHome || typeof secondHome !== 'object') {
    throw new Error('resolveSecondHome: secondHome param is required');
  }
  if (!(endAge >= currentAgePrimary)) {
    throw new Error(
      `resolveSecondHome: endAge (${endAge}) must be >= currentAgePrimary (${currentAgePrimary})`,
    );
  }

  const {
    homePriceReal,
    downPaymentReal = 0,
    closingCostReal = 0,
    annualRateReal = 0,
    termYears = 0,
    propertyTaxReal = 0,
    otherCarryReal = 0,
    rentalIncomeReal = 0,
    appreciationReal = 0,
    purchaseAge,
    destiny = 'live-in',
    location,
  } = secondHome;

  if (!Number.isFinite(purchaseAge)) {
    throw new Error('resolveSecondHome: secondHome.purchaseAge is required');
  }
  if (purchaseAge < currentAgePrimary) {
    throw new Error(
      `resolveSecondHome: purchaseAge (${purchaseAge}) must be >= currentAgePrimary (${currentAgePrimary})`,
    );
  }
  if (!(homePriceReal >= downPaymentReal)) {
    throw new Error(
      `resolveSecondHome: homePriceReal (${homePriceReal}) must be >= downPaymentReal (${downPaymentReal})`,
    );
  }
  if (destiny !== 'sell' && destiny !== 'live-in' && destiny !== 'inherit') {
    throw new Error(
      `resolveSecondHome: destiny must be one of sell|live-in|inherit; got '${destiny}'`,
    );
  }

  const loanPrincipal = Math.max(0, homePriceReal - downPaymentReal);
  const annualPI = annualPIReal(loanPrincipal, annualRateReal, termYears);
  const carryPerYear =
    annualPI + propertyTaxReal + otherCarryReal - rentalIncomeReal;
  const sellPct = sellingCostPct(location);

  // Sale proceeds analytical calculation at fireAge (only when destiny === 'sell').
  const willSell =
    destiny === 'sell' && fireAge >= purchaseAge && fireAge <= endAge;
  let saleProceedsAtFire = 0;
  if (willSell) {
    const yearsOwnedAtFire = fireAge - purchaseAge;
    const homeValueAtFire = homePriceReal * Math.pow(1 + appreciationReal, yearsOwnedAtFire);
    const loanBalanceAtFire = remainingBalance(
      loanPrincipal,
      annualRateReal,
      termYears,
      yearsOwnedAtFire * MONTHS_PER_YEAR,
    );
    saleProceedsAtFire = Math.max(
      0,
      homeValueAtFire * (1 - sellPct) - loanBalanceAtFire,
    );
  }

  /** @type {Array<object>} */
  const perYear = [];
  let alreadySold = false;

  for (let age = currentAgePrimary; age <= endAge; age += 1) {
    const year = age - currentAgePrimary;
    const preOwned = age < purchaseAge;
    const owned = !preOwned && !alreadySold;

    let carryReal = 0;
    let oneTimeOutflowReal = 0;
    let saleProceedsReal = 0;

    if (owned) {
      carryReal = carryPerYear;
      if (age === purchaseAge) {
        oneTimeOutflowReal = downPaymentReal + closingCostReal;
      }
      if (age === fireAge && willSell) {
        saleProceedsReal = saleProceedsAtFire;
        alreadySold = true;
      }
    }

    // Post-sale years: owned flips false the year AFTER fireAge (since sale
    // happens at fireAge). The `alreadySold` flag is set at fireAge; since
    // we compute `owned` before applying the sale, the fireAge record itself
    // retains owned: true, carryReal > 0, saleProceedsReal > 0. Subsequent
    // years see owned: false, all zeros.
    perYear.push(Object.freeze({
      year,
      age,
      carryReal,
      oneTimeOutflowReal,
      saleProceedsReal,
      owned,
    }));
  }

  let legacyValueAtEndReal = 0;
  if (destiny === 'inherit' && purchaseAge <= endAge) {
    const yearsHeld = endAge - purchaseAge;
    legacyValueAtEndReal = homePriceReal * Math.pow(1 + appreciationReal, yearsHeld);
  }

  return Object.freeze({
    perYear: Object.freeze(perYear),
    legacyValueAtEndReal,
  });
}
