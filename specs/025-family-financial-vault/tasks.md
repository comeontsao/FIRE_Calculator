---
description: "Tasks for feature 025 — Family Financial Vault (RR-only)"
---

# Tasks: Family Financial Vault (RR-only)

**Input**: Design documents from `/specs/025-family-financial-vault/`
**Prerequisites**: spec.md ✓, plan.md ✓; Phase 0 (research.md), Phase 1 (data-model.md, 4 contracts, quickstart.md) generated as part of this run.

**Tests**: Pure modules (schema validation, withdrawal calc, encryption, procedure lookup, bilingual completeness, no-external-resources) tested via `node --test tests/vault/*.test.js`. DOM + network behavior verified manually via [quickstart.md](./quickstart.md).

**Organization**: Sequential — each phase depends on the previous. No parallel-wave dispatch (unlike feature 024) because the app is built top-down.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Tasks within the SAME phase that touch disjoint files and can run in parallel.
- **[Story]**: Which user story (US1 — US9, mapping to spec.md).

## Path Conventions

- Feature delivers a **single new file** at repo root: `FIRE-Family-Vault-RR.html`. The two existing dashboards are NOT touched.
- Tests live in `tests/vault/`.
- Translation Catalog appendix in `FIRE-Dashboard Translation Catalog.md`.

---

## Phase 1: Setup

- [ ] T001 Verify branch is up-to-date with `origin/main` via `git status` (currently working in worktree `claude/trusting-fermi-d9e653`)
- [ ] T002 [P] Verify the FIRE Calculator baseline test count by running `node --test tests/**/*.test.js` and confirming all pass before adding new tests
- [ ] T003 [P] Confirm `calc/withdrawal-strategies.js` exports the bracket-fill strategy in a Node-importable form

---

## Phase 2: Foundational Research (Phase 0)

**Purpose**: Lock down tax-law constants and external references before authoring procedure entries.

