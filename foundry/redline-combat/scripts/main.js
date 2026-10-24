import { MODULE_ID, projectHUD, resolveSubject, ownsActor, visibleCombatant } from "./state.js";
import { renderHUD, renderScaleSettings, renderSkillsPanel } from "./view.js";
import { skillCatalog } from './skills.js';
import { createActionRunner, ActionRejected, resolveActionSubject } from './actions.js';
import { weaponCapabilities, equippedWeapons } from './capabilities.js';
import { safeInsets, skillPopupLayout, panelSizing, normalizeInterfaceScale, DEFAULT_INTERFACE_SCALE } from './presentation.js';
import { favoriteSkillIds, toggleFavoriteSkill, favoriteStoreWith } from './preferences.js';
import { captureHUD, animateHUD, animateSkillResults, closeDrawer } from './motion.js';
import { describeAction, actionEntry, appendAction, projectRecentActions, canReadResultMessage } from './encounter.js';

const modulePath = `modules/${MODULE_ID}`;
let hud = null;
let ready = false;
let selectedCombatantId = null;
let turnPending = false;
let revision = 0;
let actionBusy = false;
let actionStatus = '';
let actionStatusTone = 'info';
const recentActions = new Map();
let actionSequence = 0;
const historyOpen = new Map();
const weaponModes = new Map();
const selectedSkills = new Map();
const selectedWeapons = new Map();
const skillStates = new Map();
let skillsSubject = null;
let arsenalSubject = null;
let drawerSequence = 0;
let favoriteWrites = Promise.resolve();
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
  onStatus: value => {actionStatus=value;actionStatusTone='info';hud?.scheduleRefresh();},
});

async function runNativeAction(request) {
  if (actionBusy) return {status:'busy'};
  const context = worldContext();
  const {actor} = resolveActionSubject(context,request);
  const description = describeAction(request,actor,context.localizeSkill);
  const remember = result => {
    if (result?.status === 'busy') return;
    const entry = actionEntry(description,result,++actionSequence);
    recentActions.set(request.subject,appendAction(recentActions.get(request.subject),entry));
  };
  try {
    const result = await executeAction(request);
    remember(result);
    if (result?.status === 'completed') { skillsSubject = null; arsenalSubject = null; drawerSequence++; }
    actionStatusTone = result?.status === 'completed' ? 'success' : 'info';
    hud?.scheduleRefresh();
    return result;
  } catch (error) { remember({status:'error'});actionStatusTone = 'error';throw error; }
}

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

