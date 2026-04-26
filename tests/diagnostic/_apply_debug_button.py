"""Inject the TEMP DEBUG copy-info button into FIRE-Dashboard.html, preserving
the file's existing CRLF line endings. Idempotent — refuses to inject twice.
Delete this script when the temp button is removed."""
import sys
import pathlib

p = pathlib.Path("FIRE-Dashboard.html")
src = p.read_bytes()

if b"debugSnapshotBtn" in src:
    print("ALREADY PRESENT - skipping injection")
    sys.exit(0)

EOL = b"\r\n"

js_block = b"""<script>
function copyDebugInfo() {
  const status = document.getElementById('debugSnapshotStatus');
  const show = (msg, ms) => {
    if (!status) return;
    status.textContent = msg;
    status.style.display = '';
    if (ms) setTimeout(() => { status.style.display = 'none'; }, ms);
  };
  try {
    const ds = (typeof _lastLifecycleDataset !== 'undefined' && _lastLifecycleDataset) ? _lastLifecycleDataset : {};
    const lc = Array.isArray(ds.lifecycle) ? ds.lifecycle : [];
    const fa = ds.fireAge;
    const post = (typeof fa === 'number') ? lc.filter(d => d.age >= fa) : [];
    const pickActiveBtn = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const bg = el.style.background || '';
      return bg.includes('var(--accent)') || bg.includes('rgb(108');
    };
    const fireMode = pickActiveBtn('btnSafeFire') ? 'safe'
                   : pickActiveBtn('btnExact') ? 'exact'
                   : pickActiveBtn('btnDieWithZero') ? 'dieWithZero'
                   : 'unknown';
    const inputs = {};
    document.querySelectorAll('input[id], select[id]').forEach(el => {
      if (el.type === 'button' || el.type === 'submit') return;
      inputs[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
    const bufUnlock = parseFloat(document.getElementById('bufferUnlock')?.value) || 0;
    const bufSS = parseFloat(document.getElementById('bufferSS')?.value) || 0;
    const spend = ds.scenarioSpend || 0;
    const summary = lc.length ? (() => {
      let peak = -Infinity, peakAge = null;
      let minPF = Infinity, minPFAge = null;
      for (const d of lc) {
        if (d.total > peak) { peak = d.total; peakAge = d.age; }
        if (typeof fa === 'number' && d.age >= fa && d.total < minPF) { minPF = d.total; minPFAge = d.age; }
      }
      const violations = post.filter(d => d.total < (d.age < 59.5 ? bufUnlock : bufSS) * spend);
      return {
        rows: lc.length,
        firstAge: lc[0].age,
        lastAge: lc[lc.length - 1].age,
        peakTotal: Math.round(peak),
        peakAge,
        minPostFireTotal: Number.isFinite(minPF) ? Math.round(minPF) : null,
        minPostFireAge: minPFAge,
        endOfLifeTotal: Math.round(lc[lc.length - 1].total),
        floorPhase1: Math.round(bufUnlock * spend),
        floorPhase23: Math.round(bufSS * spend),
        violationsBelowFloor: violations.length,
        firstViolationAge: violations.length ? violations[0].age : null,
      };
    })() : null;
    let feasibilityProbe = null;
    try {
      if (typeof getInputs === 'function' && typeof signedLifecycleEndBalance === 'function' && typeof isFireAgeFeasible === 'function') {
        const liveInp = getInputs();
        const sim = signedLifecycleEndBalance(liveInp, spend, fa);
        const feasibleSafe = isFireAgeFeasible(sim, liveInp, spend, 'safe', fa);
        const feasibleExact = isFireAgeFeasible(sim, liveInp, spend, 'exact', fa);
        const feasibleDWZ = isFireAgeFeasible(sim, liveInp, spend, 'dieWithZero', fa);
        const previewId = (typeof _previewStrategyId !== 'undefined') ? _previewStrategyId : null;
        const winnerId = (typeof _lastStrategyResults !== 'undefined' && _lastStrategyResults) ? _lastStrategyResults.winnerId : null;
        const activeStrategyId = previewId || winnerId || null;
        const usingNonDefault = !!(activeStrategyId && activeStrategyId !== 'bracket-fill-smoothed');
        const defaultChart = (typeof projectFullLifecycle === 'function')
          ? projectFullLifecycle(liveInp, spend, fa, true)
          : null;
        const overrideChart = (typeof projectFullLifecycle === 'function' && usingNonDefault)
          ? projectFullLifecycle(liveInp, spend, fa, true, { strategyOverride: activeStrategyId })
          : null;
        const countViolations = (chart) => chart
          ? chart.filter(r => typeof r.age === 'number' && r.age >= fa &&
              r.total < (r.age < 59.5 ? bufUnlock : bufSS) * spend).length
          : null;
        feasibilityProbe = {
          inpBufferUnlock: liveInp.bufferUnlock,
          inpBufferSS: liveInp.bufferSS,
          signedEndBalance: sim ? Math.round(sim.endBalance) : null,
          signedMinPhase1: sim && Number.isFinite(sim.minBalancePhase1) ? Math.round(sim.minBalancePhase1) : null,
          signedMinPhase2: sim && Number.isFinite(sim.minBalancePhase2) ? Math.round(sim.minBalancePhase2) : null,
          signedMinPhase3: sim && Number.isFinite(sim.minBalancePhase3) ? Math.round(sim.minBalancePhase3) : null,
          isFeasible_safe: feasibleSafe,
          isFeasible_exact: feasibleExact,
          isFeasible_dieWithZero: feasibleDWZ,
          activeStrategyId,
          previewStrategyId: previewId,
          winnerStrategyId: winnerId,
          usingNonDefaultStrategy: usingNonDefault,
          defaultChartRows: defaultChart ? defaultChart.length : null,
          defaultChartViolations: countViolations(defaultChart),
          overrideChartRows: overrideChart ? overrideChart.length : null,
          overrideChartViolations: countViolations(overrideChart),
          defaultChartEndOfLifeTotal: defaultChart && defaultChart.length ? Math.round(defaultChart[defaultChart.length-1].total) : null,
          overrideChartEndOfLifeTotal: overrideChart && overrideChart.length ? Math.round(overrideChart[overrideChart.length-1].total) : null,
        };
      }
    } catch (e) {
      feasibilityProbe = { error: String(e && e.message || e), stack: String(e && e.stack || '') };
    }
    const samples = lc.filter((d, i) =>
      i === 0 || i === lc.length - 1 ||
      d.age === fa || d.age === 60 || d.age === 70 ||
      i % Math.max(1, Math.floor(lc.length / 12)) === 0
    ).map(d => ({
      age: d.age,
      total: Math.round(d.total),
      p401k: Math.round(d.p401k || 0),
      pStocks: Math.round(d.pStocks || 0),
      pCash: Math.round(d.pCash || 0),
      phase: d.phase,
      synthConv: Math.round(d.syntheticConversion || 0),
    }));
    const debugObj = {
      _generatedAt: new Date().toISOString(),
      _file: location.pathname.split('/').pop(),
      fireMode,
      fireAge: fa,
      currentAge: ds.currentAge,
      ssClaimAge: ds.ssClaimAge,
      annualSpend: spend,
      bufferUnlock_yrs: bufUnlock,
      bufferSS_yrs: bufSS,
      summary,
      feasibilityProbe,
      lifecycleSamples: samples,
      inputs,
    };
    const json = JSON.stringify(debugObj, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        () => show('Copied to clipboard. Paste it back in chat.', 5000),
        () => {
          console.log('[debugSnapshot] clipboard blocked, dumping to console:');
          console.log(json);
          show('Clipboard blocked - full JSON dumped to DevTools console (F12).', 8000);
        }
      );
    } else {
      console.log('[debugSnapshot]', json);
      show('No clipboard API - JSON dumped to DevTools console.', 8000);
    }
  } catch (e) {
    console.error('[debugSnapshot] failed:', e);
    show('Debug snapshot failed: ' + e.message, 6000);
  }
}
</script>"""

