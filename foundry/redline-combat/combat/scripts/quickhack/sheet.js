import { isQuickhackLauncher } from "./availability.js";
import { itemView } from "./content.js";
import { enabled } from "./settings.js";
/** Reuse CPR's weapon-row controls, as the standalone QuickHack module did. */
export function registerQuickhackSheet(execute) {
    Hooks.on("renderActorSheet", (app, html) => {
        const root = html[0];
        if (!root)
            return;
        for (const row of Array.from(root.querySelectorAll(".weapon-grid[data-item-id]"))) {
            const item = app.actor.items.get(row.dataset.itemId);
            if (!item || !isQuickhackLauncher(itemView(item)))
                continue;
            for (const [roll, action, title, icon] of [
                ["attack", "jack-in", "Подключиться", "fa-network-wired"],
                ["damage", "quickhack", "Цель квикхака", "fa-microchip"],
            ]) {
                const control = row.querySelector(`[data-roll-type="${roll}"]`);
                if (!control)
                    continue;
                control.dataset.combatToolsQuickhack = action;
                control.title = title;
                control.dataset.tooltip = title;
                control.hidden = !enabled();
                const glyph = control.querySelector("i");
                if (glyph)
                    glyph.className = `fas ${icon} fa-fw red-fg`;
            }
            row.querySelectorAll(".weapon-mode").forEach(control => { control.hidden = true; });
        }
        // Capture before CPR's native attack/damage listeners, including after a setting change.
        root.addEventListener("click", event => {
            const control = event.target.closest("[data-combat-tools-quickhack]");
            if (!control)
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (enabled())
                void execute(control.dataset.combatToolsQuickhack, app.actor.uuid, undefined, event.shiftKey)
                    .catch(error => { console.error(error); ui.notifications.error("Квикхак не удался. Подробности в консоли."); });
        }, true);
    });
}
