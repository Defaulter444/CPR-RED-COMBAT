import {masterStatuses} from "./status-catalog.js";
import { allActors, primaryGM as empGM } from "./shared.js";
import {resolveEncounter,type EncounterRef} from "./encounter.js";
import {activeLegInjuryPenalty} from "./injury-rules.js";
import {penaltyFlags,missingPenaltyFlags} from "./penalty-flags.js";
import type {EmpMethod} from "./emp-behavior.js";
import {effectDuration,type EffectDuration} from "./effect-duration.js";
import {registerNativeWrapper} from "./native-wrappers.js";
import {EMP_MODULE as MODULE, hasActorEMP, empReferences, empDisabled, type EmpItem, type EmpPolicy, type EmpRandom, type DisableSource, timedDisables, activeDisables, disableExpired, disableLabel, empHardened, internalFrame, eligibleEmpItems, expandEmp, randomEmp} from "./emp-rules.js";
export {empDisabled};
export interface EmpRequest { encounter?:EncounterRef; id: string; actor: string; count: number; chooser: "gm" | "player" | "random"; mode: EmpRandom; policy: EmpPolicy; state: "pending" | "applied"; selected?: string[]; affectedNames?: string[]; message?: string; source?:DisableSource; sourceActor?:string; seconds?:number; duration?:EffectDuration; origin?:string; method?:EmpMethod; offered?:string[]; selectedNames?:string[]; resistedNames?:string[] }
export interface EmpRecord {actor: string; items: string[]; timed?:boolean}
const path = `flags.${MODULE}`;
export { primaryGM as empGM } from "./shared.js";
export const empRequests = (combat: Combat) => foundry.utils.getProperty(combat, `${path}.empRequests`) as Record<string,EmpRequest> | undefined ?? {};
export const empRecords = (combat: Combat) => foundry.utils.getProperty(combat, `${path}.empRecords`) as Record<string,EmpRecord> | undefined ?? {};
let queue: Promise<unknown> = Promise.resolve();
export function empWork<T>(operation: () => Promise<T>): Promise<T> {const next = queue.catch(() => {}).then(operation); queue = next; return next;}
export const empRandomSelection=(request:EmpRequest)=>request.chooser==="random"||!!request.method&&!["manual","shortlist"].includes(request.method);
export function empSelectionPool<T extends EmpItem>(request:EmpRequest,all:T[]):T[] {
  const eligible=eligibleEmpItems(all,request.policy,request.source);
  return request.method==="shortlist"?eligible.filter(item=>request.offered?.includes(item.id!)):eligible;
}
const itemsFor = (actor: Actor) => Array.from(actor.items) as unknown as (Item & EmpItem)[];
export async function applyEmpSelection(combat: Combat, requestId: string, selected: string[], user: User): Promise<void> {
  if (empGM()?.id !== game.user?.id || !combat.started) throw Error("Для ЭМИ нужен начатый бой и активный Мастер.");
  const request = empRequests(combat)[requestId];
  if (!request) throw Error("Выбор ЭМИ недоступен.");
  if(request.encounter)resolveEncounter(request.encounter);
  const actor = await fromUuid(request.actor) as Actor | null;
  const chooser=request.sourceActor?await fromUuid(request.sourceActor) as Actor|null:actor;
  if (!actor || (!user.isGM && (request.chooser !== "player" || !chooser?.testUserPermission(user,"OWNER")))) throw Error("Вы не можете сделать этот выбор ЭМИ.");
  if (request.state === "applied") return;
  const all=itemsFor(actor),eligible=empSelectionPool(request,all);
  const random=empRandomSelection(request);
  const chosen=request.selected?all.filter(i=>request.selected!.includes(i.id!)):random
    ?randomEmp(eligible,all,request.count,request.mode,Math.random,!!request.policy.skipAffected&&request.policy.cascade)
    :eligible.filter(i=>selected.includes(i.id!));
  if(!request.selected&&(new Set(selected).size!==selected.length||!random&&(chosen.length!==Math.min(request.count,eligible.length)||chosen.length!==selected.length)))
    throw Error("Выберите "+Math.min(request.count,eligible.length)+" подходящих предметов.");
  if (!chosen.length) throw Error("Нет подходящих киберимплантов или носимой электроники.");
  // Save the exact draw before writes: retries must not select a second set of items.
  if (!request.selected) {
    await combat.update({[`${path}.empRequests.${request.id}.selected`]:chosen.map(i => i.id!)});
  }
  const resisted=request.policy.hardened&&(request.source===undefined||request.source==="emp"||request.source==="microwaver")?chosen.filter(i=>empHardened(i,all)):[];
  const effective=chosen.filter(i=>!resisted.includes(i));
  const affected = expandEmp(effective,all,request.policy.cascade);
  const duration=request.seconds?(request.duration??effectDuration(request.seconds,combat)):undefined;
  if(duration&&!request.duration)await combat.update({[path+".empRequests."+request.id+".duration"]:duration});
  await combat.update({[`${path}.empRecords.${request.id}`]:{actor:actor.uuid,items:affected.map(i => i.id!),...(duration?{timed:true}:{})}});
  for (const item of affected) {
    if(duration){
      await item.update({[path+".timedDisables."+request.id]:{source:request.source??"emp",label:disableLabel(request.source),duration}} as never);
      await syncDisableMarker(item);
    }else {
    const refs = [...new Set([...empReferences(item),combat.id!])];
    await item.update({[`${path}.empCombats`]:refs,[`${path}.itemMarkers.emp`]:{label:"Отключено — ЭМИ",description:"Отключено до конца боя."}} as never);
    }
  }

  await syncDisabledLimbs(actor);
  await combat.update({[`${path}.empRequests.${request.id}.state`]:"applied",[`${path}.empRequests.${request.id}.affectedNames`]:affected.map(item=>item.name??"Item"),[path+".empRequests."+request.id+".selectedNames"]:effective.map(item=>item.name??"Item"),[path+".empRequests."+request.id+".resistedNames"]:resisted.map(item=>item.name??"Item")});
}
async function removeReferences(actor: Actor, combatId: string, ids?: string[]) {
  for (const item of actor.items) {
    if (ids && !ids.includes(item.id!)) continue;
    if (!empReferences(item).includes(combatId)) continue;
    const refs = empReferences(item).filter(id => id !== combatId);
    await item.update({[`${path}.empCombats`]:refs,...(!refs.length ? {[`${path}.itemMarkers.-=emp`]:null} : {})} as never);
  }
  const effects = actor.effects.filter(e => foundry.utils.getProperty(e,path+".empCombat") === combatId&&!foundry.utils.getProperty(e,path+".disableRequest"));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect",effects.map(e => e.id!));
  await syncDisabledLimbs(actor);
}
export async function finishEmp(combat: Combat, deleted = false) {
  for (const record of Object.values(empRecords(combat))) {
    const actor = await fromUuid(record.actor) as Actor | null;
    if (actor) {
      if (!record.timed) await removeReferences(actor,combat.id!,record.items);
      await expireDisablements(actor,combat.id!);
    }
  }
  if (!deleted) await combat.update({[`${path}.empRecords`]:null,[`${path}.empRequests`]:null} as never);
}
export async function reconcileEmp() {
  // One startup pass also cleans stale markers if a combat was deleted while this module was unavailable.
  for (const actor of allActors()) {
    for(const effect of actor.effects){
      const flags=foundry.utils.getProperty(effect,path) as {disabledLegPenalty?:boolean;frameConsequences?:boolean;quickhackEffect?:string}|undefined;
      if((flags?.disabledLegPenalty||flags?.frameConsequences||["slow","impair-movement"].includes(flags?.quickhackEffect??""))&&missingPenaltyFlags(effect))
        await effect.update({"flags.cyberpunk-red-core":penaltyFlags(effect.changes)} as never);
    }
    await expireDisablements(actor);
    const refs = new Set(Array.from(actor.items).flatMap(empReferences));
    for (const effect of actor.effects) {const id=foundry.utils.getProperty(effect,`${path}.empCombat`);if (typeof id === "string"&&!foundry.utils.getProperty(effect,`${path}.disableRequest`)) refs.add(id);}
    for (const id of refs) if (!game.combats?.get(id)?.started) await removeReferences(actor,id);
  }
  for (const combat of game.combats ?? []) {
    if (!combat.started) {if (Object.keys(empRecords(combat)).length) await finishEmp(combat);continue;}
    for (const request of Object.values(empRequests(combat))) if (request.selected && request.state === "pending") await applyEmpSelection(combat,request.id,request.selected,game.user!);
  }
}
/** Actor-scoped repair for the GM cleanup window; preserve live disablement causes. */
export async function cleanupEndedEmp(actor:Actor) {
  if(Array.from(game.combats??[]).some(c=>c.started&&c.combatants.some(p=>p.actor?.uuid===actor.uuid)))throw Error("Актёр участвует в начатом бою.");
  const refs=new Set(Array.from(actor.items).flatMap(empReferences));
  for(const effect of actor.effects){const id=foundry.utils.getProperty(effect,path+".empCombat");if(typeof id==="string")refs.add(id);}
  for(const item of actor.items)for(const entry of Object.values(timedDisables(item))){const id=typeof entry.duration.combat==="string"?entry.duration.combat:entry.duration.combat?.id;if(id)refs.add(id);}
  for(const id of refs)if(!game.combats?.get(id)?.started){await removeReferences(actor,id);await expireDisablements(actor,id);}
  await expireDisablements(actor);
}
/** Reuse CPR suppression, preserving every native effect's disabled state and item installation. */
export async function installEmpNativeGuards() {
  const effect = CONFIG.ActiveEffect.documentClass.prototype as ActiveEffect & {determineSuppression():void;system:{isSuppressed:boolean}};
  registerNativeWrapper(effect,"determineSuppression",function(wrapped,...args) {const result=wrapped(...args);if (this.parent instanceof Item && empDisabled(this.parent)) this.system.isSuppressed = true;return result;},"WRAPPER");
  const modulePath = "/systems/cyberpunk-red-core/modules/item/cpr-item.js";
  const native = (await import(modulePath)).default.prototype as Item & {createRoll(...args:unknown[]):unknown;confirmRoll(...args:unknown[]):unknown};
  for (const method of ["createRoll","confirmRoll"] as const) {
    registerNativeWrapper(native,method,function(wrapped,...args) {
      if (empDisabled(this)) {ui.notifications!.warn(`${this.name}: временно отключено (${activeDisables(this).map(e=>e.label).join(", ")||"ЭМИ"}).`);throw Error("Предмет отключён ЭМИ или сбоем киберимпланта.");}
      return wrapped(...args);
    },"MIXED");
  }
}

