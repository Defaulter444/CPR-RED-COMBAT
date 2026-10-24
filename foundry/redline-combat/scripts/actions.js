import { ownsActor, resolveSubject, visibleCombatant, visibleTarget, SYSTEM_ID } from './state.js';
import { equippedWeapons, subjectKey, weaponCapabilities } from './capabilities.js';
import { nativeResultSummary } from './encounter.js';

export class ActionRejected extends Error {}
const reject = message => { throw new ActionRejected(message); };
const sameToken = (a,b) => a && b && (a.uuid && b.uuid ? a.uuid === b.uuid : a.id === b.id && a.parent?.id === b.parent?.id);
export function subjectCombatant(ctx, actor, token) {
  return Array.from(ctx.combat?.turns ?? ctx.combat?.combatants ?? []).find(row =>
    visibleCombatant(row, ctx.user) && ownsActor(row.actor, ctx.user) &&
    (token ? sameToken(row.token, token) : row.actor?.uuid === actor?.uuid && row.actor?.id === actor?.id));
}

/** Pin the original Document and selection revision; never redirect an old action to a fallback actor. */
export function resolveActionSubject(ctx, request) {
  if (ctx.system?.id !== SYSTEM_ID || Number(ctx.generation) !== 12) reject('Эта версия действий предназначена для Foundry 12 и Cyberpunk RED.');
  if (ctx.system?.version && String(ctx.system.version).replace(/^v/,'') !== '0.92.4') reject('Действия этой тестовой сборки проверены с Cyberpunk RED 0.92.4. Используйте лист персонажа.');
  const { actor, token } = resolveSubject(ctx);
  if (!ownsActor(actor, ctx.user) || !['character', 'mook'].includes(actor?.type)
    || request.subject !== subjectKey(actor, token) || Number(request.revision) !== Number(ctx.revision)) {
    reject('Выбранный персонаж изменился. Повторите действие из его панели.');
  }
  return { actor, token };
}

