import { displayedEncounter } from "./encounter.js";
import { forceOutEntries } from "./quickhack/force-out.js";
import { masterStatuses } from "./status-catalog.js";
const normalize = (name) => name.trim().toLowerCase();
export const lastingDrugs = [
    { name: "Black Lace", kind: "drug", icon: "fa-skull" },
    { name: "Blue Glass", kind: "drug", icon: "fa-gem" },
    { name: "Boost", kind: "drug", icon: "fa-brain" },
    { name: "Smash", kind: "drug", icon: "fa-wine-glass" },
    { name: "Synthcoke", kind: "drug", icon: "fa-bolt" },
    { name: "Berserker", kind: "drug", icon: "fa-hand-fist" },
    { name: "Prime Time", kind: "drug", icon: "fa-user-tie" },
    { name: "Sixgun", kind: "drug", icon: "fa-crosshairs" },
    { name: "Timewarp", kind: "drug", icon: "fa-clock" },
    { name: "Antibiotics", kind: "pharma", icon: "fa-capsules" },
    { name: "Stim", kind: "pharma", icon: "fa-syringe" },
    { name: "Surge", kind: "pharma", icon: "fa-eye" },
    { name: "Quick Fix", kind: "pharma", icon: "fa-kit-medical" },
    { name: "Sedative", kind: "pharma", icon: "fa-bed" },
    { name: "Veritas", kind: "pharma", icon: "fa-comment-medical" },
];
/** Native primary effects can be named differently from their item/status.
 * CPR v0.92.4 core + Hornet's Pharmacy; duration classification does not require
 * effect.duration.seconds (the native primary effects commonly leave it null). */
export function lastingDrugFor(name) {
    const base = normalize(name).replace(/(?: (?:addiction|addicted))? primary(?: effect)?$/, "");
    return lastingDrugs.find(drug => normalize(drug.name) === base || drug.name === "Antibiotics" && base === "antibiotic");
}
/** Read native effects without adding mechanics or treating inventory as active medication. */
export function collectHUDConditions(actor) {
    const medical = new Map(), situational = new Map();
    const drugs = new Set(), exposures = new Set();
    const add = (name, icon, injury = false, ids = []) => {
        name = game.i18n.localize(name);
        const definition = masterStatuses.find(row => ids.includes(row.id) || [row.name, row.binding?.itemName && row.binding.kind === "injury" ? row.binding.itemName : "", ...(row.binding?.effectNames ?? [])].some(alias => alias && normalize(alias) === normalize(name)));
        const title = definition?.name ?? game.i18n.localize(name);
        const key = normalize(title);
        if (/addiction|addicted/i.test(name) || /addiction/i.test(title))
            exposures.add("Addiction");
        const drug = lastingDrugFor(title) ?? lastingDrugFor(name);
        if (drug) {
            drugs.add(drug.name);
            return;
        }
        if (/addiction/i.test(title))
            return;
        if (definition?.group === "drugs" || definition?.group === "pharma" || definition?.group === "addiction" || /speed\s*heal|rapid?detox|radaway/i.test(title))
            return;
        if (/poison|biotoxin|radiation|on[ _-]?fire|incendiary|burning|unconscious/i.test(title)) {
            exposures.add(title);
            return;
        }
        if (/^EMP\b/i.test(title))
            return;
        if (title === "Netrunning")
            return; // Jacked In is sourced from the actual connection, not this marker.
        const row = { title, icon: icon ?? definition?.img, detail: title };
        const isMedical = injury || definition?.group === "head" || definition?.group === "body"
            || /^(Blinded|Deafened|Drowning|Lightly Wounded|Seriously Wounded|Mortally Wounded|Dead)$/.test(title);
        (isMedical ? medical : situational).set(key, row);
    };
    for (const item of actor.items)
        if (String(item.type) === "criticalInjury")
            add(item.name ?? "Травма", item.img, true);
    for (const effect of actor.allApplicableEffects()) {
        if (effect.disabled || effect.isSuppressed || foundry.utils.getProperty(effect, "system.isSuppressed"))
            continue;
        if (foundry.utils.getProperty(effect, "flags.redline-combat.grappleId") || foundry.utils.getProperty(effect, "flags.redline-combat.empItem"))
            continue;
        const name = effect.name ?? "Состояние";
        const ids = Array.from(effect.statuses ?? []);
        const localized = game.i18n.localize(name);
        const nativeDrug = lastingDrugFor(localized);
        const addiction = /^(.*) (?:addiction|addicted)$/i.exec(localized);
        // Read the enabled native AE itself, including status-free primary effects.
        // Addiction alone lights Addict, not a primary drug icon.
        if (foundry.utils.getProperty(effect, "flags.redline-combat.quickhackEffect") || ids.length || nativeDrug || addiction && lastingDrugFor(addiction[1]))
            add(name, effect.img, false, ids);
    }
    const combat = displayedEncounter();
    if (combat) {
        const connections = foundry.utils.getProperty(combat, "flags.redline-combat.quickhackConnections");
        if (Object.values(connections ?? {}).some(connection => connection.state === "active" && connection.sourceActorUuid === actor.uuid))
            exposures.add("Jacked In");
    }
    const incoming = forceOutEntries(actor);
    if (incoming.length)
        exposures.add("Neural Intrusion");
    return { medical: [...medical.values()], situational: [...situational.values()], drugs: [...drugs], exposures: [...exposures] };
}
