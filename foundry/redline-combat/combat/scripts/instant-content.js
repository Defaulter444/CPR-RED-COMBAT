import { inlineRoll } from './inline-roll.js';
import { instantEffects, escapeInstant as esc } from './instant-catalog.js';
import { masterStatuses } from './status-catalog.js';
import { statusLabel } from "./status-labels.js";
export function effectDefinition(state) {
    if (state.id !== 'status')
        return instantEffects[state.id];
    const status = CONFIG.statusEffects.find(effect => effect.id === state.statusId);
    return { name: game.i18n.localize(status?.name ?? status?.label ?? state.statusId ?? 'Состояние'), color: '#a7afb7', skill: '', dv: 0, damage: '' };
}
const glyphs = { incendiary: 'fa-fire', emp: 'fa-bolt', microwaver: 'fa-bolt', poison: 'fa-skull', biotoxin: 'fa-skull-crossbones', sleep: 'fa-moon', flashbang: 'fa-sun', teargas: 'fa-cloud', smoke: 'fa-smog', status: 'fa-circle-dot' };
function effectGlyph(state, name) {
    const status = state.id === 'status' ? CONFIG.statusEffects.find(effect => effect.id === state.statusId)
        : masterStatuses.find(effect => effect.name === (state.id === 'incendiary' ? 'On Fire (Mild)' : state.id === 'emp' || state.id === 'microwaver' ? 'EMP' : name));
    const image = status?.img ?? (status && 'icon' in status ? status.icon : undefined);
    return image ? '<img class="pneuma-effect-glyph" src="' + esc(image) + '" alt="" aria-hidden="true">'
        : '<i class="fas ' + glyphs[state.id] + '" aria-hidden="true"></i>';
}
/** Presentation only. Ordinary, attached and pending fire rows share this markup. */
export function instantContent(state, scope = '', compact = false) {
    const effect = effectDefinition(state);
    const awaitingDamage = state.id === 'incendiary' && state.state === 'pending';
    const label = { pending: '', rolling: 'Бросок…', failed: '', resisted: 'Устоял', applying: 'Применяется — не повторяйте', applied: state.summary ?? 'Применено', skipped: 'Не задет (Мастер)', review: 'Прервано — нужна проверка Мастера' }[state.state];
    const glyph = effectGlyph(state, effect.name);
    const button = (action, content, title = '', disabled = false, inert = false, classes = '') => '<button type="button"' + (classes ? ' class="' + classes + '"' : '')
        + (inert ? '' : ' data-instant-action="' + action + '" data-instant-scope="' + esc(scope) + '"')
        + (title ? ' title="' + esc(title) + '" aria-label="' + esc(title) + '"' : '')
        + (disabled ? ' disabled' : '') + '>' + content + '</button>';
    const iconButton = (action, icon, title, text = '') => button(action, '<i class="fas ' + icon + '" aria-hidden="true"></i>' + esc(text), title);
    const canApply = state.state === 'pending' || state.state === 'failed';
    const applyTitle = 'Применить: ' + statusLabel(effect.name) + (state.state === 'pending' ? ' — ждём: ' + (awaitingDamage ? 'пробивающего урона' : 'сопротивления') : '');
    const apply = canApply ? button('apply', glyph + '<span>' + (compact ? 'Применить' : 'Применить эффект') + '</span>', applyTitle, state.state === 'pending', awaitingDamage, 'pneuma-effect-apply') : '';
    const completion = state.state === 'applied' || state.state === 'resisted' || state.state === 'skipped'
        ? '<span class="pneuma-effect-complete" data-effect-state="' + state.state + '" title="' + esc(statusLabel(effect.name) + ' — ' + label) + '" aria-label="' + esc(statusLabel(effect.name) + ' — ' + label) + '">'
            + glyph + (state.state === 'resisted' ? '<i class="fas fa-shield-halved pneuma-effect-state" aria-hidden="true"></i>' : state.state === 'skipped' ? '<i class="fas fa-ban pneuma-effect-state" aria-hidden="true"></i>' : '') + '</span>' : '';
    const progress = ['rolling', 'applying', 'review'].includes(state.state)
        ? '<span class="pneuma-effect-progress" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + glyph + '</span>' : '';
    const resistance = state.state === 'pending'
        ? iconButton('roll', 'fa-shield-halved', 'Сопротивление: ' + statusLabel(effect.name) + ' DV' + effect.dv, ' Сопротивление')
        : inlineRoll(state.total, state.html, effect.skill, compact);
    let overrides = '';
    if (!awaitingDamage) {
        if (canApply)
            overrides = compact ? iconButton('skip', 'fa-user-shield', 'Мастер: не задет — ' + statusLabel(effect.name)) : button('skip', 'Не задет');
        else if (state.state === 'rolling')
            overrides = compact ? iconButton('reset', 'fa-unlock', 'Мастер: снять блокировку броска сопротивления — ' + statusLabel(effect.name) + '') : button('reset', 'Снять блокировку броска');
        else if (state.state === 'review' || state.state === 'applying')
            overrides = compact ? iconButton('review', 'fa-check-double', 'Мастер: отметить «' + statusLabel(effect.name) + '» решённым после проверки') : button('review', 'Отметить решённым');
    }
    const gm = '<span class="pneuma-effect-gm-slot"><span class="pneuma-effect-gm-controls">' + overrides + '</span></span>';
    const actions = compact ? (effect.skill ? '<span class="pneuma-effect-resistance">' + resistance + '</span>' : '')
        + '<span class="pneuma-effect-application">' + apply + completion + progress + '</span>'
        : (state.state === 'pending' && !awaitingDamage ? resistance : '') + apply + completion;
    const damage = state.damageHTML ? '<div class="pneuma-instant-damage"><span>Урон</span> ' + inlineRoll(state.damage, state.damageHTML, 'Бросок урона', compact) + '</div>' : '';
    const wake = state.state === 'applied' && state.id === 'sleep' && !compact ? button('wake', 'Разбудить (действие касанием)') : '';
    return '<div class="pneuma-instant-effect' + (compact ? ' pneuma-aoe-inline-effect' : '') + '" title="' + esc(statusLabel(effect.name) + (label ? ' — ' + label : '')) + '" data-effect="' + state.id + '" data-state="' + state.state + '" style="--pneuma-ammo-color:' + effect.color + '">'
        + (compact ? '' : damage) + '<strong>' + esc(statusLabel(effect.name)) + (effect.skill ? ' DV' + effect.dv : '') + '</strong> '
        + (compact ? '' : inlineRoll(state.total, state.html, effect.skill))
        + (!compact && label ? '<span>' + esc(label) + '</span> ' : '')
        + '<span class="pneuma-effect-actions">' + actions + '</span>' + gm + (compact ? damage : '') + wake + '</div>';
}
