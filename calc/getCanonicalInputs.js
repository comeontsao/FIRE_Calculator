/*
 * calc/getCanonicalInputs.js — pure production adapter.
 *
 * Feature: 005-canonical-public-launch (FR-004)
 *
 * Inputs:   legacy `inp` object (from HTML getInputs())
 * Outputs:  Readonly<Inputs> — frozen canonical shape per
 *           specs/001-modular-calc-engine/data-model.md §1
 * Consumers: FIRE-Dashboard.html, FIRE-Dashboard-Generic.html,
 *            tests/baseline/browser-smoke.test.js
 *
 * Pure: no DOM, no globals, no side effects. Subject to Principle II strictness.
 *
 * Behavior (see contracts/adapter.contract.md):
 *   - Auto-detect RR-shape (inp.ageRoger / inp.rogerStocks / inp.roger401k*) vs
 *     Generic-shape (inp.agePerson1 / inp.person1Stocks / inp.person1_401k*).
 *   - Null-guard secondary person — if no secondary age present, omit
 *     currentAgeSecondary + portfolioSecondary + ssStartAgeSecondary entirely.
 *   - Pass-through mortgage shape directly (no normalizeMortgageShape helper).
 *   - Object.freeze() return at top level.
 *   - Throw `new Error('[getCanonicalInputs] missing required field: <name>')` on
 *     unrecoverable missing input (currently: primary age).
 *
 * Defaults applied (documented so consumers know what's automatic):
 *   - returnRate → 0.07 (nominal); inflationRate → 0.03; returnRateCashReal → 0.005
 *   - annualSpendReal → scenario-table lookup (selectedScenario → USD/yr)
 *   - solverMode → inp.fireMode ?? 'safe'
 *   - ssStartAgePrimary → inp.ssClaimAge ?? 67
 *   - endAge → inp.endAge ?? 95
 *   - taxConfig → DEFAULT_TAX_CONFIG (2025 MFJ US brackets)
 *   - buffers → { bufferUnlockMultiple: inp.bufferUnlock ?? 0, bufferSSMultiple: inp.bufferSS ?? 0 }
 *   - colleges → derived from RR (ageKid1/collegeKid1 …) OR Generic
 *     (childAges[]/childCollegePlans[]) inline arrays; empty array when none
 *   - employerMatchReal → inp.empMatch ?? 0
 *   - taxTradRate → inp.taxTrad ?? 0.15
 */

/**
 * Standard 2025 MFJ US tax brackets. The cold-load dashboards don't expose
 * bracket edits; this table mirrors the canonical fixtures in tests/fixtures.
 */
const DEFAULT_TAX_CONFIG = Object.freeze({
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
});

/**
 * Per-scenario cold-load annual-spend lookup — mirrors the inline engine's
 * SCENARIOS_BY_ID table. Unknown keys fall back to a conservative US baseline
 * so the canonical engine NEVER sees spend <= 0 (which would throw validation).
 */
const SCENARIO_ANNUAL_SPEND = Object.freeze({
  us: 120_000,
  taiwan: 60_000,
  japan: 72_000,
  thailand: 45_600,
  malaysia: 42_000,
  singapore: 102_000,
  vietnam: 36_000,
  philippines: 38_400,
  mexico: 48_000,
  costarica: 54_000,
  portugal: 62_400,
});

/**
 * Default per-child college cost (real dollars, 4 years). Matches the prototype
 * adapter value — the scenario-table detail lives in the inline engine for
 * now; the canonical engine just needs a positive real-dollar cost to
 * exercise the college-funding code path.
 */
const DEFAULT_FOUR_YEAR_COLLEGE_COST_REAL = 85_000 * 4;

/**
 * Build the canonical `colleges` array from either RR-shape (ageKid1/collegeKid1)
 * or Generic-shape (childAges[]/childCollegePlans[]). Kids with plan === 'none'
 * are omitted (zero-cost by construction).
 *
 * @param {object} inp
 * @returns {ReadonlyArray<object>}
 */
