# Implementation Plan: Calculation Audit View

**Branch**: `014-calc-audit` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-calc-audit/spec.md`

## Summary

Add a new **Audit** top-level tab (5th, after History) to both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` that exposes every step of the lifecycle calculation pipeline. The tab opens with a horizontal flow diagram (Inputs → Spending → Gates → FIRE Age → Strategy Ranking → Lifecycle), then renders 7 detail sections each with a chart visualization AND a precise data table. The same data ships under a new `audit` key in the existing Copy Debug payload.

This is a **pure observability layer** — no calc-engine logic is modified (FR-029, FR-030, SC-008). The audit assembler is a new pure module `calc/calcAudit.js` that consumes outputs from existing functions (`projectFullLifecycle`, `signedLifecycleEndBalance`, `_lastStrategyResults`, etc.) and produces an `AuditSnapshot`. The HTML files render this snapshot through one new pill in the existing tabRouter (feature 013) and ~10–14 small Chart.js instances, lazy-rendered only when the Audit tab is active.

## Technical Context

**Language/Version**: JavaScript (ES2020+), HTML5, CSS3 — single-file HTML app
**Primary Dependencies**: Chart.js (existing, loaded from CDN). No new runtime dependencies.
**Storage**: None new. Audit reads from existing in-memory state (`_lastStrategyResults`, `_calculatedFireAge`, etc.) and existing localStorage keys (read-only); does not introduce its own persistence.
**Testing**: Node `--test` for the new pure assembler `calc/calcAudit.js`; Playwright for E2E (existing infra from features 011/013).
**Target Platform**: Modern browsers (Chrome / Edge / Firefox / Safari), desktop + mobile (≤767px), file:// supported.
**Project Type**: Single-file HTML web application — zero build step (Constitution V).
**Performance Goals**: +<100ms recalc when Audit tab is active (FR-027 / SC-006); 0ms overhead when other tabs are active because chart rendering and the largest table-build step are deferred to first Audit-tab activation (FR-028).
**Constraints**: Zero calc-engine modifications (FR-029, SC-008 verifiable via `git diff`). Lockstep across both HTML files (Principle I). Bilingual EN + zh-TW for every new user-visible string (Principle VII). Reuses Chart.js — no new chart library or visualization runtime.
**Scale/Scope**: 1 new top-level tab, 8 sections (1 flow diagram + 7 detail), ~10–14 small Chart.js instances (1 input pie, 1 spend curve, 3 gate trajectories, 1 FIRE-age scatter, 1 strategy bar, 1 lifecycle thumbnail, 0..N cross-validation dual-bars), 1 new pure module (`calc/calcAudit.js`), ~35–40 new i18n key pairs, 1 new pill ID (`summary` under `audit` tab).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 7 principles in `.specify/memory/constitution.md` v1.1.0.

| Principle | Status | Justification |
|-----------|--------|---------------|
| **I. Dual-Dashboard Lockstep (NON-NEGOTIABLE)** | ✅ PASS | FR-001 + FR-024 + SC-010 require identical Audit tab structure / DOM / classes / pill IDs in both HTML files. Lockstep verified by an automated DOM-diff Playwright test (planned in tasks). |
| **II. Pure Calculation Modules with Declared Contracts** | ✅ PASS | The new `calc/calcAudit.js` is a pure module: input is references to existing calc-engine outputs (passed through `assembleAuditSnapshot(options)`); output is the `AuditSnapshot` data structure. It has the standard `Inputs / Outputs / Consumers` fenced header. The Audit feature does NOT modify any existing calc module — explicitly verified by SC-008 (`git diff` zero lines in 12 named functions). |
| **III. Single Source of Truth for Interactive State** | ✅ PASS | The audit assembler reads from canonical state (e.g., `_lastStrategyResults` is the canonical strategy-ranking source per Feature 008's decision). It does not introduce parallel derivation. The flow diagram's stage headlines are computed from the assembled `AuditSnapshot` once, not separately from each detail section. |
| **IV. Gold-Standard Regression Coverage (NON-NEGOTIABLE)** | ✅ PASS | The new `calc/calcAudit.js` ships with `tests/unit/calcAudit.test.js` covering: snapshot shape, deterministic output for fixed inputs, cross-validation flag triggering on planted divergence, empty-state handling. FR-030 / SC-005 require all 195 existing unit tests + 50 E2E tests to keep passing without modification. |
| **V. Zero-Build, Zero-Dependency Delivery** | ✅ PASS | Chart.js is already loaded; the Audit's ~10–14 charts are new Chart.js instances, not a new library. The flow diagram is HTML+CSS only (flexbox + arrow glyphs). No bundler, no transpiler, no new CDN, no build step. |
| **VI. Explicit Chart ↔ Module Contracts** | ✅ PASS | Each new Audit chart's render function carries a comment header naming the module/property it consumes from `AuditSnapshot` (e.g., the gate-trajectory chart's render function declares it reads `auditSnapshot.gates[i].trajectorySeries`). The `calc/calcAudit.js` module's `Consumers:` list names every audit chart and the per-section table renderers. |
| **VII. Bilingual First-Class — EN + zh-TW (NON-NEGOTIABLE)** | ✅ PASS | FR-025 requires every new user-visible string (≥35 keys: tab+pill labels, 7 section headings, 6 flow-diagram stage labels, plain-English gate verdicts in EN + zh-TW, table column headers, "All cross-checks passed", warning text) added to BOTH `TRANSLATIONS.en` AND `TRANSLATIONS.zh` AND to `FIRE-Dashboard Translation Catalog.md`. Plain-English gate verdicts are template strings using the `t()` helper with `{0}`-style placeholders so numeric values interpolate without re-translation. |

