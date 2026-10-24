import {consumeHazardAttack} from "../hazard-attacks.js";
import {nativeItemMatches, findNativeItem} from "../native-lookup.js";
import {attackTitle,attackHeading} from "../attack-title.js";
import {inlineRoll} from "../inline-roll.js";
import { primaryGM as gm, escapeHTML as esc } from "../shared.js";
import { PendingCardRefresh } from "../pending-card-refresh.js";
import {tokenEncounter,encounterRef,resolveEncounter,type EncounterRef} from "../encounter.js";
import {suppressionExpiry} from "../suppression.js";
import {attackCrossesSmoke} from "./smoke-obscuration.js";
import {halfArmorSelected, interactArmorSelected} from "../half-armor.js";
import {automaticNPCEvasion} from "../evasion-settings.js";
import {evasionBlocked} from "../injury-rules.js";
import {ammoProfile,instantId} from "../instant-catalog.js";
import {inherentDamageStatuses,renderDamageStatusPicker} from "../damage-status.js";
import {newInstant,instantContent,instantDone,handleInstant,bindInstantControls,arrangeAreaEffectControls,type InstantState,type InstantRequest} from "../instant-effects.js";
import {createSmoke,registerSmoke} from "./smoke.js";
import {clearGrenadeMarkers} from "./marker-cleanup.js";
import {empDisabled} from "../emp-state.js";
import {masterStatuses} from "../status-catalog.js";
import {moveEvader,registerAreaMovement} from "./movement.js";
import { MODULE, areaSettings, registerAreaSettings, type AreaSettings } from "./settings.js";
import { isMolotov, areaKind, confirmAreaRoll, type AreaKind, type AreaWeapon } from "./weapon.js";
import { polygon, evadeAllowed, winsAreaDefense, type Area, type Point } from "./geometry.js";
import { placeArea, clippedPoints, templateData, areaCoverage, areaCells } from "./placement.js";
import { requireCombatSocket } from "../socket-health.js";
import {GMRequests} from "../gm-request.js";
import { smokeAttackDialog, diceJSON, showSavedDice, messageDiceAudience, nativeCard, rollHidden, spendBonusLuck, type RollItem, type DiceAudience } from "../native-combat.js";
import { thrownRollItem, improvisedSource } from "../thrown-weapons.js";
import { getTable } from "../dv-hover.js";
import { parseDV } from "../dv-data.js";
import { bindCardAction, resolutionSection, rollOutcomeClass, canRenderCombatCard } from "../card-structure.js";
import { rollDamage, damageContent, handleDamage, damageEffectsLocked, applyFromCard, type DamageState, type DamageRequest } from "../damage-flow.js";
import type { Exchange } from "../combat-resolution.js";
import { grappleWeaponBlocked } from "../grapple/state.js";
import { checkedLuck } from "../evasion-rules.js";

interface TargetRow {
  instant?:InstantState; uuid:string; actor:string; name:string; img:string; eligible:boolean;
  state:"waiting"|"rolling"|"hit"|"miss"|"other"; total?:number; html?:string;
  claim?:{nonce:string;user:string;expires:number}; coverProneId?:string; damage?:DamageState; moved?:boolean; coverUp?:boolean; moveCost?:number;
  responseReceipt?:{nonce:string;user:string};
}
export interface AreaAttack {
  effectsLocked?:boolean; ammoType?:string; smokeId?:string; scene:string; kind:AreaKind; area:Area; intended:Point; settings:AreaSettings; templateId?:string; aimTemplateId?:string;
  phase:"scatter"|"responses"; exchange:Exchange; rows:TargetRow[]; special:boolean; areaHidden?:boolean; resolutionComplete?:boolean; effectsResolved?:boolean; attackDiceRevealed?:boolean;
}
interface Request {
  aoeType:"request"; id:string; user:string; message:string; action:string; target?:string;
  instantRequest?:InstantRequest; nonce?:string; total?:number; html?:string; area?:Area; damageRequest?:DamageRequest; hidden?:boolean; point?:Point;
}
interface Reply {aoeType:"reply";id:string;user:string;gm:string;error?:string}
const flag=(message:ChatMessage)=>foundry.utils.getProperty(message,`flags.${MODULE}.aoe`) as AreaAttack|undefined;
const owns=(actor:Actor,user:User=game.user!)=>user.isGM||actor.testUserPermission(user,"OWNER");

