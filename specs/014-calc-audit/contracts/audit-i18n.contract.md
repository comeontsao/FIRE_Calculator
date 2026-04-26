# Contract — Audit Tab i18n Keys (EN + zh-TW)

**Feature**: `014-calc-audit`
**Files affected**: `FIRE-Dashboard.html`, `FIRE-Dashboard-Generic.html`, `FIRE-Dashboard Translation Catalog.md`

Per Constitution Principle VII (Bilingual First-Class — NON-NEGOTIABLE), every new user-visible string ships with both EN and zh-TW values in the same change set. ~37 new key pairs.

---

## Tab + pill labels (2 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `nav.tab.audit` | Audit | 計算審查 |
| `nav.pill.summary` | Summary | 總覽 |

(Note: `nav.pill.summary` already exists from feature 013 under the Plan tab — this is the SAME key, reused. No new pill-key needed.)

---

## Section headings (8 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `audit.section.flow.title` | Calculation Flow | 計算流程 |
| `audit.section.inputs.title` | Resolved Inputs | 解析後輸入 |
| `audit.section.spending.title` | Spending Adjustments | 支出調整 |
| `audit.section.gates.title` | Gate Evaluations | 門檻判定 |
| `audit.section.fireage.title` | FIRE Age Resolution | FIRE 年齡解析 |
| `audit.section.strategy.title` | Strategy Ranking | 策略排名 |
| `audit.section.lifecycle.title` | Lifecycle Projection | 生命週期預測 |
| `audit.section.crossval.title` | Cross-Validation | 交叉驗證 |

---

## Flow diagram stage labels (6 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `audit.flow.stage.inputs` | Inputs | 輸入 |
| `audit.flow.stage.spending` | Spending Adjustments | 支出調整 |
| `audit.flow.stage.gates` | Gate Evaluations | 門檻判定 |
| `audit.flow.stage.fireAge` | FIRE Age Resolution | FIRE 年齡 |
| `audit.flow.stage.strategy` | Strategy Ranking | 策略排名 |
| `audit.flow.stage.lifecycle` | Lifecycle Projection | 生命週期 |

---

## Plain-English gate verdicts (8 pairs — 2 per gate × 3 gates + 2 generic)

Verdict keys use `{0}`, `{1}`, `{2}` placeholders interpolated by `t(key, ...args)`.

