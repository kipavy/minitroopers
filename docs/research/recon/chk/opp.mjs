import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2],'latin1');
const re = /swf_(\w+)" class="swf"><\/div>\s*<script type="text\/javascript">var swfp = \{ menu : false, flashvars : 'data=([^&']*)/g; let m;
while ((m = re.exec(html))) {
  const d = unescape(m[2]);
  const mode = d.match(/ClientMode:(\d+)/)?.[1];
  const seeds = (d.match(/%0CA2ci-?\d+/g)||[]);
  const ch = [...d.matchAll(/%0Az%0Ava([^h]*)h/g)].map(x=>x[1]);
  console.log(m[1], 'mode', mode, 'troopers', seeds.length, 'choicesLens', ch.map(c=>(c.match(/[zni]/g)||[]).length).join(','), d.length);
}
