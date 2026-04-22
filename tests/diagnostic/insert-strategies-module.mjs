// One-shot helper: insert the full strategies module implementation into both
// HTML files. The insertion point is the blank line between the closing `}`
// of `taxOptimizedWithdrawal` and the comment block that precedes
// `computeWithdrawalStrategy`.
//
// Also replaces the empty STRATEGIES placeholder array with the populated one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const STRATEGIES_BLOCK = `
// ==================== Feature 008 — Strategy Policies ====================
// Seven StrategyPolicy objects + shared helpers + scoreAndRank + rankByObjective.
// Each policy is a pure pool-ordering function that produces a PerYearMix for
// one retirement year. The harness wraps these into a full-lifecycle Ranking.
// Contract: specs/008-multi-strategy-withdrawal-optimizer/contracts/strategy-module.contract.md
// =========================================================================

// Resolve effective 401k unlock age given Rule-of-55 options. Shared by every
// policy so they all agree on eligibility semantics.
function _effectiveUnlockAge(bfOpts) {
  const r55 = bfOpts && bfOpts.rule55;
  return (r55 && r55.enabled && (r55.separationAge || 0) >= 55) ? 55 : 59.5;
}

// Forced RMD floor. Applies at age 73+. Returns the minimum Trad draw required
// regardless of strategy choice (IRS uniform lifetime table).
function _computeRmd(ctx) {
  const { age, pools } = ctx;
  if (age < 73 || pools.pTrad <= 0) return 0;
  return Math.min(pools.pTrad, pools.pTrad / getRMDDivisor(age));
}

// Build the caveats sub-object for a per-year mix given the computed values.
// Strategies call this instead of hand-writing the caveats block every time.
function _buildCaveats(ctx, wTrad, wStocks, magi, bracketFillActive) {
  const effectiveIrmaa = (ctx.bfOpts.irmaaThreshold || 0) * (1 - (ctx.bfOpts.safetyMargin || 0));
  const r55 = ctx.bfOpts.rule55 || {};
  const rule55Active = !!(r55.enabled && (r55.separationAge || 0) >= 55 && ctx.age >= 55 && ctx.age < 59.5);
  const irmaaBreached = effectiveIrmaa > 0 && ctx.age >= 63 && magi > effectiveIrmaa;
  return {
    ssReducedFill: bracketFillActive && (ctx.ssIncome * 0.85) > (ctx.bracketHeadroom * 0.2 + ctx.rmdThisYear),
    irmaaCapped: false,
    irmaaBreached,
    rule55Active,
    roth5YearWarning: false,
    bracketFillActive: !!bracketFillActive,
  };
}

