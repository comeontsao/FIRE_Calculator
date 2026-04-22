// One-shot helper: insert the 36 feature-008 i18n keys into both HTML files.
// Idempotent — will not re-insert if keys already present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const EN_KEYS = [
  ["'withdrawal.objective.label'", "'Optimization goal:'"],
  ["'withdrawal.objective.estate'", "'🧳 Leave more behind'"],
  ["'withdrawal.objective.tax'", "'⚡ Retire sooner · pay less tax'"],
  ["'withdrawal.winner.prefix'", "'🏆 Winner under current goal:'"],
  ["'withdrawal.preview.prefix'", "'👁 Previewing alternative:'"],
  ["'withdrawal.preview.restore'", "'Restore auto-selected winner'"],
  ["'withdrawal.compare.toggleLabel'", "'Compare other strategies'"],
  ["'withdrawal.compare.col.strategy'", "'Strategy'"],
  ["'withdrawal.compare.col.endBalance'", "'End @ plan age'"],
  ["'withdrawal.compare.col.lifetimeTax'", "'Lifetime tax'"],
  ["'withdrawal.compare.col.fireAge'", "'Earliest FIRE'"],
  ["'withdrawal.compare.col.action'", "'Action'"],
  ["'withdrawal.compare.tieRank'", "'= {0}'"],
  ["'withdrawal.compare.infeasibleTooltip'", "'Infeasible at this FIRE age under current mode'"],
  ["'withdrawal.compare.previewAction'", "'Preview'"],
  ["'strategy.bracketFillSmoothed.name'", "'Bracket-Fill (Smoothed)'"],
  ["'strategy.bracketFillSmoothed.desc'", "'Fills the 12% bracket each year, capped by Trad balance ÷ remaining years.'"],
  ["'strategy.bracketFillSmoothed.narrative'", "'Strategy: bracket-fill at (stdDed + top12) × (1 − safetyMargin), smoothed by pTrad ÷ yearsRemaining so Trad drains evenly across retirement.'"],
  ["'strategy.conventional.name'", "'Conventional (Taxable → Trad → Roth)'"],
  ["'strategy.conventional.desc'", "'Textbook order: drain taxable stocks first, then Traditional, Roth last.'"],
  ["'strategy.conventional.narrative'", "'Strategy: drain taxable stocks (LTCG) first, then Traditional at ordinary rates, preserve Roth for last — classic Fidelity / Vanguard default.'"],
  ["'strategy.proportional.name'", "'Proportional'"],
  ["'strategy.proportional.desc'", "'Withdraws from every pool weighted by its current balance.'"],
  ["'strategy.proportional.narrative'", "'Strategy: each year pull from Trad, Roth, Taxable, Cash in proportion to their current balances — maintains tax diversification.'"],
  ["'strategy.rothLadder.name'", "'Roth Ladder'"],
  ["'strategy.rothLadder.desc'", "'Roth first (tax-free), then Taxable, Cash, Traditional last.'"],
  ["'strategy.rothLadder.narrative'", "'Strategy: pull Roth first (tax-free), then Taxable stocks (LTCG), Cash, Traditional only under RMD floor — preserves Trad compounding.'"],
  ["'strategy.taxOptimizedSearch.name'", "'Tax-Optimized Search'"],
  ["'strategy.taxOptimizedSearch.desc'", "'Numerically finds the Trad-aggressiveness that minimizes lifetime federal tax.'"],
  ["'strategy.taxOptimizedSearch.narrative'", "'Strategy: 11-point sweep over Trad aggressiveness θ ∈ [0, 1] — picks the θ that minimizes total lifetime federal tax at the current FIRE age.'"],
  ["'strategy.tradFirst.name'", "'Trad-First'"],
  ["'strategy.tradFirst.desc'", "'Drain Traditional 401(k) at ordinary rates before any other pool.'"],
  ["'strategy.tradFirst.narrative'", "'Strategy: drain Traditional first at ordinary rates (pre-RMD window), then Taxable stocks, Cash, Roth last — Kitces / Reichenstein tax-deferred-first argument.'"],
  ["'strategy.tradLastPreserve.name'", "'Trad-Last (Preserve)'"],
  ["'strategy.tradLastPreserve.desc'", "'Stocks + Cash first, then Roth, Trad last — preserves Trad for estate.'"],
  ["'strategy.tradLastPreserve.narrative'", "'Strategy: drain Taxable stocks and Cash first, then Roth, Traditional only under RMD floor — maximizes Trad balance left to heirs.'"],
];

