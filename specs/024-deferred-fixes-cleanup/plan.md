# Implementation Plan: Deferred Fixes Cleanup

**Branch**: `024-deferred-fixes-cleanup` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/024-deferred-fixes-cleanup/spec.md`

## Summary

Bundle 5 deferred backlog items + 023 docs drift cleanup into one carry-forward feature. Each user story is small (5–60 min CLI work) and largely independent — perfect for multi-wave parallel agent dispatch. Net outcome:

- **Audit hygiene**: 1 LOW finding → 0 (B-022-1 + B-023-6 reconciliation).
- **Display consistency**: every user-facing $ in Book Value frame (B-022-3 closes the last leak — Healthcare cards).
- **Modeling realism**: separable SS COLA (B-023-5) for users planning long horizons.
- **Cleanup**: duplicate translation key fixed (B-022-2); 023 docs drift caught up.

The feature is a "polish + carry-forward fix" pattern matching feature 022's "B-021 carry-forward" wave. Sequencing constraint is minimal: B-022-2 (dedup) and Documentation drift (US6) have zero dependency on the others; B-022-1, B-022-3, B-023-5, B-023-6 each touch their own scoped surface and can ship in parallel.

## Technical Context

**Language/Version**: JavaScript ES2017+ (browser-runnable via classic `<script>`); Node 20 for unit-test runner.
**Primary Dependencies**: Chart.js 4 (CDN); `node:test` built-in. Constitution Principle V — zero-dep delivery preserved.
**Storage**: Browser `localStorage` (existing keys unchanged; B-023-5 adds new `ssCOLARate` key with default = `inflationRate` for backward compat). No migration needed; pre-024 saved states load with default.
**Testing**: `node --test` for unit + audit-harness + meta-tests; manual browser-smoke gate before merge.
**Target Platform**: Modern browsers (Chrome / Firefox / Safari / Edge); `file://` delivery preserved per Principle V.
**Project Type**: Single-file dashboard (no build pipeline); two parallel HTMLs (RR + Generic) maintained in lockstep per Principle I.
**Performance Goals**: ≤16ms / 60fps drag re-render budget per Constitution III. SS COLA scaling adds 1 multiply per retirement-year row × 6 callers × ≤60 retirement years = ~360 multiplies/recalc, negligible. The B-023-6 reconciliation extends `signedLifecycleEndBalance` by ~30 LOC for the spending-floor pass; runtime impact <1ms.
**Constraints**: Lockstep RR + Generic; bilingual EN + zh-TW for new strings; constitution VIII (Spending Funded First) gate green throughout; no new runtime dependencies.
**Scale/Scope**: 6 user stories, ~3-5 hours CLI work, ~5 new + ~3 modified unit tests. Feature 023 was 13 commits + 7 polish; feature 024 estimated ~8-10 commits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Dual-Dashboard Lockstep** | ✅ | Every UI/calc change ships to BOTH HTMLs. B-022-2 dedup applied in both. B-022-3 healthcare cards updated in both. B-023-5 ssCOLARate slider + label in both. B-023-6 simulator reconciliation applies to the inline `signedLifecycleEndBalance` definitions in both. Sentinel grep before each phase commit. |
| **II. Pure Calc Modules with Declared Contracts** | ✅ | No new pure modules — all changes are inline JS. Existing `calc/calcAudit.js` already has cash-flow accounting fields preserved (per 023 phase9f); the only modification adds the `expected` annotation logic to cross-validation warnings. SS COLA logic adds a parameter to `getSSAnnual` (or equivalent), not a new module. |
| **III. Single Source of Truth for Interactive State** | ✅ | `ssCOLARate` is read once in `getInputs()` and threaded through every retirement-loop site. The `expected` annotation on cross-validation warnings is computed once in the audit assembler. |
| **IV. Gold-Standard Regression Coverage** | ✅ | New unit tests for: (a) SS COLA scaling formula `(1 + ssCOLA - inflation)^t`; (b) `_chartFeasibility` quantization stability under ±0.01yr; (c) `signedLifecycleEndBalance` + spending-floor pass parity with chart sim. Existing fixtures with SS-related expectations get `// 024:` annotations where ssCOLA = inflation default keeps values stable. |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ | No new modules; all inline JS. UMD-classic-script pattern unchanged. `file://` delivery preserved. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ | Chart consumers list unchanged. Healthcare cards now read Book Value at age — same pattern as feature 023's audit Book Value sweep. |
| **VII. Bilingual First-Class — EN + zh-TW** | ✅ | New `ssCOLARate` slider gets EN + zh-TW labels. Healthcare card frame suffix gets EN + zh-TW. All keys land in both HTMLs + Translation Catalog. |
| **VIII. Spending Funded First** | ✅ | B-023-6 EXTENDS the signed sim with the spending-floor pass — that's the ONE place this feature touches retirement-strategy logic, and it ADDS Constitution VIII enforcement to the signed sim (which previously lacked it). `tests/unit/spendingFloorPass.test.js` 7/7 stays green; the Strategy Matrix starvation-locus test gains an additional verification that signed sim + chart sim now agree. |
| **IX. Mode and Objective are Orthogonal** | ✅ | No changes to `getActiveSortKey`, `rankByObjective`, or `scoreAndRank` dispatch. B-022-1 quantization extension is an input-conditioning change. `tests/unit/modeObjectiveOrthogonality.test.js` stays green. |

