import test from "node:test";
import assert from "node:assert/strict";
import {
  ownsActor, visibleCombatant, visibleTarget, resolveSubject, projectActor, projectHUD,
} from "../scripts/state.js";

const player = { id: "player", isGM: false };
const gm = { id: "gm", isGM: true };
const system = { id: "cyberpunk-red-core", title: "Cyberpunk RED" };

function actor(id = "hero", options = {}) {
  const owners = options.owners ?? [player.id];
  return {
    id, name: options.name ?? id, type: options.type ?? "character", img: `${id}.webp`,
    system: options.system ?? {
      derivedStats: { hp: { value: 38, max: 50 } },
      externalData: {
        currentArmorHead: { id: "armor", value: 9, max: 11 },
        currentArmorBody: { id: "armor", value: 10, max: 11 },
      },
    },
    items: options.items ?? [], sheet: {}, privateNotes: "must not enter the HUD DTO",
    testUserPermission(user, permission) {
      assert.equal(permission, "OWNER", "projection must request owner permission");
      return owners.includes(user.id);
    },
    update() { throw new Error("read-only projection attempted a document update"); },
  };
}

function token(id, subject, options = {}) {
  const document = {
    id, uuid: `Scene.scene.Token.${id}`, name: options.name ?? `Token ${id}`,
    actor: subject, hidden: options.hidden ?? false,
    texture: { src: `${id}.webp` },
  };
  return { id, actor: subject, document, isVisible: options.isVisible ?? true };
}

function combatant(id, placeable, options = {}) {
  return {
    id, actor: placeable.actor, token: placeable.document,
    name: placeable.document.name, img: `${id}.webp`,
    initiative: options.initiative ?? 18, visible: options.visible ?? true,
    hidden: options.hidden ?? false, defeated: options.defeated ?? false,
  };
}

function combat(rows, current = rows[0], options = {}) {
  return { turns: rows, combatants: rows, combatant: current,
    started: options.started ?? true, round: 2, turn: 0 };
}

function context(overrides = {}) {
  return { user: player, system, generation: 12, controlled: [], targets: [], ...overrides };
}

test("ownership requires a real owner permission check and does not trust an isOwner flag", () => {
  assert.equal(ownsActor(actor(), player), true);
  assert.equal(ownsActor(actor("enemy", { owners: [] }), player), false);
  assert.equal(ownsActor({ isOwner: true }, player), false);
  assert.equal(ownsActor({}, gm), true);
  assert.equal(ownsActor(null, gm), false);
  assert.equal(ownsActor(actor(), null), false);
});

test("unsupported actor types and unowned actors do not expose resources", () => {
  assert.equal(projectActor(actor("net", { type: "netarch" }), null, player), null);
  assert.equal(projectActor(actor("enemy", { owners: [] }), null, player), null);
  assert.equal(projectActor(actor("mook", { type: "mook" }), null, player).hp.value, 38);
});

test("controlled token projection uses its name, portrait, HP and explicitly labelled tracked armor", () => {
  const hero = actor();
  const subject = token("hero-token", hero, { name: "Токен героя" });
  const model = projectHUD(context({ controlled: [subject] }));
  assert.equal(model.selected.name, "Токен героя");
  assert.equal(model.selected.img, "hero-token.webp");
  assert.deepEqual(model.selected.hp, { value: 38, max: 50 });
  assert.deepEqual(model.selected.armor.map(piece => piece.sp), [9, 10]);
  assert.ok(model.selected.armor.every(piece => piece.name.includes("отслеживаемая")));
});

test("missing and nonfinite HP does not become invented zero HP", () => {
  const missing = projectActor(actor("missing", { system: {} }), null, player);
  assert.equal(missing.hp, null);
  const invalid = projectActor(actor("invalid", {
    system: { derivedStats: { hp: { value: NaN, max: Infinity } } },
  }), null, player);
  assert.equal(invalid.hp, null);
  const unknownMaximum = projectActor(actor("partial", {
    system: { derivedStats: { hp: { value: 7 } } },
  }), null, player);
  assert.deepEqual(unknownMaximum.hp, { value: 7, max: null });
});

