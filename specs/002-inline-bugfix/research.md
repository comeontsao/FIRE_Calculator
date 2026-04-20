# Phase 0 Research — Inline Engine Bugfix (B1 + B3)

**Feature**: `002-inline-bugfix`
**Date**: 2026-04-19
**Purpose**: Resolve fix-strategy decisions before Phase 1 design. Exact line
numbers in the HTML files are left to the implementing engineer (grep-confirmed
during Phase 3 dispatch); what's decided here is the shape of each patch.

---

## R1. B1 fix strategy — real/nominal conversion at the overlay boundary

**Decision**: Convert healthcare and college overlay costs to real dollars
**at the point they are added to `annualSpend`** inside
`projectFullLifecycle()` and `signedLifecycleEndBalance()`. Do NOT introduce a
new helper module. Do NOT import from `calc/inflation.js`. Perform the
conversion with a three-line inline formula that mirrors what `calc/inflation.js`
does internally.

**Rationale**:
- **Inline conversion keeps the patch local.** The audit finding (§C.1) is that
  overlay costs are added to `annualSpend` without inflation adjustment; the
  accumulation + withdrawal math already uses real returns, so the fix is a
  one-line unit correction at the add boundary.
- **No `calc/inflation.js` import** because the inline engines are classic
  `<script>` blocks, not ES modules. Importing would require a module-bridge
  shim and re-introduces coupling between the inline engine and the canonical
  calc layer — exactly what we're avoiding by doing an inline bugfix instead
  of the full wire-up (feature 004).
- **Three-line formula** (in pseudo-code):
  ```js
  // Where the inline code today does:
  //   annualSpend = baseSpend + healthcareDeltaNominal + collegeCostNominal;
  // Change to:
  const yearsFromBase = yearIndex; // already zero-indexed in the lifecycle loop
  const healthcareDeltaReal = healthcareDeltaNominal / Math.pow(1 + inflationRate, yearsFromBase);
  const collegeCostReal = collegeCostNominal / Math.pow(1 + inflationRate, yearsFromBase);
  annualSpend = baseSpend + healthcareDeltaReal + collegeCostReal;
  ```
  The formula is the same as `calc/inflation.js::toReal`. Inline keeps the
  patch self-contained.

**Alternatives considered**:
- **Import `makeInflation` from `calc/inflation.js`** — would require the
  inline engine to go through `window.makeInflation` (exposed by the US1
  bootstrap). Rejected: creates a dependency on module-bootstrap ordering that
  could re-introduce the kind of failure that broke U2B-4a. Keep inline fix
  inline.
- **Refactor overlay calculation into a helper function** (`getRealOverlayCost()`)
  — rejected as premature abstraction for a two-site change. If the overlay
  surface grows, a helper becomes warranted.
- **Fix only healthcare, defer college** — rejected. Both are identical bugs
  with identical fixes and identical test oracles. Splitting adds no safety
  and doubles the review surface.

**Impact**: Expected `fireAge` shift of 0.5–1.5 years earlier on both canonical
input sets (per SC-004 + SC-005). The shift is smaller than the canonical-engine
delta (§C.5 showed +4 RR / +10 Generic) because the canonical engine fixes MORE
than just real/nominal — it also has the typed-shortfall gate (§C.2) and the
contribution-routing adapter (§C.3b). This feature is B1 + B3 only; B2 and
§C.3b stay latent until feature 004 wires up canonical.

---

## R2. B3 fix strategy — Generic solver inclusion of secondary person

**Decision**: Modify Generic's `findFireAgeNumerical()` and its supporting
accumulation / withdrawal loops directly. Add secondary-person handling at
three layers:

1. **Portfolio summation** — initial pool balances in the solver's simulation
   loop sum primary + secondary across all four pool types (`trad401kReal`,
   `rothIraReal`, `taxableStocksReal`, `cashReal`).
2. **Annual contributions** — during accumulation years, the contribution
   amount sums `primary.annualContributionReal + secondary.annualContributionReal`
   (or whatever the Generic form calls these fields).
3. **Social Security** — during retirement years, the SS benefit is the sum
   of primary's benefit at `ssStartAgePrimary` and secondary's benefit at
   `ssStartAgeSecondary`. Each benefit activates at its respective age, so the
   payout curve may have two step-ups.

