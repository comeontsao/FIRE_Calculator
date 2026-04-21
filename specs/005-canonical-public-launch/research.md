# Phase 0 Research: Canonical Engine Swap + Public Launch

**Feature**: 005-canonical-public-launch | **Date**: 2026-04-20

This document records the design decisions made during Phase 0 of
`/speckit-plan`. It resolves the one open Constitution-Check concern and
captures decisions on architecture, implementation approach, and public-launch
mechanics. Phase 1 (data-model + contracts + quickstart) consumes these
decisions.

---

## R1. How does `calc/shims.js` reconcile with Principle II (pure calc modules)?

**Question**: Principle II says calc modules are pure — no DOM, no globals, no
side effects. But shims must call `window._solveFireAge(...)` etc., which is
DOM-ish global access. Does `calc/shims.js` violate Principle II?

**Decision**: `calc/shims.js` is a declared **glue layer** — it is not a pure
calculation module. It is ORCHESTRATION code that translates between two
calc-module shapes (legacy inline-arg style ↔ canonical {inputs, helpers}
style) and wraps the boundary with `try/catch`. Principle II's purity
guarantee applies to modules that implement formulas (tax, inflation,
withdrawal, fireCalculator). Glue modules sit at a layer above and are
permitted to touch `window.*` at call time, provided:

1. They do NOT implement formulas (they delegate 100% to a pure module via
   `window.<canonical_fn>`).
2. They have zero top-level side effects (no window reads on import — only
   at call time inside the exported function).
3. Their try/catch fallbacks are Node-unit-tested.

**Implementation**: `tests/meta/module-boundaries.test.js` is the enforcement
mechanism for Principle II. We adjust the test's allowlist to recognize
`calc/shims.js` as a glue module (exempt from the "no window access" rule)
rather than add a broad carveout. This keeps every other calc module strict.

**Rationale**: The alternative — making shims pure by passing `canonicalFns`
as an argument — would require editing every call site in both HTML files to
thread the helpers through, which is exactly the kind of byte-for-byte-signature
change FR-002 explicitly prohibits. Declaring shims as glue preserves the
existing ~10 call sites untouched while getting the fallback coverage we need.

**Alternatives considered**:
- (A) Thread `canonicalFns` through every call site → breaks FR-002 signature
  preservation.
- (B) Do nothing + broad "shims are exempt" carveout on Principle II → opens
  the door to future pure-module drift.
- (C) **SELECTED** — Declare `calc/shims.js` as glue in one allowlist entry
  in the module-boundaries test; keep every other module strict.

---

## R2. How are shim unit tests structured?

**Decision**: Each shim gets its own `node:test` case in
`tests/unit/shims.test.js`. Each case:

1. Imports the shim from `../../calc/shims.js`.
2. Sets up a `globalThis.window = { _solveFireAge: () => { throw new
   Error('canonical exploded'); } }` (or the appropriate canonical helper
   name per shim).
3. Spies `console.error` (stubs it to capture calls).
4. Invokes the shim with representative inline-shape arguments.
5. Asserts: (a) the returned value equals the documented fallback shape
   byte-for-byte; (b) `console.error` was called exactly once; (c) the first
   argument of that call starts with `[<shim-name>] canonical threw:`.
6. Restores `globalThis.window` + `console.error`.

**Rationale**: This exactly mimics the failure mode feature 004 hit
(canonical throws, shim silently returns NaN cascade). If any future edit
removes the `try/catch` or changes the fallback, the test fails within the
30-second runner.

**File layout**:
```text
tests/unit/
  shims.test.js          # NEW — 4+ tests (one per shim fallback)
  fireCalculator.test.js # existing + optional evaluateFeasibility extension
```

**Alternatives considered**: jsdom-based harness running the full HTML.
Rejected: brings Principle V into question (jsdom is a dev dep) and solves a
broader problem than the shim-fallback class. We keep the scope surgical.

---

## R3. `findMinAccessibleAtFireNumerical` — shim vs rewrite?

**Decision**: **Shim it** (FR-009 option a). Add as the 4th export from
`calc/shims.js`. Same try/catch + fallback + `console.error` discipline. The
fallback for a numeric-accessible-solver is `NaN` (documented in shims.contract.md).

**Rationale**: Rewriting inline would require duplicating the numerical search
logic that already lives inside canonical — a hand-coded re-port invites
drift. Shimming keeps the single source of truth in canonical. The shim-layer
cost is one more unit test case, which is cheap.

**Alternatives considered**:
- Rewrite inline to call canonical directly → more HTML churn, no benefit
  once we're already building a shim module.
