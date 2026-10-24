import {findNativeItem} from "../native-lookup.js";
import {withActorMutation} from "../actor-mutation.js";
import { primaryGM as gm, escapeHTML } from "../shared.js";
import {tokenEncounter,encounterRef,resolveEncounter,requireParticipants,type EncounterRef} from "../encounter.js";
import {updateTouchesPath} from "../update-path.js";
import { requireCombatSocket } from "../socket-health.js";
import {GMRequests} from "../gm-request.js";
import { rollOutcomeClass, styleOpposedRolls } from "../card-structure.js";
import { nativeCard, rollHidden, diceJSON, showSavedDice, messageDiceAudience, spendBonusLuck, type RollItem } from "../native-combat.js";
import { masterStatuses } from "../status-catalog.js";
import { chokeDamage, nextChoke, visibleChoke, winsGrab } from "./rules.js";
import { MODULE, grappleActionBlocked, property, grapples, grappleFor, actorGrapples, type Grapple, type Participant, type SkillResult } from "./state.js";

const CHANNEL = `module.${MODULE}`;

const owns = (actor: Actor, user: User) => user.isGM || actor.testUserPermission(user, "OWNER");
const report = (error: unknown) => { console.error(MODULE, error); ui.notifications!.error(String((error as Error).message ?? error)); };
export interface GrappleRequest {
  encounter?:EncounterRef;
  grappleType: "request"; request: string; user: string; scene: string; id: string; revision: number;
  action: string; rollMode?: string; source?: string; target?: string; result?: SkillResult; claim?: string;
}
interface Reply { grappleType: "reply"; request: string; user: string; gm: string; error?: string; claim?: string }
const requests=new GMRequests<string|undefined>();
const claims = new Map<string, { user: string; id: string; expires: number }>();
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(operation); queue = next; return next;
}
function sceneFor(id: string): Scene {
  const scene = game.scenes?.get(id) as Scene | undefined; if (!scene) throw new Error("Сцены захвата больше нет."); return scene;
}
function tokenFor(scene: Scene, uuid: string): TokenDocument {
  const token = scene.tokens.find(t => t.uuid === uuid);
  if (!token?.actor) throw new Error("Токена или актёра захвата больше нет."); return token;
}
function participant(token: TokenDocument): Participant { return { token: token.uuid, actor: token.actor!.uuid, name: token.name! }; }
function inReach(scene: Scene, source: TokenDocument, target: TokenDocument): boolean {
  // Closest occupied grid-cell centres support larger tokens as well as standard 1x1 tokens.
  const size = Number(scene.grid.size), units = Number(scene.grid.distance);
  const dx = Math.max(0, Math.abs(source.x + (source.width ?? 1) * size / 2 - target.x - (target.width ?? 1) * size / 2) - ((source.width ?? 1) + (target.width ?? 1) - 2) * size / 2);
  const dy = Math.max(0, Math.abs(source.y + (source.height ?? 1) * size / 2 - target.y - (target.height ?? 1) * size / 2) - ((source.height ?? 1) + (target.height ?? 1) - 2) * size / 2);
  // RED adjacent squares, including diagonals, are within a 2 m/yd reach.
  return Math.max(dx, dy) / size * units <= 2.01 && Math.abs(source.elevation - target.elevation) <= 2;
}
function validatePair(scene: Scene, source: TokenDocument, target: TokenDocument) {
  if (source.uuid === target.uuid || source.actor!.uuid === target.actor!.uuid) throw new Error("Выберите двух разных персонажей.");
  if (!inReach(scene, source, target)) throw new Error("Схватить можно цель не дальше 2 м.");
}
function checkedResult(result?: SkillResult): SkillResult {
  if (!result || !Number.isFinite(result.total) || typeof result.html !== "string") throw new Error("Нет броска Драки.");
  return result;
}
function grappleExplanation(note: string): string {
  if (!/^Grapple active:/i.test(note)) return "";
  const rules = note.replace(/^Grapple active:\s*/i, "").split(/;\s*|\.\s+/).filter(Boolean);
  return `<section class="pneuma-grapple-explanation"><strong>Захват действует</strong><ul>${rules.map(rule => `<li>${escapeHTML(rule.replace(/\.$/, ""))}</li>`).join("")}</ul></section>`;
}
export function grappleContent(g: Grapple): string {
  const sourceWins = !!g.defense && winsGrab(g.attack.total,g.defense.total);
  const rolls = g.defense && !g.lastAction ? `<div class="pneuma-grapple-rolls"><div class="${rollOutcomeClass(sourceWins)}">${g.attack.html}</div><div class="${rollOutcomeClass(!sourceWins)}">${g.defense.html}</div></div>` : "";
  return `<section class="pneuma-grapple-card" data-state="${g.state}"><div class="rollcard"><div class="rollcard-top"><div class="cpr-block"><strong>${g.lastAction ? {release:"Отпустить",choke:"Удушение",throw:"Бросок"}[g.lastAction] : g.purpose === "break" ? "Разорвать захват" : "Захват"}: ${escapeHTML(g.source.name)} → ${escapeHTML(g.target.name)}</strong></div></div><div class="rollcard-bottom"><p class="pneuma-grapple-note"${grappleExplanation(g.note) ? " hidden" : ""}>${escapeHTML(g.note)}</p>${rolls}<div class="pneuma-grapple-controls"></div></div></div></section>${grappleExplanation(g.note)}`;
}
function findRecord(scene: Scene, id: string): Grapple | undefined {
  return grapples(scene).find(g => g.id === id) ?? property<Grapple>(game.messages?.find(m => {
    const value = property<Partial<Grapple>>(m,"grapple");
    // Creation renders the reference before save() publishes the full record.
    return value?.id === id && value.scene === scene.id && !!value.source?.token && !!value.target?.token && !!value.attack;
  }) ?? {},"grapple");
}
async function save(scene: Scene, g: Grapple) {
  const owner = g.combat ? game.combats?.get(g.combat) as Combat | undefined : scene;
  if (!owner) throw new Error("Исходного боя больше нет.");
  const path = `flags.${MODULE}.grapples.${g.id}`;
  const update: Record<string,unknown> = {[path]:g};
  if (!g.operation) update[path + ".-=operation"] = null;
  if (!g.choke) update[path + ".-=choke"] = null;
  await owner.update(update);
  const message = game.messages?.get(g.message ?? "");
  if (message) {
    try {
      const changes: Record<string,unknown> = {content:grappleContent(g),[`flags.${MODULE}.grapple`]:g};
      if (!g.operation) changes[`flags.${MODULE}.grapple.-=operation`] = null;
      if (!g.choke) changes[`flags.${MODULE}.grapple.-=choke`] = null;
      const history=property<Grapple>(message,"grappleHistory");
      if(history)changes.content=grappleContent(history);
      else if(g.state==="active")changes["flags."+MODULE+".grappleHistory"]={...g};
      const previous=property<Grapple>(message,"grapple");
      if(history&&previous?.revision!==g.revision&&!g.operation){
        await ChatMessage.create({content:grappleContent(g),speaker:message.speaker,whisper:message.whisper,blind:message.blind,
          flags:{[MODULE]:{grappleParticipants:{source:g.source,target:g.target},rollsRevealed:true}}} as never);
      }
      await message.update(changes);
      // Completed history belongs in chat, not in the encounter active-state map.
      if (g.state === "ended") await owner.update({[`flags.${MODULE}.grapples.-=${g.id}`]:null});
    }
    catch (error) { console.warn(MODULE, "Grapple saved; chat refresh failed", error); }
  }
}
async function status(actor: Actor, name: string) {
  const definition = masterStatuses.find(s => s.name === name);
  if (!definition) throw new Error(`Нет состояния «${name}».`);
  if (!Array.from(actor.effects).some(e => !e.disabled && e.statuses.has(definition.id)))
    await actor.createEmbeddedDocuments("ActiveEffect", [{name, img:definition.img, statuses:[definition.id], changes:[]}]);
}
async function grappleEffect(actor: Actor, id: string) {
  const own = Array.from(actor.effects).find(e => property<string>(e, "grappleId") === id);
  if (own) { if (own.disabled) await own.update({disabled:false}); return; }
  const definition = masterStatuses.find(s => s.name === "Grappled")!;
  const existingPenalty = Array.from(actor.allApplicableEffects()).some(e => !e.disabled && !e.isSuppressed
    && !foundry.utils.getProperty(e,"system.isSuppressed") && (e.statuses.has(definition.id) || e.name === "Grappled")
    && e.changes.some(c => c.key === "bonuses.allActions" && Number(c.value) === -2));
  await actor.createEmbeddedDocuments("ActiveEffect", [{name:"Grappled",img:definition.img,statuses:[definition.id],
    changes:existingPenalty ? [] : [{key:"bonuses.allActions",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"-2",priority:20}],
    flags:{[String(MODULE)]:{grappleId:id},[String("cyberpunk-red-core")]:{changes:{cats:{0:"misc"},situational:{0:{isSituational:false,onByDefault:true}}}}}}]);
}
async function chokingEffect(actor: Actor, id: string, count: number) {
  const definition = masterStatuses.find(s => s.name === `Choking ${count}`);
  const own = Array.from(actor.effects).filter(e => property<string>(e,"grappleId") === id && property<boolean>(e,"choking"));
  if (definition && own.some(e => !e.disabled && e.statuses.has(definition.id))) return;
  if (own.length) await actor.deleteEmbeddedDocuments("ActiveEffect",own.map(e => e.id!));
  if (definition) await actor.createEmbeddedDocuments("ActiveEffect",[{name:definition.name,img:definition.img,statuses:[definition.id],changes:[],flags:{[String(MODULE)]:{grappleId:id,choking:true}}}]);
}
async function removeGrappleEffects(scene: Scene, g: Grapple) {
  const target = scene.tokens.find(t => t.uuid === g.target.token);
  if (target && g.tokenPlacement) await target.update({
    texture: {scaleX: g.tokenPlacement.scaleX, scaleY: g.tokenPlacement.scaleY},
  });
  for (const p of [g.source,g.target]) {
    const actor = scene.tokens.find(t => t.uuid === p.token)?.actor;
    if (!actor) continue;
    const ids = Array.from(actor.effects).filter(e => property<string>(e,"grappleId") === g.id || isChoking(e)).map(e => e.id!);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect",ids);
  }
}
function isChoking(effect:ActiveEffect):boolean {
  return masterStatuses.some(s=>s.name.startsWith("Choking ")&&(effect.statuses.has(s.id)||effect.name===s.name));
}
async function end(scene: Scene, g: Grapple, note: string, endedBy?: string) {
  await removeGrappleEffects(scene,g);
  const ended: Grapple = {...g,state:"ended",note,revision:g.revision+1,...(endedBy ? {endedBy} : {})}; delete ended.choke; delete ended.operation;
  await save(scene,ended);
}
/** GM repair of a saved grapple whose combat has ended; retain native placement restoration. */
export async function cleanupEndedGrapple(actor:Actor,id:string){
  if(!game.user?.isGM)throw Error("Очищать захваты может только Мастер.");
  await serialized(async()=>{
    const g=actorGrapples(actor).find(g=>g.id===id);
    if(!g)return;
    if(!g.combat||game.combats?.get(g.combat)?.started)throw Error("Этот захват ещё действует.");
    if(Array.from(game.combats??[]).some(c=>c.started&&c.combatants.some(p=>[g.source.actor,g.target.actor].includes(p.actor?.uuid??""))))throw Error("Участник захвата находится в начатом бою.");
    const scene=game.scenes?.get(g.scene) as Scene|undefined;if(!scene)throw Error("Сцена захвата недоступна.");
    await end(scene,g,"Захват завершён: Мастер очистил состояния.");
  });
}
export async function waitGrappleCleanup(){await serialized(async()=>{});}
function activeCombat(scene:Scene,g:Grapple):Combat|undefined {
  return g.combatId!==undefined?resolveEncounter(g):tokenEncounter(scene.id,[g.source.token,g.target.token]);
}
function otherActive(actor: Actor, id: string) { return Array.from(game.scenes ?? []).flatMap(scene => grapples(scene)).some(g => g.id !== id && (g.state === "active" || g.operation?.action === "hold") && [g.source.actor,g.target.actor].includes(actor.uuid)); }

