# Data Model — Tabbed Dashboard Navigation

**Feature**: `013-tabbed-navigation`
**Date**: 2026-04-25

This feature introduces UI-routing state only. There are no new domain entities, no new calc inputs, no new persisted data fields. The entities below describe the runtime view-state model.

---

## Entity: `Tab`

A top-level themed surface in the dashboard.

**Fields**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (literal) | One of `'plan'`, `'geography'`, `'retirement'`, `'history'`. Stable; used in URL hash and localStorage. |
| `labelKey` | string | i18n key (e.g., `'nav.tab.plan'`). Resolved via existing `t(key)` helper. |
| `pills` | `Pill[]` | Ordered list of pills inside this tab. Order determines `Next →` traversal order. |

**Validation rules**:

- `id` MUST be one of the 4 fixed literals; values from URL hash or localStorage that fall outside this set fall back to `'plan'` (FR-026).
- `pills.length >= 1` for every Tab.
- Pill IDs within a tab MUST be unique.

**Instances** (fixed at code-time, not user-editable):

```text
Tab('plan',       'nav.tab.plan',       [Profile, Assets, Investment, Mortgage, Expenses, Summary])
Tab('geography',  'nav.tab.geography',  [Scenarios, CountryChart, Healthcare, CountryDeepDive])
Tab('retirement', 'nav.tab.retirement', [SocialSecurity, WithdrawalStrategy, Drawdown, Lifecycle, Milestones])
Tab('history',    'nav.tab.history',    [Snapshots])
```

**Relationships**: A Tab owns 1..N Pills. A Pill belongs to exactly one Tab.

---

## Entity: `Pill`

A sub-tab inside a Tab. Hosts one or more existing card sections from the pre-tabbed dashboard.

**Fields**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (kebab-case) | Stable across releases. Used in URL hash and localStorage. |
| `labelKey` | string | i18n key (e.g., `'nav.pill.profile'`). |
| `tabId` | string (literal) | Foreign key to parent `Tab.id`. |
| `hostsCardIds` | `string[]` | DOM IDs of the card containers this pill hosts. May be 1+. |
| `hasNextButton` | boolean | `true` for every pill except the last in its parent Tab. |

**Validation rules**:

- `id` is unique within its parent Tab; not necessarily globally unique (e.g., a `'summary'` pill could exist in both Plan and a future tab).
- `tabId` MUST resolve to one of the 4 known tabs.
- `hostsCardIds.length >= 1` (every pill must host at least one card).
- `hasNextButton === false` if and only if this Pill is `parentTab.pills[parentTab.pills.length - 1]` (last pill in tab).

**Instances** (fixed at code-time):

| Tab | Pill `id` | `labelKey` | `hostsCardIds` |
|-----|-----------|------------|----------------|
| plan | `profile` | `nav.pill.profile` | `[profileIncomeCard]` |
| plan | `assets` | `nav.pill.assets` | `[currentAssetsCard]` |
| plan | `investment` | `nav.pill.investment` | `[investSavingsCard]` |
| plan | `mortgage` | `nav.pill.mortgage` | `[mortgageCard]` (plus any sibling mortgage-impact subcards) |
| plan | `expenses` | `nav.pill.expenses` | `[monthlyExpensesCard]` |
| plan | `summary` | `nav.pill.summary` | `[savingsRateCard, netWorthPieCard, expenseDistPieCard]` |
| geography | `scenarios` | `nav.pill.scenarios` | `[geoArbitrageCard]` |
| geography | `country-chart` | `nav.pill.countryChart` | `[countryChartCard]` |
| geography | `healthcare` | `nav.pill.healthcare` | `[healthcareCard]` |
| geography | `country-deep-dive` | `nav.pill.countryDeepDive` | `[countryDeepDivePanel]` |
| retirement | `ss` | `nav.pill.ss` | `[socialSecurityCard]` |
| retirement | `withdrawal` | `nav.pill.withdrawal` | `[withdrawalStrategyControls, multiStrategyComparisonPanel]` |
| retirement | `drawdown` | `nav.pill.drawdown` | `[drawdownCard]` |
| retirement | `lifecycle` | `nav.pill.lifecycle` | `[lifecycleCard]` |
| retirement | `milestones` | `nav.pill.milestones` | `[milestonesCard]` |
| history | `snapshots` | `nav.pill.snapshots` | `[snapshotsCard]` |

(The exact host DOM IDs are derived from the existing markup. The contract `tab-ui.contract.md` pins them precisely.)

**Relationships**: A Pill is owned by exactly one Tab. A Pill hosts 1..N Cards (existing DOM elements; not modeled as entities here).

---

## Entity: `ActiveView`

The current routing state — which Tab+Pill is visible. Persisted in `localStorage` and mirrored to URL hash.

**Fields**:

| Field | Type | Notes |
|-------|------|-------|
| `tab` | string | One of the 4 known Tab IDs. |
| `pill` | string | A valid Pill ID belonging to `tab`. |

**Validation rules**:

- Both fields MUST resolve to known entities. If invalid, fall back per FR-026 (invalid tab → Plan/Profile) and FR-027 (invalid pill → first pill of named tab).
- Mutations are atomic: changing tab implies setting pill to that tab's first pill (FR-009). Changing pill within the active tab keeps tab unchanged (FR-010).

**Persistence**:

- **localStorage key**: `dashboardActiveView`
- **localStorage value**: `JSON.stringify({tab: <tab.id>, pill: <pill.id>})`
- **URL hash format**: `#tab=<tab.id>&pill=<pill.id>`. Example: `#tab=retirement&pill=ss`.
- **Precedence on load**: URL hash > localStorage > default `(tab='plan', pill='profile')`.

**State transitions**:

```text
[any state]
   |
   |--- click tab T (T != current tab) -------> ActiveView { tab: T, pill: T.pills[0] }
   |--- click pill P (P in current tab) ------> ActiveView { tab: current, pill: P }
   |--- click pill P (P in tab T, T != current) -> ActiveView { tab: T, pill: P }
   |--- click "Next →" --------------------------> ActiveView { tab: current, pill: nextPillInTab(current, currentPill) }
   |--- popstate (browser back/forward) ----------> ActiveView parsed from new URL hash
   |--- programmatic (e.g., country card click) -> ActiveView { tab: targetTab, pill: targetPill } via tabRouter.activate(...)
```

After every transition: write to localStorage (with `try/catch`), update URL hash (`pushState` for user clicks, `replaceState` for system-driven loads), apply DOM class flips, trigger `chart.resize()` for charts in the new pill, rebind sticky-header sentinel.

---

## Out-of-scope entities (intentionally NOT modeled)

- **Card** — hosted by a Pill but otherwise unchanged from the pre-tabbed layout. No new fields, no new IDs (existing IDs preserved per FR-037).
- **CompletionState** (would be needed for a true wizard mode with checkmarks) — explicitly out of scope; user chose `Next →` button without completion tracking (Q3-B in brainstorming).
- **TabHistory** (browser back/forward is delegated to native `popstate`; no app-level history needed).

---

## Persistence and migration

**New localStorage key**:
- `dashboardActiveView`: stores `{tab, pill}`. Default for missing key: `null` (fall back to defaults on load).

**Backward compatibility**:
- No existing localStorage keys are read or written by this feature. No migration needed.
- A user upgrading from a pre-tabbed version of the dashboard arrives with no `dashboardActiveView` key and lands on the default Plan/Profile — same as a first-time visitor.

**Removed state (Quick What-If)**:
- Any localStorage keys associated with Quick What-If (none currently — Quick What-If is markup-only) are removed if discovered during the audit step in research R-011.