const ZH_KEYS = [
  ["'withdrawal.objective.label'", "'最佳化目標：'"],
  ["'withdrawal.objective.estate'", "'🧳 留多一些給下一代'"],
  ["'withdrawal.objective.tax'", "'⚡ 更早退休 · 繳少點稅'"],
  ["'withdrawal.winner.prefix'", "'🏆 目前目標下的最佳策略：'"],
  ["'withdrawal.preview.prefix'", "'👁 預覽替代策略：'"],
  ["'withdrawal.preview.restore'", "'恢復自動選出的最佳策略'"],
  ["'withdrawal.compare.toggleLabel'", "'比較其他策略'"],
  ["'withdrawal.compare.col.strategy'", "'策略'"],
  ["'withdrawal.compare.col.endBalance'", "'計畫年齡結算'"],
  ["'withdrawal.compare.col.lifetimeTax'", "'一生稅額'"],
  ["'withdrawal.compare.col.fireAge'", "'最早 FIRE'"],
  ["'withdrawal.compare.col.action'", "'動作'"],
  ["'withdrawal.compare.tieRank'", "'= {0}'"],
  ["'withdrawal.compare.infeasibleTooltip'", "'此 FIRE 年齡下此策略不可行'"],
  ["'withdrawal.compare.previewAction'", "'預覽'"],
  ["'strategy.bracketFillSmoothed.name'", "'級距填平（平滑版）'"],
  ["'strategy.bracketFillSmoothed.desc'", "'每年填平 12% 級距，並以 Trad 餘額 ÷ 剩餘年數為上限。'"],
  ["'strategy.bracketFillSmoothed.narrative'", "'策略：以 (stdDed + top12) × (1 − 安全邊際) 填平 12% 級距，以 pTrad ÷ 剩餘年數平滑，使 Trad 於退休期間平均提領。'"],
  ["'strategy.conventional.name'", "'傳統順序（應稅 → Trad → Roth）'"],
  ["'strategy.conventional.desc'", "'教科書式順序：先提領應稅股票，再 Traditional，最後 Roth。'"],
  ["'strategy.conventional.narrative'", "'策略：先提領應稅股票（LTCG），再以一般稅率提領 Traditional，Roth 留到最後 — 經典 Fidelity／Vanguard 預設順序。'"],
  ["'strategy.proportional.name'", "'等比例提領'"],
  ["'strategy.proportional.desc'", "'依各帳戶目前餘額比例提領。'"],
  ["'strategy.proportional.narrative'", "'策略：每年依 Trad、Roth、應稅、現金當前餘額比例提領 — 維持稅務多元化。'"],
  ["'strategy.rothLadder.name'", "'Roth 階梯'"],
  ["'strategy.rothLadder.desc'", "'Roth 優先（免稅），再應稅、現金，Trad 最後。'"],
  ["'strategy.rothLadder.narrative'", "'策略：先提領 Roth（免稅），再應稅股票（LTCG）、現金，Traditional 僅在 RMD 下限內提領 — 保留 Trad 複利。'"],
  ["'strategy.taxOptimizedSearch.name'", "'最低稅搜尋'"],
  ["'strategy.taxOptimizedSearch.desc'", "'以數值方式找出能最小化一生聯邦稅的 Trad 提領激進度。'"],
  ["'strategy.taxOptimizedSearch.narrative'", "'策略：針對 Trad 激進度 θ ∈ [0, 1] 進行 11 點掃描 — 選出目前 FIRE 年齡下一生聯邦稅最低的 θ。'"],
  ["'strategy.tradFirst.name'", "'Trad 優先'"],
  ["'strategy.tradFirst.desc'", "'先以一般稅率提領 Traditional 401(k)，再動用其他帳戶。'"],
  ["'strategy.tradFirst.narrative'", "'策略：在 RMD 前先以一般稅率提領 Traditional，再應稅股票、現金，Roth 最後 — Kitces／Reichenstein「先稅延後」論點。'"],
  ["'strategy.tradLastPreserve.name'", "'Trad 最後（留給後代）'"],
  ["'strategy.tradLastPreserve.desc'", "'先股票與現金，再 Roth，Trad 最後 — 保留 Trad 給後代。'"],
  ["'strategy.tradLastPreserve.narrative'", "'策略：先提領應稅股票與現金，再 Roth，Traditional 僅在 RMD 下限內提領 — 留給後代的 Trad 餘額最大化。'"],
];

function renderBlock(keyPairs, indent = '    ') {
  return keyPairs.map(([k, v]) => `${indent}${k}: ${v},`).join('\r\n');
}

const feature008Header = '    // ==================== Feature 008 — Multi-Strategy Withdrawal Optimizer ====================';
const enBlock = feature008Header + '\n' + renderBlock(EN_KEYS);
const zhBlock = feature008Header + '\n' + renderBlock(ZH_KEYS);

function insertIntoFile(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  if (src.includes("'withdrawal.objective.label'")) {
    console.log(`[skip] ${path.basename(absPath)} — feature 008 keys already present`);
    return;
  }
  // EN block: insert before the closing `  },` that ends the en: { ... } block.
  // The line directly preceding `  zh: {` is `  },`.
  const zhStartIdx = src.indexOf('\r\n  zh: {\r\n');
  if (zhStartIdx < 0) throw new Error('Could not find zh: { marker');
  // Walk backward to find the `  },` line that closes en: { ... }
  const beforeZh = src.slice(0, zhStartIdx);
  const enCloseIdx = beforeZh.lastIndexOf('\r\n  },');
  if (enCloseIdx < 0) throw new Error('Could not find en-block closer');
  const newEn = beforeZh.slice(0, enCloseIdx) + '\r\n' + enBlock + beforeZh.slice(enCloseIdx);

  // ZH block: find the zh: { block's terminating `  }\n};`
  const afterEn = src.slice(zhStartIdx);
  // Find `  }\n};` — the TRANSLATIONS const closer
  const translationsCloseIdx = afterEn.indexOf('\r\n  }\r\n};');
  // Also try non-CRLF in case one dict lost CRLF during a prior edit.
  if (translationsCloseIdx < 0) throw new Error('Could not find TRANSLATIONS closer');
  const newZh = afterEn.slice(0, translationsCloseIdx) + '\r\n' + zhBlock + afterEn.slice(translationsCloseIdx);

  const merged = newEn + newZh;
  fs.writeFileSync(absPath, merged);
  const added = EN_KEYS.length + ZH_KEYS.length;
  console.log(`[ok]   ${path.basename(absPath)} — inserted ${added} i18n keys (${EN_KEYS.length} EN + ${ZH_KEYS.length} zh-TW)`);
}

insertIntoFile(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'));
insertIntoFile(path.join(REPO_ROOT, 'FIRE-Dashboard.html'));
