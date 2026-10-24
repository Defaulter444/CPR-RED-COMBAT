import { escapeHTML as escape } from "./shared.js";
import {requireParticipants,resolveEncounter,encounterRef,tokenEncounter,type EncounterRef} from "./encounter.js";
import {interactArmorSelected, halfArmorSelected, halfArmorControl, armorIgnorePercent} from "./half-armor.js";
import {reportExposure} from "./effect-events.js";
import {instantId} from "./instant-catalog.js";
import {createInstantCard} from "./instant-effects.js";
import { thrownRollItem } from "./thrown-weapons.js";
import { captureDamageApplication } from "./damage-application.js";
import { applyCriticalInjury, damageSixes, hasCriticalInjury, criticalLocation } from "./critical-injury.js";
import { damageStatusChoices, validateDamageStatuses, canonicalDamageStatus, inherentDamageStatuses, renderDamageStatusPicker } from "./damage-status.js";
import { resolutionSection } from "./card-structure.js";
import { diceJSON, showSavedDice, messageDiceAudience, rollHidden, nativeCard, type DiceAudience, type NativeRoll, type RollItem } from "./native-combat.js";
import type { Exchange } from "./combat-resolution.js";

export interface DamageValues {
  total: number; bonus: number; location: string; ablation: number; ammo: string;
  interactArmor?: boolean; ignorePercent: number; ignoreBelow: number; lethal: boolean;
}
export interface DamageResult { ammoType?:string; html: string; values: DamageValues; sixes?: number }
export interface DamageState {
  status: "rolling" | "rolled" | "applying" | "applied" | "review";
  effectsLocked?: boolean;
  selectedTargets?: {id:string; uuid:string; name:string}[];
  user: string; nonce: string; penetrated?: boolean; statusEffects?: string[]; applications?: string[]; result?: DamageResult; appliedTo?: string; recordedApplied?: boolean; application?: "recorded" | "selected"; applicationId?: string;
}
export interface DamageOptions { useShield: boolean; damageReductionRole: boolean; damageReductionAE: boolean; brainDamageReduction: boolean }
export interface DamageRequest {
  encounter?:EncounterRef;
  action: "damageAllowMiss" | "damageClaim" | "damageRelease" | "damageCommit" | "damageApply" | "damageReset" | "damageResolved" | "damageStatuses";
  interactArmor?: boolean; halfArmor?: boolean; statusEffects?: string[]; nonce?: string; damage?: DamageResult; options?: DamageOptions; targetUuid?: string; application?: "recorded" | "selected"; applicationId?: string;
}
export async function damageActor(uuid: string): Promise<Actor> {
  const token = await fromUuid(uuid) as TokenDocument | null;
  if (!token?.actor) throw new Error("Боевой токен или актёр больше не существует.");
  return token.actor;
}
function configureAreaAmmo(roll:NativeRoll,data:Exchange):void {
  if (data.areaAmmo) {
    const native=roll as NativeRoll & {rollCardExtraArgs:Record<string,unknown>};
    native.rollCardExtraArgs={...native.rollCardExtraArgs,ammoType:data.areaAmmo.type,ammoVariety:data.areaAmmo.variety,ablationValue:data.areaAmmo.type==="armorPiercing"?2:1};
  }
}
export function configureDamage(roll: NativeRoll, data: Exchange): void {
  if (data.damageFormula) roll.formula = data.damageFormula;
  configureAreaAmmo(roll,data);
  roll.location = data.location ?? "body";
  roll.isAimed = data.attackMode === "aimed";
  if (data.attackMode === "autofire") {
    const margin = data.total - (data.defense?.total ?? data.dv!);
    const maximum = Number(roll.autofireMultiplierMax);
    if (!Number.isFinite(maximum) || maximum < 1)
      throw new Error("Нет корректного превышения для автоогня или максимума оружия.");
    // A GM-approved miss uses an editable multiplier for the native dialog to review.
    roll.autofireMultiplier = Math.min(Math.max(Number.isFinite(margin) ? margin : 1, 1), maximum);
  }
}
export function damageValues(html: string): DamageValues {
  const node = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>('[data-action="applyDamage"]');
  if (!node) throw new Error("В карточке штатного урона нет данных для нанесения.");
  const get = (key: string) => node.getAttribute("data-" + key) ?? "";
  const number = (key: string, integer = true) => {
    const value = integer ? parseInt(get(key), 10) : parseFloat(get(key));
    return Number.isFinite(value) ? value : 0;
  };
  const location = get("damage-location");
  return { total: number("total-damage"), bonus: number("bonus-damage"),
    location: ["head", "brain"].includes(location) ? location : "body",
    ablation: number("ablation"), ammo: get("ammo-variety"), ignorePercent: number("ignore-armor-percent", false),
    ignoreBelow: number("ignore-below-sp"), lethal: /true/i.test(get("damage-lethal")) };
}
export function damageContent(data: Exchange, mode: "full" | "roll" = "full"): string {
  const damage = data.damage;
  if (!damage) return "";
  const labels = { rolling: "Идёт бросок урона", rolled: "Урон брошен — ждёт нанесения", applying: "Урон наносится — не применяйте повторно",
    applied: "Урон учтён", review: "Нанесение урона прервано — Мастер должен проверить HP, броню, щит и эффекты, прежде чем отметить решённым" };
  let html = "";
  if (damage.result) {
    const doc = new DOMParser().parseFromString(damage.result.html, "text/html");
    doc.querySelectorAll('[data-action="applyDamage"]').forEach(node => node.remove());
    const header = doc.querySelector(".rollcard-top .cpr-block");
    if (header) {
      const ammo = header.querySelector(".rollcard-subtitle-2-center")?.textContent?.trim() ?? "";
      const row = doc.createElement("div"); row.className = "pneuma-damage-heading";
      const label = doc.createElement("span"); label.className = "pneuma-damage-label";
      label.textContent = game.i18n!.localize("CPR.global.generic.damage");
      const ammoLabel = doc.createElement("span"); ammoLabel.className = "pneuma-damage-ammo"; ammoLabel.textContent = ammo;
      row.append(label, ammoLabel);
      header.replaceChildren(row);
    }
    html = doc.body.innerHTML + halfArmorControl(damage.result.values.ignorePercent,damage.result.values.interactArmor!==false);
  }
  const status = ["rolled", "applied"].includes(damage.status) ? ""
    : '<p class="pneuma-damage-status">' + labels[damage.status] + '</p>';
  const targets = (damage.selectedTargets ?? []).map(target=>'<li data-application-id="'+escape(target.id)+'">'+escape(target.name)+'</li>').join("");
  const history = targets ? '<div class="pneuma-damage-targets"><strong>Нанесено</strong><ol class="pneuma-damage-target-history" aria-label="Нанесено выбранным токенам">'+targets+'</ol></div>' : "";
  const actions = mode === "full" && damage.result ? resolutionSection("damage-apply",
    '<div class="rollcard-bottom pneuma-damage-application"><div class="cpr-block pneuma-damage-application-box"></div></div>'
      + history + '<div class="pneuma-damage-applications">' + (damage.applications ?? []).join("") + '</div>') : "";
  return '<div class="pneuma-damage-result">' + resolutionSection("damage-roll", html + status + (damage.result ? (mode === "full" ? '<div class="pneuma-damage-effects-slot"></div>' : '<div class="pneuma-aoe-effects-picker"></div>') : ""))
    + actions + (mode === "full" ? resolutionSection("effects", '<div class="pneuma-damage-effect-results"></div>') : "") + (mode === "full" ? '<div class="pneuma-resolution-recovery-slot"></div>' : "") + "</div>";
}
export function recordedDamageApplied(data: Exchange): boolean {
  const damage = data.damage;
  return damage?.recordedApplied ?? (!!damage && damage.status === "applied" && !damage.application
    && (!damage.appliedTo || damage.appliedTo === data.defender));
}
export function damageEffectsLocked(damage?:DamageState):boolean {
  return !!damage && (!!damage.effectsLocked || ["applying","applied","review"].includes(damage.status) || !!damage.applicationId || !!damage.applications?.length);
}
/** Called only by the existing serialized GM coordinator. */
export async function handleDamage(request: DamageRequest, user: User, data: Exchange,
  save: () => Promise<void>, sourceMessage?: ChatMessage): Promise<void> {
  if(data.combatId===undefined&&request.encounter)Object.assign(data,request.encounter);
  if(data.combatId!==undefined)resolveEncounter(data);
  if (data.state !== "resolved") throw new Error("Урон доступен только после разрешённой атаки.");

  if (request.action === "damageAllowMiss") {
    if (!user.isGM) throw new Error("Разрешить урон при промахе может только Мастер.");
    if (data.hit !== false) throw new Error("Эта атака не промах.");
    data.damageAllowedOnMiss = true; await save(); return;
  }
  if (data.hit === false && !data.damageAllowedOnMiss && ["damageClaim", "damageCommit", "damageApply"].includes(request.action))
    throw new Error("Атака промахнулась. Сначала Мастер должен разрешить урон.");

  if (request.action === "damageStatuses") {
    const attacker = await damageActor(data.attacker);
    const defender = await damageActor(data.defender);
    if (!user.isGM && !attacker.testUserPermission(user, "OWNER") && !defender.testUserPermission(user, "OWNER"))
      throw new Error("Менять эффекты урона может только владелец участника или Мастер.");
    if (!data.damage?.result || !["rolled", "applied"].includes(data.damage.status))
      throw new Error("Эффекты урона нельзя менять, пока урон не нанесён или ждёт проверки Мастера.");
    if(damageEffectsLocked(data.damage))throw Error("Выбор эффектов заблокирован: разрешение уже началось.");
    data.damage.statusEffects = validateDamageStatuses(request.statusEffects);
    await save(); return;
  }
  const applying = request.action === "damageApply" || request.action === "damageResolved";
  const application = request.application ?? (request.targetUuid && request.targetUuid !== data.defender ? "selected" : "recorded");
  const destination = request.action === "damageApply" && application === "selected" ? request.targetUuid : data.defender;
  if (!destination) throw new Error("Выберите ровно один токен для нанесения урона.");
  if(request.action === "damageApply" && data.combatId && !data.areaTarget)requireParticipants(resolveEncounter(data)!,[destination]);
  const actor = await damageActor(applying ? destination : data.attacker);
  if (!user.isGM && !actor.testUserPermission(user, "OWNER")) throw new Error("Продолжить может только владелец этого актёра или Мастер.");
  const damage = data.damage;
  if (request.action === "damageClaim") {
    if (damage) throw new Error("Урон уже бросается или брошен.");
    if (data.improvised && (!Number.isInteger(data.improvisedDice) || data.improvisedDice! < 1 || data.improvisedDice! > 6))
      throw new Error("У этой старой импровизированной атаки нет выбора урона. Начните новую атаку.");
    if (!data.weaponId || !data.attackMode || !request.nonce) throw new Error("У этой старой атаки нет данных урона. Используйте штатный бросок урона оружия.");
    data.damage = { status: "rolling", user: user.id!, nonce: request.nonce }; await save(); return;
  }
  if (!damage) throw new Error("Нет ожидающего броска урона.");
  if (request.action === "damageReset") {
    if (!user.isGM || damage.status !== "rolling") throw new Error("Снять блокировку незавершённого броска урона может только Мастер.");
    delete data.damage; await save(); return;
  }
  if (request.action === "damageRelease") {
    if (damage.status === "rolling" && damage.user === user.id && damage.nonce === request.nonce) {
      delete data.damage; await save();
    }
    return;
  }
  if (request.action === "damageCommit") {
    if (damage.user !== user.id || damage.nonce !== request.nonce) throw new Error("Бронь урона истекла.");
    if (damage.status !== "rolling") return;
    const result = request.damage;
    if (!result || ![result.values.total, result.values.bonus, result.values.ablation, result.values.ignorePercent, result.values.ignoreBelow].every(Number.isFinite))
      throw new Error("Некорректный результат урона.");
    if (result.sixes !== undefined && (!Number.isInteger(result.sixes) || result.sixes < 0)) throw new Error("Некорректные кубики урона.");
    damage.result = result; damage.statusEffects ??= inherentDamageStatuses(result.ammoType); damage.status = "rolled"; await save(); return;
  }
  if (request.action === "damageResolved") {
    if (!user.isGM || !["review", "applying"].includes(damage.status)) throw new Error("Нет прерванного нанесения урона.");
    if (damage.application !== "selected") damage.recordedApplied = true;
    damage.status = "applied"; await save(); return;
  }
  if (request.action !== "damageApply") return;
  if (request.applicationId && damage.applicationId === request.applicationId) return;
  if (application === "recorded" && recordedDamageApplied(data)) return;
  if (!["rolled", "applied"].includes(damage.status) || !damage.result) throw new Error("Урон уже наносится или ждёт проверки Мастера.");
  if (!request.options || !Object.values(request.options).every(value => typeof value === "boolean")) throw new Error("Нет штатных параметров урона.");
  const target = actor as Actor & { _applyDamage(...args: unknown[]): Promise<void> };
  if (typeof target._applyDamage !== "function") throw new Error("Штатное нанесение урона недоступно.");
  const effects = validateDamageStatuses((damage.statusEffects ?? inherentDamageStatuses(damage.result?.ammoType)).slice(0, 3));
  const requestedEffects = validateDamageStatuses(request.statusEffects ?? inherentDamageStatuses(damage.result?.ammoType));
  if (JSON.stringify(effects) !== JSON.stringify(requestedEffects))
    throw new Error("Эффекты урона изменились. Проверьте обновлённую карточку и нанесите снова.");
  damage.statusEffects = effects;
  const v = damage.result.values;
  const interact=request.interactArmor??v.interactArmor;
  damage.recordedApplied = recordedDamageApplied(data);
  damage.application = application;
  damage.applicationId = request.applicationId ?? foundry.utils.randomID();
  damage.appliedTo = destination;
  damage.effectsLocked = true; damage.status = "applying"; await save();
  try {
    const token = await fromUuid(destination) as TokenDocument | null;
    const summaries = await captureDamageApplication(actor, token?.name ?? actor.name ?? "", v.location, damage.applicationId!,
      view => target._applyDamage.call(view, v.total, v.bonus, v.location, (interact===false || data.coverUp || data.weaponType === "martialArts" && game.settings!.get("redline-combat", "maNoAblation")) ? 0 : v.ablation, v.ammo, data.coverUp?2*armorIgnorePercent(v.ignorePercent,request.halfArmor,interact)-100:armorIgnorePercent(v.ignorePercent,request.halfArmor,interact), data.coverUp?v.ignoreBelow/2:v.ignoreBelow, v.lethal, request.options),
      data.coverUp?{ablation:interact===false?0:2*v.ablation,ignorePercent:armorIgnorePercent(v.ignorePercent,request.halfArmor,interact),ignoreBelow:v.ignoreBelow}:undefined, native=>{damage.penetrated=Number(native.rawDamageDealt)>0&&native.hpReduction>0;},data.attackMode==="aimed"&&v.location==="head");
    if(damage.penetrated) {
      const ammo=damage.result.ammoType;
      if(ammo&&ammo!=="incendiary")await reportExposure(actor,ammo);
    }
    damage.applications = [...(damage.applications ?? []), ...summaries];
    if (application === "selected") damage.selectedTargets = [...(damage.selectedTargets ?? []), {
      id:damage.applicationId!, uuid:destination, name:token?.name ?? actor.name ?? "Цель"
    }];
    const fire = canonicalDamageStatus("instant:incendiary");
    const area = !!foundry.utils.getProperty(sourceMessage??{},"flags.redline-combat.aoe");
    const followups=effects.filter(id=>!(canonicalDamageStatus(id)===fire && damage.result!.ammoType==="incendiary" && (!damage.penetrated || area)));
    if(damage.penetrated&&damage.result.ammoType==="incendiary"&&!foundry.utils.getProperty(sourceMessage??{},"flags.redline-combat.aoe")&&!followups.includes(fire))followups.push(fire);
    const visibility={blind:data.rollMode==="blindroll",whisper:["gmroll","blindroll"].includes(data.rollMode??"")?game.users!.filter(u=>u.isGM).map(u=>u.id!):data.rollMode==="selfroll"?[user.id!]:[]} as ChatMessage;
    for (const id of followups) {
      const instant=id.startsWith("instant:")?id.slice(8):"";
      await createInstantCard(actor,instantId(instant)?instant:"status",sourceMessage??visibility,data.combatId!==undefined?encounterRef(resolveEncounter(data),data.combatScene,data.combatTokens):undefined,instantId(instant)?undefined:id,destination);
    }
  } catch (error) {
    damage.status = "review"; await save();
    throw new Error("Нанесение урона или состояния прервано. Проверьте HP, броню, щит и эффекты, прежде чем продолжать: " + (error as Error).message);
  }
  // If this write fails, the persisted applying state prevents a second HP change.
  if (application === "recorded") damage.recordedApplied = true;
  damage.status = "applied"; await save();
}
const retry = new Map<string, { result: { nonce: string; damage: DamageResult }; dice: string[]; mode: string; roller: string; audience?: DiceAudience }>();
type Send = (action: DamageRequest["action"], extra?: Partial<DamageRequest>) => Promise<unknown>;
export async function rollDamage(id: string, data: Exchange, send: Send, modifyDialog = false): Promise<void> {
  const previous = retry.get(id);
  if (previous) {
    await send("damageCommit", previous.result); retry.delete(id);
    await showSavedDice(previous.dice,previous.mode,previous.roller,previous.audience); return;
  }
  const nonce = foundry.utils.randomID();
  await send("damageClaim", { nonce });
  try {
    const actor = await damageActor(data.attacker);
    const item = data.thrownSource ? thrownRollItem(data.thrownSource, actor, data.improvisedDice)
      : actor.items.get(data.weaponId!) as RollItem | undefined;
    if (!item?.createRoll) throw new Error("Исходное оружие недоступно.");
    let roll = item.createRoll("damage", actor, { damageType: data.attackMode });
    configureDamage(roll, data);
    if (!await roll.handleRollDialog({ type: "pneuma-damage", ctrlKey: !modifyDialog, metaKey: false }, actor, item)) return;
    roll = await item.confirmRoll(roll);
    if(data.areaAmmo)configureAreaAmmo(roll,data);
    await rollHidden(roll);
    roll.rollTitle = data.title;
    // The native global application button is replaced with our original-defender control.
    roll.entityData = { actor: actor.id!, token: data.attacker.split(".").at(-1)!, item: item.id!, tokens: [] };
    const html = await nativeCard(roll);
    const result = { nonce, damage: { ammoType:(roll as NativeRoll & {rollCardExtraArgs?:{ammoType?:string}}).rollCardExtraArgs?.ammoType, html, values: damageValues(html), sixes: damageSixes(roll) } };
    const message = game.messages?.get(id);
    const playback = {result,dice:diceJSON(roll),mode:data.rollMode,roller:game.user!.id,audience:message && messageDiceAudience(message)};
    retry.set(id, playback);
    await send("damageCommit", result); retry.delete(id);
    await showSavedDice(playback.dice,playback.mode,playback.roller,playback.audience);
  } finally {
    if (!retry.has(id)) await send("damageRelease", { nonce });
  }
}
export function selectedDamageTarget(): string {
  const tokens = canvas.tokens?.controlled ?? [];
  if (tokens.length !== 1) throw new Error("Выберите ровно один токен для нанесения урона.");
  const token = tokens[0]!;
  if (!token.actor?.isOwner) throw new Error("Нанести урон может только владелец выбранного актёра или Мастер.");
  return token.document.uuid;
}
export async function applyFromCard(data: Exchange, send: Send, shiftKey: boolean, targetUuid = data.defender, application: "recorded" | "selected" = "recorded", halfArmor?: boolean, interactArmor?: boolean): Promise<void> {
  const token=await fromUuid(targetUuid) as TokenDocument|null;
  const encounter=data.combatId!==undefined?encounterRef(resolveEncounter(data),data.combatScene,[...(data.combatTokens??[]),...(data.areaTarget?[]:[targetUuid])]):encounterRef(tokenEncounter(token?.parent?.id,[targetUuid]),token?.parent?.id,[targetUuid]);
  resolveEncounter(encounter);
  const actor = await damageActor(targetUuid);
  if (!actor.isOwner) throw new Error("Нанести урон может только владелец выбранного актёра или Мастер.");
  let options: DamageOptions = { useShield: true, damageReductionRole: true, damageReductionAE: true, brainDamageReduction: true };
  if (shiftKey) {
    const path = "/systems/cyberpunk-red-core/modules/dialog/cpr-dialog-application.js";
    const Dialog = (await import(path)).default as { showDialog(data: object, options: object): Promise<DamageOptions | undefined> };
    const location = data.damage!.result!.values.location;
    const chosen = await Dialog.showDialog({ ...options, allowedActors: [actor], forbiddenActors: [], count: 0,
      showBrainDamageReduction: location === "brain",
      allowedTypesMessage: game.i18n!.format("CPR.chat.damageApplication.prompt.allowedTypes", { location }) }, {
      title: game.i18n!.localize("CPR.chat.damageApplication.prompt.title"),
      template: "systems/cyberpunk-red-core/templates/dialog/cpr-damage-application-prompt.hbs",
    }).catch(() => undefined);
    if (!chosen) return;
    options = { useShield: !!chosen.useShield, damageReductionRole: !!chosen.damageReductionRole,
      damageReductionAE: !!chosen.damageReductionAE, brainDamageReduction: !!chosen.brainDamageReduction };
  }
  await send("damageApply", { encounter, halfArmor, interactArmor, targetUuid, application, applicationId: foundry.utils.randomID(), options,
    statusEffects: (data.damage?.statusEffects ?? inherentDamageStatuses(data.damage?.result?.ammoType)).slice(0, 3) });
}
export async function renderDamage(message: ChatMessage, data: Exchange, html: JQuery, send: Send, manual?: {canEditEffects: boolean; recordedOnly?: boolean}): Promise<void> {
  if (!manual && !data.weaponId || html.find(".pneuma-damage-controls, .pneuma-damage-recovery-controls").length) return;
  const attacker = manual ? {isOwner:false} : await damageActor(data.attacker);
  const defender = manual ? {isOwner:true} : await damageActor(data.defender);
  const panel = document.createElement("div"); panel.className = "pneuma-damage-controls";
  const recoveryPanel = document.createElement("div"); recoveryPanel.className = "pneuma-damage-recovery-controls";
  const button = (label: string, run: (event: MouseEvent) => Promise<unknown>, destination?: "recorded" | "selected", gmOnly = false) => {
    const node = document.createElement(destination ? "a" : "button");
    node.dataset.gmOnly = String(gmOnly);
    if (destination) {
      node.className = "pneuma-apply-damage";
      node.dataset.pneumaDamageTarget = destination;
      node.title = (destination === "recorded" ? "Нанести урон: " + data.defenderName : "Нанести урон выбранному токену") + " (Shift+щелчок — параметры)";
      node.setAttribute("aria-label", node.title);
      node.setAttribute("role", "button"); node.tabIndex = 0;
      const icon = document.createElement("i"); icon.className = "fas fa-bolt"; icon.setAttribute("aria-hidden", "true");
      node.append(icon);
      const row = document.createElement("div"); row.className = "pneuma-damage-recipient";
      row.append(node); panel.append(row);
      if (!manual && hasCriticalInjury(data)) {
        const injury = document.createElement("a"); injury.className = "pneuma-apply-critical";
        injury.dataset.pneumaDamageTarget = destination;
        injury.title = "Бросить/нанести критическую травму (" + (criticalLocation(data) === "head" ? "голова" : "тело") + ") — " + (destination === "recorded" ? data.defenderName : "выбранный токен");
        injury.setAttribute("aria-label", injury.title); injury.setAttribute("role", "button"); injury.tabIndex = 0;
        const die = document.createElement("i"); die.className = "fas fa-heart-crack"; die.setAttribute("aria-hidden", "true");
        injury.append(die); row.append(injury);
        let rolling = false;
        injury.addEventListener("click", async event => {
          event.preventDefault(); event.stopPropagation(); if (rolling) return;
          rolling = true; injury.setAttribute("aria-disabled", "true");
          try { await applyCriticalInjury(data, destination === "recorded" ? data.defender : selectedDamageTarget()); }
          catch (error) { ui.notifications!.error((error as Error).message); }
          finally { rolling = false; injury.removeAttribute("aria-disabled"); }
        });
        injury.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); injury.click(); }
        });
      }
      const recipientLabel=document.createElement("span"); recipientLabel.className="pneuma-damage-recipient-label"; recipientLabel.textContent=" " + label; row.append(recipientLabel);
      node.addEventListener("keydown", event => {
        if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === " ") { event.preventDefault(); node.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: (event as KeyboardEvent).shiftKey })); }
      });
    } else {
      (node as HTMLButtonElement).type = "button"; node.textContent = label; recoveryPanel.append(node);
    }
    const locked = destination === "recorded" && recordedDamageApplied(data);
    if (locked) node.setAttribute("aria-disabled", "true");
    let busy = false;
    node.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      if (busy || locked) return;
      busy = true; node.setAttribute("aria-disabled", "true");
      if (node instanceof HTMLButtonElement) node.disabled = true;
      try { await run(event as MouseEvent); } catch (error) { ui.notifications!.error((error as Error).message); ui.chat?.updateMessage(message); }
      finally {
        busy = false; node.removeAttribute("aria-disabled");
        if (node instanceof HTMLButtonElement) node.disabled = false;
      }
    });
  };
  const effectsPanel = document.createElement("div"); effectsPanel.className = "pneuma-damage-effects-picker";
  const drop = html.find('[data-action="pneumaRollDamage"]');

  const missed = !manual && data.hit === false && !data.damageAllowedOnMiss;
  if (missed && game.user!.isGM) button("Разрешить урон при промахе", () => send("damageAllowMiss"), undefined, true);
  if (!missed && attacker.isOwner && !data.damage && (!data.improvised || data.improvisedDice)) drop.on("click", event => {
    event.preventDefault(); event.stopPropagation();
    void rollDamage(message.id!, data, send, !!event.shiftKey).catch(error => { ui.notifications!.error(error.message); ui.chat?.updateMessage(message); });
  });
  else drop.prop("disabled", true).attr("aria-disabled", "true").attr("title", missed ? "Промах — Мастер может разрешить урон" : data.damage ? "Урон уже начат или учтён" : data.improvised && !data.improvisedDice ? "У этой старой импровизированной атаки нет выбора урона. Начните новую атаку" : "Бросать урон может только владелец атакующего или Мастер");
  const status = data.damage?.status;
  if (attacker.isOwner && status === "rolling" && retry.has(message.id!))
    button("Завершить бросок урона", () => rollDamage(message.id!, data, send));
  if (data.damage?.result && (attacker.isOwner || defender.isOwner || game.user!.isGM)) {

    const statusBox = document.createElement("div"); statusBox.className = "pneuma-damage-status-effects";
    const selected = (data.damage.statusEffects ?? inherentDamageStatuses(data.damage.result?.ammoType)).slice(0, 3);
    renderDamageStatusPicker(statusBox,selected,damageEffectsLocked(data.damage),
      manual?.canEditEffects===false||!["rolled","applied"].includes(status!),
      statusEffects=>send("damageStatuses",{statusEffects}));
    if (!manual?.recordedOnly || manual.canEditEffects) effectsPanel.append(statusBox);
    if (!manual || manual.recordedOnly) button(data.defenderName, event => applyFromCard(data, send, event.shiftKey, data.defender, "recorded", halfArmorSelected(event), interactArmorSelected(event)), "recorded");
    if (!manual?.recordedOnly) button("Выбранный токен", event => applyFromCard(data, send, event.shiftKey, selectedDamageTarget(), "selected", halfArmorSelected(event), interactArmorSelected(event)), "selected");
  }
  if (!manual && game.user!.isGM && status === "rolling") button("Снять блокировку броска урона", () => send("damageReset"), undefined, true);
  if (!manual && game.user!.isGM && (status === "review" || status === "applying"))
    button("Отметить решённым после проверки Мастера", () => send("damageResolved"), undefined, true);
  const actions = html.find(".pneuma-damage-application-box");
  if (panel.childElementCount) (actions.length ? actions : html.find(".message-content")).append(panel);
  if (effectsPanel.childElementCount) {
    const effectSlot = html.find(".pneuma-damage-effects-slot");
    (effectSlot.length ? effectSlot : html.find(".message-content")).append(effectsPanel);
  }
  if (recoveryPanel.childElementCount) {
    const recovery = document.createElement("div");
    recovery.innerHTML = resolutionSection("recovery", "");
    recovery.querySelector(".pneuma-resolution-body")!.append(recoveryPanel);
    const slot = html.find(".pneuma-resolution-recovery-slot");
    (slot.length ? slot : html.find(".message-content")).append(recovery.firstElementChild!);
  }
}
