# FIRE-Dashboard.html — Bug Report & Fix Prompt (for Claude Code)

**Target file:** `FIRE-Dashboard.html` (~20,638 lines, single-file app)
**Reviewer:** Lexi · **Date:** 2026-06-05
**How to use:** Paste this whole file into Claude Code as the task spec. Each issue has a location, the current behavior, why it's wrong, and the fix + acceptance criteria. Do them in severity order. **Do not change the real-dollar convention of the model** — every fix below must keep all balances/spending in real (today's) dollars.

## Model convention (context Claude Code must respect)
- The engine runs in **real dollars**. Returns are applied as `realReturn = nominalReturn − inflation`, and spending is held flat in real terms.
- Three FIRE gates exist: **Safe**, **Exact**, **DieWithZero**. The **feasibility gate** consumes `signedLifecycleEndBalance(...)`; the **chart/headline** consumes `projectFullLifecycle(...)`. These two simulators are *supposed* to agree for any feasible plan.
- The app already contains two self-checks that are currently FAILING and must pass after the fixes: a **cross-validation invariant** (`crossValidationWarnings`, `endBalance-mismatch`) and a **cash-flow conservation** check (`residual`, computed ~line 20540).

---

## BUG-1 — CRITICAL: feasibility gate and headline chart disagree by 15% on the same plan
**Severity:** Critical (undermines trust in every number)
**Symptom (from current run):** `crossValidationWarnings[0]`: `signed-sim` endBalance = **$306,926**, `chart-sim` endBalance = **$361,880**, delta **15.2% / $54,955**, for the SAME winner (`aggressive-bracket-fill`) in a plan reported as feasible. The code's own comment calls it "genuine drift; investigate strategy-options threading or simulator math."

**Locations:**
- Signed sim retirement compounding (NO clamp): `FIRE-Dashboard.html:9464-9486` — pools are decremented then compounded with `pTrad *= (1+r)` etc., deliberately **without** `Math.max(0, …)`.
- Chart sim retirement compounding (WITH clamp): `FIRE-Dashboard.html:11051-11058` — `portfolio401kTrad = Math.max(0, portfolio401kTrad) * (1 + realReturn401k)` etc.
- Strategy dispatch in signed sim: `9420-9457`; in chart sim: search `projectFullLifecycle` retirement loop (~`10960-11060`).

**Why it's wrong:** For a feasible plan (no pool ever goes negative), the clamp is a no-op, so the two sims MUST produce identical per-year pools and identical end balance. A 15.2% gap proves the two code paths diverge somewhere **other** than the clamp — i.e. they are not running identical pool operations (likely: cash-sweep delta, synthetic-conversion handling, RMD path, or strategy-option threading differ between the two functions). The feasibility decision is made on the **lower** number ($306,926) while the user is **shown** the **higher** number ($361,880).

**Fix:**
1. Add a debug invariant that runs both sims for the active plan and logs the **first age** where `signed.total(age)` and `chart.total(age)` differ by more than $1. That pinpoints the divergence year.
2. Refactor so both simulators call **one shared per-year step function** `applyRetirementYear(pools, age, ctx)` that does: withdrawal mix → decrement pools → shortfall → synthetic conversion → cash sweep → compound. The only allowed difference is the final clamp (signed: no clamp; chart: clamp). Everything upstream of compounding must be byte-identical.
3. Re-run the cross-validation check.

**Acceptance:** For any feasible plan, `|signedEndBalance − chartEndBalance| < $1`. `crossValidationWarnings` is empty (or `expected: true`).

---

## BUG-2 — HIGH (optimistic bias): cash earns +0.5% REAL every year, forever
**Severity:** High (makes the plan look safer than reality; directly distorts sequence/inflation risk)
**Locations (all sites):** `9081`, `9378`, `9486`, `10110` (`*= (1 + 0.005 * scale)`), `10983`, `11058`, `12278`, `12817`, `12925` — all `pCash *= 1.005` / `portfolioCash *= 1.005`.

**Why it's wrong:** The model is in **real dollars**, so `*= 1.005` means cash **beats inflation by 0.5% every year, forever**. In the current run, $80,000 of cash *grows* to ~$104,817 in real terms across retirement. Real-world cash / short-term bonds roughly **track or lag** inflation (real return ≈ −1% to 0%), and in a stagflation regime they lose real value badly. This is the single assumption most responsible for the plan looking robust, and it's wrong in the optimistic direction.

**Fix:**
1. Introduce one input/constant `cashRealReturn` (default **0.0**; expose a slider later, range −2% to +1%).
2. Replace every `*= 1.005` cash line with `*= (1 + cashRealReturn)` and the `0.005 * scale` site with `(1 + cashRealReturn * scale)`.
3. Keep it a single source of truth (one constant referenced everywhere) so the 9 sites can't drift apart.

**Acceptance:** With `cashRealReturn = 0`, cash holds constant real value when undisturbed. Re-running with the default should *lower* end balance and may push the feasible FIRE age later — that is the correct, more conservative result.

---

## BUG-3 — MEDIUM (optimistic bias): real return uses subtraction instead of the Fisher relation
**Severity:** Medium (systematic ~+0.12%/yr overstatement, compounds over 57 years)
**Locations (22 sites):** every `realReturn… = inp.returnRate − inp.inflationRate` and `… = inp.return401k − inp.inflationRate`, including `8883, 9038-9039, 9150-9152, 9936-9938, 10178, 10364, 10368, 10394-10395, 10518-10519, 12080-12081, 12673-12674, 12909-12910`.

