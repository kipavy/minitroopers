import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTIONS } from "@mt/game";
import { hashPassword } from "../src/password.ts";
import { armyByHost } from "../src/repo.ts";
import { checkArmyName } from "../src/validate.ts";
import { create, offerSeeds, setup, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const count = (env: ReturnType<typeof setup>): number => Number((env.db.prepare("SELECT COUNT(*) n FROM armies").get() as { n: number }).n);

for (const mode of MODES) {
  test(`[${mode}] home: no recruiter -> faction recruits, 5 offers, session cookie`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const res = await cl.req("/");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /recrute : crée ta propre armée !/);
    assert.match(html.replaceAll("&#39;", "'"), /L'armée (de |d'|du |de la |des |)[^<]+<\/a> recrute/);
    assert.equal(offerSeeds(html).length, 5);
    assert.match(html, /<form action="\/" method="POST" class="create">/);
    assert.match(html, /<form action="\/login" method="POST">/);
    assert.ok(cl.cookies.cid);
    assert.equal(cl.cookies.ssid, undefined); // lazy: nothing stored until the visitor becomes someone
    // same client, same day: the same 5 offers
    assert.deepEqual(offerSeeds(await (await cl.req("/")).text()), offerSeeds(html));
    // another client: other offers
    assert.notDeepEqual(offerSeeds(await (await env.client().req("/")).text()), offerSeeds(html));
  });

  test(`[${mode}] HTML pages carry Referrer-Policy: same-origin and X-Frame-Options: SAMEORIGIN`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const pages = [await cl.req("/"), await create(env, cl, "Warp", { part: "0" })];
    const hq = env.at("warp", "/hq");
    pages.push(await cl.req(hq.url, { host: hq.host }));
    const missing = env.at("warp", "/nothing");
    pages.push(await cl.req(missing.url, { host: missing.host }));
    for (const res of pages) {
      assert.equal(res.headers.get("referrer-policy"), "same-origin", res.url);
      assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN", res.url);
    }
    assert.match(pages[2]!.headers.get("content-type")!, /text\/html/);
  });

  test(`[${mode}] creation: offers -> POST -> cookie -> /hq 200 with the name`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const res = await create(env, cl, "Les Rats", { part: "4" });
    assert.equal(res.status, 302);
    const army = armyByHost(env.db, "les-rats")!;
    assert.ok(army);
    assert.equal(army.name, "Les Rats");
    assert.equal(army.part, 4);
    assert.equal(army.credits, 0);
    assert.equal(army.createdIp, "1.1.1.1");
    assert.ok(army.faction >= 0 && army.faction <= 5);
    const loc = res.headers.get("location")!;
    assert.equal(loc, mode === "path" ? "/a/les-rats/hq" : "http://les-rats.lvh.me:8080/hq");
    const t = env.db.prepare("SELECT slot, name, seed, choices FROM troopers WHERE army_id = ?").all(army.id);
    assert.equal(t.length, 1);
    assert.equal(t[0]!.slot, 0);
    assert.equal(t[0]!.choices, "[]");
    const at = env.at("les-rats", "/hq");
    const hq = await cl.req(at.url, { host: at.host });
    assert.equal(hq.status, 200);
    const html = await hq.text();
    assert.ok(html.replaceAll("&#39;", "'").includes("L'armée des Les Rats"));
    assert.match(html, /<span id="targetMoney">0<\/span>/);
    // a home visit now goes back to the HQ
    const home = await cl.req("/");
    assert.equal(home.status, 302);
    assert.equal(home.headers.get("location"), loc);
  });

  test(`[${mode}] tselect outside the day's offers -> original error, no army`, async () => {
    const env = setup(mode);
    const cl = env.client();
    await cl.req("/");
    for (const tselect of ["12345", "", "abc", "-1"]) {
      const res = await cl.req("/", { form: { part: "5", name: "Gecko", tselect } });
      assert.equal(res.status, 400);
      assert.match(await res.text(), /Cette action nécessite que tu sois enregistré sur le site\./);
    }
    const res = await cl.req("/", { form: { part: "5", name: "Gecko" } });
    assert.equal(res.status, 400);
    assert.equal(count(env), 0);
    // offers of another client are not valid for this one
    const other = env.client("2.2.2.2");
    const seed = offerSeeds(await (await other.req("/")).text())[0]!;
    const res2 = await cl.req("/", { form: { part: "5", name: "Gecko", tselect: String(seed) } });
    assert.equal(res2.status, 400);
    assert.equal(count(env), 0);
  });

  test(`[${mode}] third army from the same IP the same day is refused; next day and other IP are fine`, async () => {
    const env = setup(mode);
    assert.equal((await create(env, env.client("9.9.9.9"), "Alpha")).status, 302);
    assert.equal((await create(env, env.client("9.9.9.9"), "Bravo")).status, 302);
    const third = await create(env, env.client("9.9.9.9"), "Charlie");
    assert.equal(third.status, 429);
    assert.match(await third.text(), /Trop d&#39;armées/);
    assert.equal(armyByHost(env.db, "charlie"), null);
    assert.equal((await create(env, env.client("8.8.8.8"), "Charlie")).status, 302);
    env.clock.t += 86_400_000;
    assert.equal((await create(env, env.client("9.9.9.9"), "Delta")).status, 302);
  });

  test(`[${mode}] name already taken -> check says used, POST refused, one army`, async () => {
    const env = setup(mode);
    await create(env, env.client("1.1.1.1"), "Warp");
    const cl = env.client("3.3.3.3");
    assert.equal(await (await cl.req("/check?name=warp")).text(), "used");
    assert.equal(await (await cl.req("/check?name=warp2")).text(), "free");
    const res = await create(env, cl, "Warp", { part: "0" });
    assert.equal(res.status, 409);
    assert.match(await res.text(), /Ce nom est déjà pris\./);
    assert.equal(count(env), 1);
    // same host through another spelling
    const res2 = await create(env, env.client("4.4.4.4"), "WARP ");
    assert.equal(res2.status, 409);
    assert.equal(count(env), 1);
  });

  test(`[${mode}] double submission creates one army (sequential and concurrent)`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const html = await (await cl.req("/")).text();
    const form = { part: "5", name: "Twice", tselect: String(offerSeeds(html)[1]) };
    const [a, b] = await Promise.all([cl.req("/", { form }), cl.req("/", { form })]);
    assert.deepEqual([a.status, b.status].sort(), [302, 302]);
    assert.equal(a.headers.get("location"), b.headers.get("location"));
    const c = await cl.req("/", { form });
    assert.equal(c.status, 302);
    assert.equal(count(env), 1);
    assert.equal(Number((env.db.prepare("SELECT COUNT(*) n FROM troopers").get() as { n: number }).n), 1);
  });

  test(`[${mode}] lazy sessions: 50 anonymous GET / store nothing; creating an army stores one`, async () => {
    const env = setup(mode);
    const cl = env.client();
    let html = "";
    for (let i = 0; i < 50; i++) html = await (await cl.req("/")).text();
    assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n), 0);
    const res = await cl.req("/", { form: { part: "5", name: "Lazy", tselect: String(offerSeeds(html)[0]) } });
    assert.equal(res.status, 302);
    assert.equal(Number((env.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n), 1);
  });

  test(`[${mode}] re-submit of the creation form: binds within 10 s, "taken" a minute later`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const html = await (await cl.req("/")).text();
    const form = { part: "5", name: "Again", tselect: String(offerSeeds(html)[0]) };
    assert.equal((await cl.req("/", { form })).status, 302);
    // a browser that never got the first response (no ssid) re-submits at once: it is let in
    const lost = env.client();
    lost.cookies.cid = cl.cookies.cid!;
    env.clock.t += 3000;
    const quick = await lost.req("/", { form });
    assert.equal(quick.status, 302);
    assert.ok(lost.cookies.ssid);
    assert.equal(count(env), 1);
    // same cid, no session, a minute later: the normal "taken" message, nothing bound
    const late = env.client();
    late.cookies.cid = cl.cookies.cid!;
    env.clock.t += 60_000;
    const res = await late.req("/", { form });
    assert.equal(res.status, 409);
    assert.match(await res.text(), /Ce nom est déjà pris\./);
    assert.equal(late.cookies.ssid, undefined);
    // already bound to another army: no rebinding through the fallback either
    const other = env.client("3.3.3.3");
    await create(env, other, "Other", { part: "0" });
    const again = await other.req("/", { form: { ...form, tselect: String(offerSeeds(await (await other.req("/")).text())[0]) } });
    assert.ok(again.status === 409 || again.status === 400 || again.status === 302);
    assert.notEqual((env.db.prepare("SELECT army_id FROM sessions WHERE token = ?").get(other.cookies.ssid!) as { army_id: number }).army_id, armyByHost(env.db, "again")!.id);
  });

  test(`[${mode}] recruiter page: "L'armée de X recrute", faction inherited, recruiter_id set`, async () => {
    const env = setup(mode);
    await create(env, env.client("1.1.1.1"), "Warp", { part: "0" });
    const warp = armyByHost(env.db, "warp")!;
    env.db.prepare("UPDATE armies SET faction = 4 WHERE id = ?").run(warp.id);
    const cl = env.client("5.5.5.5");
    const at = env.at("warp", "/");
    const page = await (await cl.req(at.url, { host: at.host })).text();
    assert.match(page.replaceAll("&#39;", "'"), /L'armée de Warp<\/a> recrute : crée ta propre armée !/);
    const action = mode === "path" ? "/a/warp/" : "http://warp.lvh.me:8080/";
    assert.ok(page.includes(`<form action="${action}" method="POST" class="create">`));
    assert.notDeepEqual(offerSeeds(page), offerSeeds(await (await env.client("5.5.5.5").req("/")).text()));
    const res = await create(env, cl, "Recrue", { recruit: "warp" });
    assert.equal(res.status, 302);
    const r = armyByHost(env.db, "recrue")!;
    assert.equal(r.recruiterId, warp.id);
    assert.equal(r.faction, 4);
  });

  test(`[${mode}] recruiter page of an unseeded faction works; unknown army is 404`, async () => {
    const env = setup(mode);
    const f = FACTIONS[0]!;
    const cl = env.client();
    const at = env.at(f.host, "/");
    const res = await cl.req(at.url, { host: at.host });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /recrute : crée ta propre armée !/);
    const r = await create(env, cl, "Fan", { recruit: f.host });
    assert.equal(r.status, 302);
    const army = armyByHost(env.db, "fan")!;
    assert.equal(army.faction, f.id);
    assert.equal(army.recruiterId, null);
    const nope = env.at("nobody-here", "/");
    assert.equal((await cl.req(nope.url, { host: nope.host })).status, 404);
  });

  test(`[${mode}] a faction host is never free, even unseeded`, async () => {
    const env = setup(mode);
    const f = FACTIONS[1]!;
    const cl = env.client();
    assert.equal(await (await cl.req(`/check?name=${f.host}`)).text(), "used");
    const res = await create(env, cl, f.name, { part: String(f.part) });
    assert.equal(res.status, 400);
    assert.equal(count(env), 0);
  });

  test(`[${mode}] /check: free, used, invalid, reserved`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const chk = async (n: string): Promise<string> => (await cl.req(`/check?name=${encodeURIComponent(n)}`)).text();
    assert.equal(await chk("nouvelle-armee"), "free");
    assert.equal(await chk("ab"), "used");
    assert.equal(await chk("www"), "used");
    assert.equal(await chk("Not A Host"), "used");
    assert.equal(await chk(""), "used");
    assert.equal(await chk("x".repeat(500)), "used");
  });

  test(`[${mode}] login: unprotected army by name, unknown army, GET never binds`, async () => {
    const env = setup(mode);
    await create(env, env.client("1.1.1.1"), "Warp", { part: "0" });
    const cl = env.client("6.6.6.6");
    const g = await cl.req("/login?login=Warp");
    assert.equal(g.status, 302);
    const expected = mode === "path" ? "/a/warp/hq" : "http://warp.lvh.me:8080/hq";
    assert.equal(g.headers.get("location"), expected);
    assert.equal(cl.cookies.ssid, undefined); // no session for a visitor who is nobody
    const p = await cl.req("/login", { form: { login: "WARP" } });
    assert.equal(p.status, 303);
    assert.equal(p.headers.get("location"), expected);
    assert.equal(env.db.prepare("SELECT army_id FROM sessions WHERE token = ?").get(cl.cookies.ssid!)!.army_id, armyByHost(env.db, "warp")!.id);
    const missing = await env.client().req("/login", { form: { login: "Personne" } });
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Aucune armée de ce nom\./);
    assert.equal((await env.client().req("/login", { form: { login: "x".repeat(5000) } })).status, 413);
    assert.equal((await env.client().req("/login", { form: { login: "<b>\ud800" } })).status, 404);
  });

  test(`[${mode}] login: protected army needs the password`, async () => {
    const env = setup(mode);
    await create(env, env.client("1.1.1.1"), "Warp", { part: "0" });
    env.db.prepare("UPDATE armies SET password_hash = ? WHERE host = 'warp'").run(hashPassword("s3cret"));
    const id = armyByHost(env.db, "warp")!.id;
    const cl = env.client("7.7.7.7");
    const noPass = await cl.req("/login", { form: { login: "warp" } });
    assert.equal(noPass.status, 403);
    assert.match(await noPass.text(), /insertpass/);
    const bad = await cl.req("/login", { form: { login: "warp", pass: "nope" } });
    assert.equal(bad.status, 403);
    assert.match(await bad.text(), /Mot de passe incorrect\./);
    assert.equal(cl.cookies.ssid, undefined); // no session for a visitor who is nobody
    const ok = await cl.req("/login", { form: { login: "warp", pass: "s3cret" } });
    assert.equal(ok.status, 303);
    assert.equal(env.db.prepare("SELECT army_id FROM sessions WHERE token = ?").get(cl.cookies.ssid!)!.army_id, id);
  });

  test(`[${mode}] login attempts on a protected army are rate limited`, async () => {
    const env = setup(mode);
    await create(env, env.client("1.1.1.1"), "Warp", { part: "0" });
    env.db.prepare("UPDATE armies SET password_hash = ? WHERE host = 'warp'").run(hashPassword("s3cret"));
    const cl = env.client("7.7.7.7");
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await cl.req("/login", { form: { login: "warp", pass: `x${i}` } })).status;
    assert.equal(last, 429);
    assert.equal((await cl.req("/login", { form: { login: "warp", pass: "s3cret" } })).status, 429);
  });

  test(`[${mode}] hostile army names are rejected or escaped everywhere`, async () => {
    const env = setup(mode);
    const bad = [
      "<script>alert(1)</script>", // too long
      `"><img src=x onerror=alert(1)>`, // too long
      "ab\ud800cd", // lone surrogate
      "ab\udc00cd",
      "zero​width", // zero-width space
      "rtl‮name", // bidi override
      "line\nbreak",
      "tab\there",
      "nul\u0000l",
      "x".repeat(21),
      "x".repeat(100_000).slice(0, 190),
      "", "  ", "ab", "www", "admin",
    ];
    let i = 0;
    for (const name of bad) {
      const res = await create(env, env.client(`10.0.0.${i++}`), name);
      assert.equal(res.status, 400, JSON.stringify(name));
    }
    assert.equal(count(env), 0);
    // not-a-string name
    const cl = env.client("10.1.1.1");
    const seed = offerSeeds(await (await cl.req("/")).text())[0]!;
    assert.equal((await cl.req("/", { form: { part: "5", tselect: String(seed) } })).status, 400);
    assert.equal((await cl.req("/", { form: { part: "9", name: "Valide", tselect: String(seed) } })).status, 400);

    // tag-like and quote names that are valid: stored raw, escaped in every page
    const ok = ["<b>x</b>", `a"onmouseover="x`, "a'b'c", "x&amp;y", "<i>it</i>"];
    for (const name of ok) {
      const c = env.client(`10.2.0.${i++}`);
      const res = await create(env, c, name);
      assert.equal(res.status, 302, name);
      const loc = res.headers.get("location")!;
      const army = env.db.prepare("SELECT host, name FROM armies ORDER BY id DESC LIMIT 1").get() as { host: string; name: string };
      assert.equal(army.name, name);
      const at = env.at(army.host, "/hq");
      const html = await (await c.req(at.url, { host: at.host })).text();
      assert.ok(!html.includes(`<b>x</b>`) && !html.includes(`<i>it</i>`), name);
      assert.ok(!html.includes(`"onmouseover="x`), name);
      assert.ok(!html.includes(`a'b'c`) || html.includes(`a&#39;b&#39;c`), name);
      assert.ok(html.includes(name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")), name);
      assert.ok(loc.endsWith("/hq"));
      // also on the recruit page
      const home = env.at(army.host, "/");
      const h = await (await env.client("10.3.0.1").req(home.url, { host: home.host })).text();
      assert.ok(!h.includes(`<b>x</b>`) && !h.includes(`<i>it</i>`) && !h.includes(`"onmouseover="x`), name);
    }
  });

  test(`[${mode}] an error re-render keeps the typed name escaped`, async () => {
    const env = setup(mode);
    const cl = env.client();
    const html = await (await cl.req("/")).text();
    const res = await cl.req("/", { form: { part: "2", name: `<b>"x'`, tselect: "1" } });
    assert.equal(res.status, 400);
    const body = await res.text();
    assert.ok(!body.includes(`<b>"x'`));
    assert.ok(body.includes(`value="&lt;b&gt;&quot;x&#39;"`));
    assert.ok(body.includes(`<option value="2" selected>`));
    void html;
  });
}

test("home page: offers carry flashvars safe in the script, 2 skill tooltips each", async () => {
  const env = setup("path");
  const html = await (await env.client().req("/")).text();
  assert.equal([...html.matchAll(/swfobject\.embedSWF\("\/swf\/client_fr_play\.swf\?v=4"/g)].length, 5);
  for (const m of html.matchAll(/flashvars : ("(?:[^"\\]|\\.)*")/g)) {
    const fv = JSON.parse(m[1]!) as string;
    assert.match(fv, /^data=[A-Za-z0-9%._~!*()-]+&chk=play&imageurl=\/img\/&onclick=_\.selectTrooper\(100\d,\d+\)$/);
  }
  assert.equal([...html.matchAll(/\/img\/skills\.png/g)].length, 10);
  assert.equal([...html.matchAll(/mt\.js\.Tip\.show/g)].length, 10);
});

test("checkArmyName: plain text only, trimmed, host derived", () => {
  const bad = ["ab\ud800cd", "\udc00", "ab\ufffdcd", "a\u200bb", "a\u2028b", "a\u0007b", "\ue000ab", "x".repeat(21), "", "ab", "www", ".. ..", "a.b.c"];
  for (const n of bad) assert.equal(checkArmyName(n, "0").ok, false, JSON.stringify(n));
  assert.equal(checkArmyName("ok", 0 as unknown as string).ok, false);
  assert.equal(checkArmyName("ok!", "6").ok, false);
  assert.equal(checkArmyName(["x"], "0").ok, false);
  const v = checkArmyName("  Les Gars  ", "4");
  assert.deepEqual(v, { ok: true, name: "Les Gars", host: "les-gars", part: 4 });
  assert.equal(checkArmyName("Tyraël", "5").ok && (checkArmyName("Tyraël", "5") as { host: string }).host, "tyrael");
});