/** One display marker; the independent causes remain authoritative. */
export async function syncDisableMarker(item:Item) {
  const labels=[...new Set(activeDisables(item).map(e=>e.label))];
  const old=foundry.utils.getProperty(item,path+".itemMarkers.cyberware");
  if(labels.length)await item.update({[path+".itemMarkers.cyberware"]:{label:"Отключено — "+labels.join(", "),description:"Временно не работает; восстановится, когда истекут все отключающие эффекты."}} as never);
  else if(old)await item.update({[path+".itemMarkers.-=cyberware"]:null} as never);
}
/** Apply functional limb consequences without importing a physical injury or stacking repeated hits. */
export async function syncDisabledLimbs(actor:Actor) {
  await syncEmpStatus(actor);
  // Older releases created a second, non-mechanical limb effect. Item causes already own its state.
  const redundant=actor.effects.filter(effect=>(effect.statuses?.has("pneuma-emp-limb")||!!foundry.utils.getProperty(effect,path+".frameRequest"))&&
    !!foundry.utils.getProperty(effect,path+".empItem")&&!effect.changes.length);
  if(redundant.length)await actor.deleteEmbeddedDocuments("ActiveEffect",redundant.map(effect=>effect.id!));
  await syncDisabledFrames(actor);
  const legs=Array.from(actor.items).filter(item=>String(item.type)==="cyberware"&&foundry.utils.getProperty(item,"system.type")==="cyberLeg"&&foundry.utils.getProperty(item,"system.isFoundational")&&(foundry.utils.getProperty(item,"system.isInstalledInActor")??foundry.utils.getProperty(item,"system.isInstalled"))&&empDisabled(item));
  const severity=Math.max(0,...legs.map(item=>empReferences(item).some(id=>game.combats?.get(id)?.started)||activeDisables(item).some(e=>e.source!=="cyberware-malfunction")?6:4));
  const old=actor.effects.find(e=>foundry.utils.getProperty(e,path+".disabledLegPenalty"));
  const injuryPenalty=activeLegInjuryPenalty(actor);
  const amount=Math.max(0,severity-injuryPenalty);
  if(!amount){if(old)await actor.deleteEmbeddedDocuments("ActiveEffect",[old.id!]);return;}
  const data={disabled:false,name:"Отключена кибернога — штраф ДВИЖ",img:"systems/cyberpunk-red-core/icons/compendium/status/broken_leg.svg",changes:[{key:"system.stats.move.value",mode:2,value:String(-amount),priority:20},{key:"system.stats.move.value",mode:4,value:"1",priority:21}],flags:{[MODULE]:{disabledLegPenalty:true}}};
  Object.assign(data.flags,{"cyberpunk-red-core":penaltyFlags(data.changes)});
  if(old){if(old.disabled||old.changes?.[0]?.value!==String(-amount)||missingPenaltyFlags(old))await old.update(data as never);}else await actor.createEmbeddedDocuments("ActiveEffect",[data] as never);
}
export async function expireDisablements(actor:Actor, endedCombat?:string) {
  for(const item of actor.items){
    const changes:Record<string,unknown>={};
    for(const [id,effect] of Object.entries(timedDisables(item)))if(disableExpired(effect.duration)||endedCombat && (typeof effect.duration.combat==="string"?effect.duration.combat:effect.duration.combat?.id)===endedCombat)changes[path+".timedDisables.-="+id]=null;
    if(Object.keys(changes).length){await item.update(changes as never);await syncDisableMarker(item);}
  }
  const stale=actor.effects.filter(effect=>{
    const id=foundry.utils.getProperty(effect,path+".disableRequest"),itemId=foundry.utils.getProperty(effect,path+".empItem");
    return typeof id==="string"&&!Array.from(actor.items).some(item=>item.id===itemId&&timedDisables(item)[id]&&!disableExpired(timedDisables(item)[id]!.duration));
  });
  if(stale.length)await actor.deleteEmbeddedDocuments("ActiveEffect",stale.map(e=>e.id!));
  await syncDisabledLimbs(actor);
}

