# Research: Cash-Sweep to Stocks

**Feature**: 030-cash-sweep-stocks
**Phase**: 0 (Outline & Research)
**Date**: 2026-05-11

## Open questions resolved by direct code inspection

### R-1: Where exactly should the sweep call go in each simulator?

**Decision:** Insert the sweep call immediately AFTER the existing `pCash *= 1.005` cash-interest compounding line in each simulator. This is the canonical "year-end" point: all income, contributions, growth, withdrawals, and one-shot events have been applied for that year; cash interest has compounded; the next iteration starts a fresh year.

**Code locations** (per direct grep on current `main`):

| Simulator | File | Line | Context |
|---|---|---|---|
| `signedLifecycleEndBalance` | `FIRE-Dashboard.html` | 9196 (retirement), 9273 (accumulation) | `pCash *= 1.005;` |
| `simulateRetirementOnlySigned` | `FIRE-Dashboard.html` | 9855 | `pCash *= (1 + 0.005 * scale);` (partial-FIRE-year scale-aware) |
| `_simulateStrategyLifetime` | `FIRE-Dashboard.html` | 11856 | `pCash *= 1.005;` |
| `computeWithdrawalStrategy` | `FIRE-Dashboard.html` | 12464 | `pCash *= 1.005;` |
| `accumulateToFire` | `calc/accumulateToFire.js` | 711 | `pCash *= 1.005;` (canonical accumulation) |

Generic HTML has parallel sites that need byte-identical edits (Constitution Principle I).

Note: `projectFullLifecycle` (the lifecycle chart driver) calls `accumulateToFire` for the accumulation phase and runs the retirement phase inline. The accumulation-phase sweep is fixed by editing `calc/accumulateToFire.js`. The retirement-phase sweep needs an inline edit at `projectFullLifecycle`'s pCash compounding line.

**Rationale:** Inserting AFTER cash interest compounding (not before) preserves the existing 0.5% interest semantics for the residual cash that stays below threshold. If the sweep ran BEFORE compounding, the swept excess would skip one year of cash interest — a tiny but unnecessary deviation. After-compounding placement makes the helper's pre-condition simpler: "consume year-end pCash, return updated (pCash, pStocks)."

**Alternatives considered:**
- Sweep BEFORE pCash *= 1.005: rejected for the reason above (skips one year of interest on swept excess).
- Sweep at start of next year: rejected because partial-FIRE-year scaling (feature 022) becomes harder to reason about; year-end is canonical.
- Sweep inline (no helper, just `if/then` block per simulator): rejected — 6 separate copies of the same logic violate Constitution III (single source of truth). Helper enables consistent semantics + makes unit testing trivial.

### R-2: New `calc/cashSweep.js` module vs inline helper in existing file?

**Decision:** New file `calc/cashSweep.js` exporting `_applyCashSweep`. UMD-style, mirrors `calc/accumulateToFire.js` and `calc/calcAudit.js` patterns.

**Helper signature:**
```js
function _applyCashSweep(pCash, pStocks, threshold, age, currentAge, enabled) {
  // Returns: { pCash: number, pStocks: number, swept: number }
  // Year 0 (age === currentAge) is preserved untouched — `swept = 0`.
  // Year 1+ when enabled AND pCash > threshold: sweep excess to stocks.
  // When disabled: no-op, returns input pools unchanged.
}
```

**Rationale:**
- Pure function (Constitution II): no DOM, no globals, no side effects. Trivially unit-testable.
- UMD pattern (Constitution V): consumed by both browser HTMLs via `<script src="calc/cashSweep.js">` and by Node tests via `require()`.
- Single source of truth (Constitution III): all 6 simulators call the same helper. If the rule needs to evolve (e.g., monthly sweep, or stock→cash refill direction added later), one edit propagates everywhere.
- Year-0 preservation (per clarification): encoded in the helper via the `age === currentAge` check. Callers don't have to remember to special-case year 0; the helper enforces it by construction.

