#!/usr/bin/env node
/*
 * tools/pvi-cli.mjs — CLI front-end for calc/payoffVsInvest.js
 *
 * Lets you (or me, in a Node session) sanity-check the Payoff vs Invest
 * calculation end-to-end against realistic inputs without opening a browser.
 *
 * Usage:
 *   node tools/pvi-cli.mjs --preset rr
 *   node tools/pvi-cli.mjs --mortgage-rate 0.065 --stocks-return 0.08 --extra-monthly 750
 *   node tools/pvi-cli.mjs --preset rr --refi-year 5 --refi-rate 0.04 --refi-term 30
 *   node tools/pvi-cli.mjs --preset rr --override-rate 0.045
 *   node tools/pvi-cli.mjs --preset prepay-wins --full-table
 *   node tools/pvi-cli.mjs --preset rr --json
 *   node tools/pvi-cli.mjs --help
 *
 * Presets: rr, generic, prepay-wins, invest-wins, tie
 *
 * The CLI defaults are kept in sync with the unit-test fixtures so that
 * "node tools/pvi-cli.mjs --preset prepay-wins" reproduces what
 * "tests/unit/payoffVsInvest.test.js" exercises.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { computePayoffVsInvest } = require(path.resolve(__dirname, '..', 'calc', 'payoffVsInvest.js'));

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  const flags = new Set(['help', 'h', 'json', 'full-table', 'no-color']);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (flags.has(key)) {
      args[key] = true;
    } else {
      args[key] = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (args.help || args.h) {
  console.log(`pvi-cli — sanity-check the Mortgage Payoff vs. Invest calc.

Presets:
  --preset rr                  Roger & Rebecca's RR defaults
  --preset generic             Generic dashboard defaults
  --preset prepay-wins         Mortgage 8 %, stocks 4 % — Prepay should win
  --preset invest-wins         Mortgage 3 %, stocks 8 % — Invest should win
  --preset tie                 Spread ≈ 0 — tie calibration

Time horizon:
  --current-age N              default 42
  --fire-age N                 default 51
  --end-age N                  default 99

Mortgage (override fields of the chosen preset):
  --ownership X                buying-now | buying-in | already-own
  --home-price N
  --down-payment N
  --mortgage-rate N            decimal annual, e.g. 0.065
  --mortgage-term N            years, e.g. 30
  --years-paid N               only matters for already-own
  --buy-in-years N             only matters for buying-in

Returns / inflation / tax:
  --stocks-return N            decimal annual, e.g. 0.07
  --inflation N                decimal annual, e.g. 0.03
  --ltcg-rate N                decimal, e.g. 0.15
  --stock-gain-pct N           decimal, e.g. 0.6

Pill-local inputs:
  --extra-monthly N            $/month, default 500, range [0, 5000]
  --framing X                  totalNetWorth | liquidNetWorth
  --refi-year N                year offset for planned refi (omits = no refi)
  --refi-rate N                decimal new rate when --refi-year set
  --refi-term N                15 | 20 | 30
  --override-rate N            decimal effective mortgage rate (verdict-only)

Output flags:
  --full-table                 dump every year (otherwise: milestone years only)
  --json                       dump raw computePayoffVsInvest output as JSON
  --no-color                   disable ANSI colors
  --help                       show this message

Notes:
  • The CLI uses the same calc module as the dashboard: calc/payoffVsInvest.js
  • Verdict / factor / crossover semantics match the unit tests verbatim.
  • The override-rate is verdict-only — it does NOT change the amortization.
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

function preset(name) {
  const base = {
    currentAge: 42,
    fireAge: 51,
    endAge: 99,
    mortgageEnabled: true,
    mortgage: {
      ownership: 'buying-now',
      homePrice: 500000,
      downPayment: 100000,
      rate: 0.065,
      term: 30,
      yearsPaid: 0,
      buyInYears: 0,
      propertyTax: 6000,
      insurance: 1500,
      hoa: 0,
      sellAtFire: false,
      homeLocation: 'us',
    },
    stocksReturn: 0.07,
    inflation: 0.03,
    ltcgRate: 0.15,
    stockGainPct: 0.6,
    extraMonthly: 500,
    framing: 'totalNetWorth',
    effectiveRateOverride: null,
    plannedRefi: null,
  };
  switch (name) {
    case 'rr':           return base;
    case 'generic':      return Object.assign({}, base, { currentAge: 36, fireAge: 50 });
    case 'prepay-wins':  return Object.assign({}, base, { stocksReturn: 0.04, mortgage: Object.assign({}, base.mortgage, { rate: 0.08 }) });
    case 'invest-wins':  return Object.assign({}, base, { stocksReturn: 0.08, mortgage: Object.assign({}, base.mortgage, { rate: 0.03 }) });
    case 'tie':          return Object.assign({}, base, { stocksReturn: 0.06, mortgage: Object.assign({}, base.mortgage, { rate: 0.0573 }) });
    default:
      console.error(`Unknown preset: ${name}. Try --help`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Build inputs from preset + CLI overrides
// ---------------------------------------------------------------------------

function num(v) {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    console.error(`Invalid numeric value: ${v}`);
    process.exit(1);
  }
  return n;
}

function buildInputs() {
  const inp = preset(args.preset || 'rr');

  if (args['current-age'] !== undefined) inp.currentAge = num(args['current-age']);
  if (args['fire-age']    !== undefined) inp.fireAge    = num(args['fire-age']);
  if (args['end-age']     !== undefined) inp.endAge     = num(args['end-age']);

  if (args.ownership      !== undefined) inp.mortgage.ownership   = args.ownership;
  if (args['home-price']  !== undefined) inp.mortgage.homePrice   = num(args['home-price']);
  if (args['down-payment']!== undefined) inp.mortgage.downPayment = num(args['down-payment']);
  if (args['mortgage-rate']!== undefined) inp.mortgage.rate       = num(args['mortgage-rate']);
  if (args['mortgage-term']!== undefined) inp.mortgage.term       = num(args['mortgage-term']);
  if (args['years-paid']  !== undefined) inp.mortgage.yearsPaid   = num(args['years-paid']);
  if (args['buy-in-years']!== undefined) inp.mortgage.buyInYears  = num(args['buy-in-years']);

  if (args['stocks-return']  !== undefined) inp.stocksReturn  = num(args['stocks-return']);
  if (args.inflation         !== undefined) inp.inflation     = num(args.inflation);
  if (args['ltcg-rate']      !== undefined) inp.ltcgRate      = num(args['ltcg-rate']);
  if (args['stock-gain-pct'] !== undefined) inp.stockGainPct  = num(args['stock-gain-pct']);

  if (args['extra-monthly']  !== undefined) inp.extraMonthly  = num(args['extra-monthly']);
  if (args.framing           !== undefined) inp.framing       = args.framing;

  if (args['override-rate']  !== undefined) inp.effectiveRateOverride = num(args['override-rate']);

  if (args['refi-year'] !== undefined) {
    inp.plannedRefi = {
      refiYear: num(args['refi-year']),
      newRate: num(args['refi-rate'] || 0.05),
      newTerm: num(args['refi-term'] || 30),
    };
  }

  return inp;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

const useColor = !args['no-color'] && process.stdout.isTTY;
const c = (code, s) => useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const bold   = (s) => c('1', s);
const dim    = (s) => c('2', s);
const green  = (s) => c('32', s);
const red    = (s) => c('31', s);
const yellow = (s) => c('33', s);
const cyan   = (s) => c('36', s);
const purple = (s) => c('35', s);

function fmt$(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return sign + '$' + abs.toLocaleString();
}
function fmtPct(d, places = 2) { return (d * 100).toFixed(places) + '%'; }

function arrowFor(strategy) {
  if (strategy === 'prepay') return red('▼ Prepay');
  if (strategy === 'invest') return purple('▲ Invest');
  return dim('◇ Neutral');
}

function magBadge(m) {
  if (m === 'dominant') return bold(yellow('●'));
  if (m === 'moderate') return yellow('○');
  return dim('·');
}

// ---------------------------------------------------------------------------
// Sparkline of (prepay - invest) spread over time
// ---------------------------------------------------------------------------

function sparkline(values, width = 60) {
  const blocks = ' ▁▂▃▄▅▆▇█';
  const max = Math.max(...values.map(Math.abs), 1);
  const step = Math.max(1, Math.ceil(values.length / width));
  const downsampled = [];
  for (let i = 0; i < values.length; i += step) downsampled.push(values[i]);
  return downsampled.map((v) => {
    const t = Math.abs(v) / max;
    const idx = Math.min(blocks.length - 1, Math.max(0, Math.round(t * (blocks.length - 1))));
    const ch = blocks[idx];
    return v < 0 ? red(ch) : (v > 0 ? green(ch) : dim(ch));
  }).join('');
}

// ---------------------------------------------------------------------------
// Render output
// ---------------------------------------------------------------------------

function render(inputs, outputs) {
  if (args.json) {
    console.log(JSON.stringify(outputs, null, 2));
    return;
  }

  console.log('');
  console.log(bold(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log(bold(cyan('  Mortgage Payoff vs. Invest — Sanity Check')));
  console.log(bold(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log('');

  // Inputs summary
  console.log(bold('Inputs'));
  console.log(`  ${dim('age window')}        ${inputs.currentAge} → ${inputs.fireAge} (FIRE) → ${inputs.endAge}`);
  console.log(`  ${dim('mortgage')}          ${inputs.mortgage.ownership} | rate ${fmtPct(inputs.mortgage.rate)} | ${inputs.mortgage.term}y | ${fmt$((inputs.mortgage.homePrice || 0) - (inputs.mortgage.downPayment || 0))} balance${inputs.mortgage.ownership === 'already-own' ? ` | ${inputs.mortgage.yearsPaid}y already paid` : ''}${inputs.mortgage.ownership === 'buying-in' ? ` | buys in ${inputs.mortgage.buyInYears}y` : ''}`);
  console.log(`  ${dim('investments')}       stocks ${fmtPct(inputs.stocksReturn)} | infl ${fmtPct(inputs.inflation)} | LTCG ${fmtPct(inputs.ltcgRate)} | stock-gain ${fmtPct(inputs.stockGainPct, 0)}`);
  console.log(`  ${dim('extra cash')}        ${fmt$(inputs.extraMonthly)}/mo | framing: ${inputs.framing}`);
  if (inputs.effectiveRateOverride != null) {
    console.log(`  ${dim('effective-rate')}    ${fmtPct(inputs.effectiveRateOverride)} ${dim('(verdict-only override)')}`);
  }
  if (inputs.plannedRefi) {
    console.log(`  ${dim('planned refi')}      year ${inputs.plannedRefi.refiYear} → ${fmtPct(inputs.plannedRefi.newRate)} for ${inputs.plannedRefi.newTerm}y`);
  }
  console.log('');

  if (outputs.disabledReason) {
    console.log(red(bold('DISABLED: ')) + outputs.disabledReason);
    console.log(dim('  No comparison performed.'));
    return;
  }

  // Verdict
  console.log(bold('Verdict'));
  const v = outputs.verdict;
  const winnerLabel = (w) => w === 'prepay' ? red('Prepay') : (w === 'invest' ? purple('Invest') : dim('Tie'));
  const fireLine = v.isTieAtFire
    ? `  At FIRE (age ${inputs.fireAge}):  ${dim('Effectively tied')}`
    : `  At FIRE (age ${inputs.fireAge}):  ${winnerLabel(v.winnerAtFire)} ${green('wins by')} ${bold(fmt$(v.marginAtFire))}`;
  const endLine = v.isTieAtEnd
    ? `  At plan-end (age ${inputs.endAge}):  ${dim('Effectively tied')}`
    : `  At plan-end (age ${inputs.endAge}):  ${winnerLabel(v.winnerAtEnd)} ${green('wins by')} ${bold(fmt$(v.marginAtEnd))}`;
  console.log(fireLine);
  console.log(endLine);
  if (v.naturalPayoffYear != null) {
    console.log(`  ${dim('Mortgage naturally pays off at age')} ${v.naturalPayoffYear}`);
  }
  console.log('');

  // Crossover
  if (outputs.crossover) {
    console.log(bold('Crossover'));
    console.log(`  Lines cross at age ${yellow(outputs.crossover.ageRoundedDisplay)} (interpolated ${outputs.crossover.age.toFixed(2)}), wealth = ${fmt$(outputs.crossover.totalNetWorth)}`);
    console.log('');
  } else {
    console.log(bold('Crossover') + dim('  (no crossover — winner is monotonic across the window)'));
    console.log('');
  }

  // Refi annotation
  if (outputs.refiAnnotation) {
    const ra = outputs.refiAnnotation;
    console.log(bold('Refi event'));
    console.log(`  At age ${ra.refiAge}: rate ${fmtPct(ra.oldRate)} → ${fmtPct(ra.newRate)}, term reset to ${ra.newTerm}y`);
    if (outputs.refiClampedNote) console.log(`  ${yellow('NOTE:')} ${outputs.refiClampedNote}`);
    console.log('');
  }

  // Factors
  console.log(bold('Factors driving the verdict'));
  const labelWidth = Math.max(...outputs.factors.map((f) => f.key.length)) + 2;
  for (const f of outputs.factors) {
    const label = f.key.padEnd(labelWidth);
    const value = (f.valueDisplay || '').padEnd(22);
    const arrow = arrowFor(f.favoredStrategy);
    const mag = magBadge(f.magnitude);
    console.log(`  ${mag} ${label} ${value} ${arrow}`);
  }
  console.log('');

  // Year-by-year table
  console.log(bold('Year-by-year (real dollars)'));
  const framingKey = inputs.framing === 'liquidNetWorth' ? 'liquidNetWorth' : 'totalNetWorth';
  const milestones = args['full-table']
    ? outputs.prepayPath.map((r) => r.age)
    : Array.from(new Set([
        outputs.prepayPath[0].age,
        inputs.fireAge,
        60,
        70,
        80,
        90,
        outputs.prepayPath[outputs.prepayPath.length - 1].age,
      ])).filter((a) => a >= outputs.prepayPath[0].age && a <= outputs.prepayPath[outputs.prepayPath.length - 1].age)
      .sort((a, b) => a - b);

  console.log(dim(`  ${'Age'.padEnd(5)} ${'Prepay net'.padEnd(15)} ${'Invest net'.padEnd(15)} ${'Spread (P − I)'.padEnd(18)} ${'Mortgage bal (P / I)'}`));
  for (const age of milestones) {
    const p = outputs.prepayPath.find((r) => r.age === age);
    const i = outputs.investPath.find((r) => r.age === age);
    if (!p || !i) continue;
    const spread = p[framingKey] - i[framingKey];
    const spreadStr = (spread >= 0 ? green : red)(fmt$(spread).padStart(15));
    const balP = fmt$(p.mortgageBalance);
    const balI = fmt$(i.mortgageBalance);
    const ageMark = age === inputs.fireAge ? bold(yellow(String(age).padEnd(5))) : String(age).padEnd(5);
    console.log(`  ${ageMark} ${fmt$(p[framingKey]).padEnd(15)} ${fmt$(i[framingKey]).padEnd(15)} ${spreadStr.padEnd(18)} ${balP} / ${balI}`);
  }
  console.log('');

  // Sparkline of spread (Prepay − Invest)
  console.log(bold('Spread over time (Prepay − Invest)'));
  const spreads = outputs.prepayPath.map((p, i) => p[framingKey] - outputs.investPath[i][framingKey]);
  console.log('  ' + sparkline(spreads, 60));
  const minSpread = Math.min(...spreads);
  const maxSpread = Math.max(...spreads);
  console.log(`  ${dim('min')} ${fmt$(minSpread)}  ${dim('max')} ${fmt$(maxSpread)}  ${dim('range over')} ${spreads.length} years`);
  console.log('');

  // subSteps
  console.log(bold('Calc subSteps') + dim('  (audit observability per Constitution Principle II)'));
  for (const step of outputs.subSteps) {
    console.log(`  ${dim('•')} ${step}`);
  }
  console.log('');

  console.log(dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(dim('  302 unit tests verify these calculations. Tweak inputs and re-run.'));
  console.log(dim('  Try: --preset invest-wins  |  --refi-year 5 --refi-rate 0.04'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const inputs = buildInputs();
const outputs = computePayoffVsInvest(inputs);
render(inputs, outputs);
