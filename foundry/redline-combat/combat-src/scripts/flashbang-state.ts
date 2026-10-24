import {effectDuration,durationExpired,type EffectDuration} from './effect-duration.js';
import {encounterEpoch} from './encounter.js';
interface FlashbangState {actor:string;epoch:string;duration:EffectDuration;created:number;kind?:'flashbang'|'teargas'}
const transient=new Map<string,FlashbangState>();
function receiveVisual(event:{visualEvent?:string;id?:string;entry?:FlashbangState}){
 if(event?.visualEvent!=='flashbang'||typeof event.id!=='string'||!event.entry||typeof event.entry.actor!=='string'||!['flashbang','teargas'].includes(event.entry.kind??''))return;
 transient.set(event.id,event.entry);Hooks.callAll('pneumaCombatToolsFlashbangChanged');
}
export function registerFlashbangEvents():void {Hooks.once('ready',()=>game.socket?.on('module.redline-combat',receiveVisual));}
export async function reportFlashbang(actor:Actor,combat:Combat|null|undefined,kind:'flashbang'|'teargas'='flashbang'):Promise<void>{
 const id=foundry.utils.randomID();
 if(!combat?.started){const event={visualEvent:'flashbang',id,entry:{actor:actor.uuid,epoch:'',duration:effectDuration(60,null),created:Date.now(),kind}};receiveVisual(event);game.socket?.emit('module.redline-combat',event);return;}
 await combat.update({[`flags.redline-combat.flashbangVisuals.${id}`]:{actor:actor.uuid,epoch:encounterEpoch(combat),duration:effectDuration(60,combat),created:Date.now(),kind}} as never);
}
export function getFlashbangState(actor:Actor):{id:string;created:number}|undefined {
 return getState(actor,'flashbang');
}
export function getTearGasState(actor:Actor):{id:string;created:number}|undefined {return getState(actor,'teargas');}
function getState(actor:Actor,kind:'flashbang'|'teargas'):{id:string;created:number}|undefined {
 let result:{id:string;created:number}|undefined;
 for(const [id,entry] of transient){if(durationExpired(entry.duration)){transient.delete(id);continue;}if(entry.actor===actor.uuid&&entry.kind===kind&&(!result||entry.created>result.created))result={id,created:entry.created};}
 for(const combat of game.combats??[]){
  if(!combat.started)continue;
  const records=foundry.utils.getProperty(combat,'flags.redline-combat.flashbangVisuals') as Record<string,FlashbangState>|undefined;
  for(const [id,entry] of Object.entries(records??{}))if((entry.kind??'flashbang')===kind&&entry.actor===actor.uuid&&entry.epoch===encounterEpoch(combat)&&!durationExpired(entry.duration)&&(!result||entry.created>result.created))result={id,created:entry.created};
 }
 return result;
}