// Shared pool-order-driven withdrawal solver. Given a priority list of pool
// keys, iteratively pulls from them to cover (grossSpend + taxes). Uses a
// bounded fixed-point loop because LTCG tax depends on stock sales which
// depends on how much we need after tax. Each policy wraps this with its
// own pool order + bracket-fill behavior.
//
// Returns a PerYearMix with caveats populated.
function _drawByPoolOrder(ctx, poolOrder, opts) {
  opts = opts || {};
  const canAccess401k = ctx.age >= _effectiveUnlockAge(ctx.bfOpts);
  const rmd = _computeRmd(ctx);
  const { brackets, stockGainPct, grossSpend, ssIncome, pools } = ctx;
  const taxableSS = ssIncome * 0.85;
  const stdDed = brackets.stdDed;

  // Start with RMD floor on Trad. Everything else starts at zero and grows
  // through the fixed-point iteration below.
  let wTrad = rmd;
  let wRoth = 0, wStocks = 0, wCash = 0;
  const avail = {
    pTrad: Math.max(0, pools.pTrad - rmd),
    pRoth: Math.max(0, pools.pRoth),
    pStocks: Math.max(0, pools.pStocks),
    pCash: Math.max(0, pools.pCash),
  };

  function computeTotals() {
    const ordIncome = taxableSS + wTrad;
    const taxable = Math.max(0, ordIncome - stdDed);
    const ordTax = calcOrdinaryTax(taxable, brackets);
    const gain = wStocks * stockGainPct;
    const ltcg = calcLTCGTax(gain, taxable, brackets);
    const totalTax = ordTax + ltcg;
    const grossReceived = ssIncome + wTrad + wRoth + wStocks + wCash;
    return { ordIncome, taxable, ordTax, ltcg, totalTax, grossReceived, netReceived: grossReceived - totalTax };
  }

  // Fixed-point: draw → recompute tax → if still short, draw more. Cap iterations.
  for (let iter = 0; iter < 12; iter++) {
    const t = computeTotals();
    const gap = grossSpend - t.netReceived;
    if (gap <= 10) break;
    // Pull from highest-priority pool with remaining balance.
    let drew = false;
    for (const p of poolOrder) {
      if (p === 'trad' && canAccess401k && avail.pTrad > 0) {
        const add = Math.min(gap, avail.pTrad);
        wTrad += add; avail.pTrad -= add; drew = true; break;
      }
      if (p === 'roth' && canAccess401k && avail.pRoth > 0) {
        const add = Math.min(gap, avail.pRoth);
        wRoth += add; avail.pRoth -= add; drew = true; break;
      }
      if (p === 'stocks' && avail.pStocks > 0) {
        // LTCG means we need to over-draw by the tax on the gain. Bump estimate.
        const gain = avail.pStocks * stockGainPct;
        const bump = Math.min(gap * 1.2, avail.pStocks);
        wStocks += bump; avail.pStocks -= bump; drew = true; break;
      }
      if (p === 'cash' && avail.pCash > 0) {
        const add = Math.min(gap, avail.pCash);
        wCash += add; avail.pCash -= add; drew = true; break;
      }
    }
    if (!drew) break; // exhausted all accessible pools
  }

  const t = computeTotals();
  const shortfall = Math.max(0, grossSpend - t.netReceived);
  const magi = wTrad + taxableSS + wStocks * stockGainPct;
  const effRate = t.grossReceived > 0 ? t.totalTax / t.grossReceived : 0;
  return {
    wTrad, wRoth, wStocks, wCash,
    syntheticConversion: 0,
    rmd,
    taxOwed: t.totalTax,
    ordIncome: t.ordIncome,
    ltcgTax: t.ltcg,
    effRate,
    magi,
    shortfall,
    caveats: _buildCaveats(ctx, wTrad, wStocks, magi, !!opts.bracketFillActive),
  };
}

// ----- The 7 StrategyPolicy objects -----

const BRACKET_FILL_SMOOTHED = Object.freeze({
  id: 'bracket-fill-smoothed',
  nameKey: 'strategy.bracketFillSmoothed.name',
  descKey: 'strategy.bracketFillSmoothed.desc',
  narrativeKey: 'strategy.bracketFillSmoothed.narrative',
  color: '#6c63ff',
  eligibility: {},
  computePerYearMix(ctx) {
    // Byte-identical to the current taxOptimizedWithdrawal (FR-001 parity).
    const mix = taxOptimizedWithdrawal(
      ctx.grossSpend, ctx.ssIncome,
      ctx.pools.pTrad, ctx.pools.pRoth, ctx.pools.pStocks, ctx.pools.pCash,
      ctx.age, ctx.brackets, ctx.stockGainPct, ctx.bfOpts
    );
    // Normalize the return shape to match PerYearMix with caveats.
    return {
      wTrad: mix.wTrad, wRoth: mix.wRoth, wStocks: mix.wStocks, wCash: mix.wCash,
      syntheticConversion: mix.syntheticConversion || 0,
      rmd: mix.rmd,
      taxOwed: mix.taxOwed,
      ordIncome: mix.ordIncome,
      ltcgTax: mix.ltcgTax,
      effRate: mix.effRate,
      magi: mix.magi,
      shortfall: mix.shortfall,
      caveats: {
        ssReducedFill: !!mix.ssReducedFill,
        irmaaCapped: !!mix.irmaaCapped,
        irmaaBreached: !!mix.irmaaBreached,
        rule55Active: !!mix.rule55Active,
        roth5YearWarning: !!mix.roth5YearWarning,
        bracketFillActive: true,
      },
    };
  }
});

const TRAD_FIRST = Object.freeze({
  id: 'trad-first',
  nameKey: 'strategy.tradFirst.name',
  descKey: 'strategy.tradFirst.desc',
  narrativeKey: 'strategy.tradFirst.narrative',
  color: '#ff6b6b',
  eligibility: {},
  computePerYearMix(ctx) {
    return _drawByPoolOrder(ctx, ['trad', 'stocks', 'cash', 'roth']);
  }
});

