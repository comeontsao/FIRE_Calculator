// Extract the per-strategy simulation block out of scoreAndRank into a helper
// fn `_simulateStrategyLifetime`, then wrap TAX_OPTIMIZED_SEARCH with an
// 11-point θ-sweep in scoreAndRank. Applied to both HTML files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Find the "results = strategies.map" block and replace with the sweep-aware
// variant. The old block starts at `const results = strategies.map(strategy => {`
// and ends at `}); // end strategies.map`. We replace with:
//   function _simulateStrategyLifetime(strategy, bfOptsForStrategy) { ...same body... }
//   const results = strategies.map(strategy => {
//     if (strategy.id !== 'tax-optimized-search') return _simulateStrategyLifetime(strategy, bfOpts);
//     // Sweep θ for tax-optimized-search
//     let best = null;
//     for (let i = 0; i <= 10; i++) {
//       const theta = i / 10;
//       const bfOptsTheta = Object.assign({}, bfOpts, { _theta: theta });
//       const r = _simulateStrategyLifetime(strategy, bfOptsTheta);
//       if (!best || r.lifetimeFederalTaxReal < best.lifetimeFederalTaxReal) best = r;
//     }
//     return best;
//   });

const OLD_OPEN = 'const results = strategies.map(strategy => {';
const NEW_BLOCK = `// Extract per-strategy lifetime simulation into a helper so TAX_OPTIMIZED_SEARCH
  // can invoke it multiple times (once per θ) to find the tax-minimizing θ.
  function _simulateStrategyLifetime(strategy, bfOptsForStrategy) {`;

const OLD_CLOSE = /\}\);\s*\r?\n\s*return rankByObjective\(results, objective \|\| 'leave-more-behind'\);/;
const NEW_CLOSE = `}

  const results = strategies.map(strategy => {
    if (strategy.id !== 'tax-optimized-search') {
      return _simulateStrategyLifetime(strategy, bfOpts);
    }
    // 11-point θ-sweep: try θ ∈ {0, 0.1, ..., 1.0}, pick the one that minimizes
    // lifetime federal tax (research.md §Decision 2). Tie-break by higher
    // end-of-plan net worth so we don't pick a θ that minimizes tax by going
    // infeasible.
    let best = null;
    for (let i = 0; i <= 10; i++) {
      const theta = i / 10;
      const bfOptsTheta = Object.assign({}, bfOpts, { _theta: theta });
      const r = _simulateStrategyLifetime(strategy, bfOptsTheta);
      // Prefer feasible; then minimize tax; break ties by higher end balance.
      if (!best) { best = r; continue; }
      if (r.feasibleUnderCurrentMode && !best.feasibleUnderCurrentMode) { best = r; continue; }
      if (!r.feasibleUnderCurrentMode && best.feasibleUnderCurrentMode) continue;
      if (r.lifetimeFederalTaxReal < best.lifetimeFederalTaxReal - 100) { best = r; continue; }
      if (Math.abs(r.lifetimeFederalTaxReal - best.lifetimeFederalTaxReal) <= 100 &&
          r.endOfPlanNetWorthReal > best.endOfPlanNetWorthReal + 1000) { best = r; }
    }
    return best;
  });
  return rankByObjective(results, objective || 'leave-more-behind');`;

// Also we need to insert the bfOpts parameter into the helper (currently the inner
// block references outer `bfOpts`; we pass bfOptsForStrategy instead).
// And the inner block reads bfOpts directly for the context — swap that one reference.

function patchFile(absPath) {
  let src = fs.readFileSync(absPath, 'utf8');
  if (src.includes('_simulateStrategyLifetime')) {
    console.log(`[skip] ${path.basename(absPath)} — already patched`);
    return;
  }
  const openIdx = src.indexOf(OLD_OPEN);
  if (openIdx < 0) throw new Error(`opening marker not found in ${path.basename(absPath)}`);
  // Replace the opening with the helper-function wrapper. Keep body verbatim.
  src = src.replace(OLD_OPEN, NEW_BLOCK);
  // Inside the function body we reference `bfOpts` and the outer iter var `strategy`.
  // Strategy is still passed as a param; bfOpts is now `bfOptsForStrategy`.
  // Swap just the ctx creation to use bfOptsForStrategy.
  src = src.replace(
    'const mix = strategy.computePerYearMix(ctx);',
    "const ctxThisYear = Object.assign({}, ctx, { bfOpts: bfOptsForStrategy });\n      const mix = strategy.computePerYearMix(ctxThisYear);"
  );
  // Replace `bfOpts,` inside the ctx literal with `bfOpts: bfOptsForStrategy,`
  src = src.replace(
    /const ctx = \{[\s\S]{0,500}?bfOpts,/,
    (m) => m.replace('bfOpts,', 'bfOpts: bfOptsForStrategy,')
  );
  // Replace the closing }); return rankByObjective(...); block with NEW_CLOSE.
  src = src.replace(OLD_CLOSE, NEW_CLOSE);
  fs.writeFileSync(absPath, src);
  console.log(`[ok]   ${path.basename(absPath)} — θ-sweep patch applied`);
}

patchFile(path.join(REPO_ROOT, 'FIRE-Dashboard-Generic.html'));
patchFile(path.join(REPO_ROOT, 'FIRE-Dashboard.html'));
