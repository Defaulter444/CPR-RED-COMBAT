import {displayedEncounter} from "./encounter.js";
import {nativeDVIds} from "./native-lookup.js";
import { distanceWithElevation, equippedRanges, parseDV, dvTone, type RangeItem } from "./dv-data.js";

declare global {
  interface SettingConfig {
    "cyberpunk-red-core.dvRollTableCompendium": string;
    "redline-combat.hoverDV": boolean;
    "redline-combat.hoverAutofire": boolean;
    "redline-combat.hoverDVEncounterOnly": boolean;
  }
}

const MODULE_ID = "redline-combat";
let hovered: Token | undefined;
let panel: HTMLDivElement | undefined;
let revision = 0;
let shown = "";
const tableCache = new Map<string, Promise<RollTable | undefined>>();

function clear() {
  revision++;
  panel?.remove();
  panel = undefined;
  shown = "";
}

function attacker() {
  const controlled = canvas.tokens?.controlled ?? [];
  return controlled.length === 1 && controlled[0]?.actor?.isOwner && !["container", "blackIce", "demon"].includes(String(controlled[0].actor.type)) ? controlled[0] : undefined;
}

export async function getTable(name: string): Promise<RollTable | undefined> {
  const world = game.tables?.getName(name);
  if (world) return world;
  const configured = game.settings!.get("cyberpunk-red-core", "dvRollTableCompendium") as unknown;
  const pack = (typeof configured === "string" ? game.packs!.get(configured) : undefined)
    ?? game.packs!.get("cyberpunk-red-core.internal_dv-tables");
  if (!pack || pack.documentName !== "RollTable") return;
  const key = `${pack.collection}:${String(configured)}:${name}`;
  let pending = tableCache.get(key);
  if (!pending) {
    pending = (async () => {
      const index = await pack.getIndex();
      const nativeId = pack.collection === "cyberpunk-red-core.internal_dv-tables" ? nativeDVIds[name] : undefined;
      const entry = (nativeId ? index.find(entry => entry._id === nativeId) : undefined) ?? index.find(entry => entry.name === name);
      return entry ? await pack.getDocument(entry._id) as RollTable | undefined : undefined;
    })();
    tableCache.set(key,pending);
    void pending.catch(() => {if(tableCache.get(key) === pending)tableCache.delete(key);});
  }
  return pending;
}

