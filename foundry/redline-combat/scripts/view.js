/** HTML presentation only. All permissions and native actions belong to the host. */
import { selectedWeapon, normalizeInterfaceScale, hpSegments, MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE } from './presentation.js';
import { skillCatalog, skillName } from './skills.js';

/** Cards open one at a time above their strip element. */
export const CARD_IDS = Object.freeze(['character', 'weapon', 'target', 'skills', 'history', 'more']);
const HP_SEGMENTS = 10;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]));
const numberLabel = value => Number.isFinite(value) ? escapeHTML(value) : '—';
const icon = name => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
const safeImage = source => {
  if (typeof source !== 'string' || !source.trim()) return '';
  const normalized = source.trim().replace(/[\u0000-\u0020\u007f]/g, '');
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^https?:/i.test(normalized) ? '' : source.trim();
};

function portrait(entity, large = false) {
  const source = safeImage(entity?.img);
  return `<span class="redline-portrait${large ? ' redline-portrait-large' : ''}" aria-hidden="true">${source ? `<img src="${escapeHTML(source)}" alt="" loading="lazy">` : icon('fa-user')}</span>`;
}

function combatantView(combatant) {
  const classes = ['redline-unit', combatant.current ? 'is-current' : '', combatant.selected ? 'is-selected' : '', combatant.defeated ? 'is-defeated' : ''].filter(Boolean).join(' ');
  const status = [combatant.current ? 'Ход сейчас' : '', combatant.selected ? 'Выбран' : '', combatant.defeated ? 'Побеждён' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="${classes}" data-action="select-combatant" data-id="${escapeHTML(combatant.id)}" aria-pressed="${Boolean(combatant.selected)}" title="${escapeHTML(combatant.name)}${status ? ` · ${escapeHTML(status)}` : ''}${combatant.selectable ? ' · Показать персонажа на полосе; ход не меняется' : ' · Нет прав на персонажа'}"${combatant.selectable ? '' : ' disabled'}>
    ${portrait(combatant)}<span class="redline-unit-name"><strong>${escapeHTML(combatant.name || 'Участник')}</strong><small>${escapeHTML(status || 'Участник боя')}</small></span><span class="redline-initiative" aria-label="Инициатива">${numberLabel(combatant.initiative)}</span>
  </button>`;
}

const subjectAttributes = actor => `data-subject="${escapeHTML(actor.key)}" data-revision="${escapeHTML(actor.revision)}"`;
const hasActionSubject = actor => typeof actor.key === 'string' && actor.key.length > 0
  && actor.revision !== undefined && actor.revision !== null && Number.isFinite(Number(actor.revision));

function actionButton(actor, { action, id, mode, label, allowed = true, reason = 'Действие недоступно.', title = label, icon: glyph = '', iconOnly = false, className = '' }) {
  const enabled = !actor.busy && hasActionSubject(actor) && allowed;
  const tooltip = actor.busy ? 'Дождитесь завершения текущего действия.' : enabled ? title : reason;
  return `<button type="button" class="redline-action-button ${className}${iconOnly ? ' redline-action-icon' : ''}" data-action="${escapeHTML(action)}"${id === undefined ? '' : ` data-id="${escapeHTML(id)}"`}${mode === undefined ? '' : ` data-mode="${escapeHTML(mode)}"`} ${subjectAttributes(actor)} title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(title)}"${enabled ? '' : ' disabled'}>${glyph ? icon(glyph) : ''}${iconOnly ? '' : `<span>${escapeHTML(label)}</span>`}</button>`;
}

const weaponsOf = actor => Array.isArray(actor?.weapons) ? actor.weapons.filter(Boolean) : [];
const favoriteIds = actor => new Set((Array.isArray(actor?.favoriteSkillIds) ? actor.favoriteSkillIds : []).map(String));
const ammoStateOf = weapon => !weapon.ammo ? 'melee' : !Number.isFinite(weapon.ammo.value) ? 'unknown'
  : weapon.ammo.value <= 0 ? 'empty' : Number.isFinite(weapon.ammo.max) && weapon.ammo.max > 0 && weapon.ammo.value / weapon.ammo.max <= .25 ? 'low' : 'ready';
