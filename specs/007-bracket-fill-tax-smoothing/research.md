# Research — 007 Bracket-Fill Tax Smoothing

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Date**: 2026-04-21

Purpose: resolve open design choices before Phase 1 contracts. Each entry: question, decision, rationale, rejected alternatives.

---

## R1 — Synthetic-conversion accounting mechanics

**Question**: When the annual Traditional draw exceeds spending need, how does the excess flow into the taxable stocks pool so it compounds correctly in subsequent years?

**Decision**: At the end of each retirement year's withdrawal block, compute `excess = wTrad − taxOwed − grossSpendThisYear + ssNet` (the net cash left over after paying the target gross spend and the tax bill from the Traditional draw). If `excess > 0`, add it to `pStocks` BEFORE that year's stocks compounding step. The excess then grows at the stocks real return in subsequent years and is subject to LTCG tax if later sold.

This routing happens identically in `taxOptimizedWithdrawal` callers (all three: `projectFullLifecycle`, `signedLifecycleEndBalance`, `computeWithdrawalStrategy`). The withdrawal function itself returns a new field `syntheticConversion` in its result object so the three callers don't duplicate the math.

**Rationale**:
- Compounding the excess in `pStocks` is the correct real-world outcome — the user physically moves the money into a taxable brokerage account where it grows and is taxed as LTCG.
- Routing via a return-object field keeps the withdrawal function the single source of truth for the math; the three callers just apply `pStocks += mix.syntheticConversion` mechanically.
- Doing the addition BEFORE the compounding step matches the existing code pattern for other mid-year pool adjustments (relocation cost deducted from `pStocks` at FIRE year, home-sale proceeds added at FIRE year). It's consistent.

