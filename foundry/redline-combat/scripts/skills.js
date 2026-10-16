/** A read-only view of the character sheet's skill groups and ordering. */
export function skillName(skill) {
  return `${String(skill?.name ?? '')}${skill?.difficult ? ' (x2)' : ''}`;
}

const normalized = value => String(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

/** Filtering changes local presentation only; a hidden selection cannot be rolled. */
export function skillCatalog(actor, state = {}) {
  const sheetCategories = Array.isArray(actor?.skillCategories) ? actor.skillCategories : [];
  const categories = [{id:'all',label:'Все навыки'}, ...sheetCategories.map(item => ({id:item.id,label:item.label}))];
  const active = categories.find(item => item.id === state?.category) || categories[0];
  const category = active.id;
  const query = typeof state?.query === 'string' ? state.query.slice(0, 200) : '';
  const search = normalized(query.trim());
  const actorSkills = Array.isArray(actor?.skills) ? actor.skills : [];
  const skills = actorSkills.filter(skill => skill
    && (category === 'all' || skill.category === category)
    && (!search || normalized(skillName(skill)).includes(search)));
  const selectedId = actor?.selectedSkillId;
  const selected = (selectedId == null ? null : skills.find(skill => String(skill.id) === String(selectedId))) || skills[0] || null;
  return {categories,category,query,skills,selected,heading:active.label};
}
