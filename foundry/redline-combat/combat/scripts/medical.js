import { sceneEncounter } from "./encounter.js";
import { withActorMutation } from "./actor-mutation.js";
import { allActors, escapeHTML, primaryGM } from "./shared.js";
import { findNativeItem } from "./native-lookup.js";
import { nativeCard, spendBonusLuck } from "./native-combat.js";
import { checkedLuck } from "./evasion-rules.js";
import { statusAuthority, syncActorStatuses } from "./status-sync.js";
import { masterStatuses } from "./status-catalog.js";
import { requireCombatSocket } from "./socket-health.js";
import { postTreatment } from "./treatment-card.js";
import { injuryTreatmentChoices, nativeTreatmentSkill, permanentQuickFix, stabilizationDifficulty, stabilizationSkills } from "./medical-rules.js";
import { GMRequests } from "./gm-request.js";
import { quickFixExpired } from "./effect-lifetime.js";
const M = "redline-combat", STATUS = "pneuma-needs-stabilization", DAY = 86400;
const get = (doc, path) => foundry.utils.getProperty(doc, path);
export const medicalEnabled = () => !!game.settings?.get(M, "enableStabilization");
export const needsStabilization = (actor) => actor.effects.some(effect => !effect.disabled && effect.statuses.has(STATUS));
export const medicalHP = (actor) => Number(get(actor, "system.derivedStats.hp.value"));
const maximum = (actor) => Number(get(actor, "system.derivedStats.hp.max"));
export const stabilizationDV = (actor) => stabilizationDifficulty(medicalHP(actor), maximum(actor));
const medtech = (actor) => Number(get(findNativeItem(actor.items, "Medtech") ?? {}, "system.rank")) > 0;
const dose = (actor) => Array.from(actor.items).find(item => String(item.type) === "drug" && findNativeItem([item], "Speedheal") && Number(get(item, "system.amount")) > 0);
const hasSpeedheal = (actor) => actor.effects.some(effect => !effect.disabled && (effect.statuses.has("speedheal") || effect.statuses.has(masterStatuses.find(status => status.name === "Speed Heal").id)));
export const quickFixed = (item) => !!get(item, `flags.${M}.quickFix`);
const speedhealOperation = (actor) => get(actor, `flags.${M}.speedhealOperation`);
function medicalBase(actor, choice) {
    const stat = String(get(choice.item, "system.stat") ?? "tech");
    const native = actor;
    const rank = Number(get(choice.item, "system.level")), value = Number(native.getStat?.(stat) ?? get(actor, `system.stats.${stat}.value`));
    return Number.isFinite(rank) && Number.isFinite(value) ? rank + value : undefined;
}
function medicalSkillLabel(actor, choice) {
    return `(${choice.name === "Paramedic" ? "Парамед." : "Перв. пом."} ${medicalBase(actor, choice) ?? "?"})`;
}
function skills(actor, injury) {
    const choices = injury ? injuryTreatmentChoices(injury).filter(row => row.stage === "QuickFix") : stabilizationSkills.map(skill => ({ skill, dv: 0 }));
    return choices.flatMap(choice => { const native = nativeTreatmentSkill(actor, choice.skill); return native ? [{ name: choice.skill, item: native.item, dv: choice.dv }] : []; });
}
export function medicalEntries(source, target) {
    if (!target || !["character", "mook"].includes(String(target.type)))
        return [];
    const dead = masterStatuses.find(status => status.name === "Dead")?.id;
    const unavailable = target.effects.some(effect => !effect.disabled && (effect.statuses.has("dead") || !!dead && effect.statuses.has(dead)));
    const rows = [];
    if (needsStabilization(target)) {
        const choices = source ? skills(source) : [];
        for (const choice of choices)
            rows.push({ action: "stabilize", skill: choice.name, groupLabel: "Стабилизировать — DV" + stabilizationDV(target), choiceLabel: choice.name + " (" + (medicalBase(source, choice) ?? "?") + ")", label: "Стабилизировать — DV" + stabilizationDV(target) + " " + medicalSkillLabel(source, choice), disabled: unavailable, title: "Действие; бросок " + choice.name + "; в скобках навык + характеристика без модификаторов броска" });
        if (!choices.length)
            rows.push({ action: "stabilize", label: "Стабилизировать — DV" + stabilizationDV(target), disabled: true, title: source ? "Нужен навык «Первая помощь» или «Парамедицина»" : "Выберите персонажа, который будет лечить" });
    }
    if (source && !unavailable) {
        const operation = speedhealOperation(target), resuming = operation?.source === source.uuid;
        if (medtech(source) && (resuming || medicalHP(target) < maximum(target) && dose(source)))
            rows.push({ action: "speedheal", label: resuming ? "Продолжить SpeedHeal" : "SpeedHeal", disabled: medicalHP(target) < 1 || !!operation && !resuming || hasSpeedheal(target) && !resuming, title: resuming ? "Завершить прерванную дозу, не тратя новую" : "ТЕЛ + ВОЛ HP; состояние Speed Heal не даёт повторить до конца боя; не лечит находящихся при смерти" });
        for (const injury of target.items.filter(item => String(item.type) === "criticalInjury" && !quickFixed(item) && skills(source, item).length > 0))
            for (const choice of skills(source, injury))
                rows.push({ action: "quickFix", item: injury.id, skill: choice.name, groupLabel: injury.name ?? "Травма", choiceLabel: choice.name + " — DV" + choice.dv + " (" + (medicalBase(source, choice) ?? "?") + ")", label: injury.name + " — DV" + choice.dv + " " + medicalSkillLabel(source, choice), title: "Quick Fix: 1 минута; навык и DV травмы — штатные" });
    }
    return rows;
}
function inActiveCombat(actor) {
    return Array.from(game.combats?.values() ?? []).some(combat => combat.active && combat.started && combat.combatants.some(row => actor.isToken ? row.token?.uuid === actor.token?.uuid : row.actor?.uuid === actor.uuid));
}
/** Only HP loss by a participant in an active, started encounter is eligible. */
const damageWork = new Map();
export async function markMedicalDamage(actor, before) {
    const damaged = medicalEnabled() && inActiveCombat(actor) && ["character", "mook"].includes(String(actor.type)) && medicalHP(actor) < before;
    if (!damaged)
        return;
    const key = actor.uuid;
    const next = (damageWork.get(key) ?? Promise.resolve()).catch(() => { }).then(async () => {
        if (!medicalEnabled() || !inActiveCombat(actor))
            return;
        if (!needsStabilization(actor))
            await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Needs Stabilization", img: "icons/svg/regen.svg", statuses: [STATUS], changes: [] }]);
    });
    damageWork.set(key, next);
    try {
        await next;
    }
    finally {
        if (damageWork.get(key) === next)
            damageWork.delete(key);
    }
}
let work = Promise.resolve();
function medicalWork(run) { const next = work.catch(() => { }).then(run); work = next; return next; }
const completed = new Set();
export function resolveMedical(request) {
    return medicalWork(async () => {
        if (game.user?.id !== primaryGM()?.id)
            throw Error("Нужен активный Мастер.");
        const key = request.user + ":" + request.id;
        if (completed.has(key))
            return;
        await applyMedical(request);
        completed.add(key);
        if (completed.size > 200)
            completed.delete(completed.values().next().value);
    });
}
async function applyMedical(req) {
    if (game.user?.id !== primaryGM()?.id)
        throw Error("Нужен активный Мастер.");
    const user = game.users?.get(req.user), source = await fromUuid(req.source), target = await fromUuid(req.target);
    if (!user || !source?.actor || !target?.actor || !user.isGM && !source.actor.testUserPermission(user, "OWNER"))
        throw Error("Выберите своего персонажа и пациента.");
    if (source.parent?.id !== target.parent?.id)
        throw Error("Оба персонажа должны быть на одной сцене.");
    const grid = source.parent?.grid, size = Number(grid?.size);
    if (source.uuid !== target.uuid && size > 0 && Math.max(Math.abs(source.x - target.x), Math.abs(source.y - target.y)) > size)
        throw Error("Сначала подойдите к пациенту.");
    const healer = source.actor, patient = target.actor;
    return withActorMutation(patient, () => applyPatient(req, healer, patient, target));
}
async function applyPatient(req, healer, patient, target) {
    const healed = get(patient, `flags.${M}.speedhealCompleted`);
    if (req.action === "speedheal" && healed?.id === req.id && healed.user === req.user)
        return;
    if (!medicalEntries(healer, patient).some(row => row.action === req.action && row.item === req.item && (!req.skill || row.skill === req.skill) && !row.disabled))
        throw Error("Это медицинское действие больше недоступно.");
    if (medicalHP(patient) !== req.hp && !(req.action === "speedheal" && speedhealOperation(patient)))
        throw Error("HP пациента изменилось. Бросок сохранён; снова откройте «Медицину», чтобы повторить.");
    if (req.action === "stabilize" && req.dv !== undefined && req.dv !== stabilizationDV(patient))
        throw Error("Состояние ранения пациента изменилось. Сверьте сохранённый бросок с Мастером, прежде чем повторять.");
    if (req.action === "speedheal") {
        let operation = speedhealOperation(patient);
        const stock = operation ? healer.items.get(operation.stock) : dose(healer);
        if (!stock)
            throw Error("Дозы Speedheal нет. Сверьте прерванную операцию с Мастером.");
        const amount = operation?.amount ?? Number(get(patient, "system.stats.body.value")) + Number(get(patient, "system.stats.will.value"));
        if (!Number.isFinite(amount) || amount <= 0)
            throw Error("ТЕЛ/ВОЛ пациента недоступны.");
        if (!operation) {
            operation = { id: req.id, source: healer.uuid, stock: stock.id, amount };
            await patient.update({ [`flags.${M}.speedhealOperation`]: operation });
        }
        const operationId = operation.id;
        const status = masterStatuses.find(status => status.name === "Speed Heal");
        const encounter = sceneEncounter(target.parent?.id);
        const combat = encounter?.combatants.some(row => row.token?.uuid === target.uuid) ? encounter : undefined;
        if (!patient.effects.some(effect => get(effect, `flags.${M}.speedhealOperation`) === operationId))
            await patient.createEmbeddedDocuments("ActiveEffect", [{ name: status.name, img: status.img, statuses: [status.id], changes: [], flags: { [M]: { speedhealOperation: operationId, ...(combat ? { endWithCombat: combat.id } : {}) } } }]);
        const receipt = `flags.${M}.speedhealDoses.${operationId}`;
        if (!get(stock, receipt)) {
            const remaining = Number(get(stock, "system.amount"));
            if (!(remaining > 0))
                throw Error("Дозы Speedheal больше нет.");
            // Stock and receipt change together; retry remains safe if confirmation is lost.
            await stock.update({ "system.amount": remaining - 1, [receipt]: true });
        }
        // Healing and operation completion are one document update.
        await patient.update({ "system.derivedStats.hp.value": Math.min(maximum(patient), medicalHP(patient) + amount), [`flags.${M}.-=speedhealOperation`]: null, [`flags.${M}.speedhealCompleted`]: { id: req.id, user: req.user } });
        try {
            await stock.update({ [`flags.${M}.speedhealDoses.-=${operationId}`]: null });
        }
        catch (error) {
            console.warn(M, "Speedheal dose receipt cleanup failed", error);
        }
    }
    else if (req.action === "stabilize") {
        if (!Number.isFinite(req.total) || req.total <= stabilizationDV(patient))
            return;
        if (medicalHP(patient) < 1) {
            await patient.update({ "system.derivedStats.hp.value": 1 });
            const status = masterStatuses.find(s => s.name === "Unconscious");
            if (!patient.effects.some(e => !e.disabled && e.statuses.has(status.id)))
                await patient.createEmbeddedDocuments("ActiveEffect", [{ name: "Unconscious", img: status.img, statuses: [status.id], changes: [], duration: { seconds: 60, startTime: game.time.worldTime } }]);
        }
        await patient.deleteEmbeddedDocuments("ActiveEffect", patient.effects.filter(e => e.statuses.has(STATUS)).map(e => e.id));
    }
    else if (req.action === "quickFix") {
        const injury = patient.items.get(req.item), options = skills(healer, injury);
        if (!Number.isFinite(req.total) || !options.some(option => option.name === req.skill && req.total > option.dv))
            return;
        if (permanentQuickFix(injury)) {
            const markers = patient.effects.filter(e => e.origin === injury.uuid || e.statuses.has(masterStatuses.find(s => s.binding?.itemId === injury.id)?.id ?? ""));
            await patient.deleteEmbeddedDocuments("Item", [injury.id]);
            if (markers.length)
                await patient.deleteEmbeddedDocuments("ActiveEffect", markers.map(e => e.id));
        }
        else {
            const encounter = sceneEncounter(target.parent?.id);
            const saved = { combat: encounter?.combatants.some(row => row.token?.uuid === target.uuid) ? encounter.id : null, expires: game.time.worldTime + DAY, effects: injury.effects.filter(e => !e.disabled).map(e => e.id), deathSave: get(injury, "system.deathSaveIncrease") };
            await injury.update({ [`flags.${M}.quickFix`]: saved, "system.deathSaveIncrease": false });
            if (saved.effects.length)
                await injury.updateEmbeddedDocuments("ActiveEffect", saved.effects.map(_id => ({ _id, disabled: true })));
            const status = masterStatuses.find(s => s.name === "Quick Fix");
            await patient.createEmbeddedDocuments("ActiveEffect", [{ name: "Quick Fix — " + injury.name, img: status.img, statuses: [status.id], changes: [], origin: injury.uuid }]);
        }
        await syncActorStatuses(patient);
    }
}
const requests = new GMRequests();
function preflightMedical() { requireCombatSocket(); const gm = primaryGM(); if (!gm)
    throw Error("Нужен активный Мастер."); return gm; }