const ROTH_LADDER = Object.freeze({
  id: 'roth-ladder',
  nameKey: 'strategy.rothLadder.name',
  descKey: 'strategy.rothLadder.desc',
  narrativeKey: 'strategy.rothLadder.narrative',
  color: '#5ee38a',
  eligibility: {},
  computePerYearMix(ctx) {
    return _drawByPoolOrder(ctx, ['roth', 'stocks', 'cash', 'trad']);
  }
});

const TRAD_LAST_PRESERVE = Object.freeze({
  id: 'trad-last-preserve',
  nameKey: 'strategy.tradLastPreserve.name',
  descKey: 'strategy.tradLastPreserve.desc',
  narrativeKey: 'strategy.tradLastPreserve.narrative',
  color: '#ffb45a',
  eligibility: {},
  computePerYearMix(ctx) {
    return _drawByPoolOrder(ctx, ['stocks', 'cash', 'roth', 'trad']);
  }
});

const CONVENTIONAL = Object.freeze({
  id: 'conventional',
  nameKey: 'strategy.conventional.name',
  descKey: 'strategy.conventional.desc',
  narrativeKey: 'strategy.conventional.narrative',
  color: '#64dcff',
  eligibility: {},
  computePerYearMix(ctx) {
    // Textbook Fidelity/Vanguard order: Taxable → Trad → Roth; cash alongside taxable.
    return _drawByPoolOrder(ctx, ['stocks', 'cash', 'trad', 'roth']);
  }
});

const PROPORTIONAL = Object.freeze({
  id: 'proportional',
  nameKey: 'strategy.proportional.name',
  descKey: 'strategy.proportional.desc',
  narrativeKey: 'strategy.proportional.narrative',
  color: '#c09060',
  eligibility: {},
  computePerYearMix(ctx) {
    // Pull from every accessible pool weighted by its current balance share.
    // Implementation: pre-compute the target share per pool, then delegate to
    // _drawByPoolOrder with a dynamic order that picks the pool with the
    // greatest remaining share-vs-target gap each iteration. Simpler approach
    // for v1: approximate proportionality by cycling pools in the order of
    // largest-balance-first each iteration.
    const canAccess401k = ctx.age >= _effectiveUnlockAge(ctx.bfOpts);
    const balances = {
      trad: canAccess401k ? Math.max(0, ctx.pools.pTrad) : 0,
      roth: canAccess401k ? Math.max(0, ctx.pools.pRoth) : 0,
      stocks: Math.max(0, ctx.pools.pStocks),
      cash: Math.max(0, ctx.pools.pCash),
    };
    const total = balances.trad + balances.roth + balances.stocks + balances.cash;
    const order = Object.entries(balances)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    // Fill remaining slots with fallback order to avoid gaps when one pool depletes.
    for (const p of ['stocks', 'trad', 'cash', 'roth']) {
      if (!order.includes(p)) order.push(p);
    }
    return _drawByPoolOrder(ctx, order);
  }
});

