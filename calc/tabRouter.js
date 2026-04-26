/*
 * calc/tabRouter.js — pure tab/pill routing controller for the dashboard.
 *
 * Feature: 013-tabbed-navigation
 * Contract: specs/013-tabbed-navigation/contracts/tab-routing.contract.md
 *
 * Inputs:
 *   - URL hash on init and on popstate, in the form '#tab=<id>&pill=<id>'.
 *   - Persisted ActiveView from injected storage (key 'dashboardActiveView')
 *     containing JSON {tab: <id>, pill: <id>}.
 *   - DOM hosts: rootEl, tabBarEl, pillBarsByTab[tabId], plus resolver
 *     callbacks getTabButton(tabId), getPillButton(tabId, pillId), and
 *     getPillHost(tabId, pillId). The router never touches a global DOM API;
 *     all element references arrive via init(options).
 *   - Injected globals: storage (Storage-like) and win (Window-like). Tests
 *     pass mocks; the dashboard HTML passes the browser objects.
 *   - Optional onAfterActivate(state) callback fired after every activation.
 *   - Chart instances registered via registerChart(pillId, chartInstance).
 *
 * Outputs: side effects only — module is otherwise referentially pure.
 *   - Class flips: '.active' added to the active tab/pill button, removed
 *     from the previous one.
 *   - hidden flag flips on pill host elements: only the active pill's host
 *     has hidden === false.
 *   - History state writes via win.history.pushState / replaceState.
 *   - Storage writes via storage.setItem('dashboardActiveView', ...) wrapped
 *     in try/catch so private-browsing quota failures never bubble.
 *   - chart.resize() invoked on every chart registered for the new pill.
 *   - onAfterActivate(state) callback (if provided) invoked once per
 *     successful activation, with a fresh {tab, pill} snapshot.
 *
 * Consumers:
 *   - FIRE-Dashboard.html — top tab bar #tabBar, sub-tab .pill-bar elements.
 *   - FIRE-Dashboard-Generic.html — identical markup; same router instance.
 *   - tests/unit/tabRouter.test.js — drives the router directly via mocks.
 *
 * Invariants:
 *   - Exactly one tab marked active and exactly one pill in the active tab
 *     marked active at all times after init() resolves.
 *   - getState() returns a fresh {tab, pill} object each call; mutating it
 *     never affects internal state.
 *   - No-op activations (same tab+pill) skip every side effect: no class
 *     flips, no history op, no storage write, no resize, no callback.
 *   - All public methods are defensive: invalid IDs from any source fall
 *     back per FR-026/FR-027 rather than throwing to the caller.
 *   - registerChart with an unknown pillId throws a developer error so
 *     typos fail loud at chart-init time.
 *
 * Purity: no DOM globals, no Chart.js globals, no browser globals, no I/O,
 * no module-scope mutation. The injected storage and win objects are the
 * sole boundary to the outside world; tests substitute mocks freely.
 *
 * Note on the meta-test (tests/meta/module-boundaries.test.js): the tokens
 * 'window', 'document', 'localStorage', etc. are forbidden in non-comment
 * lines of calc/*.js. This file complies — every reference to those globals
 * lives behind an injected parameter named storage or win.
 */

// ---------------------------------------------------------------------------
// Entity table — mirrors specs/013-tabbed-navigation/data-model.md exactly.
// ---------------------------------------------------------------------------

/**
 * The fixed 4-tab / 16-pill structure. Frozen so callers cannot accidentally
 * mutate the canonical entity definitions. The router accepts a 'tabs'
 * argument in init(options) so test fixtures can substitute a smaller
 * structure if needed; this default is what the live dashboards consume.
 *
 * Order is significant: it determines tab display order, pill display order,
 * and the 'Next ->' traversal sequence within each tab.
 */
