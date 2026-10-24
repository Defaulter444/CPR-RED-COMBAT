import { hasInjury } from "./injury-rules.js";
import { withActorMutation } from "./actor-mutation.js";
import { registerNativeWrapper } from "./native-wrappers.js";
const damageCaptures = new WeakMap();
/** The capture owns the actor queue across native damage and its HP corrections. */
export const isDamageCaptureView = (actor) => damageCaptures.has(actor);
const installedChats = new WeakSet();
function installDamageCapture(chat) {
    if (installedChats.has(chat))
        return;
    registerNativeWrapper(chat, "RenderDamageApplicationCard", function (wrapped, data) {
        const captured = damageCaptures.get(data.actor);
        if (captured) {
            captured.push(data);
            return Promise.resolve();
        }
        return wrapped(data);
    }, "MIXED");
    installedChats.add(chat);
}
/** Repack the native result and breakdown; no damage formula is calculated here. */
export function compactDamageApplication(html, name, location, id, actorUuid) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const number = doc.querySelector('[data-action="toggleVisibility"][data-visible-element="d6-data-details"]');
    const details = doc.querySelector(".d6-data-details");
    if (!number || !details)
        throw new Error("В карточке штатного урона нет итога или расшифровки.");
    const scope = "pneuma-applied-details-" + id.replace(/[^a-zA-Z0-9_-]/g, "");
    details.classList.replace("d6-data-details", scope);
    details.classList.add("pneuma-applied-details", "hide");
    number.dataset.visibleElement = scope;
    number.classList.add("pneuma-applied-number");
    number.dataset.pvtPopover = "native";
    const row = doc.createElement("div");
    row.className = "pneuma-damage-applied-row";
    const recipient = doc.createElement("span");
    recipient.className = "pneuma-applied-name";
    recipient.textContent = name;
    const where = doc.createElement("span");
    where.className = "pneuma-applied-location";
    where.textContent = game.i18n.localize("CPR.global.location." + location);
    row.append(recipient, number, where);
    // Keep native Undo beside the total, independently of the breakdown.
    const undo = doc.querySelector('[data-action="reverseDamage"]');
    if (undo) {
        undo.classList.add('pneuma-damage-undo');
        row.append(undo);
    }
    const card = doc.createElement("div");
    card.className = "rollcard pneuma-damage-applied";
    card.dataset.damageInstance = id;
    if (actorUuid)
        card.dataset.damageActor = actorUuid;
    card.append(row, details);
    return card.outerHTML;
}
/** Capture only this call's native summary, using a distinct actor view as its identity. */
export async function captureDamageApplication(actor, name, location, id, apply, coverUp, inspect, aimedHead = false) {
    const path = "/systems/cyberpunk-red-core/modules/chat/cpr-chat.js";
    const chat = (await import(path)).default;
    return captureWithChat(chat, actor, name, location, id, apply, coverUp, inspect, aimedHead);
}
export async function captureWithChat(chat, actor, name, location, id, apply, coverUp, inspect, aimedHead = false) {
    return withActorMutation(actor, () => captureLocked(chat, actor, name, location, id, apply, coverUp, inspect, aimedHead));
}
async function captureLocked(chat, actor, name, location, id, apply, coverUp, inspect, aimedHead = false) {
    installDamageCapture(chat);
    // Native getters and mutations still execute on the real document. Only the
    // actor reference passed to its summary renderer is distinct for this call.
    const view = new Proxy(actor, { get(target, key) {
            const value = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
        } });
    const captured = [];
    damageCaptures.set(view, captured);
    try {
        await apply(view);
        if (coverUp) {
            const native = actor;
            const locations = ["body", "head"].filter(part => native.getEquippedArmors(part).length);
            const amount = locations.length ? coverUp.ablation : 0;
            if (amount)
                for (const part of locations)
                    await native._ablateArmor(part, amount);
            for (const data of captured) {
                data.ablation = amount;
                data.ignoreArmorPercent = coverUp.ignorePercent;
                data.ignoreBelowSP = coverUp.ignoreBelow;
            }
        }
        if (aimedHead && location === "head" && hasInjury(actor, "Cracked Skull")) {
            for (const data of captured) {
                const raw = Number(data.rawDamageDealt), total = Number(data.totalDamageDealt), reduction = Number(data.totalDamageReduction);
                if (!(raw > 0) || !Number.isFinite(total) || !Number.isFinite(reduction))
                    continue;
                const current = Number(foundry.utils.getProperty(actor, "system.derivedStats.hp.value"));
                const before = current + data.hpReduction;
                const corrected = crackedSkullDamage(raw, total, reduction, before, data.damageLethal !== false);
                await actor.update({ "system.derivedStats.hp.value": before - corrected });
                data.pneumaCrackedSkull = true;
                data.rawDamageDealt = raw * 1.5;
                data.totalDamageDealt = total + raw / 2;
                data.hpReduction = corrected;
            }
        }
        for (const data of captured)
            inspect?.(data);
        if (!captured.length)
            throw new Error("Штатный урон нанесён без сохранённого результата. Проверьте получателя, прежде чем продолжать.");
        return await Promise.all(captured.map(async (data, index) => compactDamageApplication(await renderTemplate("systems/cyberpunk-red-core/templates/chat/cpr-damage-application-card.hbs", data), name, data.location ?? location, id + "-" + index, actor.uuid) + (data.pneumaCrackedSkull ? '<p class="pneuma-injury-damage">Треснувший череп: пробивший урон в голову ×3; бонусный урон без изменений.</p>' : "") + (coverUp ? '<p class="pneuma-cover-up-damage">Укрытие: SP брони ×2; вся надетая броня головы и тела изнашивается ×2, даже при заблокированном уроне.</p>' : "")));
    }
    finally {
        damageCaptures.delete(view);
    }
}
/** Native raw head damage is already x2; add only one extra penetrating-damage share. */
export function crackedSkullDamage(raw, total, reduction, hp, lethal) {
    const taken = Math.max(0, total + raw / 2 - reduction);
    return !lethal && taken >= hp ? Math.max(0, hp - 1) : taken;
}
