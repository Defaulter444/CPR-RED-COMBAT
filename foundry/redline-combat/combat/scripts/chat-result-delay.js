import { registerNativeWrapper } from "./native-wrappers.js";
const MODULE = "redline-combat";
function collectResults(value, ids) {
    if (typeof value === "string") {
        for (const match of value.matchAll(/data-pneuma-roll-result="([^"]+)"/g))
            ids.add(match[1]);
    }
    else if (value && typeof value === "object") {
        for (const item of Object.values(value))
            collectResults(item, ids);
    }
}
function visibleResults(message) {
    const ids = new Set();
    collectResults(message.content, ids);
    collectResults(foundry.utils.getProperty(message, `flags.${MODULE}.attachedEffects`), ids);
    return ids;
}
export function registerChatResultDelay() {
    game.settings.register(MODULE, "chatResultDelay", {
        name: "Задержка результатов в чате", hint: "Задерживает показ результатов бросков в чате, чтобы сначала успела проиграться анимация Dice So Nice.",
        scope: "world", config: true, type: String, default: "0.0",
        // Decimal keys retain insertion order; integer object keys sort ahead of fractions.
        choices: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [(index / 2).toFixed(1), index ? `${index / 2} с` : "0 — выключено"])),
    });
    const cards = new Map();
    let ready = false;
    const delay = () => Math.max(0, Math.min(5, Number(game.settings.get(MODULE, "chatResultDelay")) || 0));
    let enabled = delay() > 0;
    const record = (message, historical = false) => {
        const ids = visibleResults(message);
        if (!ids.size)
            return 0;
        let results = cards.get(message.id);
        if (!results) {
            results = new Map();
            cards.set(message.id, results);
        }
        let until = 0;
        const deadline = historical || !ready ? 0 : Date.now() + delay() * 1000;
        for (const id of ids) {
            if (!results.has(id))
                results.set(id, deadline);
            until = Math.max(until, results.get(id));
        }
        return until;
    };
    const seed = () => { for (const message of game.messages ?? [])
        record(message, true); };
    const active = () => {
        const next = delay() > 0;
        if (next !== enabled) {
            cards.clear();
            enabled = next;
            if (enabled)
                seed();
        }
        return enabled;
    };
    for (const hook of ["createChatMessage", "updateChatMessage"])
        Hooks.on(hook, (message) => {
            if (active() && message.id)
                record(message);
        });
    Hooks.on("updateSetting", (setting) => { if (setting.key === MODULE + ".chatResultDelay")
        active(); });
    Hooks.once("ready", async () => {
        if (active())
            seed();
        ready = true;
        // Foundry v12 awaits getHTML before inserting/replacing a chat card. Delay that
        // boundary so native and asynchronous module render hooks still run normally.
        const prototype = CONFIG.ChatMessage.documentClass.prototype;
        registerNativeWrapper(prototype, "getHTML", async function (wrapped, ...args) {
            if (!active() || !this.id || !this.visible || this.isContentVisible === false || (this.blind && !game.user?.isGM))
                return wrapped(...args);
            while (true) {
                if (!active())
                    break;
                const until = record(this);
                if (until <= Date.now())
                    break;
                await new Promise(resolve => setTimeout(resolve, until - Date.now()));
            }
            return wrapped(...args);
        }, "WRAPPER");
        // Preserve existing choices in the new dropdown; old 5.5/6-second values become 5.
        const normalized = delay().toFixed(1);
        if (game.user?.isGM && game.settings.get(MODULE, "chatResultDelay") !== normalized)
            await game.settings.set(MODULE, "chatResultDelay", normalized);
    });
    Hooks.on("deleteChatMessage", (message) => { if (message.id)
        cards.delete(message.id); });
}
