import { damageValues } from "./damage-flow.js";
import { nativeCard, rollHidden } from "./native-combat.js";
export async function rollSceneDamage(title, formula, settings) {
    const path = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
    const { CPRDamageRoll } = await import(path);
    const roll = new CPRDamageRoll(title, formula, "ranged");
    roll.isAimed = false;
    roll.location = "body";
    roll.rollCardExtraArgs = { ablationValue: settings.ablation, ignoreArmorPercent: settings.armor === "half" ? 50 : 0, ignoreBelowSP: 0, ammoVariety: "" };
    await rollHidden(roll);
    // Hazard damage has no weapon critical-injury rule; preserve its configured damage.
    roll.wasCritical = () => false;
    const html = await nativeCard(roll);
    return { roll, result: { html, values: { ...damageValues(html), ablation: settings.ablation, interactArmor: settings.armor !== "ignore", ignorePercent: settings.armor === "half" ? 50 : 0 }, sixes: 0 } };
}
export function sceneDamageExchange(title, target, name, damage) {
    return { attacker: target, defender: target, defenderActor: "", attackerName: title, defenderName: name, ranged: false, category: "Manual", title, total: 0, html: "", dice: [], rollMode: "roll", state: "resolved", damage, attackMode: "attack", location: "body", criticalMethod: "Ranged" };
}
