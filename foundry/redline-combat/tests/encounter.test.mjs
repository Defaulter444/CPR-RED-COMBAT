import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadResultMessage,nativeResultSummary,describeAction,actionEntry,appendAction,projectRecentActions,projectConditions} from '../scripts/encounter.js';
import {projectActor} from '../scripts/state.js';

const gm = {isGM:true}, player = {isGM:false};
const message = {id:'chat-one',visible:true,isContentVisible:true,blind:false};
const roll = {resultTotal:17,bonusDamage:5,wasCritSuccess:() => true};

test('blind CPR HTML cards cannot leak to their non-GM author even when Foundry calls them visible', () => {
  const blind = {...message,blind:true};
  assert.equal(canReadResultMessage(blind,player),false);
  assert.deepEqual(nativeResultSummary(roll,blind,player,'weapon-damage'),{total:null,chatMessageId:null});
  assert.match(actionEntry({kind:'skill'}, {status:'completed',summary:nativeResultSummary(roll,blind,player,'skill')},'blind').detail,/скрыт или недоступен/);
  assert.equal(nativeResultSummary(roll,blind,gm,'weapon-damage').total,17);
});

test('unavailable, hidden or content-hidden messages expose no result', () => {
  for (const value of [undefined,{...message,visible:false},{...message,isContentVisible:false}]) {
    assert.equal(canReadResultMessage(value,gm),false);
    assert.deepEqual(nativeResultSummary(roll,value,gm,'weapon-damage'),{total:null,chatMessageId:null});
  }
});

test('damage summary keeps critical bonus separate from native dice total', () => {
  assert.deepEqual(nativeResultSummary(roll,message,player,'weapon-damage'),{
    total:17,chatMessageId:'chat-one',criticalBonus:5,saveResult:null,
  });
  assert.equal(nativeResultSummary({...roll,resultTotal:NaN},message,gm,'skill').total,null);
});

test('results are re-redacted after deletion or privacy change, including bonus and save result', () => {
  const entry = actionEntry({kind:'weapon-damage'}, {status:'completed',summary:nativeResultSummary(roll,message,gm,'weapon-damage')},1);
  const visible = projectRecentActions([entry],{user:player,getMessage:() => message})[0];
  assert.match(visible.detail,/бонус \+5/);
  for (const hidden of [null,{...message,blind:true},{...message,visible:false}]) {
    const result = projectRecentActions([entry],{user:player,getMessage:() => hidden})[0];
    assert.equal(result.total,null); assert.equal(result.chatMessageId,null);
    assert.equal(result.criticalBonus,null); assert.doesNotMatch(result.detail,/бонус/);
  }
  assert.equal(entry.total,17); // Projection never mutates the stored snapshot.
});

test('follow-up damage belongs to completed attack, uses pinned original item and mode, and needs current capability', () => {
  const request = {action:'weapon-attack',id:'original',mode:'aimed'};
  const actor = {items:new Map([['original',{id:'original',name:'Malorian'}]])};
  const description = describeAction(request,actor);
  const entry = actionEntry(description,{status:'completed'},1);
  assert.equal(entry.weaponId,'original'); assert.equal(entry.mode,'aimed');
  assert.equal(projectRecentActions([entry],{canDamage:() => true})[0].canRollDamage,true);
  assert.equal(projectRecentActions([entry],{canDamage:() => false})[0].canRollDamage,false);
  for (const status of ['cancelled','error']) assert.equal(actionEntry(description,{status},2).canRollDamage,false);
  assert.equal(actionEntry({...description,mode:'suppressive'},{status:'completed'},3).canRollDamage,false);
  assert.match(entry.nextStep,/DV или защитой/);
});

test('session history is immutable, newest-first and bounded to five entries', () => {
  const original = [{id:'old'}];
  let entries = original;
  for (let i=0;i<9;i++) entries=appendAction(entries,{id:String(i)});
  assert.deepEqual(entries.map(row=>row.id),['8','7','6','5','4']);
  assert.deepEqual(original,[{id:'old'}]);
});

test('wound state follows native enum even at ambiguous HP boundary and never invents a penalty', () => {
  const result = projectConditions({system:{derivedStats:{hp:{value:20,max:40},currentWoundState:'lightlyWounded'}}});
  assert.equal(result.healthStatus.label,'Лёгкое ранение');
  assert.equal(result.healthStatus.tone,'normal');
  assert.doesNotMatch(JSON.stringify(result),/−2|-2/);
  assert.equal(projectConditions({}).healthStatus.tone,'unknown');
});

test('condition projection includes injuries and active applicable effects, excludes disabled/suppressed and duplicates', () => {
  const actor = {items:[{id:'i',type:'criticalInjury',name:'Повреждённая рука'}],
    allApplicableEffects:() => [{id:'a',name:'Горение'},{id:'a',name:'Горение'},
      {id:'b',name:'disabled',disabled:true},{id:'c',name:'suppressed',isSuppressed:true},
      {id:'d',name:'CPR-suppressed',system:{isSuppressed:true}}]};
  assert.deepEqual(projectConditions(actor).conditions.map(row=>row.label),['Повреждённая рука','Горение']);
});

test('foreign actor projection never inspects injury/effect resources', () => {
  const actor = {type:'character',testUserPermission:()=>false,allApplicableEffects:() => {throw new Error('private');}};
  assert.equal(projectActor(actor,null,player),null);
});
