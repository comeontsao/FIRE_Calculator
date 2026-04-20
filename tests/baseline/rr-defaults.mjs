/*
 * Hardcoded cold-load defaults for FIRE-Dashboard.html (RR version).
 * Mirrors the legacy `inp` shape the inline engine consumes at page load.
 *
 * SOURCE OF TRUTH: FIRE-Dashboard.html
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
 *   - Age fields are JS-computed at page load by updateAges() (FIRE-Dashboard.html L1900)
 *     from BIRTHDATES (L1885). The HTML's static `value="43"` attribute is stale;
 *     the live value depends on today's date. As of 2026-04-20:
 *       * Roger (1983-05-19):  42 (pre-birthday)
 *       * Rebecca (1984-04-01): 42 (post-birthday)
 *       * Janet  (2017-02-16):  9 (post-birthday)
 *       * Ian    (2022-06-21):  3 (pre-birthday)
 *   - Sliders (range inputs) carry their initial `value="..."` as the cold-load
 *     value. Numeric inputs likewise.
 *   - `ssClaimAge` is a module-scope `let` (HTML L3195, `let ssClaimAge = 67;`),
 *     not a DOM input. Default 67.
 *   - `selectedScenario` and `fireMode` are module-scope `let`s (L2628/L2629),
 *     defaults 'taiwan' and 'safe'.
 *   - College selects (`collegeKid1`, `collegeKid2`) use the `selected` attribute
 *     on the `taiwan` option (L988, L1005).
 */

export default Object.freeze({
  // ----- Ages (computed at page load from BIRTHDATES on 2026-04-20) -----
  ageRoger: 42,    // 1983-05-19 → 42 on 2026-04-20 (pre-birthday, May not yet reached)
  ageRebecca: 42,  // 1984-04-01 → 42 on 2026-04-20 (post-birthday)
  ageKid1: 9,      // Janet: 2017-02-16 → 9
  ageKid2: 3,      // Ian:   2022-06-21 → 3 (pre-birthday)

  // ----- Kids: college plans + loan knobs (sliders + selects) -----
  collegeKid1: 'taiwan',              // <option selected> at L988
  collegeKid2: 'taiwan',              // <option selected> at L1005
  loanPctKid1: 0,                     // range L1027, value="0"
  loanPctKid2: 0,                     // range L1037, value="0"
  loanParentPctKid1: 100,             // range L1032, value="100"
  loanParentPctKid2: 100,             // range L1042, value="100"
  loanRate: 6.53,                     // number L1049, value="6.53"
  loanTerm: 10,                       // number L1054, value="10"

  // ----- Income -----
  annualIncome: 150000,               // number L1064, value="150000"
  raiseRate: 0.02,                    // range L1068, value="2", divided by 100 by getInputs()
  taxRate: 0.28,                      // number L1072, value="28", divided by 100 by getInputs()

  // ----- Portfolios (RR legacy shape) -----
  roger401kTrad: 25000,               // number L1103, value="25000" (#roger401k)
  roger401kRoth: 58000,               // number L1107, value="58000"
  rogerStocks: 190000,                // number L1083, value="190000"
  rebeccaStocks: 200000,              // number L1087, value="200000"
  cashSavings: 0,                     // number L1091, value="0"
  otherAssets: 0,                     // number L1095, value="0"

  // Derived (getInputs() adds these at L3251–3252)
  roger401k: 83000,                   // = roger401kTrad + roger401kRoth = 25000 + 58000

  // ----- Returns / inflation (slider values, divided by 100) -----
  returnRate: 0.07,                   // range L1125, value="7"
  return401k: 0.07,                   // range L1129, value="7"
  inflationRate: 0.03,                // range L1133, value="3"
  swr: 0.04,                          // range L1137, value="4"
  stockGainPct: 0.60,                 // range L1482, value="60", /100 by getInputs()

  // ----- Contributions -----
  monthlySavings: 2000,               // range L1141, value="2000"
  contrib401kTrad: 8550,              // range L1145 (#contrib401k), value="8550"
  contrib401kRoth: 2850,              // range L1149, value="2850"
  contrib401k: 11400,                 // = contrib401kTrad + contrib401kRoth (derived at L3252)
  taxTrad: 0.15,                      // range L1153, value="15", /100 by getInputs()
  empMatch: 7200,                     // range L1157, value="7200"

  // ----- SS settings -----
  ssWorkStart: 2019,                  // hidden L1568, value="2019"
  ssAvgEarnings: 100000,              // hidden L1569, value="100000"
  ssRebeccaOwn: 0,                    // number L1565, value="0"
  ssClaimAge: 67,                     // module-scope let, L3195 (let ssClaimAge = 67)

  // ----- Buffers + horizon -----
  bufferUnlock: 2,                    // range L1584, value="2"
  bufferSS: 3,                        // range L1588, value="3"
  endAge: 95,                         // range L1599, value="95"

  // ----- Scenario / fireMode (module-scope, not DOM-bound) -----
  selectedScenario: 'taiwan',         // L2628 (`let selectedScenario = 'taiwan'`)
  fireMode: 'safe',                   // L2629 (`let fireMode = 'safe'`)
});
