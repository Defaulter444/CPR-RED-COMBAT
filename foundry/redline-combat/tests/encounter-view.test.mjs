import test from 'node:test';
import assert from 'node:assert/strict';
import { renderActionFeed, renderConditionStrip, renderHUD } from '../scripts/view.js';

const actor = overrides => ({key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', hp:{value:32,max:40}, skills:[], weapons:[], ...overrides});
const entry = overrides => ({id:'event-1',kind:'weapon-attack',title:'Атака',itemName:'Пистолет',status:'completed',detail:'Бросок отправлен в чат.',nextStep:'Сверьте попадание с ведущим.',chatMessageId:'message-1',total:22,weaponId:'pistol',mode:'attack',canRollDamage:true,...overrides});
const button = (html,action) => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`data-action="${action}"`));

test('action card keeps follow-up actions attached to the exact session entry and current subject', () => {
  const html=renderActionFeed(actor({recentActions:[entry()]}));
  assert.match(html,/data-motion="result" data-result-id="event-1" data-result-status="completed"/);
  assert.match(html,/class="redline-result-total">22<\/strong>/);
  for(const action of ['open-result-chat','result-damage']) {
    const tag=button(html,action);
    assert.ok(tag,action);
    assert.match(tag,/data-entry-id="event-1"/);
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
    assert.doesNotMatch(tag,/ disabled/);
  }
  assert.match(html,/Урон при попадании…/);
  assert.match(html,/Сверьте попадание с ведущим/);
});

test('cancelled and failed actions cannot present stale roll totals or damage follow-ups', () => {
  for(const status of ['cancelled','error']) {
    const html=renderActionFeed(actor({recentActions:[entry({status})]}));
    assert.doesNotMatch(html,/class="redline-result-total"|data-action="open-result-chat"|data-action="result-damage"/);
    assert.match(html,new RegExp(`data-result-status="${status}"`));
  }
  for(const total of [null,undefined,Infinity,NaN,'22']) {
    assert.doesNotMatch(renderActionFeed(actor({recentActions:[entry({total})]})),/class="redline-result-total"/);
  }
});

test('incomplete entries expose neither unbound damage actions nor executable labels', () => {
  const html=renderActionFeed(actor({busy:true,recentActions:[entry({title:'<img src=x onerror="alert(1)">',itemName:'<script>x</script>',weaponId:null})]}));
  assert.match(button(html,'open-result-chat'),/ disabled/);
  assert.equal(button(html,'result-damage'),undefined);
  assert.doesNotMatch(html,/<img\b|<script\b/);
  assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(button(renderActionFeed(actor({key:'',recentActions:[entry()]})),'result-damage'),/ disabled/);
});

test('activity history is bounded, starts with the newest event and has a compact empty state', () => {
  const html=renderActionFeed(actor({recentActions:Array.from({length:8},(_,i)=>entry({id:`event-${i}`}))}));
  assert.match(html,/data-result-id="event-0"/);
  assert.equal([...html.matchAll(/<li\b/g)].length,4);
  assert.match(html,/<details class="redline-action-history" data-action-history>/);
  assert.match(renderActionFeed(actor({historyOpen:true,recentActions:[entry(),entry({id:'event-2'})]})),/<details class="redline-action-history" data-action-history open>/);
  const empty=renderActionFeed(actor({recentActions:[]}));
  assert.match(empty,/Атака <b[^>]*>→<\/b> диалог/);
  assert.doesNotMatch(empty,/data-result-id|data-action="result-damage"/);
});

test('condition projection renders only supplied state and escapes effect labels', () => {
  assert.equal(renderConditionStrip(actor()),'');
  const html=renderConditionStrip(actor({healthStatus:{label:'Тяжёлое ранение',tone:'low',detail:'Состояние из системы'},conditions:[{id:'x',label:'Оглушён'},{id:'unsafe',label:'<script>alert(1)</script>'}]}));
  assert.match(html,/data-health-tone="low"/);
  assert.match(html,/Состояние из системы/);
  assert.match(html,/data-condition-id="x" title="Оглушён">Оглушён/);
  assert.doesNotMatch(html,/<script\b/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('activity stays inside the scrolling workspace before the fixed quick-skill row', () => {
  const html=renderHUD({supported:true,dockExpanded:true,selected:actor({recentActions:[entry()]})});
  assert.match(html,/<\/section><section class="redline-action-feed"/);
  assert.match(html,/<\/article><\/section><\/div><section class="redline-quick-skills"/);
});
