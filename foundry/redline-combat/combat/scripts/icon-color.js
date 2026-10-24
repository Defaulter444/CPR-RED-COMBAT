import { registerNativeWrapper } from "./native-wrappers.js";
export const DEFAULT_ICON_COLOR = "#ffc36a";
const isBlank = (value) => value == null || typeof value === "string" && value.trim() === "";
/** v12 validates DataField settings before cleaning; normalize only this setting. */
export function installIconColorNormalization(settings) {
    registerNativeWrapper(settings, "set", normalizeIconColor, "WRAPPER");
    registerNativeWrapper(settings, "get", readIconColor, "WRAPPER");
}
/** Apply the fallback to legacy null values without overwriting stored custom colors. */
function readIconColor(wrapped, namespace, key, ...args) {
    const value = wrapped(namespace, key, ...args);
    return namespace === "redline-combat" && key === "iconColor" && isBlank(value) ? DEFAULT_ICON_COLOR : value;
}
function normalizeIconColor(wrapped, namespace, key, value, ...args) {
    if (namespace === "redline-combat" && key === "iconColor"
        && isBlank(value))
        value = DEFAULT_ICON_COLOR;
    return wrapped(namespace, key, value, ...args);
}
