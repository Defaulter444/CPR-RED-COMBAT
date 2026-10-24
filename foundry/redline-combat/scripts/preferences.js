/** Client-only presentation preferences; these helpers never modify game Documents. */
export const MAX_FAVORITES = 8;

const idsOnly = value => Array.isArray(value)
  ? [...new Set(value.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 256))]
  : [];

export function favoriteSkillIds(actor, value = actor?.favoriteSkillIds) {
  const available = new Set((Array.isArray(actor?.skills) ? actor.skills : [])
    .filter(skill => typeof skill?.id === 'string').map(skill => skill.id));
  return idsOnly(value).filter(id => available.has(id)).slice(0, MAX_FAVORITES);
}

export function toggleFavoriteSkill(actor, value, id) {
  if (typeof id !== 'string' || !actor?.skills?.some(skill => skill?.id === id)) {
    throw new RangeError('Этот навык больше недоступен. Обновите каталог.');
  }
  const current = favoriteSkillIds(actor, value);
  if (current.includes(id)) return current.filter(candidate => candidate !== id);
  if (current.length >= MAX_FAVORITES) throw new RangeError(`Можно закрепить до ${MAX_FAVORITES} навыков. Сначала уберите один из избранного.`);
  return [...current, id];
}

export function favoriteStoreWith(store, key, ids) {
  if (typeof key !== 'string' || !key.length || key.length > 1024) throw new RangeError('Не выбран персонаж для избранных навыков.');
  // Object.fromEntries defines own properties, including opaque keys such as __proto__.
  const entries = store && typeof store === 'object' && !Array.isArray(store)
    ? Object.entries(store).filter(([, value]) => Array.isArray(value))
      .map(([actorKey, value]) => [actorKey, idsOnly(value).slice(0, MAX_FAVORITES)])
    : [];
  return Object.fromEntries([...entries.filter(([actorKey]) => actorKey !== key), [key, idsOnly(ids).slice(0, MAX_FAVORITES)]]);
}
