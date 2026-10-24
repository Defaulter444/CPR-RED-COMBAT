import {actorEncounter,encounterEpoch} from './encounter.js';
const MODULE="redline-combat";
interface SavedExposure {actor:string;kind:string;epoch:string;round:number;turn:number}
/** Undefined means no saved report; false means the saved report has expired. */
export function hasReportedExposure(actor:Actor,kind:string):boolean|undefined {
  let found=false;
  for(const combat of game.combats??[]) {
    const entries=foundry.utils.getProperty(combat,`flags.${MODULE}.visualExposures`) as Record<string,SavedExposure>|undefined;
    for(const entry of Object.values(entries??{})) {
      if(entry.actor!==actor.uuid||entry.kind!==kind)continue;
      found=true;
      if(combat.started&&encounterEpoch(combat)===entry.epoch&&((combat.round??0)<entry.round||((combat.round??0)===entry.round&&(combat.turn??0)<entry.turn)))return true;
    }
  }
  return found?false:undefined;
}
const received=new Set<string>();
type Exposure={effectEvent:"exposure";id:string;actor:string;kind:"poison"|"biotoxin";combatId?:string;epoch?:string};
async function receive(event:Exposure) {
  if(event?.effectEvent!=="exposure"||typeof event.id!=="string"||typeof event.actor!=="string"||!["poison","biotoxin"].includes(event.kind)||received.has(event.id))return;
  received.add(event.id);if(received.size>200)received.delete(received.values().next().value!);
  Hooks.callAll?.("pneumaCombatToolsExposure",event.actor,event.kind);
  // One active GM owns combat writes, including reports originating on a player.
  const gm=game.users?.filter(user=>user.active&&user.isGM).sort((a,b)=>a.id!.localeCompare(b.id!))[0];
  const combat=(event.combatId?game.combats?.get(event.combatId):undefined) as Combat|undefined;
  if(gm?.id!==game.user?.id||!combat?.started||encounterEpoch(combat)!==event.epoch)return;
  const index=combat.turns.findIndex(member=>member.actor?.uuid===event.actor);
  if(index<0)return;
  const entry:SavedExposure={actor:event.actor,kind:event.kind,epoch:encounterEpoch(combat),round:(combat.round??0)+(index<=(combat.turn??0)?1:0),turn:index};
  // Combat-scoped presentation state; this adds no actor status or damage.
  try {await combat.update({[`flags.${MODULE}.visualExposures.${event.id}`]:entry} as never);}
  catch(error){console.error(`${MODULE} | Exposure persistence failed`,error);}
}
export async function reportExposure(actor:Actor,kind:string) {
  if(kind!=="poison"&&kind!=="biotoxin")return;
  let combat:Combat|undefined;
  try {combat=actorEncounter(actor);}
  catch(error){console.error(`${MODULE} | Exposure encounter lookup failed`,error);}
  const event:Exposure={effectEvent:"exposure",id:foundry.utils.randomID(),actor:actor.uuid,kind,...(combat?{combatId:combat.id!,epoch:encounterEpoch(combat)}:{})};
  await receive(event);game.socket?.emit("module."+MODULE,event);
}
export function registerEffectEvents(){
  const module=game.modules!.get(MODULE) as unknown as {api?:Record<string,unknown>};
  module.api={...module.api,hasReportedExposure};
  Hooks.once("ready",()=>game.socket!.on("module."+MODULE,(event:Exposure)=>{void receive(event).catch(error=>console.error(`${MODULE} | Exposure persistence failed`,error));}));
}
