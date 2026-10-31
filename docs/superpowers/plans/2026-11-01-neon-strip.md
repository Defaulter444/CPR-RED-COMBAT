# REDLINE COMBAT 0.5.0 «Неоновая полоса» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить широкий док REDLINE тонкой полосой в стиле «неон и хром» с карточками над элементами, всплывающим результатом и плавным масштабом перетаскиванием, не меняя правил, бросков и прав.

**Architecture:** Меняется только слой отображения модуля `foundry/redline-combat`: `view.js` (HTML-строки), `redline.css` + `host.css` (вид), `main.js` (состояние открытой карточки, таймер результата, захват масштаба), `presentation.js` (чистые расчёты), `motion.js` (анимации). Слои `state.js`, `actions.js`, `capabilities.js`, `encounter.js`, `skills.js`, `preferences.js` не трогаются. Живая проверка — на стенде foundry-dev (`D:\FoundryDev\bench`, порт 30001) сценарием Playwright.

**Tech Stack:** Foundry VTT 12.331, Cyberpunk RED Core v0.92.4, обычный JavaScript (ES-модули, без сборщика), `node --test`, Playwright 1.64 (из проекта `C:\Users\Horusian\foundry-dev`), Chrome 156.

Спецификация: `docs/superpowers/specs/2026-11-01-neon-strip-design.md`. Ветка: `redesign/neon-strip`.

---

## Карта файлов

Репозиторий модуля `C:\Users\Horusian\CPR-RED-COMBAT` (далее `M/` = `foundry/redline-combat/`):

| Файл | Ответственность | Действие |
|---|---|---|
| `M/scripts/presentation.js` | чистые расчёты: масштаб 50–150, перетаскивание, сегменты HP, ширина полосы, высота карточек | изменить |
| `M/scripts/view.js` | HTML полосы, карточек, тоста, очереди | переписать |
| `M/scripts/main.js` | Application HUD, состояние карточки, тост, захват масштаба, действия | переписать |
| `M/scripts/motion.js` | анимации полосы, карточек, сегментов HP | переписать |
| `M/styles/redline.css` | стиль «неон и хром»: полоса, карточки, очередь, результаты | переписать |
| `M/styles/host.css` | внутренности карточки навыков и нативные контролы | переписать |
| `M/templates/hud.hbs` | маркер `redline-neon` / `neon-strip` | изменить |
| `M/tests/presentation.test.mjs` | тесты расчётов | изменить |
| `M/tests/view.test.mjs` | тесты полосы и карточек | переписать |
| `M/tests/encounter-view.test.mjs` | тесты истории, тоста, состояний | переписать |
| `M/module.json`, `M/package.json` | версия 0.5.0 | изменить |
| `CHANGELOG.md`, `M/README.md`, `M/QA.md` | документация выпуска | изменить |

Проект стенда `C:\Users\Horusian\foundry-dev` (далее `D/`):

| Файл | Ответственность | Действие |
|---|---|---|
| `D/tools/bench/redline.mjs` | junction модуля в стенд, включение, навыки/оружие/патроны персонажу | создать |
| `D/playwright.modules.config.ts` | отдельный конфиг сценариев сторонних модулей | создать |
| `D/e2e-modules/global-setup.ts` | запуск `redline.mjs` перед сценарием | создать |
| `D/e2e-modules/redline-combat.spec.ts` | живая проверка REDLINE | создать |
| `D/package.json`, `D/eslint.config.js` | скрипты `bench:redline`, `e2e:redline`; глобалы страницы | изменить |

Команды тестов модуля: `cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && npm test` (это `node --test tests/*.test.js tests/*.test.mjs`).

---

### Task 1: Стенд для REDLINE

**Files:**
- Create: `D/tools/bench/redline.mjs`
- Modify: `D/package.json` (scripts)

- [ ] **Step 1: Создать скрипт подготовки**

`D/tools/bench/redline.mjs`:

```js
// Подготовка стенда к работе над REDLINE COMBAT (репозиторий C:\Users\Horusian\CPR-RED-COMBAT).
// 1) junction Data/modules/redline-combat -> рабочая папка модуля: паков у модуля нет, Foundry только читает файлы;
// 2) после нового подключения сервер стенда перезапускается — модули Foundry видит только при старте;
// 3) клиент ассистента: модуль включён в мире, «Тестовому персонажу» выданы 63 базовых навыка CPR,
//    тяжёлый пистолет и штурмовая винтовка с заряженными магазинами, боевой нож. Повтор ничего не дублирует.
//   node tools/bench/redline.mjs [--repo=C:/Users/Horusian/CPR-RED-COMBAT]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PROJECT_ROOT, loadConfig, serverStatus, log } from "./lib.mjs";
import { launchBrowser, newSession, joinAs, reloadAndWait } from "../browser/foundry.mjs";

const cfg = loadConfig();
const repoArg = process.argv.find((arg) => arg.startsWith("--repo="));
const repo = path.resolve(repoArg ? repoArg.slice("--repo=".length) : "C:/Users/Horusian/CPR-RED-COMBAT");
const source = path.join(repo, "foundry", "redline-combat");
const target = path.join(cfg.paths.data, "modules", "redline-combat");
const server = (...args) =>
  execFileSync(process.execPath, [path.join(PROJECT_ROOT, "tools/bench/server.mjs"), ...args], { stdio: "inherit" });

if (!fs.existsSync(path.join(source, "module.json"))) throw new Error(`Нет модуля: ${source}`);
let linked = false;
if (!fs.existsSync(target)) {
  fs.symlinkSync(source, target, "junction");
  linked = true;
  log(`junction ${target} -> ${source}`);
} else if (fs.realpathSync(target).toLowerCase() !== fs.realpathSync(source).toLowerCase()) {
  throw new Error(`${target} уже существует и указывает не на ${source}`);
}
if (linked && (await serverStatus(cfg))) server("stop");
if (!(await serverStatus(cfg))?.active) server("start");

const browser = await launchBrowser();
try {
  const { page } = await newSession(browser, cfg.url);
  await joinAs(page, "Ассистент");
  const enabled = await page.evaluate(async () => {
    const config = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
    if (config["redline-combat"]) return false;
    config["redline-combat"] = true;
    await game.settings.set("core", "moduleConfiguration", config);
    return true;
  });
  if (enabled) await reloadAndWait(page);

  const report = await page.evaluate(async () => {
    const actor = game.actors.find((a) => a.name === "Тестовый персонаж" && a.getFlag("world", "benchSeed"));
    if (!actor) throw new Error("Нет «Тестового персонажа»: npm run bench:seed");
    const FLAG = { world: { benchSeed: true, redline: true } };
    const packDocs = async (pack) => game.packs.get(pack).getDocuments();

    // Базовые навыки листа: без навыка оружия (Handgun, Rifle…) REDLINE честно отключает «Атаку».
    const owned = new Set(actor.items.filter((i) => i.type === "skill").map((i) => i.name));
    const skills = (await packDocs("cyberpunk-red-core.internal_skills"))
      .filter((doc) => doc.type === "skill" && !owned.has(doc.name))
      .map((doc) => {
        const data = doc.toObject();
        delete data._id;
        data.flags = FLAG;
        return data;
      });
    if (skills.length) await actor.createEmbeddedDocuments("Item", skills);

    const ensure = async (pack, name, patch) => {
      const have = actor.items.find((i) => i.name === name && i.getFlag("world", "redline"));
      if (have) return have;
      const doc = (await packDocs(pack)).find((d) => d.name === name);
      if (!doc) throw new Error(`В ${pack} нет «${name}»`);
      const data = foundry.utils.mergeObject(doc.toObject(), { ...patch, flags: FLAG });
      delete data._id;
      const [item] = await actor.createEmbeddedDocuments("Item", [data]);
      return item;
    };
    const pistolAmmo = await ensure("cyberpunk-red-core.core_ammo", "Heavy Pistol (Basic)", { "system.amount": 40 });
    const rifleAmmo = await ensure("cyberpunk-red-core.core_ammo", "Rifle (Basic)", { "system.amount": 100 });
    const pistol = await ensure("cyberpunk-red-core.core_weapons", "Heavy Pistol", { "system.equipped": "equipped" });
    const rifle = await ensure("cyberpunk-red-core.core_weapons", "Assault Rifle", { "system.equipped": "equipped" });
    await ensure("cyberpunk-red-core.core_weapons", "Combat Knife", { "system.equipped": "equipped" });

    // Штатная зарядка CPR: installItems — то же, что делает диалог выбора патронов, затем reload.
    for (const [weapon, ammo] of [
      [pistol, pistolAmmo],
      [rifle, rifleAmmo],
    ]) {
      if (weapon.system.magazine.value >= weapon.system.magazine.max) continue;
      if (!weapon.getInstalledItems("ammo").length) await weapon.installItems([ammo]);
      await weapon.reload();
    }
    return {
      skills: actor.items.filter((i) => i.type === "skill").length,
      items: actor.items
        .filter((i) => i.getFlag("world", "redline") && i.type !== "skill")
        .map(
          (i) =>
            `${i.name}${i.system.magazine?.max ? ` ${i.system.magazine.value}/${i.system.magazine.max}` : ""}` +
            `${i.type === "ammo" ? ` ×${i.system.amount}` : ""}${i.system.equipped ? ` [${i.system.equipped}]` : ""}`,
        ),
    };
  });
  log(`навыков у персонажа: ${report.skills}`);
  log(`снаряжение: ${report.items.join("; ")}`);
} finally {
  await browser.close();
}
```

- [ ] **Step 2: Скрипты в `D/package.json`**

В объект `scripts` после `"bench:check-libs"` добавить:

```json
    "bench:redline": "node tools/bench/redline.mjs",
    "e2e:redline": "playwright test -c playwright.modules.config.ts",
```

- [ ] **Step 3: Запустить и проверить**

Run: `cd C:/Users/Horusian/foundry-dev && npm run bench:redline`
Expected (числа патронов в магазине после зарядки — полные):
```
[bench] junction D:\FoundryDev\bench\Data\modules\redline-combat -> C:\Users\Horusian\CPR-RED-COMBAT\foundry\redline-combat
[bench] навыков у персонажа: 63
[bench] снаряжение: Heavy Pistol (Basic) ×32; Rifle (Basic) ×75; Heavy Pistol 8/8 [equipped]; Assault Rifle 25/25 [equipped]; Combat Knife [equipped]
```
Повторный запуск: junction не создаётся заново, навыков по-прежнему 63, ничего не дублируется.

- [ ] **Step 4: Снимок 0.4.0 «до» на стенде**

Run (Git Bash):
```bash
cd C:/Users/Horusian/foundry-dev && node -e "
import('file:///C:/Users/Horusian/foundry-dev/tools/browser/foundry.mjs').then(async ({launchBrowser,newSession,joinAs})=>{
  const b=await launchBrowser();const {page}=await newSession(b,'http://localhost:30001');await joinAs(page,'Игрок');
  await page.waitForSelector('#redline-combat-hud .redline-dock');await page.screenshot({path:'artifacts/redline/before-0.4.0.png'});await b.close();})"
```
Expected: файл `D/artifacts/redline/before-0.4.0.png` с доком 0.4.0 (папку `artifacts/redline` создать заранее: `mkdir -p artifacts/redline`).

- [ ] **Step 5: Commit (foundry-dev)**

```bash
cd C:/Users/Horusian/foundry-dev && git add tools/bench/redline.mjs package.json && git commit -m "Стенд: подготовка REDLINE COMBAT (junction, навыки, оружие с патронами)"
```

---

### Task 2: Расчёты в `presentation.js`

**Files:**
- Modify: `M/scripts/presentation.js`
- Test: `M/tests/presentation.test.mjs`

- [ ] **Step 1: Обновить тесты (сначала падают)**

В `M/tests/presentation.test.mjs` заменить строку импорта:

```js
import {selectedWeapon,safeInsets,cardMaxHeight,normalizeInterfaceScale,panelSizing,scaleFromDrag,hpSegments} from '../scripts/presentation.js';
```

Удалить тесты `'skills popup remains between the initiative queue and dock on the live 1024×768 geometry'`, `'skills popup height follows dock expansion, respects its wide-screen cap, and handles no free gap'`, `'expanded timer at 1024×768 uses a usable skills drawer over the dock, clear of queue and macros'`, `'skills stay above the dock when the map has room and drawer fallback never reduces available space'`, `'catalog at 125% on 1024×768 uses the dock drawer so search and roll stay reachable'`, `'client scale defaults to 80%, rounds to 5%, and limits invalid or out-of-range values'`, `'default panels occupy at most 880 actual pixels, and every supported scale fits the available map width'`. На их место добавить:

```js
test('cards fit between the initiative queue and the strip on the live 1024×768 geometry', () => {
  const stripTop=383,queueBottom=150;
  const height=cardMaxHeight({stripTop,queueBottom,viewportHeight:768});
  assert.equal(height,213);
  assert.equal(stripTop-8-height,queueBottom+12);
});
test('card height respects its wide-screen cap, the viewport share, and a missing gap', () => {
  assert.equal(cardMaxHeight({stripTop:700,queueBottom:150,viewportHeight:1080}),430);
  assert.equal(cardMaxHeight({stripTop:480,queueBottom:150,viewportHeight:720}),310);
  assert.equal(cardMaxHeight({stripTop:160,queueBottom:150,viewportHeight:600}),0);
  assert.equal(cardMaxHeight(),0);
});
test('expanded DEADLINE shortens cards instead of covering the queue', () => {
  const height=cardMaxHeight({stripTop:658,queueBottom:326,viewportHeight:768});
  assert.equal(height,312);
  assert.ok(658-8-height>=326+12);
});
test('client scale defaults to 80%, keeps whole percents, and limits invalid or out-of-range values', () => {
  for(const value of [undefined,null,NaN,Infinity,'',{},'bad']) assert.equal(normalizeInterfaceScale(value),80);
  assert.equal(normalizeInterfaceScale(83),83);
  assert.equal(normalizeInterfaceScale(83.4),83);
  assert.equal(normalizeInterfaceScale('60'),60);
  assert.equal(normalizeInterfaceScale(0),50);
  assert.equal(normalizeInterfaceScale(49.6),50);
  assert.equal(normalizeInterfaceScale(900),150);
});
test('dragging the grip right or up enlarges, left or down shrinks, four pixels per percent', () => {
  assert.equal(scaleFromDrag({startScale:80,dx:40}),90);
  assert.equal(scaleFromDrag({startScale:80,dy:-40}),90);
  assert.equal(scaleFromDrag({startScale:80,dx:-40,dy:40}),60);
  assert.equal(scaleFromDrag({startScale:149,dx:400}),150);
  assert.equal(scaleFromDrag({startScale:'bad',dx:4}),81);
  assert.equal(scaleFromDrag({startScale:80,dx:NaN}),80);
  assert.equal(scaleFromDrag({startScale:80}),80);
});
test('HP segments light ceil(value/max × 10) while alive and none without usable data', () => {
  assert.equal(hpSegments({value:8,max:40}),2);
  assert.equal(hpSegments({value:1,max:40}),1);
  assert.equal(hpSegments({value:40,max:40}),10);
  assert.equal(hpSegments({value:41,max:40}),10);
  assert.equal(hpSegments({value:0,max:40}),0);
  assert.equal(hpSegments({value:-5,max:40}),0);
  for(const hp of [null,undefined,{value:5,max:0},{value:NaN,max:40},{value:5}]) assert.equal(hpSegments(hp),null);
});
test('the default strip occupies at most 800 actual pixels, and every supported scale fits the available map width', () => {
  assert.deepEqual(panelSizing({availableWidth:1288}),{percent:80,factor:.8,layoutWidth:1000,actualWidth:800});
  for(const scale of [50,80,100,150]) for(const availableWidth of [630,900,1600]) {
    const size=panelSizing({availableWidth,scale});
    assert.ok(size.layoutWidth<=1000);
    assert.ok(size.actualWidth<=availableWidth+.0001);
    assert.ok(Math.abs(size.actualWidth-size.layoutWidth*size.factor)<.0001);
  }
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && node --test tests/presentation.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../scripts/presentation.js' does not provide an export named 'cardMaxHeight'`.

- [ ] **Step 3: Реализация**

В `M/scripts/presentation.js` заменить блок от `export const DEFAULT_INTERFACE_SCALE = 80;` до конца функции `panelSizing` на:

```js
export const DEFAULT_INTERFACE_SCALE = 80;
export const MIN_INTERFACE_SCALE = 50;
export const MAX_INTERFACE_SCALE = 150;
/** Widest strip layout before client zoom; the real width is also limited by the free map area. */
export const STRIP_MAX_WIDTH = 1000;

export function normalizeInterfaceScale(value) {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) return DEFAULT_INTERFACE_SCALE;
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, Math.round(Number(value))));
}

/** Dragging the corner grip right or up enlarges the strip: four screen pixels per percent. */
export function scaleFromDrag({startScale, dx = 0, dy = 0} = {}) {
  const delta = (Number.isFinite(dx) ? dx : 0) - (Number.isFinite(dy) ? dy : 0);
  return normalizeInterfaceScale(normalizeInterfaceScale(startScale) + delta / 4);
}

/** Lit HP segments: ceil(value / max × count) while HP is above zero; null without usable HP. */
export function hpSegments(hp, count = 10) {
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) return null;
  if (hp.value <= 0) return 0;
  return Math.min(count, Math.ceil(hp.value / hp.max * count));
}

/** The preferred strip width is measured before its client zoom is applied. */
export function panelSizing({availableWidth, scale} = {}) {
  const percent = normalizeInterfaceScale(scale), factor = percent / 100;
  const width = Number.isFinite(availableWidth) ? Math.max(1, availableWidth) : STRIP_MAX_WIDTH * factor;
  const layoutWidth = Math.min(STRIP_MAX_WIDTH, width / factor);
  return {percent,factor,layoutWidth,actualWidth:layoutWidth * factor};
}
```

Заменить функции `skillPopupHeight` и `skillPopupLayout` (с комментариями над ними) на:

```js
/** Cards open upward into the map gap between the initiative queue and the strip. */
export function cardMaxHeight({stripTop, queueBottom, viewportHeight} = {}) {
  if (!Number.isFinite(stripTop)) return 0;
  const ceiling = Math.max(12, Number.isFinite(queueBottom) ? queueBottom + 12 : 12);
  const gap = Math.max(0, stripTop - 8 - ceiling);
  const viewportLimit = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight * .6) : 430;
  return Math.floor(Math.min(430, viewportLimit, gap));
}
```

`selectedWeapon` и `safeInsets` остаются без изменений.

- [ ] **Step 4: Тесты проходят**

Run: `node --test tests/presentation.test.mjs`
Expected: все тесты файла PASS (тест маркера шаблона пока проверяет старый маркер и меняется в Task 3).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/scripts/presentation.js foundry/redline-combat/tests/presentation.test.mjs && git commit -m "Масштаб 50–150% без шагов, расчёт перетаскивания, сегменты HP, высота карточек"
```

---

### Task 3: Маркер шаблона

**Files:**
- Modify: `M/templates/hud.hbs`
- Test: `M/tests/presentation.test.mjs`

- [ ] **Step 1: Обновить тест маркера**

В `M/tests/presentation.test.mjs` тест `'outer Foundry template carries the compatibility marker before host observers inspect the inserted HUD'` заменить двумя последними `assert` на:

```js
  assert.match(root,/class="[^"]*\bredline-neon\b[^"]*"/);
  assert.match(root,/data-layout="neon-strip"/);
