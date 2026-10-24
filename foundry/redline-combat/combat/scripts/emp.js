import { bindCardAction, canRenderCombatCard, resolutionSection } from "./card-structure.js";
import { allActors, escapeHTML as esc } from "./shared.js";
import { registerEmpRefresh } from "./emp-refresh.js";
import { updateTouchesPath } from "./update-path.js";
import { actorEncounter, encounterRef, resolveEncounter } from "./encounter.js";
import { registerEmpSettings } from "./emp-settings.js";
import { applyEmpBehavior, empBehavior } from "./emp-behavior.js";
import { EMP_MODULE as MODULE, eligibleEmpItems, empGroup, empWeight, randomEmp, disableLabel, hasActorEMP } from "./emp-rules.js";
import { frameMovementBlocked, empGM, empRequests, empRandomSelection, empSelectionPool, empWork, applyEmpSelection, finishEmp, reconcileEmp, installEmpNativeGuards } from "./emp-state.js";
import { requireCombatSocket } from "./socket-health.js";
const report = (error) => ui.notifications.error(error instanceof Error ? error.message : String(error));
let nativeReady = Promise.resolve();
const pending = new Map();
async function submit(combat, request, selected) {
    requireCombatSocket();
    if (!empGM())
        throw Error("Для ЭМИ нужен активный Мастер.");
    if (game.user.isGM && empGM()?.id === game.user.id)
        return empWork(() => applyEmpSelection(combat, request, selected, game.user));
    const id = foundry.utils.randomID();
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error("Мастер не подтвердил ЭМИ. Выбор можно повторить.")); }, 10000);
        pending.set(id, { resolve, reject, timer });
        game.socket.emit(`module.${MODULE}`, { empType: "select", id, combat: combat.id, request, user: game.user.id, selected });
    });
}
export async function chooseEmp(combat, request) {
    if (!combat.started || request.state !== "pending")
        return;
    const actor = await fromUuid(request.actor);
    const chooser = request.sourceActor ? await fromUuid(request.sourceActor) : actor;
    if (!actor || (!game.user.isGM && (request.chooser !== "player" || !chooser?.isOwner)))
        return;
    const all = Array.from(actor.items);
    const eligible = empSelectionPool(request, all);
    const random = empRandomSelection(request);
    const count = Math.min(request.count, eligible.length);
    if (!count && !request.selected)
        return ui.notifications.warn("Нет подходящих киберимплантов или носимой электроники.");
    const groupSizes = new Map();
    for (const item of eligible) {
        const group = empGroup(item, all);
        groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
    }
    const total = eligible.reduce((n, i) => n + empWeight(i, request.mode), 0);
    const visible = random && !game.user.isGM ? [] : eligible;
    const rows = visible.map(item => {
        const parent = request.method === "shortlist" && !game.user.isGM ? undefined : all.find(i => i.id === item.system.installedIn?.[0]);
        const odds = request.mode === "system" ? 1 / groupSizes.size / groupSizes.get(empGroup(item, all)) : empWeight(item, request.mode) / total;
        return `<label class="pneuma-emp-choice"><input type="checkbox" name="item" value="${esc(item.id)}" ${random ? "disabled" : ""}> <span>${esc(item.name)}${parent ? ` <small>in ${esc(parent.name)}</small>` : ""}${item.system.isFoundational ? " <small>(базовый)</small>" : ""}${random ? ` <small>первый выбор ${(odds * 100).toFixed(1)}%</small>` : ""}</span></label>`;
    }).join("");
    const dialog = new Dialog({ title: `${disableLabel(request.source)} — ${actor.name}`, content: `<form class="pneuma-emp-selection"><p>${random ? "Случайно отключить до" : "Выберите"} ${count} предм., ${request.seconds ? "for " + request.seconds + " seconds" : "до конца боя"}.</p><p>${request.policy.cascade ? "Установленные опции тоже теряют питание вместе с основой. Иммунитет исключает только прямые цели." : "Будут отключены только выбранные предметы."}</p>${request.method === "shortlist" ? "<p>Показаны только " + eligible.length + " случайно предложенных компонентов.</p>" : ""}${rows}</form>`, buttons: { apply: { label: random ? "Выбрать и отключить" : "Отключить выбранное", callback: html => {
                    const root = html[0];
                    const selected = Array.from(root.querySelectorAll('input[name="item"]:checked')).map(input => input.value);
                    if (!random && !request.selected && selected.length !== count) {
                        ui.notifications.warn(`Выберите ровно ${count} предм.`);
                        void chooseEmp(combat, request);
                        return;
                    }
                    void submit(combat, request.id, selected).catch(report);
                } }, cancel: { label: "Отмена" } }, default: "cancel" }, { width: 460 });
    dialog.render(true);
}
export async function createEmp(actor, options, encounter, sourceMessage) {
    const combat = encounter ? resolveEncounter(encounter) : actorEncounter(actor);
    if (!game.user.isGM || !combat?.started)
        throw Error("Перед ЭМИ Мастер должен начать бой.");
    if (!Number.isInteger(options.count) || options.count < 1 || options.count > 50)
        throw Error("Число предметов для ЭМИ — от 1 до 50.");
    if (options.seconds !== undefined && (!Number.isFinite(options.seconds) || options.seconds <= 0))
        throw Error("Длительность отключения должна быть положительной.");
    const prior = options.origin ? Object.values(empRequests(combat)).find(r => r.origin === options.origin && r.actor === actor.uuid) : undefined;
    if (prior) {
        if (prior.state === "pending" && prior.chooser !== "player")
            await chooseEmp(combat, prior);
        return prior;
    }
    const request = { encounter: encounterRef(combat, encounter?.combatScene ?? combat.scene?.id, encounter?.combatTokens), ...applyEmpBehavior(options, empBehavior()), id: foundry.utils.randomID(), actor: actor.uuid, state: "pending" };
    if (!eligibleEmpItems(Array.from(actor.items), request.policy, request.source).length) {
        ui.notifications.info("Нет подходящих киберимплантов или электроники у " + disableLabel(request.source) + ".");
        return;
    }
    if (request.method === "shortlist") {
        const all = Array.from(actor.items);
        request.offered = randomEmp(eligibleEmpItems(all, request.policy, request.source), all, request.count * 2, request.mode, Math.random, !!request.policy.skipAffected && request.policy.cascade).map(item => item.id);
    }
    const chooser = request.sourceActor ? await fromUuid(request.sourceActor) : actor;
    await combat.update({ [`flags.${MODULE}.empRequests.${request.id}`]: request });
    const recipients = game.users.filter(u => u.isGM || (request.chooser === "player" && !!chooser?.testUserPermission(u, "OWNER"))).map(u => u.id);
    const message = sourceMessage ?? await ChatMessage.create({ content: `<div class="pneuma-emp-card"><strong>${esc(disableLabel(request.source))} — ${esc(actor.name)}</strong><p>${request.method === "shortlist" ? "Игрок выбирает из сохранённого короткого списка" : empRandomSelection(request) ? "Случайный выбор" : request.chooser === "player" ? (request.sourceActor ? "Выбирает нетраннер" : "Выбирает владелец") : "Мастер выбирает"}: ${request.count} предм. Отключено ${request.seconds ? "for " + request.seconds + " seconds" : "до конца боя"}.</p><button type="button" data-emp-select>Выбрать затронутые предметы</button></div>`, whisper: recipients, flags: { [MODULE]: { emp: { combat: combat.id, request: request.id } } } });
    if (sourceMessage)
        await sourceMessage.update({ [`flags.${MODULE}.attachedEmp.${request.id}`]: { combat: combat.id, request: request.id } });
    if (message)
        await combat.update({ [`flags.${MODULE}.empRequests.${request.id}.message`]: message.id });
    if (request.chooser !== "player")
        await chooseEmp(combat, request);
    return request;
}
export function registerEmp() {
    const module = game.modules.get(MODULE);
    module.api = { ...module.api, hasActorEMP };
    registerEmpSettings();
    Hooks.on("preUpdateToken", (doc, changes, _options, userId) => {
        if (frameMovementBlocked(doc.actor, changes, !!game.users?.get(userId)?.isGM)) {
            ui.notifications.warn("Движение невозможно: внутренний каркас отключён.");
            return false;
        }
    });
    registerEmpRefresh(report);
    game.settings.register(MODULE, "empImmunity", { name: "ЭМИ: защищённые предметы", hint: "Список точных названий предметов или UUID источников в компендиуме через точку с запятой, который ведёт Мастер. Такие предметы не выбираются напрямую; установленные в них опции всё равно теряют питание, если отключена основа.", scope: "world", config: false, type: String, default: "" });
    Hooks.once("setup", () => { nativeReady = installEmpNativeGuards(); void nativeReady.catch(report); });
    Hooks.once("ready", () => {
        const module = game.modules.get(MODULE);
        module.api = { ...module.api, emp: { create: createEmp } };
        game.socket.on(`module.${MODULE}`, (wire) => {
            if (wire?.empType === "select" && empGM()?.id === game.user?.id) {
                void empWork(async () => {
                    const combat = game.combats.get(wire.combat), user = game.users.get(wire.user);
                    if (!combat || !user || !Array.isArray(wire.selected))
                        throw Error("Некорректный выбор ЭМИ.");
                    await applyEmpSelection(combat, wire.request, wire.selected, user);
                }).then(() => game.socket.emit(`module.${MODULE}`, { ...wire, empType: "reply", gm: game.user.id }), error => game.socket.emit(`module.${MODULE}`, { ...wire, empType: "reply", gm: game.user.id, error: String(error.message ?? error) }));
            }
            else if (wire?.empType === "reply" && wire.user === game.user?.id && wire.gm === empGM()?.id) {
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
        });
        void nativeReady.then(async () => {
            if (empGM()?.id === game.user?.id)
                await empWork(reconcileEmp);
            for (const actor of allActors())
                if (actor.items.some(item => !!foundry.utils.getProperty(item, "flags.redline-combat.timedDisables") || foundry.utils.getProperty(item, `flags.${MODULE}.empCombats`)))
                    actor.prepareData();
        }).catch(report);
    });
    Hooks.on("renderChatMessage", async (message, html) => {
        const outer = html[0];
        if (!outer || !canRenderCombatCard(message))
            return;
        outer.querySelectorAll('.pneuma-attached-emp').forEach(node => node.remove());
        const single = foundry.utils.getProperty(message, `flags.${MODULE}.emp`);
        const attached = foundry.utils.getProperty(message, `flags.${MODULE}.attachedEmp`);
        for (const ref of [...(single ? [single] : []), ...Object.values(attached ?? {})]) {
            const combat = game.combats?.get(ref.combat), request = combat && empRequests(combat)[ref.request];
            let root = outer;
            if (ref !== single) {
                if (!request)
                    continue;
                const actor = await fromUuid(request.actor);
                const chooser = request.sourceActor ? await fromUuid(request.sourceActor) : actor;
                if (!game.user?.isGM && (request.chooser !== "player" || !chooser?.isOwner))
                    continue;
                root = document.createElement('section');
                root.className = 'pneuma-attached-emp pneuma-emp-card';
                root.innerHTML = '<button type="button" data-emp-select>Выбрать затронутые предметы</button>';
                let slot = Array.from(outer.querySelectorAll('.pneuma-aoe-target-effects')).find(node => node.parentElement?.dataset.aoeActor === request.actor) ?? outer.querySelector('.pneuma-damage-effect-results') ?? outer.querySelector('.pneuma-resolution-effects-body');
                if (!slot) {
                    const shell = document.createElement('div');
                    shell.innerHTML = resolutionSection('effects', '');
                    const section = shell.firstElementChild;
                    (outer.querySelector('.message-content') ?? outer).append(section);
                    slot = section.querySelector('.pneuma-resolution-effects-body');
                }
                (slot ?? outer).append(root);
            }
            const button = root.querySelector("[data-emp-select]");
            if (!button)
                continue;
            button.dataset.gmOnly = String(request?.chooser !== "player");
            button.dataset.chatState = request?.state ?? "";
            button.disabled = !combat?.started || !request || request.state !== "pending";
            root.querySelectorAll(".pneuma-emp-result").forEach(el => el.remove());
            const names = request?.method === "shortlist" && !game.user?.isGM ? request.selectedNames : request?.affectedNames;
            if (request?.state === "applied" && !names?.length) {
                const result = document.createElement("p");
                result.className = "pneuma-emp-result";
                result.textContent = "Ничего не отключено.";
                button.before(result);
            }
            if (request?.resistedNames?.length) {
                const result = document.createElement("p");
                result.className = "pneuma-emp-result";
                result.textContent = "Защищено от ЭМИ — не затронуто: " + request.resistedNames.join(", ");
                button.before(result);
            }
            if (names?.length) {
                const result = document.createElement("p");
                result.className = "pneuma-emp-result";
                result.textContent = "Отключено: " + names.join(", ");
                button.before(result);
            }
            if (button.disabled)
                button.textContent = combat?.started && request?.state === "applied" ? disableLabel(request.source) + ": применено" : "Бой окончен";
            bindCardAction(button, () => { if (!button.disabled && combat && request)
                void chooseEmp(combat, request); });
        }
    });
    const cardStates = new Map();
    const snapshot = (combat) => new Map(Object.values(empRequests(combat)).map(request => [request.id, { message: request.message, signature: JSON.stringify([combat.started, request]) }]));
    Hooks.once("ready", () => { for (const combat of game.combats ?? [])
        cardStates.set(combat.id, snapshot(combat)); });
    Hooks.on("createCombat", (combat) => { cardStates.set(combat.id, snapshot(combat)); });
    const refreshCards = (combat, deleted = false) => {
        const prior = cardStates.get(combat.id) ?? new Map();
        const next = deleted ? new Map() : snapshot(combat);
        const messages = new Set();
        for (const id of new Set([...prior.keys(), ...next.keys()])) {
            const old = prior.get(id), current = next.get(id);
            if (old?.signature === current?.signature)
                continue;
            if (old?.message)
                messages.add(old.message);
            if (current?.message)
                messages.add(current.message);
        }
        if (deleted)
            cardStates.delete(combat.id);
        else
            cardStates.set(combat.id, next);
        for (const id of messages) {
            const message = game.messages?.get(id);
            if (message)
                void ui.chat?.updateMessage(message, false);
        }
    };
    Hooks.on("updateCombat", (combat, changes) => {
        if (["round", "turn", "flags." + MODULE + ".empRequests"].some(path => updateTouchesPath(changes, path)))
            refreshCards(combat);
        if (("round" in changes) && !combat.started && empGM()?.id === game.user?.id)
            void empWork(() => finishEmp(combat)).catch(report);
    });
    Hooks.on("deleteCombat", (combat) => {
        if (empGM()?.id === game.user?.id)
            void empWork(() => finishEmp(combat, true)).catch(report);
        refreshCards(combat, true);
    });
}
