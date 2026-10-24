/** Bows retain their existing load-and-continue workflow. Exotic burst costs follow core. */
export function gunAmmo(item) {
    const data = item.system;
    if (!data.isRanged || ["bow", "thrownWeapon", "unarmed", "martialArts"].includes(data.weaponType ?? "")
        || (data.weaponType ?? "").toLowerCase().includes("melee") || !data.magazine || !(data.magazine.max > 0))
        return undefined;
    return { rounds: Math.max(0, Number(data.magazine.value) || 0), capacity: Number(data.magazine.max) };
}
export function ammoBlocks(item, mode) {
    const ammo = gunAmmo(item);
    return !!ammo && ammo.rounds < (["autofire", "suppressive"].includes(mode) ? 10 : 1);
}
const busy = new Set();
function reloadReason(item) {
    if (item.getMagazineSpace() <= 0)
        return "Магазин полон";
    const ammo = item.getInstalledItems("ammo")[0];
    return ammo && Number(foundry.utils.getProperty(ammo, "system.amount")) <= 0 ? "Нет запасных боеприпасов" : "";
}
export async function weaponAmmoAction(actor, id, action) {
    const item = actor.items.get(id);
    if (!actor.isOwner || !item || !gunAmmo(item) || busy.has(item.uuid))
        return;
    if (action === "reload") {
        const reason = reloadReason(item);
        if (reason) {
            ui.notifications.warn(reason);
            return;
        }
    }
    busy.add(item.uuid);
    try {
        await (action === "reload" ? item.reload() : item.load());
    }
    finally {
        busy.delete(item.uuid);
    }
}
export function refreshWeaponAmmo(root, actor) {
    root.querySelectorAll("[data-weapon-ammo]").forEach(row => {
        const item = actor.items.get(row.dataset.weaponAmmo);
        const ammo = item && gunAmmo(item);
        if (!item || !ammo)
            return;
        const count = row.querySelector("[data-weapon-ammo-count]");
        if (count) {
            const type = String(item._getLoadedAmmoProp?.("type") ?? "");
            const key = `CPR.global.ammo.type.${type}`;
            const translated = type ? game.i18n?.localize(key) : undefined;
            const label = type ? (translated && translated !== key ? translated : type) : "Не заряжено";
            count.querySelector('[data-ammo-type]').textContent = label;
            count.querySelector('[data-ammo-quantity]').textContent = `(${ammo.rounds} / ${ammo.capacity})`;
            count.title = `${label} (${ammo.rounds} / ${ammo.capacity})`;
        }
        const pending = busy.has(item.uuid);
        const showAmmo = ammo.rounds === 0 || row.dataset.ammoOpen === "true";
        row.querySelectorAll("[data-attack-mode]").forEach(button => {
            const blocked = ammoBlocks(item, button.dataset.attackMode);
            button.setAttribute("aria-disabled", String(blocked || pending || button.dataset.unavailable === "true"));
            // Keep the weapon name focusable/right-clickable even when empty.
            if (!button.classList.contains("combat-weapon-name")) {
                button.disabled = blocked || pending || button.dataset.unavailable === "true";
                button.hidden = showAmmo;
            }
            button.title = blocked ? (["autofire", "suppressive"].includes(button.dataset.attackMode) ? "Нужно 10 патронов" : "Пусто — ПКМ для перезарядки") : button.dataset.originalTitle;
        });
        const menu = row.querySelector(".combat-ammo-menu");
        menu.hidden = !showAmmo;
        const reason = reloadReason(item);
        const reload = menu.querySelector('[data-ammo-action="reload"]');
        reload.disabled = !actor.isOwner || pending || !!reason;
        reload.title = reason || "Перезарядить текущими боеприпасами";
        menu.querySelector('[data-ammo-action="change"]').disabled = !actor.isOwner || pending;
    });
}
export function bindWeaponAmmo(root, actor) {
    root.querySelector('.pneuma-target-menu .combat-heading')?.addEventListener('mouseenter', () => refreshWeaponAmmo(root, actor));
    root.querySelectorAll("[data-weapon-ammo]").forEach(row => {
        const name = row.querySelector(".combat-weapon-name");
        row.querySelectorAll("[data-attack-mode]").forEach(button => {
            button.dataset.originalTitle = button.title;
            button.dataset.unavailable = String(button.disabled);
        });
        name.disabled = false;
        name.title += " — ПКМ для перезарядки";
        name.dataset.originalTitle = name.title;
        const toggle = (event) => {
            event.preventDefault();
            event.stopPropagation();
            row.dataset.ammoOpen = String(row.dataset.ammoOpen !== "true");
            refreshWeaponAmmo(root, actor);
        };
        name.addEventListener("contextmenu", toggle);
        name.addEventListener("keydown", event => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
                toggle(event);
            if (event.key === "Escape") {
                row.dataset.ammoOpen = "false";
                refreshWeaponAmmo(root, actor);
            }
        });
        row.querySelectorAll("[data-ammo-action]").forEach(button => button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (button.disabled)
                return;
            try {
                const operation = weaponAmmoAction(actor, row.dataset.weaponAmmo, button.dataset.ammoAction);
                refreshWeaponAmmo(root, actor);
                await operation;
                row.dataset.ammoOpen = "false";
            }
            catch (error) {
                ui.notifications.error(error instanceof Error ? error.message : String(error));
            }
            finally {
                refreshWeaponAmmo(root, actor);
            }
        }));
    });
    refreshWeaponAmmo(root, actor);
}
