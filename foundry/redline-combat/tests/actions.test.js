import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionRejected, createActionRunner, resolveActionSubject, subjectCombatant } from '../scripts/actions.js';
import { equippedWeapons, subjectKey, weaponCapabilities, weaponModes } from '../scripts/capabilities.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture({ combatAttack = null } = {}) {
  const calls = [], busy = [], statuses = [];
  const items = [];
  items.get = id => items.find(item => item.id === id);
  const permissions = { owned: true };
  const actor = {
    id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Ви', items,
    system: { stats: { luck: { value: 6 } }, derivedStats: { hp: { value: 40, max: 40 } } },
    testUserPermission(user, level) { assert.equal(level, 'OWNER'); return permissions.owned; },
    getFlag() { return 'head'; },
    async setFlag(scope, key, value) { calls.push(['flag', scope, key, value]); },
    async update(change) {
      calls.push(['actor-update', change]);
      if ('system.stats.luck.value' in change) this.system.stats.luck.value = change['system.stats.luck.value'];
    },
    processDeathSave(roll) { calls.push(['death-save', roll]); return 'alive'; },
    createRoll(type) { calls.push(['actor-create', type]); return roll; }
  };
  const token = { id: 'token-one', uuid: 'Scene.audit.Token.token-one', parent: { id: 'audit' }, actor, hidden: false };
  const controlled = { actor, document: token, isVisible: true };
  const ctx = {
    user: { id: 'player', isGM: false, character: null },
    system: { id: 'cyberpunk-red-core' }, generation: 12, revision: 4,
    controlled: [controlled], targets: [], combat: null, selectedCombatantId: null
  };
  const behavior = {
    dialog: async () => true,
    discharge: async current => { weapon.system.magazine.value -= current.bullets ?? 1; },
    render: async () => {},
    getSystem: async () => system
  };
  const roll = {
    luck: 0, bullets: 1, location: 'head', rollCardExtraArgs: {},
    async handleRollDialog(event, owner, item) {
      calls.push(['dialog', owner, item, event]);
      return behavior.dialog(event, owner, item);
    },
    async roll() { calls.push(['roll']); }
  };
  const weapon = {
    id: 'pistol', uuid: 'Actor.hero.Item.pistol', type: 'weapon', name: 'Пистолет', actor,
    system: {
      equipped: 'equipped', isRanged: true, weaponSkill: 'Handgun',
      magazine: { value: 6, max: 8 }, fireModes: { autoFire: 0, suppressiveFire: false }, damage: '3d6', rof: 2
    },
    createRoll(type, owner, extra) { calls.push(['create', type, owner, extra]); return roll; },
    async confirmRoll(current) { calls.push(['confirm', current]); return current; },
    hasAmmo(current) { return this.system.magazine.value >= (current.bullets ?? 1); },
    async dischargeItem(current) { calls.push(['discharge', current]); await behavior.discharge(current); calls.push(['discharged']); },
    getInstalledItems(type) { assert.equal(type, 'ammo'); return [{ id: 'basic-ammo', system: { type: 'basic' } }]; },
    async reload() { calls.push(['reload']); },
    async load() { calls.push(['load']); }
  };
  const skill = {
    id: 'handgun', name: 'Handgun', type: 'skill', actor,
    createRoll(type, owner, extra) { calls.push(['skill-create', type, owner, extra]); return roll; },
    async confirmRoll(current) { calls.push(['confirm-skill', current]); return current; }
  };
  items.push(weapon, skill);
  const system = { async renderRollCard(current) { calls.push(['chat', current]); return behavior.render(current); } };
  const run = createActionRunner({
    getContext: () => ctx,
    getSystem: async () => { calls.push(['system']); return behavior.getSystem(); },
    combatAttack,
    onBusy: value => busy.push(value), onStatus: value => statuses.push(value)
  });
  const request = (overrides = {}) => ({
    action: 'weapon-attack', id: weapon.id, mode: 'attack', subject: subjectKey(actor, token), revision: ctx.revision,
    ...overrides
  });
  const names = () => calls.map(call => call[0]);
  return { actor, token, controlled, ctx, permissions, weapon, skill, items, roll, behavior, calls, busy, statuses, run, request, names };
}

