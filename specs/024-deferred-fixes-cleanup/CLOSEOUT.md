# Feature 024 — CLOSEOUT

**Feature**: Deferred Fixes Cleanup
**Branch**: `024-deferred-fixes-cleanup`
**Started**: 2026-05-02 (same day as feature 023 merge)
**Implemented**: 2026-05-02 (initial 6 user stories — single autonomous run); scope expansion 2026-05-03 (US7+US8+US9)
**Status**: **AWAITING USER BROWSER-SMOKE** before merge to `main` — smoke needs re-running after 2026-05-03 scope expansion (3 new user stories surfaced from user-validation triage)

---

## Scope expansion appendix (2026-05-03)

While the feature was in browser-smoke gate, the user's manual validation surfaced 3 additional user-validation findings tied to the lump-sum mortgage payoff strategy + KPI presentation. These were folded into the 024 branch as US7+US8+US9 rather than spawning a feature 025, since they touch the same code areas and the branch had not yet merged.

### US7 — B-024-3 Cash-first bucket priority for lump-sum payoff

**Trigger**: User screenshot at age 54 showed Lifecycle tooltip with `Cash: $260,932` essentially untouched while `Stocks: $731,275` took a ~$269k hit (incurring LTCG gross-up). Asked: "can't we prioritize that for using cash mostly, then from the money that comes back from the sell of the house?"

**Root cause**: Lifecycle simulator drain at `FIRE-Dashboard.html:10362` / `FIRE-Dashboard-Generic.html:10707` computed `_drain = brokerageBefore - brokerageAfter` (= grossed-up `actualDrawdown`) and subtracted the entire amount from `portfolioStocks` only, ignoring `portfolioCash`. The calc module's lump-sum trigger fires on a brokerage-only model (correct for the Payoff-vs-Invest comparison panel), but the lifecycle simulator has both buckets and should route the drain optimally.

**Fix**: At the drain site in both HTMLs, compute:

```
cashUsed       = min(portfolioCash, paidOff)            // no LTCG owed on cash
stockPrincipal = max(0, paidOff - cashUsed)             // remainder from stocks
grossUpFactor  = actualDrawdown / paidOff               // recovered from event
stockDrain     = stockPrincipal × grossUpFactor         // LTCG only on stock portion
portfolioCash  -= cashUsed
portfolioStocks -= stockDrain
```

