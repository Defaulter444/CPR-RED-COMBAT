/** Public, read-only projection. Never returns raw Documents or enemy resources. */
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
export function projectActor(actor, token, user) {
  if (!ownsActor(actor, user)) return null;
  if (!["character", "mook"].includes(actor.type)) return null;
  const armor = [
    ["Голова · отслеживаемая броня", actor.system?.externalData?.currentArmorHead],
    ["Тело · отслеживаемая броня", actor.system?.externalData?.currentArmorBody],
  ].flatMap(([name, value]) => number(value?.value) === null ? [] : [{ name, sp: value.value }]);
  const equipped = actor.system?.weapons?.equipped;
  const weapons = equipped && typeof equipped[Symbol.iterator] === "function"
    ? Array.from(equipped) : Array.from(actor.items ?? []).filter(item =>
      item.type === "weapon" && item.system?.equipped === "equipped");
  return {
    id: actor.id,
    name: token?.name ?? actor.name ?? "Персонаж",
    img: token?.texture?.src ?? actor.img ?? "",
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
      return { id: item.id, name: item.name ?? "Оружие", ammo };
    }),
    canOpenSheet: Boolean(actor.sheet),
  };
}

export function projectHUD({ user, system, generation, combat, controlled = [], targets = [], selectedCombatantId = null, pending = false }) {
  const supported = system?.id === SYSTEM_ID && Number(generation) === 12;
  const rows = Array.from(combat?.turns ?? combat?.combatants ?? []);
  const visibleRows = rows.filter(row => visibleCombatant(row, user));
  const { token, actor } = resolveSubject({ user, combat, controlled, selectedCombatantId });
  const selected = supported ? projectActor(actor, token, user) : null;
  const current = combat?.combatant?.id;
  return {
    supported,
    systemName: system?.title ?? system?.id ?? "Неизвестная система",
    selected,
    combat: {
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
      id: target.document.id, name: target.document.name ?? "Цель",
    })),
    error: supported ? null : "HUD предназначен для Foundry v12 и Cyberpunk RED. Откройте демо интерфейса для просмотра.",
  };
}