/** All cross-owner writes are serialized on the first connected GM. */
export async function handleGrappleRequest(r: GrappleRequest): Promise<string | undefined> {
  if (gm()?.id !== game.user?.id) throw new Error("Нужен активный Мастер.");
  const user = game.users!.get(r.user) as User | undefined; if (!user?.active) throw new Error("Отправитель запроса недоступен.");
  const scene = sceneFor(r.scene);
  let g = findRecord(scene,r.id);
  if (r.action === "start" || r.action === "startBreak") {
    if (g) return; // A retried request must not create another exchange.
    const source = tokenFor(scene,r.source!), target = tokenFor(scene,r.target!);
    if (!owns(source.actor!,user)) throw new Error("Вы не управляете этим персонажем.");
    validatePair(scene,source,target);
    const broken = grappleFor(target);
    if (r.action === "startBreak" && (!broken || broken.source.token !== target.uuid)) throw new Error("Цель больше никого не держит.");
    if (r.action === "start" && (actorGrapples(source.actor!).length || actorGrapples(target.actor!).length)) throw new Error("Персонаж уже держит кого-то в захвате. Сначала завершите тот захват.");
    g = {id:r.id,revision:0,scene:r.scene,source:participant(source),target:participant(target),purpose:r.action === "start" ? "grab" : "break",
      ...(broken && r.action === "startBreak" ? {breaks:broken.id} : {}),state:"waiting",attack:{...checkedResult(r.result),roller:r.user},rollMode:r.rollMode ?? "roll",note:"Ждём встречного броска Драки."};
    const combat = r.encounter?resolveEncounter(r.encounter):activeCombat(scene,g);
    if(combat)requireParticipants(combat,[g.source.token,g.target.token]);
    Object.assign(g,encounterRef(combat,scene.id,[g.source.token,g.target.token]));
    if (combat) g.combat = combat.id!;
    const messageData = {user:r.user,content:grappleContent(g),speaker:ChatMessage.getSpeaker({actor:source.actor!,token:source}),
      flags:{[String(MODULE)]:{grapple:{scene:r.scene,id:r.id}}}} as Parameters<typeof ChatMessage.applyRollMode>[0];
    ChatMessage.applyRollMode(messageData,r.rollMode === "gmroll" || r.rollMode === "blindroll" || r.rollMode === "selfroll" ? r.rollMode : "roll");
    if (r.rollMode === "selfroll") messageData.whisper = [r.user];
    const message = await ChatMessage.create(messageData);
    if (!message) throw new Error("Не удалось создать карточку захвата.");
    g.message = message.id!;
    try { await save(scene,g); } catch(error) { await message.delete(); throw error; }
    return;
  }
  if (!g || g.state === "ended") throw new Error("Этот захват завершён.");
  if (r.revision !== g.revision) throw new Error("Карточка изменилась. Используйте её текущие кнопки.");
  const key = scene.id + ":" + g.id;
  if (r.action === "cancel" && user.isGM) { claims.delete(key); await end(scene,g,"Завершено Мастером."); return; }
  resolveEncounter(g);
  const source = tokenFor(scene,g.source.token), target = tokenFor(scene,g.target.token);
  if (g.operation && (g.operation.action !== r.action || g.operation.user !== user.id && !user.isGM))
    throw new Error("Сначала завершите ожидающее действие захвата; Мастер может его повторить.");
  if (["claim","unclaim","respond"].includes(r.action)) {
    if (g.state !== "waiting" || !owns(target.actor!,user)) throw new Error("Бросать может только владелец отвечающего персонажа или Мастер.");
    const claim = claims.get(key);
    if (r.action === "claim") {
      if (claim && claim.expires > Date.now()) throw new Error("Этот ответ уже бросает другой пользователь.");
      const id = foundry.utils.randomID(); claims.set(key,{id,user:user.id!,expires:Date.now()+300000}); return id;
    }
    if (!claim || claim.id !== r.claim || claim.user !== user.id) throw new Error("Бронь ответа снята. Бросьте снова.");
    if (r.action === "unclaim") { claims.delete(key); return; }
    validatePair(scene,source,target);
    const defense = {...checkedResult(r.result),roller:r.user}, success = winsGrab(g.attack.total,defense.total);
    if (g.purpose === "break" && success) {
      const broken = findRecord(scene,g.breaks ?? "");
      if (!broken || broken.source.token !== target.uuid || broken.state !== "active" && broken.endedBy !== g.id) throw new Error("Исходный захват завершён.");
      if (broken.operation) throw new Error("Сначала завершите ожидающее действие исходного захвата.");
      if (broken.state === "active") await end(scene,broken,`${source.name} разорвал(а) захват.`,g.id);
    }
    const attempt = g.purpose === "grab" ? "Захват" : findRecord(scene,g.breaks ?? "")?.target.token === g.source.token ? "Вырваться" : "Разорвать захват";
    const next: Grapple = {...g,defense,revision:g.revision+1,state:success && g.purpose === "grab" ? "choice" : "ended",
      note:success ? g.purpose === "grab" ? "Захват удался. Выберите: удерживать цель или забрать предмет." : "Захват разорван." : `${attempt} — неудача. При ничьей побеждает отвечающий.`};
    await save(scene,next); claims.delete(key);
    const message = game.messages?.get(g.message ?? "");
    const audience = message ? messageDiceAudience(message) : undefined;
    void Promise.all([showSavedDice(g.attack.dice ?? [],g.rollMode ?? "roll",g.attack.roller,audience),
      showSavedDice(defense.dice ?? [],g.rollMode ?? "roll",defense.roller,audience)])
      .then(async()=>{if(message)await message.update({[`flags.${MODULE}.rollsRevealed`]:true} as Parameters<typeof message.update>[0]);})
      .catch(error => console.warn(MODULE,"Grapple dice display failed",error));
    return;
  }
  if (!owns(source.actor!,user)) throw new Error("Это действие доступно только владельцу захватившего или Мастеру.");
  if (r.action === "hold" || r.action === "take") {
    if (g.state !== "choice") throw new Error("Сначала разрешите встречный бросок захвата.");
    validatePair(scene,source,target);
    if (r.action === "take") {
      await end(scene,g,"Захват удался: заберите один предмет из рук цели в свою свободную руку. Передайте предмет вручную; захват не установлен."); return;
    }
    if (otherActive(source.actor!,g.id) || otherActive(target.actor!,g.id)) throw new Error("Персонаж уже участвует в другом захвате.");
    const tokenPlacement = g.tokenPlacement ?? {
      scaleX: Number(target.texture.scaleX ?? 1), scaleY: Number(target.texture.scaleY ?? 1),
    };
    const locked: Grapple = {...g,tokenPlacement,operation:{action:r.action,user:r.user}};
    await save(scene,locked);
    await grappleEffect(source.actor!,g.id); await grappleEffect(target.actor!,g.id);
    await target.update({
      texture: {scaleX: tokenPlacement.scaleX < 0 ? -0.8 : 0.8,
        scaleY: tokenPlacement.scaleY < 0 ? -0.8 : 0.8},
    });
    const next: Grapple = {...locked,establishedRound:g.combat?Number(game.combats?.get(g.combat)?.round):undefined,state:"active",revision:g.revision+1,note:"Захват действует: −2 к действиям; без двуручного оружия. Хватающая рука занята. Удерживаемый токен следует за захватившим; защитник не может совершать действие движения."};
    delete next.operation; await save(scene,next); return;
  }
  if (g.state !== "active") throw new Error("Сначала установите захват.");
  if (grappleActionBlocked(g)) throw new Error("Действия захвата доступны со следующего хода захватившего.");
  if (r.action === "release") { await save(scene,{...g,operation:{action:r.action,user:r.user}}); await end(scene,{...g,lastAction:"release"},`${g.source.name} released ${g.target.name} (без действия).`); return; }
  if (!["choke","throw"].includes(r.action)) throw new Error("Неизвестное действие захвата.");
  const body = Number(foundry.utils.getProperty(source.actor!,"system.stats.body.value"));
  if (!Number.isFinite(body) || body < 0) throw new Error("ТЕЛ атакующего недоступно.");
  const receiptKey = `${scene.id}:${g.id}:${g.revision}:${r.action}`;
  type Receipt = {id:string;hp:number;unconscious:boolean;amount:number;choke?:Grapple["choke"]};
  const receipt = await withActorMutation(target.actor!,async()=>{
    let receipt = property<Receipt>(target.actor!,"grappleDamage");
    if (receipt?.id !== receiptKey) {
      const combat = g.combat ? activeCombat(scene,g) : undefined;
      const choke = r.action === "choke" ? combat ? nextChoke(g.choke,combat.id!,Number(combat.round)) : {combat:"",round:0,count:0} : undefined;
      const hp = Number(foundry.utils.getProperty(target.actor!,"system.derivedStats.hp.value"));
      const damage = r.action === "choke" ? chokeDamage(hp,body,choke!.count) : {hp:hp-body,unconscious:false};
      if (!Number.isFinite(damage.hp)) throw new Error("HP цели недоступно.");
      await save(scene,{...g,operation:{action:r.action,user:r.user}});
      receipt = {id:receiptKey,amount:body,...damage,...(choke ? {choke} : {})};
      // HP and receipt change together, so retries after an effect/scene failure cannot deal damage twice.
      await target.actor!.update({"system.derivedStats.hp.value":receipt.hp,[`flags.${MODULE}.grappleDamage`]:receipt} as Parameters<Actor["update"]>[0]);
    }
    return receipt;
  });
  if (receipt.unconscious) await status(target.actor!,"Unconscious");
  if (r.action === "throw") {
    await status(target.actor!,"Prone");
    await end(scene,{...g,lastAction:"throw"},`${g.source.name} threw ${g.target.name}: ${receipt.amount} урона прямо по HP; лёжа. Захват завершён. Встаньте, прежде чем совершать действие движения.`);
  } else {
    await chokingEffect(target.actor!,g.id,receipt.unconscious ? 0 : Math.max(1,receipt.choke?.count ?? 1));
    const next: Grapple = {...g,lastAction:"choke",revision:g.revision+1,choke:receipt.choke,
      note:`Удушение: ${receipt.amount} урона прямо по HP; броня не изнашивается. ${receipt.choke?.combat ? `${receipt.choke.count}/3 раундов подряд.` : "Вне боя раунды подряд считает Мастер."}${receipt.unconscious ? " Цель без сознания." : ""}`};
    delete next.operation; await save(scene,next);
  }
}
async function request(data: Omit<GrappleRequest,"grappleType"|"request"|"user">): Promise<string | undefined> {
  requireCombatSocket();
  if (!gm()) throw new Error("Для захвата нужен активный Мастер.");
  const wire: GrappleRequest = {...data,grappleType:"request",request:foundry.utils.randomID(),user:game.user!.id};
  if (gm()?.id === game.user?.id) return serialized(() => handleGrappleRequest(wire));
  return requests.request(wire.request,()=>game.socket!.emit(CHANNEL,wire),15000,"Мастер не подтвердил. Проверьте обновлённую карточку, прежде чем повторять.");
}
async function brawling(actor: Actor, skipDialog = false): Promise<SkillResult | undefined> {
  const item = findNativeItem(actor.items,"Brawling") as RollItem | undefined;
  if (!item) throw new Error("У персонажа нет навыка «Драка».");
  if (foundry.utils.getProperty(item,"system.stat") !== "dex") throw new Error("Драка должна использовать ЛВК. Исправьте навык перед броском.");
  let roll = item.createRoll("skill",actor);
  if (!await roll.handleRollDialog({type:"grapple",ctrlKey:skipDialog,metaKey:false},actor,item)) return;
  roll = await item.confirmRoll(roll);
  await spendBonusLuck(actor,Number(roll.luck) || 0);
  await rollHidden(roll);
  return {total:Number(roll.resultTotal),html:await nativeCard(roll),dice:diceJSON(roll),roller:game.user!.id};
}
const localBusy = new Set<string>();
export async function useGrapple(source: Token, target: Token, action: string, skipDialog = false) {
  const key = source.document.uuid;
  if (localBusy.has(key)) return;
  localBusy.add(key);
  try {
    if (!source.actor?.isOwner || !target.actor || !target.isVisible) throw new Error("Выберите своего персонажа и видимую цель.");
    requireCombatSocket();
    if (!gm()) throw new Error("Для захвата нужен активный Мастер.");
    const scene = source.document.parent as Scene;
    if (target.document.parent !== scene) throw new Error("Оба персонажа должны быть на одной сцене.");
    const own = grappleFor(source.document);
    if (action === "grab" || action === "escape" || action === "break") {
      const opponent = action === "escape" && own ? tokenFor(scene,own.source.token) : target.document;
      validatePair(scene,source.document,opponent);
      const encounter=encounterRef(tokenEncounter(scene.id,[source.document.uuid,opponent.uuid]),scene.id,[source.document.uuid,opponent.uuid]);
      if (!skipDialog && !await Dialog.confirm({title:action === "grab" ? "Захват" : action === "escape" ? "Вырваться" : "Разорвать захват",content:action === "grab" ? "<p>Это стоит действия. Подтвердите, что у вас есть свободная рука для захвата.</p>" : "<p>Это стоит действия. Попытаться разорвать захват?</p>"})) return;
      const result = await brawling(source.actor,skipDialog); if (!result) return;
      resolveEncounter(encounter);
      await request({encounter,scene:scene.id!,id:foundry.utils.randomID(),revision:0,action:action === "grab" ? "start" : "startBreak",source:source.document.uuid,target:opponent.uuid,result,rollMode:game.settings!.get("core","rollMode") ?? "roll"});
    } else {
      if (!own || own.source.token !== source.document.uuid) throw new Error("Душить, бросать или отпускать может только атакующий.");
      await request({scene:scene.id!,id:own.id,revision:own.revision,action});
    }
  } catch(error) { report(error); } finally { localBusy.delete(key); }
}
const responseCache = new Map<string,{result:SkillResult;claim:string | undefined}>();
async function respond(g: Grapple, skipDialog = false) {
  const base = {scene:g.scene,id:g.id,revision:g.revision};
  const key = g.scene + ":" + g.id + ":" + g.revision;
  const cached = responseCache.get(key);
  const claim = cached?.claim ?? await request({...base,action:"claim"});
  let result = cached?.result;
  try {
    if (!result) result = await brawling(tokenFor(sceneFor(g.scene),g.target.token).actor!,skipDialog);
    if (!result) { await request({...base,action:"unclaim",claim});return; }
    responseCache.set(key,{result,claim});
    await request({...base,action:"respond",claim,result});
    responseCache.delete(key);
  } catch(error) {
    if (!result) {try {await request({...base,action:"unclaim",claim});} catch {}}
    else if (String((error as Error).message).includes("no longer reserved")) responseCache.set(key,{result,claim:undefined});
    throw error;
  }
}
export function renderGrapple(message: ChatMessage, html: JQuery) {
  const reference = property<{scene:string;id:string}>(message,"grapple");
  if (!reference || !message.visible || !message.isContentVisible) return;
  const scene = game.scenes?.get(reference.scene) as Scene | undefined;
  const g = scene ? findRecord(scene,reference.id) : undefined;
  if (!g) return;
  const card = html.find(".pneuma-grapple-card");
  // Preserve native roll nodes already decorated by Chat Dice and other render hooks.
  // Roll markup changes through message.update, before the normal render hook sequence.
  const history=property<Grapple>(message,"grappleHistory")??g;
  card.attr("data-state",history.state);
  card.find(".pneuma-grapple-note").text(history.note);
  const cardNode = card[0];
  const noteNode = cardNode?.querySelector<HTMLElement>(".pneuma-grapple-note");
  const explanation = grappleExplanation(history.note);
  if (noteNode) noteNode.hidden = !!explanation;
  const previousExplanation = cardNode?.nextElementSibling;
  if (previousExplanation?.classList.contains("pneuma-grapple-explanation")) previousExplanation.remove();
  if (explanation) cardNode?.insertAdjacentHTML("afterend", explanation);

  // Also decorate older saved cards in place; ties belong to the responding Brawling roll.
  const rolls = card[0]?.querySelector<HTMLElement>(".pneuma-grapple-rolls");
  if (history.lastAction) rolls?.remove();
  else if (rolls) styleOpposedRolls(rolls,g.defense ? winsGrab(g.attack.total,g.defense.total) : undefined);
  const controls = html.find(".pneuma-grapple-controls").empty();
  const source = scene?.tokens.find(t => t.uuid === g.source.token), target = scene?.tokens.find(t => t.uuid === g.target.token);
  const canSource = !!source?.actor && owns(source.actor,game.user!);
  const canTarget = !!target?.actor && owns(target.actor,game.user!);
  const add = (label: string, run: (event: MouseEvent) => Promise<unknown>, gmOnly = false, action = "apply") => {
    const button = document.createElement("button");button.type="button";button.textContent=label;button.dataset.gmOnly=String(gmOnly);button.dataset.chatAction=action;
    button.addEventListener("click",async event => {
      event.preventDefault();event.stopPropagation();
      if (localBusy.has(g.id)) return; localBusy.add(g.id); button.disabled=true;
      try { await run(event); } catch(error) { report(error); } finally { localBusy.delete(g.id);button.disabled=false; }
    });controls.append(button);
  };
  const act = (action: string) => request({scene:g.scene,id:g.id,revision:g.revision,action});
  if (g.operation) {
    if (canSource || game.user?.isGM) add(`Повторить: ${({choke:"удушение",throw:"бросок",release:"отпустить",hold:"удержание",take:"забрать предмет"} as Record<string,string>)[g.operation.action]??g.operation.action}`,() => act(g.operation!.action),false,"retry");
  } else if (g.state === "waiting" && canTarget) add("Бросить Драку",event => respond(g,event.shiftKey),false,"roll");
  else if (g.state === "choice" && canSource) { add("Удерживать цель",() => act("hold"));add("Забрать предмет",() => act("take")); }

  if (game.user?.isGM && g.state !== "ended") add("Завершить (Мастер)",() => act("cancel"),true,"cancel");
}
export function registerGrapple() {
  Hooks.once("ready",() => {
    game.socket!.on(CHANNEL,(wire: GrappleRequest | Reply) => {
      if (wire?.grappleType === "request" && gm()?.id === game.user?.id) {
        void serialized(() => handleGrappleRequest(wire)).then(claim => reply(wire,undefined,claim),error => reply(wire,String((error as Error).message ?? error)));
      } else if (wire?.grappleType === "reply") requests.reply({...wire,id:wire.request},wire.claim);
    });
  });
  Hooks.on("renderChatMessage",renderGrapple);
  const refresh = (owner: Scene | Combat,changes: object) => {
    if (!updateTouchesPath(changes, "flags.redline-combat.grapples")) return;
    for (const g of Object.values(property<Record<string,Grapple>>(owner,"grapples") ?? {})) {
      const message = game.messages?.get(g.message ?? "");
      if (message) void ui.chat?.updateMessage(message as ChatMessage,false);
    }
    canvas.tokens?.hud?.render();
  };
  Hooks.on("updateScene",refresh);
  Hooks.on("updateCombat",refresh);
  const finishCombat = (combat: Combat,deleted = false) => {
    if (gm()?.id !== game.user?.id) return;
    void serialized(async () => {
      for (const g of Object.values(property<Record<string,Grapple>>(combat,"grapples") ?? {})) {
        const scene = game.scenes?.get(g.scene) as Scene | undefined;
        if (!scene) continue;
        if (!deleted) await end(scene,g,"Захват завершён: бой сброшен.");
        else {
          await removeGrappleEffects(scene,g);
          const ended: Grapple = {...g,state:"ended",note:"Захват завершён: бой удалён.",revision:g.revision+1};
          delete ended.choke;delete ended.operation;
          const changes: Record<string,unknown> = {content:grappleContent(ended),[`flags.${MODULE}.grapple`]:ended};
          await game.messages?.get(g.message ?? "")?.update(changes);
        }
      }
    }).catch(report);
  };
  Hooks.on("updateCombat",(combat: Combat,changes: {round?:number}) => {if (changes.round === 0) finishCombat(combat);});
  Hooks.on("updateCombat",(combat: Combat,changes: {round?:number}) => {
    if(gm()?.id!==game.user?.id||changes.round===undefined||changes.round===0)return;
    void serialized(async()=>{
      for(const g of Object.values(property<Record<string,Grapple>>(combat,"grapples")??{})){
        if(!g.choke||visibleChoke(g.choke,combat.id!,Number(combat.round)))continue;
        const actor=game.scenes?.get(g.scene)?.tokens.find(t=>t.uuid===g.target.token)?.actor;
        if(actor)await chokingEffect(actor,g.id,0);
      }
    }).catch(report);
  });
  Hooks.on("deleteCombat",(combat: Combat) => finishCombat(combat,true));
  // Foundry sends update options from the initiating client to the GM with the document update.
  // Capture before mutation, then move the held token only after the grappler's update succeeds.
  type MoveOptions = { grapplePrevious?: { id: string; x: number; y: number; elevation: number } };
  // One GM moves cross-owner tokens. Re-read current state inside the same queue as release/throw.
  Hooks.on("updateToken",(token: TokenDocument,changes: {x?:number;y?:number;elevation?:number},options: MoveOptions) => {
    if (gm()?.id !== game.user?.id || !["x","y","elevation"].some(key => key in changes)) return;
    const g = grappleFor(token);
    const previous = options.grapplePrevious;
    if (!g || g.source.token !== token.uuid || previous?.id !== g.id) return;
    void serialized(async () => {
      const current = grappleFor(token);
      if (current?.id !== g.id) return;
      const target = (token.parent as Scene).tokens.find(t => t.uuid === current.target.token);
      if (!target) return;
      await target.update({x:previous.x,y:previous.y,elevation:previous.elevation});
    }).catch(report);
  });
  // Players cannot move the defender independently; GM corrections remain available.
  Hooks.on("preUpdateToken",(token: TokenDocument,changes: {x?:number;y?:number;elevation?:number},options: MoveOptions,userId: string) => {
    delete options.grapplePrevious;
    if (changes.x === undefined && changes.y === undefined && changes.elevation === undefined) return;
    const g = grappleFor(token);
    if (g?.source.token === token.uuid && (["x","y","elevation"] as const).some(key => changes[key] !== undefined && changes[key] !== token[key])) {
      options.grapplePrevious = {id:g.id,x:token.x,y:token.y,elevation:token.elevation};
    }
    if (game.users?.get(userId)?.isGM) return;
    if (g?.target.token === token.uuid) {ui.notifications!.warn("В захвате: этот токен двигается вместе с захватившим.");return false;}
  });
  Hooks.on("deleteScene",(scene: Scene) => {
    if (gm()?.id !== game.user?.id) return;
    void serialized(async () => {for (const g of grapples(scene)) {
      await removeGrappleEffects(scene,g);
      if (g.combat) await end(scene,g,"Захват завершён: сцена удалена.");
    }}).catch(report);
  });
  Hooks.on("deleteActor",(actor: Actor) => {
    if (gm()?.id !== game.user?.id) return;
    void serialized(async () => {for (const scene of game.scenes ?? []) for (const g of grapples(scene)) {
      if ([g.source.actor,g.target.actor].includes(actor.uuid)) await end(scene,g,"Захват завершён: актёр участника удалён.");
    }}).catch(report);
  });
  Hooks.on("deleteToken",(token: TokenDocument) => {
    if (gm()?.id !== game.user?.id) return;
    const scene = token.parent as Scene;
    void serialized(async () => {for (const g of grapples(scene).filter(g => g.state !== "ended" && [g.source.token,g.target.token].includes(token.uuid))) {
      // Synthetic actor can still be read from the deleted token during this hook.
      if (token.actor) {
        const ids = Array.from(token.actor.effects).filter(e => property<string>(e,"grappleId") === g.id || isChoking(e)).map(e => e.id!);
        if (ids.length && token.actor.isToken === false) await token.actor.deleteEmbeddedDocuments("ActiveEffect",ids);
      }
      await end(scene,g,"Захват завершён: токен участника удалён.");
    }}).catch(report);
  });
}
function reply(wire: GrappleRequest,error?: string,claim?: string) {
  game.socket!.emit(CHANNEL,{grappleType:"reply",request:wire.request,user:wire.user,gm:game.user!.id,error,claim});
}
