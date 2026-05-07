# Research — 027 Aggressive Bracket-Fill Strategy

**Status (2026-05-07):** All three Phase 0 tracks resolved during planning. No NEEDS-CLARIFICATION markers remain. Citations to source code verified.

---

## Section 1 — Naming & user-facing copy

**Question:** Is "Aggressive Bracket-Fill" the right name? Does the description convey when to choose it without confusing users about the trade-off?

### Existing strategy name landscape

| ID | EN name | Vocabulary signal |
|----|---------|-------------------|
| `bracket-fill-smoothed` | "Bracket-Fill (Smoothed)" | Action + qualifier |
| `tax-optimized-search` | "Tax-Optimized Search (θ)" | Algorithm-flavored |
| `trad-first` | "Trad First" | Order-of-operations |
| `roth-ladder` | "Roth Ladder" | Industry-standard term |
| `trad-last-preserve` | "Trad Last (Preserve)" | Order + qualifier |
| `proportional` | "Proportional" | Mechanism-named |
| `conventional` | "Conventional" | Default-ordering |

The existing names use either an **action verb + qualifier** ("Trad Last (Preserve)", "Bracket-Fill (Smoothed)") or an **industry term** ("Roth Ladder"). "Aggressive Bracket-Fill" matches the verb-qualifier pattern.

### Money Terminology check (CLAUDE.md rule)

Project rule: use "lifetime tax / broker dollars / Book Value / purchasing power"; avoid "real $", "real money", "real value" without qualification.

Proposed copy:

| Field | EN |
|-------|----|
| Name | Aggressive Bracket-Fill |
| Description | Fills the 12% bracket every retirement year and reinvests the after-tax surplus into Taxable stocks. Larger lifetime tax savings than Smoothed Bracket-Fill but requires you to actually reinvest the surplus (not consume it). Best for households with modest Trad balances and long retirements. |
| Narrative (in audit) | Strategy: aggressive bracket-fill — every accessible pre-SS year fills the (stdDed + top12) × (1 − safetyMargin) headroom; after-tax surplus routes into stocks via synthetic conversion. Reverts to smoothed cap age 70+ when SS becomes ordinary income. |
| Tooltip | Pick this when your Trad 401k balance is modest relative to retirement length and you want to use your standard-deduction headroom in years 60-69 (before SS taxable income stacks with Trad pulls). The Smoothed variant spreads Trad evenly and may leave deduction headroom unused. |

The wording avoids "real $" / "real money" / "real value" entirely. Uses "lifetime tax" and "broker dollars / stocks" terminology consistent with the project glossary.

### Decision

- **Decision:** Adopt the working name **"Aggressive Bracket-Fill"** and the proposed copy above.
- **Rationale:** Matches the existing verb-qualifier naming pattern (parallel to "Bracket-Fill (Smoothed)"). The qualifier "Aggressive" signals that the strategy fills the bracket maximally without smoothing, which is what users intuitively expect when they read "fills the 12% bracket". The description names the trade-off explicitly ("requires you to actually reinvest the surplus") so users can't accidentally pick it without understanding the pre-condition.
- **zh-TW translation (cross-checked against existing zh-TW vocabulary):**
  - Name: 「主動填滿稅階」(zhǔdòng tián mǎn shuì jiē — "actively fill the tax bracket")
  - Description: 退休每年填滿 12% 稅階，把扣稅後的剩餘投回應稅股票。比「平滑填滿」少繳更多終身稅，但必須真的把剩餘投回去（不能拿來花）。適合 401(k) 餘額不大、退休年數長的家庭。
  - Tooltip: 當你的 Trad 401(k) 相對於退休年數偏低，且想在 60–69 歲（社安開始前）善用標準扣除額空間時選擇這個策略。「平滑填滿」會把提取分散到所有年份，可能讓扣除額空間沒有被用滿。
