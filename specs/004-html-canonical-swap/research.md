# Phase 0 Research — HTML Canonical-Engine Swap

**Feature**: `004-html-canonical-swap`
**Date**: 2026-04-20
**Purpose**: Lock the design decisions before Phase 1. Scope is narrow and
well-precedented by feature 003's prototype; this doc stays brief.

---

## R1. Where the production `getCanonicalInputs()` lives

**Decision**: Place the production `getCanonicalInputs(inp)` as an exported
function in a NEW tiny ES module at `calc/getCanonicalInputs.js`. Both HTML
files import it via `<script type="module">`; the smoke harness imports it
directly from the same path. Single source of truth.

**Rationale**:
- **Shared module beats duplicated-in-both-HTMLs**: a single import means the
  adapter is versioned once, tested once (via the smoke harness), and both
  dashboards are guaranteed to stay in lockstep at the code level (Principle I
  mechanically enforced).
- **`calc/` placement beats a sibling `adapters/` directory**: the adapter is
  pure (no DOM, no Chart.js), and every consumer (both HTMLs + the smoke test)
  already imports from `calc/`. One more file there is no conceptual weight.
- **Keeps feature 003's smoke harness retarget clean**: feature 003's
  `_prototypeGetCanonicalInputs` was INLINE in the test file; retargeting means
  adding `import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js'`
  and deleting the prototype. Three lines.

**Alternatives considered**:
- **Inline in each HTML file** — rejected. Would re-introduce the Principle I
  drift risk (two copies of the adapter could diverge); costs more LoC; not
  reusable by the smoke harness.
- **Extract into a shared `personal/` or `adapters/` directory** — rejected.
  Premature categorization. If future adapters accumulate, restructure then.
- **Colocate with `calc/fireCalculator.js`** — rejected. The adapter isn't a
  FIRE solver concern; it's a data-shape translation. Separate file, separate
  fenced header, separate contract.

**Purity**: `calc/getCanonicalInputs.js` MUST pass the module-boundaries
meta-test (no DOM, no Chart.js, no `window`, no `localStorage`, no `navigator`).
It reads only from its `inp` parameter, constructs a canonical `Inputs` object,
and returns it frozen.

---

## R2. Shim return-shape fidelity

**Decision**: Each shim (`yearsToFIRE`, `findFireAgeNumerical`,
`_evaluateFeasibilityAtAge`) preserves its ORIGINAL return shape byte-for-byte,
including field names that differ from canonical (e.g., `sim` instead of
`lifecycle`, `endBalance` instead of `endBalanceReal`).

**Rationale**:
- **~10 call sites per HTML file consume these**: mortgage verdict, scenario
  card delta, what-if panel, coast-FIRE indicator, KPI card calculations, the
  drag handler's feasibility preview. Each call site reads specific fields of
  the return value. Any drift breaks a panel.
- **Shim is the translation layer; callers stay naive**: the feature's whole
  point is "edit the fewest call sites possible". The shim does the
  canonical-→-inline shape flip internally so callers see no change.
- **Canonical return shape is documented in `data-model.md §4`
  `FireSolverResult`**: shim maps:
  - `canonical.fireAge` → inline `years` (canonical is "age at FIRE"; inline
    is "years from current age to FIRE" — shim subtracts current age).
  - `canonical.yearsToFire` → inline `years` (matches).
  - `canonical.endBalanceReal` → inline `endBalance`.
  - `canonical.lifecycle` → inline `sim`.
  - `canonical.feasible` → inline `feasible`.
  - `canonical.endBalanceEffReal` → used for some KPI displays that want the
    post-tax-drag figure per feature 001's effBal layer.

**Alternatives considered**:
- **Rewrite callers to read canonical field names** — rejected per Q1 Option A
  (user explicit choice). Too much diff surface; violates narrow scope.
- **Return BOTH shapes (inline + canonical fields)** — rejected. Confusing;
  future editors won't know which to use.

---

## R3. Try/catch fallback values in each shim

**Decision**: Wrap each shim in `try/catch`. On canonical throw:

- **`yearsToFIRE` fallback**: return `NaN`. Callers that do `years > 0` checks
  see false; callers that do `years * N` see `NaN` and skip propagation.
  Dashboard will display something sensible (likely an "—" placeholder) rather
  than freezing.
