import { test } from "node:test";
import assert from "node:assert/strict";
import { armyByHost } from "../src/repo.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const get = (env: Env, cl: Client, host: string, p: string): Promise<Response> => {
  const at = env.at(host, p);
  return cl.req(at.url, { host: at.host });
};
const post = (env: Env, cl: Client, host: string, form: Record<string, string>, query = "?submit=1"): Promise<Response> => {
  const at = env.at(host, "/protect" + query);
  return cl.req(at.url, { host: at.host, form });
};
async function owner(env: Env, name = "Boss") {
  const cl = env.client("1.1.1.1");
  assert.equal((await create(env, cl, name)).status, 302);
  return cl;
}
const hash = (env: Env): string | null => armyByHost(env.db, "boss")!.passwordHash;
async function protectIt(env: Env, cl: Client, pw = "secret") {
  const res = await post(env, cl, "boss", { chk: cl.key!, mid: "", pass: pw, passconf: pw });
  assert.equal(res.status, 303);
}
const login = (env: Env, cl: Client, pass: string): Promise<Response> => cl.req("/login", { host: "localhost", form: { login: "boss", pass } });

for (const mode of MODES) {
  test(`[${mode}] create form (protect.html) then password works for /login`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    const page = await (await get(env, a, "boss", "/protect")).text();
    assert.ok(page.includes("Créer un mot de passe pour ton armée empêchera que d'autres joueurs l'utilisent sans ton accord."));
    assert.ok(page.includes("Tape un mot de passe de ton choix ci-dessous :"));
    assert.ok(page.includes('name="pass"') && page.includes('name="passconf"') && !page.includes('name="newpass"'));
    assert.ok(page.includes(`name="chk" value="${a.key}"`));
    assert.ok(!page.includes("depuis l'ordinateur que tu utilises actuellement"));
    assert.ok(page.includes("Protéger mon armée"));
    await protectIt(env, a);
    assert.notEqual(hash(env), null);
    assert.notEqual(hash(env), "secret");
    const hq = await (await get(env, a, "boss", "/hq")).text();
    assert.ok(hq.includes("Ton mot de passe a été enregistré."));
    assert.ok(!(await (await get(env, a, "boss", "/hq")).text()).includes("Ton mot de passe a été enregistré."));
    const other = env.client("2.2.2.2");
    assert.equal((await login(env, other, "nope")).status, 403);
    const ok = await login(env, other, "secret");
    assert.equal(ok.status, 303);
    assert.equal((await get(env, other, "boss", "/hq")).status, 200);
    // protected: change form + footer link, no create menu entry
    const p2 = await (await get(env, a, "boss", "/protect")).text();
    assert.ok(p2.includes("Remplis les champs ci-dessous pour changer ton mot de passe :"));
    assert.ok(p2.includes('name="newpass"'));
    assert.ok(p2.includes("Modifier mon pass"));
    assert.ok(!p2.includes("Protége ton armée avec un mot de passe !"));
  });

  test(`[${mode}] mismatch, empty, too long: message and nothing stored`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    let res = await post(env, a, "boss", { chk: a.key!, pass: "a", passconf: "b" });
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes("Les deux mots de passe sont différents."));
    res = await post(env, a, "boss", { chk: a.key!, pass: "", passconf: "" });
    assert.ok((await res.text()).includes("Mot de passe vide."));
    res = await post(env, a, "boss", { chk: a.key!, pass: "x".repeat(101), passconf: "x".repeat(101) });
    assert.equal(res.status, 400);
    assert.equal(hash(env), null);
    await protectIt(env, a, "x".repeat(100));
    assert.notEqual(hash(env), null);
  });

  test(`[${mode}] change: wrong old password, then right one; other sessions are signed out`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await protectIt(env, a);
    const b = env.client("2.2.2.2");
    await login(env, b, "secret");
    assert.equal((await get(env, b, "boss", "/protect")).status, 200);
    const before = hash(env);
    let res = await post(env, a, "boss", { chk: a.key!, pass: "wrong", newpass: "n1", passconf: "n1" });
    assert.equal(res.status, 403);
    assert.ok((await res.text()).includes("Ancien mot de passe incorrect."));
    assert.equal(hash(env), before);
    res = await post(env, a, "boss", { chk: a.key!, pass: "secret", newpass: "n1", passconf: "zz" });
    assert.ok((await res.text()).includes("Les deux mots de passe sont différents."));
    res = await post(env, a, "boss", { chk: a.key!, pass: "secret", newpass: "", passconf: "" });
    assert.ok((await res.text()).includes("Mot de passe vide."));
    assert.equal(hash(env), before);
    res = await post(env, a, "boss", { chk: a.key!, pass: "secret", newpass: "n1", passconf: "n1" });
    assert.equal(res.status, 303);
    assert.notEqual(hash(env), before);
    // b is signed out (redirected to the locked HQ / password form), a is not
    const hb = await get(env, b, "boss", "/protect");
    assert.equal(hb.status, 302);
    assert.equal((await get(env, a, "boss", "/protect")).status, 200);
    const c = env.client("3.3.3.3");
    assert.equal((await login(env, c, "secret")).status, 403);
    assert.equal((await login(env, c, "n1")).status, 303);
  });

  test(`[${mode}] attempt limit shared with /login: 11th refused`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await protectIt(env, a);
    for (let i = 0; i < 10; i++) {
      const r = await post(env, a, "boss", { chk: a.key!, pass: "wrong", newpass: "n", passconf: "n" });
      assert.equal(r.status, 403);
    }
    const r = await post(env, a, "boss", { chk: a.key!, pass: "secret", newpass: "n", passconf: "n" });
    assert.equal(r.status, 429);
    // /login from the same IP for that army is throttled by the same counter
    assert.equal((await login(env, env.client("1.1.1.1"), "secret")).status, 429);
    env.clock.t += 601_000;
    assert.equal((await post(env, a, "boss", { chk: a.key!, pass: "secret", newpass: "n", passconf: "n" })).status, 303);
  });

  test(`[${mode}] another computer (cid) cannot create the password; legacy NULL cid can`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    const b = env.client("2.2.2.2");
    await login(env, b, ""); // army is open: anyone typing the name gets in
    assert.ok(b.cookies.ssid);
    const page = await (await get(env, b, "boss", "/protect")).text();
    assert.ok(page.includes("depuis l'ordinateur que tu utilises actuellement"));
    assert.ok(page.includes("Tu pourras le faire que depuis l'ordinateur t'ayant servi à créer cette armée !"));
    assert.ok(page.includes('<a href="') && page.includes(">Retour</a>"));
    assert.ok(!page.includes('name="passconf"'));
    const res = await post(env, b, "boss", { chk: b.key!, pass: "evil", passconf: "evil" });
    assert.equal(res.status, 403);
    assert.equal(hash(env), null);
    env.db.prepare("UPDATE armies SET created_cid = NULL").run();
    assert.ok((await (await get(env, b, "boss", "/protect")).text()).includes('name="passconf"'));
    await protectIt(env, b);
    assert.notEqual(hash(env), null);
    void a;
  });

  test(`[${mode}] POST without chk, with a wrong chk, without submit, or cross-origin has no effect`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    assert.equal((await post(env, a, "boss", { pass: "x", passconf: "x" })).status, 403);
    assert.equal((await post(env, a, "boss", { chk: "AAAAAA", pass: "x", passconf: "x" })).status, 403);
    assert.equal((await post(env, a, "boss", { chk: a.key!, pass: "x", passconf: "x" }, "")).status, 403);
    const at = env.at("boss", "/protect?submit=1");
    const cookie = Object.entries(a.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await env.app.request(at.url, {
      method: "POST",
      headers: { host: at.host, cookie, origin: "http://evil.example", "cf-connecting-ip": "1.1.1.1", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chk: a.key!, pass: "x", passconf: "x" }).toString(),
    });
    assert.equal(res.status, 403);
    // a stranger (not the owner) is redirected, nothing stored
    const s = env.client("5.5.5.5");
    const r = await post(env, s, "boss", { chk: "AAAAAA", pass: "x", passconf: "x" });
    assert.ok(r.status === 302 || r.status === 403);
    assert.equal(hash(env), null);
  });

  test(`[${mode}] /protect is no longer a "bientôt" page`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    assert.ok(!(await (await get(env, a, "boss", "/protect")).text()).includes("Bientôt disponible"));
  });
}
