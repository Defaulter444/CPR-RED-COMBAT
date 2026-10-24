/** Stable presentation sections; content is already-rendered native/module markup. */
const labels = {
    pending: "Атака ожидает", attack: "Атака", evade: "Уклонение", result: "Результат",
    "damage-roll": "Бросок урона", "damage-apply": "Нанести урон", recovery: "Восстановление", effects: "Эффекты",
};
export function resolutionSection(kind, content, classes = "") {
    return '<section class="pneuma-resolution-section pneuma-resolution-' + kind + (classes ? ' ' + classes : '')
        + '" data-pneuma-section="' + kind + '" aria-label="' + labels[kind] + '">'
        + '<h4 class="pneuma-resolution-label pneuma-resolution-' + kind + '-label">' + labels[kind] + '</h4>'
        + '<div class="pneuma-resolution-body pneuma-resolution-' + kind + '-body">' + content + '</div></section>';
}
/** Shared presentation only: workflow permissions and rule resolution stay with their owners. */
export function rollOutcomeClass(won) {
    return won === undefined ? "" : won ? "pneuma-roll-winner" : "pneuma-roll-loser";
}
export function styleRollOutcome(root, won) {
    root.classList.toggle("pneuma-roll-winner", won === true);
    root.classList.toggle("pneuma-roll-loser", won === false);
}
export function styleOpposedRolls(root, sourceWins) {
    Array.from(root.children).forEach((row, index) => styleRollOutcome(row, sourceWins === undefined ? undefined : index === 0 ? sourceWins : !sourceWins));
}
export function combatCardKind(message) {
    return ["exchange", "grapple", "quickhack", "aoe", "sceneEffect"].find(kind => !!foundry.utils.getProperty(message, "flags.redline-combat." + kind));
}
export function canRenderCombatCard(message) {
    return !!message.visible && message.isContentVisible !== false && (!message.blind || !!game.user?.isGM);
}
/** Add common scope without replacing any native or third-party-decorated nodes. */
export function decorateSharedCard(root, message) {
    const kind = combatCardKind(message);
    if (!kind || !canRenderCombatCard(message))
        return;
    root.classList.add("pneuma-combat-message");
    root.dataset.pneumaCardKind = kind;
}
const cardActions = new WeakMap();
/** Replace only this module's action listener when the same card is decorated again. */
export function bindCardAction(node, action) {
    const previous = cardActions.get(node);
    if (previous)
        node.removeEventListener('click', previous);
    cardActions.set(node, action);
    node.addEventListener('click', action);
}
