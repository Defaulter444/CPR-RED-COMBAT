import { MODULE, LEGACY_MODULE } from "./availability.js";
import { DEFAULT_ROUTING_CONFIG, normalizeRoutingConfig } from "./routing-config.js";
export const label = (key, data = {}) => game.i18n.format("PNEUMA_COMBAT_TOOLS.Quickhack." + key, data);
export const enabled = () => game.system?.id === "cyberpunk-red-core"
    && game.settings.get(MODULE, "quickhackEnabled") && !game.modules?.get(LEGACY_MODULE)?.active;
export const mode = () => game.settings.get(MODULE, "quickhackMode");
export const routing = () => normalizeRoutingConfig(game.settings.get(MODULE, "quickhackRouting"));
class QuickhackSettings extends FormApplication {
    constructor() { super({}); }
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "pneuma-quickhack-settings", title: "Настройки квикхаков", width: 610,
            template: `modules/${MODULE}/combat/templates/quickhack-settings.hbs`, closeOnSubmit: true,
        });
    }
    getData() {
        const config = routing();
        const rows = [
            { key: "npcToPlayerJackInAudience", title: "Кто видит обнаруженное подключение?", choices: { targetOwners: "Только цель и Мастер", public: "Все" } },
            { key: "npcToPlayerJackInShowTotals", title: "Итоги бросков", choices: { true: "Показывать итоги", false: "Скрывать итоги" } },
            { key: "npcToPlayerJackInRevealAttacker", title: "Кто атакует", choices: { true: "Показывать имя НПС", false: "Неизвестный нетраннер" } },
            { key: "npcToPlayerQuickhackAudience", title: "Кто видит квикхак?", choices: { targetOwners: "Только цель и Мастер", public: "Все" } },
            { key: "npcToPlayerQuickhackRevealAttacker", title: "Кто атакует", choices: { true: "Показывать имя НПС", false: "Неизвестный нетраннер" } },
            { key: "playerToNpcJackInAudience", title: "Кто видит, что НПС заметил?", choices: { sourceOwners: "Только атакующий и Мастер", public: "Все", gm: "Только Мастер" } },
        ].map(row => ({ ...row, value: String(config[row.key]) }));
        return { requireNeuroport: game.settings.get(MODULE, "quickhackRequireNeuroport"), mode: mode(), modes: { raw: "По правилам", owned: "Квикхак нужно купить", loaded: "Квикхак должен быть загружен в надетую кибердеку" }, groups: [
                { title: "НПС → игрок: подключение", rows: rows.slice(0, 3) },
                { title: "НПС → игрок: квикхак", rows: rows.slice(3, 5) },
                { title: "Игрок → НПС: подключение", rows: rows.slice(5) },
            ] };
    }
    async _updateObject(_event, data) {
        if (!game.user.isGM)
            return;
        await game.settings.set(MODULE, "quickhackRequireNeuroport", data.requireNeuroport === true);
        if (["raw", "owned", "loaded"].includes(String(data.mode)))
            await game.settings.set(MODULE, "quickhackMode", data.mode);
        await game.settings.set(MODULE, "quickhackRouting", normalizeRoutingConfig({
            npcToPlayerJackInAudience: String(data.npcToPlayerJackInAudience),
            npcToPlayerJackInShowTotals: data.npcToPlayerJackInShowTotals === "true",
            npcToPlayerJackInRevealAttacker: data.npcToPlayerJackInRevealAttacker === "true",
            npcToPlayerQuickhackAudience: String(data.npcToPlayerQuickhackAudience),
            npcToPlayerQuickhackRevealAttacker: data.npcToPlayerQuickhackRevealAttacker === "true",
            playerToNpcJackInAudience: String(data.playerToNpcJackInAudience),
        }));
    }
}
export function registerQuickhackSettings(refresh) {
    game.settings.register(MODULE, "quickhackRequireNeuroport", { name: "Скрывать меню квикхаков без установленного нейропорта",
        scope: "world", config: false, type: Boolean, default: false, onChange: refresh });
    game.settings.register(MODULE, "quickhackEnabled", { name: "Включить квикхаки", hint: "Кнопки, броски, эффекты и макросы квикхаков. Перед использованием выключите отдельный модуль Pneuma Quickhack.",
        scope: "world", config: true, type: Boolean, default: true, onChange: refresh });
    game.settings.register(MODULE, "quickhackMode", { name: "Режим правил квикхаков", scope: "world", config: false,
        type: String, default: "raw", choices: { raw: "По правилам", owned: "Квикхак нужно купить", loaded: "Квикхак должен быть загружен в надетую кибердеку" }, onChange: refresh });
    game.settings.register(MODULE, "quickhackRouting", { scope: "world", config: false,
        // @ts-expect-error Foundry v12 supports ObjectField settings; pinned typings omit this overload.
        type: new foundry.data.fields.ObjectField(), default: DEFAULT_ROUTING_CONFIG });
    game.settings.registerMenu(MODULE, "quickhackMessages", { name: "Настройки квикхаков", label: "Настроить", hint: "Режим правил, видимость сообщений, итоги бросков и имя атакующего.", icon: "fas fa-comments", type: QuickhackSettings, restricted: true });
}
