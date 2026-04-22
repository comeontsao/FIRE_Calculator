import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function extractFn(html, name) {
  const pat = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = pat.exec(html);
  if (!m) return null;
  let i = html.indexOf('{', m.index) + 1;
  let depth = 1;
  while (depth > 0 && i < html.length) {
    const ch = html[i];
    if (ch === '/' && html[i+1] === '/') { i = html.indexOf('\n', i); if (i<0) break; i++; continue; }
    if (ch === '/' && html[i+1] === '*') { i = html.indexOf('*/', i); if (i<0) break; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '{') depth++; else if (ch === '}') depth--;
    i++;
  }
  return html.slice(m.index, i);
}

let anyFail = false;
for (const f of ['FIRE-Dashboard.html','FIRE-Dashboard-Generic.html']) {
  const html = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
  for (const name of ['projectFullLifecycle','setWithdrawalObjective','renderGrowthChart','scoreAndRank']) {
    const src = extractFn(html, name);
    if (!src) { console.log(f, name, 'NOT FOUND'); anyFail = true; continue; }
    try { new Function(src + '\nreturn 0;'); console.log(f, name, 'OK'); }
    catch (e) { console.log(f, name, 'SYNTAX ERROR:', e.message); anyFail = true; }
  }
}
process.exit(anyFail ? 1 : 0);
