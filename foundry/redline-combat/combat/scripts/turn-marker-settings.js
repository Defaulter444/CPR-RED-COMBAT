import { APPEARANCE_KEYS, indicatorForActor, tokenIndicator, saveTokenIndicator, defaultIndicator, personalIndicator, savePersonalIndicator, INDICATOR_MODULE as MODULE } from "./turn-marker-profile.js";
import { MARKER_STYLES } from "./turn-marker-art.js";
import { previewTurnMarker, endTurnMarkerPreview } from "./turn-marker.js";
import { normalizeIndicator, localDefaultOverride, viewerDefaultIndicator, saveLocalDefaultIndicator } from "./turn-marker-profile.js";
const LOCAL_KEYS = ["turnMarkerDisplay", "turnMarkerEnabled", "turnMarkerForceDefault"];
export const TURN_MARKER_KEYS = [...APPEARANCE_KEYS, ...LOCAL_KEYS];
const isLocal = (key) => LOCAL_KEYS.some(local => local === key);
export async function saveTurnMarkerSetting(id, value, mode = "personal", token) {
    const key = id.slice(MODULE.length + 1);
    if (!id.startsWith(MODULE + ".") || !TURN_MARKER_KEYS.includes(key))
        throw Error("Неизвестная настройка индикатора хода.");
    if (!isLocal(key) && mode === "token" && !game.user?.isGM)
        throw Error("Индикатор токена может менять только Мастер.");
    const config = game.settings.settings.get(id);
    let normalized = value;
    if (config.type === Boolean) {
        if (typeof value !== "boolean")
            return;
    }
    else if (typeof value !== "string")
        return;
    else if (config.type === Number) {
        normalized = Number(value);
        if (!Number.isFinite(normalized) || !value.trim())
            return;
        const range = config.range;
        normalized = Math.min(range.max, Math.max(range.min, normalized));
    }
    else if (key === "turnMarkerColor") {
        normalized = value.trim() || "#ffc36a";
        if (!/^#[0-9a-f]{6}$/i.test(normalized))
            return;
    }
    else if (config.choices && !Object.hasOwn(config.choices, value))
        return;
    if (isLocal(key) || (mode === "default" && game.user?.isGM)) {
        if (game.settings.get(MODULE, key) !== normalized)
            await game.settings.set(MODULE, key, normalized);
    }
    else if (mode === "default") {
        await saveLocalDefaultIndicator({ ...viewerDefaultIndicator(), [key]: normalized });
    }
    else if (mode === "token") {
        const profile = tokenIndicator(token) ?? indicatorForActor(token?.actor ?? undefined);
        await saveTokenIndicator(token, { ...profile, [key]: normalized });
    }
    else {
        const saved = personalIndicator(game.user), profile = saved ?? viewerDefaultIndicator();
        if (!saved || profile[key] !== normalized)
            await savePersonalIndicator({ ...profile, [key]: normalized });
    }
}
export class TurnMarkerSettings extends FormApplication {
    mode = game.user?.isGM ? "default" : "personal";
    writes = Promise.resolve();
    token;
    previewToken;
    selectionHook;
    constructor(token) { super({}); this.previewToken = token; this.token = game.user?.isGM ? (token ?? (canvas.tokens?.controlled?.length === 1 ? canvas.tokens.controlled[0]?.document : undefined)) : undefined; if (this.token)
        this.mode = "token"; }
    async showToken(token) { await this.writes; this.previewToken = token; this.token = game.user?.isGM ? token : undefined; this.mode = this.token ? "token" : game.user?.isGM ? "default" : "personal"; this.render(true, { focus: true }); }
    updatePreview(root) {
        const allowed = (token) => token && !token.destroyed && token.visible && (game.user?.isGM || (token.isOwner && !token.document.hidden && !token.document.isSecret));
        const explicit = this.mode === "token" ? this.token : this.previewToken;
        const candidate = explicit?.id ? canvas.tokens?.get(explicit.id) : undefined;
        const token = allowed(candidate) && candidate?.document === explicit ? candidate : canvas.tokens?.controlled?.find(allowed) ?? canvas.tokens?.placeables?.find(token => allowed(token) && token.actor?.id === game.user?.character?.id);
        const raw = {};
        for (const key of APPEARANCE_KEYS) {
            const value = root.querySelector(`[name="${MODULE}.${key}"]`)?.value;
            raw[key] = key === "turnMarkerStyle" || key === "turnMarkerColor" ? value : Number(value);
        }
        previewTurnMarker(this, token?.document, normalizeIndicator(raw));
    }
    async close(options) { if (this.selectionHook !== undefined)
        Hooks.off("controlToken", this.selectionHook); this.selectionHook = undefined; endTurnMarkerPreview(this); return super.close(options); }
    static get defaultOptions() { return foundry.utils.mergeObject(super.defaultOptions, { title: "Индикатор хода", id: "pneuma-turn-marker-settings", width: 480, height: "auto", closeOnSubmit: false, submitOnChange: false, submitOnClose: false, template: "modules/redline-combat/combat/templates/turn-marker-settings.hbs" }); }
    async getData() {
        const personal = personalIndicator(game.user), override = tokenIndicator(this.token), profile = this.mode === "token" ? (override ?? indicatorForActor(this.token?.actor ?? undefined)) : this.mode === "personal" ? (personal ?? viewerDefaultIndicator()) : (game.user?.isGM ? defaultIndicator() : viewerDefaultIndicator());
        return { isGM: !!game.user?.isGM, useGMDefault: !localDefaultOverride(), hasToken: !!game.user?.isGM, isToken: this.mode === "token", tokenName: this.token?.name, useInherited: !override, profile, isDefault: this.mode === "default", isPersonal: this.mode === "personal", readOnly: this.mode === "token" && !game.user?.isGM, useDefault: !personal, styles: { off: "Выкл.", ...MARKER_STYLES }, ranges: APPEARANCE_KEYS.filter(key => !["turnMarkerStyle", "turnMarkerColor"].includes(key)).map(key => { const config = game.settings.settings.get(`${MODULE}.${key}`); return { key, label: config.name, value: profile[key], displayValue: key === "turnMarkerOpacity" ? Math.round(Number(profile[key]) * 100) + "%" : profile[key], range: config.range }; }) };
    }
    activateListeners(html) {
        super.activateListeners(html);
        const root = html[0];
        if (!root)
            return;
        if (this.selectionHook === undefined)
            this.selectionHook = Hooks.on("controlToken", (token, controlled) => {
                if (!controlled)
                    return;
                this.writes = this.writes.then(async () => {
                    if (this.selectionHook === undefined)
                        return;
                    this.previewToken = token.document;
                    if (game.user?.isGM)
                        this.token = token.document;
                    this.render(false);
                });
            });
        this.updatePreview(root);
        const queue = (fn) => { this.writes = this.writes.then(fn).catch(error => { ui.notifications.error(String(error)); void this.render(false); }); };
        root.querySelectorAll("[data-indicator-mode]").forEach(button => button.addEventListener("click", () => { queue(async () => { this.mode = button.dataset.indicatorMode; this.render(false); }); }));
        root.querySelector("[data-use-default]")?.addEventListener("change", event => { const checked = event.target.checked; queue(async () => { if (checked)
            await savePersonalIndicator(null);
        else
            await savePersonalIndicator(viewerDefaultIndicator()); this.render(false); }); });
        root.querySelector("[data-use-gm-default]")?.addEventListener("change", event => { const checked = event.target.checked; queue(async () => { await saveLocalDefaultIndicator(checked ? null : defaultIndicator()); this.render(false); }); });
        const targetToken = this.token;
        root.querySelector("[data-use-inherited]")?.addEventListener("change", event => { const checked = event.target.checked; queue(async () => { await saveTokenIndicator(targetToken, checked ? null : indicatorForActor(targetToken?.actor ?? undefined)); this.render(false); }); });
        const pending = new Map();
        let draining = false;
        const apply = (event) => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || input.disabled)
                return;
            const id = input.dataset.edit || input.name;
            if (!id)
                return;
            const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value, mode = this.mode;
            if (input.type === "range") {
                const label = input.parentElement?.querySelector(".range-value");
                if (label)
                    label.textContent = id.endsWith("turnMarkerOpacity") ? Math.round(Number(value) * 100) + "%" : String(value);
            }
            if (id.endsWith("turnMarkerColor") && !input.dataset.edit) {
                const color = String(value).trim() || "#ffc36a";
                if (/^#[0-9a-f]{6}$/i.test(color)) {
                    const picker = root.querySelector(`input[data-edit="${id}"]`);
                    if (picker)
                        picker.value = color;
                }
            }
            if (input.dataset.edit) {
                const text = root.querySelector(`input[name="${input.dataset.edit}"]`);
                if (text)
                    text.value = String(value);
            }
            if (mode === "personal" && !isLocal(id.slice(MODULE.length + 1))) {
                const toggle = root.querySelector("[data-use-default]");
                if (toggle)
                    toggle.checked = false;
            }
            if (mode === "token" && !isLocal(id.slice(MODULE.length + 1))) {
                const toggle = root.querySelector("[data-use-inherited]");
                if (toggle)
                    toggle.checked = false;
            }
            if (mode === "default" && !game.user?.isGM) {
                const toggle = root.querySelector("[data-use-gm-default]");
                if (toggle)
                    toggle.checked = false;
            }
            pending.set(mode + id, { id, value, mode });
            this.updatePreview(root);
            if (!draining) {
                draining = true;
                queue(async () => { try {
                    while (pending.size) {
                        const [key, edit] = pending.entries().next().value;
                        pending.delete(key);
                        await saveTurnMarkerSetting(edit.id, edit.value, edit.mode, targetToken);
                    }
                }
                finally {
                    draining = false;
                    pending.clear();
                } });
            }
        };
        root.addEventListener("input", apply);
        root.addEventListener("change", apply);
        root.querySelector("[data-close]")?.addEventListener("click", () => { void this.close(); });
    }
    async _updateObject(_event, _data) { }
}
let editor;
export function openTurnMarkerSettings(token) { editor ??= new TurnMarkerSettings(); void editor.showToken(token); }
export function registerTurnMarkerSettings() {
    game.settings.registerMenu(MODULE, "turnMarkerSettings", { name: "Индикатор хода", label: "Настроить", hint: "Индикатор по умолчанию, мой индикатор и правки Мастера для токенов. Изменения сохраняются автоматически.", icon: "fas fa-circle-notch", type: TurnMarkerSettings, restricted: false });
}