function assertNoEffect(f) {
  for (const effect of ['confirm', 'confirm-skill', 'discharge', 'roll', 'chat', 'actor-update', 'reload', 'load', 'death-save']) {
    assert.equal(f.names().includes(effect), false, `unexpected effect: ${effect}`);
  }
}

test('native completed roll returns only the accessible chat result, with blind-author redaction', async () => {
  const normal = fixture();
  normal.roll.resultTotal = 24;
  normal.behavior.render = async () => ({id:'native-message',visible:true,isContentVisible:true,blind:false});
  const result = await normal.run(normal.request());
  assert.equal(result.summary.total,24);
  assert.equal(result.summary.chatMessageId,'native-message');
  const blind = fixture();
  blind.roll.resultTotal = 29;
  blind.behavior.render = async () => ({id:'blind-message',visible:true,isContentVisible:true,blind:true});
  assert.deepEqual((await blind.run(blind.request())).summary,{total:null,chatMessageId:null});
});

test('unowned subjects are rejected before a system API is called; GM is allowed', async () => {
  const denied = fixture();
  denied.permissions.owned = false;
  await assert.rejects(denied.run(denied.request()), ActionRejected);
  assert.deepEqual(denied.calls, []);
  const gm = fixture();
  gm.permissions.owned = false;
  gm.ctx.user.isGM = true;
  assert.equal((await gm.run(gm.request())).status, 'completed');
  assert.equal(gm.names().filter(name => name === 'chat').length, 1);
});

test('wrong generation, system, revision or subject fails closed', async t => {
  for (const kind of ['generation', 'system', 'revision', 'subject']) {
    await t.test(kind, async () => {
      const f = fixture(), request = f.request();
      if (kind === 'generation') f.ctx.generation = 13;
      if (kind === 'system') f.ctx.system.id = 'another-system';
      if (kind === 'revision') f.ctx.revision++;
      if (kind === 'subject') request.subject = 'Actor.somebody-else|';
      await assert.rejects(f.run(request), ActionRejected);
      assert.deepEqual(f.calls, []);
    });
  }
});

test('cancelling the native dialog does not consume ammo, roll, spend luck or send chat', async () => {
  const f = fixture();
  f.roll.luck = 3;
  f.behavior.dialog = async () => false;
  assert.equal((await f.run(f.request())).status, 'cancelled');
  assertNoEffect(f);
  assert.equal(f.weapon.system.magazine.value, 6);
  assert.equal(f.actor.system.stats.luck.value, 6);
  assert.deepEqual(f.busy, [true, false]);
});

test('selection revision and ownership are rechecked after the native dialog', async t => {
  for (const kind of ['revision', 'ownership', 'fallback-actor']) {
    await t.test(kind, async () => {
      const f = fixture();
      f.behavior.dialog = async () => {
        if (kind === 'revision') f.ctx.revision++;
        if (kind === 'ownership') f.permissions.owned = false;
        if (kind === 'fallback-actor') {
          const other = fixture().actor;
          other.uuid = 'Actor.somebody-else';
          f.ctx.controlled = [];
          f.ctx.user.character = other;
        }
        return true;
      };
      await assert.rejects(f.run(f.request()), ActionRejected);
      assertNoEffect(f);
      assert.deepEqual(f.busy, [true, false]);
    });
  }
});

test('removed, unequipped or replaced items cannot execute after a dialog', async t => {
  for (const kind of ['removed', 'unequipped', 'replaced']) {
    await t.test(kind, async () => {
      const f = fixture();
      f.behavior.dialog = async () => {
        if (kind === 'removed') f.items.splice(0, 1);
        if (kind === 'unequipped') f.weapon.system.equipped = 'owned';
        if (kind === 'replaced') f.items[0] = { ...f.weapon };
        return true;
      };
      await assert.rejects(f.run(f.request()), ActionRejected);
      assertNoEffect(f);
    });
  }
});

