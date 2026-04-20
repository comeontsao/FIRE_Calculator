# B2 Adjudication — Does the Inline Engine Silently Absorb Negative Pools?

**Date**: 2026-04-20
**Auditor**: Backend Engineer (independent pass)
**Claim under review**: `specs/001-modular-calc-engine/baseline-rr-inline.md §C.2`

The §C.2 claim asserts that `signedLifecycleEndBalance` pushes negative pool
balances into `pStocks` during withdrawal and that the UI reports the final
value (or clamps it to 0) "without surfacing an infeasibility". I evaluated
the code on its own merits, independent of the companion B1 audit.

## E1. Location of `signedLifecycleEndBalance`

- RR: `FIRE-Dashboard.html:3705-3862`
- Generic: `FIRE-Dashboard-Generic.html:3463-3612`

Pool-write sites (RR line refs; Generic mirrors exactly):

- Initialization: `L3720-3723` (`pTrad, pRoth, pStocks, pCash`).
- Accumulation phase: `L3810-3814` — pools grow with contributions; cannot go negative here because `effAnnualSavings = Math.max(0, ...)` at `L3812` floors the deduction.
- Retirement phase pre-59.5 (Phase 1): `L3826-3827` proportional split, `L3829` fallback `pStocks -= netSpend`.
- Retirement phase post-59.5 (Phase 2/3): `L3838-3841` tax-aware four-pool withdrawal, `L3845` fallback `pStocks -= netSpend / (1 - taxTrad)`.

**Hypothesis from E1 alone**: Only two sites (L3829, L3845) can force a pool
negative. Both write the shortfall to `pStocks`.

**Counter-check**: `taxAwareWithdraw` at `L3837` could also write negatives,
but only when at least one pool is positive (guarded by `pos > 0` at L3836).

## E2. Negative-pool handling at withdraw sites

Quoted lines from `FIRE-Dashboard.html`:

- `L3823:  const posTax = Math.max(0, pStocks) + Math.max(0, pCash);`
- `L3829:  pStocks -= netSpend; // accumulate shortfall here`
- `L3835:  const pos = Math.max(0, pTrad) + Math.max(0, pRoth) + Math.max(0, pStocks) + Math.max(0, pCash);`
- `L3845:  pStocks -= netSpend / Math.max(1e-9, 1 - taxTrad);`

**What the code actually does**: `Math.max(0, ...)` is used in the **selector**
(to decide the proportional split and to detect "are any pools positive"), not
as a **clamp on the written value**. A depleted pool is ignored when computing
the withdrawal share, but pools already negative are left negative — they are
not "absorbed" or re-pushed anywhere. The comment at L3829 is explicit:
`// accumulate shortfall here`.

**The §C.2 framing of "pushed into pStocks"**: this is literally true in a
trivial sense — after all pools are depleted, the next year's withdrawal
subtracts from pStocks, driving it more negative. But §C.2 implies the
negative is *hidden by redistribution*. It is not. It is parked in pStocks as
a signed liability and flows straight into the returned `endBalance`.

**Counter-check**: no `Math.max(0, pStocks)` clamp appears on the write side.
No `if (pStocks < 0) { pStocks = 0; ... }` exists anywhere in this function.
The sign is preserved all the way to the return.

## E3. Feasibility / infeasibility surface

`L3856:  const endBalance = pTrad * (1 - taxTrad) + pRoth + pStocks + pCash;`

This is an unclamped signed sum. If `pStocks` reached −$400k, `endBalance` is
approximately −$400k. The function returns `{ endBalance, balanceAtUnlock,
balanceAtSS }` at `L3861` — three signed numbers. No clamp, no Math.max,
no truncation.

The function name itself — **signed**LifecycleEndBalance — advertises that the
return is signed. The retirement-phase comment at `L3816` is equally explicit:
`// Retirement — withdraw target spend. Allow pools to go NEGATIVE.`

**Hypothesis from E3**: the signed return value IS the infeasibility surface.
**Counter-check**: is the signed value ever clamped at the callsite before
reaching the UI? See E4.

## E4. Caller-side treatment of the signed return

`isFireAgeFeasible` at `FIRE-Dashboard.html:3875-3890`:

- `L3877: if (mode === 'dieWithZero') return sim.endBalance >= 0;`
- `L3882: return sim.endBalance >= tYears * annualSpend;` (exact)
- `L3887-3889: sim.balanceAtUnlock >= bufUnlock && sim.balanceAtSS >= bufSS && sim.endBalance >= 0;` (safe)

All three modes gate feasibility on the **sign** of `endBalance` (and, for
Safe, the sign of the phase-transition snapshots). A negative `endBalance`
→ `feasible: false`.

`findFireAgeNumerical` at `L3901-3925+` (and Generic `L3678-3685`):

When every year in the loop fails `isFireAgeFeasible`, the function returns
`{ ..., feasible: false }` (Generic `L3684`). The dashboard's infeasibility
banner consumes this flag.

**This is a deliberate sentinel-value design**: negative end-balance is
precisely *how* the engine reports infeasibility. The sign is the signal, not
a bug to be absorbed.

## Verdict

**VERDICT B — Claim is MISDIAGNOSED.** The inline engine deliberately lets
pools go negative as the primary feasibility signal; `isFireAgeFeasible`
reads the sign and emits `feasible: false`, which the UI surfaces via the
infeasibility banner — there is no silent absorption.

## Recommendation for feature 004

Do NOT include §C.2 as a correctness fix in feature 004. The inline engine's
signed-balance-as-feasibility-signal is a valid design: negative end-balance
propagates through `isFireAgeFeasible` to `findFireAgeNumerical`'s
`feasible: false`, which the dashboard already surfaces. The canonical
engine's `{feasible: false, deficitReal}` typed result is a **different
design choice** (richer diagnostic: it exposes the dollar deficit) but not a
correctness patch for a silent-absorption bug. Update `BACKLOG.md` B2 and
`baseline-rr-inline.md §C.2` to reclassify as "design-difference, not bug":
the canonical engine offers a more ergonomic diagnostic surface, but the
inline engine does not silently hide infeasibility. If feature 004 wants the
richer `deficitReal` field in the UI, scope that as a **UX enhancement**
(exposing `−endBalance` as "projected lifetime deficit $X" in the
infeasibility banner), not as a correctness bugfix. The footnote in
`baseline-rr-inline.md` lines 425, 430, 433, 438, 450, 462 crediting §C.2 as
a trajectory-shifting driver should be re-examined: any numeric delta between
inline and canonical at the same fireAge is attributable to the typed result
carrying `deficitReal` separately from `endBalance` (a presentation/rounding
difference), not to hidden absorption in the inline path.
