/** Minimal public-API model for browser checks. This is NOT a Foundry runtime. */
const callbacks = new Map();
globalThis.Hooks = {
  on(name, fn) { const entries = callbacks.get(name) ?? []; entries.push({ fn, once: false }); callbacks.set(name, entries); },
  once(name, fn) { const entries = callbacks.get(name) ?? []; entries.push({ fn, once: true }); callbacks.set(name, entries); },
  callAll(name, ...args) {
    const entries = callbacks.get(name) ?? [];
    callbacks.set(name, entries.filter(entry => !entry.once));
    for (const entry of entries) entry.fn(...args);
  },
};
const records = { sheetOpens: 0, turnCalls: 0, documentWrites: 0, canvasClicks: 0, notifications: [], renders: 0 };
const definitions = new Map(), values = new Map(), keys = new Map();
globalThis.foundry = { utils: {
  mergeObject: (a, b) => ({ ...a, ...b }),
  getRoute: path => path.replace(/^modules\/redline-combat\//, '../../foundry/redline-combat/'),
} };
globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
globalThis.ui = { notifications: { error: text => records.notifications.push(text) } };
function actor(id, name, owner, img) {
  return { id, uuid: `Actor.${id}`, type: 'character', name, img, owner,
    system: { derivedStats: { hp: { value: 38, max: 50 } }, externalData: { currentArmorHead: { value: 7 }, currentArmorBody: { value: 11 } } },
    items: [{ id: 'pistol', type: 'weapon', name: 'Тяжёлый пистолет', system: { equipped: 'equipped', magazine: { value: 8, max: 8 } } }],
    testUserPermission(user, permission) { return Boolean(user.isGM || (this.owner === user.id && permission === 'OWNER')); },
    sheet: { render() { records.sheetOpens++; } },
  };
}
const hero = actor('hero', 'Вега', 'player', '../../prototype/vega.svg');
const ally = actor('ally', 'Никс', 'player', '../../prototype/nyx.svg');
const enemy = actor('enemy', 'Охранник', 'gm', '../../prototype/guard.svg');
const secret = actor('secret', 'СЕКРЕТНЫЙ УЧАСТНИК', 'gm', '');
function token(id, subject, hidden = false) {
  return { actor: subject, isVisible: !hidden, document: { id, uuid: `Scene.scene.Token.${id}`, parent: { id: 'scene' }, actor: subject, name: subject.name, hidden, texture: { src: subject.img } } };
}
const tokens = [token('t1', hero), token('t2', ally), token('t3', enemy), token('t4', secret, true)];
const rows = tokens.map((token, index) => ({
  id: `c${index}`, actor: token.actor, token: token.document,
  name: token.document.name, img: token.actor.img, initiative: 22 - index * 4,
  visible: !token.document.hidden, hidden: token.document.hidden,
}));
const combat = {
  round: 3, turn: 0, started: true, turns: rows,
  combatants: new Map(rows.map(row => [row.id, row])),
  get combatant() { return this.turns[this.turn]; },
  async nextTurn() {
    records.turnCalls++;
    await new Promise(resolve => setTimeout(resolve, 150));
    this.turn = (this.turn + 1) % this.turns.length;
    records.documentWrites++;
    Hooks.callAll('updateCombat', this);
  },
};
globalThis.game = {
  release: { generation: 12 }, version: '12.343', system: { id: 'cyberpunk-red-core', title: 'Cyberpunk RED' },
  user: { id: 'player', isGM: false, character: null, targets: new Set([tokens[2], tokens[3]]) },
  combat, modules: new Map([['redline-combat', {}]]),
  settings: {
    register(module, key, definition) { definitions.set(key, definition); values.set(key, definition.default); },
    get(module, key) { return values.get(key); },
    async set(module, key, value) { values.set(key, value); await definitions.get(key).onChange?.(value); return value; },
  },
  keybindings: { register(module, key, definition) {
    if (definition.editable.some(binding => binding.modifiers?.some(modifier => !['Control', 'Shift', 'Alt'].includes(modifier)))) throw new Error('Invalid keybinding modifier');
    keys.set(key, definition);
  } },
};
globalThis.canvas = { tokens: { controlled: [tokens[0]] } };

class FixtureApplication {
  static get defaultOptions() { return { popOut: true }; }
  constructor(options = {}) { this.options = { ...this.constructor.defaultOptions, ...options }; this._rendering = null; this.element = []; }
  getData() { return {}; }
  activateListeners() {}
  render() {
    // Serialize to exercise re-render listener cleanup without relying on app internals.
    this._rendering = (this._rendering ?? Promise.resolve()).then(async () => {
      const data = this.getData();
      const template = await (await fetch(foundry.utils.getRoute(this.options.template))).text();
      const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
      const rendered = template.replace('{{{content}}}', data.content ?? '').replace('{{demoUrl}}', escape(data.demoUrl ?? ''));
      const holder = document.createElement('template');
      holder.innerHTML = this.options.popOut ? `<section class="window-app" id="${this.options.id}"><header class="window-header"><span>${escape(this.options.title)}</span><button type="button" aria-label="Закрыть демо">×</button></header><div class="window-content">${rendered}</div></section>` : rendered;
      const root = holder.content.firstElementChild;
      const previous = document.getElementById(this.options.id);
      if (previous) previous.replaceWith(root); else document.body.append(root);
      if (this.options.popOut) root.querySelector('.window-header button').addEventListener('click', () => this.close());
      this.element = [root];
      this.activateListeners(this.element);
      records.renders++;
    });
    return this;
  }
  async close() { await this._rendering; this.element[0]?.remove(); this.element = []; }
}
globalThis.Application = FixtureApplication;
document.querySelector('#scene').addEventListener('click', () => records.canvasClicks++);
await import('../../foundry/redline-combat/scripts/main.js');
Hooks.callAll('init');
const controls = [{ name: 'token', tools: [] }];
Hooks.callAll('getSceneControlButtons', controls);
for (const tool of controls[0].tools) {
  const button = document.createElement('button'); button.id = 'fixture-tool'; button.title = tool.title; button.textContent = 'ϟ'; button.onclick = tool.onClick;
  document.querySelector('#fixture-toolbar').append(button);
}
Hooks.callAll('ready');
window.fixture = {
  records, hero, ally, enemy, secret, tokens, rows, combat,
  api: game.modules.get('redline-combat').api,
  keys, controls,
  setGM(value) { game.user.isGM = value; Hooks.callAll('updateUser', game.user); },
  selectToken(index) { canvas.tokens.controlled = index === null ? [] : [tokens[index]]; Hooks.callAll('controlToken'); },
  updateHP(value) { hero.system.derivedStats.hp.value = value; Hooks.callAll('updateActor', hero); },
  emptyCombat() { game.combat = null; Hooks.callAll('deleteCombat'); },
};
