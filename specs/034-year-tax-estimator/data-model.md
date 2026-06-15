# Phase 1 Data Model: Year Tax Estimator

All dollar values in this model are **nominal dollars of the selected year** unless a row is
explicitly tagged `real-$` (those exist only inside the auto-pull adapter, before conversion).

---

## Entity: `EstimatorInput` (what the calc module consumes)

`estimateYearTax(params)` input object:

| Field | Type | Frame | Meaning / validation |
|---|---|---|---|
| `year` | integer | — | Selected calendar year (FIRE year … plan-age year). Used only for labels; math is frame-agnostic once values are nominal. |
| `otherOrdinary` | number ≥ 0 | nominal-$ | Other ordinary income (taxable SS portion + any taxable interest). Negative coerced to 0. |
| `tradWithdrawal` | number ≥ 0 | nominal-$ | Traditional 401k/IRA withdrawal (ordinary). |
| `rothConversion` | number ≥ 0 | nominal-$ | Roth conversion (ordinary). |
| `ltcg` | number ≥ 0 | nominal-$ | Realized long-term capital gain. |
| `standardDeduction` | number ≥ 0 | nominal-$ | Inflated standard deduction for `year`. |
| `ordinaryBrackets` | `{threshold, rate}[]` | nominal-$ | Ascending marginal brackets, inflated for `year`; `threshold:0` lowest. |
| `ltcg0Ceiling` | number ≥ 0 | nominal-$ | Top of the 0% LTCG band (inflated). |
| `ltcg15Ceiling` | number ≥ 0 | nominal-$ | 15%→20% breakpoint (inflated). May be `Infinity` to disable the 20% layer. |
| `irmaaThreshold` | number ≥ 0 | nominal-$ | IRMAA Tier 1 MAGI threshold (inflated). `0` disables the flag. |
| `niitThreshold` | number ≥ 0 | nominal-$ (FIXED) | NIIT MAGI threshold — passed as fixed $250k, NOT inflated. |
| `niitRate` | number | — | 0.038. |

**Derived inside the module:**
- `ordinaryGross = otherOrdinary + tradWithdrawal + rothConversion`
- `ordinaryTaxable = max(0, ordinaryGross − standardDeduction)`  *(floors at 0; deduction does not spill into LTCG room — FR edge case)*
- `magi ≈ ordinaryGross + ltcg`

---

## Entity: `EstimatorOutput` (what the calc module returns)

```text
{
  ordinary: {
    gross, standardDeduction, taxable,
    layers: [ { lowerThreshold, upperThreshold, dollarsInLayer, rate, tax } ... ],  // only layers with dollars > 0
    tax           // = sum(layers[].tax)
  },
  ltcg: {
    gain,
    ordinaryTaxableStacked,      // ordinaryTaxable that "fills the bottom" before gains
    layers: [
      { rate: 0.00, dollars: gainAt0,  tax: 0 },
      { rate: 0.15, dollars: gainAt15, tax: gainAt15*0.15 },
      { rate: 0.20, dollars: gainAt20, tax: gainAt20*0.20 }
    ],                            // include a layer only when dollars > 0
    tax           // = sum(layers[].tax)
  },
  signals: {
    roomLeftAt0:  number,        // max(0, ltcg0Ceiling − ordinaryTaxable − ltcg)
    irmaa:  { crossed: boolean, threshold, magi },
    niit:   { crossed: boolean, threshold: 250000, amount }   // amount = 0.038*min(ltcg, magi−250000) when crossed else 0
  },
  marginal: {
    nextOrdinaryRate: number,    // bracket rate the next ordinary $ lands in
    nextLtcgRate:     number     // 0 if roomLeftAt0>0 else 0.15 (or 0.20 above ltcg15Ceiling)
  },
  totalTax,                      // ordinary.tax + ltcg.tax
  effectiveRate,                 // totalTax / (ordinaryGross + ltcg); 0 when denom 0
  steps: string[]                // ordered, human-readable "show-your-work" lines (i18n keys resolved by renderer, see note)
}
```

