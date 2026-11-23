// Administration CLI: `npm run admin -- <command> [options]` (same DATA_DIR as the server; safe while it runs).
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { Rand, SKILLS, armyPower, describeTrooper, levelUpOptions } from "@mt/engine";
import { FACTIONS, MISSION_ATTEMPTS, RATS_MAX, battleAllowance, dayKey, host as hostOf, referralBounty, seedsOffering, trooperName } from "@mt/game";
import { loadConfig, resolveDataDir, type Config } from "../config.ts";
import { openDb } from "../db.ts";
import { hashPassword } from "../password.ts";
import {
  addCredits, armyByHost, armyById, armyFootprint, armySummaries, battlesCounted, battlesUsed, confirmRecruits, confirmedRecruitCount, deleteArmy, grantLevelUp,
  insertArmy, levelUpTo, missionDay, pendingRecruits, raidDay, renameArmy, resetDay, setArmyField, shopResets, setPassword, storedDeployOrder, troopersOf, trooperInput,
  type ArmyRow,
} from "../repo.ts";
import { isValidHost } from "../urls.ts";
import { checkArmyName } from "../validate.ts";
import { absoluteArmyUrl, armyTitle } from "../views/army.ts";
import { MAX_TROOPERS } from "../views/panel.ts";
import { SpecError, buildTroopers, label, skillId } from "./army.ts";
import { seedFactions } from "./factions.ts";

const USAGE = `Usage : npm run admin -- <commande> [options]

  seed-factions
      Crée les armées de faction absentes de la base (sans effet si elles y sont déjà).
  create-army --name <nom> --troopers <json | @fichier.json> [--part 0-5] [--faction 0-5] [--credits N] [--password P] [--rats N] [--force]
      Crée une armée complète. Mot de passe : --password P, ou la variable MT_ARMY_PASSWORD (absente de ps et de
      l'historique) ; jamais vide. troopers : [{ "seed": 123, "name": "Nom", "skills": ["SMART", 12] }, ...]
      ("skills" : compétence choisie à chaque montée de niveau, parmi celles que le jeu propose ;
       ou "choices" : indices bruts des options). Voir apps/server/README.md.
      --rats N : rats de la prochaine extermination (1-100, défaut 1) ; --force : remplace l'armée de même hôte (sauf faction).
  create-bro-army --name <nom> [--part 0-5] [--faction 0-5] [--count 12] [--rats 35] [--credits N] [--force]
      Armée « du frère » : count troopers (1-12) niveau 2 avec Malin, extermination avancée (rats), missions débloquées.
      Mot de passe : uniquement la variable MT_ARMY_PASSWORD (obligatoire, jamais vide).
  set-password --name <hôte>
      Pose (ou remplace) le mot de passe d'une armée : uniquement la variable MT_ARMY_PASSWORD (obligatoire, jamais
      vide). Déconnecte toutes ses sessions. Seule voie pour une armée sans ordinateur de création connu.
  give-credits --army <nom ou hôte> --amount <N>
      Ajoute N crédits (N négatif : en retire, jamais sous 0).
  list
      Liste les armées.
  show --army <nom ou hôte> [--day AAAA-MM-JJ]
      État complet d'une armée : crédits, mot de passe, missions, rats, recruteur, recrues, troopers (niveau,
      compétences), ordre de déploiement, et la journée (défaut : aujourd'hui, fuseau TZ_GAME) : batailles,
      mission, raid.
  reset-day --army <nom ou hôte> [--day AAAA-MM-JJ] [--what battles|mission|raid|shop|all]
      Rend les quotas d'une journée (défaut : aujourd'hui, tout) sans rien effacer : batailles (une journée
      complète de plus), mission (mêmes type et adversaire, essais rendus), raid (phase 1, recrues ressuscitées),
      boutique (nouvelles offres sur « Ajouter un trooper », un nouveau tirage à chaque appel).
      Les combats déjà joués restent visibles et les anciens liens d'action ne rejouent rien.
  set-credits --army <nom ou hôte> --amount <N>
      Fixe les crédits à N (N >= 0).
  set-rats --army <nom ou hôte> --rats <1-100>
      Rats de la prochaine extermination.
  set-faction --army <nom ou hôte> --faction <0-5 | rouge|orange|jaune|vert|bleu|violet>
      Faction, donc couleur de l'uniforme (aucun effet sur les combats ; les combats déjà joués gardent l'ancienne).
  unlock-missions --army <nom ou hôte> [--lock]
      Débloque les missions sans les faire payer (--lock : les verrouille à nouveau).
  rename --army <nom ou hôte> --name <nouveau nom>
      Renomme l'armée (mêmes règles qu'à la création, article conservé) ; refuse un hôte déjà pris. Les sessions
      restent ouvertes ; l'adresse de l'armée change avec son hôte (affichée).
  level-up --army <nom ou hôte> --slot <N> --skill <NOM | id>
      Une montée de niveau gratuite du trooper de l'emplacement N, avec cette compétence si le jeu la propose à ce
      niveau (sinon : liste des compétences proposées).
  confirm-recruits --army <nom ou hôte>
      Confirme les recrues en attente et crédite leurs primes, comme l'ouverture de la page Historique.
  delete-army --army <nom ou hôte> [--yes]
      Supprime l'armée (ses troopers et ses combats lancés ; ses défenses restent chez leurs attaquants).
      Sans --yes : affiche seulement ce qui serait supprimé (code de sortie 1).
  Les commandes ci-dessus qui modifient une armée refusent les armées de faction, sauf set-credits et
  confirm-recruits.
  backup --out <fichier>
      Copie cohérente de la base (VACUUM INTO), possible pendant que le serveur tourne. Refuse un fichier existant.
      Dans le conteneur Docker : chemin absolu sous /data (seul dossier accessible en écriture et conservé).

DATA_DIR (défaut var/) désigne la base, comme pour le serveur.`;

