import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const cs = "0123456798abcdef";
const dec = c => Buffer.from([...Array(16)].map((_,i)=>cs.indexOf(c[2*i]) | (cs.indexOf(c[2*i+1])<<4)));
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const masks = new Map(); let n=0;
for (const f of process.argv.slice(2).flatMap(walk)) {
  if (!/\.html?$/.test(f)) continue;
  const html = fs.readFileSync(f,'latin1');
  // find flashvars strings containing data= ... chk=
  const re = /data=([^&'"]*)(?:&amp;|&)chk=([0-9a-f]{32})/g; let m;
  while ((m = re.exec(html))) {
    const data = unescape(m[1]); // flash decodes flashvars once
    for (const [label, buf] of [['utf8', Buffer.from(data,'utf8')], ['latin1', Buffer.from(data,'latin1')]]) {
      const md5 = crypto.createHash('md5').update(buf).digest();
      const cb = dec(m[2]);
      const mask = Buffer.from(cb.map((x,i)=>x^md5[i])).toString('hex');
      if (label==='utf8') { n++; masks.set(mask,(masks.get(mask)||0)+1); if (n<=6) console.log(path.basename(f), data.length, m[2], 'mask', mask); }
    }
  }
}
console.log('pairs', n, 'distinct masks', masks.size);