function position() {
  if (!panel || !hovered || !canvas.stage || !canvas.app) return;
  // Convert canvas coordinates to CSS pixels; the panel remains readable while zooming.
  const view = canvas.app.view as HTMLCanvasElement;
  const bounds = view.getBoundingClientRect();
  const point = canvas.stage.toGlobal(new PIXI.Point(hovered.x + hovered.w, hovered.y));
  const x = bounds.left + point.x * bounds.width / canvas.app.screen.width;
  const y = bounds.top + point.y * bounds.height / canvas.app.screen.height;
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  panel.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - width - 8))}px`;
  panel.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
}

function encounterAllowsHover(): boolean {
  return !game.settings!.get(MODULE_ID, "hoverDVEncounterOnly") || !!displayedEncounter();
}

async function refresh() {
  const current = ++revision;
  const target = hovered;
  const source = attacker();
  if (!encounterAllowsHover() || !game.settings!.get(MODULE_ID, "hoverDV") || !target?.isVisible || ["container", "blackIce", "demon"].includes(String(target.actor?.type)) || target.isPreview ||
    !source || source === target || canvas.activeLayer !== canvas.tokens) {clear();return;}
  const distance = distanceWithElevation(canvas.grid!.measurePath([source.center, target.center], {}).distance,
    source.document.elevation, target.document.elevation);
  const weapons = equippedRanges(Array.from(source.actor!.items) as unknown as RangeItem[],
    game.settings!.get(MODULE_ID, "hoverAutofire"));
  const tables = new Map<string, Promise<RollTable | undefined>>();
  const lines = await Promise.all(weapons.map(async weapon => {
    try {
      if (!tables.has(weapon.table)) tables.set(weapon.table, getTable(weapon.table));
      const table = await tables.get(weapon.table);
      const dv = parseDV(table?.getResultsForRoll(distance)[0]?.text);
      if (dv === undefined) return;
      const suffix = weapon.autofire ? ` (${game.i18n!.localize("CPR.global.itemType.skill.autofire")})` : "";
      return { dv, name: `${weapon.name}${suffix}` };
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not read DV table ${weapon.table}`, error);
      return;
    }
  }));
  // Async compendium reads must not resurrect a tooltip after hover/selection changes.
  if (revision !== current || hovered !== target || attacker() !== source || !target.isVisible || !encounterAllowsHover()) return;
  const visible = lines.filter((line): line is { dv: number; name: string } => !!line);
  if (!visible.length) {clear();return;}
  const signature = JSON.stringify(visible);
  if (panel && shown === signature) {position();return;}
  shown = signature;
  if (!panel) panel = document.createElement("div");
  panel.replaceChildren();
  panel.className = "pneuma-panel pneuma-dv-hover";
  panel.setAttribute("role", "tooltip");
  for (const line of visible) {
    const row = document.createElement("div");
    const value = document.createElement("span");
    value.className = `pneuma-dv-value pneuma-dv-${dvTone(line.dv)}`;
    value.textContent = `DV${line.dv}`;
    row.append(value, document.createTextNode(` ${line.name}`));
    panel.append(row);
  }
  if (!panel.parentElement) document.body.append(panel);
  position();
}

export function registerHoverDV() {
  for (const [key, defaultValue] of [["hoverDV", true], ["hoverAutofire", false], ["hoverDVEncounterOnly", true]] as const) {
    game.settings!.register(MODULE_ID, key, {
      name: `PNEUMA_COMBAT_TOOLS.${key}Name`, hint: `PNEUMA_COMBAT_TOOLS.${key}Hint`,
      scope: "client", config: true, type: Boolean, default: defaultValue,
      onChange: () => { void refresh(); },
    });
  }
  Hooks.on("hoverToken", (token: Token, entered: boolean) => {
    if (entered) {if(hovered !== token) clear(); hovered = token;}
    else if (hovered === token) hovered = undefined;
    else return;
    void refresh();
  });
  for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady"]) Hooks.on(hook, () => { void refresh(); });
  Hooks.on("controlToken", () => { void refresh(); });
  Hooks.on("canvasPan", position);
  Hooks.on("refreshToken", (token: Token) => {
    if (token === hovered) {
      if (!token.isVisible) { hovered = undefined; clear(); }
      else position();
    }
  });
  Hooks.on("updateToken", (document: TokenDocument) => {
    if (document === hovered?.document || document === attacker()?.document) void refresh();
  });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, (item: Item) => { if (item.parent === attacker()?.actor) void refresh(); });
  }
  for (const hook of ["updateRollTable", "createRollTable", "deleteRollTable", "updateTableResult", "createTableResult", "deleteTableResult"]) {
    Hooks.on(hook, () => { tableCache.clear(); if (hovered) void refresh(); });
  }
  Hooks.on("updateCompendium", () => {tableCache.clear();if(hovered)void refresh();});
  Hooks.on("updateSetting", (setting: {key?: string}) => {if(setting.key === "cyberpunk-red-core.dvRollTableCompendium"){tableCache.clear();if(hovered)void refresh();}});
  Hooks.on("deleteToken", (document: TokenDocument) => {
    if (document === hovered?.document || document === attacker()?.document) { hovered = undefined; clear(); }
  });
  Hooks.on("canvasTearDown", () => { hovered = undefined; clear(); });
  window.addEventListener("resize", position);
  window.addEventListener("blur", () => { hovered = undefined; clear(); });
}
