/*
 * Feature 037 — calc/lifecycleExport.js pure-model tests.
 *
 * Pins contracts/lifecycle-export.contract.md §C-1 and data-model.md §2/§3/§4:
 *   INV-2  one row per year, ascending by 1, no gaps
 *   INV-3  money >= purchasing power; equal only in the current year
 *   INV-4  column count + order depend on the registry, never on the data
 *   INV-6  no input object is mutated (callers may pass frozen objects)
 *   INV-7  blank (null) != measured zero, per data-model §2's four-case table
 *   INV-8  a clamped display zero is distinguishable from genuine depletion
 *   §C-1.2 error paths: LIFECYCLE_UNAVAILABLE / YEAR_SEQUENCE_INVALID / SETTINGS_INCOMPLETE
 *   §C-1.3 money/purchasing-power sibling pairing + meta.frameFallback
 *
 * The projection emits TWO row shapes (research R2): accumulation rows carry
 * cash-flow detail, retirement rows carry balances only, and withdrawals-by-
 * source live on neither — they come from the strategy rows, joined on `age`.
 * These fixtures exercise the union in both directions.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { buildLifecycleExport, REGISTRY_VERSION } =
  require(path.join(__dirname, '..', '..', 'calc', 'lifecycleExport.js'));

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const CURRENT_YEAR = 2026;
const CURRENT_AGE = 45;

/** Inflation factor used by the fixtures to fake `_extendRowsWithBookValues`. */
function bookFactor(yearOffset) {
  return Math.pow(1.025, yearOffset);
}

/** Attach `<field>BookValue` companions for every numeric field named. */
function withCompanions(row, fields, yearOffset) {
  const out = Object.assign({}, row);
  const f = bookFactor(yearOffset);
  for (const field of fields) {
    if (typeof row[field] === 'number' && Number.isFinite(row[field])) {
      out[field + 'BookValue'] = row[field] * f;
    }
  }
  return out;
}

const BALANCE_FIELDS = ['total', 'p401k', 'p401kTrad', 'p401kRoth', 'pRothIra', 'pStocks', 'pCash', 'accessible'];
const ACC_FLOW_FIELDS = ['grossIncome', 'ssIncome', 'federalTax', 'ficaTax', 'annualSpending',
  'contribution', 'pretax401kEmployee', 'empMatchToTrad', 'stockContribution',
  'stockContributionActual', 'cashFlowToCash', 'fundedFromCash', 'fundedFromStocks', 'withdrawal'];
const RET_FLOW_FIELDS = ['ssIncome', 'withdrawal', 'contribution', 'retirementFederalTax', 'signedTotal'];

/** Accumulation-phase lifecycle row — the 27-field shape (research R2). */
function accRow(offset, over) {
  const base = Object.assign({
    year: CURRENT_YEAR + offset,
    age: CURRENT_AGE + offset,
    total: 1000000 + offset * 100000,
    p401k: 400000, p401kTrad: 300000, p401kRoth: 100000,
    pRothIra: 50000, pStocks: 500000, pCash: 50000, accessible: 550000,
    phase: 'accumulation',
    ssIncome: 0,
    withdrawal: 0,
    contribution: 60000,
    is401kUnlocked: false,
    grossIncome: 250000,
    federalTax: 42000,
    ficaTax: 12000,
    annualSpending: 120000,
    pretax401kEmployee: 23000,
    empMatchToTrad: 10000,
    stockContribution: 27000,
    cashFlowToCash: 0,
    cashFlowWarning: undefined,
    stockContributionActual: 27000,
    fundedFromCash: 0,
    fundedFromStocks: 0,
    hasShortfall: false,
  }, over || {});
  return withCompanions(base, BALANCE_FIELDS.concat(ACC_FLOW_FIELDS), offset);
}

/** Retirement-phase lifecycle row — the 15-field shape (research R2). */
function retRow(offset, over) {
  const base = Object.assign({
    year: CURRENT_YEAR + offset,
    age: CURRENT_AGE + offset,
    total: 2000000 - offset * 10000,
    p401k: 900000, p401kTrad: 700000, p401kRoth: 200000,
    pRothIra: 120000, pStocks: 900000, pCash: 80000, accessible: 980000,
    phase: 'phase2-401k-unlocked',
    ssIncome: 0,
    withdrawal: 130000,
    contribution: 0,
    is401kUnlocked: true,
    hasShortfall: false,
  }, over || {});
  return withCompanions(base, BALANCE_FIELDS.concat(RET_FLOW_FIELDS), offset);
}

