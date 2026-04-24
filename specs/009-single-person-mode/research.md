# Research — Single-Person Mode (Feature 009)

**Purpose:** Resolve every design decision flagged in `plan.md` Technical Context before entering Phase 1. All entries use the `Decision / Rationale / Alternatives considered` template required by the `/speckit-plan` contract.

---

## §1. Pre-65 healthcare share for a single adult

**Decision:** Introduce constant `SINGLE_ADULT_PRE65_SHARE = 0.35`. When `adultCount === 1`, `getHealthcareFamilySizeFactor(age, inp)` returns `0.35 + 0.165 * k` where `k = min(2, kidsOnPlan)`.

**Rationale:**
- The current couple-only share is `0.67` (i.e., the family-of-4 reference at `factor = 1.00` breaks down as "two adults contribute 0.67, two kids contribute 0.33 via `0.165 * 2`"). A solo adult paying half the couple share ≈ `0.335`; rounding to `0.35` is both a clean single constant and slightly conservative (protects the FIRE number against under-estimation).
- Consistent with `calc/healthcare.js`'s `HOUSEHOLD_DISCOUNT_FACTOR = 0.8` mental model: a second adult adds 80 % incremental cost on top of the first, meaning a single adult sits at `1 / (1 + 0.8) ≈ 0.56` of the couple's absolute premium. In the Generic inline formula (`0.67 + 0.165 * k`), `0.35` maps to `0.35 / 0.67 ≈ 52 %` of the couple share — within 4 points of the `calc/healthcare.js` implied 56 %, well inside the "round to $100, not a precision instrument" tolerance documented in `calc/healthcare.js`.
- Per-kid share (`0.165`) stays unchanged, so a single parent at Adults = 1, kids = 1 pays `0.35 + 0.165 = 0.515` — roughly the single-adult + one-kid share of the family-of-4 reference. This is materially lower than the Adults = 2, kids = 1 case (`0.67 + 0.165 = 0.835`) and preserves FR-014.

**Alternatives considered:**
- **`0.50` (exact halving of the couple share).** Rejected: under-estimates single-adult expense; real-world ACA solo premiums are not a clean half of family premiums because of the fixed-overhead component of insurance loading.
- **Commissioned actuarial table.** Rejected: out of scope per the spec Assumptions block; the dashboard is not a precision instrument and offers manual override via `#hcOverridePre65`.
- **Use `calc/healthcare.js`'s `householdSize = 1` path directly.** Noted and kept as future migration target. The inline Generic formula is what actually drives the live dashboard today; the pure module is invoked separately by unit tests. Aligning the two is a future feature, not this one.

---

## §2. Post-65 single-Medicare scaling

**Decision:** When `adultCount === 1`, the post-65 cost returned by `getHealthcareMonthly()` is halved relative to the per-country `post65` baseline. Implementation: apply `* 0.5` after the existing override check.

**Rationale:**
- Every per-country entry in `HEALTHCARE_BY_COUNTRY` is labeled explicitly as "couple" (e.g., "Medicare B+Medigap+D ~$700/mo couple post-65"). Halving for a single enrollee is the most literal possible interpretation of the existing dataset.
- Medicare premiums (Part B + typical Medigap + Part D) are per-enrollee, so halving the couple rate is a tight approximation. IRMAA surcharges kick in at different income thresholds (already handled separately via `irmaaThreshold`, which gets its own single-filer swap via feature 007).
- Consistent with the assumption stated in the spec (see §Assumptions — "Post-65 Medicare halving for single enrollees (÷ 2 of the couple reference) is an acceptable approximation").

**Alternatives considered:**
- **Leave post-65 at full couple rate when adults = 1.** Rejected: systematically overstates Medicare cost by ~$350/mo per couple baseline, which is tens of thousands of overstated FIRE dollars over a 30-year retirement.
- **Introduce per-country `post65Single` columns.** Rejected as over-engineering; the user can override via `hcOverridePost65` if they have better country-specific data. A future feature can tighten this.

---

## §3. Filing-status signal source (`detectMFJ`)

**Decision:** Extend `detectMFJ(inp)` so that:
1. If `inp.adultCount` is a finite integer, return `inp.adultCount === 2`.
2. Else fall back to the pre-feature-009 rule: `inp.agePerson2 != null && inp.agePerson2 > 0 && !isNaN(inp.agePerson2)`.

