# Quickstart: Family Financial Vault — Manual Browser Smoke Checklist

**Feature**: 025
**For**: User-gate Phase 14
**Run when**: Implementation complete, all `node --test tests/vault/*.test.js` green, ready for user merge approval.

Do this in a real browser (Chrome or Firefox) on the family laptop. Do NOT use a sandbox or VM — the goal is to validate the actual file Rebecca will use.

---

## Setup

1. Open `FIRE-Family-Vault-RR.html` directly from the file system (`file://` URL, double-click is fine).
2. Open DevTools (F12). Switch to **Network** tab. Click the "🚫" disable cache toggle. **Watch this tab throughout the smoke run.**
3. Confirm you see the empty-state CTA "Set up your vault".

---

## SC-001 — Inventory CRUD (US1)

- [ ] Click "Add Account". Add a Webull brokerage account with last-4 = 1234, balance = $50000. Save.
- [ ] Refresh page. Webull account persists.
- [ ] Edit the account, change balance to $51000. Save. Refresh. Persists.
- [ ] Delete the account. Type DELETE to confirm. Account gone after refresh.
- [ ] Add 5 more accounts spanning all 3 owners (Roger / Rebecca / Joint) and 3 categories (US bank, foreign-bank-taiwan, employer-401k-roth).
- [ ] Filter by Owner = Roger → only Roger's accounts visible.
- [ ] Filter by Country = Taiwan → only Taiwan accounts visible.

**Expected:** ✅ All CRUD operations work; filters work; counts update; localStorage persists across reload.

---

## SC-002 — Procedure Playbook (US2)

- [ ] Click the `employer-401k-roth` account → "Death procedure" panel renders.
- [ ] Verify panel shows: disclaimer banner; whoToContact paragraph mentioning UPPAbaby HR; expectedTimeline; paperwork checklist; tax strategy notes mentioning bracket-fill / 10-year stretch; common mistakes.
- [ ] Click "Print procedure" → preview shows clean single-page output.
- [ ] Toggle locale to 中文 → procedure re-renders fully in zh-TW.
- [ ] Toggle back to EN → returns to English without losing data.
- [ ] Click an `other`-category account → generic fallback procedure renders.

**Expected:** ✅ All 13 categories produce a procedure; bilingual works; print is clean.

---

## SC-003 — Inherited-Account Calculator (US3)

- [ ] Open a Traditional 401(k) account with $500,000 balance.
- [ ] Open the calculator. Set Rebecca's age = 50; expected income = $60,000; filing = Single.
- [ ] Click Recompute. Three columns render with year-by-year breakdowns.
- [ ] Verify: lump sum 10-yr total tax > bracket-fill 10-yr total tax by ≥ 25%.
- [ ] Verify: lump sum row shows 🚨 IRMAA cliff hit. Bracket-fill row shows ✅ no cliffs.
- [ ] Open a Roth 401(k) account. Federal tax columns = $0. Cliff warnings still surface if MAGI crosses thresholds.
- [ ] Toggle filing status Single ↔ MFJ ↔ QSS → numbers update.

**Expected:** ✅ Calculator works; bracket-fill clearly wins; cliff warnings appear correctly; Roth correctly shows $0 federal but still surfaces MAGI-based cliffs.

---

## SC-004 — Chatbox Refusal (US5)

(Only if you've enabled the chatbox by pasting an Anthropic API key.)

- [ ] Q: "What accounts do I have at E. Sun Bank?" → grounded list with account ID citations.
- [ ] Q: "Should I sell TSLA?" → polite refusal, recommend financial advisor.
- [ ] Q: "What's the capital of France?" → out-of-scope refusal.
- [ ] Q: "What's my account number at MadeUpBank?" (account doesn't exist) → "I don't see that account in your vault."
- [ ] Q in zh-TW → reply in zh-TW.
- [ ] Q in EN with vault locale = zh-TW → reply in EN.
- [ ] Click "Show system prompt" → opens a modal showing the embedded JSON + rules. Verify `apiKey` is NOT present.
- [ ] Cost label next to model dropdown matches research.md R6 (~$0.08 for Opus, ~$0.017 for Sonnet, ~$0.006 for Haiku).

**Expected:** ✅ All 4 question types behave correctly; system prompt is auditable; locale matching works.

---

## SC-005 — Privacy Invariants (US9)

- [ ] **In Network tab:** With chatbox DISABLED, click around the entire vault for 5 minutes. Add accounts. Edit. View procedures. Run the calculator. **Network tab MUST show 0 requests.**
- [ ] Enable the chatbox. Submit one question. **Exactly 1 POST to api.anthropic.com.** No other requests.
- [ ] Open the HTML file in a text editor (Notepad). Search for `https://`. Verify the only matches are: api.anthropic.com (chatbox), console.anthropic.com (instructional link), bsaefiling.fincen.gov (instructional link in obligations), irs.gov (instructional link in obligations). No CDN, no analytics, no fonts.

**Expected:** ✅ Vault is fully self-contained; zero network calls except the explicit Claude POST.

---

## SC-006 — Encryption Round-trip (US9)

- [ ] In Settings, enable encryption. Set passphrase = "test123".
- [ ] Reload page. Vault prompts for passphrase. Enter "test123". Vault loads normally.
- [ ] Reload. Enter "wrong" 3 times. After 3rd attempt, attempt 4 has 1s delay. Then 10s. Then 60s.
- [ ] Refresh after rate-limit. Counter resets. Enter correct passphrase. Vault loads.
- [ ] In Settings, disable encryption. Confirm vault is plaintext in localStorage (open DevTools → Application → Local Storage to inspect).

**Expected:** ✅ Encryption round-trip works; rate-limit graceful, never permanently locks; toggle disable works.

---

## SC-007 — Bilingual Completeness (US * all)

- [ ] Toggle locale repeatedly. EVERY visible string changes between EN and zh-TW.
- [ ] No untranslated EN strings in zh-TW mode (no fallback warnings in console).
- [ ] No raw translation keys (e.g., `vault.inventory.addAccount`) appearing in UI.

**Expected:** ✅ Full bilingual coverage.

---

## SC-008 — Print PDF (US9)

- [ ] Click "Print full vault". Browser print preview opens.
- [ ] Verify all sections render: Critical Family Info (expanded), inventory (one account per row), procedures (collapsed by default but expandable in print preview), obligations.
- [ ] No CSS clipping. No widow/orphan issues. Headings on each section.

**Expected:** ✅ Clean printable backup.

---

## Sign-off

| Item | Pass/Fail | Notes |
|------|-----------|-------|
| SC-001 Inventory CRUD | | |
| SC-002 Procedure playbook | | |
| SC-003 Withdrawal calculator | | |
| SC-004 Chatbox refusal | | |
| SC-005 Privacy invariants | | |
| SC-006 Encryption round-trip | | |
| SC-007 Bilingual completeness | | |
| SC-008 Print PDF | | |

If all 8 pass: merge to main.

If any fail: file an issue in BACKLOG.md, fix in a follow-up commit, re-run the affected SC.
