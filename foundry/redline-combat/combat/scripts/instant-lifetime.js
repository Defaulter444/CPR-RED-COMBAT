import { captureCombatSummary, waitCombatSummary } from "./combat-summary.js";
import { allActors as actors } from "./shared.js";
import { withActorMutation } from "./actor-mutation.js";
import { actorEncounter, encounterEpoch } from "./encounter.js";
import { effectDuration, durationExpired, hasDuration } from "./effect-duration.js";
import { masterStatuses } from "./status-catalog.js";
import { actorInStartedCombat, effectCombat, effectBelongsToCombat, effectEndsWithCombat, effectExpired, effectLifetime, isSpeedheal } from "./effect-lifetime.js";
import { applyCombatStatus, syncActorStatuses } from "./status-sync.js";
import { empGM, empWork } from "./emp-state.js";
const M = "redline-combat", key = "flags." + M + ".instantLifetime";
const life = (doc) => foundry.utils.getProperty(doc, key);
const status = (name) => { const s = masterStatuses.find(s => s.name === name); if (!s)
    throw Error("Нет состояния: " + name); return s; };
const active = (e) => !e.disabled && !e.isSuppressed && !foundry.utils.getProperty(e, "system.isSuppressed");
const allEffects = (actor) => Array.from(actor.allApplicableEffects?.() ?? actor.effects);
const speedhealKey = "flags." + M + ".speedhealEffects";
export async function trackSpeedheal(effect, combat) {
    if (!active(effect) || !isSpeedheal(effect) || effectLifetime(effect).protected || !effect.uuid)
        return;
    const saved = foundry.utils.getProperty(combat, speedhealKey);
    if (!saved?.includes(effect.uuid))
        await combat.update({ [speedhealKey]: [...(saved ?? []), effect.uuid] });
}
export async function clearCombatSpeedheal(combat) {
    const saved = foundry.utils.getProperty(combat, speedhealKey);
    for (const uuid of saved ?? []) {
        const effect = await fromUuid(uuid);
        if (effect?.parent && Array.from(game.combats ?? []).some(c => c.id !== combat.id && c.started && c.combatants.some(p => p.actor?.uuid === effect.parent.uuid)))
            continue;
        if (effect && isSpeedheal(effect) && !effectLifetime(effect).protected)
            await effect.delete();
    }
    if (saved?.length && game.combats?.get(combat.id) === combat)
        await combat.update({ ["flags." + M + ".-=speedhealEffects"]: null });
}
const fireLevels = () => [[status("On Fire (Mild)").id, 2], [status("On Fire (Strong)").id, 4], [status("On Fire (Deadly)").id, 6]];
const fireDamage = (e) => Math.max(0, ...fireLevels().filter(([id]) => e.statuses.has(id)).map(([, damage]) => damage), life(e)?.kind === "fire" ? 2 : 0);
const sleepEffect = (e) => e.statuses.has(status("Unconscious").id) && (e.name === "Sleep" || life(e)?.kind === "sleep");
const timedMarker = (actor, item) => String(item.type) === "criticalInjury" ? actor.effects.find(e => !!item.uuid && e.origin === item.uuid && hasDuration(e.duration)) : undefined;
/** Import the native injury only when absent. Repeated temporary injuries extend their own expiry. */
export async function temporaryInjury(actor, name, combat = actorEncounter(actor)) {
    const s = status(name), b = s.binding;
    const matches = actor.items.filter(i => String(i.type) === "criticalInjury" && (i.name === b.itemName || foundry.utils.getProperty(i, "flags." + M + ".statusId") === s.id || String(foundry.utils.getProperty(i, "_stats.compendiumSource") ?? foundry.utils.getProperty(i, "flags.core.sourceId") ?? "").endsWith("." + b.itemId)));
    if (matches.some(i => !life(i) && !timedMarker(actor, i))) {
        await syncActorStatuses(actor);
        return;
    }
    const duration = effectDuration(60, combat);
    if (matches.length) {
        for (const i of matches) {
            const marker = timedMarker(actor, i);
            if (marker)
                await marker.update({ duration });
            else
                await i.update({ [key]: { kind: "injury", expires: game.time.worldTime + 60 } });
        }
        return;
    }
    const source = await game.packs.get(b.pack)?.getDocument(b.itemId);
    if (!source)
        throw Error("Native " + name + " injury is unavailable.");
    const data = source.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "flags." + M + ".statusId", s.id);
    const [item] = (await actor.createEmbeddedDocuments("Item", [data], { pneumaStatusSync: true })) ?? [];
    await syncActorStatuses(actor);
    const marker = actor.effects.find(e => e.statuses.has(s.id));
    if (marker && item)
        await marker.update({ duration, origin: item.uuid });
}
/** Adopt previously saved instant effects without duplicating native conditions. */
async function migrateInstantActor(actor) {
    for (const item of actor.items) {
        const old = life(item);
        if (old?.kind !== "injury" || old.expires === undefined)
            continue;
        await syncActorStatuses(actor);
        const id = foundry.utils.getProperty(item, "flags." + M + ".statusId");
        const marker = actor.effects.find(e => typeof id === "string" && e.statuses.has(id));
        if (!marker)
            continue;
        await marker.update({ origin: item.uuid, duration: effectDuration(Math.max(0, old.expires - game.time.worldTime), actorEncounter(actor)) });
        await item.update({ ["flags." + M + ".-=instantLifetime"]: null });
    }
    for (const effect of actor.effects) {
        const old = life(effect);
        if (!old || old.kind === "injury")
            continue;
        if (old.lastTurn)
            await actor.update({ ["flags." + M + ".lastBurnTurn"]: old.lastTurn });
        await effect.update({
            name: old.kind === "sleep" ? "Sleep" : status("On Fire (Mild)").name,
            statuses: old.kind === "fire" ? [status("On Fire (Mild)").id] : [...effect.statuses],
            ...(old.expires !== undefined ? { duration: effectDuration(Math.max(0, old.expires - game.time.worldTime), actorEncounter(actor)) } : {}),
            ["flags." + M + ".-=instantLifetime"]: null
        });
    }
}
const hpValues = new Map();
export async function sleepTarget(actor, combat = actorEncounter(actor)) {
    hpValues.set(actor.uuid, Number(foundry.utils.getProperty(actor, "system.derivedStats.hp.value")));
    await applyCombatStatus(actor, status("Prone").id, combat, true);
    const s = status("Unconscious"), matches = actor.effects.filter(e => active(e) && e.statuses.has(s.id));
    if (matches.some(e => !sleepEffect(e)))
        return;
    const duration = effectDuration(60, combat);
    if (matches.length) {
        for (const e of matches)
            await e.update({ name: "Sleep", duration, ["flags." + M + ".-=instantLifetime"]: null });
        return;
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Sleep", img: s.img, statuses: [s.id], changes: [], duration }]);
}
export async function igniteTarget(actor, combat) {
    if (allEffects(actor).some(e => active(e) && fireDamage(e) > 0))
        return;
    const s = status("On Fire (Mild)");
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: s.name, img: s.img, statuses: [s.id], changes: [], ...(combat ? { flags: { [M]: { endWithCombat: combat.id } } } : {}) }]);
}
export function hasInstantCondition(actor, kind) {
    return allEffects(actor).some(e => active(e) && (kind === "fire" ? fireDamage(e) > 0 : sleepEffect(e)));
}
export async function clearInstantCondition(actor, kind) {
    for (const effect of allEffects(actor).filter(e => kind === "fire" ? fireDamage(e) > 0 : sleepEffect(e))) {
        if (effect.parent === actor)
            await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        else
            await effect.update({ disabled: true });
    }
}
export async function expireInstantActor(actor, now = game.time.worldTime) {
    const items = actor.items.filter(i => { const marker = timedMarker(actor, i); return marker ? durationExpired(marker.duration, now) : life(i)?.expires !== undefined && life(i).expires <= now; }).map(i => i.id);
    if (items.length) {
        await actor.deleteEmbeddedDocuments("Item", items, { pneumaStatusSync: true });
        await syncActorStatuses(actor);
    }
    let itemEffectsChanged = false;
    for (const effect of allEffects(actor)) {
        const expired = effectExpired(effect, now);
        if (!expired || effect.disabled)
            continue;
        if (effect.parent === actor)
            await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        else {
            await effect.update({ disabled: true });
            itemEffectsChanged = true;
        }
    }
    if (itemEffectsChanged)
        await syncActorStatuses(actor);
}
/** Native durations are enough to qualify; manually applied effects are included. */
export async function finishTimedEffects(combat) {
    const failures = [];
    try {
        await clearCombatSpeedheal(combat);
    }
    catch (error) {
        failures.push("Ускоренное заживление: " + error.message);
    }
    const participants = new Set(Array.from(combat.combatants ?? []).map(c => c.actor?.uuid));
    for (const actor of actors()) {
        // Linked actors may still be participating in another scene's encounter.
        if (actorInStartedCombat(actor, combat.id))
            continue;
        try {
            const belongs = (effect) => effectBelongsToCombat(effect, actor, combat);
            // Only an injury with a timed marker linked to its item is temporary.
            const temporary = actor.items.filter(item => {
                const marker = timedMarker(actor, item);
                return marker ? belongs(marker) : life(item)?.kind === "injury" && participants.has(actor.uuid);
            }).map(item => item.id);
            if (temporary.length) {
                await actor.deleteEmbeddedDocuments("Item", temporary, { pneumaStatusSync: true });
                await syncActorStatuses(actor);
            }
            let changed = false;
            for (const effect of allEffects(actor)) {
                if (!effectEndsWithCombat(effect, actor, combat))
                    continue;
                if (effect.parent === actor)
                    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
                else
                    await effect.update({ disabled: true, ["flags." + M + ".-=endWithCombat"]: null });
                changed = true;
            }
            if (changed)
                await syncActorStatuses(actor);
        }
        catch (error) {
            failures.push(`${actor.name}: ${error.message}`);
        }
    }
    if (failures.length)
        throw Error(failures.join("; "));
}
/** Reconcile explicit combat links after a missed end hook; untracked statuses stay untouched. */
export async function reconcileEndedEffects() {
    const ids = new Set();
    for (const actor of actors())
        for (const effect of allEffects(actor)) {
            const id = effectCombat(effect);
            if (id && !game.combats?.get(id)?.started)
                ids.add(id);
        }
    const errors = [];
    for (const id of ids)
        try {
            await finishTimedEffects({ id, combatants: [] });
        }
        catch (error) {
            errors.push(error.message);
        }
    if (errors.length)
        throw Error(errors.join("; "));
}
let work = Promise.resolve();
const enqueue = (run) => { if (game.user?.id !== empGM()?.id)
    return; work = work.catch(() => { }).then(run); void work.catch(e => ui.notifications.error("Мгновенные эффекты: " + e.message)); };
