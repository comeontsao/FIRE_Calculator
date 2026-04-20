# Contract: CI Workflow

**File**: `.github/workflows/tests.yml`
**Feature**: `003-browser-smoke-harness`

A single GitHub Actions workflow runs the full test suite on every push to
any branch and every pull request targeting `main`.

---

## Required shape

```yaml
name: Tests

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run test suite
        run: bash tests/runner.sh
```

---

## Mandatory properties

- **Trigger set**: `push` on every branch pattern `**` AND `pull_request`
  targeting `main`. Both triggers required; omit neither.
- **Runner**: `ubuntu-latest`. Do not change to `ubuntu-22.04` or pin a
  specific version without explicit reason.
- **Node version**: `'20'`. Quoted string (YAML interprets unquoted 20 as
  the number 20, which still works but quoting is defensive). Matches the
  local-dev Node-20+ assumption from `tests/baseline/inline-harness.mjs`.
- **No dependency install step**: the workflow MUST NOT run `npm install`,
  `npm ci`, `yarn`, or any other package manager. Absence of a
  `package.json` in the repo makes this automatic — but the workflow itself
  must not try to create one. Principle V non-negotiable.
- **Single command**: exactly `bash tests/runner.sh` — no inline test
  invocations (`node --test ...`). Using the existing runner script keeps
  CI and local dev in sync forever.
- **No secrets usage**: workflow runs entirely on public, read-only code.
  No `secrets.*` references.

---

## What the workflow does NOT include (explicit)

- **No matrix strategy** (single Node version, single OS). Documented as
  intentional in `research.md §R4`; add when justified.
- **No caching** (no `actions/cache`). No modules to cache.
- **No artifact upload**. Test output goes to stdout only; failure surfaces
  via the runner's exit code.
- **No deployment step**, **no publish step**, **no release step** —
  this workflow is test-only.
- **No schedule trigger**. Tests run on code changes, not on a cron.
- **No branch protection configuration**. That's a repo-admin UI action,
  not a workflow file.

---

## Failure behavior

- When `bash tests/runner.sh` exits non-zero, the workflow job fails; the
  commit status on GitHub goes red; PR merge remains technically allowed
  (admin-configurable branch protection would block it; outside this scope).
- When the workflow itself fails (e.g., Node setup error), GitHub surfaces
  the raw step logs. No custom notification.

---

## Verification

- After the workflow file lands in `main`, push any commit to any branch
  and observe a green check appear on GitHub within ~5 minutes (SC-002).
- Open a PR against `main` and observe the same status check appear on
  the PR conversation view.
- Manually trigger a failure by reverting the smoke harness (e.g.,
  deleting `tests/baseline/rr-defaults.mjs`) and observe CI turn red
  with a clear error in the log.

---

## Changes expected over time

- **Node version bump** (20 → 22 → 24 etc.): one-line change to
  `node-version: '20'`. Coordinate with local dev readiness.
- **Additional test commands** (e.g., a lint step, if ever added):
  extend the `run:` block with a shell `&&` chain OR add a new step.
  Favor the existing runner.sh approach — add new commands inside
  `tests/runner.sh` rather than growing the workflow file.
- **Matrix OS** (if Windows CI becomes desirable): convert `runs-on` to
  `runs-on: ${{ matrix.os }}` and add a `strategy: matrix: os: [...]`
  block. Document the rationale.
- **Branch protection** (if the team wants CI-green-required merges):
  configure via GitHub Settings → Branches. Not part of this file.

---

## Acceptance

- `.github/workflows/tests.yml` exists with the shape above.
- A test commit on any branch triggers the workflow and produces a
  visible status on GitHub.
- A test PR against `main` triggers the same workflow.
- No `package.json` or `node_modules` appears after CI runs.
- CI wall-clock (checkout → node setup → test → report) under 5 minutes
  (SC-002).
