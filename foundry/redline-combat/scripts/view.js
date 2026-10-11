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

function actorView(actor) {
  if (!actor) return `<section class="redline-actor redline-empty" aria-label="Выбранный персонаж"><span class="redline-label">ПЕРСОНАЖ НЕ ВЫБРАН</span><h2>Выберите доступный токен на сцене</h2><p>Панель покажет его здоровье, броню и оружие. Выбор персонажа не меняет текущий ход.</p></section>`;
  const hp = actor.hp;
  const healthPercent = hp && Number.isFinite(hp.value) && Number.isFinite(hp.max) && hp.max > 0
    ? Math.max(0, Math.min(100, hp.value / hp.max * 100)) : 0;
  const armor = Array.isArray(actor.armor) ? actor.armor : [];
  const weapons = Array.isArray(actor.weapons) ? actor.weapons : [];
  return `<section class="redline-actor" aria-label="Выбранный персонаж">
    <div class="redline-identity">${portrait(actor, true)}<div class="redline-identity-text"><span class="redline-label">ВЫБРАННЫЙ ПЕРСОНАЖ</span><h2 title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || "Персонаж")}</h2><button type="button" data-action="sheet" class="redline-small"${actor.canOpenSheet ? "" : " disabled"}>Открыть лист</button></div></div>
    <div class="redline-vitals"><span class="redline-label">ЗДОРОВЬЕ</span><div class="redline-health">${hp ? `${numberLabel(hp.value)} <small>/ ${numberLabel(hp.max)}</small>` : '<span class="redline-unavailable">HP недоступно</span>'}</div>${hp ? `<div class="redline-meter" aria-hidden="true"><span style="width:${healthPercent}%"></span></div>` : ""}<div class="redline-armor">${armor.length ? armor.map((item) => `<span title="${escapeHTML(item.name)}">${escapeHTML(item.name || "Броня")} <b>SP ${numberLabel(item.sp)}</b></span>`).join("") : '<span class="redline-muted">Броня недоступна</span>'}</div></div>
    <div class="redline-weapons"><span class="redline-label">ОРУЖИЕ · ДАННЫЕ ЛИСТА</span>${weapons.length ? `<ul>${weapons.map((weapon) => `<li><span title="${escapeHTML(weapon.name)}">${escapeHTML(weapon.name || "Оружие")}</span><b aria-label="Боезапас">${weapon.ammo ? `${numberLabel(weapon.ammo.value)}${Number.isFinite(weapon.ammo.max) ? ` / ${numberLabel(weapon.ammo.max)}` : ""}` : "—"}</b></li>`).join("")}</ul>` : '<p class="redline-muted">Доступного оружия нет</p>'}<p class="redline-muted redline-footnote">Броски и урон выполняются через лист системы.</p></div>
  </section>`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const notices = [
    model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : "",
    !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || "мира")} не поддерживается. Доступен демонстрационный просмотр REDLINE.</p>` : ""
  ].join("");
  return `<div class="redline-interface">
    <header class="redline-header redline-panel">
      <div class="redline-heading"><div class="redline-brand">REDLINE <span>/ COMBAT</span></div><span class="redline-label">ПРОСМОТР ДАННЫХ МИРА</span></div>
      <nav class="redline-toolbar" aria-label="Управление REDLINE"><button type="button" data-action="demo" class="redline-preview" title="Отдельный демонстрационный сценарий: атаки и урон не изменяют документы мира">Демонстрационный просмотр</button><button type="button" data-action="refresh" class="redline-small" aria-label="Обновить данные" title="Перечитать данные мира без изменения документов">↻</button><button type="button" data-action="close" class="redline-small" aria-label="Закрыть REDLINE" title="Закрыть REDLINE">×</button></nav>
    </header>
    <section class="redline-combat redline-panel" aria-label="Очередь инициативы">
      <div class="redline-round"><span class="redline-label">РАУНД</span><strong>${numberLabel(combat.round)}</strong></div>
      <div class="redline-queue" aria-label="Участники боя">${combatants.length ? combatants.map(combatantView).join("") : '<p class="redline-muted redline-no-combat">Активного боя нет. Начните бой через трекер Foundry.</p>'}</div>
      <div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? "" : " disabled"}>${combat.pending ? "Обновление…" : "Следующий ход"}</button><span class="redline-muted">${combat.canAdvance ? "Команда трекеру Foundry" : "Смена хода доступна GM"}</span></div>
    </section>
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ""}
    <div class="redline-bottom">
      <div class="redline-targets redline-panel"><span class="redline-label">ЦЕЛИ</span><span class="redline-target-list">${targets.length ? targets.map((target) => `<span title="${escapeHTML(target.name)}">${escapeHTML(target.name || "Цель")}</span>`).join("") : '<span class="redline-muted">Выберите цели на сцене</span>'}</span><span class="redline-footnote redline-muted">Просмотр · атака не запускается</span></div>
      <div class="redline-dock redline-panel">${actorView(model.selected)}</div>
    </div>
  </div>`;
}