const errors=(e:unknown)=>{console.error(MODULE,e);ui.notifications!.error((e as Error).message);};
async function actorAt(uuid:string) {const doc=await fromUuid(uuid) as TokenDocument|null;if(!doc?.actor)throw Error("Токен атаки по площади недоступен.");return doc.actor;}
export function pixelsPerUnit() {
  const size=Number(canvas.scene?.grid.size), distance=Number(canvas.scene?.grid.distance);
  if(!(size>0&&distance>0))throw Error("Перед атаками по площади задайте корректный масштаб сетки сцены.");
  const units=String(canvas.scene?.grid.units??"").trim().toLowerCase();
  const factor=["ft","feet","foot"].includes(units)?0.3048:1;
  return size/(distance*factor);
}
export function makeArea(kind:AreaKind, source:Token, point:Point, s:AreaSettings):Area {
  const scale=pixelsPerUnit(),direction=Math.atan2(point.y-source.center.y,point.x-source.center.x);
  const shape=kind==="shell"?s.shellShape:kind==="explosive"?s.blastShape:s.suppressionShape;
  if(kind==="explosive")return {shape:s.blastShape,origin:canvas.grid!.getCenterPoint(point),direction:0,length:(s.blastShape==="circle"?s.blastRadius:s.blastSize)*scale,width:s.blastSize*scale};
  if(shape==="raw")return {shape:"circle",origin:source.center,direction:0,length:s.suppressionRange*scale,width:0};
  const size=(kind==="shell"?s.shellSize:s.suppressionSize)*scale;
  let origin:Point=source.center;
  if(kind==="shell") {
    const offset=Math.max(source.w,source.h)/2;
    origin={x:origin.x+Math.cos(direction)*offset,y:origin.y+Math.sin(direction)*offset};
  }
  if(shape==="square")return {shape:"square",origin:{x:origin.x+Math.cos(direction)*size/2,y:origin.y+Math.sin(direction)*size/2},
    wallOrigin:origin,direction,length:size,width:size};
  let length=(kind==="shell"?s.shellRange:s.suppressionRange)*scale;
  if(kind==="suppression"&&shape!=="cone")length=s.corridorMax>0?s.corridorMax*scale:Math.hypot(canvas.dimensions!.width,canvas.dimensions!.height);
  return {shape:shape==="cone"?"cone":"ray",origin,direction,length,
    width:(kind==="shell"?s.shellWidth:s.suppressionWidth)*Number(canvas.scene!.grid.size),
    angle:kind==="shell"?s.shellAngle:s.suppressionAngle};
}
function targets(data:AreaAttack):TargetRow[] {
  if(canvas.scene?.id!==data.scene)throw Error("Откройте исходную сцену, чтобы собрать цели в области.");
  if(data.ammoType==="smoke")return [];
  const covered=areaCoverage(data.area);
  return (canvas.tokens?.placeables??[]).filter(t=>t.actor && !["container","blackIce","demon"].includes(String(t.actor.type))
    && (data.kind==="explosive"||t.document.uuid!==data.exchange.attacker)
    && covered({x:t.x,y:t.y,width:t.w,height:t.h})
    ).map(t=>({
      ...(instantId(data.ammoType)&&data.ammoType!=="incendiary"?{instant:newInstant(data.ammoType,t.actor!.uuid,t.name??"",rowEncounter(data,t.document.uuid))} : {}),
      uuid:t.document.uuid,actor:t.actor!.uuid,name:t.name??"",img:t.document.texture.src??"",
      eligible:!evasionBlocked(t.actor!)&&evadeAllowed(Number(foundry.utils.getProperty(t.actor!,"system.stats.ref.value")),data.settings.evade),
      state:data.kind==="shell" && data.exchange.total<=13?"miss":"waiting",
    }));
}
function rowEncounter(data:AreaAttack,_uuid:string):EncounterRef {return encounterRef(resolveEncounter(data.exchange),data.scene,[data.exchange.attacker]);}
const btn=(action:string,icon:string,title:string,target="",label="")=>`<button type="button" data-aoe-action="${action}" data-aoe-target="${esc(target)}" title="${esc(title)}" aria-label="${esc(title)}"><i class="fas ${icon}" aria-hidden="true"></i>${label?" "+esc(label):""}</button>`;
const awaitingResponses=(data:AreaAttack)=>data.phase==="scatter"||data.rows.some(r=>["waiting","rolling"].includes(r.state));
function canResetResponse(data:AreaAttack,row:TargetRow):boolean {
  return row.state!=="waiting" && !row.damage && !row.moved && !data.effectsResolved
    && (!row.instant || ["pending","failed","resisted","skipped"].includes(row.instant.state) && row.instant.damage===undefined);
}
export function areaContent(data:AreaAttack):string {
  const waiting=awaitingResponses(data),profile=ammoProfile(data.ammoType);
  let attackHTML="";
  if(!waiting){
    const native=new DOMParser().parseFromString(data.exchange.html,"text/html");
    native.querySelectorAll('[data-action="rollDamage"]').forEach(button=>button.remove());
    attackHTML=native.body.innerHTML;
  }
  const attack=waiting?"<p>Атака брошена — ждём ответа целей.</p>":`<div class="pneuma-aoe-attack">${attackHTML}</div>`;
  const rows=data.rows.map(r=>`<div role="listitem" class="pneuma-aoe-target" data-aoe-row="${esc(r.uuid)}" data-state="${r.state}" style="--pneuma-ammo-color:${profile?.color??"#d44a40"}">
    <img src="${esc(r.img)}" alt="" width="24" height="24"><span class="pneuma-aoe-name">${esc(r.name)}</span><div class="pneuma-aoe-response">
    ${inlineRoll(r.total,r.html?`<div class="pneuma-aoe-defense ${rollOutcomeClass(r.state==="miss")}">${r.html}</div>`:undefined,data.kind==="suppression"?"Концентрация":"Уклонение")}
    ${r.state==="waiting" ? (data.kind==="suppression"?btn("roll","fa-brain","Концентрация",r.uuid):btn("roll","fa-person-running","Уклониться",r.uuid))
      +(data.settings.coverUp&&data.kind!=="suppression"?btn("other","fa-shield","Укрыться вместо уклонения: без броска; лёжа, двойные SP и износ брони",r.uuid):"")+(data.kind==="suppression"?"":btn("decline","fa-xmark","Не уклоняться",r.uuid))
      : esc(r.state==="hit"?(data.kind==="suppression"||r.coverUp?"":"Попадание"):r.state==="miss"?"Увернулся":r.state==="rolling"?"Бросок…":"")}
    ${r.state==="waiting"&&!r.damage?btn("exclude","fa-user-slash","Мастер: исключить цель (укрытие / не пешком)",r.uuid):""}

    ${r.state==="other"?btn("hit","fa-check","Мастер: задет",r.uuid)+btn("miss","fa-xmark","Мастер: не задет",r.uuid):""}
    ${r.state==="rolling"||r.responseReceipt?btn("retryResponse","fa-rotate-right","Повторить сохранённый ответ",r.uuid):""}
    ${r.state!=="waiting"?btn("reset","fa-rotate-left","Сбросить действие игрока",r.uuid):""}
    ${r.state==="miss"&&data.kind!=="suppression"&&r.total!==undefined&&!r.moved?btn("move","fa-person-walking","Выйти из зоны поражения",r.uuid):""}

    ${r.moved&&r.moveCost?`<span>Перемещение: ${r.moveCost.toFixed(1)} м</span>`:""}</div>
    ${r.state==="hit"&&(r.coverUp||data.kind==="suppression")||r.state==="other"?`<span class="pneuma-aoe-response-description">${r.state==="other"?"Укрытие — решает Мастер":data.kind==="suppression"?"Подавлен: двигайтесь в укрытие, при необходимости бегом":"Укрытие · лёжа · SP ×2 / износ ×2"}</span>`:""}</div>

    `).join("");
  const applications=data.rows.filter(r=>r.state==="hit" && (data.exchange.damage?.result || r.damage?.applications?.length || r.instant || data.ammoType==="incendiary")).map(r=>`<div class="pneuma-aoe-resolution-target" data-aoe-row="${esc(r.uuid)}" data-aoe-actor="${esc(r.actor)}">
    <img src="${esc(r.img)}" alt="" width="24" height="24"><span class="pneuma-aoe-name" title="${esc(r.name)}">${esc(r.name)}</span><div class="pneuma-aoe-target-damage">
    ${data.exchange.damage?.result && !(r.damage?.recordedApplied&&r.damage.applications?.length) ? btn("apply","fa-bolt",r.damage?.recordedApplied?"Урон нанесён":"Нанести урон (Shift — параметры)",r.uuid,r.damage?.recordedApplied?"Нанесено":"Нанести урон"):""}
    ${r.damage&&["review","applying"].includes(r.damage.status)?btn("damageResolved","fa-check-double","Мастер: отметить решённым после проверки урона",r.uuid):""}
    <div class="pneuma-damage-applications">${(r.damage?.applications??[]).join("")}</div></div><div class="pneuma-aoe-target-effects">
    ${r.instant?instantContent(r.instant,r.uuid,true):data.ammoType==="incendiary"?instantContent({...newInstant("incendiary",r.actor,r.name),state:"pending"},r.uuid,true):""}</div><div class="pneuma-aoe-target-gm"></div></div>`).join("");
  return `<section class="rollcard pneuma-aoe-card" data-state="${data.phase==="scatter"?"scatter":waiting?"waiting":"resolved"}"><div class="rollcard-top"><div class="cpr-block">${attackHeading(data.exchange.title)}</div></div>
    ${resolutionSection("attack",attack)}
    ${resolutionSection("result",data.phase==="scatter"?"<div class='pneuma-aoe-reposition'><strong>Промах</strong><p>Мастер: выберите новый центр внутри серой области.</p></div>"+btn("scatter","fa-crosshairs","Указать новый центр","","Указать новый центр"): `<div role="list" class="pneuma-aoe-targets">${rows||"<p>В области нет токенов.</p>"}</div>`)}
    <div class="pneuma-aoe-actions">${btn("show",data.areaHidden?"fa-eye":"fa-eye-slash",data.areaHidden?"Показать область атаки":"Скрыть область атаки")}${data.phase==="responses"?btn("add","fa-user-plus","Мастер: добавить выбранный токен (ручная правка охвата)"):""}
    ${data.kind!=="suppression"&&data.phase!=="scatter"&&!data.special&&!data.exchange.damage?btn("damage","fa-droplet","Бросить общий урон (щелчок — сразу; Shift+щелчок — с параметрами)"):""}
    ${data.exchange.damage?.status==="rolling"?btn("damageReset","fa-unlock","Мастер: снять блокировку незавершённого броска урона"):""}</div>

    ${data.kind==="explosive"?"<p>Укрытия и местность учитывает Мастер.</p>":""}
    ${data.exchange.damage?damageContent(data.exchange,"roll"):""}
    ${applications?resolutionSection(data.exchange.damage?.result?"damage-apply":"effects",`<div class="pneuma-aoe-applications">${applications}</div>`):""}
    ${data.special&&!profile || data.ammoType==="smoke" ? resolutionSection("effects", ""
      +(data.special&&!profile&&!data.effectsResolved?btn("effectsResolved","fa-check-double","Мастер: отметить ручные эффекты решёнными"):"")
      +(data.special&&!profile?"<p>Особые боеприпасы: их эффекты применяйте вручную. Особые эффекты гранат пока не автоматизированы.</p>":"")
      +(data.ammoType==="smoke"?"<p>Дым: 1 минута.</p>"+(data.smokeId?btn("removeSmoke","fa-cloud","Мастер: убрать дым"):""):"")) : ""}</section>`;
}
function rowExchange(data:AreaAttack,row:TargetRow):Exchange {
  return {...data.exchange,areaTarget:true,coverUp:!!row.coverUp,defender:row.uuid,defenderActor:row.actor,defenderName:row.name,hit:row.state==="hit",
    damage:row.damage??(data.exchange.damage?.result?{...data.exchange.damage,status:"rolled",applications:[],recordedApplied:false}:undefined)};
}
export function areaEffectsLocked(data:AreaAttack):boolean {
  return !!data.effectsLocked || damageEffectsLocked(data.exchange.damage) || data.rows.some(r=>damageEffectsLocked(r.damage) || !!r.instant && (r.instant.total!==undefined || ["rolling","applying","applied","resisted","skipped","review"].includes(r.instant.state)));
}
function complete(data:AreaAttack):boolean {
  if(data.phase!=="responses"||data.rows.some(r=>["waiting","rolling","other"].includes(r.state)))return false;
  if(data.exchange.damage?.status==="rolling")return false;
  return data.rows.every(r=>r.state==="miss"
    ? data.kind==="suppression"||r.total===undefined||!!r.moved
    : data.kind==="suppression"||(data.ammoType==="smoke"?!!data.smokeId:r.instant?(instantDone(r.instant)&& (data.ammoType!=="incendiary"||!!r.damage?.recordedApplied)):data.special?!!data.effectsResolved:r.damage?.status==="applied"&&!!r.damage.recordedApplied));
}
async function save(message:ChatMessage,data:AreaAttack) {
  if(data.ammoType==="smoke"&&data.phase==="responses"&&!data.smokeId) {
    const scene=game.scenes!.get(data.scene) as Scene|undefined;if(!scene)throw Error("Сцена с дымом недоступна.");
    data.smokeId=await createSmoke(scene,data.area,message.id!,resolveEncounter(data.exchange)??null);
  }
  const reveal=data.attackDiceRevealed===false&&!awaitingResponses(data);
  if(reveal)data.attackDiceRevealed=true;
  const resolved=complete(data);
  if(resolved&&!data.resolutionComplete){data.areaHidden=true;await syncTemplate(message,data);}
  data.resolutionComplete=resolved;
  await message.update({content:areaContent(data),[`flags.${MODULE}.aoe`]:data,...(!data.exchange.damage&&flag(message)?.exchange.damage?{[`flags.${MODULE}.aoe.exchange.-=damage`]:null}:{})} as Parameters<ChatMessage["update"]>[0]);
  // Persist first: later saves and chat rerenders must never repeat the animation.
  if(reveal)void revealAttackDice(data,message).catch(error=>console.warn(MODULE,"Area attack dice display failed",error));
}
async function revealAttackDice(data:AreaAttack,message:ChatMessage):Promise<void> {
  await showSavedDice(data.exchange.dice,data.exchange.rollMode,data.exchange.roller,messageDiceAudience(message));
  await message.update({[`flags.${MODULE}.rollsRevealed`]:true} as Parameters<typeof message.update>[0]);
}
const requests=new GMRequests();
let queue:Promise<unknown>=Promise.resolve();
export async function handleAreaRequest(req:Request) {
  if(game.user?.id!==gm()?.id)throw Error("Нужен активный Мастер.");
  const message=game.messages!.get(req.message) as ChatMessage|undefined, user=game.users!.get(req.user) as User|undefined;
  const saved=message&&flag(message);
  if(!message||!saved||!user)throw Error("Атака по площади недоступна.");
  const data=foundry.utils.deepClone(saved);
  resolveEncounter(data.exchange);

  const row=data.rows.find(r=>r.uuid===req.target);
  if(req.action==="instant") {
    if(!row?.instant||row.state!=="hit"||!req.instantRequest||data.phase!=="responses")throw Error("Мгновенный эффект недоступен.");
    row.instant.encounter=rowEncounter(data,row.uuid);
    row.instant.sourceMessage=message.id!;
    await handleInstant(row.instant,req.instantRequest,user,()=>{data.effectsLocked=true;return save(message,data);},data.exchange.rollMode,messageDiceAudience(message));return;
  }
  if(req.action==="removeSmoke") {
    if(!user.isGM||data.ammoType!=="smoke")throw Error("Только для Мастера.");
    const scene=game.scenes!.get(data.scene) as Scene|undefined;
    const template=data.smokeId?scene?.templates.get(data.smokeId):undefined;
    if(!template)throw Error("Дым рассеялся или был удалён.");
    if(typeof req.hidden!=="boolean")throw Error("Укажите, убрать или вернуть дым.");
    await template.update({hidden:req.hidden});return;
  }
  if(req.action==="show") {
    if(!user.isGM)throw Error("Показывать и скрывать область атаки может только Мастер.");
    if(typeof req.hidden!=="boolean")throw Error("Укажите, показать или скрыть область.");
    data.areaHidden=req.hidden;
    // A deliberate reveal of a completed card must survive later saves.
    data.resolutionComplete=complete(data);
    await syncTemplate(message,data);await save(message,data);return;
  }
  if(req.action==="effectsResolved") {
    if(!user.isGM||!data.special||data.phase!=="responses"||data.rows.some(r=>["waiting","rolling","other"].includes(r.state)))throw Error("Мастер: сначала разберите все ответы.");
    data.effectsResolved=true;await save(message,data);return;
  }
  if(req.action==="add") {
    if(!user.isGM||!req.target||data.phase==="scatter")throw Error("Только для Мастера.");
    const token=await fromUuid(req.target) as TokenDocument|null;
    if(!token?.actor||token.parent?.id!==data.scene)throw Error("Выберите токен на сцене атаки.");
    if(row)return;
    data.effectsResolved=false;
    data.rows.push({...(instantId(data.ammoType)&&data.ammoType!=="incendiary"?{instant:newInstant(data.ammoType,token.actor.uuid,token.name??"",rowEncounter(data,token.uuid))} : {}),uuid:token.uuid,actor:token.actor.uuid,name:token.name??"",img:token.texture.src??"",eligible:!evasionBlocked(token.actor)&&evadeAllowed(Number(foundry.utils.getProperty(token.actor,"system.stats.ref.value")),data.settings.evade),state:"waiting"});
    await save(message,data);return;
  }
  if(req.action==="scatter"){
    if(!user.isGM||data.phase!=="scatter"||!req.area||canvas.scene?.id!==data.scene)throw Error("Переставить промахнувшийся взрыв на исходной сцене может только Мастер.");
    const p=req.area.origin, half=data.settings.blastSize*pixelsPerUnit()/2;
    if(Math.abs(p.x-data.intended.x)>half||Math.abs(p.y-data.intended.y)>half)throw Error("Точка падения должна быть внутри исходного квадрата взрыва.");
    data.area={...data.area,origin:p,wallOrigin:p};data.phase="responses";data.rows=targets(data);await syncTemplate(message,data);await save(message,data);return;
  }
  if(req.action==="damage"){
    if(!req.damageRequest||data.kind==="suppression"||data.special||data.phase==="scatter")throw Error("Урон недоступен.");
    if(req.target) {
      if(!row||row.state!=="hit"||!["damageApply","damageResolved"].includes(req.damageRequest.action))throw Error("Выберите задетую цель.");
      if(req.damageRequest.targetUuid && req.damageRequest.targetUuid!==row.uuid)throw Error("Цель урона изменилась.");
      const exchange=rowExchange(data,row);
      await handleDamage(req.damageRequest,user,exchange,async()=>{row.damage=exchange.damage;if(damageEffectsLocked(row.damage))data.effectsLocked=true;
        if(data.ammoType==="incendiary"&&row.damage?.recordedApplied&&!row.instant) {
          row.instant=newInstant("incendiary",row.actor,row.name,rowEncounter(data,row.uuid));
          if(!row.damage.penetrated){row.instant.state="skipped";row.instant.summary="Урон не пробил броню";}
        }
        await save(message,data);},message);
    } else {
      if(!["damageClaim","damageRelease","damageCommit","damageReset","damageStatuses"].includes(req.damageRequest.action))throw Error("Недопустимое действие с общим уроном.");
      if(req.damageRequest.action==="damageStatuses"&&areaEffectsLocked(data))throw Error("Выбор эффектов заблокирован: обработка целей уже началась.");
      await handleDamage(req.damageRequest,user,data.exchange,()=>save(message,data),message);
    }
    return;
  }
  if(!row||data.phase!=="responses"||!owns(await actorAt(row.uuid),user))throw Error("Ответить может только владелец цели или Мастер.");
  if(data.kind!=="suppression"&&["claim","commit","move"].includes(req.action)){
    const blocked=evasionBlocked(await actorAt(row.uuid));if(blocked)throw Error(blocked);
    row.eligible=evadeAllowed(Number(foundry.utils.getProperty(await actorAt(row.uuid),"system.stats.ref.value")),data.settings.evade);
  }
  if(req.action==="move") {
    if(row.state!=="miss"||row.total===undefined||data.kind==="suppression")throw Error("Цель не уклонялась.");
    if(row.moved)return;
    if(canvas.scene?.id!==data.scene||!req.point||![req.point.x,req.point.y].every(Number.isFinite))throw Error("Откройте сцену атаки и выберите точку назначения.");
    const token=canvas.tokens!.placeables.find(t=>t.document.uuid===row.uuid);if(!token)throw Error("Цель недоступна.");
    const point=canvas.grid!.getCenterPoint(req.point);
    if(areaCoverage(data.area)({x:point.x-token.w/2,y:point.y-token.h/2,width:token.w,height:token.h}))throw Error("Выйдите из зоны поражения полностью.");
    if(token.checkCollision(point,{origin:token.center,type:"move",mode:"any"}))throw Error("Путь пересекает непроходимую стену.");
    row.moveCost=await moveEvader(token,point,!!data.settings.evadeMove,!!data.settings.evadeBorrow,message.id!+":"+row.uuid,rowEncounter(data,row.uuid));
    row.moved=true;await save(message,data);return;
  }
  if(req.action==="forcehit"){if(!user.isGM||row.state!=="miss"||row.damage||row.instant&&row.instant.state!=="pending")throw Error("Только для Мастера.");row.state="hit";data.effectsResolved=false;
  } else if(req.action==="exclude") { if(!user.isGM||!["waiting","hit"].includes(row.state)||row.damage||row.instant&&!["pending","failed"].includes(row.instant.state))throw Error("Только для Мастера; урон или эффект уже применяются.");row.state="miss";
  } else if(req.action==="reset"){
    if(!user.isGM)throw Error("Только для Мастера.");
    if(!canResetResponse(data,row))throw Error("Сбросить нельзя: уже начались перемещение, урон или применение эффекта.");
    if(row.coverProneId) {
      const actor=await actorAt(row.uuid);
      const effect=Array.from(actor.effects).find(e=>e.id===row.coverProneId && foundry.utils.getProperty(e,`flags.${MODULE}.coverSource`)===message.id+":"+row.uuid);
      if(effect)await actor.deleteEmbeddedDocuments("ActiveEffect",[effect.id!]);
    }
    row.state="waiting";
    delete row.claim;delete row.responseReceipt;delete row.total;delete row.html;delete row.coverUp;delete row.coverProneId;delete row.moveCost;
    if(row.instant)row.instant=newInstant(row.instant.id,row.actor,row.name,rowEncounter(data,row.uuid));
    data.effectsResolved=false;
    if(data.resolutionComplete){data.areaHidden=false;await syncTemplate(message,data);}
  } else if(["hit","miss"].includes(req.action)){
    if(!user.isGM||row.state!=="other")throw Error("Нужна проверка Мастера.");row.state=req.action as "hit"|"miss";
  } else if(req.action==="claim") {
    if(row.state==="rolling"&&row.claim&&row.claim.expires<Date.now()){row.state="waiting";delete row.claim;}
    if(row.state!=="waiting"||!req.nonce||data.kind!=="suppression"&&!row.eligible)throw Error("Этот ответ недоступен.");
    row.state="rolling";row.claim={nonce:req.nonce,user:user.id!,expires:Date.now()+120000};
  } else if(req.action==="release"||req.action==="commit") {
    if(req.action==="commit"&&row.responseReceipt?.nonce===req.nonce&&row.responseReceipt?.user===user.id){
      if(row.total!==req.total||row.html!==req.html)throw Error("Бронь ответа истекла.");
      return;
    }
    if(row.claim?.nonce!==req.nonce||row.claim?.user!==user.id)throw Error("Бронь ответа истекла.");
    if(req.action==="release"){row.state="waiting";delete row.claim;}
    else {
      if(!Number.isFinite(req.total)||typeof req.html!=="string")throw Error("Некорректный бросок защиты.");
      row.total=req.total;row.html=req.html;
      row.responseReceipt={nonce:req.nonce!,user:user.id!};
      row.state=winsAreaDefense(req.total!,data.exchange.total,data.kind==="suppression"?true:data.kind==="shell"?true:false)?"miss":"hit";
      delete row.claim;
    }
  } else if(req.action==="other"||req.action==="decline") {
    if(row.state!=="waiting"||req.action==="other"&&(data.kind==="suppression"||!data.settings.coverUp||!areaSettings().coverUp)||req.action==="decline"&&data.kind==="suppression")throw Error("Этот ответ недоступен.");
    if(req.action==="other") {
      const actor=await actorAt(row.uuid),prone=masterStatuses.find(s=>s.name==="Prone")!;
      if(!Array.from(actor.effects).some(e=>!e.disabled&&e.statuses.has(prone.id))) {
        const created=await actor.createEmbeddedDocuments("ActiveEffect",[{name:prone.name,img:prone.img,statuses:[prone.id],changes:[],flags:{[String(MODULE)]:{coverSource:message.id+":"+row.uuid}}}]);
        row.coverProneId=created?.[0]?.id??undefined;
      }
      row.coverUp=true;
    }
    row.state="hit";
  }
  else throw Error("Неизвестный ответ на атаку по площади.");
  if(data.kind==="suppression") {
    const actor=await actorAt(row.uuid),definition=masterStatuses.find(s=>s.name==="Suppressed")!;
    const source=message.id+":"+row.uuid;
    const own=Array.from(actor.effects).filter(e=>foundry.utils.getProperty(e,`flags.${MODULE}.suppressionSource`)===source);
    if(row.state==="hit"&&!own.some(e=>!e.disabled))
      await actor.createEmbeddedDocuments("ActiveEffect",[{name:definition.name,img:definition.img,statuses:[definition.id],changes:[],flags:{[String(MODULE)]:{suppressionSource:source,suppressionExpiry:suppressionExpiry(resolveEncounter(data.exchange),row.uuid)}}}]);
    else if(row.state!=="hit"&&own.length)await actor.deleteEmbeddedDocuments("ActiveEffect",own.map(e=>e.id!));
  }
  await save(message,data);
}
function send(message:string,action:string,extra:Partial<Request>={}) {
  requireCombatSocket();const authority=gm();if(!authority)throw Error("Для атак по площади должен быть подключён активный Мастер.");
  const req:Request={...extra,aoeType:"request",id:foundry.utils.randomID(),user:game.user!.id,message,action};
  if(authority.id===game.user!.id){const next=queue.catch(()=>{}).then(()=>handleAreaRequest(req));queue=next;return next;}
  return requests.request(req.id,()=>game.socket!.emit(`module.${MODULE}`,req),30000,"Мастер не подтвердил ответ. Проверьте карточку, прежде чем повторять.");
}
const starting=new Set<string>();
export async function startAreaAttack(source:Token,target:Token,itemId:string,mode:string,skipDialog=false) {
  if([source,target].some(token=>["container", "blackIce", "demon"].includes(String(token.actor?.type))))return;
  const actor=source.actor, original=actor?.items.get(itemId) as AreaWeapon|undefined;
  if(!actor||!original||!owns(actor)||starting.has(actor.uuid))return;
  const kind=areaKind(original,mode);if(!kind)return;
  requireCombatSocket();if(!gm())throw Error("Для атак по площади нужен активный Мастер.");
  if(String(original.type)!=="ammo"&&grappleWeaponBlocked(actor,original))throw Error("Персонаж в захвате не может пользоваться двуручным оружием.");
  const molotov=isMolotov(original);
  const ammoType=molotov?"incendiary":String(String(original.type)==="ammo"?foundry.utils.getProperty(original,"system.type")??"":original._getLoadedAmmoProp?.("type")??"");
  const variety=String(original.type)==="ammo"||molotov?"grenade":String(original._getLoadedAmmoProp?.("variety")??(foundry.utils.getProperty(original,"system.weaponType")==="rocketLauncher"?"rocket":"grenade"));
  const profile=kind==="explosive"?ammoProfile(ammoType,variety):undefined;
  if(ammoType==="smart"&&profile&&!actor.items.some(i=>nativeItemMatches(i,"Targeting Scope")&&!!(foundry.utils.getProperty(i,"system.isInstalledInActor")??foundry.utils.getProperty(i,"system.isInstalled"))&&!empDisabled(i)))throw Error("Умным ракетам нужен установленный исправный кибер-прицел (Targeting Scope).");
  starting.add(actor.uuid);
  try {
    const scene=canvas.scene!.id!,s=areaSettings();
    const combat=tokenEncounter(scene,[source.document.uuid]);
    const encounter=encounterRef(combat,scene,[source.document.uuid]);
    const sourcePosition={x:source.x,y:source.y};
    let aimPoint:Point=target.center;
    const canAim=(p:Point)=>!source.checkCollision(canvas.grid!.getCenterPoint(p),{origin:source.center,type:"sight",mode:"any"});
    const area=await placeArea(p=>{aimPoint=p;return makeArea(kind,source,p,ammoType==="smoke"?{...s,blastShape:"square",blastSize:10}:s);},target.center,
      kind==="shell"?"Наведите область дроби перед атакующим.":kind==="suppression"?"Наведите огонь на подавление.":"Укажите центр взрыва в поле зрения.",profile?.color,canAim);
    if(!area||canvas.scene?.id!==scene)return;
    const validate=()=>{if(!canAim(aimPoint))throw Error("Целевая клетка вне поля зрения атакующего.");resolveEncounter(encounter);};
    validate();
    let item:RollItem=original, thrownSource:object|undefined;
    if(String(original.type)==="ammo"||molotov){
      const snapshot=(molotov?original.toObject():await improvisedSource()) as {name:string;system:Record<string,unknown>};
      snapshot.name=original.name??"Граната";snapshot.system={...snapshot.system,damage:molotov?"5d6":"6d6",
        dvTable:"DV Grenade Launcher",installedItems:{list:[original.id]},hasInstalled:true};
      thrownSource=snapshot;item=thrownRollItem(snapshot,actor);
    }
    let roll=item.createRoll(kind==="suppression"?"suppressive":"attack",actor);
    const ammoOK=()=>String(original.type)==="ammo"?Number(foundry.utils.getProperty(original,"system.amount"))>0:molotov||!item.hasAmmo||item.hasAmmo(roll);
    if(!ammoOK())throw Error(kind==="suppression"?"Для огня на подавление нужно 10 патронов в магазине.":"Нет боеприпасов.");
    let dv:number|undefined=kind==="shell"?13:undefined;
    if(kind==="explosive"){
      const distance=canvas.grid!.measurePath([source.center,area.origin],{}).distance * Number(canvas.scene!.grid.size) / Number(canvas.scene!.grid.distance) / pixelsPerUnit();
      if((String(original.type)==="ammo"||molotov)&&distance>25)throw Error("Гранату можно бросить не дальше чем на 25 м.");
      dv=parseDV((await getTable(String(foundry.utils.getProperty(item,"system.dvTable"))))?.getResultsForRoll(distance)[0]?.text);
      if(dv===undefined)throw Error("Для этой дистанции нет таблицы DV стрельбы.");
    }
    if(!await smokeAttackDialog(roll,actor,item,{ctrlKey:false,metaKey:false,type:"pneuma-area",shiftKey:skipDialog},attackCrossesSmoke(source.center,kind==="explosive"?area.origin:target.center)))return;
    if(canvas.scene?.id!==scene||source.x!==sourcePosition.x||source.y!==sourcePosition.y||!owns(actor)||actor.items.get(itemId)!==original||areaKind(original,mode)!==kind||!ammoOK())throw Error("Изменились оружие, сцена, владелец или боеприпасы.");
    if(String(original.type)!=="ammo"&&grappleWeaponBlocked(actor,original))throw Error("Персонаж в захвате не может пользоваться двуручным оружием.");
    checkedLuck(Number(foundry.utils.getProperty(actor,"system.stats.luck.value")),0,roll.luck);
    const currentAmmo=isMolotov(original)?"incendiary":String(String(original.type)==="ammo"?foundry.utils.getProperty(original,"system.type")??"":original._getLoadedAmmoProp?.("type")??"");
    if(currentAmmo!==ammoType)throw Error("Боеприпасы изменились во время прицеливания. Начните атаку заново.");
    const blastFormula=kind==="explosive"?item.createRoll("damage",actor,{damageType:"attack"}).formula:undefined;
    validate();
    await consumeHazardAttack(actor,roll);
    roll=await confirmAreaRoll(item,roll);await spendBonusLuck(actor,roll.luck);
    if(String(original.type)==="ammo")await original.update({"system.amount":Number(foundry.utils.getProperty(original,"system.amount"))-1} as Parameters<Item["update"]>[0]);
    await rollHidden(roll);roll.entityData={actor:actor.id!,token:source.id!,item:itemId,tokens:[]};
    let firstAttackHTML="",firstAttackDice:string[]=[];
    if(profile&&ammoType==="smart"&&dv!==undefined&&roll.resultTotal<=dv&&dv-roll.resultTotal<=4) {
      firstAttackHTML=await nativeCard(roll);firstAttackDice=diceJSON(roll);
      const path="/systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
      const native=await import(path) as {CPRRoll:new(title:string,formula:string)=>import("../native-combat.js").NativeRoll & {additionalMods:unknown[]}};
      const retry=new native.CPRRoll("Умная ракета — второй шанс","1d10");retry.addMod([{value:10,source:"Умные боеприпасы"}]);
      if(await retry.handleRollDialog({type:"pneuma-smart",ctrlKey:skipDialog,metaKey:false},actor,item)) {
        retry.formula="1d10";retry.mods=[{value:10,source:"Умные боеприпасы"}];retry.additionalMods=[];
        checkedLuck(Number(foundry.utils.getProperty(actor,"system.stats.luck.value")),0,retry.luck);
        await spendBonusLuck(actor,retry.luck);await rollHidden(retry);roll=retry;
      } else {firstAttackHTML="";firstAttackDice=[];}
    }
    const title=attackTitle(original,game.settings!.get(MODULE,"hideAttackWeapon") && !actor.hasPlayerOwner,roll.skillName,ammoType)+(kind==="suppression"?" — огонь на подавление":"");
    roll.rollTitle=title;
    const exchange:Exchange={...encounter,attacker:source.document.uuid,attackerName:source.name??"",defender:source.document.uuid,defenderActor:actor.uuid,defenderName:source.name??"",
      ranged:true,category:"Ranged",title,total:roll.resultTotal,html:(firstAttackHTML?"<div class=\"pneuma-smart-first\">"+firstAttackHTML+"</div>":"")+await nativeCard(roll),dice:[...firstAttackDice,...diceJSON(roll)],dv,roller:game.user!.id!,
      state:"resolved",hit:true,weaponId:itemId,attackMode:"attack",weaponType:String(foundry.utils.getProperty(original,"system.weaponType")),
      criticalMethod:kind==="explosive"?(String(original.type)!=="ammo"&&foundry.utils.getProperty(original,"system.weaponType")==="rocketLauncher"?"Rocket":"Grenade"): "Ranged",
      location:"body",...(kind==="shell"?{damageFormula:"3d6"}:{}),rollMode:game.settings!.get("core","rollMode")??"roll",...(thrownSource?{thrownSource}: {})};

    const data:AreaAttack={scene,kind,area,...(profile?{ammoType}:{}),intended:area.origin,settings:s,exchange,rows:[],attackDiceRevealed:false,
      phase:kind==="explosive"&&roll.resultTotal<=dv!?"scatter":"responses",
      special:kind==="explosive"&&(profile?!profile.damaging:!!ammoType&&!["basic","armorPiercing"].includes(ammoType))};
    if(kind==="explosive"){exchange.areaAmmo={type:ammoType,variety};exchange.damageFormula=blastFormula;}
    if(data.phase==="responses")data.rows=targets(data);
    const messageData={content:areaContent(data),speaker:ChatMessage.getSpeaker({actor,token:source.document}),flags:{[MODULE]:{aoe:data}}} as Parameters<typeof ChatMessage.applyRollMode>[0];
    ChatMessage.applyRollMode(messageData,exchange.rollMode as "roll");
    const message = await ChatMessage.create(messageData);
    if (!message) throw Error("Карточка атаки по площади не создана после броска. Проверьте боеприпасы и бросок, прежде чем повторять.");
    return message;
  } finally {starting.delete(actor.uuid);}
}
interface SavedAreaResponse {nonce:string;roll:ReturnType<RollItem["createRoll"]>;mode:string;roller:string;audience:DiceAudience}
const responseRetries=new Map<string,SavedAreaResponse>(),responding=new Set<string>();
function refreshResponseRetry(message:ChatMessage,row:TargetRow,key:string) {
  if(typeof document==="undefined")return;
  for(const card of Array.from(document.querySelectorAll<HTMLElement>('[data-message-id="'+CSS.escape(message.id!)+'"]')))
    for(const button of Array.from(card.querySelectorAll<HTMLButtonElement>('[data-aoe-action="retryResponse"]')))if(button.dataset.aoeTarget===row.uuid) {
      if(responseRetries.has(key))button.disabled=false;
      else button.remove();
    }
}
async function commitAreaResponse(message:ChatMessage,row:TargetRow,key:string,saved:SavedAreaResponse) {
  await send(message.id!,"commit",{target:row.uuid,nonce:saved.nonce,total:saved.roll.resultTotal,html:await nativeCard(saved.roll)});
  responseRetries.delete(key);
  refreshResponseRetry(message,row,key);
  try{await showSavedDice(diceJSON(saved.roll),saved.mode,saved.roller,saved.audience);}
  catch(error){console.warn(MODULE,"Area defense dice display failed; result saved",error);ui.notifications!.warn("Результат защиты сохранён. Анимация кубиков не удалась.");}
}
async function respond(message:ChatMessage,data:AreaAttack,row:TargetRow,automatic=false,skipDialog=false) {
  const key=game.user!.id+":"+message.id+":"+row.uuid;
  if(responding.has(key))return;
  responding.add(key);
  try{await respondArea(message,data,row,key,automatic,skipDialog);}
  finally{responding.delete(key);}
}
async function respondArea(message:ChatMessage,data:AreaAttack,row:TargetRow,key:string,automatic:boolean,skipDialog:boolean) {
  const previous=responseRetries.get(key);
  if(previous){await commitAreaResponse(message,row,key,previous);return;}
  const nonce=foundry.utils.randomID();await send(message.id!,"claim",{target:row.uuid,nonce});
  let committed=false;
  try {
    const actor=await actorAt(row.uuid), name=data.kind==="suppression"?"Concentration":"Evasion";
    const item=findNativeItem(actor.items,name) as RollItem|undefined;
    if(!item)throw Error("Нет навыка «"+(name==="Concentration"?"Концентрация":"Уклонение")+"».");
    let roll=item.createRoll("skill",actor);
    if(data.kind!=="suppression"&&data.settings.evadePenalty)roll.addMod([{value:data.settings.evadePenalty,source:"Домашнее правило уклонения от площади"}]);
    if(automatic){if(!automaticArea(actor,data))throw Error("Автоматическое уклонение от площади работает только по базовым правилам.");roll.luck=0;}
    else if(!await roll.handleRollDialog({ctrlKey:skipDialog,metaKey:false,type:"pneuma-area"},actor,item))return;
    checkedLuck(Number(foundry.utils.getProperty(actor,"system.stats.luck.value")),0,roll.luck);
    if(data.kind!=="suppression"){const blocked=evasionBlocked(actor);if(blocked)throw Error(blocked);}
    roll=await item.confirmRoll(roll);await spendBonusLuck(actor,roll.luck);await rollHidden(roll);
    roll.entityData={actor:actor.id!,token:row.uuid.split(".").at(-1)!,item:item.id!,tokens:[]};
    const saved={nonce,roll,mode:data.exchange.rollMode,roller:game.user!.id!,audience:messageDiceAudience(message)};
    responseRetries.set(key,saved);
    refreshResponseRetry(message,row,key);
    await commitAreaResponse(message,row,key,saved);committed=true;
  } finally {if(!committed&&!responseRetries.has(key))await send(message.id!,"release",{target:row.uuid,nonce});}
}
async function moveOutside(message:ChatMessage,data:AreaAttack,row:TargetRow) {
  if(canvas.scene?.id!==data.scene)throw Error("Сначала откройте сцену атаки.");
  const token=canvas.tokens!.placeables.find(t=>t.document.uuid===row.uuid);if(!token||!owns(token.actor!))return;
  const chosen=await placeArea(p=>({shape:"square",origin:canvas.grid!.getCenterPoint(p),direction:0,length:token.w,width:token.h}),token.center,"Выберите точку вне взрыва.");
  if(!chosen)return;
  const box={x:chosen.origin.x-token.w/2,y:chosen.origin.y-token.h/2,width:token.w,height:token.h};
  if(areaCoverage(data.area)(box))throw Error("Токен должен целиком оказаться вне взрыва.");
  if(token.checkCollision(chosen.origin,{origin:token.center,type:"move",mode:"any"}))throw Error("Путь пересекает непроходимую стену.");
  await send(message.id!,"move",{target:row.uuid,point:chosen.origin});
}

