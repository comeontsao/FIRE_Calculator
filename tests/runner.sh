#!/usr/bin/env bash
# Test runner for FIRE Calculator modular calc engine.
# Uses Node's built-in node:test runner — zero-dep, zero-build.
#
# --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
#   Silences the "no package.json type field" notice. Deliberately absent
#   per constitution Principle V (zero-build, zero-dependency delivery).
#   .js files are authored as ES modules with `import`/`export` syntax.
#
# Glob pattern (not a bare "tests/" directory) avoids a Node 22 Windows
# quirk where directory args can be resolved as CJS module paths.
set -euo pipefail
shopt -s globstar nullglob
cd "$(dirname "$0")/.."
# Bash expands tests/**/*.test.js via globstar; passing unquoted lets Node 20
# (CI) and Node 22 (local Git Bash) both receive an explicit file list rather
# than relying on Node's native glob (Node 20 doesn't have it).
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/**/*.test.js
