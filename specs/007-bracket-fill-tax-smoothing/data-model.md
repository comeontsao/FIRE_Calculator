# Data Model — 007 Bracket-Fill Tax Smoothing

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Research**: [research.md](./research.md)

The feature is calc-layer + UI — no schema changes to CSV, no new calc modules added (changes land inside the existing inline calc block). The entities below describe new input fields, new return-object fields, new persisted keys, and new derived intermediate values.

---

## 1. Bracket-Fill Safety Margin

User-controlled scalar that shrinks every IRS-indexed threshold uniformly.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `#safetyMargin` (DOM input) | range slider | 0–10 (integer %) | Persisted per-file via `PERSIST_IDS` |
| `safetyMargin` (calc param) | number | 0.0–0.10 (fractional) | Derived as `#safetyMargin.value / 100` in `getInputs()` |

**Default**: 5 (= 0.05). **Validation**: clamped to `[0, 10]` on input.

**Propagation**: flows through `getInputs().safetyMargin` into `taxOptimizedWithdrawal` and `projectFullLifecycle` / `signedLifecycleEndBalance` / `computeWithdrawalStrategy` without any of them needing to re-read the DOM.

---

## 2. Rule of 55 State

User toggle + separation age. Controls whether the 401(k) unlock drops from 59.5 to 55.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `#rule55Enabled` (DOM input) | checkbox | checked / unchecked | Persisted per-file |
| `#rule55SeparationAge` (DOM input) | number input | 50–65 | Persisted per-file |
| `rule55.enabled` (calc param) | boolean | — | — |
| `rule55.separationAge` (calc param) | integer | 50–65 | — |

**Default**: unchecked, separationAge = current FIRE age (updated reactively when FIRE age changes via a one-line listener in `getInputs()`).

**Validation**: if `enabled && separationAge < 55`, show UI warning; calc falls back to `effectiveUnlockAge = 59.5`.

**State transitions**:

```
                    user checks "Plan to use Rule of 55"
[locked @ 59.5] ────────────────────────────────────────▶ [rule55 candidate]
       ▲                                                         │
       │        user unchecks                                    │
       └─────────────────────────────────────────────────────────┘
                                  │
                    separationAge >= 55? AND age >= 55?
                                  │
                         YES  ────┼──── NO (fallback to 59.5)
                                  ▼
                       [unlocked @ 55 for TRAD + ROTH]
```

---

## 3. IRMAA Tier 1 Threshold

User-editable dollar amount representing Medicare Part B/D surcharge Tier 1 entry.

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `#irmaaThreshold` (DOM input) | number input | ≥ 0 (dollars) | Persisted per-file |
| `irmaaThreshold` (calc param) | number | — | — |

**Default**:
- RR: 212000 (MFJ, 2026).
- Generic: auto-selects based on `detectMFJ(inp)`. When MFJ: 212000. When Single: 106000. On filing-status change, the helper `applyFilingStatusDefaults(isMFJ)` (R11) updates this input's value unless the user has manually edited it.

**Disable sentinel**: a value of `0` or blank disables IRMAA protection. The UI shows an `⚠️ IRMAA protection disabled` hint.

---

## 4. Synthetic Conversion (per retirement year)

Derived value captured in the withdrawal algorithm's return object; not persisted.

| Field | Type | Description |
|-------|------|-------------|
| `syntheticConversion` | number (dollars) | Excess Traditional drawn above the year's gross spending need, minus the tax owed on that Traditional draw. Routes into `pStocks` at next-year boundary. |

**Invariant**: `syntheticConversion >= 0`. If zero, no routing occurs (Trad draw exactly matched spend).

**Consumers**: `projectFullLifecycle`, `signedLifecycleEndBalance`, `computeWithdrawalStrategy` — all three must apply `pStocks += syntheticConversion` identically before the stocks compounding step.

---

## 5. Year-Level Annotation Flags

New fields returned from `taxOptimizedWithdrawal` so the chart can render caveat indicators without re-deriving.

| Field | Type | Meaning |
|-------|------|---------|
| `ssReducedFill` | boolean | True when SS taxable portion consumed > 20% of bracket headroom this year. |
| `irmaaCapped` | boolean | True when the bracket-fill was reduced to keep MAGI under the IRMAA threshold. |
| `irmaaBreached` | boolean | True when MAGI breaches threshold EVEN AFTER reducing Trad to zero (rare; SS + stocks alone push over). |
| `rule55Active` | boolean | True when this year's Trad draw is a Rule-of-55 draw (age 55 ≤ age < 59.5). |
| `roth5YearWarning` | boolean | Placeholder — always false in feature 007. Wired for a future true-Roth-conversion feature. |

These flags flow from `taxOptimizedWithdrawal` → `computeWithdrawalStrategy` (per-year strategy row) → the Lifetime Withdrawal Strategy chart renderer → rendered as icons/tooltips/legend segments. Constitution Principle VI requires the renderer's consumer comment to name each of these fields it reads.

---

## 6. Persisted State Additions (localStorage)

No standalone keys — everything goes through the existing `PERSIST_IDS` array. RR and Generic each add:

- `'safetyMargin'` (DOM: `#safetyMargin`)
- `'rule55Enabled'` (DOM: `#rule55Enabled`)
- `'rule55SeparationAge'` (DOM: `#rule55SeparationAge`)
- `'irmaaThreshold'` (DOM: `#irmaaThreshold`)

The existing `saveState()` / `restoreState()` logic handles them automatically once the IDs are appended to `PERSIST_IDS`.

Matching `SLIDER_LABELS` entry for `safetyMargin` (the slider has a numeric readout):

```
safetyMargin: { el: 'safetyMarginVal', fmt: v => v + '%' }
```

---

## 7. No schema changes elsewhere

| Area | Impact |
|------|--------|
| `FIRE-snapshots.csv` | None. No new columns. |
| `calc/*.js` modules | None — all calc lives inline. |
| `TRANSLATIONS.en` / `TRANSLATIONS.zh` | Additive: ~15–20 new keys per dict per file. |
| `GENERIC_VERSION` | NOT bumped. New fields degrade gracefully to defaults for users with existing state. |
| `SNAPSHOT_KEY` | Unchanged. |
| `STATE_KEY` | Unchanged (shape is additive). |

---

## 8. Filing-status propagation (Generic)

Generic already defines `detectMFJ(inputs)`. Feature 007 extends its reach by ensuring every bracket lookup in the retirement-math path routes through it:

- `signedLifecycleEndBalance` (line 5505 of Generic, currently `getTaxBrackets(true)` — REGRESSION from feature 006): change to `getTaxBrackets(detectMFJ(inp))`.
- `projectFullLifecycle` (line ~6023, already correct): no change.
- `computeWithdrawalStrategy` (line ~7210, already correct): no change.

RR has MFJ hardcoded in all three by design (personal content) — no change.

---

## 9. Input object shape (additive)

The `getInputs()` helper returns a single `inp` object. Feature 007 adds:

```js
{
  // ... existing fields ...
  safetyMargin: 0.05,                    // 0.0–0.10
  rule55: {
    enabled: false,                      // bool
    separationAge: 54,                   // integer
  },
  irmaaThreshold: 212000,                // dollars; 0 = disabled
}
```

Backward compatibility: no existing consumer of `inp` reads these new fields, so the additive shape is safe. New consumers (the three simulator functions) read them via defensive defaults (`inp.safetyMargin ?? 0.05`, etc.) so malformed state doesn't crash.
