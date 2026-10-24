import { findNativeItem } from "../native-lookup.js";
import { rollHidden, nativeCard, diceJSON, showSavedDice, spendBonusLuck } from "../native-combat.js";
import { MODULE } from "./availability.js";
import { enabled } from "./settings.js";
export const gmAudience = () => ({ whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id), blind: true });
export const publicAudience = () => ({ whisper: [], blind: false });
export const roleFor = (actor) => findNativeItem(actor.items, "Netrunner");
export const canOperate = (actor, user = game.user) => user.isGM || actor.testUserPermission(user, "OWNER");
export async function nativeQuickhackRoll(actor, item, title, audience, validate = () => enabled(), sourceToken, publish = true, skipDialog = false, playDice = true) {
    if (!validate() || !canOperate(actor))
        return null;
    let roll = item.createRoll(String(item.type) === "role" ? "roleAbility" : "skill", actor, { rollSubType: "mainRoleAbility" });
    roll.rollTitle = title;
    if (!await roll.handleRollDialog({ ctrlKey: skipDialog, metaKey: false, type: "chat" }, actor, item))
        return null;
    roll = await item.confirmRoll(roll);
    if (!validate() || !canOperate(actor))
        return null;
    const luck = Number(roll.luck ?? 0);
    if (luck !== 0)
        await spendBonusLuck(actor, luck);
    await rollHidden(roll);
    const content = await nativeCard(roll);
    if (!validate())
        return null;
    const message = publish ? await ChatMessage.create({ content, ...audience,
        speaker: ChatMessage.getSpeaker({ actor, token: sourceToken?.document }),
        flags: { [String(MODULE)]: { quickhack: { type: "roll", sourceActorUuid: actor.uuid } } },
    }) : undefined;
    const dice = diceJSON(roll), roller = game.user.id;
    if (playDice && !audience.blind)
        await showSavedDice(dice, "roll", roller, audience);
    return { total: Number(roll.resultTotal), message, content, dice, roller };
}
/** Preserve the prior module's single extra d10 on 1/10, including NPC WILL. */
export async function criticalD10() {
    const initial = (await new Roll("1d10").evaluate()).total;
    const adjustment = initial === 1 || initial === 10 ? (await new Roll("1d10").evaluate()).total : 0;
    return initial + (initial === 1 ? -adjustment : adjustment);
}
export async function quickhackDamage(source, sourceToken, targetToken, name, formula, automatic) {
    if (!enabled())
        return;
    const path = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
    const { CPRDamageRoll } = await import(path);
    class QuickhackDamage extends CPRDamageRoll {
        wasCritSuccess() { return false; }
    }
    const roll = new QuickhackDamage(name, formula, "program");
    roll.isAimed = true;
    roll.location = "brain";
    roll.rollCardExtraArgs.ablationValue = 0;
    await rollHidden(roll);
    Object.assign(roll, { entityData: { actor: source.id, token: sourceToken?.id ?? null, item: null, tokens: [targetToken] } });
    if (!enabled())
        return;
    // Native brain damage card retains CPR application/undo and ignores armor.
    const content = await nativeCard(roll);
    if (!enabled())
        return;
    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: source, token: sourceToken }),
        ...(automatic || !source.hasPlayerOwner ? gmAudience() : publicAudience()),
        flags: { [String(MODULE)]: { quickhack: { type: "damage", sourceActorUuid: source.uuid } } },
    });
    if (!automatic && source.hasPlayerOwner)
        await showSavedDice(diceJSON(roll), "roll", game.user.id, publicAudience());
}
