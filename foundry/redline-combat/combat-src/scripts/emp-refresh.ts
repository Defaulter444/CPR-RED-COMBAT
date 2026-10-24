import { allActors } from "./shared.js";
import { updateTouchesPath } from "./update-path.js";
import { empGM, empWork, expireDisablements } from "./emp-state.js";
import { empReferences, timedDisables } from "./emp-rules.js";

/** Index affected actors; coalesce writes caused by one EMP operation. */
export function registerEmpRefresh(report: (error: unknown) => void): void {
  const tracked = new Map<string, Actor>();
  const pending = new Map<string, Actor>();
  let scheduled = false;
  const remember = (actor: Actor) => {
    const affected = actor.items.some(item => empReferences(item).length > 0 || Object.keys(timedDisables(item)).length > 0)
      || actor.effects.some(effect => ["disabledLegPenalty", "frameConsequences", "disableRequest", "empCombat", "empStatus"]
        .some(key => foundry.utils.getProperty(effect, "flags.redline-combat." + key)));
    if (affected) tracked.set(actor.uuid, actor); else tracked.delete(actor.uuid);
    return affected;
  };
  const queue = (actor: Actor) => {
    if (game.user?.id !== empGM()?.id) return;
    pending.set(actor.uuid, actor);
    if (scheduled) return;
    scheduled = true;
    void empWork(async () => {
      const actors = [...pending.values()]; pending.clear(); scheduled = false;
      if (game.user?.id !== empGM()?.id) return;
      for (const current of actors) { await expireDisablements(current); remember(current); }
    }).catch(report);
  };
  const changed = (actor: Actor) => {
    const wasTracked = tracked.has(actor.uuid);
    if (remember(actor) || wasTracked) queue(actor);
  };
  const seed = () => {
    tracked.clear();
    for (const actor of allActors()) if (remember(actor)) queue(actor);
  };
  Hooks.once("ready", seed);
  Hooks.on("canvasReady", seed);
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
    Hooks.on(hook, (doc: Item | ActiveEffect) => {
      const parent = doc.parent;
      const actor = parent instanceof Actor ? parent : parent instanceof Item ? parent.parent : undefined;
      if (actor instanceof Actor) changed(actor);
    });
  Hooks.on("createActor", changed);
  Hooks.on("createToken", (token: TokenDocument) => { if (token.actor) changed(token.actor); });
  Hooks.on("updateToken", (token: TokenDocument, changes: object) => {
    if (!["actorId", "actorLink", "delta"].some(path => updateTouchesPath(changes, path))) return;
    for (const [uuid, actor] of tracked) if (actor.parent === token && actor !== token.actor) {
      tracked.delete(uuid); pending.delete(uuid);
    }
    if (token.actor) changed(token.actor);
  });
  Hooks.on("deleteActor", (actor: Actor) => { tracked.delete(actor.uuid); pending.delete(actor.uuid); });
  Hooks.on("deleteToken", (token: TokenDocument) => {
    if (token.actor && !token.actorLink) { tracked.delete(token.actor.uuid); pending.delete(token.actor.uuid); }
  });
  Hooks.on("updateWorldTime", () => { for (const actor of tracked.values()) queue(actor); });
  Hooks.on("updateCombat", (_combat: Combat, changes: object) => {
    if (!["round", "turn", "active", "flags.redline-combat.empRecords", "flags.redline-combat.empRequests"]
      .some(path => updateTouchesPath(changes, path))) return;
    for (const actor of tracked.values()) queue(actor);
  });
}
