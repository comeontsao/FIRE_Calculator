/*
 * tests/unit/tabRouter.test.js — locks the calc/tabRouter.js contract.
 *
 * Ref: specs/013-tabbed-navigation/contracts/tab-routing.contract.md §Test surface
 *
 * Covers the 11 cases enumerated in the contract:
 *   T1  init with no hash, no storage    -> default ('plan','profile'); URL normalized
 *   T2  init with valid hash             -> activates from hash, ignores storage
 *   T3  init with invalid hash, valid storage -> activates from storage; URL normalized
 *   T4  init with both invalid           -> default; URL+storage normalized
 *   T5  activate with invalid tab        -> falls back to default; URL/storage updated
 *   T6  activate with valid tab + invalid pill -> falls back to first pill of tab
 *   T7  activate with same (tab,pill)    -> no-op (no DOM/URL/storage write)
 *   T8  popstate event drives state from new hash; uses replaceState
 *   T9  setItem throws -> in-memory state continues; no exception bubbles
 *   T10 registerChart with unknown pillId -> throws developer error
 *   T11 getState() returns a fresh object copy
 *
 * Harness: Node built-in node:test runner. No third-party framework. The
 * module under test exposes inputs/outputs/consumers via injectable storage
 * and win, plus injectable DOM hooks (the 'pillBarsByTab' map of mock pill
 * bars + the 'tabs' entity table). We never load a real DOM; instead we
 * supply minimal mock objects implementing the surface tabRouter touches.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTabRouter, TABS: DEFAULT_TABS } = require('../../calc/tabRouter.js');

// ----------------------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------------------

/**
 * Minimal Storage shim — Map-backed, with optional throwing setItem for T9.
 */
function createMockStorage(opts = {}) {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (opts.throwOnSet) {
        throw new Error('mock-storage: setItem refused');
      }
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    _data: data,
  };
}

/**
 * Minimal Window shim — provides location.hash, history.pushState/replaceState,
 * and a tiny addEventListener('popstate') queue we can fire manually.
 */
function createMockWin(initialHash = '') {
  const listeners = { popstate: [] };
  const win = {
    location: { hash: initialHash },
    history: {
      pushState(_state, _title, url) {
        win._lastHistoryOp = { kind: 'push', url };
        if (typeof url === 'string' && url.startsWith('#')) {
          win.location.hash = url;
        }
      },
      replaceState(_state, _title, url) {
        win._lastHistoryOp = { kind: 'replace', url };
        if (typeof url === 'string' && url.startsWith('#')) {
          win.location.hash = url;
        }
      },
    },
    addEventListener(name, fn) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      if (!listeners[name]) return;
      listeners[name] = listeners[name].filter((l) => l !== fn);
    },
    /** Test helper: fire a popstate as if Back/Forward navigated to newHash. */
    _firePopstate(newHash) {
      win.location.hash = newHash;
      for (const fn of listeners.popstate) {
        fn({ type: 'popstate' });
      }
    },
    _listeners: listeners,
    _lastHistoryOp: null,
  };
  return win;
}

/**
 * Build a minimal DOM-like rootEl + tabBarEl + per-tab pill bars. The router
 * doesn't need a real DOM — it only needs:
 *   (a) a way to listen for clicks (addEventListener)
 *   (b) per-pill host elements with a 'hidden' attribute and 'classList'
 *   (c) per-tab/pill button elements with classList (.active toggle)
 *
 * We provide a tiny stub for each. The router calls addEventListener but our
 * tests drive activate(...) directly — we don't simulate clicks via DOM.
 */
function createMockEl(tag = 'div') {
  const classes = new Set();
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    hidden: false,
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
      toggle(c, force) {
        if (force === true) { classes.add(c); return true; }
        if (force === false) { classes.delete(c); return false; }
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      },
    },
    addEventListener(name, fn) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(fn);
    },
    setAttribute() {},
    removeAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    _classes: classes,
    _listeners: listeners,
  };
}

/**
 * Build the router host: rootEl + tabBarEl + a pillBar for each tab + a
 * tabButton[tabId] map + pillButton[`${tabId}/${pillId}`] map +
 * pillHost[`${tabId}/${pillId}`] map. The router uses these to flip .active
 * and toggle hidden on activation.
 */