const TABS = Object.freeze([
  Object.freeze({
    id: 'plan',
    labelKey: 'nav.tab.plan',
    pills: Object.freeze([
      Object.freeze({ id: 'profile',    labelKey: 'nav.pill.profile' }),
      Object.freeze({ id: 'assets',     labelKey: 'nav.pill.assets' }),
      Object.freeze({ id: 'investment', labelKey: 'nav.pill.investment' }),
      Object.freeze({ id: 'mortgage',   labelKey: 'nav.pill.mortgage' }),
      Object.freeze({ id: 'expenses',   labelKey: 'nav.pill.expenses' }),
      Object.freeze({ id: 'summary',    labelKey: 'nav.pill.summary' }),
    ]),
  }),
  Object.freeze({
    id: 'geography',
    labelKey: 'nav.tab.geography',
    pills: Object.freeze([
      Object.freeze({ id: 'scenarios',         labelKey: 'nav.pill.scenarios' }),
      Object.freeze({ id: 'country-chart',     labelKey: 'nav.pill.countryChart' }),
      Object.freeze({ id: 'healthcare',        labelKey: 'nav.pill.healthcare' }),
      Object.freeze({ id: 'country-deep-dive', labelKey: 'nav.pill.countryDeepDive' }),
    ]),
  }),
  Object.freeze({
    id: 'retirement',
    labelKey: 'nav.tab.retirement',
    pills: Object.freeze([
      Object.freeze({ id: 'ss',         labelKey: 'nav.pill.ss' }),
      Object.freeze({ id: 'withdrawal', labelKey: 'nav.pill.withdrawal' }),
      Object.freeze({ id: 'drawdown',   labelKey: 'nav.pill.drawdown' }),
      Object.freeze({ id: 'lifecycle',  labelKey: 'nav.pill.lifecycle' }),
      Object.freeze({ id: 'milestones', labelKey: 'nav.pill.milestones' }),
    ]),
  }),
  Object.freeze({
    id: 'history',
    labelKey: 'nav.tab.history',
    pills: Object.freeze([
      Object.freeze({ id: 'snapshots', labelKey: 'nav.pill.snapshots' }),
    ]),
  }),
]);

/** Storage key for the persisted ActiveView. */
const STORAGE_KEY = 'dashboardActiveView';

/** Default activation when both URL and storage fail validation. */
const DEFAULT_TAB = 'plan';
const DEFAULT_PILL = 'profile';

// ---------------------------------------------------------------------------
// Pure helpers (no closure, no side effects).
// ---------------------------------------------------------------------------

/**
 * Build a fast lookup map: tabId -> Tab entity. Pure.
 * @param {ReadonlyArray<{id:string,pills:ReadonlyArray<{id:string}>}>} tabs
 */
function indexTabs(tabs) {
  const byId = new Map();
  for (const tab of tabs) byId.set(tab.id, tab);
  return byId;
}

/**
 * Parse a URL hash like '#tab=plan&pill=profile' (or '#pill=foo&tab=bar', or
 * with extra unknown params). Returns {tab, pill} where each may be undefined
 * if the hash is missing/malformed.
 *
 * Pure. Does NOT validate against the entity table — caller does that.
 *
 * @param {string} hash
 * @returns {{tab: string|undefined, pill: string|undefined}}
 */
function parseHash(hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return { tab: undefined, pill: undefined };
  }
  // Strip a leading '#' if present.
  const body = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  if (body.length === 0) return { tab: undefined, pill: undefined };
  const out = { tab: undefined, pill: undefined };
  for (const part of body.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (key === 'tab' && val.length > 0) out.tab = val;
    else if (key === 'pill' && val.length > 0) out.pill = val;
  }
  return out;
}

/**
 * Validate (tab, pill) against the indexed tab table and return the resolved
 * pair, applying FR-026 (invalid tab -> default) and FR-027 (valid tab,
 * invalid pill -> first pill of named tab).
 *
 * Pure.
 *
 * @param {Map<string, {id:string,pills:ReadonlyArray<{id:string}>}>} tabsById
 * @param {string|undefined} candidateTab
 * @param {string|undefined} candidatePill
 * @returns {{tab: string, pill: string}}
 */