**Rationale:**
- Feature 007 baked `detectMFJ` around the presence of `agePerson2`. That signal is now wrong for the single-person case (the Person 2 age field will still be populated by the last-loaded date even when adults = 1, because Step §4 preserves Person 2 values). Relying on age presence would silently keep MFJ defaults active while the UI claims Single.
- Making the adult count the primary signal gives us a single well-defined source (Principle III). The fallback branch is retained so that (a) any test fixture that predates this feature still returns the right value, and (b) snapshot restoration into a pre-Adults state does not regress.
- Propagates automatically: every existing call site of `detectMFJ` — `applyFilingStatusDefaults` at bootstrap, `getTaxBrackets(detectMFJ(inp))` in the lifecycle/withdrawal/Roth-Ladder paths — picks up the new semantics with zero call-site changes.

**Alternatives considered:**
- **Add a new function `detectFilingStatus(inp)` and leave `detectMFJ` for back-compat.** Rejected: two functions answering the same question is an invitation for drift (Principle III).
- **Boolean input flag `isSinglePerson`.** Rejected: the spec commits to an integer counter (Q1 clarification), not a mode enum. Storing the integer once, deriving booleans where needed, is the minimal data model.

---

## §4. Person 2 data preservation on decrement

**Decision:** On decrement to Adults = 1, leave the Person 2 DOM field values untouched; set `display:none` on the wrapping `.input-group` elements. `saveState()` continues to persist the last-entered values, and `restoreState()` continues to write them back. Read-time guards in `calcNetWorth`, `calcAccessible`, `calcRealisticSSA`, and any taxable-pool computation multiply by `(inp.adultCount === 2 ? 1 : 0)` — never by clearing the stored value.

**Rationale:**
- FR-007, SC-005, and User Story 3 all require byte-level preservation across an unlimited number of 2 ↔ 1 round trips. Hiding via CSS achieves that trivially.
- The existing `PERSIST_IDS` list already covers `person2Stocks`, `ssSpouseOwn`, and the birthdate-to-age pipeline populates `agePerson2` from `bdPerson2` whether visible or not. No persistence changes required for the Person 2 inputs themselves.
- Read-time suppression (not store-time zeroing) is also how `data-user-edited='1'` tracks filing-status-driven defaults — stylistically consistent with feature 007.

**Alternatives considered:**
- **Zero Person 2 inputs on decrement.** Rejected: destroys data, fails FR-007/SC-005, and re-zeros the `agePerson2` value causing `detectMFJ` fallback branch to miscompute if `adultCount` is ever cleared.
- **Move Person 2 values to a shadow state blob on decrement.** Rejected: adds a second source of truth (violates Principle III) and complicates `saveState`/`restoreState` for zero user-visible benefit.

---

## §5. Counter UX — bounds visibility

**Decision:** Decrement button is visually `disabled` (standard HTML `disabled` attribute + `cursor:not-allowed`) when `adultCount === 1`; increment button is `disabled` when `adultCount === 2`. Click handlers short-circuit if disabled (belt-and-braces against assistive tech overriding the disabled state). Counter value is displayed as a non-editable numeric label between the two buttons (matches children-counter pattern).

**Rationale:**
- Disabled (not hidden) buttons make the bounds discoverable to users. Hiding the decrement button at Adults = 2 would create layout jitter as the counter flips between 1 and 2.
- Matches FR-003 exactly ("disabled or no-op"), satisfies SC-008.
- Accessible: the `disabled` attribute is announced by screen readers, and `aria-label` (localized per FR-005) completes the picture.

**Alternatives considered:**
- **Hide the out-of-range button.** Rejected: creates layout shift and hides the affordance.
- **Allow click but no-op silently.** Rejected: users may believe the control is broken.

---

## §6. CSV schema evolution

**Decision:** Append a single new column `Adults` as the 20th column of `FIRE-snapshots-generic.csv`. Never insert in the middle. On import, rows with only 19 columns are treated as `adults = 2` (backward-compatible default per FR-024).

