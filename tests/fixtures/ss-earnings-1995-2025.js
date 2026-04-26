/*
 * tests/fixtures/ss-earnings-1995-2025.js
 *
 * Canonical 31-year nominal earnings profile for a hypothetical US worker from
 * 1995 through 2025. Used to lock SC-002 (Social Security benefit direction)
 * in feature 012 — SSA Earnings Record: support years before 2020.
 *
 * Consumer: tests/unit/ssEarningsRecord.test.js §Integration cross-check
 *
 * Ramp rationale:
 *   - Start at $28,000 in 1995 (roughly the US median earnings for a
 *     mid-twenties worker in the mid-nineties).
 *   - Compound growth of ~3% per year to land near $72,000 in 2025
 *     (28_000 * (1.03 ** 30) ≈ 67,950 — with the small per-year noise we
 *     inject, we finish in the low $70k range).
 *   - Modest deterministic per-year noise so no two adjacent values are
 *     identical. The noise uses a simple alternating offset so tests are
 *     reproducible without Math.random.
 *
 * Shape matches `SSEarnings` from calc/socialSecurity.js module header:
 *   { annualEarningsNominal: number[], latestEarningsYear: number }
 *
 * Oldest earnings at annualEarningsNominal[0] (year 1995); newest at the
 * final index (year 2025).
 */

const START_YEAR = 1995;
const END_YEAR = 2025;
const START_EARNINGS = 28_000;
const ANNUAL_GROWTH = 0.03;

/**
 * Deterministic per-year noise in the range [-$200, +$200]. Keeps the ramp
 * monotonically increasing overall while ensuring adjacent values differ.
 */
function noise(yearIndex) {
  // Alternates +150, -100, +200, -50, ... using a simple sine-free pattern
  // so the fixture is fully deterministic across platforms.
  const pattern = [150, -100, 200, -50, 75, -175, 125, -25];
  return pattern[yearIndex % pattern.length];
}

const years = [];
for (let y = START_YEAR; y <= END_YEAR; y += 1) years.push(y);

const annualEarningsNominal = years.map((_, i) => {
  const ramp = Math.round(START_EARNINGS * Math.pow(1 + ANNUAL_GROWTH, i));
  return ramp + noise(i);
});

export const ssEarnings1995to2025 = Object.freeze({
  annualEarningsNominal: Object.freeze(annualEarningsNominal),
  latestEarningsYear: END_YEAR,
});

/**
 * Truncated view — only the last six years (2020..2025). Mirrors the default
 * seeded history in FIRE-Dashboard-Generic.html (line 3369) so tests can
 * compare "pre-feature defaults" vs "full pre-2020 history" AIME behaviour.
 */
export const ssEarnings2020to2025 = Object.freeze({
  annualEarningsNominal: Object.freeze(annualEarningsNominal.slice(-6)),
  latestEarningsYear: END_YEAR,
});

/** Exposed metadata for consumers that want to reconstruct year labels. */
export const ssEarnings1995to2025Meta = Object.freeze({
  startYear: START_YEAR,
  endYear: END_YEAR,
  count: years.length,
});

/**
 * Default export in FixtureCase shape (data-model.md §7) so this file passes
 * the fixture-shapes meta-test. `kind: 'integration'` because this fixture is
 * consumed by an integration cross-check between calc/ssEarningsRecord and
 * calc/socialSecurity (tests/unit/ssEarningsRecord.test.js §Integration).
 */
const fixture = Object.freeze({
  name: 'ss-earnings-1995-2025 — 31-year synthetic US worker earnings',
  kind: 'integration',
  inputs: Object.freeze({
    full: ssEarnings1995to2025,
    truncated2020to2025: ssEarnings2020to2025,
    meta: ssEarnings1995to2025Meta,
  }),
  expected: Object.freeze({
    // SC-002 direction lock (tests/unit/ssEarningsRecord.test.js §Integration):
    // full-history projectSS annualBenefitReal MUST strictly exceed truncated.
    fullBenefitStrictlyGreaterThanTruncated: true,
    fullCount: years.length,
    truncatedCount: 6,
  }),
  notes:
    'Deterministic ramp from $28k (1995) at ~3%/yr with alternating $±$200 noise. ' +
    'Consumer: tests/unit/ssEarningsRecord.test.js §Integration cross-check (SC-002).',
});

export default fixture;
