export function chokeDamage(hp, body, count) {
    if (!Number.isFinite(hp) || !Number.isFinite(body) || body < 0)
        throw new Error("Некорректные HP или ТЕЛ.");
    const spared = hp > 1 && hp - body < 0;
    return { hp: spared ? 1 : hp - body, unconscious: spared || count >= 3 };
}
export function nextChoke(previous, combat, round) {
    if (previous?.combat === combat && previous.round >= round)
        throw new Error("Удушение в этом раунде уже было, или раунд откатился назад.");
    return { combat, round, count: previous?.combat === combat && previous.round === round - 1 ? Math.min(3, previous.count + 1) : 1 };
}
export function visibleChoke(previous, combat, round) {
    return previous && previous.combat === combat && round >= previous.round && round <= previous.round + 1 ? previous.count : 0;
}
export const winsGrab = (acting, responding) => acting > responding;