export async function burnTurn(actor, turn) {
    return withActorMutation(actor, async () => {
        const effects = allEffects(actor).filter(e => active(e) && fireDamage(e) > 0);
        if (!effects.length || foundry.utils.getProperty(actor, "flags." + M + ".lastBurnTurn") === turn || effects.some(e => life(e)?.lastTurn === turn))
            return;
        // Persist the turn before HP writes so duplicate combat updates cannot burn twice.
        const hp = Number(foundry.utils.getProperty(actor, "system.derivedStats.hp.value"));
        if (!Number.isFinite(hp))
            throw Error("HP цели недоступно.");
        await actor.update({ "system.derivedStats.hp.value": hp - Math.max(...effects.map(fireDamage)), ["flags." + M + ".lastBurnTurn"]: turn });
    });
}
export function registerInstantLifetimes() {
    const track = (effect) => {
        if (!active(effect) || !isSpeedheal(effect) || effectLifetime(effect).protected || !(effect.parent instanceof Actor))
            return;
        const actor = effect.parent;
        const combats = Array.from(game.combats ?? []).filter(c => c.started && c.active && c.combatants.some(row => row.actor?.uuid === actor.uuid));
        if (combats.length !== 1)
            return;
        const combat = combats[0];
        enqueue(async () => {
            // A rapid combat end may arrive while the status hook is queued.
            if (!combat.started || !game.combats?.get(combat.id)) {
                if (isSpeedheal(effect))
                    await effect.delete();
                return;
            }
            await trackSpeedheal(effect, combat);
        });
    };
    Hooks.on("createActiveEffect", track);
    Hooks.on("updateActiveEffect", (effect, changes) => {
        if ("statuses" in changes || changes.disabled === false)
            track(effect);
    });
    const previous = new Map();
    const rememberCombat = (c) => previous.set(c.id, { actor: c.combatant?.actor ?? undefined, round: c.round ?? 0, turn: c.turn ?? 0, started: c.started });
    const rememberHP = (a) => hpValues.set(a.uuid, Number(foundry.utils.getProperty(a, "system.derivedStats.hp.value")));
    const refresh = () => {
        for (const a of actors())
            rememberHP(a);
        for (const c of game.combats ?? [])
            rememberCombat(c);
        enqueue(async () => { await reconcileEndedEffects(); for (const a of actors()) {
            await migrateInstantActor(a);
            await expireInstantActor(a);
        } });
    };
    Hooks.once("ready", refresh);
    Hooks.on("canvasReady", refresh);
    Hooks.on("createActor", rememberHP);
    Hooks.on("createToken", (t) => { if (t.actor)
        rememberHP(t.actor); });
    Hooks.on("deleteActor", (a) => hpValues.delete(a.uuid));
    Hooks.on("updateWorldTime", () => enqueue(async () => {
        const inCombat = new Set(Array.from(game.combats ?? []).filter(c => c.started).flatMap(c => Array.from(c.combatants).map(row => row.actor?.uuid)));
        for (const a of actors())
            if (!inCombat.has(a.uuid))
                await expireInstantActor(a);
    }));
    // preUpdate is local to the initiating client. Cached values also cover remote writes received by the elected GM.
    Hooks.on("preUpdateActor", rememberHP);
    Hooks.on("updateActor", (a) => { const before = hpValues.get(a.uuid), after = Number(foundry.utils.getProperty(a, "system.derivedStats.hp.value")); hpValues.set(a.uuid, after); if (before !== undefined && after < before)
        enqueue(() => clearInstantCondition(a, "sleep")); });
    Hooks.on("createCombat", rememberCombat);
    Hooks.on("preUpdateCombat", rememberCombat);
    const finish = (c, lastRound = c.round ?? 0) => {
        const summary = captureCombatSummary(c, lastRound);
        const affected = [...new Set([...Array.from(c.combatants ?? []).flatMap(p => p.actor ? [p.actor.uuid] : []), ...actors().filter(a => allEffects(a).some(e => { return effectCombat(e) === c.id; })).map(a => a.uuid)])];
        enqueue(async () => {
            if (game.combats?.get(c.id)?.started)
                return;
            try {
                await waitCombatSummary();
            }
            catch {
                summary.partial = true;
            }
            summary.criticals = captureCombatSummary(c, lastRound).criticals;
            try {
                await finishTimedEffects(c);
            }
            finally {
                await empWork(async () => { });
                const { waitGrappleCleanup } = await import("./grapple/workflow.js");
                await waitGrappleCleanup();
                const { expireQuickFixes } = await import("./medical.js");
                try {
                    await expireQuickFixes(c);
                }
                finally {
                    Hooks.callAll("pneumaCombatCleanupFinished", c, affected, summary);
                }
            }
        });
    };
    Hooks.on("deleteCombat", (c) => { const round = previous.get(c.id)?.round; previous.delete(c.id); finish(c, round); });
    Hooks.on("updateCombat", (c) => {
        const p = previous.get(c.id);
        rememberCombat(c);
        if (p?.started && !c.started) {
            finish(c, p.round);
            return;
        }
        if (!p?.started || !c.started)
            return;
        const nextRound = (c.round ?? 0) > p.round;
        if (!nextRound && !((c.round ?? 0) === p.round && (c.turn ?? 0) > p.turn))
            return;
        enqueue(async () => {
            // Resolve the departing actor's end-turn condition before expiring it.
            if (p.actor)
                await burnTurn(p.actor, c.id + ":" + encounterEpoch(c) + ":" + p.round + ":" + p.turn);
            const due = new Map();
            if (p.actor)
                due.set(p.actor.uuid, p.actor);
            if (nextRound)
                for (const row of c.combatants ?? [])
                    if (row.actor)
                        due.set(row.actor.uuid, row.actor);
            for (const actor of due.values())
                await expireInstantActor(actor);
        });
    });
}