async function send(req) {
    const gm = preflightMedical();
    if (game.user.id === gm.id)
        return resolveMedical(req);
    return requests.request(req.id, () => game.socket.emit("module." + M, req), 30000, "Медицинское действие не подтверждено. Проверьте пациента и инвентарь, прежде чем повторять.");
}
const savedRolls = new Map(), medicalBusy = new Set();
export async function performMedical(source, target, action, itemId, skipDialog = false, selectedSkill) {
    const key = [game.user?.id, source.document.uuid, target.document.uuid, action, itemId, selectedSkill].join(":");
    if (medicalBusy.has(key))
        return;
    medicalBusy.add(key);
    try {
        await performMedicalAction(key, source, target, action, itemId, skipDialog, selectedSkill);
    }
    finally {
        medicalBusy.delete(key);
    }
}
async function performMedicalAction(key, source, target, action, itemId, skipDialog, selectedSkill) {
    if (!source.actor?.isOwner || !target.actor)
        throw Error("Выберите своего персонажа.");
    preflightMedical();
    const previous = savedRolls.get(key);
    const row = medicalEntries(source.actor, target.actor).find(row => row.action === action && row.item === itemId && (!selectedSkill || row.skill === selectedSkill) && !row.disabled);
    if (!row && !previous)
        throw Error("Медицинское действие недоступно.");
    const gridSize = Number(source.document.parent?.grid.size);
    if (source.document.parent?.id !== target.document.parent?.id || source.document.uuid !== target.document.uuid && gridSize > 0 && Math.max(Math.abs(source.document.x - target.document.x), Math.abs(source.document.y - target.document.y)) > gridSize)
        throw Error("Сначала подойдите к пациенту.");
    if (previous) {
        if (action === "stabilize" && previous.dv !== stabilizationDV(target.actor) && needsStabilization(target.actor)) {
            savedRolls.delete(key);
            throw Error("Состояние ранения пациента изменилось. Прошлый бросок остался в чате; сверьте его с Мастером перед новой попыткой.");
        }
        previous.request.hp = medicalHP(target.actor);
        await finishMedical(key, previous, source, target);
        return;
    }
    if (!row)
        throw Error("Медицинское действие недоступно.");
    const hp = medicalHP(target.actor);
    let total, paidRoll, dv = 0, skill;
    if (action !== "speedheal") {
        const choices = skills(source.actor, itemId ? target.actor.items.get(itemId) : undefined).filter(choice => !selectedSkill || choice.name === selectedSkill);
        const choice = choices.length === 1 ? choices[0] : await Dialog.prompt({ title: row.label, content: '<select name="medicalSkill">' + choices.map((c, i) => '<option value="' + i + '">' + escapeHTML(c.name) + (c.dv ? ' — DV' + c.dv : '') + '</option>').join('') + '</select>', label: "Бросить", rejectClose: false, callback: html => choices[Number(html[0].querySelector('select').value)] });
        if (!choice)
            return;
        skill = choice.name;
        dv = action === "stabilize" ? stabilizationDV(target.actor) : choice.dv;
        let roll = choice.item.createRoll("skill", source.actor);
        roll.rollTitle = row.label + " — DV" + dv;
        if (!await roll.handleRollDialog({ type: "pneuma-medical", ctrlKey: skipDialog, metaKey: false }, source.actor, choice.item))
            return;
        checkedLuck(Number(get(source.actor, "system.stats.luck.value")), 0, roll.luck);
        roll = await choice.item.confirmRoll(roll);
        preflightMedical();
        await spendBonusLuck(source.actor, roll.luck);
        await roll.roll();
        total = roll.resultTotal;
        paidRoll = roll;
    }
    const saved = { request: { medicalType: "request", id: foundry.utils.randomID(), user: game.user.id, source: source.document.uuid, target: target.document.uuid, action, item: itemId, skill, total, hp, dv }, title: row.label, html: "", roll: paidRoll, dv, posted: false };
    savedRolls.set(key, saved);
    await finishMedical(key, saved, source, target);
}
async function finishMedical(key, saved, source, target) {
    // Publish paid rolls before patient mutations, so disconnects cannot erase the result.
    if (saved.request.action !== "speedheal" && !saved.posted) {
        if (!saved.html && saved.roll)
            saved.html = await nativeCard(saved.roll);
        await postTreatment(source, target, saved.title, saved.html, saved.request.total, saved.dv);
        saved.posted = true;
    }
    await send(saved.request);
    if (!saved.posted) {
        await postTreatment(source, target, saved.title, saved.html, saved.request.total, saved.dv);
        saved.posted = true;
    }
    savedRolls.delete(key);
}
let queuedQuickFixExpiry;
export function expireQuickFixes(combat) {
    if (!combat && queuedQuickFixExpiry)
        return queuedQuickFixExpiry;
    const next = medicalWork(async () => {
        if (!combat)
            queuedQuickFixExpiry = undefined;
        const failures = [];
        for (const actor of allActors())
            if (statusAuthority(actor))
                for (const item of actor.items) {
                    if (!get(item, `flags.${M}.quickFix`))
                        continue;
                    try {
                        await withActorMutation(actor, async () => {
                            const saved = get(item, `flags.${M}.quickFix`);
                            if (!saved)
                                return;
                            if (!quickFixExpired(saved, actor, combat))
                                return;
                            const effects = saved.effects.filter(id => item.effects.has(id));
                            if (effects.length)
                                await item.updateEmbeddedDocuments("ActiveEffect", effects.map(_id => ({ _id, disabled: false })));
                            const markers = actor.effects.filter(e => e.origin === item.uuid && e.name?.startsWith("Quick Fix"));
                            if (markers.length)
                                await actor.deleteEmbeddedDocuments("ActiveEffect", markers.map(e => e.id));
                            // Keep recovery data until the injury penalties and marker cleanup have completed.
                            await item.update({ [`flags.${M}.-=quickFix`]: null, "system.deathSaveIncrease": saved.deathSave });
                            await syncActorStatuses(actor);
                        });
                    }
                    catch (error) {
                        failures.push((actor.name ?? actor.uuid) + " / " + item.name + ": " + String(error));
                    }
                }
        if (failures.length)
            throw Error("Снятие Quick Fix не завершено; повторите очистку. " + failures.join("; "));
    });
    if (!combat)
        queuedQuickFixExpiry = next;
    return next;
}
export function registerMedical() {
    game.settings.register(M, "enableStabilization", { name: "Включить стабилизацию", hint: "Автоматически отмечать «Нужна стабилизация» после потери HP у участников активного боя. Медицинские действия доступны всегда.", scope: "world", config: true, type: Boolean, default: false });
    const previousHP = new Map();
    const remember = (actor) => previousHP.set(actor.uuid, medicalHP(actor));
    Hooks.on("createActor", remember);
    Hooks.on("createToken", (token) => { if (token.actor)
        remember(token.actor); });
    Hooks.on("deleteActor", (actor) => previousHP.delete(actor.uuid));
    Hooks.on("canvasReady", () => { for (const actor of allActors())
        remember(actor); });
    Hooks.on("preUpdateActor", (actor, changes, options) => { remember(actor); const next = get(changes, "system.derivedStats.hp.value") ?? changes["system.derivedStats.hp.value"]; if (next !== undefined && Number(next) < medicalHP(actor))
        options.pneumaMedicalHP = medicalHP(actor); });
    Hooks.on("updateActor", (actor, _changes, options) => {
        const before = options.pneumaMedicalHP ?? previousHP.get(actor.uuid);
        remember(actor);
        if (before !== undefined && statusAuthority(actor))
            void markMedicalDamage(actor, Number(before)).catch(error => ui.notifications.error(String(error)));
        const hud = canvas.tokens?.hud;
        if (hud?.object?.actor?.uuid === actor.uuid)
            hud.render(true);
    });
    const expire = () => void expireQuickFixes().catch(error => ui.notifications.error(String(error)));
    Hooks.on("updateWorldTime", expire);
    Hooks.on("pneumaCombatCleanupFinished", (combat) => { void expireQuickFixes(combat).catch(error => ui.notifications.error(String(error))); });
    Hooks.once("ready", () => {
        for (const actor of allActors())
            remember(actor);
        expire();
        game.socket.on("module." + M, (wire) => {
            if (wire?.medicalType === "request" && game.user?.id === primaryGM()?.id)
                void resolveMedical(wire).then(() => game.socket.emit("module." + M, { medicalType: "reply", id: wire.id, user: wire.user, gm: game.user.id }), error => game.socket.emit("module." + M, { medicalType: "reply", id: wire.id, user: wire.user, gm: game.user.id, error: String(error.message ?? error) }));
            if (wire?.medicalType === "reply")
                requests.reply(wire, undefined);
        });
    });
}
