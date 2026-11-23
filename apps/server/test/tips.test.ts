import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillIconStyle, skillTip } from "../src/views/tips.ts";
import { jsStr } from "../src/views/swf.ts";

type Tips = Record<string, { title: string; body: string }>;
const DATA = new URL("../data/tips.fr.json", import.meta.url);
const script = (name: string): string => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));

test("tips.fr.json holds a FR tooltip for every skill, by skill id", () => {
  const tips = JSON.parse(readFileSync(DATA, "utf8")) as Tips;
  assert.equal(Object.keys(tips).length, 141);
  assert.equal(tips["8"]!.title, "Pistolet");
  assert.match(tips["8"]!.body, /<b>Dégâts<\/b> : 2-3/);
  assert.equal(tips["137"]!.title, "Coureur en zigzag"); // from the level-up page
  assert.ok(tips["137"]!.body.includes("<i>{name}</i>"));
  assert.equal(tips["24"]!.title, "Bazooka M1"); // weapon sheet never archived, built like Data.weaponInfo
  assert.ok(tips["107"]!.body.startsWith("+1$ par jour")); // "$" is money there, not the trooper's name
  assert.ok(!tips["140"]!.body.includes("FLY_TO")); // developer note replaced by our own text
  // No unreplaced name placeholder in the description part (quotes may hold money: "10$ que je lui fait…").
  for (const [id, t] of Object.entries(tips)) {
    assert.ok(t.title && t.body && !/undefined|null/.test(t.body), id);
    if (id !== "107") assert.ok(!t.body.split("<em>")[0]!.includes("$"), id);
  }
});

test("gen-tips.mjs regenerates data/tips.fr.json from the SWF", () => {
  const dir = mkdtempSync(join(tmpdir(), "tips-"));
  try {
    const out = join(dir, "tips.json");
    execFileSync("node", [script("gen-tips.mjs"), out], { stdio: "pipe" });
    assert.equal(readFileSync(out, "utf8"), readFileSync(DATA, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const SRC = fileURLToPath(new URL("../../../docs/research/recon/assets/extra/site-elements/html/fr", import.meta.url));

test("every tooltip archived from the original site is reproduced byte for byte", { skip: !existsSync(SRC) && "archived pages not available" }, () => {
  const archived = JSON.parse(execFileSync("node", [script("extract-tips.mjs"), SRC], { encoding: "utf8" })) as Tips;
  const tips = JSON.parse(readFileSync(DATA, "utf8")) as Tips;
  assert.equal(Object.keys(archived).length, 22);
  for (const [id, a] of Object.entries(archived)) assert.deepEqual(tips[id], a, `skill ${id}`);
});

test("skill icons: 20-column sprite of 30px cells indexed by skill id", () => {
  assert.equal(skillIconStyle(2), "background : url('/img/skills.png') -60px -0px");
  assert.equal(skillIconStyle(137), "background : url('/img/skills.png') -510px -180px");
  assert.equal(skillIconStyle(8), "background : url('/img/skills.png') -240px -0px");
});

test("skillTip fills the trooper name escaped; unknown skills fall back to their name", () => {
  const t = String(skillTip(137, `<b>"x'`));
  assert.ok(t.startsWith('onmouseover="mt.js.Tip.show(this,'));
  assert.ok(!t.includes("<b>"));
  assert.ok(t.includes("Coureur en zigzag"));
  assert.ok(t.includes("&amp;lt;b&amp;gt;"));
  assert.ok(String(skillTip(1, "x")).includes("Medecin"));
});

test("jsStr never emits a character that can end a script or a literal", () => {
  const s = jsStr(`</script><!--\u2028\u2029"'\\&`);
  assert.ok(!/[<>&\u2028\u2029]/.test(s));
  assert.equal(JSON.parse(s), `</script><!--\u2028\u2029"'\\&`);
});
