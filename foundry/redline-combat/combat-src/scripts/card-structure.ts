/** Stable presentation sections; content is already-rendered native/module markup. */
const labels = {
  pending: "Атака ожидает", attack: "Атака", evade: "Уклонение", result: "Результат",
  "damage-roll": "Бросок урона", "damage-apply": "Нанести урон", recovery: "Восстановление", effects: "Эффекты",
} as const;

export function resolutionSection(kind: keyof typeof labels, content: string, classes = ""): string {
  return '<section class="pneuma-resolution-section pneuma-resolution-' + kind + (classes ? ' ' + classes : '')
    + '" data-pneuma-section="' + kind + '" aria-label="' + labels[kind] + '">'
    + '<h4 class="pneuma-resolution-label pneuma-resolution-' + kind + '-label">' + labels[kind] + '</h4>'
    + '<div class="pneuma-resolution-body pneuma-resolution-' + kind + '-body">' + content + '</div></section>';
}

/** Shared presentation only: workflow permissions and rule resolution stay with their owners. */
export function rollOutcomeClass(won: boolean | undefined): string {
  return won === undefined ? "" : won ? "pneuma-roll-winner" : "pneuma-roll-loser";
}
export function styleRollOutcome(root: HTMLElement, won: boolean | undefined): void {
  root.classList.toggle("pneuma-roll-winner",won === true);
  root.classList.toggle("pneuma-roll-loser",won === false);
}
export function styleOpposedRolls(root: HTMLElement, sourceWins: boolean | undefined): void {
  Array.from(root.children).forEach((row,index) => styleRollOutcome(row as HTMLElement,
    sourceWins === undefined ? undefined : index === 0 ? sourceWins : !sourceWins));
}
export function combatCardKind(message: ChatMessage): "exchange" | "grapple" | "quickhack" | "aoe" | "sceneEffect" | undefined {
  return (["exchange","grapple","quickhack","aoe","sceneEffect"] as const).find(kind =>
    !!foundry.utils.getProperty(message,"flags.redline-combat." + kind));
}
export function canRenderCombatCard(message: ChatMessage): boolean {
  return !!message.visible && message.isContentVisible !== false && (!message.blind || !!game.user?.isGM);
}
/** Add common scope without replacing any native or third-party-decorated nodes. */
export function decorateSharedCard(root: HTMLElement, message: ChatMessage): void {
  const kind = combatCardKind(message);
  if (!kind || !canRenderCombatCard(message)) return;
  root.classList.add("pneuma-combat-message");
  root.dataset.pneumaCardKind = kind;
}

const cardActions=new WeakMap<HTMLElement,(event:MouseEvent)=>unknown>();
/** Replace only this module's action listener when the same card is decorated again. */
export function bindCardAction(node:HTMLElement,action:(event:MouseEvent)=>unknown):void {
  const previous=cardActions.get(node);
  if(previous)node.removeEventListener('click',previous);
  cardActions.set(node,action);
  node.addEventListener('click',action);
}
