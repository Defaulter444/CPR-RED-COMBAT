import { actorEncounter } from "./encounter.js";
import { updateTouchesPath } from "./update-path.js";
import { effectDuration } from "./effect-duration.js";
import { masterStatuses } from "./status-catalog.js";
const MODULE = "redline-combat";
const options = { pneumaStatusSync: true, render: true };
const bound = masterStatuses.filter((s) => !!s.binding);
const queues = new Map();
const sources = new Map();
const flag = (doc, key) => foundry.utils.getProperty(doc, "flags." + MODULE + "." + key);
function matchingItems(actor, status) {
    const b = status.binding;
    return Array.from(actor.items).filter(item => {
        if (String(item.type) !== (b.kind === "injury" ? "criticalInjury" : "drug"))
            return false;
        const source = String(foundry.utils.getProperty(item, "_stats.compendiumSource")
            ?? foundry.utils.getProperty(item, "flags.core.sourceId") ?? "");
        return flag(item, "statusId") === status.id || (!!b.itemId && source.endsWith("." + b.itemId)) || item.name === b.itemName;
    });
}
function sourceEffects(item, status) {
    return Array.from(item.effects).filter(effect => status.binding.effectNames?.includes(effect.name ?? ""));
}
function live(effect) {
    return !effect.disabled && !effect.system?.isSuppressed;
}
function markers(actor, id) {
    return Array.from(actor.effects).filter(effect => effect.statuses.has(id));
}
async function sourceItem(status) {
    const key = status.binding.pack + "." + (status.binding.itemId || status.binding.itemName);
    let promise = sources.get(key);
    if (!promise) {
        promise = (async () => {
            const pack = game.packs.get(status.binding.pack);
            // Resolve name-bound drugs from the installed system instead of inventing IDs.
            const id = status.binding.itemId || (await pack?.getIndex())?.find(row => row.name === status.binding.itemName)?._id;
            const item = id ? await pack?.getDocument(id) : undefined;
            if (!item || String(item.type) !== (status.binding.kind === "injury" ? "criticalInjury" : "drug"))
                throw new Error("Native " + status.name + " — предмет недоступен.");
            return item;
        })();
        sources.set(key, promise);
        promise.catch(() => sources.delete(key));
    }
    return promise;
}
async function changeSource(actor, status, active, combat) {
    let items = matchingItems(actor, status);
    if (!active) {
        if (status.binding.kind === "injury") {
            if (items.length)
                await actor.deleteEmbeddedDocuments("Item", items.map(item => item.id), options);
        }
        else {
            for (const item of items) {
                const effects = sourceEffects(item, status).filter(live);
                if (effects.length)
                    await item.updateEmbeddedDocuments("ActiveEffect", effects.map(e => ({ _id: e.id, disabled: true })), options);
            }
        }
        return;
    }
    if (!items.length) {
        const { _id, ...source } = (await sourceItem(status)).toObject();
        foundry.utils.setProperty(source, "flags." + MODULE + ".statusId", status.id);
        if (status.binding.kind === "effect")
            foundry.utils.setProperty(source, "system.amount", 0);
        items = await actor.createEmbeddedDocuments("Item", [source], options);
        if (!items.length)
            throw new Error("Не удалось добавить штатный предмет: " + status.name + ".");
    }
    if (status.binding.kind === "effect") {
        // Reuse an already active variant, especially Synthcoke's addiction-aware primary.
        if (items.some(item => sourceEffects(item, status).some(live)))
            return;
        const item = items[0];
        const effect = sourceEffects(item, status)[0];
        if (!effect)
            throw new Error("Native " + status.name + " — эффект недоступен.");
        const seconds = effect.duration?.seconds ?? (effect.duration?.rounds ? effect.duration.rounds * 3 : undefined);
        await item.updateEmbeddedDocuments("ActiveEffect", [{ _id: effect.id, disabled: false, ...(typeof seconds === "number" && seconds > 0 ? { duration: effectDuration(seconds, combat === undefined ? actorEncounter(actor) : combat) } : {}) }], options);
    }
}
async function refreshMarkers(actor) {
    for (const status of bound) {
        const items = matchingItems(actor, status);
        const active = status.binding.kind === "injury" ? items.some(item => !foundry.utils.getProperty(item, "flags." + MODULE + ".quickFix")) : items.some(item => sourceEffects(item, status).some(live));
        const existing = markers(actor, status.id);
        if (active) {
            if (!existing.length)
                await actor.createEmbeddedDocuments("ActiveEffect", [{
                        name: status.name, img: status.img, statuses: [status.id], changes: [], disabled: false,
                    }], options);
            else {
                const disabled = existing.filter(effect => effect.disabled);
                if (disabled.length)
                    await actor.updateEmbeddedDocuments("ActiveEffect", disabled.map(effect => ({ _id: effect.id, disabled: false })), options);
            }
        }
        else if (existing.length)
            await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id), options);
    }
}
export function statusAuthority(actor) {
    const users = game.users?.filter(user => user.active && (user.isGM || actor.testUserPermission(user, "OWNER"))) ?? [];
    users.sort((a, b) => Number(b.isGM) - Number(a.isGM) || a.id.localeCompare(b.id));
    return users[0]?.id === game.user?.id;
}
const refreshRequests = new Map();
export function syncActorStatuses(actor, changedIds = [], initialize = false, requestedActive, combat) {
    // Only passive refreshes are merged. Explicit status toggles retain their order.
    if (changedIds.length || requestedActive !== undefined)
        return syncStatuses(actor, changedIds, initialize, requestedActive, combat);
    const key = actor.uuid + ":" + initialize;
    const existing = refreshRequests.get(key);
    if (existing)
        return existing;
    const next = Promise.resolve().then(() => { refreshRequests.delete(key); return syncStatuses(actor, [], initialize); });
    refreshRequests.set(key, next);
    return next;
}
function syncStatuses(actor, changedIds, initialize, requestedActive, combat) {
    if (!["character", "mook"].includes(String(actor.type)))
        return Promise.resolve();
    const previous = queues.get(actor.uuid) ?? Promise.resolve();
    const next = previous.catch(() => { }).then(async () => {
        const requested = initialize ? bound.filter(status => markers(actor, status.id).some(live) && !matchingItems(actor, status).length).map(status => status.id) : changedIds;
        for (const id of new Set(requested)) {
            const status = bound.find(status => status.id === id);
            if (!status)
                continue;
            const active = requestedActive ?? markers(actor, id).some(live);
            try {
                await changeSource(actor, status, active, combat);
            }
            catch (error) {
                // Restore icons from the actual item state if importing/removing the source failed.
                await refreshMarkers(actor);
                throw error;
            }
        }
        await refreshMarkers(actor);
    });
    queues.set(actor.uuid, next);
    void next.finally(() => { if (queues.get(actor.uuid) === next)
        queues.delete(actor.uuid); }).catch(() => { });
    return next;
}
/** Damage-card application awaits native mechanics before reporting completion. */
export async function applyCombatStatus(actor, id, combat, endWithCombat = false) {
    const effects = () => Array.from(actor.allApplicableEffects?.() ?? actor.effects ?? []);
    const existing = new Set(effects().filter(live));
    if (bound.some(status => status.id === id))
        await syncActorStatuses(actor, [id], false, true, combat);
    else
        await actor.toggleStatusEffect(id, { active: true });
    const definition = masterStatuses.find(s => s.id === id);
    if (endWithCombat && combat && definition?.binding?.kind !== "injury" && definition?.name !== "Dead" && definition?.name !== "Needs Stabilization") {
        const binding = bound.find(s => s.id === id);
        const native = new Set(binding ? matchingItems(actor, binding).flatMap(item => sourceEffects(item, binding)) : []);
        for (const effect of effects().filter(e => live(e) && !existing.has(e) && (e.statuses.has(id) || native.has(e))))
            await effect.update({ ["flags." + MODULE + ".endWithCombat"]: combat.id });
    }
}
export function registerStatusSync() {
    const previousStatuses = new WeakMap();
    Hooks.on("preUpdateActiveEffect", (effect) => { previousStatuses.set(effect, [...effect.statuses]); });
    const notify = (actor, ids = [], initialize = false) => {
        if (!statusAuthority(actor))
            return;
        void syncActorStatuses(actor, ids, initialize).catch(error => ui.notifications.error("Синхронизация состояний: " + error.message));
    };
    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
        Hooks.on(hook, (item, changesOrOptions, optionsOrUser) => {
            const context = hook === "updateItem" ? optionsOrUser : changesOrOptions;
            if (typeof context === "object" && "pneumaStatusSync" in context)
                return;
            if (hook === "updateItem" && !["name", "type", "effects", "system", "flags." + MODULE + ".statusId", "flags.core.sourceId", "_stats.compendiumSource"].some(path => updateTouchesPath(changesOrOptions, path)))
                return;
            if (item.parent instanceof Actor && ["criticalInjury", "drug"].includes(String(item.type)))
                notify(item.parent);
        });
    }
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
        Hooks.on(hook, (effect, changesOrOptions, optionsOrUser) => {
            const context = hook === "updateActiveEffect" ? optionsOrUser : changesOrOptions;
            if (typeof context === "object" && "pneumaStatusSync" in context)
                return;
            const ids = [...effect.statuses, ...(previousStatuses.get(effect) ?? [])].filter(id => bound.some(status => status.id === id));
            if (hook === "updateActiveEffect" && !["statuses", "disabled", "name", "system.isSuppressed"].some(path => updateTouchesPath(changesOrOptions, path))) {
                previousStatuses.delete(effect);
                return;
            }
            if (effect.parent instanceof Actor && ids.length)
                notify(effect.parent, ids);
            else if (effect.parent instanceof Item && effect.parent.parent instanceof Actor && ["criticalInjury", "drug"].includes(String(effect.parent.type)))
                notify(effect.parent.parent);
            previousStatuses.delete(effect);
        });
    }
    const canvasActors = () => {
        for (const token of canvas.tokens?.placeables ?? [])
            if (token.actor)
                notify(token.actor, [], true);
    };
    Hooks.on("canvasReady", canvasActors);
    Hooks.on("createToken", (token) => { if (token.actor)
        notify(token.actor, [], true); });
    Hooks.once("ready", () => {
        for (const actor of game.actors ?? [])
            notify(actor, [], true);
        canvasActors();
    });
}