async function syncTemplate(message:ChatMessage,data:AreaAttack) {
  const scene=game.scenes!.get(data.scene) as Scene|undefined;if(!scene)return;
  const values={...templateData(data.area,scene),fillColor:data.phase==="scatter"?"#737980":ammoProfile(data.ammoType)?.color??"#d44a40",borderColor:data.phase==="scatter"?"#737980":ammoProfile(data.ammoType)?.color??"#ffffff",hidden:!!data.areaHidden,user:message.author?.id??game.user!.id,
    flags:{[MODULE]:{areaMessage:message.id,areaShape:data.area,...(data.kind==="explosive"?{grenadeCombat:data.exchange.combatId??null}:{})}}};
  if(data.kind==="explosive") {
    const size=Number(scene.grid.size);
    const aim:Area={shape:"square",origin:data.intended,direction:0,length:size,width:size};
    const marker={...templateData(aim,scene),fillColor:"#ffbf47",borderColor:"#ffbf47",hidden:!!data.areaHidden,user:values.user,flags:{[MODULE]:{areaMessage:message.id,areaShape:aim,originalAim:true,grenadeCombat:data.exchange.combatId??null}}};
    const existing=data.aimTemplateId?scene.templates.get(data.aimTemplateId):undefined;
    if(existing)await existing.update(marker as never);
    else {const created=await scene.createEmbeddedDocuments("MeasuredTemplate",[marker as never]);data.aimTemplateId=created?.[0]?.id??undefined;}
  }
  const old=data.templateId?scene.templates.get(data.templateId):undefined;
  if(old)await old.update(values as Parameters<MeasuredTemplateDocument["update"]>[0]);
  else {
    const created=await scene.createEmbeddedDocuments("MeasuredTemplate",[values as never]);
    data.templateId=created?.[0]?.id??undefined;
  }
}