/** Aggregate overlapping frame consequences; retain the strongest penalty only. */
export function disabledFrameConsequences(actor:Actor):{noMove:boolean;penalty:number;moveReduction:number} {
  const policies:EmpPolicy[]=[];
  for(const combat of game.combats??[]){
    if(!combat.started)continue;
    for(const [id,record] of Object.entries(empRecords(combat))){
      if(record.actor!==actor.uuid)continue;
      const request=empRequests(combat)[id];if(!request)continue;
      if(record.items.some(itemId=>{
        const item=actor.items.get(itemId);if(!item||!internalFrame(item as unknown as EmpItem))return false;
        return record.timed?!!timedDisables(item)[id]&&!disableExpired(timedDisables(item)[id]!.duration):empReferences(item).includes(combat.id!);
      }))policies.push(request.policy);
    }
  }
  return {moveReduction:Math.max(0,...policies.map(p=>p.frameMoveReduction??0)),noMove:policies.some(p=>!!p.frameNoMove),penalty:Math.max(0,...policies.map(p=>p.framePenalty??0))};
}
async function syncDisabledFrames(actor:Actor) {
  const {noMove,penalty,moveReduction}=disabledFrameConsequences(actor);
  const old=actor.effects.find(e=>foundry.utils.getProperty(e,path+".frameConsequences"));
  const changes=[...(noMove?[{key:"system.stats.move.value",mode:5,value:"0",priority:100}]:moveReduction?[{key:"system.stats.move.value",mode:2,value:String(-moveReduction),priority:20},{key:"system.stats.move.value",mode:4,value:"0",priority:99}]:[]),...(penalty?[{key:"bonuses.allActions",mode:2,value:String(-penalty),priority:20}]:[])];
  if(!changes.length){if(old)await actor.deleteEmbeddedDocuments("ActiveEffect",[old.id!]);return;}
  const data={disabled:false,name:"Отключён внутренний каркас",img:"icons/svg/lightning.svg",changes,flags:{[MODULE]:{frameConsequences:true}}};
  Object.assign(data.flags,{"cyberpunk-red-core":penaltyFlags(changes)});
  if(old){if(old.disabled||JSON.stringify(old.changes)!==JSON.stringify(changes)||missingPenaltyFlags(old))await old.update(data as never);}else await actor.createEmbeddedDocuments("ActiveEffect",[data] as never);
}
export function frameMovementBlocked(actor:Actor| null|undefined,changes:Record<string,unknown>,isGM:boolean):boolean {
  return !isGM&&!!actor&&["x","y","elevation"].some(k=>k in changes)&&disabledFrameConsequences(actor).noMove;
}

