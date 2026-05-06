/* tests/vault/schema.test.js — Phase 2 / T028
 *
 * Validates the pure helpers exported on globalThis.__vaultApi from
 * FIRE-Family-Vault-RR.html. We extract the inline <script> via a regex
 * (project convention — same approach as the audit harness in feature 020),
 * eval it in a vm sandbox with stubbed DOM, and assert against the API.
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
  // Grab the LARGE inline <script> (not the early <script> tags). We
  // identify it as the one that contains the marker `__vaultApi`.
  const scripts = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  const target = scripts.find(s => s.includes('__vaultApi'));
  if (!target) throw new Error('inline vault <script> not found');
  return target;
}

function makeSandbox() {
  // Minimal DOM stubs so the script can boot without a real DOM.
  const documentStub = {
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById() {
      // Return a chainable stub that won't blow up if the boot path
      // tries to attach event handlers.
      return {
        addEventListener() {},
        classList: { add() {}, remove() {}, toggle() {} },
        textContent: '',
        innerHTML: '',
        value: '',
        style: {},
        getAttribute() { return null; },
        setAttribute() {},
      };
    },
    readyState: 'complete',
    body: { appendChild() {}, removeChild() {} },
    createElement() { return { click() {}, style: {} }; },
  };
  const localStorageStore = new Map();
  const localStorageStub = {
    getItem(k) { return localStorageStore.has(k) ? localStorageStore.get(k) : null; },
    setItem(k, v) { localStorageStore.set(k, v); },
    removeItem(k) { localStorageStore.delete(k); },
    clear() { localStorageStore.clear(); },
  };
  const cryptoStub = {
    randomUUID() {
      // Minimal valid UUID for tests
      return '00000000-0000-4000-8000-000000000000';
    },
    getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = i; return arr; },
  };
  const ctx = {
    document: documentStub,
    localStorage: localStorageStub,
    crypto: cryptoStub,
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

test('emptyVault returns a valid v1 vault', () => {
  const api = bootScript();
  const v = api.emptyVault();
  assert.equal(v.version, 'v1');
  assert.equal(v.locale, 'en');
  assert.equal(v.chatboxEnabled, false);
  assert.equal(v.chatboxModel, 'claude-opus-4-7');
  // Note: assert.deepEqual([], []) fails across vm sandbox boundaries due to
  // prototype mismatch; check length instead.
  assert.ok(Array.isArray(v.accounts) || v.accounts.length === 0);
  assert.equal(v.accounts.length, 0);
  assert.equal(api.validateVault(v).length, 0);
});

test('newAccount with institution produces a valid account', () => {
  const api = bootScript();
  // newAccount({}) yields a partial account with empty institution — the
  // validator correctly flags it as invalid (institution required when saving).
  // Test the SAVED shape: pass institution.
  const a = api.newAccount({ institution: 'Webull' });
  assert.equal(a.owner, 'roger');
  assert.equal(a.category, 'us-bank-joint');
  assert.equal(a.currentBalanceUSD, 0);
  assert.equal(typeof a.id, 'string');
  assert.ok(a.id.length > 0);
  assert.equal(api.validateAccount(a).length, 0);
});

test('newAccount without institution is invalid until institution is set', () => {
  const api = bootScript();
  const a = api.newAccount();  // no institution
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('institution')));
});

test('validateAccount catches missing owner', () => {
  const api = bootScript();
  const a = api.newAccount({ owner: 'invalid' });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('owner')));
});

test('validateAccount catches missing category', () => {
  const api = bootScript();
  const a = api.newAccount({ category: 'not-a-real-category' });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('category')));
});

test('validateAccount catches negative balance', () => {
  const api = bootScript();
  const a = api.newAccount({ currentBalanceUSD: -100 });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('currentBalanceUSD')));
});

test('validateAccount catches non-finite balance', () => {
  const api = bootScript();
  const a = api.newAccount({ currentBalanceUSD: Infinity });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('currentBalanceUSD')));
});

test('validateAccount catches bad accountNumberLast4', () => {
  const api = bootScript();
  const a = api.newAccount({ accountNumberLast4: 'abcd' });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('accountNumberLast4')));
});

test('validateAccount catches non-positive exchangeRateToUSD', () => {
  const api = bootScript();
  const a = api.newAccount({ exchangeRateToUSD: 0 });
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('exchangeRateToUSD')));
});

test('validateAccount accepts null exchangeRateToUSD for USD-native', () => {
  const api = bootScript();
  const a = api.newAccount({ institution: 'Test', exchangeRateToUSD: null });
  assert.equal(api.validateAccount(a).length, 0);
});

test('validateAccount catches non-array history', () => {
  const api = bootScript();
  const a = api.newAccount();
  delete a.history;
  const errs = api.validateAccount(a);
  assert.ok(errs.some(e => e.includes('history')));
});

test('validateVault flags every invalid account with index', () => {
  const api = bootScript();
  const v = api.emptyVault();
  v.accounts = [
    api.newAccount({ institution: 'Webull' }),                       // valid
    api.newAccount({ institution: 'Webull', owner: 'invalid' }),     // invalid owner
  ];
  const errs = api.validateVault(v);
  assert.ok(errs.some(e => e.includes('accounts[1]')));
  assert.ok(!errs.some(e => e.includes('accounts[0]')));
});

test('validateVault rejects wrong version', () => {
  const api = bootScript();
  const v = api.emptyVault();
  v.version = 'v2';
  const errs = api.validateVault(v);
  assert.ok(errs.some(e => e.includes('version')));
});

test('validateVault rejects unsupported locale', () => {
  const api = bootScript();
  const v = api.emptyVault();
  v.locale = 'fr';
  const errs = api.validateVault(v);
  assert.ok(errs.some(e => e.includes('locale')));
});

test('updateAccount preserves id and updates lastUpdated', async () => {
  const api = bootScript();
  const a = api.newAccount({ institution: 'Webull' });
  const originalId = a.id;
  const originalUpdated = a.lastUpdated;
  // Wait at least 1ms to ensure distinct timestamp
  await new Promise(r => setTimeout(r, 5));
  const b = api.updateAccount(a, { currentBalanceUSD: 50000 });
  assert.equal(b.id, originalId);
  assert.equal(b.institution, 'Webull');
  assert.equal(b.currentBalanceUSD, 50000);
  assert.notEqual(b.lastUpdated, originalUpdated);
  // Immutability: original NOT mutated
  assert.equal(a.currentBalanceUSD, 0);
});

test('categoryToCountry maps correctly', () => {
  const api = bootScript();
  assert.equal(api.categoryToCountry('foreign-bank-taiwan'), 'Taiwan');
  assert.equal(api.categoryToCountry('foreign-bank-china'), 'China');
  assert.equal(api.categoryToCountry('taiwan-life-insurance'), 'Taiwan');
  assert.equal(api.categoryToCountry('us-bank-joint'), 'US');
  assert.equal(api.categoryToCountry('employer-401k-roth'), 'US');
  assert.equal(api.categoryToCountry('other'), 'Other');
});

test('TRANSLATIONS has both en and zh-TW with parallel keys', () => {
  const api = bootScript();
  const en = api.TRANSLATIONS.en;
  const zh = api.TRANSLATIONS['zh-TW'];
  assert.ok(en && zh);
  const enKeys = Object.keys(en);
  const zhKeys = Object.keys(zh);
  // Every EN key must have a zh-TW counterpart
  const missingInZh = enKeys.filter(k => !(k in zh));
  assert.equal(missingInZh.length, 0, 'Missing zh-TW keys: ' + missingInZh.join(', '));
  // Every zh-TW key must have an EN counterpart (for catalog parity)
  const missingInEn = zhKeys.filter(k => !(k in en));
  assert.equal(missingInEn.length, 0, 'Missing EN keys: ' + missingInEn.join(', '));
});
