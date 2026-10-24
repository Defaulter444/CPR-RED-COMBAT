import {medicalMenuGroups} from "./medical-menu.js";
import {registerSceneEffects} from "./scene-effects.js";
import {registerDamageStatusPicker} from "./damage-status.js";
import {registerCombatSummary} from "./combat-summary.js";
import {registerMedical,medicalEntries,performMedical} from "./medical.js";
import {registerDamageReversal} from "./damage-reversal.js";
import {registerChatResultDelay} from "./chat-result-delay.js";
import {installChatRenderGuard} from "./chat-render-guard.js";
import {registerStatusCleanup} from "./status-cleanup.js";
import {selfIce} from "./quickhack/self-ice.js";
import {overrideBreach} from "./quickhack/connections.js";
import {selfActions,performSelfAction} from "./self-actions.js";
import {registerNotificationSoundSettings} from "./notification-sound-settings.js";
import {registerNotificationSounds} from "./notification-sounds.js";
import {registerTurnAlerts} from "./turn-alerts.js";
import {registerSheetAttacks} from "./sheet-attacks.js";
import {canWake,wakeUsingAction,registerWake} from "./wake.js";
import {registerDisplaySettings} from "./display-settings.js";
import {registerCombatBarSettings} from "./combat-bar-settings.js";
import {registerChatButtons} from "./chat-buttons.js";
import {registerHalfArmor} from "./half-armor.js";
import {registerManualRolls} from "./manual-rolls.js";
import {registerInjuryNotices} from "./injury-notices.js";
import {registerPlayersControl} from "./players-control.js";
import {openTurnMarkerSettings,registerTurnMarkerSettings} from "./turn-marker-settings.js";
import {registerTurnMarker} from "./turn-marker.js";
import {registerSuppression} from "./suppression.js";
import { registerCombatBar } from "./combat-bar.js";
import {registerInjuryMechanics} from "./injury-mechanics.js";
import {registerNativeEffectIntegration} from "./native-effect-integration.js";
import {registerInstantEffects} from "./instant-effects.js";
import { registerSelfCTH, isSelfCTH, selfInitiativeControl, rerollSelfInitiative } from "./self-cth.js";
import { registerHoverEKG } from "./ekg-hover.js";
import { registerMovement } from "./movement.js";
import { bindWeaponAmmo, refreshWeaponAmmo } from "./weapon-ammo.js";
import { registerAmmoChat } from "./ammo-chat.js";
import { DEFAULT_ICON_COLOR, installIconColorNormalization } from "./icon-color.js";
import { registerEmp } from "./emp.js";
import { registerAreaAttacks } from "./aoe/workflow.js";
import { registerSocketHealth } from "./socket-health.js";
import { registerResolutionScroll } from "./resolution-scroll.js";
import { registerGrapple, useGrapple } from "./grapple/workflow.js";
import { grappleMenu, grappleWeaponBlocked } from "./grapple/state.js";
import { registerQuickhack } from "./quickhack/integration.js";
import { registerSettingsLayout } from "./settings-layout.js";
import { enabled as quickhackEnabled } from "./quickhack/settings.js";
import { quickhackTargetVisible } from "./quickhack/availability.js";
import { actorQuickhacks, executeQuickhack } from "./quickhack/workflow.js";
import { connectionFor, trackingCombat, jackOut } from "./quickhack/connections.js";
import { hasQuickhackSight } from "./quickhack/sight.js";
import { registerCyberpunkStatuses } from "./status-settings.js";
import { registerEyeHUD } from "./eye-hud.js";
import { registerItemMarkers, decorateItemList } from "./item-markers.js";
import { registerCriticalSettings } from "./critical-settings.js";
import { registerCombatResolution } from "./combat-resolution.js";
import { registerArmorShortcut } from "./armor-shortcut.js";
import { canShowQuickhack, refreshAttackAmmoLabels, attackEntries, thrownEntries, grenadeEntries, attackFromHUD, type MenuWeapon, type AttackMode } from "./attack-menu.js";
import { registerHoverDV } from "./dv-hover.js";
import { registerEvasionSettings } from "./evasion-settings.js";
import { combatToolsBlocker } from "./availability-gate.js";
import { areaKind } from "./aoe/weapon.js";
import { primaryGM } from "./shared.js";

