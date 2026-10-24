import { empDisabled } from "./emp-rules.js";
/** Share native equipment eligibility between attack controls and DV previews. */
export function availableWeapons(items) {
    const available = new Set();
    const add = (item) => {
        if (empDisabled(item))
            return;
        if (item.type === "weapon" || (item.type === "cyberware" && item.system.isWeapon)
            || (item.type === "itemUpgrade" && item.system.modifiers?.secondaryWeapon?.configured))
            available.add(item);
    };
    for (const item of items) {
        if (item.system.equipped !== "equipped" && !(item.type === "cyberware"
            && (item.system.isInstalledInActor ?? item.system.isInstalled)))
            continue;
        add(item);
        for (const upgrade of item.system.upgrades ?? []) {
            const attachment = items.find(candidate => candidate.id === upgrade._id);
            if (attachment?.system.isInstalled)
                add(attachment);
        }
    }
    return [...available];
}
