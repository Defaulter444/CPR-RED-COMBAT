/** HTML presentation only. All permissions and native actions belong to the host. */
import { selectedWeapon, normalizeInterfaceScale } from './presentation.js';
import { skillCatalog, skillName } from './skills.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]));
const numberLabel = value => Number.isFinite(value) ? escapeHTML(value) : '—';
const icon = name => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
const sectionLabel = (index, label) => `<span class="redline-section-label"><b aria-hidden="true">${index}</b>${label}</span>`;
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
  return `<button type="button" class="${classes}" data-action="select-combatant" data-id="${escapeHTML(combatant.id)}" aria-pressed="${Boolean(combatant.selected)}" title="${escapeHTML(combatant.name)}${status ? ` · ${escapeHTML(status)}` : ''}${combatant.selectable ? ' · Показать персонажа в HUD; ход не меняется' : ' · Нет прав на персонажа'}"${combatant.selectable ? '' : ' disabled'}>
    ${portrait(combatant)}<span class="redline-unit-name"><strong>${escapeHTML(combatant.name || 'Участник')}</strong><small>${escapeHTML(status || 'Участник боя')}</small></span><span class="redline-initiative" aria-label="Инициатива">${numberLabel(combatant.initiative)}</span>
  </button>`;
}

const subjectAttributes = actor => `data-subject="${escapeHTML(actor.key)}" data-revision="${escapeHTML(actor.revision)}"`;
const hasActionSubject = actor => typeof actor.key === 'string' && actor.key.length > 0
  && actor.revision !== undefined && actor.revision !== null && Number.isFinite(Number(actor.revision));

function actionButton(actor, { action, id, label, allowed = true, reason = 'Действие недоступно.', title = label, icon: glyph = '', iconOnly = false, className = '' }) {
  const enabled = !actor.busy && hasActionSubject(actor) && allowed;
  const tooltip = actor.busy ? 'Дождитесь завершения текущего действия.' : enabled ? title : reason;
  return `<button type="button" class="redline-action-button ${className}${iconOnly ? ' redline-action-icon' : ''}" data-action="${escapeHTML(action)}"${id === undefined ? '' : ` data-id="${escapeHTML(id)}"`} ${subjectAttributes(actor)} title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(title)}"${enabled ? '' : ' disabled'}>${glyph ? icon(glyph) : ''}${iconOnly ? '' : `<span>${escapeHTML(label)}</span>`}</button>`;
}

function weaponMode(weapon, actor) {
  const name = String(weapon.name || 'Оружие');
  const modes = Array.isArray(weapon.modes) ? weapon.modes : [];
  const disabled = actor.busy || !hasActionSubject(actor) || !modes.length;
  return `<label class="redline-weapon-mode"><span class="redline-sr-only">Режим</span><select data-weapon-mode data-id="${escapeHTML(weapon.id)}" ${subjectAttributes(actor)} aria-label="${escapeHTML(`Режим: ${name}`)}" title="${escapeHTML(actor.busy ? 'Дождитесь завершения текущего действия.' : modes.length ? `Режим: ${name}` : 'Режимы этого оружия недоступны.')}"${disabled ? ' disabled' : ''}>${modes.length ? modes.map(mode => `<option value="${escapeHTML(mode.id)}"${String(mode.id) === String(weapon.mode) ? ' selected' : ''}>${escapeHTML(mode.label || mode.id)}</option>`).join('') : '<option value="">Недоступен</option>'}</select></label>`;
}

const weaponsOf = actor => Array.isArray(actor?.weapons) ? actor.weapons.filter(Boolean) : [];
const favoriteIds = actor => new Set((Array.isArray(actor?.favoriteSkillIds) ? actor.favoriteSkillIds : []).map(String));
const ammoStateOf = weapon => !weapon.ammo ? 'melee' : !Number.isFinite(weapon.ammo.value) ? 'unknown'
  : weapon.ammo.value <= 0 ? 'empty' : Number.isFinite(weapon.ammo.max) && weapon.ammo.max > 0 && weapon.ammo.value / weapon.ammo.max <= .25 ? 'low' : 'ready';
