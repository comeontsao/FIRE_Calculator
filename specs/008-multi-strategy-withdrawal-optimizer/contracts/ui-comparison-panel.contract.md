# Contract: UI — Collapsed Comparison Panel + Preview Wiring

**Status**: Phase 1 design
**Owner (Engineer)**: Frontend
**Principle alignment**: I (lockstep RR + Generic), III (SSoT via chartState), VI (chart ↔ module), VII (bilingual)

---

## Scope

All changes in this contract ship IDENTICALLY to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## UI component 1 — Objective selector

**Location**: inside the Lifetime Withdrawal Strategy card, directly beneath the card title, above the existing "What is bracket-fill smoothing?" expandable.

**DOM shape**:

```html
<div class="withdrawal-objective-selector">
  <span data-i18n="withdrawal.objective.label">Optimization goal:</span>
  <div role="radiogroup" aria-labelledby="withdrawal-objective-label">
    <button id="btnObjectiveEstate"
            role="radio" aria-checked="true"
            onclick="setWithdrawalObjective('leave-more-behind')">
      <span data-i18n="withdrawal.objective.estate">🧳 Leave more behind</span>
    </button>
    <button id="btnObjectiveTax"
            role="radio" aria-checked="false"
            onclick="setWithdrawalObjective('retire-sooner-pay-less-tax')">
      <span data-i18n="withdrawal.objective.tax">⚡ Retire sooner · pay less tax</span>
    </button>
  </div>
</div>
```

**Behavior**:
- Default: `leave-more-behind` on first load.
- Value persisted in `localStorage.fire_withdrawalObjective`.
- `setWithdrawalObjective(id)` reads the cached `_lastStrategyResults`, re-sorts via `rankByObjective`, fires a `chartState`-style notification to all registered listeners. No re-simulation.
- Active button gets `.is-active` class (solid accent fill, light text). Inactive button: dim.

**Bilingual**:
- EN: "🧳 Leave more behind" / "⚡ Retire sooner · pay less tax"
- zh-TW: "🧳 留多一些給下一代" / "⚡ 更早退休 · 繳少點稅"
  (final wording subject to translator review — keys locked, strings finalized in `/speckit-implement`)

---

## UI component 2 — Winner banner (always visible)

**Location**: replaces the current green strategy-summary ribbon inside the Lifetime Withdrawal card (the one that reads "Strategy: fill 12 % bracket with Trad cheaply… Avg 3.0 % total tax").

**DOM shape**:

```html
<div id="withdrawalWinnerBanner" class="chart-caveat chart-caveat--success">
  <span data-i18n="withdrawal.winner.prefix">🏆 Winner under current goal:</span>
  <strong id="winnerStrategyName">—</strong>
  —
  <span id="winnerStrategyDesc">—</span>
</div>
```

**Behavior**:
- `#winnerStrategyName` gets `t(ranking.winner.nameKey)`.
- `#winnerStrategyDesc` gets `t(ranking.winner.descKey)` plus deltas vs 2nd place (e.g., "+$42,100 end balance vs runner-up" in "leave-more-behind" mode).
- When preview is active (`chartState.previewStrategyId !== null`), this banner hides and the "previewing alternative" banner (component 4) takes its place.

---

## UI component 3 — Collapsed "Compare other strategies" sub-panel

**Location**: directly beneath the existing narrative block, above the chart.

**DOM shape**:

```html
<details id="strategyComparePanel" class="strategy-compare">
  <summary class="strategy-compare__toggle">
    <span aria-hidden="true">▸</span>
    <span data-i18n="withdrawal.compare.toggleLabel">Compare other strategies</span>
    <span class="strategy-compare__count">(<span id="strategyCompareCount">6</span>)</span>
  </summary>
  <div class="strategy-compare__body">
    <table id="strategyCompareTable">
      <thead>
        <tr>
          <th data-i18n="withdrawal.compare.col.strategy">Strategy</th>
          <th data-i18n="withdrawal.compare.col.endBalance">End @ plan age</th>
          <th data-i18n="withdrawal.compare.col.lifetimeTax">Lifetime tax</th>
          <th data-i18n="withdrawal.compare.col.fireAge">Earliest FIRE</th>
          <th data-i18n="withdrawal.compare.col.action" class="sr-only">Action</th>
        </tr>
      </thead>
      <tbody id="strategyCompareTableBody"><!-- populated by renderStrategyComparePanel --></tbody>
    </table>
  </div>
</details>
```

**Behavior**:
- Rendered by a new `renderStrategyComparePanel(ranking)` function, registered as a `chartState.onChange` listener (Principle III).
- Populated with `ranking.rows.slice(1)` — the 6 non-winner rows. Winner is already displayed elsewhere.
- Each row has an inline "Preview" button that calls `setPreviewStrategy(strategyId)`.
- Tie rows get an `= 2nd` badge in the rank column.
- Infeasible rows: grayed-out style, row title attribute explains why, Preview button disabled.
- Panel collapsed by default (`<details>` without `open` attribute). User's open/closed state NOT persisted — always collapsed on reload (minimizes surprise on cold open).

**Accessibility**:
- `<details>` / `<summary>` gives native keyboard toggle (Enter / Space).
- Table has proper `<th>` with `scope="col"`.
- Preview buttons have explicit `aria-label` describing target strategy (`"Preview {strategyName}"`).

---

## UI component 4 — Preview banner

**Location**: replaces Winner banner (component 2) when preview is active.

**DOM shape**:

```html
<div id="withdrawalPreviewBanner" class="chart-caveat chart-caveat--warning" hidden>
  <span data-i18n="withdrawal.preview.prefix">👁 Previewing alternative:</span>
  <strong id="previewStrategyName">—</strong>
  <button id="btnRestoreWinner"
          onclick="setPreviewStrategy(null)"
          data-i18n="withdrawal.preview.restore">
    Restore auto-selected winner
  </button>
</div>
```

