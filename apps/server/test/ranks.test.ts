import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTIONS } from "@mt/game";
import { hashPassword } from "../src/password.ts";
import { armyByHost, insertArmy, ranking } from "../src/repo.ts";
import { menuFlags } from "../src/views/panel.ts";
import { seedFactions } from "../src/admin/factions.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
let seed = 1;
/** Stores an army of one trooper with `power` (5 + choices), recruited by `recruiter` (host). */
function mk(env: Env, host: string, power: number, o: { recruiter?: string; faction?: number; name?: string; password?: string } = {}): number {
  const a = insertArmy(env.db, {
    host,
    name: o.name ?? host,
    part: 5,
    faction: o.faction ?? 0,
    credits: 0,
    isFaction: false,
    passwordHash: o.password ? hashPassword(o.password) : null,
    now: env.clock.t,
    troopers: [{ seed: seed++, name: "T" + host, choices: new Array<number>(power - 5).fill(0), leftOver: null }],
  })!;
  if (o.recruiter) env.db.prepare("UPDATE armies SET recruiter_id = ? WHERE id = ?").run(armyByHost(env.db, o.recruiter)!.id, a.id);
  return a.id;
}
const get = (env: Env, cl: Client, host: string, p: string): Promise<Response> => {
  const at = env.at(host, p);
  return cl.req(at.url, { host: at.host });
};
/** (power, host) of each table line after the header. */
const lines = (html: string): { top: boolean; host: string; power: number }[] =>
  [...html.matchAll(/<tr( class="top")?>\n?<td><div class="faction[^]*?<a href="([^"]*\/hq)"[^]*?<td>\d+<\/td>\s*<td>(\d+)<\/td>/g)].map((m) => ({ top: m[1] !== undefined, host: /\/a\/([a-z0-9-]+)\/hq$|\/\/([a-z0-9-]+)\.lvh\.me/.exec(m[2]!)!.slice(1).find(Boolean)!, power: Number(m[3]) }));

test("menuFlags: the original's conditions", () => {
  const base = { power: 20, troopers: 5, recruits: 1, protected: false };
  assert.equal(menuFlags({ ...base, power: 19 }).ranks, false);
  assert.equal(menuFlags({ ...base, power: 20 }).ranks, true);
  assert.equal(menuFlags({ ...base, troopers: 4 }).choice, false);
  assert.equal(menuFlags({ ...base, troopers: 5 }).choice, true);
  assert.equal(menuFlags({ ...base, recruits: 0 }).history, false);
  assert.equal(menuFlags({ ...base, recruits: 1 }).history, true);
  assert.equal(menuFlags({ ...base, protected: true }).protect, false);
  assert.equal(menuFlags(base).protect, true);
});

for (const mode of MODES) {
  test(`[${mode}] ranks: recruiter first, the 10 best recruits, then the army when outside the top 10`, async () => {
    const env = setup(mode);
    const cl = env.client("1.1.1.1");
    mk(env, "boss", 60);
    for (let i = 0; i < 12; i++) mk(env, `r${i}`, 30 + 10 * i, { recruiter: "boss" });
    assert.equal((await create(env, cl, "Vee")).status, 302);
    env.db.prepare("UPDATE armies SET recruiter_id = ? WHERE host = 'vee'").run(armyByHost(env.db, "boss")!.id);
    env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(new Array(15).fill(0)), armyByHost(env.db, "vee")!.id); // power 20
    const res = await get(env, cl, "vee", "/ranks");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.match(page, /class="company">Hiérarchie<\/a>/);
    assert.match(page, /Le\nclassement\nrassemble\nles\ndifférentes\narmées\nrecrutées\npar\n<a href="[^"]*boss[^"]*\/hq" target="_blank">L&#39;armée boss<\/a> en fonction de leur puissance\./);
    assert.ok(page.includes('<tr class="top">\n<td>') && page.includes('<img src="/img/top.png"/>'));
    const l = lines(page);
    assert.deepEqual(l.map((x) => x.host), ["boss", ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((i) => `r${i}`), "vee"]);
    assert.deepEqual(l.map((x) => x.power), [60, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 20]);
    assert.ok(l[0]!.top && l.slice(1).every((x) => !x.top));
    assert.equal([...page.split("<table>")[0]!.matchAll(/target="_blank"/g)].length + [...page.split("<table>")[1]!.split("</table>")[0]!.matchAll(/target="_blank"/g)].length, 12); // sentence link + 10 recruits + the army
    assert.ok(page.includes(">Retour</a>"));
    // power 150: first of the 10, exactly 10 recruit lines
    env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(new Array(145).fill(0)), armyByHost(env.db, "vee")!.id);
    const l2 = lines(await (await get(env, cl, "vee", "/ranks")).text());
    assert.equal(l2.length, 11);
    assert.deepEqual(l2.slice(0, 3).map((x) => x.host), ["boss", "vee", "r11"]);
  });

  test(`[${mode}] ranks: equal powers sort by id; faction armies are never recruits`, async () => {
    const env = setup(mode);
    mk(env, "boss", 10);
    const a = mk(env, "late", 60, { recruiter: "boss" });
    const b = mk(env, "early", 60, { recruiter: "boss" });
    assert.ok(a < b);
    const cl = env.client("2.2.2.2");
    const l = lines(await (await get(env, cl, "early", "/ranks")).text());
    assert.deepEqual(l.map((x) => x.host), ["boss", "late", "early"]);
  });

  test(`[${mode}] ranks: an army made from the home page is ranked under its faction`, async () => {
    const env = setup(mode);
    seedFactions(env.db, env.clock.t);
    const cl = env.client("1.1.1.1");
    assert.equal((await create(env, cl, "Warp")).status, 302);
    env.db.prepare("UPDATE armies SET faction = 4 WHERE host = 'warp'").run();
    mk(env, "other", 40, { faction: 4 });
    mk(env, "elsewhere", 90, { faction: 2 });
    const page = await (await get(env, cl, "warp", "/ranks")).text();
    assert.match(page, /par\n<a href="[^"]*fol-ecume[^"]*\/hq" target="_blank">L&#39;armée de Fol-ecume<\/a>/);
    assert.ok(page.includes("&lt;h2&gt;Faction de fol-ecume&lt;/h2&gt;"));
    assert.ok(page.includes('class="faction faction4"'));
    const l = lines(page);
    assert.deepEqual(l.map((x) => x.host), ["fol-ecume", "other", "warp"]);
    assert.equal(l[0]!.power, 114); // 20+18+...+10 levels: 6 troopers of the roster
    // the faction army itself ranks the same pool, never itself as a recruit
    const f = ranking(env.db, armyByHost(env.db, "fol-ecume")!.id);
    assert.deepEqual(f.rows.map((r) => r.host), ["other", "warp"]);
    assert.equal(f.self, null);
  });

  test(`[${mode}] ranks: a deleted recruiter sends its recruits to their faction pool (ON DELETE SET NULL)`, async () => {
    const env = setup(mode);
    mk(env, "boss", 60, { faction: 4 });
    mk(env, "kid", 40, { recruiter: "boss", faction: 4 });
    mk(env, "other", 30, { faction: 4 });
    env.db.prepare("DELETE FROM armies WHERE host = 'boss'").run();
    const kid = armyByHost(env.db, "kid")!;
    assert.equal(kid.recruiterId, null);
    const r = ranking(env.db, kid.id);
    assert.equal(r.recruiter.host, "fol-ecume");
    assert.deepEqual(r.rows.map((x) => x.host), ["kid", "other"]);
  });

  test(`[${mode}] ranks: a faction that is not seeded is described by its roster`, async () => {
    const env = setup(mode);
    const cl = env.client("1.1.1.1");
    assert.equal((await create(env, cl, "Warp")).status, 302);
    env.db.prepare("UPDATE armies SET faction = 4 WHERE host = 'warp'").run();
    const r = ranking(env.db, armyByHost(env.db, "warp")!.id);
    assert.equal(r.recruiter.id, null);
    assert.equal(r.recruiter.size, FACTIONS.find((f) => f.id === 4)!.troopers.length);
    assert.equal(r.recruiter.power, 114);
    assert.deepEqual(r.rows.map((x) => x.host), ["warp"]);
  });

  test(`[${mode}] ranks: a protected army seen without a session shows the password form and no menu`, async () => {
    const env = setup(mode);
    mk(env, "boss", 60, { password: "secret" });
    const page = await (await get(env, env.client("3.3.3.3"), "boss", "/ranks")).text();
    assert.ok(page.includes('class="insertpass"') && page.includes('name="login" value="boss"'));
    assert.ok(!page.includes('class="but b1"') && !page.includes("Quartier Général"));
    assert.ok(page.includes('<div class="ranks">'));
    // fr/ranks.html: the troopers grid and its script, the clear, then the password form
    assert.ok(page.includes("swf_tr_view") && page.indexOf("swf_tr_view") < page.indexOf("insertpass"));
    assert.match(page, /<\/script><\/div>\n<div class="clear"><\/div>\n\n\n\n<div class="insertpass">/);
  });

  test(`[${mode}] ranks: the owner gets the menu with « Quartier Général »`, async () => {
    const env = setup(mode);
    const cl = env.client("1.1.1.1");
    assert.equal((await create(env, cl, "Warp")).status, 302);
    const page = await (await get(env, cl, "warp", "/ranks")).text();
    assert.ok(page.includes("swf_tr_view") && page.includes('class="but b1"') && page.includes(">Quartier Général</a>"));
    assert.ok(!page.includes("insertpass"));
  });

  test(`[${mode}] ranks: a stranger on an open army gets the troopers grid and no menu`, async () => {
    const env = setup(mode);
    mk(env, "boss", 60);
    const page = await (await get(env, env.client("3.3.3.3"), "boss", "/ranks")).text();
    assert.ok(page.includes("swf_tr_view") && page.includes('<div class="ranks">'));
    assert.ok(!page.includes('class="but b1"') && !page.includes("Quartier Général") && !page.includes("insertpass"));
  });

  test(`[${mode}] ranks: unknown army is a 404; /global-ranks redirects to /ranks`, async () => {
    const env = setup(mode);
    assert.equal((await get(env, env.client(), "nobody", "/ranks")).status, 404);
    assert.equal((await env.client().req("/ranks")).status, 404);
    const root = await env.client().req("/global-ranks");
    assert.equal(root.status, 301);
    assert.equal(root.headers.get("location"), "/ranks");
    mk(env, "boss", 60);
    const r = await get(env, env.client(), "boss", "/global-ranks");
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), mode === "path" ? "/a/boss/ranks" : "http://boss.lvh.me:8080/ranks");
  });

  test(`[${mode}] ranks: hostile names are escaped`, async () => {
    const env = setup(mode);
    mk(env, "boss", 60, { name: `<script>x</script>"'&` });
    mk(env, "kid", 40, { recruiter: "boss", name: `<img src=x onerror=alert(1)>` });
    const page = await (await get(env, env.client(), "kid", "/ranks")).text();
    assert.ok(!page.includes("<script>x") && !page.includes("<img src=x"));
    assert.ok(page.includes("&lt;script&gt;x&lt;/script&gt;&quot;&#39;&amp;") && page.includes("&lt;img src=x onerror=alert(1)&gt;"));
  });

  test(`[${mode}] menu: entries appear with recruits, troopers and power; /choice below 5 troopers goes to the HQ`, async () => {
    const env = setup(mode);
    const cl = env.client("1.1.1.1");
    assert.equal((await create(env, cl, "Warp")).status, 302);
    const hq = async (): Promise<string> => await (await get(env, cl, "warp", "/hq")).text();
    let h = await hq();
    for (const t of ["Historique", "Gérer mon armée", "Hiérarchie"]) assert.ok(!h.includes(`>${t}</a>`), t);
    const choice = await get(env, cl, "warp", "/choice");
    assert.equal(choice.status, 302);
    assert.equal(choice.headers.get("location"), mode === "path" ? "/a/warp/hq" : "http://warp.lvh.me:8080/hq");
    const id = armyByHost(env.db, "warp")!.id;
    env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(new Array(15).fill(0)), id);
    h = await hq();
    assert.ok(h.includes(">Hiérarchie</a>"));
    mk(env, "kid", 40, { recruiter: "warp" }); // pending recruit
    h = await hq();
    assert.ok(h.includes(">Historique</a>"));
  });
}
