# Caller Audit: `roth` → `rothIra` Threading

**Feature**: 032-roth-ira-accounts
**Created**: 2026-05-28
**Purpose**: Per FR-022, this document is the source of truth for every touch point where the new `rothIra` pool must appear. Every entry below must be addressed by at least one task in `tasks.md`.

**Scope**: RR-only (`FIRE-Dashboard.html`) plus the shared `calc/*.js`, `tests/`, and Translation Catalog. Touch points discovered in `FIRE-Dashboard-Generic.html` are listed for transparency but are intentionally NOT addressed by this feature (per FR-018 lockstep exemption).

## Action Legend

- **PARALLEL** — add a sibling `rothIra` entry alongside the existing `roth` entry (no behavior change to `roth`)
- **EXTEND** — extend an existing reference to also handle `rothIra` (e.g., pool dict gets a new key)
- **EXEMPT** — `rothIra` must be EXCLUDED here (e.g., RMD branch is `trad`-only)
- **NEW** — entirely new code (new DOM input, new CSV column, new chart series)
- **NO-CHANGE** — `roth` reference is incidental; `rothIra` doesn't need to appear

## 1. Calc — accumulation (`calc/accumulateToFire.js`)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 1 | calc/accumulateToFire.js | 38 | `- roger401kRoth / person1_401kRoth` | Input doc comment | NO-CHANGE |
| 2 | calc/accumulateToFire.js | 446 | `let pRoth = (inp.person1_401kRoth ?? inp.roger401kRoth) ?? 0;` | Seeds Roth 401K balance at year 0 | EXTEND — add parallel `let pRothIra = (inp.person1RothIra ?? inp.rogerRothIra) ?? 0;` |