/** Strategy trajectory row, keyed by `age` (the join key, data-model §2). */
function stratRow(offset, over) {
  const base = Object.assign({
    age: CURRENT_AGE + offset,
    year: CURRENT_YEAR + offset,
    ssIncome: 0,
    wTrad: 70000, wRoth: 0, wRothIra: 0, wStocks: 55000, wCash: 5000,
    syntheticConversion: 0,
    grossSpend: 130000,
    shortfall: 0,
  }, over || {});
  return withCompanions(base,
    ['wTrad', 'wRoth', 'wRothIra', 'wStocks', 'wCash', 'syntheticConversion', 'grossSpend', 'shortfall'],
    offset);
}

function settingsFixture(over) {
  return Object.assign({
    fireMode: 'safe',
    strategyId: 'bracket-fill-smoothed',
    strategyName: 'Bracket Fill (smoothed)',
    objective: 'preserve',
    mortgageStrategy: 'invest-keep-paying',
    retired: false,
    retirementYear: null,
    planEndAge: 95,
    inflationRate: 0.025,
    dashboardVariant: 'RR',
    exportTimestamp: '2026-08-13T12:00:00.000Z',
    appVersion: '037',
  }, over || {});
}

/** Recursively freeze so any mutation attempt throws under 'use strict'. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const k of Object.keys(value)) deepFreeze(value[k]);
  }
  return value;
}

function buildDefault(over) {
  const input = Object.assign({
    lifecycleRows: [accRow(0), accRow(1), retRow(2), retRow(3)],
    strategyRows: [stratRow(2), stratRow(3)],
    settings: settingsFixture(),
    currentYear: CURRENT_YEAR,
    language: 'en',
  }, over || {});
  return buildLifecycleExport(input);
}

/** Column index by key; asserts the column exists. */
function idx(model, key) {
  const i = model.columns.findIndex((c) => c.key === key);
  assert.notEqual(i, -1, `expected a column with key '${key}'`);
  return i;
}

function cell(model, rowIndex, key) {
  return model.rows[rowIndex][idx(model, key)];
}

// ---------------------------------------------------------------------------
// INV-2 — one row per year, ascending by exactly 1, no gaps
// ---------------------------------------------------------------------------

test('INV-2: emits one row per year, ascending by 1, matching meta', () => {
  const model = buildDefault();
  assert.equal(model.rows.length, 4);
  assert.equal(model.meta.rowCount, 4);
  assert.equal(model.meta.firstYear, CURRENT_YEAR);
  assert.equal(model.meta.lastYear, CURRENT_YEAR + 3);
  assert.equal(model.meta.rowCount, model.meta.lastYear - model.meta.firstYear + 1);
  const yearCol = idx(model, 'year');
  const years = model.rows.map((r) => r[yearCol]);
  assert.deepEqual(years, [2026, 2027, 2028, 2029]);
});

test('INV-2: a gap in the year sequence throws YEAR_SEQUENCE_INVALID', () => {
  assert.throws(
    () => buildDefault({ lifecycleRows: [accRow(0), accRow(1), retRow(3)] }),
    (err) => err.code === 'YEAR_SEQUENCE_INVALID');
});

test('INV-2: a duplicate year throws YEAR_SEQUENCE_INVALID', () => {
  assert.throws(
    () => buildDefault({ lifecycleRows: [accRow(0), accRow(1), accRow(1)] }),
    (err) => err.code === 'YEAR_SEQUENCE_INVALID');
});

test('INV-2: a descending year sequence throws YEAR_SEQUENCE_INVALID', () => {
  assert.throws(
    () => buildDefault({ lifecycleRows: [accRow(1), accRow(0)] }),
    (err) => err.code === 'YEAR_SEQUENCE_INVALID');
});

test('INV-2: a non-numeric year throws YEAR_SEQUENCE_INVALID', () => {
  assert.throws(
    () => buildDefault({ lifecycleRows: [accRow(0, { year: 'soon' })] }),
    (err) => err.code === 'YEAR_SEQUENCE_INVALID');
});

test('INV-2: first row not equal to currentYear throws YEAR_SEQUENCE_INVALID', () => {
  assert.throws(
    () => buildDefault({ currentYear: CURRENT_YEAR + 1 }),
    (err) => err.code === 'YEAR_SEQUENCE_INVALID');
});

// ---------------------------------------------------------------------------
// §C-1.2 error paths
// ---------------------------------------------------------------------------

test('LIFECYCLE_UNAVAILABLE: empty lifecycleRows', () => {
  assert.throws(() => buildDefault({ lifecycleRows: [] }),
    (err) => err.code === 'LIFECYCLE_UNAVAILABLE');
});

test('LIFECYCLE_UNAVAILABLE: lifecycleRows not an array', () => {
  for (const bad of [null, undefined, {}, 'rows', 7]) {
    assert.throws(() => buildDefault({ lifecycleRows: bad }),
      (err) => err.code === 'LIFECYCLE_UNAVAILABLE', `expected throw for ${String(bad)}`);
  }
});

