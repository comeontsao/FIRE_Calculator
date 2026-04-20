# Feature 004-html-canonical-swap — ABANDONED 2026-04-20

**Status**: Branch `004-html-canonical-swap` deleted (local + remote). Not merged to `main`. Retry scoped as feature 005.

**Reason**: In-browser dashboard verification failed. The automated CI + smoke-harness gate (feature 003) reported GREEN, but opening either HTML file showed NaN values, empty charts, `$0` tax fields, and a nonsensical FIRE number ($84,915 vs expected ~$2 M for Roger). Every visible NaN/empty/$0 was evidence that a shim's `try/catch` caught a canonical throw and returned its documented fallback. The dashboard was NOT frozen (the defense-in-depth layer worked), but the fallback VALUES propagated as wrong numbers.

**The class-of-failure that feature 003 was supposed to prevent still slipped through**, because of a gap in what the smoke harness tests.

---

## What went right

- Feature 003's smoke-harness-in-CI discipline was followed on every commit.
- `try/catch` in every shim prevented the U2B-4a-style "Calculating…" freeze.
- All 81 tests passed locally and in CI on every commit.
- The Backend Engineer correctly STOPPED on `isFireAgeFeasible` deletion (3 of 4 helpers deleted) because its callers lived inside a protected function.
- The Backend Engineer flagged the T008 (f) shim-revert drill as architecturally impossible to trigger via the current runner — caught a spec-level mistake on the spot.

## What went wrong

### Primary failure: smoke harness tests a different code path than the browser

**Smoke harness (Node)** imports `calc/*.js` modules directly AND uses a hardcoded `RR_DEFAULTS` / `GENERIC_DEFAULTS` snapshot for the adapter input. It verifies: "no throw + sane shape on these snapshots".

**Browser (production)** has three additional layers the smoke does not:

1. The shim functions in the HTML (`yearsToFIRE`, `findFireAgeNumerical`, `_evaluateFeasibilityAtAge`) that wrap canonical calls and translate returns back to inline shape.
2. The live DOM `getInputs()` that reads actual form-field values — which may differ structurally from the hardcoded snapshot.
3. The `recalcAll()` orchestration + chart renderers + KPI card updaters that consume the shim results.

A shim that returns `NaN` on canonical-throw causes KPI cards to display `$0` / `NaN` and charts to render empty. From the user's perspective, the dashboard is broken. From the smoke harness's perspective, everything is fine.

### Secondary failures

- **Snapshot drift or adapter mismatch**: the adapter worked on the hardcoded snapshot but something in the live DOM input path caused canonical validation to throw. Exact cause was not diagnosed before abandonment; would require browser DevTools console inspection.
- **SC-007 drill gap**: the spec's "shim-revert drill" (temporarily strip `try/catch`, confirm smoke fails) was architecturally impossible given the Node-only smoke harness. Caught by the implementing engineer; documented but not fixed in this feature.
- **`/speckit-analyze` missed the failure class**: my analysis graded coverage as 16/16 FRs + 8/8 SCs at 100%. The coverage was "task claims to address X" not "task actually verifies X in the integration environment". Analyze needs to probe integration-level coverage, not just task-to-FR mapping.

## Lessons for feature 005

1. **Extract shims out of HTML into a Node-importable module** (`calc/shims.js` or equivalent). Only then can the shim-layer be unit-tested in Node. This is what Issue 1 (b) from the 004 dispatch would have built had we prioritized it.
2. **`findMinAccessibleAtFireNumerical` must be shimmed or rewritten** before `isFireAgeFeasible` can be safely deleted. This is Issue 2 (b) from the 004 dispatch.
3. **Test in a browser-equivalent environment before claiming the feature works**. Options: (a) extract shims to JS + Node test; (b) add jsdom-based test; (c) amend constitution Principle V to permit Playwright. Option (a) is cheapest and sufficient for the shim-layer concern.
4. **Smoke harness should exercise the ACTUAL adapter-to-shim-to-canonical pipeline**, not just adapter→canonical. Extracting shims makes this possible.
5. **Defensive `try/catch` with fallback values is a TRAP if those fallbacks aren't tested end-to-end**. A shim that quietly returns `NaN` produces a non-frozen but nonsensical UI. The smoke harness must either (a) assert no `console.error` from shims during a full page-load simulation, or (b) assert that specific fallback values never reach the DOM in well-formed inputs.
6. **`analyze`'s MEDIUM findings are cheap to close and CAN catch real gaps**. The G1 finding I flagged as "architecturally impossible drill" WAS the signal — I should have recognized that an impossible drill is a sign the defense is untestable, not a sign the drill is wrong to ask for.

## Artifacts preserved

- `specs/004-html-canonical-swap/spec.md` — scope and FR set (still accurate)
- `specs/004-html-canonical-swap/research.md` — design decisions (R1–R8 still valid, but R3's try/catch defense is INCOMPLETE without a testable shim layer)
- `specs/004-html-canonical-swap/data-model.md` — entity shapes (reusable for 005)
- `specs/004-html-canonical-swap/contracts/adapter.contract.md` — the adapter's contract (reusable)
- `specs/004-html-canonical-swap/contracts/shims.contract.md` — the shim contracts (reusable; 005 extracts them to a JS module)
- `specs/004-html-canonical-swap/quickstart.md` — verification steps (insufficient; 005 must add a browser-level gate)
- `specs/004-html-canonical-swap/tasks.md` — task breakdown (superseded by 005's task list)
- `specs/004-html-canonical-swap/ABANDONED.md` — this file

## Feature 005 scope summary

Feature 005 = **shim extraction + HTML canonical wire-up done right + other unfinished F2/F3/F4 scope items**. See BACKLOG.md + the 005 spec once drafted.

Key structural changes in 005 vs 004:
- **New file `calc/shims.js`** exporting the three shim functions. HTML files import from this module.
- **Node-side unit tests for each shim** that stub `window._solveFireAge` to throw and assert the fallback return + `console.error`. Closes SC-007 (now architecturally possible).
- **`findMinAccessibleAtFireNumerical` shim** added to the extraction, enabling `isFireAgeFeasible` deletion.
- **Browser-equivalent integration test** — either a jsdom-based harness or a Playwright amendment (to be decided in 005's clarification).
- Scope may also fold in other BACKLOG items: U1 (infeasibility deficit display), U2 (KPI cards as chartState listeners), F3 (RR/Generic parity adapter) — to be decided during 005 drafting.
