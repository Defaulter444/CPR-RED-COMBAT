import { checkedLuck } from "./evasion-rules.js";
import { withActorMutation } from "./actor-mutation.js";
import { registerNativeWrapper } from "./native-wrappers.js";
let api;
const hiddenDice = new WeakSet();
const diceUsers = new WeakMap();
export function messageDiceAudience(message) {
    const whisper = (message.whisper ?? []).map(value => typeof value === "string" ? value
        : value && typeof value === "object" && "id" in value ? value.id : undefined)
        .filter((id) => typeof id === "string");
    return { whisper, blind: !!message.blind };
}
const diceAudiences = new WeakMap();
const styledDiceAPIs = new WeakSet();
/** Card recipients take precedence over the replaying client's current roll mode. */
export async function showDiceAs(roll, mode, userId, audience) {
    const { Dice } = await nativeAPI();
    const user = (userId ? game.users?.get(userId) : undefined);
    const dice3d = game.dice3d;
    if (!audience && userId && (mode === "selfroll" || mode === "gmroll")) {
        const recipients = mode === "selfroll" ? [userId]
            : [...Array.from(game.users?.values() ?? []).filter(user => user.isGM).map(user => user.id), userId];
        audience = { whisper: [...new Set(recipients)], blind: false };
    }
    if ((audience || user && game.modules?.get("dice-so-nice")?.active) && dice3d?.showForRoll) {
        if (!styledDiceAPIs.has(dice3d)) {
            registerNativeWrapper(dice3d, "showForRoll", function (wrapped, die, originalUser, ...args) {
                const visibility = diceAudiences.get(die);
                if (visibility) {
                    const recipients = visibility.blind
                        ? (visibility.whisper.length ? visibility.whisper : Array.from(game.users?.values() ?? []).map(user => user.id))
                            .filter(id => game.users?.get(id)?.isGM)
                        : visibility.whisper;
                    // DSN uses null for public synchronization, and "blind" suppresses only
                    // the invoking client's animation. Remote visibility is the recipient list.
                    args[1] = recipients.length || visibility.blind ? recipients : null;
                    args[2] = visibility.blind ? !recipients.includes(game.user.id)
                        : recipients.length > 0 && !recipients.includes(game.user.id);
                }
                return wrapped(die, diceUsers.get(die) ?? originalUser, ...args);
            }, "WRAPPER");
            styledDiceAPIs.add(dice3d);
        }
        if (user && game.modules?.get("dice-so-nice")?.active)
            diceUsers.set(roll, user);
        if (audience)
            diceAudiences.set(roll, audience);
    }
    try {
        await Dice.handle3dDice(roll, mode);
    }
    finally {
        diceUsers.delete(roll);
        diceAudiences.delete(roll);
    }
}
export async function showSavedDice(dice, mode, userId, audience) {
    await Promise.all(dice.map(json => showDiceAs(Roll.fromJSON(json), mode, userId, audience)));
}
/** Reuse CPR's module identity: Forge's CDN import is distinct from the local URL. */
export function nativeDiceHandlerURL() {
    const systemPath = "/systems/cyberpunk-red-core/";
    const handlerPath = "modules/extern/cpr-dice-handler.js";
    // Script elements survive resource-timing buffer eviction and identify the running system.
    for (const script of Array.from(globalThis.document?.querySelectorAll?.("script[type='module'][src]") ?? [])) {
        const url = new URL(script.src);
        if (url.pathname.includes(systemPath) && url.pathname.endsWith("/cpr.js")) {
            return new URL(handlerPath, url).href;
        }
    }
    for (const entry of globalThis.performance?.getEntriesByType("resource") ?? []) {
        const url = new URL(entry.name);
        if (url.pathname.includes(systemPath) && url.pathname.endsWith("/" + handlerPath))
            return entry.name;
    }
    return systemPath + handlerPath;
}
export async function nativeAPI() {
    api ??= (async () => {
        const path = nativeDiceHandlerURL();
        const Dice = (await import(path)).default;
        const original = Dice.handle3dDice;
        Dice.handle3dDice = function (roll, mode) {
            return hiddenDice.has(roll) ? Promise.resolve() : original.call(this, roll, mode);
        };
        return { Dice };
    })();
    return api;
}
/** Mark only this native roll's dice; never change the user's global roll mode. */
export async function rollHidden(roll) {
    await nativeAPI();
    for (const key of ["_roll", "_critRoll"]) {
        let value = roll[key];
        Object.defineProperty(roll, key, { configurable: true, enumerable: true,
            get: () => value, set: (next) => { value = next; if (next)
                hiddenDice.add(next); } });
    }
    await roll.roll();
}
export function diceJSON(roll) {
    return [roll._roll, roll._critRoll].filter((die) => !!die).map(die => JSON.stringify(die.toJSON()));
}
/** Stable presentation identity; no roll evaluation or DSN coordination. */
const rollIds = new WeakMap();
export function markRollResult(html, roll) {
    let id = rollIds.get(roll);
    if (!id) {
        id = foundry.utils.randomID();
        rollIds.set(roll, id);
    }
    return html.replace(/^(\s*<[\w-]+)/, `$1 data-pneuma-roll-result="${id}"`);
}
export async function nativeCard(roll) {
    roll.criticalCard = roll.wasCritical();
    return markRollResult(await renderTemplate(roll.rollCard, roll), roll);
}
const dialogNotes = new WeakMap();
export function registerEvasionDialog() {
    Hooks.on("renderCPRRollDialog", (app, html) => {
        if (!app.rollData)
            return;
        const note = dialogNotes.get(app.rollData);
        if (!note)
            return;
        html.find(".pneuma-evasion-note").remove();
        const total = html.find(".total-mods").first();
        for (const text of [
            note.penalty ? "Дополнительное уклонение от стрельбы: " + note.penalty : "",
            note.fee ? "Это уклонение потратит " + note.fee + " УДАЧИ" : "",
        ].filter(Boolean)) {
            const row = document.createElement("li");
            row.className = "dialog-item flexrow pneuma-evasion-note";
            row.textContent = text;
            total.before(row);
        }
    });
}
export async function evasionDialog(roll, actor, item, penalty, fee, skipDialog = false) {
    if (penalty)
        roll.addMod([{ id: "pneuma-ranged-evasion", source: "Дополнительное уклонение от стрельбы", value: penalty }]);
    dialogNotes.set(roll, { penalty, fee });
    try {
        // Shift-click accepts the displayed cost; native validation and modifiers remain.
        return await roll.handleRollDialog({ type: "pneuma-evasion", ctrlKey: skipDialog, metaKey: false }, actor, item);
    }
    finally {
        dialogNotes.delete(roll);
    }
}
export async function spendBonusLuck(actor, bonus) {
    await withActorMutation(actor, async () => {
        const current = Number(foundry.utils.getProperty(actor, "system.stats.luck.value"));
        const remaining = checkedLuck(current, 0, bonus);
        if (bonus)
            await actor.update({ "system.stats.luck.value": remaining });
    });
}
// Reuse CPR's obscured-task ID so its own situational toggle cannot stack the same penalty.
const smokeModId = "heavilyObscured-coreBook";
const smokeRolls = new WeakSet();
export async function smokeAttackDialog(roll, actor, item, event, obscured) {
    const skipDialog = !!event?.shiftKey;
    if (!obscured)
        return roll.handleRollDialog(skipDialog ? { type: "pneuma-fast", ctrlKey: true, metaKey: false } : event, actor, item);
    if (!roll.mods.some(mod => mod.id === smokeModId))
        roll.addMod([{ id: smokeModId, source: "Дым", value: -4 }]);
    smokeRolls.add(roll);
    try {
        return await roll.handleRollDialog({ type: "pneuma-smoke", ctrlKey: skipDialog, metaKey: false }, actor, item);
    }
    finally {
        smokeRolls.delete(roll);
    }
}
const attackChoices = new WeakMap();
/** Keep native form inputs/listeners and footer; only split scrolling from actions. */
export function layoutAttackDialog(app, root) {
    if (!root)
        return;
    const form = root.matches("form.dialog-sheet") ? root : root.querySelector("form.dialog-sheet");
    const windowRoot = root.closest(".window-app") ?? (root.matches(".window-app") ? root : null);
    const footer = form?.querySelector(".dialog-footer");
    if (!form || !windowRoot || !footer)
        return;
    windowRoot.classList.add("pneuma-attack-dialog");
    let body = form.querySelector(":scope > .pneuma-attack-dialog-body");
    if (!body) {
        body = document.createElement("div");
        body.className = "pneuma-attack-dialog-body";
        for (const child of Array.from(form.childNodes))
            if (child !== footer)
                body.append(child);
        form.prepend(body);
    }
    const mods = form.querySelector('input[name="additionalMods"]');
    if (mods) {
        mods.setAttribute("aria-label", "Дополнительные модификаторы");
        mods.placeholder = "e.g. 1, -2";
        mods.closest(".dialog-item")?.classList.add("pneuma-additional-mods-row");
        if (!form.querySelector(".pneuma-modifier-hint")) {
            const hint = document.createElement("p");
            hint.className = "pneuma-modifier-hint";
            hint.id = windowRoot.id + "-modifier-hint";
            hint.textContent = "Перечислите модификаторы через запятую, например 1, -2.";
            mods.closest(".dialog-item")?.append(hint);
            mods.setAttribute("aria-describedby", hint.id);
        }
    }
    requestAnimationFrame(() => {
        if (!windowRoot.isConnected)
            return;
        const previousFlex = body.style.flex;
        body.style.flex = "0 0 auto";
        const contentHeight = body.scrollHeight;
        body.style.flex = previousFlex;
        const chromeHeight = windowRoot.getBoundingClientRect().height - body.getBoundingClientRect().height;
        const height = Math.min(window.innerHeight - 16, Math.ceil(contentHeight + chromeHeight + 2));
        const top = Math.max(8, Math.min(windowRoot.getBoundingClientRect().top, window.innerHeight - height - 8));
        app.setPosition({ height, top });
    });
}
export function registerAttackDialog() {
    Hooks.on("renderCPRRollDialog", (app, html) => {
        if (app.rollData && smokeRolls.has(app.rollData)) {
            const roll = app.rollData;
            html.find(".pneuma-smoke-choice").remove();
            const row = document.createElement("li");
            row.className = "dialog-item flexrow pneuma-smoke-choice";
            const label = document.createElement("label"), input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !roll.mods.some(mod => mod.id === smokeModId);
            input.addEventListener("change", () => {
                if (input.checked) {
                    if (roll.mods.some(mod => mod.id === smokeModId))
                        roll.removeMod(smokeModId);
                }
                else if (!roll.mods.some(mod => mod.id === smokeModId))
                    roll.addMod([{ id: smokeModId, source: "Дым", value: -4 }]);
                app.render();
            });
            label.append(input, document.createTextNode(" Не учитывать штраф дыма (−4) — снаряжение / решение Мастера"));
            row.append(label);
            row.title = "Атака проходит через дым: −4, если не отменено.";
            html.find(".total-mods").first().before(row);
            layoutAttackDialog(app, html[0]);
        }
        const choice = app.rollData && attackChoices.get(app.rollData);
        if (!choice)
            return;
        html.find(".pneuma-unaware-choice, .pneuma-improvised-damage-choice").remove();
        if (choice.improvised) {
            const row = document.createElement("li");
            row.className = "dialog-item flexrow pneuma-improvised-damage-choice";
            const label = document.createElement("label");
            label.append(document.createTextNode("Импровизированный урон (согласован с Мастером) "));
            const select = document.createElement("select");
            select.required = true;
            select.setAttribute("aria-label", "Импровизированный урон (согласован с Мастером)");
            select.append(new Option("Выберите урон", ""));
            for (let dice = 1; dice <= 6; dice++)
                select.append(new Option(dice + "d6", String(dice)));
            select.value = choice.improvisedDice ? String(choice.improvisedDice) : "";
            const validate = () => {
                const dice = Number(select.value);
                choice.improvisedDice = Number.isInteger(dice) && dice >= 1 && dice <= 6 ? dice : undefined;
                html.find('.cpr-dialog-button[name="confirm"]').prop("disabled", choice.improvisedDice === undefined);
            };
            select.addEventListener("change", validate);
            validate();
            label.append(select);
            row.append(label);
            html.find(".total-mods").first().before(row);
        }
        layoutAttackDialog(app, html[0]);
        if (!game.user?.isGM)
            return;
        const row = document.createElement("li");
        row.className = "dialog-item flexrow pneuma-unaware-choice";
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = choice.unaware;
        input.addEventListener("change", () => { choice.unaware = input.checked; });
        label.append(input, document.createTextNode(" Защитник не замечает атаки"));
        row.append(label);
        html.find(".total-mods").first().before(row);
    });
}
export async function attackDialog(roll, actor, item, event, improvised = false, obscured = false) {
    const choice = { unaware: false, improvised };
    if (game.user?.isGM || improvised)
        attackChoices.set(roll, choice);
    try {
        const confirmed = await smokeAttackDialog(roll, actor, item, game.user?.isGM || improvised
            ? { type: "pneuma-attack", ctrlKey: false, metaKey: false, shiftKey: !improvised && !!event?.shiftKey } : event, obscured);
        if (confirmed && improvised && choice.improvisedDice === undefined)
            throw new Error("Перед атакой выберите импровизированный урон от 1к6 до 6к6.");
        return { confirmed, unaware: !!game.user?.isGM && choice.unaware,
            ...(improvised ? { improvisedDice: choice.improvisedDice } : {}) };
    }
    finally {
        attackChoices.delete(roll);
    }
}