const weaponMeta = weapon => `${weapon.damageLabel ? `<span>${escapeHTML(weapon.damageLabel)}</span>` : ''}${Number.isFinite(weapon.rof) ? `<span>ROF ${numberLabel(weapon.rof)}</span>` : ''}`;

function workspaceBar(actor, expanded, skillsOpen, arsenalOpen) {
  const weapons = weaponsOf(actor);
  return `<div class="redline-workspace-bar"${expanded ? '' : ' hidden'}><nav class="redline-workspace-nav" aria-label="Разделы REDLINE">
    <button type="button" data-action="close-drawers" aria-pressed="${!skillsOpen && !arsenalOpen}" class="redline-workspace-tab">${icon('fa-crosshairs')}<span>Бой</span></button>
    <button type="button" data-action="toggle-arsenal" aria-expanded="${Boolean(arsenalOpen)}" aria-controls="redline-arsenal-panel" class="redline-workspace-tab"${actor ? '' : ' disabled'}>${icon('fa-gun')}<span>Арсенал</span><small>${weapons.length}</small></button>
    <button type="button" data-action="toggle-skills" aria-expanded="${Boolean(skillsOpen)}" aria-controls="redline-skills-panel" class="redline-workspace-tab"${actor ? '' : ' disabled'}>${icon('fa-layer-group')}<span>Навыки</span></button>
  </nav><span class="redline-workspace-context">${actor ? escapeHTML(actor.name || 'Персонаж') : 'Выберите персонажа'}</span></div>`;
}

export function renderArsenalPanel(actor, open) {
  if (!actor) return '';
  const weapons = weaponsOf(actor);
  const selected = selectedWeapon(actor);
  const disabled = actor.busy || !hasActionSubject(actor);
  return `<section id="redline-arsenal-panel" class="redline-arsenal-popover redline-drawer redline-panel" data-motion="drawer" data-drawer="arsenal" aria-label="Арсенал персонажа"${open ? '' : ' hidden'}>
    <header class="redline-popover-header"><div><span class="redline-eyebrow">ЭКИПИРОВАННОЕ ОРУЖИЕ · ${weapons.length}</span><strong>Арсенал</strong><span class="redline-skill-actor">${escapeHTML(actor.name || 'Персонаж')}</span></div><button type="button" data-action="toggle-arsenal" class="redline-small" aria-label="Закрыть арсенал" title="Закрыть арсенал">${icon('fa-xmark')}</button></header>
    <p class="redline-drawer-intro">Выберите оружие для панели. Экипировка в листе персонажа не меняется.</p>
    <div class="redline-arsenal-grid">${weapons.length ? weapons.map(weapon => {
      const image = safeImage(weapon.img);
      const active = String(weapon.id) === String(selected?.id);
      return `<button type="button" class="redline-arsenal-card" data-action="choose-weapon" data-id="${escapeHTML(weapon.id)}" ${subjectAttributes(actor)} data-motion="weapon" data-weapon-id="${escapeHTML(weapon.id)}" data-ammo-state="${ammoStateOf(weapon)}" aria-pressed="${active}" title="Выбрать оружие для панели: ${escapeHTML(weapon.name || 'Оружие')}"${disabled ? ' disabled' : ''}>
        <span class="redline-arsenal-art" aria-hidden="true">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy">` : icon('fa-gun')}</span><span class="redline-arsenal-copy"><span class="redline-arsenal-name">${escapeHTML(weapon.name || 'Оружие')}</span><span class="redline-weapon-meta">${weaponMeta(weapon)}</span><span class="redline-arsenal-ammo">${weapon.ammo ? `Патроны <b>${numberLabel(weapon.ammo.value)} <small>/ ${numberLabel(weapon.ammo.max)}</small></b>` : 'Без магазина'}</span></span><span class="redline-arsenal-selected">${active ? `${icon('fa-check')} На панели` : 'Выбрать'}</span>
      </button>`;
    }).join('') : `<div class="redline-drawer-empty">${icon('fa-gun')}<strong>Оружие не экипировано</strong><p>Экипируйте оружие в листе персонажа — оно появится в арсенале.</p></div>`}</div>
    <footer class="redline-drawer-footer">${icon('fa-circle-info')}<span>После выбора настройте режим на панели. Атака откроет штатный диалог броска.</span></footer>
  </section>`;
}

