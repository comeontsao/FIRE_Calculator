# Contract — Healthcare Card Frame Display (B-022-3)

**Site**: `renderHealthcareCard` in both HTMLs.
**Feature**: 024-deferred-fixes-cleanup
**FRs**: FR-006, FR-007, FR-008

---

## Purpose

Convert the Healthcare cards (Geography → Country card; Geography → Healthcare deep-dive) from real-$ display to Book Value display. Closes the last user-facing $ display still in real-$ frame after feature 023's audit Book Value sweep.

## Input data (unchanged)

`HEALTHCARE_BY_COUNTRY` static table per HTML:

```js
{
  us: { pre65: 14400, post65: 6000 },     // today's-$ annual cost
  taiwan: { pre65: 1500, post65: 1500 },
  japan: { pre65: 4800, post65: 3600 },
  // ... 11 countries total
}
```

These values are real-$ "today's-spending" amounts per the table header comment.

## Display rules (NEW)

Each card shows two phases (pre-65 + post-65) with Book Value conversion:

```
Pre-65 phase: ages currentAge .. 65
  midpointAge = (currentAge + 65) / 2
  displayValue = displayConverter.toBookValue(realValue, midpointAge, currentAge, inflationRate)

Post-65 phase: ages 65 .. endAge
  midpointAge = (65 + endAge) / 2
  displayValue = displayConverter.toBookValue(realValue, midpointAge, currentAge, inflationRate)
```

**Why midpoint**: The card represents an "average annual cost during this phase." Using midpoint Book Value gives a representative figure. Using endpoint (e.g., age 65 boundary) would underestimate pre-65 average since real-$ inflates monotonically.

**Example** (RR-baseline, US, currentAge=42, inflationRate=3%, endAge=100):
- Pre-65: midpointAge = (42 + 65) / 2 = 53.5; factor = 1.03^11.5 = 1.405; displayValue = $14,400 × 1.405 = $20,232
- Post-65: midpointAge = (65 + 100) / 2 = 82.5; factor = 1.03^40.5 = 3.34; displayValue = $6,000 × 3.34 = $20,040

Both numbers are in 2080-ish dollars (Book Value at the phase midpoint year).

## Bilingual frame suffix

Existing translation keys updated where possible; new keys for explicit BV labels:

| Key | EN | zh-TW |
|---|---|---|
| `healthcare.card.pre65.label` (existing) | "Pre-65 cost (Book Value, {0}yr avg)" | "65歲前年度成本（帳面價值，{0}年平均）" |
| `healthcare.card.post65.label` (existing) | "Post-65 cost (Book Value, {0}yr avg)" | "65歲後年度成本（帳面價值，{0}年平均）" |

Where `{0}` is the years-from-now of the phase midpoint (e.g., "11" for pre-65 starting from age 42).

## Test contract

Manual test only (Geography tab is UI; smoke per quickstart.md):

1. Open Geography tab → US scenario card → verify pre-65 + post-65 values are larger than today's-$ raw values from `HEALTHCARE_BY_COUNTRY` (accounting for ~1.4× and ~3.3× factors at the midpoint ages).
2. Toggle inflation rate slider 1% → 3% → 5%; verify card values scale proportionally.
3. Switch to TW scenario; verify values adjust per TW cost table.
4. EN ↔ 中文 toggle: verify frame suffix renders correctly in both languages.

## Frame summary

| Field | Frame | Site |
|---|---|---|
| `HEALTHCARE_BY_COUNTRY` table values | real-$ (input data) | static table at top of HTMLs |
| Card displayed value | nominal-$ Book Value | `renderHealthcareCard` post-conversion |
| Card label "Pre-65 cost ... yr avg" | pure-data | translation keys |
