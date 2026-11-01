import { MODULE_ID, projectHUD, resolveSubject, ownsActor, visibleCombatant } from "./state.js";
import { renderHUD, renderSkillsPanel, CARD_IDS } from "./view.js";
import { skillCatalog } from './skills.js';
import { createActionRunner, ActionRejected, resolveActionSubject } from './actions.js';
import { weaponCapabilities, equippedWeapons } from './capabilities.js';
import { safeInsets, cardMaxHeight, chooseDensity, panelSizing, normalizeInterfaceScale, scaleFromDrag, DEFAULT_INTERFACE_SCALE, MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE } from './presentation.js';
import { favoriteSkillIds, toggleFavoriteSkill, favoriteStoreWith } from './preferences.js';
import { captureHUD, animateHUD, animateSkillResults, closeDrawer } from './motion.js';
import { describeAction, actionEntry, appendAction, projectRecentActions, canReadResultMessage } from './encounter.js';

const modulePath = `modules/${MODULE_ID}`;
const RESULT_TOAST_MS = 12000;
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
const weaponModes = new Map();
const selectedSkills = new Map();
const selectedWeapons = new Map();
const skillStates = new Map();
// One card at a time on this client: {subject, id}. The subject is '' while no character is selected.
let openCard = null;
let drawerSequence = 0;
// Newest result popup: {subject, entryId}. A timer hides it unless the pointer or focus is inside.
let resultToast = null;
let resultTimer = null;
let favoriteWrites = Promise.resolve();
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

const cardButton = id => `[data-action="toggle-card"][data-id="${id}"]`;
const skillsSubject = () => openCard?.id === 'skills' ? openCard.subject : null;
function forgetCard() { openCard = null; drawerSequence++; }

function showResult(subject, entryId) {
  resultToast = {subject, entryId};
  clearTimeout(resultTimer);
  const hide = () => {
    const toast = hud?.element?.[0]?.querySelector('.redline-toast');
    if (toast && (toast.matches(':hover') || toast.contains(document.activeElement))) { resultTimer = setTimeout(hide, 2000); return; }
    resultToast = null; resultTimer = null;
    hud?.scheduleRefresh();
  };
  resultTimer = setTimeout(hide, RESULT_TOAST_MS);
}

