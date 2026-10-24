import {sceneEncounter} from "./encounter.js";
import {withActorMutation} from "./actor-mutation.js";
import {allActors,escapeHTML,primaryGM} from "./shared.js";
import {findNativeItem} from "./native-lookup.js";
import {nativeCard,spendBonusLuck,type RollItem} from "./native-combat.js";
import {checkedLuck} from "./evasion-rules.js";
import {statusAuthority,syncActorStatuses} from "./status-sync.js";
import {masterStatuses} from "./status-catalog.js";
import {requireCombatSocket} from "./socket-health.js";
import {postTreatment} from "./treatment-card.js";
import {injuryTreatmentChoices,nativeTreatmentSkill,permanentQuickFix,stabilizationDifficulty,stabilizationSkills} from "./medical-rules.js";
import {GMRequests} from "./gm-request.js";
import {quickFixExpired} from "./effect-lifetime.js";

declare global {interface SettingConfig {"redline-combat.enableStabilization":boolean}}
const M="redline-combat",STATUS="pneuma-needs-stabilization",DAY=86400;
const get=(doc:object,path:string)=>foundry.utils.getProperty(doc,path);
export const medicalEnabled=()=>!!game.settings?.get(M,"enableStabilization");
export const needsStabilization=(actor:Actor)=>actor.effects.some(effect=>!effect.disabled&&effect.statuses.has(STATUS));
export const medicalHP=(actor:Actor)=>Number(get(actor,"system.derivedStats.hp.value"));
const maximum=(actor:Actor)=>Number(get(actor,"system.derivedStats.hp.max"));
export const stabilizationDV=(actor:Actor)=>stabilizationDifficulty(medicalHP(actor),maximum(actor));
const medtech=(actor:Actor)=>Number(get(findNativeItem(actor.items,"Medtech")??{},"system.rank"))>0;
const dose=(actor:Actor)=>Array.from(actor.items).find(item=>String(item.type)==="drug"&&findNativeItem([item],"Speedheal")&&Number(get(item,"system.amount"))>0);
const hasSpeedheal=(actor:Actor)=>actor.effects.some(effect=>!effect.disabled&&(effect.statuses.has("speedheal")||effect.statuses.has(masterStatuses.find(status=>status.name==="Speed Heal")!.id)));
export const quickFixed=(item:Item)=>!!get(item,`flags.${M}.quickFix`);
interface SpeedhealOperation {id:string;source:string;stock:string;amount:number}
const speedhealOperation=(actor:Actor)=>get(actor,`flags.${M}.speedhealOperation`) as SpeedhealOperation|undefined;
interface Choice {name:string;item:RollItem;dv:number}
function medicalBase(actor:Actor,choice:Choice):number|undefined {
  const stat=String(get(choice.item,"system.stat")??"tech");
  const native=actor as Actor & {getStat?(name:string):number};
  const rank=Number(get(choice.item,"system.level")),value=Number(native.getStat?.(stat)??get(actor,`system.stats.${stat}.value`));
  return Number.isFinite(rank)&&Number.isFinite(value)?rank+value:undefined;
}
function medicalSkillLabel(actor:Actor,choice:Choice):string {
  return `(${choice.name==="Paramedic"?"Парамед.":"Перв. пом."} ${medicalBase(actor,choice)??"?"})`;
}
function skills(actor:Actor,injury?:Item):Choice[] {
  const choices=injury?injuryTreatmentChoices(injury).filter(row=>row.stage==="QuickFix"):stabilizationSkills.map(skill=>({skill,dv:0}));
  return choices.flatMap(choice=>{const native=nativeTreatmentSkill(actor,choice.skill);return native?[{name:choice.skill,item:native.item as RollItem,dv:choice.dv}]:[];});
}
export interface MedicalEntry {action:string;label:string;item?:string;skill?:string;disabled?:boolean;title?:string;groupLabel?:string;choiceLabel?:string}
export function medicalEntries(source:Actor|undefined,target:Actor|undefined):MedicalEntry[] {
  if(!target||!["character","mook"].includes(String(target.type)))return [];
  const dead=masterStatuses.find(status=>status.name==="Dead")?.id;
  const unavailable=target.effects.some(effect=>!effect.disabled&&(effect.statuses.has("dead")||!!dead&&effect.statuses.has(dead)));
  const rows:MedicalEntry[]=[];
  if(needsStabilization(target)) {
    const choices=source?skills(source):[];
    for(const choice of choices)rows.push({action:"stabilize",skill:choice.name,groupLabel:"Стабилизировать — DV"+stabilizationDV(target),choiceLabel:choice.name+" ("+(medicalBase(source!,choice)??"?")+")",label:"Стабилизировать — DV"+stabilizationDV(target)+" "+medicalSkillLabel(source!,choice),disabled:unavailable,title:"Действие; бросок "+choice.name+"; в скобках навык + характеристика без модификаторов броска"});
    if(!choices.length)rows.push({action:"stabilize",label:"Стабилизировать — DV"+stabilizationDV(target),disabled:true,title:source?"Нужен навык «Первая помощь» или «Парамедицина»":"Выберите персонажа, который будет лечить"});
  }
  if(source&&!unavailable) {
    const operation=speedhealOperation(target),resuming=operation?.source===source.uuid;
    if(medtech(source)&&(resuming||medicalHP(target)<maximum(target)&&dose(source)))rows.push({action:"speedheal",label:resuming?"Продолжить SpeedHeal":"SpeedHeal",disabled:medicalHP(target)<1||!!operation&&!resuming||hasSpeedheal(target)&&!resuming,title:resuming?"Завершить прерванную дозу, не тратя новую":"ТЕЛ + ВОЛ HP; состояние Speed Heal не даёт повторить до конца боя; не лечит находящихся при смерти"});
    for(const injury of target.items.filter(item=>String(item.type)==="criticalInjury"&&!quickFixed(item)&&skills(source,item).length>0))
      for(const choice of skills(source,injury))rows.push({action:"quickFix",item:injury.id!,skill:choice.name,groupLabel:injury.name??"Травма",choiceLabel:choice.name+" — DV"+choice.dv+" ("+(medicalBase(source,choice)??"?")+")",label:injury.name+" — DV"+choice.dv+" "+medicalSkillLabel(source,choice),title:"Quick Fix: 1 минута; навык и DV травмы — штатные"});
  }
  return rows;
}
function inActiveCombat(actor:Actor):boolean {
  return Array.from(game.combats?.values()??[]).some(combat=>combat.active&&combat.started&&combat.combatants.some(row=>
    actor.isToken ? row.token?.uuid===actor.token?.uuid : row.actor?.uuid===actor.uuid));
}
/** Only HP loss by a participant in an active, started encounter is eligible. */
const damageWork=new Map<string,Promise<void>>();
export async function markMedicalDamage(actor:Actor,before:number):Promise<void> {
  const damaged=medicalEnabled()&&inActiveCombat(actor)&&["character","mook"].includes(String(actor.type))&&medicalHP(actor)<before;
  if(!damaged)return;
  const key=actor.uuid;
  const next=(damageWork.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
    if(!medicalEnabled()||!inActiveCombat(actor))return;
    if(!needsStabilization(actor))await actor.createEmbeddedDocuments("ActiveEffect",[{name:"Needs Stabilization",img:"icons/svg/regen.svg",statuses:[STATUS],changes:[]}]);
  });
  damageWork.set(key,next);
  try{await next;}finally{if(damageWork.get(key)===next)damageWork.delete(key);}
}
interface Request {medicalType:"request";id:string;user:string;source:string;target:string;action:string;item?:string;skill?:string;total?:number;hp:number;dv?:number}
interface Reply {medicalType:"reply";id:string;user:string;gm:string;error?:string}
let work:Promise<unknown>=Promise.resolve();
function medicalWork<T>(run:()=>Promise<T>):Promise<T> {const next=work.catch(()=>{}).then(run);work=next;return next;}
const completed=new Set<string>();
export function resolveMedical(request:Request):Promise<void> {
  return medicalWork(async()=>{
    if(game.user?.id!==primaryGM()?.id)throw Error("Нужен активный Мастер.");
    const key=request.user+":"+request.id;
    if(completed.has(key))return;
    await applyMedical(request);completed.add(key);
    if(completed.size>200)completed.delete(completed.values().next().value!);
  });
}
async function applyMedical(req:Request):Promise<void> {
  if(game.user?.id!==primaryGM()?.id)throw Error("Нужен активный Мастер.");
  const user=game.users?.get(req.user) as User|undefined,source=await fromUuid(req.source as Parameters<typeof fromUuid>[0]) as TokenDocument|null,target=await fromUuid(req.target as Parameters<typeof fromUuid>[0]) as TokenDocument|null;
  if(!user||!source?.actor||!target?.actor||!user.isGM&&!source.actor.testUserPermission(user,"OWNER"))throw Error("Выберите своего персонажа и пациента.");
  if(source.parent?.id!==target.parent?.id)throw Error("Оба персонажа должны быть на одной сцене.");
  const grid=source.parent?.grid,size=Number(grid?.size);
  if(source.uuid!==target.uuid&&size>0&&Math.max(Math.abs(source.x-target.x),Math.abs(source.y-target.y))>size)throw Error("Сначала подойдите к пациенту.");
  const healer=source.actor,patient=target.actor;
  return withActorMutation(patient,()=>applyPatient(req,healer,patient,target));
}
async function applyPatient(req:Request,healer:Actor,patient:Actor,target:TokenDocument):Promise<void> {
  const healed=get(patient,`flags.${M}.speedhealCompleted`) as {id:string;user:string}|undefined;
  if(req.action==="speedheal"&&healed?.id===req.id&&healed.user===req.user)return;
  if(!medicalEntries(healer,patient).some(row=>row.action===req.action&&row.item===req.item&&(!req.skill||row.skill===req.skill)&&!row.disabled))throw Error("Это медицинское действие больше недоступно.");
  if(medicalHP(patient)!==req.hp&&!(req.action==="speedheal"&&speedhealOperation(patient)))throw Error("HP пациента изменилось. Бросок сохранён; снова откройте «Медицину», чтобы повторить.");
  if(req.action==="stabilize"&&req.dv!==undefined&&req.dv!==stabilizationDV(patient))throw Error("Состояние ранения пациента изменилось. Сверьте сохранённый бросок с Мастером, прежде чем повторять.");
  if(req.action==="speedheal") {
    let operation=speedhealOperation(patient);
    const stock=operation?healer.items.get(operation.stock):dose(healer);
    if(!stock)throw Error("Дозы Speedheal нет. Сверьте прерванную операцию с Мастером.");
    const amount=operation?.amount??Number(get(patient,"system.stats.body.value"))+Number(get(patient,"system.stats.will.value"));
    if(!Number.isFinite(amount)||amount<=0)throw Error("ТЕЛ/ВОЛ пациента недоступны.");
    if(!operation) {
      operation={id:req.id,source:healer.uuid,stock:stock.id!,amount};
      await patient.update({[`flags.${M}.speedhealOperation`]:operation} as never);
    }
    const operationId=operation.id;
    const status=masterStatuses.find(status=>status.name==="Speed Heal")!;
    const encounter=sceneEncounter(target.parent?.id);
    const combat=encounter?.combatants.some(row=>row.token?.uuid===target.uuid)?encounter:undefined;
    if(!patient.effects.some(effect=>get(effect,`flags.${M}.speedhealOperation`)===operationId))
      await patient.createEmbeddedDocuments("ActiveEffect",[{name:status.name,img:status.img,statuses:[status.id],changes:[],flags:{[M]:{speedhealOperation:operationId,...(combat?{endWithCombat:combat.id}:{})}}}] as never);
    const receipt=`flags.${M}.speedhealDoses.${operationId}`;
    if(!get(stock,receipt)) {
      const remaining=Number(get(stock,"system.amount"));
      if(!(remaining>0))throw Error("Дозы Speedheal больше нет.");
      // Stock and receipt change together; retry remains safe if confirmation is lost.
      await stock.update({"system.amount":remaining-1,[receipt]:true} as never);
    }
    // Healing and operation completion are one document update.
    await patient.update({"system.derivedStats.hp.value":Math.min(maximum(patient),medicalHP(patient)+amount),[`flags.${M}.-=speedhealOperation`]:null,[`flags.${M}.speedhealCompleted`]:{id:req.id,user:req.user}} as never);
    try{await stock.update({[`flags.${M}.speedhealDoses.-=${operationId}`]:null} as never);}
    catch(error){console.warn(M,"Speedheal dose receipt cleanup failed",error);}
  }else if(req.action==="stabilize") {
    if(!Number.isFinite(req.total)||req.total!<=stabilizationDV(patient))return;
    if(medicalHP(patient)<1) {
      await patient.update({"system.derivedStats.hp.value":1} as never);
      const status=masterStatuses.find(s=>s.name==="Unconscious")!;
      if(!patient.effects.some(e=>!e.disabled&&e.statuses.has(status.id)))await patient.createEmbeddedDocuments("ActiveEffect",[{name:"Unconscious",img:status.img,statuses:[status.id],changes:[],duration:{seconds:60,startTime:game.time!.worldTime}}] as never);
    }
    await patient.deleteEmbeddedDocuments("ActiveEffect",patient.effects.filter(e=>e.statuses.has(STATUS)).map(e=>e.id!));
  }else if(req.action==="quickFix") {
    const injury=patient.items.get(req.item!)!,options=skills(healer,injury);
    if(!Number.isFinite(req.total)||!options.some(option=>option.name===req.skill&&req.total!>option.dv))return;
    if(permanentQuickFix(injury)) {
      const markers=patient.effects.filter(e=>e.origin===injury.uuid||e.statuses.has(masterStatuses.find(s=>s.binding?.itemId===injury.id)?.id??""));
      await patient.deleteEmbeddedDocuments("Item",[injury.id!]);
      if(markers.length)await patient.deleteEmbeddedDocuments("ActiveEffect",markers.map(e=>e.id!));
    }else {
      const encounter=sceneEncounter(target.parent?.id);
      const saved={combat:encounter?.combatants.some(row=>row.token?.uuid===target.uuid)?encounter.id:null,expires:game.time!.worldTime+DAY,effects:injury.effects.filter(e=>!e.disabled).map(e=>e.id!),deathSave:get(injury,"system.deathSaveIncrease")};
      await injury.update({[`flags.${M}.quickFix`]:saved,"system.deathSaveIncrease":false} as never);
      if(saved.effects.length)await injury.updateEmbeddedDocuments("ActiveEffect",saved.effects.map(_id=>({_id,disabled:true})));
      const status=masterStatuses.find(s=>s.name==="Quick Fix")!;
      await patient.createEmbeddedDocuments("ActiveEffect",[{name:"Quick Fix — "+injury.name,img:status.img,statuses:[status.id],changes:[],origin:injury.uuid}] as never);
    }
    await syncActorStatuses(patient);
  }
}
const requests=new GMRequests();
function preflightMedical() {requireCombatSocket();const gm=primaryGM();if(!gm)throw Error("Нужен активный Мастер.");return gm;}
async function send(req:Request) {
  const gm=preflightMedical();
  if(game.user!.id===gm.id)return resolveMedical(req);
  return requests.request(req.id,()=>game.socket!.emit("module."+M,req),30000,"Медицинское действие не подтверждено. Проверьте пациента и инвентарь, прежде чем повторять.");
}
interface SavedMedical {request:Request;title:string;html:string;roll?:ReturnType<RollItem["createRoll"]>;dv:number;posted:boolean}
const savedRolls=new Map<string,SavedMedical>(),medicalBusy=new Set<string>();
export async function performMedical(source:Token,target:Token,action:string,itemId?:string,skipDialog=false,selectedSkill?:string) {
  const key=[game.user?.id,source.document.uuid,target.document.uuid,action,itemId,selectedSkill].join(":");
  if(medicalBusy.has(key))return;
  medicalBusy.add(key);
  try{await performMedicalAction(key,source,target,action,itemId,skipDialog,selectedSkill);}
  finally{medicalBusy.delete(key);}
}
async function performMedicalAction(key:string,source:Token,target:Token,action:string,itemId:string|undefined,skipDialog:boolean,selectedSkill:string|undefined) {
  if(!source.actor?.isOwner||!target.actor)throw Error("Выберите своего персонажа.");
  preflightMedical();
  const previous=savedRolls.get(key);
  const row=medicalEntries(source.actor,target.actor).find(row=>row.action===action&&row.item===itemId&&(!selectedSkill||row.skill===selectedSkill)&&!row.disabled);
  if(!row&&!previous)throw Error("Медицинское действие недоступно.");
  const gridSize=Number(source.document.parent?.grid.size);
  if(source.document.parent?.id!==target.document.parent?.id||source.document.uuid!==target.document.uuid&&gridSize>0&&Math.max(Math.abs(source.document.x-target.document.x),Math.abs(source.document.y-target.document.y))>gridSize)throw Error("Сначала подойдите к пациенту.");
  if(previous) {
    if(action==="stabilize"&&previous.dv!==stabilizationDV(target.actor)&&needsStabilization(target.actor)) {
      savedRolls.delete(key);throw Error("Состояние ранения пациента изменилось. Прошлый бросок остался в чате; сверьте его с Мастером перед новой попыткой.");
    }
    previous.request.hp=medicalHP(target.actor);
    await finishMedical(key,previous,source,target);return;
  }
  if(!row)throw Error("Медицинское действие недоступно.");
  const hp=medicalHP(target.actor);let total:number|undefined,paidRoll:ReturnType<RollItem["createRoll"]>|undefined,dv=0,skill:string|undefined;
  if(action!=="speedheal") {
    const choices=skills(source.actor,itemId?target.actor.items.get(itemId):undefined).filter(choice=>!selectedSkill||choice.name===selectedSkill);
    const choice=choices.length===1?choices[0]:await Dialog.prompt({title:row.label,content:'<select name="medicalSkill">'+choices.map((c,i)=>'<option value="'+i+'">'+escapeHTML(c.name)+(c.dv?' — DV'+c.dv:'')+'</option>').join('')+'</select>',label:"Бросить",rejectClose:false,callback:html=>choices[Number(html[0]!.querySelector<HTMLSelectElement>('select')!.value)]});
    if(!choice)return;
    skill=choice.name;
    dv=action==="stabilize"?stabilizationDV(target.actor):choice.dv;
    let roll=choice.item.createRoll("skill",source.actor);roll.rollTitle=row.label+" — DV"+dv;
    if(!await roll.handleRollDialog({type:"pneuma-medical",ctrlKey:skipDialog,metaKey:false},source.actor,choice.item))return;
    checkedLuck(Number(get(source.actor,"system.stats.luck.value")),0,roll.luck);
    roll=await choice.item.confirmRoll(roll);preflightMedical();await spendBonusLuck(source.actor,roll.luck);await roll.roll();total=roll.resultTotal;paidRoll=roll;
  }
  const saved:SavedMedical={request:{medicalType:"request",id:foundry.utils.randomID(),user:game.user!.id!,source:source.document.uuid,target:target.document.uuid,action,item:itemId,skill,total,hp,dv},title:row.label,html:"",roll:paidRoll,dv,posted:false};
  savedRolls.set(key,saved);await finishMedical(key,saved,source,target);
}
async function finishMedical(key:string,saved:SavedMedical,source:Token,target:Token) {
  // Publish paid rolls before patient mutations, so disconnects cannot erase the result.
  if(saved.request.action!=="speedheal"&&!saved.posted) {
    if(!saved.html&&saved.roll)saved.html=await nativeCard(saved.roll);
    await postTreatment(source,target,saved.title,saved.html,saved.request.total,saved.dv);saved.posted=true;
  }
  await send(saved.request);
  if(!saved.posted){await postTreatment(source,target,saved.title,saved.html,saved.request.total,saved.dv);saved.posted=true;}
  savedRolls.delete(key);
}
let queuedQuickFixExpiry:Promise<void>|undefined;
export function expireQuickFixes(combat?:Combat):Promise<void> {
  if(!combat&&queuedQuickFixExpiry)return queuedQuickFixExpiry;
  const next=medicalWork(async()=>{
    if(!combat)queuedQuickFixExpiry=undefined;
    const failures:string[]=[];
    for(const actor of allActors())if(statusAuthority(actor))for(const item of actor.items) {
      if(!get(item,`flags.${M}.quickFix`))continue;
      try{await withActorMutation(actor,async()=>{
        const saved=get(item,`flags.${M}.quickFix`) as {combat?:string|null;expires:number;effects:string[];deathSave:boolean}|undefined;
        if(!saved)return;
        if(!quickFixExpired(saved,actor,combat))return;
        const effects=saved.effects.filter(id=>item.effects.has(id));
        if(effects.length)await item.updateEmbeddedDocuments("ActiveEffect",effects.map(_id=>({_id,disabled:false})));
        const markers=actor.effects.filter(e=>e.origin===item.uuid&&e.name?.startsWith("Quick Fix"));
        if(markers.length)await actor.deleteEmbeddedDocuments("ActiveEffect",markers.map(e=>e.id!));
        // Keep recovery data until the injury penalties and marker cleanup have completed.
        await item.update({[`flags.${M}.-=quickFix`]:null,"system.deathSaveIncrease":saved.deathSave} as never);
        await syncActorStatuses(actor);
      });}catch(error){failures.push((actor.name??actor.uuid)+" / "+item.name+": "+String(error));}
    }
    if(failures.length)throw Error("Снятие Quick Fix не завершено; повторите очистку. "+failures.join("; "));
  });
  if(!combat)queuedQuickFixExpiry=next;
  return next;
}
export function registerMedical() {
  game.settings!.register(M,"enableStabilization",{name:"Включить стабилизацию",hint:"Автоматически отмечать «Нужна стабилизация» после потери HP у участников активного боя. Медицинские действия доступны всегда.",scope:"world",config:true,type:Boolean,default:false});
  const previousHP=new Map<string,number>();
  const remember=(actor:Actor)=>previousHP.set(actor.uuid,medicalHP(actor));
  Hooks.on("createActor",remember);Hooks.on("createToken",(token:TokenDocument)=>{if(token.actor)remember(token.actor);});
  Hooks.on("deleteActor",(actor:Actor)=>previousHP.delete(actor.uuid));
  Hooks.on("canvasReady",()=>{for(const actor of allActors())remember(actor);});
  Hooks.on("preUpdateActor",(actor:Actor,changes:object,options:Record<string,unknown>)=>{remember(actor);const next=get(changes,"system.derivedStats.hp.value")??(changes as Record<string,unknown>)["system.derivedStats.hp.value"];if(next!==undefined&&Number(next)<medicalHP(actor))options.pneumaMedicalHP=medicalHP(actor);});
  Hooks.on("updateActor",(actor:Actor,_changes:object,options:Record<string,unknown>)=>{
    const before=options.pneumaMedicalHP??previousHP.get(actor.uuid);remember(actor);
    if(before!==undefined&&statusAuthority(actor))void markMedicalDamage(actor,Number(before)).catch(error=>ui.notifications!.error(String(error)));
    const hud=canvas.tokens?.hud;if(hud?.object?.actor?.uuid===actor.uuid)hud.render(true);
  });
  const expire=()=>void expireQuickFixes().catch(error=>ui.notifications!.error(String(error)));
  Hooks.on("updateWorldTime",expire);
  Hooks.on("pneumaCombatCleanupFinished",(combat:Combat)=>{void expireQuickFixes(combat).catch(error=>ui.notifications!.error(String(error)));});
  Hooks.once("ready",()=>{
    for(const actor of allActors())remember(actor);
    expire();game.socket!.on("module."+M,(wire:Request|Reply)=>{
      if(wire?.medicalType==="request"&&game.user?.id===primaryGM()?.id)void resolveMedical(wire).then(()=>game.socket!.emit("module."+M,{medicalType:"reply",id:wire.id,user:wire.user,gm:game.user!.id}),error=>game.socket!.emit("module."+M,{medicalType:"reply",id:wire.id,user:wire.user,gm:game.user!.id,error:String(error.message??error)}));
      if(wire?.medicalType==="reply")requests.reply(wire,undefined);
    });
  });
}
