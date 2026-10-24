import { masterStatuses } from "./status-catalog.js";
import { escapeHTML } from "./shared.js";
import { statusLabel } from "./status-labels.js";
const get = (doc, path) => foundry.utils.getProperty(doc, path);
const woundNames = new Set(["Lightly Wounded", "Seriously Wounded", "Mortally Wounded"]);
/** Recognized conditions, never arbitrary equipment modifier names. */
export function summaryConditionNames(effect) {
    if (effect.disabled || effect.isSuppressed || get(effect, "system.isSuppressed"))
        return [];
    return masterStatuses.filter(status => status.group === "general" && !woundNames.has(status.name) && effect.statuses?.has(status.id)).map(status => status.name);
}
const effects = (actor) => Array.from(actor.allApplicableEffects?.() ?? actor.effects);
export function buildCombatReport(summary) {
    const participants = summary.actors.map(actor => {
        const hpValue = get(actor, "system.derivedStats.hp.value"), maxValue = get(actor, "system.derivedStats.hp.max");
        const hp = typeof hpValue === "number" && Number.isFinite(hpValue) ? hpValue : undefined, max = typeof maxValue === "number" && Number.isFinite(maxValue) && maxValue > 0 ? maxValue : undefined;
        const conditions = [...new Set(effects(actor).flatMap(summaryConditionNames))];
        const injuryItems = Array.from(actor.items).filter(item => String(item.type) === "criticalInjury");
        const injuries = injuryItems.map(item => (item.name ?? "Критическая травма") + (get(item, "flags.redline-combat.quickFix") ? " (действует QuickFix)" : ""));
        for (const status of masterStatuses.filter(status => status.binding?.kind === "injury" && effects(actor).some(effect => !effect.disabled && !effect.isSuppressed && effect.statuses?.has(status.id)))) {
            const present = injuryItems.some(item => item.name === status.name || item.name === status.binding.itemName || get(item, "flags.redline-combat.statusId") === status.id || String(get(item, "_stats.compendiumSource") ?? get(item, "flags.core.sourceId") ?? "").endsWith("." + status.binding.itemId));
            if (!present)
                injuries.push(status.name + " (только метка состояния, без предмета травмы)");
        }
        return { name: actor.name ?? "Персонаж", player: !!actor.hasPlayerOwner, ...(actor.hasPlayerOwner ? { hp, maxHP: max, wound: hp !== undefined && max !== undefined ? (conditions.includes("Dead") ? "Мёртв" : hp < 1 ? "При смерти" : hp < Math.ceil(max / 2) ? "Серьёзное ранение" : hp < max ? "Лёгкое ранение" : "HP полное") : undefined } : {}), conditions, injuries };
    });
    const cleared = summary.effects.filter(before => !effects(before.actor).some(effect => effect.uuid === before.uuid && summaryConditionNames(effect).length)).map(before => before.actor.name + ": " + before.name);
    return { version: 1, name: summary.name ?? "Бой", scene: summary.scene, round: summary.round, recordedAt: new Date().toISOString(), players: summary.players, npcs: summary.npcs, participants, defeated: [...summary.defeated], partialInjuries: summary.partial,
        injuryAdditions: summary.criticals.map(injury => injury.actorName + ": " + injury.name + (summary.actors.find(actor => actor.uuid === injury.actor)?.items.some(item => item.uuid === injury.item) ? "" : " (уже нет)")), cleared };
}
function participantDetails(row) {
    const details = [];
    if (row.player) {
        details.push(row.hp !== undefined && row.maxHP !== undefined ? `HP ${row.hp}/${row.maxHP}` : "HP недоступно");
        if (row.wound)
            details.push(row.wound);
    }
    if (row.conditions.length)
        details.push("Состояния: " + row.conditions.map(statusLabel).join(", "));
    if (row.injuries.length)
        details.push("Текущие травмы: " + row.injuries.map(statusLabel).join(", "));
    return details.length ? details.join(" · ") : "Нет распознанных состояний и критических травм";
}
/** Escape Discord formatting and neutralize mentions in names; never ping when pasted. */
const markdownText = (value) => value.replace(/[\r\n]+/g, " ").replace(/([\\`*_~|>#[\]])/g, "\\$1").replace(/@/g, "@\u200b");
export function combatReportMarkdown(report) {
    const text = markdownText, lines = ["## Итог боя — " + text(report.name)];
    if (report.scene)
        lines.push("**Сцена:** " + text(report.scene));
    lines.push("**Последний раунд:** " + report.round, "**Участники:** " + report.players + " персонажей игроков; " + report.npcs + " НПС", "**Записано (UTC):** " + report.recordedAt, "Состояние после автоматической очистки; это не журнал всех атак.");
    for (const [title, player] of [["Состояние игроков в конце боя", true], ["Состояние НПС в конце боя", false]]) {
        const rows = report.participants.filter(row => row.player === player);
        if (rows.length)
            lines.push("", "### " + title, ...rows.map(row => "- **" + text(row.name) + ":** " + text(participantDetails(row))));
    }
    if (report.defeated.length)
        lines.push("", "### Отметки «побеждён / мёртв»", ...report.defeated.map(name => "- " + text(name)), "Это сохранённые отметки, а не подтверждённые убийства.");
    if (report.injuryAdditions.length)
        lines.push("", "### Травмы, полученные игроками", ...report.injuryAdditions.map(row => "- " + text(row)));
    if (report.partialInjuries)
        lines.push("", "Список травм неполный: учёт начался во время боя или прерывался.");
    if (report.cleared.length)
        lines.push("", "### Состояния, снятые автоматической очисткой", ...report.cleared.map(row => "- " + text(row)));
    return lines.join("\n");
}
export function combatReportHTML(report) {
    const e = escapeHTML, players = report.participants.filter(row => row.player);
    const stabilization = report.participants.filter(row => row.conditions.includes("Needs Stabilization")).map(row => row.name);
    const injuryCount = report.participants.reduce((total, row) => total + row.injuries.length, 0);
    const rows = players.map(row => {
        const hp = row.hp !== undefined && row.maxHP !== undefined ? `HP ${row.hp}/${row.maxHP}` : "HP недоступно";
        const urgent = row.conditions.filter(name => ["Dead", "Unconscious"].includes(name));
        return `<li><strong>${e(row.name)}</strong>: ${hp}${row.injuries.length ? ` · ${row.injuries.length} ${row.injuries.length === 1 ? "injury" : "injuries"}` : ""}${urgent.length ? " · " + urgent.map(e).join(", ") : ""}</li>`;
    });
    return `<div class="pneuma-combat-summary"><p><strong>${e(report.name)} — бой окончен</strong><br>Последний раунд ${report.round} · ${report.players} игроков · ${report.npcs} NPCs</p>
 ${rows.length ? "<ul>" + rows.join("") + "</ul>" : ""}
 ${stabilization.length ? `<p><strong>Нужна стабилизация:</strong> ${stabilization.map(e).join(", ")}</p>` : ""}
 <p>Текущие травмы: ${injuryCount} · Отметки «побеждён/мёртв»: ${report.defeated.length} · Снято состояний: ${report.cleared.length}<br>Травмы игроков за бой: ${report.injuryAdditions.length}${report.partialInjuries ? " (неполный учёт)" : ""}</p></div>`;
}