- **`findFireAgeNumerical` fallback**: return
  `{years: NaN, months: NaN, endBalance: NaN, sim: [], feasible: false}`. Empty
  `sim` prevents chart renderers from exploding; `feasible: false` trips the
  infeasibility banner.
- **`_evaluateFeasibilityAtAge` fallback**: return `false`. Callers treat
  "unknown" as "not feasible" — safe default.

Every catch logs `console.error` with a prefix like
`[fireAge shim] canonical threw:` followed by the error message and the input
shape that caused it. Goal: local and CI smoke catches the throw first; if a
throw ever reaches production browsers, console logs give the user's next
support session traceable breadcrumbs.

**Rationale**:
- **Direct response to feature 001's U2B-4a failure**: the original revert
  (`d080a7e`) was because a canonical throw in the middle of `recalcAll`
  propagated up and froze the dashboard at "Calculating…". Try/catch at the
  shim level is the inner defense; the feature 003 smoke harness is the outer
  defense. Belt AND suspenders.
- **Fallback values are DOCUMENTED SAFE defaults**: each callers' behavior on
  the fallback is predictable. If any caller genuinely breaks on `NaN` or
  empty `sim`, we find it in the smoke harness or in local browser testing.

**Alternatives considered**:
- **No try/catch; rely on smoke harness alone** — rejected. Smoke catches it
  before shipping but doesn't save a user who somehow hits a corner case in
  production. Defense-in-depth costs 4 lines of code per shim.