test("players see only visible, nonhidden combatants, while the GM can inspect hidden rows", () => {
  const subject = token("npc", actor("npc", { owners: [] }));
  const ordinary = combatant("ordinary", subject);
  const hiddenRow = combatant("hidden-row", subject, { hidden: true });
  const invisibleRow = combatant("invisible-row", subject, { visible: false });
  const hiddenTokenRow = combatant("hidden-token", token("hidden", subject.actor, { hidden: true }));
  for (const row of [hiddenRow, invisibleRow, hiddenTokenRow]) {
    assert.equal(visibleCombatant(row, player), false);
    assert.equal(visibleCombatant(row, gm), true);
  }
  const encounter = combat([ordinary, hiddenRow, invisibleRow, hiddenTokenRow], hiddenRow);
  const model = projectHUD(context({ combat: encounter }));
  assert.deepEqual(model.combat.combatants.map(row => row.id), ["ordinary"]);
  assert.equal(model.combat.combatants[0].current, false);
  assert.equal(model.combat.turn, null, "a hidden turn must not expose its original queue index");
  assert.equal(model.selected, null);
  assert.equal(JSON.stringify(model).includes("hidden-row"), false);
  assert.equal(projectHUD(context({ user: gm, combat: encounter })).combat.combatants.length, 4);
});

test("queue projection never reads an unowned actor's private system data", () => {
  const enemy = actor("enemy", { owners: [] });
  Object.defineProperty(enemy, "system", {
    get() { throw new Error("unowned system data was accessed"); },
  });
  const row = combatant("enemy-row", token("enemy-token", enemy));
  const model = projectHUD(context({ combat: combat([row]), selectedCombatantId: row.id }));
  assert.equal(model.selected, null);
  assert.equal(model.combat.combatants[0].selectable, false);
  assert.equal(Object.hasOwn(model.combat.combatants[0], "hp"), false);
  assert.equal(Object.hasOwn(model.combat.combatants[0], "actor"), false);
});

test("target projection filters hidden and out-of-vision tokens before reading their name", () => {
  const npc = actor("npc", { owners: [] });
  const seen = token("seen", npc, { name: "Видимая цель" });
  const hidden = token("hidden", npc, { hidden: true });
  const unseen = token("unseen", npc, { isVisible: false });
  for (const excluded of [hidden, unseen]) {
    Object.defineProperty(excluded.document, "name", {
      get() { throw new Error("hidden target name was accessed"); },
    });
    assert.equal(visibleTarget(excluded, player), false);
  }
  assert.equal(visibleTarget({}, player), false);
  assert.equal(visibleTarget(seen, null), false);
  const model = projectHUD(context({ targets: [seen, hidden, unseen] }));
  assert.deepEqual(model.targets, [{ id: "seen", name: "Видимая цель" }]);
});

test("GM can inspect hidden and out-of-vision targets", () => {
  const hidden = token("hidden", actor("npc", { owners: [] }), { hidden: true, isVisible: false });
  assert.equal(visibleTarget(hidden, gm), true);
  assert.equal(projectHUD(context({ user: gm, targets: [hidden] })).targets[0].id, "hidden");
});

test("selected combatant and current turn remain independent", () => {
  const one = token("one", actor("one"));
  const two = token("two", actor("two"));
  const rows = [combatant("row-one", one), combatant("row-two", two)];
  const model = projectHUD(context({ combat: combat(rows, rows[0]), selectedCombatantId: rows[1].id }));
  assert.equal(model.selected.name, two.document.name);
  assert.deepEqual(model.combat.combatants.map(row => [row.current, row.selected]), [[true, false], [false, true]]);
  assert.equal(model.combat.canAdvance, false);
});

