import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_FAVORITES,favoriteSkillIds,toggleFavoriteSkill,favoriteStoreWith} from '../scripts/preferences.js';

const actor = () => ({skills:Array.from({length:10},(_,index)=>({id:`skill-${index}`,name:`Навык ${index}`}))});

test('favorite IDs retain preference order while removing duplicates, deleted skills, and malformed values', () => {
  assert.deepEqual(favoriteSkillIds(actor(),['skill-3','deleted','skill-1','skill-3',null,{},1,'','skill-0']),[
    'skill-3','skill-1','skill-0'
  ]);
  for (const invalid of [undefined,null,{},'skill-1',42]) assert.deepEqual(favoriteSkillIds(actor(),invalid),[]);
  assert.deepEqual(favoriteSkillIds(undefined,['skill-0']),[]);
  assert.deepEqual(favoriteSkillIds({skills:null},['skill-0']),[]);
});

test('favorite validation caps valid unique skills at eight without letting stale IDs consume slots', () => {
  assert.equal(MAX_FAVORITES,8);
  const ids=actor().skills.map(skill=>skill.id);
  assert.deepEqual(favoriteSkillIds(actor(),['deleted',...ids,ids[0]]),ids.slice(0,8));
});

test('favorite validation is isolated to the current actor even when skill names match', () => {
  const first={skills:[{id:'first-only',name:'Атлетика'}]};
  const second={skills:[{id:'second-only',name:'Атлетика'}]};
  assert.deepEqual(favoriteSkillIds(first,['first-only','second-only']),['first-only']);
  assert.deepEqual(favoriteSkillIds(second,['first-only','second-only']),['second-only']);
});

test('toggling at the cap permits removal and then appends a new skill in preference order', () => {
  const subject=actor();
  const full=subject.skills.slice(0,8).map(skill=>skill.id);
  assert.throws(()=>toggleFavoriteSkill(subject,full,'skill-8'),RangeError);
  const removed=toggleFavoriteSkill(subject,full,'skill-3');
  assert.deepEqual(removed,full.filter(id=>id!=='skill-3'));
  assert.deepEqual(toggleFavoriteSkill(subject,removed,'skill-8'),[...removed,'skill-8']);
  assert.equal(full.length,8,'the persisted preference array is not mutated');
});

test('toggling rejects stale or malformed action IDs instead of favoriting another skill', () => {
  for (const id of ['deleted','',null,undefined,0,{},['skill-0']]) {
    assert.throws(()=>toggleFavoriteSkill(actor(),['deleted','skill-0'],id),RangeError);
  }
});

test('toggling cleans stale saved IDs and does not mutate frozen actor data or preferences', () => {
  const subject=actor();
  subject.skills.forEach(Object.freeze);
  Object.freeze(subject.skills);
  Object.freeze(subject);
  const saved=Object.freeze(['deleted','skill-2','skill-2','skill-0']);
  assert.deepEqual(toggleFavoriteSkill(subject,saved,'skill-1'),['skill-2','skill-0','skill-1']);
  assert.deepEqual(toggleFavoriteSkill(subject,saved,'skill-2'),['skill-0']);
  assert.deepEqual(toggleFavoriteSkill(subject,null,'skill-1'),['skill-1']);
  assert.deepEqual(saved,['deleted','skill-2','skill-2','skill-0']);
});

test('updating one actor preference preserves other own actor records without mutating input', () => {
  const saved=Object.freeze({first:Object.freeze(['skill-0']),second:Object.freeze(['skill-5'])});
  const next=Object.freeze(['skill-1','skill-2']);
  const updated=favoriteStoreWith(saved,'first',next);
  assert.notEqual(updated,saved);
  assert.deepEqual(updated.first,['skill-1','skill-2']);
  assert.deepEqual(updated.second,['skill-5']);
  assert.deepEqual(saved.first,['skill-0']);
  assert.deepEqual(JSON.parse(JSON.stringify(updated)).second,['skill-5'],'preferences survive Foundry JSON storage');
});

test('preference updates do not copy inherited actor records', () => {
  const saved=Object.create({inherited:['skill-8']});
  saved.own=['skill-4'];
  const updated=favoriteStoreWith(saved,'current',['skill-1']);
  assert.equal(Object.hasOwn(updated,'inherited'),false);
  assert.deepEqual(updated.own,['skill-4']);
  assert.deepEqual(updated.current,['skill-1']);
});

test('hostile own preference keys cannot alter global or returned object prototypes', () => {
  const saved=JSON.parse('{"__proto__":["skill-8"],"constructor":["skill-7"],"prototype":["skill-6"],"other":["skill-5"]}');
  const objectPrototype=Object.getPrototypeOf({});
  for (const key of ['normal','__proto__','constructor','prototype']) {
    const updated=favoriteStoreWith(saved,key,['skill-0']);
    assert.ok(Object.getPrototypeOf(updated)===null||Object.getPrototypeOf(updated)===objectPrototype);
    assert.equal(Object.prototype['skill-0'],undefined);
    assert.deepEqual(updated.other,['skill-5']);
    assert.doesNotThrow(()=>JSON.stringify(updated));
  }
  assert.equal(Object.getPrototypeOf({}),objectPrototype);
  assert.deepEqual(saved.other,['skill-5']);
});

test('missing or malformed stored preferences initialize one independent actor record', () => {
  for (const saved of [undefined,null,42,'saved',[]]) {
    const updated=favoriteStoreWith(saved,'current',['skill-1']);
    assert.deepEqual(Object.keys(updated),['current']);
    assert.deepEqual(updated.current,['skill-1']);
  }
});
