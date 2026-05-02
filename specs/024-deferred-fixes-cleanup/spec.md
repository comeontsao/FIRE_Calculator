# Feature Specification: Deferred Fixes Cleanup

**Feature Branch**: `024-deferred-fixes-cleanup`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Bundle 5 deferred backlog items (B-022-1, B-022-2, B-022-3, B-023-5, B-023-6) plus 023 docs drift cleanup into a carry-forward feature"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Strategy ranker stability under ±0.01yr perturbations (B-022-1, Priority: P2)

A user opens the dashboard and the strategy ranker reports a winner. The audit-harness E3 invariant runs ±0.01yr / ±$1 perturbations on every persona to verify the ranker is stable under tiny input noise. Pre-feature-024, one persona (`RR-pessimistic-frugal`) still triggers an E3 LOW finding because `_chartFeasibility` calls `projectFullLifecycle(inp, ...)` with non-quantized fireAge inputs — the strategy ranker's quantization (shipped in 022 US5) only covered `_simulateStrategyLifetime`, not `_chartFeasibility`. After this fix, the same monthly-precision quantization extends to `_chartFeasibility` and the residual finding clears. E3 LOW count drops 1 → 0.

**Why this priority**: Audit hygiene; affects 1 persona out of 92. Not a user-visible bug per se but it muddies the audit-harness signal. Easy fix that closes the feature 022 carry-forward cleanly.

**Independent Test**: Run audit harness on RR-pessimistic-frugal persona before fix → 1 E3 LOW finding. After fix → 0 findings. Total audit findings drop from 1 LOW (post-022 baseline) to 0.

**Acceptance Scenarios**:

1. **Given** the audit harness is run on all 92 personas, **When** E3 invariant evaluates RR-pessimistic-frugal under ±0.01yr perturbation, **Then** the strategy ranker produces the SAME winner before and after the perturbation (no flip).
2. **Given** the same harness run, **When** the total LOW finding count is computed, **Then** it equals 0 (down from 1 in feature 022 baseline).

---

### User Story 2 — Pre-existing duplicate-key cleanup (B-022-2, Priority: P3)

The `scenario.tax.china` translation key is defined twice in the EN block of `FIRE-Dashboard.html` — line 5940 has a zh-TW string assigned to the EN key, and line 5941 has the EN string. The second assignment wins, so the visible behavior is correct, but the duplicate is a latent bug that will surface if anyone reorders or removes either line. Generic dashboard may have the same issue (audit during fix).

**Why this priority**: Trivial cleanup. No user-visible behavior change. ~5 min fix. Bundled here because it's been carried forward through three features.

**Independent Test**: `grep -c "'scenario.tax.china':" FIRE-Dashboard.html` returns 1 EN occurrence + 1 zh occurrence (= 2 total), not 3. Same for Generic.

**Acceptance Scenarios**:

1. **Given** the EN translation block, **When** scanning for `scenario.tax.china`, **Then** exactly one assignment exists.
2. **Given** the user toggles between EN and 中文, **When** the China scenario is rendered, **Then** the tax note displays correctly in both languages (no regression from the dedup).

---

### User Story 3 — Healthcare delta chart frame consistency (B-022-3, Priority: P2)

The `renderHealthcareCard` function outputs HTML cards (NOT Chart.js) showing today's-$ healthcare costs as a user reference. Currently displays values in real-$ frame while the rest of the dashboard shows Book Value (= "real money" per user terminology). This creates a frame mismatch the user has explicitly flagged as confusing.

**Why this priority**: User-facing display inconsistency. Same class of bug as audit-tab Book Value sweep (shipped in 023 phase9g). Per the user's terminology rule, ALL user-facing $ values should be in Book Value frame; only chart tooltips show "purchasing power" companion line.

**Independent Test**: Open Geography tab → Healthcare. Each card's $ amount should match what the Lifecycle chart's tooltip shows for healthcare-related withdrawal at the equivalent age (in Book Value frame).

**Acceptance Scenarios**:

1. **Given** the user is on Geography tab, **When** they view the Healthcare cards (pre-65 + post-65 cost references), **Then** the displayed $ amounts are in Book Value frame at the relevant age (pre-65 ≈ currentAge to age 65; post-65 ≈ age 65+).
2. **Given** the user toggles country tier, **When** healthcare cards re-render, **Then** the new amounts are also in Book Value frame at the same ages.
3. **Given** EN ↔ 中文 toggle, **When** healthcare cards render, **Then** EN shows "$X (Book Value)" and zh-TW shows "$X (帳面價值)" or equivalent.

