import { summaryConditionNames, buildCombatReport, combatReportHTML } from "./combat-report.js";
import { primaryGM } from "./shared.js";
import { masterStatuses } from "./status-catalog.js";
const PATH = "flags.redline-combat.combatSummary";
const tracking = (combat) => foundry.utils.getProperty(combat, PATH);
const participantActors = (combat) => [...new Map(Array.from(combat.combatants ?? []).flatMap(row => row.actor ? [[row.actor.uuid, row.actor]] : [])).values()];
const roster = (combat) => Array.from(combat.combatants ?? []).flatMap(row => row.actor ? [{ actor: row.actor.uuid, name: row.name ?? row.actor.name ?? "Участник", defeated: row.isDefeated }] : []);
const initial = (combat, partial) => ({ partial, participants: roster(combat), baseline: participantActors(combat).flatMap(actor => actor.items.filter(item => String(item.type) === "criticalInjury").map(item => item.uuid)), criticals: [] });
let writes = Promise.resolve();
function enqueue(run) {
    if (game.user?.id !== primaryGM()?.id)
        return;
    writes = writes.catch(() => { }).then(run);
    void writes.catch(error => ui.notifications.error("Итог боя: " + String(error)));
}
export async function waitCombatSummary() { await writes; }
export function registerCombatSummary() {
    Hooks.on("preUpdateCombat", (combat, changes) => {
        if (game.user?.isGM && !combat.started && typeof changes.round === "number" && changes.round > 0)
            changes[PATH] = initial(combat, false);
    });
    const remember = (combat, extra = []) => {
        const rows = [...roster(combat), ...extra];
        enqueue(async () => {
            const data = tracking(combat);
            if (!data)
                return;
            const participants = new Map((data.participants ?? []).map(row => [row.actor, row]));
            for (const row of rows)
                participants.set(row.actor, row);
            await combat.update({ [PATH]: { ...data, participants: [...participants.values()] } });
        });
    };
    Hooks.on("deleteCombatant", (row) => { if (row.parent?.started && row.actor)
        remember(row.parent, [{ actor: row.actor.uuid, name: row.name ?? row.actor.name ?? "Участник", defeated: row.isDefeated }]); });
    Hooks.on("updateCombatant", (row) => { if (row.parent?.started)
        remember(row.parent); });
    const seed = (combat) => { if (combat.started && !tracking(combat))
        enqueue(async () => { if (combat.started && !tracking(combat))
            await combat.update({ [PATH]: initial(combat, true) }); }); };
    Hooks.once("ready", () => { for (const combat of game.combats ?? [])
        seed(combat); });
    Hooks.on("updateCombat", seed);
    Hooks.on("createCombatant", (row) => {
        const combat = row.parent, actor = row.actor;
        if (!combat?.started || !actor)
            return;
        remember(combat);
        const existing = actor.items.filter(item => String(item.type) === "criticalInjury").map(item => item.uuid);
        enqueue(async () => { const data = tracking(combat); if (data)
            await combat.update({ [PATH]: { ...data, baseline: [...new Set([...data.baseline, ...existing])] } }); });
    });
    Hooks.on("createItem", (item) => {
        const actor = item.parent;
        if (String(item.type) !== "criticalInjury" || !actor?.hasPlayerOwner)
            return;
        const combats = Array.from(game.combats ?? []).filter(combat => combat.started && combat.combatants.some(row => row.actor?.uuid === actor.uuid));
        if (combats.length !== 1)
            return;
        const combat = combats[0], entry = { actor: actor.uuid, actorName: actor.name ?? "Персонаж", item: item.uuid, name: item.name ?? "Критическая травма" };
        enqueue(async () => {
            const data = tracking(combat) ?? initial(combat, true);
            if (data.criticals.some(entry => entry.item === item.uuid))
                return;
            await combat.update({ [PATH]: { ...data, criticals: [...data.criticals, entry] } });
        });
    });
}
export function captureCombatSummary(combat, previousRound = 0) {
    const data = tracking(combat), actors = participantActors(combat), criticals = [...(data?.criticals ?? [])];
    for (const row of data?.participants ?? []) {
        const actor = (typeof fromUuidSync === "function" ? fromUuidSync(row.actor) : Array.from(game.actors ?? []).find(actor => actor.uuid === row.actor));
        if (actor && !actors.some(current => current.uuid === actor.uuid))
            actors.push(actor);
    }
    // Reconcile remaining items if a creation hook was missed; never include preexisting injuries.
    if (data)
        for (const actor of actors.filter(actor => actor.hasPlayerOwner))
            for (const item of actor.items.filter(item => String(item.type) === "criticalInjury")) {
                if (!data.baseline.includes(item.uuid) && !criticals.some(entry => entry.item === item.uuid))
                    criticals.push({ actor: actor.uuid, actorName: actor.name ?? "Персонаж", item: item.uuid, name: item.name ?? "Критическая травма" });
            }
    const dead = masterStatuses.find(status => status.name === "Dead")?.id;
    // Match the report's unique-actor participant counts; names are display labels only.
    const participants = new Map((data?.participants ?? []).map(row => [row.actor, { ...row }]));
    const current = new Map();
    for (const row of combat.combatants ?? [])
        if (row.actor) {
            const previous = current.get(row.actor.uuid);
            current.set(row.actor.uuid, { actor: row.actor.uuid, name: previous?.name ?? row.name ?? row.actor.name ?? "Участник", defeated: !!row.isDefeated || !!previous?.defeated });
        }
    // Current tracker state supersedes older saved markers, including markers explicitly cleared.
    for (const [uuid, row] of current)
        participants.set(uuid, row);
    for (const actor of actors)
        if (dead && actor.effects.some(effect => !effect.disabled && effect.statuses.has(dead))) {
            const row = participants.get(actor.uuid);
            participants.set(actor.uuid, { actor: actor.uuid, name: row?.name ?? actor.name ?? "Участник", defeated: true });
        }
    return { name: combat.name ?? "Бой", scene: combat.scene?.name ?? undefined, actors, round: Math.max(0, combat.round ?? 0, previousRound), players: actors.filter(actor => actor.hasPlayerOwner).length, npcs: actors.filter(actor => !actor.hasPlayerOwner).length,
        defeated: [...participants.values()].filter(row => row.defeated).map(row => row.name),
        criticals, partial: !data || data.partial, effects: actors.flatMap(actor => Array.from(actor.allApplicableEffects?.() ?? actor.effects).filter(effect => summaryConditionNames(effect).length).map(effect => ({ actor, uuid: effect.uuid, name: summaryConditionNames(effect).join(", ") }))) };
}
export function combatSummaryHTML(summary) { return combatReportHTML(buildCombatReport(summary)); }
