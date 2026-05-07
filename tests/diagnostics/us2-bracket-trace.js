/**
 * us2-bracket-trace.js — actual per-year trace of bracket-fill-smoothed
 *
 * Inputs taken VERBATIM from the user's debug dump (image #11):
 *   fireAge=54, mode=Exact, objective="Pay less lifetime tax"
 *   Trad balance at FIRE = $521K (extrapolated from prior dump's age-53 row)
 *   endAge=100, MFJ 2024 brackets, standardDeduction=$30K (from dump's twStdDed)
 *
 * Reproduces the production cap from FIRE-Dashboard.html:10829-10841 line-by-line:
 *   targetBracketCap = (stdDed + top12) × (1 − safetyMargin)
 *   bracketHeadroom  = max(0, targetBracketCap − taxableSS − rmd)
 *   smoothedTarget   = max(0, pTrad − rmd) / yearsRemaining
 *   additionalTrad   = min(pTrad − rmd, bracketHeadroom, smoothedTarget)
 *
 * Run: node tests/diagnostics/us2-bracket-trace.js
 */
'use strict';

// User's scenario from the debug dump
const FIRE_AGE = 54;
const END_AGE = 100;
const STD_DED = 30000;       // dump's twStdDed
const TOP_12  = 94300;       // dump's twTop12
const TOP_22  = 201050;      // dump's twTop22
const SAFETY_MARGIN = 0.05;  // dump's safetyMargin
const SS_CLAIM_AGE = 70;
const SS_ANNUAL = 58896;     // age 70 in dump's lifecycle row
const REAL_RETURN_401K = 0.07 - 0.04;  // 3% real (return401k 7%, inflation 4%)
const RMD_START_AGE = 73;

// IRS Uniform Lifetime divisors (approximation — actual table is age-specific)
function rmdDivisor(age) {
  if (age < 73) return Infinity;
  if (age < 75) return 27.4 - (age - 73);
  if (age < 80) return 25.5 - (age - 75);
  if (age < 90) return 21.1 - (age - 80);
  return Math.max(8, 12.2 - (age - 90));
}

// MFJ 2024 ordinary bracket tax
function ordinaryTax(income) {
  const taxable = Math.max(0, income - STD_DED);
  let owed = 0;
  if (taxable > 0)         owed += Math.min(taxable, 23200) * 0.10;
  if (taxable > 23200)     owed += (Math.min(taxable, TOP_12) - 23200) * 0.12;
  if (taxable > TOP_12)    owed += (Math.min(taxable, TOP_22) - TOP_12) * 0.22;
  if (taxable > TOP_22)    owed += (taxable - TOP_22) * 0.24;
  return owed;
}

// Replicate the production smoothing cap from FIRE-Dashboard.html:10806-10842
// CRITICAL: Trad is INACCESSIBLE before age 59.5 (canAccess401k gate).
const UNLOCK_AGE = 59.5;
function bracketFillSmoothed(age, pTrad, ssIncome, rmd) {
  // Pre-unlock: Trad locked. wTrad = 0 regardless of bracket headroom.
  if (age < UNLOCK_AGE) {
    return {
      phase: 'pre-unlock',
      canAccess401k: false,
      bracketHeadroom: 0,
      smoothedTarget: 0,
      additionalTrad: 0,
      cap: 'PRE-UNLOCK (Trad inaccessible)',
    };
  }
  const taxableSS = ssIncome * 0.85;
  const targetBracketCap = (STD_DED + TOP_12) * (1 - SAFETY_MARGIN);
  const bracketHeadroom = Math.max(0, targetBracketCap - taxableSS - rmd);
  const yearsRemaining = Math.max(1, END_AGE - age);
  const smoothedTarget = Math.max(0, pTrad - rmd) / yearsRemaining;
  const additionalTrad = Math.min(
    Math.max(0, pTrad - rmd),
    bracketHeadroom,
    smoothedTarget,
  );
  return {
    phase: age >= 70 ? 'phase3 (SS active)' : 'phase2 (unlocked)',
    canAccess401k: true,
    bracketHeadroom: Math.round(bracketHeadroom),
    smoothedTarget: Math.round(smoothedTarget),
    additionalTrad: Math.round(additionalTrad),
    cap: smoothedTarget < bracketHeadroom ? 'smoothing' : 'bracket',
  };
}

