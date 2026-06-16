# Contract: `calc/taxEstimator.js` — `estimateYearTax(params)`

**Module type:** pure UMD classic-script (Constitution V). No DOM, no Chart.js, no globals
read, no `localStorage`, no module-scope mutation. Node-`require`-able and `file://`
`<script>`-loadable.

**Frame:** `nominal-$` — every numeric input and output is in the SELECTED YEAR's nominal
dollars. The module performs NO real↔nominal conversion; the caller (renderer) converts at
the boundary via `calc/inflation.js` (FR-017 single-conversion-site rule).

---

## Signature

```js
function estimateYearTax(params) -> EstimatorOutput
```

### Input `params` (see data-model.md §EstimatorInput)

Required numeric fields (all coerced `Number`, non-finite → treated as 0, negatives → 0
EXCEPT thresholds which clamp to ≥ 0):
`year, otherOrdinary, tradWithdrawal, rothConversion, ltcg, standardDeduction,
ordinaryBrackets[], ltcg0Ceiling, ltcg15Ceiling, irmaaThreshold, niitThreshold, niitRate`.

`ordinaryBrackets`: array of `{ threshold:number, rate:number }`, ascending by `threshold`,
with a `threshold: 0` entry as the lowest band. Reuses the same marginal-bracket convention
as `calc/tax.js applyMarginalBrackets`.

### Output `EstimatorOutput` (see data-model.md §EstimatorOutput)

`{ ordinary, ltcg, signals, marginal, totalTax, effectiveRate, steps }`, deeply frozen
(`Object.freeze`) like `calc/tax.js` does.

`steps`: ordered array of `{ key:string, args:(string|number)[] }` descriptors (NOT finished
sentences). Example sequence (keys are illustrative; final keys live in the i18n catalog):

```
{ key:'te.step.ordGross',   args:[otherOrdinary, tradWithdrawal, rothConversion, gross] }
{ key:'te.step.ordMinusStd', args:[gross, standardDeduction, taxable] }
{ key:'te.step.ordLayer',   args:[lower, upper, dollarsInLayer, ratePct, layerTax] }   // repeated
{ key:'te.step.ordTotal',   args:[ordinaryTax] }
{ key:'te.step.ltcgShelter', args:[shelteredByDeduction, taxableGain] }            // only when sheltered > 0
{ key:'te.step.ltcgStack',  args:[taxable, ltcg0Ceiling, roomLeftBeforeGain] }
{ key:'te.step.ltcgLayer',  args:[ratePct, dollars, layerTax] }                        // repeated
{ key:'te.step.ltcgTotal',  args:[ltcgTax] }
{ key:'te.step.ltcgPool',   args:[gainPool, ltcg, roomLeftAt0] }   // gainPool = max(0, ltcg0Ceiling + stdDed − gross)
```

---

## Behavioral guarantees (test these)

1. **Ordinary marginal arithmetic** — each dollar taxed at its bracket's rate; `ordinary.tax`
   equals the sum of emitted layer taxes.
2. **LTCG stacking** — the standard deduction offsets ordinary income first; any UNUSED
   portion (`max(0, stdDed − gross)`) shelters gains. Only the deduction-adjusted gain
   (`taxableGain = ltcg − min(ltcg, max(0, stdDed − gross))`) enters the schedule: it stacks on
   ordinary taxable income, with `max(0, ltcg0Ceiling − ordinaryTaxable)` at 0%, the next slice
   at 15% up to `ltcg15Ceiling`, the remainder at 20%. `gainAt0+gainAt15+gainAt20 === taxableGain`.
   Output exposes `ltcg.shelteredByDeduction` and `ltcg.taxableGain`.
3. **Standard-deduction shelter** — `ordinaryTaxable = max(0, gross − stdDed)`. A deduction
   larger than gross yields `ordinaryTaxable = 0` AND shelters gains with the leftover, so the
   0% room exceeds the bare ceiling (e.g. zero ordinary income ⇒ room `= ltcg0Ceiling + stdDed`,
   the well-known MFJ tax-free-gains figure).
4. **Room-left** — `signals.roomLeftAt0 === max(0, ltcg0Ceiling + stdDed − gross − ltcg)`. It
   shrinks dollar-for-dollar as EITHER gains OR ordinary income rise.
5. **Marginal** — `marginal.nextLtcgRate === 0` iff `roomLeftAt0 > 0`, else `0.15`
   (or `0.20` when `ordinaryTaxable + taxableGain >= ltcg15Ceiling`); `nextOrdinaryRate` is the
   rate of the band containing `ordinaryTaxable`.
6. **IRMAA** — `signals.irmaa.crossed === (irmaaThreshold > 0 && magi > irmaaThreshold)`.
7. **NIIT** — `crossed === (magi > niitThreshold)`; `amount === niitRate * min(ltcg, magi − niitThreshold)`
   when crossed, else 0. `niitThreshold` is whatever the caller passes (fixed $250k) — the
   module does not inflate it.
8. **Zero/again-zero** — all-zero numeric inputs ⇒ every tax 0, `effectiveRate === 0`, every
   `*.layers` empty, no NaN/Infinity anywhere in the output.
9. **Purity/immutability** — calling twice with the same input returns deep-equal output;
   the input object is not mutated; output is frozen.

---

## Edge-case fixtures (mirror spec edge cases; lock in `tests/unit/taxEstimator.test.js`)

| Fixture | Setup | Expected |
|---|---|---|
| Gain entirely in 0% | low ordinary, gain < room | `ltcg.tax === 0`, one 0% layer, `roomLeftAt0 > 0` |
| Gain straddles 0%→15% | gain > room, total < 15-breakpoint | 0% + 15% layers; `roomLeftAt0 === 0` |
| Ordinary eats all 0% room | ordinaryTaxable ≥ ltcg0Ceiling | `gainAt0 === 0`, full gain at 15%/20%, `roomLeftAt0 === 0` |
| NIIT trigger | magi > 250k | `niit.crossed === true`, amount = 3.8% of the lesser of gain / excess |
| IRMAA trigger | magi > irmaaThreshold | `irmaa.crossed === true` |
| Std-ded flooring | stdDed > gross | `ordinaryTaxable === 0`, `ordinary.tax === 0`, leftover deduction shelters gains |
| Deduction shelters gains | gross < stdDed, ltcg > 0 | `shelteredByDeduction = min(ltcg, stdDed − gross)`, `taxableGain` reduced, `roomLeftAt0` raised by the unused deduction |
| Tax-free-gains figure | zero ordinary income | `roomLeftAt0 === ltcg0Ceiling + stdDed` |
| 20% layer | very large gain above `ltcg15Ceiling` | three LTCG layers; 20% layer dollars > 0 |

---

## Consumers (Constitution VI)

- `renderYearTaxEstimator()` in `FIRE-Dashboard.html` (RR only) — the sole UI consumer.
- `tests/unit/taxEstimator.test.js` — regression pin.

(`FIRE-Dashboard-Generic.html` loads the script for calc-layer lockstep but does NOT consume
it — documented Principle-I divergence.)
