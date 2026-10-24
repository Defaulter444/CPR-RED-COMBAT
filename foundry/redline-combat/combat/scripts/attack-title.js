import { statusLabel } from "./status-labels.js";
import { ammoProfile } from "./instant-catalog.js";
import { escapeHTML } from "./shared.js";
const typeNames = { smg: "ПП", heavySmg: "Тяжёлый ПП", unarmed: "Драка", martialArts: "Боевые искусства", lightMelee: "Лёгкое оружие ближнего боя", mediumMelee: "Среднее оружие ближнего боя", heavyMelee: "Тяжёлое оружие ближнего боя", veryHeavyMelee: "Очень тяжёлое оружие ближнего боя" };
const readable = (value) => typeNames[value] ?? value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, c => c.toUpperCase());
export function attackTitle(item, hidden, skill, ammoType) {
    const system = item.system;
    const type = system.weaponType ?? "";
    const grenade = item.type === "ammo" && system.variety === "grenade" || type === "grenadeLauncher";
    if (hidden) {
        if (grenade)
            return "Граната";
        if (type === "rocketLauncher")
            return "Ракета";
        return type ? readable(type) : "Атака";
    }
    if (type === "martialArts")
        return skill?.trim() || system.weaponSkill?.trim() || "Боевые искусства";
    if (grenade) {
        const profile = ammoProfile(ammoType ?? system.type, "grenade");
        return profile ? "Граната (" + statusLabel(profile.name).toLowerCase() + ")" : item.type === "ammo" ? item.name?.trim() || "Граната" : "Граната";
    }
    return item.name?.trim() || readable(type) || "Атака";
}
export function attackHeading(title, tag = "h3") {
    return '<' + tag + ' class="pneuma-attack-name" title="' + escapeHTML(title) + '">' + escapeHTML(title) + '</' + tag + '>';
}
