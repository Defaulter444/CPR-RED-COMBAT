function exchangeScope(message) {
    const data = foundry.utils.getProperty(message, "flags.redline-combat.exchange");
    if (!data || !["waiting", "applying"].includes(data.state ?? ""))
        return;
    return { actors: [data.defenderActor], combat: data.combatId !== undefined ? data.combatId
            : data.round === "outside-combat" ? null : data.round?.split(":")[0] };
}
export class PendingCardRefresh {
    update;
    scope;
    cards = new Map();
    queued = new Set();
    scheduled = false;
    constructor(update, scope = exchangeScope) {
        this.update = update;
        this.scope = scope;
    }
    remember(message) {
        if (!message.id)
            return;
        const scope = this.scope(message);
        if (!scope) {
            this.forget(message.id);
            return;
        }
        this.cards.set(message.id, { message, ...scope });
    }
    forget(id) { this.cards.delete(id); this.queued.delete(id); }
    refresh(actor, combat) {
        for (const [id, card] of this.cards) {
            if (actor !== undefined && !card.actors.includes(actor))
                continue;
            if (combat !== undefined && card.combat !== combat)
                continue;
            this.queued.add(id);
        }
        if (!this.queued.size || this.scheduled)
            return;
        this.scheduled = true;
        requestAnimationFrame(() => {
            this.scheduled = false;
            const ids = [...this.queued];
            this.queued.clear();
            for (const id of ids) {
                const card = this.cards.get(id);
                // Native updateMessage inserts missing messages. Invalidation must only refresh mounted cards.
                if (card?.message.visible && (!card.message.blind || game.user?.isGM)
                    && ui.chat?.element?.find(`[data-message-id="${id}"]`).length)
                    this.update(card.message);
            }
        });
    }
}
/** Shared actor/combat invalidation for condition-dependent card controls. */
export function registerConditionCardRefresh(scope) {
    const index = new PendingCardRefresh(message => { ui.chat?.updateMessage(message, false); }, scope);
    Hooks.once("ready", () => { for (const message of game.messages ?? [])
        index.remember(message); });
    for (const hook of ["createChatMessage", "updateChatMessage", "renderChatMessage"])
        Hooks.on(hook, (message) => index.remember(message));
    Hooks.on("deleteChatMessage", (message) => index.forget(message.id));
    Hooks.on("updateActor", (actor) => index.refresh(actor.uuid));
    for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
        Hooks.on(hook, (doc) => {
            const actor = doc.parent instanceof Actor ? doc.parent : doc.parent?.parent instanceof Actor ? doc.parent.parent : undefined;
            if (actor)
                index.refresh(actor.uuid);
        });
    for (const hook of ["updateCombat", "deleteCombat"])
        Hooks.on(hook, (combat) => index.refresh(undefined, combat.id));
}
