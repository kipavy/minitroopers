// Administration CLI: `npm run admin -- <command> [options]` (same DATA_DIR as the server; safe while it runs).
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { FACTIONS, host as hostOf } from "@mt/game";
import { loadConfig, resolveDataDir } from "../config.ts";
import { openDb } from "../db.ts";
import { hashPassword } from "../password.ts";
import { addCredits, armyByHost, armySummaries, insertArmy } from "../repo.ts";
import { isValidHost } from "../urls.ts";
import { checkArmyName } from "../validate.ts";
import { armyTitle } from "../views/army.ts";
import { SpecError, buildTroopers } from "./army.ts";
import { seedFactions } from "./factions.ts";

const USAGE = `Usage : npm run admin -- <commande> [options]

  seed-factions
      Crée les armées de faction absentes de la base (sans effet si elles y sont déjà).
  create-army --name <nom> --troopers <json | @fichier.json> [--part 0-5] [--faction 0-5] [--credits N] [--password P]
      Crée une armée complète. Mot de passe : --password P, ou la variable MT_ARMY_PASSWORD (absente de ps et de
      l'historique) ; jamais vide. troopers : [{ "seed": 123, "name": "Nom", "skills": ["SMART", 12] }, ...]
      ("skills" : compétence choisie à chaque montée de niveau, parmi celles que le jeu propose ;
       ou "choices" : indices bruts des options). Voir apps/server/README.md.
  give-credits --army <nom ou hôte> --amount <N>
      Ajoute N crédits (N négatif : en retire, jamais sous 0).
  list
      Liste les armées.

DATA_DIR (défaut var/) désigne la base, comme pour le serveur.`;

class UsageError extends Error {}

const int = (v: string | undefined, what: string, min: number, max: number, dflt?: number): number => {
  if (v === undefined) {
    if (dflt === undefined) throw new UsageError(`--${what} est obligatoire`);
    return dflt;
  }
  if (!/^-?[0-9]{1,10}$/.test(v) || Number(v) < min || Number(v) > max) throw new UsageError(`--${what} : un entier entre ${min} et ${max}`);
  return Number(v);
};

function run(argv: string[]): string {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: "string" },
      troopers: { type: "string" },
      part: { type: "string" },
      faction: { type: "string" },
      credits: { type: "string" },
      password: { type: "string" },
      army: { type: "string" },
      amount: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const cmd = positionals[0];
  if (values.help || cmd === undefined || cmd === "help") return USAGE;
  if (!["seed-factions", "create-army", "give-credits", "list"].includes(cmd) || positionals.length > 1) throw new UsageError(`commande inconnue : ${positionals.join(" ")}`);

  const cfg = loadConfig(process.env);
  const dataDir = resolveDataDir(cfg.dataDir);
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, "minitroopers.db"));
  try {
    if (cmd === "seed-factions") {
      const r = seedFactions(db, Date.now());
      return `Factions créées : ${r.created.join(", ") || "aucune"}\nDéjà présentes : ${r.existing.join(", ") || "aucune"}`;
    }

    if (cmd === "list") {
      const rows = armySummaries(db);
      if (rows.length === 0) return "Aucune armée.";
      return rows
        .map(({ army: a, troopers, power }) =>
          [a.id, a.host, armyTitle(a.name, a.part), `faction ${a.faction}`, `${a.credits} crédits`, `${troopers} troopers`, `puissance ${power}`, a.isFaction ? "faction" : "", a.passwordHash ? "protégée" : ""]
            .filter((x) => x !== "")
            .join("\t"),
        )
        .join("\n");
    }

    if (cmd === "give-credits") {
      if (values.army === undefined) throw new UsageError("--army est obligatoire");
      const amount = int(values.amount, "amount", -1_000_000, 1_000_000);
      const h = hostOf(values.army.slice(0, 100));
      const a = isValidHost(h) ? armyByHost(db, h) : null;
      if (!a) throw new UsageError(`armée introuvable : ${values.army}`);
      return `${a.host} : ${addCredits(db, a.id, amount)} crédits`;
    }

    // create-army
    if (values.name === undefined) throw new UsageError("--name est obligatoire");
    if (values.troopers === undefined) throw new UsageError("--troopers est obligatoire");
    const part = String(int(values.part, "part", 0, 5, 0));
    const v = checkArmyName(values.name, part);
    if (!v.ok) throw new UsageError(`--name : ${v.error}`);
    const faction = int(values.faction, "faction", 0, 1_000, 0);
    if (!FACTIONS.some((f) => f.id === faction)) throw new UsageError(`--faction : une des factions ${FACTIONS.map((f) => f.id).join(", ")}`);
    const json = values.troopers.startsWith("@") ? readFileSync(values.troopers.slice(1), "utf8") : values.troopers;
    const troopers = buildTroopers(json);
    const envPass = process.env.MT_ARMY_PASSWORD;
    if (values.password !== undefined && envPass !== undefined) throw new UsageError("--password et MT_ARMY_PASSWORD : un seul des deux");
    if (values.password === "") throw new UsageError("--password : le mot de passe ne peut pas être vide");
    if (envPass === "") throw new UsageError("MT_ARMY_PASSWORD : le mot de passe ne peut pas être vide");
    const password = values.password ?? envPass;
    const army = insertArmy(db, {
      host: v.host,
      name: v.name,
      part: v.part,
      faction,
      credits: int(values.credits, "credits", 0, 1_000_000, 0),
      isFaction: false,
      passwordHash: password !== undefined ? hashPassword(password) : null,
      now: Date.now(),
      troopers,
    });
    if (!army) throw new UsageError(`Ce nom est déjà pris : ${v.host}`);
    return `Armée créée : ${army.host} (id ${army.id}, ${troopers.length} troopers, niveaux ${troopers.map((t) => t.choices.length + 1).join(", ")})`;
  } finally {
    db.close();
  }
}

try {
  console.log(run(process.argv.slice(2)));
} catch (e) {
  if (e instanceof UsageError || e instanceof SpecError || (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
    console.error(`Erreur : ${(e as Error).message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