const weaponMeta = weapon => `${weapon.damageLabel ? `<span>${escapeHTML(weapon.damageLabel)}</span>` : ''}${Number.isFinite(weapon.rof) ? `<span>ROF ${numberLabel(weapon.rof)}</span>` : ''}`;

/** The native wound tone wins; the HP share is only the legacy fallback when the system supplies none. */
function vitalToneOf(actor) {
  if (['normal','low','critical','unknown'].includes(actor.healthStatus?.tone)) return actor.healthStatus.tone;
  const hp = actor.hp;
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) return 'unknown';
  const percent = Math.max(0, Math.min(100, hp.value / hp.max * 100));
  return percent <= 25 ? 'critical' : percent <= 50 ? 'low' : 'normal';
}
function armorPair(actor) {
  const armor = Array.isArray(actor.armor) ? actor.armor : [];
  const part = prefix => armor.find(item => String(item?.name || '').startsWith(prefix));
  return {head:part('Голова'), body:part('Тело')};
}
const conditionsOf = actor => (Array.isArray(actor.conditions) ? actor.conditions : [])
  .filter(condition => condition && typeof condition.label === 'string' && condition.label.trim());
const conditionIcon = condition => String(condition.id || '').startsWith('injury:') ? 'fa-droplet' : 'fa-bolt';

function cardToggle(id, openCard, { label, content, className = '', attributes = '', disabled = false }) {
  const controls = id === 'skills' ? 'redline-skills-panel' : `redline-card-${id}`;
  return `<button type="button" class="redline-cell-button ${className}" data-action="toggle-card" data-id="${id}"${attributes} aria-expanded="${openCard === id}" aria-controls="${controls}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"${disabled ? ' disabled' : ''}>${content}</button>`;
}

// tabindex="-1": an opened card takes focus itself, so Escape and arrows work even without buttons inside.
function card(id, openCard, label, body, className = '') {
  return `<section id="redline-card-${id}" class="redline-card redline-panel ${className}" data-card="${id}" data-motion="card" role="dialog" aria-label="${escapeHTML(label)}" tabindex="-1"${openCard === id ? '' : ' hidden'}><header class="redline-card-header">${escapeHTML(label)}</header>${body}</section>`;
}

function healthCell(actor) {
  const hp = actor.hp;
  const lit = hpSegments(hp, HP_SEGMENTS);
  const segments = Array.from({length:HP_SEGMENTS}, (_, index) => lit !== null && index < lit ? '<i class="is-lit"></i>' : '<i></i>').join('');
  const {head, body} = armorPair(actor);
  const conditions = conditionsOf(actor);
  const shown = conditions.slice(0, 3);
  const number = hp && Number.isFinite(hp.value) ? `<b class="redline-num">${numberLabel(hp.value)}</b><small>/${numberLabel(hp.max)}</small>` : '<small class="redline-unavailable">HP —</small>';
  return `<span class="redline-hp" data-vital-tone="${vitalToneOf(actor)}" data-hp-value="${Number.isFinite(hp?.value) ? hp.value : ''}" data-hp-max="${Number.isFinite(hp?.max) ? hp.max : ''}"><span class="redline-segments" data-lit="${lit ?? ''}" aria-hidden="true">${segments}</span>${number}</span><span class="redline-sp" title="SP: голова · тело">SP ${numberLabel(head?.sp)}·${numberLabel(body?.sp)}</span>${shown.length ? `<span class="redline-conditions">${shown.map(condition => `<span class="redline-condition-icon" data-condition-id="${escapeHTML(condition.id)}" title="${escapeHTML(condition.label)}">${icon(conditionIcon(condition))}</span>`).join('')}${conditions.length > 3 ? `<small>+${conditions.length - 3}</small>` : ''}</span>` : ''}`;
}

