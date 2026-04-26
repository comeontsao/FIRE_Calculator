# Contract — Audit Assembler (`calc/calcAudit.js`)

**Feature**: `014-calc-audit`
**Module**: `calc/calcAudit.js`
**Consumers**: Audit tab renderers (flow diagram + 7 detail-section renderers + chart-instance builders) in both HTML files; Copy Debug button serializer.

---

## Public API surface

The module attaches to `window.assembleAuditSnapshot` (in browser) AND exports as CommonJS for Node tests, mirroring the UMD pattern from `calc/tabRouter.js`:

```text
function assembleAuditSnapshot(options) -> AuditSnapshot
```

That is the ONLY public function. No factories, no classes, no side effects on module load.

### `assembleAuditSnapshot(options)`

Pure function. Same `options` MUST yield byte-identical `AuditSnapshot` (excluding the `generatedAt` timestamp).

**Required `options` keys**:

| Key | Type | Source in dashboard |
|-----|------|---------------------|
| `inputs` | object | `getInputs()` resolved input |
| `fireAge` | number | `_calculatedFireAge` (or override if user dragged FIRE marker) |
| `fireMode` | `'safe' \| 'exact' \| 'dieWithZero'` | global `fireMode` |
| `annualSpend` | number | post-mortgage-adjusted spend |
| `rawAnnualSpend` | number | pre-adjustment spend |
| `effectiveSpendByYear` | `[{age, spend}]` | computed by the dashboard's spend-curve builder |
| `lastStrategyResults` | object \| null | `_lastStrategyResults` |
| `fireAgeCandidates` | `[{age, signedEndBalance, feasibleUnderActiveMode}]` | computed during the FIRE-age search loop |
| `projectFullLifecycle` | function | calc-engine reference |
| `signedLifecycleEndBalance` | function | calc-engine reference |
| `isFireAgeFeasible` | function | calc-engine reference |
| `getActiveChartStrategyOptions` | function | calc-engine reference |
| `t` | function `(key, ...args) => string` | i18n helper for plain-English verdicts |
| `doc` | `Document \| null` | `document` in browser; `null` in Node tests (assembler degrades gracefully) |

**Returns**: `AuditSnapshot` per `data-model.md`.

**Pure-module rules** (Constitution Principle II):

- MUST NOT read from `window`, `document`, `localStorage`, or any global.
- MUST NOT mutate any input.
- MUST NOT throw on missing optional state — degrade gracefully (e.g., when `lastStrategyResults` is `null`, emit `strategyRanking: { winnerId: null, rows: [] }` and a single CrossValidationWarning of kind `strategy-ranking-pending`).

**Error handling**:

- Required option missing → throw `TypeError: assembleAuditSnapshot: required option '<key>' missing`.
- A calc function reference returns `undefined`/throws when called → catch, leave the corresponding section minimal, and emit a CrossValidationWarning of kind `assembler-degraded` describing which calc function failed.

**Determinism**:

- Same inputs MUST produce byte-identical output (modulo `generatedAt`).
- Numeric values rounded to integer dollars.
- Arrays in stable order: `gates` always `[safe, exact, dieWithZero]`; `strategyRanking.rows` ordered by ranker output (NOT re-sorted by the assembler).

---

## Cross-validation invariants (R-005)

The assembler computes 4 invariants. Each generates 0 or 1 `CrossValidationWarning`:

### Invariant A — End balance match

```text
A = signedLifecycleEndBalance(inputs, annualSpend, fireAge).endBalance
B = projectFullLifecycle(inputs, annualSpend, fireAge, true, getActiveChartStrategyOptions()).last.total
delta = abs(A - B)
deltaPct = abs(delta / max(abs(A), abs(B), 1)) * 100
warn-if = delta > 1000 AND deltaPct > 1
expected-if = activeStrategyId is set AND activeStrategyId !== 'bracket-fill-smoothed' (annotate "signed sim is bracket-fill-only by design")
```

### Invariant B — Active-strategy feasibility match

```text
A = lastStrategyResults.rows.find(r => r.strategyId === lastStrategyResults.winnerId).feasibleUnderCurrentMode
B = result of _chartFeasibility-equivalent check on the active strategy at fireAge under fireMode
warn-if = A !== B
expected-if = false (these MUST agree by construction)
```

### Invariant C — Displayed FIRE age = ranker FIRE age

```text
A = fireAge (the assembler's `fireAge` argument — same as displayed)
B = lastStrategyResults?.fireAge (Architecture B fixed FIRE age)
warn-if = (B != null) AND (A !== B)
expected-if = false
```

### Invariant D — Floor violation count match

```text
A = isFireAgeFeasible's floor-violation count for active strategy at fireAge under safe mode (also dieWithZero — both check floor)
B = same count derived from projectFullLifecycle's per-year totals
warn-if = A !== B
expected-if = false
```

---

## Test surface

`tests/unit/calcAudit.test.js` MUST cover:

- **T1**: Snapshot shape — required top-level keys present, correct types.
- **T2**: Determinism — same options yield byte-identical output (modulo `generatedAt`).
- **T3**: Schema version — `schemaVersion: '1.0'` always.
- **T4**: Empty / pending state — when `lastStrategyResults === null`, `strategyRanking.rows.length === 0` AND `crossValidationWarnings` includes `strategy-ranking-pending`.
- **T5**: Gates fixed order — `gates[0].mode === 'safe'`, `gates[1].mode === 'exact'`, `gates[2].mode === 'dieWithZero'`, regardless of which mode is active.
- **T6**: Active-mode flag — exactly one gate has `isActiveMode: true`.
- **T7**: Cross-validation A planted — given a stub `signedLifecycleEndBalance` returning $100K and a stub `projectFullLifecycle` returning a chart with last `total: $200K`, expect a warning of kind `endBalance-mismatch` with delta $100K.
- **T8**: Cross-validation A expected divergence — same setup as T7 but with active strategy `'tax-optimized-search'` → warning still emitted but `expected: true`.
- **T9**: Cross-validation B planted — given internal-sim `feasibleUnderCurrentMode: false` and chart-sim `feasible: true` for active strategy → warning of kind `feasibility-mismatch`, `expected: false`.
- **T10**: Cross-validation C planted — when `fireAge: 48` but `lastStrategyResults.fireAge: 50` → warning of kind `fireAge-mismatch`.
- **T11**: All clear — when all 4 invariants pass, `crossValidationWarnings: []`.
- **T12**: Bilingual verdicts — given a stub `t()` that returns the key + args, gate verdicts include the expected key (`audit.gate.safe.verdict.feasible` or `.infeasible`) and pass the floor / first-violation-age as args.
- **T13**: Calc-function failure — when `projectFullLifecycle` throws, the assembler returns a snapshot with a `assembler-degraded` warning rather than itself throwing.
- **T14**: FIRE-age scatter shape — `fireAgeResolution.candidates` has at least one entry; the chosen age has `feasibleUnderActiveMode: true` and is the first such entry in the array.

---

## Performance budget

The assembler MUST complete in under 50ms for typical inputs (≈58-year plan range). The expensive operations are:
- One `signedLifecycleEndBalance` call.
- One `projectFullLifecycle` call (already done by the dashboard's chart render — assembler may receive its result instead of recomputing).
- Reading `lastStrategyResults.rows` and walking 7 strategies × ~58 years = ~400 row scans.

If `projectFullLifecycle` is ALREADY computed by the dashboard for the lifecycle chart on the same recalc tick, the assembler SHOULD accept that pre-computed array via an additional optional `prebuiltChart` option to avoid double computation. (Implementation hint, not contract.)
