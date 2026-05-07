/**
 * us2-counterfactual.js — analytical counterfactual harness (Path B).
 *
 * Feature: 026 US2 / FR-006 / SC-026-A.
 *
 * Path B rationale: the production calc layer has DOM-coupled inline logic
 * in FIRE-Dashboard.html (projectFullLifecycle, strategy ranker driver) that
 * exceeds reasonable porting effort for a research deliverable. Analytical
 * math captures the dominant economics:
 *   - Trad / Roth / Taxable pools as separate compounding buckets at one
 *     real-return rate.
 *   - MFJ 2024 federal brackets on ordinary + LTCG income.
 *   - "Leave-more-behind" approximation: drain Taxable + Cash first (LTCG only),
 *     then Roth (tax-free), then Trad as residual. SS at 67 reduces post-67 need.
 *   - Bracket-fill smoother (feature 007) approximated by capping Trad ordinary
 *     income at standardDeduction + top-of-12% bracket per draw year.
 *   - RMD enforcement at age 73+ via the IRS Uniform Lifetime divisor.
 *
 * Run: `node tests/diagnostics/us2-counterfactual.js`
 *
 * NOT part of `node --test`. Diagnostic only.
 */
'use strict';

const { SC_026_A } = require('./sc026a-counterfactual.js');

function applyMarginalBrackets(income, brackets) {
  if (income <= 0) return 0;
  let owed = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upperBound;
    if (income <= lower) break;
    const taxable = Math.min(income, upper) - lower;
    owed += taxable * b.rate;
    lower = upper;
  }
  return owed;
}

function ordinaryTaxMFJ(taxableOrdinary) {
  const deducted = Math.max(0, taxableOrdinary - SC_026_A.tax.standardDeductionMFJ);
  return applyMarginalBrackets(deducted, SC_026_A.tax.ordinaryBracketsMFJ);
}

function simulate({ realReturn, smooth }) {
  const f = SC_026_A;
  const defl = Math.pow(1.03, 11);
  let pTrad    = f.poolsAtFire.trad401k / defl;
  let pRoth    = f.poolsAtFire.roth401k / defl;
  let pTaxable = f.poolsAtFire.taxableStocks / defl;
  const spendReal = f.annualSpendReal;
  const ssRogerReal = f.ss.rogerAnnualReal;
  const ssRebeccaReal = f.ss.rebeccaAnnualReal;

  const rows = [];
  let lifetimeTaxReal = 0;

  for (let age = f.fireAge; age <= f.endAge; age++) {
    const ssActive = age >= f.ss.claimAgeRoger;
    const ssThisYear = ssActive ? (ssRogerReal + ssRebeccaReal) : 0;
    const ssTaxable = ssThisYear * 0.85;

    let needed = Math.max(0, spendReal - ssThisYear);
    let tradDraw = 0;
    let rothDraw = 0;
    let taxableDraw = 0;
    let ltcgRealized = 0;

    // Counterfactual smoothing pass (ages 65–68 only)
    let smoothExtra = 0;
    if (smooth && age >= f.smoothingWindow.effectiveRange.start &&
        age <= f.smoothingWindow.effectiveRange.end) {
      const draw = Math.min(f.smoothingWindow.perYearSmoothAmount, pTrad);
      tradDraw += draw;
      pTrad -= draw;
      smoothExtra = draw;
    }

    // Drain Taxable first (LTCG)
    if (needed > 0 && pTaxable > 0) {
      const take = Math.min(needed, pTaxable);
      taxableDraw = take;
      ltcgRealized = take * f.tax.ltcgGainPct;
      pTaxable -= take;
      needed -= take;
    }
    // Then Roth (tax-free)
    if (needed > 0 && pRoth > 0) {
      const take = Math.min(needed, pRoth);
      rothDraw = take;
      pRoth -= take;
      needed -= take;
    }
    // Then Trad (ordinary income); cap at top of 12% MFJ bracket
    if (needed > 0 && pTrad > 0) {
      const bfCap = f.tax.standardDeductionMFJ + 94_300;
      const remainingCap = Math.max(0, bfCap - tradDraw);
      const take = Math.min(needed, pTrad, Math.max(remainingCap, needed));
      tradDraw += take;
      pTrad -= take;
      needed -= take;
    }

    // RMD enforcement at age 73+
    if (age >= f.tax.rmdAgeStart && pTrad > 0) {
      const rmdDivisor = Math.max(8, 26.5 - (age - 73));
      const rmdMin = pTrad / rmdDivisor;
      if (tradDraw < rmdMin) {
        const extra = Math.min(rmdMin - tradDraw, pTrad);
        tradDraw += extra;
        pTrad -= extra;
        pTaxable += extra;
      }
    }

    // Tax computation
    const ordinaryIncome = tradDraw + ssTaxable;
    const ordTax = ordinaryTaxMFJ(ordinaryIncome);
    const ltcgTax = (ordinaryIncome + ltcgRealized > 94_000) ? ltcgRealized * 0.15 : 0;
    const yearTax = ordTax + ltcgTax;
    lifetimeTaxReal += yearTax;

    // Reinvest counterfactual after-tax residual
    if (smoothExtra > 0) {
      pTaxable += f.smoothingWindow.perYearAfterTaxResidual;
    }

    // Compound remaining pools
    pTrad    *= (1 + realReturn);
    pRoth    *= (1 + realReturn);
    pTaxable *= (1 + realReturn);

    const bvReal = pTrad + pRoth + pTaxable;
    const hasShortfall = needed > 0;

    rows.push({
      age,
      tradDraw: Math.round(tradDraw),
      ltcg: Math.round(ltcgRealized),
      rothDraw: Math.round(rothDraw),
      ssIncome: Math.round(ssThisYear),
      fedTax: Math.round(yearTax),
      effRate: ordinaryIncome + ltcgRealized > 0
        ? yearTax / (ordinaryIncome + ltcgRealized) : 0,
      bvReal: Math.round(bvReal),
      hasShortfall,
    });
  }

  return {
    rows,
    lifetimeTaxReal: Math.round(lifetimeTaxReal),
    terminalBVReal: Math.round(rows[rows.length - 1].bvReal),
    anyShortfall: rows.some(r => r.hasShortfall),
  };
}

