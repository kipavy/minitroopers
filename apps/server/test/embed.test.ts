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

// Ruffle runs navigateToURL by submitting a GET form whose action is the URL: a GET form replaces the action's query
// with its (here empty) fields, so `/save?chk=K;c=-3:-1` became `/save?`. Flash kept the query: embed.js does too.
test("embed.js: a field-less GET form (Ruffle's navigateToURL) navigates to its whole action URL, query kept", () => {
  const native: any[] = [];
  const assigned: string[] = [];
  const opened: [string, string][] = [];
  class HTMLFormElement {
    method = "get";
    target = "";
    elements = { length: 0 };
    action: string;
    constructor(action: string) {
      this.action = action;
    }
    submit() {
      native.push(this);
    }
  }
  const win: any = { HTMLFormElement, location: { assign: (u: string) => assigned.push(u) }, open: (u: string, t: string) => opened.push([u, t]), document: {} };
  win.window = win;
  vm.runInNewContext(readFileSync(new URL("../public/js/embed.js", import.meta.url), "utf8"), win);
  new HTMLFormElement("http://h/a/boss/save?chk=K;c=-3:-1:0").submit();
  assert.deepEqual(assigned, ["http://h/a/boss/save?chk=K;c=-3:-1:0"]);
  const self = new HTMLFormElement("http://h/hq");
  self.target = "_self";
  self.submit();
  assert.deepEqual(assigned, ["http://h/a/boss/save?chk=K;c=-3:-1:0", "http://h/hq"]);
  const blank = new HTMLFormElement("http://motion-twin.fr/");
  blank.target = "_blank";
  blank.submit();
  assert.deepEqual(opened, [["http://motion-twin.fr/", "_blank"]]);
  // forms with fields, and POST forms, are submitted natively
  const post = new HTMLFormElement("http://h/b/battle");
  post.method = "post";
  post.submit();
  const withFields = new HTMLFormElement("http://h/x?a=1");
  withFields.elements = { length: 2 };
  withFields.submit();
  assert.deepEqual(native, [post, withFields]);
  assert.equal(assigned.length, 2);
});