test('LIFECYCLE_UNAVAILABLE: no input object at all', () => {
  assert.throws(() => buildLifecycleExport(undefined),
    (err) => err.code === 'LIFECYCLE_UNAVAILABLE');
});

test('SETTINGS_INCOMPLETE: settings absent', () => {
  assert.throws(() => buildDefault({ settings: undefined }),
    (err) => err.code === 'SETTINGS_INCOMPLETE');
});

test('SETTINGS_INCOMPLETE: each required provenance field is individually required', () => {
  const required = ['fireMode', 'strategyId', 'objective', 'mortgageStrategy',
    'planEndAge', 'inflationRate', 'dashboardVariant', 'exportTimestamp'];
  for (const key of required) {
    const partial = settingsFixture();
    delete partial[key];
    assert.throws(() => buildDefault({ settings: partial }),
      (err) => err.code === 'SETTINGS_INCOMPLETE' && err.message.includes(key),
      `expected SETTINGS_INCOMPLETE naming '${key}'`);
  }
});

test('errors carry a typed name and never return a partial model', () => {
  try {
    buildDefault({ lifecycleRows: [] });
    assert.fail('expected a throw');
  } catch (err) {
    assert.equal(err.name, 'LifecycleExportError');
    assert.equal(err.code, 'LIFECYCLE_UNAVAILABLE');
    assert.ok(err instanceof Error);
  }
});

// ---------------------------------------------------------------------------
// INV-4 — stable columns, independent of the data
// ---------------------------------------------------------------------------

test('INV-4: column set and order are identical for wildly different data', () => {
  const a = buildDefault();
  const b = buildDefault({
    lifecycleRows: [accRow(0, { pRothIra: 0, pCash: 0, p401kRoth: 0 })],
    strategyRows: [],
  });
  assert.deepEqual(a.columns.map((c) => c.key), b.columns.map((c) => c.key));
  assert.equal(a.meta.columnCount, b.meta.columnCount);
  assert.equal(a.meta.registryVersion, REGISTRY_VERSION);
});

test('INV-4: every row is exactly as long as the column list', () => {
  const model = buildDefault();
  for (const row of model.rows) assert.equal(row.length, model.columns.length);
  assert.equal(model.meta.columnCount, model.columns.length);
});

test('INV-4: a pool the user holds nothing in still gets its columns, valued 0', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0, { pRothIra: 0 })],
    strategyRows: [],
  });
  assert.equal(cell(model, 0, 'pRothIraPurchasingPower'), 0);
  assert.equal(cell(model, 0, 'pRothIraMoney'), 0);
});

test('INV-4: every column declares the full contract shape', () => {
  const model = buildDefault();
  const groups = new Set(['identity', 'balance', 'income', 'tax', 'spending',
    'contribution', 'withdrawal', 'diagnostic']);
  for (const col of model.columns) {
    assert.deepEqual(Object.keys(col).sort(),
      ['frame', 'group', 'header', 'key', 'numFmt', 'phases', 'source'],
      `column '${col.key}' must expose exactly the contract fields`);
    assert.ok(groups.has(col.group), `unknown group '${col.group}'`);
    assert.ok(['none', 'money', 'purchasingPower'].includes(col.frame));
    assert.ok(['lifecycle', 'strategy', 'derived'].includes(col.source));
    assert.ok(['accumulation', 'retirement', 'both'].includes(col.phases));
    assert.ok(['integer', 'currency', 'text'].includes(col.numFmt));
    assert.equal(typeof col.header, 'string');
    assert.ok(col.header.length > 0);
  }
});

test('INV-4: the identity group is first and contiguous (frozen-pane split)', () => {
  const model = buildDefault();
  const keys = model.columns.map((c) => c.key);
  assert.deepEqual(keys.slice(0, 5), ['year', 'age', 'phase', 'is401kUnlocked', 'hasShortfall']);
  const lastIdentity = model.columns.map((c) => c.group).lastIndexOf('identity');
  assert.equal(lastIdentity, 4);
});

// ---------------------------------------------------------------------------
// §C-1.3 — money / purchasing-power pairing
// ---------------------------------------------------------------------------

