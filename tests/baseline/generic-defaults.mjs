/*
 * Hardcoded cold-load defaults for FIRE-Dashboard-Generic.html.
 * Mirrors the legacy `inp` shape the Generic inline engine consumes at page load.
 *
 * SOURCE OF TRUTH: FIRE-Dashboard-Generic.html
 *
 * When the HTML form defaults change:
 *   1. Edit the HTML.
 *   2. Run `bash tests/runner.sh`.
 *   3. If tests/baseline/browser-smoke.test.js fails with a canonical-
 *      validation error, update the offending field here.
 *   4. If the smoke still passes (default changed but produces valid
 *      canonical shape), update this file anyway and bump Last synced.
 *
 * Last synced: 2026-04-20
 *
 * Field extraction notes:
 *   - Generic uses `agePerson1` / `agePerson2` / `person1Stocks` etc. field
 *     names instead of the RR variant's primary/secondary. Kids are dynamic (`childrenList`),
 *     not fixed two-kid. The hidden inputs carry initial value="36" but the
 *     live values are recomputed from BIRTHDATES (L1831) by updateAges().
 *   - As of 2026-04-20:
 *       * person1 (1990-01-01): 36 (post-birthday)
 *       * person2 (1990-01-01): 36 (post-birthday)
 *       * child1  (2020-01-01): 6  (post-birthday)
 *       * child2  (2023-01-01): 3  (post-birthday)
 *     Note: childrenList default has 2 entries (L1837–1840), both 'us-private'.
 *   - `getInputs()` at L2971 exposes `childAges`, `childCollegePlans`,
 *     `childLoanPcts`, `childLoanParentPcts` arrays in addition to legacy
 *     `ageChild1`/`ageChild2` aliases.
 *   - `selectedScenario` default is 'taiwan' (L2688); `fireMode` 'safe' (L2689);
 *     `ssClaimAge` 67 (L2962). Module-scope lets, not DOM inputs.
 */

export default Object.freeze({
  // ----- Ages (computed at page load from BIRTHDATES on 2026-04-20) -----
  agePerson1: 36,  // 1990-01-01 → 36 on 2026-04-20
  agePerson2: 36,  // 1990-01-01 → 36 on 2026-04-20

  // ----- Children (dynamic via childrenList default of 2 entries) -----
  childAges: Object.freeze([6, 3]),                    // 2020-01-01 → 6, 2023-01-01 → 3
  childCollegePlans: Object.freeze(['us-private', 'us-private']),
  childLoanPcts: Object.freeze([0, 0]),
  childLoanParentPcts: Object.freeze([100, 100]),
  ageChild1: 6,                                        // legacy alias (L2997)
  ageChild2: 3,                                        // legacy alias (L2998)

  loanRate: 6.53,                     // number L995, value="6.53"
  loanTerm: 10,                       // number L1000, value="10"
  stockGainPct: 0.60,                 // range L1430, value="60", /100 by getInputs()

  // ----- Income -----
  annualIncome: 80000,                // number L1012, value="80000"
  raiseRate: 0.02,                    // range L1016, value="2"
  taxRate: 0.28,                      // number L1020, value="28", /100 by getInputs()

  // ----- Portfolios (Generic legacy shape: person1/person2 naming) -----
  person1_401kTrad: 0,                // number L1051, value="0" (#person1_401k)
  person1_401kRoth: 0,                // number L1055, value="0"
  person1Stocks: 0,                   // number L1031, value="0"
  person2Stocks: 0,                   // number L1035, value="0"
  cashSavings: 0,                     // number L1039, value="0"
  otherAssets: 0,                     // number L1043, value="0"
  person1_401k: 0,                    // derived (L3027)

  // ----- Returns / inflation -----
  returnRate: 0.07,                   // range L1073, value="7"
  return401k: 0.07,                   // range L1077, value="7"
  inflationRate: 0.03,                // range L1081, value="3"
  swr: 0.04,                          // range L1085, value="4"

  // ----- Contributions -----
  monthlySavings: 500,                // range L1089, value="500"
  contrib401kTrad: 3000,              // range L1093 (#contrib401k), value="3000"
  contrib401kRoth: 0,                 // range L1097, value="0"
  contrib401k: 3000,                  // derived (L3028)
  taxTrad: 0.15,                      // range L1101, value="15", /100
  empMatch: 1500,                     // range L1105, value="1500"

  // ----- SS settings -----
  ssWorkStart: 2019,                  // hidden L1516, value="2019"
  ssAvgEarnings: 100000,              // hidden L1517, value="100000"
  ssSpouseOwn: 0,                     // number L1513, value="0"
  ssClaimAge: 67,                     // module-scope let, L2962

  // ----- Buffers + horizon -----
  bufferUnlock: 2,                    // range L1532, value="2"
  bufferSS: 3,                        // range L1536, value="3"
  endAge: 95,                         // range L1547, value="95"

  // ----- Scenario / fireMode (module-scope, not DOM-bound) -----
  selectedScenario: 'taiwan',         // L2688 (`let selectedScenario = 'taiwan'`)
  fireMode: 'safe',                   // L2689 (`let fireMode = 'safe'`)
});
