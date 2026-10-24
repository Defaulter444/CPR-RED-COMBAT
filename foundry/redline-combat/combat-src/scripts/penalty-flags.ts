/** CPR requires per-change categories and situational metadata even for permanent modifiers. */
export function penaltyFlags(changes:{key:string}[]) {
  return {changes:{cats:Object.fromEntries(changes.map((change,i)=>[i,change.key.startsWith("system.stats.")?"stat":"misc"])),
    situational:Object.fromEntries(changes.map((_,i)=>[i,{isSituational:false,onByDefault:true}]))}};
}
export function missingPenaltyFlags(effect:ActiveEffect):boolean {
  return effect.changes.some((_,i)=>!foundry.utils.getProperty(effect,`flags.cyberpunk-red-core.changes.cats.${i}`)||
    !foundry.utils.getProperty(effect,`flags.cyberpunk-red-core.changes.situational.${i}`));
}
