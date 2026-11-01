import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHUD, CARD_IDS } from '../scripts/view.js';

const actor = overrides => ({
  key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', canOpenSheet:true,
  hp:{value:10,max:40}, armor:[{name:'Голова · отслеживаемая броня',sp:11},{name:'Тело · отслеживаемая броня',sp:12}],
  healthStatus:{label:'Легко ранен',tone:'low',detail:'Состояние ранений из листа персонажа.'}, conditions:[],
  weapons:[{id:'pistol',name:'Пистолет',ammo:{value:9,max:12},modes:[{id:'attack',label:'Обычная'},{id:'aimed',label:'Прицельная'}],mode:'aimed',canAttack:true,canDamage:true,canReload:true,canLoad:true,damageLabel:'3d6',rof:2}],
  skillCategories:[{id:'awarenessSkills',label:'Навыки восприятия'},{id:'fightingSkills',label:'Боевые навыки'},{id:'techniqueSkills',label:'Технические навыки'},{id:'emptySkills',label:'Пустой раздел'}],
  skills:[{id:'evasion',name:'Уклонение',category:'fightingSkills'},{id:'perception',name:'Восприятие',category:'awarenessSkills'},{id:'lock',name:'Взлом замков',category:'techniqueSkills',difficult:true}],
  canInitiative:true,canDeathSave:false,busy:false,status:'',
  ...overrides,
});
const view = (selected, extra = {}) => renderHUD({supported:true,selected,...extra});
const buttons = html => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const action = (html,name) => buttons(html).find(tag=>tag.includes(`data-action="${name}"`));
const actions = (html,name) => buttons(html).filter(tag=>tag.includes(`data-action="${name}"`));
const toggle = (html,id) => buttons(html).find(tag=>tag.includes('data-action="toggle-card"')&&tag.includes(`data-id="${id}"`));
const cardTag = (html,id) => html.match(new RegExp(`<section[^>]*data-card="${id}"[^>]*>`))?.[0];

test('production HUD has no tutorial and keeps refresh, close and character controls', () => {
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
  for (const name of ['sheet','weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative','choose-weapon','choose-mode']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.doesNotMatch(tag,/ disabled/);
  }
  assert.doesNotMatch(html,/data-action="(scale-settings|toggle-dock|toggle-skills|toggle-arsenal|close-drawers)"/);
});

test('initiative is rendered only during a started combat and the turn button only for the GM', () => {
  const combat={round:9,combatants:[{id:'one',name:'Ви',selectable:true}],canAdvance:true};
  for(const state of [undefined,false]){
    const html=renderHUD({supported:true,selected:actor(),combat:{...combat,started:state}});
    assert.doesNotMatch(html,/aria-label="Очередь инициативы"|data-action="next-turn"/);
  }
  const active=renderHUD({supported:true,selected:actor(),combat:{...combat,started:true}});
  assert.match(active,/aria-label="Очередь инициативы"/);
  assert.ok(action(active,'next-turn'));
  assert.match(active,/data-action="select-combatant" data-id="one"/);
  const player=renderHUD({supported:true,selected:actor(),combat:{...combat,started:true,canAdvance:false}});
  assert.equal(action(player,'next-turn'),undefined);
});

test('the neon strip carries its layout marker and an accessible continuous scale grip', () => {
  const html=view(actor());
  assert.match(html,/class="redline-interface redline-neon"/);
  assert.match(html,/data-layout="neon-strip"/);
  assert.match(html,/data-scale="80"/);
  const grip=html.match(/<span class="redline-scale-grip"[^>]*>/)[0];
  assert.match(grip,/role="slider"/);
  assert.match(grip,/tabindex="0"/);
  assert.match(grip,/aria-valuemin="50" aria-valuemax="150" aria-valuenow="80" aria-valuetext="80%"/);
  const scaled=view(actor(),{interfaceScale:123});
  assert.match(scaled,/aria-valuenow="123"/);
  assert.match(scaled,/<output class="redline-scale-readout">123%<\/output>/);
  assert.match(renderHUD({}),/class="redline-scale-grip"/);
});

