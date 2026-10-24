import { nativeCriticalTable, findNativeItem } from "./native-lookup.js";
import { openTreatment } from "./treatment.js";
import { markRollResult } from "./native-combat.js";
import { removeRollFavorite, rollFavorites, sameFavorite, toggleRollFavorite, rollFavorite } from "./roll-favorites.js";
import { primaryGM as authority } from "./shared.js";
import { MANUAL_MODULE as M, manualEscape as esc, manualNumber, groupContent } from "./manual-roll-state.js";
import { damageContent, handleDamage, damageEffectsLocked, renderDamage, selectedDamageTarget, damageValues } from "./damage-flow.js";
import { validateDamageStatuses } from "./damage-status.js";
import { damageSixes } from "./critical-injury.js";
import { nativeCard, rollHidden, nativeAPI, diceJSON, showSavedDice, messageDiceAudience, spendBonusLuck } from "./native-combat.js";
import { canRenderCombatCard } from "./card-structure.js";
import { requireCombatSocket } from "./socket-health.js";
import { GMRequests } from "./gm-request.js";
const STAT_LABELS = { int: "ИНТ", ref: "РЕФ", dex: "ЛВК", tech: "ТЕХ", cool: "ХЛАД", will: "ВОЛ", move: "ДВИЖ", body: "ТЕЛ", luck: "УДАЧА", emp: "ЭМП" };
const statLabel = (stat) => STAT_LABELS[stat] ?? stat.toUpperCase();
const channel = "module." + M;
const flag = "flags." + M + ".manualRoll";
const state = (message) => foundry.utils.getProperty(message, flag);
const report = (error) => ui.notifications.error(error.message ?? String(error));
let queue = Promise.resolve();
const requests = new GMRequests();
const retry = new Map();
async function nativeRolls() {
    const path = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
    return await import(path);
}
function rollMode() { return game.settings.get("core", "rollMode"); }
async function showDice(roll, mode) {
    const { Dice } = await nativeAPI();
    for (const json of diceJSON(roll))
        await Dice.handle3dDice(Roll.fromJSON(json), mode);
}
function exchange(data, target = "") {
    return { attacker: target, defender: target, defenderActor: "", attackerName: data.title, defenderName: "Выбранный токен", ranged: false, category: "Manual", title: data.title, total: 0, html: "", dice: [], rollMode: data.rollMode, state: "resolved", damage: data.damage, attackMode: data.damage?.result?.values.location === "head" ? "aimed" : "attack", location: data.damage?.result?.values.location, criticalMethod: "Ranged" };
}
export function manualContent(data) {
    const content = data.kind === "group" ? groupContent(data) : data.kind === "damage" ? '<h3>' + esc(data.title) + '</h3>' + damageContent(exchange(data)) : data.injury?.html ?? "";
    return '<section class="rollcard pneuma-combat-message pneuma-manual-card" data-manual-kind="' + data.kind + '">' + content
        + '<div class="pneuma-manual-controls"></div><div class="pneuma-manual-receipts">' + (data.injuryApplications ?? []).map(name => '<p>' + esc(name) + '</p>').join('') + '</div></section>';
}
async function save(message, data) { await message.update({ content: manualContent(data), [flag]: foundry.utils.deepClone(data) }); }
async function create(data) {
    const message = { content: manualContent(data), speaker: ChatMessage.getSpeaker(), flags: { [M]: { manualRoll: data } } };
    ChatMessage.applyRollMode(message, data.rollMode);
    return ChatMessage.create(message);
}
async function injuryTable(location) {
    const path = "/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
    const utils = (await import(path)).default;
    const name = location === "head" ? "Critical Injuries (Head)" : "Critical Injuries (Body)";
    const pack = game.settings.get("cyberpunk-red-core", "criticalInjuryRollTableCompendium");
    const tablePack = game.packs.get(pack);
    if (!tablePack)
        throw Error("Выбранный компендиум таблиц критических травм недоступен.");
    await tablePack.getIndex();
    const native = await nativeCriticalTable(pack, location);
    if (!native && !tablePack.index.find(entry => entry.name === name))
        throw Error("В выбранном компендиуме нет таблицы " + name + ".");
    const table = native ?? await utils.GetCompendiumDoc(pack, name);
    const items = native ? "cyberpunk-red-core.core_critical-injuries-" + location : utils.GetCompendiumIdByLabel(name);
    if (!table || !items)
        throw Error("Выбранная таблица или компендиум критических травм недоступны.");
    await game.packs.get(items)?.getIndex();
    return { table, items, utils };
}
async function rollInjury(location, mode) {
    const { table, items, utils } = await injuryTable(location);
    const result = await table.roll();
    if (result.results.length !== 1)
        throw Error("Штатная таблица травм должна вернуть ровно одну травму.");
    const item = await utils.GetCompendiumDoc(items, result.results[0].text);
    if (!item || String(item.type) !== "criticalInjury")
        throw Error("Выпавшая травма недоступна.");
    const { CPRTableRoll } = await nativeRolls();
    const roll = new CPRTableRoll(item.name, result.roll, "systems/cyberpunk-red-core/templates/chat/cpr-critical-injury-rollcard.hbs");
    roll.resultTotal = result.roll.total;
    roll.rollCardExtraArgs = { tableName: table.name, itemName: item.name, itemImg: item.img };
    roll.entityData = { actor: "", token: "", item: item.name, tokens: [], comp: items };
    await showDice(roll, mode);
    return { location, item: item.uuid, name: item.name, html: await nativeCard(roll) };
}
async function applyInjuryResult(data, actor) {
    let injury = data.injury;
    const duplicate = game.settings.get("cyberpunk-red-core", "preventDuplicateCriticalInjuries");
    if (duplicate === "reroll") {
        const { table } = await injuryTable(injury.location);
        if (table.results.size && table.results.contents.every(result => actor.items.some(item => String(item.type) === "criticalInjury" && item.name === result.text)))
            throw Error("У персонажа уже есть все травмы из этой таблицы.");
    }
    let attempts = 0;
    while (actor.items.some(item => String(item.type) === "criticalInjury" && item.name === injury.name)) {
        if (duplicate !== "reroll") {
            if (duplicate === "warn")
                ui.notifications.warn(actor.name + " уже имеет травму " + injury.name + ".");
            break;
        }
        if (++attempts > 100)
            throw Error("Не найдено неиспользованной травмы. Проверьте травмы актёра.");
        injury = await rollInjury(injury.location, data.rollMode);
    }
    const source = await fromUuid(injury.item);
    if (!source || String(source.type) !== "criticalInjury")
        throw Error("Предмета травмы больше нет.");
    await actor.createEmbeddedDocuments("Item", [{ name: source.name, type: source.type, img: source.img, system: foundry.utils.deepClone(source.system), effects: source.effects.map(effect => effect.toObject()) }]);
    return actor.name + " — " + injury.name;
}
/** Serialized by the elected GM, including local requests. */
export async function handleManualRequest(wire) {
    const message = game.messages.get(wire.message);
    const user = game.users.get(wire.user);
    const original = message && state(message);
    if (!message || !user || !original)
        throw Error("Карточка броска недоступна.");
    if (!user.isGM && (message.blind || message.whisper.length && !message.whisper.includes(user.id) && message.author?.id !== user.id))
        throw Error("Эта карточка вам не видна.");
    const data = foundry.utils.deepClone(original);
    const req = wire.request;
    if (data.kind === "group") {
        const row = data.rows?.find(row => row.user === req.row);
        if (!row || (!user.isGM && row.user !== user.id))
            throw Error("Этот бросок принадлежит другому игроку.");
        const actor = await fromUuid(row.actor);
        if (!actor || !actor.testUserPermission(user, "OWNER"))
            throw Error("Вы не владеете этим персонажем.");
        if (req.action === "claim") {
            if (row.state !== "waiting" || !req.nonce)
                throw Error("Этот бросок уже идёт или завершён.");
            row.state = "rolling";
            row.nonce = req.nonce;
            row.roller = user.id;
        }
        else if (req.action === "commit") {
            if (row.nonce !== req.nonce || row.roller !== user.id)
                throw Error("Бронь броска истекла.");
            if (row.state === "done")
                return;
            if (row.state !== "rolling" || !Number.isFinite(req.total) || typeof req.html !== "string")
                throw Error("Некорректный результат броска.");
            row.state = "done";
            row.total = req.total;
            row.html = req.html;
        }
        else if (req.action === "release" || req.action === "reset") {
            if (req.action === "reset" ? !user.isGM : row.nonce !== req.nonce || row.roller !== user.id)
                throw Error("Нельзя снять блокировку этого броска.");
            if (row.state !== "rolling")
                return;
            row.state = "waiting";
            delete row.nonce;
            delete row.roller;
        }
        else
            throw Error("Неизвестное групповое действие.");
        await save(message, data);
        return;
    }
    if (req.action === "effects") {
        if (!user.isGM && user.id !== data.creator)
            throw Error("Менять эффекты может только бросавший или Мастер.");
        if (!data.damage || !["rolled", "applied"].includes(data.damage.status))
            throw Error("Урон обрабатывается или ждёт проверки.");
        if (damageEffectsLocked(data.damage))
            throw Error("Выбор эффектов заблокирован: разрешение уже началось.");
        data.damage.statusEffects = validateDamageStatuses(req.effects);
        await save(message, data);
        return;
    }
    if (req.action === "review") {
        if (!user.isGM)
            throw Error("Только для Мастера.");
        if (data.damage && ["review", "applying"].includes(data.damage.status))
            data.damage.status = "applied";
        data.injuryBusy = false;
        await save(message, data);
        return;
    }
    const token = req.target ? await fromUuid(req.target) : null;
    const actor = token?.actor;
    if (!actor || !actor.testUserPermission(user, "OWNER"))
        throw Error("Выберите свой токен или попросите Мастера применить этот бросок.");
    if (req.action === "damage" && data.kind === "damage" && req.damage?.action === "damageApply") {
        const ex = exchange(data, token.uuid);
        await handleDamage({ ...req.damage, targetUuid: token.uuid, application: "selected" }, user, ex, () => save(message, data), message);
    }
    else if (req.action === "injury") {
        if (data.kind === "damage" && (data.damage?.result?.sixes ?? 0) < 2)
            throw Error("Этот бросок урона не даёт критической травмы.");
        if (data.injuryBusy)
            throw Error("Травма наносится или ждёт проверки Мастера.");
        data.injuryBusy = true;
        await save(message, data);
        try {
            const summary = await applyInjuryResult(data.kind === "critical" ? data : { ...data, injury: await rollInjury(data.damage?.result?.values.location === "head" ? "head" : "body", data.rollMode) }, actor);
            data.injuryApplications = [...(data.injuryApplications ?? []), summary];
            data.injuryBusy = false;
            await save(message, data);
        }
        catch (error) {
            throw Error("Нанесение травмы прервано; Мастер должен проверить актёра, прежде чем снимать проверку. " + error.message);
        }
    }
    else
        throw Error("Неизвестное действие ручного броска.");
}
function send(message, request) {
    requireCombatSocket();
    const gm = authority();
    if (!gm)
        throw Error("Чтобы обновить карточку, нужен активный Мастер.");
    const wire = { manualType: "request", id: foundry.utils.randomID(), message, user: game.user.id, request };
    if (gm.id === game.user.id) {
        const next = queue.catch(() => { }).then(() => handleManualRequest(wire));
        queue = next;
        return next;
    }
    return requests.request(wire.id, () => game.socket.emit(channel, wire), 30000, "Мастер не подтвердил действие. Проверьте карточку, прежде чем повторять.");
}
async function rollGroup(message, data, rowId, skipDialog = false) {
    const key = message.id + ":" + rowId, previous = retry.get(key);
    if (previous) {
        await send(message.id, previous.request);
        retry.delete(key);
        await showSavedDice(previous.dice, previous.mode, previous.roller, previous.audience);
        return;
    }
    const row = data.rows.find(row => row.user === rowId);
    const actor = await fromUuid(row.actor);
    if (!actor?.isOwner)
        throw Error("Вы не владеете этим персонажем.");
    const item = actor.items.find(item => String(item.type) === "skill" && item.name?.toLowerCase() === data.skill?.toLowerCase());
    if (!item?.createRoll)
        throw Error("У персонажа нет этого навыка.");
    const nonce = foundry.utils.randomID();
    await send(message.id, { action: "claim", row: rowId, nonce });
    let rolled = false;
    try {
        let roll = item.createRoll("skill", actor);
        if (!await roll.handleRollDialog({ type: "pneuma-group", ctrlKey: skipDialog, metaKey: false }, actor, item))
            return;
        roll = await item.confirmRoll(roll);
        await spendBonusLuck(actor, roll.luck);
        await rollHidden(roll);
        rolled = true;
        const commit = { action: "commit", row: rowId, nonce, total: roll.resultTotal, html: await nativeCard(roll) };
        const playback = { request: commit, dice: diceJSON(roll), mode: data.rollMode, roller: game.user.id, audience: messageDiceAudience(message) };
        retry.set(key, playback);
        await send(message.id, commit);
        retry.delete(key);
        await showSavedDice(playback.dice, playback.mode, playback.roller, playback.audience);
    }
    finally {
        if (!rolled)
            await send(message.id, { action: "release", row: rowId, nonce });
        ui.chat?.updateMessage(message);
    }
}
function addButton(parent, label, run, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = className;
    button.dataset.chatAction = "injury";
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); button.disabled = true; void run(event).catch(report).finally(() => { button.disabled = false; }); });
    parent.append(button);
    return button;
}
export function bindManualCard(message, html) {
    const data = state(message);
    if (!data || !canRenderCombatCard(message))
        return;
    const root = html.querySelector(".pneuma-manual-card");
    if (!root || root.dataset.bound)
        return;
    root.dataset.bound = "true";
    if (data.kind === "group") {
        // Upgrade already-saved cards to the current row presentation as well.
        if (root.querySelector(".pneuma-group-rows details") || !root.querySelector(".pneuma-group-heading"))
            root.innerHTML = groupContent(data);
        for (const total of Array.from(root.querySelectorAll(".pneuma-group-total"))) {
            const details = total.closest("li").querySelector(".pneuma-group-details");
            // Set the initial state on the rendered DOM, not just serialized chat HTML.
            details.hidden = true;
            details.style.setProperty("display", "none", "important");
            total.setAttribute("aria-expanded", "false");
            const toggle = () => {
                details.hidden = !details.hidden;
                details.style.setProperty("display", details.hidden ? "none" : "block", "important");
                total.setAttribute("aria-expanded", String(!details.hidden));
                if (!details.hidden)
                    for (const mods of Array.from(details.querySelectorAll(".d10-data-details"))) {
                        mods.classList.remove("hide");
                        mods.hidden = false;
                        mods.style.setProperty("display", "block", "important");
                    }
            };
            total.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); toggle(); });
            total.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                toggle();
            } });
        }
        if (game.user.isGM && data.hideDV && data.dv !== undefined)
            root.querySelector(".pneuma-group-dv").textContent = "DV " + data.dv + " (скрыто от игроков)";
        for (const row of data.rows ?? []) {
            if (!game.user.isGM && row.user !== game.user.id)
                continue;
            const slot = root.querySelector('[data-group-user="' + CSS.escape(row.user) + '"] .pneuma-group-action');
            if (row.state === "waiting" || retry.has(message.id + ":" + row.user)) {
                const button = addButton(slot, retry.has(message.id + ":" + row.user) ? "Завершить бросок" : "Бросить", event => rollGroup(message, data, row.user, event.shiftKey));
                button.dataset.chatAction = retry.has(message.id + ":" + row.user) ? "retry" : "roll";
                button.dataset.gmOnly = String(game.user.isGM && row.user !== game.user.id);
            }
            else if (row.state === "rolling" && game.user.isGM) {
                const button = addButton(slot, "Снять блокировку", () => send(message.id, { action: "reset", row: row.user }));
                button.dataset.gmOnly = "true";
                button.dataset.chatAction = "release";
            }
        }
        return;
    }
    const controls = root.querySelector(".pneuma-manual-controls");
    if (data.kind === "damage" && data.damage) {
        const ready = ["rolled", "applied"].includes(data.damage.status);
        if (ready)
            void renderDamage(message, exchange(data), $(html), (action, extra) => {
                if (action === "damageStatuses")
                    return send(message.id, { action: "effects", effects: extra?.statusEffects });
                return send(message.id, { action: "damage", target: extra?.targetUuid, damage: { ...extra, action } });
            }, { canEditEffects: !!game.user.isGM || game.user.id === data.creator }).catch(report);
        if ((data.damage.result?.sixes ?? 0) >= 2 && !data.injuryBusy)
            addButton(controls, "Бросить критическую травму выбранному токену", () => send(message.id, { action: "injury", target: selectedDamageTarget() }));
    }
    else if (!data.injuryBusy)
        addButton(controls, "Нанести травму выбранному токену", () => send(message.id, { action: "injury", target: selectedDamageTarget() }));
    if (game.user.isGM && (data.injuryBusy || data.damage && ["review", "applying"].includes(data.damage.status))) {
        const button = addButton(controls, "Отметить решённым после проверки Мастера", () => send(message.id, { action: "review" }));
        button.dataset.gmOnly = "true";
        button.dataset.chatAction = "review";
    }
}
function field(label, control) { const name = /name="([^"]+)"/.exec(control)?.[1] ?? 'field'; return '<div class="form-group"><label for="pneuma-roll-' + name + '">' + label + '</label><div class="form-fields">' + control.replace('name=', 'id="pneuma-roll-' + name + '" name=') + '</div></div>'; }
const pair = (content) => '<div class="pneuma-roll-pair">' + content + '</div>';
const check = (name, label, checked = false) => '<label class="pneuma-roll-check"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '>' + label + '</label>';
function numeric(name, value, min = -100, max = 100) { return '<input name="' + name + '" type="number" value="' + value + '" min="' + min + '" max="' + max + '" step="1" required>'; }
async function prompt(title, content, label, run, render) {
    await Dialog.prompt({ title, content: '<form class="pneuma-manual-form">' + content + '</form>', label, options: { width: 380, classes: ['dialog', 'pneuma-roll-dialog'] }, rejectClose: false, render: html => { const form = html[0].querySelector('form'); if (form)
            render?.(form); }, callback: async (html) => { const form = html[0].querySelector("form"); if (!form.reportValidity())
            throw Error("Заполните обязательные поля."); await run(form); } });
}
const value = (form, name) => new FormData(form).get(name)?.toString() ?? "";
async function damagePrompt() {
    await prompt("Ручной бросок урона", field("Подпись", '<input name="title" value="Manual damage" maxlength="100">') + pair(field("Кубики урона", '<select name="dice">' + Array.from({ length: 8 }, (_, i) => '<option value="' + (i + 1) + '"' + (i === 2 ? ' selected' : '') + '>' + (i + 1) + 'd6</option>').join('') + '</select>') + field("Модификатор", numeric("modifier", 0))) + field("Место попадания", '<select name="location"><option value="body">Тело</option><option value="head">Голова (прицельно)</option></select>') + '<div class="pneuma-roll-checks">' + check("armor", "Учитывать броню", true) + check("halfArmor", "Половина SP брони (округлять вверх)") + check("critical", "Критический бонус / травмы", true) + '</div>', "Бросить", async (form) => {
        const mode = rollMode(), dice = manualNumber(value(form, "dice"), "Кубики", 1, 8), modifier = manualNumber(value(form, "modifier"), "Модификатор", -100, 100);
        const { CPRDamageRoll } = await nativeRolls();
        const title = value(form, "title").trim() || "Ручной урон";
        const roll = new CPRDamageRoll(title, dice + "d6" + (modifier >= 0 ? "+" : "") + modifier, "ranged");
        roll.isAimed = value(form, "location") === "head";
        roll.location = roll.isAimed ? "head" : "body";
        const interactArmor = new FormData(form).has("armor"), halfArmor = interactArmor && new FormData(form).has("halfArmor");
        roll.rollCardExtraArgs = { ablationValue: 1, ignoreArmorPercent: halfArmor ? 50 : 0, ignoreBelowSP: 0, ammoVariety: "" };
        await rollHidden(roll);
        if (!new FormData(form).has("critical"))
            roll.wasCritical = () => false;
        const html = await nativeCard(roll);
        await create({ kind: "damage", creator: game.user.id, title, rollMode: mode, damage: { status: "rolled", user: game.user.id, nonce: foundry.utils.randomID(), result: { html, values: { ...damageValues(html), ignorePercent: halfArmor ? 50 : 0, interactArmor }, sixes: new FormData(form).has("critical") ? damageSixes(roll) : 0 } } });
        await showDice(roll, mode);
    }, form => {
        const armor = form.querySelector('[name="armor"]'), half = form.querySelector('[name="halfArmor"]');
        const sync = () => { half.disabled = !armor.checked; };
        armor.addEventListener("change", sync);
        sync();
    });
}
async function basePrompt() {
    const content = '<form class="pneuma-manual-form">' + '<div class="pneuma-roll-description-modifier">' + field("Описание", '<input name="title" value="Cyberpunk roll" maxlength="100">')
        + field("Модификатор", numeric("base", 0)) + '</div>'
        + '<div class="pneuma-roll-modes"><label class="pneuma-roll-check"><input type="radio" name="diceMode" value="standard" checked>Обычный бросок Cyberpunk 1к10</label>'
        + '<p class="pneuma-roll-hint">Выпало 10 — критический успех. Выпала 1 — критический провал.</p>'
        + '<label class="pneuma-roll-check"><input type="radio" name="diceMode" value="custom">Свой</label></div>'
        + '<fieldset class="pneuma-custom-roll" disabled><div class="pneuma-custom-dice">'
        + '<label><span>Кубики</span>' + numeric("customDice", 1, 1, 20) + '</label><span aria-hidden="true">d</span>'
        + '<label><span>Граней</span>' + numeric("customSides", 6, 1, 100) + '</label></div>'
        + '<p class="pneuma-roll-hint">1–20 кубиков, 1–100 граней.</p></fieldset></form>';
    new Dialog({ title: "Бросок Cyberpunk", content, default: "roll", render: html => {
            const fields = html[0].querySelector("form");
            const sync = () => { fields.querySelector(".pneuma-custom-roll").disabled = value(fields, "diceMode") !== "custom"; };
            fields.addEventListener("change", sync);
            sync();
        }, buttons: { roll: { label: "Бросить", callback: html => {
                    return (async () => {
                        const fields = html[0].querySelector("form"), modifier = manualNumber(value(fields, "base"), "Модификатор", -100, 100), mode = rollMode();
                        const custom = value(fields, "diceMode") === "custom", title = value(fields, "title").trim() || (custom ? "Свой бросок" : "Бросок Cyberpunk");
                        if (custom) {
                            const count = manualNumber(value(fields, "customDice"), "Кубики", 1, 20), sides = manualNumber(value(fields, "customSides"), "Грани", 1, 100);
                            const roll = await new Roll(count + "d" + sides + (modifier >= 0 ? "+" : "") + modifier).evaluate();
                            const message = { content: markRollResult('<section class="pneuma-custom-roll-card"><strong>' + esc(title) + '</strong>' + await roll.render() + '</section>', roll), speaker: ChatMessage.getSpeaker() };
                            ChatMessage.applyRollMode(message, mode);
                            await ChatMessage.create(message);
                            const { Dice } = await nativeAPI();
                            await Dice.handle3dDice(roll, mode);
                        }
                        else {
                            const { CPRRoll } = await nativeRolls(), roll = new CPRRoll(title, "1d10");
                            roll.addMod([{ value: modifier, source: "Модификатор" }]);
                            await rollHidden(roll);
                            const message = { content: await nativeCard(roll), speaker: ChatMessage.getSpeaker() };
                            ChatMessage.applyRollMode(message, mode);
                            await ChatMessage.create(message);
                            await showDice(roll, mode);
                        }
                    })().catch(report);
                } } } }, { width: 380, classes: ["dialog", "pneuma-roll-dialog"] }).render(true);
}
/** A roll-under check, deliberately separate from native STAT + d10 skill-style rolls. */
async function statPrompt(selectedStat) {
    const tokens = canvas.tokens?.controlled ?? [];
    if (tokens.length > 1)
        throw Error("Для броска характеристики выберите только один токен.");
    const actor = tokens.length ? tokens[0].actor : game.user?.character;
    if (!actor?.isOwner || ["container", "blackIce", "demon"].includes(String(actor.type)))
        throw Error("Выберите свой токен или сначала назначьте своего персонажа.");
    const stats = ["int", "ref", "dex", "tech", "cool", "will", "move", "body", "luck", "emp"];
    const current = (source, stat) => {
        const native = source;
        const result = native.getStat(stat);
        if (!Number.isFinite(result))
            throw Error("У персонажа нет текущего значения " + statLabel(stat) + ".");
        return result;
    };
    const options = stats.filter(stat => foundry.utils.getProperty(actor, "system.stats." + stat + ".value") !== undefined)
        .map(stat => '<option value="' + stat + '">' + statLabel(stat) + ' (' + current(actor, stat) + ')</option>').join('');
    if (!options)
        throw Error("У персонажа нет доступных характеристик.");
    const run = async (stat) => {
        const source = await fromUuid(actor.uuid);
        if (!source?.isOwner)
            throw Error("Персонаж недоступен или больше вам не принадлежит.");
        if (!stats.includes(stat))
            throw Error("Выберите корректную характеристику.");
        const target = current(source, stat), mode = rollMode(), { CPRRoll } = await nativeRolls();
        const roll = new CPRRoll((source.name ?? "Персонаж") + " — бросок " + statLabel(stat), "1d10");
        roll.calculateCritical = false;
        roll.wasCritical = () => false;
        await rollHidden(roll);
        const success = roll.resultTotal < target;
        const result = '<p class="pneuma-stat-result" data-stat-outcome="' + (success ? 'success' : 'fail') + '">' + statLabel(stat) + ' ' + target + ' · выпало ' + roll.resultTotal + ' · <strong>' + (success ? 'Успех' : 'Провал') + '</strong> (бросок ниже значения)</p>';
        const message = { content: '<section class="pneuma-combat-message pneuma-stat-card">' + await nativeCard(roll) + result + '</section>', speaker: ChatMessage.getSpeaker({ actor: source }) };
        ChatMessage.applyRollMode(message, mode);
        await ChatMessage.create(message);
        await showDice(roll, mode);
    };
    if (selectedStat) {
        await run(selectedStat);
        return;
    }
    await prompt("Бросок характеристики", '<p class="pneuma-roll-character">' + esc(actor.name) + '</p>' + field("Характеристика", '<select name="stat">' + options + '</select>') + '<p class="pneuma-roll-hint">Нужно выбросить меньше текущего значения характеристики. Ничья — провал. Критических успехов и провалов нет.</p>', "Бросить", async (form) => run(value(form, "stat")));
}
async function criticalPrompt() {
    await prompt("Критическая травма", field("Место попадания", '<select name="location"><option value="body">Тело</option><option value="head">Голова</option></select>'), "Бросить", async (form) => {
        const mode = rollMode(), location = value(form, "location") === "head" ? "head" : "body";
        await create({ kind: "critical", creator: game.user.id, title: "Критическая травма", rollMode: mode, injury: await rollInjury(location, mode) });
    });
}
function bindGroupShortcuts(form) {
    const root = form.querySelector(".pneuma-group-shortcuts");
    const select = form.querySelector('[name="skill"]');
    const path = "flags." + M + ".groupSkillShortcuts";
    let busy = false;
    const draw = () => {
        const saved = foundry.utils.getProperty(game.user, path);
        root.replaceChildren();
        for (let index = 0; index < 3; index++) {
            const name = Array.isArray(saved) ? saved[index] : undefined;
            const row = document.createElement("div");
            row.className = "pneuma-group-shortcut-row";
            const button = document.createElement("button");
            button.type = "button";
            const icon = document.createElement("i");
            icon.className = name ? "fas fa-star" : "fas fa-plus";
            icon.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.textContent = name || "Сохранить выбранный навык";
            button.append(icon, label);
            button.className = "pneuma-group-shortcut";
            button.dataset.empty = String(!name);
            button.setAttribute("aria-pressed", String(!!name && select.value === name));
            button.title = name ? "Выбрать: " + name : "Сохранить выбранный навык в ячейку " + (index + 1);
            button.setAttribute("aria-label", button.title);
            button.disabled = !!name && !Array.from(select.options).some(option => option.value === name);
            button.addEventListener("click", () => {
                if (name) {
                    select.value = name;
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                    return;
                }
                void save(index, select.value);
            });
            row.append(button);
            if (name) {
                const clear = document.createElement("button");
                clear.type = "button";
                clear.className = "pneuma-group-shortcut-clear";
                clear.textContent = "×";
                clear.title = "Убрать: " + name;
                clear.setAttribute("aria-label", clear.title);
                clear.addEventListener("click", () => { void save(index, null); });
                row.append(clear);
            }
            root.append(row);
        }
    };
    const save = async (index, name) => {
        if (busy || !game.user.isGM)
            return;
        busy = true;
        try {
            const stored = foundry.utils.getProperty(game.user, path);
            const slots = Array.from({ length: 3 }, (_, i) => Array.isArray(stored) ? stored[i] ?? null : null);
            if (name && slots.includes(name))
                throw Error("Для этого навыка уже есть быстрая кнопка.");
            slots[index] = name;
            await game.user.update({ [path]: slots });
            draw();
        }
        catch (error) {
            report(error);
        }
        finally {
            busy = false;
        }
    };
    select.addEventListener("change", draw);
    draw();
}
async function groupPrompt() {
    if (!game.user.isGM)
        throw Error("Групповую проверку может запросить только Мастер.");
    const users = game.users.filter(user => !user.isGM && !!user.character);
    const skills = [...new Set(users.flatMap(user => user.character.items.filter(item => String(item.type) === "skill").map(item => item.name)))].sort();
    if (!users.length || !skills.length)
        throw Error("Перед групповой проверкой назначьте игрокам персонажей с навыками.");
    await prompt("Запросить групповую проверку", field("Навык", '<select name="skill">' + skills.map(skill => '<option>' + esc(skill) + '</option>').join('') + '</select>') + '<div class="pneuma-group-shortcuts" role="group" aria-label="Common group skills"></div>' + pair(field("DV (необязательно)", '<input name="dv" type="number" min="0" max="100" step="1" placeholder="No DV">') + check("hideDV", "Скрыть DV от игроков")) + '<fieldset><legend>Игроки</legend>' + users.map(user => '<label class="pneuma-group-player"><input name="players" type="checkbox" value="' + esc(user.id) + '"' + (user.active ? ' checked' : '') + '>' + esc(user.name) + ' — ' + esc(user.character.name) + (user.active ? '' : ' (не в сети)') + '</label>').join('') + '</fieldset>', "Запросить броски", async (form) => {
        if (!game.user.isGM)
            throw Error("Только для Мастера.");
        const ids = new FormData(form).getAll("players").map(String), chosen = users.filter(user => ids.includes(user.id));
        if (!chosen.length)
            throw Error("Выберите хотя бы одного игрока.");
        const skill = value(form, "skill");
        for (const user of chosen)
            if (!user.character.testUserPermission(user, "OWNER") || !user.character.items.some(item => String(item.type) === "skill" && item.name === skill))
                throw Error(user.name + " должен владеть персонажем с навыком " + skill + ".");
        const dv = value(form, "dv");
        await create({ kind: "group", creator: game.user.id, title: skill, rollMode: "roll", skill, ...(dv !== "" ? { dv: manualNumber(dv, "DV", 0, 100) } : {}), hideDV: new FormData(form).has("hideDV"), rows: chosen.map(user => ({ user: user.id, actor: user.character.uuid, name: user.name + " — " + user.character.name, state: "waiting" })) });
    }, bindGroupShortcuts);
}
export async function manualEvasion(skipDialog = false) {
    const selected = canvas.tokens?.controlled ?? [];
    if (selected.length !== 1 || !selected[0]?.actor)
        throw Error("Сначала выберите один токен персонажа.");
    const actor = selected[0].actor;
    if (["container", "blackIce", "demon"].includes(String(actor.type)))
        throw Error("Сначала выберите токен персонажа.");
    if (!actor.isOwner)
        throw Error("Вы не управляете этим персонажем.");
    const skill = findNativeItem(actor.items, "Evasion");
    if (!skill)
        throw Error("У персонажа нет навыка «Уклонение».");
    const sheet = actor.sheet;
    if (!sheet?._onRoll)
        throw Error("Лист персонажа не предоставляет штатный обработчик бросков CPR.");
    const control = document.createElement("a");
    control.dataset.itemId = skill.id;
    control.dataset.rollType = "skill";
    control.dataset.rollTitle = skill.name;
    await sheet._onRoll({ currentTarget: control, target: control, type: "pneuma-manual-evasion",
        ctrlKey: skipDialog, metaKey: false, shiftKey: skipDialog });
}
async function characterRollPrompt(kind) {
    const selected = canvas.tokens?.controlled ?? [];
    if (selected.length !== 1 || !selected[0]?.actor || ["container", "blackIce", "demon"].includes(String(selected[0].actor.type)))
        throw Error("Сначала выберите один токен персонажа.");
    const actor = selected[0].actor;
    if (!actor.isOwner)
        throw Error("Вы не управляете этим персонажем.");
    const favorite = (choice) => ({ kind, name: choice.name, subtype: choice.subtype });
    let choices = [];
    let filter = "", selectedStat = "";
    const content = () => {
        choices = actor.items.filter(item => String(item.type) === (kind === "skill" ? "skill" : "role")).flatMap(item => {
            const data = item.system;
            if (kind === "skill")
                return [{ item, name: item.name, hasRoll: true, rank: data.level, stat: data.stat }];
            return [{ item, name: data.mainRoleAbility || item.name, subtype: "mainRoleAbility", hasRoll: data.hasRoll, rank: data.rank },
                ...(data.abilities ?? []).map(ability => ({ item, name: ability.name, subtype: "subRoleAbility", hasRoll: ability.hasRoll, rank: ability.rank }))];
        }).sort((a, b) => a.name.localeCompare(b.name));
        const stats = kind === "skill" ? '<div class="pneuma-skill-stat-roll"><label>Характеристика <select data-stat-choice>' + ["int", "ref", "dex", "tech", "cool", "will", "move", "body", "luck", "emp"].filter(stat => foundry.utils.getProperty(actor, "system.stats." + stat + ".value") !== undefined).map(stat => '<option value="' + stat + '"' + (selectedStat === stat ? ' selected' : '') + '>' + statLabel(stat) + ' (' + actor.getStat(stat) + ')</option>').join('') + '</select></label><button type="button" data-stat-roll>Бросить характеристику</button><small>Ниже значения; ничья — провал.</small></div><label class="pneuma-skill-filter">Найти навык <input type="search" data-skill-filter value="' + esc(filter) + '" placeholder="Название навыка"></label>' : '';
        return stats + '<div class="pneuma-character-roll-list"><table><thead><tr><th class="text-normal text-bold">Избранное</th><th class="text-normal text-bold">' + (kind === "skill" ? 'Навык' : 'Ролевая способность') + '</th><th class="text-normal text-bold">' + (kind === "skill" ? 'Уровень' : 'Ранг') + '</th><th class="text-normal text-bold">Мод.</th>' + (kind === "skill" ? '<th class="text-normal text-bold">Основа</th>' : '') + '<th class="text-normal text-bold" colspan="2">Действия</th></tr></thead><tbody>' + choices.map((choice, index) => {
            // Same modifier helper and base formula as CPR's character sheet.
            const mod = Number(Handlebars.helpers.cprGetSkillModInfo(choice.name, actor, "modTotal", { hash: {} }));
            const base = choice.rank + mod + Number(foundry.utils.getProperty(actor, `system.stats.${choice.stat}.value`));
            const starred = rollFavorites().some(f => sameFavorite(f, favorite(choice)));
            const star = choice.hasRoll ? '<button type="button" class="pneuma-roll-favorite" data-choice="' + index + '" data-action="favorite" aria-label="' + (starred ? 'Убрать из избранного: ' : 'В избранное: ') + esc(choice.name) + '" aria-pressed="' + starred + '" title="' + (starred ? 'Убрать из избранного' : 'В избранное (не больше 3 навыков и ролевых способностей)') + '"><i class="' + (starred ? 'fas' : 'far') + ' fa-star" aria-hidden="true"></i></button>' : '';
            return '<tr data-skill-name="' + esc(choice.name.toLowerCase()) + '"' + (kind === "skill" && !choice.name.toLowerCase().includes(filter.toLowerCase().trim()) ? ' hidden' : '') + '><td>' + star + '</td><td>' + esc(choice.name) + (kind === "roleAbility" ? '<small>' + esc(choice.item.name) + '</small>' : '') + '</td><td>' + choice.rank + '</td><td>' + mod + '</td>' + (kind === "skill" ? '<td>' + base + '</td>' : '') + '<td><button type="button" data-choice="' + index + '" data-action="view" aria-label="Открыть: ' + esc(choice.name) + '">Открыть</button></td><td><button type="button" data-choice="' + index + '" data-action="roll" aria-label="Бросить: ' + esc(choice.name) + '"' + (choice.hasRoll ? '' : ' disabled title="У этой способности нет штатного броска"') + '>Бросить</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    };
    const initial = content();
    if (!choices.length)
        throw Error(kind === "skill" ? "У персонажа нет навыков." : "У персонажа нет ролевых способностей.");
    const run = async (choice, action, skipDialog = false) => {
        if (!actor.isOwner)
            throw Error("Вы не управляете этим персонажем.");
        if (!choice || actor.items.get(choice.item.id) !== choice.item)
            throw Error("Эта способность больше недоступна.");
        if (action === "favorite") {
            await toggleRollFavorite(actor, favorite(choice));
            dialog.data.content = content();
            dialog.render(false);
            return;
        }
        if (action === "view") {
            choice.item.sheet?.render(true);
            return;
        }
        if (!choice.hasRoll)
            return;
        // The native sheet owns modifiers, dialogs, LUCK, dice animation and chat publication.
        const sheet = actor.sheet;
        if (!sheet?._onRoll)
            throw Error("Лист персонажа не предоставляет штатный обработчик бросков CPR.");
        const control = document.createElement("a");
        control.dataset.itemId = choice.item.id;
        control.dataset.rollType = kind;
        control.dataset.rollTitle = choice.name;
        if (choice.subtype)
            control.dataset.rollSubtype = choice.subtype;
        await sheet._onRoll({ currentTarget: control, target: control, type: skipDialog ? "pneuma-fast" : "click", ctrlKey: skipDialog, metaKey: false, shiftKey: skipDialog });
    };
    let busy = false;
    const hooks = [];
    const dialog = new Dialog({ title: (kind === "skill" ? "Бросок навыка — " : "Ролевая способность — ") + actor.name, content: initial, buttons: {},
        render: html => {
            const root = html[0];
            root.querySelector("[data-skill-filter]")?.addEventListener("input", event => { filter = event.currentTarget.value; root.querySelectorAll("tr[data-skill-name]").forEach(row => { row.hidden = !row.dataset.skillName.includes(filter.toLowerCase().trim()); }); });
            root.querySelector("[data-stat-choice]")?.addEventListener("change", event => { selectedStat = event.currentTarget.value; });
            root.querySelector("[data-stat-roll]")?.addEventListener("click", () => { if (busy)
                return; busy = true; const stat = root.querySelector("[data-stat-choice]").value; void statPrompt(stat).catch(report).finally(() => { busy = false; }); });
            root.querySelectorAll("button[data-choice]").forEach(button => button.addEventListener("click", event => {
                if (busy)
                    return;
                const choice = choices[Number(button.dataset.choice)];
                if (!choice)
                    return;
                busy = true;
                void run(choice, button.dataset.action, event.shiftKey).catch(report).finally(() => { busy = false; });
            }));
        }, close: () => { for (const [event, id] of hooks)
            Hooks.off(event, id); } }, { width: kind === "skill" ? 630 : 590, classes: ["pneuma-roll-dialog"] });
    const refresh = (document) => {
        if (document !== actor && document.parent !== actor && document.parent?.parent !== actor)
            return;
        dialog.data.content = content();
        dialog.render(false);
    };
    for (const event of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
        hooks.push([event, Hooks.on(event, refresh)]);
    hooks.push(["updateUser", Hooks.on("updateUser", (user) => { if (user.id === game.user?.id) {
            dialog.data.content = content();
            dialog.render(false);
        } })]);
    dialog.render(true);
}
let closeRollFlyout;
export function openManualRolls(anchor = document.querySelector("[data-pneuma-manual-rolls]")) {
    if (closeRollFlyout) {
        closeRollFlyout();
        return;
    }
    if (!anchor)
        return;
    const panel = document.createElement("div");
    panel.className = "pneuma-roll-flyout";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", "Ручные броски");
    const heading = document.createElement("div");
    heading.className = "pneuma-roll-flyout-title";
    heading.textContent = "Ручные броски";
    heading.setAttribute("aria-hidden", "true");
    panel.append(heading);
    panel.tabIndex = -1;
    const events = new AbortController();
    const close = (focus = false) => { events.abort(); panel.remove(); anchor.setAttribute("aria-expanded", "false"); closeRollFlyout = undefined; if (focus && anchor.isConnected)
        anchor.focus(); };
    closeRollFlyout = () => close();
    anchor.setAttribute("aria-expanded", "true");
    const sections = [
        [["base", "Обычный бросок", "fa-dice-d10", basePrompt]],
        [["skill", "Навык / характеристика", "fa-list", () => characterRollPrompt("skill")], ["role", "Ролевая способность", "fa-star", () => characterRollPrompt("roleAbility")], ["treatment", "Лечение", "fa-kit-medical", () => openTreatment()]],
        [["damage", "Урон", "fa-burst", damagePrompt], ["critical", "Критическая травма", "fa-heart-crack", criticalPrompt], ["evasion", "Уклонение", "fa-person-running", event => manualEvasion(event.shiftKey)]]
    ];
    if (game.user?.isGM)
        sections.push([["group", "Групповая проверка", "fa-users", groupPrompt]]);
    const favorites = rollFavorites();
    if (favorites.length)
        sections.push(favorites.map((favorite, index) => ["favorite-" + index, favorite.name, "fa-star", async (event) => {
                const selected = canvas.tokens?.controlled ?? [];
                if (selected.length !== 1 || !selected[0]?.actor || ["container", "blackIce", "demon"].includes(String(selected[0].actor.type)))
                    throw Error("Сначала выберите один токен персонажа.");
                const actor = selected[0].actor;
                await rollFavorite(actor, favorite, event.shiftKey);
            }]));
    for (const choices of sections) {
        const section = document.createElement("div");
        section.className = "pneuma-roll-section";
        section.setAttribute("role", "group");
        panel.append(section);
        for (const [id, label, icon, run] of choices) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.rollChoice = id;
            button.setAttribute("role", "menuitem");
            button.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i><span>' + label + '</span>' + (id === "group" ? '<small>Мастер</small>' : '');
            button.addEventListener("click", event => { close(); void run(event).catch(report); });
            if (id.startsWith("favorite-")) {
                const favorite = favorites[Number(id.slice("favorite-".length))];
                const row = document.createElement("div");
                row.className = "pneuma-roll-favorite-row";
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "pneuma-roll-favorite-remove";
                remove.dataset.removeFavorite = id;
                remove.textContent = "×";
                remove.title = "Убрать из избранного: " + favorite.name;
                remove.setAttribute("aria-label", remove.title);
                remove.setAttribute("role", "menuitem");
                remove.addEventListener("click", () => {
                    remove.disabled = true;
                    void removeRollFavorite(favorite).then(() => { row.remove(); panel.focus(); }).catch(report).finally(() => { remove.disabled = false; });
                });
                row.append(button, remove);
                section.append(row);
            }
            else
                section.append(button);
        }
    }
    document.body.append(panel);
    const rect = anchor.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8)) + "px";
    panel.style.top = Math.max(8, Math.min(rect.top - bounds.height - 6, window.innerHeight - bounds.height - 8)) + "px";
    panel.focus({ preventScroll: true });
    document.addEventListener("pointerdown", event => { if (!panel.contains(event.target) && !anchor.contains(event.target))
        close(); }, { signal: events.signal });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            close(true);
        }
        else if (event.key === "Tab")
            close();
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const buttons = Array.from(panel.querySelectorAll("button")), index = buttons.indexOf(document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
        }
    }, { signal: events.signal });
    window.addEventListener("resize", () => close(), { signal: events.signal });
}
function updateRollSparkles(icon, enabled) {
    const existing = icon.querySelector(".pneuma-roll-sparkles");
    if (!enabled) {
        existing?.remove();
        return;
    }
    if (existing)
        return;
    const sparkles = document.createElement("span");
    sparkles.className = "pneuma-roll-sparkles";
    sparkles.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 5; index++) {
        const star = document.createElement("span");
        star.className = "pneuma-roll-sparkle";
        sparkles.append(star);
    }
    icon.append(sparkles);
}
export function registerManualRolls() {
    game.keybindings.register(M, "groupSkillCheck", {
        name: "Групповая проверка навыка (Мастер)",
        hint: "Открыть диалог групповой проверки, чтобы запросить броски у персонажей игроков.",
        editable: [{ key: "KeyZ", modifiers: ["Alt", "Shift"] }],
        restricted: true,
        repeat: false,
        onDown: () => {
            if (!game.user?.isGM)
                return false;
            void groupPrompt().catch(report);
            return true;
        },
    });
    game.settings.register(M, "showRollMenuSparkles", {
        name: "Искры у кнопки меню бросков",
        hint: "Показывать на этом компьютере эффект искр вокруг кнопки меню бросков в чате.",
        scope: "client", config: true, type: Boolean, default: true,
        onChange: (enabled) => document.querySelectorAll("[data-pneuma-manual-rolls]").forEach(icon => updateRollSparkles(icon, enabled)),
    });
    Hooks.on('renderDialog', (_app, html) => {
        const root = html[0];
        if (!root?.matches('.pneuma-roll-dialog'))
            return;
        root.querySelector('.window-content')?.classList.add('dialog-sheet');
        root.querySelectorAll('form').forEach(form => form.classList.add('dialog-sheet'));
        root.querySelectorAll('button').forEach(button => button.classList.add('cpr-dialog-button'));
    });
    Hooks.on("renderChatLog", (_app, html) => {
        const icon = html[0]?.querySelector("#chat-controls .fa-dice-d20, .chat-controls .fa-dice-d20");
        closeRollFlyout?.();
        if (!icon || icon.dataset.pneumaManualRolls)
            return;
        icon.dataset.pneumaManualRolls = "true";
        icon.setAttribute("role", "button");
        icon.setAttribute("aria-haspopup", "menu");
        icon.setAttribute("aria-expanded", "false");
        icon.tabIndex = 0;
        icon.title = "Ручные броски";
        icon.setAttribute("aria-label", "Ручные броски");
        updateRollSparkles(icon, game.settings.get(M, "showRollMenuSparkles"));
        icon.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openManualRolls(icon); });
        icon.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openManualRolls(icon);
        } });
    });
    Hooks.on("renderChatMessage", (message, html) => { if (html[0])
        bindManualCard(message, html[0]); });
    Hooks.once("ready", () => game.socket.on(channel, (wire) => {
        if (wire?.manualType === "request" && game.user.id === authority()?.id) {
            const next = queue.catch(() => { }).then(() => handleManualRequest(wire));
            queue = next;
            void next.then(() => game.socket.emit(channel, { ...wire, manualType: "reply", gm: game.user.id }), error => game.socket.emit(channel, { ...wire, manualType: "reply", gm: game.user.id, error: error.message }));
        }
        else if (wire?.manualType === "reply")
            requests.reply({ ...wire, gm: wire.gm ?? "" }, undefined);
    }));
}
