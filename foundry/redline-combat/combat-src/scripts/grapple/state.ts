import type {EncounterRef} from "../encounter.js";
import { visibleChoke, type ChokeSequence } from "./rules.js";
export const MODULE = "redline-combat";
export interface Participant { token: string; actor: string; name: string }
export interface SkillResult { total: number; html: string; dice?: string[]; roller?: string }
export interface Grapple extends Partial<EncounterRef> {
  id: string; revision: number; scene: string; combat?: string; message?: string;
  source: Participant; target: Participant;
  state: "waiting" | "choice" | "active" | "ended";
  purpose: "grab" | "break"; breaks?: string; endedBy?: string;
  attack: SkillResult; defense?: SkillResult; note: string; choke?: ChokeSequence;
  rollMode?: string;
  establishedRound?: number;
  lastAction?: "release" | "choke" | "throw";
  tokenPlacement?: { scaleX: number; scaleY: number };
  operation?: { action: string; user: string };
}
export const property = <T>(doc: object, key: string) => foundry.utils.getProperty(doc, `flags.${MODULE}.${key}`) as T | undefined;
export function grapples(scene: Scene | undefined): Grapple[] {
  if (!scene) return [];
  const outsideCombat = Object.values(property<Record<string,Grapple>>(scene,"grapples") ?? {});
  const encounters = Array.from(game.combats?.values() ?? []).flatMap(combat => Object.values(property<Record<string,Grapple>>(combat,"grapples") ?? {}));
  return [...outsideCombat,...encounters.filter(g => g.scene === scene.id)];
}
export function grappleFor(token: TokenDocument): Grapple | undefined {
  return grapples(token.parent as Scene).find(g => g.state === "active" && [g.source.token, g.target.token].includes(token.uuid));
}
export function actorGrapples(actor: Actor): Grapple[] {
  const scenes = Array.from(game.scenes ?? []);
  const byScene=new Map<string,Grapple[]>();
  for(const combat of game.combats?.values()??[])for(const g of Object.values(property<Record<string,Grapple>>(combat,"grapples")??{})){
    const group=byScene.get(g.scene)??[];group.push(g);byScene.set(g.scene,group);
  }
  return scenes.flatMap(scene=>[...Object.values(property<Record<string,Grapple>>(scene,"grapples")??{}),...(byScene.get(scene.id!)??[])])
    .filter(g=>g.state==="active"&&[g.source.actor,g.target.actor].includes(actor.uuid));
}
export function grappleHUD(actor: Actor): { id: string; text: string; detail: string }[] {
  return actorGrapples(actor).flatMap(g => {
    const attacking = actor.uuid === g.source.actor;
    const name = attacking ? g.target.name : g.source.name;
    const combat = game.combats?.get(g.choke?.combat ?? "");
    const count = visibleChoke(g.choke, combat?.started ? combat.id : undefined, Number(combat?.round));
    return [{ id: g.id, text: `${attacking ? "Держит в захвате" : "В захвате у"}: ${name}`, detail: "−2 к действиям. Без двуручного оружия. " + (attacking ? "Хватающая рука занята; удерживаемый токен двигается вместе с вами." : "Действие движения недоступно; вас тащит атакующий.") },
      ...(count || g.choke?.combat === "" ? [{ id: g.id + "-choke", text: `${attacking ? "Душит" : "Вас душит"}: ${name} — ${count ? `${count}/3` : "Раунды считает Мастер"}`, detail: "Раундов подряд" }] : [])];
  });
}
export function needsTwoHands(item: object): boolean {
  const system = (item as {system?: {handsReq?:number;modifiers?:{secondaryWeapon?:{handsReq?:number}}}})?.system;
  return Number(system?.handsReq ?? system?.modifiers?.secondaryWeapon?.handsReq) >= 2;
}
export function grappleWeaponBlocked(actor: Actor, item: object): boolean {
  return needsTwoHands(item) && actorGrapples(actor).length > 0;
}
export function grappleActionBlocked(g:Grapple):boolean {
  if(g.establishedRound===undefined||!g.combat)return false;
  const combat=game.combats?.get(g.combat);
  if(!combat?.started)return true;
  const round=Number(combat.round),index=combat.turns?.findIndex(c=>c.token?.uuid===g.source.token)??-1;
  return round<=g.establishedRound||(round===g.establishedRound+1&&index>=0&&Number(combat.turn)<index);
}
export function grappleMenu(source: Token | undefined, target: Token | undefined): { action: string; label: string; disabled?:boolean; title?:string }[] {
  if (!source?.actor || !target?.actor) return [];
  const own = grappleFor(source.document), theirs = grappleFor(target.document);
  if (own && (source === target || [own.source.token, own.target.token].includes(target.document.uuid))) {
    return own.source.token === source.document.uuid ? ["choke","throw","release"].map(action=>({action,label:({choke:"Душить",throw:"Бросить",release:"Отпустить"} as Record<string,string>)[action]+" — "+own.target.name,disabled:grappleActionBlocked(own)||action==="choke"&&own.choke?.combat===own.combat&&own.choke?.round===Number(game.combats?.get(own.combat??"")?.round),title:grappleActionBlocked(own)?"Доступно со следующего хода захватившего":""}))
      : [{action:"escape",label:"Вырваться — "+own.source.name}];
  }
  if (theirs?.source.token === target.document.uuid) return [{action:"break",label:"Разорвать захват"}];
  return source !== target && !own && !theirs ? [{action:"grab",label:"Схватить"}] : [];
}
