import {durationExpired,hasDuration,durationCombat} from "./effect-duration.js";
import {masterStatuses,isAddictionEffect} from "./status-catalog.js";
import {proneIds} from "./prone.js";

const flag=(doc:object,key:string)=>foundry.utils.getProperty(doc,"flags.redline-combat."+key);
export function effectCombat(effect:ActiveEffect):string|undefined {
  return flag(effect,"endWithCombat") as string|undefined??durationCombat(effect.duration);
}
export function endedEffect(effect:ActiveEffect):boolean {const id=effectCombat(effect);return !!id&&!game.combats?.get(id)?.started;}
export function actorInStartedCombat(actor:Actor,except?:string):boolean {
  return Array.from(game.combats??[]).some(c=>c.id!==except&&c.started&&c.combatants.some(p=>p.actor?.uuid===actor.uuid));
}
export const isSpeedheal=(effect:ActiveEffect)=>effect.statuses.has("speedheal")||masterStatuses.some(s=>s.name==="Speed Heal"&&effect.statuses.has(s.id));
const isOnFire=(effect:ActiveEffect)=>flag(effect,"instantLifetime.kind")==="fire"
  ||masterStatuses.some(s=>s.name.startsWith("On Fire (")&&(effect.statuses.has(s.id)||effect.name===s.name));
export interface EffectLifetime {kind:"persistent"|"combat"|"duration"|"turn"|"managed"|"untracked";label:string;protected?:boolean;injury:boolean}
/** Infer policy from native durations and existing module flags; saved effects need no migration. */
export function effectLifetime(effect:ActiveEffect):EffectLifetime {
  const injury=String((effect.parent as Item|undefined)?.type)==="criticalInjury"||masterStatuses.some(s=>s.binding?.kind==="injury"&&effect.statuses.has(s.id));
  if(isAddictionEffect(effect))return {kind:"persistent",label:"Защищено: зависимость",protected:true,injury};
  if(effect.statuses.has("dead")||masterStatuses.some(s=>s.name==="Dead"&&effect.statuses.has(s.id)))return {kind:"persistent",label:"Защищено: мёртв",protected:true,injury};
  if(effect.statuses.has("pneuma-needs-stabilization"))return {kind:"persistent",label:"Защищено: нужна стабилизация; снимается стабилизацией",protected:true,injury};
  if(["disableRequest","empCombat","disabledLegPenalty","frameConsequences","empStatus"].some(key=>flag(effect,key)))return {kind:"managed",label:"Эффектом управляет восстановление снаряжения",injury};
  if(proneIds().some(id=>effect.statuses.has(id))||isSpeedheal(effect))return {kind:"combat",label:"Снимается в конце боя пациента",injury};
  if(flag(effect,"suppressionExpiry"))return {kind:"turn",label:"Истекает после следующего хода цели или в конце боя",injury};
  if(injury&&!hasDuration(effect.duration))return {kind:"persistent",label:"Постоянная критическая травма",injury};
  if(hasDuration(effect.duration)||typeof flag(effect,"instantLifetime.expires")==="number")return {kind:"duration",label:"Штатная длительность; также снимается в конце боя участника",injury};
  if(isOnFire(effect))return {kind:"combat",label:"Горение снимается в конце боя пациента",injury};
  if(effectCombat(effect))return {kind:"combat",label:"Снимается в конце связанного боя",injury};
  return {kind:"untracked",label:"Эффект без учёта",injury};
}
export function effectBelongsToCombat(effect:ActiveEffect,actor:Actor,combat:Combat):boolean {
  const id=effectCombat(effect);
  return id?id===combat.id:Array.from(combat.combatants??[]).some(row=>row.actor?.uuid===actor.uuid);
}
export function effectEndsWithCombat(effect:ActiveEffect,actor:Actor,combat:Combat):boolean {
  if(actorInStartedCombat(actor,combat.id!))return false;
  const policy=effectLifetime(effect);
  if(policy.kind==="persistent"||policy.kind==="managed"||policy.kind==="untracked"||policy.injury)return false;
  // Prone always clears for participants, including an old link from another combat.
  if(proneIds().some(id=>effect.statuses.has(id)))return Array.from(combat.combatants??[]).some(row=>row.actor?.uuid===actor.uuid);
  if(isOnFire(effect)){
    const linked=effectCombat(effect);
    if(linked&&linked!==combat.id&&game.combats?.get(linked)?.started)return false;
    return linked===combat.id||Array.from(combat.combatants??[]).some(row=>row.actor?.uuid===actor.uuid);
  }
  return effectBelongsToCombat(effect,actor,combat);
}
export function effectExpired(effect:ActiveEffect,now=game.time!.worldTime):boolean {
  const policy=effectLifetime(effect);
  if(policy.kind!=="duration")return false;
  return hasDuration(effect.duration)?durationExpired(effect.duration,now):Number(flag(effect,"instantLifetime.expires"))<=now;
}
export interface SuppressionExpiry {combat:string;combatant:string;round:number}
export function suppressionExpired(expiry:SuppressionExpiry):boolean {
  const combat=game.combats?.get(expiry.combat);
  if(!combat?.started)return true;
  const index=combat.turns.findIndex(c=>c.id===expiry.combatant);
  return index<0||Number(combat.round)>expiry.round||Number(combat.round)===expiry.round&&Number(combat.turn)>index;
}
export interface QuickFixLifetime {combat?:string|null;expires:number}
export function quickFixExpired(saved:QuickFixLifetime,actor:Actor,combat?:Combat,now=game.time!.worldTime):boolean {
  return !!combat&&(saved.combat===combat.id||!saved.combat&&Array.from(combat.combatants??[]).some(row=>row.actor?.uuid===actor.uuid))||saved.expires<=now;
}
