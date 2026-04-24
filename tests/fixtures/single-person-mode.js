/*
 * tests/fixtures/single-person-mode.js
 *
 * Feature 009 — Single-Person Mode fixtures. See
 * specs/009-single-person-mode/contracts/calc-functions.contract.md §13
 * for the branch summary table these fixtures pin. Also referenced by
 * specs/009-single-person-mode/research.md §10 (test-case enumeration).
 *
 * These fixtures drive:
 *   - tests/unit/filingStatus.test.js      (T014)
 *   - tests/unit/socialSecurity.test.js    (T015 extension)
 *   - tests/unit/healthcare.test.js        (T024/T025 extensions)
 *   - tests/unit/adultCounter.test.js      (T030)
 *   - tests/unit/snapshotsCsv.test.js      (T037)
 *
 * All fixtures are frozen arrays of plain-data cases; no DOM, no IO.
 */

export const filingStatusFixtures = [
  {
    name: 'adultCount=2 -> MFJ',
    inp: { adultCount: 2 },
    expected: true,
  },
  {
    name: 'adultCount=1 -> Single',
    inp: { adultCount: 1 },
    expected: false,
  },
  {
    name: 'adultCount undefined, agePerson2=36 -> MFJ (legacy fallback)',
    inp: { agePerson2: 36 },
    expected: true,
  },
  {
    name: 'adultCount undefined, agePerson2=0 -> Single (legacy fallback)',
    inp: { agePerson2: 0 },
    expected: false,
  },
  {
    name: 'adultCount undefined, agePerson2 missing -> Single (legacy fallback)',
    inp: {},
    expected: false,
  },
];

export const portfolioSuppressFixtures = [
  // calcNetWorth semantic: person1_401k + person1Stocks + (adultCount===2 ? person2Stocks : 0) + cashSavings + otherAssets
  // calcAccessible: same composition minus person1_401k (locked pool).
  {
    name: 'adults=2 includes person2Stocks',
    inp: {
      adultCount: 2,
      person1_401k: 100,
      person1Stocks: 50,
      person2Stocks: 25,
      cashSavings: 10,
      otherAssets: 5,
    },
    netWorth: 190,
    accessible: 90,
  },
  {
    name: 'adults=1 suppresses person2Stocks',
    inp: {
      adultCount: 1,
      person1_401k: 100,
      person1Stocks: 50,
      person2Stocks: 25,
      cashSavings: 10,
      otherAssets: 5,
    },
    netWorth: 165,
    accessible: 65,
  },
];

export const ssSingleCombinationFixtures = [
  // calcRealisticSSA spousal branch per contracts/calc-functions.contract.md §5.
  {
    name: 'adults=1 -> spousePIA = 0 even when ssSpouseOwn > 0',
    pia: 2500,
    ssSpouseOwn: 1200,
    adultCount: 1,
    expectedSpousePIA: 0,
    expectedCombined: 2500,
  },
  {
    name: 'adults=2 -> spousePIA = max(pia/2, ssSpouseOwn)',
    pia: 2500,
    ssSpouseOwn: 1200,
    adultCount: 2,
    expectedSpousePIA: 1250,
    expectedCombined: 3750,
  },
  {
    name: 'adults=2 with high ssSpouseOwn -> spousePIA = ssSpouseOwn',
    pia: 2000,
    ssSpouseOwn: 1500,
    adultCount: 2,
    expectedSpousePIA: 1500,
    expectedCombined: 3500,
  },
];

export const healthcareFactorFixtures = [
  // getHealthcareFamilySizeFactor(age=40, inp) pre-65 branch table per §7.
  { name: 'adults=2, kids=0 -> 0.67',   adults: 2, kids: 0, expected: 0.67  },
  { name: 'adults=2, kids=1 -> 0.835',  adults: 2, kids: 1, expected: 0.835 },
  { name: 'adults=2, kids=2 -> 1.00',   adults: 2, kids: 2, expected: 1.00  },
  { name: 'adults=1, kids=0 -> 0.35',   adults: 1, kids: 0, expected: 0.35  },
  { name: 'adults=1, kids=1 -> 0.515',  adults: 1, kids: 1, expected: 0.515 },
  { name: 'adults=1, kids=2 -> 0.68',   adults: 1, kids: 2, expected: 0.68  },
];