test("synthetic actors with one actor ID are selected by the exact token and retain independent HP", () => {
  const firstActor = actor("same-actor", { system: { derivedStats: { hp: { value: 11, max: 50 } } } });
  const secondActor = actor("same-actor", { system: { derivedStats: { hp: { value: 22, max: 50 } } } });
  const first = token("first", firstActor);
  const second = token("second", secondActor);
  const rows = [combatant("first-row", first), combatant("second-row", second)];
  const model = projectHUD(context({
    controlled: [first], combat: combat(rows), selectedCombatantId: "second-row",
  }));
  assert.equal(model.selected.hp.value, 22);
  assert.deepEqual(model.combat.combatants.map(row => row.selected), [false, true]);
});

test("last owned controlled token wins, skipping an unowned controlled token", () => {
  const first = token("first", actor("first"));
  const second = token("second", actor("second"));
  const enemy = token("enemy", actor("enemy", { owners: [] }));
  const model = projectHUD(context({ controlled: [first, second, enemy] }));
  assert.equal(model.selected.name, second.document.name);
});

test("hidden and out-of-vision owned controlled tokens cannot become the selected HUD subject", () => {
  const hero = actor();
  for (const options of [{ hidden: true }, { isVisible: false }]) {
    const excluded = token("excluded", hero, options);
    Object.defineProperty(excluded.document, "name", {
      get() { throw new Error("hidden controlled token name was accessed"); },
    });
    const ctx = context({ controlled: [excluded] });
    assert.deepEqual(resolveSubject(ctx), { actor: null, token: null });
    assert.equal(projectHUD(ctx).selected, null);
    const gmSubject = resolveSubject({ ...ctx, user: gm });
    assert.equal(gmSubject.actor, hero);
    assert.equal(gmSubject.token, excluded.document);
  }
});

test("assigned actor fallback does not use a hidden token's private name or portrait", () => {
  const hero = actor("assigned", { name: "Разрешённый лист" });
  const hidden = token("private-token", hero, { hidden: true, name: "Private token alias" });
  const model = projectHUD(context({ user: { ...player, character: hero }, controlled: [hidden] }));
  assert.equal(model.selected.name, "Разрешённый лист");
  assert.equal(model.selected.img, "assigned.webp");
  assert.equal(JSON.stringify(model).includes("private-token"), false);
});

test("token identity includes its scene UUID, even when local token and actor IDs match", () => {
  const hero = actor("shared-actor");
  const local = token("shared-token", hero);
  const otherScene = token("shared-token", hero);
  otherScene.document.uuid = "Scene.other-scene.Token.shared-token";
  const rows = [combatant("local-row", local), combatant("other-scene-row", otherScene)];
  const model = projectHUD(context({ controlled: [local], combat: combat(rows) }));
  assert.deepEqual(model.combat.combatants.map(row => row.selected), [true, false]);
});

test("token identity fallback includes its parent scene ID when UUID is unavailable", () => {
  const hero = actor("shared-actor");
  const local = token("shared-token", hero);
  const otherScene = token("shared-token", hero);
  delete local.document.uuid;
  delete otherScene.document.uuid;
  local.document.parent = { id: "scene-one" };
  otherScene.document.parent = { id: "scene-two" };
  const rows = [combatant("local-row", local), combatant("other-scene-row", otherScene)];
  const model = projectHUD(context({ controlled: [local], combat: combat(rows) }));
  assert.deepEqual(model.combat.combatants.map(row => row.selected), [true, false]);
});

test("player current-turn index is calculated from visible rows rather than revealing hidden rows", () => {
  const hero = token("hero", actor());
  const rows = [
    combatant("hidden-row", hero, { hidden: true }),
    combatant("first-visible", hero),
    combatant("second-visible", hero),
  ];
  const encounter = combat(rows, rows[2]);
  encounter.turn = 2;
  assert.equal(projectHUD(context({ combat: encounter })).combat.turn, 1);
  assert.equal(projectHUD(context({ user: gm, combat: encounter })).combat.turn, 2);
});

