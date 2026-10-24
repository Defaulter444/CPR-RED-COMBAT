import test from 'node:test';
import assert from 'node:assert/strict';
import {skillCatalog,skillName} from '../scripts/skills.js';

const model = () => ({
  skillCategories:[
    {id:'techniqueSkills',label:'Технические навыки'},
    {id:'awarenessSkills',label:'Навыки восприятия'},
    {id:'bodySkills',label:'Физические навыки'},
    {id:'emptySkills',label:'Пустой раздел'}
  ],
  skills:[
    {id:'lock-a',name:'Взлом замков',category:'techniqueSkills'},
    {id:'explosives',name:'Взрывотехника',category:'techniqueSkills',difficult:true},
    {id:'lock-b',name:'Взлом замков',category:'techniqueSkills'},
    {id:'perception',name:'Внимательность',category:'awarenessSkills'},
    {id:'accounting',name:'Учёт имущества',category:'awarenessSkills'},
    {id:'athletics',name:'Атлетика',category:'bodySkills'},
    {id:'custom',name:'Уличное чутьё',category:'customCategory'},
    {id:'legacy',name:'Чутьё механика'}
  ],
  selectedSkillId:'lock-b'
});

test('catalog keeps the exact sheet groups, including empty groups, and skill ordering', () => {
  const actor=model();
  const catalog=skillCatalog(actor);
  assert.deepEqual(catalog.categories,[{id:'all',label:'Все навыки'},...actor.skillCategories]);
  assert.notEqual(catalog.categories,actor.skillCategories);
  assert.notEqual(catalog.categories[1],actor.skillCategories[0]);
  assert.deepEqual(catalog.skills,actor.skills);
  assert.equal(catalog.category,'all');
  assert.equal(catalog.heading,'Все навыки');
  assert.equal(catalog.selected,actor.skills[2]);
});

test('category and text filters combine without sorting duplicate names or losing their ids', () => {
  const actor=model();
  const catalog=skillCatalog(actor,{category:'techniqueSkills',query:'  ВЗЛОМ  '});
  assert.equal(catalog.query,'  ВЗЛОМ  ','the input retains the user’s spaces and case');
  assert.equal(catalog.heading,'Технические навыки');
  assert.deepEqual(catalog.skills.map(skill=>skill.id),['lock-a','lock-b']);
  assert.equal(catalog.selected.id,'lock-b');
  assert.deepEqual(skillCatalog(actor,{category:'bodySkills',query:'Взлом'}).skills,[]);
});

test('Cyrillic case and е/ё normalize for search while displayed names remain intact', () => {
  const actor=model();
  assert.deepEqual(skillCatalog(actor,{query:'УЧЕТ'}).skills.map(skill=>skill.id),['accounting']);
  assert.deepEqual(skillCatalog(actor,{query:'ЧУТЬЁ'}).skills.map(skill=>skill.id),['custom','legacy']);
  assert.equal(actor.skills[4].name,'Учёт имущества');
});

test('unknown and missing skill groups remain discoverable only in all skills and search', () => {
  const actor=model();
  const unknown=skillCatalog(actor,{category:'customCategory',query:'чутье'});
  assert.equal(unknown.category,'all','a category absent from the sheet is not invented');
  assert.equal(unknown.heading,'Все навыки');
  assert.deepEqual(unknown.skills.map(skill=>skill.id),['custom','legacy']);
  assert.ok(!unknown.categories.some(category=>category.id==='customCategory'));
  assert.deepEqual(skillCatalog(actor,{category:'bodySkills'}).skills.map(skill=>skill.id),['athletics']);
});

test('a skill hidden by category, query, or deletion falls back to the first visible skill', () => {
  const actor=model();
  assert.equal(skillCatalog(actor,{category:'awarenessSkills'}).selected.id,'perception');
  assert.equal(skillCatalog(actor,{query:'взрыв'}).selected.id,'explosives');
  actor.selectedSkillId='deleted';
  assert.equal(skillCatalog(actor).selected.id,'lock-a');
  assert.equal(skillCatalog(actor,{query:'несуществующий навык'}).selected,null);
});

test('an empty sheet section stays selected and has no stale skill to roll', () => {
  const catalog=skillCatalog(model(),{category:'emptySkills'});
  assert.equal(catalog.category,'emptySkills');
  assert.equal(catalog.heading,'Пустой раздел');
  assert.deepEqual(catalog.skills,[]);
  assert.equal(catalog.selected,null);
});

test('difficult skills show their sheet marker and it can be searched without changing names', () => {
  assert.equal(skillName({name:'Взрывотехника',difficult:true}),'Взрывотехника (x2)');
  assert.equal(skillName({name:'Атлетика',difficult:false}),'Атлетика');
  assert.equal(skillName(), '');
  assert.deepEqual(skillCatalog(model(),{query:'(x2)'}).skills.map(skill=>skill.id),['explosives']);
});

