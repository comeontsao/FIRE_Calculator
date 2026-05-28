# Research: Roth IRA Accounts (Feature 032)

**Feature**: 032-roth-ira-accounts
**Phase**: 0 (Outline & Research)
**Date**: 2026-05-28

## Open implementation questions resolved here

1. Strategy for renaming the misleadingly-named canonical field `rothIraReal`
2. UI placement for the two new annual-contribution inputs on the Investment tab
3. Lifecycle chart treatment — separate `pRothIra` series vs. merged "Roth Total" line

## Q1 — Canonical field rename `rothIraReal` → `roth401kReal`

### Decision

**Rename `rothIraReal` to `roth401kReal` across the canonical-input shape, and introduce a new `rothIraReal` field for the actual Roth IRA pool.** Perform the rename in the same feature commits as the new pool work, with a full fixture sweep.

### Context

The canonical-input field `rothIraReal` was named during feature 001 (modular calc engine) when there was only one Roth pool in the dashboard (the existing Roger's Roth 401K). The field name implied "Roth IRA," but the source DOM input was `roger401kRoth` (the Roth 401K balance) — a longstanding misnomer.

Grep across the live codebase shows the field is referenced in:

| File | Role |
|---|---|
| `calc/withdrawal.js` | Pool input mapping (line 195) |
| `calc/lifecycle.js` | Portfolio field validation loop (line 180) |
| `calc/getCanonicalInputs.js` | Adapter from RR/Generic legacy shape → canonical (line 192) |
| `tests/unit/withdrawal.test.js` | Test assertions |
| `tests/unit/lifecycle.test.js` | Test assertions |
| 8× `tests/fixtures/*.js` | Fixture values (`accumulation-only.js`, `coast-fire.js`, `generic-realistic.js`, `infeasible.js`, `mode-switch-matrix.js`, `real-nominal-check.js`, `three-phase-retirement.js`, `types.js`) |
| `BACKLOG.md` | Documentation reference |

Spec docs (`specs/001-modular-calc-engine/*`, `specs/002-inline-bugfix/*`) are read-only history and are NOT touched.

### Rationale

- **IRS reality**: Roth 401K and Roth IRA are independent account types with different contribution limits, RMD rules (Roth IRA has no lifetime RMD; Roth 401K had RMD pre-SECURE-2.0 rollover rules), and access semantics. Conflating them under one canonical name guarantees future bugs.
- **One-time cost, paid now**: Touching ~14 live files (3 source, 3 test, 8 fixture) is bounded. Doing the rename inside this feature's commits costs the same as keeping the misnomer plus adding a new awkwardly-named sibling field, and yields a clean future-proof model.
- **Same-commit fixture sweep**: per Principle IV, fixture changes ship in the same commit as the calc change. The rename naturally maps `rothIraReal` (old) → `roth401kReal` (new) in every fixture; the new actual Roth IRA pool gets its own seeded balance per fixture.

### Alternatives considered

| Option | Why rejected |
|---|---|
| Keep `rothIraReal` summed (Roth 401K + Roth IRA) into one canonical field | Loses the ability to track the two pools separately in the calc engine, which FR-021b explicitly requires. Tooltips and audit invariants can't surface them separately. |
| Keep `rothIraReal` as-is (still meaning Roth 401K) and add a new sibling `actualRothIraReal` or `rothIraReal2` | Perpetuates the misleading name; every future developer reading the code has to learn the misnomer. The bad-name carrying cost grows with every consumer added. |
| Add a deprecation alias (export both `rothIraReal` (old meaning) and `roth401kReal` for one feature cycle) | No external consumers — all references are inside this repo. No deprecation period needed. Pure cost, no benefit. |

### Concrete rename mapping

| Old name | New name | Meaning |
|---|---|---|
| `rothIraReal` | `roth401kReal` | Roth 401K balance, real-$ |
| (new) | `rothIraReal` | Roth IRA balance, real-$ — the new pool |

### Migration risk

LOW. The rename is mechanical (text replace), the test suite is comprehensive (622 tests), and the new pool work itself requires touching every fixture file anyway. The risk is missing one consumer — mitigated by `tests/unit/withdrawal.test.js` and `tests/unit/lifecycle.test.js` failing loudly if the rename is incomplete.

## Q2 — UI placement and input type for annual Roth IRA contributions

### Decision

**Add a new section titled "Roth IRA Contributions (annual)" on the Investment tab, directly below the existing 401K Roth Contribution slider. Use two `<input type="number">` fields (Roger + Rebecca), each with default value `7000`, no hard `max` attribute, and helper tooltips listing the current-year IRS limit ($7,000 base / $8,000 with age-50+ catch-up for 2026).**

### Context

The existing 401K contribution UI pattern is a range slider:

```html
<label><span data-i18n="invest.contrib401kRoth">401K: Roth Contribution (after-tax)</span> <span class="val" id="contrib401kRothVal">$2,850</span> ...</label>
<input type="range" id="contrib401kRoth" min="0" max="23500" step="100" value="2850" oninput="...">
```

The slider works for 401K because the limit is high ($23,500 in 2026) and granularity at $100 steps is visually distinguishable. For Roth IRA the limit is much smaller ($7,000–$8,000), and the user has explicitly indicated they expect the limit to grow over future years ("we believe next year it might go to 7.5k, and might grow the limit per years").

### Rationale

- **Number input over slider**: a range slider with `max=8000` would prevent the user from setting future-year values above the current limit. A number input has no hard ceiling.
- **No hard `max` attribute**: per the user's explicit instruction that the dashboard should NOT enforce the IRS limit. The helper text shows the current limit purely as a reference.
- **Default 7000**: matches the 2026 base IRS limit and the user's stated locked default for both Roger and Rebecca.
- **Dedicated section**: visually separates Roth IRA contributions from the existing Roth 401K slider, making the IRS account-type distinction visible to the user.
- **Section placement**: below the existing 401K Roth Contribution slider keeps related concepts visually grouped, while clearly delineating "401K Roth" (capped at $23,500) from "Roth IRA" (capped at $7,000–$8,000).

### Alternatives considered

| Option | Why rejected |
|---|---|
| Range slider with `max=8000` matching the 401K pattern | Doesn't support future-year limit growth; user must edit HTML to raise the slider's max each tax year. |
| Single combined "Roth Contributions (after-tax)" slider summing 401K + IRA | Conflicts with FR-020b (Roth IRA contributions are SEPARATE additive amounts, not a subdivision of `rothFraction`). Loses IRS account-type clarity. |
| Place on the Assets tab next to the balance inputs | Violates the established pattern (contributions live on Investment tab, balances on Assets tab). Cognitive overhead for users who already know the layout. |
| Use a slider with `min=0 max=10000` to support modest growth | Picks an arbitrary upper bound; same root problem as `max=8000`. |

### DOM ID convention

| Input | DOM id | Default value | Helper tooltip |
|---|---|---|---|
| Roger Roth IRA balance (Assets tab) | `rogerRothIra` | `0` | "Roger's individual Roth IRA balance (not part of 401K)." |
| Rebecca Roth IRA balance (Assets tab) | `rebeccaRothIra` | `59021` | "Rebecca's individual Roth IRA balance." |
| Roger Roth IRA contribution (Investment tab) | `rogerRothIraContrib` | `7000` | "Annual after-tax Roth IRA contribution. 2026 IRS limit: $7,000 base / $8,000 with age-50+ catch-up." |
| Rebecca Roth IRA contribution (Investment tab) | `rebeccaRothIraContrib` | `7000` | "Annual after-tax Roth IRA contribution. 2026 IRS limit: $7,000 base / $8,000 with age-50+ catch-up." |

### i18n keys

EN + zh-TW pairs (Principle VII):

```
'assets.rogerRothIra': "Roger's Roth IRA"        / 'Roger 的 Roth IRA (個人退休帳戶)'
'assets.rebeccaRothIra': "Rebecca's Roth IRA"    / 'Rebecca 的 Roth IRA (個人退休帳戶)'
'assets.rothIraGroup': "🔒 Roth IRA"             / '🔒 Roth IRA'
'invest.rothIraSection': "Roth IRA Contributions (annual)"  / 'Roth IRA 年度供款'
'invest.rogerRothIraContrib': "Roger's Roth IRA Contribution"     / 'Roger 的 Roth IRA 供款'
'invest.rebeccaRothIraContrib': "Rebecca's Roth IRA Contribution" / 'Rebecca 的 Roth IRA 供款'
'invest.rothIraLimitTooltip2026': "2026 IRS limit: $7,000 base / $8,000 catch-up (age 50+)." / '2026 IRS 上限：$7,000 / 50 歲以上 $8,000'
```

## Q3 — Lifecycle chart: separate `pRothIra` series vs. merged Roth Total

### Decision

**Add a separate `pRothIra` dataset to the Lifecycle chart, distinct from the existing `pRoth` (Roth 401K) series. Use a coordinated but visually distinguishable color (lighter shade of the existing Roth-401K purple). The chart's existing color-coding convention assigns a unique color per pool; the new pool gets one.**

### Context

The existing Lifecycle chart has one `pRoth` series for Roth 401K. Two options for the new pool:

- **(a) Separate**: two distinct series, each its own color/legend entry. The user can visually distinguish Roth 401K from Roth IRA at every projection year.
- **(b) Merged**: one combined "Roth Total" line summing both pools. Fewer datasets, less legend clutter, but the user loses the ability to see strategy-driven differences (e.g., a strategy that draws Roth 401K first leaves a flat Roth IRA balance for a few years — only visible if the series are separate).

### Rationale

- **Audit observability (Principle II)**: the audit's flow diagram needs `subSteps` for each calc stage. With a single Roth Total line, "Roth IRA → Roth 401K depletion order" is invisible to the user. Separate series makes the strategy's pool ordering visually traceable.
- **Strategy debugging**: when the strategy ranker picks a Roth-first winner, the user can SEE the order in which the two Roth pools deplete. Single-line merging would obscure this.
- **User intent**: the user explicitly said "I want this to be planned so it merges well for all the calucations in the dashboard (like life cycle or strategies or debug or CLI or asset total or fire year or withdraw strategy...)". The user wants to see the new pool's behavior distinctly across surfaces — including the lifecycle chart.
- **Color budget**: the chart's existing palette has room for one more pool color (verified via inspection of `case 'roth':` block at line 4409). A lighter purple variant maintains theming cohesion.

### Alternatives considered

| Option | Why rejected |
|---|---|
| Merged "Roth Total" single line | Loses strategy-order visibility. Audit observability suffers. Doesn't match the user's "see it everywhere" intent. |
| Hide the Roth IRA line by default, expose via a chart settings toggle | Adds UI surface for no clear benefit; the user wants the new pool visible by default. |
| Show Roth IRA only as a tooltip number on the existing pRoth line | Halfway compromise that pleases no one — adds info to the tooltip but loses chart visualization. |

### Color assignment

| Pool | CSS variable | Default hex |
|---|---|---|
| `roth` (Roth 401K, existing) | `--chart-roth` | `#846cff` (purple) |
| `rothIra` (Roth IRA, new) | `--chart-rothIra` | `#a890ff` (lighter purple — same hue family, ~20% lighter) |

### Chart-module contract update (Principle VI)

The Lifecycle chart's render-function comment will be extended to declare:

```javascript
// Consumers: pRoth (Roth 401K balance, from calc/withdrawal.js + accumulation),
//            pRothIra (Roth IRA balance, NEW in feature 032).
```

The corresponding entries in `calc/withdrawal.js` and `calc/accumulateToFire.js` add the Lifecycle chart to their `Consumers:` list.

## Summary of decisions

| # | Question | Decision | Risk |
|---|---|---|---|
| Q1 | Rename `rothIraReal` | Rename to `roth401kReal`; new `rothIraReal` for actual Roth IRA. Fixture sweep in same commit. | LOW (~14 live files, comprehensive test coverage catches misses) |
| Q2 | Contribution input UI | Number input (no hard max), default 7000, on Investment tab under existing Roth 401K slider. Dedicated "Roth IRA Contributions (annual)" section. | LOW (new section is additive; doesn't disturb existing wiring) |
| Q3 | Lifecycle chart series | Separate `pRothIra` dataset, lighter purple. Audit-observable. | LOW (palette has room; existing pattern extends cleanly) |