test('weapon commands keep the exact subject, revision and the selected mode', () => {
  const html=view(actor());
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative','death-save','choose-weapon','choose-mode']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.match(tag,/type="button"/);
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
  }
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load']) {
    assert.match(action(html,name),/data-id="pistol"/);
    assert.match(action(html,name),/data-mode="aimed"/);
  }
  const chips=actions(html,'choose-mode');
  assert.deepEqual(chips.map(tag=>tag.match(/data-mode="([^"]+)"/)[1]),['attack','aimed']);
  assert.match(chips[1],/aria-pressed="true"/);
  assert.match(chips[0],/aria-pressed="false"/);
  assert.doesNotMatch(html,/<select\b/);
  assert.match(action(html,'weapon-load'),/aria-label="Выбрать патроны: Пистолет"/);
  assert.match(html,/fa-solid fa-box-open" aria-hidden="true"/);
  assert.match(action(html,'selected-skill'),/data-id="evasion"/);
});

test('the strip shows one selected weapon while the weapon card lists every equipped weapon', () => {
  const first=actor().weapons[0];
  const second={...first,id:'rifle',name:'Винтовка'};
  const model=actor({selectedWeaponId:'rifle',weapons:[first,second]});
  const html=view(model);
  assert.match(toggle(html,'weapon'),/data-weapon-id="rifle"/);
  assert.match(html,/<span class="redline-strip-text">Винтовка<\/span>/);
  const rows=actions(html,'choose-weapon');
  assert.deepEqual(rows.map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['pistol','rifle']);
  assert.match(rows[1],/aria-pressed="true"/);
  for(const name of ['weapon-attack','weapon-damage','weapon-reload']) assert.match(action(html,name),/data-id="rifle"/);
  assert.equal(actions(html,'weapon-attack').length,1);
  const stale=view({...model,selectedWeaponId:'deleted'});
  assert.match(action(stale,'weapon-attack'),/data-id="pistol"/);
});