- **Alternatives considered:**
  - "Front-Loaded Bracket-Fill" (rejected — accurate but users may misread "front-loaded" as "high-risk").
  - "Full Bracket-Fill" (rejected — too close to the existing "Bracket-Fill (Smoothed)"; users may not see the trade-off from the name alone).
  - "Maximize Pre-SS Trad" (rejected — too jargon-heavy for the strategy card).

---

## Section 2 — Strategy ranker behavior in Mode × Objective cells

**Question:** Aggressive Bracket-Fill produces lower lifetime tax than Smoothed (US2 verified). In `(dieWithZero, minimizeTax)` the primary sort key is `cumulativeFederalTax asc`. Does this mean Aggressive ALWAYS wins under DWZ + pay-less-tax? Is that the right outcome?

### Constitution IX table (re-verified)

| Mode | Objective | Primary sort | Tie-breaker 1 | Tie-breaker 2 |
|------|-----------|--------------|---------------|---------------|
| safe | preserve | endBalance desc | residualArea desc | strategyId asc |
| safe | minimizeTax | cumulativeFederalTax asc | endBalance desc | strategyId asc |
| exact | preserve | endBalance desc | residualArea desc | strategyId asc |
| exact | minimizeTax | cumulativeFederalTax asc | endBalance desc | strategyId asc |
| dieWithZero | preserve | residualArea desc | \|endBalance\| asc | strategyId asc |
| dieWithZero | minimizeTax | cumulativeFederalTax asc | residualArea desc | strategyId asc |

### Walking through each cell with Aggressive vs Smoothed at SC-026-A

For SC-026-A (Aggressive: tax $116K, BV $1.13M; Smoothed: tax $166K, BV $628K):

| Cell | Sort key | Aggressive vs Smoothed | Aggressive wins? |
|------|----------|------------------------|:----------------:|
| `(safe, preserve)` | endBalance desc | $1.13M > $628K | ✅ |
| `(safe, minimizeTax)` | cumulativeFederalTax asc | $116K < $166K | ✅ |
| `(exact, preserve)` | endBalance desc | $1.13M > $628K | ✅ |
| `(exact, minimizeTax)` | cumulativeFederalTax asc | $116K < $166K | ✅ |
| `(dieWithZero, preserve)` | residualArea desc | computed from per-year totals — Aggressive's late-life is Stocks-heavy with steady growth; Smoothed's late-life has Trad still active. Aggressive likely wins residualArea (always-positive, larger area under curve). | ✅ likely |
| `(dieWithZero, minimizeTax)` | cumulativeFederalTax asc | $116K < $166K | ✅ |

### Is "aggressive always wins" the right outcome?

**Yes — for SC-026-A specifically.** This is precisely the discovery from feature 026 US2: aggressive bracket-fill with reinvestment is **Pareto-better** for users with modest Trad + long retirement. There is no trade-off to second-guess at this fixture.

**For other scenarios** (e.g., the "high-Trad" case in spec SC-003: $4M Trad / 30-year retirement), the strategies converge — `smoothedTarget ≈ bracketHeadroom`, so aggressive ≈ smoothed. The ranker correctly tie-breaks on `strategyId asc` (alphabetical) — `aggressive-bracket-fill` < `bracket-fill-smoothed` so aggressive still wins, but with negligible numerical difference. This is acceptable and consistent with Constitution IX (deterministic ordering).

### Decision