**No constitution violations.** Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/024-deferred-fixes-cleanup/
├── plan.md                   # This file
├── research.md               # Phase 0 — R1-R6
├── data-model.md             # Phase 1 — ssCOLARate schema; expected-flag semantics
├── quickstart.md             # Phase 1 — manual smoke checklist
├── contracts/
│   ├── ssCOLA-scaling.contract.md           # NEW
│   ├── signedSim-spendingFloor.contract.md   # NEW
│   └── healthcare-frame.contract.md         # NEW
├── checklists/
│   └── requirements.md       # Existing (passed validation 2026-05-02)
└── tasks.md                  # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
calc/
├── calcAudit.js              # MODIFIED — cross-validation 'expected' annotation logic (B-023-6 step 2)
└── (others unchanged)

FIRE-Dashboard.html           # MODIFIED:
                              #   - B-022-1: extend Math.floor(age*12)/12 quantization to _chartFeasibility
                              #   - B-022-2: dedup scenario.tax.china in EN block
                              #   - B-022-3: renderHealthcareCard reads Book Value at relevant age
                              #   - B-023-5: ssCOLARate slider DOM + getInputs read; getSSAnnual scales by per-year factor
                              #   - B-023-6: signedLifecycleEndBalance gains spending-floor pass + IRMAA cap logic
FIRE-Dashboard-Generic.html   # MODIFIED — same as RR (lockstep)
FIRE-Dashboard Translation Catalog.md  # MODIFIED — ~5 new bilingual keys
BACKLOG.md                    # MODIFIED — feature 024 entries; close out 023 post-Phase-9 commits properly
specs/023-accumulation-spend-separation/CLOSEOUT.md  # MODIFIED — append 'Post-closeout polish' section
CLAUDE.md                     # MODIFIED — SPECKIT block flipped to 024

