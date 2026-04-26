// One-shot script for T024 + T025 (feature 013).
//
// For every <div class="pill-host" data-tab="..." data-pill="..."> in BOTH
// FIRE-Dashboard.html and FIRE-Dashboard-Generic.html, insert a Next button
// as the LAST child immediately before its closing </div>.
//
// The button is `disabled` for the LAST pill of each tab:
//   plan      -> summary
//   geography -> country-deep-dive
//   retirement-> milestones
//   history   -> snapshots
//
// Matching strategy: depth-track <div ... > opens vs </div> closes starting
// from the pill-host opening line. The line where depth returns to 0 contains
// the matching </div>. Pre-flight asserts: every file's <div / </div> count is
// balanced and no <div substring appears in quoted strings (verified via grep).
//
// Run from repo root: `node specs/013-tabbed-navigation/scripts/add-next-buttons.mjs`.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');

const FILES = [
  resolve(repoRoot, 'FIRE-Dashboard.html'),
  resolve(repoRoot, 'FIRE-Dashboard-Generic.html'),
];

// Last pill per tab: their Next button is `disabled`.
const TERMINAL_PILLS = new Set([
  'plan|summary',
  'geography|country-deep-dive',
  'retirement|milestones',
  'history|snapshots',
]);

const PILL_HOST_OPEN_RE = /<div class="pill-host" data-tab="([^"]+)" data-pill="([^"]+)"(?: hidden)?>/;

// Count <div ...> opens (incl. self-tag with class etc.) and </div> closes per line.
// We don't have any <div within strings (verified by grep), so substring counting
// is safe.
function countDivOpens(line) {
  // Match `<div ` (with trailing space, attribute-bearing) OR `<div>` (no attrs).
  const matches = line.match(/<div(?=[\s>])/g);
  return matches ? matches.length : 0;
}

function countDivCloses(line) {
  const matches = line.match(/<\/div>/g);
  return matches ? matches.length : 0;
}

function buildButton(disabled) {
  const dis = disabled ? ' disabled' : '';
  return `        <button type="button" class="next-pill-btn" data-action="next-pill" data-i18n="nav.next"${dis}>Next →</button>`;
}

function findMatchingCloseLineIdx(lines, openIdx) {
  // openIdx is 0-indexed; line at openIdx contains the pill-host opening div.
  // Start with depth from THAT line: opens - closes (typically opens=1, closes=0).
  let depth = countDivOpens(lines[openIdx]) - countDivCloses(lines[openIdx]);
  if (depth < 1) {
    throw new Error(`Pill-host opening line ${openIdx + 1} has non-positive depth ${depth}`);
  }
  for (let i = openIdx + 1; i < lines.length; i++) {
    depth += countDivOpens(lines[i]);
    depth -= countDivCloses(lines[i]);
    if (depth === 0) {
      return i;
    }
    if (depth < 0) {
      throw new Error(`Negative div depth at line ${i + 1} (started at ${openIdx + 1})`);
    }
  }
  throw new Error(`No matching </div> found for pill-host at line ${openIdx + 1}`);
}

function processFile(path) {
  const original = readFileSync(path, 'utf8');
  const lines = original.split('\n');

  // First pass: find all pill-host openings (their 0-indexed line numbers and tab/pill).
  const pillHosts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PILL_HOST_OPEN_RE);
    if (m && /class="pill-host"/.test(lines[i])) {
      pillHosts.push({openIdx: i, tab: m[1], pill: m[2]});
    }
  }
  if (pillHosts.length !== 16) {
    throw new Error(`${path}: expected 16 pill-hosts, found ${pillHosts.length}`);
  }

  // For each pill-host, find its matching close line index. The close line ends
  // with `</div>` — we insert the button line right before it.
  const insertionPoints = pillHosts.map(ph => {
    const closeIdx = findMatchingCloseLineIdx(lines, ph.openIdx);
    const closeLine = lines[closeIdx];
    if (!/<\/div>\s*$/.test(closeLine)) {
      throw new Error(`Close line ${closeIdx + 1} for pill-host ${ph.tab}/${ph.pill} doesn't end with </div>: ${JSON.stringify(closeLine)}`);
    }
    return {...ph, closeIdx};
  });

  // Walk through descending closeIdx so insertions don't shift later indices.
  const sorted = [...insertionPoints].sort((a, b) => b.closeIdx - a.closeIdx);
  const out = lines.slice();
  let disabledCount = 0;
  for (const ip of sorted) {
    const isTerminal = TERMINAL_PILLS.has(`${ip.tab}|${ip.pill}`);
    if (isTerminal) disabledCount++;
    out.splice(ip.closeIdx, 0, buildButton(isTerminal));
  }

  if (disabledCount !== 4) {
    throw new Error(`${path}: expected 4 disabled buttons, got ${disabledCount}`);
  }

  writeFileSync(path, out.join('\n'), 'utf8');
  console.log(
    `Wrote ${path}: ${pillHosts.length} pill-hosts, ${insertionPoints.length} buttons (${disabledCount} disabled).`
  );
  // Log mapping for audit:
  for (const ip of insertionPoints) {
    const isTerminal = TERMINAL_PILLS.has(`${ip.tab}|${ip.pill}`);
    console.log(
      `  ${ip.tab}/${ip.pill}: open=L${ip.openIdx + 1} close=L${ip.closeIdx + 1}${isTerminal ? ' [DISABLED]' : ''}`
    );
  }
}

for (const f of FILES) {
  processFile(f);
}
console.log('Done.');