test('unsupported modes, insufficient bullets and missing skills are rejected before opening a dialog', async t => {
  for (const kind of ['unsupported-mode', 'empty-magazine', 'missing-Handgun', 'autofire-shortage', 'missing-Autofire']) {
    await t.test(kind, async () => {
      const f = fixture();
      let mode = 'attack';
      if (kind === 'unsupported-mode') mode = 'autofire';
      if (kind === 'empty-magazine') f.weapon.system.magazine.value = 0;
      if (kind === 'missing-Handgun') f.items.splice(1, 1);
      if (kind.startsWith('autofire') || kind === 'missing-Autofire') {
        mode = 'autofire';
        f.weapon.system.fireModes.autoFire = 3;
        if (kind === 'autofire-shortage') f.items.push({ id: 'auto', name: 'Autofire', type: 'skill' });
        else f.weapon.system.magazine.value = 20;
      }
      await assert.rejects(f.run(f.request({ mode })), ActionRejected);
      assert.deepEqual(f.calls, []);
    });
  }
});

test('ammo depleted while the dialog is open or rejected by native hasAmmo is not discharged', async t => {
  for (const nativeOnly of [false, true]) {
    await t.test(nativeOnly ? 'native ammunition requirement' : 'live magazine changed', async () => {
      const f = fixture();
      f.behavior.dialog = async () => {
        if (nativeOnly) f.roll.bullets = 10;
        else f.weapon.system.magazine.value = 0;
        return true;
      };
      await assert.rejects(f.run(f.request()), ActionRejected);
      assertNoEffect(f);
    });
  }
});

test('synthetic actors sharing local IDs remain isolated by actor and token UUID', async () => {
  const f = fixture(), request = f.request();
  const other = fixture();
  other.actor.uuid = 'Scene.other.Token.token-two.Actor.hero';
  other.token.uuid = 'Scene.other.Token.token-two';
  assert.equal(f.actor.id, other.actor.id);
  assert.equal(f.weapon.id, other.weapon.id);
  assert.notEqual(subjectKey(f.actor, f.token), subjectKey(other.actor, other.token));
  f.ctx.controlled = [other.controlled];
  assert.throws(() => resolveActionSubject(f.ctx, request), ActionRejected);
  await assert.rejects(f.run(request), ActionRejected);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(other.calls, []);
});

test('replacing the actor Document with the same UUID while dialog is open is rejected', async () => {
  const f = fixture();
  f.behavior.dialog = async () => {
    f.controlled.actor = { ...f.actor };
    return true;
  };
  await assert.rejects(f.run(f.request()), ActionRejected);
  assertNoEffect(f);
});

test('a second click stays busy while the first dialog is open, and cancel releases the lock', async () => {
  const f = fixture(), entered = deferred(), finish = deferred();
  f.behavior.dialog = async () => { entered.resolve(); return finish.promise; };
  const first = f.run(f.request());
  await entered.promise;
  assert.deepEqual(await f.run(f.request()), { status: 'busy' });
  assert.equal(f.names().filter(name => name === 'dialog').length, 1);
  finish.resolve(false);
  assert.equal((await first).status, 'cancelled');
  f.behavior.dialog = async () => false;
  assert.equal((await f.run(f.request())).status, 'cancelled');
  assert.deepEqual(f.busy, [true, false, true, false]);
});

test('ranged attack waits for discharge, consumes once, preserves native ammo type and then rolls/chat', async () => {
  const f = fixture(), entered = deferred(), finish = deferred();
  f.behavior.discharge = async () => { entered.resolve(); await finish.promise; f.weapon.system.magazine.value--; };
  const running = f.run(f.request());
  await entered.promise;
  assert.equal(f.names().includes('confirm'), false, 'native confirmRoll would fire-and-forget a second discharge');
  assert.equal(f.names().includes('roll'), false);
  assert.equal(f.names().includes('chat'), false);
  assert.deepEqual(await f.run(f.request()), { status: 'busy' });
  finish.resolve();
  assert.equal((await running).status, 'completed');
  assert.equal(f.weapon.system.magazine.value, 5);
  assert.equal(f.names().filter(name => name === 'discharge').length, 1);
  assert.ok(f.names().indexOf('discharged') < f.names().indexOf('roll'));
  assert.ok(f.names().indexOf('roll') < f.names().indexOf('chat'));
  assert.equal(f.roll.rollCardExtraArgs.ammoType, 'basic');
});

test('discharge failure prevents roll/chat and releases the busy guard for a later action', async () => {
  const f = fixture();
  f.behavior.discharge = async () => { throw new Error('ammo write rejected'); };
  await assert.rejects(f.run(f.request()), /ammo write rejected/);
  assert.equal(f.names().includes('roll'), false);
  assert.equal(f.names().includes('chat'), false);
  assert.equal(f.weapon.system.magazine.value, 6);
  assert.deepEqual(f.busy, [true, false]);
  f.behavior.dialog = async () => false;
  assert.equal((await f.run(f.request())).status, 'cancelled');
});

