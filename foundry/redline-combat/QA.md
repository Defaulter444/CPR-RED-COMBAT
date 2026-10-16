# Каталог навыков REDLINE: проверка 2026-10-17

Реализован выбранный второй макет с девятью штатными разделами листа. Окружение: изолированный deadline-test, Foundry 12.331 / CPR 0.92.4, Night City UI 0.3.5. Проверенная сборка подготовлена к выпуску REDLINE COMBAT 0.3.2; функциональные исходники после живой проверки не изменялись. Нативные actions.js и capabilities.js не изменены.

## Визуальный источник и доказательства

Доказательства: [docs/skills](https://github.com/Defaulter444/CPR-RED-COMBAT/tree/main/docs/skills) в репозитории. Исходный визуальный макет и реальные снимки интерфейса обозначены отдельно.

- Источник: selected-reference.png, уточнённый второй макет с названиями настоящих разделов.
- Реальный браузерный интерфейс: catalog-desktop-final.jpg. Источник и снимок имеют 1448 × 1086 px, CSS viewport 1448 × 1086, devicePixelRatio 1. Модуль при стандартных 80% занимает 528 × 430 px, ширина до масштабирования 660 px. Макет показывает увеличенный компонент; его размер не принимается за полноэкранный рабочий диалог.
- comparison-full.png помещает оба вида в один вход сравнения с одинаковым уменьшением. comparison-detail.png содержит фактические области компонентов, приведённые к общей ширине 660 px с сохранением пропорций. Увеличение небольшого браузерного JPEG делает текст мягче; это вспомогательная картинка, не ресурс интерфейса.
- В обоих состояниях открыт технический раздел и выбран «Взлом замков». Тест — Ви и его 15 технических навыков — реальные данные; Норма Осборн и пять строк макета — концептуальный пример.

## Находки и исправления

1. **P2, исправлено: Escape терял фокус.** Автоматическое сохранение поиска перекрывало явную цель возврата. Теперь поиск сохраняется только при отсутствии явной цели. После перезагрузки проверены скрытый каталог и активная кнопка toggle-skills.
2. **P2, исправлено: при 1024 × 768 / 125% кнопка броска уходила в общую прокрутку.** Прежний промежуток над доком имел высоту 202 px (catalog-narrow-125.jpg). Порог раскрытия поверх дока поднят до 300 px. Повторный снимок catalog-narrow-125-fixed.jpg: окно x63…701, y227…657, высота430; кнопка броска y571.06…618.56 целиком внутри; макросы начинаются y668. Колонки прокручиваются независимо. Геометрия записана в narrow-fixed-geometry.json.

Повторная независимая визуальная проверка полного, детального сравнения и исправленного узкого состояния не обнаружила оставшихся P0/P1/P2. Необязательный P3: добавить доступную подпись к числу результатов.

## Обязательные визуальные поверхности

- **Типографика:** существующая Arial/sans-serif, заголовок20px, строки навыков14px, разделы13px до клиентского масштаба. Иерархия заголовок → поиск → раздел/результаты → основное действие сохранена. Длинные строки переносятся. Диапазон клиентского масштаба55–125% сохранён.
- **Расстояния и структура:** две колонки, тонкие разделители, маленькие углы, самостоятельное выделение раздела и навыка. При недостатке места используется раскрытие поверх дока с доступными поиском и броском. Проверены 1448 × 1086 /80%, 1024 × 768 /80% и /125%.
- **Цвета:** прежние near-black, slate, cyan и малый красный маркер Blackglass. Выбор обозначен цветом и галочкой; фокус имеет обводку.
- **Изображения и значки:** новые иллюстрации не нужны; управляющие значки из существующего Font Awesome. Сцена и портрет остаются ресурсами тестового мира и не входят в ZIP. Сгенерированная картинка служит только визуальным источником.
- **Текст:** разделы читаются через тот же cprFindConfigObj('skillCategories'), что использует лист, и текущую локализацию. Ключ rangedweaponSkills сохраняется точно. Сложные навыки показывают штатный (x2). Нет выдуманных итогов, сложности или вероятности успеха.

## Функциональные проверки и ограничения

- Названия разделов, точные ID, имена и порядок всех63 навыков сняты из реального листа и сопоставлены с каталогом: совпали все9 групп, включая Local Expert и (x2). category-verification.json содержит результат.
- Поиск «ВЗ» в техническом разделе оставляет два навыка, сохраняя ввод. Стрелка выбирает результат, Enter открывает штатный диалог: TECH6, навык0 (native-dialog.jpg). Отмена не добавила карточку. Один подтверждённый бросок изменил число сообщений56→57 и создал ровно одну карточку «Взлом замков», результат10; HP и боеприпасы не менялись.
- Пустой результат отключает основную кнопку, очистка восстанавливает список. Раздел, запрос и выбор сохраняются при повторном открытии в текущем сеансе, отдельно для субъекта. «Другие броски» раскрывает прежние действия, недоступный спасбросок смерти отключён.
- Проверены закрытие снаружи, Escape с возвратом фокуса, сохранение125% после перезагрузки и сброс80%. Финальный журнал браузерных ошибок пуст.
- **119 автоматических тестов прошли**, включая новые категории/поиск/идентичность/неизвестные категории/пустые разделы и прежние права, ревизии, системные действия и ресурсы. Синтаксис и git diff --check без ошибок.
- ZIP содержит новый scripts/skills.js. Сборка в отдельную папку не заменяет опубликованные файлы. Восемь установленных клиентских файлов сверены побайтно; предыдущая тестовая версия сохранена в backup.

Свежие живые проверки выполнены под Gamemaster. Игровые права и потеря доступа дополнительно проверены автоматическими тестами; нового отдельного сеанса Player не было. Рабочая кампания не использовалась и её файлы не изменялись. Итерации ограничены проверенной системой CPR0.92.4 и Foundry12.331.

final result: passed


---

# REDLINE COMBAT 0.3.1 — compact interface verification

Date: 2026-10-16. Foundry 12.331 / Cyberpunk RED Core 0.92.4, Night City UI 0.3.5, isolated disposable `deadline-test`, loopback port 30001. Only the test world and module repositories were changed.

## Current changes and live scope

- Client `interfaceScale` defaults to 80%, accepts 55–125% in steps of 5, and is available through the dock gear and Foundry module settings. No Actor/Item data is written by resizing. Both actor dock and initiative use the same scale; preferred layout width is capped at 1100 before scaling.
- At 1672 × 941 / 80%, actor dock was 880 × 156.36, compared with the former 1288 × 195. Started queue was 880 × 64.36. At 55%, dock was 605 × 108.11. Applied 125% persisted after page reload; reset restored 80%.
- At 1280 × 720 / 80%, dock was 880 × 153.16, ending at y656 while macro bar began at y666.
- Prepared combat at round 0 had no `.redline-combat` element. Native Begin Combat changed round 0 → 1 and mounted the queue. Native Previous Round changed 1 → 0 and removed it again. Clicking the NCU Battle navigation alone did not start the combat. The delete/end-confirmation flow was not exercised in this pass; absent and inactive combat are covered by projection/view tests.
- At 1024 × 768 / 125% with expanded DEADLINE, timer ended at y223.72; queue y236–345.5; dock y358–658; macro bar began at y668. Actor content scrolled within its height limit. Skills overlay y357–657, height300, retained a usable scroll area and cleared queue/macros. Escape closed it.
- A click from open Skills to Attack opened the native dialog on the first click. Cancel preserved 5/8 ammunition. Native action implementations were not changed.
- NCU Players defaulted to a 160 × 38 compact header. Own disclosure expanded/collapsed it; native header still toggled offline Player visibility. Drag moved x64,y893 → x234,y223 without moving the actor dock. Position and 125% scale survived reload. More's visibility toggle hid the entire Players panel; reset showed it, collapsed it and restored x64,y893. Disable NCU removed own Players controls/classes and restored the native header; re-enable restored the personal preference. The final preview uses 80% with Players hidden and timer ready/collapsed.
- Final browser error log was empty. Fresh live checks in this release used Gamemaster; prior Player checks below remain historical.

## Automated scope and evidence

**99 REDLINE tests and 85 Night City UI tests passed**, with no failures/skips. Syntax and diff checks passed. Native `actions.js` and `capabilities.js` are unchanged. New tests cover scale normalization/sizing, explicit combat-start visibility, client settings, Players pointer/cancel/blur/lifecycle behavior, async-save races and preservation of native/foreign child listeners.

Current screenshots are [docs/compact](https://github.com/Defaulter444/CPR-RED-COMBAT/tree/main/docs/compact). Hero: `idle-80-wide.png`; active queue: `combat-80-wide.png`; moved Players: `players-moved.png`; constrained view: `narrow-125-timer.png`; settings: `scale-settings.png`. The project-root `design-qa.md` records the current visual scope separately from historical 0.3.0 fidelity work.

Limits: no live AV-dock session or the user's third-party trade button was present. The controller preserves that existing content and its listeners in independent tests; it never replaces the native list. Mobile widths below 1024 px and arbitrary third-party combinations are not claimed. System/Foundry compatibility limits remain unchanged.

---

# Historical: REDLINE COMBAT 0.3.0 — Blackglass Dock verification scope

Date: 2026-10-16. Environment: isolated disposable deadline-test world, Foundry VTT 12.331 / Cyberpunk RED Core v0.92.4, loopback port 30001. Night City UI 0.3.4 compatibility layer. Production campaigns were not changed.

## Current interface

The dock has three areas: actor portrait, HP and armor; selected equipped weapon, item image, mode and ammunition; target, primary Attack and secondary actions. One native control collapses it to 57 px. Expansion is a persistent client setting (`dockExpanded`). Selected weapon is remembered per actor only for the current page session and resets on reload; it does not alter equipment. Skills open in a scrollable panel above the dock. When the queue leaves too little room above the dock, Skills temporarily overlays the dock area while remaining clear of the queue and macros. Insets are computed from the actual sidebar, controls, hotbar and navigation rectangles. A visible DEADLINE timer also reserves vertical space above the queue. The HUD retains its own header when Night City UI is disabled.

The native action adapter and permission checks remain in place. Actor and item images are read from their Documents. Special portrait, weapon and scene artwork used for this isolated QA world is test data and is not included in the module archive.

## Confirmed live scope for 0.3.0

- Reviewed the new interface at 1672 × 941, 1280 × 720 and 1024 × 768.
- At 1024 × 768, the dock measured x=62, y=383, width=640, height=275, ending at y=658; hotbar top was y=668. Queue bottom was y=150. The skills panel ran from y=163 to y=376 with a height of 213 and scrollHeight 309, leaving 13 px below the queue.
- At 1280 × 720, the dock measured x=62, width=896, height=191, ending at y=656; hotbar top was y=666. The skills panel ran from y=156 to y=458, below queue bottom y=140. The dock and skills remained inside the available canvas area.
- DEADLINE avoidance at 1672 × 941: collapsed timer bottom y=112, queue top y=124; expanded timer bottom y=223.72, queue top y=236. Pausing the timer removed its HUD and restored queue top y=60.
- With the expanded timer at 1024 × 768, the queue occupied y=236…326 and the dock y=383…658. The ordinary gap above the dock was only 37 px. Skills used the temporary dock overlay instead: y=345.22…657, height=311.78 with max-height 320, leaving about 19 px below the queue and clearing the hotbar at y=668. It remained scrollable and closed with Escape.
- Escape closed Skills and restored focus to its opening `toggle-skills` button.
- Gamemaster: ordinary attack discharged ammunition 6 → 5 exactly once and produced the native attack card. Evasion Workflow defense produced 16 against attack 9.
- Cancelling the native attack dialog preserved ammunition.
- Athletics produced a native skill result of 15.
- Player: the native attack dialog opened; cancelling preserved 5/8 ammunition. Another NPC's queue control and Next Turn were disabled.
- Night City UI did not inject its old collapse control into the marked Blackglass root. Disabling the common interface left REDLINE's own header and layout available; Alt + N restored Night City UI.
- Night City UI's common theme was switched off and on during the final GM check; the final state was `ncu-theme=true`.
- The timer was restored to its initial ready state with its display collapsed after the timer-placement checks.

This document records the tested live and automated scope. The [visual comparison against the selected concept](https://github.com/Defaulter444/CPR-RED-COMBAT/blob/main/design-qa.md) is maintained separately; no design comparison result is asserted here. Sidebar collapse was not confirmed live: its control did not change the measured bounds in this test. The dynamic-inset calculations are covered by automated tests. Historical results below concern the old card.

## Automated scope for 0.3.0

93 REDLINE tests and 59 Night City UI tests passed. The current tests cover action behavior, state projection, selected weapon presentation, geometry, DEADLINE avoidance and skill-popup placement including the limited-height overlay, alongside the compatibility guards preventing old Night City UI CSS, classes and controls from adapting the new dock. Public API `open`, `close`, `toggle`, `refresh` and `getState` remains; `openDemo` and the tutorial UI remain absent.

Limits: the action adapter targets CPR 0.92.4. Additional weapon modes, reloading and initiative retain prior implementation and automated coverage; the historical scenarios below are not represented as fresh live reruns. REDLINE itself adds no automatic target damage, remote defense workflow or NET automation. Other modules may separately handle defense and damage in the test world. Cross-client simultaneous actions follow native Foundry/CPR behavior. No production rollout is claimed by this QA record.

---

# Previous release: REDLINE COMBAT 0.2.1 verification status

The 0.2.1 update passed 77 automated tests, JavaScript/Python syntax checks, API smoke checks and an archive-content check. The installable package contains 11 production files; the tutorial button, application, API, template and prototype assets have been removed. Character action logic, state projection, permission checks and production action styles remain unchanged.

Live 0.2.1 verification: 2026-10-16, isolated deadline-test, Foundry 12.331 / CPR v0.92.4, GM and Player at 1280 × 720. The tutorial entry was absent, the initiative queue rendered for both clients, and Player's selected character card expanded to show real weapon, ammunition and skill actions. The production action source is unchanged. The broader combat report below is preserved evidence for **REDLINE 0.2.0 / Night City UI 0.3.1**, not a full rerun for 0.2.1. Production campaigns were not changed.

# Previous release: Blackglass character actions QA

Date: 2026-10-16. Night City UI 0.3.1 with REDLINE COMBAT 0.2.0.
Result: passed for the tested scope below; release candidate verified before publication.

Environment: licensed Foundry VTT 12.331, Cyberpunk RED Core v0.92.4, isolated disposable deadline-test world, loopback port 30001. No production campaign was changed. An offline snapshot of the test world and module backups were taken before installation.

## Visual scope

Actual browser review at 1440 × 900 and 1024 × 768. Blackglass retained. Compact card 80 px high; expanded actions request 340 px and are limited by available space. At 1024 × 768 the expanded card measured 638 × 276 px, ending at y=658; hotbar starts at y=668. No page horizontal overflow. Weapons and skills are reachable through vertical scrolling. The collapse control remains reachable at the bottom of the scroll and was used successfully at both widths.

Evidence: five real screenshots in the separate night-city-character-actions deliverable. No generated mockup is used as runtime evidence. The map is a separate test-scene asset and is not bundled.

## Live functional scope

Tested as Player owning «Тест — Ви», then returned to Gamemaster:

- Cancelling an attack preserves ammunition; ordinary rifle attack 9 → 8, native chat card produced.
- Autofire disabled below 10 rounds with an explanatory tooltip.
- Reload with zero reserve does not create ammunition. For this test only, native inventory reserve set to 40. Reload filled 8 → 25 and reserve became 23, verified in native ammunition chooser.
- Autofire 25 → 15. Native autofire damage card 2d6 × 1 produced 8, without another ammunition charge or HP change.
- Evasion and Athletics opened native modifier dialogs and produced native skill cards. Athletics remained selected after refresh, roll and initiative.
- Initiative rolled 8 and updated native combat order, while keeping the current combatant unchanged.
- Aimed attack opened native hit-location dialog; cancelling preserved the magazine. Suppressive mode disables separate damage.
- Player cannot select other actors for control or advance the turn. Death save disabled while HP > 0.
- Final UI: rifle 15/25, pistol 6/8, HP unchanged at 10/40. Native browser error log empty in final player/GM checks.

## Automated checks and limits

REDLINE: 76 passing tests (actions, view, state projection). Night City UI: 29 passing tests. Zero failures or skips. Node syntax checks passed for all 9 scripts. Filesystem isolation audit passed for scratch runtime/data roots, world, port and runtime version.

Integration uses public CPR factories, modifier dialogs, item ammunition methods and chat rendering. Ranged attack awaits dischargeItem exactly once because CPR 0.92.4 confirmRoll does not await that write. No system files or global prototypes were patched. Selection/permission/item validation repeats after a roll dialog; local busy guard prevents duplicate clicks.

Limits: this exact build targets CPR 0.92.4. Death-save success and melee branches are covered with unit fixtures, not an additional live injury/melee scenario. Cross-client simultaneous edits follow native Foundry/CPR behavior; no transactions or remote defense requests are added. Native ammo selection owns its dialog and stays attached to the original weapon. Mobile layouts below 1024 px and arbitrary third-party combinations are not claimed. This QA pass did not include a production rollout. Release metadata and distribution files are handled separately.
