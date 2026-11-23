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