```

- [ ] **Step 2: Тест падает**

Run: `node --test tests/presentation.test.mjs`
Expected: FAIL в тесте маркера (`redline-neon` не найден).

- [ ] **Step 3: Шаблон**

`M/templates/hud.hbs` целиком:

```hbs
<section id="redline-combat-hud" class="redline-neon" data-layout="neon-strip" aria-label="REDLINE COMBAT">{{{content}}}</section>
```

- [ ] **Step 4: Тесты проходят**

Run: `node --test tests/presentation.test.mjs`
Expected: PASS всего файла.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/templates/hud.hbs foundry/redline-combat/tests/presentation.test.mjs && git commit -m "Маркер шаблона neon-strip"
```

---

### Task 4: Новый `view.js` — полоса, карточки, тост, очередь

**Files:**
- Rewrite: `M/scripts/view.js`
- Rewrite: `M/tests/view.test.mjs`
- Rewrite: `M/tests/encounter-view.test.mjs`

- [ ] **Step 1: Новый `tests/view.test.mjs` (падает)**

`M/tests/view.test.mjs` целиком:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHUD, CARD_IDS } from '../scripts/view.js';

const actor = overrides => ({
  key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', canOpenSheet:true,
  hp:{value:10,max:40}, armor:[{name:'Голова · отслеживаемая броня',sp:11},{name:'Тело · отслеживаемая броня',sp:12}],
  healthStatus:{label:'Легко ранен',tone:'low',detail:'Состояние ранений из листа персонажа.'}, conditions:[],
  weapons:[{id:'pistol',name:'Пистолет',ammo:{value:9,max:12},modes:[{id:'attack',label:'Обычная'},{id:'aimed',label:'Прицельная'}],mode:'aimed',canAttack:true,canDamage:true,canReload:true,canLoad:true,damageLabel:'3d6',rof:2}],
  skillCategories:[{id:'awarenessSkills',label:'Навыки восприятия'},{id:'fightingSkills',label:'Боевые навыки'},{id:'techniqueSkills',label:'Технические навыки'},{id:'emptySkills',label:'Пустой раздел'}],
  skills:[{id:'evasion',name:'Уклонение',category:'fightingSkills'},{id:'perception',name:'Восприятие',category:'awarenessSkills'},{id:'lock',name:'Взлом замков',category:'techniqueSkills',difficult:true}],
  canInitiative:true,canDeathSave:false,busy:false,status:'',
  ...overrides,
});
const view = (selected, extra = {}) => renderHUD({supported:true,selected,...extra});
const buttons = html => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const action = (html,name) => buttons(html).find(tag=>tag.includes(`data-action="${name}"`));
const actions = (html,name) => buttons(html).filter(tag=>tag.includes(`data-action="${name}"`));
const toggle = (html,id) => buttons(html).find(tag=>tag.includes('data-action="toggle-card"')&&tag.includes(`data-id="${id}"`));
const cardTag = (html,id) => html.match(new RegExp(`<section[^>]*data-card="${id}"[^>]*>`))?.[0];

test('production HUD has no tutorial and keeps refresh, close and character controls', () => {
  for (const model of [{}, {supported:true}, {supported:true,selected:actor()}]) {
    const html=renderHUD(model);
    assert.doesNotMatch(html,/data-action="demo"|redline-preview|<iframe\b|Учебный пример/);
    for (const name of ['refresh','close']) {
      const tag=action(html,name);
      assert.ok(tag,name);
      assert.match(tag,/type="button"/);
      assert.doesNotMatch(tag,/ disabled/);
    }
    assert.equal(action(html,'next-turn'),undefined);
  }
  const html=view(actor());
  for (const name of ['sheet','weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative','choose-weapon','choose-mode']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.doesNotMatch(tag,/ disabled/);
  }
  assert.doesNotMatch(html,/data-action="(scale-settings|toggle-dock|toggle-skills|toggle-arsenal|close-drawers)"/);
});

test('initiative is rendered only during a started combat and the turn button only for the GM', () => {
  const combat={round:9,combatants:[{id:'one',name:'Ви',selectable:true}],canAdvance:true};
  for(const state of [undefined,false]){
    const html=renderHUD({supported:true,selected:actor(),combat:{...combat,started:state}});
    assert.doesNotMatch(html,/aria-label="Очередь инициативы"|data-action="next-turn"/);
  }
  const active=renderHUD({supported:true,selected:actor(),combat:{...combat,started:true}});
  assert.match(active,/aria-label="Очередь инициативы"/);
  assert.ok(action(active,'next-turn'));
  assert.match(active,/data-action="select-combatant" data-id="one"/);
  const player=renderHUD({supported:true,selected:actor(),combat:{...combat,started:true,canAdvance:false}});
  assert.equal(action(player,'next-turn'),undefined);
});

test('the neon strip carries its layout marker and an accessible continuous scale grip', () => {
  const html=view(actor());
  assert.match(html,/class="redline-interface redline-neon"/);
  assert.match(html,/data-layout="neon-strip"/);
  assert.match(html,/data-scale="80"/);
  const grip=html.match(/<span class="redline-scale-grip"[^>]*>/)[0];
  assert.match(grip,/role="slider"/);
  assert.match(grip,/tabindex="0"/);
  assert.match(grip,/aria-valuemin="50" aria-valuemax="150" aria-valuenow="80" aria-valuetext="80%"/);
  const scaled=view(actor(),{interfaceScale:123});
  assert.match(scaled,/aria-valuenow="123"/);
  assert.match(scaled,/<output class="redline-scale-readout">123%<\/output>/);
  assert.match(renderHUD({}),/class="redline-scale-grip"/);
});

