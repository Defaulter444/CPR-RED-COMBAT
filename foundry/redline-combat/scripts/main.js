import { MODULE_ID, projectHUD, resolveSubject, ownsActor, visibleCombatant } from "./state.js";
import { renderHUD } from "./view.js";
import { createActionRunner, ActionRejected, resolveActionSubject } from './actions.js';
import { weaponCapabilities, equippedWeapons } from './capabilities.js';

const modulePath = `modules/${MODULE_ID}`;
let hud = null;
let demo = null;
let ready = false;
let selectedCombatantId = null;
let turnPending = false;
let revision = 0;
let actionBusy = false;
let actionStatus = '';
const weaponModes = new Map();
const selectedSkills = new Map();
let systemAdapter;
const executeAction = createActionRunner({
  getContext: worldContext,
  getSystem: async () => {
    systemAdapter ??= import(foundry.utils.getRoute('systems/cyberpunk-red-core/modules/chat/cpr-chat.js'))
      .then(({default:chat}) => ({renderRollCard: roll => chat.RenderRollCard(roll)}));
    return systemAdapter;
  },
  onBusy: value => {actionBusy=value;hud?.refresh();},
  onStatus: value => {actionStatus=value;hud?.scheduleRefresh();},
});

function worldContext() {
  return {
    user: game.user, system: game.system,
    generation: game.release?.generation ?? Number(game.version?.split(".")[0]),
    combat: game.combat, controlled: globalThis.canvas?.tokens?.controlled ?? [],
    targets: Array.from(game.user.targets ?? []), selectedCombatantId, pending: turnPending,
    revision, actionBusy, actionStatus,
    weaponMode: (key,item) => weaponModes.get(`${key}:${item.id}`),
    selectedSkill: key => selectedSkills.get(key),
    localizeSkill: name => game.i18n.localize(globalThis.Handlebars?.helpers?.cprGetLocalizedlNameKey?.(name,'skill') || name),
  };
}

class RedlineHUD extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "redline-combat-hud", template: `${modulePath}/templates/hud.hbs`, popOut: false,
    });
  }
  getData() {
    return { content: renderHUD(projectHUD(worldContext())) };
  }
  refresh() {
    if (ready && game.settings.get(MODULE_ID, "enabled")) this.render(true);
  }
  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => { this._refreshTimer = null; this.refresh(); }, 60);
  }
  activateListeners(html) {
    super.activateListeners(html);
    this._listeners?.abort();
    this._listeners = new AbortController();
    html[0].addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled || event.detail > 1) return;
      event.preventDefault();
      event.stopPropagation();
      const request = {action:button.dataset.action,id:button.dataset.id,subject:button.dataset.subject,revision:Number(button.dataset.revision)};
      if(request.action === 'selected-skill') { request.action='skill'; request.id=html[0].querySelector('[data-skill-select]')?.value; }
      if(request.action.startsWith('weapon-')) {
        const select=[...html[0].querySelectorAll('[data-weapon-mode]')].find(element=>element.dataset.id===request.id);
        request.mode=select?.value || 'attack';
      }
      dispatch(button.dataset.action, button.dataset.id, request).catch(error => {
        if(error instanceof ActionRejected){actionStatus=error.message;ui.notifications.warn(error.message);hud?.refresh();return;}
        console.error(`${MODULE_ID} | Action failed`, error);
        actionStatus='Не удалось завершить действие. Проверьте чат и сообщения системы.';
        hud?.refresh();
        ui.notifications.error("REDLINE: действие не выполнено. Подробности в консоли.");
      });
    }, { signal: this._listeners.signal });
    html[0].addEventListener('change', event => {
      const select=event.target.closest('[data-weapon-mode], [data-skill-select]');
      if(!select || actionBusy)return;
      try {
        const {actor}=resolveActionSubject(worldContext(),{subject:select.dataset.subject,revision:Number(select.dataset.revision)});
        if(select.matches('[data-skill-select]')) {
          const skill=actor.items.get(select.value);
          if(skill?.type==='skill' && typeof skill.createRoll==='function')selectedSkills.set(select.dataset.subject,skill.id);
          return;
        }
        const item=equippedWeapons(actor).find(item=>item.id===select.dataset.id);
        if(item && weaponCapabilities(actor,item,select.value).modes.some(mode=>mode.id===select.value)){
          weaponModes.set(`${select.dataset.subject}:${item.id}`,select.value);actionStatus='';hud?.refresh();
        }
      } catch(error){if(!(error instanceof ActionRejected))console.error(error);hud?.refresh();}
    }, {signal:this._listeners.signal});
  }
  async close(options = {}) {
    clearTimeout(this._refreshTimer);
    this._listeners?.abort();
    return super.close(options);
  }
}

