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

# Compact interface QA — REDLINE COMBAT 0.3.1

Scope: the user's three screenshots request a smaller actor dock, configurable scale, an initiative strip only after combat starts, and a movable/collapsible/hideable Players panel. These requested proportions intentionally supersede the earlier 0.3.0 concept sizing.

Environment: isolated `deadline-test`, Foundry 12.331 / CPR 0.92.4, REDLINE 0.3.1 / Night City UI 0.3.5. Current evidence is in `docs/compact/`; parent-workspace delivery is `outputs/compact-foundry-ui/`.

- Before and after wide viewport: `before-idle-wide.png` and `idle-80-wide.png`, both 1672 × 941 CSS/pixel captures. Round0, own Vi and pistol. The old queue at round0 and full-width dock are removed/reduced as requested. Native chat history, target selection and map zoom are test data.
- At 80%: dock880 ×156.36, started queue880 ×64.36; macro gap10px. At55%: dock605 ×108.11. Applied125% survives reload and reset returns80%.
- `combat-80-wide.png` shows the active strip; native0→1 mounted it and1→0 unmounted it. No inactive placeholder remains.
- `players-moved.png` records the header moved to234,223; personal position persisted, and the actor dock did not move. Disclosure, native offline toggle, More hide/reset and NCU disable/re-enable were checked. The final preview hides Players through its personal checkbox.
- `narrow-125-timer.png` is a 1024 ×768 capture with expanded timer and125%: queue ends345.5, Skills begins357 and ends657, macros begin668. Inner scrolling keeps controls reachable.
- `scale-settings.png` records the slider. `idle-80-default.png` is an additional capture in the ordinary app viewport; `idle-80-1280.png` records1280 ×720, dock880 ×153.16.

Typography uses the existing family/weights at the chosen personal scale; foreground/background tokens, native Font Awesome icons and document images are preserved. The smaller three-column grouping and widths are intentional requested changes. Long names retain full native select options. Collapse/settings controls retain a minimum28px footprint, keyboard access and labels. No new artwork substitutes or tutorial copy was introduced.

99 REDLINE and85 Night City UI tests passed; syntax/diff checks passed. Native Attack opened and Cancel retained5/8. Final browser errors: none. Current live checks used GM; prior Player validation below is historical. No live AV or third-party trade integration was available; native/foreign content preservation is covered by controller tests. The tested scope has no remaining actionable P0/P1/P2 finding. The only visual follow-up is optional spacing polish after user feedback.

final result: passed

---

# Historical: Blackglass Dock design QA — REDLINE COMBAT 0.3.0

Date: 2026-10-16. Implementation in the existing Foundry module; no standalone replacement of Foundry or the CPR system.

## Visual truth and evidence

- Selected visual truth: `docs/blackglass/reference.png`, the first displayed concept, Blackglass Dock. Original delivery: `outputs/redline-design-concepts/01-blackglass-dock.png` in the parent workspace.
- Browser implementation: `docs/blackglass/desktop-final.png`, isolated `deadline-test` world at loopback port 30001, Foundry 12.331 / Cyberpunk RED Core 0.92.4, REDLINE 0.3.0 / Night City UI 0.3.4.
- Source and implementation both measure **1672 × 941 pixels**, with a **1672 × 941 CSS viewport**, at 1× screenshot density. No raster resampling or image reconstruction was used. The comparison page scales both full views by the same factor; its focused dock crops preserve their original pixels.
- Combined inputs: `docs/blackglass/comparison.png` (full views together) and `docs/blackglass/comparison-detail.png` (both dock regions together at their original scale). The local `comparison.html` in the delivery contains full views, focused regions and the responsive before/after evidence. Final QA used two viewport captures because the browser rejected a full-page capture; both required views were successfully captured and inspected. `timer-comparison.png` shows the two final timer interaction states together.
- Same primary state: round 3, own character selected, expanded dock, heavy pistol, visible guard target, HP 28/40 and tracked head/body SP 11. The implementation shows actual QA names and Actor/Item images. Its magazine is **5/8 after the verified shot**; the concept's fictional magazine is 6/8. Native sidebar is 300 px rather than the concept's approximately 400 px. Map zoom, token art, chat history and native token HUD are real test-world state.

## Findings and comparison history

