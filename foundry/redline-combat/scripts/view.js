/** HTML presentation only. All permissions and native actions belong to the host. */
import { selectedWeapon, normalizeInterfaceScale } from './presentation.js';

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

function weaponView(actor, weapon) {
  const weapons = Array.isArray(actor.weapons) ? actor.weapons : [];
  if (!weapon) return `<section class="redline-weapons redline-no-weapon" aria-label="Оружие персонажа"><span class="redline-label">ОРУЖИЕ</span>${icon('fa-gun')}<p class="redline-muted">Нет экипированного оружия</p></section>`;
  const image = safeImage(weapon.img);
  const disabled = actor.busy || !hasActionSubject(actor);
  return `<section class="redline-weapons" aria-label="Оружие персонажа" data-weapon-id="${escapeHTML(weapon.id)}">
    <div class="redline-weapon-pickers"><label class="redline-weapon-picker"><span class="redline-sr-only">Оружие</span><select data-weapon-select ${subjectAttributes(actor)} aria-label="Экипированное оружие" title="Выбрать оружие для панели; экипировка в листе не меняется"${disabled ? ' disabled' : ''}>${weapons.map(item => `<option value="${escapeHTML(item.id)}"${String(item.id) === String(weapon.id) ? ' selected' : ''}>${escapeHTML(item.name || 'Оружие')}</option>`).join('')}</select></label>${weaponMode(weapon, actor)}</div>
    <div class="redline-weapon-preview"><div class="redline-weapon-art" aria-hidden="true">${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy">` : icon('fa-gun')}</div><div class="redline-weapon-data"><span class="redline-label">${weapon.ammo ? 'ПАТРОНЫ' : 'БЛИЖНИЙ БОЙ'}</span><div class="redline-ammo-line"><span class="redline-weapon-ammo" aria-label="Боезапас">${weapon.ammo ? `${numberLabel(weapon.ammo.value)} <small>/ ${numberLabel(weapon.ammo.max)}</small>` : '—'}</span>${actionButton(actor, {action:'weapon-load', id:weapon.id, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open', iconOnly:true})}</div><div class="redline-weapon-meta">${weapon.damageLabel ? `<span>${escapeHTML(weapon.damageLabel)}</span>` : ''}${Number.isFinite(weapon.rof) ? `<span>ROF ${numberLabel(weapon.rof)}</span>` : ''}</div></div></div>
  </section>`;
}

function targetsView(targets) {
  return `<div class="redline-targets" aria-label="Цели атаки">${targets.length ? portrait(targets[0]) : `<span class="redline-target-icon" aria-hidden="true">${icon('fa-crosshairs')}</span>`}<div class="redline-target-copy"><span class="redline-label">${targets.length > 1 ? `ЦЕЛИ · ${targets.length}` : 'ЦЕЛЬ'}</span><span class="redline-target-list" title="${escapeHTML(targets.map(target => target.name || 'Цель').join(', '))}">${targets.length ? targets.map(target => `<span>${escapeHTML(target.name || 'Цель')}</span>`).join('<span class="redline-muted">, </span>') : '<span class="redline-muted">Выберите цель на сцене</span>'}</span></div></div>`;
}

function skillView(actor, open) {
  const skills = Array.isArray(actor.skills) ? actor.skills : [];
  const quickSkills = Array.isArray(actor.quickSkills) ? actor.quickSkills : [];
  const disabled = actor.busy || !hasActionSubject(actor) || !skills.length;
  return `<section id="redline-skills-panel" class="redline-skill-popover redline-panel" aria-label="Навыки и броски персонажа"${open ? '' : ' hidden'}>
    <header class="redline-popover-header"><strong>Навыки и броски</strong><button type="button" data-action="toggle-skills" class="redline-small" aria-label="Закрыть навыки" title="Закрыть навыки">${icon('fa-xmark')}</button></header>
    <div class="redline-action-tools"><section class="redline-skills" aria-label="Навыки персонажа"><span class="redline-label">БЫСТРЫЕ ПРОВЕРКИ</span>${quickSkills.length ? `<div class="redline-quick-skills">${quickSkills.map(skill => actionButton(actor, {action:'skill', id:skill.id, label:skill.name || 'Навык', title:`Проверка: ${skill.name || 'Навык'}`, allowed:Boolean(skill.id)})).join('')}</div>` : ''}<div class="redline-skill-picker"><label><span>Все навыки</span><select data-skill-select ${subjectAttributes(actor)} aria-label="Все навыки персонажа"${disabled ? ' disabled' : ''}>${skills.length ? skills.map(skill => `<option value="${escapeHTML(skill.id)}"${actor.selectedSkillId != null && String(skill.id) === String(actor.selectedSkillId) ? ' selected' : ''}>${escapeHTML(skill.name || 'Навык')}${Number.isFinite(skill.base) ? ` · ${numberLabel(skill.base)}` : ''}</option>`).join('') : '<option value="">Нет доступных навыков</option>'}</select></label>${actionButton(actor, {action:'selected-skill', label:'Бросить', title:'Бросить выбранный навык', allowed:skills.length > 0, reason:'В листе нет доступных навыков.'})}</div></section>
    <div class="redline-character-actions" aria-label="Броски персонажа">${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}</div><p class="redline-action-note redline-muted">Броски и применение урона — через диалоги и чат системы.</p></div>
  </section>`;
}

function healthView(actor) {
  const hp = actor.hp;
  const healthPercent = hp && Number.isFinite(hp.value) && Number.isFinite(hp.max) && hp.max > 0 ? Math.max(0, Math.min(100, hp.value / hp.max * 100)) : 0;
  return `<div class="redline-vitals"><div class="redline-health"><span class="redline-label">HP</span>${hp ? `${numberLabel(hp.value)} <small>/ ${numberLabel(hp.max)}</small>` : '<span class="redline-unavailable">HP недоступно</span>'}</div>${hp ? `<div class="redline-meter" aria-hidden="true"><span style="width:${healthPercent}%"></span></div>` : ''}<div class="redline-armor"><span class="redline-label">БРОНЯ</span>${actor.armor?.length ? actor.armor.map(item => `<span title="${escapeHTML(item.name)}">${escapeHTML(String(item.name || 'Броня').replace(' · отслеживаемая броня', ''))} <b>SP ${numberLabel(item.sp)}</b></span>`).join('') : '<span class="redline-muted">Броня недоступна</span>'}</div></div>`;
}

function actorView(actor, targets, expanded, skillsOpen) {
  if (!actor) return `<section id="redline-dock-content" class="redline-actor redline-empty" aria-label="Выбранный персонаж"><span class="redline-label">ПЕРСОНАЖ НЕ ВЫБРАН</span><h2>Выберите доступный токен на сцене</h2><p>Здесь появятся здоровье, оружие и действия персонажа. Выбор персонажа не меняет текущий ход.</p></section>`;
  const weapon = selectedWeapon(actor);
  const status = actor.status || (actor.busy ? 'Выполняется действие системы…' : '');
  const weaponButton = (action, label, ability, fallback, glyph, className = '') => actionButton(actor, {action, id:weapon?.id, label, allowed:Boolean(weapon?.[ability]), reason:weapon?.reason || fallback, title:`${label}: ${weapon?.name || 'Оружие не выбрано'}`, icon:glyph, className});
  return `<div class="redline-compact-summary"${expanded ? ' hidden' : ''}>${portrait(actor)}<strong title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</strong><span class="redline-compact-hp">HP <b>${numberLabel(actor.hp?.value)}</b> / ${numberLabel(actor.hp?.max)}</span><span class="redline-compact-weapon">${escapeHTML(weapon?.name || 'Нет оружия')}</span><span class="redline-compact-target">${targets.length ? `Цель: ${escapeHTML(targets.map(target => target.name || 'Цель').join(', '))}` : 'Цель не выбрана'}</span></div>
    <section id="redline-dock-content" class="redline-actor" aria-label="Выбранный персонаж" aria-busy="${Boolean(actor.busy)}"${expanded ? '' : ' hidden'}>
      <div class="redline-identity">${portrait(actor, true)}<div class="redline-identity-text"><h2 title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</h2>${healthView(actor)}</div></div>
      ${weaponView(actor, weapon)}
      <section class="redline-primary-actions" aria-label="Действия персонажа">${targetsView(targets)}${weaponButton('weapon-attack', 'Атака', 'canAttack', 'Выберите доступное оружие в листе персонажа.', 'fa-crosshairs', 'redline-action-primary')}<div class="redline-secondary-actions">${weaponButton('weapon-damage', 'Урон', 'canDamage', 'Для этого режима нет отдельного броска урона.', 'fa-burst')}${weaponButton('weapon-reload', 'Перезарядить', 'canReload', 'Это оружие не поддерживает перезарядку.', 'fa-arrows-rotate')}<button type="button" class="redline-action-button" data-action="toggle-skills" aria-expanded="${Boolean(skillsOpen)}" aria-controls="redline-skills-panel">${icon('fa-list')}<span>Навыки</span></button>${actionButton(actor, {action:'sheet', label:'Лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}</div></section>
    </section>
    <p class="redline-action-status" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(status)}</p>${skillView(actor, expanded && skillsOpen)}`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const expanded = Boolean(model.dockExpanded);
  const scale = normalizeInterfaceScale(model.interfaceScale);
  const notices = [model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : '', !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || 'мира')} не поддерживается. Действия доступны для Cyberpunk RED.</p>` : ''].join('');
  return `<div class="redline-interface redline-blackglass${expanded ? ' is-dock-expanded' : ' is-dock-compact'}${model.hasHostBar ? ' has-host-bar' : ''}" data-layout="blackglass-dock" data-scale="${scale}">
    <header class="redline-header redline-panel"><div class="redline-brand">REDLINE <span>/ COMBAT</span></div><nav class="redline-toolbar" aria-label="Управление REDLINE"><button type="button" data-action="refresh" class="redline-small" aria-label="Обновить данные" title="Перечитать данные мира без изменения документов">${icon('fa-rotate-right')}</button><button type="button" data-action="close" class="redline-small" aria-label="Закрыть REDLINE" title="Закрыть REDLINE">${icon('fa-xmark')}</button></nav></header>
    ${combat.started ? `<section class="redline-combat redline-panel" aria-label="Очередь инициативы"><div class="redline-round"><span class="redline-label">РАУНД</span><strong>${numberLabel(combat.round)}</strong></div><div class="redline-queue" aria-label="Участники боя">${combatants.map(combatantView).join('')}</div><div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? '' : ' disabled'}>${combat.pending ? 'Обновление…' : 'Следующий ход'}</button></div></section>` : ''}
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ''}
    <div class="redline-bottom"><div class="redline-dock redline-panel"><nav class="redline-dock-utilities" aria-label="Вид панели персонажа"><button type="button" class="redline-dock-settings" data-action="scale-settings" aria-label="Настроить размер REDLINE" title="Размер панели: ${scale}%">${icon('fa-gear')}</button><button type="button" class="redline-dock-toggle" data-action="toggle-dock" aria-expanded="${expanded}" aria-controls="redline-dock-content" aria-label="${expanded ? 'Свернуть панель персонажа' : 'Развернуть панель персонажа'}" title="${expanded ? 'Свернуть панель персонажа' : 'Развернуть панель персонажа'}">${icon(expanded ? 'fa-chevron-down' : 'fa-chevron-up')}</button></nav>${actorView(model.selected, targets, expanded, Boolean(model.skillsOpen))}</div></div>
  </div>`;
}

export function renderScaleSettings(value) {
  const scale = normalizeInterfaceScale(value);
  return `<form class="redline-scale-form"><div class="form-group"><label for="redline-interface-scale">Масштаб REDLINE, %</label><div class="form-fields"><input id="redline-interface-scale" name="scale" type="range" min="55" max="125" step="5" value="${scale}" aria-describedby="redline-scale-note"><output for="redline-interface-scale">${scale}%</output></div></div><p id="redline-scale-note" class="notes">Размер панели персонажа и очереди боя сохраняется только для вас. По умолчанию — 80%.</p></form>`;
}