class UsageError extends Error {}
/** A command that only reports what it would do: printed on stdout, exit code 1. */
class DryRun extends Error {}

/** Uniform colour of each faction (backgrounds .faction0-5 of the original style.css). */
const FACTION_COLOURS = ["rouge", "orange", "jaune", "vert", "bleu", "violet"] as const;
const factionLabel = (f: number): string => `${f} (${FACTION_COLOURS[f] ?? "?"})`;
const EDITS = ["show", "reset-day", "set-credits", "set-rats", "set-faction", "unlock-missions", "rename", "level-up", "confirm-recruits", "delete-army"];
/** Edits allowed on a faction army (nothing that changes how it fights or what it is). */
const FACTION_OK = ["show", "set-credits", "confirm-recruits"];
const yesNo = (b: boolean): string => (b ? "oui" : "non");

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
      rats: { type: "string" },
      count: { type: "string" },
      force: { type: "boolean" },
      army: { type: "string" },
      amount: { type: "string" },
      out: { type: "string" },
      day: { type: "string" },
      what: { type: "string" },
      slot: { type: "string" },
      skill: { type: "string" },
      lock: { type: "boolean" },
      yes: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const cmd = positionals[0];
  if (values.help || cmd === undefined || cmd === "help") return USAGE;
  if (![...["seed-factions", "create-army", "create-bro-army", "set-password", "give-credits", "list", "backup"], ...EDITS].includes(cmd) || positionals.length > 1) throw new UsageError(`commande inconnue : ${positionals.join(" ")}`);

  const cfg = loadConfig(process.env);
  const dataDir = resolveDataDir(cfg.dataDir);
  const dbFile = join(dataDir, "minitroopers.db");
  let backupFile = "";
  if (cmd === "backup") {
    if (values.out === undefined || values.out === "") throw new UsageError("--out est obligatoire");
    // npm run changes the directory to the repository root; INIT_CWD is where the command was typed.
    backupFile = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
    if (existsSync(backupFile)) throw new UsageError(`${backupFile} existe déjà`);
    if (!existsSync(dbFile)) throw new UsageError(`aucune base : ${dbFile}`);
  }
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(dbFile);
  try {
    if (cmd === "backup") {
      // One read transaction: consistent even while the server writes (WAL); the copy is a compact standalone file.
      db.prepare("VACUUM INTO ?").run(backupFile);
      return `Sauvegarde écrite : ${backupFile}`;
    }

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

    if (cmd === "set-password") {
      if (values.password !== undefined) throw new UsageError("set-password : pas de --password (mot de passe : MT_ARMY_PASSWORD)");
      if (values.name === undefined) throw new UsageError("--name est obligatoire");
      const envPass = process.env.MT_ARMY_PASSWORD;
      if (envPass === undefined || envPass === "") throw new UsageError("MT_ARMY_PASSWORD : obligatoire et non vide pour set-password");
      const h = hostOf(values.name.slice(0, 100));
      const a = isValidHost(h) ? armyByHost(db, h) : null;
      if (!a) throw new UsageError(`armée introuvable : ${values.name}`);
      if (a.isFaction) throw new UsageError(`${a.host} est une armée de faction : refus`);
      setPassword(db, a.id, hashPassword(envPass));
      return `Mot de passe enregistré : ${a.host}`;
    }

    if (EDITS.includes(cmd)) return edit(db, cfg, cmd, values);

    if (cmd === "give-credits") {
      if (values.army === undefined) throw new UsageError("--army est obligatoire");
      const amount = int(values.amount, "amount", -1_000_000, 1_000_000);
      const h = hostOf(values.army.slice(0, 100));
      const a = isValidHost(h) ? armyByHost(db, h) : null;
      if (!a) throw new UsageError(`armée introuvable : ${values.army}`);
      return `${a.host} : ${addCredits(db, a.id, amount)} crédits`;
    }

    const bro = cmd === "create-bro-army";
    if (bro && (values.troopers !== undefined || values.password !== undefined)) throw new UsageError("create-bro-army : pas de --troopers ni --password (mot de passe : MT_ARMY_PASSWORD)");
    if (!bro && values.count !== undefined) throw new UsageError("--count : réservé à create-bro-army");
    if (values.name === undefined) throw new UsageError("--name est obligatoire");
    if (!bro && values.troopers === undefined) throw new UsageError("--troopers est obligatoire");
    const part = String(int(values.part, "part", 0, 5, 0));
    const v = checkArmyName(values.name, part);
    if (!v.ok) throw new UsageError(`--name : ${v.error}`);
    const faction = int(values.faction, "faction", 0, 1_000, 0);
    if (!FACTIONS.some((f) => f.id === faction)) throw new UsageError(`--faction : une des factions ${FACTIONS.map((f) => f.id).join(", ")}`);
    // UNVERIFIED: 35 rats = "about 30 to 40" for the extermination reached by the brother's army (docs/game/unverified.md).
    const rats = int(values.rats, "rats", 1, RATS_MAX, bro ? 35 : 1);
    let json: string;
    if (bro) {
      const count = int(values.count, "count", 1, 12, 12);
      json = JSON.stringify(seedsOffering(SKILLS.SMART, count).map((seed) => ({ seed, name: trooperName(new Rand(seed)), skills: ["SMART"] })));
    } else {
      json = values.troopers!.startsWith("@") ? readFileSync(values.troopers!.slice(1), "utf8") : values.troopers!;
    }
    const troopers = buildTroopers(json);
    const envPass = process.env.MT_ARMY_PASSWORD;
    if (values.password !== undefined && envPass !== undefined) throw new UsageError("--password et MT_ARMY_PASSWORD : un seul des deux");
    if (bro && (envPass === undefined || envPass === "")) throw new UsageError("MT_ARMY_PASSWORD : obligatoire et non vide pour create-bro-army");
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
      rats,
      missionsUnlocked: bro,
      replace: values.force === true,
    });
    if (!army) {
      const old = armyByHost(db, v.host);
      throw new UsageError(old?.isFaction ? `${v.host} est une armée de faction : refus` : `${v.host} existe déjà${values.force ? "" : " (--force pour la remplacer)"}`);
    }
    return `Armée créée : ${army.host} (id ${army.id}, ${troopers.length} troopers, niveaux ${troopers.map((t) => t.choices.length + 1).join(", ")})`;
  } finally {
    db.close();
  }
}

