/**
 * Feature 015 — Canonical scenario fixtures (dashboard `inp` shape).
 *
 * Four scenarios per quickstart.md and tasks.md T010:
 *   - youngSaver           — feasible, low age, decades to FIRE
 *   - midCareer            — feasible, mid age
 *   - preRetirement        — feasible, near FIRE
 *   - thetaZeroShortfall   — the user's exact bug case from feature 014 audit
 *
 * Used by:
 *   tests/unit/shortfallVisibility.test.js  (US1)
 *   tests/unit/thetaSweepFeasibility.test.js (US2)
 *   tests/unit/perStrategyFireAge.test.js   (US3)
 *   tests/unit/modeObjectiveOrthogonality.test.js (US4)
 *   tests/e2e/objective-label-verification.spec.ts (US5)
 *
 * Shape: dashboard's `inp` object (NOT the canonical `Inputs` shape used by
 * tests/fixtures/types.js). The dashboard's projectFullLifecycle / scoreAndRank
 * functions consume this shape directly.
 */

'use strict';

// Common defaults — extracted from tests/unit/strategies.test.js INP and adjusted.
function _baseInp(overrides) {
  return Object.assign({
    agePerson1: 42, agePerson2: 42,
    ageRoger: 42,
    person1_401kTrad: 150000, person1_401kRoth: 0,
    person1Stocks: 250000, person2Stocks: 100000,
    cashSavings: 80000, otherAssets: 0,
    annualIncome: 200000, raiseRate: 0.03,
    returnRate: 0.07, return401k: 0.07, inflationRate: 0.03,
    swr: 0.04, monthlySavings: 3000,
    contrib401kTrad: 15000, contrib401kRoth: 0, empMatch: 5000,
    taxTrad: 0.15, stockGainPct: 0.6,
    bufferUnlock: 1, bufferSS: 1,
    endAge: 100, ssClaimAge: 70,
    annualSpend: 72000,
    safetyMargin: 0.03, rule55: { enabled: false, separationAge: 54 }, irmaaThreshold: 212000,
  }, overrides || {});
}

// Young saver — 32, $150K total, $48k/yr spend, 25 years to grow.
const youngSaver = Object.freeze({
  name: 'youngSaver',
  description: 'Single saver age 32, $150K portfolio, $48K spend, $4K/mo savings — feasible',
  inp: Object.freeze(_baseInp({
    agePerson1: 32, agePerson2: 32, ageRoger: 32,
    person1_401kTrad: 60000, person1_401kRoth: 0,
    person1Stocks: 70000, person2Stocks: 0,
    cashSavings: 20000, otherAssets: 0,
    annualIncome: 110000, monthlySavings: 4000,
    annualSpend: 48000,
  })),
  expected: Object.freeze({
    hasShortfall: false,
    shortfallYearAges: [],
    feasibleUnderSafe: true,
  }),
});

// Mid-career — 45, $750K total, $80k/yr spend.
const midCareer = Object.freeze({
  name: 'midCareer',
  description: 'Mid-career couple age 45, $750K portfolio, $80K spend — feasible',
  inp: Object.freeze(_baseInp({
    agePerson1: 45, agePerson2: 45, ageRoger: 45,
    person1_401kTrad: 250000, person1_401kRoth: 50000,
    person1Stocks: 300000, person2Stocks: 100000,
    cashSavings: 50000, otherAssets: 0,
    annualIncome: 220000, monthlySavings: 4500,
    annualSpend: 80000,
  })),
  expected: Object.freeze({
    hasShortfall: false,
    shortfallYearAges: [],
    feasibleUnderSafe: true,
  }),
});

// Pre-retirement — 58, $1.4M, $90k spend, 4 years to FIRE.
const preRetirement = Object.freeze({
  name: 'preRetirement',
  description: 'Pre-retirement couple age 58, $1.4M portfolio, $90K spend — feasible',
  inp: Object.freeze(_baseInp({
    agePerson1: 58, agePerson2: 58, ageRoger: 58,
    person1_401kTrad: 600000, person1_401kRoth: 200000,
    person1Stocks: 400000, person2Stocks: 100000,
    cashSavings: 100000, otherAssets: 0,
    annualIncome: 250000, monthlySavings: 5500,
    annualSpend: 90000,
  })),
  expected: Object.freeze({
    hasShortfall: false,
    shortfallYearAges: [],
    feasibleUnderSafe: true,
  }),
});

// θ=0 shortfall — the user's exact bug case. The original audit caught this:
// tax-optimized-search with θ=0 chose to make ZERO withdrawals (paying zero
// tax) which technically minimized lifetime tax — but the user was effectively
// broke for 8 retirement years (no income from any pool). This fixture
// reproduces that exact pathology so US1 can verify hasShortfall fires AND
// US2 can verify the feasibility-first filter avoids picking θ=0.
//
// Setup: small portfolio + medium spend + early FIRE forces shortfall years.
const thetaZeroShortfall = Object.freeze({
  name: 'thetaZeroShortfall',
  description: 'Small portfolio + early FIRE forces shortfall years for θ=0',
  inp: Object.freeze(_baseInp({
    agePerson1: 52, agePerson2: 52, ageRoger: 52,
    person1_401kTrad: 100000, person1_401kRoth: 50000,
    person1Stocks: 150000, person2Stocks: 50000,
    cashSavings: 20000, otherAssets: 0,
    annualIncome: 200000, monthlySavings: 1500,
    annualSpend: 80000,
    bufferUnlock: 1, bufferSS: 1,
  })),
  fireAge: 52, // immediate FIRE — no accumulation runway
  expected: Object.freeze({
    // At θ=0 (zero withdrawals), the shortfall fires every retirement year
    // until SS kicks in at 70. The exact ages depend on tax-optimized-search
    // internal logic — the test asserts at least 1 shortfall year exists.
    hasShortfall: true,
    minShortfallYearCount: 1,
    feasibleUnderSafe: false,
  }),
});

const SCENARIOS = Object.freeze({
  youngSaver,
  midCareer,
  preRetirement,
  thetaZeroShortfall,
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SCENARIOS, youngSaver, midCareer, preRetirement, thetaZeroShortfall };
}