declare global {
interface SettingConfig {
  "redline-combat.maNoAblation": boolean;
  "redline-combat.targetedRightClick": boolean;
  "redline-combat.tightHUD": boolean;
  "redline-combat.iconColor": string | null;
  "redline-combat.hudScale": number;
  "redline-combat.statusIconScale": number;
}
}

const MODULE_ID = "redline-combat";
const TEMPLATE = `modules/${MODULE_ID}/combat/templates/combat-hud.hbs`;
const label = (key: string) => game.i18n!.localize(`PNEUMA_COMBAT_TOOLS.${key}`);
let selection: { target: Token; attacker: Token | undefined; combatOnly?: boolean; anchor: { x: number; y: number } } | undefined;
const isStandalone = (token: Token) => !["container", "blackIce", "demon"].includes(String(token.actor?.type)) && !isSelfCTH(token, selection?.target === token ? selection.attacker : selectedAttacker()) && (!!game.user?.isGM || !token.isOwner || (selection?.target === token && !!selection.combatOnly));
const selectedAttacker = () => {
  const tokens = canvas.tokens!.controlled.filter(token => token.actor?.isOwner && !["container", "blackIce", "demon"].includes(String(token.actor.type)));
  return tokens.length === 1 ? tokens[0] : undefined;
};

