import {barCombat,barEntries,type BarEntry} from "./combat-bar-state.js";
import { statusLabel } from "./status-labels.js";
let panel: HTMLElement | undefined;
let revision = 0;
let ownerId: string | undefined;
let ownerActorUuid: string | undefined;
let controlsOpen = false;

export function closeBarFlyout(): void {
  revision++;panel?.remove();panel=undefined;ownerId=undefined;ownerActorUuid=undefined;controlsOpen=false;
}

/** Effect changes invalidate only the affected actor's status tooltip, not native combat controls. */
export function invalidateBarStatuses(effect: ActiveEffect): void {
  if (!controlsOpen && ownerActorUuid
    && (effect.parent?.uuid === ownerActorUuid || effect.parent?.parent?.uuid === ownerActorUuid)) closeBarFlyout();
}

function createPanel(root: HTMLElement, row: HTMLElement, entry?: BarEntry): HTMLElement {
  closeBarFlyout();
  panel=document.createElement("div");panel.className="pneuma-bar-flyout";
  panel.style.top=`${row.getBoundingClientRect().top-root.getBoundingClientRect().top}px`;
  ownerId=entry?.id;
  ownerActorUuid=(entry?.actor??entry?.combatant?.actor??entry?.token?.actor)?.uuid;
  if(entry?.active&&root.querySelector(".pneuma-bar-end:not([hidden])"))panel.style.left="calc(100% + 64px)";
  if(root.dataset.orientation==="horizontal"){
    panel.style.left=`${Math.max(0,Math.min(row.getBoundingClientRect().left-root.getBoundingClientRect().left,window.innerWidth-root.getBoundingClientRect().left-270))}px`;
    panel.style.top="auto";
    panel.style.bottom=entry?.active&&root.querySelector(".pneuma-bar-end:not([hidden])")?"calc(100% + 32px)":"calc(100% + 4px)";
  }
  if(root.dataset.dock==="top-right") {
    if(root.dataset.orientation==="horizontal") {
      panel.style.top=entry?.active&&root.querySelector(".pneuma-bar-end:not([hidden])")?"calc(100% + 32px)":"calc(100% + 4px)";
      panel.style.bottom="auto";
    }
    else {panel.style.left="auto";panel.style.right=entry?.active?"calc(100% + 64px)":"calc(100% + 4px)";}
  }
  root.append(panel);
  return panel;
}

export function showBarStatuses(root: HTMLElement, row: HTMLElement): void {
  if (!game.user?.isGM || controlsOpen || ownerId===row.dataset.entryId) return;
  const entry=barEntries().find(entry=>entry.id===row.dataset.entryId);
  if(!entry)return;
  const effects=(entry.actor??entry.combatant?.actor??entry.token?.actor)?.temporaryEffects.filter(effect=>!!effect.img)??[];
  closeBarFlyout();
  if(!effects.length)return;
  const flyout=createPanel(root,row,entry);flyout.classList.add("pneuma-bar-statuses");
  flyout.setAttribute("role","tooltip");flyout.setAttribute("aria-label",`${entry.name}: состояния`);
  for(const effect of effects){
    const icon=document.createElement("img");icon.src=effect.img!;icon.alt=statusLabel(effect.name??"Состояние");icon.title=statusLabel(game.i18n!.localize(effect.name??"Состояние"));
    flyout.append(icon);
  }
}

interface NativeTracker {
  viewed: Combat;
  template: string;
  getData(): Promise<object>;
  _onCombatControl(event: Event): Promise<unknown>;
  _onCombatantControl(event: Event): Promise<unknown>;
  _onPingCombatant(combatant: Pick<Combatant, "sceneId" | "token">): Promise<unknown>;
  _onPanToCombatant(combatant: Pick<Combatant, "sceneId" | "token">): Promise<unknown>;
}

/** Players use native tracker visibility; GMs can navigate any token on the current canvas. */
export async function navigateBarEntry(id: string, action: "ping" | "pan" | "pull"): Promise<void> {
  const entry = barEntries().find(entry => entry.id === id);
  if (!entry?.token || !canvas.ready) return;
  if (game.user?.isGM) {
    if (entry.token.document.parent?.id !== canvas.scene?.id) return;
    if (action === "pull") {
      // V12 merges pull/style into the broadcast ping; the published types omit these options.
      const options: NonNullable<Parameters<typeof canvas.ping>[1]> & {pull: boolean; style: string} = {pull: true, style: CONFIG.Canvas.pings.types.PULL};
      await canvas.ping(entry.token.center, options);
    }
    else if (action === "ping") await canvas.ping(entry.token.center);
    else await canvas.animatePan({...entry.token.center, scale: Math.max(canvas.stage!.scale.x, 0.5)});
    return;
  }
  if (action === "pull" || !ui.combat) return;
  // Outside combat, the same native methods only need a scene ID and TokenDocument.
  const combatant = entry.combatant ?? {sceneId: entry.token.document.parent?.id ?? null, token: entry.token.document};
  const tracker = ui.combat as unknown as NativeTracker;
  if (action === "ping") await tracker._onPingCombatant(combatant);
  else await tracker._onPanToCombatant(combatant);
}

