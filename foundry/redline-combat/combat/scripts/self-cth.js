import { tokenEncounter, displayedEncounter } from "./encounter.js";
import { empDisabled } from "./emp-rules.js";
const MODULE = "redline-combat";
/** GM ownership covers every token: retain target actions when acting as a different token. */
export function isSelfCTH(token, attacker) {
    return !["container", "blackIce", "demon"].includes(String(token?.actor?.type)) && !!token?.isOwner && (!game.user?.isGM || (token.controlled && (!attacker || attacker === token)));
}
export function hasSpeedware(actor) {
    return !!actor?.items.some(item => {
        if (String(item.type) !== "cyberware" || !foundry.utils.getProperty(item, "system.isInstalledInActor") || empDisabled(item) || foundry.utils.getProperty(item, "flags.redline-combat.itemMarkers.disabled"))
            return false;
        const source = String(foundry.utils.getProperty(item, "_stats.compendiumSource") ?? foundry.utils.getProperty(item, "flags.core.sourceId") ?? "");
        return ["UX79WfUt7Yungbx7", "nSdoCKRscSOeaZUH"].some(id => source.endsWith("." + id))
            || ["sandevistan", "kerenzikov"].some(name => (item.name ?? "").toLowerCase().includes(name));
    });
}
function participant(token, combat = displayedEncounter(token.document.parent?.id)) {
    if (!combat?.started)
        return;
    const combatant = combat.combatants.find(entry => entry.token?.uuid === token.document.uuid);
    return combatant && combatant.initiative !== null && combatant.initiative !== undefined ? { combat, combatant } : undefined;
}
export function selfInitiativeControl(token) {
    const enabled = game.settings.get(MODULE, "pneumaHomebrew") && token.isOwner && hasSpeedware(token.actor ?? undefined);
    const available = enabled && !!participant(token);
    return { show: available, disabled: !available, title: available ? "Перебросить инициативу — тратит действие (домашнее правило)" : "Перебросить инициативу — нужна инициатива в начатом бою; тратит действие" };
}
const pending = new Set();
export async function rerollSelfInitiative(token) {
    if (!game.settings.get(MODULE, "pneumaHomebrew") || !token.isOwner || !hasSpeedware(token.actor ?? undefined))
        throw Error("Для переброса инициативы нужны домашнее правило, владение токеном и установленный исправный спидвар.");
    const entry = participant(token, tokenEncounter(token.document.parent?.id, [token.document.uuid]));
    if (!entry)
        throw Error("Начните бой и бросьте инициативу, прежде чем перебрасывать её спидваром.");
    const key = entry.combat.uuid + ":" + entry.combatant.id;
    if (pending.has(key))
        return;
    pending.add(key);
    try {
        // Native CPR handles REF, initiative effects, critical dice, chat, and preserving the acting combatant.
        await entry.combat.rollInitiative([entry.combatant.id], { updateTurn: true });
    }
    finally {
        pending.delete(key);
    }
}
export function registerSelfCTH() {
    const refresh = () => { const hud = canvas.tokens?.hud; if (hud?.object && hud.rendered)
        hud.render(true); };
    game.settings.register(MODULE, "pneumaHomebrew", { name: "Спидвар позволяет перебросить инициативу", hint: "Установленный исправный спидвар позволяет действием перебросить инициативу из собственного меню токена. Остальные домашние правила настраиваются отдельно.", scope: "world", config: true, type: Boolean, default: false, onChange: refresh });
    for (const hook of ["createItem", "updateItem", "deleteItem"])
        Hooks.on(hook, (item) => { if (item.parent?.uuid === canvas.tokens?.hud?.object?.actor?.uuid)
            refresh(); });
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
        Hooks.on(hook, (effect) => { if (effect.parent?.uuid === canvas.tokens?.hud?.object?.actor?.uuid)
            refresh(); });
    Hooks.on("updateActor", (actor) => { if (actor.uuid === canvas.tokens?.hud?.object?.actor?.uuid)
        refresh(); });
    for (const hook of ["updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"])
        Hooks.on(hook, refresh);
}