**`steps[]` note:** to honor Principle VII (bilingual) and Principle II (purity — no `t()`
inside calc), the module returns **structured step descriptors** `{ key, args }` rather than
finished English sentences; the renderer resolves them through `t(key, ...args)`. (The
contract file specifies the descriptor shape.) This keeps the calc module language-neutral
and DOM-free.

**Invariants (locked by unit tests):**
- `ordinary.tax === sum(ordinary.layers[].tax)` (± 1e-6).
- `ltcg.tax === sum(ltcg.layers[].tax)` (± 1e-6).
- `gainAt0 + gainAt15 + gainAt20 === ltcg` (± 1e-6).
- `ordinaryTaxable >= 0` always (deduction flooring).
- all-zero input ⇒ all taxes 0, `effectiveRate === 0`, no NaN.
- `roomLeftAt0 >= 0`.

---

## Entity: `AutoPullRow` (renderer-only adapter; real-$ → nominal)

Maps one displayed-strategy per-year row to `EstimatorInput`'s income fields.

**Confirmed row shape (T001 audit, 2026-06-15):** each per-year row is `Object.assign({age, phase}, mix)`
where `mix = strategy.computePerYearMix(...)` (FIRE-Dashboard.html ~line 12398–12402). The
relevant `mix` fields (all **real-$**) are: `wTrad` (Traditional 401k draw, RMD already folded
in), `wRoth` / `wRothIra` / `wCash` (non-taxable draws), `wStocks` (taxable-stock sale proceeds),
`syntheticConversion` (bracket-fill Roth conversion), `ssIncome` (gross SS this year), `taxOwed`,
`shortfall`, `effRate`. The long-term-gain fraction of a stock sale is the existing `stockGainPct`
input (`ltcg = wStocks × stockGainPct`; equivalently `taxableDraw × (1 − basisFraction)` with
`basisFraction = 1 − stockGainPct`).

| Target (nominal-$) | Built from (real-$ row field) | Conversion |
|---|---|---|
| `otherOrdinary` | `0.85 × row.ssIncome` (taxable SS portion) | `toNominal(real, year)` |
| `tradWithdrawal` | `row.wTrad` (includes RMD) | `toNominal(real, year)` |
| `rothConversion` | `row.syntheticConversion` | `toNominal(real, year)` |
| `ltcg` | `row.wStocks × stockGainPct` | `toNominal(real, year)` |

Non-taxable draws (`wRoth`, `wRothIra`, `wCash`) do not feed any estimator field — they are
neither ordinary income nor capital gain. Roth-IRA withdrawal draws (`wRothIra`) likewise carry
no tax. If `ssIncome` is exposed under a different per-row key in the displayed strategy
(`renderRothLadder` re-derives `ssIncome` by age — FIRE-Dashboard.html ~14803-14807), the
adapter uses the same by-age SS source the Roth-ladder uses.

Settings (`standardDeduction`, brackets, `ltcg0Ceiling`, `ltcg15Ceiling`, `irmaaThreshold`)
are read from the existing Withdrawal Strategy tab inputs (today's-$) and inflated to `year`
with the same factor. `niitThreshold` is the literal constant `250000` (never inflated).

**Year set:** integer years from the effective FIRE year through the plan-age year
(`effectiveFireAge → planAge`, mapped to calendar years via current age + base year). Only
these populate the picker (FR-004 / edge case "year outside retirement range").

---

## State & lifecycle

- **Ephemeral.** No persistence. On tab open / recalc, the picker defaults to the first
  retirement year (or the current year if already retired) and auto-pulls.
- **Edit:** updates one `EstimatorInput` field → re-call `estimateYearTax` → repaint. No
  other state touched.
- **Reset:** re-run adapter for the selected year → re-seed all fields → repaint.
- **Year change:** same as Reset for the newly selected year.