// Estimate Trad balance at FIRE age 54 from accumulation (matches dump's age-53 = $521K).
// Use the dump's age-53 number directly: p401k=521,097.
let pTrad = 567430;  // dump shows age 54 (last accumulation year): 521097 → 567430 (1.07× growth + 23.5K + 7.2K contrib + 7% growth on $521K). For age 54 transition into retirement we use start-of-retirement balance.

console.log('SC-CHART-A — bracket-fill-smoothed per-year trace, fireAge=54');
console.log('='.repeat(105));
console.log('');
console.log('Constants used:');
console.log(`  STD_DED            = $${STD_DED.toLocaleString()}`);
console.log(`  TOP_12 (12% bracket) = $${TOP_12.toLocaleString()}`);
console.log(`  SAFETY_MARGIN      = ${SAFETY_MARGIN * 100}%`);
console.log(`  targetBracketCap   = (STD_DED + TOP_12) × (1 - SAFETY_MARGIN) = $${Math.round((STD_DED + TOP_12) * (1 - SAFETY_MARGIN)).toLocaleString()}`);
console.log(`  yearsRemaining at 55 = ${END_AGE - 55} = 45`);
console.log(`  smoothedTarget at 55 (pTrad=$${Math.round(pTrad).toLocaleString()}, RMD=$0) = $${Math.round(pTrad / 45).toLocaleString()}`);
console.log('');
console.log('Per-year trace (showing ONLY ages 55, 58, 60, 62, 65, 68, 70, 73, 80, 90):');
console.log('age | phase             | pTrad | bracketHeadroom | smoothedTarget | wTrad   | tax');
console.log('----+-------------------+-------+-----------------+----------------+---------+-------');

let totalTax = 0;
let totalTradWithdrawn = 0;

for (let age = 55; age <= 95; age++) {
  const ssIncome = age >= SS_CLAIM_AGE ? SS_ANNUAL : 0;
  const taxableSS = ssIncome * 0.85;
  const rmd = (age >= RMD_START_AGE) ? pTrad / rmdDivisor(age) : 0;
  const r = bracketFillSmoothed(age, pTrad, ssIncome, rmd);
  const wTrad = rmd + r.additionalTrad;
  const ordIncome = wTrad + taxableSS;
  const tax = ordinaryTax(ordIncome);
  totalTax += tax;
  totalTradWithdrawn += wTrad;

  if ([55, 58, 60, 62, 65, 68, 70, 73, 80, 90].includes(age)) {
    const phaseStr = r.phase.padEnd(17);
    const pTradStr = ('$' + Math.round(pTrad / 1000) + 'K').padStart(5);
    const headroomStr = (r.canAccess401k ? '$' + r.bracketHeadroom.toLocaleString() : '—').padStart(15);
    const smoothedStr = (r.canAccess401k ? '$' + r.smoothedTarget.toLocaleString() : '—').padStart(14);
    const wTradStr = ('$' + Math.round(wTrad).toLocaleString()).padStart(7);
    const taxStr = ('$' + Math.round(tax).toLocaleString()).padStart(6);
    console.log(`${age}  | ${phaseStr} | ${pTradStr} | ${headroomStr} | ${smoothedStr} | ${wTradStr} | ${taxStr}`);
  }

  // Update pTrad: subtract withdrawal, grow at real rate
  pTrad = Math.max(0, pTrad - wTrad) * (1 + REAL_RETURN_401K);
}

console.log('');
console.log('Cumulative across 55-95: Trad withdrawn ≈ $' + Math.round(totalTradWithdrawn / 1000) + 'K, federal tax ≈ $' + Math.round(totalTax / 1000) + 'K');
console.log('');
console.log('KEY INSIGHT:');
console.log('  Ages 55-59: Trad LOCKED (canAccess401k = age >= 59.5). wTrad = $0.');
console.log('               Spending funded entirely from Taxable + Cash + Roth.');
console.log('  Ages 60-69: Trad now accessible. smoothedTarget ($15-19K) << $30K std deduction');
console.log('               → Trad pulls fully shielded → $0 federal tax');
console.log('  Ages 70+:   Social Security ($50K taxable portion) stacks with Trad pulls');
console.log('               → ordinary income rises above $30K std ded → tax appears');
console.log('  → "fills 12% bracket" description is misleading: smoothedTarget cap dominates');
console.log('     for modest Trad balances spread over long retirements (your scenario)');
