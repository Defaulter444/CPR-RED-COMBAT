# Исследование решений

## Метод и доказательства

Проверены первичные Git-источники и опубликованные manifests/ZIP, где они доступны. `minimum` означает заявленный нижний предел, `verified` — заявление автора; ни одно поле не доказывает работу в конкретном мире. Поиск GitHub не считается доказательством функциональности. Все коммиты локальных копий находятся в `sources-lock.json`; исходники копий не изменены.

Основные опубликованные артефакты, SHA-256, вложенные manifests и сравнение файлов с checkout записаны в [verified-artifacts.json](sources/verified-artifacts.json). SHA фиксирует скачанный артефакт, а не удостоверяет подпись автора. TLS-проверки не отключались.

## Основные кандидаты

| Решение / автор / назначение | Проверенные версии и требования | Лицензия / ограничение / фактическая проверка |
|---|---|---|
| [Cyberpunk RED — Combat HUD](https://github.com/Vec97/cpr-combat-hud), Vec97. Нижняя панель персонажа, оружия, навыков, ролей, инициативы и NET-команд | Manifest и ZIP **1.1.3**; minimum/verified **12**. Система `cyberpunk-red-core`; README ориентирован на **0.92.x**. Обязательных модулей manifest не объявляет | MIT. Прочитаны шаблон, CSS, события и реализация HUD. 11 файлов ZIP совпадают побайтно с основной веткой; отличается manifest. Реконструирован интерфейс. В Foundry не запускался |
| [Token Action HUD CPR](https://github.com/rhlowe/token-action-hud-cyberpunk-red), Rob Lowe. Системный набор действий для общего HUD | Manifest/ZIP **1.0.5**; Foundry minimum/verified **12.343**, maximum **12.999**. Core **2.0.11–2.0.99**, verified **2.0.16**; socketlib verified **1.1.3**. Система verified **v0.89.2**, maximum **v0.99.99** | GPLv3 адаптера. Прочитаны action/roll handlers; NET в README ещё «COMING SOON». 40 файлов совпадают с ZIP, отличаются README/package-файлы. Системная интеграция не исполнялась |
| [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core), Larkinabout, Drental, ^ and stick. Компоновка, темы, меню, настройка групп | Checkout **тега 2.0.16**, опубликованные manifest/ZIP **2.0.16**. Исходный manifest тега содержит **2.0.11**, опубликованный — **2.0.16**. Foundry minimum **12.331**, verified **13.342**. socketlib. Это не разрешение ставить Core 2.1.x для адаптера CPR 1.0.5 | README адаптера указывает CC BY 4.0 + Foundry Limited License для Core; условия конкретного архива нужно сохранить при распространении. 23 общих файла совпадают, manifest отличается. Использованы опубликованные CSS и HBS; сборочный dist не исполнялся |
| [Evasion Workflow](https://github.com/Vec97/cpred-evasion-workflow), manifest: yioxar. Запрос защиты, встречный бросок, результат и необязательный урон | Manifest/ZIP **0.6.0**, Foundry **12.343–12.999**, verified **12.343**. CPR minimum **v0.89.1**, maximum **v0.99.99**, verified **v0.92.4**. socketlib required, Diwako recommended | MIT. Все 17 общих файлов ZIP отличаются побайтно из-за CRLF/LF, после нормализации переводов строк содержимое совпадает. Разобраны `detect`, `prompt`, `resolve`, `damage`, sockets; реконструирован prompt. Совместное исполнение не проверено |
| [Diwako CPR Additions](https://github.com/diwako/foundry-cyberpunk-red-core-additions), diwako. DV, укрытия, эффекты, stopgap-автоматизации | Main manifest **0.1.0**, опубликованный manifest и ZIP **0.10.1**. Foundry **12.343–12.999**, verified **12.343**; CPR **v0.89.1–v0.99.99**, verified **v0.89.2**; lib-wrapper required. Sequencer/JB2A/прочие интеграции optional/recommended | MIT, сохранён оригинальный LICENSE. 28 общих файлов ZIP совпадают, manifest отличается. Прочитаны DV, hit detection и cover. НЕ считать main manifest актуальным релизом; не переносить все рекомендации в required SDK |

Published ZIP — отдельный объект, а не автоматически код main. В этой работе совпадение установлено для перечисленных файлов, не для всех произвольных тегов. Core проверен именно из тега; ZIP адаптера CPR содержит верхнюю папку tagged archive. Основные ветки других модулей зафиксированы SHA; отдельное сравнение каждого Git tag не выполнено.

## Дополнительные решения и отбор

| Кандидат | Назначение / совместимость / зависимости | Вывод для REDLINE |
|---|---|---|
| [Monk’s Combat Details](https://github.com/ironmonk88/monks-combat-details), IronMonk | Универсальные уведомления хода, улучшения трекера. **Published 12.02** minimum/verified 12; отдельный tagged source archive сохранён. Main **14.03** — не нужная версия. GPLv3 с Commons Clause и Foundry EULA по README; v12 manifest не объявляет системный CPR-адаптер | Сохранить ясное уведомление «ваш ход» и обзор раунда. Авторские изображения `screenshots/CombatRound.png`, `your-turn.png` — это авторские материалы основной ветки, не доказательство v12/CPR. Включать только после проверки конфликтов Hooks и управления ходом |
| [Combat Carousel](https://github.com/death-save/combat-carousel), Evan Clarke | Универсальная очередь портретов. Main/latest **0.3.3**, minimum **10.275**, verified **10.291**. GPLv3 | Архивный визуальный референс. Minimum ниже v12 не подтверждает v12. Не выбран как runtime-зависимость; компактную очередь сделать над штатными Combatant |
| [Automate Net Combat](https://github.com/VebjornNyvoll/automate-net-combat), Vebjørn Nyvoll | Нативный CPR: summon Black ICE, linked actor/program/token, атака и chat cards. Main **0.1.6**, published manifest сохранён; Foundry minimum/verified **12**, maximum **13**; CPR minimum **0.89.1**, verified **0.89.2**. Architect/lib-wrapper рекомендованы | MIT, контент правил отдельно под политикой RTG. Полезен как референс связи programUUID и Black ICE. В `scripts/combat.mjs` есть прямые изменения HP/REZ и собственный бросок d10; нельзя назвать его проверенным системным pipeline или автоматически подключить к REDLINE. Автоматический spawn выключен по умолчанию |
| [State Aware Tokens](https://github.com/VebjornNyvoll/vebjorns-state-aware-tokens), Vebjørn Nyvoll | Универсальный визуальный state machine, CPR shim. Main manifest содержит build placeholders; published manifest **0.1.8** сохранён отдельно. Foundry minimum 12, verified 13 в main; lib-wrapper required, socketlib recommended. MIT | Сохранить приоритет состояний и очистку/смену визуального представления. Это эффекты, а не источник HP/правил; использовать только после проверки конкретного published build |
| [Sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer), Wasp | Универсальные последовательности эффектов. Published **3.6.11** minimum 12, verified/maximum 13; socketlib required. Лицензия в исходном LICENSE, не лицензия на внешние библиотеки эффектов | Не обязательная зависимость первого HUD. Эффекты допускаются адаптером, не завершают игровую транзакцию; assets/JB2A имеют отдельные условия. Main/latest нельзя безусловно ставить в v12 |
| [Argon / Enhanced Combat HUD](https://github.com/theripper93/enhancedcombathud), theripper93, Mouse0270 | Визуальная/компонентная платформа. Main manifest **3.1.0** для **14**, latest release list уже **5.0.1**; это отдельные наблюдения. GPLv3 в checkout. CPR-адаптер не обнаружен в выполненном поиске | Только визуальный референс. Поддержка другого адаптера не доказывает CPR. Не переносить action economy D&D. Дополнительно прочитаны published 2.0.1, 2.4, 2.5.15: minimum/verified 11. v12-совместимый релиз не выбран и не утверждается |
| [socketlib](https://github.com/manuelVo/foundryvtt-socketlib), актуальный asset download ведёт к farling42 | Published manifest **v1.1.3** minimum 11, verified 13. Это маршрутизация между клиентами, не сервер транзакций | Рассматривать после точной фиксации совместимого релиза. Отсутствующий GM и несколько активных GM требуют собственной политики исполнителя. Код библиотеки/совместное исполнение здесь не исследованы достаточно для гарантий безопасности |

Отвергнутые неверные адреса (сохранённые ответы 404) не являются кандидатами. Поиск исправил адрес Carousel на `death-save/combat-carousel` и Argon на `theripper93/enhancedcombathud`. Существование найденного экспериментального `astra-foundry` другого автора не делает его нашей готовой платформой; он не использован как основа.

## Визуальные материалы и выводы

**Снимков работающего модуля в нашей Foundry-среде нет.** Ни одна генеративная картинка не использована как свидетельство существующего интерфейса.

| Материал | Что воспроизведено | Сохранить / изменить |
|---|---|---|
| [Combat HUD](renders/source-combat-hud-1920.png), [Skills](renders/source-combat-hud-skills-1920.png) | Реальный HBS + оригинальный CSS; условный actor, fallback Arial и заменённые значки/портреты. Данные изолированы; обработчики Foundry не исполняются | Сохранить системные команды оружия, избранные навыки и роли. В реконструкции 1920 видны плотные маленькие подписи и усечённое имя оружия. REDLINE выносит детали в панель, увеличивает текст и оставляет одно главное действие. Это вывод о данной реконструкции, не полный accessibility-аудит оригинала |
| [TAH + Core](renders/source-token-action-hud-1920.png) | HBS Core + **published CSS 2.0.16**, открытая группа Heavy Pistol. Foundry wrapper восстановлен; меню принудительно открыто для capture | Сохранить пользовательские группы, быстрые действия, настройку по actor. REDLINE группирует атака/защита/результат в понятный процесс и не предлагает Damage как независимое автоматическое попадание |
| [Evasion prompt](renders/source-evasion-1920.png) | HTML из `prompt.js`, локализация автора, original CSS; светлая условная область чата | Сохранить чёткий выбор участника, связь с атакующим и целью. REDLINE показывает фазу, ожидание и возможность восстановления; отсутствие DV — ошибка, не hit |
| [Авторский GIF TAH](reconstructions/tah-author.gif) | Оригинальный файл `static/tah.gif` из репозитория Rob Lowe, без генерации | Авторская демонстрация; версия сборки и мир в GIF не установлены. Не сравнивать его числа со сценой реконструкции |

Штатные стили Foundry, Icon/font ресурсы, actor state и настройки пользователя меняют конечный рендер. Реконструкции не запускают Application, Hooks, socketlib или canvas; они не позволяют измерить реальные задержки и полный flow.

## Сценарий и число действий

Исходники Combat HUD дают выбор token → weapon Attack → системный roll dialog → chat card; подготовка цели зависит от настройки targeting. TAH даёт group → action → системный roll handler/dialog; виден независимый Damage. Evasion добавляет отдельную whispered card и ожидание другого клиента. Это анализ кода, **не измеренное число кликов в настоящей Foundry**.

REDLINE в демо: 1) выбрать actor, 2) выбрать видимую цель, 3) подготовить атаку, 4) подтвердить, 5) выбрать защиту в отдельном предпросмотре получателя, 6) GM применяет учебный результат, 7) следующий ход. Выбор уже заданного оружия не добавляет клика. Отмена на подготовке не расходует боеприпасы. Все подробности используют одну контекстную область; карта не закрывается модальным stack. На 1366 подробные панели прокручиваются; верхняя очередь и доступная часть карты остаются видимыми.

## Анализ Evasion Workflow: не переносить без исправления

1. **Скрытие результата не обеспечено на уровне данных.** `detect.js` кладёт `attackTotal` в `basePayload` (строка 146), отправляет payload ответственному пользователю. `prompt.js:89–96` сохраняет payload в flags whispered prompt, а `onPrompt` также пишет payload в console. Whisper защищает от других пользователей, но сам защищающийся получает численное значение. CSS/whisper исходной attack card это не исправляют. Новый recipient DTO не должен содержать total, DV, private actor resources.
2. **Истечение срока не durable.** `pendingTimeouts` и `actedPrompts` — Map/Set в памяти. `prompt.js:103–113` ставит setTimeout на клиенте защиты; reload теряет таймер. Сохранять deadline/status у исполнителя и восстанавливать после ready; при отсутствии исполнителя показать задержку, не обещать фонового сервера.
3. **Unknown DV становится hit.** `prompt.js:153–156`: `dv == null ? true : attackTotal > dv`. Для нового adapter это `MISSING_DV` и ручное решение GM; урон блокируется.
4. **Ошибка создания защиты тоже может стать попаданием.** `onMelee` при `!ok` публикует MELEE_HIT; `onEvadeClick` — FAILED. Нужно отделить «бросок уклонения проигран» от «бросок не удалось построить».
5. **Dedupe локален.** Set до завершения операции предотвращает часть повторов в одной сессии, но теряется после reload и не делает изменение документов atomic. `damage.js` использует `_applyDamage` — внутренний метод, а не стабильный общий API. Нужен version-pinned bridge, журнал запроса и разбор uncertain commit.
6. **Порог REF — настройка, по умолчанию выключена.** README и `settings.js` нельзя трактовать как безусловно RAW. Eligibility включает ненулевой Evasion skill; проверку исключений и имплантов нужно согласовать с первичными правилами и системными данными.
7. **Сосуществование не означает отсутствие спойлеров.** Подавление текстовой hit line не подавляет Sequencer-эффекты Diwako. Порядок Hooks, whisper visibility и два GM требуют отдельного теста.

## Что подтверждено по правилам и коду системы

Базовая исследованная система: **tag v0.92.4**, commit в `sources-lock.json`. Это первичный код реализации, но не замена лицензионной книги правил.

- DV Pistol: `src/packs/internal/dv-tables/table.dv.pistol.yaml` ссылается на Core p.173; второй result `5Zzi0yCBSit5cAZx` содержит **7–12 / 15**. В макете показан именно этот диапазон при 10 м. Все остальные диапазоны должны считываться из выбранной системной таблицы, с единицами/масштабом сцены; «DV по дальности +2» не используется.
- `CPRAimedAttackRoll` в `src/modules/rolls/cpr-rolls.js:512–538` добавляет **−8** и сохраняет location. ROF 1 для aimed включён как требование проверки первичных правил, а не отдельно проверенная системная enforcement-функция. В демо прицельный режим **не исполняется**: нет проверенного damage/location pipeline.
- `cpr-loadable.js:205–220`: 10 патронов для Autofire/Suppressive, 1 иначе. `cpr-attackable.js:49–58` расходует при discharge; preview не должен вызывать discharge. Это не означает что любые weapon/ammo overrides уже проверены.
- `cpr-actor.js:420–437`: обычные wound penalties −2 / −4 и exception pain suppression. Не задавать их в HUD самостоятельно.
- `CPRDamageRoll` ограничивает autofire multiplier, использует иной damage mode; пользовательское значение «урон 14» не валидирует это.
- Diwako `cover.js` создаёт отдельные объекты с материалом и HP. Это не доказательство универсальной LOS/cover-автоматизации; условное «укрытие +2» не вводить.
- Evasion в melee — встречное действие по системе; ranged eligibility и tie semantics должны быть проверены в книге и доступной системе. Ошибка импорта skill не равна неудачной защите.
- Netrunner role и NET шаблоны найдены. Экономика действий по rank, физическое действие вместо NET, доступность Scanner/Slide/Backdoor и раскрытие этажей **ещё не проверены полноценно**. В макете нет придуманных очков действий, реакций или кулдаунов.

До реального адаптера остаются rulebook-проверки cover, LOS, aimed location damage, ROF, critical injuries, shields, ammo overrides, ranged dodging exceptions, NET action budget. Контент книги не копировался в SDK.
