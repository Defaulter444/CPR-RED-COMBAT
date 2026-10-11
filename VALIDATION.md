# Проверки и границы результата

## Устанавливаемый пакет v0.1.1

Добавлен `foundry/redline-combat/`: manifest для Foundry v12.343–12.999, legacy Application host, scoped CSS, Document hooks, read-only projection и отдельное iframe-демо. `python3 build-module.py` создаёт ZIP с единственным каталогом `redline-combat`, standalone manifest и SHA-256; в пакет не включены исходники исследованных сторонних модулей.

`node --test tests/module/state.test.mjs` — **26 passed, 0 failed**. Проверены ownership, скрытые строки и цели до чтения их имён, отсутствие ресурсов чужих actors, token UUID между сценами и synthetic actor selection, независимость текущего хода, отзыв прав, неизвестные данные, кибероружие и capacity upgrades без записи документов.

`python3 validate-module.py` — **22 passed, 0 failed** на модели публичного API в браузере. Проверены startup без world writes; скрытые данные; обновление по hooks; выбор actor и открытие штатного sheet; отсутствие повторных listeners; явная команда GM `Combat.nextTurn()` один раз при double-click; блокирование команды игрока; загрузка упакованного iframe-демо и отсутствие изменения HP/ammo мира после demo apply; закрытие/повторное открытие HUD; пустое состояние; отсутствие переполнения при 1920×1080, 1366×768 и 1093×614; отсутствие JS исключений; создание demo request ID без secure-context `crypto.randomUUID` (локальные HTTP-серверы Foundry). Результаты: `module-validation.json`. Снимок `renders/foundry-module-fixture-1366.png` помечен как API fixture.

**Это не проверка настоящего Foundry runtime.** Лицензированная сборка, установщик, реальный тестовый мир и два клиента не запускались. `compatibility.verified` намеренно не заполнен. Подготовленный пакет позволяет пользователю провести эту проверку; боевые системные операции остаются нереализованными.

У GitHub API создание релиза доступно, но загрузка assets в `uploads.github.com` получила `401 Bad credentials`; после неуспешной операции релиз и tag отсутствовали. ZIP, manifest и SHA-256 опубликованы в `distribution/` через рабочую HTTPS Git-аутентификацию. Установка не зависит от GitHub Pages или release assets.

## Выполнено для браузерного прототипа

`python validate.py` — **31 passed, 0 failed** в финальном прогоне. Подробные assert-названия в `validation.json`. Runner падает при неуспехе, проверяет реальное DOM/state браузера, не только синтаксис JS. После визуального просмотра stress-снимка исправлен выход длинных имён за высоту очереди: фиксированная высота, ellipsis и полное имя в tooltip.

Проверены: preview/cancel без расхода ammo; double execute; recipient projection без attackTotal/DV/result/HP; сохранение pending ID после reload; обе ветки защиты; player apply disabled; GM demo-apply один раз и после reload; advance turn; empty magazine/reload; unknown DV; hidden target; actor without weapon; независимость selection/turn; empty combat; 24 participants; русский длинный текст; 125% размер dock; сохранение стороны панели и выключенных анимаций; collapse/reopen; пять повторных открытий без дублирования handlers; плоское представление NET; недоступность не реализованного aimed execution; отсутствие JavaScript исключений.

`python validate-examples.py` — раскрытие досье, read-only resource preview, ремонт 5→3 energy, блокирование повторного ремонта, закрытие native dialog и доступность gallery прошли. Асинхронное закрытие dialog проверяется ожиданием DOM, а не преждевременным чтением.

`python capture.py` — семь отдельных новых экранов на **1920×1080** и **1366×768**, четыре реконструкции на 1920×1080. `browser-errors.json` пуст. Отдельно сохранены stress-1366 и SDK examples. Все экраны используют одинаковую демонстрационную карту, одно viewport, единый набор условных actor данных.

