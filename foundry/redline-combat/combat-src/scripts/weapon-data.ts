import { empDisabled } from "./emp-rules.js";
export interface EquipmentItem {
  id: string | null;
  name: string | null;
  type: string;
  flags?: unknown;
  system: {
    isRanged?: boolean;
    rof?: number;
    isWeapon?: boolean;
    isInstalledInActor?: boolean;
    modifiers?: { secondaryWeapon?: { configured?: boolean } };
    equipped?: string;
    isInstalled?: boolean;
    dvTable?: string;
    weaponType?: string;
    variety?: string;
    amount?: number;
    magazine?: { value: number; max: number };
    fireModes?: { suppressiveFire?: boolean };
    upgrades?: { _id: string }[];
  };
}

/** Share native equipment eligibility between attack controls and DV previews. */
export function availableWeapons<T extends EquipmentItem>(items: T[]): T[] {
  const available = new Set<T>();
  const add = (item: T) => {
    if (empDisabled(item)) return;
    if (item.type === "weapon" || (item.type === "cyberware" && item.system.isWeapon)
      || (item.type === "itemUpgrade" && item.system.modifiers?.secondaryWeapon?.configured)) available.add(item);
  };
  for (const item of items) {
    if (item.system.equipped !== "equipped" && !(item.type === "cyberware"
      && (item.system.isInstalledInActor ?? item.system.isInstalled))) continue;
    add(item);
    for (const upgrade of item.system.upgrades ?? []) {
      const attachment = items.find(candidate => candidate.id === upgrade._id);
      if (attachment?.system.isInstalled) add(attachment);
    }
  }
  return [...available];
}