test('§C-1.3: every money column has its purchasing-power sibling immediately after', () => {
  const model = buildDefault();
  const cols = model.columns;
  let moneyCount = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].frame !== 'money') continue;
    moneyCount++;
    const sib = cols[i + 1];
    assert.ok(sib, `money column '${cols[i].key}' has no following column`);
    assert.equal(sib.frame, 'purchasingPower',
      `'${cols[i].key}' must be immediately followed by its purchasing-power sibling`);
    assert.equal(sib.key, cols[i].key.replace(/Money$/, 'PurchasingPower'));
    assert.equal(sib.group, cols[i].group);
    assert.equal(sib.phases, cols[i].phases);
    assert.equal(sib.source, cols[i].source);
  }
  assert.ok(moneyCount > 20, `expected a wide money column set, got ${moneyCount}`);
  // No orphan purchasing-power column.
  assert.equal(cols.filter((c) => c.frame === 'purchasingPower').length, moneyCount);
});

test('INV-3: money >= purchasing power, and equal only in the current year', () => {
  const model = buildDefault();
  const pairs = model.columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.frame === 'money');
  let comparedLate = 0;
  for (let r = 0; r < model.rows.length; r++) {
    for (const { i } of pairs) {
      const money = model.rows[r][i];
      const pp = model.rows[r][i + 1];
      if (money === null || pp === null) {
        assert.equal(money, pp, 'a blank money cell must have a blank sibling');
        continue;
      }
      assert.ok(money >= pp - 1e-9, `row ${r}: money ${money} < purchasing power ${pp}`);
      if (r === 0) {
        assert.ok(Math.abs(money - pp) < 1e-9, 'current-year frames must be equal');
      } else if (pp > 0) {
        assert.ok(money > pp, `row ${r}: later-year money must exceed purchasing power`);
        comparedLate++;
      }
    }
  }
  assert.ok(comparedLate > 0, 'fixture must exercise at least one later year');
});

test('INV-3 (signed): for a NEGATIVE amount the money frame is the larger magnitude, not the larger number', () => {
  // data-model INV-3 states `money >= purchasingPower`, which holds only for
  // non-negative amounts. A negative balance inflates the same way a positive
  // one does, so the money frame becomes MORE negative. The honest invariant is
  // same sign, magnitude never shrinking.
  const model = buildDefault({
    lifecycleRows: [accRow(0), accRow(1), retRow(2, { signedTotal: -50000 })],
    strategyRows: [stratRow(2)],
  });
  const money = cell(model, 2, 'signedTotalMoney');
  const pp = cell(model, 2, 'signedTotalPurchasingPower');
  assert.strictEqual(pp, -50000);
  assert.ok(money < 0, 'a negative purchasing-power amount stays negative in the money frame');
  assert.ok(Math.abs(money) >= Math.abs(pp), 'the money frame must not shrink the magnitude');
  assert.ok(money < pp, 'inflating a debt makes the money-frame number smaller, not larger');
});

test('meta.frameFallback is false when every BookValue companion is present', () => {
  const model = buildDefault();
  assert.equal(model.meta.frameFallback, false);
});

test('meta.frameFallback fires (and money falls back to the base field) when a companion is missing', () => {
  const row = accRow(1);
  delete row.totalBookValue;
  const model = buildDefault({ lifecycleRows: [accRow(0), row], strategyRows: [] });
  assert.equal(model.meta.frameFallback, true);
  assert.equal(cell(model, 1, 'totalMoney'), cell(model, 1, 'totalPurchasingPower'));
});

test('frameFallback does NOT fire merely because the underlying field is absent', () => {
  // Retirement rows genuinely lack grossIncome — that is a blank, not a fallback.
  const model = buildDefault();
  assert.equal(model.meta.frameFallback, false);
  assert.equal(cell(model, 2, 'grossIncomeMoney'), null);
});

// ---------------------------------------------------------------------------
// INV-7 — blank vs zero (data-model §2, all four cases)
// ---------------------------------------------------------------------------

test('INV-7 case 1: accumulation year, withdrawal column -> blank (not 0)', () => {
  const model = buildDefault();
  for (const key of ['withdrawalMoney', 'wTradMoney', 'wRothMoney', 'wRothIraMoney',
    'wStocksMoney', 'wCashMoney', 'syntheticConversionMoney']) {
    assert.strictEqual(cell(model, 0, key), null, `${key} must be blank in an accumulation year`);
    assert.strictEqual(cell(model, 0, key.replace('Money', 'PurchasingPower')), null);
  }
});

test('INV-7 case 2: retirement year, employment-income column -> blank (not 0)', () => {
  const model = buildDefault();
  assert.strictEqual(cell(model, 2, 'grossIncomeMoney'), null);
  assert.strictEqual(cell(model, 2, 'grossIncomePurchasingPower'), null);
  assert.strictEqual(cell(model, 2, 'federalTaxMoney'), null);
  assert.strictEqual(cell(model, 2, 'ficaTaxMoney'), null);
});

