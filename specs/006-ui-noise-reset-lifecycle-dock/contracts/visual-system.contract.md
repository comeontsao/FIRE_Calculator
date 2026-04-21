# Contract — Visual System Updates

**Feature**: 006 UI Noise Reset + Lifecycle Dock
**Scope**: Static visual policy applied across both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html`.

---

## Purpose

Codify the design changes that make up the "noise reduction" pass so implementation is mechanical, not interpretive. Each item below names the policy, the CSS class or rule, and the target DOM.

---

## V1 — Surface tiers (FR-020)

**Policy**: Two visual tiers of card. Primary (filled) for controls and headline numbers; secondary (border-only) for supplementary charts.

**Implementation**:

```css
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  transition: border-color 0.3s;
}

.card.surface--secondary {
  background: transparent;
}

/* Hover feedback only on interactive cards */
.card.is-interactive:hover { border-color: var(--accent); }
```

**Assignment**:

| Card | Tier | Interactive? |
|------|------|--------------|
| KPI row wrapper | primary | no |
| FIRE-status bar | primary | no |
| Profile & Income | primary | no |
| Current Assets | primary | no |
| Projections / Returns | primary | no |
| Mortgage panel | primary | no |
| Second Home panel | primary | no |
| College Plan panel | primary | no |
| Healthcare overrides | primary | no |
| Scenario country grid wrapper | primary | no (individual scenario cards are interactive) |
| Scenario cards (individual) | primary | **yes** (`is-interactive`) |
| Snapshot History | primary | no (individual rows are interactive) |
| Snapshot History rows | — | **yes** (`is-interactive`) |
| Full Portfolio Lifecycle chart | **secondary** | no |
| Lifetime Withdrawal Strategy chart | **secondary** | no |
| Roth Ladder chart | **secondary** | no |
| Social Security chart | **secondary** | no |
| Net Worth Pie | **secondary** | no |
| Expense Pie | **secondary** | no |
| FIRE-by-Country ranked bar chart | **secondary** | no |
| Milestone Timeline | **secondary** | no |
| Healthcare comparison chart | **secondary** | no |

---

## V2 — KPI accent policy (FR-021)

**Policy**: All four KPI values render in neutral `--text`. Accent color only appears on the sublabel/delta line.

**Implementation**:

```css
.kpi .value {
  /* WAS: color: var(--accent); or text-yellow/text-green */
  color: var(--text);
}
.kpi .sub {
  color: var(--text-dim);
  font-size: 0.82em;
}
.kpi .sub--delta-up { color: var(--success); }
.kpi .sub--delta-down { color: var(--danger); }
.kpi .sub--delta-flat { color: var(--text-dim); }
```

**Affected DOM**:
- `#kpiNetWorth` and siblings: remove `text-accent` / `text-green` / `text-yellow` classes from the value element.
- Add an optional `--delta-up|down|flat` class to the `.sub` line where a delta is shown.

---

## V3 — Card title typography (FR-022)

**Policy**: Replace UPPERCASE + letter-spacing treatment with quiet title-case.

**Implementation**:

```css
.card-title {
  /* WAS: text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-dim); */
  font-size: 0.95em;
  font-weight: 500;
  color: var(--text-dim);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

Strings in both HTML files' `data-i18n` keys for card titles keep their existing wording; only the CSS changes.

---

## V4 — Section divider (FR-023)

**Policy**: New element type. Uppercase + letter-spacing treatment LIVES HERE and only here.

**Implementation**:

```html
<div class="section-divider">
  <span data-i18n="section.profile">Profile &amp; Plan</span>