---

### User Story 4 — SS COLA decoupling from inflationRate (B-023-5, Priority: P2)

A user wants to model a more conservative Social Security outcome where COLA lags inflation slightly (historical SSA COLA ~2.4–2.5%/year vs CPI ~2.6–3.0%/year). Currently, the dashboard implicitly assumes `ssCOLA = inflationRate`, which means SS payments hold purchasing power perfectly across retirement. This is mildly optimistic; users planning retirement decades out would benefit from being able to dial in a different COLA assumption.

After this feature, the Investment tab gains a new `ssCOLARate` slider (default = current `inflationRate` value to preserve existing behavior). Setting `ssCOLARate < inflationRate` produces SS payments that erode in real terms over the retirement horizon — visible on the Withdrawal Strategy chart's blue (SS) bars showing slower growth in nominal-$ Book Value.

**Why this priority**: Adds modeling realism. Backward-compatible (default preserves current behavior). Real value to users planning 30+ year retirements.

**Independent Test**: Set `ssCOLARate = 2.5%` and `inflationRate = 3.0%`. Verify retirement-phase SS payments grow at 2.5%/year nominal (not 3.0%). At age 100 (30 years post-claim at age 70), SS Book Value = `basePIA × 1.025^30` instead of `basePIA × 1.03^30` — about 13% lower in nominal terms.

**Acceptance Scenarios**:

1. **Given** `ssCOLARate = inflationRate` (default), **When** user views the Withdrawal Strategy chart, **Then** SS bars grow at the same rate as before this feature (no behavior change).
2. **Given** `ssCOLARate = 2.5%` and `inflationRate = 3.0%`, **When** user views the chart, **Then** SS bars grow more slowly than inflation, visibly shrinking in real-$ terms across retirement.
3. **Given** the same setup, **When** user clicks Copy Debug, **Then** the JSON dump exposes `ssCOLARate` as a top-level input.

---

### User Story 5 — Chart-vs-signed-sim end-balance reconciliation (B-023-6, Priority: P2)

The dashboard's audit cross-validation surfaces a warning when the `signed-sim end balance` differs from the `chart-sim end balance`. Cross-scenario observation shows the divergence is **scenario-dependent**: 3% delta on feasible Safe-mode scenarios, up to 64% on tight DWZ scenarios. Root cause hypothesis: the chart sim applies the spending-floor pass + IRMAA cap (Constitution VIII) which can override the simulator's "natural" withdrawal computation, while the signed sim runs the unclamped withdrawal logic.

**Why this priority**: The warning correctly catches genuine math divergences but currently flags ALL non-zero deltas, including small (<1%) divergences that are expected by design. This noise makes the warning useless as a real-bug signal. After this feature, small divergences are auto-annotated as `expected: true`, and large divergences (>1%) get reconciled by extending the signed sim with the missing logic.

**Independent Test**: Add per-year divergence trace logging in both simulators on RR-baseline. Identify the first year of divergence. Annotate divergences <1% of total as `expected: true` in cross-validation warnings. For divergences >1%, extend `signedLifecycleEndBalance` to apply spending-floor pass + IRMAA cap so post-fix divergence falls below 1%.

**Acceptance Scenarios**:

1. **Given** the user runs Copy Debug on a feasible Safe-mode RR-baseline persona, **When** the cross-validation warnings are inspected, **Then** the small (<1%) end-balance divergence is annotated `expected: true` and not flagged as suspicious.
2. **Given** the same persona, **When** the divergence is >1%, **Then** the signed sim post-fix matches the chart sim within 1%.
3. **Given** all 92 personas in the audit harness, **When** the cross-validation invariant runs, **Then** zero unexpected divergences (>1% AND not `expected: true`) are reported.

---

### User Story 6 — Documentation drift cleanup (Priority: P3)

`BACKLOG.md` and `CLOSEOUT.md` reflect feature 023 only through Phase 9. The 7 post-Phase-9 polish commits (`7694c1f` → `2f64c1a`) materially changed user-facing behavior (FIRE NUMBER reframe, Year-by-Year Cash Flow audit section, comprehensive Book Value sweep) but are not documented in either file. CLAUDE.md SPECKIT block also has stale commit hashes.

