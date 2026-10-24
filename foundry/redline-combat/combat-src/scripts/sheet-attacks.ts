import { attackFromHUD, attackEntries, thrownEntries, type AttackMode, type MenuWeapon } from "./attack-menu.js";
import { areaKind } from "./aoe/weapon.js";
import { registerNativeWrapper } from "./native-wrappers.js";
import { primaryGM } from "./shared.js";
import {installHazardAttackGuard} from "./hazard-attacks.js";

const MODULE = "redline-combat";
declare global { interface SettingConfig { "redline-combat.routeSheetAttacks": boolean; } }
interface AttackSheet {
  actor: Actor;
  token?: TokenDocument | null;
  _getFireCheckbox(event: JQuery.ClickEvent): string;
}
interface NativeSheetClass {
  prototype: object;
  _getItemId(event: JQuery.ClickEvent): string;
}
interface NativeUtils { GetEventDatum(event: JQuery.ClickEvent, key: string): string; }

/** An explicit token sheet never silently switches to another copy of the actor. */
export function sheetAttacker(sheet: AttackSheet): Token | undefined {
  const actor = sheet.actor;
  if (!actor.isOwner || ["container", "blackIce", "demon"].includes(String(actor.type)) || !canvas.tokens) return;
  const valid = (token: Token) => token.actor?.uuid === actor.uuid && token.can(game.user!, "control");
  const explicit = sheet.token ?? (actor.isToken ? actor.token : null);
  if (explicit) {
    const token = canvas.tokens.get(explicit.id!);
    return token?.document.uuid === explicit.uuid && valid(token) ? token : undefined;
  }
  const controlled = canvas.tokens.controlled.filter(valid);
  if (controlled.length) return controlled.length === 1 ? controlled[0] : undefined;
  const candidates = canvas.tokens.placeables.filter(valid);
  return candidates.length === 1 ? candidates[0] : undefined;
}

const installed = new WeakSet<object>();
export function installSheetAttackRouting(sheetClass: NativeSheetClass, utils: NativeUtils): void {
  if (installed.has(sheetClass.prototype)) return;
  registerNativeWrapper(sheetClass.prototype, "_onRoll", async function(this: AttackSheet, wrapped, event: JQuery.ClickEvent) {
    if (!game.settings!.get(MODULE, "routeSheetAttacks") || utils.GetEventDatum(event, "data-roll-type") !== "attack")
      return wrapped(event);
    const attacker = sheetAttacker(this);
    if (!attacker || !primaryGM()) return wrapped(event);
    const itemId = sheetClass._getItemId(event);
    const item = this.actor.items.get(itemId) as unknown as MenuWeapon | undefined;
    const mode = this._getFireCheckbox(event) as AttackMode;
    if (!item || !["attack", "aimed", "autofire", "suppressive"].includes(mode)) return wrapped(event);
    const items = Array.from(this.actor.items) as unknown as MenuWeapon[];
    const entry = [...attackEntries(items), ...thrownEntries(items).map(row => ({...row, autofire:false}))].find(row => row.id === itemId);
    if (!entry || (["autofire", "suppressive"].includes(mode) && !entry.autofire)) return wrapped(event);
    const targets = [...game.user!.targets];
    if (targets.length > 1) return wrapped(event);
    const target = targets[0];
    if (target && (target === attacker || !target.actor || ["container", "blackIce", "demon"].includes(String(target.actor.type)) || !target.isVisible || canvas.tokens?.get(target.id) !== target))
      return wrapped(event);
    if (!target && !areaKind(item, mode)) return wrapped(event);
    // The existing dispatcher owns ammo, rolls and placement. Never fall back after it starts.
    try { await attackFromHUD(attacker, target ?? attacker, itemId, mode, event); }
    catch (error) {
      console.error(MODULE + " | Character-sheet attack failed", error);
      ui.notifications!.error(error instanceof Error ? error.message : "Атака не удалась.");
    }
  }, "MIXED");
  installed.add(sheetClass.prototype);
}

export function registerSheetAttacks(): void {
  const module = game.modules?.get(MODULE) as unknown as {api?: Record<string, unknown>} | undefined;
  if (module) module.api = {...module.api, sceneAttack: {version: 2, async execute(attacker: Token, target: Token, itemId: string, options: {mode?: AttackMode; skipDialog?: boolean} = {}) {
    if (!game.user?.isGM) throw Error("Атаку устройства сцены может начать только Мастер.");
    if (!attacker.actor?.items.has(itemId) || !target.actor || attacker === target) throw Error("Выберите существующее оружие устройства и цель.");
    const mode = options.mode ?? "attack";
    if (!["attack", "aimed", "autofire", "suppressive"].includes(mode)) throw Error("Неподдерживаемый режим атаки сцены.");
    const message = await attackFromHUD(attacker, target, itemId, mode, {shiftKey: !!options.skipDialog} as JQuery.ClickEvent);
    return message ? {status: "started" as const, messageId: message.id!} : {status: "cancelled" as const};
  }}};
  game.settings!.register(MODULE, "routeSheetAttacks", {
    name: "Атаки из листа персонажа — через боевой модуль REDLINE",
    hint: "Поддерживаемые атаки из листа идут через REDLINE, если однозначно понятны токен и цель. Оружие по площади открывает размещение без цели. В остальных случаях — обычный бросок системы.",
    scope: "world", config: true, type: Boolean, default: false,
  });
  Hooks.once("ready", async () => {
    try {
      const sheetPath = "/systems/cyberpunk-red-core/modules/actor/sheet/cpr-actor-sheet.js";
      const utilsPath = "/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
      const [sheet, utils] = await Promise.all([import(sheetPath), import(utilsPath)]);
      installSheetAttackRouting(sheet.default as NativeSheetClass, utils.default as NativeUtils);
      await installHazardAttackGuard();
    } catch (error) {
      console.error(MODULE + " | Character-sheet attack routing unavailable", error);
      ui.notifications!.warn("Интеграция штатных атак недоступна. Проверьте консоль, прежде чем использовать атаки опасностей из листа.");
    }
  });
}
