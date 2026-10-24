interface ArmorActor extends Actor {
  _ablateArmor(location: string, amount: number): Promise<void>;
}

/** Reuse CPR's existing reverse-ablation path on its head/body armor arrows. */
export function registerArmorShortcut() {
  const bound = new WeakSet<HTMLElement>();
  Hooks.on("renderActorSheet", (sheet: ActorSheet, html: JQuery) => {
    if (!sheet.isEditable || !sheet.actor.isOwner) return;
    html.find<HTMLElement>('.ablate[data-location="head"], .ablate[data-location="body"]').each((_index, arrow) => {
      if (bound.has(arrow)) return;
      bound.add(arrow);
      const icon = arrow.querySelector<HTMLElement>("[data-tooltip]") ?? arrow;
      const hint = game.i18n!.localize("PNEUMA_COMBAT_TOOLS.RestoreArmorHint");
      icon.dataset.tooltip = [icon.dataset.tooltip, hint].filter(Boolean).join(" · ");
      arrow.addEventListener("click", event => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!sheet.actor.isOwner) return;
        const actor = sheet.actor as ArmorActor;
        void actor._ablateArmor(arrow.dataset.location!, -1).catch(error => {
          console.error("redline-combat | Restore armor", error);
          ui.notifications!.error(game.i18n!.localize("PNEUMA_COMBAT_TOOLS.RestoreArmorFailed"));
        });
      }, { capture: true });
    });
  });
}
