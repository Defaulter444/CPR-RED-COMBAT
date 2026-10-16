import test from 'node:test';
import assert from 'node:assert/strict';
import { projectActor, projectHUD } from '../scripts/state.js';

const owner = { id: 'owner', isGM: false };
const categories = [
  ['awarenessSkills', 'Навыки восприятия'],
  ['bodySkills', 'Физические навыки'],
  ['controlSkills', 'Навыки управления'],
  ['educationSkills', 'Навыки образования'],
  ['fightingSkills', 'Навыки ближнего боя'],
  ['performanceSkills', 'Навыки выступления'],
  ['rangedweaponSkills', 'Навыки дальнего боя'],
  ['socialSkills', 'Социальные навыки'],
  ['techniqueSkills', 'Технические навыки'],
].map(([id, label]) => Object.freeze({ id, label }));
Object.freeze(categories);

function skill(id, name, category, difficulty = 'typical') {
  return Object.freeze({
    id, name, type: 'skill',
    system: Object.freeze({ category, difficulty }),
    createRoll() { throw new Error('projection must not start a roll'); },
    update() { throw new Error('projection must not update a skill'); },
  });
}

function actor(items = []) {
  return Object.freeze({
    id: 'hero', name: 'Hero', type: 'character', img: '',
    items: Object.freeze(items), system: Object.freeze({}),
    testUserPermission(user, permission) {
      assert.equal(permission, 'OWNER');
      return user.id === owner.id;
    },
    update() { throw new Error('projection must not update an actor'); },
  });
}

test('skill sections retain the exact supplied sheet order, labels and empty categories', () => {
  const hero = actor([skill('handgun', 'Handgun', 'rangedweaponSkills')]);
  const model = projectActor(hero, null, owner, { skillCategories: categories });

  assert.deepEqual(model.skillCategories, categories);
  assert.equal(model.skillCategories.length, 9);
  assert.equal(model.skills[0].category, 'rangedweaponSkills');
  assert.equal(model.skillCategories[6].id, 'rangedweaponSkills', 'data key must not adopt the translation key spelling');
  assert.notEqual(model.skillCategories, categories);
  assert.notEqual(model.skillCategories[0], categories[0]);
  model.skillCategories[0].label = 'Changed only in the DTO';
  assert.equal(categories[0].label, 'Навыки восприятия');
});

test('localized skill ordering matches the sheet string comparison and preserves duplicate custom items', () => {
  const customOne = skill('custom-one', 'Custom one', 'techniqueSkills', 'difficult');
  const customTwo = skill('custom-two', 'Custom two', 'techniqueSkills');
  const hero = actor([
    skill('yo', 'Yo', 'educationSkills'),
    skill('lower', 'Lower', 'educationSkills'),
    customOne,
    customTwo,
    skill('ya', 'Ya', 'educationSkills'),
    skill('upper', 'Upper', 'educationSkills'),
  ]);
  const labels = {
    Yo: 'Ёж', Lower: 'a', 'Custom one': 'Взлом замков',
    'Custom two': 'Взлом замков', Ya: 'Якорь', Upper: 'Z',
  };
  const seen = [];
  const model = projectActor(hero, null, owner, {
    skillCategories: categories,
    localizeSkill(name) { seen.push(name); return labels[name]; },
  });

  assert.deepEqual(model.skills.map(item => item.name), ['Z', 'a', 'Ёж', 'Взлом замков', 'Взлом замков', 'Якорь']);
  assert.deepEqual(model.skills.filter(item => item.name === 'Взлом замков'), [
    { id: 'custom-one', name: 'Взлом замков', category: 'techniqueSkills', difficult: true },
    { id: 'custom-two', name: 'Взлом замков', category: 'techniqueSkills', difficult: false },
  ]);
  assert.equal(seen.length, hero.items.length, 'the supplied localizer must run for every owned skill');
  assert.equal(customOne.name, 'Custom one');
  assert.equal(customOne.system.category, 'techniqueSkills');
});

test('unknown and missing categories stay in the full skill list without adding a sheet section', () => {
  const invalidCategory = Object.freeze({ private: 'must not enter the DTO' });
  const hero = actor([
    skill('custom', 'Custom', 'moduleCategory'),
    skill('missing', 'Missing'),
    skill('malformed', 'Malformed', invalidCategory),
  ]);
  const model = projectActor(hero, null, owner, { skillCategories: categories });

  assert.deepEqual(model.skills, [
    { id: 'custom', name: 'Custom', category: 'moduleCategory', difficult: false },
    { id: 'malformed', name: 'Malformed', category: '', difficult: false },
    { id: 'missing', name: 'Missing', category: '', difficult: false },
  ]);
  assert.deepEqual(model.skillCategories, categories);
  assert.equal(JSON.stringify(model).includes('must not enter the DTO'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
  assert.deepEqual(projectActor(hero, null, owner).skillCategories, [], 'missing configuration must not invent categories');
});

test('skill category data flows through the HUD only after ownership checks and remains read-only', () => {
  const hero = actor([skill('lock', 'Pick Lock', 'techniqueSkills', 'difficult')]);
  const model = projectHUD({
    user: { ...owner, character: hero }, system: { id: 'cyberpunk-red-core' }, generation: 12,
    skillCategories: categories,
  });
  assert.deepEqual(model.selected.skillCategories, categories);
  assert.equal(model.selected.skills[0].difficult, true);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
  assert.equal(hero.items[0].system.difficulty, 'difficult');

  const foreign = {
    type: 'character',
    testUserPermission() { return false; },
    get items() { throw new Error('unowned skill data was accessed'); },
    get system() { throw new Error('unowned actor system was accessed'); },
  };
  const forbiddenOptions = {
    get skillCategories() { throw new Error('unowned actor category options were accessed'); },
    localizeSkill() { throw new Error('unowned skill was localized'); },
  };
  assert.equal(projectActor(foreign, null, owner, forbiddenOptions), null);
});