async function runNativeAction(request) {
  if (actionBusy) return {status:'busy'};
  const context = worldContext();
  const {actor} = resolveActionSubject(context,request);
  const description = describeAction(request,actor,context.localizeSkill);
  const remember = result => {
    if (result?.status === 'busy') return;
    const entry = actionEntry(description,result,++actionSequence);
    recentActions.set(request.subject,appendAction(recentActions.get(request.subject),entry));
    showResult(request.subject, entry.id);
  };
  try {
    const result = await executeAction(request);
    remember(result);
    if (result?.status === 'completed') forgetCard();
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
  return {...actor, statusTone:actionStatusTone,
    recentActions:projectRecentActions(recentActions.get(actor.key), {
      user:game.user,getMessage:id => game.messages.get(id),
      canDamage:entry => entry.mode !== 'suppressive' && actor.weapons.some(weapon => weapon.id === entry.weaponId
        && weapon.modes.some(mode => mode.id === entry.mode)),
    }),
    favoriteSkillIds:favoriteSkillIds(actor, Object.hasOwn(stored,actor.key) ? stored[actor.key] : [])};
}

async function closeCard({focus, refresh = true, root = hud?.element?.[0]} = {}) {
  const sequence = ++drawerSequence;
  openCard = null;
  root?.querySelectorAll('[data-action="toggle-card"]').forEach(button => button.setAttribute('aria-expanded','false'));
  if (focus) root?.querySelector(focus)?.focus({preventScroll:true});
  await Promise.all([...(root?.querySelectorAll('.redline-card:not([hidden])') ?? [])].map(card => closeDrawer(card)));
  if (sequence !== drawerSequence || !refresh) return;
  if (focus && hud) hud._focusNext = focus;
  hud?.refresh();
}

/** Natural strip width for one density, in layout pixels before client zoom. */
function measureStrip(root, strip, density) {
  if (!strip) return NaN;
  root.dataset.density = density;
  strip.classList.add('is-measuring');
  const width = strip.offsetWidth;
  strip.classList.remove('is-measuring');
  return width;
}

/** Corner grip: live client zoom while dragging, saved on release; keyboard arrows step by 1% (Shift — 10%). */
function bindScaleGrip(root, geometry, signal) {
  const grip = root.querySelector('.redline-scale-grip');
  if (!grip) return;
  const readout = grip.querySelector('.redline-scale-readout');
  const show = value => {
    grip.setAttribute('aria-valuenow', value);
    grip.setAttribute('aria-valuetext', `${value}%`);
    if (readout) readout.textContent = `${value}%`;
    geometry(value);
  };
  const stored = () => normalizeInterfaceScale(game.settings.get(MODULE_ID,'interfaceScale'));
  const save = value => game.settings.set(MODULE_ID,'interfaceScale',normalizeInterfaceScale(value));
  let drag = null;
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();event.stopPropagation();
    grip.setPointerCapture?.(event.pointerId);
    drag = {x:event.clientX, y:event.clientY, start:stored(), value:null};
    if (hud) hud._scaling = true;
    root.classList.add('is-scaling');
  }, {signal});
  grip.addEventListener('pointermove', event => {
    if (!drag) return;
    drag.value = scaleFromDrag({startScale:drag.start, dx:event.clientX-drag.x, dy:event.clientY-drag.y});
    show(drag.value);
  }, {signal});
  const finish = event => {
    if (!drag) return;
    const {value} = drag;
    drag = null;
    if (hud) hud._scaling = false;
    root.classList.remove('is-scaling');
    if (grip.hasPointerCapture?.(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    if (value !== null && value !== stored()) save(value);
  };
  grip.addEventListener('pointerup', finish, {signal});
  grip.addEventListener('pointercancel', finish, {signal});
  grip.addEventListener('dblclick', event => {
    event.preventDefault();event.stopPropagation();
    show(DEFAULT_INTERFACE_SCALE);
    save(DEFAULT_INTERFACE_SCALE);
  }, {signal});
  let keyTimer = null;
  grip.addEventListener('keydown', event => {
    const step = {ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1}[event.key];
    const jump = {Home:MIN_INTERFACE_SCALE, End:MAX_INTERFACE_SCALE}[event.key];
    if (step === undefined && jump === undefined) return;
    event.preventDefault();event.stopPropagation();
    const value = normalizeInterfaceScale(jump ?? Number(grip.getAttribute('aria-valuenow')) + step * (event.shiftKey ? 10 : 1));
    show(value);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => { if (hud) hud._focusNext = '.redline-scale-grip'; save(value); }, 400);
  }, {signal});
}

