/* tests/vault/procedure-lookup.test.js — Phase 3 / T044
 *
 * Validates VAULT_PROCEDURES knowledge base shape, bilingual completeness,
 * and category-fallback behavior.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const VAULT_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'FIRE-Family-Vault-RR.html'),
  'utf8'
);

function extractInlineScript(html) {
  const scripts = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  const target = scripts.find(s => s.includes('VAULT_PROCEDURES'));
  if (!target) throw new Error('vault inline <script> not found');
  return target;
}

function makeSandbox() {
  const documentStub = {
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener() {}, querySelectorAll() { return []; },
    getElementById() {
      return {
        addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
        textContent: '', innerHTML: '', value: '', style: {},
        getAttribute() { return null; }, setAttribute() {},
      };
    },
    readyState: 'complete',
    body: { appendChild() {}, removeChild() {} },
    createElement() { return { click() {}, style: {} }; },
  };
  const localStorageStore = new Map();
  const ctx = {
    document: documentStub,
    localStorage: {
      getItem(k) { return localStorageStore.has(k) ? localStorageStore.get(k) : null; },
      setItem(k, v) { localStorageStore.set(k, v); },
      removeItem(k) { localStorageStore.delete(k); },
    },
    crypto: {
      randomUUID() { return '00000000-0000-4000-8000-000000000000'; },
      getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = i; return arr; },
    },
    console: console,
    URL: { createObjectURL() { return 'blob:'; }, revokeObjectURL() {} },
    Blob: class { constructor() {} },
    setTimeout: setTimeout,
    prompt: () => null,
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  return vm.createContext(ctx);
}

function bootScript() {
  const script = extractInlineScript(VAULT_HTML);
  const ctx = makeSandbox();
  vm.runInContext(script, ctx);
  return ctx.__vaultApi;
}

const REQUIRED_CATEGORIES = [
  'employer-401k-roth',
  'employer-401k-trad',
  'traditional-ira',
  'roth-ira',
  'us-brokerage-tod',
  'us-brokerage-jtwros',
  'us-bank-joint',
  'us-bank-solo',
  'foreign-bank-taiwan',
  'foreign-bank-china',
  'taiwan-life-insurance',
  'reit-ark7',
  'other',
];

const REQUIRED_FIELDS = [
  'whoToContact',
  'expectedTimeline',
  'paperworkChecklist',
  'taxStrategyNotes',
  'commonMistakes',
];

test('VAULT_PROCEDURES exists and has all required categories', () => {
  const api = bootScript();
  assert.ok(api.VAULT_PROCEDURES, 'VAULT_PROCEDURES must be exposed');
  for (const cat of REQUIRED_CATEGORIES) {
    assert.ok(api.VAULT_PROCEDURES[cat], 'missing category: ' + cat);
    assert.equal(api.VAULT_PROCEDURES[cat].category, cat, 'category field self-references must match');
  }
});

test('every category has both en and zh-TW blocks', () => {
  const api = bootScript();
  for (const cat of REQUIRED_CATEGORIES) {
    const entry = api.VAULT_PROCEDURES[cat];
    assert.ok(entry.en, cat + ': missing en block');
    assert.ok(entry['zh-TW'], cat + ': missing zh-TW block');
  }
});

test('every block has all 5 required fields populated', () => {
  const api = bootScript();
  for (const cat of REQUIRED_CATEGORIES) {
    const entry = api.VAULT_PROCEDURES[cat];
    for (const lang of ['en', 'zh-TW']) {
      const block = entry[lang];
      for (const field of REQUIRED_FIELDS) {
        assert.ok(block[field] !== undefined && block[field] !== null,
          cat + '.' + lang + '.' + field + ' is missing');
        if (Array.isArray(block[field])) {
          assert.ok(block[field].length > 0, cat + '.' + lang + '.' + field + ' is empty array');
        } else {
          assert.ok(typeof block[field] === 'string' && block[field].length > 0,
            cat + '.' + lang + '.' + field + ' is empty string');
        }
      }
    }
  }
});

test('bilingual parity: paperworkChecklist and commonMistakes lengths match across languages', () => {
  const api = bootScript();
  for (const cat of REQUIRED_CATEGORIES) {
    const en = api.VAULT_PROCEDURES[cat].en;
    const zh = api.VAULT_PROCEDURES[cat]['zh-TW'];
    assert.equal(
      en.paperworkChecklist.length,
      zh.paperworkChecklist.length,
      cat + ': paperworkChecklist length mismatch (en=' + en.paperworkChecklist.length + ' zh=' + zh.paperworkChecklist.length + ')'
    );
    assert.equal(
      en.commonMistakes.length,
      zh.commonMistakes.length,
      cat + ': commonMistakes length mismatch'
    );
  }
});

test('lookupProcedure returns the right entry for a known category', () => {
  const api = bootScript();
  const entry = api.lookupProcedure('foreign-bank-taiwan');
  assert.equal(entry.category, 'foreign-bank-taiwan');
});

test('lookupProcedure falls back to "other" for unknown category', () => {
  const api = bootScript();
  const entry = api.lookupProcedure('not-a-real-category');
  assert.equal(entry.category, 'other');
});

test('getProcedureBlock returns en for en locale', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('employer-401k-roth', 'en');
  assert.ok(block.whoToContact);
  // en block has english characters
  assert.ok(/UPPAbaby|Monahan/.test(block.whoToContact));
});

test('getProcedureBlock returns zh-TW for zh-TW locale', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('employer-401k-roth', 'zh-TW');
  assert.ok(block.whoToContact);
  // zh-TW block contains Chinese characters
  assert.ok(/[一-鿿]/.test(block.whoToContact));
});

test('getProcedureBlock falls back to en for unsupported locale', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('employer-401k-roth', 'fr');
  assert.ok(block);
  assert.ok(/UPPAbaby|Monahan/.test(block.whoToContact));
});

test('employer-401k-* and IRA categories include hr-contact placeholders', () => {
  const api = bootScript();
  // Per FR-016, these categories MAY include hrContactName/Phone/Email; the
  // 401(k) entries explicitly carry the placeholder per the locked decision 6.
  const k401Categories = ['employer-401k-roth', 'employer-401k-trad'];
  for (const cat of k401Categories) {
    const en = api.VAULT_PROCEDURES[cat].en;
    assert.ok('hrContactName' in en, cat + ' en: hrContactName field missing');
    assert.ok('hrContactPhone' in en, cat + ' en: hrContactPhone field missing');
    assert.ok('hrContactEmail' in en, cat + ' en: hrContactEmail field missing');
  }
});

test('every procedure references a real-world action (no obvious placeholders)', () => {
  const api = bootScript();
  // Heuristic: text must not contain TODO, FIXME, XXX, "lorem ipsum", "TBD"
  const placeholders = /TODO|FIXME|XXX|lorem ipsum|TBD/i;
  for (const cat of REQUIRED_CATEGORIES) {
    for (const lang of ['en', 'zh-TW']) {
      const block = api.VAULT_PROCEDURES[cat][lang];
      const text = [
        block.whoToContact,
        block.expectedTimeline,
        block.taxStrategyNotes,
        ...(block.paperworkChecklist || []),
        ...(block.commonMistakes || []),
      ].join(' ');
      assert.ok(!placeholders.test(text), cat + '.' + lang + ' contains placeholder text');
    }
  }
});

test('foreign-bank-china procedure references PBOC and capital controls', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('foreign-bank-china', 'en');
  assert.ok(/PBOC|capital control|FX quota|外匯/.test(block.whoToContact + block.taxStrategyNotes));
});

test('foreign-bank-taiwan procedure mentions apostille', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('foreign-bank-taiwan', 'en');
  assert.ok(/apostille|Apostille|Hague/.test(block.paperworkChecklist.join(' ')));
});

test('us-brokerage-tod procedure mentions cost basis step-up', () => {
  const api = bootScript();
  const block = api.getProcedureBlock('us-brokerage-tod', 'en');
  assert.ok(/step.up|stepped.up/i.test(block.taxStrategyNotes));
});
