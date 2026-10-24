import { nativeCriticalTable } from "./native-lookup.js";
export const criticalMethods = {
    Ranged: "Дистанционные атаки", Melee: "Атаки ближнего боя", Unarmed: "Безоружные атаки", Autofire: "Автоогонь",
    Explosion: "Взрывы", Grenade: "Гранаты", Rocket: "Ракеты", Quickhack: "Квикхаки",
};
export function criticalMethod(data) {
    if (data.criticalMethod)
        return data.criticalMethod;
    return data.attackMode === "autofire" ? "Autofire" : data.category === "Unarmed" ? "Unarmed" : data.ranged ? "Ranged" : "Melee";
}
export function damageSixes(roll) {
    return (roll._roll?.dice ?? []).filter(die => die.faces === 6)
        .reduce((total, die) => total + die.results.filter(result => result.result === 6 && result.active !== false && !result.discarded).length, 0);
}
export function criticalLocation(data) {
    return data.attackMode === "aimed" && data.location === "head" ? "head" : "body";
}
export function hasCriticalInjury(data) {
    return (data.damage?.result?.sixes ?? 0) >= 2
        && game.settings.get("redline-combat", `critical${criticalMethod(data)}`) !== false;
}
/** Delegate injury items, effects, duplicate policy and chat to the native sheet workflow. */
export async function applyCriticalInjury(data, targetUuid) {
    if (!hasCriticalInjury(data))
        throw new Error("Этот бросок урона не даёт критической травмы.");
    const token = await fromUuid(targetUuid);
    const actor = token?.actor;
    if (!actor?.isOwner)
        throw new Error("Нанести травму может только владелец получателя или Мастер.");
    const sheet = actor.sheet;
    if (typeof sheet?._drawCriticalInjuryTable !== "function")
        throw new Error("Штатное нанесение критической травмы недоступно.");
    const utilsPath = "/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
    const utils = (await import(utilsPath)).default;
    const tableName = criticalLocation(data) === "head" ? "Critical Injuries (Head)" : "Critical Injuries (Body)";
    const tablePack = game.settings.get("cyberpunk-red-core", "criticalInjuryRollTableCompendium");
    if (!game.packs.get(tablePack))
        throw new Error("Выбранный компендиум таблиц критических травм недоступен.");
    await game.packs.get(tablePack).getIndex();
    const native = await nativeCriticalTable(tablePack, criticalLocation(data));
    if (!native && !game.packs.get(tablePack).index.find(entry => entry.name === tableName))
        throw new Error("В выбранном компендиуме нет таблицы " + tableName + ".");
    const table = native ?? await utils.GetCompendiumDoc(tablePack, tableName);
    const injuryPack = native ? "cyberpunk-red-core.core_critical-injuries-" + criticalLocation(data) : utils.GetCompendiumIdByLabel(tableName);
    if (!table || !injuryPack)
        throw new Error("Штатная таблица " + tableName + " или компендиум травм недоступны.");
    await game.packs.get(injuryPack)?.getIndex();
    await sheet._drawCriticalInjuryTable(table, injuryPack, 0);
}