test('weapon commands keep the exact subject, revision and the selected mode', () => {
  const html=view(actor());
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load','skill-category','choose-skill','selected-skill','initiative','death-save','choose-weapon','choose-mode']) {
    const tag=action(html,name);
    assert.ok(tag,name);
    assert.match(tag,/type="button"/);
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
  }
  for(const name of ['weapon-attack','weapon-damage','weapon-reload','weapon-load']) {
    assert.match(action(html,name),/data-id="pistol"/);
    assert.match(action(html,name),/data-mode="aimed"/);
  }
  const chips=actions(html,'choose-mode');
  assert.deepEqual(chips.map(tag=>tag.match(/data-mode="([^"]+)"/)[1]),['attack','aimed']);
  assert.match(chips[1],/aria-pressed="true"/);
  assert.match(chips[0],/aria-pressed="false"/);
  assert.doesNotMatch(html,/<select\b/);
  assert.match(action(html,'weapon-load'),/aria-label="Выбрать патроны: Пистолет"/);
  assert.match(html,/fa-solid fa-box-open" aria-hidden="true"/);
  assert.match(action(html,'selected-skill'),/data-id="evasion"/);
});

test('the strip shows one selected weapon while the weapon card lists every equipped weapon', () => {
  const first=actor().weapons[0];
  const second={...first,id:'rifle',name:'Винтовка'};
  const model=actor({selectedWeaponId:'rifle',weapons:[first,second]});
  const html=view(model);
  assert.match(toggle(html,'weapon'),/data-weapon-id="rifle"/);
  assert.match(html,/<span class="redline-strip-text">Винтовка<\/span>/);
  const rows=actions(html,'choose-weapon');
  assert.deepEqual(rows.map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['pistol','rifle']);
  assert.match(rows[1],/aria-pressed="true"/);
  for(const name of ['weapon-attack','weapon-damage','weapon-reload']) assert.match(action(html,name),/data-id="rifle"/);
  assert.equal(actions(html,'weapon-attack').length,1);
  const stale=view({...model,selectedWeaponId:'deleted'});
  assert.match(action(stale,'weapon-attack'),/data-id="pistol"/);
});

test('every card has an accessible toggle and only the open card is shown', () => {
  const closed=view(actor({recentActions:[{id:'1',status:'completed',title:'Атака'}]}));
  for(const id of CARD_IDS) {
    assert.match(toggle(closed,id),/aria-expanded="false"/,id);
    assert.match(cardTag(closed,id),/ hidden>/,id);
  }
  assert.match(toggle(closed,'skills'),/aria-controls="redline-skills-panel"/);
  assert.match(toggle(closed,'weapon'),/aria-controls="redline-card-weapon"/);
  for(const id of CARD_IDS) {
    const html=view(actor({recentActions:[{id:'1',status:'completed',title:'Атака'}]}),{openCard:id});
    assert.match(toggle(html,id),/aria-expanded="true"/,id);
    assert.doesNotMatch(cardTag(html,id),/ hidden>/,id);
    assert.equal([...html.matchAll(/<section[^>]*data-card="[^"]+"[^>]*>/g)].filter(m=>!/ hidden>/.test(m[0])).length,1,id);
  }
  const bogus=view(actor(),{openCard:'nope'});
  assert.equal([...bogus.matchAll(/<section[^>]*data-card="[^"]+"[^>]*>/g)].filter(m=>!/ hidden>/.test(m[0])).length,0);
  assert.match(action(view(actor(),{openCard:'skills'}),'close-card'),/aria-label="Закрыть навыки"/);
});

test('HP segments follow the native wound tone and armor shows head and body SP', () => {
  const html=view(actor());
  assert.match(html,/class="redline-hp" data-vital-tone="low" data-hp-value="10" data-hp-max="40"/);
  assert.match(html,/class="redline-segments" data-lit="3"/);
  assert.equal([...html.matchAll(/<i class="is-lit"><\/i>/g)].length,3);
  assert.match(html,/<b class="redline-num">10<\/b><small>\/40<\/small>/);
  assert.match(html,/SP 11·12/);
  const dead=view(actor({hp:{value:-3,max:40},healthStatus:{label:'При смерти',tone:'critical'}}));
  assert.match(dead,/data-vital-tone="critical"/);
  assert.match(dead,/data-lit="0"/);
  const unknown=view(actor({hp:null,armor:[]}));
  assert.match(unknown,/data-lit=""/);
  assert.match(unknown,/HP —/);
  assert.match(unknown,/SP —·—/);
});

test('conditions show up to three icons with a remainder and escaped labels', () => {
  const conditions=[{id:'injury:a',label:'Сломанная рука'},{id:'effect:b',label:'Стимулятор'},{id:'effect:c',label:'<script>x</script>'},{id:'effect:d',label:'Оглушён'}];
  const html=view(actor({conditions}));
  const strip=html.match(/<span class="redline-conditions">(.*?)<\/span><\/button>/s)[1];
  assert.equal([...strip.matchAll(/class="redline-condition-icon"/g)].length,3);
  assert.match(strip,/data-condition-id="injury:a" title="Сломанная рука"><i class="fa-solid fa-droplet"/);
  assert.match(strip,/data-condition-id="effect:b" title="Стимулятор"><i class="fa-solid fa-bolt"/);
  assert.match(strip,/<small>\+1<\/small>/);
  assert.doesNotMatch(html,/<script>x/);
  assert.match(cardTag(html,'character')+html.split(cardTag(html,'character'))[1],/data-condition-id="effect:d"/);
});

test('an empty magazine marks the ammo and the reload button, melee weapons show no magazine', () => {
  const empty=actor();
  empty.weapons[0].ammo={value:0,max:12};
  const html=view(empty);
  assert.match(html,/class="redline-ammo" data-ammo-state="empty"/);
  assert.match(action(html,'weapon-reload'),/is-urgent/);
  const melee=actor();
  Object.assign(melee.weapons[0],{ammo:null,canReload:false,canLoad:false});
  const knife=view(melee);
  assert.doesNotMatch(toggle(knife,'weapon'),/data-vital="ammo"/);
  assert.match(knife,/<small class="redline-muted">ближн\.<\/small>/);
  assert.doesNotMatch(action(knife,'weapon-reload'),/is-urgent/);
});

test('the target cell shows the first target and a remainder, the card lists all of them', () => {
  const none=view(actor());
  assert.match(none,/Нет цели/);
  const targets=[{name:'Охранник'},{name:'Курьер'},{name:'Дрон'}];
  const html=view(actor(),{targets});
  assert.match(toggle(html,'target'),/aria-label="Цели: Охранник, Курьер, Дрон"/);
  assert.match(html,/<span class="redline-strip-text">Охранник<\/span><small>\+2<\/small>/);
  const card=html.slice(html.indexOf('data-card="target"'));
  assert.match(card,/aria-label="Цели атаки"/);
  for(const name of ['Охранник','Курьер','Дрон']) assert.match(card,new RegExp(`<span>${name}</span>`));
  assert.match(card,/Цель отмечается штатной отметкой T на сцене/);
});

test('portraits reject executable URLs without creating fake resource values', () => {
  const model=actor({img:'javascript:alert(1)',hp:null});
  const html=renderHUD({supported:true,selected:model,targets:[{name:'Цель',img:'vbscript:alert(1)'}]});
  assert.doesNotMatch(html,/<img\b/);
  assert.doesNotMatch(html,/javascript:|vbscript:|data:image/);
  for(const img of ['java\nscript:alert(1)','file:///C:/private.png','vb\tscript:alert(1)']) assert.doesNotMatch(view(actor({img})),/<img\b/);
  assert.match(view(actor({img:'tokens/vi.webp'})),/<img src="tokens\/vi\.webp"/);
});

test('busy state disables every subject action and the search input and announces the status', () => {
  const html=view(actor({busy:true}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject='))) assert.match(tag,/ disabled>/);
  assert.match(html,/aria-busy="true"/);
  assert.match(html,/<input\b[^>]*data-skill-search[^>]* disabled>/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">Выполняется действие системы…/);
  assert.match(view(actor({status:'Патроны выбраны.'})),/role="status" aria-live="polite" aria-atomic="true">Патроны выбраны\./);
});

test('the actor-selected skill persists across a refreshed view', () => {
  const html=view(actor({selectedSkillId:'perception'}));
  assert.match(actions(html,'choose-skill').find(tag=>tag.includes('data-id="perception"')),/aria-pressed="true"/);
  assert.match(actions(html,'choose-skill').find(tag=>tag.includes('data-id="evasion"')),/aria-pressed="false"/);
  assert.match(action(html,'selected-skill'),/data-id="perception"/);
  assert.match(action(html,'selected-skill'),/aria-label="Бросить — Восприятие"/);
  const stale=view(actor({selectedSkillId:'removed-skill'}));
  assert.match(action(stale,'selected-skill'),/data-id="evasion"/);
  assert.doesNotMatch(stale,/removed-skill/);
});

test('catalog navigation retains exact character-sheet group order and labels, including empty sections', () => {
  const model=actor();
  const html=renderHUD({supported:true,selected:model,skillState:{category:'techniqueSkills'}});
  const categoryButtons=actions(html,'skill-category');
  assert.deepEqual(categoryButtons.map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['all',...model.skillCategories.map(category=>category.id)]);
  const nav=html.match(/<nav class="redline-skill-categories"[^>]*>(.*?)<\/nav>/s)[1];
  assert.deepEqual([...nav.matchAll(/<span>(.*?)<\/span>/g)].map(match=>match[1]),['Все навыки',...model.skillCategories.map(category=>category.label)]);
  assert.match(categoryButtons.find(tag=>tag.includes('data-id="techniqueSkills"')),/aria-pressed="true"/);
  assert.equal(categoryButtons.filter(tag=>tag.includes('aria-pressed="true"')).length,1);
  assert.deepEqual(actions(html,'choose-skill').map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['lock']);
  assert.match(html,/<strong>Технические навыки<\/strong>/);
});

test('category and search route the primary roll to the visible skill, never the old hidden selection', () => {
  const selected=actor({selectedSkillId:'evasion'});
  const html=renderHUD({supported:true,selected,skillState:{category:'awarenessSkills',query:'  ВОСП  '}});
  assert.match(html,/<input\b[^>]*data-skill-search[^>]*value="  ВОСП  "/);
  assert.deepEqual(actions(html,'choose-skill').map(tag=>tag.match(/data-id="([^"]+)"/)[1]),['perception']);
  assert.match(action(html,'selected-skill'),/data-id="perception"/);
  assert.doesNotMatch(action(html,'selected-skill'),/ disabled|data-id="evasion"/);
});

test('no search results or an empty sheet section disables the roll without a stale skill id', () => {
  for(const skillState of [{category:'all',query:'Нет такого навыка'},{category:'emptySkills',query:''}]) {
    const html=renderHUD({supported:true,selected:actor({selectedSkillId:'evasion'}),skillState});
    assert.deepEqual(actions(html,'choose-skill'),[]);
    assert.match(action(html,'selected-skill'),/data-id=""/);
    assert.match(action(html,'selected-skill'),/ disabled>/);
    assert.match(html,/<span class="redline-skill-count" role="status" aria-live="polite">0<\/span>/);
    assert.match(html,skillState.query ? /Ничего не найдено\. Измените запрос или раздел\./ : /Нет доступных навыков в этом разделе\./);
  }
});

test('difficult skills retain the sheet marker without inventing a base or final roll value', () => {
  const selected=actor({selectedSkillId:'lock'});
  selected.skills[2].base=999;
  const html=renderHUD({supported:true,selected,skillState:{category:'techniqueSkills'}});
  assert.match(action(html,'choose-skill'),/title="Выбрать навык: Взлом замков \(x2\)"/);
  assert.match(action(html,'selected-skill'),/aria-label="Бросить — Взлом замков \(x2\)"/);
  assert.doesNotMatch(html,/999|Взлом замков ·/);
});

test('favorites appear as quick rolls at the top of the skills card', () => {
  const html=view(actor({favoriteSkillIds:['perception']}));
  const card=html.slice(html.indexOf('id="redline-skills-panel"'));
  const quick=card.match(/<section class="redline-quick-skills"[^>]*>(.*?)<\/section>/s)[1];
  assert.match(action(quick,'quick-skill'),/data-id="perception"/);
  assert.match(action(quick,'quick-skill'),/aria-label="Бросить — Восприятие"/);
  assert.match(view(actor()),/Нажмите ★ у навыка/);
});

test('other native character rolls remain behind an accessible disclosure and in the more card', () => {
  const closed=view(actor());
  assert.match(closed,/<details class="redline-other-rolls" data-other-rolls>/);
  const html=renderHUD({supported:true,selected:actor(),skillState:{otherRolls:true}});
  const detail=html.match(/<details class="redline-other-rolls" data-other-rolls open>(.*?)<\/details>/s)[1];
  assert.doesNotMatch(action(detail,'initiative'),/ disabled/);
  assert.match(action(detail,'death-save'),/ disabled>/);
  const more=html.slice(html.indexOf('data-card="more"'));
  for(const name of ['initiative','death-save','weapon-load','sheet','refresh','close']) assert.ok(action(more,name),name);
});

test('capabilities disable only unavailable commands and explain their reason', () => {
  const model=actor();
  model.weapons[0].canAttack=false;
  model.weapons[0].reason='Недостаточно патронов: требуется 10.';
  const html=view(model);
  assert.match(action(html,'weapon-attack'),/title="Недостаточно патронов: требуется 10\."/);
  assert.match(action(html,'weapon-attack'),/ disabled>/);
  assert.doesNotMatch(action(html,'weapon-damage'),/ disabled>/);
  assert.match(action(html,'death-save'),/title="Спасбросок смерти доступен при смертельном ранении\."/);
});

test('document text, ids, mode labels and statuses are escaped as data', () => {
  const dangerous='"/><script>alert(1)</script>&\'';
  const model=actor({key:dangerous,name:dangerous,status:dangerous,skills:[{id:dangerous,name:dangerous,category:dangerous}],skillCategories:[{id:dangerous,label:dangerous}]});
  Object.assign(model.weapons[0],{id:dangerous,name:dangerous,mode:dangerous,modes:[{id:dangerous,label:dangerous}],damageLabel:dangerous,canAttack:false,reason:dangerous});
  const html=view(model,{targets:[{name:dangerous}]});
  assert.doesNotMatch(html,/<script>|<\/script>/);
  assert.match(html,/data-subject="&quot;\/&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&#39;"/);
  assert.match(html,/data-mode="&quot;\/&gt;&lt;script&gt;/);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true">&quot;\/&gt;&lt;script&gt;/);
});

test('missing capabilities and action identity remain read-only instead of enabling commands', () => {
  const html=view(actor({key:undefined,revision:undefined,weapons:[{id:'legacy',name:'Старое оружие'}],skills:[],canInitiative:false,canDeathSave:false}));
  for(const tag of buttons(html).filter(tag=>tag.includes('data-subject=')&&!tag.includes('data-action="sheet"'))) assert.match(tag,/ disabled>/);
  assert.match(html,/Нет доступных навыков/);
  assert.doesNotMatch(html,/NaN|undefined|null/);
});

test('without a character the strip collapses to a hint and keeps the more menu', () => {
  const html=renderHUD({supported:true});
  assert.match(html,/class="redline-strip redline-panel is-empty"/);
  assert.match(html,/Выберите токен/);
  assert.ok(toggle(html,'more'));
  for(const id of ['character','weapon','target','skills','history']) assert.equal(toggle(html,id),undefined,id);
});

test('the strip shows a red turn line only when the shown character has the current turn', () => {
  const base={started:true,round:1,canAdvance:false};
  const mine=renderHUD({supported:true,selected:actor(),combat:{...base,combatants:[{id:'a',name:'Ви',current:true,selected:true}]}});
  assert.match(mine,/class="redline-strip redline-panel is-turn"/);
  const other=renderHUD({supported:true,selected:actor(),combat:{...base,combatants:[{id:'a',name:'Ви',current:false,selected:true},{id:'b',name:'Охранник',current:true}]}});
  assert.doesNotMatch(other,/is-turn/);
});
```

- [ ] **Step 2: Новый `tests/encounter-view.test.mjs` (падает)**

`M/tests/encounter-view.test.mjs` целиком:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderActionFeed, renderConditionStrip, renderResultToast, renderHUD } from '../scripts/view.js';

const actor = overrides => ({key:'Actor.owned|Scene.a.Token.b', revision:7, name:'Ви', hp:{value:32,max:40}, skills:[], weapons:[], ...overrides});
const entry = overrides => ({id:'event-1',kind:'weapon-attack',title:'Атака',itemName:'Пистолет',status:'completed',detail:'Бросок отправлен в чат.',nextStep:'Сверьте попадание с ведущим.',total:22,chatMessageId:'msg-1',canRollDamage:true,weaponId:'pistol',...overrides});
const button = (html,action) => [...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).find(tag=>tag.includes(`data-action="${action}"`));

test('action card keeps follow-up actions attached to the exact session entry and current subject', () => {
  const html=renderActionFeed(actor({recentActions:[entry()]}));
  assert.match(html,/data-motion="result" data-result-id="event-1" data-result-status="completed"/);
  assert.match(html,/class="redline-result-total"[^>]*>22<\/strong>/);
  for(const action of ['open-result-chat','result-damage']) {
    const tag=button(html,action);
    assert.ok(tag,action);
    assert.match(tag,/data-entry-id="event-1"/);
    assert.match(tag,/data-subject="Actor\.owned\|Scene\.a\.Token\.b"/);
    assert.match(tag,/data-revision="7"/);
    assert.doesNotMatch(tag,/ disabled/);
  }
  assert.match(html,/Урон при попадании…/);
  assert.match(html,/Сверьте попадание с ведущим/);
});

test('cancelled and failed actions cannot present stale roll totals or damage follow-ups', () => {
  for(const status of ['cancelled','error']) {
    const html=renderActionFeed(actor({recentActions:[entry({status})]}));
    assert.doesNotMatch(html,/class="redline-result-total"|data-action="open-result-chat"|data-action="result-damage"/);
    assert.match(html,new RegExp(`data-result-status="${status}"`));
  }
  for(const total of [null,undefined,Infinity,NaN,'22']) {
    assert.doesNotMatch(renderActionFeed(actor({recentActions:[entry({total})]})),/class="redline-result-total"/);
  }
});

test('incomplete entries expose neither unbound damage actions nor executable labels', () => {
  const html=renderActionFeed(actor({busy:true,recentActions:[entry({title:'<img src=x onerror="alert(1)">',itemName:'<script>x</script>',weaponId:null})]}));
  assert.match(button(html,'open-result-chat'),/ disabled/);
  assert.equal(button(html,'result-damage'),undefined);
  assert.doesNotMatch(html,/<img\b|<script\b/);
  assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(button(renderActionFeed(actor({key:'',recentActions:[entry()]})),'result-damage'),/ disabled/);
});

test('activity history is bounded, starts with the newest event and has a compact empty state', () => {
  const html=renderActionFeed(actor({recentActions:Array.from({length:8},(_,i)=>entry({id:`event-${i}`}))}));
  assert.match(html,/data-result-id="event-0"/);
  assert.equal([...html.matchAll(/<li\b/g)].length,4);
  assert.match(html,/<ol class="redline-action-history" aria-label="Ранее в этой сессии">/);
  const empty=renderActionFeed(actor({recentActions:[]}));
  assert.match(empty,/Здесь появятся действия этой сессии/);
  assert.doesNotMatch(empty,/data-result-id|data-action="result-damage"/);
});

test('the result toast shows only the newest entry the host asked for', () => {
  const model=actor({recentActions:[entry({id:'event-2',total:17}),entry()]});
  const toast=renderResultToast(model,'event-2');
  assert.match(toast,/<aside class="redline-toast redline-panel" data-result-id="event-2"/);
  assert.match(toast,/class="redline-result-total"[^>]*>17<\/strong>/);
  assert.ok(button(toast,'result-damage'));
  assert.equal(renderResultToast(model,'event-1'),'');
  assert.equal(renderResultToast(model,null),'');
  assert.equal(renderResultToast(actor({recentActions:[]}),'event-2'),'');
  assert.doesNotMatch(renderResultToast(actor({recentActions:[entry({title:'<script>x</script>'})]}),'event-1'),/<script>/);
});

test('condition projection renders only supplied state and escapes effect labels', () => {
  assert.equal(renderConditionStrip(actor()),'');
  const html=renderConditionStrip(actor({healthStatus:{label:'Тяжёлое ранение',tone:'low',detail:'Состояние из системы'},conditions:[{id:'x',label:'Оглушён'},{id:'unsafe',label:'<script>alert(1)</script>'}]}));
  assert.match(html,/data-health-tone="low"/);
  assert.match(html,/Состояние из системы/);
  assert.match(html,/data-condition-id="x" title="Оглушён">Оглушён/);
  assert.doesNotMatch(html,/<script\b/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('the history card and its toggle appear only after an action in this session', () => {
  const none=renderHUD({supported:true,selected:actor({recentActions:[]})});
  assert.doesNotMatch(none,/data-action="toggle-card" data-id="history"|data-card="history"/);
  const html=renderHUD({supported:true,selected:actor({recentActions:[entry()]}),resultEntryId:'event-1'});
  assert.match(html,/data-action="toggle-card" data-id="history"/);
  assert.match(html.slice(html.indexOf('data-card="history"')),/class="redline-action-feed"/);
  assert.match(html,/class="redline-toast redline-panel" data-result-id="event-1"/);
  assert.doesNotMatch(renderHUD({supported:true,selected:actor({recentActions:[entry()]})}),/redline-toast/);
});
```

- [ ] **Step 3: Тесты падают**

Run: `node --test tests/view.test.mjs tests/encounter-view.test.mjs`
Expected: FAIL — `does not provide an export named 'CARD_IDS'` / `'renderResultToast'`.

- [ ] **Step 4: Новый `scripts/view.js`**

`M/scripts/view.js` целиком:

```js
/** HTML presentation only. All permissions and native actions belong to the host. */
import { selectedWeapon, normalizeInterfaceScale, hpSegments, MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE } from './presentation.js';
import { skillCatalog, skillName } from './skills.js';

/** Cards open one at a time above their strip element. */
export const CARD_IDS = Object.freeze(['character', 'weapon', 'target', 'skills', 'history', 'more']);
const HP_SEGMENTS = 10;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]));
const numberLabel = value => Number.isFinite(value) ? escapeHTML(value) : '—';
const icon = name => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
const safeImage = source => {
  if (typeof source !== 'string' || !source.trim()) return '';
  const normalized = source.trim().replace(/[\u0000-\u0020\u007f]/g, '');
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^https?:/i.test(normalized) ? '' : source.trim();
};

function portrait(entity, large = false) {
  const source = safeImage(entity?.img);
  return `<span class="redline-portrait${large ? ' redline-portrait-large' : ''}" aria-hidden="true">${source ? `<img src="${escapeHTML(source)}" alt="" loading="lazy">` : icon('fa-user')}</span>`;
}

function combatantView(combatant) {
  const classes = ['redline-unit', combatant.current ? 'is-current' : '', combatant.selected ? 'is-selected' : '', combatant.defeated ? 'is-defeated' : ''].filter(Boolean).join(' ');
  const status = [combatant.current ? 'Ход сейчас' : '', combatant.selected ? 'Выбран' : '', combatant.defeated ? 'Побеждён' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="${classes}" data-action="select-combatant" data-id="${escapeHTML(combatant.id)}" aria-pressed="${Boolean(combatant.selected)}" title="${escapeHTML(combatant.name)}${status ? ` · ${escapeHTML(status)}` : ''}${combatant.selectable ? ' · Показать персонажа на полосе; ход не меняется' : ' · Нет прав на персонажа'}"${combatant.selectable ? '' : ' disabled'}>
    ${portrait(combatant)}<span class="redline-unit-name"><strong>${escapeHTML(combatant.name || 'Участник')}</strong><small>${escapeHTML(status || 'Участник боя')}</small></span><span class="redline-initiative" aria-label="Инициатива">${numberLabel(combatant.initiative)}</span>
  </button>`;
}

const subjectAttributes = actor => `data-subject="${escapeHTML(actor.key)}" data-revision="${escapeHTML(actor.revision)}"`;
const hasActionSubject = actor => typeof actor.key === 'string' && actor.key.length > 0
  && actor.revision !== undefined && actor.revision !== null && Number.isFinite(Number(actor.revision));

function actionButton(actor, { action, id, mode, label, allowed = true, reason = 'Действие недоступно.', title = label, icon: glyph = '', iconOnly = false, className = '' }) {
  const enabled = !actor.busy && hasActionSubject(actor) && allowed;
  const tooltip = actor.busy ? 'Дождитесь завершения текущего действия.' : enabled ? title : reason;
  return `<button type="button" class="redline-action-button ${className}${iconOnly ? ' redline-action-icon' : ''}" data-action="${escapeHTML(action)}"${id === undefined ? '' : ` data-id="${escapeHTML(id)}"`}${mode === undefined ? '' : ` data-mode="${escapeHTML(mode)}"`} ${subjectAttributes(actor)} title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(title)}"${enabled ? '' : ' disabled'}>${glyph ? icon(glyph) : ''}${iconOnly ? '' : `<span>${escapeHTML(label)}</span>`}</button>`;
}

const weaponsOf = actor => Array.isArray(actor?.weapons) ? actor.weapons.filter(Boolean) : [];
const favoriteIds = actor => new Set((Array.isArray(actor?.favoriteSkillIds) ? actor.favoriteSkillIds : []).map(String));
const ammoStateOf = weapon => !weapon.ammo ? 'melee' : !Number.isFinite(weapon.ammo.value) ? 'unknown'
  : weapon.ammo.value <= 0 ? 'empty' : Number.isFinite(weapon.ammo.max) && weapon.ammo.max > 0 && weapon.ammo.value / weapon.ammo.max <= .25 ? 'low' : 'ready';
const weaponMeta = weapon => `${weapon.damageLabel ? `<span>${escapeHTML(weapon.damageLabel)}</span>` : ''}${Number.isFinite(weapon.rof) ? `<span>ROF ${numberLabel(weapon.rof)}</span>` : ''}`;

/** The native wound tone wins; the HP share is only the legacy fallback when the system supplies none. */
function vitalToneOf(actor) {
  if (['normal','low','critical','unknown'].includes(actor.healthStatus?.tone)) return actor.healthStatus.tone;
  const hp = actor.hp;
  if (!hp || !Number.isFinite(hp.value) || !Number.isFinite(hp.max) || hp.max <= 0) return 'unknown';
  const percent = Math.max(0, Math.min(100, hp.value / hp.max * 100));
  return percent <= 25 ? 'critical' : percent <= 50 ? 'low' : 'normal';
}
function armorPair(actor) {
  const armor = Array.isArray(actor.armor) ? actor.armor : [];
  const part = prefix => armor.find(item => String(item?.name || '').startsWith(prefix));
  return {head:part('Голова'), body:part('Тело')};
}
const conditionsOf = actor => (Array.isArray(actor.conditions) ? actor.conditions : [])
  .filter(condition => condition && typeof condition.label === 'string' && condition.label.trim());
const conditionIcon = condition => String(condition.id || '').startsWith('injury:') ? 'fa-droplet' : 'fa-bolt';

function cardToggle(id, openCard, { label, content, className = '', attributes = '', disabled = false }) {
  const controls = id === 'skills' ? 'redline-skills-panel' : `redline-card-${id}`;
  return `<button type="button" class="redline-cell-button ${className}" data-action="toggle-card" data-id="${id}"${attributes} aria-expanded="${openCard === id}" aria-controls="${controls}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"${disabled ? ' disabled' : ''}>${content}</button>`;
}

// tabindex="-1": an opened card takes focus itself, so Escape and arrows work even without buttons inside.
function card(id, openCard, label, body, className = '') {
  return `<section id="redline-card-${id}" class="redline-card redline-panel ${className}" data-card="${id}" data-motion="card" role="dialog" aria-label="${escapeHTML(label)}" tabindex="-1"${openCard === id ? '' : ' hidden'}><header class="redline-card-header">${escapeHTML(label)}</header>${body}</section>`;
}

function healthCell(actor) {
  const hp = actor.hp;
  const lit = hpSegments(hp, HP_SEGMENTS);
  const segments = Array.from({length:HP_SEGMENTS}, (_, index) => lit !== null && index < lit ? '<i class="is-lit"></i>' : '<i></i>').join('');
  const {head, body} = armorPair(actor);
  const conditions = conditionsOf(actor);
  const shown = conditions.slice(0, 3);
  const number = hp && Number.isFinite(hp.value) ? `<b class="redline-num">${numberLabel(hp.value)}</b><small>/${numberLabel(hp.max)}</small>` : '<small class="redline-unavailable">HP —</small>';
  return `<span class="redline-hp" data-vital-tone="${vitalToneOf(actor)}" data-hp-value="${Number.isFinite(hp?.value) ? hp.value : ''}" data-hp-max="${Number.isFinite(hp?.max) ? hp.max : ''}"><span class="redline-segments" data-lit="${lit ?? ''}" aria-hidden="true">${segments}</span>${number}</span><span class="redline-sp" title="SP: голова · тело">SP ${numberLabel(head?.sp)}·${numberLabel(body?.sp)}</span>${shown.length ? `<span class="redline-conditions">${shown.map(condition => `<span class="redline-condition-icon" data-condition-id="${escapeHTML(condition.id)}" title="${escapeHTML(condition.label)}">${icon(conditionIcon(condition))}</span>`).join('')}${conditions.length > 3 ? `<small>+${conditions.length - 3}</small>` : ''}</span>` : ''}`;
}

/** Conditions are supplied by the read-only actor projection; no inference from portraits or HP. */
export function renderConditionStrip(actor) {
  const health = actor.healthStatus;
  const conditions = conditionsOf(actor);
  if (!health?.label && !conditions.length) return '';
  const tone = ['normal', 'low', 'critical', 'unknown'].includes(health?.tone) ? health.tone : 'unknown';
  return `<div class="redline-condition-strip" aria-label="Состояние персонажа">${health?.label ? `<span class="redline-health-state" data-health-tone="${tone}" title="${escapeHTML(health.detail || health.label)}">${icon(tone === 'critical' ? 'fa-heart-crack' : 'fa-heart-pulse')}<span>${escapeHTML(health.label)}</span></span>` : ''}${conditions.map(condition => `<span class="redline-condition" data-condition-id="${escapeHTML(condition.id)}" title="${escapeHTML(condition.label)}">${escapeHTML(condition.label)}</span>`).join('')}</div>`;
}

function characterCard(actor, openCard) {
  const {head, body} = armorPair(actor);
  return card('character', openCard, 'Персонаж', `<div class="redline-card-body">
    <div class="redline-card-identity">${portrait(actor, true)}<div><strong title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</strong><span class="redline-card-hp">HP <b>${numberLabel(actor.hp?.value)}</b> / ${numberLabel(actor.hp?.max)}</span></div></div>
    ${renderConditionStrip(actor) || '<p class="redline-muted">Ранений, травм и активных эффектов нет.</p>'}
    <dl class="redline-armor-list"><div><dt>Голова</dt><dd>SP ${numberLabel(head?.sp)}</dd></div><div><dt>Тело</dt><dd>SP ${numberLabel(body?.sp)}</dd></div></dl>
    ${actionButton(actor, {action:'sheet', label:'Открыть лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}
  </div>`, 'redline-card-character');
}

function weaponCard(actor, weapon, openCard) {
  const weapons = weaponsOf(actor);
  const disabled = actor.busy || !hasActionSubject(actor);
  const modes = Array.isArray(weapon?.modes) ? weapon.modes : [];
  const list = weapons.length ? `<div class="redline-weapon-list">${weapons.map(item => {
    const active = String(item.id) === String(weapon?.id);
    return `<button type="button" class="redline-weapon-row" data-action="choose-weapon" data-id="${escapeHTML(item.id)}" ${subjectAttributes(actor)} aria-pressed="${active}" title="Показать на полосе: ${escapeHTML(item.name || 'Оружие')}"${disabled ? ' disabled' : ''}>${icon(item.ammo ? 'fa-gun' : 'fa-hand-fist')}<span class="redline-weapon-row-name">${escapeHTML(item.name || 'Оружие')}</span><span class="redline-weapon-meta">${weaponMeta(item)}</span><span class="redline-weapon-row-ammo" data-ammo-state="${ammoStateOf(item)}">${item.ammo ? `${numberLabel(item.ammo.value)}/${numberLabel(item.ammo.max)}` : 'ближн.'}</span></button>`;
  }).join('')}</div>` : '<p class="redline-muted">Экипируйте оружие в листе персонажа — оно появится здесь.</p>';
  const chips = weapon ? `<div class="redline-mode-chips" role="group" aria-label="Режим: ${escapeHTML(weapon.name || 'Оружие')}">${modes.length ? modes.map(mode => `<button type="button" class="redline-mode-chip" data-action="choose-mode" data-id="${escapeHTML(weapon.id)}" data-mode="${escapeHTML(mode.id)}" ${subjectAttributes(actor)} aria-pressed="${String(mode.id) === String(weapon.mode)}"${disabled ? ' disabled' : ''}>${escapeHTML(mode.label || mode.id)}</button>`).join('') : '<span class="redline-muted">Режимы недоступны</span>'}</div>` : '';
  const load = weapon ? actionButton(actor, {action:'weapon-load', id:weapon.id, mode:weapon.mode, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open'}) : '';
  return card('weapon', openCard, 'Оружие', `<div class="redline-card-body">${list}${chips}${load}<p class="redline-card-note">Выбор меняет только полосу; экипировка в листе не меняется.</p></div>`, 'redline-card-weapon');
}

function targetCard(targets, openCard) {
  return card('target', openCard, targets.length > 1 ? `Цели · ${targets.length}` : 'Цель', `<div class="redline-card-body" aria-label="Цели атаки">${targets.length ? `<ul class="redline-target-list">${targets.map(target => `<li>${portrait(target)}<span>${escapeHTML(target.name || 'Цель')}</span></li>`).join('')}</ul>` : '<p class="redline-muted">Цель не выбрана.</p>'}<p class="redline-card-note">Цель отмечается штатной отметкой T на сцене.</p></div>`, 'redline-card-target');
}

function moreCard(actor, weapon, openCard) {
  const rolls = actor ? `${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}${weapon ? actionButton(actor, {action:'weapon-load', id:weapon.id, mode:weapon.mode, label:'Выбрать патроны', title:`Выбрать патроны: ${weapon.name}`, allowed:Boolean(weapon.canLoad), reason:'Выбор патронов для этого оружия недоступен.', icon:'fa-box-open'}) : ''}${actionButton(actor, {action:'sheet', label:'Открыть лист', title:'Открыть лист персонажа', allowed:Boolean(actor.canOpenSheet), reason:'Нет доступа к листу персонажа.', icon:'fa-file-lines'})}` : '';
  return card('more', openCard, 'Ещё', `<div class="redline-card-body redline-menu">${rolls}<button type="button" class="redline-action-button" data-action="refresh" title="Перечитать данные мира без изменения документов">${icon('fa-rotate-right')}<span>Обновить</span></button><button type="button" class="redline-action-button" data-action="close" title="Скрыть REDLINE (Shift+R)">${icon('fa-eye-slash')}<span>Скрыть HUD</span></button></div>`, 'redline-card-more');
}

const categoryIcons = {
  all:'fa-table-cells-large', awarenessSkills:'fa-eye', bodySkills:'fa-person-running',
  controlSkills:'fa-compass', educationSkills:'fa-graduation-cap', fightingSkills:'fa-hand-fist',
  performanceSkills:'fa-masks-theater', rangedweaponSkills:'fa-crosshairs',
  socialSkills:'fa-user-group', techniqueSkills:'fa-gear',
};

function skillEntry(actor, skill, selected, disabled, favorites) {
  const active = skill.id === selected?.id;
  const favorite = favorites.has(String(skill.id));
  const name = skillName(skill);
  const favoriteLabel = `${favorite ? 'Убрать из избранного' : 'Добавить в избранное'}: ${name}`;
  return `<div class="redline-skill-entry${active ? ' is-selected' : ''}" data-motion="skill" data-skill-id="${escapeHTML(skill.id)}">
    <button type="button" class="redline-skill-row" data-action="choose-skill" data-id="${escapeHTML(skill.id)}" ${subjectAttributes(actor)} aria-pressed="${active}" title="Выбрать навык: ${escapeHTML(name)}"${disabled ? ' disabled' : ''}><span>${escapeHTML(name)}</span>${active ? icon('fa-check') : ''}</button>
    <button type="button" class="redline-skill-star" data-action="toggle-skill-favorite" data-id="${escapeHTML(skill.id)}" ${subjectAttributes(actor)} aria-pressed="${favorite}" aria-label="${escapeHTML(favoriteLabel)}" title="${escapeHTML(favoriteLabel)}"${disabled ? ' disabled' : ''}>${icon('fa-star')}</button>
  </div>`;
}

function quickSkills(actor) {
  const ids = favoriteIds(actor);
  const favorites = (Array.isArray(actor.skills) ? actor.skills : []).filter(skill => skill && ids.has(String(skill.id))).slice(0, 8);
  return `<section class="redline-quick-skills" aria-label="Избранные навыки">${icon('fa-star')}<div class="redline-quick-list">${favorites.length ? favorites.map(skill => `<span class="redline-quick-item" data-motion="favorite" data-skill-id="${escapeHTML(skill.id)}">${actionButton(actor, {action:'quick-skill', id:skill.id, label:skillName(skill), title:`Бросить — ${skillName(skill)}`, icon:'fa-dice', className:'redline-quick-skill'})}</span>`).join('') : '<span class="redline-quick-hint">Нажмите ★ у навыка — он появится здесь для быстрого броска.</span>'}</div></section>`;
}

export function renderSkillsPanel(actor, open, state = {}) {
  const catalog = skillCatalog(actor, state);
  const disabled = actor.busy || !hasActionSubject(actor);
  const selected = catalog.selected;
  const favorites = favoriteIds(actor);
  return `<section id="redline-skills-panel" class="redline-card redline-panel redline-card-skills" data-card="skills" data-motion="card" role="dialog" aria-label="Навыки и броски персонажа" tabindex="-1"${open ? '' : ' hidden'}>
    <header class="redline-popover-header"><div><span class="redline-eyebrow">КАТАЛОГ ПЕРСОНАЖА</span><strong>Навыки</strong><span class="redline-skill-actor" title="${escapeHTML(actor.name)}">${escapeHTML(actor.name || 'Персонаж')}</span></div><button type="button" data-action="close-card" class="redline-action-icon" aria-label="Закрыть навыки" title="Закрыть навыки">${icon('fa-xmark')}</button></header>
    ${quickSkills(actor)}
    <div class="redline-skill-tools"><label class="redline-skill-search">${icon('fa-magnifying-glass')}<span class="redline-sr-only">Поиск навыка в выбранном разделе</span><input type="search" data-skill-search ${subjectAttributes(actor)} value="${escapeHTML(catalog.query)}" placeholder="Найти навык…" autocomplete="off" spellcheck="false" maxlength="200" aria-label="Поиск навыка в выбранном разделе" aria-controls="redline-skill-results"${disabled ? ' disabled' : ''}></label><button type="button" class="redline-favorites-filter" data-action="skill-favorites" ${subjectAttributes(actor)} aria-pressed="${Boolean(state.favoritesOnly)}" aria-controls="redline-skill-results" title="Показать избранные навыки в выбранном разделе"${disabled ? ' disabled' : ''}>${icon('fa-star')}<span>Избранное</span></button></div>
    <div class="redline-skill-catalog">
      <nav class="redline-skill-categories" aria-label="Разделы навыков листа персонажа">${catalog.categories.map(category => `<button type="button" data-action="skill-category" data-id="${escapeHTML(category.id)}" ${subjectAttributes(actor)} aria-pressed="${category.id === catalog.category}" title="${escapeHTML(category.label)}"${disabled ? ' disabled' : ''}>${icon(categoryIcons[category.id] || 'fa-list')}<span>${escapeHTML(category.label)}</span></button>`).join('')}</nav>
      <section class="redline-skill-results" id="redline-skill-results" aria-label="Навыки выбранного раздела"><header><strong>${escapeHTML(catalog.heading)}</strong><span class="redline-skill-count" role="status" aria-live="polite">${catalog.skills.length}</span></header><div class="redline-skill-list">${catalog.skills.length ? catalog.skills.map(skill => skillEntry(actor, skill, selected, disabled, favorites)).join('') : `<p class="redline-skill-empty">${catalog.query.trim() ? 'Ничего не найдено. Измените запрос или раздел.' : state.favoritesOnly ? 'В этом разделе пока нет избранных навыков. Добавьте их с помощью звезды.' : 'Нет доступных навыков в этом разделе.'}</p>`}</div></section>
    </div>
    <footer class="redline-skill-footer"><div class="redline-skill-roll">${actionButton(actor, {action:'selected-skill', id:selected?.id || '', label:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', title:selected ? `Бросить — ${skillName(selected)}` : 'Выберите навык', icon:'fa-dice', allowed:Boolean(selected), reason:'В выбранном разделе нет доступного навыка.', className:'redline-skill-primary'})}<p class="redline-action-note redline-muted">Откроется диалог броска · ★ добавляет навык в быстрый бросок.</p></div><details class="redline-other-rolls" data-other-rolls${state.otherRolls ? ' open' : ''}><summary>Другие броски ${icon('fa-chevron-down')}</summary><div class="redline-character-actions" aria-label="Броски персонажа">${actionButton(actor, {action:'initiative', label:'Инициатива', icon:'fa-bolt', allowed:Boolean(actor.canInitiative), reason:'Добавьте этого персонажа в бой, чтобы бросить инициативу.'})}${actionButton(actor, {action:'death-save', label:'Спасбросок смерти', icon:'fa-skull', allowed:Boolean(actor.canDeathSave), reason:'Спасбросок смерти доступен при смертельном ранении.'})}</div></details></footer>
  </section>`;
}

const actionStates = {
  completed: {label:'Выполнено',icon:'fa-check'},
  cancelled: {label:'Отменено',icon:'fa-ban'},
  error: {label:'Не завершено',icon:'fa-triangle-exclamation'},
};
const recentEntries = actor => (Array.isArray(actor?.recentActions) ? actor.recentActions : [])
  .filter(entry => entry && Object.hasOwn(actionStates, entry.status)).slice(0, 5);

function resultButton(actor, entry, action, label, glyph) {
  return `<button type="button" class="redline-action-button redline-result-button${action === 'result-damage' ? ' redline-result-followup' : ''}" data-action="${action}" data-entry-id="${escapeHTML(entry.id)}" ${subjectAttributes(actor)} title="${escapeHTML(label)}"${actor.busy || !hasActionSubject(actor) ? ' disabled' : ''}>${icon(glyph)}<span>${escapeHTML(label)}</span></button>`;
}

function resultBlock(actor, entry, tag = 'article') {
  const state = actionStates[entry.status];
  const completed = entry.status === 'completed';
  const hasTotal = completed && Number.isFinite(entry.total);
  const actions = `${completed && typeof entry.chatMessageId === 'string' && entry.chatMessageId ? resultButton(actor, entry, 'open-result-chat', 'Открыть чат', 'fa-comment-dots') : ''}${completed && entry.canRollDamage && entry.weaponId ? resultButton(actor, entry, 'result-damage', 'Урон при попадании…', 'fa-burst') : ''}`;
  return `<${tag} class="redline-result-card" data-motion="result" data-result-id="${escapeHTML(entry.id)}" data-result-status="${escapeHTML(entry.status)}"><header class="redline-result-heading"><span class="redline-result-state">${icon(state.icon)}${state.label}</span>${hasTotal ? `<strong class="redline-result-total" aria-label="Результат броска: ${numberLabel(entry.total)}">${numberLabel(entry.total)}</strong>` : ''}</header><h3 class="redline-result-title">${escapeHTML(entry.title || 'Действие системы')}${entry.itemName ? `<span>${escapeHTML(entry.itemName)}</span>` : ''}</h3>${entry.detail ? `<p class="redline-result-detail">${escapeHTML(entry.detail)}</p>` : ''}${entry.nextStep ? `<p class="redline-result-next">${icon('fa-arrow-turn-down')}<span>${escapeHTML(entry.nextStep)}</span></p>` : ''}${actions ? `<div class="redline-result-actions">${actions}</div>` : ''}</${tag}>`;
}

/** Session-local action feedback for the history card. Native chat remains the source for adjudicating the roll. */
export function renderActionFeed(actor) {
  const entries = recentEntries(actor);
  if (!entries.length) return '<p class="redline-muted">Здесь появятся действия этой сессии: атака → диалог → результат в чате.</p>';
  return `<section class="redline-action-feed" aria-label="Последние действия персонажа">${resultBlock(actor, entries[0])}${entries.length > 1 ? `<ol class="redline-action-history" aria-label="Ранее в этой сессии">${entries.slice(1).map(entry => `<li data-result-status="${escapeHTML(entry.status)}"><span class="redline-history-state" title="${actionStates[entry.status].label}">${icon(actionStates[entry.status].icon)}</span><span class="redline-history-copy"><strong>${escapeHTML(entry.title || 'Действие системы')}${entry.itemName ? `<span> · ${escapeHTML(entry.itemName)}</span>` : ''}</strong>${entry.detail ? `<small>${escapeHTML(entry.detail)}</small>` : ''}</span><span class="redline-history-label">${actionStates[entry.status].label}</span></li>`).join('')}</ol>` : ''}</section>`;
}

/** The newest entry pops up above the strip while the host keeps entryId set. */
export function renderResultToast(actor, entryId) {
  const latest = recentEntries(actor)[0];
  if (!latest || !entryId || latest.id !== entryId) return '';
  return `<aside class="redline-toast redline-panel" data-result-id="${escapeHTML(latest.id)}" aria-label="Результат действия" aria-live="polite">${resultBlock(actor, latest, 'div')}</aside>`;
}

function feedbackView(actor) {
  const status = actor?.status || (actor?.busy ? 'Выполняется действие системы…' : '');
  const tone = ['info', 'success', 'error'].includes(actor?.statusTone) ? actor.statusTone : 'info';
  const glyph = actor?.busy ? 'fa-spinner' : tone === 'success' ? 'fa-circle-check' : tone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  return `<div class="redline-feedback${actor?.busy ? ' is-busy' : ''}" data-status-tone="${escapeHTML(tone)}"${status ? '' : ' hidden'}>${icon(glyph)}<p class="redline-action-status" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(status)}</p></div>`;
}

function queueView(combat, combatants) {
  const turn = combat.canAdvance || combat.pending ? `<div class="redline-turn-control"><button type="button" data-action="next-turn" class="redline-next" title="GM: сменить текущий ход через трекер Foundry"${combat.canAdvance && !combat.pending ? '' : ' disabled'}>${combat.pending ? 'Обновление…' : 'Следующий ход'}</button></div>` : '';
  return `<div class="redline-top"><section class="redline-combat redline-panel" aria-label="Очередь инициативы"><div class="redline-round"><small>РАУНД</small><strong>${numberLabel(combat.round)}</strong></div><div class="redline-queue" aria-label="Участники боя">${combatants.map(combatantView).join('')}</div>${turn}</section></div>`;
}

function scaleGrip(scale) {
  return `<span class="redline-scale-grip" role="slider" tabindex="0" aria-label="Масштаб REDLINE" aria-valuemin="${MIN_INTERFACE_SCALE}" aria-valuemax="${MAX_INTERFACE_SCALE}" aria-valuenow="${scale}" aria-valuetext="${scale}%" title="Тяните, чтобы изменить размер · двойной щелчок — 80%"><output class="redline-scale-readout">${scale}%</output></span>`;
}

function stripView(actor, targets, openCard, { scale, isTurn, skillState }) {
  const weapon = actor ? selectedWeapon(actor) : null;
  const more = `<div class="redline-cell" data-cell="more">${cardToggle('more', openCard, {label:'Ещё: броски, лист, обновить, скрыть', className:'redline-cell-icon', content:icon('fa-ellipsis')})}${moreCard(actor, weapon, openCard)}</div>`;
  if (!actor) return `<div class="redline-strip redline-panel is-empty" data-actor-key=""><span class="redline-strip-empty">${icon('fa-crosshairs')}<span>Выберите токен</span></span><div class="redline-strip-actions">${more}</div>${scaleGrip(scale)}</div>`;
  const weaponButton = (action, label, ability, fallback, glyph, extra = {}) => actionButton(actor, {action, id:weapon?.id, mode:weapon?.mode, label, allowed:Boolean(weapon?.[ability]), reason:weapon?.reason || fallback, title:`${label}: ${weapon?.name || 'Оружие не выбрано'}`, icon:glyph, ...extra});
  const emptyMagazine = Boolean(weapon?.ammo && Number.isFinite(weapon.ammo.value) && weapon.ammo.value <= 0);
  const name = actor.name || 'Персонаж';
  const weaponContent = weapon
    ? `${icon(weapon.ammo ? 'fa-gun' : 'fa-hand-fist')}<span class="redline-strip-text">${escapeHTML(weapon.name || 'Оружие')}</span>${weapon.ammo ? `<span class="redline-ammo" data-ammo-state="${ammoStateOf(weapon)}"><b class="redline-num" data-vital="ammo">${numberLabel(weapon.ammo.value)}</b><small>/${numberLabel(weapon.ammo.max)}</small></span>` : '<small class="redline-muted">ближн.</small>'}`
    : `${icon('fa-gun')}<span class="redline-strip-text redline-muted">Нет оружия</span>`;
  const first = targets[0];
  const history = recentEntries(actor).length ? `<div class="redline-cell" data-cell="history">${cardToggle('history', openCard, {label:'История действий этой сессии', className:'redline-cell-icon', content:icon('fa-clock-rotate-left')})}${card('history', openCard, 'История', `<div class="redline-card-body">${renderActionFeed(actor)}</div>`, 'redline-card-history')}</div>` : '';
  return `<div class="redline-strip redline-panel${isTurn ? ' is-turn' : ''}" data-actor-key="${escapeHTML(actor.key)}" aria-label="REDLINE: ${escapeHTML(name)}" aria-busy="${Boolean(actor.busy)}">
    <div class="redline-cell" data-cell="character">${cardToggle('character', openCard, {label:`Персонаж: ${name}`, className:'redline-cell-actor', content:`${portrait(actor)}<strong class="redline-strip-text redline-strip-name">${escapeHTML(name)}</strong>${healthCell(actor)}`})}${characterCard(actor, openCard)}</div>
    <div class="redline-cell" data-cell="weapon">${cardToggle('weapon', openCard, {label:weapon ? `Оружие: ${weapon.name || 'Оружие'}` : 'Оружие не экипировано', className:'redline-cell-weapon', attributes:weapon ? ` data-weapon-id="${escapeHTML(weapon.id)}"` : '', content:weaponContent})}${weaponCard(actor, weapon, openCard)}</div>
    <div class="redline-cell" data-cell="target">${cardToggle('target', openCard, {label:targets.length ? `Цели: ${targets.map(target => target.name || 'Цель').join(', ')}` : 'Цель не выбрана', className:'redline-cell-target', content:`${first ? portrait(first) : icon('fa-crosshairs')}<span class="redline-strip-text${first ? '' : ' redline-muted'}">${first ? escapeHTML(first.name || 'Цель') : 'Нет цели'}</span>${targets.length > 1 ? `<small>+${targets.length - 1}</small>` : ''}`})}${targetCard(targets, openCard)}</div>
    <div class="redline-strip-actions">${weaponButton('weapon-attack', 'Атака', 'canAttack', 'Выберите доступное оружие в листе персонажа.', 'fa-crosshairs', {className:'redline-action-primary'})}${weaponButton('weapon-damage', 'Урон', 'canDamage', 'Для этого режима нет отдельного броска урона.', 'fa-burst', {iconOnly:true})}${weaponButton('weapon-reload', 'Перезарядить', 'canReload', 'Это оружие не поддерживает перезарядку.', 'fa-arrows-rotate', {iconOnly:true, className:emptyMagazine ? 'is-urgent' : ''})}<div class="redline-cell" data-cell="skills">${cardToggle('skills', openCard, {label:'Навыки', className:'redline-cell-icon', content:icon('fa-list')})}${renderSkillsPanel(actor, openCard === 'skills', skillState)}</div>${history}${more}</div>
    ${scaleGrip(scale)}
  </div>`;
}

export function renderHUD(model = {}) {
  const combat = model.combat || {};
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const targets = Array.isArray(model.targets) ? model.targets : [];
  const scale = normalizeInterfaceScale(model.interfaceScale);
  const openCard = CARD_IDS.includes(model.openCard) ? model.openCard : null;
  const actor = model.selected || null;
  const isTurn = Boolean(actor && combat.started && combatants.some(combatant => combatant.current && combatant.selected));
  const notices = [model.error ? `<p class="redline-status redline-error" role="alert">${escapeHTML(model.error)}</p>` : '', !model.supported ? `<p class="redline-status" role="status">Система ${escapeHTML(model.systemName || 'мира')} не поддерживается. Действия доступны для Cyberpunk RED.</p>` : ''].join('');
  return `<div class="redline-interface redline-neon${model.hasHostBar ? ' has-host-bar' : ''}" data-layout="neon-strip" data-scale="${scale}" data-animations="${model.animationsEnabled !== false}">
    ${combat.started ? queueView(combat, combatants) : ''}
    ${notices ? `<aside class="redline-notices" aria-label="Состояние модуля">${notices}</aside>` : ''}
    <div class="redline-bottom"><div class="redline-strip-wrap">${actor ? renderResultToast(actor, model.resultEntryId) : ''}${feedbackView(actor)}${stripView(actor, targets, openCard, {scale, isTurn, skillState:model.skillState})}</div></div>
  </div>`;
}
```

- [ ] **Step 5: Тесты проходят**

Run: `node --test tests/view.test.mjs tests/encounter-view.test.mjs`
Expected: все PASS. Если тест `'every card has an accessible toggle…'` падает на `history` — проверить, что в модели теста есть `recentActions` (история рендерится только при записях).

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/scripts/view.js foundry/redline-combat/tests/view.test.mjs foundry/redline-combat/tests/encounter-view.test.mjs && git commit -m "Отображение: неоновая полоса, карточки над элементами, тост результата"
```

---

### Task 5: `main.js` — карточки, тост, захват масштаба

**Files:**
- Rewrite: `M/scripts/main.js`

Модульных тестов у `main.js` нет — его проверяет живой сценарий (Task 8). Здесь проверка — синтаксис ES-модуля и полный набор тестов.

- [ ] **Step 1: Новый `scripts/main.js`**

`M/scripts/main.js` целиком:

```js
import { MODULE_ID, projectHUD, resolveSubject, ownsActor, visibleCombatant } from "./state.js";
import { renderHUD, renderSkillsPanel, CARD_IDS } from "./view.js";
import { skillCatalog } from './skills.js';
import { createActionRunner, ActionRejected, resolveActionSubject } from './actions.js';
import { weaponCapabilities, equippedWeapons } from './capabilities.js';
import { safeInsets, cardMaxHeight, panelSizing, normalizeInterfaceScale, scaleFromDrag, DEFAULT_INTERFACE_SCALE, MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE } from './presentation.js';
import { favoriteSkillIds, toggleFavoriteSkill, favoriteStoreWith } from './preferences.js';
import { captureHUD, animateHUD, animateSkillResults, closeDrawer } from './motion.js';
import { describeAction, actionEntry, appendAction, projectRecentActions, canReadResultMessage } from './encounter.js';

const modulePath = `modules/${MODULE_ID}`;
const RESULT_TOAST_MS = 12000;
let hud = null;
let ready = false;
let selectedCombatantId = null;
let turnPending = false;
let revision = 0;
let actionBusy = false;
let actionStatus = '';
let actionStatusTone = 'info';
const recentActions = new Map();
let actionSequence = 0;
const weaponModes = new Map();
const selectedSkills = new Map();
const selectedWeapons = new Map();
const skillStates = new Map();
// One card at a time on this client: {subject, id}. The subject is '' while no character is selected.
let openCard = null;
let drawerSequence = 0;
// Newest result popup: {subject, entryId}. A timer hides it unless the pointer or focus is inside.
let resultToast = null;
let resultTimer = null;
let favoriteWrites = Promise.resolve();
let systemAdapter;
const executeAction = createActionRunner({
  getContext: worldContext,
  getSystem: async () => {
    systemAdapter ??= import(foundry.utils.getRoute('systems/cyberpunk-red-core/modules/chat/cpr-chat.js'))
      .then(({default:chat}) => ({renderRollCard: roll => chat.RenderRollCard(roll)}));
    return systemAdapter;
  },
  onBusy: value => {actionBusy=value;hud?.refresh();},
  onStatus: value => {actionStatus=value;actionStatusTone='info';hud?.scheduleRefresh();},
});

const cardButton = id => `[data-action="toggle-card"][data-id="${id}"]`;
const skillsSubject = () => openCard?.id === 'skills' ? openCard.subject : null;
function forgetCard() { openCard = null; drawerSequence++; }

function showResult(subject, entryId) {
  resultToast = {subject, entryId};
  clearTimeout(resultTimer);
  const hide = () => {
    const toast = hud?.element?.[0]?.querySelector('.redline-toast');
    if (toast && (toast.matches(':hover') || toast.contains(document.activeElement))) { resultTimer = setTimeout(hide, 2000); return; }
    resultToast = null; resultTimer = null;
    hud?.scheduleRefresh();
  };
  resultTimer = setTimeout(hide, RESULT_TOAST_MS);
}

async function runNativeAction(request) {
  if (actionBusy) return {status:'busy'};
  const context = worldContext();
  const {actor} = resolveActionSubject(context,request);
  const description = describeAction(request,actor,context.localizeSkill);
  const remember = result => {
    if (result?.status === 'busy') return;
    const entry = actionEntry(description,result,++actionSequence);
    recentActions.set(request.subject,appendAction(recentActions.get(request.subject),entry));
    showResult(request.subject, entry.id);
  };
  try {
    const result = await executeAction(request);
    remember(result);
    if (result?.status === 'completed') forgetCard();
    actionStatusTone = result?.status === 'completed' ? 'success' : 'info';
    hud?.scheduleRefresh();
    return result;
  } catch (error) { remember({status:'error'});actionStatusTone = 'error';throw error; }
}

function worldContext() {
  return {
    user: game.user, system: game.system,
    generation: game.release?.generation ?? Number(game.version?.split(".")[0]),
    combat: game.combat, controlled: globalThis.canvas?.tokens?.controlled ?? [],
    targets: Array.from(game.user.targets ?? []), selectedCombatantId, pending: turnPending,
    revision, actionBusy, actionStatus,
    weaponMode: (key,item) => weaponModes.get(`${key}:${item.id}`),
    selectedSkill: key => selectedSkills.get(key),
    selectedWeapon: key => selectedWeapons.get(key),
    skillCategories: Object.entries(globalThis.Handlebars?.helpers?.cprFindConfigObj?.('skillCategories') || {})
      .map(([id,labelKey]) => ({id,label:game.i18n.localize(labelKey)})),
    localizeSkill: name => game.i18n.localize(globalThis.Handlebars?.helpers?.cprGetLocalizedlNameKey?.(name,'skill') || name),
  };
}

function favoriteStore() {
  const stored = game.settings.get(MODULE_ID, 'favoriteSkills');
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function withFavorites(actor) {
  if (!actor) return actor;
  const stored = favoriteStore();
  return {...actor, statusTone:actionStatusTone,
    recentActions:projectRecentActions(recentActions.get(actor.key), {
      user:game.user,getMessage:id => game.messages.get(id),
      canDamage:entry => entry.mode !== 'suppressive' && actor.weapons.some(weapon => weapon.id === entry.weaponId
        && weapon.modes.some(mode => mode.id === entry.mode)),
    }),
    favoriteSkillIds:favoriteSkillIds(actor, Object.hasOwn(stored,actor.key) ? stored[actor.key] : [])};
}

async function closeCard({focus, refresh = true, root = hud?.element?.[0]} = {}) {
  const sequence = ++drawerSequence;
  openCard = null;
  root?.querySelectorAll('[data-action="toggle-card"]').forEach(button => button.setAttribute('aria-expanded','false'));
  if (focus) root?.querySelector(focus)?.focus({preventScroll:true});
  await Promise.all([...(root?.querySelectorAll('.redline-card:not([hidden])') ?? [])].map(card => closeDrawer(card)));
  if (sequence !== drawerSequence || !refresh) return;
  if (focus && hud) hud._focusNext = focus;
  hud?.refresh();
}

/** Corner grip: live client zoom while dragging, saved on release; keyboard arrows step by 1% (Shift — 10%). */
function bindScaleGrip(root, geometry, signal) {
  const grip = root.querySelector('.redline-scale-grip');
  if (!grip) return;
  const readout = grip.querySelector('.redline-scale-readout');
  const show = value => {
    grip.setAttribute('aria-valuenow', value);
    grip.setAttribute('aria-valuetext', `${value}%`);
    if (readout) readout.textContent = `${value}%`;
    geometry(value);
  };
  const stored = () => normalizeInterfaceScale(game.settings.get(MODULE_ID,'interfaceScale'));
  const save = value => game.settings.set(MODULE_ID,'interfaceScale',normalizeInterfaceScale(value));
  let drag = null;
  grip.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();event.stopPropagation();
    grip.setPointerCapture?.(event.pointerId);
    drag = {x:event.clientX, y:event.clientY, start:stored(), value:null};
    if (hud) hud._scaling = true;
    root.classList.add('is-scaling');
  }, {signal});
  grip.addEventListener('pointermove', event => {
    if (!drag) return;
    drag.value = scaleFromDrag({startScale:drag.start, dx:event.clientX-drag.x, dy:event.clientY-drag.y});
    show(drag.value);
  }, {signal});
  const finish = event => {
    if (!drag) return;
    const {value} = drag;
    drag = null;
    if (hud) hud._scaling = false;
    root.classList.remove('is-scaling');
    if (grip.hasPointerCapture?.(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    if (value !== null && value !== stored()) save(value);
  };
  grip.addEventListener('pointerup', finish, {signal});
  grip.addEventListener('pointercancel', finish, {signal});
  grip.addEventListener('dblclick', event => {
    event.preventDefault();event.stopPropagation();
    show(DEFAULT_INTERFACE_SCALE);
    save(DEFAULT_INTERFACE_SCALE);
  }, {signal});
  let keyTimer = null;
  grip.addEventListener('keydown', event => {
    const step = {ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1}[event.key];
    const jump = {Home:MIN_INTERFACE_SCALE, End:MAX_INTERFACE_SCALE}[event.key];
    if (step === undefined && jump === undefined) return;
    event.preventDefault();event.stopPropagation();
    const value = normalizeInterfaceScale(jump ?? Number(grip.getAttribute('aria-valuenow')) + step * (event.shiftKey ? 10 : 1));
    show(value);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => { if (hud) hud._focusNext = '.redline-scale-grip'; save(value); }, 400);
  }, {signal});
}

class RedlineHUD extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "redline-combat-hud", template: `${modulePath}/templates/hud.hbs`, popOut: false,
    });
  }
  getData() {
    const model = projectHUD(worldContext());
    const subject = model.selected?.key ?? '';
    return { content: renderHUD({...model,
      selected:withFavorites(model.selected),
      openCard: openCard?.subject === subject ? openCard.id : null,
      resultEntryId: model.selected && resultToast?.subject === subject ? resultToast.entryId : null,
      animationsEnabled: game.settings.get(MODULE_ID, 'animationsEnabled') !== false,
      skillState: skillStates.get(model.selected?.key),
      hasHostBar: Boolean(document.querySelector('#ncu-shell .ncu-bar')),
      interfaceScale: normalizeInterfaceScale(game.settings.get(MODULE_ID, 'interfaceScale')),
    }) };
  }
  refresh() {
    const active = document.activeElement;
    if (!this._focusNext && active?.matches('#redline-combat-hud [data-skill-search]')) {
      this._focusNext = '[data-skill-search]';
      this._searchSelection = [active.selectionStart, active.selectionEnd];
    }
    // A drag in progress keeps its live zoom; saving on release refreshes through the setting.
    if (this._scaling) return;
    if (ready && game.settings.get(MODULE_ID, "enabled")) this.render(true);
  }
  refreshSkills({focus, resetList = false} = {}) {
    const panel = this.element?.[0]?.querySelector('#redline-skills-panel');
    const actor = withFavorites(projectHUD(worldContext()).selected);
    if (!panel || !actor || skillsSubject() !== actor.key) return this.refresh();
    const active = document.activeElement;
    const searching = active?.matches('[data-skill-search]');
    const selection = searching ? [active.selectionStart, active.selectionEnd] : null;
    const categoryScroll = panel.querySelector('.redline-skill-categories')?.scrollTop || 0;
    const listScroll = resetList ? 0 : panel.querySelector('.redline-skill-list')?.scrollTop || 0;
    const state = skillStates.get(actor.key) || {};
    const template = document.createElement('template');
    template.innerHTML = renderSkillsPanel(actor, true, state);
    panel.replaceChildren(...template.content.firstElementChild.childNodes);
    panel.querySelector('.redline-skill-categories').scrollTop = categoryScroll;
    panel.querySelector('.redline-skill-list').scrollTop = listScroll;
    const target = panel.querySelector(focus || (searching ? '[data-skill-search]' : '[data-action="selected-skill"]'));
    target?.focus({preventScroll:true});
    if (selection) target?.setSelectionRange?.(...selection);
    if (focus?.includes('choose-skill')) target?.scrollIntoView({block:'nearest'});
    if (resetList && !searching) animateSkillResults(panel);
    this._visualState = captureHUD(this.element?.[0]);
  }
  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => { this._refreshTimer = null; this.refresh(); }, 60);
  }
  activateListeners(html) {
    super.activateListeners(html);
    this._listeners?.abort();
    this._listeners = new AbortController();
    const signal = this._listeners.signal;
    const root = html[0];
    root.classList.add('redline-neon');
    root.dataset.layout = 'neon-strip';
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    const rect = selector => {
      const element = document.querySelector(selector);
      return element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' ? element.getBoundingClientRect() : null;
    };
    const geometry = scaleOverride => {
      const chrome = {width:window.innerWidth,height:window.innerHeight,controls:rect('#controls'),sidebar:rect('#sidebar'),hotbar:rect('#hotbar'),hostBar:rect('#ncu-shell .ncu-bar'),navigation:rect('#navigation')};
      const baseInsets = safeInsets(chrome);
      const sizing = panelSizing({availableWidth:window.innerWidth-baseInsets.left-baseInsets.right,scale:scaleOverride ?? game.settings.get(MODULE_ID,'interfaceScale')});
      root.style.setProperty('--redline-scale', sizing.factor);
      root.style.setProperty('--redline-panel-width', `${sizing.layoutWidth}px`);
      root.style.setProperty('--redline-panel-footprint', `${sizing.actualWidth}px`);
      const queue = root.querySelector('.redline-combat');
      const timer = rect('#cpr-deadline-hud');
      const insets = safeInsets({...chrome,timer:queue ? timer : null,queueHeight:queue?.getBoundingClientRect().height ?? 0,queueWidth:sizing.actualWidth});
      for (const [edge, value] of Object.entries(insets)) root.style.setProperty(`--redline-${edge}`, `${value}px`);
      root.querySelector('.redline-interface')?.classList.toggle('has-host-bar', Boolean(rect('#ncu-shell .ncu-bar')));
      let queueBottom = queue?.getBoundingClientRect().bottom ?? insets.top;
      const timerOverPanel = timer && timer.width > 0 && timer.height > 0 && timer.right > insets.left && timer.left < insets.left+sizing.actualWidth;
      if (timerOverPanel && !queue && timer.top < insets.top+90) queueBottom = Math.max(queueBottom, timer.bottom);
      const strip = root.querySelector('.redline-strip')?.getBoundingClientRect();
      const height = cardMaxHeight({stripTop:strip?.top,queueBottom,viewportHeight:window.innerHeight});
      root.style.setProperty('--redline-card-max-height', `${height/sizing.factor}px`);
    };
    geometry();
    window.addEventListener('resize', () => geometry(), {signal});
    const chromeSelectors = ['#controls','#sidebar','#hotbar','#navigation','#ncu-shell','#cpr-deadline-hud'];
    let observed = new Set();
    const observeChrome = () => {
      const current = new Set(chromeSelectors.map(selector => document.querySelector(selector)).filter(Boolean));
      for (const element of observed) if (!current.has(element)) this._geometryObserver?.unobserve(element);
      this._geometryMutation?.disconnect();
      for (const element of current) {
        if (!observed.has(element)) this._geometryObserver?.observe(element);
        this._geometryMutation?.observe(element, {attributes:true,attributeFilter:['class','style','hidden']});
      }
      observed = current;
    };
    // Observers pass their records as the first argument: never let them reach geometry(scaleOverride).
    if (globalThis.ResizeObserver) this._geometryObserver = new ResizeObserver(() => geometry());
    if (globalThis.MutationObserver) {
      this._geometryMutation = new MutationObserver(() => geometry());
      this._geometryMount = new MutationObserver(records => {
        const changed = records.some(record => [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(chromeSelectors.join(',')) || node.querySelector(chromeSelectors.join(',')))));
        if (changed) { observeChrome(); geometry(); }
      });
      // DEADLINE mounts only while running. Ignore countdown text mutations.
      this._geometryMount.observe(document.body, {childList:true,subtree:true});
    }
    observeChrome();
    bindScaleGrip(root, geometry, signal);
    if (this._focusNext) {
      const focusTarget = root.querySelector(this._focusNext);
      focusTarget?.focus();
      if (this._searchSelection && focusTarget?.matches('[data-skill-search]')) focusTarget.setSelectionRange(...this._searchSelection);
      this._searchSelection = null;
      this._focusNext = null;
    }
    document.addEventListener('pointerdown', event => {
      if (!openCard || event.target.closest('.redline-card,[data-action="toggle-card"]')) return;
      // Keep the clicked control in the DOM until its click event arrives:
      // rendering here would swallow an attack or a chip selection outside the card.
      closeCard({refresh:false,root}).catch(error => console.error(`${MODULE_ID} | Card close failed`,error));
    }, {signal});
    root.addEventListener('keydown', event => {
      if (!openCard) return;
      if (event.key === 'Escape') {
        event.preventDefault();event.stopPropagation();
        closeCard({focus:cardButton(openCard.id)}).catch(error => console.error(`${MODULE_ID} | Card close failed`,error));
        return;
      }
      if (openCard.id === 'skills') {
        if (!event.target.closest('[data-skill-search],.redline-skill-row')) return;
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!event.repeat) root.querySelector('[data-action="selected-skill"]:not(:disabled)')?.click();
        } else if (['ArrowDown','ArrowUp'].includes(event.key)) {
          event.preventDefault();
          const rows = [...root.querySelectorAll('.redline-skill-row:not(:disabled)')];
          const current = rows.indexOf(event.target.closest('.redline-skill-row'));
          const index = current < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
          rows[index]?.click();
        }
        return;
      }
      if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
      const card = event.target.closest('.redline-card');
      if (!card) return;
      event.preventDefault();event.stopPropagation();
      const rows = [...card.querySelectorAll('button:not(:disabled)')];
      const current = rows.indexOf(event.target.closest('button'));
      const index = current < 0 ? 0 : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[index]?.focus();
    }, {signal});
    root.addEventListener('input', event => {
      const input = event.target.closest('[data-skill-search]');
      if (!input || actionBusy) return;
      try {
        resolveActionSubject(worldContext(), {subject:input.dataset.subject,revision:Number(input.dataset.revision)});
        skillStates.set(input.dataset.subject, {...skillStates.get(input.dataset.subject),query:input.value.slice(0,200)});
        this.refreshSkills({resetList:true});
      } catch (error) { if (!(error instanceof ActionRejected)) console.error(error); this.refresh(); }
    }, {signal});
    root.addEventListener('toggle', event => {
      if (!event.target.matches('[data-other-rolls]') || !skillsSubject()) return;
      skillStates.set(skillsSubject(), {...skillStates.get(skillsSubject()),otherRolls:event.target.open});
    }, {capture:true,signal});
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled || event.detail > 1) return;
      event.preventDefault();
      event.stopPropagation();
      const request = {action:button.dataset.action,id:button.dataset.id,entryId:button.dataset.entryId,subject:button.dataset.subject,revision:Number(button.dataset.revision)};
      if(request.action === 'selected-skill') request.action='skill';
      if(request.action.startsWith('weapon-') || request.action === 'choose-mode') request.mode=button.dataset.mode || 'attack';
      dispatch(button.dataset.action, button.dataset.id, request).catch(error => {
        actionStatusTone='error';
        if(error instanceof ActionRejected){actionStatus=error.message;ui.notifications.warn(error.message);hud?.refresh();return;}
        console.error(`${MODULE_ID} | Action failed`, error);
        actionStatus='Не удалось завершить действие. Проверьте чат и сообщения системы.';
        hud?.refresh();
        ui.notifications.error("REDLINE: действие не выполнено. Подробности в консоли.");
      });
    }, {signal});
    this._visualState = animateHUD(root, this._visualState);
  }
  async close(options = {}) {
    clearTimeout(this._refreshTimer);
    this._listeners?.abort();
    this._geometryObserver?.disconnect();
    this._geometryMutation?.disconnect();
    this._geometryMount?.disconnect();
    this._visualState = null;
    this._scaling = false;
    forgetCard();
    return super.close(options);
  }
}

async function setEnabled(enabled) {
  await game.settings.set(MODULE_ID, "enabled", Boolean(enabled));
  if (enabled) hud?.refresh();
  else await hud?.close();
}
async function dispatch(action, id, request) {
  if (['open-result-chat','result-damage'].includes(action)) {
    const {actor} = resolveActionSubject(worldContext(),request);
    const entry = recentActions.get(request.subject)?.find(row => row.id === request.entryId);
    if (!entry) throw new ActionRejected('Запись больше недоступна. Повторите действие с полосы.');
    if (action === 'open-result-chat') {
      const message = game.messages.get(entry.chatMessageId);
      if (!canReadResultMessage(message,game.user)) throw new ActionRejected('Карточка больше недоступна для просмотра.');
      return new ChatPopout(message).render(true);
    }
    if (actionBusy) return;
    const weapon = equippedWeapons(actor).find(item => item.id === entry.weaponId);
    const capability = weapon && weaponCapabilities(actor,weapon,entry.mode);
    if (!entry.canRollDamage || !capability?.canDamage || !capability.modes.some(mode => mode.id === entry.mode)) {
      throw new ActionRejected('Оружие или режим этой атаки больше недоступны. Выберите действие на полосе.');
    }
    return runNativeAction({...request,action:'weapon-damage',id:entry.weaponId,mode:entry.mode});
  }
  if (['skill-category','choose-skill','skill-favorites'].includes(action)) {
    if (actionBusy) return;
    const context = worldContext();
    const {actor} = resolveActionSubject(context, request);
    const selected = withFavorites(projectHUD(context).selected);
    if (!selected || skillsSubject() !== selected.key) return;
    const state = skillStates.get(selected.key) || {};
    if (action === 'skill-favorites') {
      skillStates.set(selected.key, {...state,category:'all',favoritesOnly:!state.favoritesOnly});
      return hud.refreshSkills({focus:'[data-action="skill-favorites"]',resetList:true});
    }
    if (action === 'skill-category') {
      if (id !== 'all' && !selected.skillCategories.some(category => category.id === id)) return;
      skillStates.set(selected.key, {...state,category:id,favoritesOnly:false});
      return hud.refreshSkills({focus:`[data-action="skill-category"][data-id="${CSS.escape(id)}"]`,resetList:true});
    }
    const skill = actor.items.get(id);
    if (skill?.type !== 'skill' || typeof skill.createRoll !== 'function' || !skillCatalog(selected,state).skills.some(item => item.id === id)) return;
    selectedSkills.set(selected.key, id);
    return hud.refreshSkills({focus:`[data-action="choose-skill"][data-id="${CSS.escape(id)}"]`});
  }
  if (action === 'toggle-skill-favorite') {
    // Serialize preference writes and resolve again when each one executes.
    favoriteWrites = favoriteWrites.catch(() => {}).then(async () => {
      if (actionBusy) return;
      resolveActionSubject(worldContext(),request);
      const selected = withFavorites(projectHUD(worldContext()).selected);
      if (!selected) return;
      let ids;
      try { ids = toggleFavoriteSkill(selected,selected.favoriteSkillIds,id); }
      catch (error) { if (error instanceof RangeError) throw new ActionRejected(error.message); throw error; }
      hud._focusNext = `[data-action="toggle-skill-favorite"][data-id="${CSS.escape(id)}"]`;
      await game.settings.set(MODULE_ID,'favoriteSkills',favoriteStoreWith(favoriteStore(),selected.key,ids));
    });
    return favoriteWrites;
  }
  if (action === 'quick-skill') {
    resolveActionSubject(worldContext(),request);
    const selected = withFavorites(projectHUD(worldContext()).selected);
    if (!selected?.favoriteSkillIds.includes(id)) throw new ActionRejected('Избранное изменилось. Выберите навык заново.');
    return runNativeAction({...request,action:'skill'});
  }
  if (action === 'choose-weapon') {
    if (actionBusy) return;
    const {actor} = resolveActionSubject(worldContext(),request);
    if (!equippedWeapons(actor).some(item => item.id === id)) throw new ActionRejected('Это оружие больше не экипировано. Обновите карточку оружия.');
    selectedWeapons.set(request.subject,id);actionStatus='';
    hud._focusNext = `[data-action="choose-weapon"][data-id="${CSS.escape(id)}"]`;
    return hud.refresh();
  }
  if (action === 'choose-mode') {
    if (actionBusy) return;
    const {actor} = resolveActionSubject(worldContext(),request);
    const item = equippedWeapons(actor).find(row => row.id === id);
    if (!item || !weaponCapabilities(actor,item,request.mode).modes.some(mode => mode.id === request.mode)) {
      throw new ActionRejected('Этот режим больше недоступен. Обновите карточку оружия.');
    }
    weaponModes.set(`${request.subject}:${item.id}`,request.mode);actionStatus='';
    hud._focusNext = `[data-action="choose-mode"][data-id="${CSS.escape(id)}"][data-mode="${CSS.escape(request.mode)}"]`;
    return hud.refresh();
  }
  if (action === 'selected-skill') {
    const selected = withFavorites(projectHUD(worldContext()).selected);
    if (!selected || skillCatalog(selected,skillStates.get(selected.key)).selected?.id !== request.id) throw new ActionRejected('Список навыков изменился. Выберите навык ещё раз.');
  }
  if(action.startsWith('weapon-') || ['skill','selected-skill','initiative','death-save'].includes(action)) return runNativeAction(request);
  if (action === "close") return setEnabled(false);
  if (action === "refresh") return hud?.refresh();
  if (action === 'toggle-card') {
    if (!CARD_IDS.includes(id)) return;
    const selected = projectHUD(worldContext()).selected;
    const subject = selected?.key ?? '';
    if (!selected && id !== 'more') return;
    if (openCard?.subject === subject && openCard.id === id) return closeCard({focus:cardButton(id)});
    drawerSequence++;
    openCard = {subject, id};
    // The card itself takes focus (tabindex="-1"): Escape works without buttons inside, arrows move into the list.
    hud._focusNext = id === 'skills' ? '[data-skill-search]' : `.redline-card[data-card="${id}"]`;
    return hud.refresh();
  }
  if (action === 'close-card') return openCard ? closeCard({focus:cardButton(openCard.id)}) : undefined;
  if (action === "select-combatant") {
    const row = game.combat?.combatants?.get(id);
    if (!visibleCombatant(row, game.user) || !ownsActor(row?.actor, game.user)) return;
    // Selection affects this client only; the current turn is independent.
    selectedCombatantId = row.id;
    forgetCard();
    revision++;actionStatus='';
    hud?.refresh();
  }
  if (action === "sheet") {
    // Resolve a fresh projection and recheck ownership after each render.
    const ctx = worldContext();
    const { actor } = resolveSubject(ctx);
    if (projectHUD(ctx).selected && ownsActor(actor, game.user)) actor.sheet?.render(true);
  }
  if (action === "next-turn") {
    const ctx = worldContext();
    if (!projectHUD(ctx).combat.canAdvance || turnPending) return;
    turnPending = true;
    hud?.refresh();
    try { await ctx.combat.nextTurn(); }
    finally { turnPending = false; hud?.refresh(); }
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID,'animationsEnabled', {
    name:'REDLINE COMBAT: плавные анимации',
    hint:'Короткие переходы карточек и отклик на изменения. Системное уменьшение движения учитывается автоматически.',
    scope:'client',config:true,type:Boolean,default:true,onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID,'favoriteSkills', {
    name:'REDLINE COMBAT: избранные навыки',scope:'client',config:false,type:Object,default:{},onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID, 'interfaceScale', {
    name:'REDLINE COMBAT: масштаб интерфейса, %',
    hint:'Размер полосы, карточек и очереди боя только для вас. Удобнее тянуть за уголок полосы; двойной щелчок по нему возвращает 80%.',
    scope:'client',config:true,type:Number,default:DEFAULT_INTERFACE_SCALE,
    range:{min:MIN_INTERFACE_SCALE,max:MAX_INTERFACE_SCALE,step:1},onChange:()=>hud?.refresh(),
  });
  game.settings.register(MODULE_ID, "enabled", {
    name: "REDLINE COMBAT: показывать HUD", scope: "client", config: true,
    hint: "Полоса персонажа и очередь боя. Shift+R или кнопка REDLINE в инструментах токенов переключают HUD.",
    type: Boolean, default: true,
    onChange: enabled => enabled ? hud?.refresh() : hud?.close(),
  });
  game.keybindings.register(MODULE_ID, "toggleHUD", {
    name: "REDLINE COMBAT: показать / скрыть HUD",
    editable: [{ key: "KeyR", modifiers: ["Shift"] }],
    onDown: () => { void setEnabled(!game.settings.get(MODULE_ID, "enabled")); return true; },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!Array.isArray(controls)) return;
  const tokens = controls.find(control => control.name === "token");
  if (!tokens || tokens.tools.some(tool => tool.name === MODULE_ID)) return;
  tokens.tools.push({
    name: MODULE_ID, title: "REDLINE COMBAT — показать / скрыть HUD", icon: "fas fa-bolt",
    visible: true, button: true, onClick: () => setEnabled(!game.settings.get(MODULE_ID, "enabled")),
  });
});

Hooks.once("ready", () => {
  ready = true;
  hud = new RedlineHUD();
  game.modules.get(MODULE_ID).api = Object.freeze({
    open: () => setEnabled(true), close: () => setEnabled(false),
    toggle: () => setEnabled(!game.settings.get(MODULE_ID, "enabled")),
    refresh: () => hud.refresh(),
    getState: () => projectHUD(worldContext()),
  });
  hud.refresh();
});

for (const hook of [
  "updateActor", "createItem", "updateItem", "deleteItem", "updateToken", "targetToken",
  "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant",
  "deleteCombatant", "combatStart", "updateUser", "deleteActor", "deleteToken", "updateActiveEffect", "createActiveEffect", "deleteActiveEffect",
  "updateChatMessage", "deleteChatMessage",
]) Hooks.on(hook, () => hud?.scheduleRefresh());
for (const hook of ["controlToken", "canvasReady", "canvasTearDown"]) {
    Hooks.on(hook, () => { selectedCombatantId = null; forgetCard(); revision++;actionStatus='';hud?.scheduleRefresh(); });
}
```

- [ ] **Step 2: Синтаксис ES-модуля**

`node --check` на `.js` разбирает файл как CommonJS, поэтому проверяем копию с расширением `.mjs`:

Run (Git Bash):
```bash
cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && for f in scripts/main.js scripts/view.js; do cp "$f" "$TEMP/check-$(basename "$f" .js).mjs" && node --check "$TEMP/check-$(basename "$f" .js).mjs" && echo "ok $f"; done
```
Expected: `ok scripts/main.js` и `ok scripts/view.js`.

- [ ] **Step 3: Все тесты**

Run: `npm test`
Expected: все PASS (тесты логики не менялись, `view`/`presentation` уже под новый код).

- [ ] **Step 4: Не осталось ссылок на удалённое**

Run: `grep -rnE "dockExpanded|scale-settings|toggle-dock|toggle-skills|toggle-arsenal|close-drawers|renderScaleSettings|renderArsenalPanel|skillPopup|historyOpen" scripts tests`
Expected: пусто.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/scripts/main.js && git commit -m "HUD: одна карточка за раз, тост результата, масштаб перетаскиванием уголка"
```

---

### Task 6: `motion.js`

**Files:**
- Rewrite: `M/scripts/motion.js`

- [ ] **Step 1: Новый `scripts/motion.js`**

`M/scripts/motion.js` целиком:

```js
/** Short, state-driven UI motion. No timers, canvas hooks, or game writes while idle. */
const running = new WeakMap();
const ease = 'cubic-bezier(.2,.8,.2,1)';

export function motionAllowed(root) {
  const container = root?.matches?.('.redline-interface') ? root
    : root?.closest?.('.redline-interface') || root?.querySelector?.('.redline-interface');
  const view = root?.ownerDocument?.defaultView || globalThis;
  return container?.dataset.animations !== 'false' && !view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function play(element, frames, options = {}) {
  if (!element?.animate || !motionAllowed(element)) return null;
  running.get(element)?.cancel();
  const animation = element.animate(frames, {duration:190, easing:ease, ...options});
  running.set(element, animation);
  animation.finished.catch(() => {}).finally(() => {
    if (running.get(element) === animation) running.delete(element);
  });
  return animation;
}

const rise = (element, distance = 8, options = {}) => play(element, [
  {opacity:0, transform:`translateY(${distance}px)`}, {opacity:1, transform:'translateY(0)'}
], {duration:120, ...options});

export function captureHUD(root) {
  if (!root?.querySelector) return null;
  const query = selector => root.querySelector(selector);
  return {
    actor:query('.redline-strip')?.dataset.actorKey || '',
    card:query('.redline-card:not([hidden])')?.dataset.card || '',
    weapon:query('.redline-cell-weapon')?.dataset.weaponId || '',
    hp:query('.redline-hp')?.dataset.hpValue ?? '',
    lit:query('.redline-segments')?.dataset.lit ?? '',
    ammo:query('[data-vital="ammo"]')?.textContent || '',
    current:query('.redline-unit.is-current')?.dataset.id || '',
    status:query('.redline-action-status')?.textContent || '',
    result:query('.redline-toast')?.dataset.resultId || '',
  };
}

export function animateHUD(root, previous) {
  const next = captureHUD(root);
  if (!next || !motionAllowed(root)) return next;
  const query = selector => root.querySelector(selector);
  if (!previous) {
    rise(query('.redline-strip-wrap'), 10, {duration:200});
    rise(query('.redline-combat'), -8, {duration:200, delay:40});
    return next;
  }
  if (next.actor !== previous.actor) rise(query('.redline-strip-wrap'), 6, {duration:160});
  if (next.card && (next.card !== previous.card || next.actor !== previous.actor)) rise(query(`.redline-card[data-card="${next.card}"]`));
  if (next.result && next.result !== previous.result) {
    rise(query('.redline-toast'), 10, {duration:180});
    play(query('.redline-strip'), [{filter:'brightness(1.6)'}, {filter:'brightness(1)'}], {duration:320});
  }
  if (next.actor !== previous.actor) return next;
  if (next.weapon !== previous.weapon) play(query('.redline-cell-weapon'), [{opacity:.3}, {opacity:1}], {duration:160});
  if (next.ammo !== previous.ammo) play(query('[data-vital="ammo"]'), [{opacity:.35, transform:'translateY(-3px)'}, {opacity:1, transform:'translateY(0)'}], {duration:200});
  const before = Number(previous.lit), after = Number(next.lit);
  if (previous.lit !== '' && next.lit !== '' && after < before) {
    // Lost HP segments flash red, then fade to their unlit colour.
    const segments = root.querySelectorAll('.redline-segments i');
    for (let index = after; index < before; index++) play(segments[index], [{backgroundColor:'#f04452'}, {}], {duration:420, delay:(index - after) * 40});
  }
  if (next.current !== previous.current) play(query('.redline-unit.is-current'), [{transform:'translateX(6px)', opacity:.5}, {transform:'translateX(0)', opacity:1}], {duration:240});
  if (next.status && next.status !== previous.status) rise(query('.redline-feedback'), 4);
  return next;
}

export function animateSkillResults(panel) {
  return play(panel?.querySelector('.redline-skill-results'),[
    {opacity:.25,transform:'translateX(5px)'},{opacity:1,transform:'translateX(0)'}
  ],{duration:140});
}

export async function closeDrawer(panel) {
  if (!panel || panel.hidden) return;
  const previousPointerEvents = panel.style.pointerEvents;
  panel.style.pointerEvents = 'none';
  const animation = play(panel,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(6px)'}],{duration:120});
  if (animation) await animation.finished.catch(() => {});
  panel.hidden = true;
  panel.style.pointerEvents = previousPointerEvents;
}
```

- [ ] **Step 2: Синтаксис и тесты**

Run:
```bash
cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && cp scripts/motion.js "$TEMP/check-motion.mjs" && node --check "$TEMP/check-motion.mjs" && npm test
```
Expected: без ошибок разбора, все тесты PASS.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/scripts/motion.js && git commit -m "Анимации полосы, карточек и потерянных сегментов HP"
```

---

### Task 7: Стили «неон и хром»

**Files:**
- Rewrite: `M/styles/redline.css`
- Rewrite: `M/styles/host.css`

- [ ] **Step 1: Новый `styles/redline.css`**

`M/styles/redline.css` целиком:

```css
/* REDLINE neon strip: client presentation above the map and macro bar. */
#redline-combat-hud {
  --redline-bg: #0b0d10eb;
  --redline-solid: #0b0d10;
  --redline-surface: #161a20;
  --redline-line: #f0445280;
  --redline-hair: #ffffff1a;
  --redline-text: #e8e6e1;
  --redline-muted: #9a9ca3;
  --redline-red: #f04452;
  --redline-cyan: #5fd4dc;
  --redline-yellow: #e4bc73;
  --redline-gray: #2a2d33;
  --redline-font: "Bahnschrift", "Segoe UI", sans-serif;
  --redline-cut: 10px;
  --redline-left: 76px;
  --redline-right: 320px;
  --redline-top: 76px;
  --redline-bottom: 72px;
  --redline-scale: .8;
  --redline-panel-width: 1000px;
  --redline-card-max-height: 60vh;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  pointer-events: none;
  color: var(--redline-text);
  font: 13px/1.3 var(--redline-font);
  font-variant-numeric: tabular-nums;
  color-scheme: dark;
  z-index: 60;
}
#redline-combat-hud *, #redline-combat-hud *::before, #redline-combat-hud *::after { box-sizing: border-box; }
#redline-combat-hud [hidden] { display: none !important; }
#redline-combat-hud .redline-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
#redline-combat-hud .redline-interface { position: absolute; inset: var(--redline-top) var(--redline-right) var(--redline-bottom) var(--redline-left); pointer-events: none; min-width: 0; }
#redline-combat-hud h2, #redline-combat-hud h3, #redline-combat-hud p { margin: 0; border: 0; }
#redline-combat-hud small { color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-muted { color: var(--redline-muted); }

/* Chamfered panels. The clip lives on pseudo-elements so cards inside the strip are never clipped. */
#redline-combat-hud .redline-panel { position: relative; isolation: isolate; pointer-events: auto; }
#redline-combat-hud .redline-panel::before, #redline-combat-hud .redline-panel::after { content: ""; position: absolute; z-index: -1; pointer-events: none; }
#redline-combat-hud .redline-panel::before { inset: 0; background: var(--redline-line); clip-path: polygon(var(--redline-cut) 0, 100% 0, 100% calc(100% - var(--redline-cut)), calc(100% - var(--redline-cut)) 100%, 0 100%, 0 var(--redline-cut)); }
#redline-combat-hud .redline-panel::after { inset: 1px; background: var(--redline-bg); clip-path: polygon(calc(var(--redline-cut) - .5px) 0, 100% 0, 100% calc(100% - var(--redline-cut) + .5px), calc(100% - var(--redline-cut) + .5px) 100%, 0 100%, 0 calc(var(--redline-cut) - .5px)); }

/* Buttons: two-class selectors beat Foundry's `button { width: 100% }`. */
#redline-combat-hud button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: auto; min-height: 30px; margin: 0; padding: 4px 9px; border: 1px solid #5fd4dc59; border-radius: 0; background: transparent; color: var(--redline-cyan); font: inherit; line-height: 1.2; box-shadow: none; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
#redline-combat-hud button:enabled:hover { background: #5fd4dc1a; border-color: var(--redline-cyan); }
#redline-combat-hud button:disabled { opacity: .45; cursor: not-allowed; }
#redline-combat-hud button i { margin: 0; pointer-events: none; }
#redline-combat-hud :is(button, input, .redline-scale-grip):focus-visible { outline: 1px solid var(--redline-cyan); outline-offset: 2px; }
#redline-combat-hud .redline-card:focus { outline: none; }

/* Strip */
#redline-combat-hud .redline-bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; pointer-events: none; }
#redline-combat-hud .redline-strip-wrap { position: relative; max-width: var(--redline-panel-width); zoom: var(--redline-scale); pointer-events: none; }
#redline-combat-hud .redline-strip { display: flex; align-items: center; gap: 4px; min-height: 46px; max-width: var(--redline-panel-width); padding: 4px 22px 4px 8px; white-space: nowrap; }
#redline-combat-hud .redline-strip.is-turn::after { box-shadow: inset 0 2px 0 var(--redline-red); }
#redline-combat-hud .redline-cell { position: relative; display: flex; align-items: center; min-width: 0; }
#redline-combat-hud .redline-strip > .redline-cell + .redline-cell, #redline-combat-hud .redline-strip > .redline-cell + .redline-strip-actions { padding-left: 4px; border-left: 1px solid var(--redline-hair); }
#redline-combat-hud .redline-cell-button { gap: 7px; min-width: 0; height: 38px; padding: 3px 8px; border-color: transparent; color: var(--redline-text); }
#redline-combat-hud .redline-cell-button[aria-expanded="true"] { border-color: var(--redline-cyan); background: #5fd4dc14; }
#redline-combat-hud .redline-cell-icon { width: 32px; padding: 4px; color: var(--redline-cyan); }
#redline-combat-hud .redline-strip-text { min-width: 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
#redline-combat-hud .redline-strip-name { max-width: 110px; font-weight: 600; }
#redline-combat-hud .redline-portrait { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 30px; height: 30px; overflow: hidden; background: var(--redline-surface); border: 1px solid var(--redline-hair); color: var(--redline-muted); }
#redline-combat-hud .redline-portrait img { width: 100%; height: 100%; object-fit: cover; border: 0; }
#redline-combat-hud .redline-portrait-large { width: 48px; height: 48px; }
#redline-combat-hud .redline-num { color: var(--redline-cyan); font-size: 19px; font-weight: 600; line-height: 1; }
#redline-combat-hud .redline-hp { display: inline-flex; align-items: baseline; gap: 5px; }
#redline-combat-hud .redline-segments { display: inline-flex; align-self: center; gap: 2px; }
#redline-combat-hud .redline-segments i { display: block; width: 6px; height: 10px; background: var(--redline-gray); transform: skewX(-20deg); }
#redline-combat-hud .redline-hp[data-vital-tone="normal"] i.is-lit { background: var(--redline-cyan); }
#redline-combat-hud .redline-hp[data-vital-tone="low"] i.is-lit { background: var(--redline-yellow); }
#redline-combat-hud .redline-hp[data-vital-tone="critical"] i.is-lit { background: var(--redline-red); }
#redline-combat-hud .redline-hp[data-vital-tone="unknown"] i.is-lit { background: var(--redline-muted); }
#redline-combat-hud .redline-hp[data-vital-tone="low"] .redline-num { color: var(--redline-yellow); }
#redline-combat-hud .redline-hp[data-vital-tone="critical"] .redline-num { color: var(--redline-red); }
#redline-combat-hud .redline-sp { color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-conditions { display: inline-flex; align-items: center; gap: 3px; color: var(--redline-yellow); }
#redline-combat-hud .redline-ammo { display: inline-flex; align-items: baseline; gap: 1px; }
#redline-combat-hud .redline-ammo[data-ammo-state="empty"] .redline-num { color: var(--redline-red); }
#redline-combat-hud .redline-strip-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
#redline-combat-hud .redline-action-primary { padding: 4px 12px; border-color: var(--redline-red); background: var(--redline-red); color: var(--redline-solid); font-weight: 600; }
#redline-combat-hud .redline-action-primary:enabled:hover { border-color: #ff5a67; background: #ff5a67; }
#redline-combat-hud .redline-action-icon { width: 32px; padding: 4px; }
#redline-combat-hud .redline-action-button.is-urgent { border-color: var(--redline-red); color: var(--redline-red); }
#redline-combat-hud .redline-strip-empty { display: inline-flex; align-items: center; gap: 8px; padding: 0 10px; color: var(--redline-muted); }

/* Scale grip: drag right or up to enlarge */
#redline-combat-hud .redline-scale-grip { position: absolute; right: 3px; bottom: 3px; width: 14px; height: 14px; border-right: 2px solid var(--redline-cyan); border-bottom: 2px solid var(--redline-cyan); opacity: .7; cursor: nesw-resize; touch-action: none; pointer-events: auto; }
#redline-combat-hud .redline-scale-grip:hover, #redline-combat-hud.is-scaling .redline-scale-grip { opacity: 1; }
#redline-combat-hud .redline-scale-readout { position: absolute; right: 0; bottom: calc(100% + 6px); padding: 2px 6px; background: var(--redline-solid); border: 1px solid var(--redline-cyan); color: var(--redline-cyan); font-size: 12px; opacity: 0; pointer-events: none; }
#redline-combat-hud.is-scaling .redline-scale-readout, #redline-combat-hud .redline-scale-grip:focus-visible .redline-scale-readout { opacity: 1; }

/* Cards open upward above their element */
#redline-combat-hud .redline-card { position: absolute; bottom: calc(100% + 10px); left: 50%; translate: -50% 0; z-index: 3; display: flex; flex-direction: column; gap: 8px; width: 300px; max-height: var(--redline-card-max-height); overflow-y: auto; padding: 10px 12px 12px; white-space: normal; }
#redline-combat-hud .redline-cell[data-cell="character"] > .redline-card { left: 0; translate: none; }
#redline-combat-hud .redline-strip-actions .redline-card { left: auto; right: 0; translate: none; }
#redline-combat-hud .redline-card-header { color: var(--redline-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
#redline-combat-hud .redline-card-body { display: flex; flex-direction: column; gap: 8px; }
#redline-combat-hud .redline-card-note { color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-card-identity { display: flex; align-items: center; gap: 10px; }
#redline-combat-hud .redline-card-identity strong { display: block; font-size: 15px; }
#redline-combat-hud .redline-card-hp b { color: var(--redline-cyan); font-size: 16px; }
#redline-combat-hud .redline-armor-list { display: flex; gap: 14px; margin: 0; }
#redline-combat-hud .redline-armor-list div { display: flex; gap: 6px; }
#redline-combat-hud .redline-armor-list dt { color: var(--redline-muted); }
#redline-combat-hud .redline-armor-list dd { margin: 0; color: var(--redline-cyan); }
#redline-combat-hud .redline-condition-strip { display: flex; flex-wrap: wrap; gap: 4px; }
#redline-combat-hud :is(.redline-health-state, .redline-condition) { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--redline-hair); font-size: 11px; }
#redline-combat-hud .redline-health-state[data-health-tone="low"] { border-color: #e4bc7366; color: var(--redline-yellow); }
#redline-combat-hud .redline-health-state[data-health-tone="critical"] { border-color: var(--redline-line); color: var(--redline-red); }
#redline-combat-hud .redline-card-weapon { width: 340px; }
#redline-combat-hud .redline-weapon-list { display: flex; flex-direction: column; }
#redline-combat-hud .redline-card .redline-weapon-row { justify-content: flex-start; width: 100%; border: 0; border-bottom: 1px solid var(--redline-hair); color: var(--redline-text); text-align: left; }
#redline-combat-hud .redline-card .redline-weapon-row[aria-pressed="true"] { background: #5fd4dc1f; color: var(--redline-cyan); }
#redline-combat-hud .redline-weapon-row-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#redline-combat-hud .redline-weapon-meta { display: inline-flex; gap: 6px; color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-weapon-row-ammo[data-ammo-state="empty"] { color: var(--redline-red); }
#redline-combat-hud .redline-mode-chips { display: flex; flex-wrap: wrap; gap: 5px; }
#redline-combat-hud .redline-card .redline-mode-chip { min-height: 26px; padding: 2px 8px; border-color: var(--redline-hair); color: var(--redline-text); font-size: 12px; }
#redline-combat-hud .redline-card .redline-mode-chip[aria-pressed="true"] { border-color: var(--redline-cyan); color: var(--redline-cyan); }
#redline-combat-hud .redline-card-target { width: 260px; }
#redline-combat-hud .redline-target-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
#redline-combat-hud .redline-target-list li { display: flex; align-items: center; gap: 8px; }
#redline-combat-hud .redline-card-more { width: 240px; }
#redline-combat-hud .redline-menu .redline-action-button { justify-content: flex-start; width: 100%; border-color: var(--redline-hair); color: var(--redline-text); }
#redline-combat-hud .redline-card-history { width: 380px; }

/* Results */
#redline-combat-hud .redline-result-card { display: flex; flex-direction: column; gap: 5px; }
#redline-combat-hud .redline-result-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#redline-combat-hud .redline-result-state { display: inline-flex; align-items: center; gap: 5px; color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud [data-result-status="completed"] .redline-result-state { color: var(--redline-cyan); }
#redline-combat-hud [data-result-status="error"] .redline-result-state { color: var(--redline-red); }
#redline-combat-hud .redline-result-total { color: var(--redline-cyan); font-size: 28px; line-height: 1; }
#redline-combat-hud .redline-result-title { font-size: 14px; font-weight: 600; }
#redline-combat-hud .redline-result-title span { margin-left: 6px; color: var(--redline-muted); font-weight: 400; }
#redline-combat-hud :is(.redline-result-detail, .redline-result-next) { color: var(--redline-muted); font-size: 12px; }
#redline-combat-hud .redline-result-next { display: flex; gap: 6px; }
#redline-combat-hud .redline-result-actions { display: flex; flex-wrap: wrap; gap: 6px; }
#redline-combat-hud .redline-result-actions .redline-result-followup { border-color: var(--redline-red); background: var(--redline-red); color: var(--redline-solid); }
#redline-combat-hud .redline-action-history { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 0; padding: 6px 0 0; border-top: 1px solid var(--redline-hair); list-style: none; }
#redline-combat-hud .redline-action-history li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; font-size: 12px; }
#redline-combat-hud .redline-history-copy small { display: block; }
#redline-combat-hud .redline-history-label { color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-toast { position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 2; width: 320px; padding: 10px 12px; white-space: normal; }
#redline-combat-hud .redline-strip-wrap:has(.redline-card:not([hidden])) .redline-toast { display: none; }
#redline-combat-hud .redline-feedback { position: absolute; right: 0; bottom: calc(100% + 6px); display: flex; align-items: center; gap: 6px; max-width: 60%; padding: 3px 8px; background: var(--redline-solid); border: 1px solid var(--redline-hair); color: var(--redline-muted); font-size: 12px; pointer-events: none; }
#redline-combat-hud .redline-strip-wrap:has(.redline-card:not([hidden]), .redline-toast) .redline-feedback { display: none; }
#redline-combat-hud .redline-feedback[data-status-tone="error"] { border-color: var(--redline-line); color: var(--redline-red); }
#redline-combat-hud .redline-feedback[data-status-tone="success"] { color: var(--redline-cyan); }
#redline-combat-hud .redline-feedback.is-busy i { animation: redline-spin 1s linear infinite; }
@keyframes redline-spin { to { transform: rotate(360deg); } }

/* Initiative queue */
#redline-combat-hud .redline-top { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none; }
#redline-combat-hud .redline-combat { display: flex; align-items: center; gap: 8px; max-width: var(--redline-panel-width); padding: 5px 10px; white-space: nowrap; zoom: var(--redline-scale); }
#redline-combat-hud .redline-round { display: flex; align-items: baseline; gap: 6px; padding-right: 8px; border-right: 1px solid var(--redline-hair); }
#redline-combat-hud .redline-round strong { color: var(--redline-cyan); font-size: 20px; }
#redline-combat-hud .redline-queue { display: flex; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
#redline-combat-hud .redline-combat .redline-unit { gap: 6px; min-width: 0; max-width: 170px; height: 38px; padding: 3px 8px 3px 3px; border-color: var(--redline-hair); color: var(--redline-text); }
#redline-combat-hud .redline-combat .redline-unit.is-current { border-color: var(--redline-red); box-shadow: inset 0 -2px 0 var(--redline-red); }
#redline-combat-hud .redline-combat .redline-unit.is-selected { background: #5fd4dc14; }
#redline-combat-hud .redline-unit.is-defeated { opacity: .5; }
#redline-combat-hud .redline-unit-name { display: flex; flex-direction: column; min-width: 0; text-align: left; }
#redline-combat-hud .redline-unit-name :is(strong, small) { overflow: hidden; text-overflow: ellipsis; }
#redline-combat-hud .redline-initiative { color: var(--redline-cyan); font-size: 16px; font-weight: 600; }
#redline-combat-hud .redline-combat .redline-next { border-color: var(--redline-red); color: var(--redline-red); }
#redline-combat-hud .redline-notices { position: absolute; left: 0; right: 0; bottom: 70px; display: flex; justify-content: center; pointer-events: none; }
#redline-combat-hud .redline-status { padding: 4px 10px; background: var(--redline-solid); border: 1px solid var(--redline-line); color: var(--redline-muted); pointer-events: auto; }
#redline-combat-hud .redline-error { color: var(--redline-red); }
@media (prefers-reduced-motion: reduce) { #redline-combat-hud * { transition: none !important; animation: none !important; } }
```

- [ ] **Step 2: Новый `styles/host.css`**

`M/styles/host.css` целиком:

```css
/* Skills card internals and native form controls inside REDLINE. */
#redline-combat-hud .redline-card-skills { width: min(640px, calc(100vw / var(--redline-scale) - 40px)); height: min(520px, var(--redline-card-max-height)); overflow: hidden; }
#redline-combat-hud .redline-popover-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
#redline-combat-hud .redline-popover-header strong { display: block; font-size: 15px; }
#redline-combat-hud .redline-eyebrow { display: block; color: var(--redline-muted); font-size: 10px; letter-spacing: .08em; }
#redline-combat-hud .redline-skill-actor { color: var(--redline-muted); font-size: 12px; }
#redline-combat-hud .redline-quick-skills { display: flex; align-items: center; gap: 6px; color: var(--redline-yellow); }
#redline-combat-hud .redline-quick-list { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
#redline-combat-hud .redline-card .redline-quick-skill { min-height: 26px; padding: 2px 8px; border-color: var(--redline-hair); color: var(--redline-text); font-size: 12px; }
#redline-combat-hud .redline-quick-hint { color: var(--redline-muted); font-size: 12px; }
#redline-combat-hud .redline-skill-tools { display: flex; gap: 6px; }
#redline-combat-hud .redline-skill-search { display: flex; flex: 1 1 auto; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid var(--redline-hair); color: var(--redline-muted); }
#redline-combat-hud .redline-skill-search:focus-within { border-color: var(--redline-cyan); }
#redline-combat-hud .redline-skill-search input { flex: 1 1 auto; min-width: 0; height: 30px; padding: 0; border: 0; background: transparent; color: var(--redline-text); font: inherit; box-shadow: none; }
#redline-combat-hud .redline-skill-search input:focus-visible { outline: none; }
#redline-combat-hud .redline-card .redline-favorites-filter[aria-pressed="true"] { border-color: var(--redline-yellow); color: var(--redline-yellow); }
#redline-combat-hud .redline-skill-catalog { display: grid; flex: 1 1 auto; grid-template-columns: minmax(150px, 34%) minmax(0, 1fr); gap: 8px; min-height: 0; }
#redline-combat-hud .redline-skill-categories { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow-y: auto; }
#redline-combat-hud .redline-skill-categories button { justify-content: flex-start; width: 100%; min-height: 28px; border-color: transparent; color: var(--redline-text); font-size: 12px; text-align: left; }
#redline-combat-hud .redline-skill-categories button[aria-pressed="true"] { border-color: var(--redline-cyan); background: #5fd4dc14; color: var(--redline-cyan); }
#redline-combat-hud .redline-skill-results { display: flex; flex-direction: column; min-height: 0; }
#redline-combat-hud .redline-skill-results header { display: flex; justify-content: space-between; padding-bottom: 4px; color: var(--redline-muted); font-size: 12px; }
#redline-combat-hud .redline-skill-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
#redline-combat-hud .redline-skill-entry { display: flex; align-items: center; border-bottom: 1px solid var(--redline-hair); }
#redline-combat-hud .redline-skill-entry.is-selected { background: #5fd4dc14; }
#redline-combat-hud .redline-skill-entry .redline-skill-row { flex: 1 1 auto; justify-content: space-between; min-height: 28px; border: 0; color: var(--redline-text); text-align: left; }
#redline-combat-hud .redline-skill-entry.is-selected .redline-skill-row { color: var(--redline-cyan); }
#redline-combat-hud .redline-skill-entry .redline-skill-star { width: 30px; min-height: 28px; padding: 2px; border: 0; color: var(--redline-muted); }
#redline-combat-hud .redline-skill-entry .redline-skill-star[aria-pressed="true"] { color: var(--redline-yellow); }
#redline-combat-hud .redline-skill-empty { padding: 8px 0; color: var(--redline-muted); font-size: 12px; }
#redline-combat-hud .redline-skill-footer { display: flex; flex-direction: column; gap: 6px; }
#redline-combat-hud .redline-skill-roll .redline-skill-primary { align-self: flex-start; border-color: var(--redline-red); background: var(--redline-red); color: var(--redline-solid); font-weight: 600; }
#redline-combat-hud .redline-action-note { color: var(--redline-muted); font-size: 11px; }
#redline-combat-hud .redline-other-rolls summary { color: var(--redline-muted); font-size: 12px; cursor: pointer; }
#redline-combat-hud .redline-character-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
#redline-combat-hud option { background: var(--redline-solid); color: var(--redline-text); }
```

- [ ] **Step 3: Тесты не задеты**

Run: `cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && npm test`
Expected: все PASS.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add foundry/redline-combat/styles/redline.css foundry/redline-combat/styles/host.css && git commit -m "Стиль «неон и хром»: фаски, сегменты HP, карточки над элементами"
```

---

### Task 8: Живая проверка на стенде

**Files:**
- Create: `D/playwright.modules.config.ts`
- Create: `D/e2e-modules/global-setup.ts`
- Create: `D/e2e-modules/redline-combat.spec.ts`
- Modify: `D/eslint.config.js` (файлы и глобалы страницы)

- [ ] **Step 1: Конфиг и подготовка**

`D/playwright.modules.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

// Сценарии сторонних модулей против запущенного стенда; по очереди, потому что мир общий.
export default defineConfig({
  testDir: "e2e-modules",
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/modules",
  globalSetup: "./e2e-modules/global-setup.ts",
});
```

`D/e2e-modules/global-setup.ts`:

```ts
// Перед сценарием REDLINE: junction модуля, включение в мире, навыки и оружие с патронами у персонажа.
import { execFileSync } from "node:child_process";

export default async function globalSetup(): Promise<void> {
  execFileSync(process.execPath, ["tools/bench/redline.mjs"], { stdio: "inherit" });
}
```

В `D/eslint.config.js` в массив `files` второго блока добавить `"e2e-modules/**/*.ts"`, а в список глобалов страницы — `"Combat"`:

```js
    files: ["tools/**/*.mjs", "skills/**/*.mjs", "e2e/**/*.ts", "e2e-modules/**/*.ts", "*.config.{js,ts}", "test/**/*.ts"],
```
```js
            ...["game", "canvas", "foundry", "ui", "CONST", "Hooks", "User", "Scene", "Actor", "Setup", "Combat"],
```

- [ ] **Step 2: Сценарий**

`D/e2e-modules/redline-combat.spec.ts`:

```ts
// REDLINE COMBAT 0.5.0 в ЗАПУЩЕННОЙ Foundry 12.331: ведущий и игрок в изолированных сессиях.
import fs from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { launchBrowser, newSession, joinAs, reloadAndWait, consoleErrors } from "../tools/browser/foundry.mjs";
import { loadConfig } from "../tools/bench/lib.mjs";

type Session = Awaited<ReturnType<typeof newSession>>;
type Weapon = { id: string; name: string; ammo: { value: number; max: number } | null };
type Selected = {
  name: string;
  hp: { value: number; max: number };
  weapons: Weapon[];
  selectedWeaponId: string;
  skills: { id: string; name: string }[];
};

const cfg = loadConfig();
const ART = "artifacts/redline";
const HUD = "#redline-combat-hud";
test.describe.configure({ mode: "serial" });

let browser: Browser;
let gm: Session, player: Session;

const state = (page: Page) =>
  page.evaluate(
    () =>
      (game.modules.get("redline-combat") as never as { api: { getState(): { selected: Selected | null } } }).api.getState()
        .selected,
  );
const strip = (page: Page) => page.locator(`${HUD} .redline-strip`);
const toggle = (page: Page, id: string) => page.locator(`${HUD} [data-action="toggle-card"][data-id="${id}"]`);
const card = (page: Page, id: string) => page.locator(`${HUD} .redline-card[data-card="${id}"]`);
const shown = (s: Selected) => s.weapons.find((w) => w.id === s.selectedWeaponId) ?? s.weapons[0];
const magazine = (page: Page, name: string) =>
  page.evaluate(
    (n) => (game.actors!.getName("Тестовый персонаж")!.items.getName(n) as never as { system: { magazine: { value: number } } }).system.magazine.value,
    name,
  );
const scale = (page: Page) => page.evaluate(() => game.settings.get("redline-combat" as never, "interfaceScale" as never) as unknown as number);
const cprDialog = (page: Page) =>
  page.locator(".window-app.dialog").filter({ has: page.locator('button.cpr-dialog-button[name="confirm"]') }).last();

test.beforeAll(async () => {
  fs.mkdirSync(ART, { recursive: true });
  browser = await launchBrowser();
  gm = await newSession(browser, cfg.url);
  player = await newSession(browser, cfg.url);
  await joinAs(gm.page, "Gamemaster");
  await joinAs(player.page, "Игрок");
  await gm.page.evaluate(() =>
    canvas.tokens!.placeables.find((t) => t.name === "Тестовый персонаж")?.control({ releaseOthers: true }),
  );
  for (const s of [gm, player]) {
    await s.page.evaluate(() => game.settings.set("redline-combat" as never, "interfaceScale" as never, 80 as never));
  }
});

test.afterAll(async () => {
  for (const [name, s] of [
    ["gm", gm],
    ["player", player],
  ] as const) {
    if (s) fs.writeFileSync(`${ART}/console-${name}.json`, JSON.stringify(s.consoleLog, null, 2));
  }
  await browser?.close();
});

test("полоса видна у ведущего и игрока, данные совпадают с документами", async () => {
  for (const s of [gm, player]) {
    await expect(strip(s.page)).toBeVisible();
    const selected = (await state(s.page))!;
    expect(selected.name).toBe("Тестовый персонаж");
    const weapon = shown(selected);
    await expect(strip(s.page).locator(".redline-hp .redline-num")).toHaveText(String(selected.hp.value));
    await expect(strip(s.page).locator(".redline-cell-weapon .redline-strip-text")).toHaveText(weapon.name);
    if (weapon.ammo) await expect(strip(s.page).locator('[data-vital="ammo"]')).toHaveText(String(weapon.ammo.value));
  }
  await player.page.locator(`${HUD} .redline-strip-wrap`).screenshot({ path: `${ART}/strip-player.png` });
});

test("каждая карточка открывается и закрывается: Esc, щелчок мимо", async () => {
  const page = player.page;
  for (const id of ["character", "weapon", "target", "skills", "more"]) {
    await toggle(page, id).click();
    await expect(card(page, id)).toBeVisible();
    await expect(toggle(page, id)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(card(page, id)).toBeHidden();
    await expect(toggle(page, id)).toBeFocused();
    await toggle(page, id).click();
    await expect(card(page, id)).toBeVisible();
    await page.mouse.click(760, 260);
    await expect(card(page, id)).toBeHidden();
  }
  const skill = (await state(page))!.skills.find((s) => s.name.length > 4)!;
  await toggle(page, "skills").click();
  await page.locator(`${HUD} [data-skill-search]`).fill(skill.name.slice(0, 4));
  await expect(page.locator(`${HUD} .redline-skill-row[data-id="${skill.id}"]`)).toBeVisible();
  await card(page, "skills").screenshot({ path: `${ART}/card-skills.png` });
  await page.keyboard.press("Escape");
});

test("выбор оружия и режима меняет только полосу", async () => {
  const page = player.page;
  await toggle(page, "weapon").click();
  await page.locator(`${HUD} [data-action="choose-weapon"]`, { hasText: "Assault Rifle" }).click();
  await expect(page.locator(`${HUD} .redline-cell-weapon .redline-strip-text`)).toHaveText("Assault Rifle");
  const auto = page.locator(`${HUD} [data-action="choose-mode"][data-mode="autofire"]`);
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${HUD} [data-action="weapon-attack"]`)).toHaveAttribute("data-mode", "autofire");
  await card(page, "weapon").screenshot({ path: `${ART}/card-weapon.png` });
  await page.locator(`${HUD} [data-action="choose-mode"][data-mode="attack"]`).click();
  await page.locator(`${HUD} [data-action="choose-weapon"]`, { hasText: "Heavy Pistol" }).click();
  await expect(page.locator(`${HUD} .redline-cell-weapon .redline-strip-text`)).toHaveText("Heavy Pistol");
  await page.keyboard.press("Escape");
  const equipped = await page.evaluate(
    () =>
      game.actors!.getName("Тестовый персонаж")!.items.filter(
        (i) => i.type === "weapon" && (i as never as { system: { equipped: string } }).system.equipped === "equipped",
      ).length,
  );
  expect(equipped).toBe(3);
});

test("атака: отмена не тратит патроны, подтверждение тратит ровно один и показывает результат", async () => {
  const page = player.page;
  const before = await magazine(page, "Heavy Pistol");
  expect(before).toBeGreaterThan(1);
  await page.locator(`${HUD} [data-action="weapon-attack"]`).click();
  await expect(cprDialog(page)).toBeVisible();
  await cprDialog(page).locator('button.cpr-dialog-button[name="cancel"]').click();
  await expect(cprDialog(page)).toBeHidden();
  await page.waitForTimeout(800);
  expect(await magazine(page, "Heavy Pistol")).toBe(before);

  await page.locator(`${HUD} [data-action="weapon-attack"]`).click();
  await expect(cprDialog(page)).toBeVisible();
  await cprDialog(page).locator('button.cpr-dialog-button[name="confirm"]').click();
  await expect.poll(() => magazine(page, "Heavy Pistol")).toBe(before - 1);
  const toast = page.locator(`${HUD} .redline-toast`);
  await expect(toast).toBeVisible();
  await expect(toast.locator("[data-result-status]")).toHaveAttribute("data-result-status", "completed");
  await expect(strip(page).locator('[data-vital="ammo"]')).toHaveText(String(before - 1));
  await page.locator(`${HUD} .redline-strip-wrap`).screenshot({ path: `${ART}/toast.png` });
  await page.waitForTimeout(800);
  expect(await magazine(page, "Heavy Pistol")).toBe(before - 1);
});

test("результат скрывается сам, история хранит действие", async () => {
  const page = player.page;
  await page.mouse.move(760, 260);
  await expect(page.locator(`${HUD} .redline-toast`)).toBeHidden({ timeout: 16_000 });
  await toggle(page, "history").click();
  await expect(card(page, "history").locator(".redline-result-card")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("навык из карточки навыков открывает штатный диалог броска", async () => {
  const page = player.page;
  await toggle(page, "skills").click();
  await page.locator(`${HUD} [data-action="selected-skill"]`).click();
  await expect(cprDialog(page)).toBeVisible();
  await cprDialog(page).locator('button.cpr-dialog-button[name="cancel"]').click();
  await expect(cprDialog(page)).toBeHidden();
  await page.keyboard.press("Escape");
});

test("масштаб тянется за уголок, переживает перезагрузку и сбрасывается двойным щелчком", async () => {
  const page = player.page;
  const grip = page.locator(`${HUD} .redline-scale-grip`);
  const box = (await grip.boundingBox())!;
  const before = (await strip(page).boundingBox())!.width;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y - 40, { steps: 8 });
  await expect(page.locator(HUD)).toHaveClass(/is-scaling/);
  await expect(grip).toHaveAttribute("aria-valuenow", "100");
  await page.mouse.up();
  await expect.poll(() => scale(page)).toBe(100);
  expect((await strip(page).boundingBox())!.width).toBeGreaterThan(before * 1.15);
  await reloadAndWait(page);
  await expect(page.locator(`${HUD} .redline-scale-grip`)).toHaveAttribute("aria-valuenow", "100");
  await page.locator(`${HUD} .redline-scale-grip`).dblclick();
  await expect.poll(() => scale(page)).toBe(80);
});

test("в начатом бою видна очередь, ход персонажа подсвечен, у игрока нет «Следующего хода»", async () => {
  await gm.page.evaluate(async () => {
    const scene = game.scenes!.active!;
    const combat = (await Combat.create({ scene: scene.id, active: true }))!;
    await combat.createEmbeddedDocuments(
      "Combatant",
      scene.tokens.contents.map((t) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, initiative: t.name === "Тестовый персонаж" ? 20 : 10 })),
    );
    await combat.startCombat();
  });
  for (const s of [gm, player]) await expect(s.page.locator(`${HUD} .redline-combat`)).toBeVisible();
  await expect(gm.page.locator(`${HUD} [data-action="next-turn"]`)).toBeEnabled();
  await expect(player.page.locator(`${HUD} [data-action="next-turn"]`)).toHaveCount(0);
  await expect(player.page.locator(`${HUD} .redline-strip.is-turn`)).toBeVisible();
  await player.page.screenshot({ path: `${ART}/combat-player.png` });
  await gm.page.evaluate(() => game.combat?.delete());
  await expect(player.page.locator(`${HUD} .redline-combat`)).toHaveCount(0);
});

test("на 1024×768 и 1920×1080 полоса и карточки помещаются в свободную зону", async () => {
  const page = player.page;
  for (const [width, height] of [
    [1024, 768],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const box = (await strip(page).boundingBox())!;
    const sidebar = await page.locator("#sidebar").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(sidebar ? sidebar.x : width);
    for (const id of ["character", "skills"]) {
      await toggle(page, id).click();
      const c = (await card(page, id).boundingBox())!;
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `${ART}/${id}-${width}.png` });
      await page.keyboard.press("Escape");
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 });
});

test("в консоли нет ошибок REDLINE", async () => {
  for (const s of [gm, player]) {
    const errors = consoleErrors(s.consoleLog, /redline/i);
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  }
});
```

- [ ] **Step 3: Прогон**

Run: `cd C:/Users/Horusian/foundry-dev && npm run e2e:redline`
Expected: `10 passed`. Если упал — читать `test-results/modules/*/error-context.md` и снимки в `artifacts/redline/`, чинить код модуля (Tasks 4–7), повторять. Не подгонять тест под ошибку модуля.

- [ ] **Step 4: Посмотреть снимки**

Открыть `D/artifacts/redline/strip-player.png`, `card-weapon.png`, `card-skills.png`, `toast.png`, `combat-player.png`, `character-1024.png`, `skills-1024.png` и сравнить с `before-0.4.0.png`: полоса тонкая, фаски и сегменты видны, карточки не обрезаны и не уходят за край, текст читаем.

- [ ] **Step 5: Линт стенда и commit (foundry-dev)**

```bash
cd C:/Users/Horusian/foundry-dev && npx prettier --write e2e-modules playwright.modules.config.ts tools/bench/redline.mjs && npx eslint . && git add e2e-modules playwright.modules.config.ts eslint.config.js tools/bench/redline.mjs && git commit -m "Сценарий Playwright для REDLINE COMBAT 0.5.0"
```

---

### Task 9: Версия 0.5.0 и документация

**Files:**
- Modify: `M/module.json`, `M/package.json`
- Modify: `CHANGELOG.md`, `M/README.md`, `M/QA.md`

- [ ] **Step 1: Версия**

В `M/module.json`: `"version": "0.5.0"`, `"readme"` и `"changelog"` — `.../blob/v0.5.0/...`, `"download": "https://github.com/Defaulter444/CPR-RED-COMBAT/releases/download/v0.5.0/redline-combat.zip"`, `"description"`: `"Боевая полоса Cyberpunk RED: персонаж, HP и броня, оружие и патроны, цель, атака и навыки в одну строку; подробности в карточках над элементами. Адаптер CPR 0.92.4."`. В `M/package.json`: `"version": "0.5.0"`. Папку `distribution/` не трогать — она обновляется только при выпуске по команде пользователя.

- [ ] **Step 2: CHANGELOG**

В начало `CHANGELOG.md` (после заголовка файла) вставить:

```markdown
## 0.5.0 — «Неоновая полоса»

- Широкий док заменён тонкой полосой внизу по центру: персонаж, HP, броня, состояния, оружие и патроны, цель, атака, урон, перезарядка, навыки.
- Подробности открываются карточками над своим элементом: персонаж, оружие и режимы, цели, навыки, история, меню «Ещё». Одна карточка за раз; Esc и щелчок мимо закрывают.
- Результат действия всплывает над полосой и скрывается сам через 12 секунд; история хранит последние действия сессии.
- Масштаб 50–150% без шагов: тяните за уголок полосы, двойной щелчок возвращает 80%. Окно «Настроить размер» удалено.
- Стиль «неон и хром»: фаски, скошенные сегменты HP по штатному состоянию ранений, красный для действия, бирюзовый для цифр.
- Удалена клиентская настройка `dockExpanded`. Правила, броски, права и API (`open`, `close`, `toggle`, `refresh`, `getState`) не изменились.
```

- [ ] **Step 3: README модуля**

Заменить первые два раздела `M/README.md` (от `# REDLINE COMBAT — 0.4.0` до заголовка `## Обновление, установка и откат`) на:

```markdown
# REDLINE COMBAT — 0.5.0

Боевая полоса для **Foundry 12.331 / Cyberpunk RED Core v0.92.4**.

## Полоса

Внизу по центру — одна строка: портрет и имя, сегменты HP (цвет — штатное состояние ранений), SP головы и тела, значки травм и эффектов, выбранное оружие с патронами, цель, «Атака», «Урон», «Перезарядка», «Навыки», «История», «Ещё». Когда ходит показанный персонаж, по верху полосы горит красная линия. Без выбранного токена полоса показывает «Выберите токен».

## Карточки

Щелчок по элементу открывает карточку над ним: персонаж (HP, ранения, травмы, эффекты, броня, лист), оружие (экипированное оружие, режимы, выбор патронов), цели, навыки (избранное ★, разделы листа, поиск, бросок, другие броски), история, «Ещё» (инициатива, спасбросок смерти, патроны, лист, обновить, скрыть HUD). Открыта одна карточка; Esc или щелчок мимо закрывают её, стрелки двигают по списку.

После действия над полосой всплывает результат: название, итог в пределах ваших прав, следующий шаг, «Открыть чат» и «Урон при попадании…». Он скрывается сам через 12 секунд, пока курсор или фокус не внутри. Модуль не решает, попал ли выстрел: сверяйте результат с DV или защитой цели.

## Масштаб

Тяните за уголок в правом нижнем углу полосы: вправо или вверх — крупнее, влево или вниз — мельче, 50–150%. Двойной щелчок по уголку возвращает 80%. Значение сохраняется только для вас; то же число есть в настройках модуля.
```

Остальные разделы README (установка, откат, исторические версии) оставить; в разделе об установке заменить номера `0.4.0` на `0.5.0`.

- [ ] **Step 4: QA.md**

В начало `M/QA.md` добавить раздел `## 0.5.0 — неоновая полоса (2026-11-01)` с фактическими данными из прогонов: число пройденных тестов `npm test` (из вывода), итог `npm run e2e:redline` (из вывода, ожидается 10/10), версии стенда (Foundry 12.331, CPR v0.92.4, Chrome 156), размеры полосы при 80% и 100% из теста масштаба, список снимков из `foundry-dev/artifacts/redline/`, и строку «Night City UI не проверялся: на стенде и в рабочей Foundry его нет».

- [ ] **Step 5: Финальная проверка**

Run:
```bash
cd C:/Users/Horusian/CPR-RED-COMBAT/foundry/redline-combat && npm test && cd C:/Users/Horusian/foundry-dev && npm run e2e:redline
```
Expected: все модульные тесты PASS, сценарий `10 passed`.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Horusian/CPR-RED-COMBAT && git add CHANGELOG.md foundry/redline-combat/README.md foundry/redline-combat/QA.md foundry/redline-combat/module.json foundry/redline-combat/package.json && git commit -m "REDLINE COMBAT 0.5.0: версия и документация"
```

Сборка архива, обновление `distribution/` и публикация на GitHub — только по отдельной команде пользователя (навык `foundry-release`).