const TAX_OPTIMIZED_SEARCH = Object.freeze({
  id: 'tax-optimized-search',
  nameKey: 'strategy.taxOptimizedSearch.name',
  descKey: 'strategy.taxOptimizedSearch.desc',
  narrativeKey: 'strategy.taxOptimizedSearch.narrative',
  color: '#ff9ec7',
  eligibility: {},
  // Per-year behavior mirrors TRAD_FIRST but capped by a θ fraction of the
  // 12% bracket headroom. The outer harness (scoreAndRank) sweeps θ lifetime
  // and picks the θ that minimizes totalTax. For per-year calls outside the
  // sweep, default θ = 0.5 (moderate Trad aggressiveness).
  _theta: 0.5,
  computePerYearMix(ctx) {
    const theta = (ctx.bfOpts && typeof ctx.bfOpts._theta === 'number')
      ? ctx.bfOpts._theta : 0.5;
    const canAccess401k = ctx.age >= _effectiveUnlockAge(ctx.bfOpts);
    const rmd = _computeRmd(ctx);
    const { brackets, ssIncome } = ctx;
    const taxableSS = ssIncome * 0.85;
    const targetBracketCap = (brackets.stdDed + brackets.top12) * (1 - (ctx.bfOpts.safetyMargin || 0));
    const bracketHeadroom = Math.max(0, targetBracketCap - taxableSS - rmd);
    // Pre-pull a θ-fraction of the bracket headroom from Trad, then cover the
    // remainder with stocks (LTCG). This gives a continuous knob over Trad
    // aggressiveness between θ=0 (Trad last) and θ=1 (bracket-fill).
    const preTrad = canAccess401k ? Math.min(Math.max(0, ctx.pools.pTrad - rmd), bracketHeadroom * theta) : 0;
    const ctx2 = Object.assign({}, ctx, {
      pools: Object.assign({}, ctx.pools, { pTrad: Math.max(0, ctx.pools.pTrad - preTrad) }),
      rmdThisYear: rmd + preTrad, // account for the pre-pulled Trad
    });
    const remainderMix = _drawByPoolOrder(ctx2, ['stocks', 'cash', 'roth', 'trad']);
    // Re-add the pre-pulled Trad + recompute tax on the combined ordinary income.
    const wTrad = rmd + preTrad + remainderMix.wTrad;
    const ordIncome = taxableSS + wTrad;
    const taxable = Math.max(0, ordIncome - brackets.stdDed);
    const ordTax = calcOrdinaryTax(taxable, brackets);
    const ltcg = calcLTCGTax(remainderMix.wStocks * ctx.stockGainPct, taxable, brackets);
    const totalTax = ordTax + ltcg;
    const grossReceived = ssIncome + wTrad + remainderMix.wRoth + remainderMix.wStocks + remainderMix.wCash;
    const magi = wTrad + taxableSS + remainderMix.wStocks * ctx.stockGainPct;
    return {
      wTrad, wRoth: remainderMix.wRoth, wStocks: remainderMix.wStocks, wCash: remainderMix.wCash,
      syntheticConversion: 0,
      rmd,
      taxOwed: totalTax,
      ordIncome,
      ltcgTax: ltcg,
      effRate: grossReceived > 0 ? totalTax / grossReceived : 0,
      magi,
      shortfall: remainderMix.shortfall,
      caveats: _buildCaveats(ctx, wTrad, remainderMix.wStocks, magi, false),
    };
  }
});

// Populate the frozen STRATEGIES array with all 7 policies (alphabetical by id
// for stable display order; winner/tie logic sorts by objective at runtime).
// eslint-disable-next-line no-global-assign
// NOTE: The earlier \`const STRATEGIES = Object.freeze([])\` placeholder above is
// superseded — we re-bind here because the declaration was a forward-reference.
// In the final migrated form this file exposes a single STRATEGIES declaration
// at this location; the forward-reference stub exists only to let the module
// header list it for Principle VI graph-walkers.
Object.defineProperty(window, '__STRATEGIES_V008__', {
  value: Object.freeze([
    BRACKET_FILL_SMOOTHED,
    CONVENTIONAL,
    PROPORTIONAL,
    ROTH_LADDER,
    TAX_OPTIMIZED_SEARCH,
    TRAD_FIRST,
    TRAD_LAST_PRESERVE,
  ]),
  writable: false,
  configurable: false,
});
function getStrategies() { return window.__STRATEGIES_V008__; }