**Why it's wrong:** `7% − 4% = 3.00%`, but the correct real return is `(1.07 / 1.04) − 1 = 2.885%`. Subtraction overstates real growth by ~0.115%/yr; over a 43→100 horizon that compounds into a meaningful overstatement of every balance.

**Fix:** Add a helper and use it at all 22 sites:
```js
// Fisher real return: convert a nominal rate to real given inflation.
function realRate(nominal, inflation) { return (1 + nominal) / (1 + inflation) - 1; }
```
Replace `inp.returnRate - inp.inflationRate` → `realRate(inp.returnRate, inp.inflationRate)` (and the `return401k` variant). Do the same for the SS-COLA term `((ssCOLARate) − inflationRate)` (e.g. `9320, 10009, 10798, 12199`) → `realRate(ssCOLARate, inflationRate)`.

**Acceptance:** All real-return derivations route through `realRate(...)`. No remaining `- inp.inflationRate` rate subtractions in the simulators.

---

## BUG-4 — MEDIUM: cash-flow conservation leak of −$32,532 (real-vs-nominal contribution inconsistency)
**Severity:** Medium (overstates the accumulation peak ~2%)
**Locations:** conservation calc `20540`; accumulation loop & `cashFlowToCash` flooring `~9076-9091` and `getAccumulationSpend` (`8841`); `NEGATIVE_RESIDUAL` flag set in the accumulation per-year rows (search `cashFlowWarning`, e.g. `16547, 19358, 20497-20520`).

**Why it's wrong:** Real income falls ~1.5%/yr (2.5% nominal raise < 4% inflation), but **spending ($80,880) and contributions ($21,700 401k + $24,000 stock) are held flat in real terms.** From age 46 on, real income can't cover spend + contributions, so the model floors `cashFlowToCash` at 0 and emits `NEGATIVE_RESIDUAL` instead of funding the gap. The cumulative unfunded amount is −$32,532 — money that was "contributed" but never came from income or any pool. Result: the age-53 peak (~$1.69M) is overstated by ~2%, and the conservation invariant fails.

**Fix (choose one, document which):**
- **(a) Consistent deflation:** treat contributions as nominal-fixed and deflate them each year the same way income is deflated, so they shrink in real terms alongside income. OR
- **(b) Honest funding:** when residual would go negative, reduce the discretionary stock contribution first (down to 0), then draw the remainder from `pCash`/`pStocks`; never silently floor to 0. Surface the reduced contribution in the row.

**Acceptance:** `residual` in the conservation block is within ±$1,000 over the accumulation phase (ideally ≈ $0). No silent `NEGATIVE_RESIDUAL` that isn't reflected in pool movements.

---

## FEATURE-1 — MAJOR GAP (not a bug): no sequence-of-returns risk anywhere
**Severity:** Major design gap — this is the most important item for decision-making.
**Why it matters:** Every simulator applies a **constant** real return each year. So "feasible at 53" means "feasible **if** returns are perfectly smooth 3% real." The model **structurally cannot represent** a bad first decade (e.g. 1966–1982 stagflation or 2000–2013), which is the dominant risk for an early retiree drawing from a taxable account. The companion tool `Vanguard-Strategy-Examples-1966-stagflation.html` shows static withdrawal **busts** on the 1966 sequence — this dashboard would still report "feasible."

**Proposed implementation (new layer, opt-in toggle — keep flat-return mode as default):**
1. Add a **return-sequence mode**: `flat` (current) | `historical` | `monteCarlo`.
2. For `historical`, ship real-return sequences (already computed in the Vanguard tool): `sp1966`, `bal1966`, `sp2000`, `bal2000`. Apply year-by-year instead of the flat real return, with a configurable start-offset.
3. Add a **spending floor** input (an absolute real $ you won't cut below) and a **Guyton-Klinger guardrail** option (cut spending X% after down years, raise after good years) so the model can show how flexibility rescues a bad sequence — and how big the required cut is.
4. Add a **cash/short-bond real series** for the buffer in stress mode (couples with BUG-2): in stagflation the buffer should lose real value.
5. Report, per sequence: end balance, depletion age (if any), lowest real annual spend forced, and number of guardrail cuts.

**Acceptance:** User can run the existing plan against the 1966 and 2000 sequences and see whether it survives, the minimum real spend it was forced to, and how a spending floor changes the verdict.

---

## Suggested task order for Claude Code
1. **BUG-3** (Fisher helper) — smallest, touches 22 sites, low risk, do first to establish the `realRate` helper.
2. **BUG-2** (cash real return) — introduce `cashRealReturn` constant, replace 9 sites.
3. **BUG-4** (conservation) — pick approach (a) or (b), get `residual ≈ 0`.
4. **BUG-1** (sim divergence) — shared `applyRetirementYear` step; this is the biggest refactor; do after 2–4 so the two sims converge on the corrected math.
5. **FEATURE-1** (sequence layer) — only after 1–4 pass and the cross-val + conservation invariants are green.

## Global acceptance / regression gates
- `crossValidationWarnings` empty for all three modes (Safe/Exact/DWZ) on a feasible plan.
- Conservation `residual` ≈ $0 across the accumulation phase.
- Re-derive the feasible FIRE age after BUG-2/BUG-3/BUG-4 — expect it to move **later** (the current 53 is built partly on the three optimistic biases). Document the before/after FIRE age.
- Keep all outputs in real dollars; do not regress the real-dollar convention.