test('INV-7 case 3: retirement year, contribution column -> 0 (a measured zero)', () => {
  const model = buildDefault();
  for (const key of ['contributionMoney', 'pretax401kEmployeeMoney', 'empMatchToTradMoney',
    'stockContributionMoney', 'stockContributionActualMoney', 'cashFlowToCashMoney']) {
    assert.strictEqual(cell(model, 2, key), 0, `${key} must be a measured 0 in a retirement year`);
    assert.strictEqual(cell(model, 2, key.replace('Money', 'PurchasingPower')), 0);
  }
});

test('INV-7 case 4: any year, an empty pool -> 0 (a measured zero)', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0, { pCash: 0, pRothIra: 0 })],
    strategyRows: [],
  });
  assert.strictEqual(cell(model, 0, 'pCashMoney'), 0);
  assert.strictEqual(cell(model, 0, 'pRothIraMoney'), 0);
});

test('INV-7 case 5: retirement-year federal tax is blank when not surfaced (R4 not taken)', () => {
  const row = retRow(2);
  delete row.retirementFederalTax;
  delete row.retirementFederalTaxBookValue;
  const model = buildDefault({ lifecycleRows: [accRow(0), accRow(1), row], strategyRows: [stratRow(2)] });
  assert.strictEqual(cell(model, 2, 'retirementFederalTaxMoney'), null,
    'an uncomputed retirement tax must never read as "paid no tax"');
});

test('retirementFederalTax populates when the calc layer surfaces it (R4 taken)', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0), accRow(1), retRow(2, { retirementFederalTax: 18000 })],
    strategyRows: [stratRow(2)],
  });
  assert.strictEqual(cell(model, 2, 'retirementFederalTaxPurchasingPower'), 18000);
  assert.ok(cell(model, 2, 'retirementFederalTaxMoney') > 18000);
});

// ---------------------------------------------------------------------------
// Phase union — both directions (research R2)
// ---------------------------------------------------------------------------

test('phase union: an accumulation year populates cash-flow columns', () => {
  const model = buildDefault();
  assert.strictEqual(cell(model, 0, 'grossIncomePurchasingPower'), 250000);
  assert.strictEqual(cell(model, 0, 'federalTaxPurchasingPower'), 42000);
  assert.strictEqual(cell(model, 0, 'ficaTaxPurchasingPower'), 12000);
  assert.strictEqual(cell(model, 0, 'annualSpendingPurchasingPower'), 120000);
  assert.strictEqual(cell(model, 0, 'contributionPurchasingPower'), 60000);
  assert.strictEqual(cell(model, 0, 'pretax401kEmployeePurchasingPower'), 23000);
  assert.strictEqual(cell(model, 0, 'fundedFromCashPurchasingPower'), 0);
  // ...and leaves the retirement-only side blank.
  assert.strictEqual(cell(model, 0, 'grossSpendPurchasingPower'), null);
  assert.strictEqual(cell(model, 0, 'shortfallPurchasingPower'), null);
});

test('phase union: a retirement year populates withdrawal columns from the strategy row', () => {
  const model = buildDefault();
  assert.strictEqual(cell(model, 2, 'wTradPurchasingPower'), 70000);
  assert.strictEqual(cell(model, 2, 'wStocksPurchasingPower'), 55000);
  assert.strictEqual(cell(model, 2, 'wCashPurchasingPower'), 5000);
  assert.strictEqual(cell(model, 2, 'grossSpendPurchasingPower'), 130000);
  assert.strictEqual(cell(model, 2, 'withdrawalPurchasingPower'), 130000);
  // ...and leaves the accumulation-only side blank.
  assert.strictEqual(cell(model, 2, 'annualSpendingPurchasingPower'), null);
  assert.strictEqual(cell(model, 2, 'fundedFromCashPurchasingPower'), null);
  assert.strictEqual(cell(model, 2, 'cashFlowWarning'), null);
});

test('join on age: a missing strategy-row match leaves withdrawal columns blank, never 0', () => {
  const model = buildDefault({ strategyRows: [stratRow(2)] }); // offset 3 has no match
  assert.strictEqual(cell(model, 2, 'wTradPurchasingPower'), 70000);
  assert.strictEqual(cell(model, 3, 'wTradPurchasingPower'), null);
  assert.strictEqual(cell(model, 3, 'wTradMoney'), null);
  assert.strictEqual(cell(model, 3, 'grossSpendPurchasingPower'), null);
  assert.strictEqual(cell(model, 3, 'shortfallPurchasingPower'), null);
  // The lifecycle-sourced withdrawal total still populates — it is on the row.
  assert.strictEqual(cell(model, 3, 'withdrawalPurchasingPower'), 130000);
});

