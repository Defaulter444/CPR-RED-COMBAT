import { combatCardKind, canRenderCombatCard, decorateSharedCard } from "./card-structure.js";

/** Keep the updated exchange in view without moving the surrounding application. */
export function scrollResolutionCard(root: HTMLElement): void {
  if (!root.isConnected || !root.getClientRects().length) return;
  const log = root.closest<HTMLElement>("#chat-log");
  if (!log) return;
  const card = root.getBoundingClientRect();
  const viewport = log.getBoundingClientRect();
  const top = viewport.top + log.clientTop;
  const bottom = top + log.clientHeight;
  if (card.height > log.clientHeight || card.bottom > bottom)
    log.scrollTop += card.bottom - bottom;
  else if (card.top < top) log.scrollTop += card.top - top;
}
export function watchResolutionCard(root: HTMLElement): () => void {
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => scrollResolutionCard(root));
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(root); schedule();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
export function registerResolutionScroll(): void {
  let updatedId: string | undefined;
  let disconnect: (() => void)[] = [];
  const attach = (id: string) => requestAnimationFrame(() => {
    if (updatedId !== id) return;
    disconnect.forEach(stop => stop()); disconnect = [];
    document.querySelectorAll<HTMLElement>('.chat-message[data-message-id="' + CSS.escape(id) + '"]')
      .forEach(root => {
        if (root.classList.contains("pneuma-combat-message")) disconnect.push(watchResolutionCard(root));
      });
  });
  Hooks.on("updateChatMessage", (message: ChatMessage) => {
    if (!message.id || !canRenderCombatCard(message) || !combatCardKind(message)) return;
    updatedId = message.id; attach(message.id);
  });
  // A template render may finish after the update hook; bind to that replacement too.
  Hooks.on("renderChatMessage", (message: ChatMessage, html?: JQuery) => {
    if (!combatCardKind(message) || !canRenderCombatCard(message)) return;
    if (html?.[0]) decorateSharedCard(html[0],message);
    if (message.id && message.id === updatedId) attach(message.id);
  });
  Hooks.on("deleteChatMessage",(message: ChatMessage) => {
    if (message.id !== updatedId) return;
    updatedId = undefined;disconnect.forEach(stop => stop());disconnect = [];
  });
}