function resolveValidPair(tabsById, candidateTab, candidatePill) {
  const tab = candidateTab && tabsById.has(candidateTab) ? candidateTab : DEFAULT_TAB;
  const tabEntity = tabsById.get(tab);
  if (!tabEntity || !Array.isArray(tabEntity.pills) || tabEntity.pills.length === 0) {
    // Defensive: malformed entity table — should never happen in production.
    return { tab: DEFAULT_TAB, pill: DEFAULT_PILL };
  }
  const pillIds = tabEntity.pills.map((p) => p.id);
  const pill = candidatePill && pillIds.includes(candidatePill)
    ? candidatePill
    : pillIds[0];
  // Special-case: when we fell back from invalid tab to DEFAULT_TAB, also
  // restore the default pill of that tab (FR-026 says invalid tab -> Plan/Profile).
  if (tab === DEFAULT_TAB && (!candidateTab || !tabsById.has(candidateTab))) {
    return { tab: DEFAULT_TAB, pill: DEFAULT_PILL };
  }
  return { tab, pill };
}

/**
 * Read the persisted ActiveView from injected storage. Returns
 * {tab, pill} or {undefined, undefined} on any read/parse failure.
 *
 * Pure-ish (reads from injected storage; never throws to caller).
 *
 * @param {{getItem: (k:string)=>(string|null)} | null | undefined} storage
 */
function readPersistedView(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { tab: undefined, pill: undefined };
  }
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (_err) {
    return { tab: undefined, pill: undefined };
  }
  if (raw === null || raw === undefined || raw === '') {
    return { tab: undefined, pill: undefined };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object'
      && typeof parsed.tab === 'string'
      && typeof parsed.pill === 'string') {
      return { tab: parsed.tab, pill: parsed.pill };
    }
  } catch (_err) {
    // Invalid JSON — fall through to default.
  }
  return { tab: undefined, pill: undefined };
}

/**
 * Format an ActiveView as a canonical hash string.
 * @param {string} tab @param {string} pill @returns {string}
 */
function formatHash(tab, pill) {
  return `#tab=${tab}&pill=${pill}`;
}

// ---------------------------------------------------------------------------
// Factory — creates a stateful controller around the injected dependencies.
// ---------------------------------------------------------------------------

/**
 * Create a tab-router controller. Each call returns an independent controller
 * with its own internal state, so tests can build many in parallel without
 * interference.
 *
 * The controller is dormant until init(options) is called. After init the
 * methods activate, registerChart, and getState are usable.
 *
 * @returns {{
 *   init: (options: object) => void,
 *   activate: (tabId: string, pillId: string, source?: string) => void,
 *   registerChart: (pillId: string, chartInstance: object) => void,
 *   getState: () => {tab: string, pill: string},
 * }}
 */