test('join on age: strategyRows omitted entirely leaves strategy columns blank', () => {
  const model = buildDefault({ strategyRows: undefined });
  assert.strictEqual(cell(model, 2, 'wTradMoney'), null);
  assert.strictEqual(cell(model, 2, 'grossSpendMoney'), null);
});

test('join on age: matches on age, not on array position', () => {
  const model = buildDefault({
    strategyRows: [stratRow(3, { wTrad: 11111 }), stratRow(2, { wTrad: 22222 })],
  });
  assert.strictEqual(cell(model, 2, 'wTradPurchasingPower'), 22222);
  assert.strictEqual(cell(model, 3, 'wTradPurchasingPower'), 11111);
});

// ---------------------------------------------------------------------------
// US4 — identity flags, phase transitions, depletion (T029 / T030)
// ---------------------------------------------------------------------------

test('identity columns carry phase, 401K unlock, and shortfall from the lifecycle row', () => {
  const model = buildDefault({
    lifecycleRows: [
      accRow(0),
      retRow(1, { phase: 'phase1-taxable-only', is401kUnlocked: false }),
      retRow(2, { phase: 'phase2-401k-unlocked', is401kUnlocked: true, hasShortfall: true }),
      retRow(3, { phase: 'phase3-with-ss', is401kUnlocked: true }),
    ],
    strategyRows: [],
  });
  assert.equal(cell(model, 0, 'phase'), 'Accumulation');
  assert.notEqual(cell(model, 1, 'phase'), cell(model, 0, 'phase'));
  assert.notEqual(cell(model, 2, 'phase'), cell(model, 1, 'phase'));
  assert.notEqual(cell(model, 3, 'phase'), cell(model, 2, 'phase'));
  assert.equal(cell(model, 0, 'is401kUnlocked'), 'No');
  assert.equal(cell(model, 2, 'is401kUnlocked'), 'Yes');
  assert.equal(cell(model, 1, 'hasShortfall'), 'No');
  assert.equal(cell(model, 2, 'hasShortfall'), 'Yes');
});

test('an unrecognised phase value passes through rather than being dropped', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0), retRow(1, { phase: 'some-future-phase' })],
    strategyRows: [],
  });
  assert.equal(cell(model, 1, 'phase'), 'some-future-phase');
});

test('INV-8: a clamped display zero is distinguishable from genuine depletion', () => {
  const model = buildDefault({
    lifecycleRows: [
      accRow(0),
      retRow(1, { total: 0, totalBookValue: 0, hasShortfall: false }),  // genuinely empty, funded
      retRow(2, { total: 0, totalBookValue: 0, hasShortfall: true }),   // clamped at 0 — depleted
    ],
    strategyRows: [stratRow(2, { shortfall: 40000 })],
  });
  assert.strictEqual(cell(model, 1, 'totalMoney'), 0);
  assert.strictEqual(cell(model, 2, 'totalMoney'), 0);
  assert.equal(cell(model, 1, 'hasShortfall'), 'No');
  assert.equal(cell(model, 2, 'hasShortfall'), 'Yes');
  assert.strictEqual(cell(model, 2, 'shortfallPurchasingPower'), 40000);
});

test('INV-8: signedTotal is blank (never 0) when the calc layer has not surfaced it', () => {
  // Phase 7 not landed: the column exists (INV-4) but must not assert "zero".
  const model = buildDefault();
  for (let r = 0; r < model.rows.length; r++) {
    assert.strictEqual(cell(model, r, 'signedTotalMoney'), null,
      `row ${r}: an un-surfaced signedTotal must read blank, never 0`);
    assert.strictEqual(cell(model, r, 'signedTotalPurchasingPower'), null);
  }
  assert.equal(model.meta.frameFallback, false,
    'an absent field is a blank, not a frame fallback');
});

test('INV-8: signedTotal recovers the sign the clamped total loses (Phase 7 landed)', () => {
  const model = buildDefault({
    lifecycleRows: [
      accRow(0),
      accRow(1),
      // The chart row is clamped to 0; the sibling field carries the truth.
      retRow(2, { total: 0, totalBookValue: 0, hasShortfall: true, signedTotal: -120000 }),
      retRow(3, { total: 0, totalBookValue: 0, hasShortfall: false, signedTotal: 0 }),
    ],
    strategyRows: [stratRow(2, { shortfall: 40000 }), stratRow(3, { shortfall: 0 })],
  });
  assert.strictEqual(cell(model, 2, 'totalPurchasingPower'), 0, 'the clamped total is what it is');
  assert.strictEqual(cell(model, 2, 'signedTotalPurchasingPower'), -120000,
    'signedTotal must expose the depletion the clamp hid');
  // A genuinely-empty-but-solvent year reads a measured 0, not a negative.
  assert.strictEqual(cell(model, 3, 'signedTotalPurchasingPower'), 0);
  assert.notEqual(cell(model, 2, 'signedTotalPurchasingPower'), cell(model, 3, 'signedTotalPurchasingPower'));
});

