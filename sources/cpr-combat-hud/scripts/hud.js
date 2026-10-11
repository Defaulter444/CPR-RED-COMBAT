/**
 * The Combat HUD application: a persistent (popOut: false) bar anchored to
 * the bottom of the screen, showing the currently controlled token's actor.
 */
import CPR from "../../../systems/cyberpunk-red-core/modules/system/config.js";
import CPRSystemUtils from "../../../systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js";
import {
  MODULE_ID,
  SYSTEM_ID,
  TEMPLATE_PATH,
  SUPPORTED_ACTOR_TYPES,
  FIRE_MODES,
  AIMED_LOCATIONS,
} from "./constants.js";
import * as Actions from "./actions.js";
import { isTargeting } from "./targeting.js";

const WOUND_STATE_CSS = {
  notWounded: "ok",
  lightlyWounded: "light",
  seriouslyWounded: "serious",
  mortallyWounded: "mortal",
  dead: "dead",
  invalidState: "ok",
};

export default class CPRCombatHUD extends Application {
  constructor(options = {}) {
    super(options);
    this._openPanel = null;
    this._skillFilter = "";
    this._collapsed = false;
    this.scheduleRefresh = foundry.utils.debounce(() => this.refresh(), 80);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cpr-combat-hud",
      template: TEMPLATE_PATH,
      popOut: false,
    });
  }

  /* -------------------------------------------- */
  /*  Actor resolution                            */
  /* -------------------------------------------- */

  /**
   * Decide which actor/token the HUD shows: the last controlled, owned,
   * supported token - or the user's assigned character as a fallback.
   */
  _resolveSubject() {
    const controlled = canvas?.tokens?.controlled ?? [];
    const owned = controlled.filter(
      (t) =>
        t.actor &&
        SUPPORTED_ACTOR_TYPES.includes(t.actor.type) &&
        t.actor.isOwner
    );
    if (owned.length) {
      const token = owned[owned.length - 1];
      return { actor: token.actor, tokenDoc: token.document };
    }

    const fallback = game.settings.get(MODULE_ID, "fallbackToCharacter");
    const character = game.user.character;
    if (fallback && character && SUPPORTED_ACTOR_TYPES.includes(character.type)) {
      const token = canvas?.tokens?.placeables?.find(
        (t) => t.actor?.id === character.id
      );
      return { actor: character, tokenDoc: token?.document ?? null };
    }
    return { actor: null, tokenDoc: null };
  }

  get actor() {
    return this._actor ?? null;
  }

  refresh() {
    const { actor, tokenDoc } = this._resolveSubject();
    this._actor = actor;
    this._tokenDoc = tokenDoc;
    this.render(true);
  }

  /** Called from hooks when a document changes; re-render if it is ours. */
  onActorUpdate(actor) {
    if (!this._actor) return;
    if (actor.id === this._actor.id) this.scheduleRefresh();
  }

  onEmbeddedItem(item) {
    if (!this._actor || !item.parent) return;
    if (item.parent.id === this._actor.id) this.scheduleRefresh();
  }

  toggleCollapsed() {
    this._collapsed = !this._collapsed;
    this.render(true);
  }

  /* -------------------------------------------- */
  /*  Data preparation                            */
  /* -------------------------------------------- */

  getData() {
    const enabled = game.settings.get(MODULE_ID, "enabled");
    const scale = game.settings.get(MODULE_ID, "scale");
    const bottomOffset = game.settings.get(MODULE_ID, "bottomOffset");
    const actor = this._actor;

    const data = {
      visible: enabled && !!actor,
      collapsed: this._collapsed,
      scale,
      bottomOffset,
    };
    if (!data.visible) return data;

    const tokenDoc = this._tokenDoc;
    data.actorId = actor.id;
    data.name = tokenDoc?.name || actor.name;
    data.alias = actor.system.information?.alias ?? "";
    data.img = tokenDoc?.texture?.src || actor.img;
    data.isCharacter = actor.type === "character";

    this._prepareVitals(data, actor);
    this._prepareStats(data, actor);
    this._prepareWeapons(data, actor);
    this._prepareSkills(data, actor);
    this._prepareRoles(data, actor);
    this._prepareInterface(data, actor);
    this._prepareCombat(data, actor, tokenDoc);

    data.openPanel = this._openPanel;
    data.panels = {
      skills: this._openPanel === "skills",
      roles: this._openPanel === "roles",
      interface: this._openPanel === "interface",
      gear: this._openPanel === "gear",
    };
    data.skillFilter = this._skillFilter;
    return data;
  }

  _prepareVitals(data, actor) {
    const derived = actor.system.derivedStats;
    const hp = derived.hp;
    data.hp = {
      value: hp.value,
      max: hp.max,
      pct: Math.round((hp.value / Math.max(hp.max, 1)) * 100),
    };
    const woundState = derived.currentWoundState || "notWounded";
    data.woundState = {
      css: WOUND_STATE_CSS[woundState] ?? "ok",
      label: game.i18n.localize(
        CPR.woundState[woundState] ?? "CPR.global.woundState.notWounded"
      ),
    };
    data.humanity = {
      value: derived.humanity.value,
      max: derived.humanity.max,
    };
    data.luck = {
      value: actor.system.stats.luck.value,
      max: actor.system.stats.luck.max,
    };
    data.deathSave = {
      penalty: derived.deathSave.penalty,
      basePenalty: derived.deathSave.basePenalty,
      total: derived.deathSave.penalty + derived.deathSave.basePenalty,
    };
    data.move = actor.system.stats.move.value;

    const ext = actor.system.externalData;
    data.armor = {
      head: {
        value: ext.currentArmorHead.value,
        max: ext.currentArmorHead.max,
        has: actor.getEquippedArmors("head").length > 0,
      },
      body: {
        value: ext.currentArmorBody.value,
        max: ext.currentArmorBody.max,
        has: actor.getEquippedArmors("body").length > 0,
      },
      shield: {
        value: ext.currentArmorShield.value,
        max: ext.currentArmorShield.max,
        has: actor.getEquippedArmors("shield").length > 0,
      },
    };

    // Per-user visibility of the optional vitals chips.
    data.show = {
      armor: game.settings.get(MODULE_ID, "showArmor"),
      humanity: game.settings.get(MODULE_ID, "showHumanity"),
      luck: game.settings.get(MODULE_ID, "showLuck"),
      deathSave: game.settings.get(MODULE_ID, "showDeathSave"),
    };
  }

  _prepareStats(data, actor) {
    data.stats = Object.keys(CPR.statList).map((key) => ({
      key,
      label: game.i18n.localize(CPR.statList[key]),
      value: actor.system.stats[key].value,
    }));
  }

  _prepareWeapons(data, actor) {
    const anyAimed = [];
    data.weapons = actor.system.weapons.equipped.map((w) => {
      const fireMode = actor.getFlag(SYSTEM_ID, `firetype-${w.id}`) || null;
      if (fireMode === FIRE_MODES.AIMED) anyAimed.push(w.id);
      const magazine = w.system.magazine ?? null;
      return {
        id: w.id,
        name: w.name,
        img: w.img,
        damage: w.system.damage,
        rof: w.system.rof,
        isRanged: !!w.system.isRanged,
        hasMagazine: (magazine?.max ?? 0) > 0,
        magValue: magazine?.value ?? 0,
        magMax: magazine?.max ?? 0,
        ammoName: w.system.loadedAmmo?.name ?? "",
        canAim: true,
        canAutofire: (w.system.fireModes?.autoFire ?? 0) > 0,
        canSuppress: !!w.system.fireModes?.suppressiveFire,
        isAimed: fireMode === FIRE_MODES.AIMED,
        isAutofire: fireMode === FIRE_MODES.AUTOFIRE,
        isSuppressive: fireMode === FIRE_MODES.SUPPRESSIVE,
      };
    });
    data.hasWeapons = data.weapons.length > 0;

    data.showAimLocation = anyAimed.length > 0;
    const currentLocation =
      actor.getFlag(SYSTEM_ID, "aimedLocation") || "head";
    data.aimedLocations = AIMED_LOCATIONS.map((loc) => ({
      key: loc,
      label: game.i18n.localize(`CPR.global.location.${loc}`),
      selected: loc === currentLocation,
    }));

    // Weapon management panel: every weapon (and cyberdeck) with its equip state.
    data.allWeapons = [
      ...actor.itemTypes.weapon,
      ...actor.itemTypes.cyberdeck,
    ].map((w) => ({
      id: w.id,
      name: w.name,
      img: w.img,
      equipped: w.system.equipped,
      equipLabel: game.i18n.localize(
        `CPR-CHUD.equipState.${w.system.equipped}`
      ),
    }));
  }

  _prepareSkills(data, actor) {
    const skillMap = actor.system.skills ?? {};
    const categories = new Map();
    const favorites = [];

    for (const skill of actor.itemTypes.skill) {
      const slug = CPRSystemUtils.slugify(skill.name);
      const info = skillMap[slug] ?? {
        level: skill.system.level,
        stat: actor.system.stats[skill.system.stat]?.value ?? 0,
        mods: 0,
      };
      const total = info.level + info.stat + info.mods;
      const category = skill.system.category || "otherSkills";
      if (!categories.has(category)) categories.set(category, []);
      const entry = {
        id: skill.id,
        name: skill.name,
        level: info.level,
        statAbbr: game.i18n.localize(
          CPR.statList[skill.system.stat] ?? skill.system.stat
        ),
        statValue: info.stat,
        mods: info.mods,
        modsDisplay:
          info.mods > 0 ? ` +${info.mods}` : info.mods < 0 ? ` ${info.mods}` : "",
        total,
        favorite: !!skill.system.favorite,
      };
      categories.get(category).push(entry);
      if (entry.favorite) favorites.push(entry);
    }

    data.favSkills = favorites.sort((a, b) => a.name.localeCompare(b.name));
    data.hasFavs = favorites.length > 0;
    data.favsOpen = game.settings.get(MODULE_ID, "favsOpen");

    data.skillCategories = [...categories.entries()]
      .map(([key, skills]) => ({
        key,
        label: game.i18n.localize(`CPR.global.skillCategories.${key}`),
        skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    data.hasSkills = data.skillCategories.length > 0;
  }

  _prepareRoles(data, actor) {
    const abilities = [];
    for (const role of actor.itemTypes.role) {
      if (role.system.hasRoll && role.system.mainRoleAbility) {
        abilities.push({
          roleId: role.id,
          roleName: role.name,
          name: role.system.mainRoleAbility,
          rank: role.system.rank,
          rollSubType: "mainRoleAbility",
          subRoleName: role.system.mainRoleAbility,
        });
      }
      for (const sub of role.system.abilities ?? []) {
        if (sub.hasRoll) {
          abilities.push({
            roleId: role.id,
            roleName: role.name,
            name: sub.name,
            rank: sub.rank ?? role.system.rank,
            rollSubType: "subRoleAbility",
            subRoleName: sub.name,
          });
        }
      }
    }
    data.roleAbilities = abilities;
    data.hasRoles = abilities.length > 0;
    data.roleNames = actor.itemTypes.role.map((r) => r.name).join(" / ");
  }

  _prepareInterface(data, actor) {
    const cyberdeck = actor.itemTypes.cyberdeck.find(
      (deck) => deck.system.equipped === "equipped"
    );
    const netRole = actor.itemTypes.role.find(
      (r) => r.id === actor.system.roleInfo.activeNetRole
    );
    data.hasInterface = !!(cyberdeck && netRole);
    data.interfaceAbilities = data.hasInterface
      ? Object.entries(CPR.interfaceAbilities).map(([key, label]) => ({
          key,
          label: game.i18n.localize(label),
        }))
      : [];
  }

  _prepareCombat(data, actor, tokenDoc) {
    const combat = game.combat;
    const combatant = combat?.combatants.find(
      (c) =>
        (tokenDoc && c.tokenId === tokenDoc.id) ||
        (!tokenDoc && c.actorId === actor.id)
    );
    const initiative = combatant?.initiative;
    data.combat = {
      active: !!combat?.started,
      inCombat: !!combatant,
      initiative:
        initiative === null || initiative === undefined
          ? null
          : String(initiative),
      isMyTurn: !!(
        combat?.started &&
        combatant &&
        combat.combatant?.id === combatant.id
      ),
    };
  }

  /* -------------------------------------------- */
  /*  Listeners                                   */
  /* -------------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;

    root.addEventListener("click", (event) => this._onClick(event));
    root.addEventListener("contextmenu", (event) => this._onContextMenu(event));
    root.addEventListener("change", (event) => this._onChange(event));

    const search = root.querySelector(".chud-skill-search");
    if (search) {
      search.value = this._skillFilter;
      this._applySkillFilter(root);
      search.addEventListener("input", (event) => {
        this._skillFilter = event.target.value;
        this._applySkillFilter(root);
      });
    }
  }

  async _onClick(event) {
    // While a "Choose Target" session is open the bar is inert - swallow
    // clicks so nothing fires until the user picks a target or cancels.
    if (isTargeting()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el) return;
    event.preventDefault();
    const action = el.dataset.action;
    const itemId = el.dataset.itemId;
    const actor = this._actor;
    const tokenDoc = this._tokenDoc;
    if (!actor && !["expand"].includes(action)) return;

    switch (action) {
      case "collapse":
      case "expand":
        this.toggleCollapsed();
        break;
      case "open-sheet":
        actor.sheet.render(true);
        break;
      case "toggle-panel": {
        const panel = el.dataset.panel;
        this._openPanel = this._openPanel === panel ? null : panel;
        this.render(true);
        break;
      }
      case "toggle-favs":
        await game.settings.set(
          MODULE_ID,
          "favsOpen",
          !game.settings.get(MODULE_ID, "favsOpen")
        );
        this.render(true);
        break;
      case "stat-roll":
        await Actions.rollStat(event, actor, el.dataset.stat, tokenDoc);
        break;
      case "skill-roll":
        await Actions.rollSkill(event, actor, itemId, tokenDoc);
        break;
      case "skill-favorite": {
        const skill = actor.getOwnedItem(itemId);
        if (skill) {
          await skill.update({ "system.favorite": !skill.system.favorite });
        }
        break;
      }
      case "attack":
        await Actions.rollAttack(event, actor, itemId, tokenDoc);
        break;
      case "damage":
        await Actions.rollWeaponDamage(event, actor, itemId, tokenDoc);
        break;
      case "reload":
        await Actions.reloadWeapon(actor, itemId);
        break;
      case "change-ammo":
        await Actions.changeAmmo(actor, itemId);
        break;
      case "fire-mode":
        await Actions.toggleFireMode(actor, itemId, el.dataset.mode);
        break;
      case "hp-delta":
        await Actions.adjustHp(actor, Number(el.dataset.delta));
        break;
      case "luck-delta":
        await Actions.adjustLuck(actor, Number(el.dataset.delta));
        break;
      case "armor-delta":
        await Actions.adjustArmor(
          actor,
          el.dataset.location,
          Number(el.dataset.delta)
        );
        break;
      case "deathsave-roll":
        await Actions.rollDeathSave(event, actor, tokenDoc);
        break;
      case "facedown-roll":
        await Actions.rollFacedown(event, actor, tokenDoc);
        break;
      case "initiative-roll":
        await Actions.rollInitiative(actor, tokenDoc);
        break;
      case "end-turn":
        await Actions.endTurn(tokenDoc);
        break;
      case "role-roll":
        await Actions.rollRoleAbility(
          event,
          actor,
          el.dataset.roleId,
          el.dataset.subRoleName,
          el.dataset.rollSubType,
          tokenDoc
        );
        break;
      case "interface-roll":
        await Actions.rollInterfaceAbility(
          event,
          actor,
          el.dataset.ability,
          tokenDoc
        );
        break;
      case "equip-cycle":
        await Actions.cycleEquipState(actor, itemId);
        break;
      default:
        break;
    }
  }

  async _onContextMenu(event) {
    const actor = this._actor;
    if (!actor) return;

    const deathSave = event.target.closest('[data-action="deathsave-roll"]');
    if (deathSave) {
      event.preventDefault();
      await Actions.resetDeathPenalty(actor);
      return;
    }

    const itemEl = event.target.closest("[data-open-item]");
    if (itemEl) {
      event.preventDefault();
      const item = actor.getOwnedItem(itemEl.dataset.openItem);
      item?.sheet.render(true);
    }
  }

  async _onChange(event) {
    const el = event.target;
    const actor = this._actor;
    if (!actor) return;

    if (el.classList.contains("chud-hp-input")) {
      await Actions.setHp(actor, Number(el.value));
    } else if (el.classList.contains("chud-aim-location")) {
      await Actions.setAimedLocation(actor, el.value);
    }
  }

  _applySkillFilter(root) {
    const filter = this._skillFilter.trim().toLowerCase();
    for (const row of root.querySelectorAll(".chud-skill-row")) {
      const match =
        !filter || row.dataset.skillName.toLowerCase().includes(filter);
      row.classList.toggle("chud-hidden", !match);
    }
    for (const group of root.querySelectorAll(".chud-skill-group")) {
      const visible = group.querySelectorAll(
        ".chud-skill-row:not(.chud-hidden)"
      ).length;
      group.classList.toggle("chud-hidden", visible === 0);
    }
  }
}