**Rationale:**
- DB Engineer constitution ("CSV is append-only, new columns appended not inserted, never break old rows") makes this the only legal move.
- 19-column legacy rows: the `csvToSnapshots` parser currently reads `cols[18]` for `locked`; extending to read `parseInt(cols[19]) || 2` for `adults` degrades gracefully to `2` when the field is missing (covers SC-006 explicitly).
- Export always emits the new column, even for old snapshots loaded into memory — we annotate each in-memory snapshot with `adults: 2` at import time if absent, then round-trip on export. This means the first Export after upgrade upgrades the file on disk to the new schema, which is the point where backward compatibility stops being free.

**Alternatives considered:**
- **Insert `Adults` next to `Person 2 Stocks` for readability.** Rejected: breaks every existing row that already has 19 columns; CSV schema discipline forbids insertion.
- **Record filing status as a string ("Single" / "MFJ").** Rejected: the spec models the feature as an integer adult count, not an enum. Derive the enum display from the integer.
- **Skip CSV persistence entirely.** Rejected: FR-023–FR-025 require the CSV row to record the adult count so users can compare snapshots across household configurations.

---

## §7. Localization strategy — new keys

**Decision:** Introduce the following i18n keys (EN + zh-TW), added to `TRANSLATIONS.en` and `TRANSLATIONS.zh` in `FIRE-Dashboard-Generic.html` and mirrored into `FIRE-Dashboard Translation Catalog.md`.

| Key | English | Traditional Chinese |
|-----|---------|---------------------|
| `profile.householdComposition` | Household composition | 家庭組成 |
| `profile.adults` | Adults | 成人 |
| `profile.adultsTip` | Set to 1 to switch tax brackets, healthcare scaling, and Social Security to single-person defaults. Person 2 inputs are hidden but preserved. | 設為 1 時稅率級距、健保計算與社會安全福利將切換為單人預設。成員 2 的輸入會隱藏但會保留。 |
| `profile.adultsDec` | Decrease adults | 減少成人 |
| `profile.adultsInc` | Increase adults | 增加成人 |
| `tax.filingStatus.label` | Filing status | 報稅身分 |
| `tax.filingStatus.single` | Single | 單身 |
| `tax.filingStatus.mfj` | Married Filing Jointly | 夫妻合併申報 |
| `snap.adults` | Adults | 成人 |
| `snap.adultsTip` | Number of adults modeled at the time the snapshot was taken. | 快照當時計入計算的成人數。 |

**Rationale:**
- Every string is in the NON-NEGOTIABLE bilingual corridor (Principle VII). No exemptions — "Adults" is a common word, not on the Exemption list (proper names, FIRE-specific terms, industry acronyms).
- Dotted namespace follows existing catalog convention (`profile.*`, `tax.*`, `snap.*`).
- One-sentence tooltip matches FR-005 + User Story 3 acceptance scenario 2.
- "MFJ" stays English-uppercased per the industry-acronyms Exemption but the surrounding prose translates — that is why the `tax.filingStatus.mfj` value is the full Chinese phrase rather than the bare acronym.

**Alternatives considered:**
- **Reuse the existing snapshot-column keys (`snap.person2Stocks` etc.).** Rejected: conflates two different schema semantics. A new column gets a new key.
- **Translate "MFJ" as a literal acronym (保留 "MFJ").** Rejected by Principle VII: the acronym may stay in running text but a standalone label should read naturally in the target language. The compromise is to render it as "夫妻合併申報" for display while leaving the acronym available inside tooltips or debug contexts.

---

## §8. Integration with feature-007 user-edit tracking

**Decision:** The Adults counter triggers `applyFilingStatusDefaults(detectMFJ(inp))` at the end of its increment/decrement click handler, AFTER updating the counter value. The existing `data-user-edited='1'` tracking on `irmaaThreshold`, `twStdDed`, and `twTop12` is respected unchanged — users who have manually overridden those three fields keep their values across adult-count changes (FR-011).

**Rationale:**
- `applyFilingStatusDefaults` is already the canonical spot where feature 007 makes user-override decisions; hooking the counter into that function rather than reimplementing the defaults-swap avoids a parallel control path.
- The counter-handler ordering (update value → re-read inputs → swap defaults → `recalcAll`) mirrors the existing onchange ordering for every other control. Zero new race conditions.