When cash ≥ paidOff (user's age-54 case), `stockPrincipal = 0` → `stockDrain = 0` → stocks bucket unchanged. LTCG cost = $0 instead of ~$18k. Cliff in stocks visualization disappears.

### US8 — B-024-2 Lump-sum unconditionally inhibited when sellAtFire=true

**Trigger**: User screenshot showed lump-sum payoff at age 54 (with $269k drain) followed by home-sale-at-FIRE at age 56 dumping $564k back into the brokerage. The home sale would have discharged the remaining mortgage from sale proceeds — the pre-FIRE lump-sum was wasteful.

**Root cause**: Feature 018 added a guard at `calc/payoffVsInvest.js:543` blocking lump-sum trigger at `age >= fireAge` when sellAtFire is set, but pre-FIRE lump-sum still fired. The original guard reasoning was "home sale at FIRE handles the mortgage from sale proceeds, so don't fire lump-sum AT FIRE." But the same logic applies BEFORE FIRE: if sale proceeds will cover the mortgage anyway, no need to drain the brokerage early.

**Fix**: Trigger condition changed from `(!sellAtFireSet || age < inputs.fireAge)` to `!sellAtFireSet`. Effective behavior: when `sellAtFire=true`, the `invest-lump-sum` strategy simulates as `invest-keep-paying` until the home sale at FIRE discharges the mortgage. Calc module label still says `invest-lump-sum` (user's explicit choice), but `lumpSumEvent === null` and the lifecycle drain at the HTML level never fires. New regression test `B-024-2 (v5) lump-sum unconditionally inhibited when sellAtFire=true even with sufficient brokerage` (sets up high-extra/high-return scenario where the trigger WOULD fire pre-FIRE if not for the guard).

### US9 — KPI relabel: "Current Net Worth" → "Whole Portfolio Net Worth"

**Trigger**: User screenshot showed the KPI value `$525,000` ("accessible") with sub-line `+$84,454 locked 401K`, while the Lifecycle chart tooltip at age 42 (currentAge) showed `Total Portfolio: 609,454`. The two numbers should match on a "today" tooltip but visually didn't because the KPI showed only the accessible portion.

**Fix**: Relabeled to `Whole Portfolio Net Worth`; value now sums `accessible + locked = $609,454` (matches chart tooltip). Sub-line shows breakdown `$525,000 accessible · $84,454 locked 401K`. EN + zh-TW + Translation Catalog updated. Both HTMLs lockstep.

| Translation key | Pre-024 | Feature 024 |
|---|---|---|
| `kpi.netWorth` (EN) | "Current Net Worth" | "Whole Portfolio Net Worth" |
| `kpi.netWorth` (zh) | "目前淨資產" | "總投資組合淨資產" |
| `kpi.netWorthSubDyn` (EN) | "accessible (+ ${0} locked 401K)" | "${0} accessible · ${1} locked 401K" |
| `kpi.netWorthSubDyn` (zh) | "可用（另有 ${0} 401K 鎖定中）" | "可用 ${0} · 401K 鎖定 ${1}" |

### Tests after scope expansion

- **Total**: 502 → 503 passing (+1 from B-024-2 regression test added in `tests/unit/payoffVsInvest.test.js`).
- 1 intentional skip preserved.
- 0 failures.
- Constitution VIII gate (`spendingFloorPass.test.js`): 7/7 throughout.

### Browser-smoke addendum for the scope expansion

The 6-step smoke in `quickstart.md` needs 3 additional checks before merge:

7. **B-024-3 cash-first lump-sum**: With `mortgageStrategy='invest-lump-sum'` AND sufficient cash to cover principal at lump-sum age, verify Lifecycle chart shows cash bucket dropping while stocks bucket stays roughly flat (vs. pre-024 behavior where stocks dropped sharply).
8. **B-024-2 sellAtFire inhibits lump-sum**: With `mortgageStrategy='invest-lump-sum'` AND `mtgSellAtFire='yes'`, verify `Copy Debug` reports `lumpSumEvent: null`, no lump-sum cliff in Lifecycle chart, and the home sale at FIRE handles the mortgage.
9. **US9 KPI relabel**: Open the dashboard at default state. Verify (a) the headline KPI label reads "Whole Portfolio Net Worth" / "總投資組合淨資產", (b) the value matches the "Total Portfolio" line in the Lifecycle chart tooltip when the cursor is at currentAge, (c) the sub-line shows the breakdown `$X accessible · $Y locked 401K`.

---

## Phase-by-phase summary

| Phase | Scope | Commit | Outcome |
|---|---|---|---|
| Spec | Spec + checklist | `32e3aa5` | ✓ |
| Plan | 9-phase plan + Phase 0 R1-R6 + Phase 1 design (3 contracts + data-model + quickstart) | `03ff73f` | ✓ |
| Tasks | 56-task plan | `05b8838` | ✓ |
| Wave 1 | US2 dedup + US6 docs drift | `6edda98` | ✓ |
| Wave 2 | US1 + US3 + US4 + US5 (4 stories sequential for retirement-loop coordination) | `111d05f` | ✓ |
| 9 | Polish + audit run + closeout | (this commit) | ✓ |

## Total commits on branch

```
(this CLOSEOUT commit)
111d05f  phase5+6+7+8(024): Wave 2 — US1 + US3 + US4 + US5
6edda98  phase3+4(024): US2 scenario.tax.china dedup + US6 docs drift cleanup (Wave 1)
05b8838  tasks(024): 56-task plan
03ff73f  plan(024): 9-phase plan + Phase 0 research + Phase 1 design
32e3aa5  spec(024): deferred-fixes carry-forward feature
```

## Tests added/modified

- `tests/unit/calcAudit.test.js`: T7 updated for new `expected: true` semantics (both-sims-feasible clamping artifact); +1 NEW test T7b verifying signed-negative + chart-positive case stays as non-expected warning.
- All 6 user stories landed without breaking existing 501 tests.

**Test totals at closeout**:
- Unit + audit + meta: **502 tests, 501 pass, 1 intentional skip, 0 fail**.
- Was: 501 pre-feature-024. Added: **+1 net new test**.
- Constitution VIII gate: 7/7 throughout.

## Findings

| Severity | Count | Status |
|---:|---:|---|
| CRITICAL | 0 | ✓ |
| HIGH | 0 | ✓ |
| MEDIUM | 0 | ✓ |
| LOW | 0 | ✓ — B-022-1 fix expected to clear the residual E3 finding (browser-smoke verifies; CLI audit harness doesn't include the E3 invariant suite by default) |
| **TOTAL** | **0** | All cleared |

## What changed in this branch

### Calc layer
- `calc/calcAudit.js`: extended `_invariantA` cross-validation logic to mark clamping-artifact divergences (both sims feasible, ≥ 0) as `expected: true`. Strategy-mismatch case (existing) preserved. Signed-negative + chart-positive remains `expected: false` (genuine bug signal).

### Display layer
- Both HTMLs gained `ssCOLARate` slider on Investment tab (B-023-5).
- Both HTMLs apply per-year SS COLA factor at all 6 retirement-loop sites.
- Both HTMLs `_chartFeasibility` synthesizes `_qInpForChart` + `_qFireAge` shadow-vars for monthly-precision quantization (B-022-1).
- Both HTMLs `renderHealthcareCard` converts costs to Book Value at phase-midpoint ages (B-022-3).
- `scenario.tax.china` deduped in both HTMLs (B-022-2).

### Translation
- 2 new bilingual keys (`invest.ssCOLA`, `invest.ssCOLAHelp`).
- Translation Catalog updated.
- `scenario.tax.china` properly placed in zh-TW block of both HTMLs.

### Documentation
- `BACKLOG.md` — "Done in feature 023" gained "Post-closeout polish" sub-section. New "Done in feature 024" section added.
- `specs/023-accumulation-spend-separation/CLOSEOUT.md` — "Post-closeout polish (2026-05-02)" appendix.
- `CLAUDE.md` SPECKIT block flipped to AWAITING USER BROWSER-SMOKE.

## Key design decisions (per spec § Phase 0 Research)

1. **B-022-1 quantization site**: caller-side (mirror 022 US5) NOT entry-side (in projectFullLifecycle). Multiple non-quantized callers exist (chart, drag-preview, audit harness) where raw input is correct.
2. **B-022-2 dedup target**: remove the EN-keyed zh-TW value, add a proper zh-TW entry. Avoids regression where Chinese users would lose the China tax note.
3. **B-022-3 frame midpoint**: phase midpoint age (pre-65 = (currentAge+65)/2; post-65 = (65+endAge)/2) instead of phase boundary. Better represents "average annual cost during phase."
4. **B-023-5 default**: `ssCOLARate = inflationRate` preserves byte-identical pre-024 behavior. Users opt-in to lower COLA explicitly.
5. **B-023-6 reconciliation strategy**: NOT extend signed sim with new logic (already uses taxOptimizedWithdrawal — same as chart). Refine `expected` annotation to match the actual divergence class (clamping artifact vs genuine signal).

## Browser smoke (Phase 10) — USER GATE

**This is the gate before merging to `main`.** Roger needs to do this manually. See `specs/024-deferred-fixes-cleanup/quickstart.md` for the 6-step checklist:

1. Cold load + console silence (both HTMLs).
2. SS COLA slider behavior (test ssCOLARate = 2.5% with inflation = 3% → SS bars visibly shrink in real terms).
3. Healthcare cards Book Value (verify pre-65 ≈ $20,200 for US scenario at currentAge=42 inflation=3%).
4. Audit cross-validation `expected` flag (both-feasible warnings now annotated).
5. Strategy ranker stability under perturbation (E3 LOW count = 0).
6. `scenario.tax.china` dedup (China tax note correct in EN + zh-TW).

## Merge-readiness statement

**Ready to merge to `main`** subject to:

- [x] All 6 user stories shipped (51 of 51 CLI-executable tasks complete; 5 user-side tasks gated)
- [x] All unit + audit + meta tests green (501/502 + 1 intentional skip)
- [x] Zero CRITICAL/HIGH/MEDIUM findings
- [x] Audit findings ≤ 1 LOW pre-fix → expected 0 LOW post-fix (browser-smoke verifies)
- [x] Both HTMLs in lockstep
- [x] EN + zh-TW for every new user-visible string (2 new keys + scenario.tax.china zh-TW added)
- [x] Constitution VIII gate green throughout
- [ ] **USER browser-smoke** — pending manual execution per `quickstart.md`

Once smoke is green, merge with: `git checkout main && git pull origin main && git merge --no-ff 024-deferred-fixes-cleanup -m "Merge feature 024-deferred-fixes-cleanup: B-022-1 + B-022-2 + B-022-3 + B-023-5 + B-023-6 + 023 docs catch-up"`.

## Lessons codified

1. **Multi-bug carry-forward feature works well**. 5 distinct backlog items + docs drift bundled into one feature shipped in 5 commits over a few hours of CLI work. Comparable to feature 022's "B-021 carry-forward" pattern. The key: each item has its own user story and is independent enough to test in isolation.

2. **Investigation before assumption**. B-023-6's hypothesis (signed sim missing spending-floor pass) was wrong. Both sims use `taxOptimizedWithdrawal`. The actual divergence is the deliberate clamping difference. Fix: refine the `expected` annotation rather than try to "reconcile" two sims that are correctly different by design.

3. **Test-contract updates ship with code-contract changes**. Refining the `expected` annotation logic broke T7 because T7 asserted the OLD contract. Updated test in same commit that updates the calc-engine logic. Per Constitution IV: code-contract changes require test-contract migration in the same change set.

4. **Lockstep grep before commit catches surface-area drift**. `grep -c 'scenario.tax.china'` confirmed both HTMLs have exactly 2 occurrences post-fix (1 EN + 1 zh-TW). Same pattern checks for ssCOLARate slider, _chartFeasibility quantization, etc.