Hooks.once("init", () => {
  if (game.system!.id !== "cyberpunk-red-core") return;
  const blocker = combatToolsBlocker();
  if (blocker) { Hooks.once("ready", () => { if (game.user?.isGM) ui.notifications!.warn(blocker, {permanent: true}); }); return; }
  Hooks.once("ready", registerDockAttackAPI);
  registerSocketHealth();
  registerChatResultDelay();
  Hooks.once("ready",()=>installChatRenderGuard(ChatLog.prototype));
  registerAmmoChat();
  registerSheetAttacks();
  registerSceneEffects();
  registerManualRolls();
  registerHalfArmor();
  registerChatButtons();
  registerDamageReversal();
  registerCombatSummary();
  registerStatusCleanup();
  registerMedical();
  registerSelfCTH();
  registerQuickhack(() => { const target = canvas.tokens?.hud?.object ?? undefined; const source = selection && selection.target === target ? selection.attacker : selectedAttacker(); return {source, target, self:isSelfCTH(target,source)}; });
  registerGrapple();
  registerResolutionScroll();
  registerCyberpunkStatuses();
  registerDamageStatusPicker();
  registerEyeHUD();
  registerHoverDV();
  registerHoverEKG();
  registerArmorShortcut();
  registerItemMarkers();
  registerEvasionSettings();
  registerCombatResolution();
  registerCombatBar();
  registerTurnMarker();
  registerNotificationSounds();
  registerNotificationSoundSettings();
  registerTurnAlerts();
  registerTurnMarkerSettings();
  registerSuppression();
  registerPlayersControl();
  registerMovement();
  registerInjuryMechanics();
  registerInjuryNotices();
  registerEmp();
  registerInstantEffects();
  registerNativeEffectIntegration();
  registerAreaAttacks();
  registerWake();
  registerCriticalSettings();
  registerSettingsLayout();
  game.settings!.register(MODULE_ID, "maNoAblation", {
    name: "Боевые искусства не изнашивают броню", hint: "Боевые искусства по-прежнему учитывают половину SP, но не изнашивают броню при уроне из карточки боя.",
    scope: "world", config: true, type: Boolean, default: false,
  });
  game.settings!.register(MODULE_ID, "targetedRightClick", {
    name: "PNEUMA_COMBAT_TOOLS.TargetedRightClickName",
    hint: "PNEUMA_COMBAT_TOOLS.TargetedRightClickHint",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings!.register(MODULE_ID, "tightHUD", {
    name: "PNEUMA_COMBAT_TOOLS.TightHUDName", hint: "PNEUMA_COMBAT_TOOLS.TightHUDHint",
    scope: "client", config: true, type: Boolean, default: false, onChange: refreshHUDPosition,
  });
  game.settings!.register(MODULE_ID, "iconColor", {
    name: "PNEUMA_COMBAT_TOOLS.IconColorName", hint: "PNEUMA_COMBAT_TOOLS.IconColorHint",
    scope: "world", config: true, default: DEFAULT_ICON_COLOR,
    // Foundry v12 accepts DataField instances; the pinned settings typings omit this overload.
    // @ts-expect-error Native ColorField provides validation and the settings color picker.
    type: new foundry.data.fields.ColorField(),
    onChange: refreshHUDPosition,
  });
  Hooks.once("setup", () => installIconColorNormalization(game.settings!));
  for (const key of ["hudScale", "statusIconScale"] as const) {
    game.settings!.register(MODULE_ID, key, {
      name: `PNEUMA_COMBAT_TOOLS.${key}Name`, hint: `PNEUMA_COMBAT_TOOLS.${key}Hint`,
      scope: "client", config: true, type: Number, default: 1,
      range: { min: 0.5, max: 2, step: 0.1 }, onChange: refreshHUDPosition,
    });
  }
  registerDisplaySettings();
  registerCombatBarSettings();
  // Use Foundry's click/unclick handlers so combat clicks never call Token.control().
  CONFIG.Token.objectClass = class CombatToken extends CONFIG.Token.objectClass {
    private combatClick = false;

    private canOpenCombatMenu() {
      return canvas.activeLayer === canvas.tokens && this.isVisible && !this.isPreview && !!this.actor && !["container", "blackIce", "demon"].includes(String(this.actor.type))
        && canvas.controls?.ruler?.state !== Ruler.STATES.MEASURING;
    }

    private useCombatMenu(event: PIXI.FederatedPointerEvent) {
      return this.canOpenCombatMenu() && ((game.user?.isGM && !this.controlled) || !this.isOwner || event.shiftKey
        || (this.isTargeted && !!game.settings!.get(MODULE_ID, "targetedRightClick")));
    }

    protected override _canHUD(user: User, event: PIXI.FederatedPointerEvent) {
      return super._canHUD(user, event) || this.useCombatMenu(event);
    }

    protected override _onClickRight(event: PIXI.FederatedPointerEvent) {
      this.combatClick = this.useCombatMenu(event);
      selection = { target: this, attacker: selectedAttacker(), combatOnly: this.combatClick && event.shiftKey, anchor: event.getLocalPosition(canvas.stage!) };
      if (!this.combatClick) return super._onClickRight(event);
      event.stopPropagation();
    }

    protected override _onUnclickRight(event: PIXI.FederatedPointerEvent) {
      if (!this.combatClick) return super._onUnclickRight(event);
      this.combatClick = false;
      event.stopPropagation();
      // Native MouseInteractionManager only emits unclick for clicks, never completed drags.
      if (!this.canOpenCombatMenu()) return;
      const hud = canvas.tokens!.hud;
      if (hud.object === this) hud.render(true);
      else hud.bind(this);
    }

    protected override _onClickRight2(event: PIXI.FederatedPointerEvent) {
      if (!this.useCombatMenu(event)) return super._onClickRight2(event);
      // A combat double-click must not open token configuration or change targets.
      event.stopPropagation();
    }
  };
  // Extend the configured HUD: retain native positioning, lifecycle, and renderTokenHUD hooks.
  CONFIG.Token.hudClass = class CombatTokenHUD extends CONFIG.Token.hudClass {
    override get template() {
      return this.object && isStandalone(this.object) ? TEMPLATE : super.template;
    }

    override setPosition() {
      const token = this.object;
      if (!token || !this.element.length) return;
      super.setPosition();
      if (["container", "blackIce", "demon"].includes(String(token.actor?.type))) return;
      const oneByOne = token.document.width === 1 && token.document.height === 1;
      const anchor = !oneByOne && selection?.target === token ? selection.anchor : token.center;
      // #hud already follows canvas zoom. Cancel it once for the entire Token HUD.
      const scale = game.settings!.get(MODULE_ID, "hudScale") / canvas.stage!.scale.x;
      this.element.css({
        width: 100, height: 100, left: anchor.x - 50 * scale, top: anchor.y - 50 * scale,
        transform: `scale(${scale})`,
        "--pneuma-cth-icon-color": game.settings!.get(MODULE_ID, "iconColor") || DEFAULT_ICON_COLOR,
        "--pneuma-status-icon-size": `${36 * game.settings!.get(MODULE_ID, "statusIconScale")}px`,
      }).removeClass("large").addClass("pneuma-readable-hud")
        .toggleClass("pneuma-tight-hud", game.settings!.get(MODULE_ID, "tightHUD"));
    }
    override getData(options = {}) {
      if (["container", "blackIce", "demon"].includes(String(this.object?.actor?.type))) return super.getData(options);
      const attacker = selection && selection.target === this.object ? selection.attacker : selectedAttacker();
      const selfCTH = isSelfCTH(this.object ?? undefined, attacker);
      const selfGrapple = selfCTH ? grappleMenu(this.object ?? undefined, this.object ?? undefined) : [];
      const medical = medicalEntries(attacker?.actor??(selfCTH?this.object?.actor??undefined:undefined),this.object?.actor??undefined);
      const wake = !selfCTH && canWake(attacker,this.object??undefined);
      if (selfCTH) return {...super.getData(options), standalone: false, selfCTH: true, medicalAvailable:medical.length>0, medicalQuickFix:medicalMenuGroups(medical.filter(row=>row.action==="quickFix")), medical:medicalMenuGroups(medical.filter(row=>row.action!=="quickFix")), grappleActions:selfGrapple.filter(row=>row.action!=="escape"), selfEscapes:selfGrapple.filter(row=>row.action==="escape"), selfInitiative: selfInitiativeControl(this.object!), selfActions:selfActions(this.object!.actor!), selfThrown:[...thrownEntries(Array.from(this.object!.actor!.items) as unknown as MenuWeapon[]),...grenadeEntries(Array.from(this.object!.actor!.items) as unknown as MenuWeapon[])]};
      const connection = attacker?.actor && this.object?.actor ? connectionFor(attacker.actor, this.object.actor.uuid) : undefined;
      const ice = selfIce(this.object?.actor ?? undefined, connection?.breachCleared ?? 0);
      const sight = !!attacker && !!this.object && quickhackEnabled() && hasQuickhackSight(attacker, this.object);
      const offensiveQuickhacks = !!attacker?.actor && attacker.actor.uuid !== this.object?.actor?.uuid
        && quickhackTargetVisible(this.object?.actor?.items ?? [], game.settings!.get(MODULE_ID, "quickhackRequireNeuroport"))
        && quickhackEnabled() && canShowQuickhack(Array.from(attacker.actor.items) as unknown as MenuWeapon[]);
      return {
        ...super.getData(options),
        medicalAvailable: medical.length>0||wake,
        medicalQuickFix: medicalMenuGroups(medical.filter(row=>row.action==="quickFix")),
        medical: medicalMenuGroups(medical.filter(row=>row.action!=="quickFix")),
        canWake: wake,
        offensiveQuickhacks,
        selfIce: connection?.state === "active" && ice.walls ? ice : undefined,
        canBreach: sight && connection?.state === "active" && ice.blocked,
        gmBreach: game.user?.isGM && connection?.state === "active" && ice.walls > 0,
        standalone: isStandalone(this.object!),
        attackTitle: game.user!.isGM && attacker ? game.i18n!.format("PNEUMA_COMBAT_TOOLS.AttackAs", { name: attacker.name }) : label("Attack"),
        weapons: attacker ? [...attackEntries(Array.from(attacker.actor!.items) as unknown as MenuWeapon[]), ...thrownEntries(Array.from(attacker.actor!.items) as unknown as MenuWeapon[])].map(row => ({...row, deferred: ("deferred" in row && row.deferred) || grappleWeaponBlocked(attacker.actor!, attacker.actor!.items.get(row.id!)!)})) : [],
        grappleActions: grappleMenu(attacker, this.object ?? undefined),
        grenades: attacker ? grenadeEntries(Array.from(attacker.actor!.items) as unknown as MenuWeapon[]) : [],
        weaponEmpty: label(attacker ? "NoEquippedWeapons" : "SelectAttacker"),
        quickhacks: attacker?.actor && quickhackEnabled() ? actorQuickhacks(attacker.actor) : [],
        quickhackConnected: sight && connection?.state === "active" && !ice.blocked,
        quickhackJackInDisabled: connection?.state === "ejected" || (connection?.state !== "active" && !sight),
        quickhackJackAction: connection?.state === "active" ? "jack-out" : "jack-in",
        quickhackStatus: connection?.state === "active" ? "Подключён" : connection?.state === "ejected" ? "Выброшен" : "Не подключён",
        quickhackNote: (!trackingCombat() ? "Вне боя — для квикхака нужно отслеживаемое подключение" : "") + (sight ? "" : " — нет линии видимости"),
        controls: [
          { action: "attack", icon: "fa-gun", title: label("Attack") },
          { action: "melee", icon: "", title: label("CloseCombat") },
          { action: "thrown", icon: "fa-bomb", title: label("Thrown") },
          { action: "quickhacks", icon: "fa-microchip", title: label("Quickhacks") },
        ].filter(control => (control.action !== "quickhacks" || offensiveQuickhacks)),
      };
    }

    override activateListeners(html: JQuery) {
      if (!isStandalone(this.object!)) super.activateListeners(html);
      // The standalone template has no editable attributes or native status tray.
      else BasePlaceableHUD.prototype.activateListeners.call(this, html);
    }
  };
});

Hooks.on("renderTokenHUD", async (hud: TokenHUD, html: JQuery, data: { standalone: boolean; selfCTH?: boolean; attackTitle: string; quickhackStatus: string }) => {
  const token = hud.object;
  if (game.system!.id !== "cyberpunk-red-core" || !token?.actor || ["container", "blackIce", "demon"].includes(String(token.actor.type))) return;
  if (!data.standalone) {
    const controls = await renderTemplate(TEMPLATE, data);
    if (hud.object !== token || hud.element[0] !== html[0]) return;
    html.find(".col.right").first().append(controls);
  }
  Hooks.callAll("pneumaCombatToolsRenderCTH", hud, html, data);
  const medicalSource=(selection?.target===token?selection.attacker:selectedAttacker())??(data.selfCTH?token:undefined);
  html.find("[data-medical-toggle]").on("click keydown",event=>{
    if(event.type==="keydown"&&!["Enter"," "].includes(event.key??""))return;
    event.preventDefault();event.stopPropagation();const panel=html.find("[data-medical-menu]"),open=panel.prop("hidden");
    html.find(".pneuma-self-menu").prop("hidden",true);html.find(".pneuma-target-menu").removeClass("active");
    html.find("[data-self-settings-toggle], [data-self-close-toggle], [data-self-thrown-toggle], [data-self-actions-toggle]").removeClass("active").attr("aria-expanded","false");
    panel.prop("hidden",!open);$(event.currentTarget).toggleClass("active",open).attr("aria-expanded",String(open));
    const colors=getComputedStyle(event.currentTarget);panel.find(".combat-heading").css({backgroundColor:colors.backgroundColor,color:colors.color,borderColor:colors.borderColor});
  });
  html.find<HTMLButtonElement>("[data-medical-action]").on("click",async event=>{
    event.preventDefault();event.stopPropagation();const button=event.currentTarget;if(button.disabled||!medicalSource)return;button.disabled=true;
    try{await performMedical(medicalSource,token,button.dataset.medicalAction!,button.dataset.medicalItem||undefined,!!event.shiftKey,button.dataset.medicalSkill||undefined);}
    catch(error){ui.notifications!.error((error as Error).message);}finally{if(hud.object===token)hud.render(true);}
  });
  if (data.selfCTH) {
    const menus = ["settings", "close", "thrown", "actions"];
    const closeMenus = () => {
      html.find("[data-medical-menu]").prop("hidden",true);html.find("[data-medical-toggle]").removeClass("active").attr("aria-expanded","false");
      for (const name of menus) {
        html.find(`[data-self-${name}-menu]`).prop("hidden", true);
        html.find(`[data-self-${name}-toggle]`).removeClass("active").attr("aria-expanded", "false");
      }
    };
    for (const name of menus) html.find(`[data-self-${name}-toggle]`).on("click keydown", event => {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key ?? "")) return;
      event.preventDefault(); event.stopPropagation();
      const panel = html.find(`[data-self-${name}-menu]`), open = panel.prop("hidden");
      closeMenus();
      panel.prop("hidden", !open);
      $(event.currentTarget).toggleClass("active", open).attr("aria-expanded", String(open));
      const colors = getComputedStyle(event.currentTarget);
      panel.find(".combat-heading").css({backgroundColor: colors.backgroundColor, color: colors.color, borderColor: colors.borderColor});
    });
    html.find("[data-turn-animation]").on("click",event=>{
      event.preventDefault();event.stopPropagation();openTurnMarkerSettings(token.document);
      closeMenus();
    });
    html.find<HTMLButtonElement>("[data-self-grapple]").on("click",async event=>{
      event.preventDefault();event.stopPropagation();if(event.currentTarget.disabled)return;
      hud.clear();
      await useGrapple(token,token,event.currentTarget.dataset.selfGrapple!,!!event.shiftKey);
      if(hud.object===token)hud.render(true);
    });
    html.find<HTMLButtonElement>("[data-self-throw]").on("click",async event=>{
      event.preventDefault();event.stopPropagation();const button=event.currentTarget;if(button.disabled)return;button.disabled=true;
      try{
        const id=button.dataset.selfThrow!;
        const grenade=grenadeEntries(Array.from(token.actor!.items) as unknown as MenuWeapon[]).some(item=>item.id===id);
        if(grenade){hud.clear();const {startAreaAttack}=await import("./aoe/workflow.js");await startAreaAttack(token,token,id,"attack",!!event.shiftKey);}
        else {const targets=[...game.user!.targets].filter(target=>target!==token);if(targets.length!==1)throw Error("Для метательного оружия выберите целью другой токен. Гранаты бросаются в точку на земле.");hud.clear();await attackFromHUD(token,targets[0]!,id,"attack",event);}
      }catch(error){ui.notifications!.error((error as Error).message);}finally{button.disabled=false;}
    });
    html.find<HTMLButtonElement>("[data-self-action]").on("click",async event=>{
      event.preventDefault();event.stopPropagation();const button=event.currentTarget;if(button.disabled)return;button.disabled=true;
      try{await performSelfAction(token.actor!,button.dataset.selfAction!,button.dataset.message,!!event.shiftKey);}
      catch(error){ui.notifications!.error((error as Error).message);}
      finally{if(hud.object===token)hud.render(true);}
    });
    html.find<HTMLElement>("[data-self-initiative]").on("click keydown",async event=>{
      if(event.type==="keydown"&&!["Enter"," "].includes(event.key??""))return;
      event.preventDefault();event.stopPropagation();const button=event.currentTarget;
      if(button.getAttribute("aria-disabled")==="true")return;
      button.setAttribute("aria-disabled","true");
      try{await rerollSelfInitiative(token);}
      catch(error){ui.notifications!.error(error instanceof Error?error.message:String(error));}
      finally{if(hud.object===token)hud.render(true);}
    });
    return;
  }
  const attacker = selection?.target === token ? selection.attacker : selectedAttacker();
  html.find<HTMLButtonElement>("[data-wake-action]").on("click",async event=>{
    event.preventDefault();event.stopPropagation();const button=event.currentTarget;if(button.disabled||!attacker)return;button.disabled=true;
    try{await wakeUsingAction(attacker,token);hud.clear();}
    catch(error){ui.notifications!.error(error instanceof Error?error.message:String(error));}
    finally{button.disabled=false;}
  });
  if (attacker?.actor && html[0]) {bindWeaponAmmo(html[0], attacker.actor);refreshAttackAmmoLabels(html[0], attacker.actor);}
  if (attacker?.actor && html[0]) decorateItemList(html[0], attacker.actor);
  html.find<HTMLButtonElement>("[data-grapple-action]").on("click", async event => {
    event.preventDefault(); event.stopPropagation();
    if (attacker&&!event.currentTarget.disabled) {hud.clear();await useGrapple(attacker, token, event.currentTarget.dataset.grappleAction!,!!event.shiftKey);}
  });
  html.find<HTMLButtonElement>("[data-breach-override]").on("click", async event => {
    event.preventDefault(); event.stopPropagation();
    if (!game.user?.isGM || !attacker?.actor || !token.actor) return;
    const connection = connectionFor(attacker.actor, token.actor.uuid);
    const ice = selfIce(token.actor, connection?.breachCleared ?? 0);
    const cleared = await Dialog.prompt({title: "Собственный ЛЁД: пройдено Passwall", content: `<label>Пройдено <input name="cleared" type="number" min="0" max="${ice.walls}" step="1" value="${ice.cleared}"></label>`, label: "Применить", rejectClose: false,
      callback: html => Number(html.find<HTMLInputElement>('[name="cleared"]').val())});
    if (cleared === null || cleared === undefined) return;
    try {
      if (connectionFor(attacker.actor, token.actor.uuid)?.id !== connection?.id) throw Error("Подключение изменилось.");
      await overrideBreach(attacker.actor, token.actor, cleared);
      if (hud.object === token) hud.render(true);
    } catch (error) { ui.notifications!.error((error as Error).message); }
  });
  html.find<HTMLButtonElement>("[data-quickhack-id]").on("click", async event => {
    event.preventDefault(); event.stopPropagation();
    const button = event.currentTarget;
    if (!attacker?.actor || !token.actor || !quickhackEnabled() || button.disabled) return;
    button.disabled = true;
    hud.clear();
    try {
      if (button.dataset.quickhackId === "jack-out") await jackOut(attacker.actor, token.actor.uuid);
      else await executeQuickhack(attacker, token, button.dataset.quickhackId!,!!event.shiftKey);
    } catch (error) { ui.notifications!.error(error instanceof Error ? error.message : "Не удалось отключиться."); }
    finally { if (hud.object === token) hud.render(true); }
  });
  html.find<HTMLButtonElement>("[data-attack-mode]").on("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!attacker) return ui.notifications!.warn(label("SelectAttacker"));
    const button = event.currentTarget;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
    const itemId=button.dataset.itemId!,mode=button.dataset.attackMode as AttackMode,count=Number(button.dataset.attackCount??1);
    hud.clear();
    try {
      await attackFromHUD(attacker, token, itemId, mode, event, count);
    } catch (error) {
      console.error(MODULE_ID, error);
      ui.notifications!.error(label("AttackFailed"));
    }
  });
  html.find("[data-combat-action]").on("click keydown", event => {
    if (event.type === "keydown" && !["Enter", " "].includes(event.key ?? "")) return;
    event.preventDefault();
    event.stopPropagation();
    const action = event.currentTarget.dataset.combatAction;
    const panel = html.find(".pneuma-target-menu");
    html.find("[data-medical-menu]").prop("hidden",true);html.find("[data-medical-toggle]").removeClass("active").attr("aria-expanded","false");
    if (!action || !["attack", "melee", "thrown", "quickhacks"].includes(action)) return;
    const open = panel.attr("data-open") !== action || !panel.hasClass("active");
    panel.attr("data-open", action).toggleClass("active", open);
    html.find('[data-combat-control]')
      .removeClass("active").attr("aria-expanded", "false");
    $(event.currentTarget).toggleClass("active", open).attr("aria-expanded", String(open));
    const colors = getComputedStyle(event.currentTarget);
    panel.find(".combat-heading").text(action === "quickhacks" ? data.quickhackStatus : action === "attack" ? data.attackTitle : event.currentTarget.title)
      .css({ backgroundColor: colors.backgroundColor, color: colors.color, borderColor: colors.borderColor });
    const weaponPanel = action !== "quickhacks";
    panel.find(".combat-quickhacks").prop("hidden", weaponPanel || !quickhackEnabled());
    panel.find(".combat-weapons").prop("hidden", !weaponPanel);
    panel.find("[data-attack-category]").each((_index, row) => {
      row.hidden = action === "melee" ? !["melee", "brawling"].includes(row.dataset.attackCategory ?? "") : row.dataset.attackCategory !== action;
    });
    panel.find(".combat-empty").prop("hidden", panel.find("[data-attack-category]").toArray().some(row => !row.hidden));
    panel.find(".combat-description").prop("hidden", true);
  });
});

