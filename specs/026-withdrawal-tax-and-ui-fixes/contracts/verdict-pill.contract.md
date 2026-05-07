# Contract — Verdict Pill (US1)

**Scope:** the rendering rule for the verdict pill at `FIRE-Dashboard.html:12946–12968` and the parallel block in `FIRE-Dashboard-Generic.html`.

**Anchored to:** spec FR-002, FR-003, FR-004, FR-005; SC-001, SC-002, SC-003.

---

## Inputs

The verdict pill render is invoked with two relevant inputs:

```text
inp                   — canonical input record (ageRoger / agePerson1, etc.)
_lastKpiSnapshot      — module-level snapshot, MUST contain a fresh
                        `fireAgeResult: FireAgeResult` (see data-model.md §1)
                        as of the input that triggered the recalc.
```

Plus the integer-year fallback inputs already present today: `yrsToFire`, `fireAge`, `progressPctRounded`.

## Output

DOM mutation: `statusEl.textContent` set to one of three template strings:

```text
verdict.fireInYearsMonths   — "🔥 On Track — FIRE in {0} years {1} months (age {2}) · {3}% there"
dyn.fireInYears             — "🔥 On Track — FIRE in {0} years (age {1}) · {2}% there"
dyn.statusNeedsOpt          — "⚡ Long timeline — FIRE in ~{0} years at current pace · {1}% to target"
dyn.statusBehindSched       — "⚠️ Distant target — FIRE in {0}+ years · {1}% to target..."
```

(All four exist in `TRANSLATIONS.en` and `TRANSLATIONS.zh` already.)

## Decision rule

```text
let R = _lastKpiSnapshot?.fireAgeResult

if (R == null || !R.feasible)                           → use the existing long-timeline branches
                                                          (yrsToFire > 12 / > 18 logic) unchanged
else if (R.searchMethod === 'month-precision')          → render verdict.fireInYearsMonths with
                                                          {0} = R.years - inp.ageRoger,
                                                          {1} = R.months,
                                                          {2} = R.years,
                                                          {3} = progressPctRounded
else if (R.searchMethod === 'integer-year')             → render dyn.fireInYears with
                                                          {0} = R.years - inp.ageRoger,
                                                          {1} = R.years,
                                                          {2} = progressPctRounded
                                                          (NEVER append "0 months" or stale months)
else if (R.searchMethod === 'none')                     → fall back to long-timeline branches
```

The current code (line 12950–12968) already gates on `searchMethod === 'month-precision'` correctly. **The bug — if it's in this layer — is that the gate's "else" branch is not the integer-year-aware path described above; instead it falls through to the legacy `dyn.fireInYears` branch with the integer `yrsToFire` (an older variable) which may be calculated from a different code path than `R.years - inp.ageRoger`. The fix MUST source both branches from the SAME `R.years` to maintain Constitution III (single source of truth).**

If the bug is elsewhere (resolver, simulator, snapshot staleness — see research.md Section 1), the rule above still holds; the contract for THIS layer doesn't change.

## Required tests (FR-005)

### `tests/unit/fireAgeResolverSweep.test.js` (NEW)

A Node-side sweep that calls `findEarliestFeasibleAge` with the canonical RR inputs across 25 evenly-spaced monthly-savings values from $2,000 to $14,000 and asserts:

1. The set of returned `months` values across the sweep includes ≥ 4 distinct values in `{0..11}`.
2. The set is NOT >80% concentrated on any single bucket.
3. For every result with `searchMethod === 'integer-year'`, `months === 0`.
4. For every result with `searchMethod === 'month-precision'`, `months ∈ {1, 2, ..., 11}`.

### `tests/e2e/verdict-pill-sweep.spec.js` (NEW — Playwright)

Loads `FIRE-Dashboard.html` (then `FIRE-Dashboard-Generic.html`), drives the monthly-savings input through 10 distinct positions, scrapes the verdict pill text after each, and asserts:

1. The set of months values displayed across the 10 positions includes ≥ 3 distinct values.
2. When the underlying resolver result is `searchMethod === 'integer-year'` (probed via the audit panel or DevTools-injected inspection), the pill renders `FIRE in N years` with no "months" suffix.
3. The displayed `(age N)` matches `R.years` exactly — no off-by-one, no DWZ-floor-vs-Safe-ceil drift (feature 023 invariant).

### Existing tests that MUST continue passing

- `tests/unit/monthPrecisionResolver.test.js` (8 cases) — current resolver contract.
- `tests/unit/perStrategyFireAge.test.js`
- `tests/unit/fireCalculator.test.js`

## Lockstep requirement (Constitution I)

Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST receive the same change. The Generic file uses `inp.agePerson1` instead of `inp.ageRoger`; the contract above uses `inp.ageRoger` purely for naming clarity, but the implementing change resolves to the canonical helper that already abstracts the difference.

## Bilingual requirement (Constitution VII)

Existing keys `verdict.fireInYearsMonths`, `dyn.fireInYears`, `dyn.statusNeedsOpt`, `dyn.statusBehindSched` are present in both EN and zh-TW translation dicts. No new strings are added by this contract. If Phase 0 diagnosis introduces a new copy variant (e.g., for "feasible at currentAge"), both translations MUST land in the same commit per Constitution VII.
