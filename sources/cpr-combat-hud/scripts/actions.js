/**
 * Action layer of the Combat HUD.
 *
 * Every roll goes through the exact same pipeline the system's own actor
 * sheet uses:
 *   createRoll -> handleRollDialog -> item.confirmRoll -> roll()
 *   -> death save / luck post-processing -> CPRChat.RenderRollCard
 */
import CPRChat from "../../../systems/cyberpunk-red-core/modules/chat/cpr-chat.js";
import CPRSystemUtils from "../../../systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
import * as CPRRolls from "../../../systems/cyberpunk-red-core/modules/rolls/cpr-rolls.js";
import { SYSTEM_ID, FIRE_MODES, EQUIP_CYCLE } from "./constants.js";
import { resolveAttackTarget } from "./targeting.js";

/**
 * Some HUD actions are not triggered by a real mouse event (or we do not
 * want to forward the original). This produces the minimal shape
 * CPRRoll#handleRollDialog inspects.
 */
function toRollEvent(event) {
  return {
    type: "click",
    ctrlKey: event?.ctrlKey ?? false,
    metaKey: event?.metaKey ?? false,
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Shared tail of every roll: dialog, ammo consumption, rolling, death save
 * bookkeeping, luck consumption and the chat card.
 *
 * @param {Event} event    - originating UI event (for ctrl-skip of the dialog)
 * @param {Actor} actor    - the actor rolling
 * @param {Item|null} item - the item involved (weapon, skill, role, deck) or null
 * @param {Object} cprRoll - a CPRRoll instance produced by createRoll
 * @param {TokenDocument|null} tokenDoc - token of the actor, if any
 */
export async function executeCprRoll(event, actor, item, cprRoll, tokenDoc) {
  if (!cprRoll) return;

  const keepRolling = await cprRoll.handleRollDialog(
    toRollEvent(event),
    actor,
    item
  );
  if (!keepRolling) return;

  if (item) {
    // Actions that are part of a roll, e.g. ammo decrementing.
    cprRoll = await item.confirmRoll(cprRoll);
    if (!cprRoll) return;
  }

  await cprRoll.roll();

  if (cprRoll instanceof CPRRolls.CPRDeathSaveRoll) {
    cprRoll.saveResult = actor.processDeathSave(cprRoll);
  }

  // "Consume" LUCK if the player put some into the roll.
  if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
    const luckStat = actor.system.stats.luck.value;
    await actor.update({
      "system.stats.luck.value":
        luckStat - (cprRoll.luck > luckStat ? luckStat : cprRoll.luck),
    });
  }

  const targetedTokens = CPRSystemUtils.getUserTargetedOrSelected("targeted");
  cprRoll.entityData = {
    actor: actor.id,
    token: tokenDoc?.id ?? null,
    tokens: targetedTokens,
  };
  if (item) {
    cprRoll.entityData.item = item.id;
  }

  CPRChat.RenderRollCard(cprRoll);
}

/* -------------------------------------------- */
/*  Fire modes                                  */
/* -------------------------------------------- */

export function getFireMode(actor, itemId) {
  return actor.getFlag(SYSTEM_ID, `firetype-${itemId}`) || FIRE_MODES.ATTACK;
}

export async function toggleFireMode(actor, itemId, mode) {
  const current = actor.getFlag(SYSTEM_ID, `firetype-${itemId}`);
  if (current === mode) {
    await actor.unsetFlag(SYSTEM_ID, `firetype-${itemId}`);
  } else {
    await actor.setFlag(SYSTEM_ID, `firetype-${itemId}`, mode);
  }
}

export async function setAimedLocation(actor, location) {
  await actor.setFlag(SYSTEM_ID, "aimedLocation", location);
}

/* -------------------------------------------- */
/*  Rolls                                       */
/* -------------------------------------------- */

export async function rollStat(event, actor, statName, tokenDoc) {
  const cprRoll = actor.createRoll(CPRRolls.rollTypes.STAT, statName);
  await executeCprRoll(event, actor, null, cprRoll, tokenDoc);
}

export async function rollSkill(event, actor, skillId, tokenDoc) {
  const skill = actor.getOwnedItem(skillId);
  if (!skill) return;
  const cprRoll = skill.createRoll(CPRRolls.rollTypes.SKILL, actor);
  await executeCprRoll(event, actor, skill, cprRoll, tokenDoc);
}

export async function rollAttack(event, actor, weaponId, tokenDoc) {
  const weapon = actor.getOwnedItem(weaponId);
  if (!weapon) return;
  // Optionally let the player pick a target first; abort if they cancel.
  const proceed = await resolveAttackTarget();
  if (!proceed) return;
  const fireMode = getFireMode(actor, weaponId);
  const cprRoll = weapon.createRoll(fireMode, actor);
  // Carry the chosen aimed-shot location into the confirm dialog (the system's
  // CPRAimedAttackRoll otherwise hard-defaults to "head").
  if (fireMode === FIRE_MODES.AIMED) {
    cprRoll.location = actor.getFlag(SYSTEM_ID, "aimedLocation") || "head";
  }
  await executeCprRoll(event, actor, weapon, cprRoll, tokenDoc);
}

export async function rollWeaponDamage(event, actor, weaponId, tokenDoc) {
  const weapon = actor.getOwnedItem(weaponId);
  if (!weapon) return;
  const damageType = getFireMode(actor, weaponId);
  const cprRoll = weapon.createRoll(CPRRolls.rollTypes.DAMAGE, actor, {
    damageType,
  });
  if (damageType === FIRE_MODES.AIMED) {
    cprRoll.location = actor.getFlag(SYSTEM_ID, "aimedLocation") || "body";
  }
  await executeCprRoll(event, actor, weapon, cprRoll, tokenDoc);
}

export async function rollDeathSave(event, actor, tokenDoc) {
  const cprRoll = actor.createRoll(CPRRolls.rollTypes.DEATHSAVE);
  await executeCprRoll(event, actor, null, cprRoll, tokenDoc);
}

export async function rollFacedown(event, actor, tokenDoc) {
  const cprRoll = actor.createRoll(CPRRolls.rollTypes.FACEDOWN);
  await executeCprRoll(event, actor, null, cprRoll, tokenDoc);
}

export async function rollRoleAbility(
  event,
  actor,
  roleId,
  subRoleName,
  rollSubType,
  tokenDoc
) {
  const role = actor.getOwnedItem(roleId);
  if (!role) return;
  const cprRoll = role.createRoll(CPRRolls.rollTypes.ROLEABILITY, actor, {
    rollSubType,
    subRoleName,
  });
  await executeCprRoll(event, actor, role, cprRoll, tokenDoc);
}

export async function rollInterfaceAbility(event, actor, ability, tokenDoc) {
  const cyberdeck = actor.itemTypes.cyberdeck.find(
    (deck) => deck.system.equipped === "equipped"
  );
  const netRoleItem = actor.itemTypes.role.find(
    (r) => r.id === actor.system.roleInfo.activeNetRole
  );
  if (!cyberdeck || !netRoleItem) {
    ui.notifications.warn(game.i18n.localize("CPR-CHUD.warn.noNetGear"));
    return;
  }
  const cprRoll = cyberdeck.createRoll(
    CPRRolls.rollTypes.INTERFACEABILITY,
    actor,
    { interfaceAbility: ability, cyberdeck, netRoleItem }
  );
  await executeCprRoll(event, actor, cyberdeck, cprRoll, tokenDoc);
}

/* -------------------------------------------- */
/*  Combat                                      */
/* -------------------------------------------- */

export async function rollInitiative(actor, tokenDoc) {
  if (!game.combat) {
    ui.notifications.warn(game.i18n.localize("CPR-CHUD.warn.noCombat"));
    return;
  }
  const combatant = game.combat.combatants.find(
    (c) => c.tokenId === tokenDoc?.id || (!tokenDoc && c.actorId === actor.id)
  );
  if (combatant) {
    await game.combat.rollInitiative([combatant.id]);
  } else {
    await actor.rollInitiative({ createCombatants: true });
  }
}

export async function endTurn(tokenDoc) {
  if (game.combat?.current?.tokenId === tokenDoc?.id) {
    await game.combat.nextTurn();
  } else {
    ui.notifications.warn(game.i18n.localize("CPR-CHUD.warn.notYourTurn"));
  }
}

/* -------------------------------------------- */
/*  Resource management                         */
/* -------------------------------------------- */

export async function adjustHp(actor, delta) {
  const hp = actor.system.derivedStats.hp;
  const value = clampNumber(hp.value + delta, 0, hp.max);
  await actor.update({ "system.derivedStats.hp.value": value });
}

export async function setHp(actor, value) {
  const hp = actor.system.derivedStats.hp;
  const clamped = clampNumber(Math.round(value), 0, hp.max);
  if (!Number.isFinite(clamped)) return;
  await actor.update({ "system.derivedStats.hp.value": clamped });
}

export async function adjustLuck(actor, delta) {
  const luck = actor.system.stats.luck;
  const value = clampNumber(luck.value + delta, 0, luck.max);
  await actor.update({ "system.stats.luck.value": value });
}

/**
 * Ablate (delta < 0) or repair (delta > 0) the armor at a location.
 * Prefers the armor tracked on the sheet (externalData), falls back to the
 * first equipped armor for that location. Keeps the tracked values in sync
 * via the system's own updateTrackedArmor.
 */
export async function adjustArmor(actor, location, delta) {
  const locationKey = location.charAt(0).toUpperCase() + location.slice(1);
  const trackedId = actor.system.externalData[`currentArmor${locationKey}`].id;
  let armor = trackedId ? actor.getOwnedItem(trackedId) : null;
  if (!armor || armor.system.equipped !== "equipped") {
    [armor] = actor.getEquippedArmors(location);
  }
  if (!armor) return;

  if (location === "shield") {
    const shp = armor.system.shieldHitPoints;
    const value = clampNumber(shp.value + delta, 0, shp.max);
    await armor.update({ "system.shieldHitPoints.value": value });
  } else {
    const dataKey = `${location}Location`;
    const sp = armor.system[dataKey].sp;
    const ablation = clampNumber(
      armor.system[dataKey].ablation - delta,
      0,
      sp
    );
    await armor.update({ [`system.${dataKey}.ablation`]: ablation });
  }
  await actor.updateTrackedArmor(location, armor.id);
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

export async function reloadWeapon(actor, weaponId) {
  const weapon = actor.getOwnedItem(weaponId);
  if (weapon?.reload) await weapon.reload();
}

export async function changeAmmo(actor, weaponId) {
  const weapon = actor.getOwnedItem(weaponId);
  if (weapon?.load) await weapon.load();
}

/**
 * Cycle owned -> carried -> equipped -> owned, mirroring the rules checks of
 * the system sheet: warn when the actor lacks free hands, refuse a second
 * equipped cyberdeck.
 */
export async function cycleEquipState(actor, itemId) {
  const item = actor.getOwnedItem(itemId);
  if (!item || item.type === "cyberware") return;

  const index = EQUIP_CYCLE.indexOf(item.system.equipped);
  let next = EQUIP_CYCLE[(index + 1) % EQUIP_CYCLE.length];

  if (next === "equipped") {
    if (item.type === "weapon" && !actor.canHoldWeapon(item)) {
      ui.notifications.warn(
        CPRSystemUtils.Localize("CPR.messages.warningTooManyHands")
      );
    }
    if (
      item.type === "cyberdeck" &&
      actor.itemTypes.cyberdeck.some(
        (deck) => deck.id !== item.id && deck.system.equipped === "equipped"
      )
    ) {
      ui.notifications.error(
        CPRSystemUtils.Localize("CPR.messages.errorTooManyCyberdecks")
      );
      next = "owned";
    }
  }

  await item.update({ "system.equipped": next });
}

export async function resetDeathPenalty(actor) {
  await actor.resetDeathPenalty();
}
