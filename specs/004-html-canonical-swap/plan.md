# Implementation Plan: HTML Canonical-Engine Swap (U2B-4a revisited)

**Branch**: `004-html-canonical-swap` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-html-canonical-swap/spec.md`

## Summary

Swap both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` from their
inline FIRE-solver helpers to the canonical `calc/*.js` modules, following the
narrow U2B-4a scope: bootstrap + `getCanonicalInputs()` adapter + shimming three
inline solver functions (`yearsToFIRE`, `findFireAgeNumerical`,
`_evaluateFeasibilityAtAge`) + deleting four dead pure-feasibility helpers
(`signedLifecycleEndBalance`, `taxAwareWithdraw`, `isFireAgeFeasible`,
`_legacySimulateDrawdown`). `projectFullLifecycle` stays inline (U2B-4b territory).
Chart renderers stay untouched (U2B-4c territory).

This is a retry of feature 001's reverted U2B-4a. The difference this time:
feature 003's browser smoke harness + GitHub Actions CI catch the class of
failure that killed the prior attempt (canonical throws → classic-script glue
chokes → dashboard freezes on "Calculating…"). Feature 003 also shipped a
prototype adapter marked `TEMPORARY` that this feature replaces with the
production version.

Technical approach: two HTML files edited in lockstep; one new `calc/fireCalculator.js`
export (`evaluateFeasibility`, previously shipped in U2B-4a and reverted);
shims wrap canonical calls in try/catch with documented safe fallbacks
(defense-in-depth against the very failure mode U2B-4a hit). Every commit gated
by the smoke harness — push → CI green → merge.

## Technical Context

**Language/Version**: JavaScript (ES2022, native ES modules). No TypeScript.

**Primary Dependencies**: Chart.js (CDN, existing). Dev-only: `node:test` +
`node:assert/strict` (built-ins). **No new deps.**

**Storage**: N/A. No persistence changes. Feature is purely inline-engine rework.

**Testing**: Existing `bash tests/runner.sh` (80 tests as of main@`f1cd024`).
Expected count after this feature: 80 (no new test files — the existing smoke
harness already covers the canonical pipeline; retargeting its prototype to
production keeps the assertion set identical). The defense-in-depth try/catch
in shims may get ONE additional unit test (optional).

**Target Platform**:
- Local dev: Node 20+ on Windows / macOS / Linux.
- CI: GitHub Actions `ubuntu-latest` with Node 20 (existing workflow from feature 003).
- Runtime: modern browsers (last-two-major Chromium/Firefox/Safari) loaded via
  `file://`.

**Project Type**: In-place refactor of existing single-file-openable dashboards
+ small surface update to `calc/fireCalculator.js` + smoke-harness retarget.

**Performance Goals**: No regression. KPI cards render within 2 seconds of cold
load (SC-001). Test runner stays < 10 s. CI stays < 5 min.

**Constraints**:
- Zero new runtime or dev deps (Principle V).
- Both HTML files move in LOCKSTEP (Principle I); same bootstrap, same adapter
  shape, same shim signatures.
- No modifications to `projectFullLifecycle` or any chart renderer (U2B-4b/c).
- `evaluateFeasibility` may need to be RESTORED in `calc/fireCalculator.js`
  (removed when U2B-4a was reverted in commit `d080a7e`).
- Every commit passes `bash tests/runner.sh` AND the feature 003 CI workflow.
- `tests/baseline/browser-smoke.test.js`'s `_prototypeGetCanonicalInputs` gets
  retired.

**Scale/Scope**:
- 2 HTML files edited (lockstep).
- 1 `calc/*.js` module touched (`calc/fireCalculator.js` — restore `evaluateFeasibility`).
- 1 test file touched (`tests/baseline/browser-smoke.test.js` — retarget to production adapter; delete `_prototypeGetCanonicalInputs`).
- ~600 LoC changed per HTML file (mostly additions for bootstrap + adapter; deletions for the 4 dead helpers partially offset).
- Net LoC: likely +200 to +400 per HTML file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Dual-Dashboard Lockstep (NON-NEGOTIABLE) | ✅ | FR-011 mandates identical structure + lockstep commit. Field-reading divergences in `getCanonicalInputs()` (RR vs Generic form-field names) are the only permitted asymmetry. |
| II. Pure Calculation Modules with Declared Contracts | ✅ | Restoration of `evaluateFeasibility` in `calc/fireCalculator.js` keeps the module pure (no DOM, no Chart.js, no globals); fenced header update documents the new export. Module-boundaries meta-test enforces. |
| III. Single Source of Truth for Interactive State | ✅ | `chartState` unchanged. Solver result still pushes through `chartState.setCalculated`; the only change is WHICH solver produces the result. |
| IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE) | ✅ | Feature 003's smoke harness is the regression gate. Existing `EXPECTED_RR` / `EXPECTED_GENERIC` locks in `inline-harness.mjs` may SHIFT (inline engine unchanged, but canonical-driven KPI display may differ from inline-harness reference values by a small margin — see R3 below). Any lock update gets documented with before/after + rationale. |
| V. Zero-Build, Zero-Dependency Delivery | ✅ | No `package.json`, no new deps. ES modules via `<script type="module">` (pattern already validated by feature 003). CI workflow unchanged. |
| VI. Explicit Chart ↔ Module Contracts | ✅ | Chart renderers untouched. Their Consumers lists stay accurate — they still consume `projectFullLifecycle` output. US4 meta-test check (c) remains skipped pending a later feature. |

**Gate result: PASS.** No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/004-html-canonical-swap/
├── plan.md              # This file
├── research.md          # Phase 0 — key design decisions
├── data-model.md        # Phase 1 — entities (mostly re-using feature 001's + 003's)
├── quickstart.md        # Phase 1 — end-to-end verification recipe (~5 min)
├── contracts/           # Phase 1 — the production adapter + shim signatures
│   ├── adapter.contract.md          # getCanonicalInputs contract
│   └── shims.contract.md            # the three shim functions' contracts
├── checklists/
│   └── requirements.md  # all ✅ post-clarification
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# Runtime (edited in lockstep)
FIRE-Dashboard.html              # RR — bootstrap + getCanonicalInputs + 3 shims + 4 deletions
FIRE-Dashboard-Generic.html      # Generic — same structure, Generic-specific field names

# Canonical engine (minimal touch)
calc/fireCalculator.js           # RESTORE evaluateFeasibility export (pure helper)

# Test infrastructure (retarget, not expand)
tests/baseline/browser-smoke.test.js   # Replace _prototypeGetCanonicalInputs call with production getCanonicalInputs import

# Unchanged in this feature
calc/lifecycle.js                # U2B-4b territory
calc/{tax,withdrawal,socialSecurity,healthcare,mortgage,college,secondHome,studentLoan,inflation,chartState}.js
tests/baseline/rr-defaults.mjs   # unchanged (cold-load form values)
tests/baseline/generic-defaults.mjs
tests/baseline/inline-harness.mjs   # may need EXPECTED_* update if display numbers shift
tests/baseline/inline-harness.test.js
tests/unit/*.test.js
tests/meta/*.test.js
tests/fixtures/*.js
.github/workflows/tests.yml      # feature 003; unchanged
FIRE-Dashboard Translation Catalog.md
FIRE-snapshots.csv
```

**Structure Decision**: In-place refactor with a tightly-bounded touch surface.
Two HTML files + one calc module + one test file. No new directories; no new
categories of file. The tightest possible shape for the scope.

## Complexity Tracking

*No violations. Section intentionally empty.*
