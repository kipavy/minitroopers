import type { Hono } from "hono";
import { choiceData, clientParams, troopersList } from "@mt/engine";
import type { Deps, Env } from "../app.ts";
import { battleTroopers, recruitsByLevel, setDeployOrder } from "../deploy.ts";
import { confirmedRecruitCount } from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { CHOICE_MIN_TROOPERS } from "../views/panel.ts";
import { choicePage } from "../views/choice.ts";
import { MINI_SWF } from "../views/swf.ts";
import { ownedArmy } from "./owner.ts";

/** Recruits per `/load` page (the SWF asks `count=16`). */
const LOAD_MAX = 16;

export function registerChoice(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;

  // The deployment order editor: the army in deployment order, ids = -slot (RECON4 §3).
  pages.get("/choice", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const host = o.army.host;
    if (o.rows.length < CHOICE_MIN_TROOPERS) return c.redirect(armyUrl(cfg, host, "/hq"));
    const troopers = battleTroopers(db, o.army.id).map((t) => ({ ...t, id: -t.id }));
    const data = choiceData(
      {
        army: { faction: o.army.faction, spawnOrder: troopers.map((t) => t.id), troopers },
        recruits: confirmedRecruitCount(db, o.army.id),
        load: armyUrl(cfg, host, "/load?"),
        loaded: [],
        save: armyUrl(cfg, host, `/save?chk=${c.get("session").key};c=`),
      },
      MINI_SWF,
    );
    return c.html(choicePage(cfg, { army: o.army, troopers: o.troopers, power: o.power, flashvars: clientParams(data) }));
  });

  // The recruits the SWF pages through (`pos=<n>;count=16`): first trooper of each, id = the recruit's army id.
  // UNVERIFIED: only pos=0;count=16 is archived; malformed parameters or count > 16 answer 400 (the SWF then goes to /hq).
  pages.get("/load", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const pos = queryParam(c, "pos");
    const count = queryParam(c, "count");
    if (pos === undefined || count === undefined || !/^[0-9]{1,6}$/.test(pos) || !/^[0-9]{1,2}$/.test(count) || Number(count) > LOAD_MAX) {
      return c.text("Bad Request", 400);
    }
    const page = recruitsByLevel(db, o.army.id).slice(Number(pos), Number(pos) + Number(count));
    return c.text(troopersList(page.map((r) => ({ ...r.trooper, id: r.armyId }))));
  });

  /**
   * "Valider" (`/save?chk=KEY;c=<ids joined by ':'>`): ids ≤ 0 are the army's troopers (slot = -id). Stored only when
   * they are exactly a permutation of the slots, then the HQ; anything else stores nothing and goes back to /choice.
   * The SWF joins its whole grid, empty cells included (as "": `c=-3:-1:-4:0:-2:::…`, seen in Ruffle): those are skipped.
   * UNVERIFIED: ids > 0 (a recruit dragged into the army) are ignored; the original effect is unknown (RECON4 §3).
   */
  pages.get("/save", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    if (!isSessionKey(c, queryParam(c, "chk"))) return c.text("Forbidden", 403);
    const raw = queryParam(c, "c") ?? "";
    const ids = raw.length <= 400 ? raw.split(":").filter((x) => x !== "") : [];
    const ok = ids.length > 0 && ids.every((x) => /^-?[0-9]{1,9}$/.test(x));
    const slots = ok ? ids.map(Number).filter((n) => n <= 0).map((n) => -n) : [];
    const saved = ok && setDeployOrder(db, o.army.id, slots);
    return c.redirect(armyUrl(cfg, o.army.host, saved ? "/hq" : "/choice"));
  });
}
