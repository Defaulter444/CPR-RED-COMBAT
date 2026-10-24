import {damageValues, type DamageResult, type DamageState} from "./damage-flow.js";
import {nativeCard, rollHidden, type NativeRoll} from "./native-combat.js";
import type {Exchange} from "./combat-resolution.js";
export interface SceneDamage {armor: "full" | "half" | "ignore"; ablation: number}
export async function rollSceneDamage(title: string, formula: string, settings: SceneDamage): Promise<{result: DamageResult; roll: NativeRoll}> {
  const path = "/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
  const {CPRDamageRoll} = await import(path) as {CPRDamageRoll: new(title: string, formula: string, type: string) => NativeRoll & {rollCardExtraArgs: Record<string, unknown>}};
  const roll = new CPRDamageRoll(title, formula, "ranged");
  roll.isAimed = false; roll.location = "body";
  roll.rollCardExtraArgs = {ablationValue: settings.ablation, ignoreArmorPercent: settings.armor === "half" ? 50 : 0, ignoreBelowSP: 0, ammoVariety: ""};
  await rollHidden(roll);
  // Hazard damage has no weapon critical-injury rule; preserve its configured damage.
  roll.wasCritical = () => false;
  const html = await nativeCard(roll);
  return {roll, result: {html, values: {...damageValues(html), ablation: settings.ablation, interactArmor: settings.armor !== "ignore", ignorePercent: settings.armor === "half" ? 50 : 0}, sixes: 0}};
}
export function sceneDamageExchange(title: string, target: string, name: string, damage: DamageState): Exchange {
  return {attacker: target, defender: target, defenderActor: "", attackerName: title, defenderName: name, ranged: false, category: "Manual", title, total: 0, html: "", dice: [], rollMode: "roll", state: "resolved", damage, attackMode: "attack", location: "body", criticalMethod: "Ranged"};
}