test('damage uses native confirmation but does not require or consume magazine ammo', async () => {
  const f = fixture();
  f.weapon.system.magazine.value = 0;
  assert.equal((await f.run(f.request({ action: 'weapon-damage', mode: 'aimed' }))).status, 'completed');
  assert.equal(f.names().includes('discharge'), false);
  assert.equal(f.names().filter(name => name === 'confirm').length, 1);
  assert.equal(f.calls.find(call => call[0] === 'create')[1], 'damage');
  assert.deepEqual(f.calls.find(call => call[0] === 'create')[3], { damageType: 'aimed' });
  assert.equal(f.roll.location, 'head');
  assert.equal(f.names().filter(name => name === 'chat').length, 1);
});

test('melee attack delegates confirmation and never invokes ammunition discharge', async () => {
  const f = fixture();
  f.weapon.system.isRanged = false;
  f.weapon.system.magazine.value = 0;
  await f.run(f.request());
  assert.equal(f.names().filter(name => name === 'confirm').length, 1);
  assert.equal(f.names().includes('discharge'), false);
});

test('reload and load invoke only the original native item methods', async t => {
  for (const method of ['reload', 'load']) {
    await t.test(method, async () => {
      const f = fixture();
      assert.equal((await f.run(f.request({ action: `weapon-${method}` }))).status, 'completed');
      assert.deepEqual(f.names(), [method]);
      assert.deepEqual(f.busy, [true, false]);
    });
  }
});

test('skill roll spends only available LUCK and emits the native item/actor/token identifiers', async () => {
  const f = fixture();
  f.roll.luck = 9;
  f.actor.system.stats.luck.value = 3;
  await f.run(f.request({ action: 'skill', id: f.skill.id }));
  assert.equal(f.actor.system.stats.luck.value, 0);
  assert.deepEqual(f.calls.find(call => call[0] === 'actor-update')[1], { 'system.stats.luck.value': 0 });
  assert.equal(f.names().includes('discharge'), false);
  assert.equal(f.names().filter(name => name === 'confirm-skill').length, 1);
  assert.deepEqual(f.roll.entityData, { actor: f.actor.id, token: f.token.id, tokens: [], item: f.skill.id });
});

test('chat receives only currently visible targets and never reads excluded target names', async () => {
  const f = fixture();
  const target = (id, name, visible, hidden = false) => ({
    name, isVisible: visible, document: { id, name, hidden }
  });
  const alpha = target('a', 'Alpha', true), zulu = target('z', 'Zulu', true);
  const hidden = target('h', 'Secret', true, true), unseen = target('u', 'Unseen', false);
  for (const excluded of [hidden, unseen]) Object.defineProperty(excluded, 'name', { get() { throw new Error('private target name read'); } });
  f.ctx.targets = [zulu, hidden, unseen, alpha];
  await f.run(f.request({ action: 'skill', id: f.skill.id }));
  assert.deepEqual(f.roll.entityData.tokens, [alpha, zulu]);
});

test('initiative addresses the exact token combatant, not another row with the same actor ID', async () => {
  const f = fixture();
  const otherToken = { ...f.token, id: 'another-token', uuid: 'Scene.audit.Token.another-token' };
  const first = { id: 'wrong-row', actor: f.actor, token: otherToken, visible: true, hidden: false };
  const exact = { id: 'correct-row', actor: f.actor, token: f.token, visible: true, hidden: false };
  const rolled = [];
  f.ctx.combat = { turns: [first, exact], async rollInitiative(ids) { rolled.push(ids); } };
  assert.equal(subjectCombatant(f.ctx, f.actor, f.token), exact);
  assert.equal((await f.run(f.request({ action: 'initiative' }))).status, 'completed');
  assert.deepEqual(rolled, [['correct-row']]);
  assert.deepEqual(f.calls, []);
});

test('initiative rejects a hidden combatant instead of rolling its row for the player', async () => {
  const f = fixture();
  let rolls = 0;
  f.ctx.combat = {
    turns: [{ id: 'hidden-row', actor: f.actor, token: f.token, visible: false, hidden: true }],
    async rollInitiative() { rolls++; }
  };
  await assert.rejects(f.run(f.request({ action: 'initiative' })), ActionRejected);
  assert.equal(rolls, 0);
});