**Alternatives considered:**
- Inline helper inside `calc/accumulateToFire.js`: rejected — that module's contract is "accumulation phase only"; sweep applies to both phases.
- Inline helper inside both HTMLs (no module): rejected — would force 2 copies + a Node-test sandbox stub, violating the helper's purity-first design.

### R-3: Sweep timing vs spending-floor pass (Constitution VIII)

**Decision:** Sweep runs AFTER `taxOptimizedWithdrawal` (which contains the spending-floor pass per feature 015). Constitution Principle VIII is preserved.

**Why this works:** In a retirement-year iteration:
1. `taxOptimizedWithdrawal` is called with the YEAR-START pool snapshot. It runs Steps 1–7 (RMD, bracket-fill, mix computation, IRMAA cap) AND Step 7.5 (spending-floor pass — pull Trad to cover any unfunded spending). It returns a `mix` object with `wTrad/wRoth/wStocks/wCash` and any `shortfall`.
2. The caller subtracts the mix from each pool. If shortfall > 0 (pools genuinely insufficient), it's already recorded.
3. Pool growth multipliers apply (`pTrad *= (1 + realReturn401k)`, `pStocks *= (1 + realReturnStocks)`, `pCash *= 1.005`).
4. **Sweep runs here.** Operates on the post-withdrawal, post-growth pCash. If pCash is now below threshold (because withdrawals drained it), no sweep fires. If pCash is above threshold, sweep the excess.

Critically: the sweep never STARVES the spending-floor pass. The floor pass has already run before sweep is called. The pCash going INTO the floor pass is the year-start balance, not the post-sweep balance. So tax-optimization and spending-funding both run on full pre-sweep liquidity.

**Edge case verified:** if the floor pass had to drain pCash to fund spending, sweep simply doesn't fire that year (pCash < threshold). The user's spending was funded; sweep is downstream.

### R-4: Audit invariant — extend `_invariantE` or add new `_invariantF`?

**Decision:** Add new `_invariantF` (`simulator-cash-sweep-parity`). Keep `_invariantE` focused on its current concern (per-year `grossSpend` parity).

**Rationale:**
- `_invariantE`'s contract (`contracts/grossSpend-parity.contract.md` from feature 029) is explicitly about the `grossSpend` input value, not pool state. Conflating two concerns into one invariant would muddy the contract.
- Following feature 029's pattern: each parity concern gets its own invariant function + its own trace-array field on the audit ctx.
- The new invariant pushes warnings of `kind: 'simulator-cash-sweep-parity'` so the Audit panel can render them distinctly.
- Future engineers grepping for "cash sweep" find the invariant by name immediately.

**Helper signature for `_invariantF`:**
```js
function _invariantF(options, ctx) {
  // Reads ctx.cashSweepTraces (Array<{ age, simulatorId, pCash, pStocks, swept }>)
  // Compares per-age pCash + pStocks across simulators
  // Returns warnings for any age where two simulators disagree by > $1
}
```

Trace push is opt-in (same pattern as `_invariantE`): only allocates when `options.cashSweepTraces` is provided.

**Alternatives considered:**
- Extend `_invariantE` to take both `grossSpend` AND `(pCash, pStocks)` per trace row: rejected — couples two unrelated concerns; future cash-pool-related parity bugs would have to navigate `_invariantE`'s grossSpend logic to find their fix.

### R-5: UI placement — Plan tab → Investment section?

**Decision:** Yes, Plan tab → Investment section, immediately after the existing `pviCashflowOverrideEnabled` toggle pattern.

**Rationale:**
- The Investment section already houses cash-flow-related inputs (`pviCashflowOverride*` series; `monthlySavings`; `returnRate`; `inflationRate`). Cash-sweep behavior fits this group.
- Mirrors the established UI pattern (RR `:3162-3178`): a checkbox toggle, a hidden numeric input that reveals when toggle is ON, an info-tip explaining the behavior. Reuses the `_cashflowUpdateOverrideVisibility()` visibility-handler convention.
- No new sub-tab or expansion needed; fits within existing layout.