/** Native CPR roll pipeline, dependency-injected so permission/cancel/ammo handling is testable. */
export function createActionRunner({ getContext, getSystem, onBusy = () => {}, onStatus = () => {} }) {
  let busy = false;
  return async function run(request) {
    if (busy) return { status: 'busy' };
    const context = getContext();
    const { actor, token } = resolveActionSubject(context, request);
    const validate = () => {
      const next = resolveActionSubject(getContext(), request);
      if (next.actor !== actor || (token && next.token !== token && !sameToken(next.token, token))) reject('Персонаж был заменён. Повторите действие.');
      return next;
    };
    const getItem = type => {
      const item = actor.items?.get?.(request.id) ?? Array.from(actor.items ?? []).find(i => i.id === request.id);
      if (!item || (type === 'weapon' ? !equippedWeapons(actor).some(w => w.id === item.id) : item.type !== type)) reject('Предмет больше недоступен. Обновите панель.');
      return item;
    };
    busy = true; onBusy(true); onStatus('Ожидание действия системы…');
    try {
      if (request.action === 'initiative') {
        const row = subjectCombatant(context, actor, token);
        if (!row || typeof context.combat?.rollInitiative !== 'function') reject('Добавьте этого персонажа в бой, чтобы бросить инициативу.');
        validate();
        await context.combat.rollInitiative([row.id]);
        onStatus('Инициатива обработана трекером боя.');
        return { status: 'completed' };
      }
      let item = null;
      let type;
      if (request.action.startsWith('weapon-')) {
        item = getItem('weapon');
        const capability = weaponCapabilities(actor, item, request.mode);
        if (!capability.modes.some(m => m.id === request.mode)) reject('Этот режим недоступен для выбранного оружия.');
        if (request.action === 'weapon-reload' || request.action === 'weapon-load') {
          const method = request.action === 'weapon-reload' ? 'reload' : 'load';
          if (!(method === 'reload' ? capability.canReload : capability.canLoad)) reject('Это оружие не использует перезарядку.');
          validate();
          // CPR owns its ammo chooser, inventory validation and installation. Keep the exact original item.
          await item[method]();
          onStatus('Операция с боеприпасами завершена. Проверьте магазин и сообщения системы.');
          return { status: 'completed' };
        }
        if (request.action === 'weapon-attack') {
          if (!capability.canAttack) reject(capability.reason);
          type = request.mode;
        } else if (request.action === 'weapon-damage') {
          if (!capability.canDamage) reject('Для подавления нет отдельного броска урона.');
          type = 'damage';
        } else reject('Неизвестное действие оружия.');
      } else if (request.action === 'skill') { item = getItem('skill'); type = 'skill'; }
      else if (request.action === 'death-save') {
        if (Number(actor.system?.derivedStats?.hp?.value) > 0 || typeof actor.processDeathSave !== 'function') reject('Спасбросок смерти доступен при смертельном ранении.');
        type = 'deathsave';
      } else reject('Неизвестное действие.');
      const system = await getSystem();
      validate();
      let roll = item ? item.createRoll(type, actor, type === 'damage' ? { damageType: request.mode } : {}) : actor.createRoll(type);
      if (!roll?.handleRollDialog || !roll?.roll) reject('Система не предоставила нужный бросок.');
      if (type === 'damage' && request.mode === 'aimed') roll.location = actor.getFlag(SYSTEM_ID, 'aimedLocation') || 'head';
      // Like the official macro path: always show the modifier dialog, independently of invert-Ctrl preference.
      const proceed = await roll.handleRollDialog({ type: 'macro', ctrlKey: false, metaKey: false, shiftKey: false }, actor, item);
      if (!proceed) { onStatus('Бросок отменён.'); return { status: 'cancelled' }; }
      validate();
      if(type === 'deathsave' && Number(actor.system?.derivedStats?.hp?.value) > 0) reject('Персонаж уже не находится при смерти. Бросок отменён.');
      if (item) {
        if (getItem(type === 'skill' ? 'skill' : 'weapon') !== item) reject('Предмет изменился. Повторите бросок.');
        if(type !== 'skill' && !weaponCapabilities(actor,item,request.mode).modes.some(m=>m.id===request.mode)) reject('Режим оружия изменился. Повторите бросок.');
        if (request.action === 'weapon-attack') {
          const cap = weaponCapabilities(actor, item, request.mode);
          if (!cap.canAttack || (item.system?.isRanged && typeof item.hasAmmo === 'function' && !item.hasAmmo(roll))) reject(cap.reason || 'Боезапас изменился. Повторите бросок.');
        }
        if(request.action === 'weapon-attack' && item.system?.isRanged) {
          // CPR 0.92.4 confirmRoll fires dischargeItem without awaiting it. Await that public
          // operation directly, once, so a failed ammo write cannot publish a successful attack.
          if(typeof item.dischargeItem !== 'function') reject('Система не предоставила безопасный расход боезапаса.');
          await item.dischargeItem(roll);
          const ammoType=item.getInstalledItems?.('ammo')?.[0]?.system?.type;
          if(ammoType !== undefined){roll.rollCardExtraArgs ??= {};roll.rollCardExtraArgs.ammoType=ammoType;}
        } else roll = await item.confirmRoll(roll);
      }
      if (!roll?.roll) reject('Система отменила бросок.');
      await roll.roll();
      if (type === 'deathsave') roll.saveResult = actor.processDeathSave(roll);
      if (Number.isInteger(roll.luck) && roll.luck > 0) {
        const current = Number(actor.system.stats.luck.value);
        await actor.update({ 'system.stats.luck.value': Math.max(0, current - roll.luck) });
      }
      roll.entityData = { actor: actor.id, token: token?.id ?? null,
        tokens: Array.from(getContext().targets ?? []).filter(t => visibleTarget(t, getContext().user)).sort((a,b) => String(a.name).localeCompare(String(b.name))) };
      if (item) roll.entityData.item = item.id;
      const message = await system.renderRollCard(roll);
      if (type === 'aimed') await actor.setFlag(SYSTEM_ID, 'aimedLocation', roll.location);
      onStatus('Бросок отправлен в чат.');
      return { status: 'completed', summary:nativeResultSummary(roll,message,getContext().user,request.action) };
    } finally { busy = false; onBusy(false); }
  };
}
