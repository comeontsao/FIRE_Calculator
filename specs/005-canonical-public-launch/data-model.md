# Phase 1 Data Model: Canonical Engine Swap + Public Launch

**Feature**: 005-canonical-public-launch | **Date**: 2026-04-20

This document enumerates the entities introduced or materially edited by
feature 005. "Entity" here covers JS modules (their exported shapes), new
root-level documentation files, new test files, and new i18n keys.

---

## 1. `calc/shims.js` (NEW — JS module)

**Purpose**: Node-importable glue layer wrapping the three (or four) inline
HTML shim functions that translate between the legacy inline-arg shape and
the canonical `calc/*.js` shape. Wraps every canonical call in `try/catch`
with documented fallback values and `console.error` prefix logging.

**Classification**: Glue layer (not a pure calc module) — see research §R1.
Permitted to read `window.*` at call time, per module-boundaries allowlist
entry.

### Exports

| Export | Signature | Fallback value |
|---|---|---|
| `yearsToFIRE` | `(inp, annualSpend) → number` | `NaN` |
| `findFireAgeNumerical` | `(inp, annualSpend, mode) → {years, months, endBalance, sim, feasible}` | `{years:NaN, months:NaN, endBalance:NaN, sim:[], feasible:false}` |
| `_evaluateFeasibilityAtAge` | `(inp, annualSpend, age, mode) → boolean` | `false` |
| `findMinAccessibleAtFireNumerical` | `(inp, annualSpend, fireAge, mode) → number` | `NaN` |

### Canonical callees (via `window.*`)

- `window._solveFireAge({inputs, helpers}) → FireSolverResult` (from
  `calc/fireCalculator.js`)
- `window._evaluateFeasibility({inputs, fireAge, helpers}) → boolean` (from
  `calc/fireCalculator.js`)
- `window._runLifecycle({inputs, helpers}) → LifecycleResult` (from
  `calc/lifecycle.js`)

### Error channel

Every `catch` block MUST emit:
```js
console.error('[<shim-name>] canonical threw:', err, <context-object>);
```
The prefix string is the shim's exported name. The context object contains
at least the first argument that went into the shim (for debugging which
input shape triggered the throw).

### Contract test location

`tests/unit/shims.test.js`. At least one test per exported shim asserting
fallback value + `console.error` prefix.

---

## 2. `calc/getCanonicalInputs.js` (NEW — JS module)

**Purpose**: Production adapter that converts the HTML's legacy `inp` object
(from `getInputs()`) into the canonical `Inputs` shape defined in
`specs/001-modular-calc-engine/data-model.md §1`.

**Classification**: Pure calculation module (no DOM, no global state, no
side effects). Subject to Principle II strictness.

### Export

| Export | Signature |
|---|---|
| `getCanonicalInputs` | `(inp: LegacyInp) → Readonly<Inputs>` |

### Behavior

1. Auto-detect RR-shape vs Generic-shape by inspecting the presence of
   `inp.personB` or equivalent secondary-person marker. Both shapes produce
   a valid `Inputs` on exit.
2. Null-guard every secondary-person field — if absent, drop the `personB`
   sub-object entirely rather than emit `undefined` values.
3. Pass through canonical mortgage shape directly (no `normalizeMortgageShape`
   call — that shim is deleted per FR-025).
4. `Object.freeze()` the returned object (top-level; deep-freeze not
   required — downstream consumers treat as read-only by convention).
5. On unrecoverable missing fields (e.g., no `currentAge` on any person),
   throw `new Error('[getCanonicalInputs] missing required field: <name>')`.

### Contract test location

`tests/baseline/browser-smoke.test.js` (RETARGETED — was prototype; now
imports `../../calc/getCanonicalInputs.js`).

---

## 3. `calc/fireCalculator.js` — `evaluateFeasibility` export (EDIT — restore)

**Purpose**: Restore the `evaluateFeasibility({inputs, fireAge, helpers}) →
boolean` named export if absent, or confirm it's already present.

### Signature

```js
evaluateFeasibility({
  inputs: Inputs,
  fireAge: number,
  helpers: CalcHelpers
}) → boolean
```

### Behavior (mode-aware)

- **Safe mode**: feasible iff `endBalance ≥ safetyBuffer` at lifecycle end.
- **Exact mode**: feasible iff `endBalance ≥ 0`.
- **DWZ mode**: feasible iff trajectory stays solvent through target age
  (buffer not required).

### Contract test location

`tests/unit/fireCalculator.test.js` (optional extension, 4 cases — see
plan.md §Testing).

---

## 4. `tests/unit/shims.test.js` (NEW — test file)

**Purpose**: Node-side unit tests for every `calc/shims.js` export's
fallback behavior.

**Structure**: `node:test` suites, one per shim:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { yearsToFIRE, findFireAgeNumerical,
         _evaluateFeasibilityAtAge, findMinAccessibleAtFireNumerical }
  from '../../calc/shims.js';

test('yearsToFIRE returns NaN and logs prefix when canonical throws', () => {
  globalThis.window = { _solveFireAge: () => { throw new Error('boom'); } };
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const result = yearsToFIRE(35, 65, { /* minimal inp */ }, { /* helpers */ });
    assert.ok(Number.isNaN(result));
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /^\[yearsToFIRE\] canonical threw:/);
  } finally {
    console.error = origError;
    delete globalThis.window;
  }
});

// ... 3 more tests, one per shim
```

**Count**: ≥ 4 tests (one per shim). Expected total runner count after merge:
≥ 84 pass.

---

## 5. Disclaimer DOM block + i18n keys (EDIT)

**Purpose**: Legal/CYA footer on both HTML dashboards.

### HTML structure

```html
<footer class="disclaimer" role="contentinfo">
  <p class="disclaimer-intro" data-i18n="disclaimer.intro">
    <!-- fallback EN text injected at build/load -->
  </p>
  <p class="disclaimer-body" data-i18n="disclaimer.body">
    <!-- fallback EN text -->
  </p>
