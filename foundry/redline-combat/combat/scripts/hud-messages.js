import { requireCombatSocket } from "./socket-health.js";
const HUD_MODULE = "redline-combat";
const HUD_CHANNEL = "module." + HUD_MODULE;
const notices = new Map();
let notifyHUD = () => { };
let notifyFlash = (_notice, _remove = false) => { };
let expiryTimer;
export const hudMessageKey = (message) => JSON.stringify([message.source, message.id]);
function validPart(value) { return typeof value === "string" && value.length > 0 && value.length <= 100; }
const validContext = (message) => (message.suppressDefaultSound === undefined || typeof message.suppressDefaultSound === "boolean") && (message.actor === undefined || typeof message.actor === "string" && message.actor.length > 0 && message.actor.length <= 200) && (message.chatMessage === undefined || validPart(message.chatMessage));
const context = (message) => ({ ...(message.suppressDefaultSound ? { suppressDefaultSound: true } : {}), ...(message.actor ? { actor: message.actor } : {}), ...(message.chatMessage ? { chatMessage: message.chatMessage } : {}) });
function refreshMessages() {
    if (expiryTimer)
        clearTimeout(expiryTimer);
    let next = Infinity;
    for (const [key, message] of notices) {
        if (message.expires && message.expires <= Date.now())
            notices.delete(key);
        else if (message.expires)
            next = Math.min(next, message.expires);
    }
    if (Number.isFinite(next))
        expiryTimer = setTimeout(refreshMessages, Math.max(1, next - Date.now() + 10));
    notifyHUD();
}
export function listHUDMessages() {
    return [...notices.values()].filter(message => !message.expires || message.expires > Date.now()).map(message => ({ ...message }));
}
export function dismissHUDMessage(source, id) {
    notices.delete(hudMessageKey({ source, id }));
    notifyFlash({ source, id, text: "", expires: 0 }, true);
    refreshMessages();
}
function receiveHUDMessage(wire) {
    if (!wire || wire.kind !== "hud-message" || !Array.isArray(wire.recipients) || !wire.recipients.includes(game.user.id))
        return;
    const message = wire.notice;
    if (!message || !validPart(message.source) || !validPart(message.id))
        return;
    if (wire.action === "remove") {
        dismissHUDMessage(message.source, message.id);
        return;
    }
    if (wire.action !== "send" || typeof message.text !== "string" || !message.text.trim() || message.text.length > 200
        || !Number.isFinite(message.expires) || message.expires < 0 || (message.expires !== 0 && message.expires <= Date.now()))
        return;
    if (message.mode !== undefined && message.mode !== "flash" && message.mode !== "queued")
        return;
    if (!validContext(message))
        return;
    const key = hudMessageKey(message);
    notifyFlash(message, true);
    if (message.mode === "flash") {
        notices.delete(key);
        notifyFlash(message);
        refreshMessages();
        return;
    }
    if (notices.has(key))
        notices.delete(key);
    // Explicit queued alerts are never silently evicted by a later alert.
    const timed = [...notices.entries()].filter(([, notice]) => notice.mode !== "queued");
    if (message.mode !== "queued" && timed.length >= 3)
        notices.delete(timed[0][0]);
    notices.set(key, { source: message.source, id: message.id, text: message.text, expires: message.mode === "queued" ? 0 : message.expires || Date.now() + 60000, ...(message.mode ? { mode: message.mode } : {}), ...context(message) });
    refreshMessages();
}
function recipientsFor(target) {
    if (target === undefined || target === "self")
        return [game.user.id];
    if (!game.user?.isGM)
        throw new Error("Отправлять и убирать сообщения HUD у других может только Мастер.");
    const ids = target === "players" ? game.users.filter(user => user.active && !user.isGM).map(user => user.id) : target;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !game.users.get(id)?.active))
        throw new Error("Выберите подключённых получателей.");
    return [...new Set(ids)];
}
function dispatchHUDMessage(wire) {
    if (wire.recipients.some(id => id !== game.user.id))
        requireCombatSocket();
    receiveHUDMessage(wire);
    if (wire.recipients.some(id => id !== game.user.id))
        game.socket.emit(HUD_CHANNEL, wire);
}
export function postHUDMessage(options) {
    if (!options || !validPart(options.source) || (options.id !== undefined && !validPart(options.id)))
        throw new Error("Укажите источник и необязательный ID длиной 1–100 символов.");
    if (typeof options.text !== "string" || !options.text.trim() || options.text.trim().length > 200)
        throw new Error("Текст HUD — от 1 до 200 символов.");
    if (options.mode !== undefined && options.mode !== "flash" && options.mode !== "queued")
        throw new Error("Режим HUD: flash или queued.");
    if (!validContext(options))
        throw new Error("Некорректная ссылка на актёра или сообщение чата.");
    const duration = options.duration === 0 ? 60 : options.duration ?? 60;
    if (!Number.isFinite(duration) || duration < 0 || duration > 86400)
        throw new Error("Длительность HUD — от 0 до 86400 секунд.");
    const recipients = recipientsFor(options.recipients);
    const id = options.id ?? foundry.utils.randomID();
    dispatchHUDMessage({ kind: "hud-message", action: "send", recipients, notice: { source: options.source, id, text: options.text.trim(), expires: options.mode === "queued" ? 0 : Date.now() + duration * 1000, ...(options.mode ? { mode: options.mode } : {}), ...context(options) } });
    return id;
}
export function removeHUDMessage(source, id, recipients) {
    if (!validPart(source) || !validPart(id))
        throw new Error("Укажите источник и ID сообщения.");
    dispatchHUDMessage({ kind: "hud-message", action: "remove", recipients: recipientsFor(recipients), notice: { source, id, text: "", expires: 0 } });
}
export function registerHUDMessages(onChange, onFlash = () => { }) {
    notifyFlash = onFlash;
    notifyHUD = onChange;
    const module = game.modules.get(HUD_MODULE);
    module.api = { ...module.api, hud: Object.freeze({ version: 2, send: postHUDMessage, remove: removeHUDMessage, list: listHUDMessages, dismiss: dismissHUDMessage }) };
    Hooks.once("ready", () => { game.socket.on(HUD_CHANNEL, receiveHUDMessage); });
}
