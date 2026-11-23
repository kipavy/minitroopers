import { Data } from "@mt/engine";
import tips from "../../data/tips.fr.json" with { type: "json" };
import { esc, raw, type Html } from "./html.ts";
import { tip } from "./layout.ts";

const COLS = 20; // skills.png: 20 columns of 30px cells, cell index = skill id
const CELL = 30;
const TIPS: Readonly<Record<string, { title: string; body: string }>> = tips;

/** CSS `background` of a skill icon (sprite /img/skills.png), from the skill id. */
export function skillIconStyle(skill: number): string {
  return `background : url('/img/skills.png') -${(skill % COLS) * CELL}px -${Math.floor(skill / COLS) * CELL}px`;
}

/**
 * Tooltip attributes of a skill/weapon icon. Text comes from the original pages (data/tips.fr.json, extracted
 * by scripts/extract-tips.mjs); `{name}` stands for the trooper's name, escaped here. A skill whose tooltip was
 * never archived falls back to its French name alone.
 */
export function skillTip(skill: number, trooperName: string): Html {
  const t = TIPS[String(skill)];
  if (!t) return tip(Data.skillRow(skill).name, "");
  const body = t.body.replaceAll("{name}", esc(trooperName));
  return tip(t.title, raw(`<div class="s">${body}</div>`));
}