function favoriteStore() {
  const stored = game.settings.get(MODULE_ID, 'favoriteSkills');
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function withFavorites(actor) {
  if (!actor) return actor;
  const stored = favoriteStore();
  return {...actor, statusTone:actionStatusTone, historyOpen:Boolean(historyOpen.get(actor.key)),
    recentActions:projectRecentActions(recentActions.get(actor.key), {
      user:game.user,getMessage:id => game.messages.get(id),
      canDamage:entry => entry.mode !== 'suppressive' && actor.weapons.some(weapon => weapon.id === entry.weaponId
        && weapon.modes.some(mode => mode.id === entry.mode)),
    }),
    favoriteSkillIds:favoriteSkillIds(actor, Object.hasOwn(stored,actor.key) ? stored[actor.key] : [])};
}

function markDrawersClosed(root) {
  root?.querySelectorAll('[data-action="toggle-skills"],[data-action="toggle-arsenal"]').forEach(button => {
    button.setAttribute('aria-expanded','false');
    if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed','false');
  });
  root?.querySelectorAll('[data-action="close-drawers"]').forEach(button => button.setAttribute('aria-pressed','true'));
}

async function closeDrawers({focus, refresh = true, root = hud?.element?.[0]} = {}) {
  const sequence = ++drawerSequence;
  skillsSubject = null; arsenalSubject = null;
  markDrawersClosed(root);
  if (focus) root?.querySelector(focus)?.focus({preventScroll:true});
  await Promise.all(['#redline-skills-panel','#redline-arsenal-panel'].map(selector => closeDrawer(root?.querySelector(selector))));
  if (sequence !== drawerSequence || !refresh) return;
  if (focus && hud) hud._focusNext = focus;
  hud?.refresh();
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
      selected:withFavorites(model.selected),
      dockExpanded: Boolean(game.settings.get(MODULE_ID, 'dockExpanded')),
      skillsOpen: Boolean(model.selected && skillsSubject === model.selected.key),
      arsenalOpen: Boolean(model.selected && arsenalSubject === model.selected.key),
      animationsEnabled: game.settings.get(MODULE_ID, 'animationsEnabled') !== false,
      skillState: skillStates.get(model.selected?.key),
      hasHostBar: Boolean(document.querySelector('#ncu-shell .ncu-bar')),
      interfaceScale: normalizeInterfaceScale(game.settings.get(MODULE_ID, 'interfaceScale')),
    }) };
  }
  refresh() {
    const root = this.element?.[0];
    const body = root?.querySelector('.redline-workspace-body');
    if (body) this._workspaceScroll = {actor:root.querySelector('.redline-dock')?.dataset.actorKey,top:body.scrollTop};
    const active = document.activeElement;
    if (!this._focusNext && active?.matches('#redline-combat-hud [data-skill-search]')) {
      this._focusNext = '[data-skill-search]';
      this._searchSelection = [active.selectionStart, active.selectionEnd];
    }
    if (ready && game.settings.get(MODULE_ID, "enabled")) this.render(true);
  }
  refreshSkills({focus, resetList = false} = {}) {
    const panel = this.element?.[0]?.querySelector('#redline-skills-panel');
    const actor = withFavorites(projectHUD(worldContext()).selected);
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
    if (resetList && !searching) animateSkillResults(panel);
    this._visualState = captureHUD(this.element?.[0]);
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
      if ((!skillsSubject && !arsenalSubject) || event.target.closest('#redline-skills-panel,#redline-arsenal-panel,[data-action="toggle-skills"],[data-action="toggle-arsenal"],[data-action="close-drawers"]')) return;
      // Keep the clicked control in the DOM until its click/change event arrives.
      // Rendering here would swallow an attack or selector interaction outside the popup.
      closeDrawers({refresh:false,root}).catch(error => console.error(`${MODULE_ID} | Drawer close failed`,error));
    }, {signal:this._listeners.signal});
    root.addEventListener('keydown', event => {
      if (!skillsSubject && !arsenalSubject) return;
      if (event.key === 'Escape') {
        event.preventDefault();event.stopPropagation();
        const focus = skillsSubject ? '.redline-primary-actions [data-action="toggle-skills"]' : '[data-action="toggle-arsenal"]';
        closeDrawers({focus}).catch(error => console.error(`${MODULE_ID} | Drawer close failed`,error));
        return;
      }
      if (!skillsSubject) return;
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
      if (event.target.matches('[data-action-history]')) {
        const selected = projectHUD(worldContext()).selected;
        if (selected) historyOpen.set(selected.key,event.target.open);
        return;
      }
      if (!event.target.matches('[data-other-rolls]') || !skillsSubject) return;
      skillStates.set(skillsSubject, {...skillStates.get(skillsSubject),otherRolls:event.target.open});
    }, {capture:true,signal:this._listeners.signal});
    html[0].addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled || event.detail > 1) return;
      event.preventDefault();
      event.stopPropagation();
      const request = {action:button.dataset.action,id:button.dataset.id,entryId:button.dataset.entryId,subject:button.dataset.subject,revision:Number(button.dataset.revision)};
      if(request.action === 'selected-skill') request.action='skill';
      if(request.action.startsWith('weapon-')) {
        const select=[...html[0].querySelectorAll('[data-weapon-mode]')].find(element=>element.dataset.id===request.id);
        request.mode=select?.value || 'attack';
      }
      dispatch(button.dataset.action, button.dataset.id, request).catch(error => {
        actionStatusTone='error';
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
    const body = root.querySelector('.redline-workspace-body');
    const actorKey = root.querySelector('.redline-dock')?.dataset.actorKey;
    if (body && this._workspaceScroll?.actor === actorKey) body.scrollTop = this._workspaceScroll.top;
    const nextVisual = captureHUD(root);
    if (body && !body.hidden && this._visualState?.actor === nextVisual?.actor
      && nextVisual?.result && nextVisual.result !== this._visualState.result) {
      const card = root.querySelector('[data-motion="result"]');
      const area = body.getBoundingClientRect(), result = card?.getBoundingClientRect();
      // Reveal new feedback only inside our own scroll area; keep Foundry's
      // scene/sidebar position and the user's focus untouched.
      if (result && (result.top < area.top || result.bottom > area.bottom)) {
        const factor = Number(root.style.getPropertyValue('--redline-scale')) || 1;
        body.scrollTop += (result.top-area.top)/factor;
      }
    }
    this._visualState = animateHUD(root, this._visualState);
  }
  async close(options = {}) {
    clearTimeout(this._refreshTimer);
    this._listeners?.abort();
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    this._visualState = null;
    this._workspaceScroll = null;
    skillsSubject = null; arsenalSubject = null; drawerSequence++;
    return super.close(options);
  }
}

