import { escapeHTML as esc } from "./shared.js";
/** Native disclosure keeps each result compact without discarding its original roll. */
export function inlineRoll(total, html, label = "Результат броска", nativeExpand = false) {
    if (!html)
        return total === undefined ? "" : '<strong>' + esc(total) + '</strong>';
    return '<details class="pneuma-inline-roll"><summary' + (nativeExpand ? ' data-pvt-popover="native"' : '') + ' title="Показать подробности броска" aria-label="' + esc(label) + ' — подробности броска">' + esc(total ?? "Бросок") + '</summary><div class="pneuma-inline-roll-details">' + html + '</div></details>';
}
let disclosureId = 0;
const arranged = new WeakSet();
/** Compact effects expose saved calculation text in a sibling spanning the whole row. */
export function arrangeInlineRollDetails(root) {
    for (const roll of Array.from(root.querySelectorAll('.pneuma-aoe-inline-effect details.pneuma-inline-roll'))) {
        if (arranged.has(roll))
            continue;
        const body = roll.querySelector(':scope > .pneuma-inline-roll-details');
        const summary = roll.querySelector('summary');
        const row = roll.closest('.pneuma-aoe-inline-effect');
        if (!body || !summary || !row)
            continue;
        arranged.add(roll);
        // Preserve the evaluated native markup for presentation adapters that show
        // dice artwork; the inline click disclosure still uses compact text.
        body.dataset.pneumaRollHtml = body.innerHTML;
        // Read calculated native data, including collapsed modifiers; never recalculate a roll.
        const candidates = Array.from(body.querySelectorAll('.d10-data-details,.d6-data-details,.generic-data-details,.dice-formula,.dice-tooltip,.dice-total'));
        const sources = candidates.filter(node => !candidates.some(other => other !== node && other.contains(node)));
        const text = (node) => {
            if (node.nodeType === Node.TEXT_NODE)
                return node.textContent ?? '';
            if (!(node instanceof Element))
                return '';
            if (node.matches('.d10-dice-div,.d6-dice-div,.generic-dice-div,.d10-number-div,.d6-number-div,.generic-number-div'))
                return '';
            const content = Array.from(node.childNodes).map(text).join('');
            return /^(DIV|P|LI|SECTION|H[1-6]|BR|HR)$/.test(node.tagName) ? content + '\n' : content;
        };
        const calculation = document.createElement('div');
        calculation.className = 'pneuma-calculation-text';
        calculation.textContent = (sources.length ? sources : [body]).map(text).join('\n').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        body.replaceChildren(calculation);
        body.id = 'pneuma-roll-details-' + (++disclosureId);
        body.classList.add('pneuma-details-region');
        summary.setAttribute('aria-controls', body.id);
        // Preserve this native click disclosure when presentation modules decorate totals.
        summary.setAttribute('data-pvt-popover', 'native');
        const sync = () => { body.hidden = !roll.open; summary.setAttribute('aria-expanded', String(roll.open)); };
        roll.addEventListener('toggle', sync);
        row.append(body);
        sync();
    }
}
