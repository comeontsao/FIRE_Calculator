/*
 * calc/lifecycleExport.js — Year-by-year lifecycle export model (Feature 037).
 *
 * Feature: 037-lifecycle-excel-export
 * Contract: specs/037-lifecycle-excel-export/contracts/lifecycle-export.contract.md §C-1
 * Data model: specs/037-lifecycle-excel-export/data-model.md §2 (union topology), §3 (registry), §4 (invariants)
 *
 * Turns the projection the Lifecycle chart just rendered into a flat, spreadsheet-shaped
 * table: a stable ordered column registry plus one row per calendar year. It writes no
 * bytes and knows nothing about spreadsheets — the browser layer takes {columns, rows,
 * settings} and emits the workbook.
 *
 * Inputs — buildLifecycleExport({ lifecycleRows, strategyRows, settings, currentYear, language }):
 *   - lifecycleRows: Array<Object>, required. The cached chart projection rows, with
 *       `<field>BookValue` companions already attached upstream. Two DIFFERENT shapes
 *       (research R2): accumulation rows carry ~27 fields incl. cash-flow detail;
 *       retirement rows carry only 15 (balances, ssIncome, withdrawal, contribution).
 *   - strategyRows: Array<Object>, optional. The ACTIVE strategy's per-year rows, joined
 *       onto lifecycle rows by `age`; absent ⇒ the strategy-sourced columns go blank.
 *
 *       THREE DIFFERENT ARRAYS can plausibly be passed here and they are NOT
 *       interchangeable. Getting this wrong produces a workbook that is quietly wrong in
 *       ~18 columns and throws nothing, because blank is a legitimate value in this model
 *       — no exception, and `meta.frameFallback` stays false. Know which one you hold:
 *
 *       1. `perYearRows` — WHAT THE EXPORT HANDLER ACTUALLY PASSES. Built by
 *          `Object.assign(rowBase, mix)` (RR ~13215), so it carries the `mix` fields plus
 *          `age` / `phase` / `totalStart`. It does NOT carry `grossSpend` or `ssIncome`.
 *          Feature 037 surfaces `grossSpend` onto it with one additive line at the
 *          construction site; without that line the `grossSpend` column reads blank.
 *       2. `result.strategy` — from computeWithdrawalStrategy (RR ~13752 push, ~13802
 *          return); the array `_extendRowsWithBookValues` decorates at RR ~16348. Carries
 *          `grossSpend`, `ssIncome`, `taxOwed`, the `w*` fields and the pool-after fields.
 *       3. `options._trajectory` — NEVER pass these. Same quantities under DIFFERENT names
 *          (`synth`, not `syntheticConversion` — RR:10440 / Generic:10595) and they never
 *          receive BookValue companions.
 *
 *       Field-location note, because an incomplete enumeration of the producers caused
 *       FOUR wrong conclusions during this feature: `grossSpend` appears in four places —
 *       the trajectory row (RR:10441), two transient `ctx` objects never spread onto any
 *       row (RR:11976, RR:13197), and the strategy row (RR:13771). Checking any single
 *       producer proves nothing about whether this module can see the field; enumerate
 *       all of them, then check which array the CALLER hands over.
 *   - settings: Object, required. Provenance (data-model §1.3). The export timestamp is
 *       passed IN — this module reads no clock.
 *   - currentYear: number, required. Must equal the first lifecycle row's year.
 *   - language: 'en' | 'zh'. Anything else falls back to 'en'.
 *
 * Outputs — ExportModel:
 *   { columns: ExportColumn[],                 // registry order; {key,header,group,frame,source,phases,numFmt}
 *     rows:    Array<Array<number|string|null>>, // parallel to columns; null === blank cell
 *     settings: Array<{label, value}>,          // localised provenance pairs
 *     meta:    { rowCount, firstYear, lastYear, columnCount, registryVersion, frameFallback } }
 *
 * Throws a typed LifecycleExportError (never a partial model), `err.code` one of:
 *   LIFECYCLE_UNAVAILABLE | YEAR_SEQUENCE_INVALID | SETTINGS_INCOMPLETE
 *
 * Consumers (Constitution Principle VI):
 *   - exportLifecycleProjectionXlsx() in FIRE-Dashboard.html + FIRE-Dashboard-Generic.html
 *   - tests/unit/lifecycleExport.test.js (regression pin)
 *   - tests/unit/globalScopeCollision.test.js (static guard)
 *
 * FRAME: dual — emitted side by side, NEVER converted here.
 *   Money (the figure a broker statement shows) is READ from the pre-computed
 *   `<field>BookValue` companion. Purchasing power (today's spending-capacity
 *   equivalent) is READ from the base field. All real->nominal conversion lives in
 *   calc/displayConverter.js and stays there (Principle III, research R3). If a
 *   companion is absent the money cell falls back to the base field and
 *   meta.frameFallback flips true — observable, never silent.
 *
 * Purity (Constitution II): no DOM, no browser globals, no storage, no clock, no
 * spreadsheet library, no module-scope mutation. Inputs are never mutated (INV-6);
 * callers may pass frozen objects.
 *
 * UMD wrapper per Constitution V — Node `require` AND file:// classic <script>.
 */

