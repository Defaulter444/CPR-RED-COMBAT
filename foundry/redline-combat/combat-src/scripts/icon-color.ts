import {registerNativeWrapper} from "./native-wrappers.js";

export const DEFAULT_ICON_COLOR = "#ffc36a";
const isBlank = (value: unknown) => value == null || typeof value === "string" && value.trim() === "";

/** v12 validates DataField settings before cleaning; normalize only this setting. */
export function installIconColorNormalization(settings: object): void {
  registerNativeWrapper(settings, "set", normalizeIconColor, "WRAPPER");
  registerNativeWrapper(settings, "get", readIconColor, "WRAPPER");
}

/** Apply the fallback to legacy null values without overwriting stored custom colors. */
function readIconColor(this: unknown, wrapped: (...args: any[]) => any,
  namespace: string, key: string, ...args: unknown[]) {
  const value = wrapped(namespace, key, ...args);
  return namespace === "redline-combat" && key === "iconColor" && isBlank(value) ? DEFAULT_ICON_COLOR : value;
}

function normalizeIconColor(this: unknown, wrapped: (...args: any[]) => any,
  namespace: string, key: string, value: unknown, ...args: unknown[]) {
  if (namespace === "redline-combat" && key === "iconColor"
    && isBlank(value)) value = DEFAULT_ICON_COLOR;
  return wrapped(namespace, key, value, ...args);
}