function automaticArea(actor:Actor,data:AreaAttack) {
  const s=data.settings;
  return automaticNPCEvasion(actor)&&data.kind!=="suppression"&&s.evade==="raw"&&!s.evadePenalty&&!s.evadeMove&&!s.evadeBorrow&&!s.coverUp;
}
function syncAreaVisibility(template: MeasuredTemplate): void {
  if (!foundry.utils.getProperty(template.document, `flags.${MODULE}.areaShape`)) return;
  // Native GM visibility may be restored by refreshState after a hidden update.
  template.renderable = !template.document.hidden;
  template.visible = template.renderable && template.isVisible && !template.hasPreview;
  const highlight = canvas.interface?.grid.getHighlightLayer(template.highlightId);
  if (highlight) { highlight.renderable = template.renderable; highlight.visible = template.visible; }
}
const autoRows=new Set<string>();
export async function automateArea(message:ChatMessage) {
  const data=flag(message);if(!data||data.phase!=="responses"||game.user?.id!==gm()?.id||autoRows.has(message.id!))return;
  autoRows.add(message.id!);
  try{
    for(const original of data.rows){
      const current=flag(message);const row=current?.rows.find(r=>r.uuid===original.uuid);
      if(!current||row?.state!=="waiting"||!row.eligible)continue;
      const actor=await actorAt(row.uuid);if(!automaticArea(actor,current)||evasionBlocked(actor))continue;
      await respond(message,current,row,true);
    }
  }finally{autoRows.delete(message.id!);}
}
/** Keep old saved dice/control nodes while combining lower recipient rows. */
export function standardizeAreaLayout(root: HTMLElement,data?:AreaAttack): void {
  const card=root.querySelector<HTMLElement>('.pneuma-aoe-card');
  if(!card) return;
  const picker=card.querySelector('.pneuma-aoe-effects-picker');
  const roll=card.querySelector('.pneuma-resolution-damage-roll-body');
  if(picker && roll && !roll.contains(picker))roll.append(picker);
  if(card.querySelector('.pneuma-aoe-resolution-target'))return;
  const targets=Array.from(card.querySelectorAll<HTMLElement>('.pneuma-aoe-targets .pneuma-aoe-target'));
  const lowerRows=new Map<string,HTMLElement>();
  const shell=document.createElement('div');shell.innerHTML=resolutionSection(card.querySelector('.pneuma-damage-result')?'damage-apply':'effects','<div class="pneuma-aoe-applications"></div>');
  const section=shell.firstElementChild!,list=section.querySelector('.pneuma-aoe-applications')!;
  const rowFor=(id:string)=>{
    let row=lowerRows.get(id);if(row)return row;
    const source=targets.find(target=>target.dataset.aoeRow===id);
    row=document.createElement('div');row.className='pneuma-aoe-resolution-target';row.dataset.aoeRow=id;row.dataset.aoeActor=data?.rows.find(r=>r.uuid===id)?.actor??'';
    const image=source?.querySelector('img');if(image)row.append(image.cloneNode(true));
    const name=document.createElement('span');name.className='pneuma-aoe-name';name.textContent=source?.querySelector('.pneuma-aoe-name')?.textContent??'';row.append(name);
    for(const kind of ['damage','effects']){const group=document.createElement('div');group.className='pneuma-aoe-target-'+kind;row.append(group);}
    lowerRows.set(id,row);list.append(row);return row;
  };
  for(const target of targets) {
    const controls=Array.from(target.querySelectorAll<HTMLElement>('[data-aoe-action="apply"], [data-aoe-action="damageResolved"]'));
    if(controls.length)rowFor(target.dataset.aoeRow??'').querySelector('.pneuma-aoe-target-damage')!.append(...controls);
  }
  for(const old of Array.from(card.querySelectorAll<HTMLElement>('.pneuma-aoe-damage-target, .pneuma-aoe-effect-target'))) {
    const row=rowFor(old.dataset.aoeRow??''),damage=old.classList.contains('pneuma-aoe-damage-target');
    const group=row.querySelector(damage?'.pneuma-aoe-target-damage':'.pneuma-aoe-target-effects')!;
    old.querySelector(':scope > strong')?.remove();group.append(...Array.from(old.childNodes));old.remove();
  }
  for(const effect of Array.from(card.querySelectorAll<HTMLElement>('.pneuma-aoe-targets .pneuma-instant-effect'))) {
    const target=effect.closest<HTMLElement>('.pneuma-aoe-target')??effect.previousElementSibling as HTMLElement|null;
    const id=effect.querySelector<HTMLElement>('[data-instant-scope]')?.dataset.instantScope??target?.dataset.aoeRow??'';
    rowFor(id).querySelector('.pneuma-aoe-target-effects')!.append(effect);
  }
  for(const effect of Array.from(list.querySelectorAll<HTMLElement>('.pneuma-instant-effect'))) {effect.classList.add('pneuma-aoe-inline-effect');effect.title=effect.textContent?.trim()??'';}
  const oldApplications=card.querySelector<HTMLElement>(':scope > .pneuma-aoe-applications');
  if(oldApplications){
    let destination:Element=list;
    for(const child of Array.from(oldApplications.children)){
      if(child.matches('.pneuma-damage-applied')){
        const name=child.querySelector('.pneuma-applied-name')?.textContent;
        const target=targets.find(t=>t.querySelector('.pneuma-aoe-name')?.textContent===name);
        destination=target?rowFor(target.dataset.aoeRow??'').querySelector('.pneuma-aoe-target-damage')!:list;
      }
      destination.append(child);
    }
    oldApplications.remove();
  }
  if(list.childNodes.length)card.append(section);
  for(const old of Array.from(card.querySelectorAll<HTMLElement>('.pneuma-resolution-damage-apply, .pneuma-resolution-effects'))) {
    if(old!==section && !old.querySelector('button, .pneuma-instant-effect, .pneuma-damage-applied'))old.remove();
  }
}