**Result:** All gates PASS. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/014-calc-audit/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions for the audit
├── data-model.md        # Phase 1 — AuditSnapshot entity model
├── quickstart.md        # Phase 1 — manual verification walkthrough
├── contracts/
│   ├── audit-assembler.contract.md     # calc/calcAudit.js public API
│   ├── audit-ui.contract.md            # DOM structure / classes / chart instances
│   ├── audit-i18n.contract.md          # New i18n key inventory (EN + zh-TW)
│   └── audit-debug-payload.contract.md # Copy Debug `audit` block shape
├── checklists/
│   └── requirements.md  # Spec quality checklist (already passes)
└── tasks.md             # Phase 2 — generated by /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
FIRE-Dashboard.html              # RR — Audit tab markup, CSS, JS wiring, i18n keys
FIRE-Dashboard-Generic.html      # Generic — same Audit tab markup (lockstep)
FIRE-Dashboard Translation Catalog.md   # ~35–40 new key pairs documented
calc/
├── tabRouter.js                 # (existing — feature 013)
├── ssEarningsRecord.js          # (existing — feature 012)
├── calcAudit.js                 # NEW — pure assembler: state → AuditSnapshot
└── ... (other existing calc modules — UNCHANGED)
tests/
├── unit/
│   ├── calcAudit.test.js        # NEW — covers assembler invariants
│   ├── tabRouter.test.js        # (existing — feature 013)
│   └── ssEarningsRecord.test.js # (existing — feature 012)
└── e2e/
    ├── calc-audit.spec.ts       # NEW — flow diagram + per-section charts + Copy Debug shape
    ├── tab-navigation.spec.ts   # (existing — feature 013)
    ├── file-protocol.spec.ts    # (existing — feature 013)
    └── responsive-header.spec.ts # (existing — feature 011)
