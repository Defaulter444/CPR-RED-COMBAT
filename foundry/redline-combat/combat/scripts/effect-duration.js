export function durationCombat(duration) {
    const combat = duration?.combat;
    return typeof combat === "string" ? combat : combat?.id ?? undefined;
}
export function durationEnded(duration) {
    const combat = duration.combat;
    return !!combat && !(typeof combat === "string" ? game.combats?.get(combat) : combat)?.started;
}
export function effectDuration(seconds, combat) {
    return combat?.started ? { seconds: null, rounds: Math.ceil(seconds / 3), turns: 0, combat: combat.id, startRound: combat.round ?? 0, startTurn: combat.turn ?? 0, startTime: game.time.worldTime }
        : { seconds, rounds: null, turns: null, combat: null, startRound: null, startTurn: null, startTime: game.time.worldTime };
}
export function durationExpired(d, now = game.time.worldTime) {
    if (!d)
        return false;
    if (typeof d.seconds === "number" && typeof d.startTime === "number")
        return now >= d.startTime + d.seconds;
    if (typeof d.rounds !== "number" && typeof d.turns !== "number")
        return false;
    const c = typeof d.combat === "string" ? game.combats?.get(d.combat) : d.combat;
    if (c?.started && typeof d.startRound === "number") {
        const n = Math.max(1, c.turns?.length ?? 1);
        return (c.round ?? 0) * n + (c.turn ?? 0) >= (d.startRound + (d.rounds ?? 0)) * n + (d.startTurn ?? 0) + (d.turns ?? 0);
    }
    return typeof d.startTime === "number" && now >= d.startTime + (d.rounds ?? 0) * 3;
}
export function hasDuration(d) { return !!d && (typeof d.seconds === "number" || typeof d.rounds === "number" || typeof d.turns === "number"); }
