# Quickstart — Verifying Single-Person Mode

A human operator's walk-through that proves feature 009 works end-to-end in a real browser, without unit tests, in under five minutes. Use this after an implementation PR lands but before tagging the feature complete.

---

## 0. Pre-flight

1. On branch `009-single-person-mode` (or a merge candidate), open a local HTTP server at the repo root:

   ```bash
   python -m http.server 8080
   ```

2. In Chrome or Edge (File System Access API required for CSV flow), visit `http://localhost:8080/FIRE-Dashboard-Generic.html`.
3. Open DevTools. Keep the Console tab visible. Any `[shim-name] canonical threw:` error is a blocker.

---

## 1. Baseline state — Adults = 2 (unchanged behavior)

1. Page loads without errors.
2. Scroll to the Profile & Income card. Confirm the new **Household composition** block is visible with two counters: `Adults 2 ± ` and `Children N ±`.
3. Confirm the `−` button on the Adults counter is **enabled**; the `+` button is **disabled** (we're already at the max of 2).
4. The Person 2 Birthday, Person 2 Stocks/Brokerage, and Spouse's own SS monthly benefit inputs are all visible.
5. Note the current KPI values — Net Worth, FIRE Target, Years to FIRE.
6. If the tax-planning section shows a "Filing status" row, confirm it reads **Married Filing Jointly** / **夫妻合併申報**.

---

## 2. Decrement to 1 — watch the dashboard switch to Single-person mode

1. Click the Adults `−` button. The `2` flips to `1`.
2. Observe immediately:
   - Person 2 Birthday, Person 2 Stocks, and Spouse's own SS inputs **disappear** (not zeroed — gone from layout).
   - Filing status flips to **Single** / **單身** (if the tax-planning section renders the label).
   - IRMAA threshold, std-ded, and top-of-12% fields swap to the Single-filer 2026 defaults (`$106,000` / `$15,000` / `$47,150`), **unless you had previously overridden any of them** — those remain untouched.
   - The FIRE number re-computes; it should be visibly different (usually lower, because the tax drag is higher and healthcare is lower).
   - Now the Adults `−` button is **disabled** and `+` is **enabled**.
3. Scroll to the Social Security panel. Confirm the "Spouse spousal (50%)" line is now `$0` and the "Combined at FRA" number equals Person 1's own PIA × 12 (no spousal add-on anywhere).
4. Scroll to any country cost card. Confirm the pre-65 healthcare monthly cost is lower than it was with Adults = 2. For the US baseline (no override, 0 kids), it should be close to `0.35 × US_PRE65` ≈ `0.35 × $1,800` ≈ `$630/mo`. Post-65 should halve the couple rate: ≈ `$350/mo`.

---

## 3. Round-trip — data preservation

1. Before moving on, note the values you typed earlier in Person 2 Stocks (or enter `$25,000` now — sequence: re-increment Adults to 2, type `25000` into Person 2 Stocks, decrement back to 1).
2. At Adults = 1, the Person 2 Stocks field is hidden but the value should still be stored. To verify without unhiding, open the Console and run:
   ```js
   document.getElementById('person2Stocks').value
   ```
   It must return `"25000"`.
3. Click `+` to re-increment to 2. The Person 2 Stocks field reappears with `25000` visible in the input. Repeat the `1 → 2 → 1 → 2` cycle twice more; the value must be preserved byte-for-byte on every cycle (SC-005).

---

## 4. Counter bounds — disabled edges

1. At Adults = 1, click the `−` button. Nothing happens — the button is disabled. DevTools Console shows no error.
2. At Adults = 2, click the `+` button. Nothing happens — the button is disabled.
3. Both transitions `1 → 0` and `2 → 3` are unreachable (SC-008).

---

## 5. Persistence — reload test

1. Set Adults = 1.
2. Refresh the page (F5).
3. On reload, the counter still reads `1`; Person 2 inputs are hidden; the KPI values match the single-person computation.
4. Set Adults = 2 again and reload — restores at 2.
5. Clear localStorage for the page (`localStorage.removeItem('fire_dashboard_generic_state')` in the Console) and reload — the counter defaults to 2 (new-install default). This confirms the silent backward-compat path.

---

## 6. Snapshot & CSV round-trip

1. At Adults = 1, click **💾 Save Current Snapshot**.
2. The snapshot table gains a new row. Confirm the new **Adults** column renders `1` for this row.
3. Click **📤 Export CSV**. Open the downloaded file in a text editor.
4. The first line (header) must contain `,Adults` at the end — 20 columns total.
5. The row you just saved must have `,1` as its last field.
6. If you have a pre-feature-009 `FIRE-snapshots-generic.csv` lying around, click **📥 Import CSV** on it. The rows must load without error and appear in the history with `Adults` showing `2` (backward-compatible default). Saving a new snapshot then re-exporting must upgrade the on-disk file to the 20-column schema (every row now emits an `Adults` value).

---

## 7. Bilingual check

1. Toggle the language to 繁體中文 (existing language selector in the header).
2. Confirm:
   - The "Household composition" heading reads **家庭組成**.
   - The "Adults" label reads **成人**.
   - The counter button tooltips (hover or focus) read **減少成人** / **增加成人**.
   - The info-tip on Adults reads the full Chinese sentence from `profile.adultsTip`.
   - The filing-status label (if rendered) reads **單身** (Adults = 1) or **夫妻合併申報** (Adults = 2).
   - The snapshot column header reads **成人**.
3. No English strings leak into the new UI when zh-TW is active (SC-007).

---

## 8. Single-parent sanity check (FR-014)

1. With Adults = 1, add one Child via the Children counter's `+` button. Pick any birthdate.
2. Observe the US pre-65 healthcare monthly cost. It should rise from the `0.35 × baseline` level to roughly `(0.35 + 0.165) × baseline ≈ 0.515 × $1,800 ≈ $927/mo` — materially higher than zero-kid single-adult but still materially lower than the Adults = 2 + 1 kid equivalent (`0.835 × baseline ≈ $1,503/mo`).

---

## 9. No-regression walkaround

1. Set Adults back to 2. Remove all kids. Note every chart renders and the numbers match the pre-feature-009 baseline you captured in Step 1.
2. Drag the FIRE marker on the Full Portfolio Lifecycle chart — it still moves in real time; KPIs update (Principle III preserved).
3. Refresh once more to confirm clean state.
4. DevTools Console: zero red errors, zero `[<shim-name>] canonical threw:` warnings.

If every step above passes, feature 009 is green. If any step fails, do NOT claim the feature done — route the failing observation back through the appropriate Engineer (Frontend for UI, Backend for math, DB for CSV).