function quickSkills(actor, expanded) {
  const ids = favoriteIds(actor);
  const favorites = (Array.isArray(actor.skills) ? actor.skills : []).filter(skill => skill && ids.has(String(skill.id))).slice(0, 8);
  return `<section class="redline-quick-skills" aria-label="Избранные навыки"${expanded ? '' : ' hidden'}><span class="redline-quick-label">${icon('fa-star')}<span>Быстрый бросок</span></span><div class="redline-quick-list">${favorites.length ? favorites.map(skill => `<span class="redline-quick-item" data-motion="favorite" data-skill-id="${escapeHTML(skill.id)}">${actionButton(actor, {action:'quick-skill', id:skill.id, label:skillName(skill), title:`Бросить — ${skillName(skill)}`, icon:'fa-dice', className:'redline-quick-skill'})}</span>`).join('') : '<span class="redline-quick-hint">Нажмите звезду рядом с навыком — он появится здесь.</span>'}</div></section>`;
}

function weaponView(actor, weapon) {
  const weapons = weaponsOf(actor);
  if (!weapon) return `<section class="redline-weapons redline-no-weapon" aria-label="Оружие персонажа">${sectionLabel('02', 'ВООРУЖЕНИЕ')}${icon('fa-gun')}<p class="redline-muted">Нет экипированного оружия</p></section>`;
  const image = safeImage(weapon.img);
  const disabled = actor.busy || !hasActionSubject(actor);
  const ammoState = ammoStateOf(weapon);
  return `<section class="redline-weapons" aria-label="Оружие персонажа" data-motion="weapon" data-weapon-id="${escapeHTML(weapon.id)}" data-ammo-state="${ammoState}">
    <div class="redline-card-heading">${sectionLabel('02', 'ВООРУЖЕНИЕ')}<button type="button" class="redline-card-link" data-action="toggle-arsenal" aria-controls="redline-arsenal-panel" title="Открыть арсенал">Арсенал ${icon('fa-arrow-up-right-from-square')}</button></div>
    <div class="redline-weapon-pickers"><label class="redline-weapon-picker"><span class="redline-sr-only">Оружие</span><select data-weapon-select ${subjectAttributes(actor)} aria-label="Экипированное оружие" title="Выбрать оружие для панели; экипировка в листе не меняется"${disabled ? ' disabled' : ''}>${weapons.map(item => `<option value="${escapeHTML(item.id)}"${String(item.id) === String(weapon.id) ? ' selected' : ''}>${escapeHTML(item.name || 'Оружие')}</option>`).join('')}</select></label>${weaponMode(weapon, actor)}</div>
    <div class="redline-weapon-preview"><div class="redline-weapon-art" aria-hidden="true">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy">` : icon('fa-gun')}</div><div class="redline-weapon-data"><span class="redline-label">${weapon.ammo ? 'ПАТРОНЫ' : 'БЛИЖНИЙ БОЙ'}</span><div class="redline-ammo-line"><span class="redline-weapon-ammo" data-vital="ammo" aria-label="Боезапас">${weapon.ammo ? `${numberLabel(weapon.ammo.value)} <small>/ ${numberLabel(weapon.ammo.max)}</small>` : '—'}</span>${actionButton(actor, {action:'weapon-load', id:weapon.id, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open', iconOnly:true})}</div><div class="redline-weapon-meta">${weaponMeta(weapon)}</div></div></div>
  </section>`;
}

function targetsView(targets) {
  return `<div class="redline-targets" aria-label="Цели атаки">${targets.length ? portrait(targets[0]) : `<span class="redline-target-icon" aria-hidden="true">${icon('fa-crosshairs')}</span>`}<div class="redline-target-copy"><span class="redline-label">${targets.length > 1 ? `ЦЕЛИ · ${targets.length}` : 'ЦЕЛЬ'}</span><span class="redline-target-list" title="${escapeHTML(targets.map(target => target.name || 'Цель').join(', '))}">${targets.length ? targets.map(target => `<span>${escapeHTML(target.name || 'Цель')}</span>`).join('<span class="redline-muted">, </span>') : '<span class="redline-muted">Выберите цель на сцене</span>'}</span></div></div>`;
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

export function renderSkillsPanel(actor, open, state = {}) {
  const catalog = skillCatalog(actor, state);
  const disabled = actor.busy || !hasActionSubject(actor);
  const selected = catalog.selected;
  const favorites = favoriteIds(actor);
  return `<section id="redline-skills-panel" class="redline-skill-popover redline-drawer redline-panel" data-motion="drawer" data-drawer="skills" aria-label="Навыки и броски персонажа"${open ? '' : ' hidden'}>
    <header class="redline-popover-header"><div><span class="redline-eyebrow">КАТАЛОГ ПЕРСОНАЖА</span><strong>Навыки</strong><span class="redline-skill-actor" title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</span></div><button type="button" data-action="toggle-skills" class="redline-small" aria-label="Закрыть навыки" title="Закрыть навыки">${icon('fa-xmark')}</button></header>
    <div class="redline-skill-tools"><label class="redline-skill-search">${icon('fa-magnifying-glass')}<span class="redline-sr-only">Поиск навыка в выбранном разделе</span><input type="search" data-skill-search ${subjectAttributes(actor)} value="${escapeHTML(catalog.query)}" placeholder="Найти навык…" autocomplete="off" spellcheck="false" maxlength="200" aria-label="Поиск навыка в выбранном разделе" aria-controls="redline-skill-results"${disabled ? ' disabled' : ''}></label><button type="button" class="redline-favorites-filter" data-action="skill-favorites" ${subjectAttributes(actor)} aria-pressed="${Boolean(state.favoritesOnly)}" aria-controls="redline-skill-results" title="Показать избранные навыки в выбранном разделе"${disabled ? ' disabled' : ''}>${icon('fa-star')}<span>Избранное</span></button></div>
    <div class="redline-skill-catalog">
      <nav class="redline-skill-categories" aria-label="Разделы навыков листа персонажа">${catalog.categories.map(category => `<button type="button" data-action="skill-category" data-id="${escapeHTML(category.id)}" ${subjectAttributes(actor)} aria-pressed="${category.id === catalog.category}" title="${escapeHTML(category.label)}"${disabled ? ' disabled' : ''}>${icon(categoryIcons[category.id] || 'fa-list')}<span>${escapeHTML(category.label)}</span></button>`).join('')}</nav>
      <section class="redline-skill-results" id="redline-skill-results" aria-label="Навыки выбранного раздела"><header><strong>${escapeHTML(catalog.heading)}</strong><span class="redline-skill-count" role="status" aria-live="polite">${catalog.skills.length}</span></header><div class="redline-skill-list">${catalog.skills.length ? catalog.skills.map(skill => skillEntry(actor, skill, selected, disabled, favorites)).join('') : `<p class="redline-skill-empty">${catalog.query.trim() ? 'Ничего не найдено. Измените запрос или раздел.' : state.favoritesOnly ? 'В этом разделе пока нет избранных навыков. Добавьте их с помощью звезды.' : 'Нет доступных навыков в этом разделе.'}</p>`}</div></section>
    </div>
    <footer class="redline-skill-footer"><div class="redline-skill-roll">${actionButton(actor, {action:'selected-skill', id:selected?.id || '', label:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', title:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', icon:'fa-dice', allowed:Boolean(selected), reason:'В выбранном разделе нет доступного навыка.', className:'redline-skill-primary'})}<p class="redline-action-note redline-muted">Откроется диалог броска · ★ добавляет навык на панель быстрого доступа.</p></div><details class="redline-other-rolls" data-other-rolls${state.otherRolls ? ' open' : ''}><summary>Другие броски ${icon('fa-chevron-down')}</summary><div class="redline-character-actions" aria-label="Броски персонажа">${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}</div></details></footer>
  </section>`;
}

function healthView(actor) {
  const hp = actor.hp;
  const healthPercent = hp && Number.isFinite(hp.value) && Number.isFinite(hp.max) && hp.max > 0 ? Math.max(0, Math.min(100, hp.value / hp.max * 100)) : 0;
  const vitalTone = ['normal','low','critical','unknown'].includes(actor.healthStatus?.tone) ? actor.healthStatus.tone
    : !hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0 ? 'unknown' : healthPercent <= 25 ? 'critical' : healthPercent <= 50 ? 'low' : 'normal';
  return `<div class="redline-vitals" data-motion="vitals" data-vital-tone="${vitalTone}" data-hp-value="${Number.isFinite(hp?.value) ? hp.value : ''}" data-hp-max="${Number.isFinite(hp?.max) ? hp.max : ''}"><div class="redline-health"><span class="redline-label">HP</span>${hp ? `${numberLabel(hp.value)} <small>/ ${numberLabel(hp.max)}</small>` : '<span class="redline-unavailable">HP недоступно</span>'}</div>${hp ? `<div class="redline-meter" aria-hidden="true"><span style="width:${healthPercent}%"></span></div>` : ''}<div class="redline-armor"><span class="redline-label">БРОНЯ</span>${actor.armor?.length ? actor.armor.map(item => `<span class="redline-armor-item" title="${escapeHTML(item.name)}"><span class="redline-armor-name">${escapeHTML(String(item.name || 'Броня').replace(' · отслеживаемая броня', ''))}</span> <b>SP ${numberLabel(item.sp)}</b></span>`).join('') : '<span class="redline-muted">Броня недоступна</span>'}</div></div>`;
}

/** Conditions are supplied by the read-only actor projection; no inference from portraits or HP. */
export function renderConditionStrip(actor) {
  const health = actor.healthStatus;
  const conditions = (Array.isArray(actor.conditions) ? actor.conditions : [])
    .filter(condition => condition && typeof condition.label === 'string' && condition.label.trim());
  if (!health?.label && !conditions.length) return '';
  const tone = ['normal', 'low', 'critical', 'unknown'].includes(health?.tone) ? health.tone : 'unknown';
  return `<div class="redline-condition-strip" aria-label="Состояние персонажа">${health?.label ? `<span class="redline-health-state" data-health-tone="${tone}" title="${escapeHTML(health.detail || health.label)}">${icon(tone === 'critical' ? 'fa-heart-crack' : 'fa-heart-pulse')}<span>${escapeHTML(health.label)}</span></span>` : ''}${conditions.map(condition => `<span class="redline-condition" data-condition-id="${escapeHTML(condition.id)}" title="${escapeHTML(condition.label)}">${escapeHTML(condition.label)}</span>`).join('')}</div>`;
}

const actionStates = {
  completed: {label:'Выполнено',icon:'fa-check'},
  cancelled: {label:'Отменено',icon:'fa-ban'},
  error: {label:'Не завершено',icon:'fa-triangle-exclamation'},
};

function resultButton(actor, entry, action, label, glyph) {
  return `<button type="button" class="redline-action-button redline-result-button${action === 'result-damage' ? ' redline-result-followup' : ''}" data-action="${action}" data-entry-id="${escapeHTML(entry.id)}" ${subjectAttributes(actor)} title="${escapeHTML(label)}"${actor.busy || !hasActionSubject(actor) ? ' disabled' : ''}>${icon(glyph)}<span>${escapeHTML(label)}</span></button>`;
}

/** Session-local action feedback. Native chat remains the source for adjudicating the roll. */
export function renderActionFeed(actor) {
  const entries = (Array.isArray(actor.recentActions) ? actor.recentActions : [])
    .filter(entry => entry && Object.hasOwn(actionStates, entry.status)).slice(0, 5);
  if (!entries.length) return `<section class="redline-result-onboarding" aria-label="Порядок действия"><span class="redline-result-onboarding-icon" aria-hidden="true">${icon('fa-dice')}</span><p><strong>Действуйте с панели</strong><span>Атака <b aria-hidden="true">→</b> диалог <b aria-hidden="true">→</b> результат в чате</span></p><span class="redline-result-onboarding-note">Здесь появятся последние действия</span></section>`;
  const latest = entries[0];
  const state = actionStates[latest.status];
  const completed = latest.status === 'completed';
  const hasTotal = completed && Number.isFinite(latest.total);
  const actions = `${completed && typeof latest.chatMessageId === 'string' && latest.chatMessageId ? resultButton(actor, latest, 'open-result-chat', 'Открыть чат', 'fa-comment-dots') : ''}${completed && latest.canRollDamage && latest.weaponId ? resultButton(actor, latest, 'result-damage', 'Урон при попадании…', 'fa-burst') : ''}`;
  return `<section class="redline-action-feed" aria-label="Последние действия персонажа"><article class="redline-result-card" data-motion="result" data-result-id="${escapeHTML(latest.id)}" data-result-status="${escapeHTML(latest.status)}"><div class="redline-result-copy"><header class="redline-result-heading"><span class="redline-eyebrow">ПОСЛЕДНЕЕ ДЕЙСТВИЕ</span><span class="redline-result-state">${icon(state.icon)}${state.label}</span></header><h3 class="redline-result-title">${escapeHTML(latest.title || 'Действие системы')}${latest.itemName ? `<span>${escapeHTML(latest.itemName)}</span>` : ''}</h3>${latest.detail ? `<p class="redline-result-detail">${escapeHTML(latest.detail)}</p>` : ''}</div>${hasTotal ? `<div class="redline-result-value" aria-label="Результат броска: ${numberLabel(latest.total)}"><span class="redline-label">БРОСОК</span><strong class="redline-result-total">${numberLabel(latest.total)}</strong></div>` : ''}${actions ? `<div class="redline-result-actions">${actions}</div>` : ''}${latest.nextStep ? `<p class="redline-result-next">${icon('fa-arrow-turn-down')}<span>${escapeHTML(latest.nextStep)}</span></p>` : ''}</article>${entries.length > 1 ? `<details class="redline-action-history" data-action-history${actor.historyOpen ? ' open' : ''}><summary>${icon('fa-clock-rotate-left')}<span>Ранее в этой сессии</span><small>${entries.length - 1}</small>${icon('fa-chevron-down')}</summary><ol>${entries.slice(1).map(entry => `<li data-result-status="${escapeHTML(entry.status)}"><span class="redline-history-state" title="${actionStates[entry.status].label}">${icon(actionStates[entry.status].icon)}</span><span class="redline-history-copy"><strong>${escapeHTML(entry.title || 'Действие системы')}${entry.itemName ? `<span> · ${escapeHTML(entry.itemName)}</span>` : ''}</strong>${entry.detail ? `<small>${escapeHTML(entry.detail)}</small>` : ''}</span><span class="redline-history-label">${actionStates[entry.status].label}</span></li>`).join('')}</ol></details>` : ''}</section>`;
}

function actorView(actor, targets, expanded, skillsOpen, skillState, arsenalOpen) {
  if (!actor) return `${workspaceBar(null, expanded, false, false)}<section id="redline-dock-content" class="redline-actor redline-empty" aria-label="Выбранный персонаж"><span class="redline-label">ПЕРСОНАЖ НЕ ВЫБРАН</span><h2>Выберите доступный токен на сцене</h2><p>Здесь появятся здоровье, оружие и действия персонажа. Выбор персонажа не меняет текущий ход.</p></section>`;
  const weapon = selectedWeapon(actor);
  const status = actor.status || (actor.busy ? 'Выполняется действие системы…' : expanded ? 'Выберите действие. Параметры броска откроются в диалоге.' : '');
  const statusTone = ['info', 'success', 'error'].includes(actor.statusTone) ? actor.statusTone : 'info';
  const statusIcon = actor.busy ? 'fa-spinner' : statusTone === 'success' ? 'fa-circle-check' : statusTone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  const weaponButton = (action, label, ability, fallback, glyph, className = '') => actionButton(actor, {action, id:weapon?.id, label, allowed:Boolean(weapon?.[ability]), reason:weapon?.reason || fallback, title:`${label}: ${weapon?.name || 'Оружие не выбрано'}`, icon:glyph, className});
  return `${workspaceBar(actor, expanded, skillsOpen, arsenalOpen)}<div class="redline-compact-summary"${expanded ? ' hidden' : ''}>${portrait(actor)}<strong title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</strong><span class="redline-compact-hp">HP <b>${numberLabel(actor.hp?.value)}</b> / ${numberLabel(actor.hp?.max)}</span><span class="redline-compact-weapon">${escapeHTML(weapon?.name || 'Нет оружия')}</span><span class="redline-compact-target">${targets.length ? `Цель: ${escapeHTML(targets.map(target => target.name || 'Цель').join(', '))}` : 'Цель не выбрана'}</span></div>
    <div class="redline-workspace-body"${expanded ? '' : ' hidden'}><section id="redline-dock-content" class="redline-actor" data-actor-key="${escapeHTML(actor.key)}" aria-label="Выбранный персонаж" aria-busy="${Boolean(actor.busy)}"${expanded ? '' : ' hidden'}>
      <div class="redline-identity" data-motion="actor" data-actor-key="${escapeHTML(actor.key)}">${portrait(actor, true)}<div class="redline-identity-text">${sectionLabel('01', 'ОПЕРАТОР')}<h2 title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</h2>${healthView(actor)}${renderConditionStrip(actor)}</div></div>
      ${weaponView(actor, weapon)}
      <section class="redline-primary-actions" aria-label="Действия персонажа">${sectionLabel('03', 'ДЕЙСТВИЯ')}${targetsView(targets)}${weaponButton('weapon-attack', 'Атака', 'canAttack', 'Выберите доступное оружие в листе персонажа.', 'fa-crosshairs', 'redline-action-primary')}<div class="redline-secondary-actions">${weaponButton('weapon-damage', 'Урон', 'canDamage', 'Для этого режима нет отдельного броска урона.', 'fa-burst')}${weaponButton('weapon-reload', 'Перезарядить', 'canReload', 'Это оружие не поддерживает перезарядку.', 'fa-arrows-rotate')}<button type="button" class="redline-action-button" data-action="toggle-skills" aria-expanded="${Boolean(skillsOpen)}" aria-controls="redline-skills-panel">${icon('fa-list')}<span>Навыки</span></button>${actionButton(actor, {action:'sheet', label:'Лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}</div><p class="redline-action-note redline-attack-note">${escapeHTML(weapon?.canAttack ? 'Режим и модификаторы — в диалоге атаки.' : weapon?.reason || 'Экипируйте доступное оружие в листе персонажа.')}</p></section>
    </section>${renderActionFeed(actor)}</div>${quickSkills(actor, expanded)}
    <div class="redline-feedback${actor.busy ? ' is-busy' : ''}" data-status-tone="${escapeHTML(statusTone)}"${status ? '' : ' hidden'}><span class="redline-feedback-icon" aria-hidden="true">${icon(statusIcon)}</span><p class="redline-action-status" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(status)}</p></div>${renderSkillsPanel(actor, expanded && skillsOpen, skillState)}${renderArsenalPanel(actor, expanded && arsenalOpen)}`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const expanded = Boolean(model.dockExpanded);
  const scale = normalizeInterfaceScale(model.interfaceScale);
  const notices = [model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : '', !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || 'мира')} не поддерживается. Действия доступны для Cyberpunk RED.</p>` : ''].join('');
  return `<div class="redline-interface redline-blackglass${expanded ? ' is-dock-expanded' : ' is-dock-compact'}${model.hasHostBar ? ' has-host-bar' : ''}" data-layout="blackglass-dock" data-scale="${scale}" data-animations="${model.animationsEnabled !== false}">
    <header class="redline-header redline-panel"><div class="redline-brand">REDLINE <span>/ COMBAT</span></div><nav class="redline-toolbar" aria-label="Управление REDLINE"><button type="button" data-action="refresh" class="redline-small" aria-label="Обновить данные" title="Перечитать данные мира без изменения документов">${icon('fa-rotate-right')}</button><button type="button" data-action="close" class="redline-small" aria-label="Закрыть REDLINE" title="Закрыть REDLINE">${icon('fa-xmark')}</button></nav></header>
    ${combat.started ? `<section class="redline-combat redline-panel" aria-label="Очередь инициативы"><div class="redline-round"><span class="redline-label">РАУНД</span><strong>${numberLabel(combat.round)}</strong></div><div class="redline-queue" aria-label="Участники боя">${combatants.map(combatantView).join('')}</div><div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? '' : ' disabled'}>${combat.pending ? 'Обновление…' : 'Следующий ход'}</button></div></section>` : ''}
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ''}
    <div class="redline-bottom"><div class="redline-dock redline-panel" data-actor-key="${escapeHTML(model.selected?.key)}"><nav class="redline-dock-utilities" aria-label="Вид панели персонажа"><button type="button" class="redline-dock-settings" data-action="scale-settings" aria-label="Настроить размер REDLINE" title="Размер панели: ${scale}%">${icon('fa-gear')}</button><button type="button" class="redline-dock-toggle" data-action="toggle-dock" aria-expanded="${expanded}" aria-controls="redline-dock-content" aria-label="${expanded ? 'Свернуть панель персонажа' : 'Развернуть панель персонажа'}" title="${expanded ? 'Свернуть панель персонажа' : 'Развернуть панель персонажа'}">${icon(expanded ? 'fa-chevron-down' : 'fa-chevron-up')}</button></nav>${actorView(model.selected, targets, expanded, Boolean(model.skillsOpen), model.skillState, Boolean(model.arsenalOpen))}</div></div>
  </div>`;
}

export function renderScaleSettings(value, animationsEnabled = true) {
  const scale = normalizeInterfaceScale(value);
  return `<form class="redline-scale-form"><div class="form-group"><label for="redline-interface-scale">Масштаб REDLINE, %</label><div class="form-fields"><input id="redline-interface-scale" name="scale" type="range" min="55" max="125" step="5" value="${scale}" aria-describedby="redline-scale-note"><output for="redline-interface-scale">${scale}%</output></div></div><p id="redline-scale-note" class="notes">Размер панели персонажа и очереди боя сохраняется только для вас. По умолчанию — 80%.</p><div class="form-group"><label for="redline-animations">Плавные анимации</label><div class="form-fields"><input id="redline-animations" name="animations" type="checkbox"${animationsEnabled ? ' checked' : ''} aria-describedby="redline-animations-note"></div></div><p id="redline-animations-note" class="notes">Переходы панелей и подсветка изменений. Настройка уменьшения движения в системе сохраняет приоритет.</p></form>`;
}