/** Conditions are supplied by the read-only actor projection; no inference from portraits or HP. */
export function renderConditionStrip(actor) {
  const health = actor.healthStatus;
  const conditions = conditionsOf(actor);
  if (!health?.label && !conditions.length) return '';
  const tone = ['normal', 'low', 'critical', 'unknown'].includes(health?.tone) ? health.tone : 'unknown';
  return `<div class="redline-condition-strip" aria-label="Состояние персонажа">${health?.label ? `<span class="redline-health-state" data-health-tone="${tone}" title="${escapeHTML(health.detail || health.label)}">${icon(tone === 'critical' ? 'fa-heart-crack' : 'fa-heart-pulse')}<span>${escapeHTML(health.label)}</span></span>` : ''}${conditions.map(condition => `<span class="redline-condition" data-condition-id="${escapeHTML(condition.id)}" title="${escapeHTML(condition.label)}">${escapeHTML(condition.label)}</span>`).join('')}</div>`;
}

function characterCard(actor, openCard) {
  const {head, body} = armorPair(actor);
  return card('character', openCard, 'Персонаж', `<div class="redline-card-body">
    <div class="redline-card-identity">${portrait(actor, true)}<div><strong title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</strong><span class="redline-card-hp">HP <b>${numberLabel(actor.hp?.value)}</b> / ${numberLabel(actor.hp?.max)}</span></div></div>
    ${renderConditionStrip(actor) || '<p class="redline-muted">Ранений, травм и активных эффектов нет.</p>'}
    <dl class="redline-armor-list"><div><dt>Голова</dt><dd>SP ${numberLabel(head?.sp)}</dd></div><div><dt>Тело</dt><dd>SP ${numberLabel(body?.sp)}</dd></div></dl>
    ${actionButton(actor, {action:'sheet', label:'Открыть лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}
  </div>`, 'redline-card-character');
}

