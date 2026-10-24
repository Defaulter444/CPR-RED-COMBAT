import {masterStatuses} from "./status-catalog.js";

export const proneIds=()=>["prone",masterStatuses.find(s=>s.name==="Prone")!.id];
export const registeredProneIds=()=>proneIds().filter(id=>CONFIG.statusEffects.some(status=>status.id===id));
export const isProne=(actor:Actor)=>Array.from(actor.allApplicableEffects?.()??actor.effects??[]).some(effect=>!effect.disabled&&!effect.isSuppressed&&proneIds().some(id=>effect.statuses.has(id)));
