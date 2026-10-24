import {nativeCriticalTable} from "./native-lookup.js";
import type { Exchange } from "./combat-resolution.js";
import type { NativeRoll } from "./native-combat.js";

export const criticalMethods = {
  Ranged: "Дистанционные атаки", Melee: "Атаки ближнего боя", Unarmed: "Безоружные атаки", Autofire: "Автоогонь",
  Explosion: "Взрывы", Grenade: "Гранаты", Rocket: "Ракеты", Quickhack: "Квикхаки",
} as const;
export type CriticalMethod = keyof typeof criticalMethods;
type CriticalSettings = Record<`redline-combat.critical${CriticalMethod}`, boolean>;
declare global { interface SettingConfig extends CriticalSettings {} }

export function criticalMethod(data: Exchange): CriticalMethod {
  if (data.criticalMethod) return data.criticalMethod;
  return data.attackMode === "autofire" ? "Autofire" : data.category === "Unarmed" ? "Unarmed" : data.ranged ? "Ranged" : "Melee";
}
export function damageSixes(roll: NativeRoll): number {
  return (roll._roll?.dice ?? []).filter(die => die.faces === 6)
    .reduce((total, die) => total + die.results.filter(result => result.result === 6 && result.active !== false && !result.discarded).length, 0);
}
export function criticalLocation(data: Exchange): "head" | "body" {
  return data.attackMode === "aimed" && data.location === "head" ? "head" : "body";
}
export function hasCriticalInjury(data: Exchange): boolean {
  return (data.damage?.result?.sixes ?? 0) >= 2
    && game.settings!.get("redline-combat", `critical${criticalMethod(data)}`) !== false;
}
/** Delegate injury items, effects, duplicate policy and chat to the native sheet workflow. */
export async function applyCriticalInjury(data: Exchange, targetUuid: string): Promise<void> {
  if (!hasCriticalInjury(data)) throw new Error("Этот бросок урона не даёт критической травмы.");
  const token = await fromUuid(targetUuid) as TokenDocument | null;
  const actor = token?.actor;
  if (!actor?.isOwner) throw new Error("Нанести травму может только владелец получателя или Мастер.");
  const sheet = actor.sheet as ActorSheet & {
    _drawCriticalInjuryTable?: (table: RollTable, compendium: string, iteration: number) => Promise<void>;
  };
  if (typeof sheet?._drawCriticalInjuryTable !== "function")
    throw new Error("Штатное нанесение критической травмы недоступно.");
  const utilsPath = "/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
  const utils = (await import(utilsPath)).default as {
    GetCompendiumDoc(pack: string, name: string): Promise<RollTable>;
    GetCompendiumIdByLabel(label: string): string | null;
  };
  const tableName = criticalLocation(data) === "head" ? "Critical Injuries (Head)" : "Critical Injuries (Body)";
  const tablePack = game.settings!.get("cyberpunk-red-core", "criticalInjuryRollTableCompendium" as never) as string;
  if (!game.packs!.get(tablePack)) throw new Error("Выбранный компендиум таблиц критических травм недоступен.");
  await game.packs!.get(tablePack)!.getIndex();
  const native = await nativeCriticalTable(tablePack, criticalLocation(data));
  if (!native && !game.packs!.get(tablePack)!.index.find(entry => entry.name === tableName))
    throw new Error("В выбранном компендиуме нет таблицы " + tableName + ".");
  const table = native ?? await utils.GetCompendiumDoc(tablePack, tableName);
  const injuryPack = native ? "cyberpunk-red-core.core_critical-injuries-" + criticalLocation(data) : utils.GetCompendiumIdByLabel(tableName);
  if (!table || !injuryPack) throw new Error("Штатная таблица " + tableName + " или компендиум травм недоступны.");
  await game.packs!.get(injuryPack)?.getIndex();
  await sheet._drawCriticalInjuryTable(table, injuryPack, 0);
}
