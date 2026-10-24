import { combatToolsBlocker } from "./availability-gate.js";
/** Shared visual marker for explicitly identified Pneuma homebrew controls. */
const ICON = "modules/redline-combat/combat/styles/pneuma-homebrew.png";
const TITLE = "Домашние правила Pneuma";
export function markHomebrew(label) {
    const existing = label.querySelector(".pneuma-homebrew-badge");
    if (existing)
        return existing;
    const badge = document.createElement("span");
    badge.className = "pneuma-homebrew-badge";
    badge.tabIndex = 0;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", TITLE);
    const image = document.createElement("img");
    image.src = ICON;
    image.alt = "";
    image.width = 18;
    image.height = 18;
    badge.append(image);
    // Native TooltipManager handles positioning, screen edges and hover delay.
    badge.dataset.tooltip = `<div class="pneuma-homebrew-preview"><img src="${ICON}" width="160" height="143" alt=""><strong>${TITLE}</strong></div>`;
    badge.dataset.tooltipClass = "pneuma-homebrew-tooltip";
    badge.addEventListener("focus", () => game.tooltip?.activate(badge));
    badge.addEventListener("blur", () => game.tooltip?.deactivate());
    badge.addEventListener("keydown", event => { if (event.key === "Escape")
        game.tooltip?.deactivate(); });
    // Clicking an informational badge in a label must not toggle its setting.
    badge.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
    label.append(badge);
    return badge;
}
function decorateSettings(root) {
    for (const [key, homebrewValues] of [
        ["maNoAblation", null],
        ["pneumaHomebrew", null],
        ["quickhackMode", ["owned", "loaded"]],
    ]) {
        const input = root.querySelector(`[name="redline-combat.${key}"]`);
        const label = input?.closest(".form-group")?.querySelector("label");
        if (!input || !label)
            continue;
        const sync = () => {
            const marked = !homebrewValues || homebrewValues.includes(input.value);
            const badge = label.querySelector(".pneuma-homebrew-badge");
            if (marked)
                markHomebrew(label);
            else if (badge) {
                if (game.tooltip?.element === badge)
                    game.tooltip.deactivate();
                badge.remove();
            }
        };
        if (!input.dataset.pneumaHomebrewBound) {
            input.addEventListener("change", sync);
            input.dataset.pneumaHomebrewBound = "true";
        }
        sync();
    }
}
Hooks.once("init", () => {
    if (combatToolsBlocker())
        return;
    if (game.system?.id !== "cyberpunk-red-core")
        return;
    Hooks.on("renderSettingsConfig", (_app, html) => {
        if (html[0])
            decorateSettings(html[0]);
    });
    Hooks.on("renderApplication", (app, html) => {
        const root = html[0];
        if (!root)
            return;
        // Explicit attribute is available to future homebrew forms without name matching.
        root.querySelectorAll("[data-pneuma-homebrew]").forEach(markHomebrew);
        if (app.options.id === "pneuma-evasion-homebrew") {
            const soloLabel = root.querySelector('[name="solo.qualifies"]')?.closest("tr")?.querySelector('th[scope="row"]');
            if (soloLabel)
                markHomebrew(soloLabel);
        }
    });
});
