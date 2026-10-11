/**
 * Cyberpunk RED - Combat HUD
 * Entry point: settings, keybindings, hooks and HUD lifecycle.
 */
import CPRCombatHUD from "./hud.js";
import { MODULE_ID, TEMPLATE_PATH } from "./constants.js";

let hud = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "CPR-CHUD.settings.enabled.name",
    hint: "CPR-CHUD.settings.enabled.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => hud?.refresh(),
  });

  game.settings.register(MODULE_ID, "fallbackToCharacter", {
    name: "CPR-CHUD.settings.fallbackToCharacter.name",
    hint: "CPR-CHUD.settings.fallbackToCharacter.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => hud?.refresh(),
  });

  game.settings.register(MODULE_ID, "scale", {
    name: "CPR-CHUD.settings.scale.name",
    hint: "CPR-CHUD.settings.scale.hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0.6, max: 1.5, step: 0.05 },
    default: 1,
    onChange: () => hud?.refresh(),
  });

  game.settings.register(MODULE_ID, "bottomOffset", {
    name: "CPR-CHUD.settings.bottomOffset.name",
    hint: "CPR-CHUD.settings.bottomOffset.hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 300, step: 2 },
    default: 78,
    onChange: () => hud?.refresh(),
  });

  for (const key of ["showArmor", "showHumanity", "showLuck", "showDeathSave"]) {
    game.settings.register(MODULE_ID, key, {
      name: `CPR-CHUD.settings.${key}.name`,
      hint: `CPR-CHUD.settings.${key}.hint`,
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => hud?.refresh(),
    });
  }

  game.settings.register(MODULE_ID, "targetMode", {
    name: "CPR-CHUD.settings.targetMode.name",
    hint: "CPR-CHUD.settings.targetMode.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      off: "CPR-CHUD.settings.targetMode.off",
      ifNone: "CPR-CHUD.settings.targetMode.ifNone",
      always: "CPR-CHUD.settings.targetMode.always",
    },
    default: "always",
  });

  game.settings.register(MODULE_ID, "favsOpen", {
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
  });

  game.keybindings.register(MODULE_ID, "toggleHud", {
    name: "CPR-CHUD.keybindings.toggle.name",
    hint: "CPR-CHUD.keybindings.toggle.hint",
    editable: [{ key: "KeyH" }],
    onDown: () => {
      hud?.toggleCollapsed();
      return true;
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  loadTemplates([TEMPLATE_PATH]);
});

Hooks.once("ready", () => {
  hud = new CPRCombatHUD();
  game.modules.get(MODULE_ID).api = hud;
  // canvasReady fires before ready on world load; render once now in case
  // the canvas is already up (or disabled entirely).
  hud.refresh();
});

/* Re-resolve the displayed actor when token control changes. */
Hooks.on("controlToken", () => hud?.scheduleRefresh());
Hooks.on("canvasReady", () => hud?.scheduleRefresh());

/* Re-render when the displayed actor or its items change. */
Hooks.on("updateActor", (actor) => hud?.onActorUpdate(actor));
Hooks.on("createItem", (item) => hud?.onEmbeddedItem(item));
Hooks.on("updateItem", (item) => hud?.onEmbeddedItem(item));
Hooks.on("deleteItem", (item) => hud?.onEmbeddedItem(item));

/* Keep combat controls (initiative, end turn) current. */
Hooks.on("updateCombat", () => hud?.scheduleRefresh());
Hooks.on("createCombatant", () => hud?.scheduleRefresh());
Hooks.on("updateCombatant", () => hud?.scheduleRefresh());
Hooks.on("deleteCombatant", () => hud?.scheduleRefresh());
Hooks.on("combatStart", () => hud?.scheduleRefresh());
Hooks.on("deleteCombat", () => hud?.scheduleRefresh());

/* Assigned character changed. */
Hooks.on("updateUser", (user, changes) => {
  if (user.id === game.user.id && "character" in changes) {
    hud?.scheduleRefresh();
  }
});
