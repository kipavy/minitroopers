import { raw, type Html } from "./html.ts";

/** Local SWF files. The shipped client_fr_play.swf has the original `chk` check bypassed (recon §3.2). */
export const CLIENT_SWF = "/swf/client_fr_play.swf?v=6";
export const MINI_SWF = "/swf/mini.swf?v=2";
/** `gfx` of the battle data (ClientMode 0), like the original `…/swf/army.swf?v=2`. */
export const ARMY_SWF = "/swf/army.swf?v=2";

/**
 * JavaScript string literal safe inside an inline <script> (and any HTML text): JSON string with `<`, `>`, `&`,
 * U+2028/2029 written as \u escapes, so no content can close the script element or break the literal.
 */
export function jsStr(s: string): string {
  return jsJson(s);
}

/** Any JSON value as a JavaScript literal, escaped like jsStr. */
export function jsJson(v: unknown): string {
  return JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Embed of a client SWF as the original pages do it (`var swfp = {...}; swfobject.embedSWF(...)`, wrapped by embed.js).
 * `flashvars` is already the `data=…&chk=…` string from clientParams(); `id`/`objId` are trusted identifiers.
 * `opaque`: the battle embed of the original pages (no `wmode`, class `swf`).
 */
export function swfEmbed(o: { id: string; width: number; height: number; flashvars: string; objId: string; swf?: string; opaque?: boolean }): Html {
  const swf = o.swf ?? CLIENT_SWF;
  return raw(
    `<div id="${o.id}" class="swf"></div>\n<script type="text/javascript">var swfp = { menu : false, flashvars : ${jsStr(o.flashvars)}, scale : 'noscale', allowScriptAccess : 'always', bgcolor : '#F2DDB8'${o.opaque ? "" : " ,wmode : 'transparent'"} };\n` +
      `\tswfobject.embedSWF(${jsStr(swf)},${jsStr(o.id)},${o.width},${o.height},'10.0.0',null,null,swfp,{ id : ${jsStr(o.objId)}, 'class' : ${o.opaque ? "'swf'" : "'swf_transparent'"} })</script>`,
  );
}