export const adultCounterClampFixtures = [
  // Per contracts/adult-count.contract.md §3.
  { name: 'at 1, dec is no-op',       current: 1, delta: -1, expected: 1 },
  { name: 'at 1, inc -> 2',           current: 1, delta: +1, expected: 2 },
  { name: 'at 2, dec -> 1',           current: 2, delta: -1, expected: 1 },
  { name: 'at 2, inc is no-op',       current: 2, delta: +1, expected: 2 },
  { name: 'out-of-range dec clamps',  current: 1, delta: -5, expected: 1 },
  { name: 'out-of-range inc clamps',  current: 2, delta: +5, expected: 2 },
];

export const snapshotRowFixtures = [
  {
    name: 'new-schema adults=1 round trip',
    row: {
      date: '2026-04-23T00:00:00.000Z',
      netWorth: 1000,
      accessible: 500,
      person1_401k: 400,
      person1Stocks: 50,
      person2Stocks: 25,
      cashSavings: 10,
      otherAssets: 5,
      annualIncome: 80000,
      monthlySpend: 3000,
      contrib401k: 100,
      empMatch: 5,
      monthlySavings: 500,
      savingsRate: 20,
      fireTarget: 1000000,
      yearsToFire: 15,
      targetCountry: 'US',
      targetCountryId: 'us',
      locked: 400,
      adults: 1,
    },
  },
  {
    name: 'new-schema adults=2 round trip',
    row: {
      date: '2026-04-23T00:00:00.000Z',
      netWorth: 1000,
      accessible: 500,
      person1_401k: 400,
      person1Stocks: 50,
      person2Stocks: 25,
      cashSavings: 10,
      otherAssets: 5,
      annualIncome: 80000,
      monthlySpend: 3000,
      contrib401k: 100,
      empMatch: 5,
      monthlySavings: 500,
      savingsRate: 20,
      fireTarget: 1000000,
      yearsToFire: 15,
      targetCountry: 'US',
      targetCountryId: 'us',
      locked: 400,
      adults: 2,
    },
  },
];

export const legacyCsvRows = [
  // 19-column rows (no Adults field); csvToSnapshots must default adults=2.
  {
    name: 'legacy 19-column row',
    line: '2026-01-15T00:00:00.000Z,1000,500,400,50,25,10,5,80000,3000,100,5,500,20,1000000,15,"United States",us,400',
    expectedAdults: 2,
  },
  {
    name: 'garbage column 19 clamps to 2',
    line: '2026-01-15T00:00:00.000Z,1000,500,400,50,25,10,5,80000,3000,100,5,500,20,1000000,15,"United States",us,400,garbage',
    expectedAdults: 2,
  },
  {
    name: 'column 19 = 1 reads cleanly',
    line: '2026-01-15T00:00:00.000Z,1000,500,400,50,25,10,5,80000,3000,100,5,500,20,1000000,15,"United States",us,400,1',
    expectedAdults: 1,
  },
  {
    name: 'out-of-range column 19 clamps',
    line: '2026-01-15T00:00:00.000Z,1000,500,400,50,25,10,5,80000,3000,100,5,500,20,1000000,15,"United States",us,400,5',
    expectedAdults: 2,
  },
];

/*
 * Default export — meta-wrapper that satisfies the
 * tests/meta/fixture-shapes.test.js FixtureCase contract
 *   { name: string, inputs: object, expected: object, kind: 'unit'|'parity'|'integration' }.
 *
 * This fixture is a bag of branch-table tables (not a single scenario driving
 * the lifecycle engine), so we wrap the exported tables as `inputs` and a
 * summary manifest as `expected`. Individual test files import the named
 * exports above directly — the default export exists only to satisfy the
 * meta-test's shape invariant.
 *
 * @typedef {import('./types.js').FixtureCase} FixtureCase
 */

/** @type {FixtureCase} */
const fixture = Object.freeze({
  name: 'single-person-mode — branch-table fixtures for feature 009',
  kind: 'unit',
  notes:
    'Collection of branch-table fixtures consumed by feature-009 unit tests. '
    + 'Individual tables exported as named exports above; default export is a '
    + 'meta-wrapper for tests/meta/fixture-shapes.test.js conformance.',
  inputs: Object.freeze({
    filingStatusFixtures,
    portfolioSuppressFixtures,
    ssSingleCombinationFixtures,
    healthcareFactorFixtures,
    adultCounterClampFixtures,
    snapshotRowFixtures,
    legacyCsvRows,
  }),
  expected: Object.freeze({
    tableCount: 7,
    totalCases:
      filingStatusFixtures.length
      + portfolioSuppressFixtures.length
      + ssSingleCombinationFixtures.length
      + healthcareFactorFixtures.length
      + adultCounterClampFixtures.length
      + snapshotRowFixtures.length
      + legacyCsvRows.length,
  }),
});

export default fixture;
