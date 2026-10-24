import { findNativeItem } from "./native-lookup.js";
export const stabilizationStates = [{ name: "Lightly Wounded", dv: 10 }, { name: "Seriously Wounded", dv: 13 }, { name: "Mortally Wounded", dv: 15 }];
export const stabilizationSkills = ["First Aid", "Paramedic"];
export function stabilizationDifficulty(hp, max) {
    return stabilizationStates[hp < 1 ? 2 : hp < Math.ceil(max / 2) ? 1 : 0].dv;
}
export function permanentQuickFix(injury) { return foundry.utils.getProperty(injury, "system.treatment.type") === "quickFix"; }
/** Read CPR's injury data once for both patient actions and the roll reference. */
export function injuryTreatmentChoices(injury, location) {
    const result = [];
    for (const [stage, path, skills] of [["QuickFix", "quickFix", stabilizationSkills], ["Treatment", "treatment", ["Paramedic", "Surgery"]]]) {
        if (stage === "Treatment" && permanentQuickFix(injury))
            continue;
        for (const skill of skills) {
            const dv = Number(foundry.utils.getProperty(injury, "system." + path + ".dv" + skill.replace(" ", "")));
            if (Number.isFinite(dv) && dv > 0)
                result.push({ name: injury.name, skill, dv, stage, ...(location ? { location } : {}), permanent: stage === "QuickFix" && permanentQuickFix(injury) });
        }
    }
    return result;
}
export function nativeTreatmentSkill(actor, skill) {
    if (skill !== "Surgery") {
        const item = findNativeItem(actor.items, skill);
        return item && String(item.type) === "skill" ? { item, title: item.name, type: "skill" } : undefined;
    }
    const item = findNativeItem(actor.items, "Medtech");
    const abilities = foundry.utils.getProperty(item ?? {}, "system.abilities");
    const ability = abilities?.find(row => row.hasRoll && row.name === "Surgery Skill");
    return item && ability ? { item, title: ability.name, type: "roleAbility", subtype: "subRoleAbility" } : undefined;
}
