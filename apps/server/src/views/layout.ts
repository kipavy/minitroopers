import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { esc, html, Html, raw } from "./html.ts";

/**
 * Tooltip attributes (`onmouseover`/`onmouseout`) with the markup of the original pages
 * (`mt.js.Tip.show(this,'<div class=\'tiptop\'>…')`). A string body is text (escaped); pass an Html for markup.
 */
export function tip(title: string, body: Html | string): Html {
  const inner =
    `<div class='tiptop'><div class='tipbottom'><div class='tipbg'><div class='tipcontent'>` +
    `<img src='/img/pixel.gif' class='pixel' /><h1>${esc(title)}</h1>${body instanceof Html ? body.value : esc(body)}</div></div></div>`;
  const js = inner.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n");
  return raw(`onmouseover="mt.js.Tip.show(this,'${esc(js)}')" onmouseout="mt.js.Tip.hide()"`);
}

export interface LayoutOpts {
  /** Page title text (escaped); the document title is "MiniTroopers - <title>", or just "MiniTroopers" when null (battle pages). */
  title: string | null;
  content: Html;
  /** Current army host, for the footer link to the password page. */
  host?: string | null;
  /** Extra class on <body> (the original uses e.g. "hideSwf"). */
  bodyClass?: string;
}

/**
 * Common frame of every page, from $EX/html/fr/hq-levelup.html (ptop … dbottom, .copy). The Braziball promo,
 * the "Plus de jeux" ad carousel and Google Analytics are not reproduced. Assets are served from the same origin;
 * swfobject.js is replaced by embed.js (Ruffle) so the original inline scripts keep calling swfobject.embedSWF.
 */
export function layout(cfg: Config, o: LayoutOpts): Html {
  const bodyAttr = o.bodyClass ? raw(` class="${esc(o.bodyClass)}"`) : "";
  const protect = o.host ? html` <a href="${armyUrl(cfg, o.host, "/protect")}">Modifier mon pass</a> ·` : raw(" ·");
  return html`<!DOCTYPE html>
<html><head><meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/>
${o.title === null ? html`<title>MiniTroopers</title>` : html`<title>MiniTroopers
-
${o.title}</title>`}
<meta name="description" content="Ils sont petits, ils sont brutaux, ils sont nombreux, et ...ils sont sous tes ordres ! Constitue l'armée la plus puissante avec tes potes ! Choisis les sets d'armes et de compétences les plus détonantes ! Et surtout... Montre au monde entier qui commande ici !"/>
<link rel="stylesheet" type="text/css" href="/css/style.css?v=5"/>
<script type="text/javascript" src="/js/jquery.min.js"></script>
<script type="text/javascript" src="/ruffle/ruffle.js"></script>
<script type="text/javascript" src="/js/embed.js"></script>
<script type="text/javascript" src="/js/app.js?v=2"></script>
</head>
<body${bodyAttr}>
<div class="ptop"></div>
<div class="bottomsite"><div class="site"><div class="sp"></div>
<div class="pleft"></div>
<a class="logo" href="${o.host ? armyUrl(cfg, o.host, "/hq") : "/"}"></a>
<div class="arthead"></div>
<div class="camera"></div>
<div class="ptopleft"></div>
<div class="pright"></div>
<div class="frame"><div class="ptopsite"><div id="content">
${o.content}
</div></div></div>
<div class="dbottom"><div class="pbottomleft"></div>
<div class="mt"><a href="http://motion-twin.fr/" target="_blank"><img src="/img/pixel.gif"/></a></div>
<div class="art_mouse"></div>
</div>
<div class="copy">${protect} (c)2011 Motion-Twin · Tous droits réservés</div></div></div>
</body></html>`;
}