class RedlineDemo extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "redline-combat-demo", title: "REDLINE COMBAT — учебный интерфейс",
      template: `${modulePath}/templates/demo.hbs`, width: 1180, height: 780, resizable: true,
    });
  }
  getData() {
    return { demoUrl: foundry.utils.getRoute(`${modulePath}/demo/index.html`) };
  }
}

async function setEnabled(enabled) {
  await game.settings.set(MODULE_ID, "enabled", Boolean(enabled));
  if (enabled) hud?.refresh();
  else await hud?.close();
}
function openDemo() {
  demo ??= new RedlineDemo();
  demo.render(true);
  return demo;
}

async function dispatch(action, id, request) {
  if(action.startsWith('weapon-') || ['skill','selected-skill','initiative','death-save'].includes(action)) return executeAction(request);
  if (action === "close") return setEnabled(false);
  if (action === "demo") return openDemo();
  if (action === "refresh") return hud?.refresh();
  if (action === "select-combatant") {
    const row = game.combat?.combatants?.get(id);
    if (!visibleCombatant(row, game.user) || !ownsActor(row?.actor, game.user)) return;
    // Selection affects this client only; the current turn is independent.
    selectedCombatantId = row.id;
    revision++;actionStatus='';
    hud?.refresh();
  }
  if (action === "sheet") {
    // Resolve a fresh projection and recheck ownership after each render.
    const ctx = worldContext();
    const { actor } = resolveSubject(ctx);
    if (projectHUD(ctx).selected && ownsActor(actor, game.user)) actor.sheet?.render(true);
  }
  if (action === "next-turn") {
    const ctx = worldContext();
    if (!projectHUD(ctx).combat.canAdvance || turnPending) return;
    turnPending = true;
    hud?.refresh();
    try { await ctx.combat.nextTurn(); }
    finally { turnPending = false; hud?.refresh(); }
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "REDLINE COMBAT: показывать HUD", scope: "client", config: true,
    hint: "Выбранный персонаж и очередь боя. Shift+R или кнопка REDLINE в инструментах токенов переключают HUD.",
    type: Boolean, default: true,
    onChange: enabled => enabled ? hud?.refresh() : hud?.close(),
  });
  game.keybindings.register(MODULE_ID, "toggleHUD", {
    name: "REDLINE COMBAT: показать / скрыть HUD",
    editable: [{ key: "KeyR", modifiers: ["Shift"] }],
    onDown: () => { void setEnabled(!game.settings.get(MODULE_ID, "enabled")); return true; },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!Array.isArray(controls)) return;
  const tokens = controls.find(control => control.name === "token");
  if (!tokens || tokens.tools.some(tool => tool.name === MODULE_ID)) return;
  tokens.tools.push({
    name: MODULE_ID, title: "REDLINE COMBAT — показать / скрыть HUD", icon: "fas fa-bolt",
    visible: true, button: true, onClick: () => setEnabled(!game.settings.get(MODULE_ID, "enabled")),
  });
});

Hooks.once("ready", () => {
  ready = true;
  hud = new RedlineHUD();
  game.modules.get(MODULE_ID).api = Object.freeze({
    open: () => setEnabled(true), close: () => setEnabled(false),
    toggle: () => setEnabled(!game.settings.get(MODULE_ID, "enabled")),
    openDemo, refresh: () => hud.refresh(),
    getState: () => projectHUD(worldContext()),
  });
  hud.refresh();
});

for (const hook of [
  "updateActor", "createItem", "updateItem", "deleteItem", "updateToken", "targetToken",
  "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant",
  "deleteCombatant", "combatStart", "updateUser", "deleteActor", "deleteToken", "updateActiveEffect", "createActiveEffect", "deleteActiveEffect",
]) Hooks.on(hook, () => hud?.scheduleRefresh());
for (const hook of ["controlToken", "canvasReady", "canvasTearDown"]) {
  Hooks.on(hook, () => { selectedCombatantId = null; revision++;actionStatus='';hud?.scheduleRefresh(); });
}
