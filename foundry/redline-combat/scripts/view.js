/** HTML presentation only. All permissions and native actions belong to the host. */
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const numberLabel = (value) => Number.isFinite(value) ? escapeHTML(value) : "—";

function portrait(entity, large = false) {
  const source = typeof entity?.img === "string" ? entity.img.trim() : "";
  // Foundry generally supplies a relative asset URL. Reject executable URL schemes.
  const safeSource = source && !/^(?:javascript|vbscript|data):/i.test(source);
  const initials = String(entity?.name || "?").trim().split(/\s+/).slice(0, 2)
    .map((word) => Array.from(word)[0] || "?").join("").toUpperCase();
  return `<span class="redline-portrait${large ? " redline-portrait-large" : ""}" aria-hidden="true">${
    safeSource ? `<img src="${escapeHTML(source)}" alt="" loading="lazy">` : escapeHTML(initials)
  }</span>`;
}

function combatantView(combatant) {
  const classes = ["redline-unit", combatant.current ? "is-current" : "", combatant.selected ? "is-selected" : "", combatant.defeated ? "is-defeated" : ""].filter(Boolean).join(" ");
  const status = [combatant.current ? "Текущий ход" : "", combatant.selected ? "Выбран" : "", combatant.defeated ? "Побеждён" : ""].filter(Boolean).join(" · ");
  return `<button type="button" class="${classes}" data-action="select-combatant" data-id="${escapeHTML(combatant.id)}" aria-pressed="${Boolean(combatant.selected)}" title="${escapeHTML(combatant.name)}${status ? ` · ${escapeHTML(status)}` : ""}${combatant.selectable ? " · Показать персонажа в HUD; ход не меняется" : " · Нет прав на персонажа"}"${combatant.selectable ? "" : " disabled"}>
    ${portrait(combatant)}<span class="redline-unit-name"><strong>${escapeHTML(combatant.name || "Участник")}</strong><small>${escapeHTML(status || "Участник боя")}</small></span><span class="redline-initiative" aria-label="Инициатива">${numberLabel(combatant.initiative)}</span>
  </button>`;
}

const subjectAttributes = actor => `data-subject="${escapeHTML(actor.key)}" data-revision="${escapeHTML(actor.revision)}"`;
const hasActionSubject = actor => typeof actor.key === "string" && actor.key.length > 0
  && actor.revision !== undefined && actor.revision !== null && Number.isFinite(Number(actor.revision));

function actionButton(actor, { action, id, label, allowed = true, reason = "Действие недоступно.", title = label, icon = "", className = "" }) {
  const enabled = !actor.busy && hasActionSubject(actor) && allowed;
  const tooltip = actor.busy ? "Дождитесь завершения текущего действия." : enabled ? title : reason;
  return `<button type="button" class="redline-action-button ${className}" data-action="${escapeHTML(action)}"${id === undefined ? "" : ` data-id="${escapeHTML(id)}"`} ${subjectAttributes(actor)} title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(title)}"${enabled ? "" : " disabled"}>${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : escapeHTML(label)}</button>`;
}

