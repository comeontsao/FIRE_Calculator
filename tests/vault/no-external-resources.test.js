/* tests/vault/no-external-resources.test.js — Phase 2 / T029
 *
 * Privacy invariant FR-041: vault HTML is self-contained.
 * No <script src="http..."> or <link href="http...">. No CDN, no fonts, no analytics.
 *
 * The ONLY allowed http(s) URLs are inert references — instructional links
 * and the Anthropic API endpoint that the chatbox calls (when enabled).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VAULT_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'FIRE-Family-Vault-RR.html'),
  'utf8'
);

const ALLOWED_HOSTS = new Set([
  'api.anthropic.com',           // chatbox POST (Phase 8)
  'console.anthropic.com',        // instructional link in chatbox setup (Phase 8)
  'bsaefiling.fincen.gov',        // FBAR e-filing — instructional link (Phase 6)
  'www.irs.gov',                  // 1040-ES payments — instructional link (Phase 6)
  'irs.gov',                      // 1040-ES payments — instructional link (Phase 6)
]);

test('no <script src=http...> tags', () => {
  const re = /<script[^>]+src\s*=\s*["']\s*(?:https?:)?\/\//gi;
  const matches = VAULT_HTML.match(re) || [];
  assert.deepEqual(matches, [], 'Found external script tags: ' + matches.join('\n'));
});

test('no <link rel="stylesheet" href=http...> tags', () => {
  const re = /<link[^>]+href\s*=\s*["']\s*(?:https?:)?\/\/[^"']+["']/gi;
  const matches = VAULT_HTML.match(re) || [];
  assert.deepEqual(matches, [], 'Found external link tags: ' + matches.join('\n'));
});

test('no <iframe src=http...> tags', () => {
  const re = /<iframe[^>]+src\s*=\s*["']\s*(?:https?:)?\/\//gi;
  const matches = VAULT_HTML.match(re) || [];
  assert.deepEqual(matches, [], 'Found iframe tags: ' + matches.join('\n'));
});

test('no <img src=http...> tags', () => {
  const re = /<img[^>]+src\s*=\s*["']\s*(?:https?:)?\/\//gi;
  const matches = VAULT_HTML.match(re) || [];
  assert.deepEqual(matches, [], 'Found external image tags: ' + matches.join('\n'));
});

test('no @import or url() to external origins in inline CSS', () => {
  const importRe = /@import\s+(?:url\()?["']?\s*(?:https?:)?\/\//gi;
  const urlRe = /url\(\s*["']?\s*(?:https?:)?\/\//gi;
  const importMatches = VAULT_HTML.match(importRe) || [];
  const urlMatches = VAULT_HTML.match(urlRe) || [];
  assert.deepEqual(importMatches, []);
  assert.deepEqual(urlMatches, []);
});

test('any http(s) URL in source must point to an allow-listed host', () => {
  const urls = VAULT_HTML.match(/https?:\/\/[a-zA-Z0-9.\-]+/g) || [];
  const hosts = new Set(urls.map(u => u.replace(/^https?:\/\//, '').toLowerCase()));
  const violations = [];
  for (const h of hosts) {
    if (!ALLOWED_HOSTS.has(h)) violations.push(h);
  }
  assert.deepEqual(
    violations,
    [],
    'Disallowed external hosts found in vault HTML: ' + violations.join(', ')
  );
});

test('no analytics / telemetry markers in source', () => {
  const blocklist = [
    'google-analytics.com',
    'googletagmanager.com',
    'gtag(',
    'analytics.google',
    'sentry.io',
    'datadog',
    'segment.com',
    'mixpanel',
    'hotjar',
    'fullstory',
    'amplitude',
  ];
  const found = blocklist.filter(b => VAULT_HTML.toLowerCase().includes(b));
  assert.deepEqual(found, [], 'Telemetry markers detected: ' + found.join(', '));
});
