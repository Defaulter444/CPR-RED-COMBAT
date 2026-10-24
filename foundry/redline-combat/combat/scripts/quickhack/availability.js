import { QUICKHACKS, getQuickhack } from "./catalog.js";
export const MODULE = "redline-combat";
export const LEGACY_MODULE = "pneuma-quickhack";
/** CPR's derived installation state includes installation through parent cyberware. */
export function quickhackTargetVisible(items, requireNeuroport) {
    return !requireNeuroport || Array.from(items).some(item => {
        const system = item.system;
        return item.type === "cyberware" && system.isInstalledInActor === true
            && (item.name?.trim().toLowerCase() === "neuroport"
                || system.type === "neuroport" && system.isFoundational === true);
    });
}
export function isQuickhackLauncher(item) {
    return item.type === "weapon" && [MODULE, LEGACY_MODULE].some(scope => item.flags?.[scope]?.action === "quickhack");
}
export function quickhackId(item) {
    for (const scope of [MODULE, LEGACY_MODULE]) {
        const id = item.flags?.[scope]?.quickhackId;
        if (typeof id === "string" && getQuickhack(id))
            return id;
    }
    return undefined;
}
/** The deck's native installation list is authoritative. REZ is not loading. */
export function availableQuickhacks(items, mode, enabled = true) {
    if (!enabled)
        return [];
    if (mode === "raw")
        return [...QUICKHACKS];
    if (mode !== "owned" && mode !== "loaded")
        return [];
    const installed = new Set(items.filter(item => item.type === "cyberdeck" && item.system.equipped === "equipped")
        .flatMap(deck => deck.system.installedItems?.list ?? []));
    const ids = new Set(items.filter(item => ["gear", "program"].includes(item.type) && (item.system.amount === undefined || item.system.amount > 0)
        && (mode === "owned" || item.type === "program" && !!item.id && installed.has(item.id))).map(quickhackId));
    return QUICKHACKS.filter(hack => ids.has(hack.id));
}
