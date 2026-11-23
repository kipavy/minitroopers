import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("embed.js maps swfobject.embedSWF to a Ruffle player, one per call", () => {
  const loaded: any[] = [];
  const replaced: any[] = [];
  const mkEl = (id?: string) => ({ id, className: "", style: {} as Record<string, string>, parentNode: { replaceChild: (n: any, o: any) => replaced.push([n, o]) }, load: (c: any) => loaded.push(c) });
  const targets: Record<string, any> = { swf_a: mkEl("swf_a"), swf_b: mkEl("swf_b") };
  const win: any = {
    RufflePlayer: { newest: () => ({ createPlayer: () => mkEl() }) },
    document: { getElementById: (i: string) => targets[i] ?? null },
  };
  win.window = win;
  vm.runInNewContext(readFileSync(new URL("../public/js/embed.js", import.meta.url), "utf8"), win);
  const params = { menu: false, flashvars: "data=abc&chk=1", scale: "noscale", allowScriptAccess: "always", bgcolor: "#F2DDB8", wmode: "transparent" };
  win.swfobject.embedSWF("/swf/client_fr_play.swf?v=2", "swf_a", 720, 440, "10.0.0", null, null, params, { id: "battle", class: "swf" });
  win.swfobject.embedSWF("/swf/mini.swf", "swf_b", 214, 216, "10.0.0", null, null, params, { id: "tr_view", class: "swf_transparent" });
  assert.equal(loaded.length, 2);
  assert.equal(replaced.length, 2);
  const c = loaded[0];
  assert.equal(c.url, "/swf/client_fr_play.swf?v=2");
  assert.equal(c.parameters, "data=abc&chk=1");
  assert.equal(c.autoplay, "on");
  assert.equal(c.splashScreen, false);
  assert.equal(c.unmuteOverlay, "hidden");
  assert.equal(c.contextMenu, "off");
  assert.equal(c.backgroundColor, "#F2DDB8");
  assert.equal(c.scale, "noscale");
  assert.equal(c.allowScriptAccess, true);
  assert.equal(c.wmode, "transparent");
  assert.equal(c.menu, false);
  assert.equal(replaced[0][0].id, "battle");
  assert.equal(replaced[0][0].style.width, "720px");
  assert.equal(replaced[1][0].id, "tr_view");
  assert.notEqual(replaced[0][0], replaced[1][0]);
});