type Values = Record<string, string | boolean | undefined>;
const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);

/** The army named by --army (name or host, like give-credits). */
function armyArg(db: DatabaseSync, v: string | undefined): ArmyRow {
  if (v === undefined || v === "") throw new UsageError("--army est obligatoire");
  const h = hostOf(v.slice(0, 100));
  const a = isValidHost(h) ? armyByHost(db, h) : null;
  if (!a) throw new UsageError(`armée introuvable : ${v}`);
  return a;
}

/** --day: a real calendar day, today in TZ_GAME by default. */
function dayArg(cfg: Config, v: string | undefined): string {
  if (v === undefined) return dayKey(new Date(), cfg.tzGame);
  const t = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : NaN;
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) throw new UsageError("--day : une date AAAA-MM-JJ");
  return v;
}

/** The day's quotas of an army, as `show` and `reset-day` print them. */
function dayLines(db: DatabaseSync, a: ArmyRow, day: string): string[] {
  const used = battlesUsed(db, a.id, day);
  const counted = battlesCounted(db, a.id, day);
  const m = missionDay(db, a.id, day);
  const r = raidDay(db, a.id, day);
  const shops = shopResets(db, a.id, day);
  return [
    `Journée ${day} :`,
    `  Batailles : ${counted}/${battleAllowance(troopersOf(db, a.id).map(trooperInput))}${used !== counted ? ` (${used} dans la journée, avant remise à zéro comprises)` : ""}`,
    `  Mission : ${m.type ?? "pas encore tirée"}, essais ${m.used - m.reset}/${MISSION_ATTEMPTS}, gagnée : ${yesNo(m.won)}`,
    `  Raid : phase ${r.phase}, terminé : ${yesNo(r.over)}, recrues tuées : ${r.dead.length}`,
    `  Boutique : ${shops === 0 ? "offres du jour" : `nouvelles offres (remise à zéro ${shops} fois)`}`,
  ];
}

