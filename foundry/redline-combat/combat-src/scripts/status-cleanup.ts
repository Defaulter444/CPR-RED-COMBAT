import {buildCombatReport,combatReportHTML,combatReportMarkdown,type CombatReport} from "./combat-report.js";
import {type CombatSummarySnapshot} from "./combat-summary.js";
import {allActors,escapeHTML,primaryGM} from "./shared.js";
import {bindCardAction} from "./card-structure.js";
import {masterStatuses} from "./status-catalog.js";
import {durationExpired,hasDuration} from "./effect-duration.js";
import {actorInStartedCombat,effectCombat,endedEffect,effectLifetime,effectExpired} from "./effect-lifetime.js";
export {actorInStartedCombat,effectCombat,endedEffect} from "./effect-lifetime.js";
import {syncActorStatuses} from "./status-sync.js";
import {cleanupEndedEmp,empWork} from "./emp-state.js";
import {empReferences,timedDisables,disableExpired} from "./emp-rules.js";
import {actorGrapples} from "./grapple/state.js";
import { statusLabel } from "./status-labels.js";

const M="redline-combat";
const flag=(doc:object,key:string)=>foundry.utils.getProperty(doc,`flags.${M}.${key}`);
export interface CleanupScope {actors?:string[];combat?:string;label?:string}
export interface CleanupRow {id:string;actor:Actor;document?:ActiveEffect|Item;name:string;reason:string;operation:string;selected:boolean;blocked:boolean;injury:boolean;emp?:boolean;grapple?:string}
export function cleanupRows(scope:CleanupScope={},includeInjuries=false):CleanupRow[] {
  const rows:CleanupRow[]=[];
  for(const actor of allActors()){
    if(scope.actors&&!scope.actors.includes(actor.uuid))continue;
    const inCombat=actorInStartedCombat(actor)||!!scope.combat&&!!game.combats?.get(scope.combat)?.started;
    const effects=Array.from(actor.allApplicableEffects?.()??actor.effects);
    const injuries=actor.items.filter(i=>String(i.type)==="criticalInjury");
    const injuryMarkers=new Set<ActiveEffect>();
    const grapples=actorGrapples(actor);
    for(const g of grapples.filter(g=>g.combat&&!game.combats?.get(g.combat)?.started)){
      const blocked=inCombat||Array.from(game.combats??[]).some(c=>c.started&&c.combatants.some(p=>[g.source.actor,g.target.actor].includes(p.actor?.uuid??"")));
      if(rows.some(r=>r.grapple===g.id))continue;
      rows.push({id:actor.uuid+":grapple:"+g.id,actor,name:`Захват: ${g.source.name} / ${g.target.name}`,reason:blocked?"Заблокировано: участник в начатом бою":"Захват относится к завершённому бою",operation:"Завершить захват для обоих и вернуть токены на места",selected:!blocked,blocked,injury:false,grapple:g.id});
    }
    for(const item of injuries){
      const definition=masterStatuses.find(s=>s.binding?.kind==="injury"&&(flag(item,"statusId")===s.id||item.name===s.binding.itemName||String(foundry.utils.getProperty(item,"_stats.compendiumSource")??foundry.utils.getProperty(item,"flags.core.sourceId")??"").endsWith("."+s.binding.itemId)));
      const markers=effects.filter(e=>e.origin===item.uuid||!!definition&&e.statuses.has(definition.id)||e.parent===item);
      markers.forEach(e=>injuryMarkers.add(e));
      const timed=markers.find(e=>e.parent===actor&&e.origin===item.uuid&&hasDuration(e.duration));
      const temporary=!!timed||flag(item,"instantLifetime.kind")==="injury";
      const due=timed?(endedEffect(timed)||durationExpired(timed.duration)):temporary&&Number(flag(item,"instantLifetime.expires"))<=game.time!.worldTime;
      rows.push({id:item.uuid,actor,document:item,name:statusLabel(item.name??"Критическая травма"),reason:inCombat?"Заблокировано: актёр в начатом бою":temporary?(due?"Временная травма — закончилась или истекла":"Временная травма — ещё действует"):"Постоянная критическая травма",operation:"Убрать предмет травмы и связанное состояние",selected:!inCombat&&due,blocked:inCombat||!temporary&&!includeInjuries,injury:!temporary});
    }
    for(const effect of effects){
      if(injuryMarkers.has(effect)||effect.disabled)continue;
      const policy=effectLifetime(effect),injury=policy.injury;
      if(policy.kind==="managed")continue; // Equipment restoration owns these markers.
      const grapple=flag(effect,"grappleId");
      if(grapple&&grapples.some(g=>g.id===grapple&&g.combat&&!game.combats?.get(g.combat)?.started))continue;
      const liveGrapple=!!grapple&&grapples.some(g=>g.id===grapple);
      const ended=endedEffect(effect),expired=effectExpired(effect);
      const orphanGrapple=!!grapple&&!liveGrapple;
      const itemEffect=effect.parent!==actor;
      if(itemEffect&&!hasDuration(effect.duration)&&!effectCombat(effect))continue;
      const protectedEffect=!!policy.protected||liveGrapple||injury&&!includeInjuries;
      rows.push({id:effect.uuid,actor,document:effect,name:statusLabel(effect.name??"Эффект состояния"),reason:inCombat?"Заблокировано: актёр в начатом бою":policy.protected?policy.label:liveGrapple?"Защищено: активный захват":injury?"Метка критической травмы":ended?"Ссылается на завершённый или отсутствующий бой":expired?"Длительность истекла":orphanGrapple?"Метка захвата без захвата":policy.label+" — проверить",operation:itemEffect?"Выключить эффект предмета, предмет оставить":"Снять эффект состояния",selected:!inCombat&&!protectedEffect&&(ended||expired||orphanGrapple),blocked:inCombat||protectedEffect,injury});
    }
    const staleEmp=actor.items.some(item=>empReferences(item).some(id=>!game.combats?.get(id)?.started)||Object.values(timedDisables(item)).some(e=>disableExpired(e.duration)));
    const staleMarker=actor.effects.some(e=>!!flag(e,"disableRequest")||!!flag(e,"empCombat")||!!flag(e,"disabledLegPenalty")||!!flag(e,"frameConsequences"));
    if(staleEmp||staleMarker)rows.push({id:actor.uuid+":emp",actor,name:"Отключения снаряжения",reason:inCombat?"Заблокировано: актёр в начатом бою":staleEmp?"Закончившиеся или истёкшие отключения снаряжения":"Сверить метки снаряжения с источниками",operation:"Согласовать снаряжение и производные штрафы",selected:!inCombat,blocked:inCombat,injury:false,emp:true});
  }
  return rows;
}
export async function applyCleanup(scope:CleanupScope,ids:string[],includeInjuries=false):Promise<string[]> {
  if(!game.user?.isGM)throw Error("Очищать состояния может только Мастер.");
  const results:string[]=[];
  for(const id of new Set(ids)){
    const row=cleanupRows(scope,includeInjuries).find(r=>r.id===id);
    if(!row){results.push("Уже снято или недоступно: "+id);continue;}
    if(row.blocked){results.push(`${row.actor.name}: пропущено ${row.name} — ${row.reason}`);continue;}
    try{
      if(row.emp)await empWork(()=>cleanupEndedEmp(row.actor));
      else if(row.grapple){const {cleanupEndedGrapple}=await import("./grapple/workflow.js");await cleanupEndedGrapple(row.actor,row.grapple);}
      else if(String((row.document as Item).type)==="criticalInjury"){
        const linked=row.actor.effects.filter(e=>e.origin===row.document!.uuid).map(e=>e.id!);
        await row.actor.deleteEmbeddedDocuments("Item",[row.document!.id!],{pneumaStatusSync:true} as never);
        if(linked.length)await row.actor.deleteEmbeddedDocuments("ActiveEffect",linked,{pneumaStatusSync:true} as never);
        await syncActorStatuses(row.actor);
      }else{
        const effect=row.document as ActiveEffect;
        const bindings=Array.from(effect.statuses).filter(id=>masterStatuses.some(s=>s.id===id&&s.binding));
        if(bindings.length)await syncActorStatuses(row.actor,bindings,false,false);
        if(effect.parent===row.actor){if(row.actor.effects.get(effect.id!))await row.actor.deleteEmbeddedDocuments("ActiveEffect",[effect.id!],{pneumaStatusSync:true} as never);}
        else await effect.update({disabled:true} as never);
        await syncActorStatuses(row.actor);
      }
      results.push(`${row.actor.name}: ${row.emp?"согласовано":"снято"} ${row.name}`);
    }catch(error){results.push(`${row.actor.name}: ОШИБКА ${row.name} — ${(error as Error).message}`);}
  }
  return results;
}
export class StatusCleanup extends FormApplication {
  private scope:CleanupScope;
  private includeInjuries=false;
  private results:string[]=[];
  private applying=false;
  constructor(scope:CleanupScope={}){super({});this.scope=scope;}
  static override get defaultOptions(){return foundry.utils.mergeObject(super.defaultOptions,{id:"pneuma-status-cleanup",title:"Очистка состояний",width:720,resizable:true,closeOnSubmit:false,template:`modules/${M}/combat/templates/status-cleanup.hbs`});}
  override getData(){
    const rows=game.user?.isGM?cleanupRows(this.scope,this.includeInjuries):[];
    return {label:this.scope.label??"Все актёры мира и токены сцен",includeInjuries:this.includeInjuries,rows:rows.map(r=>({...r,actor:r.actor.name})),results:this.results,empty:!rows.length};
  }
  override activateListeners(html:JQuery){
    super.activateListeners(html);
    html.find<HTMLInputElement>('[name="includeInjuries"]').on("change",e=>{this.includeInjuries=e.currentTarget.checked;this.render(true);});
    html.find('[data-cleanup-refresh]').on("click",()=>this.render(true));
  }
  protected override async _updateObject(_event:Event,data:Record<string,unknown>){
    if(this.applying)return;
    this.applying=true;
    try{
    const ids=Array.isArray(data.effects)?data.effects:typeof data.effects==="string"?[data.effects]:[];
    this.results=await applyCleanup(this.scope,ids.filter((id):id is string=>typeof id==="string"),this.includeInjuries);
    this.render(true);
    }finally{this.applying=false;}
  }
}
const notices=new Set<string>();
export function resetCleanupNotice(combat:Combat){notices.delete(combat.id!);}
export async function postCleanupNotice(combat:Combat,affected?:string[],summary?:CombatSummarySnapshot){
  if(game.user?.id!==primaryGM()?.id||notices.has(combat.id!))return;
  const scope:CleanupScope={combat:combat.id!,actors:[...new Set([...(affected??Array.from(combat.combatants??[]).flatMap(p=>p.actor?[p.actor.uuid]:[])),...(summary?.actors.map(actor=>actor.uuid)??[])])],label:combat.name??"Завершённый бой"};
  // Include tagged actors even if removed from the tracker before combat ended.
  for(const actor of allActors())if(Array.from(actor.allApplicableEffects?.()??actor.effects).some(e=>effectCombat(e)===combat.id)&&!scope.actors!.includes(actor.uuid))scope.actors!.push(actor.uuid);
  const report=summary?buildCombatReport(summary):undefined;
  notices.add(combat.id!);
  try{await ChatMessage.create({content:`<section class="pneuma-status-cleanup-card">${report?combatReportHTML(report)+'<button type="button" data-copy-combat-summary data-chat-icon="fa-copy">Скопировать для Discord</button>':'<p>'+escapeHTML(scope.label)+' окончен. Проверьте оставшиеся состояния.</p>'}<button type="button" data-status-cleanup data-gm-only="true">Очистить состояния токенов</button></section>`,whisper:[],blind:false,flags:{[M]:{statusCleanup:scope,...(report?{combatReport:report}:{})}}} as never);}
  catch(error){notices.delete(combat.id!);throw error;}
}
export function registerStatusCleanup(){
  Hooks.on("updateCombat",(combat:Combat)=>{if(combat.started)resetCleanupNotice(combat);});
  Hooks.on("pneumaCombatCleanupFinished",(combat:Combat,actors:string[],summary?:CombatSummarySnapshot)=>{void postCleanupNotice(combat,actors,summary).catch(error=>ui.notifications!.error(String(error)));});
  game.settings!.registerMenu(M,"statusCleanup",{name:"Очистка состояний",label:"Открыть очистку",hint:"Проверка Мастером эффектов завершённых боёв, истёкших и неучтённых. Постоянные критические травмы по умолчанию защищены.",icon:"fas fa-broom",type:StatusCleanup,restricted:true});
  Hooks.on("renderChatMessage",(message:ChatMessage,html:JQuery)=>{
    const scope=flag(message,"statusCleanup") as CleanupScope|undefined;
    if(!scope)return;
    const report=flag(message,"combatReport") as CombatReport|undefined;
    if(report&&html[0])html[0].querySelectorAll<HTMLElement>('[data-copy-combat-summary]').forEach(node=>bindCardAction(node,async()=>{
      const markdown=combatReportMarkdown(report);
      try{await navigator.clipboard.writeText(markdown);ui.notifications!.info("Итог боя скопирован в формате Markdown для Discord.");}
      catch{new Dialog({title:"Итог боя для Discord",content:'<p>Скопируйте Markdown ниже.</p><textarea readonly style="width:100%;min-height:300px">'+escapeHTML(markdown)+'</textarea>',buttons:{close:{label:"Закрыть"}}}).render(true);}
    }));
    const button=html.find('[data-status-cleanup]');
    if(!game.user?.isGM){button.remove();return;}
    html[0]?.querySelectorAll<HTMLElement>('[data-status-cleanup]').forEach(node=>bindCardAction(node,()=>new StatusCleanup(scope).render(true)));
  });
}