function weaponCard(actor, weapon, openCard) {
  const weapons = weaponsOf(actor);
  const disabled = actor.busy || !hasActionSubject(actor);
  const modes = Array.isArray(weapon?.modes) ? weapon.modes : [];
  const list = weapons.length ? `<div class="redline-weapon-list">${weapons.map(item => {
    const active = String(item.id) === String(weapon?.id);
    return `<button type="button" class="redline-weapon-row" data-action="choose-weapon" data-id="${escapeHTML(item.id)}" ${subjectAttributes(actor)} aria-pressed="${active}" title="Показать на полосе: ${escapeHTML(item.name || 'Оружие')}"${disabled ? ' disabled' : ''}>${icon(item.ammo ? 'fa-gun' : 'fa-hand-fist')}<span class="redline-weapon-row-name">${escapeHTML(item.name || 'Оружие')}</span><span class="redline-weapon-meta">${weaponMeta(item)}</span><span class="redline-weapon-row-ammo" data-ammo-state="${ammoStateOf(item)}">${item.ammo ? `${numberLabel(item.ammo.value)}/${numberLabel(item.ammo.max)}` : 'ближн.'}</span></button>`;
  }).join('')}</div>` : '<p class="redline-muted">Экипируйте оружие в листе персонажа — оно появится здесь.</p>';
  const chips = weapon ? `<div class="redline-mode-chips" role="group" aria-label="Режим: ${escapeHTML(weapon.name || 'Оружие')}">${modes.length ? modes.map(mode => `<button type="button" class="redline-mode-chip" data-action="choose-mode" data-id="${escapeHTML(weapon.id)}" data-mode="${escapeHTML(mode.id)}" ${subjectAttributes(actor)} aria-pressed="${String(mode.id) === String(weapon.mode)}"${disabled ? ' disabled' : ''}>${escapeHTML(mode.label || mode.id)}</button>`).join('') : '<span class="redline-muted">Режимы недоступны</span>'}</div>` : '';
  const load = weapon ? actionButton(actor, {action:'weapon-load', id:weapon.id, mode:weapon.mode, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open'}) : '';
  return card('weapon', openCard, 'Оружие', `<div class="redline-card-body">${list}${chips}${load}<p class="redline-card-note">Выбор меняет только полосу; экипировка в листе не меняется.</p></div>`, 'redline-card-weapon');
}

function targetCard(targets, openCard) {
  return card('target', openCard, targets.length > 1 ? `Цели · ${targets.length}` : 'Цель', `<div class="redline-card-body" aria-label="Цели атаки">${targets.length ? `<ul class="redline-target-list">${targets.map(target => `<li>${portrait(target)}<span>${escapeHTML(target.name || 'Цель')}</span></li>`).join('')}</ul>` : '<p class="redline-muted">Цель не выбрана.</p>'}<p class="redline-card-note">Цель отмечается штатной отметкой T на сцене.</p></div>`, 'redline-card-target');
}

function moreCard(actor, weapon, openCard) {
  const rolls = actor ? `${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}${weapon ? actionButton(actor, {action:'weapon-load', id:weapon.id, mode:weapon.mode, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open'}) : ''}${actionButton(actor, {action:'sheet', label:'Открыть лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}` : '';
  return card('more', openCard, 'Ещё', `<div class="redline-card-body redline-menu">${rolls}<button type="button" class="redline-action-button" data-action="refresh" title="Перечитать данные мира без изменения документов">${icon('fa-rotate-right')}<span>Обновить</span></button><button type="button" class="redline-action-button" data-action="close" title="Скрыть REDLINE (Shift+R)">${icon('fa-eye-slash')}<span>Скрыть HUD</span></button></div>`, 'redline-card-more');
}

const categoryIcons = {
  all:'fa-table-cells-large', awarenessSkills:'fa-eye', bodySkills:'fa-person-running',
  controlSkills:'fa-compass', educationSkills:'fa-graduation-cap', fightingSkills:'fa-hand-fist',
  performanceSkills:'fa-masks-theater', rangedweaponSkills:'fa-crosshairs',
  socialSkills:'fa-user-group', techniqueSkills:'fa-gear',
};

function skillEntry(actor, skill, selected, disabled, favorites) {
  const active = skill.id === selected?.id;
  const favorite = favorites.has(String(skill.id));
  const name = skillName(skill);
  const favoriteLabel = `${favorite ? 'Убрать из избранного' : 'Добавить в избранное'}: ${name}`;
  return `<div class="redline-skill-entry${active ? ' is-selected' : ''}" data-motion="skill" data-skill-id="${escapeHTML(skill.id)}">
    <button type="button" class="redline-skill-row" data-action="choose-skill" data-id="${escapeHTML(skill.id)}" ${subjectAttributes(actor)} aria-pressed="${active}" title="Выбрать навык: ${escapeHTML(name)}"${disabled ? ' disabled' : ''}><span>${escapeHTML(name)}</span>${active ? icon('fa-check') : ''}</button>
    <button type="button" class="redline-skill-star" data-action="toggle-skill-favorite" data-id="${escapeHTML(skill.id)}" ${subjectAttributes(actor)} aria-pressed="${favorite}" aria-label="${escapeHTML(favoriteLabel)}" title="${escapeHTML(favoriteLabel)}"${disabled ? ' disabled' : ''}>${icon('fa-star')}</button>
  </div>`;
}

function quickSkills(actor) {
  const ids = favoriteIds(actor);
  const favorites = (Array.isArray(actor.skills) ? actor.skills : []).filter(skill => skill && ids.has(String(skill.id))).slice(0, 8);
  return `<section class="redline-quick-skills" aria-label="Избранные навыки">${icon('fa-star')}<div class="redline-quick-list">${favorites.length ? favorites.map(skill => `<span class="redline-quick-item" data-motion="favorite" data-skill-id="${escapeHTML(skill.id)}">${actionButton(actor, {action:'quick-skill', id:skill.id, label:skillName(skill), title:`Бросить — ${skillName(skill)}`, icon:'fa-dice', className:'redline-quick-skill'})}</span>`).join('') : '<span class="redline-quick-hint">Нажмите ★ у навыка — он появится здесь для быстрого броска.</span>'}</div></section>`;
}

export function renderSkillsPanel(actor, open, state = {}) {
  const catalog = skillCatalog(actor, state);
  const disabled = actor.busy || !hasActionSubject(actor);
  const selected = catalog.selected;
  const favorites = favoriteIds(actor);
  return `<section id="redline-skills-panel" class="redline-card redline-panel redline-card-skills" data-card="skills" data-motion="card" role="dialog" aria-label="Навыки и броски персонажа" tabindex="-1"${open ? '' : ' hidden'}>
    <header class="redline-popover-header"><div><span class="redline-eyebrow">КАТАЛОГ ПЕРСОНАЖА</span><strong>Навыки</strong><span class="redline-skill-actor" title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</span></div><button type="button" data-action="close-card" class="redline-action-icon" aria-label="Закрыть навыки" title="Закрыть навыки">${icon('fa-xmark')}</button></header>
    ${quickSkills(actor)}
    <div class="redline-skill-tools"><label class="redline-skill-search">${icon('fa-magnifying-glass')}<span class="redline-sr-only">Поиск навыка в выбранном разделе</span><input type="search" data-skill-search ${subjectAttributes(actor)} value="${escapeHTML(catalog.query)}" placeholder="Найти навык…" autocomplete="off" spellcheck="false" maxlength="200" aria-label="Поиск навыка в выбранном разделе" aria-controls="redline-skill-results"${disabled ? ' disabled' : ''}></label><button type="button" class="redline-favorites-filter" data-action="skill-favorites" ${subjectAttributes(actor)} aria-pressed="${Boolean(state.favoritesOnly)}" aria-controls="redline-skill-results" title="Показать избранные навыки в выбранном разделе"${disabled ? ' disabled' : ''}>${icon('fa-star')}<span>Избранное</span></button></div>
    <div class="redline-skill-catalog">
      <nav class="redline-skill-categories" aria-label="Разделы навыков листа персонажа">${catalog.categories.map(category => `<button type="button" data-action="skill-category" data-id="${escapeHTML(category.id)}" ${subjectAttributes(actor)} aria-pressed="${category.id === catalog.category}" title="${escapeHTML(category.label)}"${disabled ? ' disabled' : ''}>${icon(categoryIcons[category.id] || 'fa-list')}<span>${escapeHTML(category.label)}</span></button>`).join('')}</nav>
      <section class="redline-skill-results" id="redline-skill-results" aria-label="Навыки выбранного раздела"><header><strong>${escapeHTML(catalog.heading)}</strong><span class="redline-skill-count" role="status" aria-live="polite">${catalog.skills.length}</span></header><div class="redline-skill-list">${catalog.skills.length ? catalog.skills.map(skill => skillEntry(actor, skill, selected, disabled, favorites)).join('') : `<p class="redline-skill-empty">${catalog.query.trim() ? 'Ничего не найдено. Измените запрос или раздел.' : state.favoritesOnly ? 'В этом разделе пока нет избранных навыков. Добавьте их с помощью звезды.' : 'Нет доступных навыков в этом разделе.'}</p>`}</div></section>
    </div>
    <footer class="redline-skill-footer"><div class="redline-skill-roll">${actionButton(actor, {action:'selected-skill', id:selected?.id || '', label:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', title:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', icon:'fa-dice', allowed:Boolean(selected), reason:'В выбранном разделе нет доступного навыка.', className:'redline-skill-primary'})}<p class="redline-action-note redline-muted">Откроется диалог броска · ★ добавляет навык в быстрый бросок.</p></div><details class="redline-other-rolls" data-other-rolls${state.otherRolls ? ' open' : ''}><summary>Другие броски ${icon('fa-chevron-down')}</summary><div class="redline-character-actions" aria-label="Броски персонажа">${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}</div></details></footer>
  </section>`;
}

const actionStates = {
  completed: {label:'Выполнено',icon:'fa-check'},
  cancelled: {label:'Отменено',icon:'fa-ban'},
  error: {label:'Не завершено',icon:'fa-triangle-exclamation'},
};
const recentEntries = actor => (Array.isArray(actor?.recentActions) ? actor.recentActions : [])
  .filter(entry => entry && Object.hasOwn(actionStates, entry.status)).slice(0, 5);

function resultButton(actor, entry, action, label, glyph) {
  return `<button type="button" class="redline-action-button redline-result-button${action === 'result-damage' ? ' redline-result-followup' : ''}" data-action="${action}" data-entry-id="${escapeHTML(entry.id)}" ${subjectAttributes(actor)} title="${escapeHTML(label)}"${actor.busy || !hasActionSubject(actor) ? ' disabled' : ''}>${icon(glyph)}<span>${escapeHTML(label)}</span></button>`;
}

function resultBlock(actor, entry, tag = 'article') {
  const state = actionStates[entry.status];
  const completed = entry.status === 'completed';
  const hasTotal = completed && Number.isFinite(entry.total);
  const actions = `${completed && typeof entry.chatMessageId === 'string' && entry.chatMessageId ? resultButton(actor, entry, 'open-result-chat', 'Открыть чат', 'fa-comment-dots') : ''}${completed && entry.canRollDamage && entry.weaponId ? resultButton(actor, entry, 'result-damage', 'Урон при попадании…', 'fa-burst') : ''}`;
  return `<${tag} class="redline-result-card" data-motion="result" data-result-id="${escapeHTML(entry.id)}" data-result-status="${escapeHTML(entry.status)}"><header class="redline-result-heading"><span class="redline-result-state">${icon(state.icon)}${state.label}</span>${hasTotal ? `<strong class="redline-result-total" aria-label="Результат броска: ${numberLabel(entry.total)}">${numberLabel(entry.total)}</strong>` : ''}</header><h3 class="redline-result-title">${escapeHTML(entry.title || 'Действие системы')}${entry.itemName ? `<span>${escapeHTML(entry.itemName)}</span>` : ''}</h3>${entry.detail ? `<p class="redline-result-detail">${escapeHTML(entry.detail)}</p>` : ''}${entry.nextStep ? `<p class="redline-result-next">${icon('fa-arrow-turn-down')}<span>${escapeHTML(entry.nextStep)}</span></p>` : ''}${actions ? `<div class="redline-result-actions">${actions}</div>` : ''}</${tag}>`;
}

/** Session-local action feedback for the history card. Native chat remains the source for adjudicating the roll. */
export function renderActionFeed(actor) {
  const entries = recentEntries(actor);
  if (!entries.length) return '<p class="redline-muted">Здесь появятся действия этой сессии: атака → диалог → результат в чате.</p>';
  return `<section class="redline-action-feed" aria-label="Последние действия персонажа">${resultBlock(actor, entries[0])}${entries.length > 1 ? `<ol class="redline-action-history" aria-label="Ранее в этой сессии">${entries.slice(1).map(entry => `<li data-result-status="${escapeHTML(entry.status)}"><span class="redline-history-state" title="${actionStates[entry.status].label}">${icon(actionStates[entry.status].icon)}</span><span class="redline-history-copy"><strong>${escapeHTML(entry.title || 'Действие системы')}${entry.itemName ? `<span> · ${escapeHTML(entry.itemName)}</span>` : ''}</strong>${entry.detail ? `<small>${escapeHTML(entry.detail)}</small>` : ''}</span><span class="redline-history-label">${actionStates[entry.status].label}</span></li>`).join('')}</ol>` : ''}</section>`;
}

/** The newest entry pops up above the strip while the host keeps entryId set. */
export function renderResultToast(actor, entryId) {
  const latest = recentEntries(actor)[0];
  if (!latest || !entryId || latest.id !== entryId) return '';
  return `<aside class="redline-toast redline-panel" data-result-id="${escapeHTML(latest.id)}" aria-label="Результат действия" aria-live="polite">${resultBlock(actor, latest, 'div')}</aside>`;
}

function feedbackView(actor) {
  const status = actor?.status || (actor?.busy ? 'Выполняется действие системы…' : '');
  const tone = ['info', 'success', 'error'].includes(actor?.statusTone) ? actor.statusTone : 'info';
  const glyph = actor?.busy ? 'fa-spinner' : tone === 'success' ? 'fa-circle-check' : tone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  return `<div class="redline-feedback${actor?.busy ? ' is-busy' : ''}" data-status-tone="${escapeHTML(tone)}"${status ? '' : ' hidden'}>${icon(glyph)}<p class="redline-action-status" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(status)}</p></div>`;
}

function queueView(combat, combatants) {
  const turn = combat.canAdvance || combat.pending ? `<div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? '' : ' disabled'}>${combat.pending ? 'Обновление…' : 'Следующий ход'}</button></div>` : '';
  return `<div class="redline-top"><section class="redline-combat redline-panel" aria-label="Очередь инициативы"><div class="redline-round"><small>РАУНД</small><strong>${numberLabel(combat.round)}</strong></div><div class="redline-queue" aria-label="Участники боя">${combatants.map(combatantView).join('')}</div>${turn}</section></div>`;
}

function scaleGrip(scale) {
  return `<span class="redline-scale-grip" role="slider" tabindex="0" aria-label="Масштаб REDLINE" aria-valuemin="${MIN_INTERFACE_SCALE}" aria-valuemax="${MAX_INTERFACE_SCALE}" aria-valuenow="${scale}" aria-valuetext="${scale}%" title="Тяните, чтобы изменить размер · двойной щелчок — 80%"><output class="redline-scale-readout">${scale}%</output></span>`;
}

function stripView(actor, targets, openCard, { scale, isTurn, skillState }) {
  const weapon = actor ? selectedWeapon(actor) : null;
  const more = `<div class="redline-cell" data-cell="more">${cardToggle('more', openCard, {label:'Ещё: броски, лист, обновить, скрыть', className:'redline-cell-icon', content:icon('fa-ellipsis')})}${moreCard(actor, weapon, openCard)}</div>`;
  if (!actor) return `<div class="redline-strip redline-panel is-empty" data-actor-key=""><span class="redline-strip-empty">${icon('fa-crosshairs')}<span>Выберите токен</span></span><div class="redline-strip-actions">${more}</div>${scaleGrip(scale)}</div>`;
  const weaponButton = (action, label, ability, fallback, glyph, extra = {}) => actionButton(actor, {action, id:weapon?.id, mode:weapon?.mode, label, allowed:Boolean(weapon?.[ability]), reason:weapon?.reason || fallback, title:`${label}: ${weapon?.name || 'Оружие не выбрано'}`, icon:glyph, ...extra});
  const emptyMagazine = Boolean(weapon?.ammo && Number.isFinite(weapon.ammo.value) && weapon.ammo.value <= 0);
  const name = actor.name || 'Персонаж';
  const weaponContent = weapon
    ? `${icon(weapon.ammo ? 'fa-gun' : 'fa-hand-fist')}<span class="redline-strip-text">${escapeHTML(weapon.name || 'Оружие')}</span>${weapon.ammo ? `<span class="redline-ammo" data-ammo-state="${ammoStateOf(weapon)}"><b class="redline-num" data-vital="ammo">${numberLabel(weapon.ammo.value)}</b><small>/${numberLabel(weapon.ammo.max)}</small></span>` : '<small class="redline-muted">ближн.</small>'}`
    : `${icon('fa-gun')}<span class="redline-strip-text redline-muted">Нет оружия</span>`;
  const first = targets[0];
  const history = recentEntries(actor).length ? `<div class="redline-cell" data-cell="history">${cardToggle('history', openCard, {label:'История действий этой сессии', className:'redline-cell-icon', content:icon('fa-clock-rotate-left')})}${card('history', openCard, 'История', `<div class="redline-card-body">${renderActionFeed(actor)}</div>`, 'redline-card-history')}</div>` : '';
  return `<div class="redline-strip redline-panel${isTurn ? ' is-turn' : ''}" data-actor-key="${escapeHTML(actor.key)}" aria-label="REDLINE: ${escapeHTML(name)}" aria-busy="${Boolean(actor.busy)}">
    <div class="redline-cell" data-cell="character">${cardToggle('character', openCard, {label:`Персонаж: ${name}`, className:'redline-cell-actor', content:`${portrait(actor)}<strong class="redline-strip-text redline-strip-name">${escapeHTML(name)}</strong>${healthCell(actor)}`})}${characterCard(actor, openCard)}</div>
    <div class="redline-cell" data-cell="weapon">${cardToggle('weapon', openCard, {label:weapon ? `Оружие: ${weapon.name || 'Оружие'}` : 'Оружие не экипировано', className:'redline-cell-weapon', attributes:weapon ? ` data-weapon-id="${escapeHTML(weapon.id)}"` : '', content:weaponContent})}${weaponCard(actor, weapon, openCard)}</div>
    <div class="redline-cell" data-cell="target">${cardToggle('target', openCard, {label:targets.length ? `Цели: ${targets.map(target => target.name || 'Цель').join(', ')}` : 'Цель не выбрана', className:'redline-cell-target', content:`${first ? portrait(first) : icon('fa-crosshairs')}<span class="redline-strip-text${first ? '' : ' redline-muted'}">${first ? escapeHTML(first.name || 'Цель') : 'Нет цели'}</span>${targets.length > 1 ? `<small>+${targets.length - 1}</small>` : ''}`})}${targetCard(targets, openCard)}</div>
    <div class="redline-strip-actions">${weaponButton('weapon-attack', 'Атака', 'canAttack', 'Выберите доступное оружие в листе персонажа.', 'fa-crosshairs', {className:'redline-action-primary'})}${weaponButton('weapon-damage', 'Урон', 'canDamage', 'Для этого режима нет отдельного броска урона.', 'fa-burst', {iconOnly:true})}${weaponButton('weapon-reload', 'Перезарядить', 'canReload', 'Это оружие не поддерживает перезарядку.', 'fa-arrows-rotate', {iconOnly:true, className:emptyMagazine ? 'is-urgent' : ''})}<div class="redline-cell" data-cell="skills">${cardToggle('skills', openCard, {label:'Навыки', className:'redline-cell-icon', content:icon('fa-list')})}${renderSkillsPanel(actor, openCard === 'skills', skillState)}</div>${history}${more}</div>
    ${scaleGrip(scale)}
  </div>`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const scale = normalizeInterfaceScale(model.interfaceScale);
  const openCard = CARD_IDS.includes(model.openCard) ? model.openCard : null;
  const actor = model.selected || null;
  const isTurn = Boolean(actor && combat.started && combatants.some(combatant => combatant.current && combatant.selected));
  const notices = [model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : '', !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || 'мира')} не поддерживается. Действия доступны для Cyberpunk RED.</p>` : ''].join('');
  return `<div class="redline-interface redline-neon${model.hasHostBar ? ' has-host-bar' : ''}" data-layout="neon-strip" data-scale="${scale}" data-animations="${model.animationsEnabled !== false}">
    ${combat.started ? queueView(combat, combatants) : ''}
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ''}
    <div class="redline-bottom"><div class="redline-strip-wrap">${actor ? renderResultToast(actor, model.resultEntryId) : ''}${feedbackView(actor)}${stripView(actor, targets, openCard, {scale, isTurn, skillState:model.skillState})}</div></div>
  </div>`;
}