```

**Structure Decision**: Single-file HTML pattern continues with a thin `calc/` directory for pure modules. The new `calc/calcAudit.js` follows the established pattern from `calc/ssEarningsRecord.js` (feature 012) and `calc/tabRouter.js` (feature 013): UMD-style classic-script load so it works under file:// AND under Node `require` for unit tests.

## Phase 0 — Outline & Research

See [research.md](./research.md). Key resolved questions:

1. **Audit-assembler architecture**: chosen pattern is a pure factory-style function `assembleAuditSnapshot({inputs, fireAge, fireMode, lastStrategyResults, projectFullLifecycle, signedLifecycleEndBalance, isFireAgeFeasible, ...})` that takes everything by reference (no global reads) so it's Node-testable with mocks.

2. **Flow diagram rendering**: HTML+CSS only (flexbox stages connected by `▶` glyphs / dashed-border arrows). Not a Chart.js chart, not an external library — keeps Constitution V purity. Mobile vertical-stack via `@media (max-width: 767px)`.

3. **Per-section chart sizing**: target 300×180px desktop, 280×160px mobile. Each chart wrapped in a `.audit-chart` div with `max-width: 320px`. All charts use the existing `--accent` / `--card` CSS variable system.

4. **Deferred render**: the Audit tab's chart instances are NOT created at boot — they're built on the FIRST activation of the Audit tab via `tabRouter`'s existing `onAfterActivate` callback. Subsequent activations re-render charts with the latest snapshot. This satisfies FR-028 (zero overhead when other tabs are active).

5. **Cross-validation invariant set** (the four FR-016 checks):
    - Invariant A: `signedLifecycleEndBalance(...).endBalance` ≈ `projectFullLifecycle(...).last.total` for the active strategy. Tolerance: $1000 absolute or 1% relative.
    - Invariant B: `_simulateStrategyLifetime(active).feasibleUnderCurrentMode` ≡ `_chartFeasibility(active.id, active.theta).feasible` (when both are defined).
    - Invariant C: `displayed FIRE age` ≡ `_lastStrategyResults.fireAge` (Architecture B fixed FIRE age across strategies).
    - Invariant D: `floor violation count via isFireAgeFeasible` ≡ `floor violation count via _chartFeasibility` for the active strategy.

6. **Click-to-scroll** from flow diagram to detail section: native `element.scrollIntoView({behavior: 'smooth', block: 'start'})` plus a brief CSS class flash (`.audit-section--highlight`) on the targeted section.

7. **Bilingual-safe plain-English verdicts**: gate verdict strings use `t('audit.gate.safe.verdict', floor, firstViolationAge)`-style template keys so the EN sentence "Safe: every retirement-year total ≥ ${0} … first violation at age {1}" and the zh-TW counterpart "安全：每年退休後總額 ≥ ${0} … 首次違反於 {1} 歲" both interpolate the same numeric values.

8. **Audit data path through Copy Debug**: a single in-memory cache `window._lastAuditSnapshot` is populated whenever `recalcAll` finishes; the existing Copy Debug button reads from this cache (so the JSON's `audit` block reflects the SAME snapshot the UI is rendering, satisfying SC-011).

**Output:** [research.md](./research.md) with all decisions resolved.

## Phase 1 — Design & Contracts

### Entities → [data-model.md](./data-model.md)

- **AuditSnapshot**: top-level container — `{ generatedAt, schemaVersion, flowDiagram, resolvedInputs, spendingAdjustments, gates: [3], fireAgeResolution, strategyRanking, lifecycleProjection, crossValidationWarnings: [] }`.
- **FlowDiagramSummary**: ordered list of 6 stages each carrying `headlineOutput` and `downstreamArrowLabel`.
- **GateEvaluation**: `{ mode, candidateFireAge, strategyUsed, formulaPlainEnglish, formulaInputs, verdict, reason, violations[], trajectorySeries[] }`.
- **StrategyRow**: per-strategy entry with all per-mode feasibility booleans plus shortfall metadata.
- **CrossValidationWarning**: `{ kind, valueA, valueB, delta, deltaPct, expected, reason }`.
- **ChartSeries**: every chart-displayed series exists in the snapshot as plain `{x, y}[]` data — making the JSON-roundtrip property in SC-011 mechanically verifiable.

### Contracts → [contracts/](./contracts/)

- **`audit-assembler.contract.md`** — `assembleAuditSnapshot(options)` API: required option keys, return shape, deterministic invariant, error handling, the four cross-validation invariants.
- **`audit-ui.contract.md`** — DOM structure of the Audit tab (the `<section id="tab-audit">`, the flow diagram markup, per-section containers), CSS class inventory, chart-instance registry pattern, deferred-render lifecycle.
- **`audit-i18n.contract.md`** — full inventory of new i18n keys with EN + zh-TW values (estimated 35–40 pairs).
- **`audit-debug-payload.contract.md`** — exact shape of the new `audit` block in the Copy Debug JSON output, plus interaction with the existing `feasibilityProbe` / `summary` / `lifecycleSamples` keys (no removals).

### Quickstart → [quickstart.md](./quickstart.md)

Step-by-step manual verification covering: Audit tab visible as 5th tab, flow diagram renders 6 clickable stages, every detail section displays both chart and table, Copy Debug includes `audit` key, Cross-Validation flags a planted divergence, lockstep DOM-diff RR↔Generic, language toggle preserves Audit content, all 195+ unit tests + 50+ E2E tests still green.

### Agent context update

Update the SPECKIT block in `CLAUDE.md` to point Active feature at `014-calc-audit`.

**Output:** data-model.md, contracts/*.md, quickstart.md, CLAUDE.md SPECKIT block updated.

## Post-Design Constitution Re-check

Re-evaluating the 7 principles after Phase 1 design:

- **I.** ✅ Both files get identical Audit tab markup, classes, pill IDs; `audit-ui.contract.md` enforces this in writing; lockstep DOM-diff E2E test planned.
- **II.** ✅ `calc/calcAudit.js` is pure (no DOM access, no globals, no calc mutation); has `Inputs / Outputs / Consumers` fenced header; node-importable.
- **III.** ✅ Audit reads canonical state once per recalc; flow diagram + sections + JSON all derive from the same `AuditSnapshot`.
- **IV.** ✅ `tests/unit/calcAudit.test.js` planned. All existing 195 unit tests + 50 E2E remain untouched per FR-030.
- **V.** ✅ Zero new runtime deps; Chart.js reuse; HTML+CSS flow diagram. No build step.
- **VI.** ✅ Each Audit chart's render function declares its `AuditSnapshot` source path; `calcAudit.js`'s `Consumers:` list names every chart and table.
- **VII.** ✅ All ~35–40 new keys defined with EN + zh-TW values in `audit-i18n.contract.md`; plain-English gate verdicts use template strings for safe interpolation.

**Result:** Post-design check still PASSES. No violations introduced during design.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none)    | (none)     | (none)                               |