test('search input is bounded to 200 characters and invalid local state uses safe defaults', () => {
  const catalog=skillCatalog(model(),{category:'deleted-category',query:`  ${'Я'.repeat(220)}`});
  assert.equal(catalog.query.length,200);
  assert.ok(catalog.query.startsWith('  '));
  assert.equal(catalog.category,'all');
  assert.equal(skillCatalog(model(),{query:42}).query,'');
  assert.deepEqual(skillCatalog(undefined,null),{
    categories:[{id:'all',label:'Все навыки'}],category:'all',query:'',skills:[],selected:null,heading:'Все навыки',favoritesOnly:false
  });
});

test('favorites filtering retains sheet category and skill order instead of preference ordering', () => {
  const actor=model();
  actor.favoriteSkillIds=['athletics','lock-b','lock-a','deleted','lock-b'];
  const catalog=skillCatalog(actor,{favoritesOnly:true});
  assert.equal(catalog.favoritesOnly,true);
  assert.equal(catalog.heading,'Избранное');
  assert.deepEqual(catalog.categories,[{id:'all',label:'Все навыки'},...actor.skillCategories]);
  assert.deepEqual(catalog.skills.map(skill=>skill.id),['lock-a','lock-b','athletics']);
  assert.equal(catalog.selected.id,'lock-b');
  assert.deepEqual(skillCatalog(actor).skills,actor.skills,'turning favorites off restores the complete catalog');
});

test('favorites combine with category and normalized search without revealing a hidden selection', () => {
  const actor=model();
  actor.favoriteSkillIds=['lock-a','explosives','accounting','athletics'];
  const catalog=skillCatalog(actor,{category:'techniqueSkills',query:'взлом',favoritesOnly:true});
  assert.equal(catalog.category,'techniqueSkills');
  assert.deepEqual(catalog.skills.map(skill=>skill.id),['lock-a']);
  assert.equal(catalog.selected.id,'lock-a','a nonfavorite selected skill cannot be rolled');
  assert.deepEqual(skillCatalog(actor,{category:'awarenessSkills',query:'УЧЕТ',favoritesOnly:true}).skills.map(skill=>skill.id),['accounting']);
  const hidden=skillCatalog(actor,{category:'bodySkills',query:'взлом',favoritesOnly:true});
  assert.deepEqual(hidden.skills,[]);
  assert.equal(hidden.selected,null);
});

test('empty or stale favorites return no rollable selection and do not invent a category', () => {
  const actor=model();
  for (const ids of [undefined,[],['deleted'],null]) {
    actor.favoriteSkillIds=ids;
    const catalog=skillCatalog(actor,{category:'emptySkills',favoritesOnly:true});
    assert.deepEqual(catalog.skills,[]);
    assert.equal(catalog.selected,null);
    assert.equal(catalog.category,'emptySkills');
    assert.equal(catalog.heading,'Избранное');
    assert.ok(!catalog.categories.some(category=>category.id==='favorites'));
  }
});

test('favorites filtering uses stable IDs for duplicate skill names and never mutates saved preferences', () => {
  const actor=model();
  actor.favoriteSkillIds=Object.freeze(['lock-b','deleted']);
  Object.freeze(actor);
  const state=Object.freeze({favoritesOnly:true,query:'взлом'});
  const before=JSON.stringify({actor,state});
  const catalog=skillCatalog(actor,state);
  assert.deepEqual(catalog.skills.map(skill=>skill.id),['lock-b']);
  assert.equal(catalog.selected,actor.skills[2]);
  assert.equal(JSON.stringify({actor,state}),before);
});

test('filtering frozen actor data and local state neither mutates inputs nor writes Documents', () => {
  const actor=model();
  actor.skills.forEach(Object.freeze);
  actor.skillCategories.forEach(Object.freeze);
  Object.freeze(actor.skills);
  Object.freeze(actor.skillCategories);
  actor.update=()=>assert.fail('presentation must not update an Actor');
  actor.updateEmbeddedDocuments=()=>assert.fail('presentation must not update embedded Items');
  Object.freeze(actor);
  const state=Object.freeze({category:'techniqueSkills',query:'  взлом  '});
  const before=JSON.stringify({actor,state});
  const catalog=skillCatalog(actor,state);
  assert.deepEqual(catalog.skills.map(skill=>skill.id),['lock-a','lock-b']);
  assert.equal(JSON.stringify({actor,state}),before);
  assert.equal(actor.selectedSkillId,'lock-b');
});