tests/
├── unit/
│   ├── ssCOLA.test.js                              # NEW — SS scaling formula tests (~5 cases)
│   ├── chartFeasibility.test.js                    # NEW — quantization stability test (~3 cases)
│   ├── signedSimSpendingFloor.test.js              # NEW — signed sim spending-floor parity (~5 cases)
│   └── (existing tests get // 024: annotations as needed)
└── (audit-harness existing tests — endBalance-mismatch invariant tightened to ≤ 1% threshold)
```

**Structure Decision**: Existing single-project layout extended. No new `calc/*.js` modules; all changes are inline JS in HTMLs OR additions to existing modules (`calc/calcAudit.js` for the `expected` annotation). New unit tests use the existing harness pattern. Lockstep RR + Generic per Principle I. SC-007 gate enforces this via sentinel grep before final commit.

## Phase Plan

| Phase | Scope | Tasks (preview) |
|---|---|---|
| **1** | Setup + verify clean baseline | Confirm 501 tests green on 024 branch (inherits from 023 merge); ensure spec drop-in committed. |
| **2** | Foundational — Phase 0 research | Pin SC-001 metric (E3 LOW count drops to 0); R3 historical COLA reference (~2.4-2.5%/yr range); R5 sim divergence trace methodology + 1% threshold rationale. |
| **3** | US2 — B-022-2 duplicate-key cleanup (P3) | Trivial dedup in both HTMLs. ~5 min. **First parallel-safe task — Wave 1 agent A.** |
| **4** | US6 — Documentation drift cleanup (P3) | BACKLOG.md + 023 CLOSEOUT.md + CLAUDE.md SPECKIT. **Parallel with Phase 3 — Wave 1 agent B.** |
| **5** | US1 — B-022-1 _chartFeasibility quantization (P2) | Find `_chartFeasibility`, apply `Math.floor(age*12)/12` to its inputs; new unit test; verify E3 LOW count drops on RR-pessimistic-frugal. **Parallel with Phase 6, 7, 8 — Wave 2 agent A.** |
| **6** | US3 — B-022-3 healthcare cards Book Value (P2) | `renderHealthcareCard` reads Book Value at relevant age; bilingual frame suffix labels. **Wave 2 agent B.** |
| **7** | US4 — B-023-5 SS COLA decoupling (P2) | New `ssCOLARate` slider + label + persistence; `getSSAnnual` scaling formula; ~5 new unit tests. **Wave 2 agent C — largest piece.** |
| **8** | US5 — B-023-6 sim reconciliation (P2) | 30-min trace to find divergence root cause; annotate <1% as expected; extend `signedLifecycleEndBalance` with spending-floor pass + IRMAA cap. **Wave 2 agent D.** |
| **9** | Polish + audit run + closeout | Full `node --test` sweep; full audit harness run; `audit-report.md`; `CLOSEOUT.md`; `BACKLOG.md` updated; `CLAUDE.md` SPECKIT flipped to AWAITING USER BROWSER-SMOKE; final commit. |
| **10** | **USER GATE** — browser smoke + merge | Manual checklist per `quickstart.md`; user merges to main. |

**Multi-wave parallel dispatch strategy** (per CLAUDE.md "Multi-agent dispatch produces lockstep results when each agent gets the contract path"):

- **Wave 1 (single agent)**: Phases 3 + 4 — single agent does both since each is trivial (~5 min + ~15 min).
- **Wave 2 (4 agents in parallel)**: Phases 5, 6, 7, 8 — 4 agents in parallel, each touching disjoint code regions:
  - Agent A: B-022-1 (calc-engine `_chartFeasibility` only)
  - Agent B: B-022-3 (UI Healthcare cards only)
  - Agent C: B-023-5 (Investment tab + `getSSAnnual` + persistence — new input field)
  - Agent D: B-023-6 (signed sim + audit cross-val annotation — calc + audit infrastructure)

Conflict surface: minimal. B-023-5 and B-023-6 both touch retirement-loop code but at different sites (`getSSAnnual` vs `signedLifecycleEndBalance`). B-022-1 and B-022-3 touch unrelated areas. Manager merges Wave 2 outputs sequentially with grep verification.

## Phase 0: Research (this run produces `research.md`)

The clarifications were resolved during spec drafting (no [NEEDS CLARIFICATION] markers). Phase 0 research consolidates the implementation references:

1. **R1 — `_chartFeasibility` quantization parity**: line-by-line trace of the function's input handling vs `_simulateStrategyLifetime`'s post-022 quantization. Confirm the same `Math.floor(age*12)/12` applies cleanly.
2. **R2 — `scenario.tax.china` duplicate audit**: confirm both HTMLs have the same dedup target. Verify zh-TW value isn't accidentally lost.
3. **R3 — Historical SSA COLA data**: cite SSA's published COLA history for the slider's reasonable-range setting (0%-5%, default = inflationRate). Past 30 years averaged 2.4-2.6%/yr.
4. **R4 — Healthcare card structure**: locate `renderHealthcareCard` in both HTMLs; identify the $ values + their source (today's-$ from country tier OR projected at age 65 OR something else).
5. **R5 — `signedLifecycleEndBalance` divergence trace**: 30-minute exercise running both simulators on RR-baseline; identify FIRST year of divergence; classify root cause (spending-floor pass kick-in vs IRMAA cap).
6. **R6 — `expected` annotation threshold rationale**: 1% threshold defends against spending-floor pass numerical noise without masking real-class bugs (>5% divergences seen in the user's audit dump scenarios). Document the heuristic + future tightening criterion.

## Phase 1: Design & Contracts

Phase 1 outputs (this run):

1. **`research.md`** — R1 through R6 consolidated.
2. **`data-model.md`** — `ssCOLARate` input schema (input field + state object + persistence + audit dump key); `expected` annotation field on `endBalance-mismatch` warning.
3. **`contracts/ssCOLA-scaling.contract.md`** — SS payment formula `basePIA × adjustment(claimAge) × (1 + ssCOLA - inflation)^(age - claimAge)`; per-year scaling per retirement loop iteration.
4. **`contracts/signedSim-spendingFloor.contract.md`** — `signedLifecycleEndBalance` gains spending-floor pass + IRMAA cap; output contract preserved (still returns `{endBalance, minPhase1, minPhase2, minPhase3}`); behavior: post-fix matches chart sim within 1%.
5. **`contracts/healthcare-frame.contract.md`** — healthcare card $ display rules (Book Value at the displayed age range; bilingual frame suffix).
6. **`quickstart.md`** — manual browser-smoke checklist (~6 steps including SS COLA slider behavior, healthcare card frame consistency, audit cross-val warning expected-flag verification).
7. **CLAUDE.md SPECKIT block** updated to reference this plan file.

## Complexity Tracking

*No constitution violations. No complexity entries.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(none)_   | _(none)_                             |
