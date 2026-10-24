/** Foundry updates may mix nested objects, dotted keys and -= deletion keys. */
export function updateTouchesPath(changes, path) {
    const visit = (value, prefix = "") => Object.entries(value).some(([key, next]) => {
        const deleted = key.split(".").some(part => part.startsWith("-="));
        const full = prefix + key.split(".").map(part => part.replace(/^-=/, "")).join(".");
        if (full === path || full.startsWith(path + "."))
            return true;
        if (!path.startsWith(full + "."))
            return false;
        if (deleted || next === null || typeof next !== "object")
            return true;
        return visit(next, full + ".");
    });
    return visit(changes);
}
/** Position and movement-accounting changes do not alter actor medical data or bar portraits. */
export function tokenPositionOnly(changes, prefix = "") {
    return Object.entries(changes).every(([key, value]) => {
        const path = prefix ? prefix + "." + key : key;
        if (["x", "y", "elevation", "rotation", "_regions"].includes(path))
            return true;
        if (["flags.redline-combat.movement", "flags.redline-combat.aoeEscape", "flags.pneuma-scenetools.vehicleFootprint"].some(root => path === root || path.startsWith(root + ".")))
            return true;
        return !!value && typeof value === "object" && !Array.isArray(value) && tokenPositionOnly(value, path);
    });
}
