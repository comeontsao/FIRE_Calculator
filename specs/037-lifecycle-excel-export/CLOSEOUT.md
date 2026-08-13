# CLOSEOUT: Feature 037 — Year-by-Year Lifecycle Spreadsheet Export

**Branch**: `037-lifecycle-excel-export`
**Implemented**: 2026-08-13
**Status**: Implementation complete and verified. **Not merged** — awaiting T040 (human Excel open).

---

## What shipped

One button in **History → Snapshots** downloads a real `.xlsx` workbook: **one row per calendar
year** from the current year to the plan's end, **70 columns**, every figure in both money
(Book Value) and purchasing-power frames, matching the Lifecycle chart exactly.

- **`calc/lifecycleExport.js`** (new) — pure UMD module, all the logic, Node-testable, no DOM and no
  ExcelJS reference. UMD const `_lifecycleExportApi`.
- **Both dashboards** — button, lazy ExcelJS loader, workbook writer, download, Settings sheet.
  Lockstep verified: 11/11 feature markers match.
- **ExcelJS 4.4.0** from cdnjs — the project's first runtime dependency beyond Chart.js
  (Principle V exception, user-approved 2026-08-13). **Lazy-loaded on first click**, so cold load
  is unchanged and non-exporters pay nothing.
- **12 i18n keys** EN + zh-TW in both files + catalog; **all 70 column headers localised**.

**Zero calc-behaviour changes.** The one additive field (`signedTotal`) is read only by the export.

---

## Verification

| Gate | Result |
|---|---|
| Unit (`npm run test:unit`) | **818/818** (760 baseline + 58 new) |
| Full Playwright | **220 passed / 1 failed** — the failure passes 10/10 in isolation (see [BASELINE.md](./BASELINE.md)) |
| 037 E2E spec, isolated | **20/20** across both dashboards |
| `tools/verify-037-export.mjs` (RR, live numbers) | **42/42** |
| Manager's independent verifier | **17/17** RR · **17/17** Generic |
| console-probe | `errorCount 0` on both |
| `tools/smoke-032.mjs` | **15/15** |

**The headline number**: every year's money total in the workbook equals the chart — **53/53** on RR,
**60/60** on Generic — checked against both the cached projection *and* the rendered Chart.js
values. RR's 2026 row reads **$532,021**, matching the KPI card.

Two independent verifiers were built deliberately (QA's and the Manager's), each with its own ZIP
reader on Node's `zlib` rather than round-tripping through ExcelJS — so a bug in the writer cannot
hide behind its own reader.

---

## Four corrections to the planning documents, found during implementation

Recorded because in every case the **written spec was wrong and the code was right**.

1. **research.md R4 was wrong.** It concluded retirement-year federal tax "is computed inside
   `taxOptimizedWithdrawal` and never surfaced onto any row" and scoped a calc-layer change.
   `mix.taxOwed` already existed on the strategy rows the export was already joining. **The
   feature's only planned calc-behaviour change was cancelled.**
2. **data-model INV-3 was mathematically wrong.** It read `money ≥ purchasingPower`, which inverts
   for negative values — inflating a debt makes it more negative (−$50,000 of purchasing power is
   −$57,964 of money at 3% over 5 years, verified against the live converter). Corrected to
   *same sign, and money's magnitude never shrinks*. `signedTotal` was the first column that could
   be negative, which is what exposed it.
3. **data-model §2 contradicted §3** on whether the contribution/withdrawal groups were
   phase-exclusive. §2 made authoritative; groups are categorical, keyed off `phase`.
4. **INV-8 was unsatisfiable as written.** `projectFullLifecycle` writes `total: Math.max(0, total)`
   from already-clamped pools, so no pure module could recover the sign. Added `signedTotal` as an
   additive sibling field.

---

## The recurring failure this feature kept producing

**Four separate times**, someone made a true observation about *some* array in the pipeline and
generalised it into a claim about *the* array:

| # | Who | Claim | Reality |
|---|---|---|---|
| 1 | Manager (R4) | "tax exists nowhere" | It was on `perYearRows` via `mix.taxOwed` |
| 2 | Backend | "`grossSpend`/`shortfall` live here and nowhere else" | `grossSpend` has four producers |
| 3 | Manager | "`grossSpend` lives on `ctx`" (→ ordered a column deleted) | Also on `result.strategy`; Backend **refused the destructive edit** and was right |
| 4 | Manager | "the two dashboards are out of lockstep" | Inferred from an error message, not checked; they were fine |

There are **three** candidate per-year arrays and they are not interchangeable:

- **`perYearRows`** — `Object.assign(rowBase, mix)`. **What the export handler passes.** Has the
  `mix` fields; lacked `grossSpend` (037 adds it with one additive line).
- **`result.strategy`** — has `grossSpend`, `ssIncome`, `taxOwed`, pool-after fields.
- **`options._trajectory`** — **never pass this**: names the field `synth`, gets no companions.

Passing the wrong one yields a workbook **quietly wrong in ~18 columns**, with no exception thrown
and `frameFallback` still false — because blank is a legitimate value in the model. That silent
class is now caught by one assertion (**INV-9**): at least one retirement year must have a
non-blank `wTrad` whose money value differs from its purchasing-power sibling.

**The lesson is two-part**: enumerate *all* producers, then check *which array the caller actually
hands over*. Both halves failed independently here. `calc/lifecycleExport.js`'s module doc block now
enumerates all three arrays with line numbers and the silent-failure mode.

---

## Deferred / follow-ups

- **B-037-1 — E2E suite sharding.** Four spec files exceed 5 minutes and the suite saturates its
  workers, producing load-dependent flakes. Which tests lose the race varies per run. Pre-existing,
  now better characterised in BASELINE.md.
- **B-037-2 — hand-rolled XLSX writer.** Rejected for v1 on repair-prompt risk, but genuinely
  attractive: zero dependency, Node-unit-testable, better Principle II/IV fit than a 926 KB blob.
- **B-037-3 — vendoring.** Only worth revisiting jointly with Chart.js; vendoring one while the
  other stays on CDN buys nothing.
- **T040 — human Excel open. NOT DONE.** Features 035 and 036 both merged with this gate unsigned.
  This is the third; do not make it a habit. Automated checks confirm the file is structurally a
  valid xlsx with correct frozen panes, but "real Excel opens it without a repair prompt" and "70
  columns are actually navigable" need human eyes.
