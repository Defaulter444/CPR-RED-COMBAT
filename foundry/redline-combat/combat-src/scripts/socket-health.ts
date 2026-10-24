const MODULE = "redline-combat";
/** File copies do not refresh the package metadata held by a running Foundry server. */
export function requireCombatSocket(): void {
  const module = game.modules?.get(MODULE) as { socket?: boolean } | undefined;
  if (module?.socket === false) throw new Error(
    "Обмен сообщениями REDLINE выключен в загруженных метаданных модуля. Перезапустите сервер Foundry и переподключите всех участников. Простого обновления вкладок недостаточно."
  );
  if (game.socket?.connected === false) throw new Error("REDLINE отключён от Foundry. Переподключитесь, прежде чем повторять действие.");
}
export function registerSocketHealth(): void {
  Hooks.once("ready", () => {
    try { requireCombatSocket(); }
    catch (error) { ui.notifications!.error((error as Error).message, {permanent:true}); }
  });
}