function createMockHost(tabs = DEFAULT_TABS) {
  const rootEl = createMockEl('div');
  const tabBarEl = createMockEl('div');
  const pillBarsByTab = {};
  const tabButtons = {};
  const pillButtons = {};
  const pillHosts = {};
  for (const tab of tabs) {
    tabButtons[tab.id] = createMockEl('button');
    pillBarsByTab[tab.id] = createMockEl('div');
    for (const pill of tab.pills) {
      pillButtons[`${tab.id}/${pill.id}`] = createMockEl('button');
      pillHosts[`${tab.id}/${pill.id}`] = createMockEl('section');
    }
  }
  return {
    rootEl,
    tabBarEl,
    pillBarsByTab,
    tabButtons,
    pillButtons,
    pillHosts,
    /** Resolver functions used by the router. */
    getTabButton: (tabId) => tabButtons[tabId] || null,
    getPillButton: (tabId, pillId) => pillButtons[`${tabId}/${pillId}`] || null,
    getPillHost: (tabId, pillId) => pillHosts[`${tabId}/${pillId}`] || null,
  };
}

/**
 * Build the standard init() options bundle for the router.
 */
function buildOptions({
  hash = '',
  storageInit = null,
  storageOpts = {},
  tabs = DEFAULT_TABS,
  onAfterActivate,
} = {}) {
  const win = createMockWin(hash);
  const storage = createMockStorage(storageOpts);
  if (storageInit !== null) {
    storage.setItem('dashboardActiveView', JSON.stringify(storageInit));
  }
  const host = createMockHost(tabs);
  const options = {
    tabs,
    rootEl: host.rootEl,
    tabBarEl: host.tabBarEl,
    pillBarsByTab: host.pillBarsByTab,
    storage,
    win,
    getTabButton: host.getTabButton,
    getPillButton: host.getPillButton,
    getPillHost: host.getPillHost,
    onAfterActivate,
  };
  return { options, win, storage, host };
}

// ----------------------------------------------------------------------------
// T1 — init with no hash, no storage -> default ('plan','profile')
// ----------------------------------------------------------------------------

test('T1: init with no hash and no storage activates default plan/profile and normalizes URL', () => {
  const { options, win, storage } = buildOptions();
  const router = createTabRouter();
  router.init(options);

  const state = router.getState();
  assert.equal(state.tab, 'plan');
  assert.equal(state.pill, 'profile');
  // URL normalized via replaceState (load source).
  assert.equal(win.location.hash, '#tab=plan&pill=profile');
  assert.equal(win._lastHistoryOp.kind, 'replace');
  // Storage written with the resolved view.
  assert.deepEqual(JSON.parse(storage.getItem('dashboardActiveView')), {
    tab: 'plan',
    pill: 'profile',
  });
});

// ----------------------------------------------------------------------------
// T2 — init with valid hash activates from hash, ignores storage
// ----------------------------------------------------------------------------

test('T2: init with valid hash activates from hash and ignores storage', () => {
  const { options, win, storage } = buildOptions({
    hash: '#tab=retirement&pill=lifecycle',
    storageInit: { tab: 'plan', pill: 'profile' }, // would steer different result
  });
  const router = createTabRouter();
  router.init(options);

  const state = router.getState();
  assert.equal(state.tab, 'retirement');
  assert.equal(state.pill, 'lifecycle');
  // URL still canonical (replaceState may have re-written it identically).
  assert.equal(win.location.hash, '#tab=retirement&pill=lifecycle');
  assert.equal(win._lastHistoryOp.kind, 'replace');
  // Storage now reflects the hash-derived state (not the seeded value).
  assert.deepEqual(JSON.parse(storage.getItem('dashboardActiveView')), {
    tab: 'retirement',
    pill: 'lifecycle',
  });
});

// ----------------------------------------------------------------------------
// T3 — init with invalid hash but valid storage activates from storage; URL normalized
// ----------------------------------------------------------------------------

