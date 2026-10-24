
import type { RollItem } from "./native-combat.js";
export function thrownRollItem(source: object, actor: Actor, dice?: number): RollItem {
  const data = foundry.utils.deepClone(source) as { system: Record<string, unknown> };
  data.system = { ...data.system, isRanged: true, weaponType: "thrownWeapon", weaponSkill: "Athletics",
    ignoreArmorPercent: 0, magazine: { value: 1, max: 1 }, ...(dice ? { damage: dice + "d6" } : {}) };
  const DocumentClass = CONFIG.Item.documentClass as unknown as new (data: object, context: { parent: Actor }) => RollItem;
  const item = new DocumentClass(data, { parent: actor });
  // A thrown object is marked used, not discharged like a magazine weapon.
  item.confirmRoll = async roll => roll;
  return item;
}
export async function improvisedSource(): Promise<object> {
  const pack = game.packs!.get("cyberpunk-red-core.core_weapons");
  if (!pack) throw new Error("Штатный компендиум оружия недоступен.");
  const index = await pack.getIndex();
  const entry = index.find(item => item._id === "29p2bEfPcAWHpsTY" || item.name === "Thrown Weapon");
  if (!entry) throw new Error("Штатное метательное оружие недоступно.");
  const item = await pack.getDocument(entry._id);
  if (!item) throw new Error("Не удалось загрузить штатное метательное оружие.");
  return item.toObject();
}
