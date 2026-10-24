export function evasionOffer(ranged, mode, rules, facts, used, inCombat) {
    const result = { allowed: true, penalty: 0, cost: 0, free: 0, reason: "Без доплаты и штрафа" };
    if (!ranged)
        return result;
    if (mode === "none")
        return { ...result, allowed: false, reason: "Уклонение от стрельбы отключено" };
    if (mode === "raw")
        return facts.ref >= 8 || facts.coprocessor ? result
            : { ...result, allowed: false, reason: "Нужны РЕФ 8+ или установленный рефлекторный сопроцессор" };
    const qualified = [facts.ref >= 8 && rules.reflex, facts.coprocessor && rules.coprocessor, facts.solo && rules.solo, rules.anyone]
        .filter((row) => !!row && row.qualifies);
    if (!qualified.length)
        return { ...result, allowed: false, reason: "Нет способности, позволяющей уклоняться от стрельбы" };
    if (!inCombat)
        return { ...result, allowed: false, reason: "Начните бой, чтобы считать уклонения по раундам" };
    const grants = qualified.filter(q => q.free);
    const allowance = (grants.some(q => !q.stacks) ? 1 : 0) + grants.filter(q => q.stacks).length;
    result.free = Math.max(0, allowance - used);
    if (result.free)
        return { ...result, reason: "Бесплатное уклонение · " + result.free + " remaining" };
    if (rules.rule === "noAdditional")
        return { ...result, allowed: false, reason: "Уклонений не осталось" };
    if (rules.rule === "flat")
        result.penalty = -4;
    else if (rules.rule === "cumulative")
        result.penalty = -(used - allowance + 1);
    else
        result.cost = rules.luckCost;
    if (result.cost > facts.luck)
        return { ...result, allowed: false, reason: "Не хватает УДАЧИ · нужно " + result.cost };
    result.reason = result.cost ? "Это уклонение потратит " + result.cost + " УДАЧИ"
        : "Дополнительное уклонение от стрельбы: " + result.penalty;
    return result;
}
export function checkedLuck(current, fee, bonus) {
    if (![current, fee, bonus].every(n => Number.isInteger(n) && n >= 0) || fee > current)
        throw new Error("Не хватает УДАЧИ на уклонение и выбранный бонус.");
    // Native CPR accepts the selected roll bonus and consumes only the available pool.
    return Math.max(0, current - fee - bonus);
}
export function evasionButtonLabel(offer) {
    return "Уклониться" + (offer.cost > 0 ? " за " + offer.cost + " УДАЧИ" : "") + (offer.penalty ? ", штраф " + offer.penalty : "");
}
