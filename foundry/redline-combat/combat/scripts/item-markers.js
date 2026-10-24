import { updateTouchesPath } from "./update-path.js";
const MODULE = "redline-combat";
const validKey = (key) => /^[a-z][a-z0-9_-]{0,63}$/.test(key) && !["constructor", "prototype", "__proto__"].includes(key);
/** Direct reads from the document's synchronized in-memory flags; no combat scans. */
export function getItemMarkers(item) {
    const value = foundry.utils.getProperty(item, "flags." + MODULE + ".itemMarkers");
    if (!value || typeof value !== "object")
        return {};
    return Object.fromEntries(Object.entries(value).filter(([key, marker]) => validKey(key) && marker && typeof marker.label === "string")
        .map(([key, marker]) => [key, { label: marker.label, ...(typeof marker.description === "string" ? { description: marker.description } : {}) }]));
}
/** Stable caller-owned keys make repeated writes idempotent and preserve other markers. */
export async function setItemMarker(item, key, marker) {
    if (!item.isOwner)
        throw new Error("Метки предмета может менять только его владелец или Мастер.");
    if (!validKey(key) || !marker || typeof marker.label !== "string" || !marker.label.trim()
        || marker.label.length > 80 || (marker.description !== undefined && (typeof marker.description !== "string" || marker.description.length > 500)))
        throw new Error("Некорректная метка предмета.");
    const clean = { label: marker.label.trim(), description: marker.description ?? "" };
    if (JSON.stringify(getItemMarkers(item)[key]) === JSON.stringify(clean))
        return;
    await item.update({ ["flags." + MODULE + ".itemMarkers." + key]: clean });
}
export async function clearItemMarker(item, key) {
    if (!item.isOwner)
        throw new Error("Метки предмета может менять только его владелец или Мастер.");
    if (!validKey(key))
        throw new Error("Некорректный ключ метки предмета.");
    if (!(key in getItemMarkers(item)))
        return;
    await item.update({ ["flags." + MODULE + ".itemMarkers.-=" + key]: null });
}
/** Reusable, text-safe renderer. Pass the name element, never the entire sheet. */
export function renderItemMarkers(target, item) {
    target.querySelectorAll(":scope > .pneuma-item-markers").forEach(node => node.remove());
    const markers = Object.entries(getItemMarkers(item));
    if (!markers.length)
        return;
    const group = document.createElement("span");
    group.className = "pneuma-item-markers";
    for (const [key, marker] of markers) {
        const badge = document.createElement("span");
        badge.className = "pneuma-item-marker";
        badge.dataset.itemMarker = key;
        badge.textContent = marker.label;
        if (marker.description)
            badge.title = marker.description;
        group.append(badge);
    }
    target.append(group);
}
export function decorateItemList(root, actor) {
    root.querySelectorAll(".item-name, .weapon-name, a.name[data-item-id], .combat-weapon-name[data-item-id]").forEach(target => {
        // Weapon-name already includes the native name anchor.
        if (target.matches("a.name") && target.closest(".weapon-name, .item-name"))
            return;
        const id = target.closest("[data-item-id]")?.dataset.itemId;
        const item = id && actor.items.get(id);
        if (item)
            renderItemMarkers(target, item);
    });
}
export function registerItemMarkers() {
    const module = game.modules.get(MODULE);
    module.api = { ...module.api, itemMarkers: Object.freeze({
            get: getItemMarkers, set: setItemMarker, clear: clearItemMarker,
            render: renderItemMarkers, decorate: decorateItemList,
            presets: Object.freeze({ used: Object.freeze({ label: "Использовано" }), disabled: Object.freeze({ label: "Отключено" }) }),
        }) };
    Hooks.on("renderActorSheet", (sheet, html) => {
        if (html[0])
            decorateItemList(html[0], sheet.actor);
    });
    Hooks.on("updateItem", (item, changes) => {
        if (!updateTouchesPath(changes, "flags.redline-combat.itemMarkers"))
            return;
        // Native document updates refresh actor sheets; the open CTH also needs rebuilding.
        const hud = canvas.tokens?.hud;
        if (item.parent && hud?.rendered)
            hud.render(true);
    });
}
