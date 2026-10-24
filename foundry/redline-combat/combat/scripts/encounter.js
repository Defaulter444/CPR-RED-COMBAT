export const encounterEpoch = (combat) => String(foundry.utils.getProperty(combat, "flags.redline-combat.evasionEpoch") ?? "");
export function sceneEncounter(sceneId = (typeof canvas === "undefined" ? undefined : canvas.scene?.id)) {
    if (!sceneId)
        return;
    const matches = Array.from(game.combats?.values() ?? []).filter(c => c.active && c.started && (c.scene?.id === sceneId || !c.scene && c.combatants.some(p => p.token?.parent?.id === sceneId)));
    if (matches.length > 1)
        throw Error("На этой сцене несколько активных боёв. Мастер должен оставить активным только один.");
    return matches[0];
}
/** Rendering must not choose an arbitrary encounter or throw on every frame. Actions use the strict lookup. */
export function displayedEncounter(sceneId = (typeof canvas === "undefined" ? undefined : canvas.scene?.id)) {
    try {
        return sceneEncounter(sceneId);
    }
    catch {
        return undefined;
    }
}
export function requireParticipants(combat, tokens) {
    if (!tokens.every(uuid => combat.combatants.some(p => p.token?.uuid === uuid)))
        throw Error("Сначала добавьте все участвующие токены в активный бой этой сцены.");
}
export function tokenEncounter(sceneId, tokens) {
    const combat = sceneEncounter(sceneId);
    if (combat)
        requireParticipants(combat, tokens);
    return combat;
}
export function encounterRef(combat, sceneId, tokens = []) {
    return { combatId: combat?.id ?? null, combatEpoch: combat ? encounterEpoch(combat) : undefined, combatScene: sceneId ?? undefined, combatTokens: tokens };
}
/** A saved action stays in its original encounter, even after another one becomes active. */
export function resolveEncounter(ref) {
    if (ref.combatId === null)
        return;
    const combat = (ref.combatId ? game.combats?.get(ref.combatId) : undefined);
    if (!combat?.started || encounterEpoch(combat) !== (ref.combatEpoch ?? ""))
        throw Error("Исходный бой закончился, сброшен или удалён. Начните новое действие.");
    if (ref.combatScene && combat.scene && combat.scene.id !== ref.combatScene)
        throw Error("Исходный бой перешёл на другую сцену. Начните новое действие.");
    requireParticipants(combat, ref.combatTokens ?? []);
    return combat;
}
/** Actor-only sheet actions use this scene; synthetic actors retain their exact token identity. */
export function actorEncounter(actor) {
    const token = actor.isToken ? actor.token : undefined;
    if (token)
        return tokenEncounter(token.parent?.id, [token.uuid]);
    const combat = sceneEncounter();
    const rows = combat?.combatants.filter(p => p.actor?.uuid === actor.uuid) ?? [];
    if (rows.length > 1)
        throw Error("У этого актёра несколько токенов в активном бою. Используйте действие конкретного токена.");
    return rows.length ? combat : undefined;
}