**Behavior**:
- `hidden` attribute toggled by a `chartState.onChange` listener observing `previewStrategyId`.

---

## Preview wiring (FR-006 — the sidebar-follow requirement)

When `setPreviewStrategy(id)` is called, the following listeners fire via `chartState.onChange`:

| Listener | Target | What changes |
|---|---|---|
| `renderRothLadder` | Lifetime Withdrawal chart | Stacked bars + eff-tax overlay reflect `id`'s perYearRows |
| `renderGrowthChart` | Main Full Portfolio Lifecycle chart | Phase-colored total + 401K + stocks dashed lines reflect `id`'s cumulative pool balances |
| `renderLifecycleSidebarChart` | Pinnable sidebar mirror | Same as renderGrowthChart, on the sidebar canvas |
| `renderKpiCards` | Four KPI cards (top row) | Progress %, Years to FIRE (display stays — fireAge is fixed), FIRE number (unchanged), Net worth (unchanged). No KPI value actually changes since FIRE age is fixed; the preview banner explains this. |
| `renderCompactHeaderStats` / `#fireStatus` pill | Header status banner | Unchanged — headline stat is years-to-FIRE, still the same |
| `renderStrategyComparePanel` | Compare table row highlighting | Active-preview row highlighted |

**Observational invariant**: for any displayed strategy `s`, the four chart surfaces (Lifetime Withdrawal, main lifecycle, sidebar mirror, KPI ribbon) ALL derive from `s.perYearRows`. No re-simulation — reads the cached Ranking.

---

## Caveat caption wiring (FR-010)

The existing hardcoded caveat banners (today's "📌 Social Security taxable (85%) fills…", "Bracket-fill saves negligible tax…") become GATED by the displayed strategy's `caveatFlags`:

| Banner | Gate | Today |
|---|---|---|
| `#ssReductionCaption` | `displayedStrategy.caveatFlagsObservedInRun.ssReducedFill === true` | Always shown if any year triggered it for bracket-fill |
| Bracket-fill narrative ribbon (purple) | `displayedStrategy.caveatFlagsObservedInRun.bracketFillActive === true` | Always shown |
| IRMAA ⚠ glyph on Trad bars | Per-year `row.caveats.irmaaCapped || row.caveats.irmaaBreached` for `displayedStrategy.perYearRows[i]` | Same (already per-year, just now keyed off displayed strategy) |
| Roth 5-year banner | `displayedStrategy.caveatFlagsObservedInRun.roth5YearWarning === true` | Same (always hidden today) |

**Strategy-specific narrative text** (replaces the current "fill 12 % bracket with Trad cheaply…" paragraph):
- Each strategy carries a `narrativeKey` i18n string that gets injected into the narrative ribbon when that strategy is displayed. For `bracket-fill-smoothed`, the text reads identically to today (byte-for-byte — Principle II guarantee).

---

## i18n catalog additions

All keys added to `TRANSLATIONS.en` AND `TRANSLATIONS.zh` in BOTH HTML files, AND recorded in `FIRE-Dashboard Translation Catalog.md`:

```
withdrawal.objective.label
withdrawal.objective.estate
withdrawal.objective.tax
withdrawal.winner.prefix
withdrawal.preview.prefix
withdrawal.preview.restore
withdrawal.compare.toggleLabel
withdrawal.compare.col.strategy
withdrawal.compare.col.endBalance
withdrawal.compare.col.lifetimeTax
withdrawal.compare.col.fireAge
withdrawal.compare.col.action
withdrawal.compare.tieRank            // "= {0}" template
withdrawal.compare.infeasibleTooltip
withdrawal.compare.previewAction      // button text, e.g., "Preview"

strategy.bracketFillSmoothed.name
strategy.bracketFillSmoothed.desc
strategy.bracketFillSmoothed.narrative
strategy.conventional.name
strategy.conventional.desc
strategy.conventional.narrative
strategy.proportional.name
strategy.proportional.desc
strategy.proportional.narrative
strategy.rothLadder.name
strategy.rothLadder.desc
strategy.rothLadder.narrative
strategy.taxOptimizedSearch.name
strategy.taxOptimizedSearch.desc
strategy.taxOptimizedSearch.narrative
strategy.tradFirst.name
strategy.tradFirst.desc
strategy.tradFirst.narrative
strategy.tradLastPreserve.name
strategy.tradLastPreserve.desc
strategy.tradLastPreserve.narrative
```

Total: 15 UI-chrome keys + 21 strategy keys (7 × 3) = **36 new keys × 2 languages = 72 strings**.

---

## CSS additions (scoped, follows existing dark-theme var system)

Minimal new rules added to the existing `<style>` block:

```css
.withdrawal-objective-selector { /* inline-flex, gap, matches filter-row look */ }
.withdrawal-objective-selector button { /* pill-shaped; is-active = accent fill */ }
.strategy-compare { /* bordered container inside the card */ }
.strategy-compare__toggle { /* bold, cursor pointer, ▸ rotates to ▾ when open */ }
.strategy-compare__body table { /* full width, compact padding */ }
.strategy-compare tr.is-tied { /* subtle left-border accent */ }
.strategy-compare tr.is-preview-target { /* highlighted row while preview active */ }
.strategy-compare tr.is-infeasible { /* opacity 0.5, cursor help */ }
```

No new colors (reuse `--accent`, `--warning`, `--success`, `--text-dim`). Mobile breakpoint: table horizontally scrolls below 480 px width (table already narrow enough).
