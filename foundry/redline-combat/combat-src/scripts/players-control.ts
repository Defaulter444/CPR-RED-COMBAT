import {registerNativeWrapper} from "./native-wrappers.js";

const MODULE = "redline-combat";
type PlayersMode = "online" | "all" | "minimized";
declare global {interface SettingConfig {"redline-combat.playersMode": PlayersMode}}
const mode = (): PlayersMode => game.settings!.get(MODULE, "playersMode");
const nextMode = (value: PlayersMode): PlayersMode => value === "online" ? "all" : value === "all" ? "minimized" : "online";
const names = {online: "В сети", all: "Все", minimized: "Свёрнуто"};
const actions = {online: "Показать всех игроков", all: "Свернуть игроков", minimized: "Показать игроков в сети"};

/** Extend the native v12 heading toggle; filtering and user context menus remain native. */
export function decoratePlayers(root: HTMLElement): void {
  const current = mode();
  root.classList.toggle("pneuma-players-minimized", current === "minimized");
  const heading = root.querySelector<HTMLElement>("h3");
  if (!heading) return;
  heading.setAttribute("role", "button");
  heading.tabIndex = 0;
  heading.setAttribute("aria-expanded", String(current !== "minimized"));
  heading.setAttribute("aria-label", "Игроки: " + names[current] + ". " + actions[current]);
  heading.title = actions[current];
  let indicator = heading.querySelector<HTMLElement>(".pneuma-players-mode");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "pneuma-players-mode";
    indicator.setAttribute("aria-hidden", "true");
    heading.append(indicator);
  }
  indicator.textContent = names[current];
  if (!heading.dataset.pneumaPlayersBound) {
    heading.dataset.pneumaPlayersBound = "true";
    heading.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) heading.click();
    });
  }
}

export function registerPlayersControl(): void {
  game.settings!.register(MODULE, "playersMode", {
    scope: "client", config: false, type: String, default: "online",
    onChange: () => {ui.players?.render(false);},
  });
  Hooks.once("setup", () => {
    // getData still builds and sorts the native rows, including permission/context-menu behavior.
    registerNativeWrapper(PlayerList.prototype, "getData", function(wrapped, ...args) {
      this._showOffline = mode() === "all";
      return wrapped(...args);
    }, "WRAPPER");
    let pending = false;
    registerNativeWrapper(PlayerList.prototype, "_onToggleOfflinePlayers", async function(_wrapped, event: Event) {
      event.preventDefault();
      if (pending) return;
      pending = true;
      const focus = this.element?.[0]?.querySelector("h3") === document.activeElement;
      if (focus) this._pneumaPlayersFocus = true;
      try {
        await game.settings!.set(MODULE, "playersMode", nextMode(mode()));
      } catch (error) {delete this._pneumaPlayersFocus;ui.notifications!.error(String(error));}
      finally {pending = false;}
    }, "MIXED");
  });
  Hooks.on("renderPlayerList", (app: PlayerList & {_pneumaPlayersFocus?: boolean}, html: JQuery) => {
    const root = html[0];
    if (!root) return;
    decoratePlayers(root);
    if (app._pneumaPlayersFocus) {delete app._pneumaPlayersFocus;root.querySelector<HTMLElement>("h3")?.focus();}
  });
}
