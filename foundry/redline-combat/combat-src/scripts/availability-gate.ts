/** REDLINE embeds these combat tools. The standalone original or a missing libWrapper keeps them dormant. */
export const ORIGINAL_MODULE = "pneuma-combattools";
export function combatToolsBlocker(): string | null {
  if (game.modules!.get(ORIGINAL_MODULE)?.active) return "Включён отдельный модуль Pneuma's Combat Tools. Боевые инструменты REDLINE уже содержат его функции — выключите оригинал и перезагрузите мир.";
  if (!game.modules!.get("lib-wrapper")?.active) return "Для боевых инструментов REDLINE нужен модуль libWrapper. Установите и включите его, затем перезагрузите мир.";
  return null;
}
