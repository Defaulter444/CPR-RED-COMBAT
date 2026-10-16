import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHUD } from '../scripts/view.js';

const actor = overrides => ({
  key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', canOpenSheet:true,
  hp:{value:10,max:40}, armor:[{name:'Куртка',sp:11}],
  weapons:[{id:'pistol',name:'Пистолет',ammo:{value:9,max:12},modes:[{id:'attack',label:'Обычная'},{id:'aimed',label:'Прицельная'}],mode:'aimed',canAttack:true,canDamage:true,canReload:true,canLoad:true,damageLabel:'3d6',rof:2}],
  skills:[{id:'evasion',name:'Уклонение',base:12},{id:'perception',name:'Восприятие',base:10}],
  quickSkills:[{id:'evasion',name:'Уклонение'}],canInitiative:true,canDeathSave:false,busy:false,status:'',
  ...overrides,
});
const view = selected => renderHUD({supported:true,selected});
const buttons = html => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const selects = html => [...html.matchAll(/<select\b[^>]*>/g)].map(match=>match[0]);
const action = (html,name) => buttons(html).find(tag=>tag.includes(`data-action="${name}"`));

test('weapon and character commands retain the exact subject and revision', () => {
  const html=view(actor());
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load','skill','selected-skill','initiative','death-save']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.match(tag,/type="button"/);
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
  }
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load']) assert.match(action(html,name),/data-id="pistol"/);
  assert.match(html,/<option value="aimed" selected>Прицельная<\/option>/);
  assert.match(selects(html)[0],/data-weapon-mode data-id="pistol"/);
  assert.match(selects(html)[1],/data-skill-select/);
  assert.match(action(html,'weapon-load'),/aria-label="Выбрать патроны: Пистолет"/);
  assert.match(html,/fa-solid fa-box-open" aria-hidden="true"/);
  assert.match(html,/Уклонение · 12/);
});

test('busy state disables every subject action and both selectors', () => {
  const html=view(actor({busy:true}));
  for(const tag of [...buttons(html).filter(tag=>tag.includes('data-subject=')),...selects(html)]) assert.match(tag,/ disabled>/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">Выполняется действие системы…/);
});

test('the actor-selected skill persists across a refreshed view', () => {
  const html=view(actor({selectedSkillId:'perception'}));
  assert.match(html,/<option value="perception" selected>Восприятие · 10<\/option>/);
  assert.match(html,/<option value="evasion">Уклонение · 12<\/option>/);
  const stale=view(actor({selectedSkillId:'removed-skill'}));
  assert.doesNotMatch(stale,/<option value="(?:perception|evasion)" selected>/);
});

test('capabilities disable only unavailable commands and explain their reason', () => {
  const model=actor();
  model.weapons[0].canAttack=false;
  model.weapons[0].reason='Недостаточно патронов: требуется 10.';
  const html=view(model);
  assert.match(action(html,'weapon-attack'),/title="Недостаточно патронов: требуется 10\."/);
  assert.match(action(html,'weapon-attack'),/ disabled>/);
  assert.doesNotMatch(action(html,'weapon-damage'),/ disabled>/);
  assert.doesNotMatch(action(html,'initiative'),/ disabled>/);
  assert.match(action(html,'death-save'),/title="Спасбросок смерти доступен при смертельном ранении\."/);
  assert.match(action(html,'death-save'),/ disabled>/);
});

test('document text, ids, mode labels and result messages are escaped as data', () => {
  const dangerous='"/><script>alert(1)</script>&\'';
  const model=actor({key:dangerous,name:dangerous,status:dangerous,skills:[{id:dangerous,name:dangerous,base:12}],quickSkills:[{id:dangerous,name:dangerous}]});
  Object.assign(model.weapons[0],{id:dangerous,name:dangerous,mode:dangerous,modes:[{id:dangerous,label:dangerous}],damageLabel:dangerous,canAttack:false,reason:dangerous});
  const html=view(model);
  assert.doesNotMatch(html,/<script>|<\/script>/);
  assert.match(html,/data-subject="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;"/);
  assert.match(html,/data-id="&quot;\/&gt;&lt;script&gt;/);
  assert.match(html,/<option value="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;" selected>/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">&quot;\/&gt;&lt;script&gt;/);
});

test('missing capabilities and action identity remain read-only instead of enabling commands', () => {
  const html=view(actor({key:undefined,revision:undefined,weapons:[{id:'legacy',name:'Старое оружие'}],skills:[],quickSkills:[],canInitiative:false,canDeathSave:false}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject=')&&!tag.includes('data-action="sheet"'))) assert.match(tag,/ disabled>/);
  for(const tag of selects(html)) assert.match(tag,/ disabled>/);
  assert.match(html,/Нет доступных навыков/);
  assert.doesNotMatch(html,/NaN|undefined|null/);
});

test('the action view preserves native identity containers and removes stale preview instructions', () => {
  const html=view(actor({status:'Бросок отправлен в чат.'}));
  for(const name of ['redline-actor','redline-identity','redline-vitals','redline-weapons','redline-dock']) assert.match(html,new RegExp(`class="${name}(?: |")`));
  assert.match(html,/data-action="sheet"/);
  assert.match(html,/Броски и применение урона — через диалоги и чат системы\./);
  assert.doesNotMatch(html,/Броски и урон выполняются через лист системы|ПРОСМОТР ДАННЫХ МИРА|Просмотр · атака не запускается/);
});
