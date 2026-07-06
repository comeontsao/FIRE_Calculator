# Multi-threaded static file server for the Playwright E2E suite.
#
# The suite runs many workers in parallel; each dashboard load fetches ~15
# calc/*.js modules. `python -m http.server` is SINGLE-THREADED, so under the
# full suite it serializes every request and module-heavy tests (e.g. the
# Generic retirement-status reload test, which does two full loads) can exceed
# the 30s per-test budget. ThreadingHTTPServer serves requests concurrently,
# removing that contention. Serves from the current working directory
# (repo root, where Playwright is invoked).
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8766), SimpleHTTPRequestHandler).serve_forever()
