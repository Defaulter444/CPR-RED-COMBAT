import { allActors, escapeHTML as escape } from "./shared.js";
import {registerNativeWrapper} from "./native-wrappers.js";
import {gunAmmo} from "./weapon-ammo.js";
import type {EquipmentItem} from "./weapon-data.js";
import {actorEncounter} from "./encounter.js";

declare global { interface SettingConfig { "redline-combat.reportWeaponReloads": boolean; } }
function shouldReport(item: AmmoWeapon): boolean {
  if (!item.actor?.hasPlayerOwner || !game.settings!.get("redline-combat", "reportWeaponReloads")) return false;
  try { return !!actorEncounter(item.actor); } catch { return false; }
}

interface AmmoWeapon extends Item {
  reload(...args: unknown[]): Promise<unknown>;
  load(...args: unknown[]): Promise<unknown>;
  getInstalledItems(type: string): Item[];
}
const active = new WeakSet<AmmoWeapon>();
const observers = new WeakSet<Function>();


/** CPR recreates these instance methods in loadMixins on every item preparation. */
export function observeWeaponAmmo(item: AmmoWeapon): void {
  if (!gunAmmo(item as unknown as EquipmentItem)) return;
  for (const method of ["reload", "load"] as const) {
    const native = item[method];
    if (typeof native !== "function" || observers.has(native)) continue;
    const observed = async function(this: AmmoWeapon, ...args: unknown[]) {
      if (!this.actor || active.has(this)) return native.apply(this, args);
      const beforeAmmo = this.getInstalledItems("ammo")[0]?.id;
      const beforeRounds = gunAmmo(this as unknown as EquipmentItem)!.rounds;
      const player = this.actor.name ?? "Персонаж";
      const report = shouldReport(this);
      active.add(this);
      try {
        const result = await native.apply(this, args);
        const afterAmmo = this.getInstalledItems("ammo")[0]?.id;
        const afterRounds = gunAmmo(this as unknown as EquipmentItem)?.rounds ?? 0;
        const action = beforeAmmo !== afterAmmo ? "change" : afterRounds > beforeRounds ? "reload" : undefined;
        if (action && report && shouldReport(this)) {
          try {
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor:this.actor}),
              content:`<p class="pneuma-ammo-notice" data-ammo-action="${action}">${escape(player)} ${action==='reload'?'перезаряжает':'меняет боеприпасы в'} ${escape(this.name ?? "оружии")}</p>`});
          } catch (error) {
            console.error("redline-combat | Ammunition chat message failed", error);
            ui.notifications!.warn("Боеприпасы заменены, но сообщение в чат отправить не удалось.");
          }
        }
        return result;
      } finally { active.delete(this); }
    };
    observers.add(observed);
    item[method] = observed;
  }
}

export function registerAmmoChat(): void {
  game.settings!.register("redline-combat", "reportWeaponReloads", {
    name: "Сообщать о перезарядке оружия игроков",
    hint: "Во время боя сообщает в чат о перезарядке и смене боеприпасов у персонажей игроков, в том числе если действие выполнил Мастер. Луки не учитываются.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  Hooks.once("ready", () => {
    registerNativeWrapper(CONFIG.Item.documentClass.prototype, "loadMixins", function(wrapped, ...args) {
      const result = wrapped(...args);
      observeWeaponAmmo(this);
      return result;
    }, "WRAPPER");
    // Include existing linked actors and unlinked token actors on every scene.
    for (const actor of allActors()) for (const item of actor.items) observeWeaponAmmo(item as AmmoWeapon);
  });
}
