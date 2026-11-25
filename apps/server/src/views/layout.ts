import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { esc, html, Html, raw } from "./html.ts";

/**
 * Tooltip attributes (`onmouseover`/`onmouseout`) with the markup of the original pages
 * (`mt.js.Tip.show(this,'<div class=\'tiptop\'>…')`). A string body is text (escaped); pass an Html for markup.
 */
export function tip(title: string, body: Html | string): Html {
  return tipBox(`<h1>${esc(title)}</h1>${body instanceof Html ? body.value : esc(body)}`);
}

/** Tooltip whose whole content is one `<h2>` line (the faction cell of the ranking: `<h2>Faction de fol-ecume</h2>`). */
export function tipH2(text: string): Html {
  return tipBox(`<h2>${esc(text)}</h2>`);
}

function tipBox(content: string): Html {
  const inner =
    `<div class='tiptop'><div class='tipbottom'><div class='tipbg'><div class='tipcontent'>` +
    `<img src='/img/pixel.gif' class='pixel' />${content}</div></div></div>`;
  const js = inner.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n");
  return raw(`onmouseover="mt.js.Tip.show(this,'${esc(js)}')" onmouseout="mt.js.Tip.hide()"`);
}

export interface LayoutOpts {
  /** Page title text (escaped); the document title is "MiniTroopers - <title>", or just "MiniTroopers" when null (battle pages). */
  title: string | null;
  content: Html;
  /** Current army host (logo link; footer link to the password page). */
  host?: string | null;
  /**
   * The army has a password: the footer shows "Modifier mon pass" (fr/hq.html, ranks.html…), absent for an unprotected
   * army (add.html, b_opp.html, protect.html).
   */
  pass?: boolean;
  /** Extra class on <body> (the original uses e.g. "hideSwf"). */
  bodyClass?: string;
  /** Mobile viewport meta and the `mtm` body class of the narrow-screen rules (extras.css). Default true. */
  viewport?: boolean;
  /** Extra stylesheets after style.css (local paths). */
  css?: readonly string[];
  /** Link preview (Open Graph / Twitter card tags), battle pages only. Plain text, escaped here. */
  og?: OgMeta;
}

export interface OgMeta {
  title: string;
  description: string;
  /** Absolute canonical URL of the page. */
  url: string;
  /** Absolute URL of a 1200x630 JPEG. */
  image: string;
  imageAlt: string;
}

const ogTags = (o: OgMeta): Html => html`<meta name="theme-color" content="#d4a244"/>
<meta property="og:site_name" content="MiniTroopers"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${o.title}"/>
<meta property="og:description" content="${o.description}"/>
<meta property="og:url" content="${o.url}"/>
<meta property="og:image" content="${o.image}"/>
<meta property="og:image:type" content="image/jpeg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="${o.imageAlt}"/>
<meta name="twitter:card" content="summary_large_image"/>
`;

/**
 * Common frame of every page, from $EX/html/fr/hq-levelup.html (ptop … dbottom, .copy). The Braziball promo,
 * the "Plus de jeux" ad carousel and Google Analytics are not reproduced. Assets are served from the same origin;
 * swfobject.js is replaced by embed.js (Ruffle) so the original inline scripts keep calling swfobject.embedSWF.
 */
export function layout(cfg: Config, o: LayoutOpts): Html {
  const viewport = o.viewport ?? true;
  const cls = [o.bodyClass, viewport ? "mtm" : ""].filter(Boolean).join(" ");
  const bodyAttr = cls ? raw(` class="${esc(cls)}"`) : "";
  const protect = o.host && o.pass ? html`<a href="${armyUrl(cfg, o.host, "/protect")}">Modifier mon pass</a> · ` : "";
  return html`<!DOCTYPE html>
<html><head><meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/>
${o.title === null ? html`<title>MiniTroopers</title>` : html`<title>MiniTroopers
-
${o.title}</title>`}
<meta name="description" content="Ils sont petits, ils sont brutaux, ils sont nombreux, et ...ils sont sous tes ordres ! Constitue l'armée la plus puissante avec tes potes ! Choisis les sets d'armes et de compétences les plus détonantes ! Et surtout... Montre au monde entier qui commande ici !"/>
${o.og ? ogTags(o.og) : ""}${viewport ? html`<meta name="viewport" content="width=device-width, initial-scale=1"/>
` : ""}<link rel="stylesheet" type="text/css" href="/css/style.css?v=5"/>
<link rel="stylesheet" type="text/css" href="/css/extras.css?v=34"/>
${(o.css ?? []).map((href) => html`<link rel="stylesheet" type="text/css" href="${href}"/>
`)}
<script type="text/javascript" src="/js/jquery.min.js"></script>
<script type="text/javascript" src="/ruffle/ruffle.js"></script>
<script type="text/javascript" src="/js/embed.js"></script>
<script type="text/javascript" src="/js/app.js?v=2"></script>
<script type="text/javascript" src="/js/touch.js?v=2"></script>
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
<div class="art_mouse"></div>
<div class="dbg"><div class="indust"></div></div>
</div>
<div class="copy">${protect}(c) Killian Pavy · <a href="https://github.com/kipavy/minitroopers" target="_blank" rel="noopener">GitHub</a></div></div></div>
</body></html>`;
}
