import { markHomebrew } from "./homebrew-badge.js";
import { empBehavior, normalizeEmpBehavior } from "./emp-behavior.js";
const MODULE = "redline-combat";
export class EmpSettingsForm extends FormApplication {
    constructor() { super({}); }
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Действие ЭМИ", id: "pneuma-emp-settings", width: 530, height: "auto", resizable: false,
            template: "modules/redline-combat/combat/templates/emp-settings.hbs", closeOnSubmit: true,
        });
    }
    getData() {
        const values = empBehavior();
        const immunity = String(game.settings.get(MODULE, "empImmunity") ?? "");
        return { ...values, frameConfigured: values.frameNoMove || values.frameReduceMove || values.frameActionPenalty, protectionConfigured: values.hardened !== "exclude" || !!immunity.trim(), foundationWeights: { equal: "Обычный вес", "foundation-more": "Вес ×2", "foundation-less": "Вес ½" }, hardenedMethods: { exclude: "Исключить из выбора", consume: "Включить; выбор не даёт эффекта" }, profiles: ["gm", "player"].map(side => ({
                side, title: side === "gm" ? "Когда выбирает Мастер" : "Когда выбирает игрок", ...values[side],
                methods: side === "gm" ? { manual: "Мастер выбирает", random: "Случайно" } : { manual: "Выбор из всех предметов", shortlist: "Выбор из короткого списка", random: "Случайно" },
            })), immunity };
    }
    activateListeners(html) {
        super.activateListeners(html);
        const root = html[0];
        if (!root)
            return;
        const biowareLabel = root.querySelector("[data-bioware-label]");
        if (biowareLabel)
            markHomebrew(biowareLabel);
        const frameLabel = root.querySelector("[data-frame-label]");
        if (frameLabel)
            markHomebrew(frameLabel);
        const update = () => {
            const checked = (name) => !!root.querySelector(`[name="${name}"]`)?.checked;
            for (const [selector, visible] of [["[data-frame-movement]", !checked("frameNoMove")], ["[data-frame-reduction]", checked("frameReduceMove")], ["[data-frame-penalty]", checked("frameActionPenalty")]]) {
                const element = root.querySelector(selector);
                if (element)
                    element.hidden = !visible;
            }
            const weights = root.querySelector("[data-foundation-weight]");
            if (weights)
                weights.hidden = !root.querySelector('[name="includeFoundational"]')?.checked;
            root.querySelectorAll("[data-emp-profile]").forEach(section => {
                const method = section.querySelector("[data-method]")?.value;
                section.querySelectorAll("[data-random-options]").forEach(el => el.hidden = method === "manual");
                section.querySelectorAll("[data-shortlist-options]").forEach(el => el.hidden = method !== "shortlist");
            });
        };
        root.addEventListener("change", update);
        update();
    }
    async _updateObject(_event, data) {
        if (!game.user?.isGM)
            throw Error("Настраивать ЭМИ может только Мастер.");
        const expanded = foundry.utils.expandObject(data);
        await game.settings.set(MODULE, "empBehavior", normalizeEmpBehavior(expanded));
        await game.settings.set(MODULE, "empImmunity", String(data.immunity ?? ""));
    }
}
export function registerEmpSettings() {
    game.settings.register(MODULE, "empBehavior", { scope: "world", config: false,
        // @ts-expect-error Foundry v12 supports ObjectField settings; pinned typings omit it.
        type: new foundry.data.fields.ObjectField(), default: normalizeEmpBehavior({}) });
    game.settings.registerMenu(MODULE, "empBehaviorMenu", { name: "Действие ЭМИ", label: "Настроить",
        hint: "Способы выбора для Мастера и игрока, случайные веса и короткие списки для игроков.",
        icon: "fas fa-bolt", type: EmpSettingsForm, restricted: true });
}
