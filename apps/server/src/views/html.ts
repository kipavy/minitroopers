/** Minimal HTML templating: every interpolation is escaped unless wrapped with raw()/produced by html``. */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export const raw = (s: string): Html => new Html(s);

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"));
}

/**
 * Body of a single-quoted JS string inside a double-quoted inline handler (`onmouseover="_.showTip('id','…')"`):
 * `\`, `'` and line breaks escaped for JS first, then `&<>"` for HTML. Escaping `'` for HTML only (`&#39;`) is not
 * enough: the browser decodes the attribute before running it, and the bare `'` ends the JS string.
 */
export function jsq(s: string): Html {
  const js = s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n");
  return raw(js.replace(/[&<>"]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;")));
}

export type Value = Html | string | number | bigint | boolean | null | undefined | readonly Value[];

function render(v: Value): string {
  if (v instanceof Html) return v.value;
  if (v === null || v === undefined || v === false || v === true) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += render(values[i]!) + strings[i + 1]!;
  return new Html(out);
}