**Alternatives considered:**
- **Swap defaults synchronously inside the counter click handler without going through `applyFilingStatusDefaults`.** Rejected: would duplicate the defaults table and skip the user-edit gate.

---

## §9. Strategy-compare and feasibility gates

**Decision:** No dedicated per-strategy branch. When `adultCount === 1`, all three strategies (Safe / Exact / Die-With-Zero) receive the already-adjusted tax brackets and healthcare costs as inputs; their feasibility gates are unchanged (FR-021).

**Rationale:**
- Strategy ranking is a pure function of post-adjustment withdrawal capacity — it does not care *why* the numbers shrank; it just ranks on them.
- Keeping strategy code oblivious to `adultCount` is an application of Principle II (pure calc modules do not branch on orthogonal inputs).

**Alternatives considered:**
- **Explicit `adultCount` branch inside strategy evaluator.** Rejected: no user-visible benefit, violates purity, doubles the test matrix.

---

## §10. Test corpus sizing

**Decision:** Add fixtures for the following cases to `tests/fixtures/single-person-mode.js` and wire them into `tests/unit/{filingStatus,socialSecurity,healthcare,adultCounter}.test.js`:

1. **Filing status keyed on `adultCount`.** Cases: `(adultCount=2)` → MFJ; `(adultCount=1)` → Single; `(adultCount=undefined, agePerson2=36)` → MFJ (fallback). `(adultCount=undefined, agePerson2=0)` → Single.
2. **Single-adult SS combination.** Case: primary PIA $2,500 + `ssSpouseOwn` $1,200, `adultCount=1` → combined PIA $2,500 (no spousal add-on, no `ssSpouseOwn` credit). Matches FR-012 + FR-013.
3. **Single-adult healthcare scaling.** Cases: `(adults=1, kids=0, age=40)` → factor ≈ 0.35; `(adults=1, kids=2, age=40)` → factor ≈ 0.68; `(adults=2, kids=0, age=40)` → factor = 0.67; `(adults=2, kids=2, age=40)` → factor = 1.00. Post-65: `(adults=1, age=67)` → halved couple rate; `(adults=2, age=67)` → full couple rate.
4. **Counter bounds.** Cases: start at 1, click decrement → still 1 (value unchanged, button remains disabled). Start at 2, click increment → still 2 (value unchanged). Round-trip 2 → 1 → 2 → 1 → 2 → data preserved on each transition.

**Rationale:**
- SC-009 targets ≥ 90 tests passing (currently 79). Four new test files contributing ~11 cases gets the count to ≥ 90 while producing the fixture evidence Principle IV requires.
- Each case pins a single constant or branch — small, atomic, failure-localized.

**Alternatives considered:**
- **One combined fixture file.** Rejected: per-module test files match the existing `tests/unit/` convention.
- **Playwright-only E2E coverage.** Rejected: unit-level gating is stricter, faster, and does not require a browser.

---

## Summary — all `NEEDS CLARIFICATION` resolved

| Technical Context item | Resolution |
|---|---|
| Single-adult pre-65 healthcare share | `SINGLE_ADULT_PRE65_SHARE = 0.35` (§1) |
| Post-65 single-Medicare scaling | Halve per-country `post65` baseline (§2) |
| Filing-status signal | `detectMFJ(inp)` keys on `inp.adultCount === 2` with fallback to `agePerson2 > 0` (§3) |
| Person 2 data preservation mechanism | CSS-hide; read-time zero-out gated on `adultCount === 1` (§4) |
| Counter UX bounds semantics | `disabled` button at bounds; click short-circuits on disabled (§5) |
| CSV schema delta | Append `Adults` as 20th column; legacy 19-column rows → `adults = 2` (§6) |
| Localization surface | 10 new keys, EN + zh-TW, namespaced (§7) |
| Feature-007 user-edit integration | Call `applyFilingStatusDefaults(detectMFJ(inp))` from counter handler (§8) |
| Strategy-compare branch | None — strategies are pure in post-adjustment inputs (§9) |
| Test corpus | 4 new fixture classes → ≥ 90 total tests (§10) |

No items remain in the `NEEDS CLARIFICATION` state. Proceeding to Phase 1.