const realReturns = [0.03, 0.05, 0.07];
const results = {};
for (const r of realReturns) {
  const cur = simulate({ realReturn: r, smooth: false });
  const cf  = simulate({ realReturn: r, smooth: true });
  const nomScale = Math.pow(1.03, 11);
  results[r] = {
    current: cur,
    counterfactual: cf,
    deltaLifetimeTaxNominal: Math.round((cf.lifetimeTaxReal - cur.lifetimeTaxReal) * nomScale),
    deltaTerminalBVNominal: Math.round((cf.terminalBVReal - cur.terminalBVReal) * nomScale),
  };
}

function printRows(label, rows) {
  console.log('\n=== ' + label + ' ===');
  console.log('age | TradDraw | LTCG | RothDraw | SS | FedTax | EffRate | BV remain | shortfall');
  console.log('----+----------+------+----------+----+--------+---------+-----------+----------');
  for (const r of rows) {
    if ([53, 60, 65, 67, 68, 69, 73, 80, 90, 95].includes(r.age)) {
      console.log(
        String(r.age).padStart(3) + ' | ' +
        String(r.tradDraw).padStart(8) + ' | ' +
        String(r.ltcg).padStart(4) + ' | ' +
        String(r.rothDraw).padStart(8) + ' | ' +
        String(r.ssIncome).padStart(2) + ' | ' +
        String(r.fedTax).padStart(6) + ' | ' +
        (r.effRate * 100).toFixed(1).padStart(6) + '% | ' +
        String(r.bvReal).padStart(9) + ' | ' +
        r.hasShortfall
      );
    }
  }
}

console.log('SC-026-A Counterfactual Harness — Path B (analytical)');
console.log('=====================================================\n');
console.log('Fixture summary:');
console.log('  fireAge=' + SC_026_A.fireAge + ', mode=' + SC_026_A.fireMode +
  ', objective=' + SC_026_A.withdrawalObjective);
console.log('  Pools at FIRE (real $): Trad $' +
  Math.round(SC_026_A.poolsAtFire.trad401k / 1.38423).toLocaleString() +
  ', Roth $' + Math.round(SC_026_A.poolsAtFire.roth401k / 1.38423).toLocaleString() +
  ', Taxable $' + Math.round(SC_026_A.poolsAtFire.taxableStocks / 1.38423).toLocaleString());
console.log('  Annual spend (real $): $' + SC_026_A.annualSpendReal.toLocaleString());

printRows('Current "leave-more-behind" @ 5% real',     results[0.05].current.rows);
printRows('Counterfactual "10%-smoothed" @ 5% real',   results[0.05].counterfactual.rows);

console.log('\n=== Delta tables ===');
console.log('Real return | Lifetime tax delta (nominal $) | Terminal BV delta (nominal $)');
console.log('------------+--------------------------------+------------------------------');
for (const r of realReturns) {
  const d = results[r];
  console.log(
    (r * 100).toFixed(0).padStart(2) + '%         | ' +
    String(d.deltaLifetimeTaxNominal).padStart(30) + ' | ' +
    String(d.deltaTerminalBVNominal).padStart(28)
  );
}

console.log('\n=== Recommendation ===');
const delta5 = Math.abs(results[0.05].deltaLifetimeTaxNominal);
if (delta5 < 5000) {
  console.log('KEEP — lifetime-tax delta at 5% real is $' + delta5 + ' < $5K SC-005 threshold.');
} else {
  console.log('CHANGE-SPEC-027 candidate — lifetime-tax delta $' + delta5 + ' >= $5K threshold.');
}