**Component shape:**
```html
<div class="control-group" style="border-top:1px dashed var(--border);padding-top:12px;margin-top:8px">
  <label class="pvi-toggle-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
    <input type="checkbox" id="cashSweepEnabled" onchange="_cashSweepUpdateVisibility();recalcAll()">
    <span data-i18n="plan.cashSweepToggle">Sweep excess cash into stocks each year</span>
    <span class="info-tip" data-i18n-tip="plan.cashSweepTooltip" data-tip="...">?</span>
  </label>
  <div id="cashSweepThresholdInput" hidden style="margin-top:8px">
    <label><span data-i18n="plan.cashSweepThreshold">Cash floor to keep ($)</span> <span class="val" id="cashSweepThresholdVal">$10,000</span></label>
    <input type="number" id="cashSweepThreshold" min="0" max="10000000" step="500" value="10000"
           oninput="document.getElementById('cashSweepThresholdVal').textContent='$'+Number(this.value).toLocaleString();recalcAll()">
  </div>
</div>
```

### R-6: Persistence and `getInputs()` wiring

**Decision:** Add `cashSweepEnabled` and `cashSweepThreshold` to the `_PERSISTED_INPUT_KEYS` array (RR `:17263-17278`) and to `getInputs()` extraction (parallels the `pviCashflowOverrideEnabled` pattern at RR `:7877-7879`).

**Rationale:** Established pattern. No new persistence mechanism required.

**Edits required:**
- Add to `_PERSISTED_INPUT_KEYS` (both HTMLs, same array): `'cashSweepEnabled', 'cashSweepThreshold'`.
- Add to `getInputs()`: read the DOM, default to `false` and `10000` when missing or invalid.
- Plumb `inp.cashSweepEnabled` and `inp.cashSweepThreshold` into every simulator that receives `inp`.

### R-7: Translation catalog entries

**Decision:** Add 4 keys × 2 languages = 8 new translation entries per HTML × 2 HTMLs = 16 total catalog-rows in `FIRE-Dashboard Translation Catalog.md`.

| Key | EN | zh-TW |
|---|---|---|
| `plan.cashSweepToggle` | "Sweep excess cash into stocks each year" | "每年將多餘現金掃入股票市場" |
| `plan.cashSweepThreshold` | "Cash floor to keep ($)" | "保留現金底線 ($)" |
| `plan.cashSweepTooltip` | "Excess cash above the floor is invested in stocks at year-end, compounding at the stock return rate. Year-0 starting cash is preserved." | "高於底線的多餘現金於年末投入股票，按股票回報率複利成長。起始年現金保持不變。" |
| `plan.cashSweepThresholdHelp` | "Minimum cash balance to maintain (real-$). Default $10,000." | "要保留的最低現金餘額（今日購買力）。預設 $10,000。" |

zh-TW translations to be reviewed at implementation time; the table above is a sensible first pass.

### R-8: Tests strategy

**Decision:** Four test files, dependency-ordered:

1. **`tests/unit/cashSweepHelper.test.js`** — Pure-function tests against `calc/cashSweep.js`. ~12 cases:
   - Toggle OFF → no-op (pCash and pStocks unchanged, swept = 0).
   - Toggle ON + year 0 (age === currentAge) → no-op even if pCash > threshold.
   - Toggle ON + year 1 + pCash > threshold → swept = pCash − threshold; pCash = threshold; pStocks += swept.
   - Toggle ON + year 1 + pCash ≤ threshold → no-op (swept = 0).
   - Threshold = 0 → year-1+ sweeps everything to stocks; year 0 preserved.
   - Threshold = $10M → year-1+ effectively never fires (pCash stays untouched).
   - Negative threshold → throws or clamps to 0 (decide at implementation; lean toward clamp-to-0 for UI safety).
   - Threshold > pCash → no-op.
   - pCash = 0, threshold > 0 → no-op.
   - pCash exactly equal to threshold → no-op (strict greater-than rule).

2. **`tests/unit/cashSweepSimulatorIntegration.test.js`** — Structural pins (mirror `signedSimStrategyOptions.test.js` pattern) verifying each of the 5 simulator function bodies contains `_applyCashSweep(` immediately after their `pCash *= ...` line. ~10 cases (5 simulators × 2 HTMLs).

