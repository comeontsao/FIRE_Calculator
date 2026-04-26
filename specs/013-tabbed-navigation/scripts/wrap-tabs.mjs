// One-shot script to restructure FIRE-Dashboard.html and FIRE-Dashboard-Generic.html
// into the 4-tab / 16-pill layout from feature 013.
//
// Inputs: line ranges for each existing card in each file (computed from grep above).
// Action:
//   - Cuts the entire dashboard region between the first section-divider
//     and the closing dashboard </div>.
//   - Reassembles it as a tabBar + tabContainer with 4 tab-panels, each
//     containing a pill-bar and pill-hosts that wrap the existing cards in
//     the new tab order. Card internals are preserved verbatim.
//   - Removes section-dividers (their role is replaced by tabs/pills).
//   - Extracts #scenarioInsight from inside the Geo-Arbitrage card and
//     re-hosts it inside the country-deep-dive pill.
//   - Quick What-If card is wrapped inside a hidden, no-op pill-host (it
//     will be fully removed by Wave 2B / T021).
//
// Run from repo root: `node specs/013-tabbed-navigation/scripts/wrap-tabs.mjs`.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');

// 1-indexed inclusive line ranges for each card in each file (verified via grep).
// "begin" is the line number of `<div class="card...">` (or `<div class="pie-stack">`).
// "end" is the line number of the matching `</div>` that closes that card / wrapper.
// Section-divider line numbers are excluded — they will be removed.
const FILES = {
  generic: {
    path: resolve(repoRoot, 'FIRE-Dashboard-Generic.html'),
    // Anchors on the surrounding markup so we can locate the slice precisely.
    sliceStartMarker: '  <div class="section-divider" data-chapter="plan">',
    sliceEndLine: 3201, // last line that belongs to the dashboard region (snapshot card close)
    cards: {
      profile:           {begin: 2212, end: 2302},
      currentAssets:     {begin: 2304, end: 2345},
      investSavings:     {begin: 2347, end: 2385},
      mortgage:          {begin: 2387, end: 2518},
      secondProperty:    {begin: 2520, end: 2613},
      geoArbitrage:      {begin: 2617, end: 2655},
      // #scenarioInsight currently lives at lines 2652-2654 INSIDE geoArbitrage.
      // Special handling in extract().
      scenarioInsight:   {begin: 2652, end: 2654},
      countryChart:      {begin: 2657, end: 2662},
      savingsRate:       {begin: 2664, end: 2680},
      quickWhatIf:       {begin: 2682, end: 2701},
      lifetimeWithdraw:  {begin: 2705, end: 2892},
      healthcare:        {begin: 2894, end: 2929},
      socialSecurity:    {begin: 2931, end: 3057},
      drawdown:          {begin: 3059, end: 3064},
      lifecycle:         {begin: 3066, end: 3109},
      milestones:        {begin: 3113, end: 3118},
      expenses:          {begin: 3120, end: 3138},
      pieStack:          {begin: 3140, end: 3154}, // wraps both pies; we keep it whole for Summary pill
      snapshots:         {begin: 3156, end: 3201},
    },
  },
  rr: {
    path: resolve(repoRoot, 'FIRE-Dashboard.html'),
    sliceStartMarker: '  <div class="section-divider" data-chapter="plan">',
    sliceEndLine: 3100,
    cards: {
      profile:           {begin: 2106, end: 2229},
      currentAssets:     {begin: 2231, end: 2272},
      investSavings:     {begin: 2274, end: 2312},
      mortgage:          {begin: 2314, end: 2445},
      secondProperty:    {begin: 2447, end: 2540},
      geoArbitrage:      {begin: 2544, end: 2573},
      scenarioInsight:   {begin: 2570, end: 2572},
      countryChart:      {begin: 2575, end: 2580},
      savingsRate:       {begin: 2582, end: 2598},
      quickWhatIf:       {begin: 2600, end: 2619},
      lifetimeWithdraw:  {begin: 2623, end: 2804},
      healthcare:        {begin: 2806, end: 2841},
      socialSecurity:    {begin: 2843, end: 2957},
      drawdown:          {begin: 2959, end: 2964},
      lifecycle:         {begin: 2966, end: 3009},
      milestones:        {begin: 3013, end: 3018},
      expenses:          {begin: 3020, end: 3038},
      pieStack:          {begin: 3040, end: 3054},
      snapshots:         {begin: 3056, end: 3100},
    },
  },
};

function extract(lines, range) {
  // lines is 0-indexed; line numbers are 1-indexed. Inclusive on both ends.
  return lines.slice(range.begin - 1, range.end).join('\n');
}

function extractWithoutScenarioInsight(lines, geoRange, insightRange) {
  // Geo-Arbitrage card minus the inner #scenarioInsight block.
  const before = lines.slice(geoRange.begin - 1, insightRange.begin - 1);
  const after  = lines.slice(insightRange.end, geoRange.end); // skip insight block AND keep trailing lines
  return [...before, ...after].join('\n');
}

