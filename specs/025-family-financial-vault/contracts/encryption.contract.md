# Contract: Vault Encryption

**Feature**: 025
**Module**: inline `encryptVault`, `decryptVault`, `deriveKey` in `FIRE-Family-Vault-RR.html`
**Consumers**: `loadVault`, `saveVault`; `tests/vault/encryption.test.js`

## Algorithm

- **Encryption**: AES-GCM-256 (browser-native via `crypto.subtle.encrypt`).
- **Key derivation**: PBKDF2-SHA-256 with **300,000 iterations** (per OWASP 2023 recommendation for SHA-256).
- **Salt**: 16 bytes random, generated once at encryption-enable time, stored alongside ciphertext.
- **IV**: 12 bytes random, regenerated on EVERY encrypt operation.
- **Auth tag**: 16 bytes (default for AES-GCM in WebCrypto).

## Persisted shape (when encryption enabled)

```js
{
  encryption: {
    enabled: true,
    salt: "<base64 of 16 random bytes>",
    iv: "<base64 of 12 random bytes from MOST RECENT encrypt>"
  },
  ciphertext: "<base64 of AES-GCM ciphertext including 16-byte auth tag>"
}
```

## Persisted shape (when encryption disabled — default)

The full vault JSON sits at `localStorage.vault.rr.v1` with `encryption: null`.

## Round-trip invariant

```js
// MUST hold for all valid (vault, passphrase) pairs
const enc = await encryptVault(vault, passphrase);
const dec = await decryptVault(enc, passphrase);
assert(JSON.stringify(dec) === JSON.stringify(vault));
```

## Wrong-passphrase behavior

```js
// MUST throw a typed error, NEVER return garbage
try {
  await decryptVault(enc, wrongPassphrase);
} catch (err) {
  assert(err instanceof VaultDecryptError);
  assert(err.code === "INVALID_PASSPHRASE");
}
```

## Rate-limiting

After three consecutive wrong-passphrase attempts in a single session, the UI MUST rate-limit subsequent attempts:

- Attempt 4: 1 second delay before allowing input
- Attempt 5: 10 seconds
- Attempt 6+: 60 seconds
- NEVER permanent lockout — the user may have a typo and a forgotten passphrase shouldn't brick the vault forever.

Rate limit state lives in memory only; reload resets the counter (intentional — the cost of a reload is enough friction).

## Key-in-memory hygiene

The PBKDF2-derived key is held in memory ONLY for the session. The passphrase string SHOULD be cleared from any input fields after use. WebCrypto `CryptoKey` objects are non-extractable; the browser handles their lifecycle.

## Test fixture

`tests/vault/encryption.test.js` includes:

1. Round-trip: encrypt(vault, "test123") → decrypt(..., "test123") returns equivalent vault.
2. Wrong passphrase: decrypt(..., "test124") throws VaultDecryptError("INVALID_PASSPHRASE").
3. Tampered ciphertext: flip a byte → decrypt throws (AES-GCM auth tag detects tampering).
4. Missing salt: decrypt throws SCHEMA error.
5. Performance: 300k PBKDF2 iterations should complete in < 2 seconds on a modern laptop.

## Anti-patterns

- ❌ Using AES-CBC (no auth tag → silent corruption on tamper).
- ❌ Using SHA-1 for PBKDF2 (deprecated).
- ❌ Iteration count below 100k (OWASP minimum).
- ❌ Re-using IV across encrypt operations (catastrophic — leaks plaintext under AES-GCM).
- ❌ Storing the passphrase or derived key in localStorage.
