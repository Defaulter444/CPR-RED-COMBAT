import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHUD, renderScaleSettings } from '../scripts/view.js';

const actor = overrides => ({
  key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', canOpenSheet:true,
  hp:{value:10,max:40}, armor:[{name:'Куртка',sp:11}],
  weapons:[{id:'pistol',name:'Пистолет',ammo:{value:9,max:12},modes:[{id:'attack',label:'Обычная'},{id:'aimed',label:'Прицельная'}],mode:'aimed',canAttack:true,canDamage:true,canReload:true,canLoad:true,damageLabel:'3d6',rof:2}],
  skillCategories:[{id:'awarenessSkills',label:'Навыки восприятия'},{id:'fightingSkills',label:'Боевые навыки'},{id:'techniqueSkills',label:'Технические навыки'},{id:'emptySkills',label:'Пустой раздел'}],
  skills:[{id:'evasion',name:'Уклонение',category:'fightingSkills'},{id:'perception',name:'Восприятие',category:'awarenessSkills'},{id:'lock',name:'Взлом замков',category:'techniqueSkills',difficult:true}],
  canInitiative:true,canDeathSave:false,busy:false,status:'',
  ...overrides,
});
const view = selected => renderHUD({supported:true,selected});
const buttons = html => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const selects = html => [...html.matchAll(/<select\b[^>]*>/g)].map(match=>match[0]);
const action = (html,name) => buttons(html).find(tag=>tag.includes(`data-action="${name}"`));
const actions = (html,name) => buttons(html).filter(tag=>tag.includes(`data-action="${name}"`));

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
    assert.equal(action(html,'next-turn'),undefined);
  }
  const html=view(actor());
  for (const name of ['sheet','weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.doesNotMatch(tag,/ disabled/);
  }
});

test('initiative is rendered only during a started combat and never leaves an idle placeholder', () => {
  const combat={round:9,combatants:[{id:'one',name:'Ви',selectable:true}],canAdvance:true};
  for(const state of [undefined,false]){
    const html=renderHUD({supported:true,selected:actor(),combat:{...combat,started:state}});
    assert.doesNotMatch(html,/aria-label="Очередь инициативы"|data-action="next-turn"|Активного боя нет/);
  }
  const active=renderHUD({supported:true,selected:actor(),combat:{...combat,started:true}});
  assert.match(active,/aria-label="Очередь инициативы"/);
  assert.ok(action(active,'next-turn'));
  assert.match(active,/data-action="select-combatant" data-id="one"/);
});

test('scale control is available in both dock states and settings default to a bounded client scale', () => {
  for(const dockExpanded of [false,true]) {
    const html=renderHUD({supported:true,selected:actor(),dockExpanded});
    assert.match(action(html,'scale-settings'),/aria-label="Настроить размер REDLINE"/);
    assert.match(html,/data-scale="80"/);
  }
  assert.match(renderScaleSettings(undefined),/type="range" min="55" max="125" step="5" value="80"/);
  assert.match(renderScaleSettings(60),/<output[^>]*>60%<\/output>/);
  assert.doesNotMatch(renderScaleSettings('" onload="alert(1)'),/onload|alert/);
});

