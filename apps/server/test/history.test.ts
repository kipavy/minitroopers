import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmedRecruitCount, confirmRecruits, pendingRecruits, recruitsOf, armyByHost } from "../src/repo.ts";
import { create, setup, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const get = (env: Env, cl: ReturnType<Env["client"]>, host: string, p: string): Promise<Response> => {
  const at = env.at(host, p);
  return cl.req(at.url, { host: at.host });
};
const credits = (env: Env, host: string): number => armyByHost(env.db, host)!.credits;
let ipN = 10;
async function recruit(env: Env, recruiter: string, name: string, cl = env.client(`9.9.9.${ipN++}`)) {
  const res = await create(env, cl, name, { recruit: recruiter });
  assert.equal(res.status, 302);
  return cl;
}
async function owner(env: Env, name = "Boss") {
  const cl = env.client("1.1.1.1");
  assert.equal((await create(env, cl, name)).status, 302);
  return cl;
}

for (const mode of MODES) {
  test(`[${mode}] a recruit shows "Nouvelle recrue disponible" at the HQ, credits unchanged; /history credits once`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    assert.equal(pendingRecruits(env.db, armyByHost(env.db, "boss")!.id), 1);
    const hq = await (await get(env, a, "boss", "/hq")).text();
    assert.ok(hq.includes('<li class="newchild"><a href="'));
    assert.ok(hq.includes('<img src="/img/newrecruit.gif"/> Nouvelle recrue disponible !'));
    assert.equal(credits(env, "boss"), 0);

    const res = await get(env, a, "boss", "/history");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.equal(credits(env, "boss"), 100);
    assert.match(page, /Tu\s+as\s+recruté\s+<strong>L&#39;armée[^<]*Fresh<\/strong>/);
    assert.match(page, /Gain\s+:\s+100\s+<img src="\/img\/token.png"\/>/);
    assert.ok(page.includes(`href="${mode === "path" ? "/a/fresh/hq" : "http://fresh.lvh.me:8080/hq"}"`));
    assert.match(page, /Tu\s+as\s+<strong>1<\/strong>\s+<img src="\/favicon.ico"\/>\s+recrues/);
    assert.ok(page.includes("Historique des Combats") && page.includes("Historique des Recrues"));
    assert.ok(!(await (await get(env, a, "boss", "/hq")).text()).includes("newchild"));

    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 100);
    assert.match(await (await get(env, a, "boss", "/hq")).text(), /Ta prochaine recrue te rapportera 50/);
  });

  test(`[${mode}] two simultaneous GET /history credit once`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    await Promise.all([get(env, a, "boss", "/history"), get(env, a, "boss", "/history")]);
    assert.equal(credits(env, "boss"), 100);
  });

  test(`[${mode}] 5 recruits confirmed at once pay 100+50+50+50+10`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) await recruit(env, "boss", n);
    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 260);
    assert.equal(confirmedRecruitCount(env.db, armyByHost(env.db, "boss")!.id), 5);
    const page = await (await get(env, a, "boss", "/history")).text();
    assert.match(page, /Tu\s+as\s+<strong>5<\/strong>/);
    assert.deepEqual([...page.matchAll(/Gain\s+:\s+(\d+)/g)].map((m) => Number(m[1])), [10, 50, 50, 50, 100]);
  });

  test(`[${mode}] a recruit created from the recruiter's own client pays 0`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    const same = env.client("9.9.9.99"); // another browser session carrying the recruiter's cid cookie
    same.cookies.cid = a.cookies.cid!;
    await recruit(env, "boss", "Self", same);
    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 0);
    assert.match(await (await get(env, a, "boss", "/history")).text(), /Gain\s+:\s+0\s/);
  });

  test(`[${mode}] /history of someone else's army redirects to its HQ and credits nothing`, async () => {
    const env = setup(mode);
    await owner(env);
    await recruit(env, "boss", "Fresh");
    const res = await get(env, env.client("4.4.4.4"), "boss", "/history");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/boss/hq" : "http://boss.lvh.me:8080/hq");
    assert.equal(credits(env, "boss"), 0);
    assert.equal(pendingRecruits(env.db, armyByHost(env.db, "boss")!.id), 1);
  });

  test(`[${mode}] hostile army names are escaped`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    env.db.prepare("UPDATE armies SET name = ? WHERE host = 'fresh'").run('<script>alert(1)</script>"x');
    const page = await (await get(env, a, "boss", "/history")).text();
    assert.ok(!page.includes("<script>alert(1)"));
    assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt;&quot;x"));
  });
}

test("confirmRecruits / recruitsOf: nothing pending credits nothing; list is newest first and limited", () => {
  const env = setup("path");
  const ins = env.db.prepare("INSERT INTO armies(host, name, credits, recruiter_id, created_at) VALUES (?,?,0,?,0)");
  const r = Number(ins.run("r", "R", null).lastInsertRowid);
  assert.deepEqual(confirmRecruits(env.db, r, 5, () => 7), { confirmed: 0, credited: 0 });
  for (const h of ["a", "b", "c"]) ins.run(h, h.toUpperCase(), r);
  assert.deepEqual(confirmRecruits(env.db, r, 5, (rank) => rank), { confirmed: 3, credited: 6 });
  assert.equal(credits(env, "r"), 6);
  assert.deepEqual(recruitsOf(env.db, r, 2).map((x) => [x.host, x.bounty]), [["c", 3], ["b", 2]]);
});
