# Data Model: Roth IRA Accounts (Feature 032)

**Feature**: 032-roth-ira-accounts
**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-28

## Scope

This document defines the state schema, persistence keys, canonical-input shape, pool registry, and CSV columns introduced by feature 032. Every field listed here has a corresponding consumer reference; every consumer reference is also listed in `audit.md`.

## 1. DOM input ids (RR dashboard only)

| DOM id | Tab | Type | Default | i18n key | Persistence |
|---|---|---|---|---|---|
| `rogerRothIra` | Plan → Assets | `number` | `0` | `assets.rogerRothIra` | localStorage `fire-dashboard.rogerRothIra` |
| `rebeccaRothIra` | Plan → Assets | `number` | `59021` | `assets.rebeccaRothIra` | localStorage `fire-dashboard.rebeccaRothIra` |
| `rogerRothIraContrib` | Plan → Investment | `number` | `7000` | `invest.rogerRothIraContrib` | localStorage `fire-dashboard.rogerRothIraContrib` |
| `rebeccaRothIraContrib` | Plan → Investment | `number` | `7000` | `invest.rebeccaRothIraContrib` | localStorage `fire-dashboard.rebeccaRothIraContrib` |

**Locked-block grouping** (Assets tab): The two balance inputs are visually grouped in a new card titled `🔒 Roth IRA` (i18n key `assets.rothIraGroup`), positioned in the Assets tab immediately to the right of (or below, on narrow viewports) the existing `🔒 Locked until 59.5 (401K)` card.

**Contribution-section grouping** (Investment tab): The two contribution inputs are wrapped in a new subsection titled `Roth IRA Contributions (annual)` (i18n key `invest.rothIraSection`), positioned directly below the existing 401K Roth Contribution slider.

## 2. localStorage schema

Four new keys (parallel to the existing 401K input persistence pattern):

| Key | Type (after JSON.parse) | Default if absent |
|---|---|---|
| `fire-dashboard.rogerRothIra` | `number` (or numeric string) | `0` |
| `fire-dashboard.rebeccaRothIra` | `number` | `59021` |
| `fire-dashboard.rogerRothIraContrib` | `number` | `7000` |
| `fire-dashboard.rebeccaRothIraContrib` | `number` | `7000` |

**Save trigger**: each input's `oninput` handler writes its current value to localStorage immediately (matches the existing pattern in RR for `rogerStocks`, `rebeccaStocks`, `roger401kRoth`, etc.).

**Load trigger**: on page init, after DOM is ready, the dashboard reads localStorage and populates each input's `.value` BEFORE the first calc run. Missing keys are populated from the defaults above.

**No schema-version bump**: per CLAUDE.md DB Engineer constitution (append-only persistence keys). Missing keys are tolerated; never throw on a missing or malformed value.

## 3. Canonical-input shape (`calc/getCanonicalInputs.js`)

### Renamed fields (per research.md Q1)

| Old name | New name | Semantics |
|---|---|---|
| `rothIraReal` (was Roth 401K balance) | `roth401kReal` | Roth 401K balance, real-$ |
| (new field) | `rothIraReal` | Roth IRA balance, real-$ — the new pool |

### Added fields

| Field | Type | Semantics | Source |
|---|---|---|---|
| `rothIraReal` | `number` (real-$) | Roth IRA balance | RR: `inp.rogerRothIra + inp.rebeccaRothIra` ; Generic: sum of `person1RothIra + person2RothIra` if/when added (currently both default to 0 since Generic has no inputs) |
| `rothIraContribReal` | `number` (real-$/yr) | Annual Roth IRA contribution | RR: `inp.rogerRothIraContrib + inp.rebeccaRothIraContrib` ; Generic: `0` |

The two-person split is collapsed at the canonical layer because the existing calc engine doesn't distinguish per-spouse pools (it sums all stocks across spouses into one `taxableStocksReal`, all 401K Roth into one `rothIraReal` historical-misnomer-field, etc.). The dashboard surfaces the per-spouse breakdown only for UI display purposes and snapshot CSV columns.