</div>
```

```css
.section-divider {
  margin: 32px 0 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim);
}
```

**Placement**: Four dividers per dashboard, per [data-model.md §5](../data-model.md#5-section-divider-metadata).

---

## V5 — Hover interactivity policy (FR-024)

**Policy**: Hover affects only elements explicitly marked `.is-interactive`.

**Implementation**:
- Remove `.card:hover { border-color: var(--accent) }` default rule.
- Keep `.card.is-interactive:hover { border-color: var(--accent) }` (see V1).
- Add `.is-interactive` class to: `.scenario-card`, snapshot history row `<tr>` elements.

---

## V6 — FIRE Progress rail (FR-025)

**Policy**: Replace the `span-3` FIRE Progress card with a thin rail directly below the KPI row.

**Implementation**:

```html
<!-- REMOVE: -->
<!-- <div class="card span-3"><div class="card-title">🔥 FIRE Progress</div> ... </div> -->

<!-- ADD immediately after the KPI row: -->
<div class="progress-rail">
  <div class="progress-rail__ticks">
    <span>$0</span><span>$500K</span><span>$1M</span><span id="progressTarget">—</span>
  </div>
  <div class="progress-rail__track">
    <div class="progress-rail__fill" id="progressBar" style="width:0%"></div>
  </div>
</div>
```

```css
.progress-rail {
  margin: 0 0 24px;
}
.progress-rail__ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.72em;
  color: var(--text-dim);
  margin-bottom: 4px;
}
.progress-rail__track {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.progress-rail__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  transition: width 240ms ease;
}
```

---

## V7 — Country filter demotion (FR-026)

**Policy**: Filter pills read as secondary UI. "Filter:" label prefix; smaller pills; active state = underline, not fill.

**Implementation**:

```html
<div class="filter-row">
  <span class="filter-row__label" data-i18n="filter.label">Filter:</span>
  <button class="filter-pill filter-pill--active" onclick="filterScenarios('all', this)" data-i18n="geo.allCountries">All</button>
  <button class="filter-pill" onclick="filterScenarios('zh', this)" data-i18n="geo.chineseSpoken">🗣️ Chinese</button>
  ... (other pills unchanged markup except class)
