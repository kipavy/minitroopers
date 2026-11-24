import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import { html, jsq, raw, esc } from "../src/views/html.ts";
import { layout, tip } from "../src/views/layout.ts";

// sha256 of the original stylesheet (recon/assets/extra/site-elements/css/style.css of the work tree, not in the repository).
const ORIGINAL_STYLE_SHA256 = "3ca21ce00d609ec2b18ca52ac9a289124151965fea9c7b79b9446d9165a697ac";
const cfg = loadConfig({});

test("html escapes interpolations by default, raw opts out", () => {
  const evil = `<script>alert("x")</script>`;
  assert.equal(String(html`<b>${evil}</b>`), "<b>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</b>");
  assert.equal(String(html`<b>${raw("<i>ok</i>")}</b>`), "<b><i>ok</i></b>");
  assert.equal(String(html`${[html`<li>${"a&b"}</li>`, html`<li>2</li>`]}`), "<li>a&amp;b</li><li>2</li>");
  assert.equal(esc(`'"&<>`), "&#39;&quot;&amp;&lt;&gt;");
  assert.equal(String(html`${1}${null}${undefined}${false}`), "1");
});

test("layout escapes a <script> in the army name and title", () => {
  const name = `<script>alert(1)</script>`;
  const out = String(layout(cfg, { title: `L'armée ${name}`, content: html`<a class="company">${name}</a>`, host: "nsun" }));
  assert.ok(!out.includes("<script>alert(1)"));
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("layout keeps the original frame and wires local assets", () => {
  const out = String(layout(cfg, { title: "MiniTroopers", content: html`<p>hi</p>`, host: "nsun", pass: true }));
  for (const cls of ["ptop", "bottomsite", "ptopsite", 'id="content"', "dbottom", 'class="copy"', "pbottomleft", 'class="dbg"', "indust"]) assert.ok(out.includes(cls), cls);
  assert.ok(out.includes('href="/css/style.css'));
  assert.ok(out.includes('src="/js/jquery.min.js"'));
  assert.ok(out.includes('src="/ruffle/ruffle.js"'));
  assert.ok(out.includes('src="/js/embed.js"'));
  assert.ok(out.includes('src="/js/app.js'));
  assert.ok(out.includes('href="/a/nsun/protect"'));
  assert.ok(!out.includes("data.minitroopers.fr"));
  assert.ok(!out.includes("google-analytics"));
  assert.ok(out.includes('(c) Killian Pavy · <a href="https://github.com/kipavy/minitroopers" target="_blank" rel="noopener">GitHub</a>'));
  assert.ok(!/motion-twin/i.test(out), "no Motion-Twin credit or logo link in the frame");
});

test("footer: « Modifier mon pass » only for a protected army, no stray separator", () => {
  const credit = '(c) Killian Pavy · <a href="https://github.com/kipavy/minitroopers" target="_blank" rel="noopener">GitHub</a>';
  const copy = (o: { host?: string; pass?: boolean }): string => /<div class="copy">(.*?)<\/div>/s.exec(String(layout(cfg, { title: "T", content: html``, ...o })))![1]!;
  // site root (fr/_.html has no army): the credit alone
  assert.equal(copy({}), credit);
  // unprotected army (add.html, b_opp.html, protect.html): no password link
  assert.equal(copy({ host: "nsun" }), credit);
  assert.equal(copy({ host: "nsun", pass: false }), credit);
  // protected army (hq.html, ranks.html…)
  assert.equal(copy({ host: "nsun", pass: true }), `<a href="/a/nsun/protect">Modifier mon pass</a> · ${credit}`);
});

test("tip() produces the original Tip.show markup, escaped", () => {
  const t = String(tip("Crédits", "Tu les gagnes en <b>batailles</b>. L'armée"));
  assert.match(t, /^onmouseover="mt\.js\.Tip\.show\(this,'/);
  assert.ok(t.includes("&lt;h1&gt;Crédits&lt;/h1&gt;"));
  assert.ok(t.includes("&amp;lt;b&amp;gt;batailles")); // string body is text: escaped inside the tip html
  assert.ok(t.includes("L&amp;#39;armée")); // text entity, attribute-escaped
  assert.ok(String(tip("T", raw("it's"))).includes("it\\&#39;s")); // raw quote: JS-escaped then attribute-escaped
  assert.ok(t.endsWith(`onmouseout="mt.js.Tip.hide()"`));
  assert.ok(!/[<>]/.test(t.slice(0, -`onmouseout="mt.js.Tip.hide()"`.length)));
  const h = String(tip("T", raw("<strong>x</strong>")));
  assert.ok(h.includes("&lt;strong&gt;x&lt;/strong&gt;"));
  const evil = String(tip(`"><script>`, "x"));
  assert.ok(!evil.includes("<script>") && !evil.includes('"><'));
});

test("GET /css/style.css serves the exact original bytes", async () => {
  const app = createApp({ cfg, db: openDb(":memory:") });
  const res = await app.request("/css/style.css");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /text\/css/);
  assert.equal(createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex"), ORIGINAL_STYLE_SHA256);
});

test("static: bg images, swfs, ruffle wasm, no traversal, no cookies", async () => {
  const app = createApp({ cfg, db: openDb(":memory:") });
  for (const [p, type] of [
    ["/img/bg/garden.jpg", /image\/jpeg/],
    ["/img/skills.png", /image\/png/],
    ["/swf/client_fr_play.swf", /shockwave/],
    ["/swf/mini.swf", /shockwave/],
    ["/swf/army.swf", /shockwave/],
    ["/js/embed.js", /javascript/],
    ["/js/jquery.min.js", /javascript/],
    ["/js/app.js", /javascript/],
    ["/ruffle/ruffle.js", /javascript/],
  ] as const) {
    const r = await app.request(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type")!, type, p);
    assert.equal(r.headers.getSetCookie().length, 0);
  }
  assert.equal((await app.request("/css/../../package.json")).status, 404);
  assert.equal((await app.request("/css/%2e%2e/%2e%2e/package.json")).status, 404);
  assert.equal((await app.request("/img/nope.png")).status, 404);
});

test("jsq: JS-escapes \\ ' and line breaks, then HTML-escapes &<>\" (safe in onmouseover=\"…('…')\")", () => {
  assert.equal(jsq("s'est").value, "s\\'est");
  assert.equal(jsq('a\\b\n<i>"&').value, "a\\\\b\\n&lt;i&gt;&quot;&amp;");
});
