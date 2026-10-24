import { hasInstantCondition, clearInstantCondition } from "./instant-lifetime.js";
import { masterStatuses } from "./status-catalog.js";
import { primaryGM } from "./shared.js";
import { requireCombatSocket } from "./socket-health.js";
const channel = "module.redline-combat";
const unconscious = masterStatuses.find(s => s.name === "Unconscious").id;
export const isUnconscious = (actor) => !!actor && Array.from(actor.allApplicableEffects?.() ?? actor.effects).some(e => !e.disabled && !e.isSuppressed && e.statuses.has(unconscious));
export function canWake(source, target) {
    return !!source?.actor && !!target?.actor && source.actor.uuid !== target.actor.uuid && source.actor.isOwner && !isUnconscious(source.actor) && isUnconscious(target.actor);
}
const pending = new Map();
export async function resolveWake(sourceId, targetId, user, action) {
    const source = await fromUuid(sourceId), target = await fromUuid(targetId);
    if (!source?.actor || !target?.actor || source.parent?.id !== target.parent?.id || action !== "extinguish" && source.actor.uuid === target.actor.uuid || !source.actor.testUserPermission(user, "OWNER"))
        throw Error("Выберите своего персонажа, чтобы разбудить другой токен.");
    if (isUnconscious(source.actor))
        throw Error("Персонаж без сознания не может будить других.");
    if (action === "extinguish") {
        if (hasInstantCondition(target.actor, "fire"))
            await clearInstantCondition(target.actor, "fire");
        return;
    }
    if (!isUnconscious(target.actor))
        return;
    await target.actor.toggleStatusEffect(unconscious, { active: false });
}
export async function wakeUsingAction(source, target, action) {
    requireCombatSocket();
    const gm = primaryGM();
    if (!gm)
        throw Error(action === "extinguish" ? "Чтобы потушить персонажа, нужен активный Мастер." : "Чтобы разбудить персонажа, нужен активный Мастер.");
    if (action === "extinguish" ? (!source.actor?.isOwner || isUnconscious(source.actor) || !target.actor || !hasInstantCondition(target.actor, "fire")) : !canWake(source, target))
        throw Error(action === "extinguish" ? "Выберите своего персонажа в сознании и горящего пациента." : "Выберите своего персонажа в сознании и цель без сознания.");
    if (game.user.id === gm.id)
        return resolveWake(source.document.uuid, target.document.uuid, game.user, action);
    const id = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error("Мастер не ответил на просьбу разбудить.")); }, 15000);
        pending.set(id, { resolve, reject, timer });
        game.socket.emit(channel, { wake: "request", id, user: game.user.id, source: source.document.uuid, target: target.document.uuid, action });
    });
}
export function registerWake() {
    Hooks.once("ready", () => game.socket.on(channel, async (packet) => {
        if (packet?.wake === "reply" && packet.user === game.user.id) {
            const job = pending.get(packet.id);
            if (!job)
                return;
            clearTimeout(job.timer);
            pending.delete(packet.id);
            if (packet.error)
                job.reject(Error(packet.error));
            else
                job.resolve();
            return;
        }
        if (packet?.wake !== "request" || game.user.id !== primaryGM()?.id)
            return;
        const user = game.users?.get(packet.user);
        if (!user || !packet.source || !packet.target)
            return;
        let error;
        try {
            await resolveWake(packet.source, packet.target, user, packet.action);
        }
        catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
        game.socket.emit(channel, { wake: "reply", id: packet.id, user: packet.user, error });
    }));
}
