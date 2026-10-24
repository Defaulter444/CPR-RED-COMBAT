import { escapeHTML as manualEscape } from "./shared.js";
export const MANUAL_MODULE = "redline-combat";
export { escapeHTML as manualEscape } from "./shared.js";
export function manualNumber(value, name, min, max) {
    const number = Number(value);
    if (value === "" || !Number.isInteger(number) || number < min || number > max)
        throw Error(name + " — целое число от " + min + " to " + max + ".");
    return number;
}
export function groupOutcome(total, dv) {
    return dv === undefined ? "" : total > dv ? "Success" : "Fail";
}
export function groupContent(data, gm = false) {
    const esc = manualEscape;
    return '<div class="rollcard-top"><div class="cpr-block pneuma-group-heading"><span class="text-normal text-semi">' + esc(data.skill) + '</span>'
        + (data.dv === undefined ? '' : '<span class="pneuma-group-dv text-normal">' + (data.hideDV && !gm ? 'DV скрыто' : 'DV ' + data.dv) + '</span>') + '</div></div>'
        + '<div class="rollcard-bottom"><div class="cpr-block"><ul class="pneuma-group-rows">' + (data.rows ?? []).map(row => {
        const outcome = row.state === "done" ? groupOutcome(row.total, data.dv) : "";
        const total = row.html ? '<a class="pneuma-group-total" role="button" tabindex="0" aria-expanded="false" aria-label="Подробности броска: ' + esc(row.name) + '"><strong>' + esc(row.total) + '</strong></a>' : '<strong>' + esc(row.total) + '</strong>';
        return '<li data-group-user="' + esc(row.user) + '"><span>' + esc(row.name) + '</span><span>'
            + (row.state === "done" ? total + (outcome ? ' <span class="pneuma-group-outcome" data-outcome="' + outcome.toLowerCase() + '">' + (outcome === 'Success' ? 'Успех' : 'Провал') + '</span>' : '') : row.state === "rolling" ? 'Бросок…' : 'Ожидание')
            + '</span><span class="pneuma-group-action"></span>' + (row.html ? '<div class="pneuma-group-details" hidden>' + row.html + '</div>' : '') + '</li>';
    }).join('') + '</ul></div></div>';
}