/** Own only the workflow marker; preserve manually applied EMP statuses. */
export async function syncEmpStatus(actor:Actor):Promise<void> {
  const status=masterStatuses.find(status=>status.name==="EMP");if(!status)return;
  const managed=actor.effects.filter(effect=>!!foundry.utils.getProperty(effect,path+".empStatus"));
  const active=hasActorEMP(actor)||actor.items.some(item=>activeDisables(item).some(disable=>disable.source==="microwaver"));
  if(!active){if(managed.length)await actor.deleteEmbeddedDocuments("ActiveEffect",managed.map(effect=>effect.id!));return;}
  const manual=actor.effects.some(effect=>!foundry.utils.getProperty(effect,path+".empStatus")&&!effect.disabled&&effect.statuses?.has(status.id));
  if(manual){if(managed.length)await actor.deleteEmbeddedDocuments("ActiveEffect",managed.map(effect=>effect.id!));return;}
  const data={name:status.name,img:status.img,disabled:false,statuses:[status.id],changes:[],flags:{[MODULE]:{empStatus:true}}};
  if(managed.length){
    const first=managed[0]!;if(first.disabled||!first.statuses.has(status.id))await first.update(data as never);
    if(managed.length>1)await actor.deleteEmbeddedDocuments("ActiveEffect",managed.slice(1).map(effect=>effect.id!));
  }else await actor.createEmbeddedDocuments("ActiveEffect",[data] as never);
}
