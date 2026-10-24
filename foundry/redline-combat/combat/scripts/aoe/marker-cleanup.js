import { primaryGM } from "../shared.js";
const M = "redline-combat";
/** Delete grenade attack templates for this encounter, even if their chat was deleted. */
export async function clearGrenadeMarkers(combat) {
    if (!combat.id || game.user?.id !== primaryGM()?.id)
        return;
    for (const scene of game.scenes ?? []) {
        const ids = scene.templates.filter(template => {
            const flags = foundry.utils.getProperty(template, `flags.${M}`);
            if (!flags)
                return false;
            if (flags.grenadeCombat !== undefined)
                return flags.grenadeCombat === combat.id;
            // Existing templates can still identify their encounter through the source card.
            const source = flags.areaMessage ? game.messages?.get(flags.areaMessage) : undefined;
            const attack = source && foundry.utils.getProperty(source, `flags.${M}.aoe`);
            return attack?.kind === "explosive" && attack.exchange?.combatId === combat.id;
        }).map(template => template.id);
        if (ids.length)
            await scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
    }
}