**Why this priority**: Hygiene only; no user-facing impact. Bundled here so the feature 024 commit history captures both the carry-forward fixes AND the docs catch-up cleanly.

**Independent Test**: After feature 024, `BACKLOG.md` "Done in feature 023" section should mention all 7 post-Phase-9 commits + the 4 follow-up B-023-* items. `CLOSEOUT.md` should have a "Post-closeout polish" appendix.

**Acceptance Scenarios**:

1. **Given** a reader opens `BACKLOG.md`, **When** they read "Done in feature 023", **Then** they see all major user-facing behavior changes including FIRE NUMBER reframe, Audit Year-by-Year Cash Flow section, and comprehensive Book Value sweep.
2. **Given** a reader opens `specs/023-accumulation-spend-separation/CLOSEOUT.md`, **When** they read past the original Phase 9 section, **Then** they see a "Post-closeout polish" appendix listing the 7 follow-up commits with their rationale.

---

### Edge Cases

- **B-022-1**: `_chartFeasibility` is called for non-default strategies (when user previews a Roth-ladder run). The fix must preserve all existing behavior for the default `bracket-fill-smoothed` path.
- **B-022-2**: Generic dashboard might have the same duplicate. Audit during fix.
- **B-022-3**: Healthcare cards exist on multiple sub-tabs (Geography → Country card; Geography → Healthcare deep-dive). All instances need updating.
- **B-023-5**: When `ssCOLARate > inflationRate`, SS gains real purchasing power over retirement (anti-historical but mathematically valid). System must allow this and not clamp.
- **B-023-5**: Persisting `ssCOLARate` to localStorage; new key requires versioning so pre-024 saved states load with `ssCOLARate = inflationRate` default.
- **B-023-6**: After reconciliation, the existing audit-harness `cross-chart-consistency` invariant might need its tolerance threshold updated.

## Requirements *(mandatory)*

### Functional Requirements

#### B-022-1 — `_chartFeasibility` simulator-discreteness

- **FR-001**: System MUST extend the monthly-precision quantization (`Math.floor(age * 12) / 12`) used in `_simulateStrategyLifetime` (feature 022 US5) to `_chartFeasibility` so that ±0.01yr perturbations of fireAge produce stable strategy-ranker output.
- **FR-002**: Audit harness E3 invariant MUST report 0 findings on `RR-pessimistic-frugal` persona post-fix (down from 1 in feature 022 baseline).

#### B-022-2 — Duplicate-key cleanup

- **FR-003**: `scenario.tax.china` MUST be defined exactly once in the EN translation block of `FIRE-Dashboard.html` and exactly once in the zh translation block.
- **FR-004**: Same constraint applied to `FIRE-Dashboard-Generic.html`.
- **FR-005**: Visible behavior of the China scenario tax note MUST be unchanged in EN AND zh-TW.

#### B-022-3 — Healthcare delta chart frame

- **FR-006**: Healthcare cost cards MUST display values in Book Value frame at the relevant age (pre-65 = currentAge transition; post-65 = age 65 onward).
- **FR-007**: Card column headers MUST display "(Book Value)" suffix or equivalent frame label.
- **FR-008**: EN + zh-TW both ship with frame-suffix translations.

#### B-023-5 — SS COLA decoupling

- **FR-009**: System MUST add `ssCOLARate` slider to the Investment tab with default = `inflationRate` slider's value (to preserve current behavior on initial load).
- **FR-010**: Default range: 0% to 5% (inclusive) with step 0.5%.
- **FR-011**: System MUST update `getSSAnnual` (or equivalent SS-payment calculator) to scale base PIA by `(1 + ssCOLARate − inflationRate)^(age − claimAge)` for each retirement year.
- **FR-012**: When `ssCOLARate < inflationRate`, retirement SS payments visibly decline in real-$ terms across retirement (chart shows SS bars growing slower than the inflation rate).
- **FR-013**: When `ssCOLARate >= inflationRate`, SS payments hold or gain purchasing power.
- **FR-014**: New input MUST persist to localStorage with new key `ssCOLARate` (version-bumped); pre-024 saved states load with `ssCOLARate = inflationRate` default.
- **FR-015**: Audit dump (Copy Debug) MUST expose `ssCOLARate` as a top-level input.
- **FR-016**: Bilingual EN + zh-TW labels for the new slider.

#### B-023-6 — Chart-vs-signed-sim reconciliation

