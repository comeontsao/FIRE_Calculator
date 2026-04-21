# Contract: Publish-Ready Artifacts (LICENSE, README, index.html, PUBLISH.md)

**Feature**: 005-canonical-public-launch

This contract specifies the four new root-level files (plus the disclaimer
DOM block) that prepare the repo for public launch. These files must be
present and conformant before the user can execute the PUBLISH.md checklist.

---

## `LICENSE`

**Path**: `LICENSE` (repo root, no extension — GitHub convention).

**Content**: Standard MIT License text. Use the canonical template from
https://opensource.org/license/MIT/ with placeholders filled:

```text
MIT License

Copyright (c) 2026 Roger Hsu

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

**Invariants**:
- Year: `2026`.
- Copyright holder: `Roger Hsu` (confirmed at implementation time; user
  may adjust to a different legal name if preferred).
- Exact MIT text — no custom clauses, no "except for" modifications.
- UTF-8 encoded, LF line endings, final newline present.

**Verification**: diff `LICENSE` against the canonical MIT template; only
the copyright line should differ.

---

## `README.md`

**Path**: `README.md` (repo root).

**Required sections (in order)**:

1. **`# FIRE Calculator`** — title.
2. **One-line description** — "A zero-build, open-source Financial
   Independence / Retire Early dashboard. Runs entirely in your browser.
   No account needed. No data leaves your device."
3. **`## Live demo`** — "[https://<username>.github.io/FIRE_Calculator/
   ](https://<username>.github.io/FIRE_Calculator/)". User finalizes URL
   post-publish.
4. **`## Features`** — bullets covering: per-year lifecycle projection,
   tax-aware withdrawal, inflation-adjusted metrics, mortgage + college
   + second-home + student-loan overlays, dual-locale (EN + zh-TW),
   drag-to-adjust FIRE age.
5. **`## Run locally`** — "Clone, then `python -m http.server 8000` (or
   any static server) and visit `http://localhost:8000/`. Or simply
   double-click `index.html`."
6. **`## Tech`** — "Vanilla JS (ES2022 modules). Chart.js via CDN. Zero
   build step, zero npm, zero dependencies. Tested via `bash
   tests/runner.sh` (Node 20+)."
7. **`## License`** — "[MIT](LICENSE)".
8. **`## Contributions`** — "This is a read-only public mirror. For
   contributions or bugs, please open an issue on GitHub."
9. **`## Disclaimer`** — **full text** from FR-011 reproduced verbatim
   (both sentences from disclaimer.intro + disclaimer.body, EN).

**Invariants**:
- No RR-personal data anywhere (birthdays, Roger/Rebecca first names
  outside the copyright line, specific dollar amounts).
- No broken image links.
- Section order preserved (makes the doc scannable by first-time
  visitors).

---

## `index.html`

**Path**: `index.html` (repo root).

**Purpose**: GitHub Pages default-document entry. Meta-refresh redirects
to `FIRE-Dashboard-Generic.html`.

**Content** (exact structure):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FIRE Calculator</title>
  <meta http-equiv="refresh" content="0; url=FIRE-Dashboard-Generic.html">
  <script>
    location.replace('FIRE-Dashboard-Generic.html');
  </script>
</head>
<body>
  <p>Redirecting to <a href="FIRE-Dashboard-Generic.html">FIRE Calculator</a>…</p>
</body>
</html>
```

**Invariants**:
- URL target is `FIRE-Dashboard-Generic.html` relative path (not absolute,
  not a fully-qualified GitHub Pages URL).
- Meta-refresh + JS + `<a>` fallback all present (covers no-JS, slow-meta,
  and default browsers).
- Zero dependencies (no CSS file, no JS file, no CDN).

---

## `PUBLISH.md`

**Path**: `PUBLISH.md` (repo root — discoverable from GitHub root listing).

**Structure**: per research §R6. Two-step checklist, each step has
commands or URLs. Must be under 10 minutes for a technically-literate user
(SC-009).

**Required sections**:

1. `# Publish-Ready Checklist`
2. `## Before you start` — preconditions (feature 005 merged, clean working
   copy).
3. `## Step 1 — Remove RR content` — enumerates file paths to delete:
   - `FIRE-Dashboard.html`
   - `FIRE-snapshots.csv`
   - `tests/baseline/rr-defaults.mjs`
   - Any `specs/*/` folders flagged by the privacy-scrub audit.
4. `## Step 2 — Flip repo public + enable Pages` — GitHub Settings URLs,
   Pages config steps, the public URL to verify.
5. `## If something goes wrong` — rollback steps (flip back to private,
   common issues).

**Invariants**:
- Step 1 MUST come before Step 2 (ordering is safety-critical — flipping
  public before removal leaks RR data for however long the repo is
  public).
- Every step has a command or URL (actionable).
- Rollback documented (user confidence).

---

## Disclaimer DOM block (both HTML files, lockstep)

**Covered by**: `data-model.md §5`. Summary contract here:

- `<footer class="disclaimer">` at the bottom of `<body>` in BOTH
  dashboards.
- Two `<p>` elements with `data-i18n="disclaimer.intro"` and
  `data-i18n="disclaimer.body"`.
- Styled with existing CSS variables only (no new colors).
- Translated in both EN and zh-TW via the existing catalog +
  language-toggle mechanism.

---

## Privacy scrub audit (`specs/005-canonical-public-launch/privacy-scrub.md`)

**Path**: `specs/005-canonical-public-launch/privacy-scrub.md`.

**Purpose**: FR-019 output. Grep audit of files destined to be public.

**Structure**: Markdown table.

```markdown
| File | Scrub status | Findings | Remediation |
|---|---|---|---|
| `calc/fireCalculator.js` | Clean | — | — |
| `calc/lifecycle.js` | Remediated | `$1,250,000` constant (RR anchor) | replaced with Generic sample |
| `FIRE-Dashboard.html` | Out-of-scope | (RR dashboard — user removes) | — |
...
```

**Required columns**: File path, status (Clean / Remediated /
Out-of-scope), findings, remediation action taken.

**Sign-off**: bottom of the file includes a single line: "Scrub complete
on <date>; all in-scope files green."

---

## Integration points with other contracts

- The disclaimer (this contract + data-model §5) is imported by BOTH HTML
  files — lockstep discipline applies.
- The `index.html` redirect target (`FIRE-Dashboard-Generic.html`) must
  remain in the repo post-Step-1 — PUBLISH.md Step 1 deletion list MUST
  NOT include `FIRE-Dashboard-Generic.html`.
- CI workflow (`.github/workflows/tests.yml`) does not need changes per
  FR-021 — already public-ready from feature 003.
