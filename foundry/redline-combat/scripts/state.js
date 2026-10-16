/** Public, read-only projection. Never returns raw Documents or enemy resources. */
import { equippedWeapons, subjectKey, weaponCapabilities, QUICK_SKILLS } from './capabilities.js';
export const MODULE_ID = "redline-combat";
export const SYSTEM_ID = "cyberpunk-red-core";

export function ownsActor(actor, user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  return typeof actor.testUserPermission === "function" && actor.testUserPermission(user, "OWNER");
}

export function visibleCombatant(combatant, user) {
  return Boolean(combatant && user && (user.isGM ||
    (combatant.visible === true && !combatant.hidden && !combatant.token?.hidden)));
}

export function visibleTarget(token, user) {
  return Boolean(token?.document && user && (user.isGM ||
    (token.isVisible === true && !token.document.hidden)));
}

/** Private subject for actions; resolve again instead of trusting a rendered ID. */
export function resolveSubject({ user, combat, controlled = [], selectedCombatantId = null }) {
  const rows = Array.from(combat?.turns ?? combat?.combatants ?? []);
  const requested = rows.find(row => row.id === selectedCombatantId &&
    visibleCombatant(row, user) && ownsActor(row.actor, user));
  const owned = controlled.filter(token => visibleTarget(token, user) && ownsActor(token.actor, user));
  return {
    token: requested?.token ?? owned.at(-1)?.document ?? null,
    actor: requested?.actor ?? owned.at(-1)?.actor ?? (ownsActor(user?.character, user) ? user.character : null),
  };
}

function sameToken(a, b) {
  if (!a || !b) return false;
  if (a.uuid && b.uuid) return a.uuid === b.uuid;
  return a.id === b.id && a.parent?.id === b.parent?.id;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function resource(value) {
  if (!value || number(value.value) === null) return null;
  return { value: number(value.value), max: number(value.max) };
}
export function projectActor(actor, token, user, options = {}) {
  if (!ownsActor(actor, user)) return null;
  if (!["character", "mook"].includes(actor.type)) return null;
  const armor = [
    ["Голова · отслеживаемая броня", actor.system?.externalData?.currentArmorHead],
    ["Тело · отслеживаемая броня", actor.system?.externalData?.currentArmorBody],
  ].flatMap(([name, value]) => number(value?.value) === null ? [] : [{ name, sp: value.value }]);
  const weapons = equippedWeapons(actor);
  const key = subjectKey(actor, token);
  const skillItems = Array.from(actor.items ?? []).filter(item => item.type === 'skill' && typeof item.createRoll === 'function');
  return {
    id: actor.id,
    key, revision: options.revision ?? 0, busy: Boolean(options.actionBusy), status: options.actionStatus || '',
    selectedSkillId: options.selectedSkill?.(key) || '',
    selectedWeaponId: options.selectedWeapon?.(key) || '',
    // Match the character sheet's sections and localized-name ordering without
    // sharing configuration objects or changing any owned Item data.
    skillCategories: (Array.isArray(options.skillCategories) ? options.skillCategories : [])
      .filter(category => category && typeof category.id === 'string' && typeof category.label === 'string')
      .map(({ id, label }) => ({ id, label })),
    skills: skillItems.map(item => ({
      id: item.id,
      name: options.localizeSkill?.(item.name) || item.name,
      category: typeof item.system?.category === 'string' ? item.system.category : '',
      difficult: item.system?.difficulty === 'difficult',
    })).sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0),
    quickSkills: Object.entries(QUICK_SKILLS).flatMap(([name,label]) => {
      const item = skillItems.find(skill => skill.name === name);
      return item ? [{id:item.id,name:label}] : [];
    }),
    canDeathSave: typeof actor.processDeathSave === 'function' && Number(actor.system?.derivedStats?.hp?.value) <= 0,
    name: token?.name ?? actor.name ?? "Персонаж",
    img: actor.img || token?.texture?.src || "",
    hp: resource(actor.system?.derivedStats?.hp),
    armor,
    weapons: weapons.map(item => {
      const ammo = resource(item.system?.magazine);
      if (ammo && typeof item.getMagazineSpace === "function") {
        try {
          const space = number(item.getMagazineSpace());
          if (space !== null) ammo.max = ammo.value + space;
        } catch { /* Unknown capacity keeps the available base value. */ }
      }
      return { id: item.id, name: item.name ?? "Оружие", img: item.img || '', ammo: item.system?.isRanged ? ammo : null,
        ...weaponCapabilities(actor,item,options.weaponMode?.(key,item) ?? actor.getFlag?.(SYSTEM_ID,`firetype-${item.id}`)) };
    }),
    canOpenSheet: Boolean(actor.sheet),
  };
}

export function projectHUD({ user, system, generation, combat, controlled = [], targets = [], selectedCombatantId = null, pending = false, ...options }) {
  const supported = system?.id === SYSTEM_ID && Number(generation) === 12;
  const rows = Array.from(combat?.turns ?? combat?.combatants ?? []);
  const visibleRows = rows.filter(row => visibleCombatant(row, user));
  const { token, actor } = resolveSubject({ user, combat, controlled, selectedCombatantId });
  const selected = supported ? projectActor(actor, token, user, options) : null;
  if (selected) selected.canInitiative = typeof combat?.rollInitiative === 'function' && rows.some(row => visibleCombatant(row,user) && ownsActor(row.actor,user) && (token ? sameToken(row.token,token) : row.actor === actor));
  const current = combat?.combatant?.id;
  return {
    supported,
    systemName: system?.title ?? system?.id ?? "Неизвестная система",
    selected,
    combat: {
      started: Boolean(combat?.started),
      round: number(combat?.round),
      turn: visibleRows.some(row => row.id === current) ? visibleRows.findIndex(row => row.id === current) : null,
      // A hidden turn's identifier/name is never included in the player DTO.
      combatants: visibleRows.map(row => ({
        id: row.id, name: row.name ?? row.token?.name ?? "Участник",
        img: row.img ?? row.token?.texture?.src ?? "",
        initiative: number(row.initiative), current: row.id === current,
        selected: Boolean(actor && (token ? sameToken(row.token, token) : row.actor === actor)),
        defeated: Boolean(row.defeated), selectable: supported && ownsActor(row.actor, user),
      })),
      canAdvance: Boolean(supported && user?.isGM && combat?.started && rows.length && !pending),
      pending,
    },
    targets: targets.filter(target => visibleTarget(target, user)).map(target => ({
      id: target.document.id, name: target.document.name ?? "Цель", img: target.document.texture?.src || '',
    })),
    error: supported ? null : "HUD предназначен для Foundry v12 и Cyberpunk RED.",
  };
}