## 4. Withdrawal pool registry (`calc/withdrawal.js`)

### `POOL_KEYS` (frozen, exported)

Old:
```javascript
const POOL_KEYS = Object.freeze(['cash', 'taxable', 'roth', 'trad']);
```

New:
```javascript
const POOL_KEYS = Object.freeze(['cash', 'taxable', 'roth', 'rothIra', 'trad']);
```

`rothIra` is inserted between `roth` and `trad` to preserve the existing semantic order (most-accessible → least-accessible by tax+age treatment).

### `STRATEGY_ORDERS` extension

Each strategy's pool draw order gains a `rothIra` entry immediately after `roth`:

| Strategy id | Old order | New order |
|---|---|---|
| `roth-ladder` | `['roth', 'taxable', 'cash', 'trad']` | `['roth', 'rothIra', 'taxable', 'cash', 'trad']` |
| `trad-first` | `['trad', 'taxable', 'cash', 'roth']` | `['trad', 'taxable', 'cash', 'roth', 'rothIra']` |
| `tax-optimized` | `['cash', 'taxable', 'roth', 'trad']` | `['cash', 'taxable', 'roth', 'rothIra', 'trad']` |
| `trad-last` | `['cash', 'taxable', 'roth', 'trad']` | `['cash', 'taxable', 'roth', 'rothIra', 'trad']` |
| (any other strategy in registry) | (… roth …) | (… roth, rothIra …) |

**Rule**: `rothIra` MUST appear immediately after `roth` in every strategy's order. A future feature may diverge from this if a strategy explicitly wants Roth IRA drawn first (e.g., to exploit no-RMD).

### `accessible` Set (pre-unlock)

Old (line 118 of `calc/withdrawal.js`):
```javascript
return new Set(['cash', 'taxable', 'roth']);
```

New:
```javascript
return new Set(['cash', 'taxable', 'roth', 'rothIra']);
```

Both Roth pools are inaccessible pre-59.5 (Principle FR-019 — fully locked, matching Roth 401K). The pre-unlock accessible set therefore EXCLUDES both `roth` and `rothIra`. Wait — re-read the source: the pre-unlock set above appears at line 118 but in context represents the post-unlock set (the trad lock removal). Confirm at implementation. The pre-unlock set in `calc/withdrawal.js:118` actually was `['cash', 'taxable', 'roth']` and `trad` is excluded; verify the semantics in research before final wiring.

After research-confirmed semantics, the pre-59.5 phase accessible set will be:

```javascript
// Pre-unlock (age < 59.5): only fully-accessible pools
new Set(['cash', 'taxable']);
// Both 'roth' and 'rothIra' join the accessible set at 59.5
```

If the existing implementation already EXCLUDES `roth` pre-unlock, then `rothIra` follows the same exclusion pattern. The implementation task will verify this precisely before editing.

### `drawFromPools` accumulator

Old:
```javascript
const drawn = { cash: 0, taxable: 0, roth: 0, trad: 0 };
```

New:
```javascript
const drawn = { cash: 0, taxable: 0, roth: 0, rothIra: 0, trad: 0 };
```

### `remaining` pool dict

Old:
```javascript
const remaining = {
  cash:    pools.cashReal,
  taxable: pools.taxableStocksReal,
  roth:    pools.rothIraReal,        // ← old field name (Roth 401K)
  trad:    pools.trad401kReal,
};
```

New:
```javascript
const remaining = {
  cash:    pools.cashReal,
  taxable: pools.taxableStocksReal,
  roth:    pools.roth401kReal,       // ← renamed from rothIraReal
  rothIra: pools.rothIraReal,        // ← NEW pool field
  trad:    pools.trad401kReal,
};
```

