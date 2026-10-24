import {displayedEncounter,sceneEncounter} from "./encounter.js";
const MODULE = "redline-combat";
export const MOVEMENT_MODES = {
  default: "По умолчанию", none: "Без движения", combat: "Боевое движение", free: "Свободное движение",
} as const;
export type MovementMode = keyof typeof MOVEMENT_MODES;

declare global {
  interface SettingConfig {
    "redline-combat.combatBar": boolean;
    "redline-combat.combatBarNameOnly": boolean;
    "redline-combat.combatBarSize": string;
    "redline-combat.combatBarDock": "bottom-left" | "top-right";
    "redline-combat.combatBarOrientation": "vertical" | "horizontal";
    "redline-combat.combatBarMinimized": boolean;
    "redline-combat.combatBarMovement": MovementMode;
    "redline-combat.combatBarDefaultMovement": MovementMode;
  }
}

export function validMode(value: unknown): MovementMode {
  return typeof value === "string" && Object.hasOwn(MOVEMENT_MODES, value) ? value as MovementMode : "default";
}

/** Follow the scene's active encounter, not whichever encounter a GM previews in the sidebar. */
export function barCombat(sceneId: string | null | undefined = canvas.scene?.id): Combat | undefined {
  return displayedEncounter(sceneId);
}

export function movementMode(): MovementMode {
  const mode = validMode(game.settings!.get(MODULE, "combatBarMovement"));
  // Combat Move has no restriction once all active encounters have ended.
  return mode === "combat" && !game.combats?.some(combat => combat.active && combat.started) ? "default" : mode;
}

export interface BarEntry {
  id: string;
  name: string;
  img: string;
  token?: Token;
  combatant?: Combatant;
  actor?: Actor;
  active: boolean;
  hidden: boolean;
  defeated: boolean;
}

export function barEntries(combat = barCombat()): BarEntry[] {
  const user = game.user;
  if (!user || !canvas.ready) return [];
  if (combat) return combat.turns.filter(combatant => combatant.visible && String((combatant.actor ?? combatant.token?.actor)?.type) !== "container").map(combatant => ({
    id: combatant.id!, name: combatant.name ?? combatant.actor?.name ?? "Участник",
    img: combatant.actor?.img || "icons/svg/mystery-man.svg",
    token: combatant.sceneId === canvas.scene?.id ? combatant.token?.object ?? undefined : undefined,
    combatant, active: combatant.id === combat.combatant?.id,
    hidden: combatant.hidden || !!combatant.token?.hidden, defeated: combatant.isDefeated,
  }));

  const actors = new Map<string, Actor>();
  const users = user.isGM ? Array.from(game.users?.values() ?? []).filter(player => player.active && !player.isGM) : [user];
  for (const player of users) {
    const actor = player.character;
    if (actor && String(actor.type) !== "container" && (user.isGM || actor.testUserPermission(user, "OBSERVER"))) actors.set(actor.id!, actor);
  }
  return [...actors.values()].map(actor => ({
    id: `actor:${actor.id}`, name: actor.name!, img: actor.img || "icons/svg/mystery-man.svg", actor,
    token: canvas.tokens?.placeables.find(token => token.actor?.id === actor.id && !token.isPreview && (user.isGM || !token.document.hidden && token.isVisible)),
    active: false, hidden: false, defeated: false,
  }));
}

export function canEndTurn(combat: Combat | undefined): boolean {
  if (!combat?.started || !game.user) return false;
  if (game.user.isGM) return true;
  return !!combat.combatant?.actor?.testUserPermission(game.user, "OWNER");
}

export function movementBlocked(doc: TokenDocument, changes: Record<string, unknown>, userId: string): boolean {
  if (game.users?.get(userId)?.isGM) return false;
  if (!["x", "y", "elevation"].some(key => key in changes && changes[key] !== foundry.utils.getProperty(doc._source, key))) return false;
  let combat:Combat|undefined;
  try{combat=sceneEncounter(doc.parent?.id);}catch(error){ui.notifications!.warn((error as Error).message);return true;}
  const mode = movementMode();
  if (mode === "none") return true;
  if (mode !== "combat") return false;
  // Compare token UUIDs, not actors: a second token of the same actor has a separate turn.
  return combat?.combatant?.token?.uuid !== doc.uuid;
}

export function registerBarMovement(refresh: () => void): void {
  const warnings = new Map<MovementMode,number>();
  game.settings!.register(MODULE, "combatBarMovement", {
    scope: "world", config: false, type: String, default: "default", onChange: refresh,
  });
  game.settings!.register(MODULE, "combatBarDefaultMovement", {
    name: "Панель боя: движение в новых боях",
    hint: "Режим движения игроков, который включается автоматически в начале нового боя.",
    scope: "world", config: true, type: String, choices: MOVEMENT_MODES, default: "default",
    onChange: refresh,
  });
  type StartOptions = {pneumaBarCombatStarted?: boolean};
  // Carry the transition through the native update; only a successful start changes the shared mode.
  Hooks.on("preUpdateCombat", (combat: Combat, changes: Record<string, unknown>, options: StartOptions) => {
    options.pneumaBarCombatStarted = !combat.started && Number(changes.round) > 0;
  });
  Hooks.on("updateCombat", (combat: Combat, _changes: unknown, options: StartOptions = {}) => {
    if (!options.pneumaBarCombatStarted || !combat.started) return;
    const gm = game.users?.find(user => user.active && user.isGM);
    if (gm?.id !== game.user?.id) return;
    void game.settings!.set(MODULE, "combatBarMovement", game.settings!.get(MODULE, "combatBarDefaultMovement"))
      .catch(error => ui.notifications!.error(String(error)));
  });
  Hooks.on("preUpdateToken", (doc: TokenDocument, changes: Record<string, unknown>, _options: unknown, userId: string) => {
    if (!movementBlocked(doc, changes, userId)) return;
    const mode = movementMode(), now = Date.now();
    if (now - (warnings.get(mode) ?? -Infinity) >= 5000) {
      warnings.set(mode,now);
      ui.notifications!.warn(mode === "none"
        ? "Мастер приостановил движение токенов." : "Боевое движение: дождитесь хода этого токена.");
    }
    return false;
  });
}