'use strict';

// ---------------------------------------------------------------------------
// Registry version. Bump ONLY when the column set or order changes; the shipped
// order is a contract with the user's eyes so two exports can be diffed (FR-015b).
// ---------------------------------------------------------------------------
const LIFECYCLE_EXPORT_REGISTRY_VERSION = '037.v1';

const LIFECYCLE_EXPORT_ERROR_CODES = Object.freeze({
  LIFECYCLE_UNAVAILABLE: 'LIFECYCLE_UNAVAILABLE',
  YEAR_SEQUENCE_INVALID: 'YEAR_SEQUENCE_INVALID',
  SETTINGS_INCOMPLETE: 'SETTINGS_INCOMPLETE',
});

/** Provenance fields without which the file cannot honestly say what produced it. */
const REQUIRED_SETTINGS_KEYS = Object.freeze([
  'fireMode', 'strategyId', 'objective', 'mortgageStrategy',
  'planEndAge', 'inflationRate', 'dashboardVariant', 'exportTimestamp',
]);

function lifecycleExportError(code, message) {
  const err = new Error(message);
  err.name = 'LifecycleExportError';
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Measure registry (data-model §3). ORDER BELOW IS THE SHIPPED ORDER.
//
// `money: true` expands into TWO adjacent columns — the money frame first, its
// purchasing-power sibling immediately after (contract §C-1.3).
//
// `phases` says which phase populates the measure. An off-phase cell is blank
// (null) EXCEPT for the contribution group, where the honest answer in a
// retirement year is a measured 0 rather than "not applicable" (data-model §2).
// ---------------------------------------------------------------------------
function defineMeasure(key, group, source, phases, opts) {
  const o = opts || {};
  return {
    key: key,
    group: group,
    source: source,
    phases: phases,
    money: o.money === true,
    kind: o.kind || (o.money === true ? 'number' : 'text'),
    numFmt: o.numFmt || (o.money === true ? 'currency' : 'text'),
    offPhase: Object.prototype.hasOwnProperty.call(o, 'offPhase') ? o.offPhase : null,
  };
}

const MEASURES = Object.freeze([
  // --- identity: frozen, always visible (FR-011d) ---------------------------
  defineMeasure('year', 'identity', 'lifecycle', 'both', { kind: 'number', numFmt: 'integer' }),
  defineMeasure('age', 'identity', 'lifecycle', 'both', { kind: 'number', numFmt: 'integer' }),
  defineMeasure('phase', 'identity', 'lifecycle', 'both', { kind: 'phase' }),
  defineMeasure('is401kUnlocked', 'identity', 'lifecycle', 'both', { kind: 'bool' }),
  defineMeasure('hasShortfall', 'identity', 'lifecycle', 'both', { kind: 'bool' }),

  // --- balance: every pool, both phases -------------------------------------
  defineMeasure('total', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('p401k', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('p401kTrad', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('p401kRoth', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('pRothIra', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('pStocks', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('pCash', 'balance', 'lifecycle', 'both', { money: true }),
  defineMeasure('accessible', 'balance', 'lifecycle', 'both', { money: true }),

  // --- income ---------------------------------------------------------------
  defineMeasure('grossIncome', 'income', 'lifecycle', 'accumulation', { money: true }),
  defineMeasure('ssIncome', 'income', 'lifecycle', 'both', { money: true }),

  // --- tax ------------------------------------------------------------------
  defineMeasure('federalTax', 'tax', 'lifecycle', 'accumulation', { money: true }),
  defineMeasure('ficaTax', 'tax', 'lifecycle', 'accumulation', { money: true }),
  // Blank unless the calc layer surfaces it (contract §C-3 / research R4). A blank
  // here must never read as "paid no tax".
  defineMeasure('retirementFederalTax', 'tax', 'lifecycle', 'retirement', { money: true }),

  // --- spending -------------------------------------------------------------
  defineMeasure('annualSpending', 'spending', 'lifecycle', 'accumulation', { money: true }),
  defineMeasure('grossSpend', 'spending', 'strategy', 'retirement', { money: true }),

  // --- contribution: off-phase value is a measured 0, not a blank ------------
  defineMeasure('contribution', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),
  defineMeasure('pretax401kEmployee', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),
  defineMeasure('empMatchToTrad', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),
  defineMeasure('stockContribution', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),
  defineMeasure('stockContributionActual', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),
  defineMeasure('cashFlowToCash', 'contribution', 'lifecycle', 'accumulation', { money: true, offPhase: 0 }),

  // --- withdrawal: retirement only; by-source joined from the strategy rows ---
  defineMeasure('withdrawal', 'withdrawal', 'lifecycle', 'retirement', { money: true }),
  defineMeasure('wTrad', 'withdrawal', 'strategy', 'retirement', { money: true }),
  defineMeasure('wRoth', 'withdrawal', 'strategy', 'retirement', { money: true }),
  defineMeasure('wRothIra', 'withdrawal', 'strategy', 'retirement', { money: true }),
  defineMeasure('wStocks', 'withdrawal', 'strategy', 'retirement', { money: true }),
  defineMeasure('wCash', 'withdrawal', 'strategy', 'retirement', { money: true }),
  defineMeasure('syntheticConversion', 'withdrawal', 'strategy', 'retirement', { money: true }),

  // --- diagnostic -----------------------------------------------------------
  defineMeasure('fundedFromCash', 'diagnostic', 'lifecycle', 'accumulation', { money: true }),
  defineMeasure('fundedFromStocks', 'diagnostic', 'lifecycle', 'accumulation', { money: true }),
  defineMeasure('cashFlowWarning', 'diagnostic', 'lifecycle', 'accumulation', { kind: 'text' }),
  defineMeasure('shortfall', 'diagnostic', 'strategy', 'retirement', { money: true }),
  // INV-8 / FR-018. `projectFullLifecycle` writes `total: Math.max(0, total)` onto
  // the row, so `total` arrives pre-clamped and no pure module can recover the
  // sign. `signedTotal` is the additive Phase 7 sibling carrying the un-clamped
  // figure. ABSENT-SAFE: blank (never 0) when the calc layer has not surfaced it —
  // a zero here would assert "ended the year exactly empty", which is the very
  // claim the clamp already makes falsely.
  defineMeasure('signedTotal', 'diagnostic', 'lifecycle', 'retirement', { money: true }),
]);

// ---------------------------------------------------------------------------
// Localised text. Money / purchasing-power vocabulary matches the dashboard's
// existing `display.frame.*` catalog keys — never "real $" (CLAUDE.md hard rule).
// ---------------------------------------------------------------------------
const FRAME_SUFFIX = Object.freeze({
  en: Object.freeze({ money: ' (Book Value)', purchasingPower: ' (purchasing power)' }),
  zh: Object.freeze({ money: '（帳面價值）', purchasingPower: '（約等於今日價值）' }),
});

const MEASURE_LABELS = Object.freeze({
  en: Object.freeze({
    year: 'Year',
    age: 'Age',
    phase: 'Plan phase',
    is401kUnlocked: '401K unlocked',
    hasShortfall: 'Shortfall this year',
    total: 'Total portfolio',
    p401k: '401K total',
    p401kTrad: 'Traditional 401K',
    p401kRoth: 'Roth 401K',
    pRothIra: 'Roth IRA',
    pStocks: 'Taxable brokerage',
    pCash: 'Cash',
    accessible: 'Accessible before 59.5',
    grossIncome: 'Employment income',
    ssIncome: 'Social Security income',
    federalTax: 'Federal income tax',
    ficaTax: 'FICA payroll tax',
    retirementFederalTax: 'Federal income tax in retirement',
    annualSpending: 'Annual spending',
    grossSpend: 'Spending need',
    contribution: 'Contributions total',
    pretax401kEmployee: 'Employee pre-tax 401K',
    empMatchToTrad: 'Employer match to Traditional',
    stockContribution: 'Brokerage contribution planned',
    stockContributionActual: 'Brokerage contribution actual',
    cashFlowToCash: 'Cash flow into cash',
    withdrawal: 'Withdrawals total',
    wTrad: 'Withdrawn from Traditional 401K',
    wRoth: 'Withdrawn from Roth 401K',
    wRothIra: 'Withdrawn from Roth IRA',
    wStocks: 'Withdrawn from brokerage',
    wCash: 'Withdrawn from cash',
    syntheticConversion: 'Surplus reinvested',
    fundedFromCash: 'Shortfall funded from cash',
    fundedFromStocks: 'Shortfall funded from brokerage',
    cashFlowWarning: 'Cash-flow warning',
    shortfall: 'Unfunded shortfall',
    signedTotal: 'Total portfolio before depletion clamp',
  }),
  zh: Object.freeze({
    year: '年份',
    age: '年齡',
    phase: '計畫階段',
    is401kUnlocked: '401K 已解鎖',
    hasShortfall: '本年度資金缺口',
    total: '投資組合總額',
    p401k: '401K 總額',
    p401kTrad: '傳統 401K',
    p401kRoth: 'Roth 401K',
    pRothIra: 'Roth IRA',
    pStocks: '應稅券商帳戶',
    pCash: '現金',
    accessible: '59.5 歲前可動用資產',
    grossIncome: '工作收入',
    ssIncome: '社會安全福利收入',
    federalTax: '聯邦所得稅',
    ficaTax: 'FICA 薪資稅',
    retirementFederalTax: '退休期聯邦所得稅',
    annualSpending: '年度支出',
    grossSpend: '年度支出需求',
    contribution: '提撥總額',
    pretax401kEmployee: '員工稅前 401K 提撥',
    empMatchToTrad: '雇主提撥至傳統帳戶',
    stockContribution: '券商投入（計畫）',
    stockContributionActual: '券商投入（實際）',
    cashFlowToCash: '流入現金',
    withdrawal: '提領總額',
    wTrad: '自傳統 401K 提領',
    wRoth: '自 Roth 401K 提領',
    wRothIra: '自 Roth IRA 提領',
    wStocks: '自券商帳戶提領',
    wCash: '自現金提領',
    syntheticConversion: '盈餘再投入',
    fundedFromCash: '由現金補足缺口',
    fundedFromStocks: '由券商帳戶補足缺口',
    cashFlowWarning: '現金流警示',
    shortfall: '未補足缺口',
    signedTotal: '未套用歸零下限的投資組合總額',
  }),
});

const PHASE_LABELS = Object.freeze({
  en: Object.freeze({
    'accumulation': 'Accumulation',
    'phase1-taxable-only': 'Retired — taxable only',
    'phase2-401k-unlocked': 'Retired — 401K unlocked',
    'phase3-with-ss': 'Retired — with Social Security',
    'drawdown-no-ss': 'Retired — before Social Security',
  }),
  zh: Object.freeze({
    'accumulation': '累積期',
    'phase1-taxable-only': '退休：僅可動用應稅帳戶',
    'phase2-401k-unlocked': '退休：401K 已解鎖',
    'phase3-with-ss': '退休：含社會安全福利',
    'drawdown-no-ss': '退休：社安福利前',
  }),
});

const BOOL_LABELS = Object.freeze({
  en: Object.freeze({ yes: 'Yes', no: 'No' }),
  zh: Object.freeze({ yes: '是', no: '否' }),
});

const SETTINGS_LABELS = Object.freeze({
  en: Object.freeze({
    dashboardVariant: 'Dashboard',
    fireMode: 'FIRE mode',
    strategyId: 'Withdrawal strategy (id)',
    strategyName: 'Withdrawal strategy',
    objective: 'Objective',
    mortgageStrategy: 'Mortgage strategy',
    retired: 'Retirement status declared',
    retirementYear: 'Retirement transition year',
    planEndAge: 'Plan end age',
    inflationRate: 'Inflation rate assumed',
    language: 'Language',
    retirementTax: 'Retirement-year federal tax',
    registryVersion: 'Column registry version',
    appVersion: 'Produced by',
    exportTimestamp: 'Exported at',
  }),
  zh: Object.freeze({
    dashboardVariant: '儀表板版本',
    fireMode: 'FIRE 模式',
    strategyId: '提領策略（代碼）',
    strategyName: '提領策略',
    objective: '目標',
    mortgageStrategy: '房貸策略',
    retired: '已宣告退休',
    retirementYear: '退休轉換年份',
    planEndAge: '計畫結束年齡',
    inflationRate: '假設通膨率',
    language: '語言',
    retirementTax: '退休期聯邦所得稅',
    registryVersion: '欄位版本',
    appVersion: '產生自',
    exportTimestamp: '匯出時間',
  }),
});

const SETTINGS_VALUE_LABELS = Object.freeze({
  en: Object.freeze({ yes: 'Yes', no: 'No', none: '—', reported: 'Reported', notReported: 'Not reported' }),
  zh: Object.freeze({ yes: '是', no: '否', none: '—', reported: '已提供', notReported: '未提供' }),
});

function resolveLanguage(language) {
  return (language === 'zh') ? 'zh' : 'en';
}

// ---------------------------------------------------------------------------
// Column construction — a pure function of (registry, language). NEVER of data.
// ---------------------------------------------------------------------------
function buildColumns(language) {
  const lang = resolveLanguage(language);
  const labels = MEASURE_LABELS[lang];
  const suffix = FRAME_SUFFIX[lang];
  const columns = [];
  for (const measure of MEASURES) {
    const label = labels[measure.key] || measure.key;
    if (!measure.money) {
      columns.push({
        key: measure.key,
        header: label,
        group: measure.group,
        frame: 'none',
        source: measure.source,
        phases: measure.phases,
        numFmt: measure.numFmt,
      });
      continue;
    }
    columns.push({
      key: measure.key + 'Money',
      header: label + suffix.money,
      group: measure.group,
      frame: 'money',
      source: measure.source,
      phases: measure.phases,
      numFmt: measure.numFmt,
    });
    columns.push({
      key: measure.key + 'PurchasingPower',
      header: label + suffix.purchasingPower,
      group: measure.group,
      frame: 'purchasingPower',
      source: measure.source,
      phases: measure.phases,
      numFmt: measure.numFmt,
    });
  }
  return columns;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * Accumulation vs retirement. `phase === 'accumulation'` is the projection's own
 * discriminator; the fallback covers rows that predate the field by testing for a
 * cash-flow-only field (research R2).
 */
function isAccumulationRow(row) {
  if (typeof row.phase === 'string' && row.phase.length > 0) return row.phase === 'accumulation';
  return Object.prototype.hasOwnProperty.call(row, 'grossIncome');
}

function measureApplies(measure, isAccumulation) {
  if (measure.phases === 'both') return true;
  return (measure.phases === 'accumulation') === isAccumulation;
}

function localisedPhase(raw, lang) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const map = PHASE_LABELS[lang];
  // Unknown phase values pass through verbatim rather than vanishing — a future
  // phase must still be readable in the file.
  return Object.prototype.hasOwnProperty.call(map, raw) ? map[raw] : raw;
}

function localisedBool(raw, lang) {
  if (raw === true) return BOOL_LABELS[lang].yes;
  if (raw === false) return BOOL_LABELS[lang].no;
  return null;
}

/**
 * Cells for one measure in one year. Returns 1 value (frame 'none') or 2
 * (money then purchasing power). Mutates `flags.frameFallback` only.
 *
 * INV-8: no clamping happens here. A negative balance survives verbatim, so a
 * genuinely depleted year is never laundered into a display zero.
 */
function cellsFor(measure, lifecycleRow, strategyRow, isAccumulation, lang, flags) {
  if (!measureApplies(measure, isAccumulation)) {
    return measure.money ? [measure.offPhase, measure.offPhase] : [measure.offPhase];
  }

  const sourceRow = (measure.source === 'strategy') ? strategyRow : lifecycleRow;
  if (!sourceRow) return measure.money ? [null, null] : [null];

  const raw = sourceRow[measure.key];

  if (!measure.money) {
    if (measure.kind === 'phase') return [localisedPhase(raw, lang)];
    if (measure.kind === 'bool') return [localisedBool(raw, lang)];
    if (measure.kind === 'number') return [Number.isFinite(raw) ? raw : null];
    return [(typeof raw === 'string' && raw.length > 0) ? raw : null];
  }

  // Money measures. Absent/non-finite base field ⇒ blank pair; this is NOT a
  // frame fallback (the field itself simply is not reported for this year).
  if (!Number.isFinite(raw)) return [null, null];

  const companion = sourceRow[measure.key + 'BookValue'];
  if (Number.isFinite(companion)) return [companion, raw];

  flags.frameFallback = true;
  return [raw, raw];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateLifecycleRows(lifecycleRows) {
  if (!Array.isArray(lifecycleRows) || lifecycleRows.length === 0) {
    throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.LIFECYCLE_UNAVAILABLE,
      'No lifecycle projection rows were supplied — the chart projection is not ready.');
  }
  for (let i = 0; i < lifecycleRows.length; i++) {
    const row = lifecycleRows[i];
    if (!row || typeof row !== 'object') {
      throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.LIFECYCLE_UNAVAILABLE,
        'Lifecycle projection row ' + i + ' is not an object.');
    }
  }
}

function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.SETTINGS_INCOMPLETE,
      'No provenance settings were supplied.');
  }
  const missing = REQUIRED_SETTINGS_KEYS.filter((key) => {
    const value = settings[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.SETTINGS_INCOMPLETE,
      'Missing required provenance settings: ' + missing.join(', ') + '.');
  }
}

/** INV-2 — strictly ascending by exactly 1, starting at currentYear. */
function validateYearSequence(lifecycleRows, currentYear) {
  if (!Number.isFinite(currentYear)) {
    throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.YEAR_SEQUENCE_INVALID,
      'currentYear must be a finite number.');
  }
  for (let i = 0; i < lifecycleRows.length; i++) {
    const year = lifecycleRows[i].year;
    if (!Number.isFinite(year)) {
      throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.YEAR_SEQUENCE_INVALID,
        'Projection row ' + i + ' has a non-numeric year.');
    }
    const expected = currentYear + i;
    if (year !== expected) {
      throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.YEAR_SEQUENCE_INVALID,
        'Projection year sequence broke at row ' + i + ': expected ' + expected + ', found ' + year + '.');
    }
  }
}

// ---------------------------------------------------------------------------
// Settings block (data-model §1.3)
// ---------------------------------------------------------------------------

function formatPercent(rate) {
  if (!Number.isFinite(rate)) return '—';
  const asPercent = (rate > 1) ? rate : rate * 100;
  return (Math.round(asPercent * 100) / 100) + '%';
}

function buildSettingsBlock(settings, language, retirementTaxReported) {
  const lang = resolveLanguage(language);
  const labels = SETTINGS_LABELS[lang];
  const values = SETTINGS_VALUE_LABELS[lang];
  const text = (value) => (value === undefined || value === null || value === '')
    ? values.none : String(value);

  return [
    { label: labels.dashboardVariant, value: text(settings.dashboardVariant) },
    { label: labels.fireMode, value: text(settings.fireMode) },
    { label: labels.strategyName, value: text(settings.strategyName || settings.strategyId) },
    { label: labels.strategyId, value: text(settings.strategyId) },
    { label: labels.objective, value: text(settings.objective) },
    { label: labels.mortgageStrategy, value: text(settings.mortgageStrategy) },
    { label: labels.retired, value: settings.retired === true ? values.yes : values.no },
    { label: labels.retirementYear, value: text(settings.retirementYear) },
    { label: labels.planEndAge, value: text(settings.planEndAge) },
    { label: labels.inflationRate, value: formatPercent(settings.inflationRate) },
    { label: labels.language, value: lang },
    { label: labels.retirementTax, value: retirementTaxReported ? values.reported : values.notReported },
    { label: labels.registryVersion, value: LIFECYCLE_EXPORT_REGISTRY_VERSION },
    { label: labels.appVersion, value: text(settings.appVersion) },
    { label: labels.exportTimestamp, value: text(settings.exportTimestamp) },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildLifecycleExport(input) {
  if (!input || typeof input !== 'object') {
    throw lifecycleExportError(LIFECYCLE_EXPORT_ERROR_CODES.LIFECYCLE_UNAVAILABLE,
      'buildLifecycleExport requires an input object.');
  }

  const lifecycleRows = input.lifecycleRows;
  validateLifecycleRows(lifecycleRows);
  validateSettings(input.settings);
  validateYearSequence(lifecycleRows, input.currentYear);

  const lang = resolveLanguage(input.language);
  const columns = buildColumns(lang);

  // Join index: age → strategy row (data-model §2). Built once; a missing match
  // leaves the withdrawal columns blank, never zero.
  const strategyByAge = new Map();
  if (Array.isArray(input.strategyRows)) {
    for (const row of input.strategyRows) {
      if (row && typeof row === 'object' && Number.isFinite(row.age) && !strategyByAge.has(row.age)) {
        strategyByAge.set(row.age, row);
      }
    }
  }

  const flags = { frameFallback: false };
  let retirementTaxReported = false;

  const rows = lifecycleRows.map((lifecycleRow) => {
    const isAccumulation = isAccumulationRow(lifecycleRow);
    const strategyRow = strategyByAge.get(lifecycleRow.age) || null;
    if (!isAccumulation && Number.isFinite(lifecycleRow.retirementFederalTax)) {
      retirementTaxReported = true;
    }
    const cells = [];
    for (const measure of MEASURES) {
      const produced = cellsFor(measure, lifecycleRow, strategyRow, isAccumulation, lang, flags);
      for (const value of produced) cells.push(value);
    }
    return cells;
  });

  return {
    columns: columns,
    rows: rows,
    settings: buildSettingsBlock(input.settings, lang, retirementTaxReported),
    meta: {
      rowCount: rows.length,
      firstYear: lifecycleRows[0].year,
      lastYear: lifecycleRows[lifecycleRows.length - 1].year,
      columnCount: columns.length,
      registryVersion: LIFECYCLE_EXPORT_REGISTRY_VERSION,
      frameFallback: flags.frameFallback,
    },
  };
}

// ---------------------------------------------------------------------------
// UMD wrapper — Node `require` AND file:// classic <script>. Constitution V.
//
// NOTE: the const name must be UNIQUE across all browser-loaded calc/*.js —
// classic <script> tags share ONE global lexical scope, so a duplicate
// top-level `const` throws SyntaxError and silently kills the entire module.
// (See CLAUDE.md: cashSweep.js / withdrawalTooltipFrame.js both used `_api`
// and never executed in any real browser for a whole feature cycle.)
// ---------------------------------------------------------------------------
const _lifecycleExportApi = {
  buildLifecycleExport: buildLifecycleExport,
  REGISTRY_VERSION: LIFECYCLE_EXPORT_REGISTRY_VERSION,
  ERROR_CODES: LIFECYCLE_EXPORT_ERROR_CODES,
};
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _lifecycleExportApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.buildLifecycleExport = buildLifecycleExport;
  globalThis.LIFECYCLE_EXPORT_REGISTRY_VERSION = LIFECYCLE_EXPORT_REGISTRY_VERSION;
}