### RMD branch (line 204) — NO CHANGE

The RMD branch is hardcoded to `trad`. Both Roth pools are naturally exempt. No code change needed; the spec FR-021d enforces this as a non-regression rule.

## 5. Accumulation engine state (`calc/accumulateToFire.js`)

New per-year locals (parallel to existing `pTrad` / `pRoth`):

```javascript
let pRothIra = ...; // seeded from inp.rogerRothIra + inp.rebeccaRothIra at year 0
// per year:
pRothIra = pRothIra * (1 + realReturn401k) + rothIraContrib;
// where rothIraContrib = (real-$/yr) summed from the two new contribution inputs
```

The accumulation engine uses the SAME real return assumption as the 401K pools (`return401k`). No new return rate is introduced; this is documented in `spec.md` Assumptions and `research.md` is silent on it (no decision needed).

## 6. Lifecycle projection rows (`projectFullLifecycle` output)

Each per-year `row` object gains two new fields:

| Field | Type | Semantics | Consumers |
|---|---|---|---|
| `pRothIra` | `number` (real-$) | Roth IRA balance at year-end | Lifecycle chart, copy-debug snapshot, audit composition, withdrawal tooltip |
| `pRothIraBookValue` | `number` (nominal-$) | Roth IRA balance converted to broker-statement dollars | Lifecycle chart's stacked-area display, tooltip pool line |

Conversion: `pRothIraBookValue = toBV(pRothIra, age)` matches the existing `pRothBookValue = toBV(pRoth, age)` pattern.

Withdrawal accumulator added per row:

| Field | Type | Semantics |
|---|---|---|
| `wRothIra` | `number` (real-$) | Roth IRA draw amount in this year |
| `wRothIraBookValue` | `number` (nominal-$) | Same converted to broker-statement dollars |

## 7. Audit composition (`calc/calcAudit.js`)

New audit-composition field (line 179 of `calc/calcAudit.js`):

| Field | Source | Semantics |
|---|---|---|
| `lockedRoth401k` (renamed from `locked401kRoth`) | `raw.pRoth` or `raw.p401kRoth` | Roth 401K balance — historical audit snapshot |
| `lockedRothIra` (NEW) | `raw.pRothIra` | Roth IRA balance — new audit snapshot |

(The existing field name `locked401kRoth` is awkward; a sub-decision in research.md Q1 implies renaming to `lockedRoth401k` for consistency with the new `roth401kReal` canonical name. If touching only one of these in a commit, prefer the canonical-input rename and leave audit-composition for a separate change if scope grows.)

## 8. CSV snapshot schema (`FIRE-snapshots.csv`)

**Schema bump (append-only)**:

```
OLD header: date,netWorth,accessible,roger401k,roger401kRoth,rogerStocks,rebeccaStocks,cashSavings,otherAssets,...
NEW header: date,netWorth,accessible,roger401k,roger401kRoth,rogerStocks,rebeccaStocks,cashSavings,otherAssets,...,rogerRothIra,rebeccaRothIra
                                                                                                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                                                                two new columns appended at end
```

**SNAPSHOT_COLS array** (line 17583 of `FIRE-Dashboard.html`):

Append `'rogerRothIra'` and `'rebeccaRothIra'` to the end. Never insert mid-array (DB Engineer constitution).

**Loader compatibility**:

The CSV parser MUST detect a short row (one with fewer columns than the current SNAPSHOT_COLS length) and:

1. Set missing trailing fields to `0`
2. Successfully parse the row without throwing
3. NOT skip or drop any row

This handles legacy snapshots written before this feature ships.

**History table render**:

Add two new columns to the snapshot history table on the History tab, with i18n header keys `snap.rogerRothIra` and `snap.rebeccaRothIra`.

## 9. Chart.js dataset & color palette

