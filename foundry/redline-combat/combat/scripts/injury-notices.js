import { primaryGM as electedGM } from "./shared.js";
import { hasInjury } from "./injury-rules.js";
import { postHUDMessage } from "./hud-messages.js";
import { registerNativeWrapper } from "./native-wrappers.js";
const M = "redline-combat", path = "flags." + M + ".injuryReminders";
export const injuryGuidance = {
    "Dismembered Arm": "Рука потеряна. Бросьте предметы в этой руке; использовать её нельзя.",
    "Dismembered Hand": "Кисть потеряна. Бросьте предметы в этой руке; использовать её нельзя.",
    "Broken Arm": "Рука не действует. Бросьте предметы в этой руке.",
    "Crushed Fingers": "Действия травмированной рукой: −4 штатным модификатором.",
    "Broken Jaw": "Действия, связанные с речью: −4 штатным модификатором.",
    "Crushed Windpipe": "Вы не можете говорить. Действия, требующие речи, решает Мастер.",
    "Spinal Injury": "Следующий ход: без действия; действие движения доступно.",
    "Damaged Ear": "Восприятие на слух −2. Больше 4 м пешком — в следующий ход без действия движения.",
    "Lost Ear": "Восприятие на слух −4. Больше 4 м пешком — в следующий ход без действия движения.",
    "Damaged Eye": "Дистанционные атаки −2; для зрительного Восприятия выберите −2.",
    "Lost Eye": "Дистанционные атаки −4; для зрительного Восприятия выберите −4.",
    "Broken Ribs": "Больше 4 м пешком — в конце хода нанесите 5 урона от травмы.",
    "Foreign Object (Body)": "Больше 4 м пешком — в конце хода нанесите 5 урона от травмы.",
    "Foreign Object (Head)": "Больше 4 м пешком — в конце хода нанесите 5 урона от травмы.",
};
const primary = () => electedGM()?.id === game.user?.id;
const reminders = (actor) => foundry.utils.getProperty(actor, path) ?? [];
function alert(actor, text, id) {
    const recipients = game.users?.filter(u => u.active && (u.isGM || actor.testUserPermission(u, "OWNER"))).map(u => u.id) ?? [];
    if (recipients.length)
        postHUDMessage({ source: M, id, text: ((actor.name ?? "Персонаж") + ": " + text).slice(0, 200), recipients, duration: 30 });
}
let queue = Promise.resolve();
function enqueue(fn) { if (primary()) {
    queue = queue.catch(() => { }).then(fn);
    void queue.catch(e => ui.notifications.error("Напоминание о травме: " + String(e)));
} }
export async function scheduleInjuryReminder(actor, combat, injury, movementTurn) {
    const rows = reminders(actor).filter(r => !r.delivered || !movementTurn || r.movementTurn === movementTurn);
    if (rows.some(r => r.combat === combat.id && r.injury === injury && r.movementTurn === movementTurn))
        return;
    await actor.update({ [path]: [...rows, { combat: combat.id, round: Number(combat.round), turn: Number(combat.turn), injury, ...(movementTurn ? { movementTurn } : {}) }] });
}
export async function deliverInjuryReminders(combat) {
    const actor = combat.combatant?.actor;
    if (!actor || !combat.started)
        return;
    const due = reminders(actor).filter(r => !r.delivered && r.combat === combat.id && (Number(combat.round) > r.round || Number(combat.round) === r.round && Number(combat.turn) > r.turn));
    if (!due.length)
        return;
    await actor.update({ [path]: reminders(actor).map(r => due.includes(r) ? { ...r, delivered: true } : r) });
    const active = due.filter(r => hasInjury(actor, r.injury));
    if (active.some(r => r.injury === "Spinal Injury"))
        alert(actor, "ТРАВМА ПОЗВОНОЧНИКА — в этот ход без действия. Действие движения доступно.");
    if (active.some(r => r.injury !== "Spinal Injury"))
        alert(actor, "ТРАВМА УХА — в этот ход без действия движения: в прошлый ход пройдено больше 4 м.");
}
export function applyInjuryMoveFloor(actor) {
    if (!["Collapsed Lung", "Broken Leg", "Dismembered Leg"].some(n => hasInjury(actor, n)))
        return;
    // Preserve explicit immobilization/override effects, including disabled frames.
    const effects = typeof actor.allApplicableEffects === "function" ? Array.from(actor.allApplicableEffects()) : Array.from(actor.effects);
    if (effects.some(e => !e.disabled && !e.isSuppressed && !foundry.utils.getProperty(e, "system.isSuppressed") && e.changes.some(c => c.key === "system.stats.move.value" && c.mode === 5 && Number(c.value) <= 0)))
        return;
    const stats = actor.system;
    if (Number.isFinite(stats.stats?.move?.value))
        stats.stats.move.value = Math.max(1, stats.stats.move.value);
}
export function registerInjuryNotices() {
    game.settings.register(M, "injuryTurnEndReminder", { name: "Урон от травм: напоминание в конце хода", hint: "Напоминать владельцам и Мастеру о ненанесённом уроне от сломанных рёбер и инородного предмета. Урон не наносится, действия не тратятся.", scope: "world", config: true, type: Boolean, default: true });
    const known = new Map();
    const snapshot = (actor) => new Set(Object.keys(injuryGuidance).filter(n => hasInjury(actor, n)));
    const check = async (actor) => {
        const before = known.get(actor.uuid) ?? new Set(), after = snapshot(actor);
        known.set(actor.uuid, after);
        if (reminders(actor).some(r => !after.has(r.injury)))
            await actor.update({ [path]: reminders(actor).filter(r => after.has(r.injury)) });
        for (const injury of after)
            if (!before.has(injury)) {
                alert(actor, injury + " — " + injuryGuidance[injury]);
                if (injury === "Spinal Injury")
                    for (const combat of game.combats ?? [])
                        if (combat.started && combat.combatants.some(c => c.actor?.uuid === actor.uuid))
                            await scheduleInjuryReminder(actor, combat, injury);
            }
    };
    Hooks.once("ready", () => {
        for (const actor of game.actors ?? [])
            known.set(actor.uuid, snapshot(actor));
        for (const scene of game.scenes ?? [])
            for (const token of scene.tokens)
                if (token.actor)
                    known.set(token.actor.uuid, snapshot(token.actor));
        registerNativeWrapper(CONFIG.Actor.documentClass.prototype, "applyActiveEffects", function (wrapped, ...args) { const result = wrapped(...args); applyInjuryMoveFloor(this); return result; }, "WRAPPER");
        for (const actor of game.actors ?? [])
            actor.prepareData();
    });
    for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
        Hooks.on(hook, (doc) => {
            const actor = doc.parent instanceof Actor ? doc.parent : doc.parent instanceof Item ? doc.parent.parent : null;
            if (actor instanceof Actor)
                enqueue(() => check(actor));
        });
    Hooks.on("updateToken", (token, changes) => {
        const partial = foundry.utils.getProperty(changes, "flags." + M + ".movement") ?? changes["flags." + M + ".movement"];
        if (!partial || !token.actor)
            return;
        const record = { ...foundry.utils.getProperty(token, "flags." + M + ".movement"), ...partial };
        enqueue(async () => {
            const combat = game.combats?.get(record.combat);
            if (!combat?.started)
                return;
            if (!(Number(record.onFoot) > 4)) {
                const rows = reminders(token.actor).filter(r => r.combat !== combat.id || r.movementTurn !== record.turn || r.delivered);
                if (rows.length !== reminders(token.actor).length)
                    await token.actor.update({ [path]: rows });
                return;
            }
            for (const injury of ["Damaged Ear", "Lost Ear"])
                if (hasInjury(token.actor, injury))
                    await scheduleInjuryReminder(token.actor, combat, injury, record.turn);
        });
    });
    const previous = new Map();
    const remember = (c) => previous.set(c.id, { actor: c.combatant?.actor ?? undefined, round: Number(c.round), turn: Number(c.turn) });
    Hooks.once("ready", () => { for (const c of game.combats ?? [])
        remember(c); });
    Hooks.on("createCombat", remember);
    Hooks.on("updateCombat", (combat) => {
        const old = previous.get(combat.id);
        remember(combat);
        enqueue(async () => {
            if (!combat.started) {
                await clear(combat);
                return;
            }
            const advanced = old && (Number(combat.round) > old.round || Number(combat.round) === old.round && Number(combat.turn) > old.turn);
            if (!advanced)
                return;
            if (old.actor && game.settings.get(M, "injuryTurnEndReminder")) {
                const pending = game.messages?.filter(m => {
                    const r = foundry.utils.getProperty(m, "flags." + M + ".brokenRibs");
                    const index = combat.turns.findIndex(c => c.actor?.uuid === old.actor.uuid);
                    const participant = combat.turns[index];
                    const turn = participant?.id + ":" + String(old.round - (old.turn < index ? 1 : 0));
                    return r?.actor === old.actor.uuid && r.combat === combat.id && r.turn === turn && !r.applied && r.distance > 4;
                }) ?? [];
                if (pending.length)
                    alert(old.actor, "КОНЕЦ ХОДА — " + pending.length + " карт. урона от травм при движении ждут. Нанесите по 5 HP за каждую травму из чата.");
            }
            await deliverInjuryReminders(combat);
        });
    });
    async function clear(combat) { const actors = new Map(); for (const a of game.actors ?? [])
        actors.set(a.uuid, a); for (const scene of game.scenes ?? [])
        for (const token of scene.tokens)
            if (token.actor)
                actors.set(token.actor.uuid, token.actor); for (const actor of actors.values())
        if (reminders(actor).some(r => r.combat === combat.id))
            await actor.update({ [path]: reminders(actor).filter(r => r.combat !== combat.id) }); }
    Hooks.on("deleteCombat", (c) => { previous.delete(c.id); enqueue(() => clear(c)); });
    const shown = new WeakSet();
    Hooks.once("ready", async () => {
        const native = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
        const rolls = await import(native);
        registerNativeWrapper(rolls.CPRRoll.prototype, "handleRollDialog", async function (wrapped, event, actor, ...args) {
            const skill = String(this.skillName ?? "").toLowerCase();
            if (actor && /^(perception|conversation|persuasion|interrogation|oratory|acting|singing)$/.test(skill) && !shown.has(this)) {
                shown.add(this);
                const injuries = skill === "perception" ? ["Lost Eye", "Damaged Eye", "Lost Ear", "Damaged Ear"] : ["Broken Jaw", "Crushed Windpipe"];
                const notes = injuries.filter(n => hasInjury(actor, n)).map(n => injuryGuidance[n]);
                if (notes.length)
                    postHUDMessage({ source: M, text: notes.join(" ").slice(0, 200), duration: 30 });
            }
            return wrapped(event, actor, ...args);
        }, "WRAPPER");
    });
}
