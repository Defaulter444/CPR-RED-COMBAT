import { criticalMethods } from "./critical-injury.js";
const MODULE = "redline-combat";
class CriticalInjurySettings extends FormApplication {
    constructor() { super({}); }
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "pneuma-critical-injury-settings", title: "Критические травмы", width: 420,
            template: "modules/redline-combat/combat/templates/critical-injury-settings.hbs",
            closeOnSubmit: true,
        });
    }
    getData() {
        return { rows: Object.entries(criticalMethods).map(([method, label]) => ({
                key: "critical" + method, label,
                enabled: game.settings.get(MODULE, `critical${method}`),
            })) };
    }
    async _updateObject(_event, data) {
        if (!game.user.isGM)
            return;
        let changed = false;
        for (const method of Object.keys(criticalMethods)) {
            const key = `critical${method}`;
            const value = data[key] === true;
            if (game.settings.get(MODULE, key) === value)
                continue;
            await game.settings.set(MODULE, key, value);
            changed = true;
        }
        if (changed)
            await SettingsConfig.reloadConfirm({ world: true });
    }
}
export function registerCriticalSettings() {
    for (const [method, label] of Object.entries(criticalMethods)) {
        game.settings.register(MODULE, `critical${method}`, {
            name: "Критические травмы: " + label,
            scope: "world", config: false, type: Boolean, default: method !== "Quickhack", requiresReload: true,
        });
    }
    game.settings.registerMenu(MODULE, "criticalInjuries", {
        name: "Критические травмы", label: "Настроить типы урона",
        hint: "Какие типы урона могут вызывать критические травмы.",
        icon: "fas fa-table", type: CriticalInjurySettings, restricted: true,
    });
}