snippet = (
    EOL +
    b"<!-- TEMP DEBUG: Copy-Debug-Info button for diagnosing Safe-mode / lifecycle issues." + EOL +
    b"     Remove this entire block (HTML + script) once debugging is complete. -->" + EOL +
    b'<button id="debugSnapshotBtn" type="button" onclick="copyDebugInfo()"' + EOL +
    b'  style="position:fixed;bottom:16px;right:16px;z-index:200;' + EOL +
    b'         padding:8px 14px;background:#ffd93d;color:#000;' + EOL +
    b'         border:1px solid #b89b00;border-radius:6px;font-size:0.85em;' + EOL +
    b'         cursor:pointer;font-weight:600;' + EOL +
    b'         box-shadow:0 2px 8px rgba(0,0,0,0.4);">' + EOL +
    b"  \xf0\x9f\x93\x8b Copy Debug Info" + EOL +
    b"</button>" + EOL +
    b'<div id="debugSnapshotStatus"' + EOL +
    b'  style="position:fixed;bottom:60px;right:16px;z-index:200;' + EOL +
    b'         max-width:320px;padding:8px 12px;' + EOL +
    b'         background:rgba(0,0,0,0.85);color:#ffd93d;' + EOL +
    b'         border:1px solid #ffd93d;border-radius:6px;' + EOL +
    b'         font-size:0.8em;display:none;' + EOL +
    b'         box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>' + EOL +
    js_block.replace(b"\n", EOL) + EOL +
    b"<!-- END TEMP DEBUG -->" + EOL
)

marker = b"</body>"
idx = src.find(marker)
if idx < 0:
    print("ERROR: </body> not found in", p)
    sys.exit(1)

new_src = src[:idx] + snippet + src[idx:]
p.write_bytes(new_src)
print(f"OK: injected debug button into {p} (bytes: {len(src)} -> {len(new_src)})")