</footer>
```

### CSS

Uses only existing tokens: `color: var(--text-dim)`, `background:
var(--card)`, `border-top: 1px solid var(--muted)`. Small font. No new
colors per FR-013.

### i18n keys (MINIMUM)

| Key | EN | zh-TW |
|---|---|---|
| `disclaimer.intro` | "⚠️ For research and educational purposes only — not financial advice." | "⚠️ 僅供研究及教育用途，非投資建議。" |
| `disclaimer.body` | "Projections are estimates. Do your own research (DYOR) and consult a qualified financial advisor before making financial decisions. The authors assume no responsibility for decisions made from this tool. Source code: MIT-licensed, open-source." | "本工具的預測數字僅為估計值，請自行研究（DYOR）並於做任何財務決定前諮詢合格的財務顧問。作者不對任何基於本工具做出的決策負責。原始碼採 MIT 開源授權。" |

Both files in lockstep (Principle I).

---

## 6. New root-level files (NEW — publish prep)

### `LICENSE`

Standard MIT License text. Year: `2026`. Copyright holder: `Roger Hsu`
(confirmed at implementation time; user may adjust). No modifications to the
canonical MIT template (use the exact text from
https://opensource.org/license/MIT/).

### `README.md`

Public-facing. Sections:
1. **Title + one-line description** — "FIRE Calculator — a zero-build,
   open-source Financial Independence / Retire Early dashboard."
2. **Live demo** — link to GitHub Pages URL (filled post-publish).
3. **Features** — bulleted list of high-level capabilities.
4. **Run locally** — "Clone, double-click `index.html`" OR "serve via any
   static HTTP server (e.g., `python -m http.server 8000`)".
5. **License** — "MIT (see LICENSE)".
6. **Disclaimer** — full text from FR-011 reproduced.
7. **Read-only mirror note** — "This is a read-only public mirror. For
   contributions or bugs, please contact the author via GitHub issues."

### `index.html`

15-line meta-refresh page (see research §R4). Redirects to
`FIRE-Dashboard-Generic.html`. Contains:
- `<meta http-equiv="refresh" ...>`
- `<script>location.replace(...)</script>` fallback
- `<a href="...">` no-JS fallback
- A one-line "Redirecting…" message

### `PUBLISH.md`

Two-step Publish-Ready Checklist per research §R6.

### `specs/005-canonical-public-launch/privacy-scrub.md` (NEW — audit output)

Markdown table with one row per file in the scrub scope (research §R5) and
a status column (Clean / Remediated / Out-of-scope). Findings column lists
specific hits that were remediated.

---

## 7. `CLAUDE.md` — Process Lessons section (EDIT)

Two new subsections within a new `## Process Lessons` heading:

### 7.1 "Caller-audit before extraction"

> Before any refactor that deletes or extracts inline helpers, run `grep -n
> "<helper-name>" <file>` on every HTML and JS file that might use them.
> Count call sites; confirm all are handled by the refactor. Lesson from:
> `specs/004-html-canonical-swap/ABANDONED.md`.

### 7.2 "Shim defense-in-depth"

> Every shim that wraps a potentially-throwing canonical call MUST:
> (1) live in a Node-importable module (`calc/shims.js`);
> (2) use `try/catch` with documented fallback values;
> (3) log `console.error` with `[shim-name]` prefix;
> (4) have a Node unit test that stubs the canonical to throw and asserts
>     the fallback + prefix.
> The `try/catch` alone is NOT sufficient — the fallback value must be
> verified, or the shim will mask failures by cascading NaN into the DOM.
> Lesson from: feature 004 failure.

---

## 8. SPECKIT pointer in `CLAUDE.md` (EDIT)

The `<!-- SPECKIT START --> … <!-- SPECKIT END -->` block is updated to
reference:
```markdown
- Active plan: [specs/005-canonical-public-launch/plan.md](./specs/005-canonical-public-launch/plan.md)
```

---

## 9. Tech debt deletions (EDIT)

Plain deletions in existing files — no new entities but notable:

- `calc/lifecycle.js`: delete `normalizeMortgageShape` function + every call
  site in the module (FR-025).
- `tests/fixtures/coast-fire.js`: replace `TBD_LOCK_IN_T038` placeholder with
  the actual canonical-engine output value (FR-026).
- `FIRE-Dashboard.html` + `FIRE-Dashboard-Generic.html`: delete four dead
  inline helpers — `signedLifecycleEndBalance`, `taxAwareWithdraw`,
  `_legacySimulateDrawdown`, `isFireAgeFeasible` (FR-008). Lockstep.

---

## Summary of entity counts

- New JS modules: 2 (`shims.js`, `getCanonicalInputs.js`)
- Edited JS modules: 1 (`fireCalculator.js` — restore export)
- New test files: 1 (`shims.test.js`) + 1 optional (fireCalculator extension)
- Retargeted test files: 1 (`browser-smoke.test.js`)
- New root-level docs: 4 (`LICENSE`, `README.md`, `index.html`, `PUBLISH.md`)
- New audit doc: 1 (`privacy-scrub.md`)
- Edited HTML: 2 (lockstep)
- Edited translation catalog: 1 (+2 keys × 2 locales)
- Edited `CLAUDE.md`: 1 (Process Lessons + SPECKIT pointer)
- Deletions in existing modules: 3 locations (lifecycle, coast-fire fixture,
  HTML dead-helpers)
