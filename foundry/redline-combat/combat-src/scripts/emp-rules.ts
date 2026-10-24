import {durationExpired,durationEnded,type EffectDuration} from "./effect-duration.js";
export const EMP_MODULE = "redline-combat";
export interface EmpItem {
  id: string | null; name: string | null; type: string; flags?: unknown;
  system: { isFoundational?: boolean; isInstalledInActor?: boolean; isInstalled?: boolean; isElectronic?: boolean; providesHardening?:boolean;
    installedIn?: string[]; installedItems?: {list?: string[]}; type?: string; equipped?: string };
}
export type EmpRandom = "equal" | "foundation-more" | "foundation-less" | "system";
export interface EmpPolicy { foundational: boolean; cascade: boolean; electronics: boolean; immune: string[]; frameMoveReduction?:number; frameNoMove?:boolean; framePenalty?:number; hardened?:"exclude"|"consume"; excludeBioware?:boolean; excludeFashionware?:boolean; skipAffected?:boolean }
export function empReferences(item: {flags?: unknown}): string[] {
  const value = (item.flags as {"redline-combat"?: {empCombats?: string[]}} | undefined)?.[EMP_MODULE]?.empCombats;
  return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
}
export type DisableSource="emp"|"microwaver"|"short-circuit"|"cyberware-malfunction";
export interface TimedDisable {source:DisableSource;label:string;duration:EffectDuration}
export function timedDisables(item:{flags?:unknown}):Record<string,TimedDisable> {
  return (item.flags as {"redline-combat"?:{timedDisables?:Record<string,TimedDisable>}}|undefined)?.[EMP_MODULE]?.timedDisables??{};
}
/** Combat-bound disablements end with their encounter, even if world time stops. */
export function disableExpired(duration:EffectDuration):boolean {
  return durationEnded(duration)||durationExpired(duration);
}
export function activeDisables(item:{flags?:unknown}):TimedDisable[] {return Object.values(timedDisables(item)).filter(value=>!disableExpired(value.duration));}
export function empDisabled(item: {flags?: unknown}): boolean {
  return empReferences(item).some(id => game.combats?.get(id)?.started)||activeDisables(item).length>0;
}
/** Actual EMP-applied state only; other quickhack disablements do not count. */
export function hasActorEMP(actor:Actor):boolean {
  return [...actor.items].some(item=>empReferences(item).some(id=>game.combats?.get(id)?.started)
    ||activeDisables(item).some(disable=>disable.source==='emp'));
}
/** Native compendium identity survives item renaming; exact name supports imported copies. */
export function isMicrowaver(item: {name?:string|null;flags?:unknown}):boolean {
  const source=foundry.utils.getProperty(item,"_stats.compendiumSource")??foundry.utils.getProperty(item,"flags.core.sourceId");
  return String(source??"").endsWith(".oQ4mV07fh1et5zI7")||item.name?.trim().toLowerCase()==="microwaver";
}
export const disableLabel=(source:DisableSource="emp")=>({emp:"ЭМИ",microwaver:"Микроволновик","short-circuit":"Короткое замыкание","cyberware-malfunction":"Сбой киберимпланта"})[source];
const sourceId=(item:EmpItem)=>foundry.utils.getProperty(item,"_stats.compendiumSource")??foundry.utils.getProperty(item,"flags.core.sourceId");
/** Match CPR's self, installed-child and sibling hardening using IDs, not ambiguous names. */
export function empHardened(item:EmpItem,all:EmpItem[]):boolean {
  const children=(host:EmpItem)=>all.filter(i=>host.system.installedItems?.list?.includes(i.id!)||i.system.installedIn?.includes(host.id!));
  const parents=all.filter(i=>children(i).includes(item));
  return !!item.system.providesHardening||children(item).some(i=>i.system.providesHardening)||parents.some(p=>children(p).some(i=>i.system.providesHardening));
}
export function internalFrame(item:EmpItem):boolean {
  return item.type==="cyberware"&&(["6JMYrnxIsTgSmbFi","2XhNJ80rCSvxAenP","nH3p5XdyArI2faqK","R3b9aNqHxWIAo4tX","vuq1KEbsMjpOTqhl"].some(id=>String(sourceId(item)??"").endsWith("."+id))||/\b(implanted|internal).*\b(linear )?frame\b/i.test(item.name??""));
}
export function eligibleEmpItems<T extends EmpItem>(items: T[], policy: EmpPolicy, source:DisableSource="emp"): T[] {
  const immune = new Set(policy.immune.map(v => v.trim().toLowerCase()).filter(Boolean));
  return items.filter(item => {
    if(policy.excludeFashionware&&item.type==="cyberware"&&item.system.type==="fashionware")return false;
    if(policy.hardened==="exclude"&&(source==="emp"||source==="microwaver")&&empHardened(item,items))return false;
    const itemSource = sourceId(item);
    if(policy.excludeBioware&&item.type==="cyberware"&&(
      ["grafted muscle and bone lace","enhanced antibodies"].includes((item.name??"").trim().toLowerCase())||
      ["Lx9FSNDEIxLZ7Pyh","hQzMZYd3Tt0SIE1v"].some(id=>String(itemSource??"").endsWith("."+id))
    ))return false;
    if (!item.id || immune.has(item.name?.toLowerCase() ?? "") || immune.has(String(itemSource).toLowerCase()) || source==="emp"&&empReferences(item).some(id=>game.combats?.get(id)?.started)) return false;
    if(source==="short-circuit"||source==="cyberware-malfunction") {
      const name=(item.name??"").trim().toLowerCase();
      if(item.type!=="cyberware"||/^(neuroport|neuroport cyberdeck (port|expansion))$/.test(name)||item.system.isFoundational&&item.system.type==="neuroport")return false;
      if(source==="short-circuit"&&item.system.isFoundational&&["cyberArm","cyberLeg","cyberEye","cyberAudioSuite"].includes(item.system.type??""))return false;
      if(source==="short-circuit"&&["aC234RUXPPUb08cO","hsoSD662cLKvHKZJ"].some(id=>String(sourceId(item)).endsWith("."+id)))return false;
    }
    if (item.type === "cyberware") return !!(item.system.isInstalledInActor ?? item.system.isInstalled) && (policy.foundational || !item.system.isFoundational);
    return policy.electronics && !!item.system.isElectronic && (item.system.equipped === "carried" || item.system.equipped === "equipped");
  });
}
export function empGroup(item: EmpItem, items: EmpItem[]): string {
  let current = item; const seen = new Set<string>();
  while (current.id && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = items.find(i => i.id === current.system.installedIn?.[0]);
    if (!parent) break;
    current = parent;
  }
  return current.id ?? item.id ?? "other";
}
export function empWeight(item: EmpItem, mode: EmpRandom): number {
  return item.system.isFoundational ? mode === "foundation-more" ? 2 : mode === "foundation-less" ? 0.5 : 1 : 1;
}
export function randomEmp<T extends EmpItem>(eligible: T[], all: T[], count: number, mode: EmpRandom, random = Math.random, avoidOverlap = false): T[] {
  const pool = [...eligible], result: T[] = [];
  while (result.length < count && pool.length) {
    const groups = new Map<string, number>();
    for (const item of pool) {const group = empGroup(item, all); groups.set(group, (groups.get(group) ?? 0) + 1);}
    const weights = pool.map(item => mode === "system" ? 1 / groups.get(empGroup(item, all))! : empWeight(item, mode));
    let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = weights.findIndex(weight => (roll -= weight) < 0);
    if (index < 0) index = pool.length - 1;
    const drawn=pool.splice(index,1)[0]!;
    result.push(drawn);
    if(avoidOverlap){
      const covered=new Set(expandEmp(result,all,true).map(i=>i.id));
      for(let i=pool.length-1;i>=0;i--)if(expandEmp([pool[i]!],all,true).some(item=>covered.has(item.id)))pool.splice(i,1);
    }
  }
  return result;
}
/** Immunity protects against direct selection; a powered-down host cannot power its installed options. */
export function expandEmp<T extends EmpItem>(selected: T[], all: T[], cascade: boolean): T[] {
  const result = new Map(selected.map(item => [item.id, item]));
  if (cascade) for (const item of result.values()) for (const child of all) {
    if (!result.has(child.id) && (child.system.installedIn?.includes(item.id!) || item.system.installedItems?.list?.includes(child.id!))) result.set(child.id, child);
  }
  return [...result.values()];
}