test('every card has an accessible toggle and only the open card is shown', () => {
  const closed=view(actor({recentActions:[{id:'1',status:'completed',title:'Атака'}]}));
  for(const id of CARD_IDS) {
    assert.match(toggle(closed,id),/aria-expanded="false"/,id);
    assert.match(cardTag(closed,id),/ hidden>/,id);
  }
  assert.match(toggle(closed,'skills'),/aria-controls="redline-skills-panel"/);
  assert.match(toggle(closed,'weapon'),/aria-controls="redline-card-weapon"/);
  for(const id of CARD_IDS) {
    const html=view(actor({recentActions:[{id:'1',status:'completed',title:'Атака'}]}),{openCard:id});
    assert.match(toggle(html,id),/aria-expanded="true"/,id);
    assert.doesNotMatch(cardTag(html,id),/ hidden>/,id);
    assert.equal([...html.matchAll(/<section[^>]*data-card="[^"]+"[^>]*>/g)].filter(m=>!/ hidden>/.test(m[0])).length,1,id);
  }
  const bogus=view(actor(),{openCard:'nope'});
  assert.equal([...bogus.matchAll(/<section[^>]*data-card="[^"]+"[^>]*>/g)].filter(m=>!/ hidden>/.test(m[0])).length,0);
  assert.match(action(view(actor(),{openCard:'skills'}),'close-card'),/aria-label="Закрыть навыки"/);
});

test('HP segments follow the native wound tone and armor shows head and body SP', () => {
  const html=view(actor());
  assert.match(html,/class="redline-hp" data-vital-tone="low" data-hp-value="10" data-hp-max="40"/);
  assert.match(html,/class="redline-segments" data-lit="3"/);
  assert.equal([...html.matchAll(/<i class="is-lit"><\/i>/g)].length,3);
  assert.match(html,/<b class="redline-num">10<\/b><small>\/40<\/small>/);
  assert.match(html,/SP 11·12/);
  const dead=view(actor({hp:{value:-3,max:40},healthStatus:{label:'При смерти',tone:'critical'}}));
  assert.match(dead,/data-vital-tone="critical"/);
  assert.match(dead,/data-lit="0"/);
  const unknown=view(actor({hp:null,armor:[]}));
  assert.match(unknown,/data-lit=""/);
  assert.match(unknown,/HP —/);
  assert.match(unknown,/SP —·—/);
});

test('conditions show up to three icons with a remainder and escaped labels', () => {
  const conditions=[{id:'injury:a',label:'Сломанная рука'},{id:'effect:b',label:'Стимулятор'},{id:'effect:c',label:'<script>x</script>'},{id:'effect:d',label:'Оглушён'}];
  const html=view(actor({conditions}));
  const strip=html.match(/<span class="redline-conditions">(.*?)<\/span><\/button>/s)[1];
  assert.equal([...strip.matchAll(/class="redline-condition-icon"/g)].length,3);
  assert.match(strip,/data-condition-id="injury:a" title="Сломанная рука"><i class="fa-solid fa-droplet"/);
  assert.match(strip,/data-condition-id="effect:b" title="Стимулятор"><i class="fa-solid fa-bolt"/);
  assert.match(strip,/<small>\+1<\/small>/);
  assert.doesNotMatch(html,/<script>x/);
  assert.match(cardTag(html,'character')+html.split(cardTag(html,'character'))[1],/data-condition-id="effect:d"/);
});

test('an empty magazine marks the ammo and the reload button, melee weapons show no magazine', () => {
  const empty=actor();
  empty.weapons[0].ammo={value:0,max:12};
  const html=view(empty);
  assert.match(html,/class="redline-ammo" data-ammo-state="empty"/);
  assert.match(action(html,'weapon-reload'),/is-urgent/);
  const melee=actor();
  Object.assign(melee.weapons[0],{ammo:null,canReload:false,canLoad:false});
  const knife=view(melee);
  assert.doesNotMatch(toggle(knife,'weapon'),/data-vital="ammo"/);
  assert.match(knife,/<small class="redline-muted">ближн\.<\/small>/);
  assert.doesNotMatch(action(knife,'weapon-reload'),/is-urgent/);
});

test('the target cell shows the first target and a remainder, the card lists all of them', () => {
  const none=view(actor());
  assert.match(none,/Нет цели/);
  const targets=[{name:'Охранник'},{name:'Курьер'},{name:'Дрон'}];
  const html=view(actor(),{targets});
  assert.match(toggle(html,'target'),/aria-label="Цели: Охранник, Курьер, Дрон"/);
  assert.match(html,/<span class="redline-strip-text">Охранник<\/span><small>\+2<\/small>/);
  const card=html.slice(html.indexOf('data-card="target"'));
  assert.match(card,/aria-label="Цели атаки"/);
  for(const name of ['Охранник','Курьер','Дрон']) assert.match(card,new RegExp(`<span>${name}</span>`));
  assert.match(card,/Цель отмечается штатной отметкой T на сцене/);
});

test('portraits reject executable URLs without creating fake resource values', () => {
  const model=actor({img:'javascript:alert(1)',hp:null});
  const html=renderHUD({supported:true,selected:model,targets:[{name:'Цель',img:'vbscript:alert(1)'}]});
  assert.doesNotMatch(html,/<img\b/);
  assert.doesNotMatch(html,/javascript:|vbscript:|data:image/);
  for(const img of ['java\nscript:alert(1)','file:///C:/private.png','vb\tscript:alert(1)']) assert.doesNotMatch(view(actor({img})),/<img\b/);
  assert.match(view(actor({img:'tokens/vi.webp'})),/<img src="tokens\/vi\.webp"/);
});

test('busy state disables every subject action and the search input and announces the status', () => {
  const html=view(actor({busy:true}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject='))) assert.match(tag,/ disabled>/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/<input\b[^>]*data-skill-search[^>]* disabled>/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">Выполняется действие системы…/);
  assert.match(view(actor({status:'Патроны выбраны.'})),/role="status" aria-live="polite" aria-atomic="true">Патроны выбраны\./);
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
});

test('no search results or an empty sheet section disables the roll without a stale skill id', () => {
  for(const skillState of [{category:'all',query:'Нет такого навыка'},{category:'emptySkills',query:''}]) {
    const html=renderHUD({supported:true,selected:actor({selectedSkillId:'evasion'}),skillState});
    assert.deepEqual(actions(html,'choose-skill'),[]);
    assert.match(action(html,'selected-skill'),/data-id=""/);
    assert.match(action(html,'selected-skill'),/ disabled>/);
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
  assert.doesNotMatch(html,/999|Взлом замков ·/);
});

test('favorites appear as quick rolls at the top of the skills card', () => {
  const html=view(actor({favoriteSkillIds:['perception']}));
  const card=html.slice(html.indexOf('id="redline-skills-panel"'));
  const quick=card.match(/<section class="redline-quick-skills"[^>]*>(.*?)<\/section>/s)[1];
  assert.match(action(quick,'quick-skill'),/data-id="perception"/);
  assert.match(action(quick,'quick-skill'),/aria-label="Бросить — Восприятие"/);
  assert.match(view(actor()),/Нажмите ★ у навыка/);
});

test('other native character rolls remain behind an accessible disclosure and in the more card', () => {
  const closed=view(actor());
  assert.match(closed,/<details class="redline-other-rolls" data-other-rolls>/);
  const html=renderHUD({supported:true,selected:actor(),skillState:{otherRolls:true}});
  const detail=html.match(/<details class="redline-other-rolls" data-other-rolls open>(.*?)<\/details>/s)[1];
  assert.doesNotMatch(action(detail,'initiative'),/ disabled/);
  assert.match(action(detail,'death-save'),/ disabled>/);
  const more=html.slice(html.indexOf('data-card="more"'));
  for(const name of ['initiative','death-save','weapon-load','sheet','refresh','close']) assert.ok(action(more,name),name);
});

test('capabilities disable only unavailable commands and explain their reason', () => {
  const model=actor();
  model.weapons[0].canAttack=false;
  model.weapons[0].reason='Недостаточно патронов: требуется 10.';
  const html=view(model);
  assert.match(action(html,'weapon-attack'),/title="Недостаточно патронов: требуется 10\."/);
  assert.match(action(html,'weapon-attack'),/ disabled>/);
  assert.doesNotMatch(action(html,'weapon-damage'),/ disabled>/);
  assert.match(action(html,'death-save'),/title="Спасбросок смерти доступен при смертельном ранении\."/);
});

test('document text, ids, mode labels and statuses are escaped as data', () => {
  const dangerous='"/><script>alert(1)</script>&\'';
  const model=actor({key:dangerous,name:dangerous,status:dangerous,skills:[{id:dangerous,name:dangerous,category:dangerous}],skillCategories:[{id:dangerous,label:dangerous}]});
  Object.assign(model.weapons[0],{id:dangerous,name:dangerous,mode:dangerous,modes:[{id:dangerous,label:dangerous}],damageLabel:dangerous,canAttack:false,reason:dangerous});
  const html=view(model,{targets:[{name:dangerous}]});
  assert.doesNotMatch(html,/<script>|<\/script>/);
  assert.match(html,/data-subject="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;"/);
  assert.match(html,/data-mode="&quot;\/&gt;&lt;script&gt;/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">&quot;\/&gt;&lt;script&gt;/);
});

test('missing capabilities and action identity remain read-only instead of enabling commands', () => {
  const html=view(actor({key:undefined,revision:undefined,weapons:[{id:'legacy',name:'Старое оружие'}],skills:[],canInitiative:false,canDeathSave:false}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject=')&&!tag.includes('data-action="sheet"'))) assert.match(tag,/ disabled>/);
  assert.match(html,/Нет доступных навыков/);
  assert.doesNotMatch(html,/NaN|undefined|null/);
});

test('without a character the strip collapses to a hint and keeps the more menu', () => {
  const html=renderHUD({supported:true});
  assert.match(html,/class="redline-strip redline-panel is-empty"/);
  assert.match(html,/Выберите токен/);
  assert.ok(toggle(html,'more'));
  for(const id of ['character','weapon','target','skills','history']) assert.equal(toggle(html,id),undefined,id);
});

test('the strip shows a red turn line only when the shown character has the current turn', () => {
  const base={started:true,round:1,canAdvance:false};
  const mine=renderHUD({supported:true,selected:actor(),combat:{...base,combatants:[{id:'a',name:'Ви',current:true,selected:true}]}});
  assert.match(mine,/class="redline-strip redline-panel is-turn"/);
  const other=renderHUD({supported:true,selected:actor(),combat:{...base,combatants:[{id:'a',name:'Ви',current:false,selected:true},{id:'b',name:'Охранник',current:true}]}});
  assert.doesNotMatch(other,/is-turn/);
});
