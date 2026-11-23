import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2], 'latin1');
const parts = html.split('<div id="swf_opp_').slice(1);
for (const p of parts) {
  const id = p.match(/^\d+/)[0];
  const dm = p.match(/data=([^&']*)/);
  if (!dm) continue;
  const d = unescape(dm[1]);
  const pm = p.match(/class="po">[\s\S]*?\/>\s*(\d+)/);
  const lv = [...d.matchAll(/(?:%0Az%0Av|R\d+)a((?:z|i-?\d+|n)*)h/g)].map((x) => (x[1].match(/z|i-?\d+|n/g) || []).length);
  const pow = lv.reduce((s, c) => s + 5 + c, 0);
  console.log(id, 'shownPower', pm && pm[1], 'troopers', lv.length, 'choices', lv.join(','), 'computedPower', pow);
}
