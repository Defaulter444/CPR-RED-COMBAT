import {nativeItemMatches} from "../native-lookup.js";
import type { RollItem, NativeRoll } from "../native-combat.js";
export type AreaKind="shell"|"explosive"|"suppression";
export interface AreaWeapon extends RollItem { _getLoadedAmmoProp?(prop:string):unknown }
export function isMolotov(item:{type:string;name?:string|null;system:unknown;_stats?:unknown;flags?:unknown}):boolean {
  return (item.system as {weaponType?:string}).weaponType === "thrownWeapon" && nativeItemMatches(item,"Molotov Cocktail");
}
export function areaKind(item:{name?:string|null;type:string;system:unknown;_stats?:unknown;flags?:unknown;_getLoadedAmmoProp?:(prop:string)=>unknown},mode:string):AreaKind|undefined {
  const s=item.system as {weaponType?:string;variety?:string;fireModes?:{suppressiveFire?:boolean};isRanged?:boolean};
  if(mode==="suppressive") return s.isRanged && (s.fireModes?.suppressiveFire || ["smg","heavySmg","assaultRifle"].includes(s.weaponType??""))?"suppression":undefined;
  if(mode!=="attack")return;
  if(isMolotov(item))return "explosive";
  if(item.type==="ammo"&&s.variety==="grenade" || ["grenadeLauncher","rocketLauncher"].includes(s.weaponType??""))return "explosive";
  if(s.weaponType==="shotgun"&&item._getLoadedAmmoProp?.("variety")==="shotgunShell")return "shell";
}

/** CPR confirmRoll starts discharge without awaiting it; wait for that native write before publishing. */
export async function confirmAreaRoll(item:RollItem,roll:NativeRoll):Promise<NativeRoll> {
  let discharge:Promise<unknown>|undefined;
  const view=new Proxy(item,{get(target,key){
    const value=Reflect.get(target,key,target) as unknown;
    if(key==="dischargeItem"&&typeof value==="function")return (...args:unknown[])=>{
      discharge=Promise.resolve(value.apply(target,args));return discharge;
    };
    return typeof value==="function"?value.bind(target):value;
  }});
  const confirmed=await item.confirmRoll.call(view,roll);
  if(discharge)await discharge;
  return confirmed;
}