- [ ] T004 [P] **R1** — Pin 2026 federal Single tax brackets (Rebecca's filing status post-year-of-death) → save in `research.md`
- [ ] T005 [P] **R2** — Pin 2026 IRMAA single-filer threshold ($103,000 MAGI per current spec) and verify against IRS for any 2026 update
- [ ] T006 [P] **R3** — Pin 2026 ACA premium tax credit cliff (400% FPL for household of 2 — Rebecca + 0 dependents if kids are emancipated, or 4 if kids are minors)
- [ ] T007 [P] **R4** — Cite IRS Pub 590-B for inherited-account 10-year stretch rule and SECURE Act 2.0 details
- [ ] T008 [P] **R5** — Cite FinCEN FBAR procedure for "filer is deceased" (final-year FBAR for Roger; Rebecca continues filing her own)
- [ ] T009 [P] **R6** — Confirm Anthropic Messages API prompt-caching pricing for `claude-opus-4-7` (5-minute TTL on the system block) so per-query cost label is accurate
- [ ] T010 [P] **R7** — Choose translation-catalog file format: inline JS objects in HTML (matches existing FIRE-Dashboard convention) → confirmed
- [ ] T011 [P] **R8** — Confirm FIRE-Dashboard.html localStorage key namespace (for US8 import) — read the existing key names directly

**Checkpoint**: research.md complete with citable references for every dollar number that ends up in the calculator.

---

## Phase 3: Design Contracts (Phase 1)

- [ ] T012 Write `data-model.md` — Vault root, Account, ProcedureEntry, CriticalFamilyInfo, MonthlySnapshot, BalancePoint, Contact, LifeInsurancePolicy schemas
- [ ] T013 [P] Write `contracts/procedure-entry.contract.md` — JSON shape, required fields, EN + zh-TW pairing rule
- [ ] T014 [P] Write `contracts/chatbox-locked-context.contract.md` — system prompt template, refusal patterns, citation rules
- [ ] T015 [P] Write `contracts/encryption.contract.md` — AES-GCM-256 + PBKDF2-SHA-256 (300k iter) + IV/salt storage rules
- [ ] T016 [P] Write `contracts/withdrawal-calc.contract.md` — interface to `calc/withdrawal-strategies.js`, fixture data, expected output shape
- [ ] T017 Write `quickstart.md` — manual browser-smoke checklist for SC-001 through SC-012

**Checkpoint**: All design docs written. Implementation can begin.

---

## Phase 4: User Story 1 + User Story 9 — Inventory CRUD + Privacy Foundation (P1)

**Goal**: Scaffold `FIRE-Family-Vault-RR.html` with the dark-theme CSS skeleton, locale toggle, account inventory CRUD, schema validation, localStorage persistence, and the privacy invariants (no external resources, no network calls).

**Independent Test**: Open the new file with empty localStorage. Add 3 accounts. Refresh. All 3 persist. Edit one. Refresh. Edit persists. Delete one. Refresh. 2 remain. DevTools Network tab shows 0 requests through all of this.

### Implementation for US1 + US9

- [ ] T018 Create `FIRE-Family-Vault-RR.html` with the HTML skeleton, dark-theme CSS variables matching FIRE-Dashboard.html (`--bg`, `--card`, `--accent`, `--text`, etc.), basic layout (top bar + content + sidebar placeholder for chatbox)
- [ ] T019 Inline `TRANSLATIONS.en` and `TRANSLATIONS.zh` objects with the first ~25 UI keys (page title, locale toggle, "Add Account", form labels, owner labels, category labels) → also append to `FIRE-Dashboard Translation Catalog.md`
- [ ] T020 Implement `t(key)` lookup helper and locale toggle UI (Roman ABC ↔ 中文 button). Persist locale to `vault.rr.v1.locale`
- [ ] T021 Implement schema validators (pure functions): `validateAccount`, `validateVault`, `migrateVault` — FRAME-headed, Node-testable
- [ ] T022 Implement localStorage adapter: `loadVault()`, `saveVault(vault)`, `wipeVault()` — handles both encrypted and plaintext modes
- [ ] T023 Implement Add Account modal: owner toggle (Roger / Rebecca / Joint), category dropdown (8 enum values), institution / last-4 / current-balance / login-url / contact-phone / beneficiary / notes fields; client-side required-field validation; on Save, persist to localStorage and re-render
- [ ] T024 Implement inventory list view: filter chips (Owner / Country / Category), grand-total USD card, per-account row with Edit / Delete actions, last-updated caption
- [ ] T025 Implement Edit Account modal (reuses Add modal in edit mode)
- [ ] T026 Implement Delete confirmation modal with explicit "Type DELETE to confirm"
- [ ] T027 Privacy invariant: confirm zero `<script src="http">` or `<link href="http">` references — only inline resources
- [ ] T028 [Test] Write `tests/vault/schema.test.js` — schema validation cases (valid + 10 invalid)
- [ ] T029 [Test] Write `tests/vault/no-external-resources.test.js` — static grep over `FIRE-Family-Vault-RR.html` for any `https?://` references that aren't (a) `api.anthropic.com` (chatbox), (b) `console.anthropic.com/settings/keys` (instructional link in setup), (c) `bsaefiling.fincen.gov` (instructional link in obligations), (d) `irs.gov/payments` (instructional link in obligations)

**Checkpoint**: US1 + US9 complete. The vault is a working empty inventory app, locale toggle works, no procedures yet.

---

## Phase 5: User Story 2 — Procedure Playbook (P1)

**Goal**: Author the 9 procedure entries in EN + zh-TW. Render the procedure panel for any account based on its `category`.

**Independent Test**: Click "Death procedure" on a `employer-401k-roth` account. Panel renders with UPPAbaby HR contact path (placeholder values OK at this point), 10-year-stretch tax guidance, and the "consult a licensed estate attorney" disclaimer.

### Implementation for US2

- [ ] T030 Inline `VAULT_PROCEDURES` JSON object in `FIRE-Family-Vault-RR.html` with 9 entries matching FR-016 schema. Each entry has `en` and `zh-TW` versions of `whoToContact`, `expectedTimeline`, `paperworkChecklist[]`, `taxStrategyNotes` (markdown-light), `commonMistakes[]`
- [ ] T031 [P] Author `employer-401k-roth` entry — UPPAbaby HR contact placeholders for `hrContactName` / `hrContactPhone` / `hrContactEmail`; spousal rollover guidance; spread-over-10-years tax strategy
- [ ] T032 [P] Author `employer-401k-trad` entry — same as Roth but with ordinary-income tax warnings + RMD handling
- [ ] T033 [P] Author `traditional-ira` and `roth-ira` entries — direct-spousal-rollover paths (Rebecca rolls into her own IRA, simpler than 401k)
- [ ] T034 [P] Author `us-brokerage-tod` entry — TOD beneficiary forms for Webull and Schwab; basis step-up at date of death
- [ ] T035 [P] Author `us-brokerage-jtwros` entry — automatic survivor for joint tenancy
- [ ] T036 [P] Author `us-bank-joint` entry — East West Bank automatic-survivor process
- [ ] T037 [P] Author `foreign-bank-taiwan` entry — Apostille requirement, certified translation, Taiwan inheritance procedure timeline, repatriation guidance
- [ ] T038 [P] Author `foreign-bank-china` entry — Bank of China + China Construction Bank specific procedures, Taiwan-licensed CPA recommendation
- [ ] T039 [P] Author `taiwan-life-insurance` entry — Nan Shan Life Insurance claim procedure, beneficiary review
- [ ] T040 [P] Author `reit-ark7` entry — Ark7 share inheritance, transfer process
- [ ] T041 [P] Author `other` (generic fallback) entry — "Contact a probate attorney" generic procedure
- [ ] T042 Implement procedure panel renderer: takes an account, looks up `VAULT_PROCEDURES[account.category]`, renders all 5 fields with the persistent disclaimer banner at top
- [ ] T043 Implement "Print procedure" button → uses `window.print()` with print-only CSS for clean single-page output
- [ ] T044 [Test] Write `tests/vault/procedure-lookup.test.js` — every account category resolves to a procedure entry; missing category falls back to `other`; bilingual fields all present

**Checkpoint**: US2 complete. Rebecca can click any account and read a death-procedure that's grounded in real tax + inheritance rules.

---

## Phase 6: User Story 3 — Inherited-Account Withdrawal Calculator (P1)

**Goal**: For each retirement account, an interactive 3-strategy comparison calculator. Reuses `calc/withdrawal-strategies.js`.

**Independent Test**: Given $500k Traditional 401(k) + Rebecca's $60k expected income, the bracket-fill strategy produces a 10-year tax total at least 25% lower than the lump-sum strategy.

### Implementation for US3

- [ ] T045 Inline 2026 federal Single tax brackets (from research.md R1) and MA 5% flat rate as named constants
- [ ] T046 Inline 2026 IRMAA single threshold + ACA cliff threshold + AMT thresholds
- [ ] T047 Implement `calculateLumpSumStrategy(balance, otherIncome, filingStatus)` — single-year liquidation
- [ ] T048 Implement `calculateEvenTenthsStrategy(balance, otherIncome, filingStatus, growthRate)` — balance / 10 each year, with growth on remaining
- [ ] T049 Implement `calculateBracketFillStrategy(balance, otherIncome, filingStatus, growthRate, targetBracketPct)` — wraps the imported FIRE-engine strategy or a local equivalent
- [ ] T050 Implement cliff-detection helper: takes a year's MAGI, returns `{ irmaa: bool, acaCliff: bool, amt: bool }`
- [ ] T051 Render the 3-column comparison table on the procedure panel for retirement-account categories. Recompute button. Year-by-year drilldown.
- [ ] T052 Apply Roth-account modification: federal-tax columns show $0 BUT all three cliff warnings still surface (per locked decision 7)
- [ ] T053 [Test] Write `tests/vault/withdrawal-calc.test.js` — fixture cases for all 3 strategies + cliff-detection edge cases

**Checkpoint**: US3 complete. Concrete tax-savings advisory feature working.

---

## Phase 7: User Story 7 — Critical Family Info (P2)

**Goal**: Section for non-account info: will, POAs, healthcare directive, guardianship, life insurance, password vault, funeral, contacts.

**Independent Test**: Add an executor name + contact. Refresh. Persists. Click "If something has happened" CTA → section auto-expands.

### Implementation for US7

- [ ] T054 Implement `criticalFamilyInfo` schema validation (subsection: will, poaFinancial, poaHealthcare, healthcareDirective, guardianship, lifeInsurance[], passwordVault, funeral, contacts[])
- [ ] T055 Build collapsible UI: 8 subsection cards with edit-in-place freeform text fields
- [ ] T056 "If something has happened" prominent CTA at top of the page → on click, scrolls to + auto-expands Critical Family Info AND the procedure panel disclaimer
- [ ] T057 Bilingual labels for all 8 subsections

**Checkpoint**: US7 complete.

---

## Phase 8: User Story 4 — Recurring Obligations Calendar (P2)

**Goal**: Pre-populated tax/regulatory calendar from `2025_Tax_Filing_Guide_FATCA_FBAR.md`. Mark-done per year.

**Independent Test**: Open vault on April 1. Calendar shows April 15 obligation cluster with "act in 14 days" badge.

### Implementation for US4

- [ ] T058 Inline `RECURRING_OBLIGATIONS` JSON: Federal 1040, MA Form 1, FBAR Roger, FBAR Rebecca, Form 8938, four 1040-ES quarters, charitable receipt aggregation reminder. Each entry: `id`, `dueDate` (MM-DD), `whoActs` (`roger` / `rebecca` / `both`), `procedureLink` (deep link to procedure panel or external resource), `notes`
- [ ] T059 Implement calendar renderer: 12-month forward view from current date; visual states (green=done, yellow=approaching-30-days, red=overdue, gray=future)
- [ ] T060 Per-year done flags persisted in `vault.rr.v1.obligations[year][obligationId]`
- [ ] T061 Top-of-page banner for any overdue or upcoming-30-day obligations (this is the ONE banner the vault has — it's about regulatory deadlines, not nag UI)
- [ ] T062 "Roger deceased" mode: when Roger has any account flagged `deceasedFlag='roger-deceased'`, surface "Final FBAR for Roger (year of death)" obligation with link to deceased-spouse FBAR procedure
- [ ] T063 Bilingual labels for all obligation entries

**Checkpoint**: US4 complete.

---

## Phase 9: User Story 6 — Monthly Snapshot History (P2)

**Goal**: Update-balances flow that appends to per-account `history[]`. Mini-SVG sparkline. CSV export matching FIRE-snapshots.csv schema.

**Independent Test**: Update 3 of 5 accounts. View one — sparkline shows 12-month history. Export CSV — file matches expected schema.

### Implementation for US6

- [ ] T064 "Update balances" wizard: walks through every account, lets user input new balance, appends `{date, balanceUSD, source: 'manual'}` to `account.history[]`
- [ ] T065 Per-account inline mini-SVG sparkline (last 12 months) — pure SVG, no Chart.js
- [ ] T066 Summary screen post-update: total net worth this month vs. last month, biggest movers, accounts not updated > 60 days flagged
- [ ] T067 CSV export button → downloads single-row CSV matching `FIRE-snapshots.csv` columns (DB Engineer-owned schema)
- [ ] T068 Bilingual labels

**Checkpoint**: US6 complete. Living-document mode works.

---

## Phase 10: User Story 5 — Claude API Chatbox (P2)

**Goal**: Locked-context chatbox using Anthropic Messages API. Default model `claude-opus-4-7`.

**Independent Test**: Question 1 ("What accounts at E. Sun Bank?") → grounded list. Question 2 ("Should I sell TSLA?") → polite refusal. Question 3 ("Capital of France?") → out-of-scope refusal. Question 4 (asks for nonexistent account) → "Not in your vault."

### Implementation for US5

- [ ] T069 API key setup form: stored in `vault.rr.v1.apiKey`; instructions link to console.anthropic.com/settings/keys; "Reset key" + "Disable chatbox" toggles
- [ ] T070 Chatbox sidebar UI (right side): message list, input box, model dropdown (default `claude-opus-4-7`), per-query cost label, "Show system prompt" debug toggle
- [ ] T071 Implement `buildLockedSystemPrompt(vault, locale)`: embeds the full vault JSON (excludes apiKey, optionally redacts accountNumberFull); locks scope per FR-034; requires citation per FR-035; sets locale per FR-065
- [ ] T072 Implement `callAnthropicAPI({apiKey, model, systemPrompt, messages})`: single POST to https://api.anthropic.com/v1/messages with `anthropic-version: 2023-06-01`, `cache_control: {type: 'ephemeral'}` on the system block for prompt caching
- [ ] T073 Persistent disclaimer banner above the chatbox per spec
- [ ] T074 Refusal-pattern static fallbacks for offline / API-error states
- [ ] T075 [Test] Write `tests/chatbox-refusal.md` — manual 20-question test set documenting expected refusals
- [ ] T076 Bilingual chatbox UI labels + system prompt locale instruction

**Checkpoint**: US5 complete. Chatbox works, refuses out-of-scope questions, cites JSON.

---

## Phase 11: User Story 8 — Import from RR FIRE Dashboard (P3)

**Goal**: One-click "Import from FIRE-Dashboard.html" button reads aggregated buckets from FIRE dashboard's localStorage.

**Independent Test**: With FIRE dashboard previously populated, vault offers a 4-bucket reconciliation form. User assigns the cash bucket across their actual cash accounts. Save persists.

### Implementation for US8

- [ ] T077 Read FIRE-Dashboard.html's localStorage keys (research.md R8 confirms exact namespace)
- [ ] T078 4-bucket reconciliation modal: cash / 401k / brokerage / home equity, each with the FIRE bucket total and a list of vault accounts the user can assign portions to. Constraints: assigned must equal bucket total ±$1
- [ ] T079 On save, append `{date, balanceUSD, source: 'fire-dashboard-import'}` to each affected account's history[]
- [ ] T080 Bilingual labels

**Checkpoint**: US8 complete.

---

## Phase 12: Bilingual + Privacy + Tests Sweep

- [ ] T081 [Test] Write `tests/vault/bilingual-completeness.test.js` — every key in `TRANSLATIONS.en` has a matching key in `TRANSLATIONS.zh`; every procedure entry has both `en` and `zh-TW` blocks
- [ ] T082 [Test] Write `tests/vault/encryption.test.js` — AES-GCM round-trip with PBKDF2-derived key; wrong passphrase fails as expected
- [ ] T083 Manual DevTools Network tab sweep — 0 requests in chatbox-disabled mode; exactly 1 POST to api.anthropic.com per chatbox submission
- [ ] T084 Print-to-PDF mode — write print-only CSS, verify clean output
- [ ] T085 Encryption manual test — enable, set passphrase, reload, enter passphrase, verify access; enter wrong passphrase 3x, verify rate-limit 1s → 10s → 60s

**Checkpoint**: All tests green. Privacy invariants verified.

---

## Phase 13: Closeout

- [ ] T086 Write `audit-report.md` listing all SC-001..SC-012 verification results
- [ ] T087 Write `CLOSEOUT.md` summarizing the feature and any deferred items
- [ ] T088 Append "Done in feature 025" section to `BACKLOG.md`
- [ ] T089 Flip `CLAUDE.md` SPECKIT block to "025 ACTIVE — AWAITING USER BROWSER-SMOKE"
- [ ] T090 Final commit + ready for user gate

---

## Phase 14: USER GATE

- [ ] T091 **USER provides UPPAbaby HR contact** — name, phone, email. Agent bakes into `VAULT_PROCEDURES.employer-401k-roth.en.whoToContact` and `.zh-TW.whoToContact`
- [ ] T092 **USER opens FIRE-Family-Vault-RR.html in a real browser**, walks the [quickstart.md](./quickstart.md) smoke checklist
- [ ] T093 **USER merges to main** (or assigns followup work)

---

## Dependencies & Sequencing

- Phase 2 (research) must precede Phase 3 (contracts) and especially Phase 6 (calculator) since dollar constants come from research.
- Phase 4 (US1+US9 foundation) must precede every other story phase.
- Phase 5 (US2 procedures) must precede Phase 6 (US3 calculator) since the calculator attaches to the procedure panel.
- Phases 7-11 can technically reorder among themselves; the listed order is by user-priority and natural buildup (family info → calendar → snapshots → chatbox → import).
- Phase 12 (sweep) must precede Phase 13 (closeout).
- Phase 14 (user gate) is the only hard human-in-the-loop step.
