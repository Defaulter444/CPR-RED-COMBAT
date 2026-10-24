import { nativeItemMatches } from "../native-lookup.js";
export function isMolotov(item) {
    return item.system.weaponType === "thrownWeapon" && nativeItemMatches(item, "Molotov Cocktail");
}
export function areaKind(item, mode) {
    const s = item.system;
    if (mode === "suppressive")
        return s.isRanged && (s.fireModes?.suppressiveFire || ["smg", "heavySmg", "assaultRifle"].includes(s.weaponType ?? "")) ? "suppression" : undefined;
    if (mode !== "attack")
        return;
    if (isMolotov(item))
        return "explosive";
    if (item.type === "ammo" && s.variety === "grenade" || ["grenadeLauncher", "rocketLauncher"].includes(s.weaponType ?? ""))
        return "explosive";
    if (s.weaponType === "shotgun" && item._getLoadedAmmoProp?.("variety") === "shotgunShell")
        return "shell";
}
/** CPR confirmRoll starts discharge without awaiting it; wait for that native write before publishing. */
export async function confirmAreaRoll(item, roll) {
    let discharge;
    const view = new Proxy(item, { get(target, key) {
            const value = Reflect.get(target, key, target);
            if (key === "dischargeItem" && typeof value === "function")
                return (...args) => {
                    discharge = Promise.resolve(value.apply(target, args));
                    return discharge;
                };
            return typeof value === "function" ? value.bind(target) : value;
        } });
    const confirmed = await item.confirmRoll.call(view, roll);
    if (discharge)
        await discharge;
    return confirmed;
}
