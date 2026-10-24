import { primaryGM } from "./shared.js";
import { withActorMutation } from "./actor-mutation.js";
import { canRenderCombatCard } from "./card-structure.js";
import { requireCombatSocket } from "./socket-health.js";
const M = "redline-combat";
const selector = '.pneuma-damage-applied [data-action="reverseDamage"]';
const state = (message, id) => foundry.utils.getProperty(message, `flags.${M}.damageReversals.${id}`);
/** Older compact receipts already have a unique breakdown class. */
export function reversalInstance(button) {
    const card = button.closest('.pneuma-damage-applied');
    return card?.dataset.damageInstance ?? Array.from(card?.querySelector('.pneuma-applied-details')?.classList ?? [])
        .find(name => name.startsWith('pneuma-applied-details-'))?.slice('pneuma-applied-details-'.length);
}
let queue = Promise.resolve();
export function reverseDamageOnce(request) {
    const next = queue.catch(() => { }).then(() => reverse(request));
    queue = next;
    return next;
}
async function reverse({ message: messageId, instance, user: userId }) {
    if (game.user?.id !== primaryGM()?.id)
        throw Error("Откатить урон должен активный Мастер.");
    if (!/^[a-zA-Z0-9_-]+$/.test(instance))
        throw Error("Некорректная запись урона.");
    const message = game.messages?.get(messageId), user = game.users?.get(userId);
    if (!message || !user)
        throw Error("Карточка урона недоступна.");
    if (!user.isGM)
        throw Error("Откатить урон может только Мастер.");
    if (state(message, instance))
        return;
    const doc = new DOMParser().parseFromString(message.content ?? "", "text/html");
    const button = Array.from(doc.querySelectorAll(selector)).find(node => reversalInstance(node) === instance);
    if (!button)
        throw Error("Нанесение урона недоступно.");
    const receipt = button.closest('.pneuma-damage-applied');
    const uuid = receipt.dataset.damageActor;
    const actor = (uuid ? await fromUuid(uuid) : button.dataset.tokenId
        ? game.actors?.tokens?.[button.dataset.tokenId]
        : game.actors?.get(button.dataset.actorId ?? ""));
    if (!actor)
        throw Error("Цель урона недоступна.");
    const values = [button.dataset.hpReduction, button.dataset.ablation, button.dataset.shieldAblation].map(value => Number.parseInt(value ?? "", 10));
    if (values.some(value => !Number.isFinite(value)) || !button.dataset.location)
        throw Error("Данных для штатного отката урона недостаточно.");
    const native = actor;
    if (!native._reverseDamage)
        throw Error("Штатный откат урона недоступен.");
    const path = `flags.${M}.damageReversals.${instance}`;
    await message.update({ [path]: "reversing" });
    try {
        await withActorMutation(actor, () => native._reverseDamage(values[0], button.dataset.location, values[1], values[2]));
        await message.update({ [path]: "reversed" });
    }
    catch (error) {
        await message.update({ [path]: "review" });
        throw Error("Откат прерван. Проверьте HP и броню вручную; повторно откатить этот урон нельзя. " + String(error));
    }
}
const pending = new Map();
function send(message, instance) {
    if (!game.user?.isGM)
        throw Error("Откатить урон может только Мастер.");
    requireCombatSocket();
    const gm = primaryGM();
    if (!gm)
        throw Error("Для отката урона нужен активный Мастер.");
    const wire = { reversalType: "request", id: foundry.utils.randomID(), message, instance, user: game.user.id };
    if (game.user.id === gm.id)
        return reverseDamageOnce(wire);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(wire.id); reject(Error("Откат не подтверждён. Проверьте карточку, прежде чем повторять.")); }, 30000);
        pending.set(wire.id, { resolve, reject, timer });
        game.socket.emit("module." + M, wire);
    });
}
const bound = new WeakSet();
export function bindDamageReversal(message, root) {
    if (!canRenderCombatCard(message))
        return;
    for (const button of Array.from(root.querySelectorAll(selector))) {
        button.hidden = !game.user?.isGM;
        const id = reversalInstance(button), used = id ? state(message, id) : undefined;
        button.setAttribute("aria-disabled", String(!!used));
        if (used) {
            button.title = used === "reversed" ? "Урон уже откачен" : used === "review" ? "Откат прерван — нужна проверка Мастера" : "Урон откатывается";
            button.dataset.tooltip = button.title;
            button.querySelector('i')?.removeAttribute('data-tooltip');
        }
        const card = button.closest('.pneuma-damage-applied');
        card.querySelector('.pneuma-reversal-status')?.remove();
        if (used) {
            const indicator = document.createElement('span');
            indicator.className = 'pneuma-reversal-status';
            indicator.dataset.state = used;
            indicator.setAttribute('role', 'status');
            const icon = document.createElement('i');
            icon.className = 'fas ' + (used === 'reversed' ? 'fa-check' : used === 'review' ? 'fa-triangle-exclamation' : 'fa-hourglass-half');
            icon.setAttribute('aria-hidden', 'true');
            indicator.append(icon, document.createTextNode(used === 'reversed' ? ' Урон откачен' : used === 'review' ? ' Откат ждёт проверки Мастера' : ' Урон откатывается…'));
            const row = card.querySelector('.pneuma-damage-applied-row');
            if (row)
                row.append(indicator);
            else
                card.prepend(indicator);
        }
    }
    if (bound.has(root))
        return;
    bound.add(root);
    // Capture prevents CPR's delegated handler from applying another reversal.
    root.addEventListener("click", event => {
        const button = event.target.closest(selector);
        if (!button || !root.contains(button))
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!game.user?.isGM)
            return;
        const instance = reversalInstance(button);
        if (!instance || button.getAttribute("aria-disabled") === "true")
            return;
        button.setAttribute("aria-disabled", "true");
        void Promise.resolve().then(() => send(message.id, instance)).catch(error => ui.notifications.error(String(error.message ?? error)))
            .finally(() => bindDamageReversal(message, root));
    }, true);
}
export function registerDamageReversal() {
    Hooks.on("renderChatMessage", (message, html) => { if (html[0])
        bindDamageReversal(message, html[0]); });
    Hooks.once("ready", () => game.socket.on("module." + M, (wire) => {
        if (wire?.reversalType === "request" && game.user?.id === primaryGM()?.id) {
            void reverseDamageOnce(wire).then(() => game.socket.emit("module." + M, { ...wire, reversalType: "reply", gm: game.user.id }), error => game.socket.emit("module." + M, { ...wire, reversalType: "reply", gm: game.user.id, error: String(error.message ?? error) }));
        }
        else if (wire?.reversalType === "reply" && wire.user === game.user?.id && wire.gm === primaryGM()?.id) {
            const entry = pending.get(wire.id);
            if (!entry)
                return;
            clearTimeout(entry.timer);
            pending.delete(wire.id);
            if (wire.error)
                entry.reject(Error(wire.error));
            else
                entry.resolve();
        }
    }));
}