test("hidden or inaccessible selected queue rows cannot override an owned controlled token", () => {
  const own = token("own", actor());
  const enemy = token("enemy", actor("enemy", { owners: [] }));
  const hiddenOwn = token("hidden-own", actor("hidden-own"), { hidden: true });
  const rows = [combatant("enemy-row", enemy), combatant("hidden-row", hiddenOwn)];
  for (const id of rows.map(row => row.id)) {
    const model = projectHUD(context({ controlled: [own], combat: combat(rows), selectedCombatantId: id }));
    assert.equal(model.selected.name, own.document.name);
  }
});

test("revoked ownership immediately removes selected actor resources", () => {
  const owners = [player.id];
  const hero = actor("hero", { owners });
  const own = token("own", hero);
  const row = combatant("own-row", own);
  const ctx = context({ controlled: [own], combat: combat([row]), selectedCombatantId: row.id });
  assert.equal(projectHUD(ctx).selected.hp.value, 38);
  owners.length = 0;
  assert.equal(projectHUD(ctx).selected, null);
  assert.equal(projectHUD(ctx).combat.combatants[0].selectable, false);
});

test("assigned character fallback requires ownership", () => {
  const own = actor("assigned");
  assert.equal(projectHUD(context({ user: { ...player, character: own } })).selected.id, own.id);
  const foreign = actor("foreign", { owners: [] });
  assert.equal(projectHUD(context({ user: { ...player, character: foreign } })).selected, null);
});

test("system or Foundry generation mismatch disables actor integration and advancing turns", () => {
  const own = token("own", actor());
  const encounter = combat([combatant("own-row", own)]);
  for (const override of [{ generation: 13 }, { system: { id: "dnd5e" } }]) {
    const model = projectHUD(context({ user: gm, controlled: [own], combat: encounter, ...override }));
    assert.equal(model.supported, false);
    assert.equal(model.selected, null);
    assert.equal(model.combat.canAdvance, false);
    assert.ok(model.error);
  }
});

test("GM turn command is available only for a started nonempty combat with no pending command", () => {
  const own = token("own", actor());
  const rows = [combatant("row", own)];
  assert.equal(projectHUD(context({ user: gm, combat: combat(rows) })).combat.canAdvance, true);
  for (const override of [
    { pending: true }, { user: player }, { combat: combat(rows, rows[0], { started: false }) },
    { combat: combat([]) }, { combat: null },
  ]) {
    assert.equal(projectHUD(context({ user: gm, combat: combat(rows), ...override })).combat.canAdvance, false);
  }
});

test("CPR derived equipped list includes cyberweapons and underbarrel weapons", () => {
  const cyberweapon = { id: "cyber", type: "cyberware", name: "Киберклинок", system: { isWeapon: true } };
  const underbarrel = { id: "underbarrel", type: "itemUpgrade", name: "Подствольный", system: { magazine: { value: 1, max: 1 } } };
  const hero = actor("hero", {
    system: { weapons: { equipped: [cyberweapon, underbarrel] } },
    items: [{ id: "owned", type: "weapon", name: "В сумке", system: { equipped: "owned" } }],
  });
  assert.deepEqual(projectActor(hero, null, player).weapons.map(weapon => weapon.id), ["cyber", "underbarrel"]);
});

test("plain weapon fallback respects the CPR equipped string rather than treating owned as equipped", () => {
  const hero = actor("hero", { items: [
    { id: "equipped", type: "weapon", system: { equipped: "equipped" } },
    { id: "owned", type: "weapon", system: { equipped: "owned" } },
    { id: "carried", type: "weapon", system: { equipped: "carried" } },
    { id: "armor", type: "armor", system: { equipped: "equipped" } },
  ] });
  assert.deepEqual(projectActor(hero, null, player).weapons.map(weapon => weapon.id), ["equipped"]);
});

