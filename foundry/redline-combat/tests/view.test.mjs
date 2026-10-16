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

test('production HUD has no tutorial and retains toolbar and character controls', () => {
  for (const model of [{}, {supported:true}, {supported:true,selected:actor()}]) {
    const html=renderHUD(model);
    assert.doesNotMatch(html,/data-action="demo"|redline-preview|<iframe\b|Учебный пример/);
    for (const name of ['refresh','close']) {
      const tag=action(html,name);
      assert.ok(tag,name);
      assert.match(tag,/type="button"/);
      assert.doesNotMatch(tag,/ disabled/);
    }
    assert.ok(action(html,'next-turn'));
  }
  const html=view(actor());
  for (const name of ['sheet','weapon-attack','weapon-damage','weapon-reload','weapon-load','skill','selected-skill','initiative']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.doesNotMatch(tag,/ disabled/);
  }
});

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
  assert.match(selects(html)[0],/data-weapon-select/);
  assert.match(selects(html)[1],/data-weapon-mode data-id="pistol"/);
  assert.match(selects(html)[2],/data-skill-select/);
  assert.match(action(html,'weapon-load'),/aria-label="Выбрать патроны: Пистолет"/);
  assert.match(html,/fa-solid fa-box-open" aria-hidden="true"/);
  assert.match(html,/Уклонение · 12/);
});

test('Blackglass uses one selected weapon while all equipped weapons remain in its selector', () => {
  const first=actor().weapons[0];
  const second={...first,id:'rifle',name:'Винтовка',img:'weapons/rifle.webp'};
  const model=actor({selectedWeaponId:'rifle',weapons:[first,second]});
  const html=view(model);
  assert.match(html,/redline-blackglass/);
  assert.match(html,/data-layout="blackglass-dock"/);
  assert.match(html,/<option value="pistol">Пистолет<\/option>/);
  assert.match(html,/<option value="rifle" selected>Винтовка<\/option>/);
  assert.match(html,/<img src="weapons\/rifle.webp"/);
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load']) assert.match(action(html,name),/data-id="rifle"/);
  assert.equal(buttons(html).filter(tag=>tag.includes('data-action="weapon-attack"')).length,1);
  const stale=view({...model,selectedWeaponId:'deleted'});
  assert.match(action(stale,'weapon-attack'),/data-id="pistol"/);
});

test('dock defaults to a compact status and exposes accessible native collapse and skills controls', () => {
  const compact=view(actor({status:'Патроны выбраны.'}));
  assert.match(compact,/class="redline-compact-summary">/);
  assert.match(compact,/id="redline-dock-content"[^>]* hidden>/);
  assert.match(action(compact,'toggle-dock'),/aria-expanded="false"/);
  assert.match(action(compact,'toggle-dock'),/aria-controls="redline-dock-content"/);
  assert.match(compact,/id="redline-skills-panel"[^>]* hidden>/);
  assert.match(compact,/role="status" aria-live="polite" aria-atomic="true">Патроны выбраны\./);
  const expanded=renderHUD({supported:true,selected:actor(),dockExpanded:true,skillsOpen:true});
  assert.match(action(expanded,'toggle-dock'),/aria-expanded="true"/);
  assert.doesNotMatch(expanded,/id="redline-dock-content"[^>]* hidden>/);
  assert.doesNotMatch(expanded,/id="redline-skills-panel"[^>]* hidden>/);
  assert.match(expanded,/data-action="toggle-skills" aria-expanded="true" aria-controls="redline-skills-panel"/);
});

test('portraits and weapons reject executable URLs without creating fake resource values', () => {
  const model=actor({img:'javascript:alert(1)',hp:null});
  model.weapons[0].img='data:image/svg+xml,<svg onload="alert(1)">';
  const html=renderHUD({supported:true,selected:model,targets:[{name:'Цель',img:'vbscript:alert(1)'}],dockExpanded:true});
  assert.doesNotMatch(html,/<img\b/);
  assert.doesNotMatch(html,/javascript:|vbscript:|data:image/);
  assert.match(html,/HP недоступно/);
  assert.match(html,/aria-label="Цели атаки"/);
  for(const img of ['java\nscript:alert(1)','file:///C:/private.png','vb\tscript:alert(1)']) assert.doesNotMatch(view(actor({img})),/<img\b/);
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
