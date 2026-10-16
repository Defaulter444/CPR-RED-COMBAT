export const MODE_LABELS = Object.freeze({ attack: 'Обычная', aimed: 'Прицельная', autofire: 'Автоогонь', suppressive: 'Подавление' });
export function subjectKey(actor, token) {
  return actor ? `${actor.uuid || actor.id}|${token?.uuid || (token ? `${token.parent?.id || ''}.${token.id}` : '')}` : '';
}
export function equippedWeapons(actor) {
  const equipped = actor?.system?.weapons?.equipped;
  return equipped && typeof equipped[Symbol.iterator] === 'function' ? Array.from(equipped)
    : Array.from(actor?.items ?? []).filter(i => i.type === 'weapon' && i.system?.equipped === 'equipped');
}
export function weaponModes(item) {
  const modes = ['attack', 'aimed'];
  if (item.system?.isRanged && Number(item.system?.fireModes?.autoFire) > 0) modes.push('autofire');
  if (item.system?.isRanged && item.system?.fireModes?.suppressiveFire) modes.push('suppressive');
  return modes.map(id => ({ id, label: MODE_LABELS[id] }));
}
export function weaponCapabilities(actor, item, requestedMode) {
  const modes = weaponModes(item);
  const mode = modes.some(m => m.id === requestedMode) ? requestedMode : 'attack';
  const ranged = Boolean(item.system?.isRanged);
  const requiredSkill = ['autofire', 'suppressive'].includes(mode) ? 'Autofire' : item.system?.weaponSkill;
  const skill = Array.from(actor.items ?? []).find(i => i.type === 'skill' && i.name === requiredSkill);
  const cost = ['autofire', 'suppressive'].includes(mode) ? 10 : 1;
  const ammoOK = !ranged || Number(item.system?.magazine?.value) >= cost;
  const callable = typeof item.createRoll === 'function' && typeof item.confirmRoll === 'function';
  const reason = !callable ? 'У этого предмета нет поддерживаемого броска.' : !skill ? `В листе отсутствует навык ${requiredSkill || 'оружия'}.`
    : !ammoOK ? `Недостаточно патронов: требуется ${cost}.` : '';
  return { modes, mode, canAttack: callable && Boolean(skill) && ammoOK,
    canDamage: callable && mode !== 'suppressive',
    canReload: ranged && typeof item.reload === 'function', canLoad: ranged && typeof item.load === 'function',
    reason, damageLabel: String(item.system?.damage ?? ''), rof: item.system?.rof ?? null };
}
export const QUICK_SKILLS = Object.freeze({ Evasion: 'Уклонение', Perception: 'Восприятие', Brawling: 'Драка', Stealth: 'Скрытность', Concentration: 'Концентрация', 'First Aid': 'Первая помощь' });
