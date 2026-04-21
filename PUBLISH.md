# Publish-Ready Checklist

This document is the user's 2-step manual launch procedure after feature
005 merges. Expected total time: under 10 minutes.

## Before you start

- [ ] Feature 005 is merged to `main` (branch `005-canonical-public-launch` merged).
- [ ] Local working copy is clean: `git status` shows no uncommitted changes.
- [ ] `bash tests/runner.sh` reports all pass / 1 skip (the pre-existing bidirectional meta-skip).

## Step 1 — Remove RR content (≈ 5 min)

Delete the RR (personalized) files from the working tree so they don't leak when the repo goes public:

- [ ] `git rm FIRE-Dashboard.html`
- [ ] `git rm FIRE-snapshots.csv`
- [ ] `git rm tests/baseline/rr-defaults.mjs`
- [ ] `git rm tests/baseline/inputs-rr.mjs`
- [ ] `git rm tests/baseline/inline-harness.mjs`
- [ ] `git rm tests/baseline/inline-harness.test.js`
- [ ] `git rm tests/baseline/run-and-report.mjs`
- [ ] `git rm tests/fixtures/rr-realistic.js`
- [ ] `git rm tests/fixtures/rr-generic-parity.js`
- [ ] Delete the `tests/baseline/browser-smoke.test.js` imports of the deleted fixtures — OR delete the whole `browser-smoke.test.js` file if the RR+parity portions can't be split cleanly. After deletions, `bash tests/runner.sh` MUST still report 0 failures.
- [ ] Review `tests/unit/fireCalculator.test.js` — it imports `rr-realistic.js` and `rr-generic-parity.js`; delete those imports + dependent test cases, keeping only the Generic-facing assertions.
- [ ] Any additional files flagged in `specs/005-canonical-public-launch/privacy-scrub.md` as "Out-of-scope — user deletes in Step 1"

Commit + push:

```
git commit -m "chore: remove RR files ahead of public launch"
git push origin main
```

⚠️ **Important**: Step 1 MUST come before Step 2. If you flip the repo public first, any uncommitted RR data becomes world-readable until you finish this step.

## Step 2 — Flip repo public + enable Pages (≈ 5 min)

1. Open GitHub: `https://github.com/<your-username>/FIRE_Calculator/settings`.
2. Scroll to **Danger Zone** → **Change visibility** → choose **Public**. Confirm with the repo name.
3. Settings → **Pages** (left sidebar).
4. Source: **Deploy from a branch**. Branch: **`main`**. Folder: **`/` (root)**. Save.
5. Wait 2–5 minutes for Pages to build.
6. Visit `https://<your-username>.github.io/FIRE_Calculator/`.
7. Verify: Generic dashboard loads, KPIs show numeric values, disclaimer visible.

## If something goes wrong

- **Pages 404 after 5 minutes**: Settings → Pages — confirm Source is `main` / `(root)`. Push any trivial commit to trigger a rebuild.
- **Dashboard shows NaN / empty charts**: open browser DevTools console; look for `[<shim-name>] canonical threw:` messages. File an issue on the repo.
- **Rollback**: Settings → Change visibility → **Private**. Dashboard URL 404s immediately.
- **Privacy leak discovered post-public**: Settings → Change visibility → **Private** immediately. Note: historical git content in pre-public commits is still exposed — see `specs/005-canonical-public-launch/spec.md §Assumptions` for the accepted trade-off.