function pillHost(tab, pill, body, {hidden = true} = {}) {
  const hiddenAttr = hidden ? ' hidden' : '';
  return `      <div class="pill-host" data-tab="${tab}" data-pill="${pill}"${hiddenAttr}>\n${body}\n      </div>`;
}

function tabPanel(tab, hidden, pillBarHtml, hostsHtml, ariaLabel) {
  const hiddenAttr = hidden ? ' hidden' : '';
  return [
    `    <section id="tab-${tab}" class="tab-panel" data-tab="${tab}"${hiddenAttr} role="tabpanel" aria-labelledby="tabBtn-${tab}">`,
    `      <div class="tab-scroll-sentinel" aria-hidden="true"></div>`,
    `      <nav class="pill-bar" role="tablist" aria-label="${ariaLabel}">`,
    pillBarHtml,
    `      </nav>`,
    hostsHtml,
    `    </section>`,
  ].join('\n');
}

function pillBtn(tab, pill, i18nKey, label, active) {
  const activeClass = active ? ' active' : '';
  const ariaSel = active ? 'true' : 'false';
  return `        <button class="pill${activeClass}" data-tab="${tab}" data-pill="${pill}" role="tab" aria-selected="${ariaSel}" data-i18n="${i18nKey}">${label}</button>`;
}

