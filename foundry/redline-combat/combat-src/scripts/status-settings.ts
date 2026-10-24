import { primaryGM as electedGM } from "./shared.js";
import { masterStatuses, type StatusDefinition } from "./status-catalog.js";
import { groupStatusHUD } from "./status-hud.js";
import { registerStatusSync } from "./status-sync.js";
const MODULE = "redline-combat";
export interface CustomStatus { id: string; name: string; img: string }
declare global { interface SettingConfig { "redline-combat.customStatuses": CustomStatus[] | null } }
const jail: CustomStatus = { id: "pneuma-in-jail", name: "In Jail", img: "modules/redline-combat/combat/styles/in-jail.svg" };
export function validateCustomStatuses(rows: CustomStatus[]): CustomStatus[] {
  const ids = new Set(masterStatuses.map(status => status.id));
  const names = new Set(masterStatuses.map(status => status.name.toLowerCase()));
  return rows.map(row => {
    const name = String(row.name ?? "").trim(), img = String(row.img ?? "").trim();
    const id = String(row.id ?? "");
    if (!id || ids.has(id)) throw new Error("ID своих состояний должны быть уникальными.");
    if (!name || name.length > 80 || names.has(name.toLowerCase())) throw new Error("Введите уникальное название состояния (до 80 символов).");
    if (!img || /^(javascript|data):/i.test(img)) throw new Error("Укажите корректный путь к значку.");
    ids.add(id); names.add(name.toLowerCase());
    return { id, name, img };
  });
}
function legacyMap(): CustomStatus[] {
  try {
    // Settings remain available after disabling the old module.
    const entry = game.settings!.storage.get("world")?.get("condition-lab-triggler.activeConditionMap");
    const value = entry?.value;
    const rows = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(rows) ? rows.map(row => ({ id: row.id, name: row.name, img: row.img ?? row.icon })) : [];
  } catch { return []; }
}
export function customStatuses(): CustomStatus[] {
  const saved = game.settings!.get(MODULE, "customStatuses");
  if (saved !== null) return saved;
  const known = new Set(masterStatuses.map(status => status.id));
  const imported = legacyMap().filter(row => row.id && row.name && row.img && !known.has(row.id)
    && !masterStatuses.some(status => status.name.toLowerCase() === row.name.toLowerCase()));
  if (!imported.some(row => row.name.toLowerCase() === "in jail")) imported.push(jail);
  return imported;
}
export function configuredStatuses(): StatusDefinition[] {
  return [...masterStatuses, ...customStatuses().map(status => ({ ...status, group: "custom" as const }))];
}
export function installStatusList(): void {
  CONFIG.statusEffects = configuredStatuses().map(status => ({ id: status.id, name: status.name, img: status.img }));
  canvas.tokens?.hud?.render();
}
class CustomStatusForm extends FormApplication {
  constructor() { super({}); }
  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pneuma-custom-statuses", title: "Свои состояния Cyberpunk", width: 620,
      template: "modules/" + MODULE + "/combat/templates/custom-statuses.hbs", closeOnSubmit: true,
    });
  }
  override getData() { return { rows: customStatuses() }; }
  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find("[data-add-status]").on("click", () => {
      const row = document.createElement("div"); row.className = "pneuma-custom-status-row";
      row.dataset.statusId = "pneuma-custom-" + foundry.utils.randomID();
      row.innerHTML = '<label>Название<input class="status-name" aria-label="Название состояния" placeholder="Название" required></label><label>Путь к значку<input class="status-img" aria-label="Путь к значку" placeholder="Путь к значку" required></label><button type="button" data-pick-icon title="Выбрать значок"><i class="fas fa-image"></i></button><button type="button" data-remove-status title="Удалить"><i class="fas fa-trash"></i></button>';
      html.find(".pneuma-custom-status-rows").append(row);
    });
    html.on("click", "[data-remove-status]", event => { event.currentTarget.closest(".pneuma-custom-status-row")?.remove(); });
    html.on("click", "[data-pick-icon]", event => {
      const input = (event.currentTarget as HTMLElement).closest(".pneuma-custom-status-row")!.querySelector<HTMLInputElement>(".status-img")!;
      new FilePicker({ type: "image", current: input.value, callback: path => { input.value = path; } }).render(true);
    });
  }
  protected override async _updateObject() {
    if (!game.user?.isGM) return;
    const rows = Array.from(this.element[0]!.querySelectorAll<HTMLElement>(".pneuma-custom-status-row")).map(row => ({
      id: row.dataset.statusId!, name: row.querySelector<HTMLInputElement>(".status-name")!.value,
      img: row.querySelector<HTMLInputElement>(".status-img")!.value,
    }));
    try { await game.settings!.set(MODULE, "customStatuses", validateCustomStatuses(rows)); }
    catch (error) { ui.notifications!.error((error as Error).message); throw error; }
  }
}
export function registerCyberpunkStatuses(): void {
  game.settings!.register(MODULE, "customStatuses", { scope: "world", config: false, type: Array, default: null, onChange: installStatusList });
  game.settings!.registerMenu(MODULE, "customStatusesMenu", {
    name: "Свои состояния Cyberpunk", label: "Изменить свои состояния", hint: "Добавить названия и значки в список состояний Cyberpunk. Включает «В тюрьме».",
    icon: "fas fa-list", type: CustomStatusForm, restricted: true,
  });
  Hooks.once("ready", async () => {
    const gm = electedGM();
    if (gm?.id === game.user?.id && game.settings!.get(MODULE, "customStatuses") === null)
      await game.settings!.set(MODULE, "customStatuses", customStatuses());
    installStatusList();
    if (game.user?.isGM && game.modules.get("condition-lab-triggler")?.active)
      ui.notifications!.warn("Состояния Cyberpunk теперь задаёт REDLINE. Выключите Condition Lab & Triggler, чтобы списки состояний не конфликтовали. Свои записи сохранены.");
  });
  Hooks.on("renderTokenHUD", (_hud: TokenHUD, html: JQuery) => { if (html[0]) groupStatusHUD(html[0], configuredStatuses()); });
  registerStatusSync();
}