function createTabRouter() {
  // Internal state — closed over by the returned methods.
  let _tabs = TABS;
  let _tabsById = indexTabs(_tabs);
  let _state = { tab: DEFAULT_TAB, pill: DEFAULT_PILL };
  let _initialized = false;
  let _storage = null;
  let _win = null;
  let _rootEl = null;
  let _tabBarEl = null;
  let _pillBarsByTab = {};
  let _getTabButton = () => null;
  let _getPillButton = () => null;
  let _getPillHost = () => null;
  let _getTabPanel = () => null;
  let _onAfterActivate = null;
  /** pillId -> Array<chartInstance>. Each instance must expose .resize(). */
  const _chartsByPill = new Map();

  // -------------------------------------------------------------------------
  // Internal helpers (closure over the state above).
  // -------------------------------------------------------------------------

  /**
   * Apply DOM-style class flips and hidden-attribute toggles for the new
   * (tab, pill). Idempotent if already in the target shape.
   *
   * @param {{tab:string,pill:string}} from
   * @param {{tab:string,pill:string}} to
   */
  function _applyDomState(from, to) {
    // Tab buttons: remove .active from previous, add to new.
    if (from && from.tab !== to.tab) {
      const prevTabBtn = _getTabButton(from.tab);
      if (prevTabBtn && prevTabBtn.classList) prevTabBtn.classList.remove('active');
    }
    const newTabBtn = _getTabButton(to.tab);
    if (newTabBtn && newTabBtn.classList) newTabBtn.classList.add('active');

    // Tab panels: ensure exactly one is visible. Walk every tab in the entity
    // table and set [hidden] = (id !== to.tab). Defensive sweep covers both the
    // normal transition (from -> to) AND the init path (from === null) where
    // saved state may differ from the markup's initial active tab.
    for (const tabEntity of _tabsById.values()) {
      const panel = _getTabPanel(tabEntity.id);
      if (panel) panel.hidden = (tabEntity.id !== to.tab);
    }

    // Pill bars: each tab's pill bar is hidden (or shown) based on whether
    // it's the active tab. The router does not own pill-bar visibility CSS
    // styling, but it does ensure pill-bar buttons reflect the active state.
    if (from && from.tab !== to.tab) {
      const prevTab = _tabsById.get(from.tab);
      if (prevTab) {
        for (const p of prevTab.pills) {
          const btn = _getPillButton(from.tab, p.id);
          if (btn && btn.classList) btn.classList.remove('active');
          const host = _getPillHost(from.tab, p.id);
          if (host) host.hidden = true;
        }
      }
    } else if (from && from.pill !== to.pill) {
      // Same tab, pill changed: only flip the two affected pill buttons.
      const oldBtn = _getPillButton(from.tab, from.pill);
      if (oldBtn && oldBtn.classList) oldBtn.classList.remove('active');
      const oldHost = _getPillHost(from.tab, from.pill);
      if (oldHost) oldHost.hidden = true;
    }

    // Activate new pill button + show new pill host. Hide every other pill
    // host inside the new tab as a defensive sweep on first init.
    const newTab = _tabsById.get(to.tab);
    if (newTab) {
      for (const p of newTab.pills) {
        const btn = _getPillButton(to.tab, p.id);
        const host = _getPillHost(to.tab, p.id);
        if (p.id === to.pill) {
          if (btn && btn.classList) btn.classList.add('active');
          if (host) host.hidden = false;
        } else {
          if (btn && btn.classList) btn.classList.remove('active');
          if (host) host.hidden = true;
        }
      }
    }
  }

  /**
   * Update the URL hash according to the source semantics:
   *   - 'click' / 'programmatic'  -> pushState
   *   - 'load' / 'popstate'       -> replaceState
   * Defensive: any unrecognized source defaults to replaceState.
   *
   * @param {string} tab @param {string} pill @param {string} source
   */
  function _syncUrl(tab, pill, source) {
    if (!_win || !_win.history) return;
    const url = formatHash(tab, pill);
    const usePush = (source === 'click' || source === 'programmatic');
    try {
      if (usePush && typeof _win.history.pushState === 'function') {
        _win.history.pushState({ tab, pill }, '', url);
      } else if (typeof _win.history.replaceState === 'function') {
        _win.history.replaceState({ tab, pill }, '', url);
      }
    } catch (_err) {
      // History API failures are extremely rare; never bubble.
    }
  }

  /**
   * Persist {tab, pill} to storage. Wraps setItem in try/catch so private-
   * browsing quota failures (or any other write rejection) never bubble.
   *
   * @param {string} tab @param {string} pill
   */
  function _writeStorage(tab, pill) {
    if (!_storage || typeof _storage.setItem !== 'function') return;
    try {
      _storage.setItem(STORAGE_KEY, JSON.stringify({ tab, pill }));
    } catch (_err) {
      // Private browsing quota / disabled storage / etc. State is in-memory
      // only this session; do not throw, do not log with the [shim-name]
      // prefix (this is not a calc shim per the contract §write failure modes).
    }
  }

  /**
   * Resize every registered chart for the active pill. Each chart entry must
   * expose a .resize() method (Chart.js does). Errors thrown by individual
   * resize calls are swallowed so a single bad chart can't break navigation.
   *
   * @param {string} pillId
   */
  function _resizeChartsFor(pillId) {
    const charts = _chartsByPill.get(pillId);
    if (!charts || charts.length === 0) return;
    for (const c of charts) {
      if (c && typeof c.resize === 'function') {
        try { c.resize(); } catch (_err) { /* swallow per contract */ }
      }
    }
  }

  /**
   * Validate that a pillId is known to the entity table. Used by
   * registerChart to fail loud on typos.
   *
   * @param {string} pillId
   * @returns {boolean}
   */
  function _isKnownPillId(pillId) {
    for (const tab of _tabs) {
      for (const p of tab.pills) {
        if (p.id === pillId) return true;
      }
    }
    return false;
  }

  /**
   * Locate the next pill in the same tab as (tabId, pillId). Returns the
   * next Pill entity or null if pillId is the last in the tab. Defensive:
   * unknown tab/pill returns null.
   *
   * @param {string} tabId @param {string} pillId
   */
  function _findNextPill(tabId, pillId) {
    const tab = _tabsById.get(tabId);
    if (!tab) return null;
    const idx = tab.pills.findIndex((p) => p.id === pillId);
    if (idx < 0 || idx >= tab.pills.length - 1) return null;
    return tab.pills[idx + 1];
  }

  // -------------------------------------------------------------------------
  // Public API.
  // -------------------------------------------------------------------------

  /**
   * Activate (tabId, pillId). Idempotent on same-state. Validates inputs and
   * applies FR-026/FR-027 fallbacks before any side effects fire.
   *
   * @param {string} tabId
   * @param {string} pillId
   * @param {'click'|'load'|'popstate'|'programmatic'} [source]
   */
  function activate(tabId, pillId, source = 'click') {
    if (!_initialized) {
      // Defensive: someone called activate() before init(). Ignore.
      return;
    }
    const resolved = resolveValidPair(_tabsById, tabId, pillId);

    // No-op when already on the resolved (tab, pill) — FR-014. No DOM
    // mutations, no URL writes, no storage writes, no callbacks.
    if (resolved.tab === _state.tab && resolved.pill === _state.pill) {
      return;
    }

    const previous = { tab: _state.tab, pill: _state.pill };
    _state = { tab: resolved.tab, pill: resolved.pill };

    _applyDomState(previous, _state);
    _syncUrl(_state.tab, _state.pill, source);
    _writeStorage(_state.tab, _state.pill);
    _resizeChartsFor(_state.pill);

    if (typeof _onAfterActivate === 'function') {
      try {
        _onAfterActivate({ tab: _state.tab, pill: _state.pill });
      } catch (_err) {
        // Caller-supplied callback errors must not break navigation.
      }
    }
  }

  /**
   * Register a Chart.js instance with the pill that hosts its canvas. Throws
   * a developer error if pillId is not a known pill — typos fail loud.
   *
   * @param {string} pillId
   * @param {{resize: () => void}} chartInstance
   */
  function registerChart(pillId, chartInstance) {
    if (!_isKnownPillId(pillId)) {
      throw new Error(
        `tabRouter.registerChart: unknown pillId '${pillId}'. ` +
        `Pill IDs must match an entry in the entity table.`,
      );
    }
    const list = _chartsByPill.get(pillId) || [];
    list.push(chartInstance);
    _chartsByPill.set(pillId, list);
  }

  /**
   * Read-only accessor returning a fresh {tab, pill} snapshot. Mutating the
   * returned object never affects internal state.
   */
  function getState() {
    return { tab: _state.tab, pill: _state.pill };
  }

  /**
   * Bind delegated click listeners on a container. Each click is matched
   * against the data-* attributes of the closest target with both data-tab
   * and data-pill (or just data-tab for the top tab bar).
   *
   * @param {object} containerEl Element-like with addEventListener.
   * @param {'tab'|'pill'} kind  Which dataset to read.
   */
  function _bindContainerClicks(containerEl, kind) {
    if (!containerEl || typeof containerEl.addEventListener !== 'function') return;
    containerEl.addEventListener('click', (ev) => {
      const target = ev && ev.target;
      if (!target || typeof target.closest !== 'function') return;
      if (kind === 'tab') {
        const el = target.closest('[data-tab]');
        if (!el || !el.dataset || !el.dataset.tab) return;
        // Tab clicks: pill defaults to first pill of named tab via fallback.
        activate(el.dataset.tab, el.dataset.pill, 'click');
      } else {
        const el = target.closest('[data-pill]');
        if (!el || !el.dataset || !el.dataset.pill) return;
        // Pill clicks within the active tab.
        activate(_state.tab, el.dataset.pill, 'click');
      }
    });
  }

  /**
   * Initialize the router. Reads the URL hash and storage to determine the
   * starting (tab, pill), normalizes the URL via replaceState, applies DOM
   * state, and binds delegated click handlers + popstate.
   *
   * @param {object} options
   */
  function init(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('tabRouter.init: options object is required');
    }
    _tabs = Array.isArray(options.tabs) && options.tabs.length > 0 ? options.tabs : TABS;
    _tabsById = indexTabs(_tabs);
    _storage = options.storage || null;
    _win = options.win || null;
    _rootEl = options.rootEl || null;
    _tabBarEl = options.tabBarEl || null;
    _pillBarsByTab = options.pillBarsByTab || {};
    _getTabButton = typeof options.getTabButton === 'function'
      ? options.getTabButton
      : () => null;
    _getPillButton = typeof options.getPillButton === 'function'
      ? options.getPillButton
      : () => null;
    _getPillHost = typeof options.getPillHost === 'function'
      ? options.getPillHost
      : () => null;
    _getTabPanel = typeof options.getTabPanel === 'function'
      ? options.getTabPanel
      : () => null;
    _onAfterActivate = typeof options.onAfterActivate === 'function'
      ? options.onAfterActivate
      : null;
    _initialized = true;

    // Resolution order: URL hash > storage > default. The hash takes
    // precedence per FR-024; an invalid hash falls through to storage; an
    // invalid persisted view falls through to (DEFAULT_TAB, DEFAULT_PILL).
    let resolved = null;
    const hash = (_win && _win.location && _win.location.hash) || '';
    const fromHash = parseHash(hash);
    const hashIsValid = fromHash.tab
      && _tabsById.has(fromHash.tab)
      && fromHash.pill
      && _tabsById.get(fromHash.tab).pills.some((p) => p.id === fromHash.pill);
    if (hashIsValid) {
      resolved = { tab: fromHash.tab, pill: fromHash.pill };
    } else {
      const fromStorage = readPersistedView(_storage);
      const storageIsValid = fromStorage.tab
        && _tabsById.has(fromStorage.tab)
        && fromStorage.pill
        && _tabsById.get(fromStorage.tab).pills.some((p) => p.id === fromStorage.pill);
      if (storageIsValid) {
        resolved = { tab: fromStorage.tab, pill: fromStorage.pill };
      } else {
        resolved = { tab: DEFAULT_TAB, pill: DEFAULT_PILL };
      }
    }

    // Initial activation. We do this manually (rather than calling activate)
    // so we can use replaceState ('load' source) and ensure DOM/URL/storage
    // are written even though the previous state is bootstrap (matches default).
    const previous = null;
    _state = resolved;
    _applyDomState(previous, _state);
    _syncUrl(_state.tab, _state.pill, 'load');
    _writeStorage(_state.tab, _state.pill);
    _resizeChartsFor(_state.pill);
    if (typeof _onAfterActivate === 'function') {
      try {
        _onAfterActivate({ tab: _state.tab, pill: _state.pill });
      } catch (_err) { /* swallow */ }
    }

    // Bind delegated click listeners. Tests don't fire DOM clicks, but the
    // dashboards rely on these.
    _bindContainerClicks(_tabBarEl, 'tab');
    if (_pillBarsByTab && typeof _pillBarsByTab === 'object') {
      for (const tabId of Object.keys(_pillBarsByTab)) {
        _bindContainerClicks(_pillBarsByTab[tabId], 'pill');
      }
    }

    // Bind 'Next ->' delegation on rootEl. Any element with
    // data-action="next-pill" inside an ancestor with data-tab+data-pill
    // advances to the next pill in that tab.
    if (_rootEl && typeof _rootEl.addEventListener === 'function') {
      _rootEl.addEventListener('click', (ev) => {
        const target = ev && ev.target;
        if (!target || typeof target.closest !== 'function') return;
        const btn = target.closest('[data-action="next-pill"]');
        if (!btn) return;
        const host = btn.closest('[data-tab][data-pill]');
        if (!host || !host.dataset) return;
        const next = _findNextPill(host.dataset.tab, host.dataset.pill);
        if (next) activate(host.dataset.tab, next.id, 'click');
      });
    }

    // Bind popstate so Back/Forward navigation updates the active view.
    if (_win && typeof _win.addEventListener === 'function') {
      _win.addEventListener('popstate', () => {
        const nextHash = (_win && _win.location && _win.location.hash) || '';
        const parsed = parseHash(nextHash);
        const valid = parsed.tab
          && _tabsById.has(parsed.tab)
          && parsed.pill
          && _tabsById.get(parsed.tab).pills.some((p) => p.id === parsed.pill);
        if (valid) {
          activate(parsed.tab, parsed.pill, 'popstate');
        } else {
          activate(DEFAULT_TAB, DEFAULT_PILL, 'popstate');
        }
      });
    }
  }

  return { init, activate, registerChart, getState };
}