**Rationale**:
- **Direct solver edit** is the smallest change for the biggest correctness
  win. The fix lives in exactly one function (Generic's solver) plus the
  helper functions it calls.
- **Single-person preservation**: the code guards every secondary reference
  behind a null-check (`secondary?.portfolioReal ?? 0`, etc.). If the Generic
  form has no secondary input (single-person mode), all three layers
  contribute zero and the single-person code path is byte-identical to today.
- **RR is not affected.** RR's `FIRE-Dashboard.html` already reads Roger's
  and Rebecca's combined values through its personalized logic — this bug
  is Generic-specific.

**Alternatives considered**:
- **Port Generic's solver to canonical `calc/fireCalculator.js`** — rejected;
  that's feature 004. This feature intentionally stays inline.
- **Fix only portfolio summation (Option A from the clarification)** —
  rejected per user's Q1 decision to go with Option C (full scope).
- **Add a `secondary` parameter to every helper** — rejected; unnecessary
  API surface change. The secondary values live in the same `inp` shape the
  helpers already receive.

**Impact**: For a two-person canonical input set, doubling secondary's
portfolio MUST change `yearsToFire` by ≥ 1 year (FR-002, SC-002). For a
single-person input set, output is byte-identical (FR-003, SC-003).

---

## R3. Harness-lockstep strategy

**Decision**: Update `tests/baseline/inline-harness.mjs` to mirror the engine
fix **in the same commit** that patches the engine. Update the harness's
`EXPECTED_*` locked constants to the post-fix observed values. Add two new
regression tests in `tests/baseline/inline-harness.test.js`.

**Rationale**:
- **Harness must mirror engine** — the whole point of the harness is to be a
  faithful port of the inline engine's math. If they drift, the harness stops
  being a regression oracle.
- **Same-commit lockstep** — if the engine patch lands without the harness
  patch, the harness starts failing (its EXPECTED_* constants are pinned to
  pre-fix values). That's acceptable mid-commit but we never want a committed
  main-branch state where engine and harness disagree.
- **Two new regression tests**:
  1. **B1 delta in range**: run the harness on the canonical RR input set,
     compute `(preFixFireAge − postFixFireAge)`, assert in `[0.5, 1.5]`.
     Repeat for canonical Generic.
  2. **B3 secondary-person sensitivity**: run the harness on the canonical
     Generic input set with secondary portfolio set to $0 vs $300 k. Assert
     the resulting `yearsToFire` values differ by ≥ 1 year.

**Alternatives considered**:
- **Keep the old harness values and add a transformation layer** — rejected,
  confusing and doesn't signal "the engine itself changed".
- **Only add the two new tests, don't update EXPECTED_***) — rejected; the
  existing locks would fail after the fix, masking whether the fix was
  intentional.

**Impact**: Runner count ticks from 76 → 78 (two new tests). Wall-clock stays
under 1 second. All existing tests GREEN with their locks updated.

---

## R4. Commit structure

**Decision**: Land this feature in **one commit** if possible. If the diff is
too large for comfortable review, split into exactly two commits:

- **Commit 1**: B1 fix + harness mirror + B1 regression test.
  Message: `fix(B1): convert healthcare and college overlays to real dollars in inline engine`.
- **Commit 2**: B3 fix + harness mirror + B3 regression test.
  Message: `fix(B3): include secondary person portfolio, contributions, SS in Generic solver`.

**Rationale**:
- **One commit preferred** because the two bugs share the same harness lock
  update — splitting means commit 1 temporarily breaks the locked values
  until commit 2 lands, which makes bisect less useful.
- **Two-commit fallback** if reviewer fatigue is a concern. Each commit leaves
  the test suite green.

**NOT three commits** (engine + harness + tests), because the dispatch then
has to thread a broken intermediate state through git.

---

## R5. Expected observed post-fix deltas (pre-registered, to be validated)

Pre-registering the deltas here so the implementer has targets to compare
against. These are predictions, not contracts — SC-004 / SC-005 encode the
actual acceptance tolerance.

| Input set | Pre-fix fireAge | Predicted post-fix | Predicted delta |
|---|---|---|---|
| Canonical RR (Taiwan, $60.1 k spend, Roger/Rebecca) | 54 | ~52.5–53.5 | 0.5–1.5 yr earlier |
| Canonical Generic (US, $78 k spend, single or couple) | 65 | ~63.5–64.5 | 0.5–1.5 yr earlier |

If the implementer observes a delta outside these ranges, FR-011 investigation
path triggers.

---

## R6. Out of scope (explicit)

Listed so the implementer does NOT accidentally expand scope:

- **Silent shortfall fix (§C.2 / B2)** — deferred; different bug, different fix
  location, different acceptance criteria.
- **Contribution routing fix (§C.3b)** — that's the canonical engine's default
  60/20/20 vs. inline's explicit $ buckets. Inline already has the buckets;
  the delta exists only against canonical, so no inline fix needed.
- **HTML wire-up to canonical engine** — feature 004.
- **Monte Carlo** — backlog item X1.
- **Secondary-person healthcare cost profile in Generic** — deferred per Q1
  resolution ("healthcare flows through scenario overlays that don't cleanly
  split primary vs secondary").
- **Chart renderer changes, new UI, i18n strings** — explicitly forbidden by
  FR-009.

---

## Summary of decisions

| ID | Area | Decision |
|---|---|---|
| R1 | B1 fix strategy | Inline three-line conversion at overlay-cost-addition sites; no module import |
| R2 | B3 fix strategy | Direct edits to Generic's solver + helpers; null-guarded secondary references preserve single-person path |
| R3 | Harness lockstep | Mirror engine fix in same commit; update EXPECTED_*; add 2 regression tests |
| R4 | Commit structure | One commit preferred; two-commit fallback on reviewer request |
| R5 | Expected deltas | 0.5–1.5 yr earlier on both canonical inputs; outside range triggers FR-011 path |
| R6 | Out of scope | §C.2 shortfall, §C.3b routing, HTML wire-up, Monte Carlo, secondary healthcare, UI changes |

All `NEEDS CLARIFICATION` items from Technical Context are resolved. Ready for
Phase 1.