function show(db: DatabaseSync, cfg: Config, a: ArmyRow, day: string): string {
  const rows = troopersOf(db, a.id);
  const recruiter = a.recruiterId !== null ? armyById(db, a.recruiterId) : null;
  const order = storedDeployOrder(db, a.id);
  return [
    `Armée ${a.id} : ${a.host} — ${armyTitle(a.name, a.part)}`,
    `Adresse : ${absoluteArmyUrl(cfg, a.host, "/")}`,
    `Faction : ${factionLabel(a.faction)}${a.isFaction ? " (armée de faction)" : ""}`,
    `Crédits : ${a.credits}`,
    `Puissance : ${armyPower(rows.map(trooperInput))}`,
    `Mot de passe : ${yesNo(a.passwordHash !== null)}`,
    `Missions débloquées : ${yesNo(a.missionsUnlocked)}`,
    `Rats : ${a.rats}`,
    `Missions épiques gagnées : ${a.epicWins}`,
    `Recruteur : ${recruiter ? `${recruiter.host} (id ${recruiter.id})` : "aucun"}`,
    `Recrues : ${confirmedRecruitCount(db, a.id)} confirmée(s), ${pendingRecruits(db, a.id)} en attente`,
    `Ordre de déploiement : ${order ? order.join(", ") : "ordre des emplacements"}`,
    `Troopers (emplacement, nom, niveau, compétences) :`,
    ...rows.map((t) => {
      const d = describeTrooper(trooperInput(t));
      return `  ${t.slot}\t${t.name}\tniveau ${d.level}\t${d.skills.map(label).join(", ")}${t.pendingLevelup !== null ? "\t(montée de niveau payée, compétence à choisir)" : ""}`;
    }),
    ...dayLines(db, a, day),
  ].join("\n");
}