Hooks.on("canvasTearDown", () => {
  selection = undefined;
});

for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, (item: Item) => {
  const hud = canvas.tokens?.hud, token = hud?.object;
  const attacker = selection?.target === token ? selection?.attacker : selectedAttacker();
  if (item.parent?.uuid === token?.actor?.uuid && hud?.element[0]
    && game.settings!.get(MODULE_ID, "quickhackRequireNeuroport")) hud.render(true);
  if (attacker?.actor && item.parent?.uuid === attacker.actor.uuid && hud?.element[0]) {
    refreshWeaponAmmo(hud.element[0], attacker.actor);
    refreshAttackAmmoLabels(hud.element[0], attacker.actor);
  }
});

// Reposition only the open HUD; no token redraws or canvas-wide work on zoom.
function refreshHUDPosition() {
  const hud = canvas.tokens?.hud;
  if (game.system?.id === "cyberpunk-red-core" && hud?.object && hud.rendered) hud.setPosition();
}
Hooks.on("canvasPan", refreshHUDPosition);


/** REDLINE dock entry: route an attack through the target-aware workflow. Returns false to keep the native roll. */
function registerDockAttackAPI() {
  const module = game.modules!.get(MODULE_ID) as unknown as {api?: Record<string, unknown>};
  if (!module) return;
  const attack = async ({tokenId, targetIds, itemId, mode}: {tokenId: string; targetIds: string[]; itemId: string; mode: AttackMode}) => {
    if (!primaryGM() || !["attack", "aimed", "autofire", "suppressive"].includes(mode)) return false;
    const attacker = canvas.tokens?.get(tokenId);
    const item = attacker?.actor?.items.get(itemId) as unknown as MenuWeapon | undefined;
    if (!attacker?.actor?.isOwner || !item || targetIds.length > 1) return false;
    const target = targetIds.length ? canvas.tokens?.get(targetIds[0]!) : undefined;
    if (targetIds.length && (!target || target === attacker || !target.actor || !target.isVisible)) return false;
    if (!target && !areaKind(item, mode)) return false;
    await attackFromHUD(attacker, target ?? attacker, itemId, mode, {shiftKey: false} as JQuery.ClickEvent);
    return true;
  };
  module.api = {...module.api, combat: Object.freeze({version: 1, attack})};
}
