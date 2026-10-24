const owners = new WeakMap();
const handlers = new WeakMap();
let nextOwner = 0;
export function registerNativeWrapper(owner, method, fn, type) {
    const api = globalThis.libWrapper;
    if (!api?.register)
        throw Error("Боевым инструментам REDLINE нужен модуль libWrapper. Установите и включите его, затем перезагрузите Foundry.");
    if (typeof owner[method] !== "function")
        throw Error(`Штатный метод ${method} недоступен.`);
    const namespace = globalThis.pneumaCombatToolsNative ??= { targets: {} };
    let key = owners.get(owner);
    if (!key) {
        key = "target" + nextOwner++;
        owners.set(owner, key);
        namespace.targets[key] = owner;
    }
    let methods = handlers.get(owner);
    const existing = methods?.get(method);
    if (existing) {
        if (existing.some(handler => handler.fn === fn))
            return;
        // Observers must see calls even when a MIXED handler captures or cancels the native result.
        const index = type === "WRAPPER" ? 0 : existing.findIndex(handler => handler.type === "MIXED");
        existing.splice(index < 0 ? existing.length : index, 0, { fn, type });
        return;
    }
    const chain = [{ fn, type }];
    // libWrapper allows one registration per package/target. Shared feature handlers run inside it.
    // MIXED permits a later injury/EMP guard or damage capture to stop the native call.
    api.register("redline-combat", `pneumaCombatToolsNative.targets.${key}.${method}`, function (wrapped, ...args) {
        const current = chain.slice();
        const invoke = (index, values) => {
            const handler = current[index];
            return handler ? handler.fn.call(this, (...next) => invoke(index + 1, next), ...values) : wrapped(...values);
        };
        return invoke(0, args);
    }, "MIXED");
    // A failed registration must remain retryable.
    if (!methods) {
        methods = new Map();
        handlers.set(owner, methods);
    }
    methods.set(method, chain);
}
