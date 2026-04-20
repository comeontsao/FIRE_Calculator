# Feature Specification: Inline Engine Bugfix (B1 + B3)

**Feature Branch**: `002-inline-bugfix`
**Created**: 2026-04-19
**Status**: Draft
**Input**: User description: "Patch the inline dashboard engine directly to fix two audit-identified correctness bugs from BACKLOG.md — B1 (real/nominal dollar mixing in healthcare and college cost projections) and B3 (Generic's FIRE solver ignoring the secondary person's portfolio) — as fast wins, without waiting on the full canonical-engine HTML wire-up scheduled for feature 004."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Couples using Generic see their combined wealth, savings, and Social Security reflected in FIRE calculations (Priority: P1)

A couple using `FIRE-Dashboard-Generic.html` to plan together enters their household as two people with combined portfolios, combined annual contributions, and separate Social Security claim ages. Changes to any of these on the secondary person — portfolio balance, annual contribution amount, or SS start age — materially change the household's FIRE age and retirement projection. Before this fix, the Generic solver only counted the primary person — the secondary person's wealth, savings, and SS benefit were invisible to the math, making Generic effectively single-person only for couples.

**Why this priority**: This is the most user-visible of the two bugs. A couple entering $300 k in the spouse's 401(k) and observing zero change to "Years to FIRE" will rightly conclude the tool is broken. The fix is narrowly scoped (the solver function plus the retirement-phase SS handling) and can ship without the larger HTML wire-up.

**Independent Test**: Open `FIRE-Dashboard-Generic.html`, enter a two-person household with $500 k in the primary person's portfolio and $0 in the secondary's. Note `yearsToFire`. Add $300 k to the secondary person's taxable-stocks field. Confirm `yearsToFire` drops by ≥ 1 year. Then set the secondary's annual 401(k) contribution to $10 k — confirm `yearsToFire` drops further. Then change `ssStartAgeSecondary` from 67 to 70 — confirm a measurable impact on the post-67 retirement projection (end-balance curve shifts).

**Acceptance Scenarios**:

1. **Given** Generic with primary $500 k + secondary $0 + annual spend $60 k, **When** the user increases secondary's taxable stocks to $300 k, **Then** `yearsToFire` decreases by ≥ 1 year (currently: no change).
2. **Given** Generic with primary $500 k + secondary $500 k (matched portfolios), **When** the user compares against primary $1 000 k + secondary $0 (same total), **Then** `yearsToFire` is within ± 1 year across the two configurations (proves both portfolios are actually summed, not double-counted).
3. **Given** Generic with primary contributing $15 k/yr + secondary contributing $0, **When** the user changes secondary's annual contribution to $15 k, **Then** `yearsToFire` decreases measurably (both contributions now accrue during accumulation).
4. **Given** Generic with both people past FIRE age and in retirement phase, **When** the user changes `ssStartAgeSecondary` from 67 to 70, **Then** the end-balance projection shifts — secondary's SS benefit starts later and is larger per year when it arrives.
5. **Given** a single-person household in Generic (secondary fields blank or zero), **When** the solver runs, **Then** the result is identical to today's output (no regression for single-person users).

---

### User Story 2 - Healthcare and college costs no longer artificially inflate FIRE age (Priority: P1)

Roger & Rebecca's dashboard (RR) and the Generic dashboard project retirement-phase spending that includes healthcare cost adjustments (pre-65 ACA, post-65 Medicare, country-specific overrides) and college-year expenses. Before this fix, those overlay costs were added to the projection as **nominal dollars** while the accumulation and withdrawal math used **real (inflation-adjusted) dollars**. The mismatch inflates real-dollar spending over time and pushes FIRE age ~1 year later than the underlying plan actually requires.

**Why this priority**: Same P1 as US1. Users are seeing a FIRE age that's worse than their real plan supports. The fix is a small change at the two cost-application boundaries, contained to ~50 lines of inline code across both HTML files.

**Independent Test**: With a canonical RR input set (documented in `baseline-rr-inline.md §A`), run the inline engine before and after the fix via `tests/baseline/inline-harness.mjs`. Confirm `fireAge` decreases by approximately 1 year (within ± 1). Confirm the shape of the projection — no chart series suddenly goes discontinuous or NaN.

**Acceptance Scenarios**:

1. **Given** the canonical RR input set, **When** the inline harness runs with the fix applied, **Then** `fireAge` is approximately 1 year earlier than today's baseline (within the ±1-year tolerance documented in `baseline-rr-inline.md §C.1`).
2. **Given** the canonical Generic input set, **When** the inline harness runs with the fix applied, **Then** `fireAge` is approximately 1 year earlier than today's baseline.
3. **Given** an input set with zero healthcare override and no kids (no college costs), **When** the inline harness runs, **Then** the fix produces byte-identical output to today's baseline (no regression on inputs that don't exercise the fix).
4. **Given** an input set with a large healthcare override (e.g., $2 000 / month), **When** the inline harness runs, **Then** the post-fix `endBalanceReal` differs from today's baseline, confirming the fix engages on large-delta inputs.

