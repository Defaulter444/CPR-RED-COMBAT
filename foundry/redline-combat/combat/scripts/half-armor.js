/** Native CPR rounds remaining SP with Math.round; at 50%, odd integer SP rounds up. */
export function armorIgnorePercent(original, half, interact) {
    if (interact === false)
        return 100;
    if (half === undefined || original >= 100)
        return original;
    return half ? Math.max(50, original) : original === 50 ? 0 : original;
}
export function halfArmorControl(original, interact = true) {
    return '<div class="pneuma-armor-controls"><button type="button" class="pneuma-interact-armor" aria-pressed="' + interact + '" title="Учитывать SP брони и её износ">Учитывать броню</button>'
        + '<button type="button" class="pneuma-half-armor" aria-pressed="' + (original === 50) + '" data-original-ignore="' + original + '"' + (!interact || original >= 100 ? ' disabled' : '') + ' title="При нанесении урона использовать половину SP брони с округлением вверх">Половина SP</button></div>';
}
function selected(event, selector) {
    const element = event.currentTarget;
    const card = element?.closest(".pneuma-manual-card, .pneuma-aoe-card, .message");
    const button = card?.querySelector(selector);
    return button ? button.getAttribute("aria-pressed") === "true" : undefined;
}
export const halfArmorSelected = (event) => selected(event, ".pneuma-half-armor");
export const interactArmorSelected = (event) => selected(event, ".pneuma-interact-armor");
export function bindHalfArmor(root, show = true) {
    if (!show) {
        root.querySelectorAll(".pneuma-armor-controls, .pneuma-half-armor").forEach(node => node.remove());
        return;
    }
    for (const link of Array.from(root.querySelectorAll('[data-action="applyDamage"]'))) {
        const card = link.closest(".rollcard") ?? link.parentElement;
        if (!card.querySelector(".pneuma-half-armor"))
            card.insertAdjacentHTML("beforeend", halfArmorControl(Number(link.dataset.ignoreArmorPercent) || 0));
    }
    // Upgrade older saved cards that only contained Half Armor SP.
    for (const half of Array.from(root.querySelectorAll(".pneuma-half-armor"))) {
        if (!half.closest(".pneuma-armor-controls")) {
            half.insertAdjacentHTML("beforebegin", halfArmorControl(Number(half.dataset.originalIgnore) || 0));
            half.remove();
        }
    }
    for (const controls of Array.from(root.querySelectorAll(".pneuma-armor-controls"))) {
        if (controls.dataset.bound)
            continue;
        controls.dataset.bound = "true";
        const half = controls.querySelector(".pneuma-half-armor"), interact = controls.querySelector(".pneuma-interact-armor");
        const links = Array.from((controls.closest(".rollcard") ?? controls.parentElement).querySelectorAll('[data-action="applyDamage"]'));
        const original = links.map(link => ({ link, ignore: Number(link.dataset.ignoreArmorPercent) || 0, ablation: link.dataset.ablation ?? "0" }));
        const update = () => {
            const enabled = interact.getAttribute("aria-pressed") === "true";
            half.disabled = !enabled || Number(half.dataset.originalIgnore) >= 100;
            for (const { link, ignore, ablation } of original) {
                link.dataset.ignoreArmorPercent = String(armorIgnorePercent(ignore, half.getAttribute("aria-pressed") === "true", enabled));
                link.dataset.ablation = enabled ? ablation : "0";
            }
        };
        for (const button of [interact, half])
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                if (button.disabled)
                    return;
                button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
                update();
            });
        update();
    }
}
export function registerHalfArmor() {
    game.settings.register("redline-combat", "showArmorControls", { name: "Показывать кнопки брони в обычных карточках урона", hint: "Показывать всем кнопки «Учитывать броню» и «Половина SP» в обычных карточках урона. По умолчанию выключено. В бросках урона из меню бросков они видны всегда.", scope: "world", config: true, type: Boolean, default: false, onChange: () => ui.chat?.render(false) });
    Hooks.on("renderChatMessage", (message, html) => {
        const root = html[0];
        if (!root)
            return;
        const manual = foundry.utils.getProperty(message, "flags.redline-combat.manualRoll.kind") === "damage";
        const show = manual || game.settings.get("redline-combat", "showArmorControls");
        const values = ["exchange.damage", "aoe.exchange.damage", "manualRoll.damage"].map(path => foundry.utils.getProperty(message, "flags.redline-combat." + path + ".result.values")).find(Boolean);
        if (show && values)
            for (const result of Array.from(root.querySelectorAll(".pneuma-damage-result"))) {
                if (!result.querySelector(".pneuma-half-armor"))
                    result.insertAdjacentHTML("beforeend", halfArmorControl(values.ignorePercent, values.interactArmor !== false));
            }
        bindHalfArmor(root, show);
    });
}
