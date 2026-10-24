import { nativeCard, spendBonusLuck } from "./native-combat.js";
import { hasInstantCondition } from "./instant-lifetime.js";
import { extinguishStatus, ejectStatus } from "./neural-intrusion.js";
import { forceOutEntries } from "./quickhack/force-out.js";
import { isProne, registeredProneIds } from "./prone.js";
import { escapeHTML } from "./shared.js";
export const hasMartialArts = (actor) => actor.items.some(item => String(item.type) === "skill"
    && foundry.utils.getProperty(item, "system.skillType") === "martialArt" && Number(foundry.utils.getProperty(item, "system.level")) >= 1);
export function selfActions(actor) {
    if (["container", "blackIce", "demon"].includes(String(actor.type)))
        return [];
    return [
        ...(hasInstantCondition(actor, "fire") ? [{ action: "extinguish", label: "Потушить", icon: "fa-fire-extinguisher", disabled: false }] : []),
        ...forceOutEntries(actor).map(row => ({ action: "eject", message: row.messageId, label: "Выбросить нетраннера — " + row.name, icon: "fa-plug-circle-xmark", disabled: false })),
        ...(isProne(actor) ? [{ action: hasMartialArts(actor) ? "recovery" : "getUp", label: hasMartialArts(actor) ? "Подъём (боевые искусства)" : "Встать", icon: "fa-person-arrow-up-from-line", disabled: false }] : [])
    ];
}
const recovering = new Set();
export async function performSelfAction(actor, action, message, skipDialog = false) {
    if (["container", "blackIce", "demon"].includes(String(actor.type)))
        return;
    if (!actor.isOwner)
        throw Error("Вы не управляете этим персонажем.");
    if (action === "extinguish") {
        if (hasInstantCondition(actor, "fire"))
            await extinguishStatus(actor);
    }
    else if (action === "eject") {
        if (!message)
            throw Error("Выберите подключённого нетраннера.");
        await ejectStatus(actor, message, skipDialog);
    }
    else if (action === "getUp") {
        if (!isProne(actor) || recovering.has(actor.uuid))
            return;
        recovering.add(actor.uuid);
        try {
            for (const id of registeredProneIds())
                await actor.toggleStatusEffect(id, { active: false });
            if (isProne(actor))
                return;
            const data = { content: '<p class="pneuma-self-action-report">' + escapeHTML(actor.name ?? "Персонаж") + ' встаёт, потратив действие.</p>', speaker: ChatMessage.getSpeaker({ actor }) };
            ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
            await ChatMessage.create(data);
        }
        finally {
            recovering.delete(actor.uuid);
        }
    }
    else if (action === "recovery") {
        if (!hasMartialArts(actor))
            throw Error("Для подъёма через боевые искусства нужен навык боевого искусства 1 или выше.");
        if (!isProne(actor) || recovering.has(actor.uuid))
            return;
        recovering.add(actor.uuid);
        try {
            const skill = actor.items.filter(item => String(item.type) === "skill" && foundry.utils.getProperty(item, "system.skillType") === "martialArt" && Number(foundry.utils.getProperty(item, "system.level")) >= 1)
                .sort((a, b) => Number(foundry.utils.getProperty(b, "system.level")) - Number(foundry.utils.getProperty(a, "system.level")))[0];
            let roll = skill.createRoll("skill", actor);
            roll.rollTitle = "Подъём (боевые искусства) — DV13";
            if (!await roll.handleRollDialog({ type: "pneuma-recovery", ctrlKey: skipDialog, metaKey: false }, actor, skill))
                return;
            if (!actor.isOwner || !hasMartialArts(actor) || !isProne(actor))
                return;
            roll = await skill.confirmRoll(roll);
            await spendBonusLuck(actor, roll.luck);
            await roll.roll();
            const success = roll.resultTotal > 13;
            const content = await nativeCard(roll) + '<p class="pneuma-ma-recovery-result">' + (success ? "Подъём удался: встаньте, не тратя действие." : "Подъём не удался: встаньте, потратив действие.") + '</p>';
            const data = { content, speaker: ChatMessage.getSpeaker({ actor }) };
            ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
            await ChatMessage.create(data);
            for (const id of registeredProneIds())
                await actor.toggleStatusEffect(id, { active: false });
        }
        finally {
            recovering.delete(actor.uuid);
        }
    }
}