---

### User Story 3 - Regression harness locks the fixed behavior permanently (Priority: P2)

A future developer (human or agent) modifying the inline engine triggers the baseline regression test. If they accidentally re-introduce either bug, the test fails immediately and explicitly — identifying which bug came back. Today, without the harness's post-fix values locked, a regression in the inline engine could silently ship.

**Why this priority**: Essential for the fix to stay fixed, but lower than P1 because the user-visible value comes from US1 and US2; this is belt-and-suspenders.

**Independent Test**: Run `bash tests/runner.sh`. The `tests/baseline/inline-harness.test.js` file includes locked post-fix values for both canonical input sets; any deviation from those values fails the test with a clear message naming the affected metric.

**Acceptance Scenarios**:

1. **Given** the inline engine with the B1 + B3 fixes applied, **When** `node --test tests/baseline/` runs, **Then** all existing baseline tests pass AND two new regression tests (one per bug) pass with descriptive names.
2. **Given** a developer reverts the B3 fix (reintroducing the secondary-person omission), **When** the runner runs, **Then** the B3 regression test fails with a message naming the offending metric ("secondary-person portfolio has no effect on yearsToFire").

---

### Edge Cases

- **Single-person Generic**: the B3 fix must not regress single-person output. Secondary fields blank/zero behave exactly as today.
- **Zero healthcare override**: users who don't override healthcare (using scenario defaults) see unchanged output for the healthcare path, since the scenario defaults are already consistent units within themselves.
- **Large healthcare delta**: users applying aggressive country-override healthcare (e.g., $3k+ monthly) see the fix engage most visibly — the nominal-vs-real error compounds over 20–30 years.
- **Kids currently in college**: college costs applied during accumulation years (not just retirement) must also route through the real-dollar fix. The `computeCollegeCosts` canonical module already does this; the inline equivalent must match.
- **Mixed-age couple**: in Generic, a couple with different ages (e.g., 42 and 38) correctly sums both portfolios but computes FIRE age relative to the primary person's age (same semantics as today for single-person).
- **Backwards-compatibility of the harness**: `baseline-rr-inline.md §A` and `§B` observed values were captured pre-fix. Once the fix lands, those observed values shift. The harness file (`tests/baseline/inline-harness.mjs`) uses locked constants — those must be updated to the post-fix values and the ~1-year shift documented.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a two-person household is entered on `FIRE-Dashboard-Generic.html`, the FIRE solver MUST include the secondary person's portfolio values (trad-401(k), Roth-IRA, taxable stocks, cash) in the accumulation-pool base and the retirement-phase withdrawal pool.
- **FR-002**: Doubling the secondary person's portfolio balance on Generic MUST produce a measurable change in `yearsToFire` (at least ≥ 1-year change, in the direction the math predicts).
- **FR-003**: Single-person input on Generic (secondary fields blank or zero) MUST produce byte-identical output to the pre-fix behavior. No regression for single-person users.
- **FR-004**: Healthcare cost overlays (pre-65 ACA, post-65 Medicare, country-specific overrides, monthly dollar inputs) applied during the retirement phase MUST be treated as **real** (inflation-adjusted) dollars at the point of addition to spend, matching the dimensionality of the accumulation-phase real-return projection.
- **FR-005**: College cost overlays applied during either accumulation or retirement phases MUST be treated as **real** dollars consistently with FR-004.
- **FR-006**: Input sets with zero healthcare override and no kids MUST produce byte-identical output to pre-fix behavior (proves the real/nominal fix engages only when the relevant overlays are non-zero).
- **FR-007**: The inline-engine Node harness (`tests/baseline/inline-harness.mjs` and `inline-harness.test.js`) MUST be extended with locked post-fix expected values for both canonical input sets. A reverted fix MUST cause a named test to fail.
- **FR-008**: Both `FIRE-Dashboard.html` (RR) and `FIRE-Dashboard-Generic.html` MUST receive the FR-004 + FR-005 real/nominal fix in the same commit (Principle I lockstep), applied to the same functions in each file modulo the RR/Generic divergence already documented in `baseline-rr-inline.md`.
- **FR-009**: The fixes MUST NOT change any chart-renderer interface, any DOM element id, or any event wiring. Pure calc-layer changes only — user-visible effect is limited to number shifts in KPI cards and chart data, not layout or interaction.
- **FR-010**: Generic's FIRE solver MUST include the secondary person's (a) portfolio values (trad-401(k), Roth-IRA, taxable stocks, cash), (b) annual contributions to 401(k) and taxable stocks during accumulation, and (c) Social Security benefit starting at `ssStartAgeSecondary` during retirement. Secondary-person healthcare cost profile is NOT in scope for this feature (explicit deferral; tracked for a future bugfix feature if user behavior indicates it matters).
- **FR-011**: The B1 real/nominal fix MUST produce a `fireAge` delta in the range **[0.5, 1.5] years earlier** compared to the pre-fix baseline, measured against both the canonical RR and canonical Generic input sets. A delta outside this range is NOT an automatic fail — it requires the implementer to investigate and document the cause in the commit message (too-small typically means the fix didn't engage the right codepath; too-large typically means the fix absorbed another unrelated bug). After investigation, the implementer EITHER ships with an explanation of why the out-of-range delta is correct, OR adjusts the fix scope to bring the delta back into range.

### Key Entities *(include if feature involves data)*

- **CanonicalRRInput, CanonicalGenericInput**: the two input sets from `baseline-rr-inline.md` Section A and Section B. These already exist as `tests/baseline/inputs-rr.mjs` and `inputs-generic.mjs`. They are the test oracles for regression.
- **Post-fix observed values**: the new values `fireAge`, `yearsToFire`, `endBalanceReal`, `balanceAtUnlockReal`, `balanceAtSSReal` for both input sets, captured by running the fixed harness. These become locked constants in `tests/baseline/inline-harness.test.js` and are documented as the new baseline in `baseline-rr-inline.md` (Section D — post-fix observed).
- **Delta attribution**: for each fix, a human-readable note recording "this is what we expect shifted, by how much, why" — surfaced in the commit message body and in the updated baseline doc.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user adjusting the secondary person's 401(k) on `FIRE-Dashboard-Generic.html` observes a change in "Years to FIRE" within 1 animation frame of the change. (Verified by opening the dashboard and performing the adjustment.)
- **SC-002**: On the canonical Generic input set, doubling the secondary person's portfolio changes `yearsToFire` by ≥ 1 year. (Verified via the harness test.)
- **SC-003**: Single-person Generic users see identical numbers before and after the fix. (Verified by a harness test locking pre-fix single-person output.)
- **SC-004**: On the canonical RR input set, `fireAge` shifts by **0.5 to 1.5 years earlier** after the B1 fix. Actual shift recorded in the commit message and `baseline-rr-inline.md §D`. A shift outside this range triggers the FR-011 investigation path.
- **SC-005**: On the canonical Generic input set, `fireAge` shifts by **0.5 to 1.5 years earlier** after the B1 fix (same tolerance as SC-004).
- **SC-006**: Input sets with zero healthcare override and no kids produce byte-identical output before and after the fix.
- **SC-007**: The automated test runner reports at least two new regression tests (one for B1, one for B3), both green after the fix, both descriptively named ("B1 real/nominal healthcare fix engaged on canonical RR", "B3 Generic solver includes secondary portfolio").
- **SC-008**: An independent reviewer can open the commit diff and locate each fix in under 60 seconds — the fixes are narrowly scoped and self-documenting via comments.
- **SC-009**: No chart renderer, no DOM id, no event handler, no i18n string changes in the diff. The fix is calc-layer-only.

## Assumptions

- **The canonical calc engine under `calc/` is NOT authoritative for the dashboard** at the time this feature ships. `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` still run on their inline engines. This feature does not change that; it patches the inline engines in place. The eventual HTML-wire-up to canonical (feature 004 per `BACKLOG.md`) replaces these patches, at which point the fixed canonical math takes over.
- **The inline-harness remains the oracle**. `tests/baseline/inline-harness.mjs` is a port of the inline engine, not a separate codebase. When the inline engine gets patched, the harness is patched in lockstep to mirror the same math, and the locked expected values shift to post-fix.
- **No new runtime dependencies**. Principle V (zero-build) remains intact. All edits are inline JavaScript within the existing HTML files and the existing harness.
- **Lockstep applies** (Principle I). The real/nominal fix lands in both HTML files in one commit; the Generic secondary-person fix is Generic-only by construction but documented in the same commit or a tightly-paired follow-up.
- **i18n scope**: the fix introduces no new user-visible strings. Translation catalog is untouched.
- **Test tooling**: dev-only Node built-ins (`node:test`, `node:assert/strict`). No Playwright, no installed deps.
- **Secondary-person scope for B3 (per Q1 resolution)**: this feature covers (a) portfolio pools, (b) annual contributions during accumulation, (c) Social Security benefit at `ssStartAgeSecondary`. Secondary-person healthcare cost profile is EXPLICITLY OUT OF SCOPE and deferred to a future bugfix if needed — rationale: healthcare is already routed through the scenario/country overlay system which doesn't cleanly separate primary vs secondary anyway, and correcting it requires a broader design discussion.
- **Audit traceability**: the bugs B1 + B3 originate from the April 2026 audit recorded in `specs/001-modular-calc-engine/baseline-rr-inline.md §C`. This feature's tests and commit messages reference §C.1 (B1) and §C.3 (B3) by name.
- **Merge target**: this feature merges to `main`. Feature 001 is already merged at `2ae5e0c`. Feature 002 builds on that base.