export function registerAreaAttacks() {
  Hooks.once('ready',()=>{
    const module=game.modules!.get(MODULE) as unknown as {api?:Record<string,unknown>};
    module.api={...module.api,getAreaEffectCells:(messageId:string)=>{
      const candidate=game.messages?.get(messageId);
      const message=candidate instanceof ChatMessage?candidate:undefined,data=message&&flag(message);
      if(!message?.visible||message.isContentVisible===false||!data||data.scene!==canvas.scene?.id||data.phase!=='responses'||!data.attackDiceRevealed)return [];
      return areaCells(data.area);
    }};
  });
  const finishMarkers=(combat:Combat)=>{
    // Run after any pending creation/update so cleanup cannot leave a late-created marker.
    const next=queue.catch(()=>{}).then(()=>clearGrenadeMarkers(combat));queue=next;void next.catch(errors);
  };
  Hooks.on("updateCombat",(combat:Combat,changes:{round?:number|null})=>{if(changes.round!==undefined&&!combat.started)finishMarkers(combat);});
  Hooks.on("deleteCombat",finishMarkers);
  Hooks.on("updateChatMessage",(message:ChatMessage)=>{void automateArea(message).catch(errors);});
  registerAreaSettings();registerAreaMovement();registerSmoke();
  const pendingCards = new PendingCardRefresh(message => { void ui.chat?.updateMessage(message); }, message => {
    const data = flag(message);
    if (data?.phase !== "responses") return;
    const actors = data.rows.filter(row => ["waiting", "rolling"].includes(row.state)).map(row => row.actor);
    return actors.length ? { actors, combat: data.exchange.combatId } : undefined;
  });
  Hooks.once("ready", () => { for (const message of game.messages ?? []) pendingCards.remember(message); });
  for (const hook of ["createChatMessage", "updateChatMessage"]) Hooks.on(hook, (message: ChatMessage) => pendingCards.remember(message));
  Hooks.on("deleteChatMessage", (message: ChatMessage) => pendingCards.forget(message.id!));
  for(const hook of ["createItem","updateItem","deleteItem","createActiveEffect","updateActiveEffect","deleteActiveEffect"])Hooks.on(hook,(doc:Item|ActiveEffect)=>{
    const parent=doc.parent,actor=parent instanceof Actor?parent:parent?.parent instanceof Actor?parent.parent:undefined;
    if(actor)pendingCards.refresh(actor.uuid);
  });
  Hooks.on("refreshMeasuredTemplate",(template:MeasuredTemplate)=>{
    const area=foundry.utils.getProperty(template.document,`flags.${MODULE}.areaShape`) as Area|undefined;
    if(!area||!template.template)return;
    syncAreaVisibility(template);
    if(!template.visible)return;
    const originalAim=!!foundry.utils.getProperty(template.document,`flags.${MODULE}.originalAim`);
    if(originalAim&&template.ruler)template.ruler.text="Исходная цель";
    const points=(originalAim?polygon(area).flatMap(p=>[p.x,p.y]):clippedPoints(area)).map((n,i)=>n-(i%2?template.document.y:template.document.x));
    template.shape=new PIXI.Polygon(points);
    template.template.clear().lineStyle(2,Number(template.document.borderColor),0.8).beginFill(Number(template.document.fillColor),0).drawPolygon(points).endFill();
    template.highlightGrid();
    syncAreaVisibility(template);
  });
  Hooks.on("updateMeasuredTemplate", (document: MeasuredTemplateDocument) => {
    if (document.object) syncAreaVisibility(document.object);
  });
  Hooks.on("createChatMessage",(message:ChatMessage)=>{
    const data=flag(message);if(!data||game.user?.id!==gm()?.id)return;
    const next=queue.catch(()=>{}).then(async()=>{await syncTemplate(message,data);await save(message,data);});queue=next;void next.then(()=>automateArea(message)).catch(errors);
  });
  Hooks.on("deleteChatMessage",(message:ChatMessage)=>{
    const data=flag(message);if(!data||game.user?.id!==gm()?.id)return;
    const scene=game.scenes!.get(data.scene) as Scene|undefined;
    const ids=[data.templateId,data.aimTemplateId].filter((id):id is string=>!!id&&!!scene?.templates.has(id));
    if(ids.length)void scene!.deleteEmbeddedDocuments("MeasuredTemplate",ids).catch(errors);
  });
  Hooks.once("ready",()=>game.socket!.on(`module.${MODULE}`,(p:Request|Reply)=>{
    if(!p||!["request","reply"].includes(p.aoeType))return;
    if(p.aoeType==="reply"){
      requests.reply(p,undefined);
    } else if(game.user!.id===gm()?.id) {
      const reply=(error?:string)=>game.socket!.emit(`module.${MODULE}`,{aoeType:"reply",id:p.id,user:p.user,gm:game.user!.id,error});
      const next=queue.catch(()=>{}).then(()=>handleAreaRequest(p));queue=next;void next.then(()=>reply(),e=>reply((e as Error).message));
    }
  }));
  Hooks.on("renderChatMessage",async(message:ChatMessage,html:JQuery)=>{
    const data=flag(message);if(!data||!canRenderCombatCard(message))return;
    if(html[0])standardizeAreaLayout(html[0],data);
    const picker=html[0]?.querySelector<HTMLElement>('.pneuma-aoe-effects-picker');
    if(picker && data.exchange.damage?.result) {
      const attacker=await actorAt(data.exchange.attacker).catch(()=>null);
      if(attacker && owns(attacker)) {
        const selected=(data.exchange.damage.statusEffects??inherentDamageStatuses(data.exchange.damage.result.ammoType)).slice(0,3);
        renderDamageStatusPicker(picker,selected,areaEffectsLocked(data),!["rolled","applied"].includes(data.exchange.damage.status),
          statusEffects=>send(message.id!,"damage",{damageRequest:{action:"damageStatuses",statusEffects}}));
      } else picker.replaceChildren();
    }
    if(html[0])arrangeAreaEffectControls(html[0]);
    if(html[0])await bindInstantControls(html[0],scope=>data.rows.find(r=>r.uuid===scope)?.instant,(scope,instantRequest)=>send(message.id!,"instant",{target:scope,instantRequest}),data.exchange.rollMode,messageDiceAudience(message));
    // Shared roll only: controls stay by targets; application results follow the roll.
    html.find<HTMLElement>('.pneuma-aoe-card > .pneuma-damage-result > [data-pneuma-section="damage-apply"], .pneuma-aoe-card > .pneuma-damage-result > .pneuma-resolution-recovery-slot').toArray().forEach(node=>node.remove());
    // Also update previously saved AoE cards without replacing their native dice nodes.
    html.find<HTMLElement>('.pneuma-aoe-attack [data-action="rollDamage"]').toArray().forEach(button=>button.remove());
    for(const button of html.find<HTMLButtonElement>("[data-aoe-action]").toArray()){
      const action=button.dataset.aoeAction!,row=data.rows.find(r=>r.uuid===button.dataset.aoeTarget);
      if(action==="damage"||action==="apply")button.innerHTML='<i class="fas '+(action==="damage"?"fa-droplet":"fa-bolt")+'" aria-hidden="true"></i>'+(action==="apply"?' <span>'+(row?.damage?.recordedApplied?'Нанесено':'Нанести урон')+'</span>':'');
      if(action==="show") {
        if(!game.user!.isGM){button.remove();continue;}
        const label=data.areaHidden?"Показать область атаки":"Скрыть область атаки";
        button.title=label;button.setAttribute("aria-label",label);
        button.innerHTML='<i class="fas '+(data.areaHidden?"fa-eye":"fa-eye-slash")+'" aria-hidden="true"></i>';
      }
      if(action==="removeSmoke") {
        const template=data.smokeId?game.scenes?.get(data.scene)?.templates.get(data.smokeId):undefined;
        const label=!template?"Дым рассеялся":template.hidden?"Вернуть дым":"Убрать дым";
        button.disabled=!template;button.title=label;button.setAttribute("aria-label",label);
        button.innerHTML='<i class="fas fa-cloud" aria-hidden="true"></i> '+label;
      }
      if(action==="other"&&!areaSettings().coverUp){button.remove();continue;}
      const actor=await actorAt(row?.uuid??data.exchange.attacker).catch(()=>null);
      const gmOnly=["removeSmoke","scatter","hit","miss","exclude","forcehit","add","reset","damageReset","damageResolved","effectsResolved"].includes(action);
      if(action!=="show"&&(!actor||!owns(actor)||gmOnly&&!game.user!.isGM)){button.remove();continue;}
      if(action==="retryResponse"&&row&&!responseRetries.has(game.user!.id+":"+message.id+":"+row.uuid)) {
        if(row.state!=="rolling"){button.remove();continue;}
        button.disabled=true;button.title="Доступно по сохранённому результату того, кто бросал, если ответ прервался.";
      }
      if(action==="roll"&&data.kind!=="suppression"&&row){
        const blocked=actor?evasionBlocked(actor):undefined;
        const eligible=actor?evadeAllowed(Number(foundry.utils.getProperty(actor,"system.stats.ref.value")),data.settings.evade):row.eligible;
        if(blocked||!eligible){button.disabled=true;button.title=blocked??"По правилам уклоняться можно при РЕФ 8+.";}
      }
      if(action==="reset"&&row&&!canResetResponse(data,row)) {
        button.disabled=true;button.title="Сбросить нельзя: уже начались перемещение, урон или применение эффекта.";
      }
      if(action==="apply")button.dataset.chatState=row?.damage?.recordedApplied?"applied":"";
      if(action==="apply"&&(row?.damage?.recordedApplied||["review","applying"].includes(row?.damage?.status??"")))button.disabled=true;
      bindCardAction(button,async event=>{
        event.preventDefault();event.stopPropagation();if(button.disabled)return;button.disabled=true;
        try {
          if(action==="show")await send(message.id!,"show",{hidden:!data.areaHidden});
          else if(action==="removeSmoke") {
            const template=data.smokeId?game.scenes?.get(data.scene)?.templates.get(data.smokeId):undefined;
            if(!template)throw Error("Дым рассеялся или был удалён.");
            await send(message.id!,"removeSmoke",{hidden:!template.hidden});
          }
          else if(action==="scatter"){
            if(canvas.scene?.id!==data.scene)throw Error("Сначала откройте сцену атаки.");
            const area=await placeArea(p=>({...data.area,origin:canvas.grid!.getCenterPoint(p),wallOrigin:canvas.grid!.getCenterPoint(p)}),data.intended,"Выберите новый центр внутри серой области.",ammoProfile(data.ammoType)?.color);
            if(area)await send(message.id!,"scatter",{area});
          } else if(action==="add") {const selected=canvas.tokens?.controlled??[];if(selected.length!==1)throw Error("Выберите ровно один токен для добавления.");await send(message.id!,"add",{target:selected[0]!.document.uuid});}
          else if(action==="roll"&&row)await respond(message,data,row,false,event.shiftKey);
          else if(action==="retryResponse"&&row)await respond(message,data,row);
          else if(action==="move"&&row)await moveOutside(message,data,row);
          else if(action==="damage")await rollDamage(message.id!,data.exchange,(a,extra)=>send(message.id!,"damage",{damageRequest:{...extra,action:a}}),event.shiftKey);
          else if(action==="apply"&&row)await applyFromCard(rowExchange(data,row),(a,extra)=>send(message.id!,"damage",{target:row.uuid,damageRequest:{...extra,action:a}}),event.shiftKey,row.uuid,"recorded",halfArmorSelected(event),interactArmorSelected(event));
          else if(action==="damageReset"||action==="damageResolved")await send(message.id!,"damage",{target:row?.uuid,damageRequest:{action}});
          else await send(message.id!,action,{target:row?.uuid});
        }catch(e){errors(e);}finally{button.disabled=false;}
      });
    }
    if(html[0])arrangeAreaEffectControls(html[0]);
  });
}
