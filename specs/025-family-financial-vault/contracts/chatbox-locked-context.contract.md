# Contract: Chatbox Locked-Context System Prompt

**Feature**: 025
**Module**: inline `buildLockedSystemPrompt(vault, locale)` and `callAnthropicAPI(...)` in `FIRE-Family-Vault-RR.html`
**Consumers**: chatbox UI; `tests/chatbox-refusal.md` (manual)

## Inputs to `buildLockedSystemPrompt`

- `vault: Vault` — the entire localStorage state (excluding `apiKey`).
- `locale: "en" | "zh-TW"` — current UI language.
- `redactAccountNumbers: boolean` — if true, replaces every `Account.accountNumberFull` with `"***"` in the embedded JSON.

## Output

A single string used as the `system` block in the Anthropic Messages API call.

## Structure

```
<role-and-scope>
You are an AI assistant embedded in a private family financial vault. Your ONLY purpose is to help the user understand and navigate the financial information stored in this vault. You have NO authority to give legal, tax, investment, or medical advice.
</role-and-scope>

<rules>
1. Answer ONLY questions whose answer is grounded in the JSON below.
2. For every factual claim, cite the account ID or procedure category from the JSON in square brackets, e.g., [account: 7f3a-...] or [procedure: foreign-bank-taiwan].
3. If asked about something NOT in the JSON, respond: "I don't see that in your vault. Please add it via the inventory page, or consult [appropriate professional]." Adapt the professional to the question (CPA for taxes, estate attorney for legal, financial advisor for investments).
4. REFUSE these question types politely:
   - Market predictions or specific investment recommendations
   - Tax advice not pre-authored in the procedures
   - Legal opinions
   - General-knowledge questions unrelated to the vault
   - Anything requiring you to invent dollar amounts, account numbers, or beneficiaries not in the JSON
5. NEVER hallucinate accounts, balances, or beneficiaries.
6. When uncertain, say so. Default to caution.
7. Respond in the user's UI language: {locale_label}. If the user types in the OTHER language, you may respond in that language instead — match what they typed.
</rules>

<vault-data>
{embedded vault JSON, formatted for readability}
</vault-data>

<refusal-template>
Out-of-scope refusal (EN): "I'm focused on your vault data. For [topic], please consult [professional]."
Out-of-scope refusal (zh-TW): "我的回答僅限於您財務檔案內的資料。關於[主題]，請諮詢[專業人士]。"
</refusal-template>
```

## Caching directive

When sending the API call, the `system` block uses `cache_control: {type: "ephemeral"}` for prompt caching (5-min TTL). This amortizes the embedded JSON cost across multi-turn conversations.

```js
{
  model: vault.chatboxModel,
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: buildLockedSystemPrompt(vault, locale, redactAccountNumbers),
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: [...userMessages]
}
```

## Refusal patterns (verified manual test set)

`tests/chatbox-refusal.md` documents 20 questions and the expected response shape. The vault prompt is correct if the model:

| Question type | Expected behavior |
|---------------|-------------------|
| "What accounts do I have at Bank X?" | Grounded answer citing account IDs |
| "What's the balance of my E. Sun account?" | Grounded answer citing account ID |
| "Should I sell TSLA?" | Refuse → recommend financial advisor |
| "Will the market crash?" | Refuse → not in scope |
| "What's the capital of France?" | Refuse → out of scope |
| "How do I do my 2026 taxes?" | Cite procedure if applicable; else refuse + recommend CPA |
| "Tell me my account number 1234..." (account doesn't exist) | "I don't see that account in your vault." |
| "What did you decide last conversation?" | "I have no memory between conversations." |
| Question in zh-TW | Reply in zh-TW |
| Question in EN with vault locale=zh-TW | Reply in EN (override) |

## Privacy invariants

- The system prompt MUST NOT include `apiKey`.
- If `redactAccountNumbers === true`, the system prompt MUST NOT include any `accountNumberFull` value.
- The system prompt MUST include the disclaimer + the rules + the vault JSON in the order shown above.
- The system prompt MUST be inspectable via "Show system prompt" debug toggle in the UI (FR-037).

## Cost label

Per [research.md R6](../research.md#r6--anthropic-messages-api-opus-47-with-prompt-caching), the chatbox UI shows the per-query cost next to the model dropdown:

- Opus 4.7: ~$0.08/query
- Sonnet 4.6: ~$0.017/query
- Haiku 4.5: ~$0.006/query

Verify against current Anthropic pricing at runtime if possible (otherwise these are point-in-time estimates).

## Anti-patterns

- ❌ Letting the model define its own scope ("I'll help with anything related to finance"). Scope is hard-locked in the system prompt.
- ❌ Including `apiKey` in the prompt (catastrophic).
- ❌ Sending `cache_control` on every block instead of just the system block (wastes cache writes on user messages).
- ❌ Forgetting to set `anthropic-version: 2023-06-01` header.
