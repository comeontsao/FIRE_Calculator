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
cd "$(dirname "$0")/.."
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "tests/**/*.test.js"