function buildNew({cards, lines}) {
  // Extract card bodies.
  const profileBody          = extract(lines, cards.profile);
  const currentAssetsBody    = extract(lines, cards.currentAssets);
  const investBody           = extract(lines, cards.investSavings);
  const mortgageBody         = extract(lines, cards.mortgage);
  const secondPropertyBody   = extract(lines, cards.secondProperty);
  // Geo-Arbitrage WITHOUT the inner #scenarioInsight block (re-hosted in country-deep-dive).
  const geoBody              = extractWithoutScenarioInsight(lines, cards.geoArbitrage, cards.scenarioInsight);
  const scenarioInsightBody  = extract(lines, cards.scenarioInsight);
  const countryChartBody     = extract(lines, cards.countryChart);
  const savingsRateBody      = extract(lines, cards.savingsRate);
  const quickWhatIfBody      = extract(lines, cards.quickWhatIf);
  const lifetimeWithdrawBody = extract(lines, cards.lifetimeWithdraw);
  const healthcareBody       = extract(lines, cards.healthcare);
  const socialSecurityBody   = extract(lines, cards.socialSecurity);
  const drawdownBody         = extract(lines, cards.drawdown);
  const lifecycleBody        = extract(lines, cards.lifecycle);
  const milestonesBody       = extract(lines, cards.milestones);
  const expensesBody         = extract(lines, cards.expenses);
  const pieStackBody         = extract(lines, cards.pieStack);
  const snapshotsBody        = extract(lines, cards.snapshots);

  // ---- Plan tab ----
  const planPillBar = [
    pillBtn('plan', 'profile',    'nav.pill.profile',    'Profile',    true),
    pillBtn('plan', 'assets',     'nav.pill.assets',     'Assets',     false),
    pillBtn('plan', 'investment', 'nav.pill.investment', 'Investment', false),
    pillBtn('plan', 'mortgage',   'nav.pill.mortgage',   'Mortgage',   false),
    pillBtn('plan', 'expenses',   'nav.pill.expenses',   'Expenses',   false),
    pillBtn('plan', 'summary',    'nav.pill.summary',    'Summary',    false),
  ].join('\n');

  // Quick What-If markup is dropped entirely — it was orphaned by the new tab
  // structure and Wave 2B (T021) will also delete the JS handlers and i18n keys.
  // Dropping the markup here means the verified pill-host count is exactly 16.
  void quickWhatIfBody;

  const planHosts = [
    pillHost('plan', 'profile',    profileBody,                                         {hidden: false}),
    pillHost('plan', 'assets',     currentAssetsBody),
    pillHost('plan', 'investment', investBody),
    pillHost('plan', 'mortgage',   `${mortgageBody}\n\n${secondPropertyBody}`),
    pillHost('plan', 'expenses',   expensesBody),
    pillHost('plan', 'summary',    `${savingsRateBody}\n\n${pieStackBody}`),
  ].join('\n');

  const planSection = tabPanel('plan', false, planPillBar, planHosts, 'Plan sections');

  // ---- Geography tab ----
  const geoPillBar = [
    pillBtn('geography', 'scenarios',         'nav.pill.scenarios',         'Scenarios',           true),
    pillBtn('geography', 'country-chart',     'nav.pill.countryChart',      'Country Chart',       false),
    pillBtn('geography', 'healthcare',        'nav.pill.healthcare',        'Healthcare',          false),
    pillBtn('geography', 'country-deep-dive', 'nav.pill.countryDeepDive',   'Country Deep-Dive',   false),
  ].join('\n');

  const geoHosts = [
    pillHost('geography', 'scenarios',         geoBody,             {hidden: false}),
    pillHost('geography', 'country-chart',     countryChartBody),
    pillHost('geography', 'healthcare',        healthcareBody),
    // Country Deep-Dive pill hosts the extracted #scenarioInsight panel.
    pillHost('geography', 'country-deep-dive', scenarioInsightBody),
  ].join('\n');

  const geoSection = tabPanel('geography', true, geoPillBar, geoHosts, 'Geography sections');

  // ---- Retirement tab ----
  const retPillBar = [
    pillBtn('retirement', 'ss',         'nav.pill.ss',         'Social Security',     true),
    pillBtn('retirement', 'withdrawal', 'nav.pill.withdrawal', 'Withdrawal Strategy', false),
    pillBtn('retirement', 'drawdown',   'nav.pill.drawdown',   'Drawdown',            false),
    pillBtn('retirement', 'lifecycle',  'nav.pill.lifecycle',  'Lifecycle',           false),
    pillBtn('retirement', 'milestones', 'nav.pill.milestones', 'Milestones',          false),
  ].join('\n');

  const retHosts = [
    pillHost('retirement', 'ss',         socialSecurityBody, {hidden: false}),
    pillHost('retirement', 'withdrawal', lifetimeWithdrawBody),
    pillHost('retirement', 'drawdown',   drawdownBody),
    pillHost('retirement', 'lifecycle',  lifecycleBody),
    pillHost('retirement', 'milestones', milestonesBody),
  ].join('\n');

  const retSection = tabPanel('retirement', true, retPillBar, retHosts, 'Retirement sections');

  // ---- History tab ----
  const histPillBar = pillBtn('history', 'snapshots', 'nav.pill.snapshots', 'Snapshots', true);
  const histHosts   = pillHost('history', 'snapshots', snapshotsBody, {hidden: false});
  const histSection = tabPanel('history', true, histPillBar, histHosts, 'History sections');

  // ---- Top tab bar ----
  const topTabs = [
    `<nav id="tabBar" class="tab-bar" role="tablist" aria-label="Dashboard sections">`,
    `  <button id="tabBtn-plan"       class="tab active" data-tab="plan"       role="tab" aria-controls="tab-plan"       aria-selected="true"  data-i18n="nav.tab.plan">Plan</button>`,
    `  <button id="tabBtn-geography"  class="tab"        data-tab="geography"  role="tab" aria-controls="tab-geography"  aria-selected="false" data-i18n="nav.tab.geography">Geography</button>`,
    `  <button id="tabBtn-retirement" class="tab"        data-tab="retirement" role="tab" aria-controls="tab-retirement" aria-selected="false" data-i18n="nav.tab.retirement">Retirement</button>`,
    `  <button id="tabBtn-history"    class="tab"        data-tab="history"    role="tab" aria-controls="tab-history"    aria-selected="false" data-i18n="nav.tab.history">History</button>`,
    `</nav>`,
  ].join('\n');

  return [
    '',
    '  <!-- ==================== Feature 013 — Tabbed Navigation ==================== -->',
    `  ${topTabs.split('\n').join('\n  ')}`,
    '',
    '  <div id="tabContainer" class="tab-container">',
    planSection,
    '',
    geoSection,
    '',
    retSection,
    '',
    histSection,
    '  </div>',
    '  <!-- ==================== /Feature 013 ==================== -->',
    '',
  ].join('\n');
}

function processFile({path, sliceStartMarker, sliceEndLine, cards}) {
  const original = readFileSync(path, 'utf8');
  const lines    = original.split('\n');

  const startIdx = lines.findIndex(l => l.startsWith(sliceStartMarker));
  if (startIdx < 0) {
    throw new Error(`Could not find slice start marker in ${path}`);
  }
  const startLine = startIdx + 1; // 1-indexed

  // Sanity check: every card range must lie WITHIN [startLine, sliceEndLine].
  for (const [name, r] of Object.entries(cards)) {
    if (r.begin < startLine || r.end > sliceEndLine) {
      throw new Error(`Card ${name} range ${r.begin}-${r.end} outside slice ${startLine}-${sliceEndLine} in ${path}`);
    }
  }

  const before = lines.slice(0, startLine - 1);
  const after  = lines.slice(sliceEndLine);
  const middle = buildNew({cards, lines}).split('\n');

  const out = [...before, ...middle, ...after].join('\n');
  writeFileSync(path, out, 'utf8');
  console.log(`Wrote ${path}: was ${lines.length} lines, now ${out.split('\n').length}`);
}

processFile(FILES.generic);
processFile(FILES.rr);
console.log('Done.');