async function setEnabled(enabled) {
  await game.settings.set(MODULE_ID, "enabled", Boolean(enabled));
  if (enabled) hud?.refresh();
  else await hud?.close();
}
async function dispatch(action, id, request) {
  if (['open-result-chat','result-damage'].includes(action)) {
    const {actor} = resolveActionSubject(worldContext(),request);
    const entry = recentActions.get(request.subject)?.find(row => row.id === request.entryId);
    if (!entry) throw new ActionRejected('Запись больше недоступна. Повторите действие с панели.');
    if (action === 'open-result-chat') {
      const message = game.messages.get(entry.chatMessageId);
      if (!canReadResultMessage(message,game.user)) throw new ActionRejected('Карточка больше недоступна для просмотра.');
      return new ChatPopout(message).render(true);
    }
    if (actionBusy) return;
    const weapon = equippedWeapons(actor).find(item => item.id === entry.weaponId);
    const capability = weapon && weaponCapabilities(actor,weapon,entry.mode);
    if (!entry.canRollDamage || !capability?.canDamage || !capability.modes.some(mode => mode.id === entry.mode)) {
      throw new ActionRejected('Оружие или режим этой атаки больше недоступны. Выберите действие на панели.');
    }
    return runNativeAction({...request,action:'weapon-damage',id:entry.weaponId,mode:entry.mode});
  }
  if (['skill-category','choose-skill','skill-favorites'].includes(action)) {
    if (actionBusy) return;
    const context = worldContext();
    const {actor} = resolveActionSubject(context, request);
    const selected = withFavorites(projectHUD(context).selected);
    if (!selected || skillsSubject !== selected.key) return;
    const state = skillStates.get(selected.key) || {};
    if (action === 'skill-favorites') {
      skillStates.set(selected.key, {...state,category:'all',favoritesOnly:!state.favoritesOnly});
      return hud.refreshSkills({focus:'[data-action="skill-favorites"]',resetList:true});
    }
    if (action === 'skill-category') {
      if (id !== 'all' && !selected.skillCategories.some(category => category.id === id)) return;
      skillStates.set(selected.key, {...state,category:id,favoritesOnly:false});
      return hud.refreshSkills({focus:`[data-action="skill-category"][data-id="${CSS.escape(id)}"]`,resetList:true});
    }
    const skill = actor.items.get(id);
    if (skill?.type !== 'skill' || typeof skill.createRoll !== 'function' || !skillCatalog(selected,state).skills.some(item => item.id === id)) return;
    selectedSkills.set(selected.key, id);
    return hud.refreshSkills({focus:`[data-action="choose-skill"][data-id="${CSS.escape(id)}"]`});
  }
  if (action === 'toggle-skill-favorite') {
    // Serialize preference writes and resolve again when each one executes.
    favoriteWrites = favoriteWrites.catch(() => {}).then(async () => {
      if (actionBusy) return;
      resolveActionSubject(worldContext(),request);
      const selected = withFavorites(projectHUD(worldContext()).selected);
      if (!selected) return;
      let ids;
      try { ids = toggleFavoriteSkill(selected,selected.favoriteSkillIds,id); }
      catch (error) { if (error instanceof RangeError) throw new ActionRejected(error.message); throw error; }
      hud._focusNext = `[data-action="toggle-skill-favorite"][data-id="${CSS.escape(id)}"]`;
      await game.settings.set(MODULE_ID,'favoriteSkills',favoriteStoreWith(favoriteStore(),selected.key,ids));
    });
    return favoriteWrites;
  }
  if (action === 'quick-skill') {
    resolveActionSubject(worldContext(),request);
    const selected = withFavorites(projectHUD(worldContext()).selected);
    if (!selected?.favoriteSkillIds.includes(id)) throw new ActionRejected('Избранное изменилось. Выберите навык заново.');
    return runNativeAction({...request,action:'skill'});
  }
  if (action === 'choose-weapon') {
    if (actionBusy) return;
    const {actor} = resolveActionSubject(worldContext(),request);
    if (!equippedWeapons(actor).some(item => item.id === id)) throw new ActionRejected('Это оружие больше не экипировано. Обновите арсенал.');
    selectedWeapons.set(request.subject,id);actionStatus='';
    hud._focusNext = `[data-action="choose-weapon"][data-id="${CSS.escape(id)}"]`;
    return hud.refresh();
  }
  if (action === 'selected-skill') {
    const selected = withFavorites(projectHUD(worldContext()).selected);
    if (!selected || skillCatalog(selected,skillStates.get(selected.key)).selected?.id !== request.id) throw new ActionRejected('Список навыков изменился. Выберите навык ещё раз.');
  }
  if(action.startsWith('weapon-') || ['skill','selected-skill','initiative','death-save'].includes(action)) return runNativeAction(request);
  if (action === "close") return setEnabled(false);
  if (action === "refresh") return hud?.refresh();
  if (action === 'scale-settings') return openScaleSettings();
  if (action === 'toggle-dock') {
    skillsSubject = null;arsenalSubject = null;drawerSequence++;
    hud._focusNext = '[data-action="toggle-dock"]';
    await game.settings.set(MODULE_ID, 'dockExpanded', !game.settings.get(MODULE_ID, 'dockExpanded'));
    return;
  }
  if (action === 'toggle-skills') {
    const selected = projectHUD(worldContext()).selected;
    if (!selected || !game.settings.get(MODULE_ID, 'dockExpanded')) return;
    if (skillsSubject === selected.key) return closeDrawers({focus:'.redline-primary-actions [data-action="toggle-skills"]'});
    drawerSequence++;skillsSubject = selected.key;arsenalSubject = null;
    hud._focusNext = '[data-skill-search]';
    return hud.refresh();
  }
  if (action === 'toggle-arsenal') {
    const selected = projectHUD(worldContext()).selected;
    if (!selected || !game.settings.get(MODULE_ID,'dockExpanded')) return;
    if (arsenalSubject === selected.key) return closeDrawers({focus:'[data-action="toggle-arsenal"]'});
    drawerSequence++;arsenalSubject = selected.key;skillsSubject = null;
    hud._focusNext = `[data-action="choose-weapon"][data-id="${CSS.escape(selected.selectedWeaponId || selected.weapons?.[0]?.id || '')}"]`;
    return hud.refresh();
  }
  if (action === 'close-drawers') return closeDrawers();
  if (action === "select-combatant") {
    const row = game.combat?.combatants?.get(id);
    if (!visibleCombatant(row, game.user) || !ownsActor(row?.actor, game.user)) return;
    // Selection affects this client only; the current turn is independent.
    selectedCombatantId = row.id;
    skillsSubject = null;arsenalSubject = null;drawerSequence++;
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
    content:renderScaleSettings(game.settings.get(MODULE_ID,'interfaceScale'),game.settings.get(MODULE_ID,'animationsEnabled') !== false),
    buttons:{
      apply:{icon:'<i class="fas fa-check"></i>',label:'Применить',callback:html=>Promise.all([
        game.settings.set(MODULE_ID,'interfaceScale',normalizeInterfaceScale(html[0].querySelector('[name="scale"]').value)),
        game.settings.set(MODULE_ID,'animationsEnabled',Boolean(html[0].querySelector('[name="animations"]')?.checked)),
      ])},
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
  game.settings.register(MODULE_ID,'animationsEnabled', {
    name:'REDLINE COMBAT: плавные анимации',
    hint:'Короткие переходы панелей и отклик на изменения. Системное уменьшение движения учитывается автоматически.',
    scope:'client',config:true,type:Boolean,default:true,onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID,'favoriteSkills', {
    name:'REDLINE COMBAT: избранные навыки',scope:'client',config:false,type:Object,default:{},onChange:()=>hud?.refresh(),
  });
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
  "updateChatMessage", "deleteChatMessage",
]) Hooks.on(hook, () => hud?.scheduleRefresh());
for (const hook of ["controlToken", "canvasReady", "canvasTearDown"]) {
    Hooks.on(hook, () => { selectedCombatantId = null; skillsSubject = null; arsenalSubject = null; drawerSequence++; revision++;actionStatus='';hud?.scheduleRefresh(); });
}
