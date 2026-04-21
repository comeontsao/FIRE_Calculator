# FIRE Calculator

A zero-build, open-source Financial Independence / Retire Early dashboard. Runs entirely in your browser. No account needed. No data leaves your device.

## Live demo

[https://<username>.github.io/FIRE_Calculator/](https://<username>.github.io/FIRE_Calculator/)

(URL is finalized after the first GitHub Pages deploy — see `PUBLISH.md`.)

## Features

- Per-year lifecycle projection — net worth, spend, and portfolio trajectory over the full retirement horizon
- Tax-aware withdrawal modeling (401k / IRA / taxable / Roth buckets, bridge funding)
- Inflation-adjusted (real) dollar metrics throughout
- Mortgage, college, second-home, and student-loan expense overlays
- Dual-locale UI — English and Traditional Chinese (zh-TW) toggle
- Drag-to-adjust FIRE age directly on the chart with feasibility feedback

## Run locally

Clone, then `python -m http.server 8000` (or any static server) and visit `http://localhost:8000/`. Or simply double-click `index.html`.

## Tech

Vanilla JS (ES2022 modules). Chart.js via CDN. Zero build step, zero npm, zero dependencies. Tested via `bash tests/runner.sh` (Node 20+).

## License

[MIT](LICENSE)

## Contributions

This is a read-only public mirror. For contributions or bugs, please open an issue on GitHub.

## Disclaimer

⚠️ For research and educational purposes only — not financial advice.

Projections are estimates. Do your own research (DYOR) and consult a qualified financial advisor before making financial decisions. The authors assume no responsibility for decisions made from this tool. Source code: MIT-licensed, open-source.
