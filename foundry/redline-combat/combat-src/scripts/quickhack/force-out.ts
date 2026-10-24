import {findNativeItem} from "../native-lookup.js";
import { primaryGM as electedGM } from "../shared.js";
import {resolveEncounter} from "../encounter.js";
import { requireCombatSocket } from "../socket-health.js";
import { resolutionSection, rollOutcomeClass } from "../card-structure.js";
import type { RollItem } from "../native-combat.js";
import { MODULE } from "./availability.js";
import { primaryGM } from "./content.js";
import { resultFlag, delivery, escapeHTML, type QuickhackResult } from "./messages.js";
import { canOperate, roleFor, nativeQuickhackRoll, criticalD10 } from "./rolls.js";
import { enabled, label, routing } from "./settings.js";
import { isNetrunnerEjected } from "./rules.js";
import { resultConnectionValid, ejectConnection, combatConnections, type Connection } from "./connections.js";

interface Request { quickhackType: string; messageId: string; requesterId: string; total: number; rollContent?: string; connectionId?: string; id?: string; rollerId?: string; gmId?: string }
interface Pending { request: Request; rollerId: string; timer: ReturnType<typeof setTimeout> }
const pending = new Map<string, Pending>();
const busy = new Set<string>();
const channel = `module.${MODULE}`;
function connectionRevealed(connection: Connection, source: Actor, target: Actor): boolean {
  const awareness = connection.awareness, config = routing();
  if (!source.hasPlayerOwner && target.hasPlayerOwner) return !!awareness &&
    (awareness.jackInDetected && config.npcToPlayerJackInRevealAttacker || awareness.quickhackDetected && config.npcToPlayerQuickhackRevealAttacker);
  return !!awareness?.revealAttacker;
}
async function contextFor(id: string) {
  const message = game.messages?.get(id) as ChatMessage | undefined;
  const saved = message && resultFlag(message);
  const combat=saved?resolveEncounter(saved):game.combats?.find(c=>c.started&&combatConnections(c).some(link=>link.id===id));
  const connection = combat?combatConnections(combat).find(c=>c.id===id||c.id===saved?.connectionId):undefined;
  const result: QuickhackResult | undefined = connection ? {
    ...connection,type:"quickhack",combatUuid:combat?.uuid,sourceActorUuid:connection.sourceActorUuid,targetActorUuid:connection.targetActorUuid,
    sourceTokenUuid:connection.sourceTokenUuid,targetTokenUuid:connection.targetTokenUuid,connectionId:connection.id,
    alerted:!!connection.awareness?.alerted,revealAttacker:!!connection.awareness?.revealAttacker,audience:connection.awareness?.audience??"gm",success:true
  } : saved;
  if (!result?.alerted) return;
  const source = await fromUuid(result.sourceActorUuid) as Actor | null, target = await fromUuid(result.targetActorUuid) as Actor | null;
  const connectionId = result.type === "jackIn" ? id : result.connectionId;
  if (source && target && resultConnectionValid(source,{...result,connectionId})) return {
    result,source,target,connectionId,revealAttacker:connection?connectionRevealed(connection,source,target):!source.hasPlayerOwner&&target.hasPlayerOwner
      ?(result.type==="jackIn"?routing().npcToPlayerJackInRevealAttacker:routing().npcToPlayerQuickhackRevealAttacker):result.revealAttacker
  };
}
/** Encounter state is authoritative; no dependency on retained chat cards. */
export function forceOutEntries(target: Actor | undefined) {
  if (!target || !enabled() || !canOperate(target)) return [];
  const rows = combatConnections().filter(c=>c.state === "active" && c.targetActorUuid === target.uuid && c.awareness?.alerted).map(connection=>{
    const source = game.actors?.find(actor=>actor.uuid===connection.sourceActorUuid)
      ?? canvas.tokens?.placeables?.find(token=>token.actor?.uuid===connection.sourceActorUuid)?.actor;
    return {messageId:connection.id,name:source&&connectionRevealed(connection,source,target)?source.name??label("Result.UnknownNetrunner"):label("Result.UnknownNetrunner")};
  });
  return rows.map((row,index)=>({...row,label:"Выбросить нетраннера — "+row.name+(rows.length>1?" ("+(index+1)+")":"")}));
}
export async function beginForceOut(message: Pick<ChatMessage,"id">, skipDialog = false) {
  if (!enabled() || busy.has(message.id!)) return;
  requireCombatSocket();
  busy.add(message.id!);
  try {
    const context = await contextFor(message.id!);
    if (!context || !canOperate(context.target)) return;
    if (!game.users!.some(user => user.isGM && user.active)) { ui.notifications!.warn(label("ForceOut.ActiveGmRequired")); return; }
    const concentration = findNativeItem(context.target.items,"Concentration") as RollItem | undefined;
    if (!concentration) throw new Error(label("Error.ConcentrationMissing"));
    const roll = await nativeQuickhackRoll(context.target, concentration, label("ForceOut.ResultTitle"), delivery(context.result.audience, context.source, context.target), () => enabled() && resultConnectionValid(context.source, {...context.result, connectionId:context.connectionId}), undefined, false, skipDialog);
    if (!roll || !enabled()) return;
    const request: Request = { quickhackType: "force-out", messageId: message.id!, requesterId: game.user!.id, total: roll.total, rollContent: roll.content, connectionId: context.connectionId };
    if (primaryGM()) await resolveForceOut(request); else game.socket!.emit(channel, request);
  } finally { busy.delete(message.id!); }
}
async function postForceOut(request: Request, interfaceTotal: number, interfaceContent = "") {
  const context = await contextFor(request.messageId);
  if (!enabled() || !context || context.connectionId !== request.connectionId) return;
  const ejected = isNetrunnerEjected(request.total, interfaceTotal);
  if (ejected && context.result.combatUuid && (!context.connectionId || !await ejectConnection(context.source, context.target.uuid, context.connectionId,context.result))) return;
  const rollSection = (name: string, html: string, won: boolean) => html
    ? `<div class="pneuma-quickhack-roll ${rollOutcomeClass(won)}" data-quickhack-section="roll"><h4>${escapeHTML(name)}</h4>${html}</div>` : "";
  // Hidden Netrunner identity must not leak through the native role-roll heading or breakdown.
  const visibleInterface = context.revealAttacker || context.result.audience === "gm" ? interfaceContent : "";
  const content = `<div class="rollcard pneuma-quickhack-card" data-state="${ejected ? "success" : "failure"}"><div class="rollcard-top"><div class="cpr-block pneuma-quickhack-heading"><h3>${label("ForceOut.ResultTitle")}</h3><p class="pneuma-quickhack-participants">${escapeHTML(context.target.name)} → ${escapeHTML(context.revealAttacker ? context.source.name : label("Result.UnknownNetrunner"))}</p></div></div>`
    + rollSection(label("ForceOut.DefenderTotal"), request.rollContent ?? "", ejected)
    + rollSection(label("ForceOut.InterfaceTotal"), visibleInterface, !ejected)
    + resolutionSection("result", `<div class="cpr-block pneuma-quickhack-result"><p>`
    + label(ejected ? "ForceOut.Success" : "ForceOut.Failure", { defender: escapeHTML(context.target.name), netrunner: context.revealAttacker ? escapeHTML(context.source.name) : label("Result.UnknownNetrunner") })
    + `</p><p>${label("ForceOut.DefenderTotal")}: ${request.total} · ${label("ForceOut.InterfaceTotal")}: ${interfaceTotal}</p></div>`) + "</div>";
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: context.target }),
    ...delivery(context.result.audience, context.source, context.target), flags: { [String(MODULE)]: { quickhack: { type: "forceOutResult", ejected } } } });
}
async function resolveForceOut(request: Request) {
  if (!enabled() || !primaryGM() || !Number.isFinite(request.total) || [...pending.values()].some(value => value.request.messageId === request.messageId)) return;
  const context = await contextFor(request.messageId);
  const requester = game.users!.get(request.requesterId) as User | undefined;
  if (!context || !requester || !canOperate(context.target, requester)) return;
  const role = roleFor(context.source);
  const rank = Number(role && foundry.utils.getProperty(role, "system.rank"));
  if (!role || !Number.isFinite(rank)) throw new Error(label("ForceOut.InterfaceMissing"));
  if (!context.source.hasPlayerOwner) { await postForceOut(request, rank + await criticalD10()); return; }
  const roller = game.users!.filter(user => user.active && !user.isGM && canOperate(context.source, user)).sort((a,b) => a.id.localeCompare(b.id))[0] ?? game.user!;
  const id = foundry.utils.randomID();
  const timer = setTimeout(() => { pending.delete(id); if (enabled()) ui.notifications!.warn(label("ForceOut.RollTimedOut", { player: roller.name! })); }, 120000);
  pending.set(id, { request, rollerId: roller.id, timer });
  const prompt = { ...request, quickhackType: "force-out-roll", id, rollerId: roller.id, gmId: game.user!.id };
  if (roller.id === game.user!.id) await performResistance(prompt); else game.socket!.emit(channel, prompt);
}
async function performResistance(request: Request) {
  const gm = electedGM();
  if (!enabled() || request.rollerId !== game.user!.id || request.gmId !== gm?.id) return;
  const context = await contextFor(request.messageId);
  if (!context || !canOperate(context.source)) return;
  const role = roleFor(context.source); if (!role) return;
  const roll = await nativeQuickhackRoll(context.source, role, label("ForceOut.InterfaceDialogTitle", { target: context.target.name! }), delivery(context.result.audience, context.source, context.target), () => enabled() && resultConnectionValid(context.source, {...context.result, connectionId:context.connectionId}), undefined, false);
  if (!enabled()) return;
  const reply = { ...request, quickhackType: roll ? "force-out-complete" : "force-out-cancel", total: roll?.total ?? 0, rollContent: roll?.content };
  if (primaryGM()) await completeResistance(reply); else game.socket!.emit(channel, reply);
}
async function completeResistance(reply: Request) {
  if (!enabled() || !primaryGM() || !reply.id) return;
  const entry = pending.get(reply.id); if (!entry || entry.rollerId !== reply.rollerId) return;
  clearTimeout(entry.timer); pending.delete(reply.id);
  if (reply.quickhackType === "force-out-cancel") { ui.notifications!.warn("Бросок Интерфейса для квикхака отменён."); return; }
  if (Number.isFinite(reply.total)) await postForceOut(entry.request, reply.total, reply.rollContent);
}
export function clearForceOut() {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
}
export function registerForceOut() {
  game.socket!.on(channel, (request: Request) => {
    if (!enabled() || !request || typeof request.messageId !== "string") return;
    const handler = request.quickhackType === "force-out" ? resolveForceOut
      : request.quickhackType === "force-out-roll" ? performResistance
      : ["force-out-complete", "force-out-cancel"].includes(request.quickhackType) ? completeResistance : undefined;
    if (handler) void handler(request).catch(error => { console.error(MODULE, error); ui.notifications!.error(label("ForceOut.UnexpectedError")); });
  });
}