export async function showBarControls(root: HTMLElement,row: HTMLElement): Promise<void> {
  const combat=barCombat(),entry=barEntries(combat).find(entry=>entry.id===row.dataset.entryId);
  if(!combat||!entry?.combatant||!ui.combat)return;
  if(controlsOpen&&ownerId===entry.id){closeBarFlyout();return;}
  const flyout=createPanel(root,row,entry);controlsOpen=true;
  flyout.classList.add("combatant","pneuma-bar-controls");flyout.dataset.combatantId=entry.id;
  flyout.setAttribute("aria-label",`${entry.name}: управление боем`);
  // V12's tracker uses this.viewed in both its template data and per-combatant handler.
  // A view context reuses that configured tracker without changing the open sidebar encounter.
  const tracker=Object.assign(Object.create(ui.combat),{viewed:combat}) as NativeTracker;
  const current=revision;
  const html=await renderTemplate(tracker.template,await tracker.getData());
  if(current!==revision||!root.isConnected)return;
  const template=document.createElement("template");template.innerHTML=html;
  const nativeRow=Array.from(template.content.querySelectorAll<HTMLElement>("[data-combatant-id]")).find(row=>row.dataset.combatantId===entry.id);
  for(const control of Array.from(nativeRow?.querySelectorAll<HTMLElement>(".combatant-control")??[])){
    // Native initiative artwork can be black; use the bar's inherited foreground color.
    if (control.dataset.control === "rollInitiative") {
      const icon = document.createElement("i"); icon.className = "fas fa-dice-d20";
      icon.setAttribute("aria-hidden", "true"); control.replaceChildren(icon);
    }
    control.addEventListener("click",event=>{
      event.preventDefault();event.stopPropagation();
      if(!barEntries().some(row=>row.id===entry.id)||barCombat()?.id!==combat.id)return;
      const action=control.dataset.control;
      const result=game.user?.isGM&&(action==="pingCombatant"||action==="panToCombatant")
        ? navigateBarEntry(entry.id,action==="pingCombatant"?"ping":"pan")
        : tracker._onCombatantControl(event);
      void Promise.resolve(result).catch(error=>ui.notifications!.error(String(error)));
      closeBarFlyout();
    });
    flyout.append(control);
  }
  if(!flyout.children.length)closeBarFlyout();
}

export function leaveBarFlyout(): void {if(!controlsOpen)closeBarFlyout();}

/** Reuse the configured native tracker's encounter-wide initiative actions. */
export async function showBarInitiative(root: HTMLElement, round: HTMLElement): Promise<void> {
  const combat=barCombat();
  if(!game.user?.isGM||!combat||!ui.combat||panel?.classList.contains("pneuma-bar-initiative"))return;
  const flyout=createPanel(root,round);controlsOpen=true;
  flyout.classList.add("pneuma-bar-initiative");
  flyout.setAttribute("aria-label","Управление инициативой");
  const tracker=Object.assign(Object.create(ui.combat),{viewed:combat}) as NativeTracker;
  const current=revision;
  const html=await renderTemplate(tracker.template,await tracker.getData());
  if(current!==revision||!root.isConnected)return;
  const template=document.createElement("template");template.innerHTML=html;
  for(const [action,label] of [["rollAll","Бросить инициативу всем"],["rollNPC","Бросить инициативу НПС"],["resetAll","Сбросить инициативу"]] as const){
    const control=document.createElement("button");control.type="button";
    const native=template.content.querySelector<HTMLElement>(`.combat-control[data-control="${action}"]`);
    if(!native)continue;
    control.className="combat-control";control.dataset.control=action;
    control.title=native.title||label;control.setAttribute("aria-label",label);
    for(const child of Array.from(native.childNodes))control.append(child.cloneNode(true));
    control.addEventListener("click",event=>{
      event.preventDefault();event.stopPropagation();
      if(!game.user?.isGM||barCombat()?.id!==combat.id)return;
      void tracker._onCombatControl(event).catch(error=>ui.notifications!.error(String(error)));
      closeBarFlyout();
    });
    flyout.append(control);
  }
  if(!flyout.children.length){closeBarFlyout();return;}
  flyout.addEventListener("pointerleave",()=>closeBarFlyout());
}
