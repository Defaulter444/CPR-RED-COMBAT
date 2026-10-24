/** Escape plain text inserted into HTML. */
export const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Consistent single-writer election; do not use for owner-fallback authority. */
export function primaryGM() {
    return game.users?.filter(user => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id))[0];
}
/** Include synthetic actors while visiting linked actors only once. */
export function allActors() {
    const actors = new Map();
    for (const actor of game.actors ?? [])
        actors.set(actor.uuid, actor);
    for (const scene of game.scenes ?? [])
        for (const token of scene.tokens)
            if (token.actor)
                actors.set(token.actor.uuid, token.actor);
    return [...actors.values()];
}
