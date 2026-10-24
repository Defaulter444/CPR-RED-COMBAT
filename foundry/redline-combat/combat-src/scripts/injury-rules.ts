import {masterStatuses} from "./status-catalog.js";
import {empReferences,activeDisables} from "./emp-rules.js";
/** Read native injury items as well as markers, including the interval before status synchronization. */
export function hasInjury(actor:Actor,name:string):boolean {
  const status=masterStatuses.find(s=>s.name===name&&s.binding?.kind==="injury");
  if(!status)return false;
  if(Array.from(actor.effects??[]).some(e=>!e.disabled&&!foundry.utils.getProperty(e,"system.isSuppressed")&&e.statuses.has(status.id)))return true;
  return Array.from(actor.items??[]).some(item=>{
    if(String(item.type)!=="criticalInjury"||foundry.utils.getProperty(item,"flags.redline-combat.quickFix"))return false;
    const source=String(foundry.utils.getProperty(item,"_stats.compendiumSource")??foundry.utils.getProperty(item,"flags.core.sourceId")??"");
    return foundry.utils.getProperty(item,"flags.redline-combat.statusId")===status.id||source.endsWith("."+status.binding!.itemId)||item.name===status.binding!.itemName;
  });
}
export function evasionBlocked(actor:Actor):string|undefined {
  if(hasInjury(actor,"Dismembered Leg"))return "Уклониться нельзя: потеряна нога.";
  if(Array.from(actor.items??[]).some(item=>String(item.type)==="cyberware"
    &&foundry.utils.getProperty(item,"system.type")==="cyberLeg"
    &&foundry.utils.getProperty(item,"system.isFoundational")===true
    &&(foundry.utils.getProperty(item,"system.isInstalledInActor")??foundry.utils.getProperty(item,"system.isInstalled"))===true
    &&(empReferences(item).some(id=>game.combats?.get(id)?.started)||activeDisables(item).some(e=>e.source!=="cyberware-malfunction"))))return "Уклониться нельзя: кибернога отключена.";
  return undefined;
}

/** Only active leg-injury MOVE changes offset a disabled leg; unrelated injuries still stack. */
export function activeLegInjuryPenalty(actor:Actor):number {
  const definitions=masterStatuses.filter(s=>s.binding?.kind==="injury"&&["Broken Leg","Dismembered Leg"].includes(s.name));
  return Array.from(actor.items).filter(item=>{
    if(String(item.type)!=="criticalInjury")return false;
    const source=String(foundry.utils.getProperty(item,"_stats.compendiumSource")??foundry.utils.getProperty(item,"flags.core.sourceId")??"");
    return definitions.some(s=>foundry.utils.getProperty(item,"flags.redline-combat.statusId")===s.id||source.endsWith("."+s.binding!.itemId)||item.name===s.binding!.itemName);
  }).flatMap(item=>Array.from(item.effects))
    .filter(effect=>!effect.disabled&&!effect.isSuppressed&&!foundry.utils.getProperty(effect,"system.isSuppressed"))
    .flatMap(effect=>effect.changes).reduce((total,change)=>change.key==="system.stats.move.value"&&change.mode===2&&Number(change.value)<0?total-Number(change.value):total,0);
}