## 2. Calc — withdrawal (`calc/withdrawal.js`)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 3 | calc/withdrawal.js | 76 | `const POOL_KEYS = Object.freeze(['cash', 'taxable', 'roth', 'trad']);` | Canonical pool key order | PARALLEL — insert `'rothIra'` after `'roth'` → `['cash', 'taxable', 'roth', 'rothIra', 'trad']` |
| 4 | calc/withdrawal.js | 79–84 | `STRATEGY_ORDERS = {...}` | Per-strategy draw order | PARALLEL — add `'rothIra'` in same relative position as `'roth'` in each strategy |
| 5 | calc/withdrawal.js | 118 | `return new Set(['cash', 'taxable', 'roth']);` | Pre-unlock accessible pools | PARALLEL — add `'rothIra'` |
| 6 | calc/withdrawal.js | 120 | `return new Set(POOL_KEYS);` | Full-access set post-unlock | NO-CHANGE (inherits from #3) |
| 7 | calc/withdrawal.js | 138 | `if (!accessible.has(key)) continue;` | Iteration over POOL_KEYS | NO-CHANGE (inherits) |
| 8 | calc/withdrawal.js | 195 | `roth: pools.rothIraReal,` | Maps input to `remaining.roth` | EXTEND — add separate `rothIra: pools.rothIraReal,` mapping (Note: existing key name is unfortunate; will need split into `rothIraReal_401k` + `rothIraReal_ira` OR new field name) |
| 9 | calc/withdrawal.js | 198 | `const drawn = { cash: 0, taxable: 0, roth: 0, trad: 0 };` | Withdrawal accumulator | EXTEND — add `rothIra: 0,` |
| 10 | calc/withdrawal.js | 204 | `if (age >= tax.rmdAgeStart && accessible.has('trad') && ...)` | RMD branch (trad-only) | EXEMPT — no change needed; new pool naturally excluded |

## 3. Calc — lifecycle (`calc/lifecycle.js`)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 11 | calc/lifecycle.js | 56 | `Default: 60% → trad401kReal, 20% → rothIraReal, 20% → taxableStocksReal` | Doc comment | NO-CHANGE |
| 12 | calc/lifecycle.js | 114 | `DEFAULT_CONTRIB_SPLIT = { trad401kFraction: 0.60, rothFraction: 0.20, ... }` | Default contribution split | EXTEND — Roth IRA contribution is a SEPARATE additive input (not a re-split of rothFraction). The accumulation engine reads the new contribution field directly; this constant is NOT divided. |
| 13 | calc/lifecycle.js | 180 | `for (const field of ['trad401kReal', 'rothIraReal', ...])` | Portfolio field validation loop | EXTEND — add new field if rothIraReal is split, OR keep as-is if merged into existing field |

## 4. Calc — audit invariants (`calc/calcAudit.js`)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 14 | calc/calcAudit.js | 179 | `locked401kRoth: _round(raw.p401kRoth \|\| 0),` | Audit composition snapshot | EXTEND — add `lockedRothIra: _round(raw.pRothIra \|\| 0),` |

## 5. Calc — withdrawal tooltip frame (`calc/withdrawalTooltipFrame.js`)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 15 | calc/withdrawalTooltipFrame.js | 91 | `roth: _finiteOr(r.wRothBookValue, r.wRoth),` | Pool line for tooltip display | EXTEND — add `rothIra: _finiteOr(r.wRothIraBookValue, r.wRothIra),` |

## 6. HTML — state / input wiring

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 16 | FIRE-Dashboard.html | 3103–3104 | `<label data-i18n="assets.roger401kRoth">…</label><input id="roger401kRoth" …>` | RR Roth 401K input | PARALLEL — new sibling input `id="rogerRothIra"` |
| 17 | FIRE-Dashboard-Generic.html | 3081–3082 | Generic Roth 401K input | Generic dashboard input | NOT IN SCOPE (FR-018 — Generic untouched) |
| 18 | FIRE-Dashboard.html | 7896 | `roger401kRoth: parseFloat((…getElementById('roger401kRoth'))…)` | getCanonicalInputs reads DOM | EXTEND — add `rogerRothIra: parseFloat(…getElementById('rogerRothIra')…),` |
| 19 | FIRE-Dashboard-Generic.html | 8254 | Generic getInputs() | Generic state | NOT IN SCOPE |
| 20 | FIRE-Dashboard.html | 7933 | `inp.roger401k = inp.roger401kTrad + inp.roger401kRoth;` | Legacy total-401K aggregation | NO-CHANGE — `roger401k` remains the 401K-only legacy alias; Roth IRA is separately tracked |
| 21 | FIRE-Dashboard-Generic.html | 8290 | Generic aggregation | Generic state | NOT IN SCOPE |
| 22 | calc/getCanonicalInputs.js | 179 | `const roth401k = inp.roger401kRoth ?? inp.person1_401kRoth ?? 0;` | Adapter reads legacy shape | EXTEND — add `const rothIra = inp.rogerRothIra ?? inp.person1RothIra ?? 0;` |
| 23 | calc/getCanonicalInputs.js | 192 | `rothIraReal: roth401k,` | Maps Roth 401K into canonical pool | EXTEND — split into `roth401kReal: roth401k,` and `rothIraReal: rothIra,` OR keep summed and add a separate field for the new pool. (Implementation decision deferred to plan.md.) |

## 7. HTML — portfolio aggregation

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 24 | FIRE-Dashboard.html | 7980 | `calcAccessible(inp) { return ... }` | Sums accessible (taxable) pools | NO-CHANGE — Roth IRA is locked until 59.5 (FR-019) so does NOT enter accessible sum. It enters the locked sum (header sub-label). |

## 8. HTML — lifecycle chart

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 25 | FIRE-Dashboard.html | 8570 | `const pRoth = lifecycle.map(r => _bvOrReal(r, 'p401kRoth'));` | Chart Roth 401K series | PARALLEL — add `const pRothIra = lifecycle.map(r => _bvOrReal(r, 'pRothIra'));` |
| 26 | FIRE-Dashboard.html | 8625 | `data: pRoth,` | Chart dataset includes Roth 401K | PARALLEL — add `pRothIra` dataset |
| 27 | FIRE-Dashboard.html | 4409 | `case 'roth': return _css('--chart-roth', '#846cff');` | Chart color mapping | PARALLEL — add `case 'rothIra': return _css('--chart-rothIra', '<color>');` (distinct color, theme-coordinated) |
| 28 | FIRE-Dashboard.html | ~8700s | Chart legend | Legend labels | PARALLEL — add "Roth IRA" legend entry |

## 9. HTML — withdrawal strategy panel

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 29 | FIRE-Dashboard.html | 11471–11473 | `if (p === 'roth' && canAccess401k && avail.pRoth > 0) { … }` | Strategy simulator: Roth 401K draw | PARALLEL — add `if (p === 'rothIra' && canAccess401k && avail.pRothIra > 0) { … wRothIra += add; avail.pRothIra -= add; }` |
| 30 | FIRE-Dashboard.html | 12880 | `row.pRothBookValue = toBV(row.pRoth, row.age);` | Real → nominal conversion for chart | PARALLEL — add `row.pRothIraBookValue = toBV(row.pRothIra, row.age);` |
| 31 | FIRE-Dashboard.html | 14663–14669 | `pools: { trad: _pTrad, roth: _pRoth, ... }` | Withdrawal tooltip pool lines | EXTEND — add `rothIra: _fin(r.wRothIraBookValue, r.wRothIra),` |

## 10. HTML — strategy ranker

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 32 | FIRE-Dashboard.html | ~9050+ | Feature 008 strategy dispatch | Pool-agnostic | NO-CHANGE (dispatch logic is pool-agnostic; new pool flows through via the lifecycle row) |

## 11. HTML — FIRE feasibility gate (CRITICAL — feature-031 contract)

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 33 | FIRE-Dashboard.html | 9141 | `const effBal = () => pTrad * (1 - taxTrad) + pRoth + pStocks + pCash;` | Effective balance for feasibility | EXTEND — add `+ pRothIra` to the sum (FR-021e). MISSING THIS WOULD SILENTLY DE-SYNC THE VERDICT FROM THE CHART. |
| 34 | FIRE-Dashboard.html | 9265 | `pRoth = pRoth * (1 + realReturn401k) + rothContrib;` | Annual Roth 401K growth + contribution | PARALLEL — add `pRothIra = pRothIra * (1 + realReturn401k) + rothIraContrib;` (FR-021b) |
| 35 | FIRE-Dashboard.html | 9805–9860 | `function simulateRetirementOnlySigned(...p401kRoth0...)` | Signed-sim fallback feasibility | EXTEND — add `p401kRothIra0` parameter and local |
| 36 | FIRE-Dashboard.html | 10028 | `const k401Roth = row ? row.p401kRoth : inp.roger401kRoth;` | Resolves Roth balance from row or input | PARALLEL — add `const rogerRothIraBal = row ? row.pRothIra : inp.rogerRothIra;` |

## 12. HTML — drag-FIRE-marker

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 37 | FIRE-Dashboard.html | ~10500s | Drag listener reads lifecycle rows | Pool-agnostic | NO-CHANGE (reads pRothIra automatically once it's in the row) |

## 13. HTML — copy-debug snapshot

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 38 | FIRE-Dashboard.html | ~13330s | `pRoth: _accumResult.end.pRoth,` | Debug snapshot output | EXTEND — add `pRothIra: _accumResult.end.pRothIra,` |

## 14. HTML — audit panel

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 39 | FIRE-Dashboard.html | 4321 | Audit heading | Pool-agnostic | NO-CHANGE |
| 40 | calc/calcAudit.js | 178–179 | Audit composition | Snapshot of locked pools | EXTEND — add `lockedRothIra:` field |

## 15. HTML — snapshot CSV + history table

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 41 | FIRE-Dashboard.html | 17583 | `SNAPSHOT_COLS = […, 'roger401kRoth', 'rogerStocks', …]` | CSV header column order | PARALLEL — append `'rogerRothIra'` AND `'rebeccaRothIra'` at the end of SNAPSHOT_COLS (NEVER mid-row) |
| 42 | FIRE-Dashboard.html | 16383 | History table Roth 401K cell render | Per-row history display | PARALLEL — add Roth IRA cells |
| 43 | FIRE-Dashboard.html | 16490 | `['total','p401k','pStocks','pCash','pRoth','p401kTrad','p401kRoth']` | Chart key order | PARALLEL — insert `'pRothIra'` after `'pRoth'` |

## 16. i18n — Translation Catalog

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 44 | FIRE-Dashboard.html | 5434 | `'assets.roger401kRoth': "Roger's Roth 401K"` | EN label | PARALLEL — add `'assets.rogerRothIra': "Roger's Roth IRA"` and `'assets.rebeccaRothIra': "Rebecca's Roth IRA"` |
| 45 | FIRE-Dashboard.html | 6551 | `'assets.roger401kRoth': 'Roger 的 Roth 401K (稅後)'` | zh-TW label | PARALLEL — add zh-TW keys for the new pair (e.g., `'Roger 的 Roth IRA'` / `'Rebecca 的 Roth IRA'`) |
| 46 | FIRE-Dashboard-Generic.html | 5816 | Generic EN | Generic i18n | NOT IN SCOPE |
| 47 | FIRE-Dashboard-Generic.html | 6919 | Generic zh-TW | Generic i18n | NOT IN SCOPE |
| 48 | FIRE-Dashboard Translation Catalog.md | 594 | Translation catalog index | Reference doc | PARALLEL — add row for the new RR-only keys; note in the doc that Generic equivalents are deferred to a future feature |

## 17. Tests — unit

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 49 | tests/unit/accumulateToFire.test.js | Multiple | `roger401kRoth: 58000,` | Fixture initialization | PARALLEL — every fixture with `roger401kRoth` gets a sibling `rogerRothIra: 0` (or non-zero for new test cases) |
| 50 | tests/unit/withdrawal.test.js | Strategy order tests | STRATEGY_ORDERS assertions | Asserts pool order in each strategy | PARALLEL — assert `'rothIra'` is in the order array immediately after `'roth'` |
| 51 | tests/unit/lifecycle.test.js | Accum year test | Tests contribution split | EXTEND — verify rothIra contribution grows the new pool independently of Roth 401K |
| 52 | tests/unit/calcAudit.test.js | Composition section | Audit invariant tests | EXTEND — assert `lockedRothIra` field present in composition |
| 53 | tests/unit/withdrawalTooltipFrame.test.js | Pool line test | Tooltip reconciliation | EXTEND — add test case for `rothIra` line when `wRothIra > 0` |
| 54 | tests/unit/cashSweepRrFixture.test.js | 65 | `roger401kRoth: 30000,` | Cash-sweep fixture | PARALLEL — add `rogerRothIra` |
| 55 | tests/unit/validation-audit/personas.js | Multiple | Persona fixtures with `roger401kRoth` | Audit personas | PARALLEL — add `rogerRothIra: 0` to each persona |

## 18. Tests — E2E

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 56 | tests/e2e/*.spec.ts | Any test interacting with `#roger401kRoth` | Playwright steps | PARALLEL — add e2e step touching `#rogerRothIra` and asserting chart update |

## 19. CSV header

| # | File | Line | Snippet | What it does | Action |
|---|---|---|---|---|---|
| 57 | FIRE-snapshots.csv | 1 | `…, roger401k, roger401kRoth, rogerStocks, …` | CSV header row | PARALLEL — append `rogerRothIra, rebeccaRothIra` at the END (NEVER mid-row, per DB Engineer constitution). Loader detects short legacy rows. |

## Summary

| Action | Count |
|---|---|
| PARALLEL | 28 |
| EXTEND | 21 |
| EXEMPT | 1 |
| NEW | 2 |
| NO-CHANGE | 5 |
| **TOTAL** | **57** |

Out-of-scope (Generic-side touch points, listed for transparency): #17, #19, #21, #46, #47 — 5 entries.

## Risks Carried Forward To plan.md

1. **Effective-balance formula (#33, FR-021e)** — single most critical edit. Missing the `+ pRothIra` term silently de-syncs the FIRE verdict from the chart. Must be covered by a parity test (`verdictStrategyParity.test.js` extension).
2. **POOL_KEYS reordering (#3)** — `POOL_KEYS` is frozen and exported; many tests likely assert on its exact contents. Search for `POOL_KEYS` in tests and update assertions.
3. **Mapping ambiguity (#8, #23)** — the existing canonical field name `rothIraReal` is unfortunate; it currently means "Roth 401K balance in real-$". Implementation may need to introduce `roth401kReal` and re-purpose `rothIraReal`, OR introduce a new `rothIraReal_ira` field. Decided in plan.md.
4. **Contribution-split independence (FR-020b)** — accumulation loop reads `rothIraContrib` as a SEPARATE field, NOT a re-allocation of `rothFraction`. Easy to get wrong if a developer assumes "Roth contribution" is a single concept.
5. **Persona stub coverage (#55, FR-021j)** — the audit harness's DOC_STUB must serve `rogerRothIra` / `rebeccaRothIra` per-persona inside `boundFactory`, NOT in the static stub (lesson from feature 020).
