import { MARKER_STYLES } from "./turn-marker-art.js";
export const INDICATOR_MODULE = "redline-combat", INDICATOR_FLAG = "turnIndicator";
export const APPEARANCE_KEYS = ["turnMarkerStyle", "turnMarkerColor", "turnMarkerThickness", "turnMarkerDistance", "turnMarkerOpacity", "turnMarkerSpeed"];
const defaults = { turnMarkerStyle: "segmented", turnMarkerColor: "#ffc36a", turnMarkerThickness: 2, turnMarkerDistance: 8, turnMarkerOpacity: .85, turnMarkerSpeed: 1 };
const clamp = (v, min, max, fallback) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function normalizeIndicator(raw, fallback = defaults) {
    const p = (raw && typeof raw === "object" ? raw : {});
    return { turnMarkerStyle: p.turnMarkerStyle === "circuit" ? "netrunner" : p.turnMarkerStyle === "off" || Object.hasOwn(MARKER_STYLES, p.turnMarkerStyle ?? "") ? p.turnMarkerStyle : fallback.turnMarkerStyle,
        turnMarkerColor: typeof p.turnMarkerColor === "string" && /^#[0-9a-f]{6}$/i.test(p.turnMarkerColor) ? p.turnMarkerColor : fallback.turnMarkerColor,
        turnMarkerThickness: clamp(p.turnMarkerThickness, 1, 10, fallback.turnMarkerThickness), turnMarkerDistance: clamp(p.turnMarkerDistance, 0, 50, fallback.turnMarkerDistance), turnMarkerOpacity: clamp(p.turnMarkerOpacity, .5, 1, fallback.turnMarkerOpacity), turnMarkerSpeed: clamp(p.turnMarkerSpeed, 0, 2, fallback.turnMarkerSpeed) };
}
export function defaultIndicator() { return normalizeIndicator(Object.fromEntries(APPEARANCE_KEYS.map(key => [key, game.settings.get(INDICATOR_MODULE, key)]))); }
export function localDefaultOverride(user = game.user) {
    const saved = user?.getFlag?.(INDICATOR_MODULE, "turnIndicatorDefault");
    return saved && typeof saved === "object" ? normalizeIndicator(saved, defaultIndicator()) : undefined;
}
export function viewerDefaultIndicator() { return localDefaultOverride() ?? defaultIndicator(); }
export async function saveLocalDefaultIndicator(profile) {
    const user = game.user;
    if (profile)
        await user.setFlag(INDICATOR_MODULE, "turnIndicatorDefault", normalizeIndicator(profile));
    else
        await user.unsetFlag(INDICATOR_MODULE, "turnIndicatorDefault");
}
export function viewedTokenIndicator(token) {
    const owner = indicatorOwner(token?.actor ?? undefined);
    return tokenIndicator(token) ?? personalIndicator(owner) ?? localDefaultOverride(owner ?? null) ?? viewerDefaultIndicator();
}
export function personalIndicator(user) {
    const saved = user?.getFlag(INDICATOR_MODULE, INDICATOR_FLAG);
    return saved && typeof saved === "object" ? normalizeIndicator(saved, defaultIndicator()) : undefined;
}
/** Assigned character wins; offline status and the viewing client never change ownership selection. */
export function indicatorOwner(actor) {
    if (!actor || String(actor.type) !== "character")
        return;
    const all = Array.from(game.users ?? []).sort((a, b) => a.id.localeCompare(b.id)), users = all.filter(user => !user.isGM);
    return users.find(user => user.character?.id === actor.id) ?? all.find(user => user.character?.id === actor.id) ?? users.find(user => actor.testUserPermission(user, "OWNER"));
}
export function indicatorForActor(actor) { const owner = indicatorOwner(actor); return personalIndicator(owner) ?? localDefaultOverride(owner ?? null) ?? defaultIndicator(); }
export async function savePersonalIndicator(profile) {
    const user = game.user;
    if (profile)
        await user.setFlag(INDICATOR_MODULE, INDICATOR_FLAG, profile);
    else
        await user.unsetFlag(INDICATOR_MODULE, INDICATOR_FLAG);
}
export function tokenIndicator(token) {
    const saved = token?.getFlag?.(INDICATOR_MODULE, INDICATOR_FLAG);
    return saved && typeof saved === "object" ? normalizeIndicator(saved, indicatorForActor(token?.actor ?? undefined)) : undefined;
}
export function indicatorForToken(token) { return tokenIndicator(token) ?? indicatorForActor(token?.actor ?? undefined); }
export async function saveTokenIndicator(token, profile) {
    if (!game.user?.isGM)
        throw Error("Индикатор токена может менять только Мастер.");
    if (!token?.id || token.parent?.tokens.get(token.id) !== token)
        throw Error("Этого токена больше нет на сцене.");
    const doc = token;
    if (profile)
        await doc.setFlag(INDICATOR_MODULE, INDICATOR_FLAG, normalizeIndicator(profile));
    else
        await doc.unsetFlag(INDICATOR_MODULE, INDICATOR_FLAG);
}
