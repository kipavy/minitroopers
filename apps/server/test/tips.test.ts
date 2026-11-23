import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillIconStyle, skillTip } from "../src/views/tips.ts";
import { jsStr } from "../src/views/swf.ts";

const DATA = new URL("../data/tips.fr.json", import.meta.url);

test("tips.fr.json holds the archived FR tooltips by skill id", () => {
  const tips = JSON.parse(readFileSync(DATA, "utf8")) as Record<string, { title: string; body: string }>;
  assert.ok(Object.keys(tips).length >= 20);
  assert.equal(tips["8"]!.title, "Pistolet");
  assert.match(tips["8"]!.body, /<b>Dégâts<\/b> : 2-3/);
  assert.equal(tips["137"]!.title, "Coureur en zigzag"); // from the level-up page
  assert.ok(tips["137"]!.body.includes("<i>{name}</i>"));
});

const SRC = fileURLToPath(new URL("../../../docs/research/recon/assets/extra/site-elements/html/fr", import.meta.url));

test("the extractor reproduces data/tips.fr.json", { skip: !existsSync(SRC) && "archived pages not available" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tips-"));
  try {
    const out = join(dir, "tips.json");
    execFileSync("node", [fileURLToPath(new URL("../scripts/extract-tips.mjs", import.meta.url)), SRC, out], { stdio: "pipe" });
    assert.equal(readFileSync(out, "utf8"), readFileSync(DATA, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