test('T3: init with invalid hash but valid storage activates from storage and normalizes URL', () => {
  const { options, win, storage } = buildOptions({
    hash: '#tab=foo&pill=bar', // invalid
    storageInit: { tab: 'geography', pill: 'healthcare' },
  });
  const router = createTabRouter();
  router.init(options);

  const state = router.getState();
  assert.equal(state.tab, 'geography');
  assert.equal(state.pill, 'healthcare');
  assert.equal(win.location.hash, '#tab=geography&pill=healthcare');
  assert.equal(win._lastHistoryOp.kind, 'replace');
  // Storage unchanged (or rewritten to same value).
  assert.deepEqual(JSON.parse(storage.getItem('dashboardActiveView')), {
    tab: 'geography',
    pill: 'healthcare',
  });
});

// ----------------------------------------------------------------------------
// T4 — init with both invalid -> default; both normalized
// ----------------------------------------------------------------------------

test('T4: init with both hash and storage invalid activates default and normalizes both', () => {
  const { options, win, storage } = buildOptions({
    hash: '#tab=foo&pill=bar',
    storageInit: { tab: 'made-up', pill: 'also-made-up' },
  });
  const router = createTabRouter();
  router.init(options);

  const state = router.getState();
  assert.equal(state.tab, 'plan');
  assert.equal(state.pill, 'profile');
  assert.equal(win.location.hash, '#tab=plan&pill=profile');
  assert.deepEqual(JSON.parse(storage.getItem('dashboardActiveView')), {
    tab: 'plan',
    pill: 'profile',
  });
});

// ----------------------------------------------------------------------------
// T5 — activate('foo','bar') -> falls back to ('plan','profile')
// ----------------------------------------------------------------------------

test('T5: activate with invalid tab falls back to plan/profile and updates URL/storage', () => {
  const { options, win, storage } = buildOptions({
    hash: '#tab=retirement&pill=lifecycle',
  });
  const router = createTabRouter();
  router.init(options);

  // Now move to invalid -> should snap to default.
  router.activate('foo', 'bar', 'click');

  const state = router.getState();
  assert.equal(state.tab, 'plan');
  assert.equal(state.pill, 'profile');
  // 'click' source uses pushState.
  assert.equal(win._lastHistoryOp.kind, 'push');
  assert.equal(win.location.hash, '#tab=plan&pill=profile');
  assert.deepEqual(JSON.parse(storage.getItem('dashboardActiveView')), {
    tab: 'plan',
    pill: 'profile',
  });
});

// ----------------------------------------------------------------------------
// T6 — activate('plan','xyz') -> falls back to first pill of named tab
// ----------------------------------------------------------------------------

test('T6: activate with valid tab and invalid pill falls back to first pill of tab', () => {
  const { options } = buildOptions({
    hash: '#tab=retirement&pill=lifecycle',
  });
  const router = createTabRouter();
  router.init(options);

  router.activate('geography', 'xyz', 'click');

  const state = router.getState();
  assert.equal(state.tab, 'geography');
  assert.equal(state.pill, 'scenarios'); // first pill of geography per data-model
});

// ----------------------------------------------------------------------------
// T7 — activate(currentTab,currentPill) is a no-op
// ----------------------------------------------------------------------------

test('T7: activate with the current (tab,pill) is a no-op (no DOM mutation, no URL/storage write)', () => {
  const { options, win, storage } = buildOptions({
    hash: '#tab=plan&pill=assets',
  });
  const router = createTabRouter();
  router.init(options);

  // After init, win._lastHistoryOp is the init replaceState. Capture and reset.
  const initialOp = win._lastHistoryOp;
  const initialStorage = storage.getItem('dashboardActiveView');
  win._lastHistoryOp = null;

  // Track storage writes by patching setItem to count.
  let setItemCalls = 0;
  const realSetItem = storage.setItem;
  storage.setItem = (k, v) => { setItemCalls += 1; return realSetItem.call(storage, k, v); };

  router.activate('plan', 'assets', 'click');

  // No history op fired during the no-op activate.
  assert.equal(win._lastHistoryOp, null, 'no-op activate must not call pushState/replaceState');
  // No storage write.
  assert.equal(setItemCalls, 0, 'no-op activate must not write to storage');
  // State unchanged.
  const state = router.getState();
  assert.equal(state.tab, 'plan');
  assert.equal(state.pill, 'assets');
  // Sanity: storage and initial op untouched.
  assert.equal(storage.getItem('dashboardActiveView'), initialStorage);
  assert.ok(initialOp);
});

