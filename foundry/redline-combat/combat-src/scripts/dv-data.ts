import { availableWeapons, type EquipmentItem } from "./weapon-data.js";
export type RangeItem = EquipmentItem;

export interface WeaponRange { name: string; table: string; autofire: boolean }

export function equippedRanges(items: RangeItem[], showAutofire: boolean): WeaponRange[] {
  const rows: WeaponRange[] = [];
  for (const item of availableWeapons(items)) {
    const data = item.system;
    if (!data.isRanged || !data.dvTable?.trim()) continue;
    rows.push({ name: item.name ?? "", table: data.dvTable, autofire: false });
    // RED v12 accepts these standard weapon types as well as the explicit flag.
    if (showAutofire && (data.fireModes?.suppressiveFire ||
      ["smg", "heavySmg", "assaultRifle"].includes(data.weaponType ?? ""))) {
      rows.push({ name: item.name ?? "", table: `${data.dvTable} (Autofire)`, autofire: true });
    }
  }
  return rows;
}

export function distanceWithElevation(horizontal: number, source: number, target: number): number {
  return Math.round(Math.hypot(horizontal, source - target));
}

export function parseDV(text: string | undefined): number | undefined {
  if (!text?.trim()) return;
  const dv = Number(text);
  return Number.isFinite(dv) && Number.isInteger(dv) && dv > 0 ? dv : undefined;
}

export function dvTone(dv: number): "green" | "yellow" | "red" {
  return dv < 17 ? "green" : dv <= 20 ? "yellow" : "red";
}