| Key | EN | zh-TW |
|-----|----|---|
| `audit.gate.safe.verdict.feasible` | Safe: every retirement-year total ≥ ${0}. End balance ${1}. Verdict: feasible. | 安全：每年退休後總額 ≥ ${0}。期末餘額 ${1}。判定：可行。 |
| `audit.gate.safe.verdict.infeasible` | Safe: every retirement-year total ≥ ${0}. First violation at age {1} (total ${2}). Verdict: infeasible. | 安全：每年退休後總額 ≥ ${0}。首次違反於 {1} 歲（總額 ${2}）。判定：不可行。 |
| `audit.gate.exact.verdict.feasible` | Exact: end balance ${0} ≥ required ${1}. Verdict: feasible. | 精確：期末餘額 ${0} ≥ 所需 ${1}。判定：可行。 |
| `audit.gate.exact.verdict.infeasible` | Exact: end balance ${0} < required ${1}. Verdict: infeasible. | 精確：期末餘額 ${0} < 所需 ${1}。判定：不可行。 |
| `audit.gate.dieWithZero.verdict.feasible` | DWZ: every retirement-year total ≥ ${0} AND end balance ${1} ≥ 0. Verdict: feasible. | 歸零：每年退休後總額 ≥ ${0} 且期末餘額 ${1} ≥ 0。判定：可行。 |
| `audit.gate.dieWithZero.verdict.infeasible` | DWZ: ${0}. Verdict: infeasible. | 歸零：${0}。判定：不可行。 |
| `audit.gate.activeMarker` | (active) | （目前模式） |
| `audit.gate.label.{safe,exact,dieWithZero}` | (already in tab i18n keys from 013 — `nav.pill.ss` etc. don't apply here; reuse `gate.safe.label` if present, else add) | (same) |

**Note**: existing `gate.safe.label` / `gate.exact.label` / `gate.dwz.label` keys MAY already exist in the catalog from earlier features. If present, REUSE them; do not add duplicates.

---

## Table column headers (~10 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `audit.col.age` | Age | 年齡 |
| `audit.col.phase` | Phase | 階段 |
| `audit.col.total` | Total | 總額 |
| `audit.col.endBalance` | End Balance | 期末餘額 |
| `audit.col.lifetimeTax` | Lifetime Tax | 一生稅務 |
| `audit.col.violations` | Floor Violations | 違反次數 |
| `audit.col.firstViolationAge` | First Violation Age | 首次違反年齡 |
| `audit.col.shortfall` | Shortfall Years | 短缺年數 |
| `audit.col.firstShortfallAge` | First Shortfall Age | 首次短缺年齡 |
| `audit.col.feasible` | Feasible | 可行 |

---

## Cross-validation messages (~9 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `audit.crossval.allPassed` | All cross-checks passed. | 所有交叉檢查通過。 |
| `audit.crossval.kind.endBalance` | End balance mismatch | 期末餘額不一致 |
| `audit.crossval.kind.feasibility` | Feasibility verdict mismatch | 可行性判定不一致 |
| `audit.crossval.kind.fireAge` | FIRE age mismatch | FIRE 年齡不一致 |
| `audit.crossval.kind.violationCount` | Floor violation count mismatch | 違反次數不一致 |
| `audit.crossval.expectedAnnotation` | (expected — different sim contracts) | （預期 — 模擬合約不同） |
| `audit.crossval.delta` | Δ ${0} ({1}%) | Δ ${0}（{1}%） |
| `audit.crossval.kindLabel.signed` | signed-sim | 帶符號模擬 |
| `audit.crossval.kindLabel.chart` | chart-sim | 圖表模擬 |

---

## Other UI strings (~3 pairs)

| Key | EN | zh-TW |
|-----|----|---|
| `audit.empty.noRecalc` | No calculation results yet — change any input or click Reset. | 尚未進行計算 — 請變更輸入或點選重設。 |
| `audit.empty.strategyPending` | Strategy ranking pending — please wait for the next recalc. | 策略排名計算中 — 請等待下次重新計算。 |
| `audit.label.winnerBadge` | winner | 勝出 |

---

## Total count

- Tab + pill labels: 2 pairs
- Section headings: 8 pairs
- Flow stages: 6 pairs
- Gate verdicts + active marker: 7 pairs (active marker + 6 verdicts; gate label keys reused from existing catalog)
- Table columns: 10 pairs
- Cross-validation: 9 pairs
- Other: 3 pairs

**Estimated total: 37 new key pairs.**

(If some `gate.*` label keys already exist in the catalog from earlier features, the actual count of NEW keys is slightly lower. The implementation MUST verify before adding to avoid duplicates.)

---

## Where the keys live in code

In each HTML file's `TRANSLATIONS` object:

```js
const TRANSLATIONS = {
  en: {
    // ... existing keys ...
    // === Feature 014: Calc Audit ===
    'nav.tab.audit':                'Audit',
    'audit.section.flow.title':     'Calculation Flow',
    // ... 35 more EN keys ...
  },
  zh: {
    // ... existing keys ...
    // === Feature 014: Calc Audit ===
    'nav.tab.audit':                '計算審查',
    'audit.section.flow.title':     '計算流程',
    // ... 35 more zh-TW keys ...
  },
};
```

Both files get byte-identical additions.

---

## Catalog row to add

In `FIRE-Dashboard Translation Catalog.md`, append a new section `## Feature 014 — Calc Audit (i18n)` with all ~37 key pairs in markdown table form (Key · EN · zh-TW). Append at the end of the catalog (the catalog grows append-only by feature).

---

## Language toggle behavior

The existing `switchLanguage(lang)` function walks every element with a `data-i18n` attribute and updates its `textContent`. Audit tab labels use `data-i18n` attributes; plain-English gate verdicts are interpolated dynamically via `t(key, ...args)` from the audit assembler. Both are picked up by language toggle without additional wiring.

The Audit tab's flow-diagram headlines and chart labels are rendered DYNAMICALLY (computed per recalc, written to span `.textContent`). On language toggle, the dashboard's existing `recalcAll()` triggers a recalc that re-assembles the snapshot using the new language's `t()` — so the dynamic content updates automatically.