test('INV-8: signedTotal is a retirement-phase diagnostic column with a money/PP pair', () => {
  const model = buildDefault();
  const money = model.columns[idx(model, 'signedTotalMoney')];
  const pp = model.columns[idx(model, 'signedTotalPurchasingPower')];
  assert.equal(money.group, 'diagnostic');
  assert.equal(money.phases, 'retirement');
  assert.equal(money.source, 'lifecycle');
  assert.equal(money.numFmt, 'currency');
  assert.equal(money.frame, 'money');
  assert.equal(pp.frame, 'purchasingPower');
  assert.equal(idx(model, 'signedTotalPurchasingPower'), idx(model, 'signedTotalMoney') + 1);
});

test('INV-8: signedTotal reads its BookValue companion when present', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0), accRow(1),
      retRow(2, { signedTotal: -120000 })],
    strategyRows: [],
  });
  assert.strictEqual(cell(model, 2, 'signedTotalMoney'), -120000 * Math.pow(1.025, 2));
  assert.strictEqual(cell(model, 2, 'signedTotalPurchasingPower'), -120000);
  assert.equal(model.meta.frameFallback, false);
});

test('INV-8: the export never re-clamps a negative balance to zero', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0), retRow(1, { total: -75000, totalBookValue: -76875, hasShortfall: true })],
    strategyRows: [],
  });
  assert.strictEqual(cell(model, 1, 'totalPurchasingPower'), -75000);
  assert.ok(cell(model, 1, 'totalMoney') < 0, 'a negative money total must survive the export');
});

// ---------------------------------------------------------------------------
// INV-6 — no mutation
// ---------------------------------------------------------------------------

test('INV-6: frozen inputs are accepted and left untouched', () => {
  const lifecycleRows = [accRow(0), accRow(1), retRow(2)].map(deepFreeze);
  const strategyRows = [stratRow(2)].map(deepFreeze);
  const settings = deepFreeze(settingsFixture());
  const before = JSON.stringify({ lifecycleRows, strategyRows, settings });

  const model = buildLifecycleExport(
    Object.freeze({ lifecycleRows: Object.freeze(lifecycleRows), strategyRows: Object.freeze(strategyRows), settings, currentYear: CURRENT_YEAR, language: 'en' }));

  assert.ok(model.rows.length === 3);
  assert.equal(JSON.stringify({ lifecycleRows, strategyRows, settings }), before);
});

test('INV-6: calling twice on the same inputs yields identical models', () => {
  const input = {
    lifecycleRows: [accRow(0), accRow(1), retRow(2)],
    strategyRows: [stratRow(2)],
    settings: settingsFixture(),
    currentYear: CURRENT_YEAR,
    language: 'en',
  };
  const a = buildLifecycleExport(input);
  const b = buildLifecycleExport(input);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.columns, b.columns);
  assert.deepEqual(a.settings, b.settings);
});

// ---------------------------------------------------------------------------
// Settings block (T024, data-model §1.3)
// ---------------------------------------------------------------------------

test('settings: emits label/value pairs covering every provenance field', () => {
  const model = buildDefault();
  assert.ok(Array.isArray(model.settings));
  for (const entry of model.settings) {
    assert.deepEqual(Object.keys(entry).sort(), ['label', 'value']);
    assert.equal(typeof entry.label, 'string');
    assert.equal(typeof entry.value, 'string');
    assert.ok(entry.label.length > 0);
  }
  const joined = model.settings.map((s) => s.value).join(' | ');
  assert.ok(joined.includes('safe'));
  assert.ok(joined.includes('bracket-fill-smoothed'));
  assert.ok(joined.includes('invest-keep-paying'));
  assert.ok(joined.includes('95'));
  assert.ok(joined.includes('2026-08-13T12:00:00.000Z'));
  assert.ok(joined.includes('RR'));
});

test('settings: records the retirement status and transition year when retired', () => {
  const model = buildDefault({
    settings: settingsFixture({ retired: true, retirementYear: 2031 }),
  });
  const joined = model.settings.map((s) => s.value).join(' | ');
  assert.ok(joined.includes('2031'));
});

test('settings: states plainly that retirement-year tax is not reported when absent (contract C-3 fallback)', () => {
  const row = retRow(2);
  delete row.retirementFederalTax;
  delete row.retirementFederalTaxBookValue;
  const absent = buildDefault({ lifecycleRows: [accRow(0), accRow(1), row], strategyRows: [] });
  const present = buildDefault({
    lifecycleRows: [accRow(0), accRow(1), retRow(2, { retirementFederalTax: 18000 })],
    strategyRows: [],
  });
  const absentValues = absent.settings.map((s) => s.value).join(' | ');
  const presentValues = present.settings.map((s) => s.value).join(' | ');
  assert.ok(/not reported/i.test(absentValues),
    'the Settings block must state that retirement-year tax is not reported');
  assert.ok(!/not reported/i.test(presentValues));
});

