import { escapeHTML as esc } from "./shared.js";
import { rollOutcomeClass } from "./card-structure.js";
export function treatmentContent(html, title, total, dv, source = "", target = "") {
    const success = total === undefined ? undefined : total > dv;
    // Keep CPR's rollcard and rollcard-top as direct native children for chat renderers.
    const native = html.replace(/(class=["'])([^"']*)(["'])/i, (match, prefix, classes, suffix) => classes.split(/\s+/).includes("rollcard") ? prefix + classes + ' pneuma-combat-message pneuma-treatment-card ' + rollOutcomeClass(success) + suffix : match);
    return (native || '<h3>' + esc(title) + '</h3>') + '<section class="pneuma-treatment-result">' + (target ? '<p class="pneuma-treatment-patient">' + esc(source) + ' → лечение → ' + esc(target) + '</p>' : '') + '<p class="pneuma-combat-outcome"><strong class="pneuma-result-summary">' + (success === undefined ? 'Выполнено' : success ? 'Успех' : 'Провал') + '</strong>' + (total === undefined ? '' : ' · ' + total + ' против DV' + dv) + '</p></section>';
}
export async function postTreatment(source, target, title, html, total, dv = 0) {
    const token = "document" in target ? target : undefined;
    const data = { content: treatmentContent(html, title, total, dv, source.name, target.name), speaker: ChatMessage.getSpeaker({ actor: source.actor, token: source.document }), flags: { "redline-combat": { medicalParticipants: { attackerName: source.name, defenderName: target.name, title, action: "Treatment", attacker: source.document.uuid, attackerActor: source.actor?.uuid, ...(token ? { defender: token.document.uuid, defenderActor: token.actor?.uuid } : {}) } } } };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
}