1. **[P2, fixed] Skills overlapped initiative at 1024 × 768.** Before: popup y64–376, initiative y60–150 (`skills-1024-before.png`). Fixed `skillPopupHeight`, `main.js` geometry and `host.css` to restrict disclosure height to the actual map gap, with internal scrolling. After: popup y163–376, height 213, scroll content 309 px; queue ends at y150 and dock begins at y383 (`skills-1024.png`). Escape restores focus to the Skills button. The combined comparison contains both captures.
2. **[P1, fixed] Active DEADLINE could overlap the new initiative strip.** Before-fix DOM measurements at 1672 × 941: timer x1052, y58, 300 × 54 and queue x62, y60, 1288 × 80, overlapping by 52 px. Fixed `safeInsets` and chrome observers to reserve a visible intersecting timer without writing its position. Final browser evidence `timer-after.png` / `timer-comparison.png`: collapsed timer ends at y112, queue begins at y124; expanded timer ends at y223.72, queue begins at y236. Pausing removes the timer and returns the queue to y60. Mount, unmount and collapse were exercised live.
3. **[P2, fixed] Reserving an expanded timer left only 37 px for Skills at 1024 × 768.** DOM measurement: queue ended at y326 and dock began at y383. `skillPopupLayout` now uses a temporary drawer over the dock when the upper gap is below 180 px, preserving both the queue and macros. Final `timer-expanded-1024.png` / `timer-comparison.png`: popup y345.22–657, actual height 311.78 (available maximum 320), with every command visible and about 19 px below the queue. Escape closes it. The timer was restored to ready/collapsed after testing.

## Required fidelity surfaces

- **Fonts and typography:** Arial/sans-serif UI with monospace resource numerals preserves the source's sans hierarchy. Actor name is 23 px bold, HP 38 px, primary action 18 px, secondary actions 12 px. The image has no authoritative font metadata; it was not treated as proof of an exact proprietary face. Long document names truncate in compact cards and native selects retain full option text and accessible names. No broken wrapping in the three tested desktop sizes.
- **Spacing and layout rhythm:** Three distinct regions, slim initiative queue, portrait at the left and a red primary action at the right match the chosen composition. Desktop dock: x62, y682, 1288 × 195; macro bar begins at y887, leaving 10 px. The reference dock is roughly x66, y675, 1194 × 205. The width difference follows Foundry's real sidebar and the height remains close to the concept. At 1280 × 720 the dock is 896 × 191, bottom 656, hotbar top 666. At 1024 × 768 it becomes two rows, 640 × 275, bottom 658, hotbar top 668. The full and focused combined views were used to judge these differences.
- **Colors/tokens:** Near-black glass (`#0b1116f5`), grey dividers, cyan resources (`#5bd8e9`), crimson primary attack and yellow initiative accents preserve the chosen palette. Focus uses a cyan outline, unavailable actions remain visibly disabled, and status messages use semantic text alongside color.
- **Image quality and fidelity:** Actual portrait and weapon raster assets are displayed cleanly with `object-fit: cover` / `contain`. The QA portrait and pistol were separately generated in the chosen art direction; they are test-world assets, not mandatory module artwork. Native Foundry token icons remain the token images stored in the scene. Font Awesome supplies UI icons; no custom SVG/CSS drawing replaces the portrait, weapon or map.
- **Copy/content:** «Атака», «Урон», «Перезарядить», «Навыки», «Лист» retain the source's short command vocabulary. Additional weapon/ammo labels describe real system data. Missing resources remain unavailable, rather than fabricated. QA prefixes in document names are test data. No implementation instructions or tutorial prose were added to the play flow.

Independent visual review of the initial combined input found no additional P0/P1/P2 mismatch in typography, spacing, colors, images, copy or icons. The final full-view and focused comparison were recaptured after the timer fixes and inspected again. No actionable P0/P1/P2 remains in the tested scope.

## Functional and accessibility checks

GM and Player browser sessions used the real system dialogs and chat. A confirmed pistol attack consumed 6 → 5 exactly once and produced the native attack card; Evasion Workflow defense 16 versus attack 9 negated it. Athletics produced a native 15. Cancelling a player attack preserved 5/8 ammunition. Player NPC selection and Next Turn remained disabled. Selection of another owned subject retains that subject's own weapon choice during the current page session; collapsed state survives page reload. Weapon choice itself is intentionally session-local.

Own expand/collapse, upward Skills disclosure and constrained-height drawer, Escape and return of focus, outside click followed by Attack on the first click, NCU disable/re-enable, common theme off/on and standalone REDLINE header were checked. Final GM and Player browser error logs were empty. **93 REDLINE tests and 59 Night City UI tests passed**. Hidden target images, ownership loss, item replacement, stale revisions and duplicate commands remain covered by automated tests; `actions.js` and `capabilities.js` are unchanged. Live sidebar-collapse behavior is not claimed. Mobile widths below 1024 px, arbitrary third-party combinations and live death-save success were not tested.

## Follow-up polish (P3)

- Head/body armor uses denser text than the concept. Separate native icons or a slightly larger gap can be considered after user feedback.
- The empty actor card remains the same short prompt when toggled; it has no character actions to reveal.

## Implementation checklist

- [x] Resolve first displayed concept and inspect actual module alongside it.
- [x] Preserve native actions, permission boundaries and document imagery.
- [x] Test expanded, compact, skills and Player states at the stated sizes.
- [x] Fix responsive skills overlap and capture the revised state.
- [x] Verify active timer avoidance, removal and browser error logs in the final build.
- [x] Inspect final full-view, focused and constrained-height interaction captures together.
- [x] Complete visual QA with no remaining P0/P1/P2.

final result: passed
