# Data Model: Family Financial Vault

**Feature**: 025-family-financial-vault
**Date**: 2026-05-04

The full vault state lives in `localStorage.vault.rr.v1` as a single JSON object. Optionally encrypted (AES-GCM, default OFF). When encrypted, the persisted shape is `{ encryption: {enabled, salt, iv}, ciphertext: "<base64>" }`; on load, we decrypt → parse → get the structure below.

---

## Vault (root)

```js
{
  version: "v1",                    // bumped to v2 on schema migration
  locale: "en" | "zh-TW",            // default "en"; persists user toggle
  apiKey: string | null,             // Anthropic key; only set if chatbox enabled
  chatboxEnabled: boolean,           // default false; user opt-in
  chatboxModel: "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001",  // default "claude-opus-4-7"
  redactAccountNumbersInAI: boolean, // default true; if true, accountNumberFull is replaced with "***" in chatbox system prompt
  encryption: { enabled: boolean, salt: string (base64), iv: string (base64) } | null,
  accounts: Account[],
  criticalFamilyInfo: CriticalFamilyInfo,
  obligations: { [year: string]: { [obligationId: string]: boolean } },
  snapshotHistory: MonthlySnapshot[]
}
```

---

## Account

```js
{
  id: string,                        // UUID v4
  owner: "roger" | "rebecca" | "joint",
  category: AccountCategory,         // enum, see below
  institution: string,               // "Webull", "E. Sun Bank", etc.
  accountNumberLast4: string,        // "8266" — always shown in UI
  accountNumberFull: string | null,  // optional; redactable from AI context
  currencyNative: "USD" | "TWD" | "CNY" | "EUR" | string,
  currentBalanceUSD: number,         // always normalized to USD; user enters in native, app converts via R-rate stored on account
  exchangeRateToUSD: number | null,  // null for USD-native; for TWD/CNY accounts, user-set conversion rate
  lastUpdated: string,               // ISO 8601 date
  loginUrl: string | null,           // institution's login portal
  contactPhone: string | null,
  contactEmail: string | null,
  contactAddress: string | null,
  beneficiary: string | null,        // freeform — "Rebecca C. Chu", "Smith Family Trust", etc.
  notes: string | null,              // freeform
  history: BalancePoint[],           // append-only month-by-month
  deceasedFlag: "roger-deceased" | "rebecca-deceased" | null  // toggle in Settings
}
```

### AccountCategory enum

| Value | Description | US Procedure | Foreign? |
|-------|-------------|--------------|----------|
| `us-bank-joint` | Joint US bank checking/savings (e.g., East West) | Auto-survivor | No |
| `us-bank-solo` | US bank in one person's name | TOD or probate | No |
| `us-brokerage-tod` | US brokerage with TOD beneficiary (e.g., Webull, Schwab solo) | TOD transfer | No |
| `us-brokerage-jtwros` | US joint-tenancy brokerage | Auto-survivor | No |
| `employer-401k-roth` | US employer Roth 401(k) (Roger @ UPPAbaby) | Spousal rollover | No |
| `employer-401k-trad` | US employer Traditional 401(k) | Spousal rollover, ordinary-income | No |
| `traditional-ira` | US Traditional IRA | Spousal rollover, ordinary-income | No |
| `roth-ira` | US Roth IRA | Spousal rollover, qualified | No |
| `foreign-bank-taiwan` | Taiwan bank | Apostille + translation | Yes |
| `foreign-bank-china` | China bank | PBOC + lawyer | Yes |
| `taiwan-life-insurance` | Taiwan life insurance with cash value | Beneficiary claim | Yes |
| `reit-ark7` | Ark7 REIT shares | Inheritance transfer | No |
| `other` | Anything else; falls back to generic procedure | "Consult attorney" | — |

### BalancePoint

```js
{
  date: string,                       // ISO 8601
  balanceUSD: number,
  source: "manual" | "fire-dashboard-import"
}
```

---

## CriticalFamilyInfo