При визуальном просмотре исправлены: ошибочная локализация flat keys Combat HUD, отсутствие Foundry wrapper у Core CSS, перекрытие контекстной панелью правой части dock. Original templates/CSS в источниках не правились; исправления только в renderer реконструкций и нашем frontend.

Браузерный test нашёл реальный двойной клик: первый click сменял panel, второй попадал в choice новой панели. `MouseEvent.detail > 1` теперь игнорируется, state transition guard дополнительно проверяет phase. Повторный тест прошёл. Это предотвращение click-through в демо, **не межклиентный transactional dedupe**.

Другие первоначальные ошибки тестов исправлены в runner: selector close уточнён через первый соответствующий control, reload тест удаляет `?reset=1` из URL перед перезагрузкой. Эти ошибки не выдаются за application defects.

В исходных копиях `git status --porcelain` пуст. На первоначальном исследовательском этапе пользовательский `CPR-RED-COMBAT` был пуст и не менялся. Затем пользователь попросил публикацию: материалы перенесены сюда для проверки. Источники отдельно клонированы исключительно для исследования.

## Что эти проверки не доказывают

- Лицензированная Foundry сборка не установлена; тестовый world не запускался. **0 Foundry integration tests executed**, не «passed».
- Нет реального socketlib session, двух GM или attacker/defender clients. Роли в UI — учебный переключатель. Авторизация на сервере не проверена.
- Защита от повторного применения ограничена одной JS-сессией и сохранением её состояния. localStorage не транзакция; нельзя обещать защиту от одновременных вкладок/клиентов или crash window.
- «Имитировать переподключение» делает browser reload. Настоящие disconnect/rejoin/permissions/document sync не тестировались.
- Известный DV выбирается условно; графическая дистанция и walls/LOS не связаны с системной measurement. Cover не автоматизирован.
- 125% относится к настройке frontend, не к native Foundry scaling или всему browser zoom.
- Keyboard focus outline и Escape/H реализованы; полномасштабного WCAG-аудита, screen reader и touch теста нет. Native dialog используется только в двух SDK-примерах; production contextual focus lifecycle ещё проектируется.
- Нет системного roll/damage/shield/critical/autofire/ROF/NET-экономики. Dummy damage не меняет HP даже в демо: apply фиксирует receipt/счётчик.
- NET list переключается, но node editor/layout engine/3D не реализованы. Unknown floors не представлены в UI; настоящая privacy зависит от будущего bridge.
- Анимация panel входа работает/отключается; queue reordering, сцена effects и profiling cleanup всех Foundry hooks ещё не реализованы.
- Arbitrary dragging/docking и восстановление окон на другом экране не реализованы; есть только left/right panel, compact/collapse и scale.
- Реконструкции не воспроизводят Foundry global CSS, официальные шрифты/icon font/портреты. Нельзя делать вывод о полном исходном flow по одной PNG.
- ROF, cover, aimed damage и NET-budget требуют отдельной rulebook-проверки. Спецификация не утверждает уже пройденную RAW-проверку всех операций.

## Уровни готовности

| Поведение | Уровень |
|---|---|
| Локальная разработка и HTTP запуск прототипа | Проверено в текущем cloud instance |
| Реконструкция шаблонов и original CSS | Проверено в браузере с демонстрационными данными |
| Существующие modules minimum/verified и published artifact comparisons | Проверено по файлам, не по execution |
| Повторяемые install/start инструкции | Cloud-настройки сохранены в черновике; переносимые команды опубликованы в README |
| Новый task после публикации snapshot | Не проверялся |
| REDLINE как устанавливаемый module / SDK production | Не реализовано |
| Работоспособность в рабочем мире пользователя | Не проверялась, мир не менялся |

Production acceptance и multi-client failure matrix: [ARCHITECTURE.md](ARCHITECTURE.md). Доступны research, рендеры, browser prototype, integration contract и экспериментальный устанавливаемый UI-пакет. Проверка лицензированного Foundry и production acceptance остаётся отдельным этапом.