// ---------------------------------------------------------------------------
// Default singleton — convenience for the dashboard's inline bootstrap.
//
// The HTML files create an instance and assign it to win.tabRouter as part
// of their init code. The factory above is the canonical entry point;
// tests use it directly to keep state isolated between cases.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// UMD-style export: works in three environments without an ES-module bundler.
//
//   1. Browser via classic <script src="calc/tabRouter.js"> (file:// safe)
//      -> attaches createTabRouter / TABS / STORAGE_KEY to `window`.
//   2. Browser via <script type="module"> (NOT used by the dashboards because
//      file:// blocks ESM imports under Chromium CORS, but kept compatible).
//   3. Node `node --test` via `require('./calc/tabRouter.js')`.
//      -> populates module.exports.
//
// Constitution Principle V (Zero-Build, Zero-Dependency Delivery, NON-NEGO-
// TIABLE) requires the dashboards to remain runnable by double-clicking the
// HTML file. ES `export` keywords would force `<script type="module">`, which
// silently fails on file:// — so we use this hybrid pattern instead.
// ---------------------------------------------------------------------------
const _tabRouterApi = {
  createTabRouter: createTabRouter,
  TABS: TABS,
  STORAGE_KEY: STORAGE_KEY,
  parseHash: parseHash,
  formatHash: formatHash,
  resolveValidPair: resolveValidPair,
  readPersistedView: readPersistedView,
  indexTabs: indexTabs,
};
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = _tabRouterApi;
}
if (typeof window !== 'undefined') {
  window.createTabRouter = createTabRouter;
  window.TABS = TABS;
  // Expose the full API on a namespaced handle for any future caller that
  // needs the lower-level helpers (parseHash etc.) without polluting window.
  window.tabRouterModule = _tabRouterApi;
}