</div>
```

```css
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.filter-row__label {
  font-size: 0.78em;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.filter-pill {
  /* smaller than the current .tab-btn */
  padding: 4px 12px;
  font-size: 0.78em;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 200ms, border-color 200ms;
}
.filter-pill:hover { color: var(--text); }
.filter-pill--active {
  color: var(--text);
  border-bottom: 2px solid var(--accent);
  border-radius: 14px 14px 0 0;
}
```

The existing `filterScenarios(filter, btn)` function needs one line change: it replaces the class name `.active` with `.filter-pill--active` on toggle. JS diff is minimal.

---

## V8 — Emoji discipline (FR-027)

**Policy**: Remove emojis from chart/data card titles. Retain on concept cards.

**REMOVE emoji from** (card titles in both files):
- Full Portfolio Lifecycle chart (🔮 or similar if present)
- Lifetime Withdrawal Strategy chart
- Roth Ladder chart
- Social Security chart
- Net Worth Pie
- Expense Pie
- FIRE-by-Country ranked bar chart
- Milestone Timeline
- Healthcare comparison chart
- FIRE Progress (being replaced by the rail — entire card removed)

**KEEP emoji on** (concept cards in both files):
- 👤 Profile & Income
- 🏠 Mortgage / Home
- 🏖️ Second Home / Second Property
- 🎓 College Plan
- 🛡️ Healthcare overrides
- 🛂 Visa / scenario panels (visa cost input line)
- 🌐 Country scenarios grid
- 📸 Snapshot History
- 🔥 FIRE status pill (retains the flame — it's iconic to the product)
- 💡 Tip callout in footer

**Approach**: Editorial. Delete the emoji + surrounding whitespace from the data-i18n span in each card title that falls in the "remove" list above. Translation keys stay; only the ZH and EN string values change to drop the emoji.

---

## V9 — Language toggle relocation (FR-028)

**Policy**: The language toggle moves into the header element (both expanded and compact states).

**Implementation**:
- Remove the existing `<div style="position:absolute;top:12px;right:16px;...">` wrapper around the EN/中文 buttons (RR line ~961, Generic similar).
- Place the buttons inside `.header__controls` (see [sticky-header.contract.md](./sticky-header.contract.md)).
- Update CSS: the buttons are styled via `.header__controls button`.

Single source of truth for the toggle DOM stays in the header; no additional language-switch wiring needed (the `switchLanguage()` function is untouched).

---

## V10 — Internal border cleanup (FR-030)

**Policy**: At most one border per surface.

**Implementation**: Audit-and-remove in both files. Targets (to verify during implementation, not a hard list):
- Inputs inside cards often have their own border; if the card already has a border, the input's border stays (inputs need a visible affordance). Rule: cards inside cards ("sub-panels") should lose their inner border when the outer card already frames them.
- The mortgage "You own" / "Buying now" / "Buying in" button-group sub-panel currently has its own card-style border — remove it, let the outer card handle framing.
- The healthcare comparison table's `<table>` inside a card — if it has its own `border: 1px solid var(--border)` wrapper, remove it.

---

## V11 — Footer tip bar softening (FR-029)

**Policy**: The `.footer-panel__tip` left-edge accent goes from `--accent` to `--border`.

**Implementation** (one line per file):

```css
.footer-panel__tip {
  /* WAS: border-left: 3px solid var(--accent); */
  border-left: 3px solid var(--border);
  background: rgba(255,255,255,0.03);
  /* All other properties unchanged */
}
```

---

## V12 — New i18n keys

**Lockstep requirement**: All additions ship in both `TRANSLATIONS.en` and `TRANSLATIONS.zh` in BOTH files; catalog updated.

| Key | EN | zh-TW |
|-----|----|-------|
| `section.profile` | `Profile & Plan` | `檔案與計劃` |
| `section.outlook` | `Outlook` | `前景預測` |
| `section.compare` | `Compare` | `比較` |
| `section.track` | `Track` | `追蹤` |
| `filter.label` | `Filter:` | `篩選：` |
| `header.yearsChipLabel` | `Years to FIRE` | `距 FIRE 年數` |
| `header.progressChipLabel` | `Progress` | `進度` |
| `sidebar.title` | `Lifecycle` | `生涯預測` |
| `sidebar.pinAria` | `Pin lifecycle sidebar` | `釘選生涯側欄` |
| `sidebar.closeAria` | `Close lifecycle sidebar` | `關閉生涯側欄` |
| `sidebar.toggleAria` | `Toggle lifecycle sidebar` | `切換生涯側欄` |
| `sidebar.fireAgeLabel` | `FIRE age` | `FIRE 歲數` |
| `sidebar.endPortfolioLabel` | `End-of-life portfolio` | `終老投資組合` |

Additionally, the existing `footer.disclaimer` key was retired in feature 005; no further i18n deletion in this feature.

---

## Non-goals

- Color palette changes (the CSS variables `--bg`, `--card`, `--border`, `--accent`, `--accent2`, `--text`, `--text-dim`, `--success`, `--warning`, `--danger` stay as-is).
- Typography replacement (the body font stays as `'Segoe UI', system-ui, -apple-system, sans-serif`; card-title weight changes but the font family does not).
- Chart color / axis / legend changes.
- Layout framework changes (existing CSS Grid + Flexbox stay).

---

## Test Hooks (for Phase 3 smoke verification)

- Count of `.card:not(.surface--secondary)` vs `.card.surface--secondary` matches the assignment table (V1).
- `.kpi .value` has computed color equal to `--text` (not `--accent`).
- `.card-title` has `text-transform: none` (not `uppercase`).
- `.section-divider` elements exist in the expected number (4 per dashboard) with `text-transform: uppercase`.
- `.progress-rail` exists below the KPI row; old `.card.span-3` progress card is gone.
- `.filter-row__label` exists.
- Emoji count in chart-card titles == 0 (grep in HTML for known chart-card title data-i18n keys).
- `.footer-panel__tip` has `border-left-color` equal to `--border`, not `--accent`.
- New i18n keys present in EN and ZH dicts AND in the Translation Catalog.