- **Bubble up the exception with a named-error wrapper** — rejected. Would
  still freeze the dashboard at "Calculating…" if the classic-script glue has
  no top-level try/catch of its own (it doesn't, universally).

---

## R4. Smoke harness retarget: prototype → production

**Decision**: In `tests/baseline/browser-smoke.test.js`:

1. Delete the entire `_prototypeGetCanonicalInputs` function + its `TEMPORARY`
   block comment.
2. Add `import { getCanonicalInputs } from '../../calc/getCanonicalInputs.js';`
3. Replace every call to `_prototypeGetCanonicalInputs(inp)` with
   `getCanonicalInputs(inp)`.

Smoke assertions stay identical. If the production adapter returns a
canonically-valid `Inputs` that `solveFireAge` accepts without throwing AND
produces a result with the right shape + ranges, all three tests pass.

**Rationale**:
- **Prototype was deliberately close to production**: feature 003's research
  §R1 marked it `TEMPORARY` for this exact moment.
- **Zero assertion changes**: the whole point of the shape-only smoke is that
  the assertions are decoupled from the implementation.
- **This retargeting IS the validation of the production adapter**: if the
  three smokes pass on production, the adapter is correct for the two
  canonical input sets. US3 acceptance.

**Alternatives considered**:
- **Keep both prototype and production; compare them** — rejected. Adds
  complexity; if they diverge, "which is right?" becomes the question, and
  the answer is always "production". Use production; delete prototype.
- **Rewrite smoke assertions against production** — rejected. Breaks the
  shape-only discipline that made feature 003 small.

---

## R5. `evaluateFeasibility` export in `calc/fireCalculator.js`

**Decision**: RESTORE the `evaluateFeasibility({inputs, fireAge, helpers})`
export in `calc/fireCalculator.js` (exact shape from U2B-4a). Pure helper,
mode-aware (Safe / Exact / DWZ).

**Rationale**:
- The U2B-4a prior attempt shipped this export; the revert (`d080a7e`) removed
  it. The shim for `_evaluateFeasibilityAtAge` calls it — so it MUST exist.
- Restoring it is a small pure-function add; module-boundaries meta-test
  enforces purity.

**Implementation sketch** (same as U2B-4a):

```js
export function evaluateFeasibility({ inputs, fireAge, helpers }) {
  const lifecycle = runLifecycle({ inputs, fireAge, helpers });
  if (!lifecycle.every(r => r.feasible !== false)) return false;
  if (inputs.solverMode === 'safe') {
    const bufferUnlock = (inputs.buffers?.bufferUnlockMultiple ?? 0) * inputs.annualSpendReal;
    const bufferSS = (inputs.buffers?.bufferSSMultiple ?? 0) * inputs.annualSpendReal;
    const atUnlock = lifecycle.find(r => r.agePrimary >= 60)?.totalReal ?? 0;
    const atSS = lifecycle.find(r => r.agePrimary >= (inputs.ssStartAgePrimary ?? 67))?.totalReal ?? 0;
    if (atUnlock < bufferUnlock || atSS < bufferSS) return false;
  }
  return true;
}
```

A single unit test in `tests/unit/fireCalculator.test.js` can lock this
behavior (4 cases: per-year feasible but under-buffer returns false; per-year
infeasible returns false; fully feasible returns true; DWZ mode ignores buffer
gate).

**Alternatives considered**:
- **Implement inline in the shim without adding the calc export** — rejected.
  Duplicates mode-feasibility logic in the HTML glue; Principle II violation.
- **Make the shim call `solveFireAge` and check `fireAge === expectedAge`** —
  rejected. `solveFireAge` is a linear search; calling it for point feasibility
  is O(N) wasteful. `evaluateFeasibility` is O(1) over lifecycle length.

---

## R6. Lockstep commit discipline

**Decision**: Every change to `FIRE-Dashboard.html` must land in the SAME
commit as the equivalent change to `FIRE-Dashboard-Generic.html`. Both files
get the bootstrap together, the adapter call together, each shim together, the
deletions together. Manager verifies by reviewing every commit's `git diff
FIRE-Dashboard.html FIRE-Dashboard-Generic.html` for structural parity.

**Rationale**:
- Principle I is NON-NEGOTIABLE. The failure mode — one file ahead of the
  other — creates drift that feature 001's audit exposed (e.g., the three
  §C misdiagnoses we've closed all stemmed from RR/Generic structural
  asymmetries).
- One-commit-per-change-set keeps bisect useful and review small.

**Alternatives considered**:
- **RR-first then Generic as follow-up commit** — rejected. Creates a window
  where the two files structurally diverge on main.
- **One giant single commit for the entire feature** — permitted fallback if
  the total feature diff is small enough to review in one sitting, but the
  per-change-set commits are clearer.

---

## R7. EXPECTED_* locks in `inline-harness.mjs` — DO NOT touch

**Decision**: This feature does NOT update `EXPECTED_RR` or `EXPECTED_GENERIC`
constants in `tests/baseline/inline-harness.mjs`.

**Rationale**:
- `inline-harness.mjs` tests the INLINE engine (`projectFullLifecycle` +
  `signedLifecycleEndBalance`), NOT the canonical engine.
- This feature doesn't modify the inline engine's math — only shims the three
  solver entry points that call canonical.
- `signedLifecycleEndBalance` is DELETED in this feature; but the harness's
  inline port of its behavior (`runInlineLifecycle` in `inline-harness.mjs`)
  continues to run the same math as before because it's a PORT, not a call
  into the HTML.
- So the inline harness's locked values stay valid. The inline regression
  oracle continues to detect if the inline harness's own port drifts.
- The BROWSER SMOKE harness (from feature 003) is the oracle for canonical-
  driven behavior; its shape-only checks remain valid after the retarget.

**If a lock does fail**: that's a signal either the harness's inline port was
secretly relying on one of the deleted helpers (unlikely; its headers are
independent) OR the shim translation math is wrong. Diagnose before any lock
update.

---

## R8. Out-of-scope reminders

From spec.md, explicit out-of-scope for THIS feature:

- `projectFullLifecycle` modification (U2B-4b).
- Chart renderer rewrites to read canonical fields directly (U2B-4c).
- Surfacing `deficitReal` on the infeasibility banner (future UX).
- B2 "fix" — confirmed not a bug per `specs/audits/B2-silent-shortfall.md`.
- New end-user features of any kind.

---

## Summary of decisions

| ID | Area | Decision |
|---|---|---|
| R1 | Adapter location | New `calc/getCanonicalInputs.js` module; both HTML + smoke import |
| R2 | Shim return shape | Preserve inline shape byte-for-byte; translate from canonical inside |
| R3 | Try/catch fallbacks | Each shim catches; safe defaults; `console.error` logged |
| R4 | Smoke harness retarget | Delete `_prototypeGetCanonicalInputs`; import production; assertions unchanged |
| R5 | `evaluateFeasibility` | Restore the U2B-4a export; 1 new unit test |
| R6 | Commit discipline | Per-change-set lockstep commits; Manager reviews diff parity |
| R7 | `inline-harness.mjs` locks | DO NOT touch; this feature doesn't change inline math |
| R8 | Out-of-scope | `projectFullLifecycle`, chart renderers, deficit UI, B2, new features |

All Technical Context unknowns resolved. Ready for Phase 1.