```js
{
  will: { location, executorName, executorContact, attorneyContact, notes } | null,
  poaFinancial: { holder, location, notes } | null,
  poaHealthcare: { holder, location, notes } | null,
  healthcareDirective: { location, notes } | null,
  guardianship: { primaryGuardian, alternateGuardian, financialProvisionPlan, notes } | null,
  lifeInsurance: LifeInsurancePolicy[],
  passwordVault: { manager, masterPasswordRecoveryLocation, notes } | null,
  funeral: { notes: string | null },
  contacts: Contact[]
}
```

### LifeInsurancePolicy

```js
{
  insurer: string,                   // "UPPAbaby Group Life via Monahan Products"
  policyType: "group-term" | "individual-term" | "whole-life" | "universal-life",
  faceAmount: number,                // USD
  beneficiaryPrimary: string,
  beneficiaryContingent: string | null,
  policyNumber: string | null,
  agentContact: string | null,
  notes: string | null
}
```

### Contact

```js
{
  role: "cpa" | "estate-attorney" | "financial-advisor" | "doctor" | "hr" | "insurance-agent" | "other",
  name: string,
  phone: string | null,
  email: string | null,
  address: string | null,
  notes: string | null
}
```

---

## Obligation (static; not in localStorage — per-year done flags ARE)

```js
// Static — bundled in HTML as RECURRING_OBLIGATIONS
{
  id: "fbar-roger" | "fbar-rebecca" | "fed-1040" | "ma-form1" | "form-8938" | "1040es-q1" | "1040es-q2" | "1040es-q3" | "1040es-q4" | "charitable-receipts",
  dueMonthDay: "MM-DD",              // recurring annually
  whoActs: "roger" | "rebecca" | "both",
  category: "tax" | "regulatory" | "personal",
  procedureLink: string | null,      // anchor in the vault HTML or external URL
  externalLink: string | null,       // e.g., https://bsaefiling.fincen.gov/file/fbar
  labelKey: string,                  // i18n key
  descriptionKey: string             // i18n key
}

// Dynamic per-year — in localStorage
obligations: {
  "2026": { "fbar-roger": true, "fbar-rebecca": false, "fed-1040": true, ... },
  "2027": { ... }
}
```

---

## ProcedureEntry (static; bundled in HTML as VAULT_PROCEDURES)

```js
{
  category: AccountCategory,
  en: {
    whoToContact: string,            // markdown-light
    expectedTimeline: string,
    paperworkChecklist: string[],
    taxStrategyNotes: string,        // markdown-light
    commonMistakes: string[],
    hrContactName: string | null,    // employer-401k-* only — placeholder until user provides
    hrContactPhone: string | null,
    hrContactEmail: string | null
  },
  "zh-TW": {
    // same shape, all in zh-TW
    whoToContact: string,
    expectedTimeline: string,
    paperworkChecklist: string[],
    taxStrategyNotes: string,
    commonMistakes: string[],
    hrContactName: string | null,
    hrContactPhone: string | null,
    hrContactEmail: string | null
  }
}
```

---

## MonthlySnapshot

```js
{
  date: string,                       // ISO 8601
  totalNetWorthUSD: number,
  byOwner: { roger: number, rebecca: number, joint: number },
  byCategory: { [category: string]: number },
  byCountry: { US: number, Taiwan: number, China: number, Other: number },
  accountIds: string[]                // accounts that contributed to this snapshot
}
```

---

## Validation Rules

- `Account.owner` ∈ enum
- `Account.category` ∈ enum
- `Account.currentBalanceUSD` ≥ 0
- `Account.exchangeRateToUSD` > 0 if non-USD currency, else null
- `Account.history[]` sorted by date ascending; never modified, only appended
- `Vault.locale` ∈ ("en", "zh-TW")
- `Vault.chatboxModel` ∈ enum
- `Vault.encryption.salt` and `iv` base64-decoded length must match crypto requirements (16 bytes each min)

Invalid vaults trigger a "Schema mismatch — restore from backup?" UI; never silent-fix.

---

## Migration Path (v1 → v2 future)

When schema changes:

1. Bump `Vault.version` to `"v2"`.
2. Implement `migrateV1toV2(vault) → v2vault` pure function in inline script.
3. On load, if `vault.version === "v1"`, run migration → save → reload. Migration is idempotent.
4. Document the migration in a new section of this file.

No migration is needed for v1 shipping. Document this lookup-shaped pattern now so the v2 author has a template.