| Pool | CSS variable | Default hex | Chart dataset key |
|---|---|---|---|
| `roth` (Roth 401K, existing) | `--chart-roth` | `#846cff` (purple) | `pRoth` |
| `rothIra` (Roth IRA, NEW) | `--chart-rothIra` | `#a890ff` (lighter purple) | `pRothIra` |

New chart dataset (parallel to existing `pRoth`):

```javascript
const pRothIra = lifecycle.map(function (r) { return _bvOrReal(r, 'pRothIra'); });
// added to chart datasets after pRoth dataset
```

Chart legend gains "Roth IRA" entry (EN) / "Roth IRA (個人退休帳戶)" (zh-TW).

## 10. Audit harness persona stubs

Per FR-021j and the feature-020 lesson, the audit harness DOC_STUB / boundFactory MUST serve the four new input ids per-persona:

```javascript
// Inside boundFactory(persona) closure:
'rogerRothIra':    String(persona.inp.rogerRothIra ?? 0),
'rebeccaRothIra':  String(persona.inp.rebeccaRothIra ?? 0),
'rogerRothIraContrib':   String(persona.inp.rogerRothIraContrib ?? 0),
'rebeccaRothIraContrib': String(persona.inp.rebeccaRothIraContrib ?? 0),
```

NOT in the static `DOC_STUB` (feature-020 lesson: static stubs serve the wrong value for persona-driven fields).

## 11. Inline strategy simulator (lines 11471–11473 of both HTML files)

Per audit #29, both `FIRE-Dashboard.html` and `FIRE-Dashboard-Generic.html` carry an inline strategy simulator block that mirrors the calc-module behavior. The existing `if (p === 'roth' && canAccess401k && avail.pRoth > 0)` branch is duplicated for `rothIra`:

```javascript
if (p === 'roth' && canAccess401k && avail.pRoth > 0) {
  // existing Roth 401K draw
  const add = Math.min(remaining, avail.pRoth);
  wRoth += add;
  avail.pRoth -= add;
  remaining -= add;
}
if (p === 'rothIra' && canAccess401k && avail.pRothIra > 0) {
  // NEW Roth IRA draw — parallel to Roth 401K branch
  const add = Math.min(remaining, avail.pRothIra);
  wRothIra += add;
  avail.pRothIra -= add;
  remaining -= add;
}
```

This change ships to BOTH HTML files in lockstep (Principle I at the calc layer).

## 12. Entity Relationship Summary

```
RR Dashboard UI                    Calc Engine (shared with Generic)        Persistence
─────────────────────              ─────────────────────────────────         ──────────────
rogerRothIra      (input) ────┐                                          ┌─→ localStorage
rebeccaRothIra    (input) ─┐  │                                          │
                           │  │                                          │
                           ├──┴─→ inp.rogerRothIra + rebeccaRothIra ─┬─→ getCanonicalInputs ─┐
                           │                                          │                       │
                           │                                          │                       │
rogerRothIraContrib(input)─┤                                          │                       ▼
rebeccaRothIraContrib(input)┤                                         │              canonical: rothIraReal
                            └───→ inp.rogerRothIraContrib + ─────────┬                   rothIraContribReal
                                  rebeccaRothIraContrib              │                          │
                                                                     │                          │
                                                  ┌──────────────────┴──────────────────────────┘
                                                  │
                                                  ▼
                                            accumulateToFire.js: pRothIra grows yearly
                                                  │
                                                  ▼
                                        projectFullLifecycle: rows[].pRothIra
                                                  │
                                  ┌───────────────┴───────────────────┐
                                  │                                   │
                                  ▼                                   ▼
                          Lifecycle chart                       Withdrawal sim
                          (pRothIraBookValue series)            (wRothIra accumulator)
                                                                      │
                              ┌───────────────────────────────────────┘
                              │
                              ▼
                          Withdrawal tooltip line + copy-debug + audit composition
                              │
                              ▼
                          CSV snapshot (rogerRothIra + rebeccaRothIra columns)
```
