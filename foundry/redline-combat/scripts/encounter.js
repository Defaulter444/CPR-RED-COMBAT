/** Read-only encounter presentation. Never evaluates a hit or writes a Document. */
export const MAX_RECENT_ACTIONS = 5;

export function canReadResultMessage(message, user) {
  // CPR cards contain HTML, not Foundry Roll objects. CPR also hides blind
  // cards from their non-GM author; isContentVisible alone would leak them.
  return Boolean(message?.visible === true && message?.isContentVisible === true
    && (!message.blind || user?.isGM));
}

export function nativeResultSummary(roll, message, user, kind) {
  if (!canReadResultMessage(message, user)) return {total:null, chatMessageId:null};
  return {
    total:Number.isFinite(roll?.resultTotal) ? roll.resultTotal : null,
    chatMessageId:typeof message.id === 'string' ? message.id : null,
    criticalBonus:kind === 'weapon-damage' && roll?.wasCritSuccess?.()
      && Number.isFinite(roll.bonusDamage) ? roll.bonusDamage : null,
    saveResult:kind === 'death-save' && typeof roll?.saveResult === 'string' ? roll.saveResult : null,
  };
}

const actionLabels = {
  'weapon-attack':'Бросок атаки', 'weapon-damage':'Бросок урона', skill:'Проверка навыка',
  'death-save':'Спасбросок смерти', initiative:'Инициатива',
  'weapon-reload':'Перезарядка', 'weapon-load':'Загрузка боеприпасов',
};

export function describeAction(request, actor, localize = value => value) {
  const item = actor.items?.get?.(request.id) ?? Array.from(actor.items ?? []).find(row => row.id === request.id);
  return {
    kind:request.action, title:actionLabels[request.action] || 'Действие системы',
    itemName:item ? String(request.action === 'skill' ? localize(item.name) : item.name || '') : '',
    weaponId:request.action.startsWith('weapon-') ? request.id : null,
    mode:request.mode || null,
  };
}

export function actionEntry(description, result, id) {
  const status = result.status;
  const kind = description.kind;
  const completed = status === 'completed';
  let detail = completed ? 'Бросок отправлен в чат.' : status === 'cancelled'
    ? 'Бросок отменён в диалоге системы.' : 'Действие не завершено. Проверьте сообщения системы.';
  let nextStep = '';
  if (completed) {
    if (kind === 'weapon-attack') nextStep = 'Сравните результат с DV или защитой цели. При попадании переходите к урону.';
    else if (kind === 'weapon-damage') nextStep = 'Примените урон штатными кнопками в карточке чата.';
    else if (kind === 'skill') nextStep = 'Сравните результат со сложностью проверки или встречным броском.';
    else if (kind === 'initiative') { detail = 'Инициатива обработана трекером боя.'; nextStep = 'Очередь ходов обновляется через трекер Foundry.'; }
    else if (['weapon-reload','weapon-load'].includes(kind)) { detail = 'Диалог боеприпасов завершён.'; nextStep = 'Проверьте текущий магазин на панели оружия.'; }
    if (result.summary && !result.summary.chatMessageId) {
      detail = 'Бросок отправлен в чат. Результат скрыт или недоступен.';
      nextStep = 'Уточните результат у ведущего.';
    }
  }
  return {...description, id:String(id), status, detail, nextStep,
    total:null, chatMessageId:null, ...result.summary,
    canRollDamage:completed && kind === 'weapon-attack' && description.mode !== 'suppressive'};
}

export function appendAction(entries, entry) {
  return [entry,...(Array.isArray(entries) ? entries : []).filter(row => row.id !== entry.id)].slice(0,MAX_RECENT_ACTIONS);
}

/** Recheck message privacy at render time, including deleted/changed whispers. */
export function projectRecentActions(entries, {user, getMessage, canDamage = () => false} = {}) {
  return (Array.isArray(entries) ? entries : []).slice(0,MAX_RECENT_ACTIONS).map(entry => {
    const readable = entry.chatMessageId && canReadResultMessage(getMessage?.(entry.chatMessageId),user);
    const projected = {...entry,canRollDamage:Boolean(entry.canRollDamage && canDamage(entry))};
    if (!readable) Object.assign(projected,{total:null,chatMessageId:null,criticalBonus:null,saveResult:null});
    if (entry.chatMessageId && !readable) {
      projected.detail = 'Карточка чата удалена или недоступна.';
      projected.nextStep = 'Уточните результат у ведущего.';
    }
    if (projected.criticalBonus) projected.detail += ` Критический бонус +${projected.criticalBonus} — в карточке системы.`;
    if (projected.saveResult) projected.detail += ` ${projected.saveResult}`;
    return projected;
  });
}

const woundStates = {
  notWounded:{label:'Без ранений',tone:'normal'}, lightlyWounded:{label:'Лёгкое ранение',tone:'normal'},
  seriouslyWounded:{label:'Серьёзное ранение',tone:'low'}, mortallyWounded:{label:'При смерти',tone:'critical'},
  dead:{label:'Мёртв',tone:'critical'},
};

/** Call only for an owned actor. Native wound enum is authoritative, not HP %. */
export function projectConditions(actor) {
  const state = woundStates[actor?.system?.derivedStats?.currentWoundState];
  const healthStatus = {...(state || {label:'Состояние не определено',tone:'unknown'}),
    detail:'Состояние ранений из листа персонажа. Модификаторы рассчитывает система.'};
  const conditions = [];
  for (const injury of Array.from(actor?.items ?? []).filter(row => row.type === 'criticalInjury')) {
    conditions.push({id:`injury:${injury.id}`,label:String(injury.name || 'Критическая травма')});
  }
  let effects = [];
  try { effects = Array.from(actor?.allApplicableEffects?.() ?? actor?.effects ?? []); } catch { /* Unavailable effects stay absent. */ }
  const seen = new Set();
  for (const effect of effects) {
    const id = String(effect.uuid || effect.id || effect.name || '');
    if (!id || seen.has(id) || effect.disabled || effect.isSuppressed || effect.system?.isSuppressed) continue;
    seen.add(id);
    conditions.push({id:`effect:${id}`,label:String(effect.name || 'Активный эффект')});
  }
  return {healthStatus,conditions};
}
