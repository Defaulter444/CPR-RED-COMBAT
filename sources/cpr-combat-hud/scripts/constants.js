export const MODULE_ID = "cpr-combat-hud";
export const SYSTEM_ID = "cyberpunk-red-core";

export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/hud.hbs`;

/* Actor types the HUD can display. */
export const SUPPORTED_ACTOR_TYPES = ["character", "mook"];

/* Fire mode ids used by the system as actor flags (firetype-<itemId>). */
export const FIRE_MODES = {
  ATTACK: "attack",
  AIMED: "aimed",
  AUTOFIRE: "autofire",
  SUPPRESSIVE: "suppressive",
};

/* Aimed shot locations supported by the system's damage cards. */
export const AIMED_LOCATIONS = ["head", "heldItem", "leg"];

/* Cycle order for equip states. */
export const EQUIP_CYCLE = ["owned", "carried", "equipped"];