function weaponView(weapon, actor) {
  const name = String(weapon.name || "Оружие");
  const modes = Array.isArray(weapon.modes) ? weapon.modes : [];
  const modeDisabled = actor.busy || !hasActionSubject(actor) || !modes.length;
  const modeTitle = actor.busy ? "Дождитесь завершения текущего действия." : modes.length ? `Режим: ${name}` : "Режимы этого оружия недоступны.";
  const button = (action, label, allowed, fallback, icon = "") => actionButton(actor, {
    action, id: weapon.id, label, allowed: Boolean(allowed), icon,
    reason: weapon.reason || fallback, title: `${label}: ${name}`,
    className: icon ? "redline-action-icon" : action === "weapon-attack" ? "redline-action-primary" : "",
  });
  const ammo = weapon.ammo ? `${numberLabel(weapon.ammo.value)}${Number.isFinite(weapon.ammo.max) ? ` / ${numberLabel(weapon.ammo.max)}` : ""}` : "—";
  const metadata = [weapon.damageLabel ? `Урон ${escapeHTML(weapon.damageLabel)}` : "", Number.isFinite(weapon.rof) ? `ROF ${numberLabel(weapon.rof)}` : ""].filter(Boolean).join(" · ");
  return `<li class="redline-weapon" data-weapon-id="${escapeHTML(weapon.id)}">
    <div class="redline-weapon-summary"><strong class="redline-weapon-name" title="${escapeHTML(name)}">${escapeHTML(name)}</strong><span class="redline-weapon-ammo" aria-label="Боезапас">${ammo}</span></div>
    ${metadata ? `<div class="redline-weapon-meta">${metadata}</div>` : ""}
    <div class="redline-weapon-controls">
      <label class="redline-weapon-mode"><span>Режим</span><select data-weapon-mode data-id="${escapeHTML(weapon.id)}" ${subjectAttributes(actor)} aria-label="${escapeHTML(`Режим: ${name}`)}" title="${escapeHTML(modeTitle)}"${modeDisabled ? " disabled" : ""}>${modes.length ? modes.map(mode => `<option value="${escapeHTML(mode.id)}"${String(mode.id) === String(weapon.mode) ? " selected" : ""}>${escapeHTML(mode.label || mode.id)}</option>`).join("") : '<option value="">Недоступен</option>'}</select></label>
      ${button("weapon-attack", "Атака", weapon.canAttack, "Атака этим оружием недоступна.")}
      ${button("weapon-damage", "Урон", weapon.canDamage, "Для этого режима нет отдельного броска урона.")}
      ${button("weapon-reload", "Перезарядить", weapon.canReload, "Это оружие не поддерживает перезарядку.")}
      ${button("weapon-load", "Выбрать патроны", weapon.canLoad, "Выбор патронов для этого оружия недоступен.", "fa-box-open")}
    </div>
  </li>`;
}

function skillView(actor) {
  const skills = Array.isArray(actor.skills) ? actor.skills : [];
  const quickSkills = Array.isArray(actor.quickSkills) ? actor.quickSkills : [];
  const disabled = actor.busy || !hasActionSubject(actor) || !skills.length;
  return `<div class="redline-action-tools">
    <section class="redline-skills" aria-label="Навыки персонажа"><span class="redline-label">НАВЫКИ</span>
      ${quickSkills.length ? `<div class="redline-quick-skills">${quickSkills.map(skill => actionButton(actor, { action: "skill", id: skill.id, label: skill.name || "Навык", title: `Проверка: ${skill.name || "Навык"}`, allowed: Boolean(skill.id) })).join("")}</div>` : ""}
      <div class="redline-skill-picker"><label><span>Все навыки</span><select data-skill-select ${subjectAttributes(actor)} aria-label="Все навыки персонажа"${disabled ? " disabled" : ""}>${skills.length ? skills.map(skill => `<option value="${escapeHTML(skill.id)}"${actor.selectedSkillId != null && String(skill.id) === String(actor.selectedSkillId) ? " selected" : ""}>${escapeHTML(skill.name || "Навык")}${Number.isFinite(skill.base) ? ` · ${numberLabel(skill.base)}` : ""}</option>`).join("") : '<option value="">Нет доступных навыков</option>'}</select></label>${actionButton(actor, { action: "selected-skill", label: "Бросить", title: "Бросить выбранный навык", allowed: skills.length > 0, reason: "В листе нет доступных навыков." })}</div>
    </section>
    <div class="redline-character-actions" aria-label="Броски персонажа">${actionButton(actor, { action: "initiative", label: "Инициатива", allowed: Boolean(actor.canInitiative), reason: "Добавьте этого персонажа в бой, чтобы бросить инициативу." })}${actionButton(actor, { action: "death-save", label: "Спасбросок смерти", allowed: Boolean(actor.canDeathSave), reason: "Спасбросок смерти доступен при смертельном ранении." })}</div>
    <p class="redline-action-note redline-muted">Броски и применение урона — через диалоги и чат системы.</p>
  </div>`;
}