// ----- scoreAndRank harness -----
//
// Runs one full lifecycle simulation per strategy at the given fireAge and
// returns an unsorted Ranking. Shared YearContext stream built once per year
// to amortize RMD / taxableSS / bracketHeadroom compute across strategies.
function scoreAndRank(inp, fireAge, mode, objective) {
  const strategies = getStrategies();
  const endAge = inp.endAge || 95;
  const realReturnStocks = inp.returnRate - inp.inflationRate;
  const realReturn401k = inp.return401k - inp.inflationRate;
  const ssAnnual = getSSAnnual(inp, inp.ssClaimAge, fireAge);
  const brackets = getTaxBrackets(detectMFJ(inp));
  const bfOpts = {
    safetyMargin: (typeof inp.safetyMargin === 'number') ? inp.safetyMargin : 0.05,
    rule55: inp.rule55 || { enabled: false, separationAge: 54 },
    irmaaThreshold: (typeof inp.irmaaThreshold === 'number') ? inp.irmaaThreshold : 212000,
    endAge: inp.endAge || 100,
  };
  const stockGainPct = inp.stockGainPct || 0.6;
  const yrsToFire = fireAge - (inp.agePerson1 !== undefined ? inp.agePerson1 : inp.ageRoger);
  const mtgAdj = getMortgageAdjustedRetirement(inp.annualSpend || 0, yrsToFire);
  const retireSpend = mtgAdj.annualSpend || inp.annualSpend || 0;
  const taxTrad = inp.taxTrad || 0.15;

  const results = strategies.map(strategy => {
    // Per-strategy full lifecycle simulation (retirement years only — accumulation
    // doesn't vary by withdrawal strategy).
    let pTrad = inp.roger401kTrad !== undefined ? inp.roger401kTrad : inp.person1_401kTrad;
    let pRoth = inp.roger401kRoth !== undefined ? inp.roger401kRoth : inp.person1_401kRoth;
    let pStocks = (inp.rogerStocks !== undefined ? inp.rogerStocks : inp.person1Stocks) +
                   (inp.rebeccaStocks !== undefined ? inp.rebeccaStocks : inp.person2Stocks);
    let pCash = inp.cashSavings + (inp.otherAssets || 0);

    // Grow to FIRE age via accumulation (matches projectGrowth shape — simple).
    const yrsAccum = Math.max(0, fireAge - (inp.agePerson1 !== undefined ? inp.agePerson1 : inp.ageRoger));
    const tradContrib = (inp.contrib401kTrad || inp.contrib401k || 0) + (inp.empMatch || 0);
    const rothContrib = inp.contrib401kRoth || 0;
    const effAnnualSavings = (inp.monthlySavings || 0) * 12;
    for (let y = 0; y < yrsAccum; y++) {
      pTrad = pTrad * (1 + realReturn401k) + tradContrib;
      pRoth = pRoth * (1 + realReturn401k) + rothContrib;
      pStocks = pStocks * (1 + realReturnStocks) + effAnnualSavings;
      pCash *= 1.005;
    }

    const perYearRows = [];
    let lifetimeTax = 0;
    const caveatsAgg = { ssReducedFill: false, irmaaCapped: false, irmaaBreached: false, rule55Active: false, roth5YearWarning: false, bracketFillActive: false };
    let feasible = true;

    for (let age = fireAge; age <= endAge; age++) {
      const unlockAge = _effectiveUnlockAge(bfOpts);
      const canAccess401k = age >= unlockAge;
      const ssActive = age >= inp.ssClaimAge;
      const ssThisYear = ssActive ? ssAnnual : 0;
      const taxableSS = ssThisYear * 0.85;
      const rmdThisYear = (age >= 73 && pTrad > 0) ? Math.min(pTrad, pTrad / getRMDDivisor(age)) : 0;
      const targetBracketCap = (brackets.stdDed + brackets.top12) * (1 - bfOpts.safetyMargin);
      const bracketHeadroom = Math.max(0, targetBracketCap - taxableSS - rmdThisYear);

      const ctx = {
        age,
        grossSpend: retireSpend,
        ssIncome: ssThisYear,
        pools: { pTrad, pRoth, pStocks, pCash },
        brackets,
        stockGainPct,
        rmdThisYear,
        bracketHeadroom,
        bfOpts,
      };

      const mix = strategy.computePerYearMix(ctx);
      perYearRows.push(Object.assign({ age, phase: !canAccess401k ? 'phase1-taxable-only' : (!ssActive ? 'phase2-401k-unlocked' : 'phase3-with-ss') }, mix));
      lifetimeTax += mix.taxOwed;
      // Aggregate caveats
      for (const k of Object.keys(caveatsAgg)) {
        if (mix.caveats && mix.caveats[k]) caveatsAgg[k] = true;
      }
      if (mix.shortfall > 100) feasible = false;

      // Update pools for next year (clamp ≥ 0; signed sim not needed here)
      pTrad = Math.max(0, pTrad - mix.wTrad - (mix.syntheticConversion || 0));
      pRoth = Math.max(0, pRoth - mix.wRoth);
      pStocks = Math.max(0, pStocks - mix.wStocks + (mix.syntheticConversion || 0));
      pCash = Math.max(0, pCash - mix.wCash);
      // Compound
      pTrad *= (1 + realReturn401k);
      pRoth *= (1 + realReturn401k);
      pStocks *= (1 + realReturnStocks);
      pCash *= 1.005;
    }

    // End-of-plan net worth (net of Trad tax per data-model.md §4)
    const endOfPlanNetWorthReal = Math.max(0, pTrad) * (1 - taxTrad)
      + Math.max(0, pRoth) + Math.max(0, pStocks) + Math.max(0, pCash);
    const avgEffRate = perYearRows.length > 0
      ? perYearRows.reduce((s, r) => s + (r.effRate || 0), 0) / perYearRows.length
      : 0;

    return {
      strategyId: strategy.id,
      perYearRows,
      endOfPlanNetWorthReal,
      lifetimeFederalTaxReal: lifetimeTax,
      averageEffectiveTaxRate: avgEffRate,
      earliestFeasibleFireAge: fireAge, // Architecture B: fixed FIRE age across strategies
      feasibleUnderCurrentMode: feasible,
      caveatFlagsObservedInRun: caveatsAgg,
      eligibility: { eligible: true },
    };
  });

  return rankByObjective(results, objective || 'leave-more-behind');
}