class RedlineHUD extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "redline-combat-hud", template: `${modulePath}/templates/hud.hbs`, popOut: false,
    });
  }
  getData() {
    const model = projectHUD(worldContext());
    const subject = model.selected?.key ?? '';
    return { content: renderHUD({...model,
      selected:withFavorites(model.selected),
      openCard: openCard?.subject === subject ? openCard.id : null,
      resultEntryId: model.selected && resultToast?.subject === subject ? resultToast.entryId : null,
      animationsEnabled: game.settings.get(MODULE_ID, 'animationsEnabled') !== false,
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
    // A drag in progress keeps its live zoom; saving on release refreshes through the setting.
    if (this._scaling) return;
    if (ready && game.settings.get(MODULE_ID, "enabled")) this.render(true);
  }
  refreshSkills({focus, resetList = false} = {}) {
    const panel = this.element?.[0]?.querySelector('#redline-skills-panel');
    const actor = withFavorites(projectHUD(worldContext()).selected);
    if (!panel || !actor || skillsSubject() !== actor.key) return this.refresh();
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
    const signal = this._listeners.signal;
    const root = html[0];
    root.classList.add('redline-neon');
    root.dataset.layout = 'neon-strip';
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    const rect = selector => {
      const element = document.querySelector(selector);
      return element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' ? element.getBoundingClientRect() : null;
    };
    const geometry = scaleOverride => {
      const chrome = {width:window.innerWidth,height:window.innerHeight,controls:rect('#controls'),sidebar:rect('#sidebar'),hotbar:rect('#hotbar'),hostBar:rect('#ncu-shell .ncu-bar'),navigation:rect('#navigation')};
      const baseInsets = safeInsets(chrome);
      const sizing = panelSizing({availableWidth:window.innerWidth-baseInsets.left-baseInsets.right,scale:scaleOverride ?? game.settings.get(MODULE_ID,'interfaceScale')});
      root.style.setProperty('--redline-scale', sizing.factor);
      root.style.setProperty('--redline-panel-width', `${sizing.layoutWidth}px`);
      root.style.setProperty('--redline-panel-footprint', `${sizing.actualWidth}px`);
      const queue = root.querySelector('.redline-combat');
      const timer = rect('#cpr-deadline-hud');
      const insets = safeInsets({...chrome,timer:queue ? timer : null,queueHeight:queue?.getBoundingClientRect().height ?? 0,queueWidth:sizing.actualWidth});
      for (const [edge, value] of Object.entries(insets)) root.style.setProperty(`--redline-${edge}`, `${value}px`);
      root.querySelector('.redline-interface')?.classList.toggle('has-host-bar', Boolean(rect('#ncu-shell .ncu-bar')));
      let queueBottom = queue?.getBoundingClientRect().bottom ?? insets.top;
      const timerOverPanel = timer && timer.width > 0 && timer.height > 0 && timer.right > insets.left && timer.left < insets.left+sizing.actualWidth;
      if (timerOverPanel && !queue && timer.top < insets.top+90) queueBottom = Math.max(queueBottom, timer.bottom);
      // Narrow free area: drop secondary labels instead of squeezing names into unreadable fragments.
      const stripElement = root.querySelector('.redline-strip');
      root.dataset.density = chooseDensity(density => measureStrip(root, stripElement, density), sizing.layoutWidth);
      const strip = stripElement?.getBoundingClientRect();
      const height = cardMaxHeight({stripTop:strip?.top,queueBottom,viewportHeight:window.innerHeight});
      root.style.setProperty('--redline-card-max-height', `${height/sizing.factor}px`);
    };
    geometry();
    window.addEventListener('resize', () => geometry(), {signal});
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
    // Observers pass their records as the first argument: never let them reach geometry(scaleOverride).
    if (globalThis.ResizeObserver) this._geometryObserver = new ResizeObserver(() => geometry());
    if (globalThis.MutationObserver) {
      this._geometryMutation = new MutationObserver(() => geometry());
      this._geometryMount = new MutationObserver(records => {
        const changed = records.some(record => [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(chromeSelectors.join(',')) || node.querySelector(chromeSelectors.join(',')))));
        if (changed) { observeChrome(); geometry(); }
      });
      // DEADLINE mounts only while running. Ignore countdown text mutations.
      this._geometryMount.observe(document.body, {childList:true,subtree:true});
    }
    observeChrome();
    bindScaleGrip(root, geometry, signal);
    if (this._focusNext) {
      const focusTarget = root.querySelector(this._focusNext);
      focusTarget?.focus();
      if (this._searchSelection && focusTarget?.matches('[data-skill-search]')) focusTarget.setSelectionRange(...this._searchSelection);
      this._searchSelection = null;
      this._focusNext = null;
    }
    document.addEventListener('pointerdown', event => {
      if (!openCard || event.target.closest('.redline-card,[data-action="toggle-card"]')) return;
      // Keep the clicked control in the DOM until its click event arrives:
      // rendering here would swallow an attack or a chip selection outside the card.
      closeCard({refresh:false,root}).catch(error => console.error(`${MODULE_ID} | Card close failed`,error));
    }, {signal});
    root.addEventListener('keydown', event => {
      if (!openCard) return;
      if (event.key === 'Escape') {
        event.preventDefault();event.stopPropagation();
        closeCard({focus:cardButton(openCard.id)}).catch(error => console.error(`${MODULE_ID} | Card close failed`,error));
        return;
      }
      if (openCard.id === 'skills') {
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
        return;
      }
      if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
      const card = event.target.closest('.redline-card');
      if (!card) return;
      event.preventDefault();event.stopPropagation();
      const rows = [...card.querySelectorAll('button:not(:disabled)')];
      const current = rows.indexOf(event.target.closest('button'));
      const index = current < 0 ? 0 : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[index]?.focus();
    }, {signal});
    root.addEventListener('input', event => {
      const input = event.target.closest('[data-skill-search]');
      if (!input || actionBusy) return;
      try {
        resolveActionSubject(worldContext(), {subject:input.dataset.subject,revision:Number(input.dataset.revision)});
        skillStates.set(input.dataset.subject, {...skillStates.get(input.dataset.subject),query:input.value.slice(0,200)});
        this.refreshSkills({resetList:true});
      } catch (error) { if (!(error instanceof ActionRejected)) console.error(error); this.refresh(); }
    }, {signal});
    root.addEventListener('toggle', event => {
      if (!event.target.matches('[data-other-rolls]') || !skillsSubject()) return;
      skillStates.set(skillsSubject(), {...skillStates.get(skillsSubject()),otherRolls:event.target.open});
    }, {capture:true,signal});
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled || event.detail > 1) return;
      event.preventDefault();
      event.stopPropagation();
      const request = {action:button.dataset.action,id:button.dataset.id,entryId:button.dataset.entryId,subject:button.dataset.subject,revision:Number(button.dataset.revision)};
      if(request.action === 'selected-skill') request.action='skill';
      if(request.action.startsWith('weapon-') || request.action === 'choose-mode') request.mode=button.dataset.mode || 'attack';
      dispatch(button.dataset.action, button.dataset.id, request).catch(error => {
        actionStatusTone='error';
        if(error instanceof ActionRejected){actionStatus=error.message;ui.notifications.warn(error.message);hud?.refresh();return;}
        console.error(`${MODULE_ID} | Action failed`, error);
        actionStatus='Не удалось завершить действие. Проверьте чат и сообщения системы.';
        hud?.refresh();
        ui.notifications.error("REDLINE: действие не выполнено. Подробности в консоли.");
      });
    }, {signal});
    this._visualState = animateHUD(root, this._visualState);
  }
  async close(options = {}) {
    clearTimeout(this._refreshTimer);
    this._listeners?.abort();
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    this._visualState = null;
    this._scaling = false;
    forgetCard();
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
    if (!entry) throw new ActionRejected('Запись больше недоступна. Повторите действие с полосы.');
    if (action === 'open-result-chat') {
      const message = game.messages.get(entry.chatMessageId);
      if (!canReadResultMessage(message,game.user)) throw new ActionRejected('Карточка больше недоступна для просмотра.');
      return new ChatPopout(message).render(true);
    }
    if (actionBusy) return;
    const weapon = equippedWeapons(actor).find(item => item.id === entry.weaponId);
    const capability = weapon && weaponCapabilities(actor,weapon,entry.mode);
    if (!entry.canRollDamage || !capability?.canDamage || !capability.modes.some(mode => mode.id === entry.mode)) {
      throw new ActionRejected('Оружие или режим этой атаки больше недоступны. Выберите действие на полосе.');
    }
    return runNativeAction({...request,action:'weapon-damage',id:entry.weaponId,mode:entry.mode});
  }
  if (['skill-category','choose-skill','skill-favorites'].includes(action)) {
    if (actionBusy) return;
    const context = worldContext();
    const {actor} = resolveActionSubject(context, request);
    const selected = withFavorites(projectHUD(context).selected);
    if (!selected || skillsSubject() !== selected.key) return;
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
    if (!equippedWeapons(actor).some(item => item.id === id)) throw new ActionRejected('Это оружие больше не экипировано. Обновите карточку оружия.');
    selectedWeapons.set(request.subject,id);actionStatus='';
    hud._focusNext = `[data-action="choose-weapon"][data-id="${CSS.escape(id)}"]`;
    return hud.refresh();
  }
  if (action === 'choose-mode') {
    if (actionBusy) return;
    const {actor} = resolveActionSubject(worldContext(),request);
    const item = equippedWeapons(actor).find(row => row.id === id);
    if (!item || !weaponCapabilities(actor,item,request.mode).modes.some(mode => mode.id === request.mode)) {
      throw new ActionRejected('Этот режим больше недоступен. Обновите карточку оружия.');
    }
    weaponModes.set(`${request.subject}:${item.id}`,request.mode);actionStatus='';
    hud._focusNext = `[data-action="choose-mode"][data-id="${CSS.escape(id)}"][data-mode="${CSS.escape(request.mode)}"]`;
    return hud.refresh();
  }
  if (action === 'selected-skill') {
    const selected = withFavorites(projectHUD(worldContext()).selected);
    if (!selected || skillCatalog(selected,skillStates.get(selected.key)).selected?.id !== request.id) throw new ActionRejected('Список навыков изменился. Выберите навык ещё раз.');
  }
  if(action.startsWith('weapon-') || ['skill','selected-skill','initiative','death-save'].includes(action)) return runNativeAction(request);
  if (action === "close") return setEnabled(false);
  if (action === "refresh") return hud?.refresh();
  if (action === 'toggle-card') {
    if (!CARD_IDS.includes(id)) return;
    const selected = projectHUD(worldContext()).selected;
    const subject = selected?.key ?? '';
    if (!selected && id !== 'more') return;
    if (openCard?.subject === subject && openCard.id === id) return closeCard({focus:cardButton(id)});
    drawerSequence++;
    openCard = {subject, id};
    // The card itself takes focus (tabindex="-1"): Escape works without buttons inside, arrows move into the list.
    hud._focusNext = id === 'skills' ? '[data-skill-search]' : `.redline-card[data-card="${id}"]`;
    return hud.refresh();
  }
  if (action === 'close-card') return openCard ? closeCard({focus:cardButton(openCard.id)}) : undefined;
  if (action === "select-combatant") {
    const row = game.combat?.combatants?.get(id);
    if (!visibleCombatant(row, game.user) || !ownsActor(row?.actor, game.user)) return;
    // Selection affects this client only; the current turn is independent.
    selectedCombatantId = row.id;
    forgetCard();
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
  game.settings.register(MODULE_ID,'animationsEnabled', {
    name:'REDLINE COMBAT: плавные анимации',
    hint:'Короткие переходы карточек и отклик на изменения. Системное уменьшение движения учитывается автоматически.',
    scope:'client',config:true,type:Boolean,default:true,onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID,'favoriteSkills', {
    name:'REDLINE COMBAT: избранные навыки',scope:'client',config:false,type:Object,default:{},onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID, 'interfaceScale', {
    name:'REDLINE COMBAT: масштаб интерфейса, %',
    hint:'Размер полосы, карточек и очереди боя только для вас. Удобнее тянуть за уголок полосы; двойной щелчок по нему возвращает 80%.',
    scope:'client',config:true,type:Number,default:DEFAULT_INTERFACE_SCALE,
    range:{min:MIN_INTERFACE_SCALE,max:MAX_INTERFACE_SCALE,step:1},onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID, "enabled", {
    name: "REDLINE COMBAT: показывать HUD", scope: "client", config: true,
    hint: "Полоса персонажа и очередь боя. Shift+R или кнопка REDLINE в инструментах токенов переключают HUD.",
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
    Hooks.on(hook, () => { selectedCombatantId = null; forgetCard(); revision++;actionStatus='';hud?.scheduleRefresh(); });
}