function actorView(actor) {
  if (!actor) return `<section class="redline-actor redline-empty" aria-label="Выбранный персонаж"><span class="redline-label">ПЕРСОНАЖ НЕ ВЫБРАН</span><h2>Выберите доступный токен на сцене</h2><p>Здесь появятся здоровье, оружие и действия персонажа. Выбор персонажа не меняет текущий ход.</p></section>`;
  const hp = actor.hp;
  const healthPercent = hp && Number.isFinite(hp.value) && Number.isFinite(hp.max) && hp.max > 0
    ? Math.max(0, Math.min(100, hp.value / hp.max * 100)) : 0;
  const armor = Array.isArray(actor.armor) ? actor.armor : [];
  const weapons = Array.isArray(actor.weapons) ? actor.weapons : [];
  return `<section class="redline-actor" aria-label="Выбранный персонаж" aria-busy="${Boolean(actor.busy)}">
    <div class="redline-identity">${portrait(actor, true)}<div class="redline-identity-text"><span class="redline-label">ВЫБРАННЫЙ ПЕРСОНАЖ</span><h2 title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || "Персонаж")}</h2><button type="button" data-action="sheet" ${subjectAttributes(actor)} class="redline-small" title="${actor.busy ? "Дождитесь завершения текущего действия." : actor.canOpenSheet ? "Открыть лист персонажа" : "Нет доступа к листу персонажа"}"${actor.canOpenSheet && !actor.busy ? "" : " disabled"}>Открыть лист</button></div></div>
    <div class="redline-vitals"><span class="redline-label">ЗДОРОВЬЕ</span><div class="redline-health">${hp ? `${numberLabel(hp.value)} <small>/ ${numberLabel(hp.max)}</small>` : '<span class="redline-unavailable">HP недоступно</span>'}</div>${hp ? `<div class="redline-meter" aria-hidden="true"><span style="width:${healthPercent}%"></span></div>` : ""}<div class="redline-armor">${armor.length ? armor.map((item) => `<span title="${escapeHTML(item.name)}">${escapeHTML(item.name || "Броня")} <b>SP ${numberLabel(item.sp)}</b></span>`).join("") : '<span class="redline-muted">Броня недоступна</span>'}</div></div>
    <div class="redline-weapons"><span class="redline-label">ЭКИПИРОВАННОЕ ОРУЖИЕ</span>${weapons.length ? `<ul>${weapons.map(weapon => weaponView(weapon, actor)).join("")}</ul>` : '<p class="redline-muted">Нет экипированного оружия</p>'}</div>
    ${skillView(actor)}
    <p class="redline-action-status" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(actor.status || (actor.busy ? "Выполняется действие системы…" : ""))}</p>
  </section>`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const notices = [
    model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : "",
    !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || "мира")} не поддерживается. Действия доступны для Cyberpunk RED.</p>` : ""
  ].join("");
  return `<div class="redline-interface">
    <header class="redline-header redline-panel">
      <div class="redline-heading"><div class="redline-brand">REDLINE <span>/ COMBAT</span></div><span class="redline-label">ПЕРСОНАЖ · ОРУЖИЕ · НАВЫКИ</span></div>
      <nav class="redline-toolbar" aria-label="Управление REDLINE"><button type="button" data-action="refresh" class="redline-small" aria-label="Обновить данные" title="Перечитать данные мира без изменения документов">↻</button><button type="button" data-action="close" class="redline-small" aria-label="Закрыть REDLINE" title="Закрыть REDLINE">×</button></nav>
    </header>
    <section class="redline-combat redline-panel" aria-label="Очередь инициативы">
      <div class="redline-round"><span class="redline-label">РАУНД</span><strong>${numberLabel(combat.round)}</strong></div>
      <div class="redline-queue" aria-label="Участники боя">${combatants.length ? combatants.map(combatantView).join("") : '<p class="redline-muted redline-no-combat">Активного боя нет. Начните бой через трекер Foundry.</p>'}</div>
      <div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? "" : " disabled"}>${combat.pending ? "Обновление…" : "Следующий ход"}</button><span class="redline-muted">${combat.canAdvance ? "Команда трекеру Foundry" : "Смена хода доступна GM"}</span></div>
    </section>
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ""}
    <div class="redline-bottom">
      <div class="redline-targets redline-panel"><span class="redline-label">ЦЕЛИ</span><span class="redline-target-list">${targets.length ? targets.map((target) => `<span title="${escapeHTML(target.name)}">${escapeHTML(target.name || "Цель")}</span>`).join("") : '<span class="redline-muted">Выберите цели на сцене</span>'}</span><span class="redline-footnote redline-muted">Цели для бросков системы</span></div>
      <div class="redline-dock redline-panel">${actorView(model.selected)}</div>
    </div>
  </div>`;
}
