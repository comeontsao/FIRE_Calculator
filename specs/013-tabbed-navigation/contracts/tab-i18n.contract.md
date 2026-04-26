# Contract — Tab Navigation i18n Keys (EN + zh-TW)

**Feature**: `013-tabbed-navigation`
**Files affected**: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, `FIRE-Dashboard Translation Catalog.md`

Per Constitution Principle VII (Bilingual First-Class — NON-NEGOTIABLE), every new user-visible string ships with both EN and zh-TW values in the same change set.

---

## New keys (21 pairs)

### Tab labels (4 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.tab.plan` | Plan | 計畫 |
| `nav.tab.geography` | Geography | 地理 |
| `nav.tab.retirement` | Retirement | 退休 |
| `nav.tab.history` | History | 紀錄 |

### Pill labels — Plan tab (6 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.pill.profile` | Profile | 個人資料 |
| `nav.pill.assets` | Assets | 資產 |
| `nav.pill.investment` | Investment | 投資 |
| `nav.pill.mortgage` | Mortgage | 房貸 |
| `nav.pill.expenses` | Expenses | 支出 |
| `nav.pill.summary` | Summary | 總覽 |

### Pill labels — Geography tab (4 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.pill.scenarios` | Scenarios | 情境 |
| `nav.pill.countryChart` | Country Chart | 國家比較圖 |
| `nav.pill.healthcare` | Healthcare | 醫療 |
| `nav.pill.countryDeepDive` | Country Deep-Dive | 國家詳情 |

### Pill labels — Retirement tab (5 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.pill.ss` | Social Security | 社會安全金 |
| `nav.pill.withdrawal` | Withdrawal Strategy | 提款策略 |
| `nav.pill.drawdown` | Drawdown | 資產提領 |
| `nav.pill.lifecycle` | Lifecycle | 完整生命週期 |
| `nav.pill.milestones` | Milestones | 里程碑 |

### Pill labels — History tab (1 pair)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.pill.snapshots` | Snapshots | 歷史紀錄 |

### Button label (1 pair)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.next` | Next → | 下一步 → |

---

## Keys to REMOVE (Quick What-If purge)

Per FR-007, every Quick What-If user-visible string is removed from both HTML files and from the catalog.

Audit list (verify during implementation; exact key set depends on existing markup):

- `sec.whatIf` — section title
- Any keys under the `whatIf.*` namespace currently present in `TRANSLATIONS.en` and `TRANSLATIONS.zh` (e.g., `whatIf.label`, `whatIf.slider`, `whatIf.result`, etc.)

Verification: post-implementation `grep -in "whatIf\|quickWhatIf" FIRE-Dashboard.html FIRE-Dashboard-Generic.html` returns zero matches (SC-012).

---

## Where the keys live in code

In each HTML file, the `TRANSLATIONS` object has two top-level dicts:

```text
const TRANSLATIONS = {
  en: {
    'sec.profileIncome': 'Profile & Income',
    // ... existing keys ...

    // === Feature 013: Tab navigation (added) ===
    'nav.tab.plan':           'Plan',
    'nav.tab.geography':      'Geography',
    'nav.tab.retirement':     'Retirement',
    'nav.tab.history':        'History',
    'nav.pill.profile':       'Profile',
    'nav.pill.assets':        'Assets',
    'nav.pill.investment':    'Investment',
    'nav.pill.mortgage':      'Mortgage',
    'nav.pill.expenses':      'Expenses',
    'nav.pill.summary':       'Summary',
    'nav.pill.scenarios':     'Scenarios',
    'nav.pill.countryChart':  'Country Chart',
    'nav.pill.healthcare':    'Healthcare',
    'nav.pill.countryDeepDive':'Country Deep-Dive',
    'nav.pill.ss':            'Social Security',
    'nav.pill.withdrawal':    'Withdrawal Strategy',
    'nav.pill.drawdown':      'Drawdown',
    'nav.pill.lifecycle':     'Lifecycle',
    'nav.pill.milestones':    'Milestones',
    'nav.pill.snapshots':     'Snapshots',
    'nav.next':               'Next →',
  },
  zh: {
    'sec.profileIncome': '個人資料與收入',
    // ... existing keys ...

    // === Feature 013: Tab navigation (added) ===
    'nav.tab.plan':           '計畫',
    'nav.tab.geography':      '地理',
    'nav.tab.retirement':     '退休',
    'nav.tab.history':        '紀錄',
    'nav.pill.profile':       '個人資料',
    'nav.pill.assets':        '資產',
    'nav.pill.investment':    '投資',
    'nav.pill.mortgage':      '房貸',
    'nav.pill.expenses':      '支出',
    'nav.pill.summary':       '總覽',
    'nav.pill.scenarios':     '情境',
    'nav.pill.countryChart':  '國家比較圖',
    'nav.pill.healthcare':    '醫療',
    'nav.pill.countryDeepDive':'國家詳情',
    'nav.pill.ss':            '社會安全金',
    'nav.pill.withdrawal':    '提款策略',
    'nav.pill.drawdown':      '資產提領',
    'nav.pill.lifecycle':     '完整生命週期',
    'nav.pill.milestones':    '里程碑',
    'nav.pill.snapshots':     '歷史紀錄',
    'nav.next':               '下一步 →',
  },
};
```

The same exact additions go into BOTH `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` per Principle I.

---

## Catalog row to add

In `FIRE-Dashboard Translation Catalog.md`, add a section "Feature 013 — Tab Navigation" with the same 21 pairs in table format. Append at the end of the catalog (the catalog grows append-only by feature).

---

## Language-toggle behavior

The existing `switchLanguage(lang)` function walks every element with a `data-i18n` attribute and sets its `textContent` (or `innerHTML` for `data-i18n-html`) from the active translation dict. The new tab/pill buttons all carry `data-i18n` attributes, so they are picked up automatically — no JS changes needed for label switching.

The active pill is preserved across language toggles because `tabRouter` tracks state by ID, not by visible label (FR-035).

---

## zh-TW translation rationale (notes for translation review)

- **計畫 (Plan)**: standard Chinese for "plan" in a financial planning context. Considered 規劃 (planning, more abstract) — rejected as less concrete.
- **地理 (Geography)**: matches existing usage of country / location concepts elsewhere in the dashboard.
- **退休 (Retirement)**: direct, the most natural choice.
- **紀錄 (History)**: chosen over 歷史 because 紀錄 (records) better matches the snapshot-tracking semantic; 歷史 (history) feels too broad.
- **總覽 (Summary)**: literally "general overview." Common dashboard term in zh-TW UIs.
- **情境 (Scenarios)**: matches existing zh-TW usage in the geo-arbitrage card.
- **國家比較圖 (Country Chart)**: more descriptive than just "圖" (chart); makes the pill purpose clear at a glance.
- **國家詳情 (Country Deep-Dive)**: literally "country details." 詳情 is the standard term for "deep-dive" or "details" view in zh-TW UIs.
- **社會安全金 (Social Security)**: matches existing translation in `sec.socialSecurity`.
- **提款策略 (Withdrawal Strategy)**: matches existing wording in Feature 008 strategy cards.
- **資產提領 (Drawdown)**: literally "asset drawdown." Existing translation in `sec.drawdown` uses similar wording.
- **完整生命週期 (Lifecycle)**: matches existing translation in `sec.lifecycle` (which uses 完整投資組合生命週期 for the long form; here we use the short version).
- **里程碑 (Milestones)**: matches existing usage in `sec.milestones`.
- **歷史紀錄 (Snapshots)**: same wording as existing snapshot-history references.
- **下一步 → (Next →)**: standard zh-TW for "next step." The arrow is preserved as a glyph (language-neutral per Principle VII exemption).

If any of these conflict with the user's preferred terms during review, update before merge — translations are easy to swap and the catalog row is the single source of truth.