test('system loading failures release busy state without consuming any resources', async () => {
  const f = fixture();
  f.behavior.getSystem = async () => { throw new Error('system API unavailable'); };
  await assert.rejects(f.run(f.request()), /system API unavailable/);
  assertNoEffect(f);
  assert.deepEqual(f.busy, [true, false]);
  f.behavior.getSystem = async () => ({ renderRollCard() {} });
  f.behavior.dialog = async () => false;
  assert.equal((await f.run(f.request())).status, 'cancelled');
});

test('death saves are denied above zero HP and otherwise retain native processing', async () => {
  const f = fixture();
  await assert.rejects(f.run(f.request({ action: 'death-save' })), ActionRejected);
  assertNoEffect(f);
  f.actor.system.derivedStats.hp.value = 0;
  assert.equal((await f.run(f.request({ action: 'death-save' }))).status, 'completed');
  assert.equal(f.roll.saveResult, 'alive');
  assert.equal(f.names().includes('discharge'), false);
});

test('capabilities expose native automatic modes, ammunition thresholds and independent damage availability', () => {
  const f = fixture();
  assert.deepEqual(weaponModes(f.weapon).map(mode => mode.id), ['attack', 'aimed']);
  f.weapon.system.fireModes = { autoFire: 3, suppressiveFire: true };
  f.items.push({ id: 'autofire-skill', type: 'skill', name: 'Autofire' });
  assert.deepEqual(weaponModes(f.weapon).map(mode => mode.id), ['attack', 'aimed', 'autofire', 'suppressive']);
  f.weapon.system.magazine.value = 9;
  assert.equal(weaponCapabilities(f.actor, f.weapon, 'autofire').canAttack, false);
  f.weapon.system.magazine.value = 10;
  assert.equal(weaponCapabilities(f.actor, f.weapon, 'autofire').canAttack, true);
  assert.equal(weaponCapabilities(f.actor, f.weapon, 'suppressive').canDamage, false);
  f.weapon.system.magazine.value = 0;
  assert.equal(weaponCapabilities(f.actor, f.weapon, 'attack').canDamage, true);
});

test('equipped capability list supports CPR cyberweapons and falls back only to explicitly equipped weapons', () => {
  const f = fixture();
  const cyber = { id: 'cyber', type: 'cyberware', system: { isWeapon: true } };
  f.actor.system.weapons = { equipped: [cyber] };
  assert.deepEqual(equippedWeapons(f.actor), [cyber]);
  delete f.actor.system.weapons;
  f.items.push({ id: 'carried', type: 'weapon', system: { equipped: 'carried' } });
  assert.deepEqual(equippedWeapons(f.actor), [f.weapon]);
});

test('dock attacks go to the combat card workflow when it accepts them', async () => {
  const received = [];
  const f = fixture({ combatAttack: async request => { received.push(request); return true; } });
  const target = { id: 'target', name: 'Цель', isVisible: true, document: { hidden: false } };
  f.ctx.targets = [target];
  const result = await f.run(f.request({ mode: 'aimed' }));
  assert.deepEqual(result, { status: 'completed' });
  assert.equal(received.length, 1);
  assert.equal(received[0].item, f.weapon);
  assert.equal(received[0].mode, 'aimed');
  assert.deepEqual(received[0].targets, [target]);
  assertNoEffect(f);
  assert.equal(f.names().includes('dialog'), false);
  assert.match(f.statuses.at(-1), /карточку боя/);
});

test('dock attacks fall back to the native roll when the combat workflow declines', async () => {
  const f = fixture({ combatAttack: async () => false });
  const result = await f.run(f.request());
  assert.equal(result.status, 'completed');
  assert.ok(f.names().includes('dialog'));
  assert.ok(f.names().includes('discharge'));
  assert.ok(f.names().includes('chat'));
});

test('hidden targets are not offered to the combat workflow', async () => {
  const received = [];
  const f = fixture({ combatAttack: async request => { received.push(request); return false; } });
  f.ctx.targets = [{ id: 'ghost', isVisible: false, document: { hidden: true } }];
  await f.run(f.request());
  assert.deepEqual(received[0].targets, []);
});
