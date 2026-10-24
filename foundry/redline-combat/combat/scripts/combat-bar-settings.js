import { nativeSettingRows, positionNotice } from "./display-settings.js";
import { masterSettingControls, combatBarPositionControls, COMBAT_BAR_SETTING_KEYS } from "./settings-layout.js";
const MODULE = "redline-combat";
/** Read the same permission-filtered, localized rows as the native Module Settings window. */
export async function combatBarSettingsHTML() {
    const data = await new SettingsConfig().getData();
    const rows = data.categories.flatMap(category => category.settings);
    const missing = COMBAT_BAR_SETTING_KEYS.filter(key => !rows.some(row => row.id === MODULE + "." + key));
    rows.push(...nativeSettingRows(missing));
    const settings = COMBAT_BAR_SETTING_KEYS.flatMap(key => rows.filter(row => row.id === MODULE + "." + key));
    return renderTemplate("templates/sidebar/apps/settings-config-category.html", {
        id: MODULE, title: "Панель боя", menus: [], settings, count: settings.length,
    });
}
export async function saveCombatBarSetting(id, value) {
    const key = id.slice(MODULE.length + 1);
    if (!id.startsWith(MODULE + ".") || !COMBAT_BAR_SETTING_KEYS.includes(key))
        throw Error("Неизвестная настройка панели боя.");
    const setting = game.settings.settings.get(id);
    if (!setting || setting.scope !== "client" && !game.user?.can("SETTINGS_MODIFY"))
        throw Error("Вам нельзя менять эту настройку.");
    if (setting.type === Boolean) {
        if (typeof value !== "boolean")
            throw Error("Некорректное значение флажка.");
    }
    else if (setting.choices && !Object.hasOwn(setting.choices, String(value)))
        throw Error("Некорректный вариант настройки.");
    if (game.settings.get(MODULE, key) !== value)
        await game.settings.set(MODULE, key, value);
}
export class CombatBarSettings extends FormApplication {
    constructor() { super({}); }
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Панель боя", id: "pneuma-combat-bar-settings", width: 460, height: "auto",
            classes: ["pneuma-combat-bar-settings"], resizable: false, closeOnSubmit: false,
            submitOnChange: false, submitOnClose: false,
            template: "modules/redline-combat/combat/templates/combat-bar-settings.hbs",
        });
    }
    async getData() { return { settingsHTML: await combatBarSettingsHTML() }; }
    activateListeners(html) {
        super.activateListeners(html);
        const root = html[0];
        if (!root)
            return;
        combatBarPositionControls(root);
        positionNotice(root);
        masterSettingControls(root, "combatBar");
        root.querySelectorAll("input[name], select[name]").forEach(input => {
            input.addEventListener("change", () => {
                const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
                input.disabled = true;
                void saveCombatBarSetting(input.name, value).catch(error => {
                    ui.notifications.error(String(error));
                    void this.render(false);
                }).finally(() => { input.disabled = false; });
            });
        });
        root.querySelector("[data-close]")?.addEventListener("click", () => { void this.close(); });
    }
    async _updateObject(_event, _data) { }
}
let editor;
export function openCombatBarSettings() {
    editor ??= new CombatBarSettings();
    // Foundry focuses after the asynchronous render has created the window element.
    editor.render(true, { focus: true });
}
export function registerCombatBarSettings() {
    for (const key of ["combatBarDock", "combatBarSize", "combatBarOrientation", "combatBarNameOnly"]) {
        const setting = game.settings.settings.get(MODULE + "." + key);
        if (setting)
            setting.config = false;
    }
    game.settings.registerMenu(MODULE, "combatBarSettings", { name: "Панель боя", label: "Настроить", hint: "Положение, размер портретов и подсказки.", icon: "fas fa-users", type: CombatBarSettings, restricted: false });
}