**Alternatives considered**:
- **Cash pool instead of stocks**: rejected. Retirees typically reinvest excess cash into their existing brokerage account; they don't hold it at 0.5% cash-return for decades. Stocks pool is more realistic.
- **Separate "converted bucket" with its own return rate**: rejected. Would require a new pool tracked through the entire simulator — significant plumbing change for no calc benefit (it's identical to `pStocks` behaviorally since the user would normally DCA converted dollars into stocks).
- **Skip compounding** (treat excess as "drawn and gone"): rejected. Fails the acceptance criterion SC-001 because it understates the lifetime benefit of the strategy.

---

## R2 — IRMAA MAGI definition and cap enforcement

**Question**: What exactly goes into MAGI for the IRMAA check, and when does the cap bind?

**Decision**: For the scope of this feature, MAGI = (gross Traditional draw — includes RMD) + (85% of gross Social Security) + (realized LTCG from stock sales this year). The standard deduction is NOT subtracted (MAGI is above-the-line). Tax-exempt interest, foreign earned income, and student loan interest are all ignored (out of scope).

The cap binds as follows, checked in this order after the bracket-fill computation:

1. Compute proposed `wTrad` from bracket-fill (capped to top of 12% bracket × (1 − margin) after SS).
2. Compute proposed `wStocks` needed to fund remaining spend.
3. Compute MAGI = `wTrad + 0.85 × ssGross + (wStocks × gainPct)`.
4. If `age >= 63` AND `MAGI > irmaaThreshold × (1 − safetyMargin)`, reduce `wTrad` downward by `MAGI − capTarget`, floor at zero, and re-run the stocks-sale computation with the reduced Trad draw. Set a flag `irmaaCapped = true` in the return object.
5. If reducing `wTrad` to zero still doesn't get MAGI below the cap (because SS + stocks alone already exceed it), accept the breach — the user is forced into IRMAA regardless — but set `irmaaBreached = true` so the chart shows a hard warning.

**Rationale**:
- The `age >= 63` gate matches IRS reality: IRMAA premium surcharges use the MAGI from two tax years prior, so MAGI at age 63 affects Medicare premiums at age 65.
- Applying the safety margin to IRMAA as well as to the 12% bracket is consistent — both are IRS thresholds subject to annual drift.
- Reducing `wTrad` first (rather than Roth or stocks) is correct because Trad is what PUSHES MAGI up; Roth is tax-free and doesn't count for MAGI; stocks count only via LTCG gain not principal, so they're a smaller lever.
- The two-flag scheme (`irmaaCapped` soft vs `irmaaBreached` hard) lets the chart distinguish "we caught this and protected you" from "even a zero Trad draw can't save you here."

**Alternatives considered**:
- **Full IRS MAGI formula** (with tax-exempt interest, foreign income, etc.): rejected. Project doesn't model any of those income sources; adding them is scope creep.
- **Ignore IRMAA entirely** (rely on user discretion): rejected. User explicitly requested IRMAA protection as a first-class feature.
- **Check IRMAA only at age 65+** (when Medicare actually starts): rejected. The 2-year lookback means MAGI at 63 matters. Enforcing at 63 is the correct defensive posture.

---

## R3 — 5-year Roth clock applicability

**Question**: When does the 5-year Roth conversion clock block a synthetic conversion, and how is "conversion" defined for a transfer into the taxable stocks pool (which is not actually a Roth)?

**Decision**: The "synthetic conversion" in this feature is NOT a real Roth conversion — it moves excess Trad-drawn dollars into the taxable stocks pool, not into a Roth IRA. So the 5-year Roth clock does NOT technically apply.

HOWEVER, the 10% early-withdrawal penalty on Traditional distributions DOES apply if the user is below age 59.5 without Rule of 55 protection. Any Traditional draw in that age window would incur the penalty regardless of where the excess lands.

The feature 007 algorithm therefore:

1. If `age < 59.5` AND Rule of 55 is NOT enabled → `wTrad` MUST equal 0 that year (no bracket-fill possible). Bracket-fill effectively starts at age 59.5. No annotations needed — this is the default pre-59.5 behavior that already exists.
2. If `age < 59.5` AND Rule of 55 IS enabled AND `age >= 55` AND `separationAge >= 55` → `wTrad` may be nonzero, and bracket-fill is allowed from age 55. The Rule-of-55 unlock marker appears.
3. If `age < 55` AND Rule of 55 IS enabled but the age is still below 55 → treat as locked. No Trad draw.
4. A separate "5-year Roth clock" warning appears in the chart caption ONLY when a TRUE Roth conversion is being discussed (future feature). For feature 007, the warning is defined but not active because no true Roth conversions occur.

So the FR-040/FR-041 "5-year Roth rule warning" becomes a **placeholder with explanatory tooltip** in feature 007 — the warning UI exists, it's documented, but it never triggers because synthetic conversions don't create a 5-year clock. A future feature (true Roth conversion) would activate the warning.

**Rationale**:
- Conservatively interpreting "conversion" as "real Roth conversion" keeps the feature scope tight.
- Building the warning slot now means future true-Roth-conversion work only needs to turn the flag on — no UI churn.
- The 10% early-withdrawal penalty is handled by the existing `canAccess401k` check in `taxOptimizedWithdrawal` (already respects 59.5 / Rule of 55).

**Alternatives considered**:
- **Treat synthetic conversion as a real conversion with its own 5-year clock**: rejected. Semantically wrong — the money goes into taxable brokerage, not a Roth account. No clock applies in reality.
- **Skip the warning UI entirely and only add it when real conversions are built**: rejected. Spec FR-040 requires the warning infrastructure now; better to wire it once and activate later.

---

## R4 — Rule of 55 interaction with Roth 401(k)

**Question**: Rule of 55 covers Traditional 401(k) draws penalty-free from age 55. Does the same rule cover the Roth 401(k) component? Should the feature model it?

**Decision**: Rule of 55 applies to the **entire 401(k) plan** the user separates from, including both Traditional and Roth components. In this feature, when Rule of 55 is enabled AND the user is `age >= 55` AND `separationAge >= 55`, the unlock age for BOTH `pTrad` and `pRoth` drops from 59.5 to 55.

The existing `canAccess401k = age >= UNLOCK` check inside `taxOptimizedWithdrawal` is replaced with:

```
const effectiveUnlockAge = rule55Enabled && separationAge >= 55 ? 55 : 59.5;
const canAccess401k = age >= effectiveUnlockAge;
```

This parameter propagates via the withdrawal function's signature (new input field: `rule55`).

**Rationale**:
- Correct IRS interpretation: Rule of 55 is a plan-level exception from the 10% penalty; the plan includes Traditional, Roth, and employer-match subaccounts alike.
- Simpler model than splitting the unlock age per subaccount.
- Bracket-fill doesn't usually WANT to draw Roth early anyway (Roth is tax-free, saved for last in the priority order), so allowing Roth access at 55 is a no-op in most scenarios — but it's correct when Roth draw IS needed (e.g., to fund spend during 55-59.5 when Trad is exhausted).

**Alternatives considered**:
- **Roth 401(k) stays locked until 59.5 even with Rule of 55**: rejected. IRS position is that Rule of 55 applies plan-wide.
- **Add a separate Roth 401(k) Rule of 55 checkbox**: rejected. Overengineering — no user would want different treatment for Trad vs Roth in the same plan.

---

## R5 — Safety margin applied to both 12% bracket AND IRMAA threshold

**Question**: Does the single safety-margin slider apply to both the 12% bracket cap and the IRMAA threshold? Or should they be separate?

**Decision**: A single `safetyMargin` slider (default 5%, range 0–10%) applies to BOTH the 12% bracket cap AND the IRMAA threshold multiplicatively:

- `effectiveBracketCap = (stdDed + top12) × (1 − safetyMargin)`
- `effectiveIrmaaCap = irmaaThreshold × (1 − safetyMargin)`

Both are controlled by the same slider.

**Rationale**:
- Both values drift annually with inflation; the SAME IRS indexing factor (C-CPI-U) drives them. A single safety margin captures both appropriately.
- User cognitive load stays low — one knob, not two.
- The user's original request: "maybe we keep a taxable balance 5% lower than the bracket limit" — implicitly scoped to "brackets" in general, not one specific cap.

**Alternatives considered**:
- **Two separate sliders**: rejected. Double the UI complexity for no practical benefit.
- **Safety margin on bracket only, IRMAA with a fixed hardcoded buffer**: rejected. Inconsistent and less honest — the IRMAA threshold drifts too.

---

## R6 — Interaction with existing Safe / Exact / DWZ feasibility

**Question**: Bracket-fill routes synthetic conversions into `pStocks` which then compounds. This changes the end-of-plan balance. Does it break Safe/Exact/DWZ feasibility?

**Decision**: No breakage. Here's why:

- Safe requires `endBalance ≥ 0` + phase-transition buffers.
- Exact requires `endBalance ≥ terminalBuffer × spend`.
- DWZ requires `endBalance ≈ 0`.

Bracket-fill INCREASES `endBalance` (because synthetic-converted dollars compound for decades at stocks real return). So:

- Safe and Exact become EASIER to satisfy under bracket-fill. Solver may find feasible at an EARLIER FIRE age than before.
- DWZ becomes HARDER to satisfy without adjustment — the user overshoots if they retire at the pre-feature-007 DWZ age. The solver will re-search and find a slightly EARLIER DWZ age (because they need less starting portfolio to end at zero).

All three solvers use the same signed lifecycle simulator. The simulator now routes synthetic conversions correctly. The solvers' binary-search on FIRE age will automatically converge on the new correct answer. No separate change needed to Safe/Exact/DWZ solver code.

**Rationale**:
- The feature-006 fix established the invariant that solver and chart use identical math. Feature 007 preserves that invariant.
- Solver convergence is already tested in feature 006's 65 unit tests; those tests continue to pass because the invariant holds.

**Alternatives considered**:
- **Gate bracket-fill on Safe/Exact/DWZ mode** (e.g., only apply in DWZ): rejected. No rational user would want bracket-fill OFF in Safe. Inconsistency would confuse the user.
- **Rewrite the solvers to account for synthetic conversions explicitly**: rejected. The solvers already do the right thing because the simulator does the right thing.

---

## R7 — Which existing unit tests might need updating

**Question**: The current 65 unit tests are the regression gate. Which ones might fail when the bracket-fill algorithm replaces the cover-spend algorithm?

**Decision**: Audit planned at the start of implementation. Expected impact:

- **`tests/unit/withdrawal.test.js`** (current: 3 tests covering `taxOptimizedWithdrawal` directly): the tests' specific expected values for `wTrad`, `wRoth`, `wStocks` will change because the algorithm now draws MORE Trad in years where spending alone wouldn't justify it. These tests must be REWRITTEN to match the new algorithm OR their assertions loosened to check structural invariants (Trad drawn ≤ bracket cap, no shortfall, total net ≥ spend).
- **`tests/unit/tax.test.js`** (covers `calcOrdinaryTax` and `calcLTCGTax` in isolation): NO changes needed. Those functions are unchanged.
- **`tests/unit/fireCalculator.test.js`, `tests/unit/lifecycle.test.js`** (if they exist in the sense of testing end-balance): may need the expected end-balance values updated because bracket-fill adds synthetic-conversion compounding. Easiest solution: make those tests check a band (e.g., `endBalance > 0` for feasible) rather than exact dollars.
- **`tests/unit/college.test.js`, `healthcare.test.js`, `mortgage.test.js`, `inflation.test.js`, `chartState.test.js`**: NO impact expected. These modules are orthogonal to the withdrawal algorithm.

Task 1 of the implementation will be to run the existing test suite against a work-in-progress bracket-fill algorithm and itemize the failures. Each failing test is updated with a rationale comment referencing this decision.

**Rationale**:
- Can't know the exact impact until the new algorithm is in place; must iterate.
- Loosening assertions to structural invariants is preferred over hand-coding new expected values, because bracket-fill's exact per-year numbers depend on several interacting parameters (margin, RMD, SS) that shouldn't be re-encoded in test fixtures.

**Alternatives considered**:
- **Pre-compute expected values for every test in a spreadsheet**: rejected. Brittle; any bracket-edge change makes all fixtures wrong.
- **Delete the withdrawal.test.js tests entirely and replace with bracket-fill-specific ones**: rejected. Lose coverage of the withdrawal function's basic contract.

---

## R8 — Chart.js annotation strategy

**Question**: Chart.js's annotation plugin is not loaded. How do we add the IRMAA horizontal line, the SS-reduction annotation, the synthetic-conversion legend entry, the Rule-of-55 marker, etc. without adding a plugin?

**Decision**: All annotations implemented using Chart.js's built-in features:

- **IRMAA horizontal line**: a dedicated dataset with `type: 'line'`, two data points at `[0, threshold]` and `[maxYear, threshold]`, `borderDash: [5,5]`, `borderColor: 'rgba(255,107,107,0.4)'`, `fill: false`, `pointRadius: 0`, legend entry "IRMAA threshold (Tier 1)". Appears on the Lifetime Withdrawal Strategy chart.
- **Year-by-year IRMAA indicator**: small icon/text rendered via a Chart.js custom plugin (inline, tiny) that draws a `⚠` glyph above any bar where `irmaaCapped || irmaaBreached`. Same approach as the existing drag-hint plugin.
- **Synthetic-conversion segment**: a new dataset in the stacked bar chart with `label: 'Trad: Bracket-fill excess'`, rendered BETWEEN the Trad and Roth segments in the stack. Already how stacked bars work — just add a data array.
- **Rule-of-55 marker on lifecycle chart**: a scatter-point dataset at `(fireAge=55, portfolioValue)`, custom point style (e.g., `pointStyle: 'rectRot'` — diamond) to visually distinguish from the 59.5 unlock square marker.
- **SS-reduction annotation**: a line of text BELOW the chart (outside the canvas), in a `<p class="chart-caveat">` element. Updated by the render function with the current year's SS-fill amount.
- **Lifetime-tax-comparison caption**: a small text block below the Full Portfolio Lifecycle chart, populated with two numbers — lifetime tax under bracket-fill (from `computeWithdrawalStrategy`) and a retrospective "what-if" calculation using the retired cover-spend math (computed once on load for comparison purposes only).

**Rationale**:
- No plugin dependency aligns with Constitution Principle V (zero-dep).
- Inline plugins (like the existing drag-hint) are proven to work and composable.
- Text captions for complex annotations are easier to maintain than canvas-drawn overlays.

**Alternatives considered**:
- **Load `chartjs-plugin-annotation` from CDN**: rejected. New dep, needs CSP review, triples the download size, and we don't need it.
- **Canvas overlay for the horizontal line**: rejected. A line dataset is simpler.

---

## R9 — Info panel UI pattern

**Question**: The explanatory "What is bracket-fill smoothing?" info panel (spec FR-053) must be closed by default, expanded via ⓘ. What DOM pattern works?

**Decision**: Use the native `<details>` / `<summary>` element (already used elsewhere in the dashboard, e.g., the "📖 New to this?" panel on line 1749 of Generic). No JS needed. Style with existing `.coast-fire-note` / `.tw.summary` CSS patterns so it matches the dashboard's look.

The panel content includes:
1. Plain-English paragraph explaining bracket-fill.
2. Sub-paragraph on the safety margin.
3. Four tooltip-style short definitions of IRMAA, Rule of 55, 5-year Roth clock, synthetic conversion.
4. Two short paragraphs: "When this saves money" (most cases) and "When it doesn't" (high state tax, already-low-income years, large-QCD scenarios).

**Rationale**:
- Zero-JS for expand/collapse keeps the feature minimal.
- Matches an existing pattern the user has seen on the dashboard.
- Screen-reader accessible by default.

**Alternatives considered**:
- **Modal overlay**: rejected. Modal is heavier UI pattern and disrupts reading flow.
- **Tooltip on hover**: rejected. Content is too long for a tooltip.

---

## R10 — DWZ "earlier FIRE age" UX expectation

**Question**: Post-feature-007, DWZ will likely select an EARLIER FIRE age than it does today (because synthetic conversions grow the terminal portfolio). Is this a surprising behavior that needs a chart annotation?

**Decision**: YES. Add a one-line caption beneath the FIRE strategy buttons explaining when the user is in DWZ mode:

> "Die-With-Zero with bracket smoothing retires you earlier than the simple-tax version — your synthetic Trad→taxable conversions compound through retirement, so you need less starting portfolio to end at $0. If this surprises you, open the ⓘ below for the math."

**Rationale**:
- User's explicit requirement: transparency on everything the algorithm does.
- DWZ mode is where feature 007 has the LARGEST impact on FIRE age; silently shifting that would erode trust.
- Caption is only visible in DWZ mode — zero clutter for Safe/Exact users.

**Alternatives considered**:
- **No annotation, let the number speak**: rejected. User will wonder why the DWZ number changed after update. Explain proactively.
- **Annotation in every mode**: rejected. Safe/Exact see small shifts; DWZ sees large ones. Scope the annotation to DWZ.

---

## R11 — Existing tax-bracket inputs

**Question**: The dashboard already has `#twStdDed`, `#twTop12`, `#twTop22` inputs. Can we reuse them? What happens when Generic's filing status is Single?

**Decision**: Reuse the existing inputs. They're already plumbed through `getTaxBrackets(isMFJ)` which computes derived brackets from the user's top-level inputs (`stdDed` and `top12`). The current logic derives `top10 = top12 × 0.246`, `top24 = top22 × 1.91`, etc. — ratios from the IRS bracket table.

For Single-filer default values in Generic, the EXISTING i18n tooltips correctly document both MFJ and Single defaults. The `detectMFJ(inp)` helper already runs. But the current implementation does not AUTO-SWAP the default input values when filing status changes.

Decision: add a small helper `applyFilingStatusDefaults(isMFJ)` that, when called at init and when filing status changes, pre-fills `#twStdDed` and `#twTop12` with the right default for the current filing status, unless the user has manually edited them (detect via a `data-user-edited` attribute flipped on first input event). Scoped to Generic only.

**Rationale**:
- Without this, a single-filer user starting fresh sees MFJ defaults prefilled, which is misleading.
- Respecting user edits means we don't clobber someone who's intentionally using a different value.

**Alternatives considered**:
- **Always auto-fill defaults on filing-status change**: rejected. Would erase user customizations.
- **Show two sets of inputs (one MFJ, one Single) and reveal the right one**: rejected. Clutters the UI.
- **Do nothing, force user to update manually**: rejected. Poor UX.

---

## R12 — Backwards compatibility on localStorage reload

**Question**: Users with existing `STATE_KEY` blobs from feature 006 reload the page after feature 007 deploys. Do the new fields initialize correctly?

**Decision**: Yes, automatically. The `PERSIST_IDS` pattern reads each ID from localStorage on boot; missing IDs fall back to the DOM default value set in HTML. New inputs (`#safetyMargin`, `#rule55Enabled`, `#rule55SeparationAge`, `#irmaaThreshold`) will have HTML `value="..."` attributes with the correct defaults, so existing users see the defaults applied on reload.

No `STATE_KEY` schema migration is needed. `GENERIC_VERSION` (feature 005's version-wipe mechanism) does NOT need to bump — the new fields are additive, and missing-from-old-state-blob degrades gracefully to defaults.

**Rationale**:
- Feature-005's persistence design already accommodates additive fields. No breaking change needed.
- Avoiding a version bump preserves users' existing preferences (snapshots, scenario spending overrides, etc.).

**Alternatives considered**:
- **Bump `GENERIC_VERSION` to 'v4' and wipe state**: rejected. Users would lose unrelated state (snapshot history, scenario edits) for no reason.

---

## R13 — Keeping the retired cover-spend algorithm alive for comparison

**Question**: Tasks T025/T026 describe a helper `_computeLegacyLifetimeTax(inp)` that runs the retired cover-spend math once per input change to populate the lifetime-tax-comparison caption on the Full Portfolio Lifecycle chart. But FR-004 says the cover-spend algorithm is retired. Is keeping a frozen copy of retired logic appropriate?

**Decision**: Yes, but strictly scoped. The feature 007 implementation extracts the pre-feature-007 `taxOptimizedWithdrawal` body into a sibling function `_legacyTaxOptimizedWithdrawal_v6` (name chosen so the `_v6` suffix flags its retired-snapshot status). This function is called ONLY by `_computeLegacyLifetimeTax(inp)`, which runs the pre-bracket-fill math through a simplified in-memory retirement sim and returns a single lifetime-tax-paid number. The number is fed into the comparison caption. No other code path in the dashboard reads `_legacyTaxOptimizedWithdrawal_v6`. It is not exported via `window.*`, not wired to any chart, not part of any smoke test beyond the comparison caption's "value is present and within a sane range" check.

**Lifetime ownership**: this frozen helper is maintenance-free — feature 007's closeout declares it stable-and-removed-in-a-future-cleanup. When the comparison caption is eventually retired (e.g., a future feature replaces the "bracket-fill vs no-smoothing" comparison with a richer user-adjustable toggle), both `_computeLegacyLifetimeTax` and `_legacyTaxOptimizedWithdrawal_v6` are deleted together. Until then, no one changes them — the comparison number is supposed to represent what the pre-feature-007 dashboard would have shown, forever.

**Rationale**:
- Clears the semantic contradiction flagged in /speckit-analyze I2: "retired" means "no longer the default path," not "deleted from source." Freezing the snapshot as a sibling function documents the intent explicitly.
- Makes the "savings vs. no-smoothing" comparison honest and reproducible — without a frozen snapshot, the comparison number would drift as the rest of the algorithm evolves.
- Adds maybe 40–60 lines of inline JS per dashboard file; tolerable given the zero-build constraint and the analytical value of the caption.

**Alternatives considered**:
- **Live recomputation using the new algorithm with `safetyMargin=1.0`** (forcing no bracket-fill): rejected. `safetyMargin=1.0` would zero out the entire 12% bracket, which is NOT the same as the pre-feature-007 cover-spend-only behavior. Different semantics.
- **Hardcoded number from the RR baseline scenario**: rejected. The comparison caption must reflect the user's actual scenario (different spending, different home location, different Rule-of-55 settings), so it must be computed from `inp` at runtime.
- **Skip the caption entirely and just show the new bracket-fill lifetime tax as an absolute number**: rejected — spec FR-052 requires the comparison. Users' trust in the feature hinges on seeing the savings explicitly.

---

## Open items deferred to implementation

- Exact copy of all new i18n strings (EN + zh-TW). Will finalize during `/speckit-tasks` or during implementation.
- Exact color palette for the IRMAA threshold line vs. the synthetic-conversion bar segment. Start with `rgba(255,107,107,0.4)` (danger-tinted) for IRMAA, `rgba(108,99,255,0.55)` (accent-tinted) for synthetic conversion. Tune during implementation if they clash.
- Exact wording of the 5-year-Roth warning and the info panel prose. Content TBD during implementation; the placeholder is documented in the contracts.
- Whether to show a second "lifetime-tax-saved by bracket-fill" chart or just a caption. Decision: caption only for v1 (simpler, matches "tertiary" scope).

These are tuning details that do not block contract design or task generation.