3. **`tests/unit/cashSweepRrFixture.test.js`** — End-to-end numerical pin using a Node-sandbox load of `calc/accumulateToFire.js` + `calc/cashSweep.js`. Runs the canonical RR fixture through `accumulateToFire` and confirms:
   - Toggle OFF: end-of-accumulation pCash matches pre-feature value.
   - Toggle ON + $10K threshold: end-of-accumulation pCash ≈ $10K real (or starting cash if user hadn't grown it past threshold by FIRE).
   - ~6 cases covering the canonical fixture + variants.

4. **`tests/unit/cashSweepAuditInvariant.test.js`** — Direct unit test of the new `_invariantF` function (exposed via `_invariantF_test_only_` export). ~8 cases:
   - Empty traces → no warnings.
   - All simulators agree on per-age pCash → no warnings.
   - One simulator's pCash diverges by > $1 → exactly one warning at that age, structured fields populated.
   - Multiple ages, only some violating → warnings only at offending ages.

5. **`tests/e2e/cash-sweep-toggle.spec.ts`** — Matrix-driven Playwright E2E:
   - Both HTMLs × EN + zh-TW × toggle ON/OFF = 8 baseline scenarios.
   - Cases: load page, locate toggle (data-i18n attr), confirm default-OFF state visible; flip toggle ON, confirm threshold input becomes visible; read Lifecycle-chart end-of-life cash value; confirm < $20K real when toggle ON; confirm $354K real when toggle OFF.

### R-9: Lockstep risk assessment

**Decision:** Pre-commit lockstep diff check is essential. RR + Generic edits must be byte-identical except for personal-content lines.

**Rationale:**
- 5 simulators × 2 HTMLs = 10 call sites + UI block in each HTML = 11 byte-identical edits per HTML side.
- Pattern from features 027/028/029: implement RR first, mechanically `diff` against Generic, replicate exact same line-by-line.
- Lockstep audit at end of implementation: `git diff --stat main...HEAD -- FIRE-Dashboard.html FIRE-Dashboard-Generic.html` should show line counts within ±1 of each other.

## Decision summary

| ID | Decision | Status |
|---|---|---|
| R-1 | Sweep call sites: after existing `pCash *= 1.005` line in each simulator. 5 sites in each HTML + 1 in `calc/accumulateToFire.js`. | Resolved |
| R-2 | New `calc/cashSweep.js` module with `_applyCashSweep` pure function (UMD-style). | Resolved |
| R-3 | Sweep runs AFTER `taxOptimizedWithdrawal` so Constitution VIII spending-floor preservation is intact. | Resolved |
| R-4 | New `_invariantF` (`simulator-cash-sweep-parity`) in `calc/calcAudit.js`. NOT extending `_invariantE`. | Resolved |
| R-5 | UI placement: Plan tab → Investment section, mirroring `pviCashflowOverrideEnabled` pattern. | Resolved |
| R-6 | Persistence: extend `_PERSISTED_INPUT_KEYS` array; `getInputs()` reads checkbox + threshold defaulting to false / $10K. | Resolved |
| R-7 | 4 new translation keys × 2 languages × 2 HTMLs = 16 catalog rows. Initial zh-TW translations in this doc. | Resolved |
| R-8 | 4 unit test files + 1 E2E matrix spec. ~46 new test cases total. | Resolved |
| R-9 | Lockstep audit: mechanical `git diff --stat` between RR + Generic at end. Acceptance: ±1 personal-content line. | Resolved |

## Follow-ups / Out-of-scope

- **Negative threshold validation**: UI should reject negative input. Decision deferred to tasks phase (HTML `min="0"` attribute + JS guard in `getInputs()`).
- **Year-0 visual annotation**: Spec doesn't require it. If future polish wants a "Year-0 preservation" tooltip on the Lifecycle chart, that's a separate iteration.
- **Catalog cleanup**: zh-TW translations to be reviewed by a native speaker at implementation time. The plan-time first-pass entries are functional but not necessarily idiomatic.
