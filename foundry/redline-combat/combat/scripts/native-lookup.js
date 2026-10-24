/** Identities verified against CPR v0.92.4 (Foundry v12). */
const identities = {
    "Molotov Cocktail": { id: "1004Olp4DHhMOc1z", type: "weapon" },
    "Evasion": { id: "CzaAkwAjPDplz4nn", key: "skill.evasion", type: "skill" },
    "Concentration": { id: "f319Qi6jITQMATyG", key: "skill.concentration", type: "skill" },
    "Brawling": { id: "fPnx3mKaMiRgGavI", key: "skill.brawling", type: "skill" },
    "Cybertech": { id: "LWy8XHIR3JKL1R0i", key: "skill.cybertech", type: "skill" },
    "Resist Torture/Drugs": { id: "4nZAn6M44PYI8CU2", key: "skill.resistTortureOrDrugs", type: "skill" },
    "Medtech": { id: "8wRoRsRQnpt3Je00", type: "role" },
    "Speedheal": { id: "3xF0I3J9RnSxf4Ux", type: "drug" },
    "Netrunner": { id: "g5S5E8UG1QJ4yFsp", type: "role" },
    "Targeting Scope": { id: "wFp72x2FXhipZXPj", type: "cyberware" }
};
const normalize = (name) => name.trim().toLowerCase();
function sourceMatches(item, id) {
    return ["_stats.compendiumSource", "flags.core.sourceId"].some(path => {
        const source = path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, item);
        return typeof source === "string" && source.startsWith("Compendium.") && source.endsWith("." + id);
    });
}
export function nativeItemMatches(item, name) {
    const identity = identities[name];
    if (!identity || item.type !== identity.type)
        return false;
    const translated = identity.key ? (typeof game !== "undefined" ? game.i18n?.localize("CPR.global.itemType." + identity.key) : undefined) ?? name : name;
    return sourceMatches(item, identity.id) || [translated, name].some(value => normalize(value) === normalize(item.name ?? ""))
        || name === "Speedheal" && /^speedheal(?:$|[\s\p{P}\p{S}])/u.test(normalize(item.name ?? ""));
}
export function findNativeItem(items, name) {
    const identity = identities[name], rows = Array.from(items);
    if (!identity)
        return rows.find(item => normalize(item.name ?? "") === normalize(name));
    return rows.find(item => item.type === identity.type && sourceMatches(item, identity.id))
        ?? rows.find(item => nativeItemMatches(item, name));
}
export const nativeDVIds = {
    "DV Assault Rifle (Autofire)": "ZBKT58h3tze40mM5",
    "DV Assault Rifle": "4lTC5spAtqIyGqkl",
    "DV Bows & Crossbows": "DKIljg4yhQY6ptWr",
    "DV Generic": "Wu14Pqln0Mi8tED5",
    "DV Grenade Launcher": "dEya6iyAygnpzXDN",
    "DV Long-Barrel Pistol": "O9sHkNja0lU0lMaW",
    "DV Pistol": "K0hQSCf9jJL8YG2r",
    "DV Rocket Launcher": "Ff8v8cOxftPFzHck",
    "DV Shotgun (Slug)": "bMwkrapQscYWYhYh",
    "DV SMG (Autofire)": "GPefUyokQkZk461P",
    "DV SMG": "kWQKqfIEnkc92gxY",
    "DV Sniper Rifle": "RlYGlBahIzxquB9t",
    "DV Thrown Weapon": "3L5kZ8iP1Xxb6yfQ"
};
export const nativeCriticalIds = { head: "QiwaqQtocypL0FXG", body: "n7IlIvMfg7yW1OoE" };
export async function nativeCriticalTable(pack, location) {
    if (pack !== "cyberpunk-red-core.internal_critical-injury-tables")
        return;
    return await game.packs.get(pack)?.getDocument(nativeCriticalIds[location]);
}