- **FR-017**: System MUST trace per-year divergence between `signedLifecycleEndBalance` and `projectFullLifecycle` end balances on each persona × mode combination.
- **FR-018**: Cross-validation warnings with end-balance divergence < 1% of the chart-sim total MUST be auto-annotated `expected: true`.
- **FR-019**: For divergences ≥ 1%, system MUST extend `signedLifecycleEndBalance` to apply the spending-floor pass + IRMAA cap (Constitution VIII) so the post-fix divergence falls below 1%.
- **FR-020**: Audit-harness invariant `endBalance-mismatch` MUST report 0 unexpected (>1% AND `expected: false`) divergences across all 92 personas after fix.

#### Documentation drift

- **FR-021**: `BACKLOG.md` "Done in feature 023" section MUST list all 7 post-Phase-9 commits with one-line summaries.
- **FR-022**: `specs/023-accumulation-spend-separation/CLOSEOUT.md` MUST gain a "Post-closeout polish" appendix listing the same 7 commits with rationale.
- **FR-023**: `CLAUDE.md` SPECKIT block MUST be updated to reflect 024 as the active feature.

#### Cross-cutting

- **FR-024**: Both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` MUST be modified in lockstep per Constitution Principle I.
- **FR-025**: Constitution VIII gate (`spendingFloorPass.test.js`) MUST stay green throughout (7/7).
- **FR-026**: All new UI strings MUST ship with EN + zh-TW translations + Translation Catalog entries per Constitution VII.
- **FR-027**: Audit-harness 92-persona suite MUST report ≤ 0 LOW findings (down from 1 LOW in feature 023 baseline) post-feature-024.

### Key Entities

- **`ssCOLARate`** (new): A real-$ scalar (0%–5%, default = `inflationRate`). Stored in `inp` object + localStorage. Drives SS payment scaling per retirement year.
- **`expected` field on `endBalance-mismatch` warning**: Boolean. `true` for divergences <1% of total; `false` for genuine bugs requiring investigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (B-022-1)**: Audit harness LOW findings drop from 1 to 0 (specifically the E3 finding on `RR-pessimistic-frugal`).
- **SC-002 (B-022-2)**: `grep -c "'scenario.tax.china':"` in each HTML returns exactly 2 (one EN block + one zh block); no duplicates.
- **SC-003 (B-022-3)**: Healthcare card $ values match Lifecycle chart values at the corresponding age within $1 (in Book Value frame).
- **SC-004 (B-023-5)**: User can dial `ssCOLARate = 2.5%` and observe the Withdrawal Strategy chart's SS bars growing at 2.5% nominal/yr instead of 3% — a 13% lower SS at age 100 (30 years post-age-70 claim) compared to the inflationRate-coupled baseline.
- **SC-005 (B-023-6)**: Cross-validation `endBalance-mismatch` divergence on all 92 personas × 3 modes is either <1% or annotated `expected: true`. Zero unexpected mismatches.
- **SC-006 (Documentation)**: `BACKLOG.md` and `CLOSEOUT.md` are updated to reflect the 7 post-Phase-9 commits from feature 023.
- **SC-007 (Lockstep)**: Sentinel grep verifies all changes ship in both HTMLs.
- **SC-008 (No regressions)**: Test totals at closeout: ≥501 passing, 1 intentional skip, 0 failures.
- **SC-009 (Constitution VIII)**: `spendingFloorPass.test.js`: 7/7 green throughout all phases.

## Assumptions

- Feature 023 has merged to main (commit `9c08b4c`); feature 024 branches from main directly.
- B-022-3's frame decision: convert to Book Value (consistent with feature 022's user-facing terminology). Alternative options (frame note tooltip, leave as today's-$) were considered and rejected because the user explicitly stated "I need to read the Real Value of the money, not the buying power" during feature 023.
- B-023-5's slider default (= `inflationRate`) preserves all existing behavior; users opting in to the new behavior do so by adjusting the slider.
- B-023-6's 1% threshold for "expected" divergence is heuristic but defensible — it catches genuine ~5-65% bugs while filtering out spending-floor-pass numerical noise. Future tightening to 0.5% if needed.
- Feature 024 stays in scope of cleanup/carry-forward; new functionality (e.g., new charts, new strategies) is OUT OF SCOPE.
- Constitution principles I (lockstep), II (pure modules), III (single source of truth), VI (chart↔module contracts), VII (bilingual EN+zh-TW), VIII (Spending Funded First), IX (Mode/Objective orthogonality) are unchanged.
