import {empDisabled} from "../emp-rules.js";
/** Installed functional copies each supply one wall; inventory quantity is not installation count. */
export function selfIce(actor: Actor | undefined, cleared = 0) {
  const walls = Math.min(3, actor?.items.filter(item => String(item.type) === "cyberware"
    && /^self[\s-]*ice$/i.test(item.name?.trim() ?? "")
    && !!foundry.utils.getProperty(item, "system.isInstalledInActor")
    && !empDisabled(item) && !foundry.utils.getProperty(item, "flags.redline-combat.itemMarkers.disabled")).length ?? 0);
  const progress = Math.max(0, Math.min(walls, Math.floor(cleared)));
  return {walls, cleared: progress, dv: walls ? 4 + walls * 2 : 0, blocked: progress < walls};
}