/** The army-editing commands (EDITS); every write is one BEGIN IMMEDIATE transaction (repo.ts). */
function edit(db: DatabaseSync, cfg: Config, cmd: string, values: Values): string {
  const a = armyArg(db, str(values.army));
  if (a.isFaction && !FACTION_OK.includes(cmd)) throw new UsageError(`${a.host} est une armée de faction : refus`);

  if (cmd === "show") return show(db, cfg, a, dayArg(cfg, str(values.day)));

  if (cmd === "reset-day") {
    const day = dayArg(cfg, str(values.day));
    const what = str(values.what) ?? "all";
    if (!["battles", "mission", "raid", "shop", "all"].includes(what)) throw new UsageError("--what : battles, mission, raid, shop ou all");
    const all = what === "all";
    resetDay(db, a.id, day, { battles: all || what === "battles", mission: all || what === "mission", raid: all || what === "raid", shop: all || what === "shop" });
    return [`${a.host} : journée ${day} rendue (${what})`, ...dayLines(db, a, day)].join("\n");
  }

  if (cmd === "set-credits") {
    const n = int(str(values.amount), "amount", 0, 1_000_000_000);
    setArmyField(db, a.id, "credits", n);
    return `${a.host} : ${n} crédits`;
  }

  if (cmd === "set-rats") {
    const n = int(str(values.rats), "rats", 1, RATS_MAX);
    setArmyField(db, a.id, "rats", n);
    return `${a.host} : ${n} rats à la prochaine extermination`;
  }

  if (cmd === "set-faction") {
    const v = str(values.faction)?.toLowerCase();
    const byName = v === undefined ? -1 : FACTION_COLOURS.indexOf(v as (typeof FACTION_COLOURS)[number]);
    const f = byName >= 0 ? byName : v !== undefined && /^[0-5]$/.test(v) ? Number(v) : -1;
    if (f < 0) throw new UsageError(`--faction : 0 à 5 ou ${FACTION_COLOURS.join(", ")}`);
    setArmyField(db, a.id, "faction", f);
    return `${a.host} : faction ${factionLabel(f)}`;
  }

  if (cmd === "unlock-missions") {
    const lock = values.lock === true;
    setArmyField(db, a.id, "missions_unlocked", lock ? 0 : 1);
    return `${a.host} : missions ${lock ? "verrouillées" : "débloquées"}`;
  }

  if (cmd === "rename") {
    const name = str(values.name);
    if (name === undefined) throw new UsageError("--name est obligatoire");
    const v = checkArmyName(name, String(a.part));
    if (!v.ok) throw new UsageError(`--name : ${v.error}`);
    if (!renameArmy(db, a.id, v.name, v.host)) throw new UsageError(`${v.host} existe déjà`);
    return `${a.host} → ${v.host} (${armyTitle(v.name, v.part)}) : ${absoluteArmyUrl(cfg, v.host, "/")}`;
  }

  if (cmd === "level-up") {
    const slot = int(str(values.slot), "slot", 0, MAX_TROOPERS - 1);
    const given = str(values.skill);
    if (given === undefined) throw new UsageError("--skill est obligatoire");
    const skill = skillId(/^[0-9]{1,4}$/.test(given) ? Number(given) : given, "--skill");
    const r = grantLevelUp(db, a.id, slot, (t) => {
      const shown = levelUpOptions(trooperInput(t)).shown;
      if (shown.length === 0) return `${t.name} ne peut plus monter de niveau`;
      return levelUpTo(t, skill) ?? `${label(skill)} n'est pas proposée ; proposées : ${shown.map(label).join(", ")}`;
    });
    if (r === "gone") throw new UsageError(`trooper introuvable : emplacement ${slot}`);
    if (r === "pending") throw new UsageError("une montée de niveau payée attend son choix sur le site : refus");
    if (typeof r === "string") throw new UsageError(r);
    return `${a.host} : ${r.name} : niveau ${r.choices.length + 1} (${label(skill)})`;
  }

  if (cmd === "confirm-recruits") {
    const r = confirmRecruits(db, a.id, Date.now(), referralBounty);
    return `${a.host} : ${r.confirmed} recrue(s) confirmée(s), +${r.credited} crédits`;
  }

  // delete-army
  const f = armyFootprint(db, a.id);
  const what =
    `${a.host} (id ${a.id}) : ${f.troopers} troopers, ${f.attacked} combats lancés (supprimés), ${f.defended} combats subis ` +
    `(gardés chez leurs attaquants), ${f.recruits} recrue(s) (perdent leur recruteur), ${f.sessions} session(s) fermée(s)`;
  if (values.yes !== true) throw new DryRun(`Serait supprimée : ${what}\nRien n'a été supprimé : ajouter --yes pour confirmer.`);
  if (!deleteArmy(db, a.id)) throw new UsageError(`${a.host} : suppression refusée`);
  return `Armée supprimée : ${what}`;
}

try {
  console.log(run(process.argv.slice(2)));
} catch (e) {
  if (e instanceof DryRun) {
    console.log(e.message);
    process.exitCode = 1;
  } else if (e instanceof UsageError || e instanceof SpecError || (e as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
    console.error(`Erreur : ${(e as Error).message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