- Keep `isFireAgeFeasible` as-is (don't delete it) → leaves a dead helper in
  the code that the 004 deletion attempt already proved is unused by anything
  non-shimmable.

---

## R4. `index.html` — meta-refresh vs rename?

**Decision**: **Meta-refresh approach** (FR-015 option a). Create a tiny
`index.html` at repo root (~15 lines) that:
- Sets `<meta http-equiv="refresh" content="0; url=FIRE-Dashboard-Generic.html">`
- Also ships a client-side `<script>` fallback that does `location.replace(...)`.
- Also ships an `<a>` link as a final fallback for no-JS browsers.
- Contains nothing else: no styling, no content beyond a "Redirecting…" line.

**Rationale**: Keeps `FIRE-Dashboard-Generic.html` as the single source of
truth for the Generic dashboard. Renaming would require updating every doc,
spec, CI path, and the dashboard's internal references. Meta-refresh is
instant and supported everywhere.

**Trade-off**: URL shown in the browser briefly changes from
`/FIRE_Calculator/` to `/FIRE_Calculator/FIRE-Dashboard-Generic.html`. This is
acceptable — no SEO concern, no share-link concern (friends bookmark whatever
URL they land on, which will be the full path).

**Alternatives considered**:
- Rename `FIRE-Dashboard-Generic.html` → `index.html`. Rejected on churn
  grounds (too many cross-references to update).
- Symlink `index.html` → `Generic.html`. Rejected: git + Windows handle
  symlinks awkwardly.

---

## R5. Privacy scrub methodology (FR-019)

**Decision**: Scripted grep pass over the files destined to become public,
followed by manual inspection of every hit. Output written to
`specs/005-canonical-public-launch/privacy-scrub.md` with a per-file
green/red status and a remediation note for each finding.

**Grep patterns**:
- Roger's birth year: `\b1983\b`
- Rebecca's birth year: `\b1984\b`
- Specific known RR amounts: `\$1[,.]?2[0-9]{2}[,.]?[0-9]{3}` (portfolio
  snapshot ranges), `\bRoger\b`, `\bRebecca\b`
- Any year pattern in the 1980-1990 range that might be a birth year in the
  wrong file.

**Files in scope** (will be public after user's manual Step 1):
- `calc/*.js` (all)
- `tests/**/*.{test,fixture,defaults}.{js,mjs}` EXCLUDING
  `tests/baseline/rr-defaults.mjs` (which user deletes in Step 1)
- `FIRE-Dashboard Translation Catalog.md`
- `.github/workflows/*.yml`
- `README.md` + `LICENSE` + `PUBLISH.md` + `index.html` (new files this
  feature creates)
- `specs/**/*.md` (post-publish the spec dir will be world-readable — scrub
  for RR dollar amounts that leaked into earlier feature docs)
- `BACKLOG.md`, `CLAUDE.md`, `FIRE-Dashboard-Roadmap.md`,
  `FIRE-Dashboard Translation Catalog.md`

**Files out of scope** (user removes in manual Step 1 OR never going public):
- `FIRE-Dashboard.html` (the RR dashboard)
- `FIRE-snapshots.csv` (append-only RR history)
- `tests/baseline/rr-defaults.mjs` (RR inputs snapshot)

**Remediation**: Anything found inside in-scope files is scrubbed (removed,
anonymized to a Generic-appropriate value, or moved to an RR-specific file
that goes out of scope).

**Rationale**: Grep is necessary and sufficient for the textual scan; the
files in scope are not large. Git-history scrubbing is explicitly out of
scope (user consented per Assumption).

---

## R6. PUBLISH.md checklist structure

**Decision**: A single-page markdown document at `PUBLISH.md` (repo root,
not buried in `docs/` so it's discoverable from the GitHub root listing).
Structure:

```markdown
# Publish-Ready Checklist

## Before you start
- [ ] Feature 005 merged to `main`
- [ ] Local working copy is clean (`git status`)

## Step 1 — Remove RR content (5 min)
- [ ] Delete: `FIRE-Dashboard.html`
- [ ] Delete: `FIRE-snapshots.csv`
- [ ] Delete: `tests/baseline/rr-defaults.mjs`
- [ ] Delete: any `specs/*/` folders with RR dollar amounts (list enumerated)
- [ ] Commit: `git commit -am "chore: remove RR files ahead of public launch"`
- [ ] Push: `git push origin main`

## Step 2 — Flip repo public + enable Pages (5 min)
- [ ] GitHub Settings → General → Danger Zone → Change visibility → Public
- [ ] GitHub Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)`
- [ ] Wait 2-5 minutes for Pages to build
- [ ] Visit `https://<username>.github.io/FIRE_Calculator/`
- [ ] Verify: Generic dashboard loads, KPIs show numeric values, disclaimer visible

## If something goes wrong
- If Pages 404: check Settings → Pages → Source is set correctly.
- If dashboard fails to load: check browser console; file a bug on this repo.
- To roll back: Settings → Change visibility → Private.
```

**Rationale**: Executable checklist with commands and URLs. SC-009 says a
technically-literate user should complete both steps in under 10 minutes.

---

## R7. Lockstep commit discipline — recap + enforcement

**Decision**: Every commit that touches shim behavior MUST also touch the
shim unit tests in the same commit. Every commit that touches dashboard DOM
(new disclaimer, new KPI subscriber) MUST touch BOTH HTML files in the same
commit (Principle I). Task files (Phase 2) enforce this per-task; no CI-level
mechanism needed beyond what feature 003's smoke harness already provides.

**Rationale**: Feature 004 lacked this discipline. Every commit that fiddled
with shim code should have had a matching unit-test update — that gap is
what let the regression ship. This feature locks the pattern in at the task
level.

---

## R8. Out-of-scope items — explicit list

The following items are DELIBERATELY excluded from feature 005 to keep scope
cohesive:

- **F3 (RR/Generic parity adapter)**: Not touched. The `getCanonicalInputs`
  adapter auto-detects shape; a full parity-test harness is future work.
- **F4 (projectFullLifecycle canonical rewrite)**: Chart renderers stay on
  inline lifecycle path. Per FR-010.
- **X1 (cloud DB / multi-user persistence)**: Out of scope. LocalStorage +
  CSV remain as-is.
- **Git history scrubbing**: Accepted as exposed per Assumption.
- **Separate public mirror repo**: Architectural choice ruled out in favor of
  single-repo public-flip (user directive).
- **jsdom or Playwright integration testing**: Not added. Shim unit tests +
  feature 003 smoke harness are sufficient for the coverage class this
  feature targets.

---

## Summary

8 research items resolved. No remaining NEEDS CLARIFICATION. Constitution
Check GATE PASSES post-research (R1 resolves the Principle II concern via a
glue-layer allowlist entry, not a purity carveout). Ready for Phase 1.