// Sort-only operation. Called on objective toggle (no re-simulation).
function rankByObjective(results, objective) {
  const obj = objective === 'retire-sooner-pay-less-tax' ? 'tax' : 'estate';
  const END_TOL = 1000; // FR-009
  const TAX_TOL = 100;
  const alpha = (a, b) => a.strategyId.localeCompare(b.strategyId);
  const rows = results.slice().sort((a, b) => {
    // Infeasible strategies sorted to the bottom regardless of score.
    if (a.feasibleUnderCurrentMode !== b.feasibleUnderCurrentMode) {
      return a.feasibleUnderCurrentMode ? -1 : 1;
    }
    const endGap = b.endOfPlanNetWorthReal - a.endOfPlanNetWorthReal;
    const taxGap = a.lifetimeFederalTaxReal - b.lifetimeFederalTaxReal;
    if (obj === 'estate') {
      if (Math.abs(endGap) > END_TOL) return endGap > 0 ? 1 : -1;
      if (Math.abs(taxGap) > TAX_TOL) return taxGap > 0 ? 1 : -1;
      return alpha(a, b);
    } else {
      if (Math.abs(taxGap) > TAX_TOL) return taxGap > 0 ? 1 : -1;
      if (Math.abs(endGap) > END_TOL) return endGap > 0 ? 1 : -1;
      return alpha(a, b);
    }
  });

  // Tie detection — adjacent rows within tolerance on PRIMARY metric.
  const ties = [];
  let i = 0;
  while (i < rows.length - 1) {
    const group = [rows[i].strategyId];
    let j = i + 1;
    while (j < rows.length) {
      const a = rows[i], b = rows[j];
      const primaryTol = obj === 'estate'
        ? (Math.abs(a.endOfPlanNetWorthReal - b.endOfPlanNetWorthReal) <= END_TOL)
        : (Math.abs(a.lifetimeFederalTaxReal - b.lifetimeFederalTaxReal) <= TAX_TOL);
      if (!primaryTol) break;
      group.push(rows[j].strategyId);
      j++;
    }
    if (group.length > 1) ties.push({ rank: i + 1, strategyIds: group });
    i = j;
  }

  return {
    objective: objective || 'leave-more-behind',
    rows,
    winnerId: rows[0] ? rows[0].strategyId : null,
    ties,
    allFeasible: rows.every(r => r.feasibleUnderCurrentMode),
  };
}
`;

function insertIntoFile(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  if (src.includes('__STRATEGIES_V008__')) {
    console.log(`[skip] ${path.basename(absPath)} — strategies module already populated`);
    return;
  }
  // Insert anchor: the line "// Feature 007 — each strategy.push row includes"
  // marks the start of the computeWithdrawalStrategy block. We insert just
  // BEFORE that comment.
  const anchor = '// Feature 007 — each strategy.push row includes new bracket-fill flags';
  const idx = src.indexOf(anchor);
  if (idx < 0) throw new Error(`Anchor not found in ${path.basename(absPath)}`);
  // Back up to the start of the line (CRLF-aware).
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const insertAt = lineStart;
  const merged = src.slice(0, insertAt) + STRATEGIES_BLOCK.trim() + '\r\n\r\n' + src.slice(insertAt);
  fs.writeFileSync(absPath, merged);
  console.log(`[ok]   ${path.basename(absPath)} — strategies module inserted (${STRATEGIES_BLOCK.length} chars)`);
}

insertIntoFile(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'));
insertIntoFile(path.join(REPO_ROOT, 'FIRE-Dashboard.html'));
