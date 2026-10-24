import { primaryGM as electedGM } from "./shared.js";
import { updateTouchesPath } from "./update-path.js";
import { suppressionExpired, effectLifetime } from "./effect-lifetime.js";
const M = "redline-combat";
/** The current turn does not count as the next turn if suppression lands mid-turn. */
export function suppressionExpiry(combat, token) {
    if (!combat?.started)
        return;
    const index = combat.turns.findIndex(c => c.token?.uuid === token);
    if (index < 0)
        return;
    return { combat: combat.id, combatant: combat.turns[index].id, round: Number(combat.round) + (index > Number(combat.turn) ? 0 : 1) };
}
export async function expireSuppression() {
    const gm = electedGM();
    if (!gm || gm.id !== game.user?.id)
        return;
    const actors = new Map();
    for (const actor of game.actors ?? [])
        actors.set(actor.uuid, actor);
    for (const scene of game.scenes ?? [])
        for (const token of scene.tokens)
            if (token.actor)
                actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) {
        const ids = Array.from(actor.effects).filter(effect => {
            const expiry = foundry.utils.getProperty(effect, `flags.${M}.suppressionExpiry`);
            return !!expiry && !effectLifetime(effect).protected && suppressionExpired(expiry);
        }).map(e => e.id);
        if (ids.length)
            await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
}
export function registerSuppression() {
    let queue = Promise.resolve();
    let scheduled = false;
    const refresh = () => {
        if (scheduled)
            return;
        scheduled = true;
        queue = queue.catch(() => { }).then(() => { scheduled = false; return expireSuppression(); });
        void queue.catch(error => console.error(M, "Suppression expiry failed", error));
    };
    Hooks.once("ready", refresh);
    Hooks.on("updateCombat", (_combat, changes) => {
        if (["round", "turn", "active"].some(path => updateTouchesPath(changes, path)))
            refresh();
    });
    for (const event of ["deleteCombat", "createCombatant", "deleteCombatant"])
        Hooks.on(event, refresh);
    Hooks.on("updateCombatant", (_combatant, changes) => {
        if (updateTouchesPath(changes, "initiative"))
            refresh();
    });
}