- **Decision:** Aggressive participates in **all 6 (Mode × Objective) cells** without special-casing. No new sort axis added. No Constitution IX amendment needed.
- **Rationale:** The existing sort-key chain handles the new strategy correctly. For modest-Trad users the new strategy genuinely wins (Pareto-better); for high-Trad users it ties with Smoothed and the alphabetical tie-breaker picks one deterministically — no flicker, no surprise.
- **Risk callout for Phase 2:** add a regression test to `tests/unit/modeObjectiveOrthogonality.test.js` that exercises all 6 cells with the new strategy in the registry. This catches accidental sort-axis introduction.
- **Alternatives considered:**
  - Restrict aggressive to `(*, minimizeTax)` cells only (rejected — Constitution IX prohibits per-cell strategy gating).
  - Special-case the `dieWithZero` cell to disqualify aggressive when terminal estate >> 0 (rejected — DWZ's only end-state constraint is `endBalance ≥ 0`; users who pick DWZ + minimizeTax explicitly accept they may not drain to zero if it saves tax).

---

## Section 3 — Reinvestment plumbing via existing synthetic-conversion mechanic

**Question:** Does the existing `taxOptimizedWithdrawal` Step 8 (synthetic conversion) handle reinvestment automatically, or does the new strategy need additional plumbing?

### Code path verification

**Step 8 location:** `FIRE-Dashboard.html:11014-11018`

```js
// === Step 8: Synthetic conversion — excess of net receipts over gross spend ===
const totalTax = taxOwed + ltcgTax;
const grossReceived = ssIncome + wTrad + wRoth + wStocks + wCash;
const netReceived = grossReceived - totalTax;
const syntheticConversion = (netReceived > grossSpend) ? (netReceived - grossSpend) : 0;
```

**Caller wiring (re-injects into pStocks):**
- `FIRE-Dashboard.html:9170` (signed sim): `if (mix.syntheticConversion > 0) pStocks += mix.syntheticConversion;`
- `FIRE-Dashboard.html:10549` (chart sim / projectFullLifecycle): `if (mix.syntheticConversion > 0) portfolioStocks += mix.syntheticConversion;`

### Trace through aggressive policy

For a year where `disableSmoothingCap: true`, `canAccess401k: true`, `ssIncome: 0`:

1. Step 2 sets `wTrad = rmd + min(pTrad − rmd, bracketHeadroom)`. For SC-026-A at age 65: `wTrad ≈ $118,085`.
2. Step 3-6 compute `wRoth`, `wStocks`, `wCash` to fund spending. Most spending will be funded by `wTrad` directly (it's $118K, spend is $78K). `wRoth = wStocks = wCash = 0` likely.
3. Step 8: `grossReceived = 0 + 118085 + 0 + 0 + 0 = $118,085`. `totalTax ≈ $10,106`. `netReceived = $107,979`. `grossSpend = $77,880`. `syntheticConversion = $107,979 − $77,880 = $30,099`.
4. Caller: `pStocks += $30,099` after the year's compounding.
5. Next year: pStocks is bigger by ~$30K, compounds at real rate.

**Verified:** The reinvestment IS automatic. Aggressive policy needs only to set wTrad larger; Step 8 + caller wiring handles the rest.

### Decision

- **Decision:** **No new code paths needed for reinvestment.** Aggressive policy modifies Step 2 only; Step 8 + caller wiring handles surplus → pStocks automatically.
- **Rationale:** The synthetic-conversion mechanic was originally introduced in feature 007 for the smoothed bracket-fill strategy. It's already designed to handle the case where wTrad > grossSpend. Aggressive policy just exercises this path more often / with larger amounts.
- **Risk callout for Phase 2:** the unit test for aggressive must verify that pStocks at age N+1 has grown by approximately `syntheticConversion(year N)` × (1 + realReturnStocks) over the year. This catches any accidental loss of reinvestment.
- **Alternatives considered:**
  - Add a new `wReinvest` field to PerYearMix (rejected — duplicate of existing syntheticConversion).
  - Have aggressive bypass Step 8 and inject reinvestment in the strategy's own callback (rejected — fragments the reinvestment logic across two code paths).

---

## Cross-cutting — output schema for `tasks.md`

Phase 2 (`/speckit-tasks`) consumes this file and produces a tasks list whose ordering respects:

1. **Track A name decision is final** — Phase 2 task list can use "Aggressive Bracket-Fill" as the canonical name in test files and translations.
2. **Track B confirms no Constitution IX amendment** — Phase 2 doesn't need a constitution-update task.
3. **Track C confirms zero new reinvestment plumbing** — Phase 2's calc-layer change is the smallest possible: one option flag in `taxOptimizedWithdrawal` + one Step-2 conditional.