function buildColleges(inp) {
  const colleges = [];
  if (Array.isArray(inp.childAges)) {
    // Generic path — dynamic child list.
    for (let i = 0; i < inp.childAges.length; i += 1) {
      const kidAge = inp.childAges[i];
      const plan = (inp.childCollegePlans ?? [])[i] ?? 'us-private';
      if (plan === 'none') continue;
      if (typeof kidAge !== 'number') continue;
      colleges.push(Object.freeze({
        name: `child${i + 1}`,
        currentAge: Math.floor(kidAge),
        fourYearCostReal: DEFAULT_FOUR_YEAR_COLLEGE_COST_REAL,
      }));
    }
  } else {
    // RR path — fixed two-kid slots.
    const kid1Age = inp.ageKid1;
    const kid1Plan = inp.collegeKid1 ?? 'us-private';
    if (typeof kid1Age === 'number' && kid1Plan !== 'none') {
      colleges.push(Object.freeze({
        name: 'kid1',
        currentAge: Math.floor(kid1Age),
        fourYearCostReal: DEFAULT_FOUR_YEAR_COLLEGE_COST_REAL,
      }));
    }
    const kid2Age = inp.ageKid2;
    const kid2Plan = inp.collegeKid2 ?? 'us-private';
    if (typeof kid2Age === 'number' && kid2Plan !== 'none') {
      colleges.push(Object.freeze({
        name: 'kid2',
        currentAge: Math.floor(kid2Age),
        fourYearCostReal: DEFAULT_FOUR_YEAR_COLLEGE_COST_REAL,
      }));
    }
  }
  return Object.freeze(colleges);
}

/**
 * Convert legacy `inp` (from FIRE-Dashboard.html / FIRE-Dashboard-Generic.html
 * getInputs()) into the canonical `Inputs` shape consumed by every calc module.
 *
 * @param {object} inp
 * @returns {Readonly<object>}  frozen canonical Inputs
 */
