import { QUICKHACKS, getQuickhack } from "./catalog.js";

export const MODULE = "redline-combat";
export const LEGACY_MODULE = "pneuma-quickhack";
/** CPR's derived installation state includes installation through parent cyberware. */
export function quickhackTargetVisible(items: Iterable<{
  type: string; name?: string | null;
  system: object;
}>, requireNeuroport: boolean): boolean {
  return !requireNeuroport || Array.from(items).some(item => {
    const system = item.system as { isInstalledInActor?: boolean; isFoundational?: boolean; type?: string };
    return item.type === "cyberware" && system.isInstalledInActor === true
      && (item.name?.trim().toLowerCase() === "neuroport"
        || system.type === "neuroport" && system.isFoundational === true);
  });
}
export function isQuickhackLauncher(item: { type: string; flags?: Record<string, unknown> }) {
  return item.type === "weapon" && [MODULE, LEGACY_MODULE].some(scope =>
    (item.flags?.[scope] as { action?: string } | undefined)?.action === "quickhack");
}
export type QuickhackMode = "raw" | "owned" | "loaded";
export interface QuickhackItem {
  id: string | null; type: string; name?: string | null; img?: string | null;
  flags?: Record<string, unknown>;
  system: { equipped?: string; installedItems?: { list?: string[] }; amount?: number };
}
export function quickhackId(item: QuickhackItem): string | undefined {
  for (const scope of [MODULE, LEGACY_MODULE]) {
    const id = (item.flags?.[scope] as { quickhackId?: unknown } | undefined)?.quickhackId;
    if (typeof id === "string" && getQuickhack(id)) return id;
  }
  return undefined;
}
/** The deck's native installation list is authoritative. REZ is not loading. */
export function availableQuickhacks(items: QuickhackItem[], mode: QuickhackMode, enabled = true) {
  if (!enabled) return [];
  if (mode === "raw") return [...QUICKHACKS];
  if (mode !== "owned" && mode !== "loaded") return [];
  const installed = new Set(items.filter(item => item.type === "cyberdeck" && item.system.equipped === "equipped")
    .flatMap(deck => deck.system.installedItems?.list ?? []));
  const ids = new Set(items.filter(item => ["gear", "program"].includes(item.type) && (item.system.amount === undefined || item.system.amount > 0)
    && (mode === "owned" || item.type === "program" && !!item.id && installed.has(item.id))).map(quickhackId));
  return QUICKHACKS.filter(hack => ids.has(hack.id));
}
