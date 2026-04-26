import {readFileSync} from 'node:fs';

for (const file of ['FIRE-Dashboard.html', 'FIRE-Dashboard-Generic.html']) {
  const txt = readFileSync(file, 'utf8');
  for (const tag of ['section', 'nav', 'aside', 'header', 'footer', 'div']) {
    const openR = new RegExp(`<${tag}(?:[\\s>])`, 'g');
    const closeR = new RegExp(`</${tag}>`, 'g');
    const open = (txt.match(openR) || []).length;
    const close = (txt.match(closeR) || []).length;
    const status = open === close ? 'OK' : 'MISMATCH';
    console.log(`${file}: <${tag}>=${open}, </${tag}>=${close} ${status}`);
  }
}
