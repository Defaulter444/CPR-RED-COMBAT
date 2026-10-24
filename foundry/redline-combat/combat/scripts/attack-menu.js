import { findNativeItem } from "./native-lookup.js";
import { areaKind } from "./aoe/weapon.js";
import { gunAmmo, ammoBlocks } from "./weapon-ammo.js";
import { grappleWeaponBlocked } from "./grapple/state.js";
import { improvisedSource, thrownRollItem } from "./thrown-weapons.js";
import { isQuickhackLauncher } from "./quickhack/availability.js";
import { availableWeapons } from "./weapon-data.js";
/** Launcher ownership is not a RAW requirement. */
export function canShowQuickhack(items) {
    return !!findNativeItem(items, "Netrunner");
}
export function attackEntries(items) {
    const weapons = availableWeapons(items).filter(item => !isQuickhackLauncher(item)
        && item.name?.trim().toLowerCase() !== "quickhack")
        .filter(item => item.system.weaponType !== "thrownWeapon");
    const nameKey = (item) => (item.name ?? "").trim().toLowerCase();
    const ammoType = (item) => String(item._getLoadedAmmoProp?.("type") ?? "");
    const detail = (item) => {
        if (!item.system.isRanged)
            return "";
        const siblings = weapons.filter(other => nameKey(other) === nameKey(item));
        if (siblings.length < 2)
            return "";
        const type = ammoType(item), key = `CPR.global.ammo.type.${type}`;
        const translated = type ? game.i18n?.localize(key) : undefined;
        const label = type ? (translated && translated !== key ? translated : type) : "Не заряжено";
        const rounds = gunAmmo(item)?.rounds;
        const sameType = siblings.filter(other => ammoType(other) === type).length > 1;
        return label + (sameType && rounds !== undefined ? ` · ${rounds}/${item.system.magazine.max}` : "");
    };
    return weapons.map(item => ({ id: item.id, name: item.name, img: item.img, ammoDetail: detail(item),
        category: ["unarmed", "martialArts"].includes(item.system.weaponType ?? "") ? "brawling"
            : (item.system.weaponType ?? "").toLowerCase().includes("melee") ? "melee" : "attack",
        deferred: false, area: !!areaKind(item, "attack"),
        doubleAttack: Number(item.system.rof) === 2,
        gunAmmo: !!gunAmmo(item),
        brawling: ["unarmed", "martialArts"].includes(item.system.weaponType ?? ""),
        autofire: !!item.system.isRanged && (!!item.system.fireModes?.suppressiveFire
            || ["smg", "heavySmg", "assaultRifle"].includes(item.system.weaponType ?? "")),
    })).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
export function thrownEntries(items) {
    return items.filter(item => item.type === "weapon" && item.system.weaponType === "thrownWeapon")
        .map(item => ({ id: item.id, name: item.name, img: item.img, category: "thrown", thrown: true }));
}
export function grenadeEntries(items) {
    return items.filter(item => item.type === "ammo" && item.system.variety === "grenade" && Number(item.system.amount) > 0)
        .map(item => ({ id: item.id, name: item.name, img: item.img }));
}
const rolling = new Set();
export async function attackFromHUD(attacker, target, itemId, mode, event, count = 1) {
    const actor = attacker.actor;
    if (!actor?.isOwner || ["container", "blackIce", "demon"].includes(String(actor.type)) || !target.isVisible || !target.actor || ["container", "blackIce", "demon"].includes(String(target.actor.type))
        || canvas.tokens?.get(attacker.id) !== attacker || canvas.tokens.get(target.id) !== target
        || !attacker.can(game.user, "control"))
        return;
    const items = Array.from(actor.items);
    const item = [...attackEntries(items), ...thrownEntries(items).map(row => ({ ...row, autofire: false, deferred: false })),
        { id: "__improvised", category: "thrown", autofire: false, deferred: false }].find(row => row.id === itemId);
    if ((!item && !grenadeEntries(items).some(row => row.id === itemId)) || (["autofire", "suppressive"].includes(mode) && !item?.autofire))
        return;
    const originalItem = items.find(entry => entry.id === itemId);
    if (count !== 1 && count !== 2)
        return;
    if (count === 2 && (mode !== "attack" || Number(originalItem?.system.rof) !== 2 || item?.category === "thrown"))
        return;
    if (originalItem && ammoBlocks(originalItem, mode))
        return;
    if (originalItem && item?.category !== "thrown" && grappleWeaponBlocked(actor, originalItem))
        throw new Error("Персонаж в захвате не может пользоваться двуручным оружием.");
    const nativeItem = originalItem;
    if (nativeItem && mode === "aimed" && areaKind(nativeItem, "attack"))
        throw Error("Атаку по площади нельзя сделать прицельной.");
    const kind = nativeItem ? areaKind(nativeItem, mode) : undefined;
    if (!item && !kind)
        return;
    if (rolling.has(actor.uuid))
        return;
    rolling.add(actor.uuid);
    try {
        for (let shot = 0; shot < count; shot++) {
            // Recheck state after the first native workflow; it may consume ammo or change tokens.
            if (shot) {
                const current = Array.from(actor.items).find(entry => entry.id === itemId);
                if (!actor.isOwner || !target.isVisible || !target.actor || canvas.tokens?.get(attacker.id) !== attacker || canvas.tokens.get(target.id) !== target || !attacker.can(game.user, "control")
                    || !current || Number(current.system.rof) !== 2 || !attackEntries(Array.from(actor.items)).some(entry => entry.id === itemId) || ammoBlocks(current, mode))
                    return;
                if (grappleWeaponBlocked(actor, current))
                    throw Error("Персонаж в захвате не может пользоваться двуручным оружием.");
            }
            // Restore the captured attacker/defender before entering the native workflow.
            if (!attacker.control({ releaseOthers: true }))
                return;
            target.setTarget(true, { releaseOthers: true });
            if (kind) {
                const { startAreaAttack } = await import("./aoe/workflow.js");
                const result = await startAreaAttack(attacker, target, itemId, mode, !!event.shiftKey);
                if (!result || shot === count - 1)
                    return result;
                continue;
            }
            const { startCombatExchange } = await import("./combat-resolution.js");
            if (item?.category === "thrown") {
                const source = itemId === "__improvised" ? await improvisedSource() : actor.items.get(itemId).toObject();
                return await startCombatExchange(attacker, target, itemId, "attack", event, { item: thrownRollItem(source, actor), source, improvised: itemId === "__improvised" });
            }
            else {
                const result = await startCombatExchange(attacker, target, itemId, mode, event);
                if (!result || shot === count - 1)
                    return result;
            }
        }
    }
    finally {
        rolling.delete(actor.uuid);
    }
}
/** Update duplicate labels after native reload/load and inventory changes. */
export function refreshAttackAmmoLabels(root, actor) {
    const rows = attackEntries(Array.from(actor.items));
    root.querySelectorAll('[data-weapon-ammo-detail]').forEach(label => {
        const id = label.closest('[data-item-id]')?.dataset.itemId;
        const detail = rows.find(row => row.id === id)?.ammoDetail ?? "";
        label.textContent = detail;
        label.hidden = !detail;
    });
}
