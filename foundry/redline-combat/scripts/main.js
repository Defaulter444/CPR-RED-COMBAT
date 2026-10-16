import { MODULE_ID, projectHUD, resolveSubject, ownsActor, visibleCombatant } from "./state.js";
import { renderHUD, renderScaleSettings, renderSkillsPanel } from "./view.js";
import { skillCatalog } from './skills.js';
import { createActionRunner, ActionRejected, resolveActionSubject } from './actions.js';
import { weaponCapabilities, equippedWeapons } from './capabilities.js';
import { safeInsets, skillPopupLayout, panelSizing, normalizeInterfaceScale, DEFAULT_INTERFACE_SCALE } from './presentation.js';

const modulePath = `modules/${MODULE_ID}`;
let hud = null;
let ready = false;
let selectedCombatantId = null;
let turnPending = false;
let revision = 0;
let actionBusy = false;
let actionStatus = '';
const weaponModes = new Map();
const selectedSkills = new Map();
const selectedWeapons = new Map();
const skillStates = new Map();
let skillsSubject = null;
let scaleDialog = null;
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
    selectedWeapon: key => selectedWeapons.get(key),
    skillCategories: Object.entries(globalThis.Handlebars?.helpers?.cprFindConfigObj?.('skillCategories') || {})
      .map(([id,labelKey]) => ({id,label:game.i18n.localize(labelKey)})),
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
    const model = projectHUD(worldContext());
    return { content: renderHUD({...model,
      dockExpanded: Boolean(game.settings.get(MODULE_ID, 'dockExpanded')),
      skillsOpen: Boolean(model.selected && skillsSubject === model.selected.key),
      skillState: skillStates.get(model.selected?.key),
      hasHostBar: Boolean(document.querySelector('#ncu-shell .ncu-bar')),
      interfaceScale: normalizeInterfaceScale(game.settings.get(MODULE_ID, 'interfaceScale')),
    }) };
  }
  refresh() {
    const active = document.activeElement;
    if (!this._focusNext && active?.matches('#redline-combat-hud [data-skill-search]')) {
      this._focusNext = '[data-skill-search]';
      this._searchSelection = [active.selectionStart, active.selectionEnd];
    }
    if (ready && game.settings.get(MODULE_ID, "enabled")) this.render(true);
  }
  refreshSkills({focus, resetList = false} = {}) {
    const panel = this.element?.[0]?.querySelector('#redline-skills-panel');
    const actor = projectHUD(worldContext()).selected;
    if (!panel || !actor || skillsSubject !== actor.key) return this.refresh();
    const active = document.activeElement;
    const searching = active?.matches('[data-skill-search]');
    const selection = searching ? [active.selectionStart, active.selectionEnd] : null;
    const categoryScroll = panel.querySelector('.redline-skill-categories')?.scrollTop || 0;
    const listScroll = resetList ? 0 : panel.querySelector('.redline-skill-list')?.scrollTop || 0;
    const state = skillStates.get(actor.key) || {};
    const template = document.createElement('template');
    template.innerHTML = renderSkillsPanel(actor, true, state);
    panel.replaceChildren(...template.content.firstElementChild.childNodes);
    panel.querySelector('.redline-skill-categories').scrollTop = categoryScroll;
    panel.querySelector('.redline-skill-list').scrollTop = listScroll;
    const target = panel.querySelector(focus || (searching ? '[data-skill-search]' : '[data-action="selected-skill"]'));
    target?.focus({preventScroll:true});
    if (selection) target?.setSelectionRange?.(...selection);
    if (focus?.includes('choose-skill')) target?.scrollIntoView({block:'nearest'});
  }
  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => { this._refreshTimer = null; this.refresh(); }, 60);
  }
  activateListeners(html) {
    super.activateListeners(html);
    this._listeners?.abort();
    this._listeners = new AbortController();
    const root = html[0];
    root.classList.add('redline-blackglass');
    root.dataset.layout = 'blackglass-dock';
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    const geometry = () => {
      const rect = selector => {
        const element = document.querySelector(selector);
        return element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' ? element.getBoundingClientRect() : null;
      };
      const chrome = {width:window.innerWidth,height:window.innerHeight,controls:rect('#controls'),sidebar:rect('#sidebar'),hotbar:rect('#hotbar'),hostBar:rect('#ncu-shell .ncu-bar'),navigation:rect('#navigation')};
      const baseInsets = safeInsets(chrome);
      const sizing = panelSizing({availableWidth:window.innerWidth-baseInsets.left-baseInsets.right,scale:game.settings.get(MODULE_ID,'interfaceScale')});
      root.style.setProperty('--redline-scale', sizing.factor);
      root.style.setProperty('--redline-panel-width', `${sizing.layoutWidth}px`);
      root.style.setProperty('--redline-panel-footprint', `${sizing.actualWidth}px`);
      root.style.setProperty('--redline-skill-gap', `${8/sizing.factor}px`);
      const queue = root.querySelector('.redline-combat');
      const timer = rect('#cpr-deadline-hud');
      const insets = safeInsets({...chrome,timer:queue ? timer : null,queueHeight:queue?.getBoundingClientRect().height ?? 0,queueWidth:sizing.actualWidth});
      for (const [edge, value] of Object.entries(insets)) root.style.setProperty(`--redline-${edge}`, `${value}px`);
      root.querySelector('.redline-interface')?.classList.toggle('has-host-bar', Boolean(rect('#ncu-shell .ncu-bar')));
      let queueBottom = queue?.getBoundingClientRect().bottom ?? insets.top;
      const timerOverPanel = timer && timer.width > 0 && timer.height > 0 && timer.right > insets.left && timer.left < insets.left+sizing.actualWidth;
      if (timerOverPanel && !queue && timer.top < insets.top+90) queueBottom = Math.max(queueBottom, timer.bottom);
      const dockSpace = Math.max(80, window.innerHeight-insets.bottom-queueBottom-12);
      root.style.setProperty('--redline-dock-max-height', `${dockSpace/sizing.factor}px`);
      const statusHeight = root.querySelector('.redline-action-status')?.getBoundingClientRect().height || 0;
      root.style.setProperty('--redline-status-height', `${statusHeight/sizing.factor}px`);
      const dock = root.querySelector('.redline-dock')?.getBoundingClientRect();
      const skillLayout = skillPopupLayout({dockTop:dock?.top,dockBottom:dock?.bottom,queueBottom,viewportHeight:window.innerHeight});
      root.style.setProperty('--redline-skill-height', `${skillLayout.height/sizing.factor}px`);
      root.style.setProperty('--redline-skill-bottom', skillLayout.placement === 'dock' ? '0px' : 'calc(100% + var(--redline-skill-gap, 8px))');
    };
    geometry();
    window.addEventListener('resize', geometry, {signal:this._listeners.signal});
    const chromeSelectors = ['#controls','#sidebar','#hotbar','#navigation','#ncu-shell','#cpr-deadline-hud'];
    let observed = new Set();
    const observeChrome = () => {
      const current = new Set(chromeSelectors.map(selector => document.querySelector(selector)).filter(Boolean));
      for (const element of observed) if (!current.has(element)) this._geometryObserver?.unobserve(element);
      this._geometryMutation?.disconnect();
      for (const element of current) {
        if (!observed.has(element)) this._geometryObserver?.observe(element);
        this._geometryMutation?.observe(element, {attributes:true,attributeFilter:['class','style','hidden']});
      }
      observed = current;
    };
    if (globalThis.ResizeObserver) {
      this._geometryObserver = new ResizeObserver(geometry);
    }
    if (globalThis.MutationObserver) {
      this._geometryMutation = new MutationObserver(geometry);
      this._geometryMount = new MutationObserver(records => {
        const changed = records.some(record => [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(chromeSelectors.join(',')) || node.querySelector(chromeSelectors.join(',')))));
        if (changed) { observeChrome(); geometry(); }
      });
      // DEADLINE mounts only while running. Ignore countdown text mutations.
      this._geometryMount.observe(document.body, {childList:true,subtree:true});
    }
    observeChrome();
    if (this._focusNext) {
      const focusTarget = root.querySelector(this._focusNext);
      focusTarget?.focus();
      if (this._searchSelection && focusTarget?.matches('[data-skill-search]')) focusTarget.setSelectionRange(...this._searchSelection);
      this._searchSelection = null;
      this._focusNext = null;
    }
    document.addEventListener('pointerdown', event => {
      if (!skillsSubject || event.target.closest('#redline-skills-panel,[data-action="toggle-skills"]')) return;
      skillsSubject = null;
      // Keep the clicked control in the DOM until its click/change event arrives.
      // Rendering here would swallow an attack or selector interaction outside the popup.
      const panel = root.querySelector('#redline-skills-panel');
      if (panel) panel.hidden = true;
      root.querySelector('.redline-primary-actions [data-action="toggle-skills"]')?.setAttribute('aria-expanded', 'false');
    }, {signal:this._listeners.signal});
    root.addEventListener('keydown', event => {
      if (!skillsSubject) return;
      if (event.key === 'Escape') {
        event.preventDefault();event.stopPropagation();
        skillsSubject = null;this._focusNext = '.redline-primary-actions [data-action="toggle-skills"]';this.refresh();
        return;
      }
      if (!event.target.closest('[data-skill-search],.redline-skill-row')) return;
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) root.querySelector('[data-action="selected-skill"]:not(:disabled)')?.click();
      } else if (['ArrowDown','ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const rows = [...root.querySelectorAll('.redline-skill-row:not(:disabled)')];
        const current = rows.indexOf(event.target.closest('.redline-skill-row'));
        const index = current < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows[index]?.click();
      }
    }, {signal:this._listeners.signal});
    root.addEventListener('input', event => {
      const input = event.target.closest('[data-skill-search]');
      if (!input || actionBusy) return;
      try {
        resolveActionSubject(worldContext(), {subject:input.dataset.subject,revision:Number(input.dataset.revision)});
        skillStates.set(input.dataset.subject, {...skillStates.get(input.dataset.subject),query:input.value.slice(0,200)});
        this.refreshSkills({resetList:true});
      } catch (error) { if (!(error instanceof ActionRejected)) console.error(error); this.refresh(); }
    }, {signal:this._listeners.signal});
    root.addEventListener('toggle', event => {
      if (!event.target.matches('[data-other-rolls]') || !skillsSubject) return;
      skillStates.set(skillsSubject, {...skillStates.get(skillsSubject),otherRolls:event.target.open});
    }, {capture:true,signal:this._listeners.signal});
    html[0].addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled || event.detail > 1) return;
      event.preventDefault();
      event.stopPropagation();
      const request = {action:button.dataset.action,id:button.dataset.id,subject:button.dataset.subject,revision:Number(button.dataset.revision)};
      if(request.action === 'selected-skill') request.action='skill';
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
      const select=event.target.closest('[data-weapon-mode], [data-weapon-select]');
      if(!select || actionBusy)return;
      try {
        const {actor}=resolveActionSubject(worldContext(),{subject:select.dataset.subject,revision:Number(select.dataset.revision)});
        if(select.matches('[data-weapon-select]')) {
          const item=equippedWeapons(actor).find(item=>item.id===select.value);
          if(item){selectedWeapons.set(select.dataset.subject,item.id);actionStatus='';this._focusNext='[data-weapon-select]';hud?.refresh();}
          return;
        }
        const item=equippedWeapons(actor).find(item=>item.id===select.dataset.id);
        if(item && weaponCapabilities(actor,item,select.value).modes.some(mode=>mode.id===select.value)){
          weaponModes.set(`${select.dataset.subject}:${item.id}`,select.value);actionStatus='';this._focusNext='[data-weapon-mode]';hud?.refresh();
        }
      } catch(error){if(!(error instanceof ActionRejected))console.error(error);hud?.refresh();}
    }, {signal:this._listeners.signal});
  }
  async close(options = {}) {
    clearTimeout(this._refreshTimer);
    this._listeners?.abort();
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    return super.close(options);
  }
}