test("read-only magazine capacity includes upgrades without mutating the item", () => {
  const magazine = Object.freeze({ value: 7, max: 8 });
  let calls = 0;
  const weapon = Object.freeze({
    id: "pistol", name: "Пистолет", system: Object.freeze({ magazine, isRanged: true }),
    getMagazineSpace() { calls++; return 5; },
  });
  const hero = actor("hero", { system: { weapons: { equipped: [weapon] } } });
  assert.deepEqual(projectActor(hero, null, player).weapons[0].ammo, { value: 7, max: 12 });
  assert.equal(calls, 1);
  assert.deepEqual(magazine, { value: 7, max: 8 });
});

test("unsupported or failing capacity getter retains the available base capacity", () => {
  for (const getMagazineSpace of [() => Infinity, () => { throw new Error("unsupported"); }]) {
    const weapon = { id: "pistol", system: { magazine: { value: 4, max: 8 }, isRanged: true }, getMagazineSpace };
    const hero = actor("hero", { system: { weapons: { equipped: [weapon] } } });
    assert.deepEqual(projectActor(hero, null, player).weapons[0].ammo, { value: 4, max: 8 });
  }
});

test("actor projection is an independent JSON-safe DTO containing no Documents or private notes", () => {
  const hero = actor();
  const model = projectActor(hero, token("own", hero).document, player);
  assert.notEqual(model.hp, hero.system.derivedStats.hp);
  assert.equal(Object.hasOwn(model, "system"), false);
  assert.equal(Object.hasOwn(model, "sheet"), false);
  assert.equal(Object.hasOwn(model, "privateNotes"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
  model.hp.value = -10;
  assert.equal(hero.system.derivedStats.hp.value, 38);
});

test("selected skill projection retains each exact token's choice through refresh and subject changes", () => {
  const perception = { id: "perception", name: "Perception", type: "skill", createRoll() {} };
  const evasion = { id: "evasion", name: "Evasion", type: "skill", createRoll() {} };
  const hero = actor("shared-actor", { items: [perception, evasion] });
  hero.uuid = "Actor.shared-actor";
  const first = token("first-token", hero);
  const second = token("second-token", hero);
  const selectedSkills = new Map([
    [`${hero.uuid}|${first.document.uuid}`, perception.id],
    [`${hero.uuid}|${second.document.uuid}`, evasion.id],
  ]);
  const selectionCalls = [];
  const options = {
    revision: 17, actionBusy: true, actionStatus: "Native dialog is open",
    selectedSkill(key) { selectionCalls.push(key); return selectedSkills.get(key); },
    localizeSkill(name) { return ({ Perception: "Восприятие", Evasion: "Уклонение" })[name]; },
  };
  const project = subject => projectHUD(context({ controlled: [subject], ...options })).selected;
  const initial = project(first);
  assert.equal(initial.selectedSkillId, perception.id);
  assert.equal(initial.key, `${hero.uuid}|${first.document.uuid}`);
  assert.equal(initial.revision, 17);
  assert.equal(initial.busy, true);
  assert.equal(initial.status, options.actionStatus);
  assert.deepEqual(initial.skills, [
    { id: perception.id, name: "Восприятие" },
    { id: evasion.id, name: "Уклонение" },
  ]);
  assert.equal(project(second).selectedSkillId, evasion.id);
  assert.equal(project(first).selectedSkillId, perception.id);
  selectedSkills.set(initial.key, evasion.id);
  assert.equal(project(first).selectedSkillId, evasion.id);
  assert.deepEqual(selectionCalls, [
    `${hero.uuid}|${first.document.uuid}`,
    `${hero.uuid}|${second.document.uuid}`,
    `${hero.uuid}|${first.document.uuid}`,
    `${hero.uuid}|${first.document.uuid}`,
  ]);
  assert.equal(initial.selectedSkillId, perception.id, "an older DTO must remain an independent snapshot");
  assert.deepEqual(hero.items, [perception, evasion], "projection must not mutate system skills");
  assert.equal(projectActor(hero, first.document, player).selectedSkillId, "");
});