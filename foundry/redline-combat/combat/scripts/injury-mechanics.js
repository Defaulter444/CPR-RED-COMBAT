import { registerConditionCardRefresh } from "./pending-card-refresh.js";
import { bindCardAction } from "./card-structure.js";
import { withActorMutation } from "./actor-mutation.js";
import { primaryGM as gm, escapeHTML as escape } from "./shared.js";
import { evasionBlocked, hasInjury } from "./injury-rules.js";
import { registerNativeWrapper } from "./native-wrappers.js";
import { requireCombatSocket } from "./socket-health.js";
const MODULE = "redline-combat", path = `flags.${MODULE}.brokenRibs`, channel = `module.${MODULE}`;
const get = (doc, key = path) => foundry.utils.getProperty(doc, key);
let queue = Promise.resolve();
function work(fn) { const next = queue.catch(() => { }).then(fn); queue = next; return next; }
const movementInjuries = ["Broken Ribs", "Foreign Object (Body)", "Foreign Object (Head)"];
let indexedMessages;
const injuryCards = new Map();
const injuryKeys = new Map();
const cardKey = (actor, combat, turn, epoch) => JSON.stringify([actor, combat, turn, epoch]);
function removeInjuryCard(message) {
    const key = injuryKeys.get(message.id);
    if (key === undefined)
        return;
    const group = injuryCards.get(key);
    group?.delete(message.id);
    if (!group?.size)
        injuryCards.delete(key);
    injuryKeys.delete(message.id);
}
function indexInjuryCard(message) {
    removeInjuryCard(message);
    const data = get(message);
    if (!data)
        return;
    const key = cardKey(data.actor, data.combat, data.turn, data.epoch), group = injuryCards.get(key) ?? new Map();
    group.set(message.id, message);
    injuryCards.set(key, group);
    injuryKeys.set(message.id, key);
}
function existingInjuryCards(actor, record, epoch) {
    if (indexedMessages !== game.messages) {
        indexedMessages = game.messages;
        injuryCards.clear();
        injuryKeys.clear();
        for (const message of game.messages ?? [])
            indexInjuryCard(message);
    }
    return injuryCards.get(cardKey(actor, record.combat, record.turn, epoch))?.values() ?? [];
}
const injuryId = (data) => data.injury === "Foreign Object (Body)" ? "foreign-object-body" : data.injury === "Foreign Object (Head)" ? "foreign-object-head" : "broken-ribs";
export function ribsContent(data) {
    const eligible = data.distance > 4;
    return `<div class="pneuma-injury-card rollcard" data-injury="${injuryId(data)}" data-state="${data.applied ? "applied" : eligible ? "pending" : "withdrawn"}"><div class="rollcard-top"><div class="cpr-block">${escape(data.name)} &mdash; ${escape(data.injury ?? "Broken Ribs")}</div></div><div class="rollcard-bottom"><p class="pneuma-injury-summary">${data.applied ? "5 урона нанесено прямо по HP." : eligible ? `Пройдено ${Number(data.distance.toFixed(2))} м пешком. В конце хода: 5 урона прямо по HP.` : "Перемещение сброшено до 4 м или меньше; урона нет."}</p>${!data.applied && eligible ? '<button type="button" data-ribs-apply>Нанести 5 урона</button>' : ""}</div></div>`;
}
/** Runs after accepted movement only. The saved movement snapshot avoids animation/preview and rapid-move races. */
export async function warnBrokenRibs(doc, record) {
    if (game.user?.id !== gm()?.id || !doc.actor || !Number.isFinite(record.onFoot))
        return;
    const actor = doc.actor;
    return work(async () => {
        const combat = game.combats?.get(record.combat);
        if (!combat?.started)
            return;
        const epoch = get(combat, `flags.${MODULE}.evasionEpoch`) ?? "";
        const cards = Array.from(existingInjuryCards(actor.uuid, record, epoch));
        for (const injury of movementInjuries) {
            const message = cards.find(m => { const d = get(m); return (d?.injury ?? "Broken Ribs") === injury && d?.actor === actor.uuid && d.combat === record.combat && d.turn === record.turn && d.epoch === epoch; });
            if (message) {
                const d = foundry.utils.deepClone(get(message));
                if (!d.applied && (d.distance !== record.onFoot || !hasInjury(actor, injury))) {
                    d.distance = hasInjury(actor, injury) ? record.onFoot : 0;
                    await message.update({ content: ribsContent(d), [path]: d });
                }
                continue;
            }
            if (record.onFoot <= 4 || !hasInjury(actor, injury))
                continue;
            const data = { injury, actor: actor.uuid, token: doc.uuid, name: doc.name ?? actor.name ?? "Персонаж", combat: record.combat, turn: record.turn, epoch, distance: record.onFoot };
            // Injury reminders are shared with the affected player's owners and GMs, never other players' private NPC data.
            const whisper = game.users?.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id) ?? [];
            const created = await ChatMessage.create({ content: ribsContent(data), speaker: ChatMessage.getSpeaker({ actor, token: doc }), whisper, flags: { [MODULE]: { brokenRibs: data } } });
            if (created)
                indexInjuryCard(created);
        }
    });
}
export async function applyRibsDamage(id, user) {
    return work(async () => {
        if (game.user?.id !== gm()?.id)
            throw Error("Урон от травмы наносит активный Мастер.");
        const message = game.messages?.get(id), saved = message && get(message), data = saved && foundry.utils.deepClone(saved);
        if (!message || !data)
            throw Error("Предупреждение о травме недоступно.");
        const actor = await fromUuid(data.actor);
        if (!actor || (!user.isGM && !actor.testUserPermission(user, "OWNER")))
            throw Error("Нанести этот урон может только владелец персонажа или Мастер.");
        if (data.applied)
            return;
        if (data.distance <= 4 || !game.combats?.get(data.combat)?.started || (get(game.combats.get(data.combat), `flags.${MODULE}.evasionEpoch`) ?? "") !== data.epoch)
            throw Error("Это предупреждение о движении больше не действует.");
        await withActorMutation(actor, async () => {
            const receipts = get(actor, `flags.${MODULE}.ribsApplications`) ?? {};
            const messages = receipts[data.combat] ?? [];
            if (!messages.includes(id)) {
                if (!hasInjury(actor, data.injury ?? "Broken Ribs"))
                    throw Error("Эта травма больше не действует.");
                const hp = Number(foundry.utils.getProperty(actor, "system.derivedStats.hp.value"));
                if (!Number.isFinite(hp))
                    throw Error("HP персонажа недоступно.");
                // HP and receipt share one actor update, so retrying a failed card write cannot apply twice.
                await actor.update({ "system.derivedStats.hp.value": hp - 5, [`flags.${MODULE}.ribsApplications`]: { ...receipts, [data.combat]: [...messages, id] } });
            }
        });
        data.applied = true;
        await message.update({ content: ribsContent(data), [path]: data });
    });
}
export function installInjuryRollGuards(itemPrototype, rollPrototype) {
    const actors = new WeakMap();
    const isEvasion = (roll) => ["evasion", game.i18n?.localize("CPR.global.itemType.skill.evasion").toLowerCase()].includes(roll.skillName?.toLowerCase() ?? "");
    const check = (roll, actor) => { if (isEvasion(roll)) {
        const reason = evasionBlocked(actor);
        if (reason) {
            ui.notifications.warn(reason);
            throw Error(reason);
        }
    } };
    registerNativeWrapper(itemPrototype, "createRoll", function (wrapped, type, actor, ...args) {
        const roll = wrapped(type, actor, ...args);
        if (roll && typeof roll === "object") {
            actors.set(roll, actor);
            check(roll, actor);
        }
        return roll;
    }, "MIXED");
    registerNativeWrapper(rollPrototype, "handleRollDialog", async function (wrapped, event, actor, ...args) {
        actors.set(this, actor);
        if (isEvasion(this)) {
            const reason = evasionBlocked(actor);
            if (reason) {
                ui.notifications.warn(reason);
                return false;
            }
        }
        const result = await wrapped(event, actor, ...args);
        if (result)
            check(this, actor);
        return result;
    }, "MIXED");
    registerNativeWrapper(rollPrototype, "roll", function (wrapped, ...args) { const actor = actors.get(this); if (actor)
        check(this, actor); return wrapped(...args); }, "MIXED");
}
const pending = new Map();
function requestDamage(message) {
    requireCombatSocket();
    const authority = gm();
    if (!authority)
        throw Error("Для урона от травмы нужен активный Мастер.");
    if (game.user.id === authority.id)
        return applyRibsDamage(message, game.user);
    const id = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error("Мастер не ответил вовремя. Повторите на карточке травмы.")); }, 15000);
        pending.set(id, { resolve, reject, timer });
        game.socket.emit(channel, { ribsType: "apply", id, user: game.user.id, message });
    });
}
export function registerInjuryMechanics() {
    for (const hook of ["createChatMessage", "updateChatMessage"])
        Hooks.on(hook, indexInjuryCard);
    Hooks.on("deleteChatMessage", removeInjuryCard);
    Hooks.on("updateToken", (doc, changes) => {
        const record = get(changes, `flags.${MODULE}.movement`) ?? changes[`flags.${MODULE}.movement`];
        if (record)
            void warnBrokenRibs(doc, foundry.utils.deepClone({ ...get(doc, `flags.${MODULE}.movement`), ...record })).catch(e => ui.notifications.error(String(e)));
    });
    registerConditionCardRefresh(message => { const data = get(message); return data && !data.applied ? { actors: [data.actor], combat: data.combat } : undefined; });
    Hooks.on("renderChatMessage", async (message, html) => {
        const data = get(message);
        if (!data)
            return;
        const actor = await fromUuid(data.actor);
        const combat = game.combats?.get(data.combat);
        const eligible = !!actor && hasInjury(actor, data.injury ?? "Broken Ribs") && data.distance > 4 && !!combat?.started && (get(combat, "flags." + MODULE + ".evasionEpoch") ?? "") === data.epoch;
        const root = html[0]?.querySelector(".pneuma-injury-card");
        if (root)
            root.dataset.injury = injuryId(data);
        if (!data.applied && !eligible) {
            if (root) {
                root.dataset.state = "withdrawn";
                const summary = root.querySelector(".pneuma-injury-summary") ?? root.querySelector(".rollcard-bottom p");
                if (summary)
                    summary.textContent = "Это предупреждение о травме больше не актуально.";
            }
        }
        for (const button of html.find("[data-ribs-apply]").toArray()) {
            if (!actor || (!game.user?.isGM && !actor.isOwner)) {
                button.remove();
                continue;
            }
            button.disabled = data.applied === true || !eligible;
            bindCardAction(button, async (event) => { event.preventDefault(); if (button.disabled)
                return; button.disabled = true; try {
                await requestDamage(message.id);
            }
            catch (e) {
                ui.notifications.error(String(e));
                button.disabled = false;
            } });
        }
    });
    Hooks.once("ready", async () => {
        game.socket.on(channel, (p) => {
            if (!p || !["apply", "result"].includes(p.ribsType))
                return;
            if (p.ribsType === "result") {
                if (p.user !== game.user?.id || p.gm !== gm()?.id)
                    return;
                const wait = pending.get(p.id);
                if (!wait)
                    return;
                clearTimeout(wait.timer);
                pending.delete(p.id);
                if (p.error)
                    wait.reject(Error(p.error));
                else
                    wait.resolve();
            }
            else if (game.user?.id === gm()?.id) {
                const user = game.users?.get(p.user);
                if (!user || !p.message)
                    return;
                const reply = (error) => game.socket.emit(channel, { ribsType: "result", id: p.id, user: p.user, gm: game.user.id, error });
                void applyRibsDamage(p.message, user).then(() => reply(), e => reply(String(e)));
            }
        });
        try {
            const path = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
            const rolls = await import(path);
            installInjuryRollGuards(CONFIG.Item.documentClass.prototype, rolls.CPRRoll.prototype);
        }
        catch (e) {
            ui.notifications.error("Учёт травм в бросках: " + String(e));
        }
    });
}
