# Contract — i18n Strings

**Feature**: `specs/012-ssa-earnings-pre-2020/spec.md`
**Files touched**:

- `FIRE-Dashboard-Generic.html` — `TRANSLATIONS.en` and `TRANSLATIONS.zh` dicts.
- `FIRE-Dashboard Translation Catalog.md` — add a new section under "Social Security (`ss.*`)" listing these keys.

## New keys (7)

| Key | EN | zh-TW | Placeholders | Consumer |
|-----|-----|-------|--------------|----------|
| `ss.addPriorYear` | `+ Add Prior Year` | `+ 新增先前年份` | none | button label (DOM static via `data-i18n`) |
| `ss.earliestYearLabel` | `Earliest year` | `最早年份` | none | label (DOM static via `data-i18n`) |
| `ss.earliestYearSet` | `Set` | `設定` | none | button label (DOM static via `data-i18n`) |
| `ss.earliestYearHint` | `Already covered — no change.` | `已涵蓋此年份，未變更。` | none | status line (JS `t()`) |
| `ss.duplicateYear` | `{0} already exists in the record.` | `{0} 已存在於紀錄中。` | `{0}` = year (integer) | status line (JS `t(...)`) — defensive; duplicates should be unreachable via the new helpers but the catalog entry exists for robustness. |
| `ss.floorReached` | `Earliest supported year is {0}.` | `最早可輸入年份為 {0}。` | `{0}` = floor year (integer, always 1960 today) | status line (JS `t(...)`) |
| `ss.yearAccepted` | `Added {0}.` | `已新增 {0}。` | `{0}` = year (integer) | status line (JS `t(...)`) |

## Placeholder interpolation

The existing dashboard `t(key, ...args)` helper already supports `{0}`, `{1}`, ... substitution. Example:

```js
t('ss.floorReached', 1960)  // → "Earliest supported year is 1960." / "最早可輸入年份為 1960。"
```

No change to `t()` required.

## Constitution §VII compliance

- All seven keys are present in BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` in the SAME commit that introduces the UI.
- No hardcoded-English DOM text is added. All three button labels use `data-i18n`. All four status messages route through `t()`.
- No acronyms newly introduced. (SS and SSA are exempt per §VII, and are not new here anyway — they're preserved from the existing card.)
- The translation catalog file is updated in the same commit.

## Catalog entry (to be appended to `FIRE-Dashboard Translation Catalog.md`)

Suggested location: under the existing "Social Security (`ss.*`) — Generic-new" section (around line 649 today). Add a subsection:

```markdown
**Feature 012 additions — pre-2020 earnings entry:**

| Key | EN | zh-TW | Placeholders |
|-----|-----|-------|--------------|
| `ss.addPriorYear` | `+ Add Prior Year` | `+ 新增先前年份` | — |
| `ss.earliestYearLabel` | `Earliest year` | `最早年份` | — |
| `ss.earliestYearSet` | `Set` | `設定` | — |
| `ss.earliestYearHint` | `Already covered — no change.` | `已涵蓋此年份，未變更。` | — |
| `ss.duplicateYear` | `{0} already exists in the record.` | `{0} 已存在於紀錄中。` | `{0}` year |
| `ss.floorReached` | `Earliest supported year is {0}.` | `最早可輸入年份為 {0}。` | `{0}` floor year |
| `ss.yearAccepted` | `Added {0}.` | `已新增 {0}。` | `{0}` year |

Consumer: `FIRE-Dashboard-Generic.html` SSA Earnings Record card (add-prior-year button, bulk earliest-year input, and status line).
```