async function setEnabled(enabled) {
  await game.settings.set(MODULE_ID, "enabled", Boolean(enabled));
  if (enabled) hud?.refresh();
  else await hud?.close();
}
async function dispatch(action, id, request) {
  if (['skill-category','choose-skill'].includes(action)) {
    if (actionBusy) return;
    const context = worldContext();
    const {actor} = resolveActionSubject(context, request);
    const selected = projectHUD(context).selected;
    if (!selected || skillsSubject !== selected.key) return;
    const state = skillStates.get(selected.key) || {};
    if (action === 'skill-category') {
      if (id !== 'all' && !selected.skillCategories.some(category => category.id === id)) return;
      skillStates.set(selected.key, {...state,category:id});
      return hud.refreshSkills({focus:`[data-action="skill-category"][data-id="${CSS.escape(id)}"]`,resetList:true});
    }
    const skill = actor.items.get(id);
    if (skill?.type !== 'skill' || typeof skill.createRoll !== 'function' || !skillCatalog(selected,state).skills.some(item => item.id === id)) return;
    selectedSkills.set(selected.key, id);
    return hud.refreshSkills({focus:`[data-action="choose-skill"][data-id="${CSS.escape(id)}"]`});
  }
  if (action === 'selected-skill') {
    const selected = projectHUD(worldContext()).selected;
    if (!selected || skillCatalog(selected,skillStates.get(selected.key)).selected?.id !== request.id) throw new ActionRejected('Список навыков изменился. Выберите навык ещё раз.');
  }
  if(action.startsWith('weapon-') || ['skill','selected-skill','initiative','death-save'].includes(action)) return executeAction(request);
  if (action === "close") return setEnabled(false);
  if (action === "refresh") return hud?.refresh();
  if (action === 'scale-settings') return openScaleSettings();
  if (action === 'toggle-dock') {
    skillsSubject = null;
    hud._focusNext = '[data-action="toggle-dock"]';
    await game.settings.set(MODULE_ID, 'dockExpanded', !game.settings.get(MODULE_ID, 'dockExpanded'));
    return;
  }
  if (action === 'toggle-skills') {
    const selected = projectHUD(worldContext()).selected;
    if (!selected || !game.settings.get(MODULE_ID, 'dockExpanded')) return;
    skillsSubject = skillsSubject === selected.key ? null : selected.key;
    hud._focusNext = skillsSubject ? '[data-skill-search]' : '.redline-primary-actions [data-action="toggle-skills"]';
    return hud.refresh();
  }
  if (action === "select-combatant") {
    const row = game.combat?.combatants?.get(id);
    if (!visibleCombatant(row, game.user) || !ownsActor(row?.actor, game.user)) return;
    // Selection affects this client only; the current turn is independent.
    selectedCombatantId = row.id;
    skillsSubject = null;
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

function openScaleSettings() {
  if (scaleDialog?.rendered) return scaleDialog.bringToTop();
  scaleDialog = new Dialog({
    title:'REDLINE COMBAT — размер панели',
    content:renderScaleSettings(game.settings.get(MODULE_ID,'interfaceScale')),
    buttons:{
      apply:{icon:'<i class="fas fa-check"></i>',label:'Применить',callback:html=>game.settings.set(MODULE_ID,'interfaceScale',normalizeInterfaceScale(html[0].querySelector('[name="scale"]').value))},
      reset:{icon:'<i class="fas fa-rotate-left"></i>',label:'Сбросить до 80%',callback:()=>game.settings.set(MODULE_ID,'interfaceScale',DEFAULT_INTERFACE_SCALE)},
      cancel:{label:'Отмена'},
    },
    default:'apply',
    render:html=>{
      const slider=html[0].querySelector('[name="scale"]'),output=html[0].querySelector('output');
      slider.addEventListener('input',()=>{output.textContent=`${normalizeInterfaceScale(slider.value)}%`;});
    },
    close:()=>{scaleDialog=null;},
  },{width:400});
  return scaleDialog.render(true);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, 'interfaceScale', {
    name:'REDLINE COMBAT: масштаб панели, %',
    hint:'Размер панели персонажа и очереди боя только для вас. По умолчанию 80%.',
    scope:'client',config:true,type:Number,default:DEFAULT_INTERFACE_SCALE,
    range:{min:55,max:125,step:5},onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID, 'dockExpanded', {
    name:'REDLINE COMBAT: развернуть панель персонажа', scope:'client', config:false,
    type:Boolean, default:false, onChange:() => hud?.refresh(),
  });
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
    refresh: () => hud.refresh(),
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
    Hooks.on(hook, () => { selectedCombatantId = null; skillsSubject = null; revision++;actionStatus='';hud?.scheduleRefresh(); });
}
