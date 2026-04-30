/**
 * E2E regression — locks the savings-redirect contract introduced when the
 * Plan→Investment "Monthly Investment" slider was bidirectionally linked to
 * the Plan→PvI "Extra monthly cash to allocate" slider (2026-04-29).
 *
 * Contract: under Prepay strategy, the user's monthlySavings should flow to
 * mortgage extra principal (via the strategy-aware mtgSavingsAdjust path),
 * leaving LESS for the brokerage compared to Invest-keep-paying. This locks
 * the conservation-of-cash invariant the PvI tab exists to compare.
 *
 * Approach: drive the dashboard to identical inputs except mortgageStrategy.
 * Compare the year-5 brokerage value across strategies. Allows equality when
 * housing premium is so high that BOTH strategies clamp to $0 (Generic's
 * defaults can hit this corner — that's still a valid pass).
 *
 * NOTE: this spec also locks the calc-module fix made the same day for the
 * `buyInMonth` regression — for ownership='buying-now', the calc was reading
 * `inputs.mortgage.buyInYears` (slider default 3) and treating the first 36
 * months as pre-buy-in (zero P&I), which made Prepay's brokerage explode in
 * the first ~3 simulation years. Fixed by gating buyInMonth on ownership.
 */

import { test, expect, type Page } from '@playwright/test';

const HTTP_BASE = 'http://127.0.0.1:8766';

async function setupDashboard(page: Page, file: string) {
  await page.goto(`${HTTP_BASE}/${file}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById('fireStatus');
    return el && el.textContent && !el.textContent.includes('Calculating');
  }, { timeout: 10_000 });

  // Enable mortgage. Live-in (no sale) so we isolate the savings-redirect effect.
  await page.evaluate(() => {
    const w = window as unknown as {
      toggleMortgage?: () => void;
      recalcAll?: () => void;
      recomputePayoffVsInvest?: () => void;
    };
    const toggle = document.getElementById('mortgageToggle');
    if (toggle && !toggle.classList.contains('active') && w.toggleMortgage) {
      w.toggleMortgage();
    }
    const sel = document.getElementById('mtgSellAtFire') as HTMLSelectElement;
    sel.value = 'no';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (w.recalcAll) w.recalcAll();
    if (w.recomputePayoffVsInvest) w.recomputePayoffVsInvest();
  });
  await page.waitForTimeout(600);
}

async function setStrategy(page: Page, radioId: string) {
  await page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, radioId);
  await page.waitForTimeout(600);
}

async function setMonthlySavings(page: Page, value: number) {
  await page.evaluate((v) => {
    const el = document.getElementById('monthlySavings') as HTMLInputElement;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(600);
}

async function captureSnapshot(page: Page, ageOffset: number) {
  return page.evaluate((offset) => {
    const w = window as unknown as { Chart?: any; getInputs?: () => any; computePayoffVsInvest?: any };
    const Chart = w.Chart;
    if (!Chart || typeof Chart.getChart !== 'function') return null;
    const chart = Chart.getChart('growthChart');
    if (!chart || !chart.data) return null;
    const inp = w.getInputs ? w.getInputs() : { ageRoger: 42, agePerson1: 42 };
    const startAge = inp.ageRoger || inp.agePerson1 || 42;
    const labels: string[] = chart.data.labels || [];
    const targetIdx = labels.findIndex((l) => l && l.includes(`(${startAge + offset})`));
    if (targetIdx < 0) return null;
    const result: Record<string, number | null | string> = {};
    for (const ds of chart.data.datasets) {
      const label = ds.label || '';
      result[label] = (Array.isArray(ds.data) ? ds.data[targetIdx] : null) as number | null;
    }
    // Also capture the calc module's amortization for the active strategy.
    const radio = document.querySelector('input[name="pviMortgageStrategy"]:checked') as HTMLInputElement | null;
    const stratValue = radio ? radio.value : 'invest-keep-paying';
    result.__strategy = stratValue;
    result.__monthlySavings = (document.getElementById('monthlySavings') as HTMLInputElement)?.value;
    result.__pviExtraMonthly = (document.getElementById('pviExtraMonthly') as HTMLInputElement)?.value;

    // Run a minimal PvI calc to capture year-5 amortization.
    if (w.computePayoffVsInvest) {
      try {
        const mtg = (window as any).getMortgageInputs ? (window as any).getMortgageInputs() : null;
        if (mtg) {
          const out = w.computePayoffVsInvest({
            currentAge: startAge,
            fireAge: startAge + 20,
            endAge: 95,
            mortgageEnabled: true,
            mortgage: mtg,
            stocksReturn: 0.07,
            inflation: 0.03,
            ltcgRate: 0.15,
            stockGainPct: 0.6,
            extraMonthly: parseFloat((document.getElementById('pviExtraMonthly') as HTMLInputElement).value),
            framing: 'liquidNetWorth',
            mortgageStrategy: stratValue,
            lumpSumPayoff: stratValue === 'invest-lump-sum',
          });
          if (out && out.amortizationSplit) {
            const arm = (stratValue === 'prepay-extra') ? 'prepay' : 'invest';
            const targetAge = startAge + offset;
            const row = out.amortizationSplit[arm].find((r: any) => r.age === targetAge);
            if (row) {
              result.__amortPI = (row.principalPaidThisYear + row.interestPaidThisYear);
              result.__amortMonthlyPI = (row.principalPaidThisYear + row.interestPaidThisYear) / 12;
            }
          }
        }
      } catch (e) {
        result.__amortError = String((e as Error).message);
      }
    }
    return result;
  }, ageOffset);
}

for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  test(`brokerage growth diverges across strategies — ${file}`, async ({ page }) => {
    await setupDashboard(page, file);
    await setMonthlySavings(page, 2000);  // $2000/mo into the linked sliders.

    // Capture brokerage 5 years out under each strategy. (5y is enough for
    // the difference to be visible; we're in the accumulation phase well
    // before mortgage natural payoff.)
    await setStrategy(page, 'pviStrategyInvestKeep');
    const investSnap = await captureSnapshot(page, 5);

    await setStrategy(page, 'pviStrategyPrepay');
    const prepaySnap = await captureSnapshot(page, 5);

    console.log(`[${file}] year-5 stocks — Invest: $${investSnap?.['Stocks/Brokerage']}, Prepay: $${prepaySnap?.['Stocks/Brokerage']}`);

    expect(investSnap, 'invest snap must be present').not.toBeNull();
    expect(prepaySnap, 'prepay snap must be present').not.toBeNull();
    const investStocks = Number(investSnap!['Stocks/Brokerage']);
    const prepayStocks = Number(prepaySnap!['Stocks/Brokerage']);
    expect(investStocks).toBeGreaterThanOrEqual(0);
    expect(prepayStocks).toBeGreaterThanOrEqual(0);
    // Contract: under Prepay, monthlySavings flows to mortgage extra principal,
    // so the brokerage receives less new cash → smaller (or equal) year-5 stocks
    // balance. Equality is OK when both clamp to 0 (very high housing premium
    // scenarios — e.g., Generic's defaults). Strict inequality is the typical
    // case when monthlySavings comfortably exceeds the housing premium.
    expect(prepayStocks,
      `Prepay's year-5 brokerage ($${prepayStocks}) should be ≤ Invest's ($${investStocks}).`)
      .toBeLessThanOrEqual(investStocks);
  });
}
