/** Ammunition eligibility from the supplied core ammunition tables. */
export const instantEffects = {
  smoke: {name:"Smoke", color:"#a7afb7", skill:"", dv:0, damage:"", eligibility:"Область 10 × 10 м с центром на цели"},
  poison: {name:"Poison", color:"#54ad49", skill:"Resist Torture/Drugs", dv:13, damage:"2d6", eligibility:"Живая цель"},
  biotoxin: {name:"Biotoxin", color:"#ee912f", skill:"Resist Torture/Drugs", dv:15, damage:"3d6", eligibility:"Живая цель"},
  emp: {name:"EMP", color:"#47c9dd", skill:"Cybertech", dv:15, damage:"", eligibility:"Киберимпланты или носимая электроника"},
  microwaver: {name:"EMP (Microwaver)", color:"#47c9dd", skill:"Cybertech", dv:15, damage:"", eligibility:"Киберимпланты или носимая электроника; одна минута"},
  flashbang: {name:"Flashbang", color:"#f0d953", skill:"Resist Torture/Drugs", dv:15, damage:"", eligibility:"Задетая цель"},
  incendiary: {name:"On Fire (Mild)", color:"#ef632e", skill:"", dv:0, damage:"", eligibility:"После того как урон пробил броню"},
  sleep: {name:"Sleep", color:"#ad80df", skill:"Resist Torture/Drugs", dv:13, damage:"", eligibility:"Живая цель"},
  teargas: {name:"Teargas", color:"#b3c84c", skill:"Resist Torture/Drugs", dv:13, damage:"", eligibility:"Живые глаза"},
} as const;
export type InstantId = keyof typeof instantEffects;
export function instantId(value:unknown):value is InstantId {return typeof value==="string"&&Object.hasOwn(instantEffects,value);}
export const ammunition = {
  armorPiercing:{name:"Armor-Piercing",color:"#d44a40",grenade:true,rocket:true,damaging:true},
  ...Object.fromEntries(Object.entries(instantEffects).filter(([id])=>id!=="microwaver").map(([id,e])=>[id,{name:id==="incendiary"?"Incendiary":e.name,color:e.color,grenade:true,rocket:false,damaging:id==="incendiary"}])),
  smoke:{name:"Smoke",color:"#a7afb7",grenade:true,rocket:false,damaging:false},
  smart:{name:"Smart",color:"#528fea",grenade:false,rocket:true,damaging:true},
} as Record<string,{name:string;color:string;grenade:boolean;rocket:boolean;damaging:boolean}>;
export function ammoProfile(type:string|undefined,variety?:string) {
  const entry=type?ammunition[type]:undefined;
  return entry&&(!variety||(variety==="rocket"?entry.rocket:variety==="grenade"&&entry.grenade))?entry:undefined;
}
export { escapeHTML as escapeInstant } from "./shared.js";