// ----------------------------------------------------------------------------
// T8 — popstate drives state from new hash; uses replaceState
// ----------------------------------------------------------------------------

test('T8: popstate event drives state from the new hash and uses replaceState', () => {
  const { options, win } = buildOptions({
    hash: '#tab=plan&pill=profile',
  });
  const router = createTabRouter();
  router.init(options);

  // Browser navigates Back/Forward: hash changes, popstate fires.
  win._lastHistoryOp = null;
  win._firePopstate('#tab=retirement&pill=ss');

  const state = router.getState();
  assert.equal(state.tab, 'retirement');
  assert.equal(state.pill, 'ss');
  // popstate path uses replaceState (no new history entry).
  assert.equal(win._lastHistoryOp.kind, 'replace');
});

// ----------------------------------------------------------------------------
// T9 — setItem throws -> in-memory state continues; no exception bubbles
// ----------------------------------------------------------------------------

test('T9: storage.setItem throwing does not bubble; state remains in-memory', () => {
  const { options } = buildOptions({
    hash: '',
    storageOpts: { throwOnSet: true },
  });
  const router = createTabRouter();
  // init must NOT throw even though setItem throws.
  assert.doesNotThrow(() => router.init(options));

  // activate must NOT throw either.
  assert.doesNotThrow(() => router.activate('retirement', 'lifecycle', 'click'));

  const state = router.getState();
  assert.equal(state.tab, 'retirement');
  assert.equal(state.pill, 'lifecycle');
});

// ----------------------------------------------------------------------------
// T10 — registerChart with unknown pillId throws developer error
// ----------------------------------------------------------------------------

test('T10: registerChart with unknown pillId throws developer error', () => {
  const { options } = buildOptions();
  const router = createTabRouter();
  router.init(options);

  const fakeChart = { resize: () => {} };
  assert.throws(
    () => router.registerChart('typo-pill-id', fakeChart),
    /typo-pill-id|unknown pill|invalid pill/i,
  );

  // Sanity: a real pill ID does NOT throw.
  assert.doesNotThrow(() => router.registerChart('lifecycle', fakeChart));
});

// ----------------------------------------------------------------------------
// T11 — getState returns a fresh object copy
// ----------------------------------------------------------------------------

test('T11: getState returns a fresh object copy that does not mutate internal state', () => {
  const { options } = buildOptions({ hash: '#tab=geography&pill=scenarios' });
  const router = createTabRouter();
  router.init(options);

  const a = router.getState();
  const b = router.getState();
  assert.notEqual(a, b, 'each call must return a fresh object reference');
  assert.deepEqual(a, b);

  // Mutating the returned object must not change internal state.
  a.tab = 'mutated';
  a.pill = 'mutated';
  const c = router.getState();
  assert.equal(c.tab, 'geography');
  assert.equal(c.pill, 'scenarios');
});

// ----------------------------------------------------------------------------
// Bonus: chart resize is called on activate (smoke check, supports the
// behaviors documented in §activate step 7 and FR-013). Not in the formal
// 11-case surface but enforces the registry behavior used by the contract.
// ----------------------------------------------------------------------------

test('bonus: registered charts get resize() called when their pill activates', () => {
  const { options } = buildOptions();
  const router = createTabRouter();
  router.init(options);

  let resizeCalls = 0;
  router.registerChart('lifecycle', { resize: () => { resizeCalls += 1; } });

  // Activate the lifecycle pill — chart should resize.
  router.activate('retirement', 'lifecycle', 'click');
  assert.equal(resizeCalls, 1);

  // Activate something else — no extra resize for lifecycle chart.
  router.activate('plan', 'profile', 'click');
  assert.equal(resizeCalls, 1);

  // Re-activate lifecycle — resize fires again.
  router.activate('retirement', 'lifecycle', 'click');
  assert.equal(resizeCalls, 2);
});

// ----------------------------------------------------------------------------
// Bonus: onAfterActivate callback fires after every activation including init
// ----------------------------------------------------------------------------

