import { effectDuration, durationExpired } from './effect-duration.js';
import { encounterEpoch } from './encounter.js';
const transient = new Map();
function receiveVisual(event) {
    if (event?.visualEvent !== 'flashbang' || typeof event.id !== 'string' || !event.entry || typeof event.entry.actor !== 'string' || !['flashbang', 'teargas'].includes(event.entry.kind ?? ''))
        return;
    transient.set(event.id, event.entry);
    Hooks.callAll('pneumaCombatToolsFlashbangChanged');
}
export function registerFlashbangEvents() { Hooks.once('ready', () => game.socket?.on('module.redline-combat', receiveVisual)); }
export async function reportFlashbang(actor, combat, kind = 'flashbang') {
    const id = foundry.utils.randomID();
    if (!combat?.started) {
        const event = { visualEvent: 'flashbang', id, entry: { actor: actor.uuid, epoch: '', duration: effectDuration(60, null), created: Date.now(), kind } };
        receiveVisual(event);
        game.socket?.emit('module.redline-combat', event);
        return;
    }
    await combat.update({ [`flags.redline-combat.flashbangVisuals.${id}`]: { actor: actor.uuid, epoch: encounterEpoch(combat), duration: effectDuration(60, combat), created: Date.now(), kind } });
}
export function getFlashbangState(actor) {
    return getState(actor, 'flashbang');
}
export function getTearGasState(actor) { return getState(actor, 'teargas'); }
function getState(actor, kind) {
    let result;
    for (const [id, entry] of transient) {
        if (durationExpired(entry.duration)) {
            transient.delete(id);
            continue;
        }
        if (entry.actor === actor.uuid && entry.kind === kind && (!result || entry.created > result.created))
            result = { id, created: entry.created };
    }
    for (const combat of game.combats ?? []) {
        if (!combat.started)
            continue;
        const records = foundry.utils.getProperty(combat, 'flags.redline-combat.flashbangVisuals');
        for (const [id, entry] of Object.entries(records ?? {}))
            if ((entry.kind ?? 'flashbang') === kind && entry.actor === actor.uuid && entry.epoch === encounterEpoch(combat) && !durationExpired(entry.duration) && (!result || entry.created > result.created))
                result = { id, created: entry.created };
    }
    return result;
}