export function getCanonicalInputs(inp) {
  if (!inp || typeof inp !== 'object') {
    throw new TypeError(
      `[getCanonicalInputs] expected an object, got ${typeof inp}`,
    );
  }

  // -------------------------------------------------------------------------
  // Shape detection + primary age (REQUIRED).
  // -------------------------------------------------------------------------
  // RR shape uses `ageRoger` / `rogerStocks` / `roger401kTrad`.
  // Generic shape uses `agePerson1` / `person1Stocks` / `person1_401kTrad`.
  const agePrimaryRaw = inp.ageRoger ?? inp.agePerson1;
  if (typeof agePrimaryRaw !== 'number') {
    throw new Error('[getCanonicalInputs] missing required field: currentAgePrimary (inp.ageRoger or inp.agePerson1)');
  }
  const currentAgePrimary = Math.floor(agePrimaryRaw);

  // -------------------------------------------------------------------------
  // Secondary age — optional; drives null-guard for portfolioSecondary etc.
  // -------------------------------------------------------------------------
  const ageSecondaryRaw = inp.ageRebecca ?? inp.agePerson2;
  const currentAgeSecondary = typeof ageSecondaryRaw === 'number'
    ? Math.floor(ageSecondaryRaw)
    : undefined;

  // -------------------------------------------------------------------------
  // Primary portfolio.
  // -------------------------------------------------------------------------
  // Per data-model §1 Portfolio note: Roth 401(k) pool merges into rothIraReal
  // (they behave identically for withdrawal ordering). Cash pool = cashSavings
  // + otherAssets (inline convention).
  const trad401k = inp.roger401kTrad ?? inp.person1_401kTrad ?? 0;
  const roth401k = inp.roger401kRoth ?? inp.person1_401kRoth ?? 0;
  const taxablePrimary = inp.rogerStocks ?? inp.person1Stocks ?? 0;
  const cashPrimary = (inp.cashSavings ?? 0) + (inp.otherAssets ?? 0);
  const monthlySavings = inp.monthlySavings ?? 0;
  const contrib401kTrad = inp.contrib401kTrad ?? 0;
  const contrib401kRoth = inp.contrib401kRoth ?? 0;
  const empMatch = inp.empMatch ?? 0;
  // Total primary annual contribution = monthly-savings × 12 + 401k Trad + 401k Roth + employer match.
  const annualContribPrimary =
    monthlySavings * 12 + contrib401kTrad + contrib401kRoth + empMatch;

  const portfolioPrimary = Object.freeze({
    trad401kReal: trad401k,
    rothIraReal: roth401k,
    taxableStocksReal: taxablePrimary,
    cashReal: cashPrimary,
    annualContributionReal: annualContribPrimary,
  });

  // -------------------------------------------------------------------------
  // Secondary portfolio — ONLY if secondary age present. Null-guard per
  // adapter.contract §3: omit entirely if no secondary person, rather than
  // emit `undefined` values or `{currentAge: NaN}`.
  // -------------------------------------------------------------------------
  let portfolioSecondary;
  if (currentAgeSecondary !== undefined) {
    const taxableSecondary = inp.rebeccaStocks ?? inp.person2Stocks ?? 0;
    portfolioSecondary = Object.freeze({
      trad401kReal: 0,
      rothIraReal: 0,
      taxableStocksReal: taxableSecondary,
      cashReal: 0,
      annualContributionReal: 0,
    });
  }

  // -------------------------------------------------------------------------
  // Returns / inflation — sliders are nominal; canonical needs REAL decimals.
  // -------------------------------------------------------------------------
  const returnNominal = inp.returnRate ?? 0.07;
  const inflationRate = inp.inflationRate ?? 0.03;
  const returnRateReal = returnNominal - inflationRate;
  // Inline cash pool grows at CASH_ANNUAL_GROWTH = 1.005 → 0.5% real.
  const returnRateCashReal = 0.005;

  // -------------------------------------------------------------------------
  // Spend (scenario-keyed).
  // -------------------------------------------------------------------------
  const scenarioKey = inp.selectedScenario ?? 'us';
  const annualSpendReal = SCENARIO_ANNUAL_SPEND[scenarioKey]
    ?? SCENARIO_ANNUAL_SPEND.us;

  // -------------------------------------------------------------------------
  // Mode / buffers / scenario.
  // -------------------------------------------------------------------------
  const solverMode = inp.fireMode ?? 'safe';

  const buffers = Object.freeze({
    bufferUnlockMultiple: inp.bufferUnlock ?? 0,
    bufferSSMultiple: inp.bufferSS ?? 0,
  });

  const scenario = Object.freeze({
    country: scenarioKey,
    healthcareScenario: scenarioKey,
  });

  // -------------------------------------------------------------------------
  // Colleges.
  // -------------------------------------------------------------------------
  const colleges = buildColleges(inp);

  // -------------------------------------------------------------------------
  // SS claim ages.
  // -------------------------------------------------------------------------
  const ssStartAgePrimary = inp.ssClaimAge ?? 67;
  const ssStartAgeSecondary = currentAgeSecondary !== undefined
    ? ssStartAgePrimary
    : undefined;

  // -------------------------------------------------------------------------
  // Horizon.
  // -------------------------------------------------------------------------
  const endAge = inp.endAge ?? 95;

  // -------------------------------------------------------------------------
  // Assemble canonical `Inputs`. Conditional fields (currentAgeSecondary,
  // portfolioSecondary, ssStartAgeSecondary) attach ONLY when their upstream
  // data was present — preserves calc/lifecycle.js validateInputs semantics.
  // -------------------------------------------------------------------------
  const canonical = {
    currentAgePrimary,
    endAge,
    portfolioPrimary,
    annualSpendReal,
    returnRateReal,
    returnRateCashReal,
    inflationRate,
    tax: DEFAULT_TAX_CONFIG,
    solverMode,
    buffers,
    scenario,
    colleges,
    ssStartAgePrimary,
    employerMatchReal: empMatch,
    taxTradRate: inp.taxTrad ?? 0.15,
  };

  if (currentAgeSecondary !== undefined) {
    canonical.currentAgeSecondary = currentAgeSecondary;
    canonical.portfolioSecondary = portfolioSecondary;
    canonical.ssStartAgeSecondary = ssStartAgeSecondary;
  }

  // -------------------------------------------------------------------------
  // Mortgage — pass-through per FR-025. If inp.mortgage is present and shaped
  // canonically, attach verbatim. Otherwise omit.
  // -------------------------------------------------------------------------
  if (inp.mortgage && typeof inp.mortgage === 'object') {
    canonical.mortgage = inp.mortgage;
  }

  return Object.freeze(canonical);
}