test('bonus: onAfterActivate callback fires after every activation', () => {
  const seen = [];
  const { options } = buildOptions({
    onAfterActivate: (s) => seen.push({ ...s }),
  });
  const router = createTabRouter();
  router.init(options);

  // init triggered one activation.
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { tab: 'plan', pill: 'profile' });

  router.activate('retirement', 'ss', 'click');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], { tab: 'retirement', pill: 'ss' });

  // No-op activate -> no new callback.
  router.activate('retirement', 'ss', 'click');
  assert.equal(seen.length, 2);
});

// ----------------------------------------------------------------------------
// Regression: init path with non-default resolved tab must clear .active from
// stale HTML markup on every other tab button (Feature 015 follow-up).
// Bug: HTML markup ships with class="active" on the Plan tab. If the router's
// resolved state on init is e.g. Geography (from URL hash or storage), the old
// code only added .active to Geography — it didn't remove the stale .active
// from Plan because `from === null` skipped the prev-tab cleanup branch.
// Result: both Plan AND Geography were visually active until the user clicked
// Plan first to clear it.
// ----------------------------------------------------------------------------

test('regression: init path defensively sweeps stale .active from non-target tabs', () => {
  const { options, host } = buildOptions({
    hash: '#tab=geography&pill=scenarios',
  });
  // Pre-populate Plan with .active to mirror the real HTML markup state.
  host.tabButtons.plan.classList.add('active');
  // Verify the seed worked
  assert.equal(host.tabButtons.plan._classes.has('active'), true);

  const router = createTabRouter();
  router.init(options);

  // After init: only Geography should have .active. Plan must have been cleared.
  assert.equal(host.tabButtons.geography._classes.has('active'), true,
    'Geography (resolved tab) must have .active');
  assert.equal(host.tabButtons.plan._classes.has('active'), false,
    'Plan (stale from HTML markup) must have been swept clean by init');
  // Every other tab also clean.
  for (const id of ['retirement', 'history', 'audit']) {
    if (host.tabButtons[id]) {
      assert.equal(host.tabButtons[id]._classes.has('active'), false,
        `${id}: must NOT have .active after init resolves to geography`);
    }
  }
});

test('regression: init path with hash=plan keeps Plan active and clears all others', () => {
  const { options, host } = buildOptions({
    hash: '#tab=plan&pill=profile',
  });
  // Seed multiple tabs with stale .active to simulate a more pathological state
  host.tabButtons.plan.classList.add('active');
  host.tabButtons.history && host.tabButtons.history.classList.add('active');

  const router = createTabRouter();
  router.init(options);

  assert.equal(host.tabButtons.plan._classes.has('active'), true);
  if (host.tabButtons.history) {
    assert.equal(host.tabButtons.history._classes.has('active'), false,
      'History (stale) must be swept clean even when resolved tab is Plan');
  }
});

test('regression: subsequent activate() also defensively sweeps every tab button', () => {
  const { options, host } = buildOptions();
  const router = createTabRouter();
  router.init(options); // -> plan/profile

  router.activate('audit', 'summary', 'click');

  assert.equal(host.tabButtons.audit._classes.has('active'), true);
  assert.equal(host.tabButtons.plan._classes.has('active'), false);
  assert.equal(host.tabButtons.geography._classes.has('active'), false);
  assert.equal(host.tabButtons.retirement._classes.has('active'), false);
  assert.equal(host.tabButtons.history._classes.has('active'), false);
});

// Feature 016 — Plan tab gained the 'payoff-invest' pill between mortgage
// and expenses. Lock that placement so a future refactor doesn't drop it.
test('Feature 016: Plan tab includes payoff-invest pill between mortgage and expenses', () => {
  const planTab = DEFAULT_TABS.find((t) => t.id === 'plan');
  assert.ok(planTab, 'plan tab present in entity table');
  const ids = planTab.pills.map((p) => p.id);
  assert.ok(ids.includes('payoff-invest'), 'payoff-invest pill present');
  const idxMortgage = ids.indexOf('mortgage');
  const idxPayoff = ids.indexOf('payoff-invest');
  const idxExpenses = ids.indexOf('expenses');
  assert.ok(idxMortgage >= 0 && idxPayoff > idxMortgage && idxExpenses > idxPayoff,
    `expected order: mortgage < payoff-invest < expenses; got ${ids.join(',')}`);
});