// ---------------------------------------------------------------------------
// i18n headers (T020) — project money / purchasing-power terminology
// ---------------------------------------------------------------------------

test('headers: English headers name their frame with the project vocabulary', () => {
  const model = buildDefault({ language: 'en' });
  const byKey = new Map(model.columns.map((c) => [c.key, c.header]));
  assert.ok(byKey.get('totalMoney').includes('(Book Value)'));
  assert.ok(byKey.get('totalPurchasingPower').includes('(purchasing power)'));
  assert.equal(byKey.get('year'), 'Year');
  assert.equal(byKey.get('age'), 'Age');
});

test('headers: zh-TW localises every header and every settings label', () => {
  const en = buildDefault({ language: 'en' });
  const zh = buildDefault({ language: 'zh' });
  assert.equal(zh.columns.length, en.columns.length);
  let differing = 0;
  for (let i = 0; i < zh.columns.length; i++) {
    assert.equal(zh.columns[i].key, en.columns[i].key, 'keys must not localise');
    if (zh.columns[i].header !== en.columns[i].header) differing++;
  }
  assert.ok(differing > 50, `expected the zh-TW headers to differ broadly, only ${differing} did`);
  assert.ok(zh.columns.some((c) => c.header.includes('帳面價值')));
  assert.ok(zh.columns.some((c) => c.header.includes('約等於今日價值')));
  for (const entry of zh.settings) assert.ok(entry.label.length > 0);
});

test('headers: an unknown language falls back to English rather than throwing', () => {
  const en = buildDefault({ language: 'en' });
  const other = buildDefault({ language: 'fr' });
  assert.deepEqual(other.columns.map((c) => c.header), en.columns.map((c) => c.header));
});

test('headers: never use the forbidden "real $" / "real money" vocabulary', () => {
  for (const language of ['en', 'zh']) {
    const model = buildDefault({ language });
    const text = model.columns.map((c) => c.header)
      .concat(model.settings.map((s) => s.label))
      .join(' | ');
    assert.ok(!/real\s*\$/i.test(text), `found "real $" in ${language} headers`);
    assert.ok(!/real (money|dollars|value)/i.test(text), `found "real money/dollars/value" in ${language} headers`);
    assert.ok(!/nominal/i.test(text), `found "nominal" in ${language} headers`);
  }
});

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

test('registry: produces the 70-column v1 set from data-model §3', () => {
  const model = buildDefault();
  assert.equal(model.columns.length, 70);
  const counts = {};
  for (const c of model.columns) counts[c.group] = (counts[c.group] || 0) + 1;
  assert.deepEqual(counts, {
    identity: 5, balance: 16, income: 4, tax: 6,
    spending: 4, contribution: 12, withdrawal: 14, diagnostic: 9,
  });
});

test('registry: column keys are unique', () => {
  const model = buildDefault();
  const keys = model.columns.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('registry: identity and flag columns carry integer/text formats, money columns currency', () => {
  const model = buildDefault();
  const byKey = new Map(model.columns.map((c) => [c.key, c]));
  assert.equal(byKey.get('year').numFmt, 'integer');
  assert.equal(byKey.get('age').numFmt, 'integer');
  assert.equal(byKey.get('phase').numFmt, 'text');
  assert.equal(byKey.get('totalMoney').numFmt, 'currency');
  assert.equal(byKey.get('totalPurchasingPower').numFmt, 'currency');
  assert.equal(byKey.get('cashFlowWarning').numFmt, 'text');
});

test('cashFlowWarning surfaces the diagnostic string in accumulation years', () => {
  const model = buildDefault({
    lifecycleRows: [accRow(0, { cashFlowWarning: 'NEGATIVE_RESIDUAL' }), accRow(1)],
    strategyRows: [],
  });
  assert.equal(cell(model, 0, 'cashFlowWarning'), 'NEGATIVE_RESIDUAL');
  assert.strictEqual(cell(model, 1, 'cashFlowWarning'), null);
});

test('purity: the module holds no DOM, timer, or ExcelJS reference', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'calc', 'lifecycleExport.js'), 'utf8');
  for (const banned of ['document', 'window', 'localStorage', 'ExcelJS', 'Date.now', 'new Date']) {
    assert.ok(!src.includes(banned), `calc/lifecycleExport.js must not reference '${banned}'`);
  }
});