test('weapon and character commands retain the exact subject and revision', () => {
  const html=view(actor());
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative','death-save']) {
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
  assert.equal(selects(html).length,2);
  assert.doesNotMatch(html,/data-skill-select|data-action="skill"/);
  assert.match(action(html,'weapon-load'),/aria-label="Выбрать патроны: Пистолет"/);
  assert.match(html,/fa-solid fa-box-open" aria-hidden="true"/);
  assert.match(action(html,'selected-skill'),/data-id="evasion"/);
  for(const tag of actions(html,'choose-skill')) {
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
  }
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

test('busy state disables every subject action, the search input, and both weapon selectors', () => {
  const html=view(actor({busy:true}));
  for(const tag of [...buttons(html).filter(tag=>tag.includes('data-subject=')),...selects(html)]) assert.match(tag,/ disabled>/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/<input\b[^>]*data-skill-search[^>]* disabled>/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">Выполняется действие системы…/);
});

test('the actor-selected skill persists across a refreshed view', () => {
  const html=view(actor({selectedSkillId:'perception'}));
  assert.match(actions(html,'choose-skill').find(tag=>tag.includes('data-id="perception"')),/aria-pressed="true"/);
  assert.match(actions(html,'choose-skill').find(tag=>tag.includes('data-id="evasion"')),/aria-pressed="false"/);
  assert.match(action(html,'selected-skill'),/data-id="perception"/);
  assert.match(action(html,'selected-skill'),/aria-label="Бросить — Восприятие"/);
  const stale=view(actor({selectedSkillId:'removed-skill'}));
  assert.match(action(stale,'selected-skill'),/data-id="evasion"/);
  assert.doesNotMatch(stale,/removed-skill/);
});

test('catalog navigation retains exact character-sheet group order and labels, including empty sections', () => {
  const model=actor();
  const html=renderHUD({supported:true,selected:model,skillState:{category:'techniqueSkills'}});
  const categoryButtons=actions(html,'skill-category');
  assert.deepEqual(categoryButtons.map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['all',...model.skillCategories.map(category=>category.id)]);
  const nav=html.match(/<nav class="redline-skill-categories"[^>]*>(.*?)<\/nav>/s)[1];
  assert.deepEqual([...nav.matchAll(/<span>(.*?)<\/span>/g)].map(match=>match[1]),['Все навыки',...model.skillCategories.map(category=>category.label)]);
  assert.match(categoryButtons.find(tag=>tag.includes('data-id="techniqueSkills"')),/aria-pressed="true"/);
  assert.equal(categoryButtons.filter(tag=>tag.includes('aria-pressed="true"')).length,1);
  assert.deepEqual(actions(html,'choose-skill').map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['lock']);
  assert.match(html,/<strong>Технические навыки<\/strong>/);
});

test('category and search route the primary roll to the visible skill, never the old hidden selection', () => {
  const selected=actor({selectedSkillId:'evasion'});
  const html=renderHUD({supported:true,selected,skillState:{category:'awarenessSkills',query:'  ВОСП  '}});
  assert.match(html,/<input\b[^>]*data-skill-search[^>]*value="  ВОСП  "/);
  assert.deepEqual(actions(html,'choose-skill').map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['perception']);
  assert.match(action(html,'selected-skill'),/data-id="perception"/);
  assert.doesNotMatch(action(html,'selected-skill'),/ disabled|data-id="evasion"/);
  assert.match(action(html,'selected-skill'),/data-subject="Actor\.owned\|Scene\.a\.Token\.b" data-revision="7"/);
});

test('no search results or an empty sheet section disables the roll without a stale skill id', () => {
  for(const skillState of [{category:'all',query:'Нет такого навыка'},{category:'emptySkills',query:''}]) {
    const html=renderHUD({supported:true,selected:actor({selectedSkillId:'evasion'}),skillState});
    assert.deepEqual(actions(html,'choose-skill'),[]);
    assert.match(action(html,'selected-skill'),/data-id=""/);
    assert.match(action(html,'selected-skill'),/ disabled>/);
    assert.match(action(html,'selected-skill'),/aria-label="Выберите навык"/);
    assert.match(html,/<span class="redline-skill-count" role="status" aria-live="polite">0<\/span>/);
    assert.match(html,skillState.query ? /Ничего не найдено\. Измените запрос или раздел\./ : /Нет доступных навыков в этом разделе\./);
  }
});

test('difficult skills retain the sheet marker without inventing a base or final roll value', () => {
  const selected=actor({selectedSkillId:'lock'});
  selected.skills[2].base=999;
  const html=renderHUD({supported:true,selected,skillState:{category:'techniqueSkills'}});
  assert.match(action(html,'choose-skill'),/title="Выбрать навык: Взлом замков \(x2\)"/);
  assert.match(action(html,'selected-skill'),/aria-label="Бросить — Взлом замков \(x2\)"/);
  assert.match(html,/<span>Взлом замков \(x2\)<\/span>/);
  assert.doesNotMatch(html,/999|Взлом замков ·/);
});

test('other native character rolls remain behind an accessible disclosure with their own capabilities', () => {
  const closed=view(actor());
  assert.match(closed,/<details class="redline-other-rolls" data-other-rolls>/);
  assert.match(closed,/<summary>Другие броски /);
  const html=renderHUD({supported:true,selected:actor(),skillState:{otherRolls:true}});
  const detail=html.match(/<details class="redline-other-rolls" data-other-rolls open>(.*?)<\/details>/s)[1];
  assert.doesNotMatch(action(detail,'initiative'),/ disabled/);
  assert.match(action(detail,'death-save'),/ disabled>/);
  for(const name of ['initiative','death-save']) assert.match(action(detail,name),/data-subject="Actor\.owned\|Scene\.a\.Token\.b" data-revision="7"/);
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
  const model=actor({key:dangerous,name:dangerous,status:dangerous,skills:[{id:dangerous,name:dangerous,category:dangerous}],skillCategories:[{id:dangerous,label:dangerous}]});
  Object.assign(model.weapons[0],{id:dangerous,name:dangerous,mode:dangerous,modes:[{id:dangerous,label:dangerous}],damageLabel:dangerous,canAttack:false,reason:dangerous});
  const html=view(model);
  assert.doesNotMatch(html,/<script>|<\/script>/);
  assert.match(html,/data-subject="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;"/);
  assert.match(html,/data-id="&quot;\/&gt;&lt;script&gt;/);
  assert.match(html,/<option value="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;" selected>/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">&quot;\/&gt;&lt;script&gt;/);
});

test('skill search and exact sheet category ids and labels are escaped as data', () => {
  const dangerous='"/><script>alert(1)</script>&\'';
  const escaped='&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;';
  const selected=actor({skills:[{id:'safe-skill',name:'Название навыка',category:dangerous}],skillCategories:[{id:dangerous,label:dangerous}]});
  const categoryHTML=renderHUD({supported:true,selected,skillState:{category:dangerous}});
  const category=actions(categoryHTML,'skill-category')[1];
  assert.ok(category.includes(`data-id="${escaped}"`));
  assert.ok(category.includes(`title="${escaped}"`));
  assert.match(category,/aria-pressed="true"/);
  assert.ok(categoryHTML.includes(`<strong>${escaped}</strong>`));
  assert.match(action(categoryHTML,'selected-skill'),/data-id="safe-skill"/);
  const searchHTML=renderHUD({supported:true,selected,skillState:{category:dangerous,query:dangerous}});
  const search=searchHTML.match(/<input\b[^>]*data-skill-search[^>]*>/)[0];
  assert.ok(search.includes(`value="${escaped}"`));
  assert.match(action(searchHTML,'selected-skill'),/ disabled>/);
  assert.doesNotMatch(categoryHTML+searchHTML,/<script>|<\/script>/);
});

test('missing capabilities and action identity remain read-only instead of enabling commands', () => {
  const html=view(actor({key:undefined,revision:undefined,weapons:[{id:'legacy',name:'Старое оружие'}],skills:[],canInitiative:false,canDeathSave:false}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject=')&&!tag.includes('data-action="sheet"'))) assert.match(tag,/ disabled>/);
  for(const tag of selects(html)) assert.match(tag,/ disabled>/);
  assert.match(html,/Нет доступных навыков/);
  assert.doesNotMatch(html,/NaN|undefined|null/);
});

test('the action view preserves native identity containers and removes stale preview instructions', () => {
  const html=view(actor({status:'Бросок отправлен в чат.'}));
  for(const name of ['redline-actor','redline-identity','redline-vitals','redline-weapons','redline-dock']) assert.match(html,new RegExp(`class="${name}(?: |")`));
  assert.match(html,/data-action="sheet"/);
  assert.match(html,/Откроется диалог броска/);
  assert.doesNotMatch(html,/Броски и урон выполняются через лист системы|ПРОСМОТР ДАННЫХ МИРА|Просмотр · атака не запускается/);
});
